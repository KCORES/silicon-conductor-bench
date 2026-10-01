import type {
  CollisionOutcome,
  PedestrianCollisionOutcome,
  VehicleCollisionOutcome,
} from "../core/types.js";

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

export function vehicleCollisionVisual(
  outcome: CollisionOutcome,
  vehicle: VehicleCollisionOutcome,
  logicalTick: number,
): VehicleCollisionVisual {
  const progress = motionProgress(
    logicalTick,
    outcome.impactTick,
    vehicle.slideTicks,
  );
  const eased = 1 - Math.pow(1 - progress, 3);
  return {
    x: vehicle.impulse.x * eased,
    z: vehicle.impulse.z * eased,
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
    outcome.impactTick,
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
