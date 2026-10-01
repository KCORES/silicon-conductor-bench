import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { relative, resolve } from "node:path";
import type { Connect, Plugin } from "vite";
import {
  parseRunReport,
  readAnimationVersionHeader,
  readSchemaVersionHeader,
  type RunCatalogEntry,
} from "../../src/replay/run-catalog.ts";

const REPLAY_FILE_NAME = /^replay_[a-z0-9._-]+\.json$/;

export function runCatalogPlugin(logsDir: string): Plugin {
  const root = resolve(logsDir);
  const attach = (server: { middlewares: Connect.Server }): void => {
    server.middlewares.use((req, res, next) => {
      const url = req.url?.split("?")[0] ?? "";
      if (url === "/api/runs") {
        sendJson(res, 200, { runs: listRuns(root) });
        return;
      }
      if (url.startsWith("/api/replays/")) {
        serveReplay(root, url.slice("/api/replays/".length), res);
        return;
      }
      next();
    });
  };
  return {
    name: "bench-run-catalog",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

function listRuns(logsDir: string): RunCatalogEntry[] {
  let names: string[] = [];
  try {
    names = readdirSync(logsDir);
  } catch {
    return [];
  }
  const runs: RunCatalogEntry[] = [];
  for (const name of names) {
    if (!name.startsWith("report_") || !name.endsWith(".json")) {
      continue;
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(resolve(logsDir, name), "utf8"));
      const entry = parseRunReport(name, raw);
      if (entry === null) {
        continue;
      }
      const replayFile =
        entry.replayFile !== null && replayExists(logsDir, entry.replayFile)
          ? entry.replayFile
          : null;
      const replayVersions =
        replayFile === null ? null : readReplayVersions(logsDir, replayFile);
      runs.push({
        ...entry,
        replayFile,
        sourceFileName: replayFile ?? name,
        schemaVersion: replayVersions?.schemaVersion ?? null,
        animationVersion:
          replayVersions?.animationVersion ?? entry.animationVersion,
      });
    } catch {
      // Skip a report that is not readable JSON.
    }
  }
  return runs;
}

function readReplayVersions(
  logsDir: string,
  name: string,
): {
  readonly schemaVersion: number | null;
  readonly animationVersion: number | null;
} | null {
  if (!REPLAY_FILE_NAME.test(name)) {
    return null;
  }
  const filePath = resolve(logsDir, name);
  const fromRoot = relative(logsDir, filePath);
  if (fromRoot.startsWith("..") || fromRoot.includes("..")) {
    return null;
  }
  let fd: number | undefined;
  try {
    fd = openSync(filePath, "r");
    const buffer = Buffer.alloc(1024);
    const bytes = readSync(fd, buffer, 0, buffer.length, 0);
    const header = buffer.toString("utf8", 0, bytes);
    return {
      schemaVersion: readSchemaVersionHeader(header),
      animationVersion: readAnimationVersionHeader(header),
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
    }
  }
}

function replayExists(logsDir: string, name: string): boolean {
  if (!REPLAY_FILE_NAME.test(name)) {
    return false;
  }
  const filePath = resolve(logsDir, name);
  const fromRoot = relative(logsDir, filePath);
  if (fromRoot.startsWith("..") || fromRoot.includes("..")) {
    return false;
  }
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function serveReplay(logsDir: string, encodedName: string, res: ServerResponse): void {
  let name = encodedName;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    sendJson(res, 400, { error: "bad replay name" });
    return;
  }
  if (!REPLAY_FILE_NAME.test(name)) {
    sendJson(res, 404, { error: "replay not found" });
    return;
  }
  const filePath = resolve(logsDir, name);
  const fromRoot = relative(logsDir, filePath);
  if (fromRoot.startsWith("..") || fromRoot.includes("..")) {
    sendJson(res, 404, { error: "replay not found" });
    return;
  }
  try {
    if (!statSync(filePath).isFile()) {
      sendJson(res, 404, { error: "replay not found" });
      return;
    }
  } catch {
    sendJson(res, 404, { error: "replay not found" });
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(readFileSync(filePath));
}

function sendJson(
  res: ServerResponse<IncomingMessage>,
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
