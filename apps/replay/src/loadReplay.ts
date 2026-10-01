import {
  REPLAY_SCHEMA_VERSION,
  type ReplayBundle,
  type ReplayDryRunPayload,
  type ReplayEvent,
} from "../../../src/replay/types.js";
import { normalizeReplayFrame } from "../../../src/replay/playback.js";

export class ReplayLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayLoadError";
  }
}

export function parseReplayBundle(raw: unknown): ReplayBundle {
  if (typeof raw !== "object" || raw === null) {
    throw new ReplayLoadError("Replay file is not a JSON object.");
  }
  const record = raw as Partial<ReplayBundle>;
  if (record.schemaVersion !== REPLAY_SCHEMA_VERSION) {
    throw new ReplayLoadError(
      `Unsupported replay schema ${String(record.schemaVersion)}. Expected ${REPLAY_SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(record.frames) || record.frames.length === 0) {
    throw new ReplayLoadError("Replay file has no frames.");
  }
  if (record.scene === undefined || !Array.isArray(record.events)) {
    throw new ReplayLoadError("Replay file is missing scene or event data.");
  }
  if (
    !Array.isArray(record.scene.pedestrianCorners) ||
    !Array.isArray(record.scene.pedestrianApproachPaths) ||
    record.frames.some((frame) => !Array.isArray(frame.pedestrians))
  ) {
    throw new ReplayLoadError(
      "Replay file is missing schema 5 pedestrian topology or frame data.",
    );
  }
  const bundle = record as ReplayBundle;
  return {
    ...bundle,
    frames: bundle.frames.map(normalizeReplayFrame),
  };
}

export async function readReplayFile(file: File): Promise<ReplayBundle> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new ReplayLoadError("Replay file is not valid JSON.");
  }
  return parseReplayBundle(parsed);
}

export function isDryRunPayload(payload: unknown): payload is ReplayDryRunPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as ReplayDryRunPayload).candidates)
  );
}

export function eventsAtTick(
  events: readonly ReplayEvent[],
  tick: number,
): ReplayEvent[] {
  return events.filter((event) => event.tick === tick);
}
