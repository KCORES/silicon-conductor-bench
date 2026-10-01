// Pick the valid run of one model to evaluate: among complete runs that share the
// same rules version, seed and horizon, the one with the highest final balance.
//
//   node report/select-best-run.mjs --model <name|file-slug> [--logs logs] [--rules N] [--expected 3]
//
// Prints a summary and writes report/out/<slug>_rules-<N>_runs.json.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const options = { logs: "logs", out: "report/out", expected: 3, rules: undefined, model: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--model") options.model = next();
    else if (arg === "--logs") options.logs = next();
    else if (arg === "--out") options.out = next();
    else if (arg === "--rules") options.rules = Number(next());
    else if (arg === "--expected") options.expected = Number(next());
  }
  if (options.model === undefined) {
    throw new Error("Usage: node report/select-best-run.mjs --model <name|file-slug> [--rules N] [--expected 3]");
  }
  return options;
}

const slugOf = (model) => model.replace(/[^A-Za-z0-9._-]+/g, "-");

function loadRuns(directory, model) {
  const wanted = new Set([model, slugOf(model)]);
  const runs = [];
  for (const name of readdirSync(directory)) {
    const match = /^report_(.+)_(\d{4}-\d{2}-\d{2}_\d{9}-\d+)\.json$/.exec(name);
    if (match === null) continue;
    let report;
    try {
      report = JSON.parse(readFileSync(join(directory, name), "utf8"));
    } catch {
      continue;
    }
    const summary = report.summary ?? report;
    if (!wanted.has(summary.model) && !wanted.has(match[1])) continue;
    const id = `${match[1]}_${match[2]}`;
    const replay = join(directory, `replay_${id}.json`);
    const problems = [];
    if (!existsSync(replay)) problems.push("missing replay");
    if (!existsSync(join(directory, `api-log_${id}.jsonl`))) problems.push("missing api-log");
    if (summary.terminal === undefined) problems.push("no terminal settlement (interrupted run)");
    if (typeof summary.finalBalance !== "number") problems.push("no final balance");
    runs.push({
      id,
      replay,
      model: summary.model,
      rulesVersion: report.simulationRulesVersion,
      seed: summary.seed,
      horizonTicks: summary.horizonTicks,
      endTick: summary.endTick,
      finalBalance: summary.finalBalance,
      apiCalls: summary.totals?.apiCalls,
      fallbacks: summary.totals?.fallbacks,
      admittedVehicles: summary.totals?.admittedVehicles,
      incidents: summary.incidents?.length,
      generatedAt: report.generatedAt,
      hasRawLog: existsSync(join(directory, `raw-api-log_${id}.jsonl`)),
      problems,
    });
  }
  return runs.sort((left, right) => String(left.generatedAt).localeCompare(String(right.generatedAt)));
}

