import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(root, "dist", "src", "cli.js");
const DEFAULT_RUNS = 3;
const DEFAULT_PARALLEL = 1;
const STDERR_TAIL_LIMIT = 30;

export const BENCH_REPEAT_USAGE = `Usage: node scripts/bench-repeat.mjs [--runs <integer>] [--parallel <integer>] [--env <file>]... [--dry-run] [--list-failed] [--resume <api-log>] [--] [cli args...]

Launch benchmark processes from a shared queue. Compile once with npm run bench:runs
before the first launch; this script does not compile.

  --runs <integer>       complete benchmark runs per env file (default: ${DEFAULT_RUNS})
  --parallel <integer>   maximum node processes at once (default: ${DEFAULT_PARALLEL})
  --env <file>           env file for one model; repeat for more files
  --dry-run              print the planned commands and do not start the benchmark
  --list-failed          print failed tasks that do not yet have a report
  --resume <api-log>     continue one interrupted run from its last checkpoint
  --help                 show this help

The queue is round-robin across env files: run 1 of every model, then run 2, and so on.
A free slot starts the next queued task immediately. A non-zero exit only stops that
task. The scheduler records it and starts the next queued task in the free slot.

Without --env, every run inherits the current process environment and the benchmark
loads .env. With one or more --env options, each file is a separate model: the
benchmark loads that file instead of .env, and values in the file replace variables
already present in the process. Parallel runs above 1 force --plain because the
processes share one terminal.

Every other argument is forwarded to dist/src/cli.js on each run.
A lone -- also starts the forwarded arguments. Put launcher options before that --.

Examples:
  npm run bench:runs
  npm run bench:runs -- --parallel 6 --plain
  npm run bench:formal
`;

export class BenchRepeatArgsError extends Error {
  constructor(message) {
    super(message);
    this.name = "BenchRepeatArgsError";
  }
}

export function parseBenchRepeatArgs(args) {
  let runs = DEFAULT_RUNS;
  let parallel = DEFAULT_PARALLEL;
  let dryRun = false;
  let listFailed = false;
  let resume = "";
  let runsProvided = false;
  let parallelProvided = false;
  const envFiles = [];
  const forwarded = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      forwarded.push(...args.slice(index + 1));
      break;
    }
    if (arg === "--help" || arg === "-h") {
      return {
        help: true,
        runs,
        parallel,
        dryRun,
        listFailed,
        resume,
        runsProvided,
        envFiles,
        forwarded,
      };
    }
    if (arg === "--dry-run") {
      if (dryRun) {
        throw new BenchRepeatArgsError(`--dry-run was provided more than once.\n${BENCH_REPEAT_USAGE}`);
      }
      dryRun = true;
      continue;
    }
    if (arg === "--list-failed") {
      if (listFailed) {
        throw new BenchRepeatArgsError(`--list-failed was provided more than once.\n${BENCH_REPEAT_USAGE}`);
      }
      listFailed = true;
      continue;
    }
    if (arg === "--resume" || arg.startsWith("--resume=")) {
      if (resume.length > 0) {
        throw new BenchRepeatArgsError(`--resume was provided more than once.\n${BENCH_REPEAT_USAGE}`);
      }
      const raw = arg === "--resume" ? args[index + 1] : arg.slice("--resume=".length);
      if (arg === "--resume") {
        index += 1;
      }
      if (raw === undefined || raw.trim().length === 0 || raw.startsWith("--")) {
        throw new BenchRepeatArgsError(`--resume requires an API log path.\n${BENCH_REPEAT_USAGE}`);
      }
      resume = raw;
      continue;
    }
    if (arg === "--runs" || arg.startsWith("--runs=")) {
      if (runsProvided) {
        throw new BenchRepeatArgsError(`--runs was provided more than once.\n${BENCH_REPEAT_USAGE}`);
      }
      const raw = arg === "--runs" ? args[index + 1] : arg.slice("--runs=".length);
      if (arg === "--runs") {
        index += 1;
      }
      runs = requirePositiveInteger(raw, "--runs");
      runsProvided = true;
      continue;
    }
    if (arg === "--parallel" || arg.startsWith("--parallel=")) {
      if (parallelProvided) {
        throw new BenchRepeatArgsError(`--parallel was provided more than once.\n${BENCH_REPEAT_USAGE}`);
      }
      const raw = arg === "--parallel" ? args[index + 1] : arg.slice("--parallel=".length);
      if (arg === "--parallel") {
        index += 1;
      }
      parallel = requirePositiveInteger(raw, "--parallel");
      parallelProvided = true;
      continue;
    }
    if (arg === "--env" || arg.startsWith("--env=")) {
      const raw = arg === "--env" ? args[index + 1] : arg.slice("--env=".length);
      if (arg === "--env") {
        index += 1;
      }
      if (raw === undefined || raw.trim().length === 0 || raw.startsWith("--")) {
        throw new BenchRepeatArgsError(`--env requires a file path.\n${BENCH_REPEAT_USAGE}`);
      }
      envFiles.push(raw);
      continue;
    }
    forwarded.push(arg);
  }

  return {
    help: false,
    runs,
    parallel,
    dryRun,
    listFailed,
    resume,
    runsProvided,
    envFiles,
    forwarded,
  };
}

