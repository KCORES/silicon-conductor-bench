import type {
  CollisionOutcome,
  CollisionVector,
  PedestrianCollisionOutcome,
  VehicleCollisionOutcome,
} from "../core/types.js";

const PEDESTRIAN_BODY_RADIUS = 0.22;
const MAX_STRIKE_LUNGE_CELLS = 1.5;
const MAX_STRIKE_LUNGE_TICKS = 1.5;

export interface PedestrianStrikeLunge {
  readonly offset: CollisionVector;
  readonly ticks: number;
}

export interface VehicleCollisionVisual {
  readonly x: number;
  readonly z: number;
  readonly yawProgress: number;
  readonly pitch: number;
  readonly settled: boolean;
}

export interface PedestrianCollisionVisual {
  readonly x: number;
  readonly z: number;
  readonly motionProgress: number;
  readonly heading: number;
  readonly fallProgress: number;
  readonly animationProgress: number;
  readonly settled: boolean;
}

export function collisionAlignmentRetention(
  state: string,
): number {
  return state === "ACCIDENT_STOPPED" || state === "EVACUATING" ? 1 : 0;
}

/**
 * A vehicle that hits a pedestrian is resolved one cell short of them, so the
 * replay lets the striking vehicle coast at its pre-impact speed until its
 * body reaches the pedestrian, and delays the pedestrian fall by that time.
 */
export function pedestrianStrikeLunge(
  outcome: CollisionOutcome,
): PedestrianStrikeLunge | undefined {
  const vehicle = outcome.vehicles[0];
  if (
    outcome.vehicles.length !== 1 ||
    vehicle === undefined ||
    outcome.pedestrians.length === 0
  ) {
    return undefined;
  }
  const speed = Math.hypot(
    vehicle.preImpactVelocity.x,
    vehicle.preImpactVelocity.z,
  );
  if (speed < 1e-6) {
    return undefined;
  }
  const direction = {
    x: vehicle.preImpactVelocity.x / speed,
    z: vehicle.preImpactVelocity.z / speed,
  };
  let gap = Number.POSITIVE_INFINITY;
  for (const pedestrian of outcome.pedestrians) {
    const start = pedestrianImpactStart(pedestrian);
    const contact = pedestrian.contactPoint ?? outcome.contactPoint;
    gap = Math.min(
      gap,
      (start.x - contact.x) * direction.x +
        (start.z - contact.z) * direction.z -
        PEDESTRIAN_BODY_RADIUS,
    );
  }
  if (!Number.isFinite(gap) || gap <= 0.01) {
    return undefined;
  }
  const distance = Math.min(gap, MAX_STRIKE_LUNGE_CELLS);
  return {
    offset: { x: direction.x * distance, z: direction.z * distance },
    ticks: Math.min(distance / speed, MAX_STRIKE_LUNGE_TICKS),
  };
}

export function collisionSettleTick(
  outcome: CollisionOutcome,
  slideTicks: number,
): number {
  return (
    outcome.impactTick +
    slideTicks +
    (pedestrianStrikeLunge(outcome)?.ticks ?? 0)
  );
}

export function vehicleCollisionVisual(
  outcome: CollisionOutcome,
  vehicle: VehicleCollisionOutcome,
  logicalTick: number,
): VehicleCollisionVisual {
  const lunge = pedestrianStrikeLunge(outcome);
  const lungeTicks = lunge?.ticks ?? 0;
  const lungeProgress =
    lunge === undefined
      ? 0
      : clamp01((logicalTick - outcome.impactTick) / lungeTicks);
  const progress = motionProgress(
    logicalTick,
    outcome.impactTick + lungeTicks,
    vehicle.slideTicks,
  );
  const eased = 1 - Math.pow(1 - progress, 3);
  return {
    x: vehicle.impulse.x * eased + (lunge?.offset.x ?? 0) * lungeProgress,
    z: vehicle.impulse.z * eased + (lunge?.offset.z ?? 0) * lungeProgress,
    yawProgress: eased,
    pitch: Math.sin(progress * Math.PI) * damageAmount(outcome.severity) * 0.08,
    settled: progress >= 1,
  };
}

export function pedestrianCollisionVisual(
  outcome: CollisionOutcome,
  pedestrian: PedestrianCollisionOutcome,
  logicalTick: number,
): PedestrianCollisionVisual {
  const progress = motionProgress(
    logicalTick,
    outcome.impactTick + (pedestrianStrikeLunge(outcome)?.ticks ?? 0),
    pedestrian.slideTicks,
  );
  const eased = 1 - Math.pow(1 - progress, 3);
  const fallProgress = smoothstep(0.08, 0.78, progress);
  return {
    x: pedestrian.impulse.x * eased,
    z: pedestrian.impulse.z * eased,
    motionProgress: eased,
    heading: pedestrian.fallDirection,
    fallProgress,
    animationProgress: smoothstep(0, 0.82, progress),
    settled: progress >= 1,
  };
}

