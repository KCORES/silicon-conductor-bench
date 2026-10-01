import type { CollisionOutcome } from "../core/types.js";

export type AccidentImpactStyle = "rear" | "cross";

export interface AccidentEventPayload {
  readonly vehicleIds: readonly string[];
  readonly lockedResourceIds: readonly string[];
  readonly pedestrianIds?: readonly string[];
  readonly collisionType?: string;
  readonly severity?: "MINOR" | "MODERATE" | "SERIOUS" | "CRITICAL";
}

export interface PlaybackCueInput {
  /** True when this frame started in forward playback, before advance or pause. */
  readonly wasPlaying: boolean;
  readonly isScrubbing: boolean;
  readonly previousCursor: number;
  readonly nextCursor: number;
}

export type PlaybackCueMode = "forward" | "seek" | "idle";

export interface VehicleImpactNudge {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

const CROSS_FOLD = Math.PI / 4;

export function readAccidentPayload(
  payload: unknown,
): AccidentEventPayload | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  if (
    !isStringList(record.vehicleIds) ||
    !isStringList(record.lockedResourceIds)
  ) {
    return undefined;
  }
  const pedestrianIds = isStringList(record.pedestrianIds)
    ? record.pedestrianIds
    : undefined;
  return {
    vehicleIds: record.vehicleIds,
    lockedResourceIds: record.lockedResourceIds,
    ...(typeof record.collisionType === "string"
      ? { collisionType: record.collisionType }
      : {}),
    ...(isSeverity(record.severity) ? { severity: record.severity } : {}),
    ...(pedestrianIds === undefined ? {} : { pedestrianIds }),
  };
}

function isSeverity(
  value: unknown,
): value is "MINOR" | "MODERATE" | "SERIOUS" | "CRITICAL" {
  return (
    value === "MINOR" ||
    value === "MODERATE" ||
    value === "SERIOUS" ||
    value === "CRITICAL"
  );
}

export function readCollisionOutcomes(payload: unknown): readonly CollisionOutcome[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const outcomes = (payload as Record<string, unknown>).collisionOutcomes;
  if (!Array.isArray(outcomes)) {
    return [];
  }
  return outcomes.filter(isCollisionOutcome);
}

/** Prefer v2 crosswalk cell locks so pedestrian accidents pin to the occupied stripe. */
export function accidentAnchorResourceIds(
  lockedResourceIds: readonly string[],
): readonly string[] {
  const cells = lockedResourceIds.filter((id) => id.includes(":CELL:"));
  return cells.length > 0 ? cells : lockedResourceIds;
}

/**
 * A cursor increase during forward playback collects accidents, including
 * when that same advance pauses at the end of the tape.
 * Scrub, step, jump, and reverse collect nothing.
 */
export function playbackCueMode(input: PlaybackCueInput): PlaybackCueMode {
  if (input.nextCursor === input.previousCursor) {
    return "idle";
  }
  if (
    input.isScrubbing ||
    !input.wasPlaying ||
    input.nextCursor < input.previousCursor
  ) {
    return "seek";
  }
  return "forward";
}

export function collectCrossedAccidents<T extends { readonly kind: string }>(
  events: readonly T[],
  previousCursor: number,
  nextCursor: number,
): T[] {
  if (nextCursor <= previousCursor) {
    return [];
  }
  const found: T[] = [];
  const start = Math.max(previousCursor + 1, 0);
  const end = Math.min(nextCursor, events.length - 1);
  for (let index = start; index <= end; index += 1) {
    const event = events[index];
    if (event !== undefined && event.kind === "ACCIDENT") {
      found.push(event);
    }
  }
  return found;
}

/** Same-axis headings shove along travel; a wide heading gap shoves sideways. */
export function accidentImpactStyle(
  headings: readonly number[],
): AccidentImpactStyle {
  const first = headings[0];
  const second = headings[1];
  if (first === undefined || second === undefined) {
    return "rear";
  }
  let delta = Math.abs(first - second) % (Math.PI * 2);
  if (delta > Math.PI) {
    delta = Math.PI * 2 - delta;
  }
  const folded = Math.min(delta, Math.PI - delta);
  return folded >= CROSS_FOLD ? "cross" : "rear";
}

/**
 * Impact offset sampled on top of the recorded pose.
 * Progress 0 and 1 both return a zero nudge so the next pose is the base.
 */
export function vehicleImpactNudge(
  style: AccidentImpactStyle,
  heading: number,
  vehicleIndex: number,
  progress: number,
): VehicleImpactNudge {
  const t = clamp01(progress);
  if (t === 0 || t === 1) {
    return { x: 0, y: 0, z: 0, yaw: 0 };
  }
  const envelope = Math.sin(t * Math.PI) * (1 - t * 0.35);
  if (style === "cross") {
    const sign = vehicleIndex % 2 === 0 ? 1 : -1;
    const side = 1.15 * envelope * sign;
    return {
      x: Math.cos(heading) * side,
      y: 0.06 * envelope,
      z: -Math.sin(heading) * side,
      yaw: sign * 0.22 * envelope,
    };
  }
  const along = 1.35 * envelope;
  return {
    x: Math.sin(heading) * along,
    y: 0,
    z: Math.cos(heading) * along,
    yaw: Math.sin(t * Math.PI * 2) * 0.08 * (1 - t),
  };
}

function isStringList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isCollisionOutcome(value: unknown): value is CollisionOutcome {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.impactTick === "number" &&
    typeof record.resourceId === "string" &&
    isCollisionVector(record.contactPoint) &&
    typeof record.collisionType === "string" &&
    isSeverity(record.severity) &&
    Array.isArray(record.vehicles) &&
    record.vehicles.every(isVehicleCollisionParticipant) &&
    Array.isArray(record.pedestrians) &&
    record.pedestrians.every(isPedestrianCollisionParticipant)
  );
}

function isVehicleCollisionParticipant(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.vehicleId === "string" &&
    isCollisionVector(record.impulse) &&
    isCollisionRestPose(record.restPose) &&
    typeof record.slideTicks === "number"
  );
}

function isPedestrianCollisionParticipant(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.pedestrianId === "string" &&
    isCollisionVector(record.impulse) &&
    isCollisionRestPose(record.restPose) &&
    typeof record.fallDirection === "number" &&
    typeof record.slideTicks === "number"
  );
}

function isCollisionRestPose(value: unknown): boolean {
  return (
    isCollisionVector(value) &&
    typeof (value as Record<string, unknown>).heading === "number"
  );
}

function isCollisionVector(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.x === "number" && typeof record.z === "number";
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