function requirePositiveInteger(raw, label) {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new BenchRepeatArgsError(`${label} must be a positive integer.\n${BENCH_REPEAT_USAGE}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BenchRepeatArgsError(`${label} must be a positive integer.\n${BENCH_REPEAT_USAGE}`);
  }
  return value;
}

export function benchRepeatCommand(forwarded) {
  return [cliPath, ...forwarded];
}

export function resolveEnvFiles(files) {
  const missing = [];
  const resolved = [];
  for (const file of files) {
    const path = resolve(root, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      missing.push(file);
      continue;
    }
    resolved.push({ label: file, path });
  }
  if (missing.length > 0) {
    throw new BenchRepeatArgsError(
      `Env file not found: ${missing.join(", ")}\n${BENCH_REPEAT_USAGE}`,
    );
  }
  return resolved;
}

export function buildBenchTasks(envFiles, runs, forwarded, parallel) {
  const groups = envFiles.length === 0 ? [undefined] : envFiles;
  const childArgs = parallel > 1 && !forwarded.includes("--plain")
    ? [...forwarded, "--plain"]
    : [...forwarded];
  const tasks = [];
  for (let run = 1; run <= runs; run += 1) {
    for (const envFile of groups) {
      tasks.push({
        run,
        runs,
        envFile,
        forwarded: childArgs,
        pipe: parallel > 1,
      });
    }
  }
  return tasks;
}

export function runTaskPool(tasks, parallel, start) {
  const limit = Math.max(1, parallel);
  let cursor = 0;
  let active = 0;
  let exitCode = 0;
  let succeeded = 0;
  let failed = 0;
  let settled = false;

  return new Promise((resolve) => {
    const finishIfIdle = () => {
      if (settled || active > 0 || cursor < tasks.length) {
        return;
      }
      settled = true;
      resolve({
        code: exitCode,
        succeeded,
        failed,
        skipped: tasks.length - cursor,
      });
    };

    const pump = () => {
      if (settled) {
        return;
      }
      while (active < limit && cursor < tasks.length) {
        const task = tasks[cursor];
        cursor += 1;
        active += 1;
        Promise.resolve()
          .then(() => start(task))
          .then(
            (status) => {
              active -= 1;
              if (status !== 0) {
                failed += 1;
                if (exitCode === 0) {
                  exitCode = normalizeStatus(status);
                }
              } else {
                succeeded += 1;
              }
              pump();
            },
            () => {
              active -= 1;
              failed += 1;
              if (exitCode === 0) {
                exitCode = 1;
              }
              pump();
            },
          );
      }
      finishIfIdle();
    };

    pump();
  });
}

function normalizeStatus(status) {
  return typeof status === "number" && status !== 0 ? status : 1;
}

export function parseBenchProgress(line) {
  const text = line.trim();
  const start = /^\[bench\] start model=(\S+) seed=(\S+) cycles=(\d+)\b/.exec(text);
  if (start !== null) {
    const apiLog = /\sapiLog=(.*)$/.exec(text);
    return {
      kind: "start",
      model: start[1],
      seed: start[2],
      cycles: Number(start[3]),
      apiLog: apiLog?.[1] ?? "",
    };
  }
  const cycle = /^\[bench\] cycle=(\d+)\/(\d+)\b.*\bbalance=([-0-9.]+)/.exec(text);
  if (cycle !== null) {
    const ticks = /\bticks=(\d+)\/(\d+)\b/.exec(text);
    return {
      kind: "cycle",
      cycle: Number(ticks?.[1] ?? cycle[1]),
      cycleCount: Number(ticks?.[2] ?? cycle[2]),
      balance: cycle[3],
    };
  }
  const report = /^\[bench\] report=(.*)$/.exec(text);
  if (report !== null) {
    return { kind: "report", path: report[1] ?? "" };
  }
  return null;
}

export function progressBar(ratio, width) {
  const size = Math.max(1, width);
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * size);
  const head = filled > 0 && filled < size ? 1 : 0;
  const body = Math.max(0, filled - head);
  const empty = size - body - head;
  return `[${"=".repeat(body)}${head === 1 ? ">" : ""}${"-".repeat(empty)}]`;
}

export function formatDurationHms(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function formatClock(ms) {
  const date = new Date(ms);
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function campaignEstimate(snapshot, nowMs) {
  const elapsedMs = Math.max(0, nowMs - snapshot.startedAtMs);
  const failed = snapshot.failed ?? 0;
  const queued = Math.max(0, snapshot.total - snapshot.finished - failed - snapshot.active.length);
  const projections = [];
  const activeRemaining = [];
  for (const task of snapshot.active) {
    if (task.completedCycles > 0 && task.cycleCount > 0) {
      const duration = Math.max(0, task.completedAtMs - task.startedAtMs);
      const average = duration / task.completedCycles;
      projections.push(average * task.cycleCount);
      activeRemaining.push(
        Math.max(0, task.completedAtMs + average * (task.cycleCount - task.completedCycles) - nowMs),
      );
    }
  }
  const finishedDurations = snapshot.finishedDurations;
  const averageRunMs = finishedDurations.length > 0
    ? mean(finishedDurations)
    : projections.length > 0
      ? mean(projections)
      : null;
  if (averageRunMs === null) {
    return { elapsedMs, remainingMs: null, finishAtMs: null, ratio: campaignRatio(snapshot) };
  }
  for (const task of snapshot.active) {
    if (task.completedCycles <= 0 || task.cycleCount <= 0) {
      activeRemaining.push(averageRunMs);
    }
  }
  const remainingMs = queued === 0
    ? (activeRemaining.length === 0 ? 0 : Math.max(...activeRemaining))
    : (activeRemaining.reduce((sum, value) => sum + value, 0) + queued * averageRunMs) /
      Math.max(1, snapshot.parallel);
  return {
    elapsedMs,
    remainingMs,
    finishAtMs: nowMs + remainingMs,
    ratio: campaignRatio(snapshot),
  };
}

function campaignRatio(snapshot) {
  if (snapshot.total <= 0) {
    return 0;
  }
  let partial = snapshot.finished + (snapshot.failed ?? 0);
  for (const task of snapshot.active) {
    if (task.cycleCount > 0) {
      partial += Math.min(1, task.completedCycles / task.cycleCount);
    }
  }
  return Math.min(1, partial / snapshot.total);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function renderCampaign(snapshot, nowMs, width = 100) {
  const estimate = campaignEstimate(snapshot, nowMs);
  const percent = Math.round(estimate.ratio * 100);
  const barWidth = Math.max(10, Math.min(32, width - 58));
  const finish = estimate.finishAtMs === null ? "calculating" : formatClock(estimate.finishAtMs);
  const failed = snapshot.failed ?? 0;
  const header = fitLine(
    `runs ${snapshot.finished}/${snapshot.total} failed ${failed}  ${progressBar(estimate.ratio, barWidth)} ${String(percent).padStart(3)}%  elapsed ${formatDurationHms(estimate.elapsedMs)}  finish ${finish}`,
    width,
  );
  const rows = snapshot.active.map((task) => {
    const cycleRatio = task.cycleCount > 0 ? task.completedCycles / task.cycleCount : 0;
    const cycleLabel = task.cycleCount > 0 ? `${task.completedCycles}/${task.cycleCount}` : "starting";
    const balance = task.balance === null ? "" : `  bal ${task.balance}`;
    const name = task.label.padEnd(28).slice(0, 28);
    return fitLine(
      `${name} ${String(task.run).padStart(3)}/${task.runs}  ${progressBar(cycleRatio, 12)} ${cycleLabel.padStart(7)}${balance}  ${formatDurationHms(Math.max(0, nowMs - task.startedAtMs))}`,
      width,
    );
  });
  return [header, ...rows].join("\n");
}

function fitLine(line, width) {
  if (line.length <= width) {
    return line;
  }
  return `${line.slice(0, Math.max(0, width - 1))}…`;
}

function createCampaignView(total, parallel) {
  const startedAtMs = Date.now();
  const slots = new Map();
  const finishedDurations = [];
  let finished = 0;
  let failed = 0;
  let lines = 0;
  let timer = null;
  let stopped = false;
  const useAnsi = process.stderr.isTTY === true;

  const snapshot = () => ({
    startedAtMs,
    total,
    parallel,
    finished,
    failed,
    finishedDurations,
    active: [...slots.values()],
  });

  const paint = () => {
    if (stopped) {
      return;
    }
    const frame = renderCampaign(snapshot(), Date.now(), process.stderr.columns ?? 100);
    const nextLines = frame.split("\n");
    if (useAnsi && lines > 0) {
      process.stderr.write(`\x1b[${lines}F\x1b[J`);
    }
    if (!useAnsi) {
      process.stderr.write(`${nextLines[0]}\n`);
      lines = 0;
      return;
    }
    process.stderr.write(`${nextLines.map((line) => `${line}\x1b[K`).join("\n")}\n`);
    lines = nextLines.length;
  };

  const note = (line) => {
    if (useAnsi && lines > 0) {
      process.stderr.write(`\x1b[${lines}F\x1b[J`);
      lines = 0;
    }
    process.stderr.write(`${line}\n`);
  };

  return {
    start() {
      if (useAnsi) {
        process.stderr.write("\x1b[?25l");
        process.on("exit", () => {
          process.stderr.write("\x1b[?25h");
        });
      }
      paint();
      timer = setInterval(paint, 1000);
      timer.unref();
    },
    stop() {
      if (stopped) {
        return;
      }
      if (timer !== null) {
        clearInterval(timer);
      }
      paint();
      stopped = true;
      if (useAnsi) {
        process.stderr.write("\x1b[?25h");
      }
    },
    beginTask(id, task) {
      const now = Date.now();
      slots.set(id, {
        label: task.envFile === undefined ? "default" : shortEnvLabel(task.envFile.label),
        run: task.run,
        runs: task.runs,
        startedAtMs: now,
        completedCycles: 0,
        completedAtMs: now,
        cycleCount: 0,
        balance: null,
      });
      note(`[bench-repeat] ${logLabel(task)} started`);
      paint();
    },
    ingest(id, line) {
      const progress = parseBenchProgress(line);
      const slot = slots.get(id);
      if (slot === undefined || progress === null || progress.kind === "report") {
        return progress;
      }
      if (progress.kind === "start") {
        slot.cycleCount = progress.cycles;
        return progress;
      }
      slot.completedCycles = progress.cycle;
      slot.cycleCount = progress.cycleCount;
      slot.balance = progress.balance;
      slot.completedAtMs = Date.now();
      return progress;
    },
    finishTask(id, durationMs, reportPath) {
      const slot = slots.get(id);
      slots.delete(id);
      finished += 1;
      finishedDurations.push(durationMs);
      const balance = slot?.balance == null ? "" : ` balance ${slot.balance}`;
      const report = reportPath.length > 0 ? ` report ${reportPath}` : "";
      note(`[bench-repeat] ${id} finished in ${formatDurationHms(durationMs)}${balance}${report}`);
      paint();
    },
    failTask(id, reason, detail) {
      slots.delete(id);
      failed += 1;
      note(`[bench-repeat] ${id} stopped with ${reason}`);
      if (detail.length > 0) {
        note(`[bench-repeat] ${detail}`);
      }
      paint();
    },
  };
}

async function main() {
  let parsed;
  try {
    parsed = parseBenchRepeatArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof BenchRepeatArgsError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (parsed.help) {
    process.stderr.write(`${BENCH_REPEAT_USAGE}\n`);
    return;
  }

  if (parsed.listFailed || parsed.resume.length > 0) {
    if (
      parsed.runsProvided ||
      parsed.dryRun ||
      parsed.envFiles.length > 0 ||
      parsed.forwarded.length > 0 ||
      (parsed.listFailed && parsed.resume.length > 0)
    ) {
      process.stderr.write(
        `--list-failed and --resume cannot be combined with a task queue.\n${BENCH_REPEAT_USAGE}\n`,
      );
      process.exitCode = 1;
      return;
    }
  }

  if (parsed.listFailed) {
    const open = listOpenFailures(failureLedgerPath());
    if (open.length === 0) {
      process.stderr.write("[bench-repeat] no failed tasks\n");
      return;
    }
    process.stderr.write(formatFailureList(open));
    return;
  }

  if (parsed.resume.length > 0) {
    const inspection = inspectResumeTarget(parsed.resume);
    if (!inspection.ok) {
      process.stderr.write(`[bench-repeat] ${inspection.message}\n`);
      process.exitCode = 1;
      return;
    }
    if (!existsSync(cliPath)) {
      process.stderr.write(
        `[bench-repeat] missing ${cliPath}. Run npm run build first.\n`,
      );
      process.exitCode = 1;
      return;
    }
    const code = await launchTask(resumeTask(inspection), null);
    if (code !== 0) {
      process.exitCode = code;
    }
    return;
  }

  let envFiles;
  try {
    envFiles = resolveEnvFiles(parsed.envFiles);
  } catch (error) {
    if (error instanceof BenchRepeatArgsError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const tasks = buildBenchTasks(envFiles, parsed.runs, parsed.forwarded, parsed.parallel);
  if (parsed.dryRun) {
    process.stderr.write(`[bench-repeat] parallel=${parsed.parallel} tasks=${tasks.length}\n`);
    for (const task of tasks) {
      process.stderr.write(
        `${formatRunPrefix(task)}: node dist/src/cli.js${formatForwarded(task.forwarded)}\n`,
      );
    }
    process.stderr.write("[bench-repeat] dry-run complete, benchmark was not started\n");
    return;
  }

  if (!existsSync(cliPath)) {
    process.stderr.write(
      `[bench-repeat] missing ${cliPath}. Run npm run build first.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const view = parsed.parallel > 1 ? createCampaignView(tasks.length, parsed.parallel) : null;
  if (view !== null) {
    view.start();
  }
  let result;
  try {
    result = await runTaskPool(tasks, parsed.parallel, (task) => launchTask(task, view));
  } finally {
    view?.stop();
  }
  if (result.failed > 0) {
    process.stderr.write(
      `[bench-repeat] finished ${result.succeeded}/${tasks.length} runs; ${result.failed} failed\n`,
    );
    process.exitCode = result.code;
    return;
  }

  const configCount = envFiles.length;
  if (configCount === 0) {
    process.stderr.write(`[bench-repeat] finished ${parsed.runs} runs\n`);
    return;
  }
  process.stderr.write(
    `[bench-repeat] finished ${configCount * parsed.runs} runs across ${configCount} env files\n`,
  );
}

function launchTask(task, view) {
  const prefix = formatRunPrefix(task);
  const startedAt = Date.now();
  const taskId = logLabel(task);
  if (view === null) {
    process.stderr.write(`${prefix}\n`);
  } else {
    view.beginTask(taskId, task);
  }
  return new Promise((resolve) => {
    let settled = false;
    let reportPath = "";
    let apiLog = "";
    let completedCycles = 0;
    let cycleCount = 0;
    let stderrTail = [];
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      const durationMs = Date.now() - startedAt;
      const exitCode = code === 0 ? 0 : typeof code === "number" ? code : 1;
      if (exitCode !== 0) {
        recordFailure({
          timestamp: new Date().toISOString(),
          envFile: task.envFile === undefined ? "" : task.envFile.path,
          run: task.run,
          runs: task.runs,
          forwarded: task.forwarded,
          exitCode,
          completedCycles,
          cycleCount,
          apiLog,
          stderrTail,
        });
      }
      if (view === null) {
        if (exitCode === 0) {
          process.stderr.write(`${prefix} finished in ${formatDurationHms(durationMs)}\n`);
        } else {
          const reason = typeof code === "string" ? code : `exit code ${code}`;
          process.stderr.write(`${prefix} stopped with ${reason}\n`);
          if (stderrTail.length > 0) {
            process.stderr.write(`[bench-repeat] ${stderrTail.join("\n")}\n`);
          }
        }
      } else if (exitCode === 0) {
        view.finishTask(taskId, durationMs, reportPath);
      } else {
        const reason = typeof code === "string" ? code : `exit code ${code}`;
        view.failTask(taskId, reason, stderrTail.join("\n"));
      }
      resolve(exitCode);
    };
    const child = spawn(process.execPath, benchRepeatCommand(task.forwarded), {
      cwd: root,
      env: environmentFor(task.envFile, view !== null),
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (child.stdout !== null && child.stderr !== null) {
      watchBenchStream(child.stderr, (line) => {
        const progress = view === null ? parseBenchProgress(line) : view.ingest(taskId, line);
        if (view === null) {
          process.stderr.write(`${line}\n`);
        }
        if (progress?.kind === "report") {
          reportPath = progress.path;
        } else if (progress?.kind === "start") {
          apiLog = resolveChildPath(progress.apiLog);
          cycleCount = progress.cycles;
        } else if (progress?.kind === "cycle") {
          completedCycles = progress.cycle;
          cycleCount = progress.cycleCount;
        } else if (progress === null) {
          stderrTail = rememberStderrLine(stderrTail, line);
        }
      });
      watchBenchStream(child.stdout, (line) => {
        if (view === null && line.length > 0) {
          process.stdout.write(`${line}\n`);
        }
      });
    }
    child.on("error", (error) => {
      stderrTail = rememberStderrLine(stderrTail, error.message);
      finish(1);
    });
    child.on("exit", (status, signal) => {
      if (status === 0) {
        finish(0);
        return;
      }
      finish(status === null ? `signal ${signal}` : status);
    });
  });
}

function watchBenchStream(stream, onLine) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      onLine(line);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) {
      onLine(buffer);
    }
  });
}

function rememberStderrLine(tail, line) {
  const text = line.trim();
  if (text.length === 0) {
    return tail;
  }
  const next = [...tail, text.slice(0, 500)];
  if (next.length > STDERR_TAIL_LIMIT) {
    next.splice(0, next.length - STDERR_TAIL_LIMIT);
  }
  return next;
}

function resolveChildPath(apiLog) {
  if (typeof apiLog !== "string" || apiLog.length === 0 || apiLog === "disabled") {
    return "";
  }
  return resolve(root, apiLog);
}

export function failureLedgerPath() {
  return join(root, "logs", "bench-failures.jsonl");
}

export function artifactPathsForApiLog(apiLog) {
  const absolute = resolve(root, apiLog);
  const match = /^api-log_(.+)_(\d{4}-\d{2}-\d{2})_([^_]+)\.jsonl$/.exec(basename(absolute));
  if (match === null) {
    return null;
  }
  const stem = `${match[1]}_${match[2]}_${match[3]}`;
  const directory = dirname(absolute);
  return {
    model: match[1],
    testDate: match[2],
    postfix: match[3],
    apiLog: absolute,
    directory,
    run: join(directory, `run_${stem}.json`),
    checkpoint: join(directory, `checkpoint_${stem}.json`),
    report: join(directory, `report_${stem}.json`),
  };
}

export function listOpenFailures(ledgerPath) {
  if (!existsSync(ledgerPath)) {
    return [];
  }
  const latest = new Map();
  const lines = readFileSync(ledgerPath, "utf8").split("\n");
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    const key = typeof record.apiLog === "string" && record.apiLog.length > 0
      ? record.apiLog
      : `${record.envFile ?? ""}:${record.run ?? ""}:${record.timestamp ?? latest.size}`;
    latest.set(key, record);
  }
  return [...latest.values()].filter((record) => !failureWasRecovered(record));
}

function failureWasRecovered(record) {
  if (typeof record.apiLog !== "string" || record.apiLog.length === 0) {
    return false;
  }
  const paths = artifactPathsForApiLog(record.apiLog);
  return paths !== null && existsSync(paths.report);
}

export function formatFailureList(records) {
  return records.map((record) => formatFailure(record)).join("");
}

function formatFailure(record) {
  const label = record.envFile ? shortEnvLabel(record.envFile) : "default";
  const cycles = `${record.completedCycles ?? 0}/${record.cycleCount ?? 0}`;
  const log = typeof record.apiLog === "string" && record.apiLog.length > 0
    ? record.apiLog
    : "unavailable";
  const lines = [
    `[bench-repeat] ${label} run ${record.run}/${record.runs} exit ${record.exitCode} cycle ${cycles}`,
    `[bench-repeat]   log: ${log}`,
  ];
  if (log !== "unavailable") {
    lines.push(`[bench-repeat]   resume: npm run bench:runs -- --resume ${log}`);
  }
  return `${lines.join("\n")}\n`;
}

function recordFailure(record) {
  const ledgerPath = failureLedgerPath();
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, "utf8");
}

