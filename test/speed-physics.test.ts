import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import { resourcesCoveredByVehicle } from "../src/core/safety.js";
import type {
  SpeedProfile,
  Trajectory,
  Vehicle,
} from "../src/core/types.js";

const TEST_SEEDS = [7, 23, 91] as const;

describe("variable-speed integration", () => {
  it.each(TEST_SEEDS)(
    "separates conflicting flows with BURST/SLOW_SLIDE at seed %i",
    (seed) => {
      const safe = crossingScenario(seed, "BURST", "SLOW_SLIDE");
      expect(safe.preview.feasible).toBe(true);
      expect(safe.preview.admission.conflictDetected).toBeUndefined();
      const committed = safe.engine.commitSchedule(
        [safe.second.id],
        [],
        [],
        [{ vehicleId: safe.second.id, speedProfile: "SLOW_SLIDE" }],
      );
      expect(committed.committed).toBe(true);
      drive(safe.engine, 60);
      expect(safe.engine.incidentSummaries()).toEqual([]);

      const unsafe = crossingScenario(seed, "CRUISE", "CRUISE");
      expect(unsafe.preview.feasible).toBe(false);
      expect(unsafe.preview.admission.conflictDetected).toEqual(
        expect.objectContaining({
          conflictResourceId: expect.any(String),
          conflictingVehicles: expect.arrayContaining([
            unsafe.first.id,
            unsafe.second.id,
          ]),
        }),
      );
      const reckless = unsafe.engine.commitSchedule(
        [unsafe.second.id],
        [],
        [],
        [{ vehicleId: unsafe.second.id, speedProfile: "CRUISE" }],
      );
      expect(reckless.committed).toBe(true);
      const interrupt = driveUntilInterrupt(unsafe.engine);
      expect(interrupt).toContain("ACCIDENT_INTERRUPT");
      expect(unsafe.engine.incidentSummaries()[0]?.vehicleIds).toEqual(
        expect.arrayContaining([unsafe.first.id, unsafe.second.id]),
      );
    },
  );

  it("stops a long BURST vehicle on a swept incident resource", () => {
    const crash = crossingScenario(41, "CRUISE", "CRUISE");
    crash.engine.commitSchedule(
      [crash.second.id],
      [],
      [],
      [{ vehicleId: crash.second.id, speedProfile: "CRUISE" }],
    );
    driveUntilInterrupt(crash.engine);
    const incident = crash.engine.incidentSummaries()[0];
    expect(incident).toBeDefined();
    if (incident === undefined) {
      return;
    }

    const vehicle = mustSpawn(
      crash.engine,
      "S_S1_STRAIGHT",
      "kenney-cars:delivery",
    );
    const placement = findSweptIncidentPlacement(
      crash.engine,
      vehicle,
      new Set(incident.lockedResourceIds),
    );
    expect(placement).toBeDefined();
    if (placement === undefined) {
      return;
    }
    placeCrossingVehicle(vehicle, placement.trajectory, placement.headSlot);
    vehicle.speedProfile = "BURST";
    vehicle.motionCreditHalfSlots = 1;
    vehicle.slowMovesDone = crash.engine.dynamics.slowStartSteps;
    const before = vehicle.trajectoryHeadSlot;

    const result = crash.engine.step();

    expect(result.interruptReason).toContain("secondary=true");
    expect(vehicle.state).toBe("ACCIDENT_STOPPED");
    expect(vehicle.trajectoryHeadSlot).toBe(before);
    expect(
      crash.engine
        .incidentSummaries()
        .some((summary) => summary.vehicleIds.includes(vehicle.id)),
    ).toBe(true);
  });

  it("stops a long BURST vehicle before it sweeps through a pedestrian", () => {
    const engine = createEngine(53);
    const crossing = findStraightCrosswalkSlot(engine);
    expect(crossing).toBeDefined();
    if (crossing === undefined) {
      return;
    }
    const vehicle = mustSpawn(
      engine,
      crossing.trajectory.id,
      "kenney-cars:delivery",
    );
    placeCrossingVehicle(
      vehicle,
      crossing.trajectory,
      crossing.targetSlot - 2,
    );
    vehicle.speedProfile = "BURST";
    vehicle.motionCreditHalfSlots = 1;
    vehicle.slowMovesDone = engine.dynamics.slowStartSteps;
    expect(
      resourcesCoveredByVehicle(vehicle, crossing.trajectory.slots),
    ).not.toContain(crossing.resourceId);

    const pedestrian = engine.spawnScheduledPedestrian({
      id: "burst-swept-pedestrian",
      tick: engine.currentTick,
      slot: 0,
      crosswalkId: crossing.crosswalkId,
      direction: "A_TO_B",
    });
    expect(pedestrian).toBeDefined();
    if (pedestrian === undefined) {
      return;
    }
    pedestrian.state = "CROSSING_JAYWALK";
    pedestrian.row = crossing.row;
    pedestrian.column = crossing.column;
    pedestrian.nextMoveTick = engine.currentTick + 20;
    const before = vehicle.trajectoryHeadSlot;

    const result = engine.step();

    expect(result.interruptReason).toContain(pedestrian.id);
    expect(vehicle.state).toBe("ACCIDENT_STOPPED");
    expect(vehicle.trajectoryHeadSlot).toBe(before);
    expect(pedestrian.state).toBe("INJURED");
  });

  it("moves only to the last legal crossing pose when a BURST exit is full", () => {
    const engine = createEngine(67);
    const routeId = "N_S1_STRAIGHT";
    const trajectory = engine.network.trajectories.get(routeId);
    expect(trajectory).toBeDefined();
    if (trajectory === undefined) {
      return;
    }
    const vehicle = mustSpawn(engine, routeId, "kenney-cars:delivery");
    const blocker = mustSpawn(engine, "E_S1_STRAIGHT", "SEDAN");
    blocker.state = "OUTBOUND";
    blocker.outboundLaneId = trajectory.outboundLaneId;
    blocker.outboundHeadSlot = blocker.lengthSlots - 1;
    placeCrossingVehicle(
      vehicle,
      trajectory,
      trajectory.slots.length + vehicle.lengthSlots - 3,
    );
    vehicle.speedProfile = "BURST";
    vehicle.motionCreditHalfSlots = 1;
    vehicle.slowMovesDone = engine.dynamics.slowStartSteps;
    const before = vehicle.trajectoryHeadSlot;

    engine.step();

    expect(vehicle.state).toBe("EXIT_BLOCKED");
    expect(vehicle.trajectoryHeadSlot).toBe(before + 1);
    expect(vehicle.outboundHeadSlot).toBe(-1);
    expect(engine.incidentSummaries()).toEqual([]);
  });

  it.each(TEST_SEEDS)(
    "beats the CRUISE decision-window baseline without accidents at seed %i",
    (seed) => {
      const staggered = runDecisionWindow(
        seed,
        "BURST",
        "SLOW_SLIDE",
        false,
      );
      const cruise = runDecisionWindow(seed, "CRUISE", "CRUISE", false);
      const reckless = runDecisionWindow(seed, "CRUISE", "CRUISE", true);

      expect(staggered).toMatchObject({
        previewFeasible: true,
        completed: 2,
        incidents: 0,
      });
      expect(cruise).toMatchObject({
        previewFeasible: false,
        completed: 1,
        incidents: 0,
      });
      expect(staggered.completed).toBeGreaterThan(cruise.completed);
      expect(reckless.previewFeasible).toBe(false);
      expect(reckless.incidents).toBeGreaterThan(0);
    },
  );
});

