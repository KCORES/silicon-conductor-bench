import { describe, expect, it } from "vitest";
import {
  nearestCollisionVehicle,
  solveCollisionOutcome,
  vehicleMassKg,
} from "../src/core/collisionKinematics.js";
import { createRoadNetwork } from "../src/core/network.js";
import type { Pedestrian, Vehicle } from "../src/core/types.js";
import { resolveVehicleOccupancy } from "../src/core/vehicleRoster.js";

function vehicle(
  id: string,
  routeId: string,
  type: Vehicle["type"] = "SEDAN",
): Vehicle {
  const network = createRoadNetwork();
  const trajectory = network.trajectories.get(routeId);
  if (trajectory === undefined) {
    throw new Error(`Missing trajectory ${routeId}`);
  }
  const head = Math.max(
    0,
    trajectory.slots.findIndex((slot) =>
      slot.conflictResourceIds.includes("SPACE:-3:-3"),
    ),
  );
  return {
    id,
    type,
    lengthSlots: resolveVehicleOccupancy(type).lengthSlots,
    intentRouteId: routeId,
    inboundLaneId: trajectory.inboundLaneId,
    outboundLaneId: trajectory.outboundLaneId,
    routeId,
    state: "CROSSING",
    inboundHeadSlot: 0,
    trajectoryHeadSlot: head,
    outboundHeadSlot: -1,
    waitingTicks: 0,
    stationaryTicks: 0,
    generatedAtTick: 0,
    startupLagRemaining: 0,
    slowMovesDone: 0,
    slowPhase: 0,
    speedProfile: "CRUISE",
    motionCreditHalfSlots: 0,
    encroaching: false,
    stallChecked: false,
    stallBlockedTicks: 0,
    driverPatienceLimit: 60,
    driverWaitTicks: 0,
  };
}

