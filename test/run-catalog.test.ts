import { describe, expect, it } from "vitest";
import {
  parseRunReport,
  readAnimationVersionHeader,
  readSchemaVersionHeader,
  sortRuns,
} from "../src/replay/run-catalog.js";

const newer = {
  generatedAt: "2026-09-23T06:48:18.970Z",
  identity: {
    model: "deepseek-flash",
    testDate: "2026-09-23",
    postfix: "140511",
  },
  summary: {
    model: "deepseek-flash",
    seed: 42,
    finalBalance: -1128.61,
    elapsedMs: 465_695,
    totals: { promptTokens: 100, completionTokens: 40, apiCalls: 208 },
    replayPath: "logs\\replay_deepseek-flash_2026-09-23_140511.json",
  },
};

const older = {
  generatedAt: "2026-09-21T08:00:00.000Z",
  identity: {
    model: "other-model",
    testDate: "2026-09-21",
    postfix: "165100",
  },
  summary: {
    model: "other-model",
    seed: 1,
    finalBalance: 20,
    totals: { promptTokens: 10, completionTokens: 5 },
    replayPath: "logs/replay_other-model_2026-09-21_165100.json",
  },
};

describe("run catalog", () => {
  it("reads the clock from a parallel postfix that includes milliseconds and pid", () => {
    const entry = parseRunReport("report.json", {
      ...newer,
      identity: { ...newer.identity, postfix: "140511008-4242" },
    });
    expect(entry?.dateLabel).toBe("2026-09-23 14:05:11");
    expect(entry?.executedAtMs).toBe(Date.parse("2026-09-23T14:05:11.008"));
  });

  it("reads date, score, model, and total tokens from a report", () => {
    const entry = parseRunReport("report_deepseek-flash_2026-09-23_140511.json", newer);
    expect(entry).toMatchObject({
      model: "deepseek-flash",
      dateLabel: "2026-09-23 14:05:11",
      score: -1128.61,
      totalTokens: 140,
      apiCalls: 208,
      elapsedMs: 465_695,
      seed: 42,
      replayFile: "replay_deepseek-flash_2026-09-23_140511.json",
      sourceFileName: "report_deepseek-flash_2026-09-23_140511.json",
      schemaVersion: null,
      animationVersion: null,
    });
  });

  it("reads a schema version from the start of a replay document", () => {
    const header =
      '{\n  "schemaVersion": 6,\n  "simulationRulesVersion": 10,\n  "frames":';
    expect(readSchemaVersionHeader(header)).toBe(6);
    expect(readAnimationVersionHeader(header)).toBe(10);
    expect(readSchemaVersionHeader('{"model":"x"}')).toBeNull();
    expect(readAnimationVersionHeader('{"model":"x"}')).toBeNull();
  });

  it("sorts by time descending by default and can sort by score", () => {
    const runs = [
      parseRunReport("older.json", older),
      parseRunReport("newer.json", newer),
    ].flatMap((entry) => (entry === null ? [] : [entry]));
    expect(sortRuns(runs, "time", "desc").map((run) => run.id)).toEqual([
      "newer.json",
      "older.json",
    ]);
    expect(sortRuns(runs, "score", "desc").map((run) => run.score)).toEqual([
      20,
      -1128.61,
    ]);
    expect(sortRuns(runs, "tokens", "asc").map((run) => run.totalTokens)).toEqual([
      15,
      140,
    ]);
    expect(sortRuns(runs, "model", "asc").map((run) => run.model)).toEqual([
      "deepseek-flash",
      "other-model",
    ]);
    expect(sortRuns(runs, "file", "asc").map((run) => run.sourceFileName)).toEqual([
      "newer.json",
      "older.json",
    ]);
    const versioned = runs.map((run, index) => ({
      ...run,
      schemaVersion: index === 0 ? 7 : 6,
      animationVersion: index === 0 ? 11 : 19,
    }));
    expect(sortRuns(versioned, "schema", "desc").map((run) => run.id)).toEqual([
      "older.json",
      "newer.json",
    ]);
  });

  it("rejects a replay path that is not a replay file name", () => {
    const entry = parseRunReport("report.json", {
      ...newer,
      summary: { ...newer.summary, replayPath: "../api-log_secret.jsonl" },
    });
    expect(entry?.replayFile).toBe("replay_deepseek-flash_2026-09-23_140511.json");
  });

  it("derives the replay file name from the report identity", () => {
    const entry = parseRunReport("report.json", {
      ...older,
      summary: { ...older.summary, replayPath: undefined },
    });
    expect(entry?.replayFile).toBe("replay_other-model_2026-09-21_165100.json");
  });
});
