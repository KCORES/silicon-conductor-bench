import type {
  ReplayEvent,
  ReplayFrame,
  ReplayPedestrianPose,
  ReplayVehiclePose,
} from "./types.js";
import { PEDESTRIAN_TICKS_PER_CELL } from "../core/pedestrians.js";
import { vehicleClass } from "../core/vehicleRoster.js";
import { interpolatePose } from "./geometry.js";

export const DECISION_MARKER_KINDS = new Set<ReplayEvent["kind"]>([
  "DECISION_START",
]);

export interface PlaybackContext {
  readonly frames: readonly ReplayFrame[];
  readonly events: readonly ReplayEvent[];
  readonly tickDurationMs: number;
  readonly eventHoldMs: number;
}

export interface PlaybackState {
  readonly playing: boolean;
  readonly speed: number;
  readonly autoPauseOnDecision: boolean;
  readonly isScrubbing: boolean;
  readonly frameIndex: number;
  readonly alpha: number;
  readonly eventCursor: number;
  readonly eventHoldElapsedMs: number;
  readonly consumedMarkerIds: readonly string[];
  readonly pausedReason: "user" | "decision" | "complete" | null;
  /** Wall-clock time left to keep the current dry-run route on screen. */
  readonly decisionVisualRemainingMs: number;
}

export function createPlaybackState(
  overrides: Partial<PlaybackState> = {},
): PlaybackState {
  return {
    playing: false,
    speed: 1,
    autoPauseOnDecision: false,
    isScrubbing: false,
    frameIndex: 0,
    alpha: 0,
    eventCursor: -1,
    eventHoldElapsedMs: 0,
    consumedMarkerIds: [],
    pausedReason: null,
    decisionVisualRemainingMs: 0,
    ...overrides,
  };
}

export function shouldAutoPause(
  state: PlaybackState,
  marker: ReplayEvent | undefined,
): boolean {
  if (marker === undefined || !DECISION_MARKER_KINDS.has(marker.kind)) {
    return false;
  }
  if (!state.autoPauseOnDecision || !state.playing || state.isScrubbing) {
    return false;
  }
  if (state.speed > 2) {
    return false;
  }
  return !state.consumedMarkerIds.includes(marker.id);
}

export function play(state: PlaybackState): PlaybackState {
  return { ...state, playing: true, pausedReason: null };
}

export function pause(
  state: PlaybackState,
  reason: PlaybackState["pausedReason"] = "user",
): PlaybackState {
  return { ...state, playing: false, pausedReason: reason };
}

export function setSpeed(state: PlaybackState, speed: number): PlaybackState {
  return { ...state, speed: Math.max(0.25, speed) };
}

export function setAutoPauseOnDecision(
  state: PlaybackState,
  enabled: boolean,
): PlaybackState {
  return { ...state, autoPauseOnDecision: enabled };
}

export function beginScrub(state: PlaybackState): PlaybackState {
  return { ...state, isScrubbing: true, playing: false, pausedReason: "user" };
}

export function scrubToTick(
  state: PlaybackState,
  tick: number,
  context: PlaybackContext,
): PlaybackState {
  const frameIndex = frameIndexForTick(context.frames, tick);
  const eventCursor = lastEventIndexAtOrBeforeTick(context.events, tick);
  return consumeMarkersThroughCursor(
    {
      ...state,
      frameIndex,
      alpha: 0,
      eventCursor,
      eventHoldElapsedMs: 0,
      decisionVisualRemainingMs: 0,
    },
    context,
  );
}

export function endScrub(
  state: PlaybackState,
  context: PlaybackContext,
): PlaybackState {
  return {
    ...consumeMarkersThroughCursor(state, context),
    isScrubbing: false,
    playing: false,
    pausedReason: "user",
  };
}

export function stepFrame(
  state: PlaybackState,
  context: PlaybackContext,
  direction: 1 | -1,
): PlaybackState {
  const nextIndex = clamp(
    state.frameIndex + direction,
    0,
    Math.max(0, context.frames.length - 1),
  );
  const frame = context.frames[nextIndex];
  const eventCursor =
    frame === undefined
      ? state.eventCursor
      : lastEventIndexAtOrBeforeTick(context.events, frame.tick);
  return consumeMarkersThroughCursor(
    {
      ...state,
      playing: false,
      pausedReason: "user",
      frameIndex: nextIndex,
      alpha: 0,
      eventCursor,
      eventHoldElapsedMs: 0,
      decisionVisualRemainingMs: 0,
    },
    context,
  );
}

