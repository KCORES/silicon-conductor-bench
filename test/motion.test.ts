import { describe, expect, it } from "vitest";
import {
  commitVehicleMotion,
  previewVehicleMotion,
  rollingEntryMotionState,
} from "../src/core/motion.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import { vehicleOccupationTimeline } from "../src/core/safety.js";
import type {
  SpeedProfile,
  TrajectorySlot,
  Vehicle,
  VehicleType,
} from "../src/core/types.js";

describe("speed motion", () => {
  it.each([
    ["SLOW_SLIDE", [0, 1, 0, 1]],
    ["CRUISE", [1, 1, 1, 1]],
    ["BURST", [1, 2, 1, 2]],
  ] as const)("advances %s with integer half-slot credit", (profile, expected) => {
    const vehicle = motionVehicle(profile);
    const actual = expected.map(() => {
      const motion = previewVehicleMotion(vehicle, "STRAIGHT", 0);
      commitVehicleMotion(vehicle, motion);
      return motion.displacement;
    });
    expect(actual).toEqual(expected);
  });

  it("uses one slow cap for heavy starts and turns without quarter speed", () => {
    const straight = motionVehicle(
      "BURST",
      "kenney-cars:delivery",
    );
    const startDisplacements = Array.from({ length: 5 }, () => {
      const motion = previewVehicleMotion(straight, "STRAIGHT", 2);
      commitVehicleMotion(straight, motion);
      return motion.displacement;
    });
    expect(startDisplacements).toEqual([0, 1, 0, 1, 1]);

    const turning = motionVehicle(
      "SLOW_SLIDE",
      "kenney-cars:delivery",
    );
    const turnDisplacements = Array.from({ length: 4 }, () => {
      const motion = previewVehicleMotion(turning, "LEFT", 2);
      commitVehicleMotion(turning, motion);
      return motion.displacement;
    });
    expect(turnDisplacements).toEqual([0, 1, 0, 1]);
  });

  it("reserves current, intermediate, and target body resources for BURST", () => {
    const vehicle = fullVehicle("BURST", 2);
    const slots: TrajectorySlot[] = Array.from({ length: 8 }, (_, index) => ({
      slotId: `slot:${index}`,
      index,
      x: index,
      y: 0,
      conflictResourceIds: [`resource:${index}`],
      controlResourceIds: [],
    }));
    const timeline = vehicleOccupationTimeline(vehicle, slots);

    expect([...timeline[0]!.resourceIds].sort()).toEqual([
      "resource:0",
      "resource:1",
    ]);
    expect([...timeline[1]!.resourceIds].sort()).toEqual([
      "resource:0",
      "resource:1",
      "resource:2",
      "resource:3",
    ]);
  });

  it("preserves movement when a scheduled follower rolls into the crossing", () => {
    const turningTruck = motionVehicle(
      "CRUISE",
      "kenney-cars:delivery",
    );
    Object.assign(
      turningTruck,
      rollingEntryMotionState(turningTruck, "LEFT", 2),
    );
    expect(previewVehicleMotion(turningTruck, "LEFT", 2).displacement).toBe(1);

    const straightTruck = motionVehicle(
      "CRUISE",
      "kenney-cars:delivery",
    );
    Object.assign(
      straightTruck,
      rollingEntryMotionState(straightTruck, "STRAIGHT", 2),
    );
    expect(straightTruck.slowMovesDone).toBe(2);
    expect(
      previewVehicleMotion(straightTruck, "STRAIGHT", 2).displacement,
    ).toBe(1);
  });

  it("commits a normalized batch profile and executes the previewed motion", () => {
    const world = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: {
        stallModulus: 1_000_000,
        exitHoldModulus: 1_000_000,
        crosswalkModulus: 1_000_000,
      },
    });
    const vehicle = world.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    expect(vehicle).toBeDefined();
    if (vehicle === undefined) {
      return;
    }
    stepUntil(world, () => vehicle.state === "AT_STOPLINE");
    const result = world.applyAdmissionPlan(
      [],
      [{
        laneId: vehicle.inboundLaneId,
        topN: 1,
        speedProfile: "BURST",
      }],
    );
    expect(result.enterPlan?.[0]?.speedProfile).toBe("BURST");
    expect(vehicle.speedProfile).toBe("BURST");

    const origin = vehicle.trajectoryHeadSlot;
    world.step();
    expect(vehicle.trajectoryHeadSlot - origin).toBe(1);
    world.step();
    expect(vehicle.trajectoryHeadSlot - origin).toBe(3);
  });
});

function motionVehicle(
  speedProfile: SpeedProfile,
  type: VehicleType = "SEDAN",
): Vehicle {
  return fullVehicle(speedProfile, 1, type);
}

function fullVehicle(
  speedProfile: SpeedProfile,
  lengthSlots: number,
  type: VehicleType = "SEDAN",
): Vehicle {
  return {
    id: "vehicle",
    type,
    lengthSlots,
    intentRouteId: "N_S1_STRAIGHT",
    inboundLaneId: "IN_N_S1_STRAIGHT",
    outboundLaneId: "OUT_S_S1_STRAIGHT",
    routeId: "N_S1_STRAIGHT",
    state: "CROSSING",
    inboundHeadSlot: 0,
    trajectoryHeadSlot: lengthSlots - 1,
    outboundHeadSlot: -1,
    waitingTicks: 0,
    stationaryTicks: 0,
    generatedAtTick: 0,
    startupLagRemaining: 0,
    slowMovesDone: 0,
    slowPhase: 0,
    speedProfile,
    motionCreditHalfSlots: 0,
    encroaching: false,
    stallChecked: false,
    stallBlockedTicks: 0,
    driverPatienceLimit: 60,
    driverWaitTicks: 0,
  };
}

function stepUntil(
  world: SimulationEngine,
  predicate: () => boolean,
  limit = 80,
): void {
  for (let tick = 0; tick < limit; tick += 1) {
    if (predicate()) {
      return;
    }
    world.step();
  }
  throw new Error("Condition was not reached");
}
