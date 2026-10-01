import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import {
  transactAdmissions,
  vehicleOccupationTimeline,
} from "../src/core/safety.js";

function world(): SimulationEngine {
  return new SimulationEngine({
    network: createRoadNetwork(),
    seed: 1,
    dynamics: {
      crosswalkModulus: 1_000_000,
      stallModulus: 1_000_000,
      creepAfterWaitingTicks: 100,
    },
  });
}

describe("network safety semantics", () => {
  it("admits same-approach straight and right-turn heads together", () => {
    const engine = world();
    const straight = engine.spawnVehicle("S_S1_STRAIGHT", "SEDAN");
    const right = engine.spawnVehicle("S_R1_RIGHT", "SEDAN");
    expect(straight).toBeDefined();
    expect(right).toBeDefined();
    if (straight === undefined || right === undefined) {
      return;
    }
    for (
      let tick = 0;
      tick < 40 &&
      (straight.state !== "AT_STOPLINE" || right.state !== "AT_STOPLINE");
      tick += 1
    ) {
      engine.step();
    }

    const dryRun = engine.dryRunAdmissions([straight.id, right.id]);
    expect(dryRun.conflictDetected).toBeUndefined();
    expect(dryRun.batch.admittedVehicleIds).toEqual([straight.id, right.id]);
  });

  it("checks a crosswalk only while the vehicle body covers its entry zone", () => {
    const engine = world();
    const right = engine.spawnVehicle("N_R1_RIGHT", "SEDAN");
    expect(right).toBeDefined();
    if (right === undefined) {
      return;
    }
    for (let tick = 0; tick < 40 && right.state !== "AT_STOPLINE"; tick += 1) {
      engine.step();
    }
    const laneHeads = new Map([[right.inboundLaneId, right.id]]);
    const currentTick = engine.currentTick;
    const request = (blockedTick: number) =>
      transactAdmissions(
        [right.id],
        currentTick,
        engine.vehicles,
        laneHeads,
        engine.network,
        new Map(),
        {
          controlResourceBlocked: (resourceId, _routeId, tick) =>
            resourceId === "CROSSWALK:NORTH" && tick === blockedTick,
        },
      );

    expect(request(currentTick).batch.results[0]?.reason).toBe("CROSSWALK");
    const trajectory = engine.network.trajectories.get(right.routeId);
    expect(trajectory).toBeDefined();
    const lastCoveredOffset = Math.max(
      ...(trajectory === undefined
        ? [0]
        : vehicleOccupationTimeline(right, trajectory.slots)
            .filter((step) =>
              step.controlResourceIds.has("CROSSWALK:NORTH"),
            )
            .map((step) => step.tickOffset)),
    );
    expect(
      request(currentTick + lastCoveredOffset + 1).batch.admittedVehicleIds,
    ).toEqual([right.id]);
  });

  it("makes a normal pedestrian timeline conflict with vehicle reservations", () => {
    const engine = world();
    const right = engine.spawnVehicle("N_R1_RIGHT", "SEDAN");
    expect(right).toBeDefined();
    if (right === undefined) {
      return;
    }
    for (let tick = 0; tick < 40 && right.state !== "AT_STOPLINE"; tick += 1) {
      engine.step();
    }
    const pedestrian = engine.spawnScheduledPedestrian({
      id: "reserved-pedestrian",
      tick: engine.currentTick,
      slot: 0,
      crosswalkId: "CROSSWALK:NORTH",
      direction: "A_TO_B",
    });
    expect(pedestrian).toBeDefined();
    if (
      pedestrian?.targetWaitingCellId === undefined ||
      pedestrian.targetWaitingSubslot === undefined
    ) {
      return;
    }
    pedestrian.state = "WAITING";
    pedestrian.waitingCellId = pedestrian.targetWaitingCellId;
    pedestrian.waitingSubslot = pedestrian.targetWaitingSubslot;
    expect(
      engine.grantPedestrianPhase("CROSSWALK:NORTH", ["A_TO_B"]).ok,
    ).toBe(true);

    const preview = engine.dryRunAdmissions([right.id]);
    expect(preview.feasible).toBe(false);
    expect(preview.conflictDetected?.conflictingVehicles).toContain(
      pedestrian?.id,
    );
    expect(preview.conflictDetected?.conflictResourceId).toMatch(
      /^CROSSWALK:NORTH:CELL:/,
    );
  });
});
