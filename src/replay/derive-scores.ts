import { vehicleClass } from "../core/vehicleRoster.js";
import type { VehicleType } from "../core/types.js";
import { VehicleLedger } from "./vehicle-ledger.js";
import type {
  ReplayBundle,
  ReplayFrame,
  ReplayLaneGeometry,
  ReplayVehiclePose,
} from "./types.js";

/** Published economy defaults used when an older replay has no per-vehicle scores. */
const NORMAL_DELAY_PER_TICK = 0.02;
const EMERGENCY_DELAY_PER_TICK = 0.15;
const WAITING_CHARGE_GRACE_TICKS = 10;
const DELAY_CHARGE_HORIZON_SLOTS = 24;
const EMERGENCY_CHARGE_HORIZON_SLOTS = 12;
const TOLL_MOTORCYCLE = 20;
const TOLL_STANDARD = 50;
const TOLL_EMERGENCY = 100;

/**
 * Fills score and scorePhase for replays recorded before the vehicle ledger.
 * Charges follow the queued/emergency rules and skip the stall chain, which is
 * not stored on a pose. Recorded scores are left untouched.
 */
export function withDerivedVehicleScores(bundle: ReplayBundle): ReplayBundle {
  const recorded = bundle.frames.some((frame) =>
    frame.vehicles.some((vehicle) => vehicle.score !== undefined),
  );
  if (recorded) {
    return bundle;
  }

  const ledger = new VehicleLedger();
  const stationaryTicks = new Map<string, number>();
  const frames = bundle.frames.map((frame, index) => {
    const previous = bundle.frames[index - 1];
    if (
      previous !== undefined &&
      frame.phase === "tick" &&
      frame.tick > bundle.warmupTicks
    ) {
      ledger.applyCharges(
        previous.vehicles.flatMap((vehicle) => {
          const amount = waitingCharge(
            vehicle,
            stationaryTicks.get(vehicle.id) ?? 0,
            bundle.scene.inboundLanes,
          );
          return amount > 0 ? [{ vehicleId: vehicle.id, amount }] : [];
        }),
      );
      ledger.settleOutbound(
        frame.vehicles.filter((vehicle) => {
          if (vehicle.state !== "OUTBOUND") {
            return false;
          }
          const prior = previous.vehicles.find((item) => item.id === vehicle.id);
          return prior?.state !== "OUTBOUND";
        }),
        tollFor,
      );
    }
    updateStationaryTicks(frame, previous, stationaryTicks);
    return stampFrame(frame, ledger);
  });
  return { ...bundle, frames };
}

function stampFrame(frame: ReplayFrame, ledger: VehicleLedger): ReplayFrame {
  return {
    ...frame,
    vehicles: frame.vehicles.map((vehicle) => {
      const score = ledger.scoreFor(vehicle.id);
      if (score === undefined) {
        return vehicle;
      }
      return {
        ...vehicle,
        score: score.score,
        scorePhase: score.scorePhase,
      };
    }),
  };
}

function waitingCharge(
  pose: ReplayVehiclePose,
  stationaryTicks: number,
  inboundLanes: readonly ReplayLaneGeometry[],
): number {
  if (
    !isWaitingState(pose.state) ||
    stationaryTicks < WAITING_CHARGE_GRACE_TICKS
  ) {
    return 0;
  }
  const distance = distanceToStopline(pose, inboundLanes);
  if (distance === null || distance > DELAY_CHARGE_HORIZON_SLOTS) {
    return 0;
  }
  return vehicleClass(pose.type) === "emergency" &&
    distance <= EMERGENCY_CHARGE_HORIZON_SLOTS
      ? EMERGENCY_DELAY_PER_TICK
      : NORMAL_DELAY_PER_TICK;
}

function isWaitingState(state: ReplayVehiclePose["state"]): boolean {
  return state === "QUEUED" || state === "AT_STOPLINE" || state === "STALLED";
}

function distanceToStopline(
  pose: ReplayVehiclePose,
  inboundLanes: readonly ReplayLaneGeometry[],
): number | null {
  const lane = inboundLanes.find((item) => item.id === pose.inboundLaneId);
  if (lane === undefined) {
    return null;
  }
  const headSlot = lane.slots.findIndex(
    (slot) => Math.abs(slot.x - pose.x) < 1e-6 && Math.abs(slot.z - pose.z) < 1e-6,
  );
  return headSlot < 0 ? null : lane.slots.length - 1 - headSlot;
}

function updateStationaryTicks(
  frame: ReplayFrame,
  previous: ReplayFrame | undefined,
  stationaryTicks: Map<string, number>,
): void {
  const previousById = new Map(
    previous?.vehicles.map((vehicle) => [vehicle.id, vehicle]) ?? [],
  );
  const activeIds = new Set(frame.vehicles.map((vehicle) => vehicle.id));
  for (const id of stationaryTicks.keys()) {
    if (!activeIds.has(id)) {
      stationaryTicks.delete(id);
    }
  }
  for (const vehicle of frame.vehicles) {
    const prior = previousById.get(vehicle.id);
    if (
      prior === undefined ||
      prior.x !== vehicle.x ||
      prior.z !== vehicle.z
    ) {
      stationaryTicks.set(vehicle.id, 0);
      continue;
    }
    if (frame.phase === "tick") {
      stationaryTicks.set(vehicle.id, (stationaryTicks.get(vehicle.id) ?? 0) + 1);
    }
  }
}

function tollFor(type: VehicleType): number {
  if (type === "MOTORCYCLE") {
    return TOLL_MOTORCYCLE;
  }
  return vehicleClass(type) === "emergency"
    ? TOLL_EMERGENCY
    : TOLL_STANDARD;
}
