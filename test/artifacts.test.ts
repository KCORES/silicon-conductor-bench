import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileAgentApiLogger } from "../src/agent/api-logger.js";
import {
  persistWorkingMemoryToStore,
  WorkingMemoryStack,
} from "../src/agent/working-memory.js";
import {
  ARTIFACT_PURPOSES,
  buildArtifactFileName,
  createArtifactIdentity,
  createRunArtifactStore,
  formatArtifactPostfix,
} from "../src/io/artifacts.js";
import { writeBenchmarkReport } from "../src/io/report-writer.js";

describe("artifact naming", () => {
  it("includes milliseconds and pid so simultaneous runs do not share a postfix", () => {
    const now = new Date(2026, 8, 24, 4, 34, 12, 8);
    expect(formatArtifactPostfix(now, 4242)).toBe("043412008-4242");
    expect(formatArtifactPostfix(now, 4243)).toBe("043412008-4243");
  });

  it("builds purpose_model_date_postfix file names", () => {
    const identity = createArtifactIdentity({
      model: "DeepSeek/Flash v1",
      testDate: "2026-09-21",
      postfix: "164600",
    });

    expect(identity.model).toBe("deepseek-flash-v1");
    expect(
      buildArtifactFileName(ARTIFACT_PURPOSES.apiLog, identity, "jsonl"),
    ).toBe("api-log_deepseek-flash-v1_2026-09-21_164600.jsonl");
    expect(
      buildArtifactFileName(ARTIFACT_PURPOSES.rawApiLog, identity, "jsonl"),
    ).toBe("raw-api-log_deepseek-flash-v1_2026-09-21_164600.jsonl");
    expect(
      buildArtifactFileName(ARTIFACT_PURPOSES.report, identity, "json"),
    ).toBe("report_deepseek-flash-v1_2026-09-21_164600.json");
    expect(
      buildArtifactFileName(ARTIFACT_PURPOSES.workingMemory, identity, "json"),
    ).toBe("working-memory_deepseek-flash-v1_2026-09-21_164600.json");
    expect(
      buildArtifactFileName(ARTIFACT_PURPOSES.replay, identity, "json"),
    ).toBe("replay_deepseek-flash-v1_2026-09-21_164600.json");
  });

  it("writes logs, reports, and working memory with a shared identity", () => {
    const directory = mkdtempSync(join(tmpdir(), "silicon-cop-"));
    const store = createRunArtifactStore({
      directory,
      model: "deepseek-flash",
      testDate: "2026-09-21",
      postfix: "164615",
    });
    const memory = new WorkingMemoryStack(8, {
      persist: persistWorkingMemoryToStore(store),
    });
    const logger = new FileAgentApiLogger({
      directory,
      identity: store.identity,
      consoleEnabled: false,
    });

    logger.log({
      timestamp: "2026-09-21T08:46:15.000Z",
      event: "API_REQUEST",
      tick: 1,
      cycle: 1,
      round: 1,
      payload: { model: "deepseek-flash" },
    });
    logger.logRaw({
      timestamp: "2026-09-21T08:46:15.100Z",
      event: "API_RESPONSE",
      tick: 1,
      cycle: 1,
      round: 1,
      payload: { choices: [{ message: { reasoning_content: "raw" } }] },
    });
    memory.save(
      { phaseName: "EAST_WEST_CLEARING", intendedDuration: 5 },
      42,
    );
    const reportPath = writeBenchmarkReport(store, { score: 12 });

    expect(logger.path).toBe(
      join(directory, "api-log_deepseek-flash_2026-09-21_164615.jsonl"),
    );
    expect(logger.rawPath).toBe(
      join(directory, "raw-api-log_deepseek-flash_2026-09-21_164615.jsonl"),
    );
    expect(readFileSync(logger.rawPath ?? "", "utf8")).toContain(
      "\"reasoning_content\":\"raw\"",
    );
    expect(reportPath).toBe(
      join(directory, "report_deepseek-flash_2026-09-21_164615.json"),
    );
    expect(
      JSON.parse(
        readFileSync(
          join(directory, "working-memory_deepseek-flash_2026-09-21_164615.json"),
          "utf8",
        ),
      ).plans[0].phaseName,
    ).toBe("EAST_WEST_CLEARING");
  });
});