export function inspectResumeTarget(apiLog) {
  const paths = artifactPathsForApiLog(apiLog);
  if (paths === null || !existsSync(paths.apiLog)) {
    return { ok: false, message: `API log not found: ${apiLog}` };
  }
  if (!existsSync(paths.checkpoint)) {
    return {
      ok: false,
      message: `no checkpoint for ${paths.apiLog}. The run has no completed cycle to resume.`,
    };
  }
  if (!existsSync(paths.run)) {
    return { ok: false, message: `run manifest not found: ${paths.run}` };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(paths.run, "utf8"));
  } catch {
    return { ok: false, message: `run manifest is not valid JSON: ${paths.run}` };
  }
  return { ok: true, paths, manifest };
}

function resumeTask(inspection) {
  const dotenvPath = typeof inspection.manifest.dotenvPath === "string"
    ? inspection.manifest.dotenvPath
    : "";
  return {
    run: 1,
    runs: 1,
    envFile: dotenvPath.length === 0 ? undefined : { label: dotenvPath, path: dotenvPath },
    forwarded: ["--resume", inspection.paths.apiLog, "--plain"],
    pipe: false,
  };
}

function formatRunPrefix(task) {
  const envLabel = task.envFile === undefined ? "" : ` env=${task.envFile.label}`;
  return `[bench-repeat]${envLabel} run ${task.run}/${task.runs}`;
}

function logLabel(task) {
  if (task.envFile === undefined) {
    return `run ${task.run}/${task.runs}`;
  }
  return `${shortEnvLabel(task.envFile.label)} ${task.run}/${task.runs}`;
}

function shortEnvLabel(file) {
  const base = basename(file);
  if (base === ".env") {
    return "default";
  }
  if (base.startsWith(".env.")) {
    return base.slice(".env.".length);
  }
  return base;
}

function environmentFor(envFile, quietConsole) {
  const env = { ...process.env };
  if (envFile !== undefined) {
    env.DOTENV_CONFIG_PATH = envFile.path;
    env.DOTENV_CONFIG_OVERRIDE = "true";
  }
  if (quietConsole) {
    env.BENCH_QUIET_CONSOLE = "1";
  }
  return env;
}

function formatForwarded(forwarded) {
  if (forwarded.length === 0) {
    return "";
  }
  return ` ${forwarded.join(" ")}`;
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