export function damageAmount(
  severity: CollisionOutcome["severity"],
): number {
  switch (severity) {
    case "MINOR":
      return 0.18;
    case "MODERATE":
      return 0.34;
    case "SERIOUS":
      return 0.58;
    case "CRITICAL":
      return 0.78;
  }
}

export function collisionOutcomeForVehicle(
  outcomes: readonly CollisionOutcome[],
  vehicleId: string,
): { outcome: CollisionOutcome; participant: VehicleCollisionOutcome } | undefined {
  for (let index = outcomes.length - 1; index >= 0; index -= 1) {
    const outcome = outcomes[index];
    const participant = outcome?.vehicles.find(
      (candidate) => candidate.vehicleId === vehicleId,
    );
    if (outcome !== undefined && participant !== undefined) {
      return { outcome, participant };
    }
  }
  return undefined;
}

export function collisionOutcomeForPedestrian(
  outcomes: readonly CollisionOutcome[],
  pedestrianId: string,
):
  | { outcome: CollisionOutcome; participant: PedestrianCollisionOutcome }
  | undefined {
  for (let index = outcomes.length - 1; index >= 0; index -= 1) {
    const outcome = outcomes[index];
    const participant = outcome?.pedestrians.find(
      (candidate) => candidate.pedestrianId === pedestrianId,
    );
    if (outcome !== undefined && participant !== undefined) {
      return { outcome, participant };
    }
  }
  return undefined;
}

export interface CollisionParticipantMatch<Participant> {
  readonly outcome: CollisionOutcome;
  readonly participant: Participant;
}

export interface CollisionOutcomeIndex {
  vehicle(
    vehicleId: string,
    logicalTick: number,
  ): CollisionParticipantMatch<VehicleCollisionOutcome> | undefined;
  pedestrian(
    pedestrianId: string,
    logicalTick: number,
  ): CollisionParticipantMatch<PedestrianCollisionOutcome> | undefined;
}

/**
 * Groups outcomes by participant while preserving event order.
 * Lookup returns the last event whose impactTick is at or before the
 * playback tick, matching a reverse scan of the original array.
 * Impact ticks are not sorted: a later event can record an earlier tick,
 * and that later event still wins.
 */
export function buildCollisionOutcomeIndex(
  outcomes: readonly CollisionOutcome[],
): CollisionOutcomeIndex {
  const vehicles = new Map<
    string,
    CollisionParticipantMatch<VehicleCollisionOutcome>[]
  >();
  const pedestrians = new Map<
    string,
    CollisionParticipantMatch<PedestrianCollisionOutcome>[]
  >();
  for (const outcome of outcomes) {
    for (const participant of outcome.vehicles) {
      const matches = vehicles.get(participant.vehicleId) ?? [];
      matches.push({ outcome, participant });
      vehicles.set(participant.vehicleId, matches);
    }
    for (const participant of outcome.pedestrians) {
      const matches = pedestrians.get(participant.pedestrianId) ?? [];
      matches.push({ outcome, participant });
      pedestrians.set(participant.pedestrianId, matches);
    }
  }
  return {
    vehicle: (vehicleId, logicalTick) =>
      latestMatch(vehicles.get(vehicleId), logicalTick),
    pedestrian: (pedestrianId, logicalTick) =>
      latestMatch(pedestrians.get(pedestrianId), logicalTick),
  };
}

function latestMatch<Participant>(
  matches: readonly CollisionParticipantMatch<Participant>[] | undefined,
  logicalTick: number,
): CollisionParticipantMatch<Participant> | undefined {
  if (matches === undefined) {
    return undefined;
  }
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (match !== undefined && match.outcome.impactTick <= logicalTick) {
      return match;
    }
  }
  return undefined;
}

function pedestrianImpactStart(
  pedestrian: PedestrianCollisionOutcome,
): CollisionVector {
  return {
    x: pedestrian.restPose.x - pedestrian.impulse.x,
    z: pedestrian.restPose.z - pedestrian.impulse.z,
  };
}

function motionProgress(
  logicalTick: number,
  impactTick: number,
  durationTicks: number,
): number {
  if (logicalTick <= impactTick) {
    return 0;
  }
  return clamp01((logicalTick - impactTick) / Math.max(1, durationTicks));
}

function smoothstep(start: number, end: number, value: number): number {
  const t = clamp01((value - start) / Math.max(1e-6, end - start));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