function findBaselines(directory, group) {
  const latest = new Map();
  for (const name of readdirSync(directory)) {
    const match = /^report_(baseline-[a-z-]+)_.+\.json$/.exec(name);
    if (match === null) continue;
    let report;
    try {
      report = JSON.parse(readFileSync(join(directory, name), "utf8"));
    } catch {
      continue;
    }
    const summary = report.summary ?? report;
    if (
      report.simulationRulesVersion !== group.rulesVersion ||
      summary.seed !== group.seed ||
      summary.horizonTicks !== group.horizonTicks
    ) {
      continue;
    }
    const previous = latest.get(match[1]);
    if (previous === undefined || report.generatedAt > previous.generatedAt) {
      latest.set(match[1], { name: match[1], file: name, generatedAt: report.generatedAt, finalBalance: summary.finalBalance });
    }
  }
  return [...latest.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function spread(values) {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const round = (value) => Number(value.toFixed(2));
  return { count: values.length, mean: round(mean), min: round(Math.min(...values)), max: round(Math.max(...values)), stdev: round(Math.sqrt(variance)) };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const directory = resolve(options.logs);
  const runs = loadRuns(directory, options.model);
  if (runs.length === 0) {
    throw new Error(`No reports found for model "${options.model}" in ${directory}`);
  }
  const complete = runs.filter((run) => run.problems.length === 0);
  const rulesVersion = options.rules ?? Math.max(...complete.map((run) => run.rulesVersion ?? 0));
  const sameRules = complete.filter((run) => run.rulesVersion === rulesVersion);

  // The most common seed/horizon among same-rules runs defines the comparable group.
  const keyOf = (run) => `${run.seed}:${run.horizonTicks}`;
  const counts = new Map();
  for (const run of sameRules) counts.set(keyOf(run), (counts.get(keyOf(run)) ?? 0) + 1);
  const groupKey = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const group = sameRules.filter((run) => keyOf(run) === groupKey);
  const best = [...group].sort((left, right) => right.finalBalance - left.finalBalance)[0];

  const warnings = [];
  if (best === undefined) warnings.push(`No complete run under rules version ${rulesVersion}.`);
  if (group.length < options.expected) warnings.push(`Only ${group.length} comparable run(s); expected ${options.expected}.`);
  if (group.length > options.expected) warnings.push(`${group.length} comparable runs; expected ${options.expected}. All were considered.`);
  for (const run of sameRules.filter((item) => keyOf(item) !== groupKey)) {
    warnings.push(`${run.id} uses seed/horizon ${keyOf(run)} and was excluded.`);
  }
  for (const run of runs.filter((item) => item.problems.length > 0)) {
    warnings.push(`${run.id} is incomplete: ${run.problems.join(", ")}.`);
  }
  if (best !== undefined && !best.hasRawLog) warnings.push("Best run has no raw-api-log; reasoning metrics will be empty.");

  const baselines = best === undefined ? [] : findBaselines(directory, best);
  for (const name of ["baseline-balanced", "baseline-search"]) {
    if (best !== undefined && !baselines.some((item) => item.name === name)) {
      warnings.push(`Missing ${name} for rules ${rulesVersion}, seed ${best.seed}, horizon ${best.horizonTicks}.`);
    }
  }

  const result = {
    model: best?.model ?? options.model,
    rulesVersion,
    seed: best?.seed,
    horizonTicks: best?.horizonTicks,
    best: best === undefined ? null : { id: best.id, replay: best.replay, finalBalance: best.finalBalance },
    runs: group
      .sort((left, right) => right.finalBalance - left.finalBalance)
      .map((run, rank) => ({ rank: rank + 1, ...run })),
    balanceSpread: spread(group.map((run) => run.finalBalance)),
    baselines,
    otherRulesVersions: [...new Set(complete.filter((run) => run.rulesVersion !== rulesVersion).map((run) => run.rulesVersion))],
    warnings,
  };

  const outDirectory = resolve(options.out);
  mkdirSync(outDirectory, { recursive: true });
  const outFile = join(outDirectory, `${slugOf(result.model)}_rules-${rulesVersion}_runs.json`);
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`model=${result.model} rules=${rulesVersion} seed=${result.seed} horizon=${result.horizonTicks}`);
  for (const run of result.runs) {
    console.log(
      `${run.rank === 1 ? "*" : " "} #${run.rank} ${run.id} balance=${run.finalBalance.toFixed(2)} api=${run.apiCalls} admitted=${run.admittedVehicles} incidents=${run.incidents} fallbacks=${run.fallbacks}`,
    );
  }
  if (result.balanceSpread) console.log(`spread ${JSON.stringify(result.balanceSpread)}`);
  for (const baseline of baselines) console.log(`baseline ${baseline.name} balance=${baseline.finalBalance.toFixed(2)} (${baseline.file})`);
  for (const warning of warnings) console.log(`WARN ${warning}`);
  if (best !== undefined) console.log(`BEST_REPLAY=${best.replay}`);
  console.log(`[select] -> ${outFile}`);
  if (best === undefined) process.exitCode = 1;
}

main();