export function jumpToDecision(
  state: PlaybackState,
  context: PlaybackContext,
  direction: 1 | -1,
): PlaybackState {
  const markers = context.events.filter((event) =>
    DECISION_MARKER_KINDS.has(event.kind),
  );
  const currentTick = currentLogicalTick(state, context);
  const target =
    direction > 0
      ? markers.find((event) => event.tick > currentTick + 1e-6)
      : [...markers].reverse().find((event) => event.tick < currentTick - 1e-6);
  if (target === undefined) {
    return state;
  }
  return consumeMarkersThroughCursor(
    {
      ...state,
      playing: false,
      pausedReason: "user",
      frameIndex: frameIndexForTick(context.frames, target.tick),
      alpha: 0,
      eventCursor: context.events.findIndex((event) => event.id === target.id),
      eventHoldElapsedMs: 0,
      decisionVisualRemainingMs: 0,
    },
    context,
  );
}

export function advancePlayback(
  state: PlaybackState,
  dtMs: number,
  context: PlaybackContext,
): PlaybackState {
  if (!state.playing || state.isScrubbing || context.frames.length === 0) {
    return state;
  }

  let next = state;
  let remaining = dtMs * next.speed;
  while (remaining > 0 && next.playing) {
    const current = context.events[next.eventCursor];
    if (isHeldDecision(current?.kind) && next.decisionVisualRemainingMs > 0) {
      const spent = spendClock(
        next,
        Math.min(remaining, next.decisionVisualRemainingMs),
        context,
      );
      next = {
        ...spent.state,
        decisionVisualRemainingMs: next.decisionVisualRemainingMs - spent.spentMs,
      };
      remaining -= spent.spentMs;
      continue;
    }

    const upcoming = context.events[next.eventCursor + 1];
    const frame = context.frames[next.frameIndex];
    if (
      upcoming !== undefined &&
      frame !== undefined &&
      upcoming.tick <= frame.tick &&
      (next.alpha === 0 || upcoming.tick < nextFrameTick(context, next))
    ) {
      next = {
        ...next,
        eventCursor: next.eventCursor + 1,
        eventHoldElapsedMs: 0,
      };
      const shown = context.events[next.eventCursor];
      if (isHeldDecision(shown?.kind)) {
        next = {
          ...next,
          decisionVisualRemainingMs: context.eventHoldMs,
        };
      }
      continue;
    }

    if (next.frameIndex >= context.frames.length - 1) {
      return { ...next, playing: false, alpha: 0, pausedReason: "complete" };
    }
    const duration = frameDurationMs(next, context);
    const alphaLeft = (1 - next.alpha) * duration;
    if (remaining < alphaLeft) {
      return { ...next, alpha: next.alpha + remaining / duration };
    }
    remaining -= alphaLeft;
    next = {
      ...next,
      frameIndex: next.frameIndex + 1,
      alpha: 0,
    };
  }
  return next;
}

function spendClock(
  state: PlaybackState,
  budgetMs: number,
  context: PlaybackContext,
): { state: PlaybackState; spentMs: number } {
  let next = state;
  let remaining = budgetMs;
  while (remaining > 0 && next.playing) {
    if (next.frameIndex >= context.frames.length - 1) {
      return {
        state: { ...next, playing: false, alpha: 0, pausedReason: "complete" },
        spentMs: budgetMs - remaining,
      };
    }
    const duration = frameDurationMs(next, context);
    const alphaLeft = (1 - next.alpha) * duration;
    if (remaining < alphaLeft) {
      return {
        state: { ...next, alpha: next.alpha + remaining / duration },
        spentMs: budgetMs,
      };
    }
    remaining -= alphaLeft;
    next = {
      ...next,
      frameIndex: next.frameIndex + 1,
      alpha: 0,
    };
  }
  return { state: next, spentMs: budgetMs - remaining };
}

function isHeldDecision(kind: ReplayEvent["kind"] | undefined): boolean {
  return kind === "DRY_RUN_ADMIT" || kind === "COMMIT";
}

function frameDurationMs(
  state: PlaybackState,
  context: PlaybackContext,
): number {
  const current = context.frames[state.frameIndex];
  const next = context.frames[state.frameIndex + 1];
  return current !== undefined && next !== undefined && current.tick === next.tick
    ? 1
    : Math.max(1, context.tickDurationMs);
}

export function currentLogicalTick(
  state: PlaybackState,
  context: PlaybackContext,
): number {
  const frame = context.frames[state.frameIndex];
  const next = context.frames[state.frameIndex + 1];
  if (frame === undefined) {
    return 0;
  }
  if (next === undefined || next.tick === frame.tick) {
    return frame.tick;
  }
  return frame.tick + (next.tick - frame.tick) * state.alpha;
}

