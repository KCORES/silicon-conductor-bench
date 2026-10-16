import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  artifactPathsForApiLog,
  campaignEstimate,
  formatClock,
  formatFailureList,
  inspectResumeTarget,
  listOpenFailures,
  parseBenchProgress,
  progressBar,
  renderCampaign,
  truncateLastError,
  decodeSparkline,
  applyBenchProgress,
  runTaskPool,
} from "../scripts/bench-repeat.mjs";

const envDir = mkdtempSync(join(tmpdir(), "bench-env-"));
const deepseekEnv = join(envDir, "deepseek.env");
const mimoEnv = join(envDir, "mimo.env");
writeFileSync(deepseekEnv, "OPENAI_MODEL=deepseek\n");
writeFileSync(mimoEnv, "OPENAI_MODEL=mimo\n");

afterAll(() => {
  rmSync(envDir, { recursive: true, force: true });
});

function launch(args: readonly string[]) {
  return spawnSync(process.execPath, ["scripts/bench-repeat.mjs", ...args], {
    encoding: "utf8",
  });
}

describe("benchmark repeat launcher", () => {
  it("prints the three planned commands and does not start the benchmark", () => {
    const result = launch(["--dry-run", "--", "--plain"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("[bench-repeat] run 1/3: node dist/src/cli.js --plain");
    expect(result.stderr).toContain("[bench-repeat] run 2/3: node dist/src/cli.js --plain");
    expect(result.stderr).toContain("[bench-repeat] run 3/3: node dist/src/cli.js --plain");
    expect(result.stderr).toContain("benchmark was not started");
    expect(result.stdout).toBe("");
  });

  it("accepts an explicit run count and forwards the cycle count", () => {
    const result = launch(["--runs=2", "--dry-run", "--", "20", "--seed", "2"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("[bench-repeat] run 1/2: node dist/src/cli.js 20 --seed 2");
    expect(result.stderr).toContain("[bench-repeat] run 2/2: node dist/src/cli.js 20 --seed 2");
    expect(result.stderr).not.toContain("run 3/2");
  });

  it("rejects a missing or non-positive run count before launching", () => {
    const missing = launch(["--runs"]);
    const zero = launch(["--runs", "0"]);

    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("--runs must be a positive integer.");
    expect(zero.status).toBe(1);
    expect(zero.stderr).toContain("--runs must be a positive integer.");
    expect(missing.stdout).toBe("");
    expect(zero.stdout).toBe("");
  });

  it("plans three runs for each env file and does not forward --env", () => {
    const result = launch([
      "--env",
      deepseekEnv,
      "--env",
      mimoEnv,
      "--dry-run",
      "--",
      "--plain",
    ]);

    expect(result.status).toBe(0);
    const planned = (result.stderr ?? "").split("\n").filter((line) => line.includes("node dist/src/cli.js"));
    expect(planned).toEqual([
      `[bench-repeat] env=${deepseekEnv} run 1/3: node dist/src/cli.js --plain`,
      `[bench-repeat] env=${mimoEnv} run 1/3: node dist/src/cli.js --plain`,
      `[bench-repeat] env=${deepseekEnv} run 2/3: node dist/src/cli.js --plain`,
      `[bench-repeat] env=${mimoEnv} run 2/3: node dist/src/cli.js --plain`,
      `[bench-repeat] env=${deepseekEnv} run 3/3: node dist/src/cli.js --plain`,
      `[bench-repeat] env=${mimoEnv} run 3/3: node dist/src/cli.js --plain`,
    ]);
    expect(result.stderr).not.toContain("--env");
    expect(result.stderr).toContain("benchmark was not started");
  });

  it("stops before the first run when an env file is missing", () => {
    const missing = join(envDir, "missing.env");
    const result = launch(["--env", deepseekEnv, "--env", missing, "--dry-run"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Env file not found: ${missing}`);
    expect(result.stderr).not.toContain("run 1/3");
    expect(result.stdout).toBe("");
  });

  it("plans every task and turns on plain logs when several processes share the terminal", () => {
    const result = launch(["--parallel", "6", "--dry-run"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("[bench-repeat] parallel=6 tasks=3");
    expect(result.stderr).toContain("[bench-repeat] run 1/3: node dist/src/cli.js --plain");
    expect(result.stderr).toContain("[bench-repeat] run 3/3: node dist/src/cli.js --plain");
  });

  it("keeps at most N tasks running and backfills when one finishes", async () => {
    let active = 0;
    let maxActive = 0;
    const started: string[] = [];
    const tasks = ["a", "b", "c", "d"];
    const result = await runTaskPool(tasks, 2, async (task) => {
      started.push(task);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      active -= 1;
      return 0;
    });

    expect(result).toEqual({ code: 0, succeeded: 4, failed: 0, skipped: 0 });
    expect(maxActive).toBe(2);
    expect(started).toEqual(tasks);
  });

  it("keeps scheduling after a failure", async () => {
    const started: string[] = [];
    const result = await runTaskPool(["a", "b", "c"], 2, async (task) => {
      started.push(task);
      if (task === "b") {
        return 7;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 40);
      });
      return 0;
    });

    expect(result).toEqual({ code: 7, succeeded: 2, failed: 1, skipped: 0 });
    expect(started.sort()).toEqual(["a", "b", "c"]);
  });

  it("reads cycle progress and ignores api payload lines", () => {
    expect(parseBenchProgress(
      "[bench] start model=deepseek-v4-pro seed=63916 cycles=100 maxApiRounds=8 artifacts=logs",
    )).toEqual({
      kind: "start",
      model: "deepseek-v4-pro",
      seed: "63916",
      cycles: 100,
      apiLog: "",
    });
    expect(parseBenchProgress(
      "[bench] cycle=42/100 tick=80 fallback=false admitted=1 rejected=0 api=3 tools=2 tok=10/4 dec/s=20.0 sleep=2 balance=-12.40 elapsed=00:08:00 eta=00:12:00",
    )).toEqual({
      kind: "cycle",
      cycle: 42,
      cycleCount: 100,
      balance: "-12.40",
      inputTokens: null,
      outputTokens: null,
      ttftSeconds: null,
      prefillPerSec: null,
      decodePerSec: null,
    });
    expect(parseBenchProgress(
      "[bench] cycle=12/400 ticks=96/400 tick=157 fallback=false admitted=1 rejected=0 api=3 tools=2 tok=10/4 dec/s=20.0 sleep=8 balance=-2.50 elapsed=00:01:00 eta=00:03:00 in=10 out=4 ttft=1.840 prefill/s=4200.0 decode/s=86.2",
    )).toEqual({
      kind: "cycle",
      cycle: 96,
      cycleCount: 400,
      balance: "-2.50",
      inputTokens: 10,
      outputTokens: 4,
      ttftSeconds: 1.84,
      prefillPerSec: 4200,
      decodePerSec: 86.2,
    });
    expect(parseBenchProgress(
      "[bench] start model=deepseek-v4-pro seed=63916 cycles=100 maxApiRounds=8 artifacts=logs apiLog=logs/api-log_demo.jsonl",
    )).toEqual({
      kind: "start",
      model: "deepseek-v4-pro",
      seed: "63916",
      cycles: 100,
      apiLog: "logs/api-log_demo.jsonl",
    });
    expect(parseBenchProgress('            "tactical_summary": {')).toBeNull();
    expect(parseBenchProgress("[bench] activity=thinking")).toEqual({
      kind: "activity",
      activity: "thinking",
    });
    expect(parseBenchProgress("[bench] activity=tool:commit_schedule")).toEqual({
      kind: "activity",
      activity: "tool:commit_schedule",
    });
    expect(parseBenchProgress("[bench] error=429 {\"message\":\"quota exceeded\"}")).toEqual({
      kind: "error",
      message: "429 {\"message\":\"quota exceeded\"}",
    });
    expect(parseBenchProgress("[bench] live ttft=1.840 in=18420 prefill/s=10010.9")).toMatchObject({
      kind: "live",
      ttftSeconds: 1.84,
      inputTokens: 18420,
      prefillPerSec: 10010.9,
      decodePerSec: null,
      outputTokens: null,
    });
    expect(parseBenchProgress("[bench] live decode/s=42.0 out=420")).toMatchObject({
      kind: "live",
      decodePerSec: 42,
      outputTokens: 420,
    });
  });

  it("renders a campaign bar with elapsed time and a finish clock", () => {
    const snapshot = {
      startedAtMs: 0,
      total: 4,
      parallel: 2,
      finished: 0,
      finishedDurations: [],
      active: [
        {
          label: "deepseek-flash 1/3",
          run: 1,
          runs: 3,
          startedAtMs: 0,
          completedCycles: 1,
          completedAtMs: 60_000,
          cycleCount: 2,
          balance: "-3.20",
        },
      ],
    };
    const estimate = campaignEstimate(snapshot, 60_000);

    expect(estimate.elapsedMs).toBe(60_000);
    expect(estimate.remainingMs).toBe(210_000);
    expect(estimate.finishAtMs).toBe(270_000);
    const frame = renderCampaign(snapshot, 60_000, 100);
    expect(frame).toContain("runs 0/4");
    expect(frame).toContain(progressBar(estimate.ratio, 32));
    expect(frame).toContain("elapsed 00:01:00");
    expect(frame).toContain(`finish ${formatClock(270_000)}`);
    expect(frame).toContain("deepseek-flash 1/3");
    expect(frame).toContain("1/2");
    expect(frame).toContain("-3.20");
    expect(frame).toContain("IN tok");
    expect(frame).toContain("DECODE t/s");
  });

  it("aligns throughput columns to the widest cell in the frame", () => {
    const snapshot = {
      startedAtMs: 0,
      total: 2,
      parallel: 2,
      finished: 0,
      finishedDurations: [],
      active: [
        {
          label: "short",
          run: 1,
          runs: 3,
          startedAtMs: 0,
          completedCycles: 1,
          completedAtMs: 1_000,
          cycleCount: 200,
          balance: "9.00",
          inputTokens: 9,
          outputTokens: 1,
          hasThroughput: true,
          ttftSeconds: 1.2,
          prefillPerSec: 8,
          decodePerSec: 3,
          activity: "thinking",
        },
        {
          label: "ling-3.1-flash-internal",
          run: 2,
          runs: 3,
          startedAtMs: 0,
          completedCycles: 20,
          completedAtMs: 1_000,
          cycleCount: 200,
          balance: "999.49",
          inputTokens: 18420,
          outputTokens: 2311,
          hasThroughput: true,
          ttftSeconds: 1.844,
          prefillPerSec: 4200,
          decodePerSec: 86.2,
          activity: "tool:commit_schedule",
        },
      ],
    };
    const lines = renderCampaign(snapshot, 1_000, 80).split("\n").slice(1);
    const header = lines[0] ?? "";
    const inTokAt = header.indexOf("IN tok");
    const outTokAt = header.indexOf("OUT tok");
    expect(inTokAt).toBeGreaterThan(0);
    expect(outTokAt).toBeGreaterThan(inTokAt);
    for (const line of lines) {
      expect(line.length).toBe(header.length);
    }
    expect(lines[1]).toContain("-/9");
    expect(lines[2]).toContain("-/18420");
    expect(lines[1]).toContain("-/1");
    expect(lines[2]).toContain("-/2311");
    const statusAt = header.indexOf("STATUS");
    expect(statusAt).toBeGreaterThan(0);
    expect(lines[1]?.slice(statusAt, statusAt + "tool:commit_schedule".length).trim()).toBe("thinking");
    expect(lines[2]?.slice(statusAt, statusAt + "tool:commit_schedule".length).trim()).toBe("tool:commit_schedule");
    expect(lines[1]).toContain("1.20s");
    expect(lines[2]).toContain("1.84s");
    expect(lines[1]).toContain("8.0");
    expect(lines[2]).toContain("4200.0");
    expect(header).toContain("LAST ERROR");
    const errorAt = header.indexOf("LAST ERROR");
    expect(lines[1]?.slice(errorAt).trimEnd()).toBe("-");
    expect(lines[2]?.slice(errorAt).trimEnd()).toBe("-");
  });

  it("keeps the last error within 100 ASCII columns and marks truncation", () => {
    expect(truncateLastError("a".repeat(100))).toBe("a".repeat(100));
    expect(truncateLastError("a".repeat(101))).toBe(`${"a".repeat(97)}...`);
    expect(truncateLastError("测".repeat(60)).endsWith("...")).toBe(true);
    expect(truncateLastError("测".repeat(60)).length).toBeLessThan(60);
    const snapshot = {
      startedAtMs: 0,
      total: 1,
      parallel: 1,
      finished: 0,
      finishedDurations: [],
      active: [
        {
          label: "ling",
          run: 1,
          runs: 1,
          startedAtMs: 0,
          completedCycles: 1,
          completedAtMs: 1_000,
          cycleCount: 200,
          balance: "1.00",
          inputTokens: 1,
          outputTokens: 1,
          hasThroughput: true,
          ttftSeconds: null,
          prefillPerSec: null,
          decodePerSec: null,
          activity: "request",
          lastError: "x".repeat(140),
        },
      ],
    };
    const lines = renderCampaign(snapshot, 1_000, 80).split("\n").slice(1);
    const header = lines[0] ?? "";
    const errorAt = header.indexOf("LAST ERROR");
    const cell = lines[1]?.slice(errorAt).trimEnd() ?? "";
    expect(cell).toBe(`${"x".repeat(97)}...`);
    expect(cell.length).toBe(100);
    expect(header.indexOf("LAST ERROR")).toBeGreaterThan(header.indexOf("TREND"));
  });

  it("draws a fixed-width decode trend and replaces the last error", () => {
    expect(decodeSparkline([])).toBe("............");
    expect(decodeSparkline([10, 5])).toHaveLength(12);
    expect(decodeSparkline([10, 5]).startsWith("..........")).toBe(true);
    expect(decodeSparkline([10]).endsWith("█")).toBe(true);
    const slot = {
      cycleCount: 0,
      activity: "thinking",
      lastError: "max_tokens",
      ttftSeconds: null as number | null,
      prefillPerSec: null as number | null,
      decodePerSec: null as number | null,
      decodeWindows: [] as number[],
      liveInputTokens: null as number | null,
      liveOutputTokens: null as number | null,
      inputTokens: 3,
      outputTokens: 1,
      hasThroughput: true,
      completedCycles: 1,
      balance: "1.00",
    };
    applyBenchProgress(slot, parseBenchProgress("[bench] live ttft=1.500 in=90 prefill/s=60.0"));
    applyBenchProgress(slot, parseBenchProgress("[bench] live decode/s=12.5 out=40"));
    expect(slot.ttftSeconds).toBe(1.5);
    expect(slot.prefillPerSec).toBe(60);
    expect(slot.liveInputTokens).toBe(90);
    expect(slot.liveOutputTokens).toBe(40);
    expect(slot.decodeWindows).toEqual([12.5]);
    applyBenchProgress(slot, parseBenchProgress("[bench] error=ok"));
    expect(slot.lastError).toBe("ok");
    applyBenchProgress(slot, parseBenchProgress("[bench] error=max_tokens"));
    expect(slot.lastError).toBe("max_tokens");
    applyBenchProgress(slot, parseBenchProgress("[bench] activity=request"));
    expect(slot.decodeWindows).toEqual([]);
    expect(slot.decodePerSec).toBeNull();
    expect(slot.liveOutputTokens).toBeNull();
    expect(slot.lastError).toBe("max_tokens");
    const shown = renderCampaign({
      startedAtMs: 0,
      total: 1,
      parallel: 1,
      finished: 0,
      finishedDurations: [],
      active: [{
        label: "ling",
        run: 1,
        runs: 1,
        startedAtMs: 0,
        completedCycles: 2,
        completedAtMs: 1_000,
        cycleCount: 200,
        balance: "1.00",
        inputTokens: 100,
        outputTokens: 40,
        lastInputTokens: 30,
        lastOutputTokens: 10,
        liveInputTokens: 5,
        liveOutputTokens: 2,
        hasThroughput: true,
        ttftSeconds: 1.5,
        prefillPerSec: 60,
        decodePerSec: 12.5,
        decodeWindows: [12.5],
        activity: "thinking",
        lastError: "ok",
      }],
    }, 1_000, 120).split("\n").slice(1);
    expect(shown[1]).toContain("5/105");
    expect(shown[1]).toContain("2/42");
  });

  it("lists an open failure and hides it after the report exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "bench-failures-"));
    const apiLog = join(directory, "api-log_demo-model_2026-09-30_120000000-1.jsonl");
    const report = join(directory, "report_demo-model_2026-09-30_120000000-1.json");
    writeFileSync(apiLog, "{}\n");
    const ledger = join(directory, "bench-failures.jsonl");
    const record = {
      timestamp: "2026-09-30T04:08:49.000Z",
      envFile: ".env.demo",
      run: 1,
      runs: 3,
      forwarded: ["100", "--seed", "63916", "--plain"],
      exitCode: 1,
      completedCycles: 32,
      cycleCount: 100,
      apiLog,
      stderrTail: ["Error: boom", "Node.js v22.22.2"],
    };
    writeFileSync(ledger, `${JSON.stringify(record)}\n`);

    const open = listOpenFailures(ledger);
    expect(open).toHaveLength(1);
    expect(formatFailureList(open)).toContain("demo run 1/3 exit 1 cycle 32/100");
    expect(formatFailureList(open)).toContain(`npm run bench:runs -- --resume ${apiLog}`);
    expect(artifactPathsForApiLog(apiLog)?.report).toBe(report);

    writeFileSync(report, "{}\n");
    expect(listOpenFailures(ledger)).toEqual([]);
    rmSync(directory, { recursive: true, force: true });
  });

  it("rejects resume when the checkpoint is missing", () => {
    const directory = mkdtempSync(join(tmpdir(), "bench-resume-"));
    const apiLog = join(directory, "api-log_demo-model_2026-09-30_120000000-2.jsonl");
    writeFileSync(apiLog, "{}\n");

    const missing = inspectResumeTarget(apiLog);
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.message).toContain("no checkpoint");
    }

    const combined = launch(["--resume", apiLog, "--runs", "2"]);
    expect(combined.status).toBe(1);
    expect(combined.stderr).toContain("cannot be combined with a task queue");
    rmSync(directory, { recursive: true, force: true });
  });
});
