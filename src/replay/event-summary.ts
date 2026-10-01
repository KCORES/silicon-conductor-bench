import type { ReplayEvent } from "./types.js";

export function summarizeReplayEvent(event: ReplayEvent): string | undefined {
  if (event.kind === "PED_JAYWALK") {
    const payload = asRecord(event.payload);
    const ids = readStringList(payload.pedestrianIds);
    const crosswalk =
      typeof payload.crosswalkId === "string" ? payload.crosswalkId : "crosswalk";
    return `${formatIds(ids, "pedestrian")} jaywalked at ${crosswalk}`;
  }
  if (event.kind === "PED_COLLISION") {
    const payload = asRecord(event.payload);
    const ids = readStringList(payload.pedestrianIds);
    const resource =
      typeof payload.resourceId === "string"
        ? payload.resourceId
        : typeof payload.crosswalkId === "string"
          ? payload.crosswalkId
          : "crosswalk";
    return `${formatIds(ids, "pedestrian")} injured at ${resource}`;
  }
  return undefined;
}

function formatIds(ids: readonly string[], fallback: string): string {
  return ids.length === 0 ? fallback : ids.join(", ");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
