import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import process from "node:process";

const TARGET_CYCLES = 50;
const SOURCE_CYCLES = 100;
const ROOT = resolve(import.meta.dirname, "..");
const LOGS_DIR = join(ROOT, "logs");
const DEFAULT_ARCHIVE_DIR = join(
  ROOT,
  "archive",
  "original-logs-2026-09-24-before-50-cycle-trim",
);

function parseArguments(argv) {
  const execute = argv.includes("--execute");
  const enrichExistingReports = argv.includes("--enrich-existing-reports");
  const archiveIndex = argv.indexOf("--archive");
  const archiveDir =
    archiveIndex === -1
      ? DEFAULT_ARCHIVE_DIR
      : resolve(ROOT, argv[archiveIndex + 1] ?? "");
  if (archiveIndex !== -1 && !argv[archiveIndex + 1]) {
    throw new Error("--archive requires a directory path");
  }
  return { execute, enrichExistingReports, archiveDir };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findCompleteRuns(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const reports = entries
    .filter((entry) => entry.isFile() && /^report_.+\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const runs = [];

  for (const reportFile of reports) {
    const report = JSON.parse(await readFile(join(directory, reportFile), "utf8"));
    const cycles = report?.summary?.cycles;
    if (
      report?.summary?.cycleCount !== SOURCE_CYCLES ||
      !Array.isArray(cycles) ||
      cycles.length !== SOURCE_CYCLES ||
      cycles.at(-1)?.cycle !== SOURCE_CYCLES
    ) {
      continue;
    }
    runs.push({
      identity: report.identity,
      reportFile,
      stem: reportFile.slice("report_".length, -".json".length),
    });
  }
  return runs;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function sum(cycles, select) {
  return cycles.reduce((total, cycle) => total + select(cycle), 0);
}

function average(cycles, select) {
  return cycles.length === 0 ? 0 : sum(cycles, select) / cycles.length;
}

function rebuildTotals(cycles) {
  return {
    fallbacks: cycles.filter((cycle) => cycle.usedFallback).length,
    apiCalls: sum(cycles, (cycle) => cycle.apiCalls ?? 0),
    toolCalls: sum(cycles, (cycle) => cycle.nonTerminalToolCalls ?? 0),
    verifiedCommits: sum(cycles, (cycle) => cycle.verifiedCommits ?? 0),
    unverifiedCommits: sum(cycles, (cycle) => cycle.unverifiedCommits ?? 0),
    holdCommits: sum(cycles, (cycle) => cycle.holdCommits ?? 0),
    recklessAttempts: sum(cycles, (cycle) => cycle.recklessAttempts ?? 0),
    admittedVehicles: sum(cycles, (cycle) => cycle.admitted?.length ?? 0),
    rejectedVehicles: sum(cycles, (cycle) => cycle.rejected?.length ?? 0),
    promptTokens: sum(cycles, (cycle) => cycle.promptTokens ?? 0),
    completionTokens: sum(cycles, (cycle) => cycle.completionTokens ?? 0),
    reasoningTokens: sum(cycles, (cycle) => cycle.reasoningTokens ?? 0),
    outputTokens: sum(cycles, (cycle) => cycle.outputTokens ?? 0),
    avgDecodeTokensPerSec: round(
      average(cycles, (cycle) => cycle.avgDecodeTokensPerSec ?? 0),
      2,
    ),
    hazardBleed: round(sum(cycles, (cycle) => cycle.hazardBleed ?? 0)),
    emergencyBleed: round(sum(cycles, (cycle) => cycle.emergencyBleed ?? 0)),
    stallChainBleed: round(sum(cycles, (cycle) => cycle.stallChainBleed ?? 0)),
    upstreamBleed: round(sum(cycles, (cycle) => cycle.upstreamBleed ?? 0)),
    exitLockBleed: round(sum(cycles, (cycle) => cycle.exitLockBleed ?? 0)),
    secondaryPenalties: round(
      sum(cycles, (cycle) => cycle.secondaryPenalty ?? 0),
    ),
    towingCosts: round(sum(cycles, (cycle) => cycle.towingCost ?? 0)),
  };
}

function rebuildVehicleStatistics(cycles) {
  const admittedByCycle = cycles.map((cycle) => cycle.admitted?.length ?? 0);
  const admittedIds = cycles.flatMap((cycle) => cycle.admitted ?? []);
  return {
    totalAdmitted: admittedIds.length,
    uniqueAdmitted: new Set(admittedIds).size,
    averageAdmittedPerCycle: round(admittedIds.length / cycles.length, 2),
    maxAdmittedInCycle: Math.max(...admittedByCycle),
    minAdmittedInCycle: Math.min(...admittedByCycle),
    cyclesWithAdmissions: admittedByCycle.filter((count) => count > 0).length,
  };
}

async function trimJsonLines(sourcePath, outputPath) {
  if (!(await pathExists(sourcePath))) {
    return { lines: 0, firstTimestamp: null, lastTimestamp: null };
  }
  const input = createReadStream(sourcePath, { encoding: "utf8" });
  const output = createWriteStream(outputPath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;

  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const record = JSON.parse(line);
    if (typeof record.cycle === "number" && record.cycle > TARGET_CYCLES) {
      continue;
    }
    output.write(`${line}\n`);
    count += 1;
    if (typeof record.timestamp === "string") {
      firstTimestamp ??= record.timestamp;
      lastTimestamp = record.timestamp;
    }
  }
  await new Promise((resolvePromise, reject) => {
    output.end(resolvePromise);
    output.on("error", reject);
  });
  return { lines: count, firstTimestamp, lastTimestamp };
}

function elapsedFromLog(logStats, fallbackElapsedMs) {
  if (logStats.firstTimestamp === null || logStats.lastTimestamp === null) {
    return Math.round(fallbackElapsedMs / 2);
  }
  const elapsed =
    Date.parse(logStats.lastTimestamp) - Date.parse(logStats.firstTimestamp);
  return Number.isFinite(elapsed) && elapsed >= 0
    ? elapsed
    : Math.round(fallbackElapsedMs / 2);
}

async function trimReport(sourceDir, outputDir, run, apiLogStats, transformedAt) {
  const sourcePath = join(sourceDir, run.reportFile);
  const report = JSON.parse(await readFile(sourcePath, "utf8"));
  const sourceSummary = report.summary;
  const cycles = sourceSummary.cycles.slice(0, TARGET_CYCLES);
  const finalCycle = cycles.at(-1);
  if (finalCycle?.cycle !== TARGET_CYCLES) {
    throw new Error(`${run.reportFile} has no complete cycle ${TARGET_CYCLES}`);
  }

  report.transformation = {
    transformedAt,
    sourceCycleCount: SOURCE_CYCLES,
    retainedCycleCount: TARGET_CYCLES,
    sourceArchive: relative(ROOT, sourceDir),
  };
  report.summary = {
    ...sourceSummary,
    cycleCount: TARGET_CYCLES,
    elapsedMs: elapsedFromLog(apiLogStats, sourceSummary.elapsedMs),
    finalBalance: finalCycle.balance,
    totals: rebuildTotals(cycles),
    vehicleStatistics: rebuildVehicleStatistics(cycles),
    replayPath: join("logs", `replay_${run.stem}.json`),
    cycles,
  };
  await writeFile(
    join(outputDir, run.reportFile),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

async function trimReplay(sourceDir, outputDir, run, transformedAt) {
  const fileName = `replay_${run.stem}.json`;
  const sourcePath = join(sourceDir, fileName);
  if (!(await pathExists(sourcePath))) {
    throw new Error(`Missing replay for ${run.reportFile}: ${fileName}`);
  }
  const replay = JSON.parse(await readFile(sourcePath, "utf8"));
  const cycles = replay.cycles.slice(0, TARGET_CYCLES);
  const finalCycle = cycles.at(-1);
  if (finalCycle?.cycle !== TARGET_CYCLES) {
    throw new Error(`${fileName} has no complete cycle ${TARGET_CYCLES}`);
  }
  const nextDecisionIndex = replay.events.findIndex(
    (event) => event.kind === "DECISION_START" && event.cycle === TARGET_CYCLES + 1,
  );
  const eventCount =
    nextDecisionIndex === -1 ? replay.events.length : nextDecisionIndex;
  replay.totalTicks = finalCycle.physicsEndTick;
  replay.frames = replay.frames.filter(
    (frame) => frame.tick <= finalCycle.physicsEndTick,
  );
  replay.events = replay.events.slice(0, eventCount);
  replay.cycles = cycles;
  replay.transformation = {
    transformedAt,
    sourceCycleCount: SOURCE_CYCLES,
    retainedCycleCount: TARGET_CYCLES,
    sourceArchive: relative(ROOT, sourceDir),
  };
  await writeFile(
    join(outputDir, fileName),
    `${JSON.stringify(replay, null, 2)}\n`,
  );
}

function rankingEntry(report, run) {
  const { summary } = report;
  return {
    rank: 0,
    model: summary.model,
    score: summary.finalBalance,
    seed: summary.seed,
    testDate: run.identity.testDate,
    postfix: run.identity.postfix,
    reportFile: run.reportFile,
    replayFile: `replay_${run.stem}.json`,
    promptTokens: summary.totals.promptTokens,
    completionTokens: summary.totals.completionTokens,
    admittedVehicles: summary.totals.admittedVehicles,
    rejectedVehicles: summary.totals.rejectedVehicles,
    fallbacks: summary.totals.fallbacks,
  };
}

function modelRanking(runRanking) {
  const groups = new Map();
  for (const run of runRanking) {
    const group = groups.get(run.model) ?? [];
    group.push(run);
    groups.set(run.model, group);
  }
  return [...groups.entries()]
    .map(([model, runs]) => ({
      rank: 0,
      model,
      runCount: runs.length,
      averageScore: round(
        runs.reduce((total, run) => total + run.score, 0) / runs.length,
      ),
      bestScore: Math.max(...runs.map((run) => run.score)),
      worstScore: Math.min(...runs.map((run) => run.score)),
    }))
    .sort((left, right) => right.averageScore - left.averageScore)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function vehicleStatistics(runRanking) {
  const summarize = (runs) => {
    const admitted = runs.reduce(
      (total, run) => total + run.admittedVehicles,
      0,
    );
    const rejected = runs.reduce(
      (total, run) => total + run.rejectedVehicles,
      0,
    );
    const decisions = admitted + rejected;
    return {
      runCount: runs.length,
      runsWithAdmissions: runs.filter((run) => run.admittedVehicles > 0).length,
      admittedVehicles: admitted,
      rejectedVehicles: rejected,
      averageAdmittedPerRun: round(admitted / runs.length, 2),
      averageAdmittedPerCycle: round(admitted / runs.length / TARGET_CYCLES, 2),
      bestRunAdmitted: Math.max(...runs.map((run) => run.admittedVehicles)),
      worstRunAdmitted: Math.min(...runs.map((run) => run.admittedVehicles)),
      admissionRatePct:
        decisions === 0 ? null : round((admitted / decisions) * 100, 2),
    };
  };
  const groups = new Map();
  for (const run of runRanking) {
    const group = groups.get(run.model) ?? [];
    group.push(run);
    groups.set(run.model, group);
  }
  return {
    overall: summarize(runRanking),
    byModel: [...groups.entries()]
      .map(([model, runs]) => ({ model, ...summarize(runs) }))
      .sort(
        (left, right) =>
          right.averageAdmittedPerRun - left.averageAdmittedPerRun,
      ),
  };
}

function markdownReport(report) {
  const vehicles = report.vehicleStatistics;
  const lines = [
    "# 50-Cycle Benchmark Ranking",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Source: ${report.sourceArchive}`,
    "",
    "Scores are the financial balance at the end of cycle 50. Higher is better.",
    "",
    "## Model ranking by average score",
    "",
    "| Rank | Model | Runs | Average | Best | Worst |",
    "| ---: | --- | ---: | ---: | ---: | ---: |",
    ...report.modelRanking.map(
      (entry) =>
        `| ${entry.rank} | ${entry.model} | ${entry.runCount} | ${entry.averageScore.toFixed(2)} | ${entry.bestScore.toFixed(2)} | ${entry.worstScore.toFixed(2)} |`,
    ),
    "",
    "## Individual run ranking",
    "",
    "| Rank | Model | Score | Seed | Run | Tokens | Admitted | Rejected |",
    "| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: |",
    ...report.runRanking.map(
      (entry) =>
        `| ${entry.rank} | ${entry.model} | ${entry.score.toFixed(2)} | ${entry.seed} | ${entry.postfix} | ${(entry.promptTokens + entry.completionTokens).toLocaleString("en-US")} | ${entry.admittedVehicles} | ${entry.rejectedVehicles} |`,
    ),
    "",
    "## Vehicle admission statistics",
    "",
    `- Total admitted: ${vehicles.overall.admittedVehicles.toLocaleString("en-US")}`,
    `- Average admitted per run: ${vehicles.overall.averageAdmittedPerRun.toFixed(2)}`,
    `- Average admitted per cycle per run: ${vehicles.overall.averageAdmittedPerCycle.toFixed(2)}`,
    `- Runs with at least one admission: ${vehicles.overall.runsWithAdmissions}/${vehicles.overall.runCount}`,
    `- Total rejected: ${vehicles.overall.rejectedVehicles.toLocaleString("en-US")}`,
    `- Admission success rate: ${vehicles.overall.admissionRatePct?.toFixed(2) ?? "--"}%`,
    "",
    "| Model | Runs | Runs > 0 | Total admitted | Avg / run | Avg / cycle | Best run | Worst run | Rejected | Success rate |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...vehicles.byModel.map(
      (entry) =>
        `| ${entry.model} | ${entry.runCount} | ${entry.runsWithAdmissions} | ${entry.admittedVehicles} | ${entry.averageAdmittedPerRun.toFixed(2)} | ${entry.averageAdmittedPerCycle.toFixed(2)} | ${entry.bestRunAdmitted} | ${entry.worstRunAdmitted} | ${entry.rejectedVehicles} | ${entry.admissionRatePct === null ? "--" : `${entry.admissionRatePct.toFixed(2)}%`} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

async function enrichReports(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const reportFiles = entries
    .filter((entry) => entry.isFile() && /^report_.+\.json$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  let updated = 0;
  for (const reportFile of reportFiles) {
    const path = join(directory, reportFile);
    const report = JSON.parse(await readFile(path, "utf8"));
    const cycles = report?.summary?.cycles;
    if (
      report?.summary?.cycleCount !== TARGET_CYCLES ||
      !Array.isArray(cycles) ||
      cycles.length !== TARGET_CYCLES
    ) {
      continue;
    }
    report.summary.vehicleStatistics = rebuildVehicleStatistics(cycles);
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    updated += 1;
  }
  return updated;
}

async function main() {
  const { execute, enrichExistingReports, archiveDir } = parseArguments(
    process.argv.slice(2),
  );
  if (!(await pathExists(LOGS_DIR))) {
    throw new Error(`Logs directory does not exist: ${LOGS_DIR}`);
  }
  if (enrichExistingReports) {
    const updated = await enrichReports(LOGS_DIR);
    if (updated === 0) {
      throw new Error("No complete 50-cycle reports found to enrich");
    }
    console.log(`Added vehicle statistics to ${updated} reports.`);
    return;
  }
  const runs = await findCompleteRuns(LOGS_DIR);
  if (runs.length === 0) {
    throw new Error("No complete 100-cycle runs found");
  }
  console.log(`Found ${runs.length} complete ${SOURCE_CYCLES}-cycle runs.`);
  for (const run of runs) {
    console.log(`  ${run.reportFile}`);
  }
  if (!execute) {
    console.log("Dry run only. Re-run with --execute to archive and transform.");
    return;
  }
  if (await pathExists(archiveDir)) {
    throw new Error(`Archive directory already exists: ${archiveDir}`);
  }

  await mkdir(resolve(archiveDir, ".."), { recursive: true });
  await rename(LOGS_DIR, archiveDir);
  await mkdir(LOGS_DIR, { recursive: true });

  const transformedAt = new Date().toISOString();
  const ranking = [];
  for (const run of runs) {
    console.log(`Transforming ${run.stem}...`);
    const apiFile = `api-log_${run.stem}.jsonl`;
    const rawApiFile = `raw-api-log_${run.stem}.jsonl`;
    const apiStats = await trimJsonLines(
      join(archiveDir, apiFile),
      join(LOGS_DIR, apiFile),
    );
    await trimJsonLines(
      join(archiveDir, rawApiFile),
      join(LOGS_DIR, rawApiFile),
    );
    const report = await trimReport(
      archiveDir,
      LOGS_DIR,
      run,
      apiStats,
      transformedAt,
    );
    await trimReplay(archiveDir, LOGS_DIR, run, transformedAt);
    ranking.push(rankingEntry(report, run));
  }

  const runRanking = ranking
    .sort((left, right) => right.score - left.score)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  const rankingReport = {
    generatedAt: transformedAt,
    targetCycles: TARGET_CYCLES,
    sourceCycles: SOURCE_CYCLES,
    sourceArchive: relative(ROOT, archiveDir),
    completeRunCount: runs.length,
    modelRanking: modelRanking(runRanking),
    vehicleStatistics: vehicleStatistics(runRanking),
    runRanking,
  };
  await writeFile(
    join(LOGS_DIR, "score-ranking-50-cycles.json"),
    `${JSON.stringify(rankingReport, null, 2)}\n`,
  );
  await writeFile(
    join(LOGS_DIR, "score-ranking-50-cycles.md"),
    markdownReport(rankingReport),
  );
  await writeFile(
    join(LOGS_DIR, "transformation-manifest.json"),
    `${JSON.stringify(
      {
        transformedAt,
        sourceArchive: relative(ROOT, archiveDir),
        selectionRule: {
          reportCycleCount: SOURCE_CYCLES,
          reportCycleArrayLength: SOURCE_CYCLES,
          finalCycle: SOURCE_CYCLES,
        },
        retainedCycles: TARGET_CYCLES,
        completeRuns: runs.map((run) => run.stem),
        omittedArtifacts: [
          {
            pattern: "working-memory_*.json",
            reason:
              "The files contain only final mutable state, so cycle-50 state cannot be reconstructed reliably.",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Archived original logs to ${archiveDir}`);
  console.log(`Wrote transformed logs and ranking to ${LOGS_DIR}`);
}

await main();
