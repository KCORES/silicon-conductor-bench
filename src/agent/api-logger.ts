import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ARTIFACT_PURPOSES,
  buildArtifactFileName,
  createArtifactIdentity,
  type ArtifactIdentity,
} from "../io/artifacts.js";

export type AgentApiLogEvent =
  | "API_REQUEST"
  | "API_RESPONSE"
  | "API_ERROR"
  | "TOOL_CALL"
  | "TOOL_RESULT";

export interface AgentApiLogRecord {
  readonly timestamp: string;
  readonly event: AgentApiLogEvent;
  readonly tick: number;
  readonly cycle: number;
  readonly round: number;
  readonly latencyMs?: number;
  readonly payload: unknown;
}

export interface AgentApiLogger {
  log(record: AgentApiLogRecord): void;
  logRaw?(record: AgentApiLogRecord): void;
}

export interface FileAgentApiLoggerOptions {
  readonly enabled?: boolean;
  readonly consoleEnabled?: boolean;
  readonly directory?: string;
  readonly fileName?: string;
  readonly rawFileName?: string;
  readonly identity?: ArtifactIdentity;
  readonly write?: (line: string) => void;
  readonly rawWrite?: (line: string) => void;
  readonly print?: (text: string) => void;
}

export class SilentAgentApiLogger implements AgentApiLogger {
  log(_record: AgentApiLogRecord): void {}
  logRaw(_record: AgentApiLogRecord): void {}
}

export class CapturingAgentApiLogger implements AgentApiLogger {
  readonly records: AgentApiLogRecord[] = [];
  readonly rawRecords: AgentApiLogRecord[] = [];

  log(record: AgentApiLogRecord): void {
    this.records.push(record);
  }

  logRaw(record: AgentApiLogRecord): void {
    this.rawRecords.push(record);
  }
}

export class FileAgentApiLogger implements AgentApiLogger {
  private readonly enabled: boolean;
  private readonly consoleEnabled: boolean;
  private readonly filePath: string | undefined;
  private readonly rawFilePath: string | undefined;
  private readonly write: ((line: string) => void) | undefined;
  private readonly rawWrite: ((line: string) => void) | undefined;
  private readonly print: (text: string) => void;
  private directoryReady = false;
  private rawDirectoryReady = false;

  constructor(options: FileAgentApiLoggerOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.consoleEnabled = options.consoleEnabled ?? true;
    this.print = options.print ?? ((text) => process.stderr.write(`${text}\n`));
    this.write = options.write;
    this.rawWrite = options.rawWrite;
    const identity =
      options.identity ?? createArtifactIdentity({ model: "unknown-model" });
    this.filePath =
      options.fileName === undefined
        ? join(
            options.directory ?? "logs",
            buildArtifactFileName(
              ARTIFACT_PURPOSES.apiLog,
              identity,
              "jsonl",
            ),
          )
        : join(options.directory ?? "logs", options.fileName);
    this.rawFilePath =
      options.rawFileName === undefined
        ? join(
            options.directory ?? "logs",
            buildArtifactFileName(
              ARTIFACT_PURPOSES.rawApiLog,
              identity,
              "jsonl",
            ),
          )
        : join(options.directory ?? "logs", options.rawFileName);
  }

  get path(): string | undefined {
    return this.filePath;
  }

  get rawPath(): string | undefined {
    return this.rawFilePath;
  }

  log(record: AgentApiLogRecord): void {
    if (!this.enabled) {
      return;
    }

    const line = JSON.stringify(record);
    if (this.consoleEnabled) {
      this.print(formatConsoleBlock(record));
    }
    this.appendLine(line);
  }

  logRaw(record: AgentApiLogRecord): void {
    if (!this.enabled) {
      return;
    }
    const line = JSON.stringify(record);
    if (this.rawWrite !== undefined) {
      this.rawWrite(`${line}\n`);
      return;
    }
    if (this.rawFilePath === undefined) {
      return;
    }
    if (!this.rawDirectoryReady) {
      mkdirSync(dirname(this.rawFilePath), { recursive: true });
      this.rawDirectoryReady = true;
    }
    appendFileSync(this.rawFilePath, `${line}\n`, "utf8");
  }

  private appendLine(line: string): void {
    if (this.write !== undefined) {
      this.write(`${line}\n`);
      return;
    }
    if (this.filePath === undefined) {
      return;
    }
    if (!this.directoryReady) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      this.directoryReady = true;
    }
    appendFileSync(this.filePath, `${line}\n`, "utf8");
  }
}

export function createDefaultAgentApiLogger(options: {
  readonly enabled: boolean;
  readonly consoleEnabled: boolean;
  readonly directory: string;
  readonly identity: ArtifactIdentity;
}): AgentApiLogger {
  if (!options.enabled) {
    return new SilentAgentApiLogger();
  }
  return new FileAgentApiLogger({
    enabled: true,
    consoleEnabled: options.consoleEnabled,
    directory: options.directory,
    identity: options.identity,
  });
}

function formatConsoleBlock(record: AgentApiLogRecord): string {
  const header = `[agent-api] ${record.event} tick=${record.tick} cycle=${record.cycle} round=${record.round}${
    record.latencyMs === undefined ? "" : ` latencyMs=${record.latencyMs}`
  }`;
  return `${header}\n${JSON.stringify(record.payload, null, 2)}`;
}
