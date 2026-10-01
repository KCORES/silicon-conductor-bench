import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { RunnerCheckpointState } from "../agent/runner.js";
import type { WorkingMemorySnapshot } from "../agent/working-memory.js";
import type { EngineCheckpoint } from "../core/engine.js";
import type { ReplayPart } from "../replay/recorder.js";
import {
  ARTIFACT_PURPOSES,
  parseApiLogIdentity,
  type ArtifactIdentity,
  type RunArtifactStore,
} from "./artifacts.js";

export interface RunManifest {
  readonly seed: number;
  readonly cycleCount: number;
  readonly horizonTicks?: number | null;
  readonly dotenvPath: string;
  readonly argv: readonly string[];
  readonly model: string;
  readonly apiLog: string;
}

export interface BenchAccumulators {
  readonly hazardBleedCharged: number;
  readonly secondaryPenaltiesCharged: number;
  readonly towingCostsCharged: number;
  readonly emergencyBleedCharged: number;
  readonly stallChainBleedCharged: number;
  readonly upstreamBleedCharged: number;
  readonly exitLockBleedCharged: number;
  readonly pedestrianDelayCharged: number;
  readonly pedestrianRewardsEarned: number;
  readonly pedestrianJaywalkPenaltiesCharged: number;
  readonly pedestrianStrikePenaltiesCharged: number;
  readonly schoolBusPenaltiesCharged?: number;
  readonly violationExits?: number;
}

export interface LedgerEntries {
  readonly vehicles: readonly { id: string; score: number; settled: boolean }[];
  readonly pedestrians: readonly { id: string; score: number; settled: boolean }[];
}

export interface BenchCheckpoint {
  readonly version: 1;
  readonly completedCycles: number;
  readonly cycleCount: number;
  readonly horizonTicks?: number | null;
  readonly seed: number;
  readonly balance: number;
  readonly interruptReason: string | null;
  readonly tacticalSummary: string;
  readonly startedAtMs: number;
  readonly completedAtMs: number;
  readonly accumulators: BenchAccumulators;
  readonly cycleSummaries: readonly unknown[];
  readonly lastSettlement: unknown;
  readonly ledgers: LedgerEntries;
  readonly workingMemory: WorkingMemorySnapshot;
  readonly runner: RunnerCheckpointState;
  readonly engine: EngineCheckpoint;
}

export interface LoadedResume {
  readonly identity: ArtifactIdentity;
  readonly checkpoint: BenchCheckpoint;
  readonly apiLogPath: string;
  readonly replayPartPath: string;
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, "utf8");
  rmSync(path, { force: true });
  renameSync(temporary, path);
}

export function writeRunManifest(
  store: RunArtifactStore,
  manifest: RunManifest,
): string {
  const path = store.filePath(ARTIFACT_PURPOSES.run, "json");
  writeJsonAtomic(path, manifest);
  return path;
}

export function writeBenchCheckpoint(
  store: RunArtifactStore,
  checkpoint: BenchCheckpoint,
): string {
  const path = store.filePath(ARTIFACT_PURPOSES.checkpoint, "json");
  writeJsonAtomic(path, checkpoint);
  return path;
}

export function replayPartPath(store: RunArtifactStore): string {
  return store.filePath(ARTIFACT_PURPOSES.replayPart, "jsonl");
}

export function appendReplayPart(store: RunArtifactStore, part: ReplayPart): string {
  const path = replayPartPath(store);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(part)}\n`, "utf8");
  return path;
}

export function readReplayParts(path: string): ReplayPart[] {
  if (!existsSync(path)) {
    return [];
  }
  const parts: ReplayPart[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }
    try {
      parts.push(JSON.parse(line) as ReplayPart);
    } catch {
      // A crash can tear the last appended line. Drop it.
    }
  }
  return parts;
}

export function rewriteReplayParts(path: string, parts: readonly ReplayPart[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const body = parts.map((part) => JSON.stringify(part)).join("\n");
  writeFileSync(path, body.length === 0 ? "" : `${body}\n`, "utf8");
}

export function loadResume(apiLogPath: string): LoadedResume {
  const absolute = resolve(apiLogPath);
  const identity = parseApiLogIdentity(absolute);
  if (identity === undefined) {
    throw new Error(`API log path is not a benchmark log: ${apiLogPath}`);
  }
  if (!existsSync(absolute)) {
    throw new Error(`API log not found: ${absolute}`);
  }
  const directory = dirname(absolute);
  const stem = `${identity.model}_${identity.testDate}_${identity.postfix}`;
  const checkpointPath = resolve(directory, `checkpoint_${stem}.json`);
  if (!existsSync(checkpointPath)) {
    throw new Error(
      `no checkpoint for ${absolute}. The run has no completed cycle to resume.`,
    );
  }
  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as BenchCheckpoint;
  if (checkpoint.version !== 1) {
    throw new Error(`Unsupported checkpoint version: ${String(checkpoint.version)}`);
  }
  return {
    identity,
    checkpoint,
    apiLogPath: absolute,
    replayPartPath: resolve(directory, `replay-part_${stem}.jsonl`),
  };
}