export function interpolateFrameVehicles(
  from: ReplayFrame,
  to: ReplayFrame | undefined,
  alpha: number,
): readonly ReplayVehiclePose[] {
  if (to === undefined || from.tick === to.tick || alpha <= 0) {
    return from.vehicles;
  }
  if (alpha >= 1) {
    return to.vehicles;
  }
  const incoming = new Map(to.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const poses: ReplayVehiclePose[] = [];
  for (const vehicle of from.vehicles) {
    const next = incoming.get(vehicle.id);
    incoming.delete(vehicle.id);
    if (next === undefined) {
      if (alpha < 0.5) {
        poses.push(vehicle);
      }
      continue;
    }
    poses.push(interpolateVehiclePose(vehicle, next, alpha));
  }
  if (alpha >= 0.5) {
    poses.push(...incoming.values());
  }
  return poses.sort((left, right) => left.id.localeCompare(right.id));
}

export interface VehicleMotionTransition {
  readonly id: string;
  readonly from: ReplayVehiclePose;
  readonly to: ReplayVehiclePose;
  readonly alpha: number;
}

export function vehicleMotionTransitions(
  frames: readonly ReplayFrame[],
  frameIndex: number,
  logicalTick: number,
): readonly VehicleMotionTransition[] {
  const frame = frames[frameIndex];
  if (frame === undefined) {
    return [];
  }
  const transitions: VehicleMotionTransition[] = [];
  for (const vehicle of frame.vehicles) {
    const kind = vehicleClass(vehicle.type);
    if (
      vehicle.state !== "CROSSING" ||
      (kind !== "truck" && kind !== "bus")
    ) {
      continue;
    }
    let target: ReplayVehiclePose | undefined;
    let targetTick: number | undefined;
    for (let index = frameIndex + 1; index < frames.length; index += 1) {
      const candidateFrame = frames[index];
      if (
        candidateFrame === undefined ||
        candidateFrame.tick <= frame.tick
      ) {
        continue;
      }
      if (candidateFrame.tick > frame.tick + 2) {
        break;
      }
      const candidate = candidateFrame.vehicles.find(
        (pose) => pose.id === vehicle.id,
      );
      if (candidate === undefined || candidate.state !== "CROSSING") {
        break;
      }
      if (vehiclePosePositionChanged(vehicle, candidate)) {
        target = candidate;
        targetTick = candidateFrame.tick;
        break;
      }
    }
    if (target === undefined || targetTick === undefined) {
      continue;
    }
    const moveStartTick = targetTick - 2;
    transitions.push({
      id: vehicle.id,
      from: vehicle,
      to: target,
      alpha: clamp((logicalTick - moveStartTick) / 2, 0, 1),
    });
  }
  return transitions;
}

export function interpolateVehiclePose(
  from: ReplayVehiclePose,
  to: ReplayVehiclePose,
  alpha: number,
): ReplayVehiclePose {
  const head = interpolatePose(from, to, alpha);
  const segmentCount = Math.max(from.segments.length, to.segments.length);
  const segments = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const fromSegment = from.segments[index] ?? from;
    const toSegment = to.segments[index] ?? to;
    segments.push(interpolatePose(fromSegment, toSegment, alpha));
  }
  return pinDepartureLedger(from, {
    ...to,
    ...head,
    segments,
  });
}

function vehiclePosePositionChanged(
  from: ReplayVehiclePose,
  to: ReplayVehiclePose,
): boolean {
  return from.x !== to.x || from.z !== to.z || from.heading !== to.heading;
}

export function readFramePedestrians(
  frame: ReplayFrame,
): readonly ReplayPedestrianPose[] {
  return frame.pedestrians ?? [];
}

export function normalizeReplayFrame(
  frame: ReplayFrame,
): ReplayFrame & { readonly pedestrians: readonly ReplayPedestrianPose[] } {
  return {
    ...frame,
    pedestrians: readFramePedestrians(frame),
  };
}

