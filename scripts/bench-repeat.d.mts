export const BENCH_REPEAT_USAGE: string;

export class BenchRepeatArgsError extends Error {
  constructor(message: string);
}

export interface BenchRepeatPlan {
  readonly help: boolean;
  readonly runs: number;
  readonly parallel: number;
  readonly dryRun: boolean;
  readonly listFailed: boolean;
  readonly resume: string;
  readonly runsProvided: boolean;
  readonly envFiles: readonly string[];
  readonly forwarded: readonly string[];
}

export function parseBenchRepeatArgs(args: readonly string[]): BenchRepeatPlan;

export function benchRepeatCommand(forwarded: readonly string[]): string[];

export interface ResolvedEnvFile {
  readonly label: string;
  readonly path: string;
}

export function resolveEnvFiles(files: readonly string[]): ResolvedEnvFile[];

export interface BenchTask {
  readonly run: number;
  readonly runs: number;
  readonly envFile: ResolvedEnvFile | undefined;
  readonly forwarded: readonly string[];
  readonly pipe: boolean;
}

export function buildBenchTasks(
  envFiles: readonly ResolvedEnvFile[],
  runs: number,
  forwarded: readonly string[],
  parallel: number,
): BenchTask[];

export interface TaskPoolResult {
  readonly code: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly skipped: number;
}

export function runTaskPool<T>(
  tasks: readonly T[],
  parallel: number,
  start: (task: T) => number | Promise<number>,
): Promise<TaskPoolResult>;

export type BenchProgress =
  | {
      readonly kind: "start";
      readonly model: string;
      readonly seed: string;
      readonly cycles: number;
      readonly apiLog: string;
    }
  | { readonly kind: "cycle"; readonly cycle: number; readonly cycleCount: number; readonly balance: string }
  | { readonly kind: "report"; readonly path: string }
  | null;

export function parseBenchProgress(line: string): BenchProgress;

export function progressBar(ratio: number, width: number): string;

export function formatDurationHms(durationMs: number): string;

export function formatClock(ms: number): string;

export interface CampaignTaskSnapshot {
  readonly label: string;
  readonly run: number;
  readonly runs: number;
  readonly startedAtMs: number;
  readonly completedCycles: number;
  readonly completedAtMs: number;
  readonly cycleCount: number;
  readonly balance: string | null;
}

export interface CampaignSnapshot {
  readonly startedAtMs: number;
  readonly total: number;
  readonly parallel: number;
  readonly finished: number;
  readonly failed?: number;
  readonly finishedDurations: readonly number[];
  readonly active: readonly CampaignTaskSnapshot[];
}

export interface CampaignEstimate {
  readonly elapsedMs: number;
  readonly remainingMs: number | null;
  readonly finishAtMs: number | null;
  readonly ratio: number;
}

export function campaignEstimate(snapshot: CampaignSnapshot, nowMs: number): CampaignEstimate;

export function renderCampaign(snapshot: CampaignSnapshot, nowMs: number, width?: number): string;

export interface ArtifactPaths {
  readonly model: string;
  readonly testDate: string;
  readonly postfix: string;
  readonly apiLog: string;
  readonly directory: string;
  readonly run: string;
  readonly checkpoint: string;
  readonly report: string;
}

export function artifactPathsForApiLog(apiLog: string): ArtifactPaths | null;

export function failureLedgerPath(): string;

export interface FailureRecord {
  readonly timestamp: string;
  readonly envFile: string;
  readonly run: number;
  readonly runs: number;
  readonly forwarded: readonly string[];
  readonly exitCode: number;
  readonly completedCycles: number;
  readonly cycleCount: number;
  readonly apiLog: string;
  readonly stderrTail: readonly string[];
}

export function listOpenFailures(ledgerPath: string): FailureRecord[];

export function formatFailureList(records: readonly FailureRecord[]): string;

export type ResumeInspection =
  | { readonly ok: true; readonly paths: ArtifactPaths; readonly manifest: unknown }
  | { readonly ok: false; readonly message: string };

export function inspectResumeTarget(apiLog: string): ResumeInspection;
