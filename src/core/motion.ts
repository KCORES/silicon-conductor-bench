import type {
  Maneuver,
  SpeedProfile,
  Vehicle,
} from "./types.js";
import { vehicleClass } from "./vehicleRoster.js";

export interface MotionState {
  readonly speedProfile: SpeedProfile;
  readonly motionCreditHalfSlots: number;
  readonly slowMovesDone: number;
}

export interface VehicleMotion {
  readonly effectiveSpeedProfile: SpeedProfile;
  readonly displacement: 0 | 1 | 2;
  readonly nextMotionCreditHalfSlots: number;
  readonly nextSlowMovesDone: number;
}

export interface RollingEntryMotionState {
  readonly motionCreditHalfSlots: number;
  readonly slowMovesDone: number;
}

const PROFILE_RANK: Readonly<Record<SpeedProfile, number>> = {
  SLOW_SLIDE: 0,
  CRUISE: 1,
  BURST: 2,
};

const HALF_SLOTS_PER_TICK: Readonly<Record<SpeedProfile, number>> = {
  SLOW_SLIDE: 1,
  CRUISE: 2,
  BURST: 3,
};

export function normalizeSpeedProfile(
  profile: SpeedProfile | undefined,
): SpeedProfile {
  return profile ?? "CRUISE";
}

export function slowerSpeedProfile(
  requested: SpeedProfile,
  limit: SpeedProfile,
): SpeedProfile {
  return PROFILE_RANK[requested] <= PROFILE_RANK[limit] ? requested : limit;
}

export function effectiveVehicleSpeedProfile(
  vehicle: Pick<Vehicle, "type" | "speedProfile" | "slowMovesDone">,
  maneuver: Maneuver,
  slowStartSteps: number,
): SpeedProfile {
  const kind = vehicleClass(vehicle.type);
  const heavy = kind === "truck" || kind === "bus";
  const physicallySlow =
    heavy &&
    (maneuver !== "STRAIGHT" ||
      vehicle.slowMovesDone < Math.max(0, Math.trunc(slowStartSteps)));
  return physicallySlow
    ? slowerSpeedProfile(normalizeSpeedProfile(vehicle.speedProfile), "SLOW_SLIDE")
    : normalizeSpeedProfile(vehicle.speedProfile);
}

/**
 * Purely previews one physical tick. The returned state can either be fed into
 * another preview or committed to the vehicle by commitVehicleMotion.
 */
export function previewVehicleMotion(
  vehicle: Pick<
    Vehicle,
    | "type"
    | "speedProfile"
    | "motionCreditHalfSlots"
    | "slowMovesDone"
  >,
  maneuver: Maneuver,
  slowStartSteps: number,
): VehicleMotion {
  const effectiveSpeedProfile = effectiveVehicleSpeedProfile(
    vehicle,
    maneuver,
    slowStartSteps,
  );
  const credit =
    Math.max(0, Math.trunc(vehicle.motionCreditHalfSlots ?? 0)) +
    HALF_SLOTS_PER_TICK[effectiveSpeedProfile];
  const displacement = Math.min(2, Math.floor(credit / 2)) as 0 | 1 | 2;
  const heavy = ["truck", "bus"].includes(vehicleClass(vehicle.type));
  const cappedStraightStart =
    heavy &&
    maneuver === "STRAIGHT" &&
    vehicle.slowMovesDone < Math.max(0, Math.trunc(slowStartSteps));

  return {
    effectiveSpeedProfile,
    displacement,
    nextMotionCreditHalfSlots: credit % 2,
    nextSlowMovesDone:
      vehicle.slowMovesDone + (cappedStraightStart ? displacement : 0),
  };
}

export function rollingEntryMotionState(
  vehicle: Pick<
    Vehicle,
    | "type"
    | "speedProfile"
    | "motionCreditHalfSlots"
    | "slowMovesDone"
  >,
  maneuver: Maneuver,
  slowStartSteps: number,
): RollingEntryMotionState {
  const heavy = ["truck", "bus"].includes(vehicleClass(vehicle.type));
  const slowMovesDone =
    heavy && maneuver === "STRAIGHT"
      ? Math.max(vehicle.slowMovesDone, Math.max(0, Math.trunc(slowStartSteps)))
      : vehicle.slowMovesDone;
  const effectiveProfile = effectiveVehicleSpeedProfile(
    { ...vehicle, slowMovesDone },
    maneuver,
    slowStartSteps,
  );
  return {
    motionCreditHalfSlots:
      effectiveProfile === "SLOW_SLIDE"
        ? Math.max(1, vehicle.motionCreditHalfSlots)
        : vehicle.motionCreditHalfSlots,
    slowMovesDone,
  };
}

export function commitVehicleMotion(
  vehicle: Vehicle,
  motion: VehicleMotion,
): void {
  vehicle.motionCreditHalfSlots = motion.nextMotionCreditHalfSlots;
  vehicle.slowMovesDone = motion.nextSlowMovesDone;
  // Keep the legacy phase observable in sync while motion uses one accumulator.
  vehicle.slowPhase += 1;
}

export function sweptHeadSlots(
  fromHeadSlot: number,
  displacement: number,
): number[] {
  return Array.from(
    { length: Math.max(0, Math.trunc(displacement)) + 1 },
    (_, index) => fromHeadSlot + index,
  );
}