export function interpolateFramePedestrians(
  from: ReplayFrame,
  to: ReplayFrame | undefined,
  alpha: number,
): readonly ReplayPedestrianPose[] {
  const current = readFramePedestrians(from);
  if (to === undefined || from.tick === to.tick || alpha <= 0) {
    return current;
  }
  const nextFrame = readFramePedestrians(to);
  if (alpha >= 1) {
    return nextFrame;
  }
  const nextById = new Map(
    nextFrame.map((pedestrian) => [pedestrian.id, pedestrian]),
  );
  return current
    .map((pedestrian) => {
      const next = nextById.get(pedestrian.id);
      if (next === undefined) {
        return pedestrian;
      }
      return {
        ...pedestrian,
        ...interpolatePose(pedestrian, next, alpha),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export interface PedestrianMotionTransition {
  readonly id: string;
  readonly from: ReplayPedestrianPose;
  readonly to: ReplayPedestrianPose;
  readonly alpha: number;
}

export function pedestrianMotionTransitions(
  frames: readonly ReplayFrame[],
  frameIndex: number,
  logicalTick: number,
  ticksPerCell = PEDESTRIAN_TICKS_PER_CELL,
): readonly PedestrianMotionTransition[] {
  const frame = frames[frameIndex];
  if (frame === undefined || ticksPerCell <= 0) {
    return [];
  }
  const transitions: PedestrianMotionTransition[] = [];
  for (const pedestrian of readFramePedestrians(frame)) {
    if (
      pedestrian.state !== "APPROACHING" &&
      pedestrian.state !== "DEPARTING" &&
      pedestrian.state !== "WAITING" &&
      pedestrian.state !== "CROSSING_RESERVED" &&
      pedestrian.state !== "CROSSING_JAYWALK"
    ) {
      continue;
    }
    let target: ReplayPedestrianPose | undefined;
    let targetTick: number | undefined;
    for (let index = frameIndex + 1; index < frames.length; index += 1) {
      const candidateFrame = frames[index];
      if (candidateFrame === undefined || candidateFrame.tick <= frame.tick) {
        continue;
      }
      const candidate = readFramePedestrians(candidateFrame).find(
        (pose) => pose.id === pedestrian.id,
      );
      if (candidate === undefined) {
        break;
      }
      const beginsCrossing =
        pedestrian.state === "WAITING" &&
        (candidate.state === "CROSSING_RESERVED" ||
          candidate.state === "CROSSING_JAYWALK");
      const advancesAcrossCrosswalk =
        pedestrian.state !== "WAITING" &&
        pedestrianPosePositionChanged(pedestrian, candidate);
      if (beginsCrossing || advancesAcrossCrosswalk) {
        target = candidate;
        targetTick = candidateFrame.tick;
        break;
      }
    }
    if (target === undefined || targetTick === undefined) {
      continue;
    }
    const moveStartTick = targetTick - ticksPerCell;
    transitions.push({
      id: pedestrian.id,
      from: pedestrian,
      to: target,
      alpha: Math.max(
        0,
        Math.min(1, (logicalTick - moveStartTick) / ticksPerCell),
      ),
    });
  }
  return transitions;
}

function pedestrianPosePositionChanged(
  from: ReplayPedestrianPose,
  to: ReplayPedestrianPose,
): boolean {
  return (
    from.x !== to.x ||
    from.z !== to.z ||
    from.worldSpace !== to.worldSpace
  );
}

export function activeEvent(
  state: PlaybackState,
  context: PlaybackContext,
): ReplayEvent | undefined {
  return context.events[state.eventCursor];
}

function consumeMarkersThroughCursor(
  state: PlaybackState,
  context: PlaybackContext,
): PlaybackState {
  const consumed = new Set(state.consumedMarkerIds);
  for (const [index, event] of context.events.entries()) {
    if (index > state.eventCursor) {
      break;
    }
    if (DECISION_MARKER_KINDS.has(event.kind)) {
      consumed.add(event.id);
    }
  }
  return { ...state, consumedMarkerIds: [...consumed] };
}

function frameIndexForTick(
  frames: readonly ReplayFrame[],
  tick: number,
): number {
  if (frames.length === 0) {
    return 0;
  }
  let best = 0;
  for (const [index, frame] of frames.entries()) {
    if (frame.tick <= tick) {
      best = index;
    } else {
      break;
    }
  }
  return best;
}

function lastEventIndexAtOrBeforeTick(
  events: readonly ReplayEvent[],
  tick: number,
): number {
  let cursor = -1;
  for (const [index, event] of events.entries()) {
    if (event.tick <= tick) {
      cursor = index;
    } else {
      break;
    }
  }
  return cursor;
}

function nextFrameTick(context: PlaybackContext, state: PlaybackState): number {
  return context.frames[state.frameIndex + 1]?.tick ?? Number.POSITIVE_INFINITY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pinDepartureLedger(
  from: ReplayVehiclePose,
  blended: ReplayVehiclePose,
): ReplayVehiclePose {
  const rest = omitLedger(blended);
  if (from.score === undefined) {
    return rest;
  }
  return {
    ...rest,
    score: from.score,
    ...(from.scorePhase === undefined ? {} : { scorePhase: from.scorePhase }),
  };
}

function omitLedger(
  pose: ReplayVehiclePose,
): Omit<ReplayVehiclePose, "score" | "scorePhase"> {
  const copy: Omit<ReplayVehiclePose, "score" | "scorePhase"> & {
    score?: ReplayVehiclePose["score"];
    scorePhase?: ReplayVehiclePose["scorePhase"];
  } = { ...pose };
  delete copy.score;
  delete copy.scorePhase;
  return copy;
}
