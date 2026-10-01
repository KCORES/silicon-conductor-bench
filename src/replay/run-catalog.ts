export type RunSortKey =
  | "time"
  | "score"
  | "model"
  | "file"
  | "schema"
  | "tokens"
  | "api"
  | "duration";
export type RunSortDirection = "asc" | "desc";

export interface RunCatalogEntry {
  readonly id: string;
  readonly model: string;
  readonly dateLabel: string;
  readonly executedAtMs: number | null;
  readonly score: number | null;
  readonly totalTokens: number | null;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly apiCalls: number | null;
  readonly elapsedMs: number | null;
  readonly seed: number | null;
  readonly replayFile: string | null;
  /** On-disk replay file, or the report file when no replay exists. */
  readonly sourceFileName: string;
  readonly schemaVersion: number | null;
  readonly animationVersion: number | null;
}

const REPLAY_FILE_NAME = /^replay_[a-z0-9._-]+\.json$/;

export function parseRunReport(
  reportFileName: string,
  raw: unknown,
): RunCatalogEntry | null {
  if (!isRecord(raw)) {
    return null;
  }
  const identity = isRecord(raw.identity) ? raw.identity : null;
  const summary = isRecord(raw.summary) ? raw.summary : null;
  const model =
    readString(summary?.model) ??
    readString(identity?.model) ??
    null;
  if (model === null) {
    return null;
  }
  const testDate = readString(identity?.testDate) ?? "";
  const postfix = readString(identity?.postfix) ?? "";
  const generatedAt = readString(raw.generatedAt);
  const generatedMs = generatedAt === null ? null : timeMs(generatedAt);
  const totals = isRecord(summary?.totals) ? summary.totals : null;
  const promptTokens = readNumber(totals?.promptTokens);
  const completionTokens = readNumber(totals?.completionTokens);
  return {
    id: reportFileName,
    model,
    dateLabel: dateLabel(testDate, postfix, generatedAt),
    executedAtMs: timeFromIdentity(testDate, postfix) ?? generatedMs,
    score: readNumber(summary?.finalBalance),
    totalTokens: sumTokens(promptTokens, completionTokens),
    promptTokens,
    completionTokens,
    apiCalls: readNumber(totals?.apiCalls),
    elapsedMs: readNumber(summary?.elapsedMs),
    seed: readNumber(summary?.seed),
    replayFile: replayFileName(summary?.replayPath) ?? replayFileFromIdentity(identity),
    sourceFileName: reportFileName,
    schemaVersion: null,
    animationVersion: readNumber(raw.simulationRulesVersion),
  };
}

/** Reads schemaVersion from the start of a replay JSON document. */
export function readSchemaVersionHeader(text: string): number | null {
  return readVersionHeader(text, "schemaVersion");
}

/** Reads simulationRulesVersion, used as the replay animation version. */
export function readAnimationVersionHeader(text: string): number | null {
  return readVersionHeader(text, "simulationRulesVersion");
}

function readVersionHeader(text: string, field: string): number | null {
  const match = new RegExp(`"${field}"\\s*:\\s*(\\d+)`).exec(
    text.slice(0, 4096),
  );
  if (match === null || match[1] === undefined) {
    return null;
  }
  const version = Number(match[1]);
  return Number.isInteger(version) ? version : null;
}

export function sortRuns(
  runs: readonly RunCatalogEntry[],
  key: RunSortKey,
  direction: RunSortDirection,
): RunCatalogEntry[] {
  const factor = direction === "asc" ? 1 : -1;
  return runs
    .map((run, index) => ({ run, index }))
    .sort((left, right) => {
      const compared = compareRuns(left.run, right.run, key, factor);
      return compared === 0 ? left.index - right.index : compared;
    })
    .map((item) => item.run);
}

function compareRuns(
  left: RunCatalogEntry,
  right: RunCatalogEntry,
  key: RunSortKey,
  factor: number,
): number {
  if (key === "model") {
    return left.model.localeCompare(right.model) * factor;
  }
  if (key === "file") {
    return left.sourceFileName.localeCompare(right.sourceFileName) * factor;
  }
  if (key === "schema") {
    const schema = compareNullable(
      left.schemaVersion,
      right.schemaVersion,
      factor,
    );
    return schema === 0
      ? compareNullable(left.animationVersion, right.animationVersion, factor)
      : schema;
  }
  if (key === "time") {
    return compareNullable(left.executedAtMs, right.executedAtMs, factor);
  }
  if (key === "score") {
    return compareNullable(left.score, right.score, factor);
  }
  if (key === "tokens") {
    return compareNullable(left.totalTokens, right.totalTokens, factor);
  }
  if (key === "api") {
    return compareNullable(left.apiCalls, right.apiCalls, factor);
  }
  return compareNullable(left.elapsedMs, right.elapsedMs, factor);
}

function compareNullable(
  left: number | null,
  right: number | null,
  factor: number,
): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return (left - right) * factor;
}

function dateLabel(
  testDate: string,
  postfix: string,
  generatedAt: string | null,
): string {
  const clock = clockFromPostfix(postfix);
  if (testDate.length > 0 && clock.length > 0) {
    return `${testDate} ${clock}`;
  }
  if (testDate.length > 0) {
    return testDate;
  }
  return generatedAt ?? "未知日期";
}

function clockFromPostfix(postfix: string): string {
  const parsed = parsePostfixClock(postfix);
  if (parsed === null) {
    return "";
  }
  return `${parsed.hours}:${parsed.minutes}:${parsed.seconds}`;
}

function timeFromIdentity(testDate: string, postfix: string): number | null {
  const parsed = parsePostfixClock(postfix);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate) || parsed === null) {
    return null;
  }
  const millis = parsed.millis === null ? "" : `.${parsed.millis}`;
  return timeMs(
    `${testDate}T${parsed.hours}:${parsed.minutes}:${parsed.seconds}${millis}`,
  );
}

function parsePostfixClock(postfix: string): {
  readonly hours: string;
  readonly minutes: string;
  readonly seconds: string;
  readonly millis: string | null;
} | null {
  const match = /^(\d{2})(\d{2})(\d{2})(\d{3})?(?:-\d+)?$/.exec(postfix);
  if (match === null) {
    return null;
  }
  const hours = match[1];
  const minutes = match[2];
  const seconds = match[3];
  if (hours === undefined || minutes === undefined || seconds === undefined) {
    return null;
  }
  return {
    hours,
    minutes,
    seconds,
    millis: match[4] ?? null,
  };
}

function timeMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function sumTokens(prompt: number | null, completion: number | null): number | null {
  if (prompt === null && completion === null) {
    return null;
  }
  return (prompt ?? 0) + (completion ?? 0);
}

function replayFileFromIdentity(
  identity: Record<string, unknown> | null,
): string | null {
  if (identity === null) {
    return null;
  }
  const model = readString(identity.model);
  const testDate = readString(identity.testDate);
  const postfix = readString(identity.postfix);
  if (model === null || testDate === null || postfix === null) {
    return null;
  }
  const name = `replay_${model}_${testDate}_${postfix}.json`;
  return REPLAY_FILE_NAME.test(name) ? name : null;
}

function replayFileName(value: unknown): string | null {
  const text = readString(value);
  if (text === null) {
    return null;
  }
  const name = text.split(/[/\\]/).pop() ?? "";
  return REPLAY_FILE_NAME.test(name) ? name : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