function createEngine(seed: number): SimulationEngine {
  return new SimulationEngine({
    network: createRoadNetwork(),
    seed,
    dynamics: {
      stallModulus: 1_000_000,
      exitHoldModulus: 1_000_000,
      crosswalkModulus: 1_000_000,
      creepAfterWaitingTicks: 1_000,
    },
  });
}

function crossingScenario(
  seed: number,
  firstProfile: SpeedProfile,
  secondProfile: SpeedProfile,
) {
  const engine = createEngine(seed);
  const first = mustSpawn(engine, "E_S1_STRAIGHT", "MOTORCYCLE");
  const second = mustSpawn(engine, "N_S1_STRAIGHT", "MOTORCYCLE");
  stepUntil(
    engine,
    () => first.state === "AT_STOPLINE" && second.state === "AT_STOPLINE",
  );
  const firstCommit = engine.commitSchedule(
    [first.id],
    [],
    [],
    [{ vehicleId: first.id, speedProfile: firstProfile }],
  );
  if (!firstCommit.committed) {
    throw new Error("Failed to commit the first crossing vehicle");
  }
  drive(engine, 4);
  const preview = engine.dryRunSchedule(
    [second.id],
    [],
    [],
    undefined,
    [{ vehicleId: second.id, speedProfile: secondProfile }],
  );
  return { engine, first, second, preview };
}

