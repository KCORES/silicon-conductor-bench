import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ARTIFACT_PURPOSES = {
  apiLog: "api-log",
  rawApiLog: "raw-api-log",
  report: "report",
  workingMemory: "working-memory",
  replay: "replay",
  checkpoint: "checkpoint",
  run: "run",
  replayPart: "replay-part",
} as const;

export type ArtifactPurpose =
  (typeof ARTIFACT_PURPOSES)[keyof typeof ARTIFACT_PURPOSES];

export interface ArtifactIdentity {
  readonly model: string;
  readonly testDate: string;
  readonly postfix: string;
}

export interface CreateArtifactIdentityOptions {
  readonly model: string;
  readonly now?: Date;
  readonly testDate?: string;
  readonly postfix?: string;
}

export function sanitizeArtifactSegment(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return sanitized.length > 0 ? sanitized : fallback;
}

export function parseApiLogIdentity(filePath: string): ArtifactIdentity | undefined {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const match = /^api-log_(.+)_(\d{4}-\d{2}-\d{2})_([^_]+)\.jsonl$/.exec(fileName);
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    return undefined;
  }
  return {
    model: match[1],
    testDate: match[2],
    postfix: match[3],
  };
}

export function formatTestDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatArtifactPostfix(date: Date, pid = process.pid): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const millis = String(date.getMilliseconds()).padStart(3, "0");
  return `${hours}${minutes}${seconds}${millis}-${pid}`;
}

export function createArtifactIdentity(
  options: CreateArtifactIdentityOptions,
): ArtifactIdentity {
  const now = options.now ?? new Date();
  return {
    model: sanitizeArtifactSegment(options.model, "unknown-model"),
    testDate: sanitizeArtifactSegment(
      options.testDate ?? formatTestDate(now),
      formatTestDate(now),
    ),
    postfix: sanitizeArtifactSegment(
      options.postfix ?? formatArtifactPostfix(now),
      formatArtifactPostfix(now),
    ),
  };
}

export function buildArtifactFileName(
  purpose: ArtifactPurpose | string,
  identity: ArtifactIdentity,
  extension: string,
): string {
  const normalizedExtension = extension.replace(/^\./, "");
  return [
    sanitizeArtifactSegment(purpose, "artifact"),
    identity.model,
    identity.testDate,
    identity.postfix,
  ].join("_") + `.${normalizedExtension}`;
}

export function createRunArtifactStore(options: {
  readonly directory: string;
  readonly model: string;
  readonly now?: Date;
  readonly testDate?: string;
  readonly postfix?: string;
}): RunArtifactStore {
  return new RunArtifactStore(
    options.directory,
    createArtifactIdentity(options),
  );
}

export class RunArtifactStore {
  readonly identity: ArtifactIdentity;
  readonly directory: string;

  constructor(directory: string, identity: ArtifactIdentity) {
    this.directory = directory;
    this.identity = identity;
  }

  fileName(purpose: ArtifactPurpose | string, extension: string): string {
    return buildArtifactFileName(purpose, this.identity, extension);
  }

  filePath(purpose: ArtifactPurpose | string, extension: string): string {
    return join(this.directory, this.fileName(purpose, extension));
  }

  writeJson(purpose: ArtifactPurpose | string, value: unknown): string {
    const path = this.filePath(purpose, "json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return path;
  }

  appendJsonl(purpose: ArtifactPurpose | string, value: unknown): string {
    const path = this.filePath(purpose, "jsonl");
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
    return path;
  }
}