describe("deterministic collision kinematics", () => {
  it("selects the nearest wreck for each link in a same-lane pileup", () => {
    const network = createRoadNetwork();
    const at = (
      id: string,
      routeId: string,
      type: Vehicle["type"],
      x: number,
      z: number,
    ): Vehicle => {
      const result = vehicle(id, routeId, type);
      const trajectory = network.trajectories.get(routeId);
      const head = trajectory?.slots.findIndex(
        (slot) => slot.x === x && slot.y === z,
      );
      if (head === undefined || head < 0) {
        throw new Error(`Missing ${routeId} slot at ${x}:${z}`);
      }
      result.trajectoryHeadSlot = head;
      return result;
    };
    const lead = at(
      "V00117",
      "E_S2_STRAIGHT",
      "kenney-cars:taxi",
      -7,
      -2,
    );
    const first = at(
      "V00164",
      "E_S1_STRAIGHT",
      "city-builder:car_sedan",
      -6,
      -3,
    );
    const second = at(
      "V00170",
      "E_S1_STRAIGHT",
      "simplepoly-city:SUV",
      -3,
      -3,
    );
    const third = at(
      "V00179",
      "E_S1_STRAIGHT",
      "simplepoly-urban:SPW_Vehicle_Land_Car",
      0,
      -3,
    );

    expect(
      nearestCollisionVehicle(second, [lead, first], network)?.id,
    ).toBe(first.id);
    expect(
      nearestCollisionVehicle(third, [lead, first, second], network)?.id,
    ).toBe(second.id);
  });

  it("produces stable directional outcomes and locked rest cells", () => {
    const network = createRoadNetwork();
    const input = {
      tick: 42,
      resourceId: "SPACE:-3:-3",
      collisionType: "ANGLE_COLLISION" as const,
      severity: "SERIOUS" as const,
      vehicles: [
        vehicle("north", "N_S1_STRAIGHT"),
        vehicle("east", "E_S1_STRAIGHT"),
      ],
      pedestrians: [],
      network,
    };
    const first = solveCollisionOutcome(input);
    const second = solveCollisionOutcome(input);

    expect(second).toEqual(first);
    expect(Math.hypot(first.contactPoint.x + 3, first.contactPoint.z + 3)).toBeLessThan(
      0.5,
    );
    expect(first.contactPoint).not.toEqual({ x: -3, z: -3 });
    expect(first.vehicles).toHaveLength(2);
    expect(
      first.vehicles.every(
        (item) =>
          item.contactPoint.x === first.contactPoint.x &&
          item.contactPoint.z === first.contactPoint.z,
      ),
    ).toBe(true);
    expect(first.vehicles.every((item) => item.slideTicks > 0)).toBe(true);
    expect(
      first.vehicles.every(
        (item) =>
          item.massKg >= 1_000 &&
          item.impactEnergy > 0 &&
          item.dentRadius > 0 &&
          item.dentDepth > 0,
      ),
    ).toBe(true);
    expect(
      first.vehicles.every((item) =>
        item.hazardResourceIds.every((id) => id.startsWith("SPACE:")),
      ),
    ).toBe(true);
    expect(
      first.vehicles.every((item) => item.hazardResourceIds.length >= 4),
    ).toBe(true);
    expect(
      first.vehicles.some(
        (item) =>
          Math.abs(item.restPose.x - first.contactPoint.x) > 0.01 ||
          Math.abs(item.restPose.z - first.contactPoint.z) > 0.01,
      ),
    ).toBe(true);
  });

  it("samples vehicle mass deterministically inside its class range", () => {
    const sedan = vehicle("stable-sedan", "N_S1_STRAIGHT");
    const bus = vehicle(
      "stable-bus",
      "N_S1_STRAIGHT",
      "simplepoly-city:Bus",
    );

    expect(vehicleMassKg(sedan)).toBe(vehicleMassKg(sedan));
    expect(vehicleMassKg(sedan)).toBeGreaterThanOrEqual(1_000);
    expect(vehicleMassKg(sedan)).toBeLessThanOrEqual(2_200);
    expect(vehicleMassKg(bus)).toBeGreaterThanOrEqual(9_000);
    expect(vehicleMassKg(bus)).toBeLessThanOrEqual(16_000);
  });

  it("pushes a pedestrian along the striking vehicle momentum", () => {
    const network = createRoadNetwork();
    const car = vehicle("car", "E_S1_STRAIGHT");
    car.speedProfile = "BURST";
    const pedestrian: Pedestrian = {
      id: "pedestrian",
      crosswalkId: "CROSSWALK:WEST",
      direction: "A_TO_B",
      generatedAtTick: 0,
      patienceLimit: 20,
      state: "CROSSING_JAYWALK",
      waitingTicks: 0,
      row: 0,
      column: 2,
    };
    const outcome = solveCollisionOutcome({
      tick: 9,
      resourceId: "CROSSWALK:WEST:CELL:2:0",
      collisionType: "ANGLE_COLLISION",
      severity: "SERIOUS",
      vehicles: [car],
      pedestrians: [pedestrian],
      network,
    });

    const vehicleVelocity = outcome.vehicles[0]?.preImpactVelocity;
    const pedestrianImpulse = outcome.pedestrians[0]?.impulse;
    expect(vehicleVelocity).toBeDefined();
    expect(pedestrianImpulse).toBeDefined();
    expect(
      (vehicleVelocity?.x ?? 0) * (pedestrianImpulse?.x ?? 0) +
        (vehicleVelocity?.z ?? 0) * (pedestrianImpulse?.z ?? 0),
    ).toBeGreaterThan(0);
    expect(outcome.pedestrians[0]).toMatchObject({
      massKg: 75,
    });
    expect(
      Math.hypot(
        outcome.pedestrians[0]?.preImpactVelocity?.x ?? 0,
        outcome.pedestrians[0]?.preImpactVelocity?.z ?? 0,
      ),
    ).toBeGreaterThan(0);
    expect(outcome.pedestrians[0]?.contactPoint).toBeDefined();
    expect(outcome.pedestrians[0]?.contactNormal).toBeDefined();
    expect(outcome.pedestrians[0]?.impactEnergy).toBeGreaterThan(0);
    expect(outcome.pedestrians[0]?.hazardResourceIds?.length).toBeGreaterThan(0);
  });

  it("projects an inside pedestrian contact onto the entered vehicle side", () => {
    const network = createRoadNetwork();
    const cell = network.crosswalks
      .get("CROSSWALK:SOUTH")
      ?.cells.find((candidate) => candidate.row === 0 && candidate.column === 1);
    const slotId = cell?.vehicleSlotIds.find((candidate) =>
      candidate.startsWith("N_S1_STRAIGHT:"),
    );
    expect(cell).toBeDefined();
    expect(slotId).toBeDefined();
    if (cell === undefined || slotId === undefined) {
      return;
    }
    const delivery = vehicle(
      "V00076",
      "N_S1_STRAIGHT",
      "kenney-cars:delivery",
    );
    delivery.trajectoryHeadSlot =
      Number(slotId.slice(slotId.lastIndexOf(":") + 1)) + 1;
    const pedestrian: Pedestrian = {
      id: "PED:38:0:CROSSWALK:SOUTH",
      crosswalkId: "CROSSWALK:SOUTH",
      direction: "A_TO_B",
      generatedAtTick: 38,
      patienceLimit: 55,
      state: "CROSSING_JAYWALK",
      waitingTicks: 0,
      row: 0,
      column: 1,
    };

    const outcome = solveCollisionOutcome({
      tick: 208,
      resourceId: cell.conflictResourceId,
      collisionType: "ANGLE_COLLISION",
      severity: "SERIOUS",
      vehicles: [delivery],
      pedestrians: [pedestrian],
      network,
    });
    const participant = outcome.pedestrians[0];
    expect(participant).toBeDefined();
    expect(Math.abs(participant?.contactNormal?.x ?? 0)).toBeGreaterThan(
      Math.abs(participant?.contactNormal?.z ?? 0),
    );
    const impactStart = {
      x: (participant?.restPose.x ?? 0) - (participant?.impulse.x ?? 0),
      z: (participant?.restPose.z ?? 0) - (participant?.impulse.z ?? 0),
    };
    expect(
      Math.hypot(
        impactStart.x - (participant?.contactPoint?.x ?? 0),
        impactStart.z - (participant?.contactPoint?.z ?? 0),
      ),
    ).toBeCloseTo(0.22);
  });
});