function runDecisionWindow(
  seed: number,
  firstProfile: SpeedProfile,
  secondProfile: SpeedProfile,
  forceUnsafe: boolean,
) {
  const scenario = crossingScenario(seed, firstProfile, secondProfile);
  if (scenario.preview.feasible || forceUnsafe) {
    scenario.engine.commitSchedule(
      [scenario.second.id],
      [],
      [],
      [{ vehicleId: scenario.second.id, speedProfile: secondProfile }],
    );
  }
  let completed = 0;
  for (let tick = 0; tick < 60; tick += 1) {
    completed += scenario.engine.step().despawnEvents.length;
  }
  return {
    previewFeasible: scenario.preview.feasible,
    completed,
    incidents: scenario.engine.incidentSummaries().length,
  };
}

function findSweptIncidentPlacement(
  engine: SimulationEngine,
  vehicle: Vehicle,
  locked: ReadonlySet<string>,
): { trajectory: Trajectory; headSlot: number } | undefined {
  for (const trajectory of engine.network.trajectories.values()) {
    if (trajectory.maneuver !== "STRAIGHT") {
      continue;
    }
    for (
      let headSlot = vehicle.lengthSlots - 1;
      headSlot + 2 < trajectory.slots.length;
      headSlot += 1
    ) {
      const current = new Set(
        resourcesCoveredByVehicle(
          { ...vehicle, routeId: trajectory.id, trajectoryHeadSlot: headSlot },
          trajectory.slots,
        ),
      );
      const swept = [headSlot + 1, headSlot + 2].flatMap((nextHead) =>
        resourcesCoveredByVehicle(
          {
            ...vehicle,
            routeId: trajectory.id,
            trajectoryHeadSlot: nextHead,
          },
          trajectory.slots,
        ),
      );
      if (
        [...current].every((resourceId) => !locked.has(resourceId)) &&
        swept.some((resourceId) => locked.has(resourceId))
      ) {
        return { trajectory, headSlot };
      }
    }
  }
  return undefined;
}

function findStraightCrosswalkSlot(engine: SimulationEngine):
  | {
      trajectory: Trajectory;
      targetSlot: number;
      crosswalkId: string;
      resourceId: string;
      row: 0 | 1;
      column: number;
    }
  | undefined {
  for (const crosswalk of engine.network.crosswalks.values()) {
    for (const cell of crosswalk.cells) {
      for (const slotId of cell.vehicleSlotIds) {
        const separator = slotId.lastIndexOf(":");
        const routeId = slotId.slice(0, separator);
        const trajectory = engine.network.trajectories.get(routeId);
        if (trajectory?.maneuver !== "STRAIGHT") {
          continue;
        }
        return {
          trajectory,
          targetSlot: Number(slotId.slice(separator + 1)),
          crosswalkId: crosswalk.id,
          resourceId: cell.conflictResourceId,
          row: cell.row,
          column: cell.column,
        };
      }
    }
  }
  return undefined;
}

function placeCrossingVehicle(
  vehicle: Vehicle,
  trajectory: Trajectory,
  headSlot: number,
): void {
  vehicle.routeId = trajectory.id;
  vehicle.inboundLaneId = trajectory.inboundLaneId;
  vehicle.outboundLaneId = trajectory.outboundLaneId;
  vehicle.state = "CROSSING";
  vehicle.trajectoryHeadSlot = headSlot;
  vehicle.outboundHeadSlot = -1;
}

function mustSpawn(
  engine: SimulationEngine,
  routeId: string,
  type: Vehicle["type"],
): Vehicle {
  const vehicle = engine.spawnVehicle(routeId, type);
  if (vehicle === undefined) {
    throw new Error(`Failed to spawn ${type} on ${routeId}`);
  }
  return vehicle;
}

function drive(engine: SimulationEngine, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    engine.step();
  }
}

function driveUntilInterrupt(
  engine: SimulationEngine,
  limit = 40,
): string {
  for (let tick = 0; tick < limit; tick += 1) {
    const interrupt = engine.step().interruptReason;
    if (interrupt !== undefined) {
      return interrupt;
    }
  }
  throw new Error("Expected a deterministic accident interrupt");
}

function stepUntil(
  engine: SimulationEngine,
  predicate: () => boolean,
  limit = 80,
): void {
  for (let tick = 0; tick < limit; tick += 1) {
    if (predicate()) {
      return;
    }
    engine.step();
  }
  throw new Error("Condition was not reached");
}
