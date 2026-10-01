import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import type { Vehicle, VehicleType } from "../src/core/types.js";

describe("top-N platoon admission", () => {
  it("plans one lane with real occupancy spacing and hides scheduled followers", () => {
    const world = createEngine();
    const vehicles = fillLane(world, "N_S1_STRAIGHT", [
      "SEDAN",
      "kenney-cars:delivery",
      "SEDAN",
    ]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");

    const dryRun = world.dryRunAdmissionPlan(
      [],
      [{ laneId: "IN_N_S1_STRAIGHT", topN: 3 }],
    );
    expect(dryRun.feasible).toBe(true);
    expect(dryRun.enterPlan).toHaveLength(3);
    const ticks = dryRun.enterPlan?.map((entry) => entry.enterTick) ?? [];
    expect(ticks[1]).toBeGreaterThan(ticks[0] ?? -1);
    expect(ticks[2]).toBeGreaterThan(ticks[1] ?? -1);

    const committed = world.applyAdmissionPlan(
      [],
      [{ laneId: "IN_N_S1_STRAIGHT", topN: 3 }],
    );
    expect(committed.rejectedVehicleIds).toEqual([]);
    expect(vehicles[0]?.state).toBe("CROSSING");
    expect(vehicles[1]?.scheduledEnterTick).toBeDefined();
    expect(vehicles[2]?.scheduledEnterTick).toBeDefined();
    expect(vehicles[1]?.admissionState).toBe("SCHEDULED_ENTERING");

    const observation = world.buildObservation(0);
    expect(
      observation.stoplineCandidates.some((item) =>
        committed.admittedVehicleIds.includes(item.vehicleId),
      ),
    ).toBe(false);
    expect(observation.dischargingLanes).toEqual([
      expect.objectContaining({
        laneId: "IN_N_S1_STRAIGHT",
        remainingVehicles: 2,
      }),
    ]);
    for (let tick = 0; tick < 80; tick += 1) {
      world.step();
    }
    expect(world.incidentSummaries()).toEqual([]);
    expect(world.scheduledCollisionCount).toBe(0);
  });

  it("lets scheduled followers roll across the stopline without stopping again", () => {
    const world = createEngine();
    const vehicles = fillLane(world, "N_S1_STRAIGHT", [
      "SEDAN",
      "kenney-cars:delivery",
      "SEDAN",
    ]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    world.applyAdmissionPlan(
      [],
      [{ laneId: "IN_N_S1_STRAIGHT", topN: 3 }],
    );

    const followers = vehicles.slice(1);
    const stoppedFollowerIds = new Set<string>();
    const enteredFollowerIds = new Set<string>();
    for (let tick = 0; tick < 40; tick += 1) {
      world.step();
      for (const vehicle of followers) {
        if (vehicle.state === "AT_STOPLINE") {
          stoppedFollowerIds.add(vehicle.id);
        }
        if (vehicle.state === "CROSSING") {
          enteredFollowerIds.add(vehicle.id);
        }
      }
    }

    expect(stoppedFollowerIds).toEqual(new Set());
    expect(enteredFollowerIds.size).toBe(followers.length);
    expect(world.incidentSummaries()).toEqual([]);
  });

  it("locks one normalized profile across an entire delayed lane batch", () => {
    const world = createEngine();
    const vehicles = fillLane(world, "N_S1_STRAIGHT", [
      "SEDAN",
      "SEDAN",
      "SEDAN",
    ]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    const before = world.getSnapshot();
    const request = [{
      laneId: "IN_N_S1_STRAIGHT",
      topN: 3,
      speedProfile: "SLOW_SLIDE" as const,
    }];
    const preview = world.dryRunAdmissionPlan([], request);

    expect(preview.enterPlan?.map((entry) => entry.speedProfile)).toEqual([
      "SLOW_SLIDE",
      "SLOW_SLIDE",
      "SLOW_SLIDE",
    ]);
    expect(world.getSnapshot()).toEqual(before);

    world.applyAdmissionPlan([], request);
    expect(vehicles.map((vehicle) => vehicle.speedProfile)).toEqual([
      "SLOW_SLIDE",
      "SLOW_SLIDE",
      "SLOW_SLIDE",
    ]);
    expect(vehicles[1]?.scheduledEnterTick).toBeDefined();
    const original = vehicles[1]?.scheduledEnterTick ?? world.currentTick;
    if (vehicles[1] !== undefined) {
      vehicles[1].inboundHeadSlot = 0;
      vehicles[1].state = "QUEUED";
    }
    stepUntil(
      world,
      () => (vehicles[1]?.scheduledEnterTick ?? 0) > original,
    );
    expect(vehicles[1]?.speedProfile).toBe("SLOW_SLIDE");
    expect(vehicles[1]?.motionCreditHalfSlots).toBe(0);
  });

  it("admits an encroaching platoon without persisting creep as a ghost reservation", () => {
    const world = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: {
        stallModulus: 1_000_000,
        exitHoldModulus: 1_000_000,
        crosswalkModulus: 1_000_000,
        creepAfterWaitingTicks: 2,
      },
    });
    const vehicles = fillLane(world, "N_S1_STRAIGHT", ["SEDAN", "SEDAN"]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    world.step();
    world.step();
    expect(vehicles[0]?.encroaching).toBe(true);

    const dryRun = world.dryRunAdmissionPlan(
      [],
      [{ laneId: "IN_N_S1_STRAIGHT", topN: 2 }],
    );
    expect(dryRun.feasible).toBe(true);
    const commitTick = world.currentTick;
    const committed = world.applyAdmissionPlan(
      [],
      [{ laneId: "IN_N_S1_STRAIGHT", topN: 2 }],
    );
    expect(committed.rejectedVehicleIds).toEqual([]);
    expect(
      [...(world.reservations.get(commitTick + 40)?.values() ?? [])],
    ).not.toContain(vehicles[0]?.id);
  });

  it("jointly dry-runs multiple compatible straight-lane platoons", () => {
    const world = createEngine();
    fillLane(world, "E_S1_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    fillLane(world, "E_S2_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    fillLane(world, "W_S1_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    fillLane(world, "W_S2_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    stepUntil(
      world,
      () =>
        world.buildObservation(0).stoplineCandidates.filter((candidate) =>
          candidate.routeId.startsWith("E_") || candidate.routeId.startsWith("W_"),
        ).length === 4,
    );

    const result = world.dryRunAdmissionPlan(
      [],
      [
        { laneId: "IN_E_S1_STRAIGHT", topN: 3 },
        { laneId: "IN_E_S2_STRAIGHT", topN: 3 },
        { laneId: "IN_W_S1_STRAIGHT", topN: 3 },
        { laneId: "IN_W_S2_STRAIGHT", topN: 3 },
      ],
    );
    expect(result.feasible).toBe(true);
    expect(result.batch.admittedVehicleIds).toHaveLength(12);
  });

  it("keeps a committed follower licensed when its entry slides", () => {
    const world = createEngine();
    const vehicles = fillLane(world, "N_L1_LEFT", [
      "kenney-cars:delivery",
      "SEDAN",
      "SEDAN",
    ]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    world.applyAdmissionPlan(
      [],
      [{ laneId: "IN_N_L1_LEFT", topN: 3 }],
    );
    const original = vehicles[1]?.scheduledEnterTick;
    stepUntil(world, () => world.currentTick >= (original ?? 1) - 1);
    if (vehicles[1] !== undefined) {
      vehicles[1].inboundHeadSlot = 0;
      vehicles[1].state = "QUEUED";
    }
    stepUntil(
      world,
      () => (vehicles[1]?.scheduledEnterTick ?? 0) > (original ?? 0),
    );
    expect(vehicles[1]?.scheduledEnterTick).toBeGreaterThan(original ?? 0);
    expect(vehicles[1]?.scheduledAdmissionOrder).toBeDefined();
    expect(
      world
        .buildObservation(0)
        .stoplineCandidates.some((item) => item.vehicleId === vehicles[1]?.id),
    ).toBe(false);
  });

  it("cancels a stalled scheduled tail without freezing another lane", () => {
    const world = createEngine();
    const stalledLane = fillLane(world, "N_S1_STRAIGHT", [
      "SEDAN",
      "SEDAN",
      "SEDAN",
    ]);
    const otherLane = fillLane(world, "N_S2_STRAIGHT", [
      "city-builder:car_police",
      "city-builder:car_police",
      "city-builder:car_police",
    ]);
    stepUntil(
      world,
      () =>
        stalledLane[0]?.state === "AT_STOPLINE" &&
        otherLane[0]?.state === "AT_STOPLINE",
    );

    const committed = world.applyAdmissionPlan(
      [],
      [
        { laneId: "IN_N_S1_STRAIGHT", topN: 3 },
        { laneId: "IN_N_S2_STRAIGHT", topN: 3 },
      ],
    );
    expect(committed.rejectedVehicleIds).toEqual([]);
    if (otherLane[1] !== undefined && otherLane[2] !== undefined) {
      otherLane[1].inboundHeadSlot = 2;
      otherLane[2].inboundHeadSlot = 0;
    }
    Object.assign(world.dynamics, { stallModulus: 1 });

    stepUntil(world, () => stalledLane[1]?.state === "STALLED");
    for (const vehicle of stalledLane.slice(1)) {
      expect(vehicle?.scheduledEnterTick).toBeUndefined();
      expect(vehicle?.admissionState).toBeUndefined();
      expect(vehicle?.scheduledAdmissionOrder).toBeUndefined();
      expect(vehicle?.scheduledBatchId).toBeUndefined();
    }
    expect(otherLane.slice(1).some((vehicle) => vehicle.scheduledEnterTick !== undefined)).toBe(
      true,
    );
    expect(
      world
        .buildObservation(0)
        .dischargingLanes?.some(
          (lane) => lane.laneId === "IN_N_S1_STRAIGHT",
        ) ?? false,
    ).toBe(false);

    const moved = world.rerouteQueueAroundStall(
      stalledLane[1]?.id ?? "missing",
      "N_R1_RIGHT",
    );
    expect(moved).toMatchObject({
      ok: true,
      movedVehicleIds: [stalledLane[2]?.id],
    });
    expect(stalledLane[2]?.scheduledEnterTick).toBeUndefined();
    for (let tick = 0; tick < 4; tick += 1) {
      world.step();
      expect(
        world
          .buildObservation(0)
          .dischargingLanes?.some(
            (lane) => lane.laneId === "IN_N_S1_STRAIGHT",
          ) ?? false,
      ).toBe(false);
    }
  });

  it("revokes target-lane schedules when a stall reroute borrows that lane", () => {
    const world = createEngine();
    const otherLane = fillLane(world, "S_S1_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    const [stalled, follower] = fillLane(world, "N_S1_STRAIGHT", ["SEDAN", "MOTORCYCLE"]);
    if (stalled === undefined || follower === undefined) {
      throw new Error("missing vehicles");
    }
    stepUntil(world, () => stalled.state === "AT_STOPLINE");
    stalled.state = "STALLED";
    const [rightHead] = fillLane(world, "N_R1_RIGHT", ["SEDAN"]);
    stepUntil(world, () => rightHead?.state === "AT_STOPLINE");
    const rightTail = world.spawnVehicle("N_R1_RIGHT", "SEDAN");
    world.step();
    stepUntil(world, () => follower.state === "QUEUED" || follower.state === "AT_STOPLINE");
    stepUntil(world, () => otherLane[0]?.state === "AT_STOPLINE");

    const committed = world.applyAdmissionPlan(
      [],
      [
        { laneId: "IN_N_R1_RIGHT", topN: 2 },
        { laneId: "IN_S_S1_STRAIGHT", topN: 3 },
      ],
    );
    expect(committed.rejectedVehicleIds).toEqual([]);
    expect(rightTail?.scheduledEnterTick).toBeDefined();
    world.drainIncidentLog();

    const moved = world.rerouteQueueAroundStall(stalled.id, "IN_N_R1_RIGHT");
    expect(moved).toMatchObject({ ok: true, movedVehicleIds: [follower.id] });
    expect(follower.routeId).toBe("N_R1_GUIDED_STRAIGHT");
    expect(rightTail?.scheduledEnterTick).toBeUndefined();
    expect(rightTail?.admissionState).toBeUndefined();
    expect(world.drainIncidentLog()).toContainEqual(
      expect.objectContaining({
        kind: "ADMISSION_REVOKED",
        reason: "LANE_TRANSFER",
        laneId: "IN_N_R1_RIGHT",
        vehicleIds: [rightTail?.id],
      }),
    );
    expect(world.buildObservation(0).revokedAdmissions).toContainEqual(
      expect.objectContaining({
        laneId: "IN_N_R1_RIGHT",
        reason: "LANE_TRANSFER",
        vehicleIds: [rightTail?.id],
      }),
    );

    stepUntil(world, () => follower.state === "AT_STOPLINE");
    expect(world.applyAdmissions([follower.id]).admittedVehicleIds).toEqual([
      follower.id,
    ]);
    expect(follower.outboundLaneId).toBe(
      world.network.trajectories.get("N_S1_STRAIGHT")?.outboundLaneId,
    );
    stepUntil(world, () =>
      otherLane.every(
        (vehicle) => vehicle.state === "OUTBOUND" || vehicle.state === "DESPAWNED",
      ),
    );
    expect(world.scheduledCollisionCount).toBe(0);
  });

  it("revokes schedules queued behind an unscheduled vehicle", () => {
    const world = createEngine();
    const vehicles = fillLane(world, "N_S1_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    world.applyAdmissionPlan([], [{ laneId: "IN_N_S1_STRAIGHT", topN: 3 }]);
    const [, middle, tail] = vehicles;
    if (middle === undefined || tail === undefined) {
      throw new Error("missing vehicles");
    }
    expect(tail.scheduledEnterTick).toBeDefined();
    delete middle.scheduledEnterTick;
    delete middle.scheduledAdmissionOrder;
    delete middle.scheduledBatchId;
    delete middle.admissionState;
    world.drainIncidentLog();

    world.step();

    expect(tail.scheduledEnterTick).toBeUndefined();
    expect(world.drainIncidentLog()).toContainEqual(
      expect.objectContaining({
        kind: "ADMISSION_REVOKED",
        reason: "HEAD_UNSCHEDULED",
        vehicleIds: [tail.id],
      }),
    );
  });

  it("revokes schedules that would cross a crosswalk with a jaywalker", () => {
    const world = createEngine();
    const vehicles = fillLane(world, "N_S1_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    world.applyAdmissionPlan([], [{ laneId: "IN_N_S1_STRAIGHT", topN: 3 }]);
    const [head, middle, tail] = vehicles;
    if (head === undefined || middle === undefined || tail === undefined) {
      throw new Error("missing vehicles");
    }
    expect(head.state).toBe("CROSSING");
    expect(middle.scheduledEnterTick).toBeGreaterThan(world.currentTick);
    const pedestrian = world.spawnScheduledPedestrian({
      id: "jaywalker",
      tick: world.currentTick,
      slot: 0,
      crosswalkId: "CROSSWALK:SOUTH",
      direction: "A_TO_B",
    });
    if (pedestrian === undefined) {
      throw new Error("missing pedestrian");
    }
    pedestrian.state = "CROSSING_JAYWALK";
    pedestrian.nextMoveTick = world.currentTick + 50;
    world.drainIncidentLog();

    world.step();

    expect(head.state).toBe("CROSSING");
    expect(middle.scheduledEnterTick).toBeUndefined();
    expect(tail.scheduledEnterTick).toBeUndefined();
    expect(middle.state).not.toBe("CROSSING");
    expect(world.drainIncidentLog()).toContainEqual(
      expect.objectContaining({
        kind: "ADMISSION_REVOKED",
        reason: "JAYWALKER_AHEAD",
        laneId: "IN_N_S1_STRAIGHT",
        vehicleIds: [middle.id, tail.id].sort(),
      }),
    );
  });

  it("keeps other lanes entering on schedule while one lane is stuck", () => {
    const world = createEngine();
    const stuckLane = fillLane(world, "N_S1_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    const freeLane = fillLane(world, "S_S1_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    stepUntil(
      world,
      () =>
        stuckLane[0]?.state === "AT_STOPLINE" &&
        freeLane[0]?.state === "AT_STOPLINE",
    );
    world.applyAdmissionPlan(
      [],
      [
        { laneId: "IN_N_S1_STRAIGHT", topN: 3 },
        { laneId: "IN_S_S1_STRAIGHT", topN: 3 },
      ],
    );
    const planned = freeLane.map((vehicle) => vehicle.scheduledEnterTick);
    const entered = new Map<string, number>();
    for (let tick = 0; tick < 60; tick += 1) {
      if (stuckLane[1] !== undefined && stuckLane[1].state !== "CROSSING") {
        stuckLane[1].inboundHeadSlot = 0;
        stuckLane[1].state = "QUEUED";
      }
      world.step();
      for (const vehicle of freeLane) {
        if (vehicle.state === "CROSSING" && !entered.has(vehicle.id)) {
          entered.set(vehicle.id, world.currentTick);
        }
      }
    }

    expect(entered.size).toBe(freeLane.length);
    freeLane.slice(1).forEach((vehicle, index) => {
      expect(entered.get(vehicle.id)).toBe(planned[index + 1]);
    });
  });

  it("expires a schedule that keeps sliding past the limit", () => {
    const world = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: {
        stallModulus: 1_000_000,
        exitHoldModulus: 1_000_000,
        crosswalkModulus: 1_000_000,
        creepAfterWaitingTicks: 1_000,
        scheduleSlideLimitTicks: 3,
      },
    });
    const vehicles = fillLane(world, "N_S1_STRAIGHT", ["SEDAN", "SEDAN", "SEDAN"]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    world.applyAdmissionPlan([], [{ laneId: "IN_N_S1_STRAIGHT", topN: 3 }]);
    const [, middle, tail] = vehicles;
    if (middle === undefined || tail === undefined) {
      throw new Error("missing vehicles");
    }
    tail.inboundHeadSlot = 0;
    tail.state = "QUEUED";
    middle.inboundHeadSlot = tail.lengthSlots + 2;
    middle.state = "QUEUED";
    world.drainIncidentLog();

    stepUntil(world, () => middle.scheduledEnterTick === undefined, 40);

    expect(middle.state).not.toBe("CROSSING");
    expect(middle.scheduledSlideTicks).toBeUndefined();
    expect(tail.scheduledEnterTick).toBeUndefined();
    expect(world.drainIncidentLog()).toContainEqual(
      expect.objectContaining({
        kind: "ADMISSION_EXPIRED",
        reason: "SLIDE_LIMIT",
        laneId: "IN_N_S1_STRAIGHT",
        vehicleIds: [middle.id, tail.id],
      }),
    );
  });

  it("deduplicates a direct lane head from its lane batch", () => {
    const world = createEngine();
    const vehicles = fillLane(world, "N_S1_STRAIGHT", [
      "SEDAN",
      "SEDAN",
      "SEDAN",
    ]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    const batches = [{ laneId: "IN_N_S1_STRAIGHT", topN: 3 }];

    const dryRun = world.dryRunAdmissionPlan(
      [vehicles[0]?.id ?? "missing"],
      batches,
    );
    expect(dryRun.feasible).toBe(true);
    expect(dryRun.batch.admittedVehicleIds).toHaveLength(3);
    expect(new Set(dryRun.batch.admittedVehicleIds).size).toBe(3);

    const committed = world.applyAdmissionPlan(
      [vehicles[0]?.id ?? "missing"],
      batches,
    );
    expect(committed.rejectedVehicleIds).toEqual([]);
    expect(committed.admittedVehicleIds).toHaveLength(3);
    expect(new Set(committed.admittedVehicleIds).size).toBe(3);
  });

  it("revokes a scheduled permit when its route no longer matches its lane", () => {
    const world = createEngine();
    const vehicles = fillLane(world, "N_S1_STRAIGHT", ["SEDAN", "SEDAN"]);
    stepUntil(world, () => vehicles[0]?.state === "AT_STOPLINE");
    world.applyAdmissionPlan(
      [],
      [{ laneId: "IN_N_S1_STRAIGHT", topN: 2 }],
    );
    const follower = vehicles[1];
    expect(follower?.scheduledEnterTick).toBeDefined();
    if (follower === undefined) {
      return;
    }
    follower.routeId = "N_R1_RIGHT";
    follower.outboundLaneId =
      world.network.trajectories.get("N_R1_RIGHT")?.outboundLaneId ??
      follower.outboundLaneId;
    const scheduledTick = follower.scheduledEnterTick ?? world.currentTick;

    stepUntil(world, () => world.currentTick > scheduledTick);
    expect(follower.state).not.toBe("CROSSING");
    expect(follower.scheduledEnterTick).toBeUndefined();
    expect(follower.admissionState).toBeUndefined();
  });

  it("automatically defers conflicting multi-lane batches on one shared scratch table", () => {
    const world = createEngine();
    fillLane(world, "N_L1_LEFT", ["SEDAN", "SEDAN"]);
    fillLane(world, "S_S1_STRAIGHT", ["SEDAN", "SEDAN"]);
    stepUntil(
      world,
      () =>
        world.buildObservation(0).stoplineCandidates.some(
          (candidate) => candidate.routeId === "N_L1_LEFT",
        ) &&
        world.buildObservation(0).stoplineCandidates.some(
          (candidate) => candidate.routeId === "S_S1_STRAIGHT",
        ),
    );
    const batches = [
      { laneId: "IN_N_L1_LEFT", topN: 2 },
      { laneId: "IN_S_S1_STRAIGHT", topN: 2 },
    ];
    const dryRun = world.dryRunAdmissionPlan([], batches);
    expect(dryRun.feasible).toBe(true);
    expect(dryRun.conflictDetected).toBeUndefined();
    const northTicks =
      dryRun.enterPlan
        ?.filter((entry) => entry.laneId === "IN_N_L1_LEFT")
        .map((entry) => entry.enterTick) ?? [];
    const southTicks =
      dryRun.enterPlan
        ?.filter((entry) => entry.laneId === "IN_S_S1_STRAIGHT")
        .map((entry) => entry.enterTick) ?? [];
    expect(Math.min(...southTicks)).toBeGreaterThanOrEqual(
      Math.min(...northTicks),
    );

    const committed = world.applyAdmissionPlan([], batches);
    expect(committed.admittedVehicleIds).toHaveLength(4);
    expect(world.scheduledCollisionCount).toBe(0);
  });
});

function createEngine(): SimulationEngine {
  return new SimulationEngine({
    network: createRoadNetwork(),
    dynamics: {
      stallModulus: 1_000_000,
      exitHoldModulus: 1_000_000,
      crosswalkModulus: 1_000_000,
      creepAfterWaitingTicks: 1_000,
    },
  });
}

function fillLane(
  world: SimulationEngine,
  routeId: string,
  types: readonly VehicleType[],
): Vehicle[] {
  const vehicles: Vehicle[] = [];
  for (const type of types) {
    let vehicle = world.spawnVehicle(routeId, type);
    while (vehicle === undefined) {
      world.step();
      vehicle = world.spawnVehicle(routeId, type);
    }
    vehicles.push(vehicle);
    for (let tick = 0; tick < vehicle.lengthSlots + 1; tick += 1) {
      world.step();
    }
  }
  return vehicles;
}

function stepUntil(
  world: SimulationEngine,
  predicate: () => boolean,
  limit = 200,
): void {
  for (let tick = 0; tick < limit; tick += 1) {
    if (predicate()) {
      return;
    }
    world.step();
  }
  throw new Error("Condition was not reached");
}
