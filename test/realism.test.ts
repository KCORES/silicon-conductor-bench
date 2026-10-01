import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { arrivalsAt } from "../src/core/demand.js";
import { createRoadNetwork } from "../src/core/network.js";
import type { EngineDynamics } from "../src/core/dynamics.js";
import type { Vehicle } from "../src/core/types.js";

const EMERGENCY = "city-builder:car_police";
const TRUCK = "kenney-cars:delivery";

function engine(
  dynamics: Partial<EngineDynamics> = {},
  options: { seed?: number; outboundLaneLength?: number; inboundLaneLength?: number } = {},
): SimulationEngine {
  return new SimulationEngine({
    network: createRoadNetwork({
      ...(options.inboundLaneLength === undefined
        ? {}
        : { inboundLaneLength: options.inboundLaneLength }),
      ...(options.outboundLaneLength === undefined
        ? {}
        : { outboundLaneLength: options.outboundLaneLength }),
    }),
    seed: options.seed ?? 1,
    dynamics: {
      stallModulus: 1_000_000,
      exitHoldModulus: 1_000_000,
      crosswalkModulus: 1_000_000,
      creepAfterWaitingTicks: 100,
      ...dynamics,
    },
  });
}

function mustSpawn(
  world: SimulationEngine,
  routeId: string,
  type: Vehicle["type"] = "MOTORCYCLE",
): Vehicle {
  const vehicle = world.spawnVehicle(routeId, type);
  if (vehicle === undefined) {
    throw new Error(`Failed to spawn ${type} on ${routeId}`);
  }
  return vehicle;
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
  if (!predicate()) {
    throw new Error("Condition was not reached");
  }
}

function sumCharges(charges: readonly { amount: number }[]): number {
  return charges.reduce((total, charge) => total + charge.amount, 0);
}

describe("traffic realism", () => {
  it("starts a stopped follower one tick later and keeps free cars at one cell per tick", () => {
    const world = engine();
    const leader = mustSpawn(world, "N_S1_STRAIGHT");
    for (let tick = 0; tick < 4; tick += 1) {
      world.step();
    }
    const follower = mustSpawn(world, "N_S1_STRAIGHT");
    stepUntil(
      world,
      () => leader.state === "AT_STOPLINE" && follower.state === "QUEUED",
    );
    const queuedAt = follower.inboundHeadSlot;
    world.step();
    expect(follower.inboundHeadSlot).toBe(queuedAt);

    world.applyAdmissions([leader.id]);
    world.step();
    expect(follower.inboundHeadSlot).toBe(queuedAt);
    world.step();
    expect(follower.inboundHeadSlot).toBe(queuedAt + 1);

    const calm = engine();
    const sedan = mustSpawn(calm, "N_S1_STRAIGHT", "SEDAN");
    const start = sedan.inboundHeadSlot;
    for (let tick = 0; tick < 4; tick += 1) {
      calm.step();
    }
    expect(sedan.inboundHeadSlot).toBe(start + 4);
  });

  it("moves trucks one cell every two ticks on a turn, and only for the first slow steps when going straight", () => {
    const turning = engine();
    const truck = mustSpawn(turning, "N_L1_LEFT", TRUCK);
    const passenger = engine();
    const car = mustSpawn(passenger, "N_L1_LEFT", "SEDAN");
    stepUntil(turning, () => truck.state === "AT_STOPLINE");
    stepUntil(passenger, () => car.state === "AT_STOPLINE");
    turning.applyAdmissions([truck.id]);
    passenger.applyAdmissions([car.id]);
    const truckStart = truck.trajectoryHeadSlot;
    const carStart = car.trajectoryHeadSlot;
    for (let tick = 0; tick < 4; tick += 1) {
      turning.step();
      passenger.step();
    }
    expect(truck.trajectoryHeadSlot - truckStart).toBe(2);
    expect(car.trajectoryHeadSlot - carStart).toBe(4);

    const straight = engine();
    const hauler = mustSpawn(straight, "N_S1_STRAIGHT", TRUCK);
    stepUntil(straight, () => hauler.state === "AT_STOPLINE");
    straight.applyAdmissions([hauler.id]);
    const origin = hauler.trajectoryHeadSlot;
    for (let tick = 0; tick < 4; tick += 1) {
      straight.step();
    }
    expect(hauler.trajectoryHeadSlot - origin).toBe(2);
    straight.step();
    expect(hauler.trajectoryHeadSlot - origin).toBe(3);
  });

  it("keeps the same exit-hold windows for one seed and releases vehicles after the window", () => {
    const left = new SimulationEngine({ network: createRoadNetwork(), seed: 9 });
    const right = new SimulationEngine({ network: createRoadNetwork(), seed: 9 });
    for (let tick = 0; tick < 6; tick += 1) {
      left.step();
      right.step();
    }
    expect(left.buildObservation(0).exitHolds).toEqual(
      right.buildObservation(0).exitHolds,
    );

    const clear = engine();
    const vehicle = mustSpawn(clear, "N_S1_STRAIGHT");
    stepUntil(clear, () => vehicle.state === "AT_STOPLINE");
    clear.applyAdmissions([vehicle.id]);
    stepUntil(clear, () => !clear.vehicles.has(vehicle.id), 80);
    expect(clear.vehicles.has(vehicle.id)).toBe(false);
  });

  it("stops a crossing vehicle when the held exit is full and rejects the next admit with EXIT_FULL", () => {
    const world = engine(
      {
        exitHoldModulus: 1,
        exitHoldPeriod: 400,
        exitHoldDuration: 120,
      },
      { outboundLaneLength: 1 },
    );
    const lead = mustSpawn(world, "N_S1_STRAIGHT");
    world.step();
    world.step();
    const follower = mustSpawn(world, "N_S1_STRAIGHT");
    stepUntil(world, () => lead.state === "AT_STOPLINE");
    world.applyAdmissions([lead.id]);
    stepUntil(world, () => lead.state === "OUTBOUND");
    expect(lead.outboundHeadSlot).toBe(0);
    const heldTick = world.currentTick;
    world.step();
    expect(lead.outboundHeadSlot).toBe(0);
    expect(world.currentTick).toBeGreaterThan(heldTick);

    stepUntil(world, () => follower.state === "AT_STOPLINE");
    world.applyAdmissions([follower.id]);
    stepUntil(world, () => follower.state === "EXIT_BLOCKED");
    expect(world.exitLockedResourceCount()).toBeGreaterThan(0);

    const probe = mustSpawn(world, "N_S1_STRAIGHT");
    stepUntil(world, () => probe.state === "AT_STOPLINE");
    const preview = world.dryRunAdmissions([probe.id]);
    expect(preview.batch.results[0]?.reason).toBe("EXIT_FULL");
    expect(world.scheduledCollisionCount).toBe(0);
    const committed = world.applyAdmissions([probe.id]);
    expect(committed.admittedVehicleIds).toEqual([]);
    expect(world.scheduledCollisionCount).toBe(0);
    expect(probe.state).toBe("AT_STOPLINE");

    stepUntil(
      world,
      () => follower.state === "OUTBOUND" || follower.state === "DESPAWNED",
      200,
    );
    expect(follower.state === "OUTBOUND" || !world.vehicles.has(follower.id)).toBe(
      true,
    );
  });

  it("encroaches after the wait threshold and disables legacy random crosswalk holds", () => {
    const creeping = engine({ creepAfterWaitingTicks: 2 });
    const waiting = mustSpawn(creeping, "N_S1_STRAIGHT");
    stepUntil(creeping, () => waiting.state === "AT_STOPLINE");
    expect(waiting.encroaching).toBe(false);
    creeping.step();
    creeping.step();
    expect(waiting.encroaching).toBe(true);
    expect(waiting.state).toBe("AT_STOPLINE");

    const crosswalk = engine({
      crosswalkModulus: 1,
      crosswalkPeriod: 1,
      crosswalkDuration: 80,
    });
    const turning = mustSpawn(crosswalk, "N_R1_RIGHT");
    const straight = mustSpawn(crosswalk, "N_S2_STRAIGHT");
    stepUntil(
      crosswalk,
      () => turning.state === "AT_STOPLINE" && straight.state === "AT_STOPLINE",
    );
    expect(crosswalk.buildObservation(0).crosswalkHolds).toEqual([]);
    expect(crosswalk.dryRunAdmissions([turning.id]).feasible).toBe(true);
    expect(crosswalk.applyAdmissions([turning.id]).admittedVehicleIds).toEqual([
      turning.id,
    ]);
    expect(crosswalk.scheduledCollisionCount).toBe(0);
    expect(turning.state).toBe("CROSSING");
    expect(crosswalk.applyAdmissions([straight.id]).admittedVehicleIds).toEqual([
      straight.id,
    ]);
  });

  it("queues scheduled vehicles that do not fit without charging them", () => {
    const world = engine({}, { inboundLaneLength: 2, seed: 5 });
    const routes = [...world.network.trajectories.keys()];
    const before = arrivalsAt(5, 3, routes);
    mustSpawn(world, "N_S1_STRAIGHT");
    const arrival = {
      tick: 3,
      slot: 0,
      routeId: "N_S1_STRAIGHT" as const,
      type: "MOTORCYCLE" as const,
    };
    expect(world.spawnScheduled(arrival)).toBeUndefined();
    expect(world.spawnScheduled(arrival)).toBeUndefined();
    expect(world.buildObservation(0).upstreamQueues).toEqual([
      { laneId: "IN_N_S1_STRAIGHT", waiting: 1 },
    ]);
    expect(arrivalsAt(5, 3, routes)).toEqual(before);
    expect(world.waitingCharges(0.02).upstream).toBe(0);
    expect(world.vehicleWaitingCharges(0.02)).toEqual([]);
    world.step();
    expect(arrivalsAt(5, 4, routes)).toEqual(arrivalsAt(5, 4, routes));
  });

  it("rejects a buried emergency admit and releases the convoy only when the package is clear", () => {
    const world = engine();
    const blocker = mustSpawn(world, "N_S1_STRAIGHT", TRUCK);
    for (let tick = 0; tick < 3; tick += 1) {
      world.step();
    }
    const emergency = mustSpawn(world, "N_S1_STRAIGHT", EMERGENCY);
    stepUntil(
      world,
      () => blocker.state === "AT_STOPLINE" && emergency.state === "QUEUED",
    );
    const buried = world.applyAdmissions([emergency.id]);
    expect(buried.results.find((result) => result.vehicleId === emergency.id)?.reason).toBe(
      "NOT_AT_STOPLINE",
    );
    emergency.state = "AT_STOPLINE";
    const notHead = world.applyAdmissions([emergency.id]);
    expect(notHead.results.find((result) => result.vehicleId === emergency.id)?.reason).toBe(
      "NOT_LANE_HEAD",
    );
    emergency.state = "QUEUED";
    expect(emergency.state).toBe("QUEUED");

    const alert = world.buildObservation(0).emergencyAlerts.find(
      (item) => item.vehicleId === emergency.id,
    );
    expect(alert?.laneId).toBe("IN_N_S1_STRAIGHT");
    expect(alert?.queueIndex).toBe(2);
    expect(alert?.blockingVehicleIds).toEqual([blocker.id]);
    expect(alert?.delayBleedPerTick).toBeCloseTo(0.15);

    const released = world.dispatchEmergencyConvoy(
      "IN_N_S1_STRAIGHT",
      emergency.id,
    );
    expect(released.ok).toBe(true);
    expect(blocker.state).toBe("CROSSING");
    expect(emergency.scheduledEnterTick).toBeGreaterThan(
      world.currentTick + blocker.lengthSlots,
    );
    stepUntil(world, () => emergency.state === "CROSSING");

    const clearing = engine();
    const clearingBlocker = mustSpawn(
      clearing,
      "N_S1_STRAIGHT",
      TRUCK,
    );
    for (let tick = 0; tick < 3; tick += 1) {
      clearing.step();
    }
    const clearingEmergency = mustSpawn(
      clearing,
      "N_S1_STRAIGHT",
      EMERGENCY,
    );
    stepUntil(
      clearing,
      () =>
        clearingBlocker.state === "AT_STOPLINE" &&
        clearingEmergency.state === "QUEUED",
    );
    const physicallyCleared = clearing.dispatchEmergencyConvoy(
      "IN_N_S1_STRAIGHT",
      clearingEmergency.id,
      "N_S2_STRAIGHT",
    );
    expect(physicallyCleared).toMatchObject({
      ok: true,
      targetLaneId: "IN_N_S2_STRAIGHT",
    });
    expect(clearingBlocker.routeId).toBe("N_S2_STRAIGHT");
    expect(clearingBlocker.inboundLaneId).toBe("IN_N_S2_STRAIGHT");
    expect(clearingEmergency.routeId).toBe("N_S1_STRAIGHT");
    expect(clearingEmergency.inboundLaneId).toBe("IN_N_S1_STRAIGHT");

    const busy = engine();
    const east = mustSpawn(busy, "E_S1_STRAIGHT");
    const northLead = mustSpawn(busy, "N_S1_STRAIGHT", TRUCK);
    for (let tick = 0; tick < 3; tick += 1) {
      busy.step();
    }
    const northEmergency = mustSpawn(busy, "N_S1_STRAIGHT", EMERGENCY);
    stepUntil(
      busy,
      () =>
        east.state === "AT_STOPLINE" &&
        northLead.state === "AT_STOPLINE" &&
        northEmergency.state === "QUEUED",
    );
    busy.applyAdmissions([east.id]);
    stepUntil(
      busy,
      () => busy.dryRunAdmissions([northLead.id]).conflictDetected !== undefined,
      30,
    );
    const deferred = busy.dispatchEmergencyConvoy(
      "IN_N_S1_STRAIGHT",
      northEmergency.id,
      "N_S2_STRAIGHT",
    );
    expect(deferred.ok).toBe(true);
    expect(northLead.state).toBe("AT_STOPLINE");
    expect(northLead.scheduledEnterTick).toBeGreaterThan(busy.currentTick);
    expect(northEmergency.state).toBe("QUEUED");
    expect(northEmergency.scheduledEnterTick).toBeGreaterThan(
      northLead.scheduledEnterTick ?? busy.currentTick,
    );
    expect(busy.scheduledCollisionCount).toBe(0);
    stepUntil(busy, () => northEmergency.state === "CROSSING", 60);
    expect(busy.incidentSummaries()).toEqual([]);
  });

  it("holds a convoy lead at the stopline until its probed entry tick", () => {
    const world = engine();
    const east = mustSpawn(world, "E_S1_STRAIGHT");
    const lead = mustSpawn(world, "N_S1_STRAIGHT");
    for (let tick = 0; tick < 3; tick += 1) {
      world.step();
    }
    const emergency = mustSpawn(world, "N_S1_STRAIGHT", EMERGENCY);
    stepUntil(
      world,
      () =>
        east.state === "AT_STOPLINE" &&
        lead.state === "AT_STOPLINE" &&
        emergency.state === "QUEUED",
    );
    world.applyAdmissions([east.id]);
    stepUntil(world, () => !world.dryRunAdmissions([lead.id]).feasible, 30);

    const convoy = world.dispatchEmergencyConvoy("IN_N_S1_STRAIGHT", emergency.id);

    expect(convoy.ok).toBe(true);
    expect(lead.state).toBe("AT_STOPLINE");
    expect(lead.scheduledEnterTick).toBeGreaterThan(world.currentTick);
    stepUntil(world, () => emergency.state === "CROSSING", 60);
    expect(world.incidentSummaries()).toEqual([]);
  });

  it("stalls from the seed, refuses a blocked bypass, and slides the follower when the slot is free", () => {
    const world = engine({ stallModulus: 1 });
    const stalled = mustSpawn(world, "N_S1_STRAIGHT", "SEDAN");
    const emergency = mustSpawn(world, "E_S1_STRAIGHT", EMERGENCY);
    world.step();
    const follower = mustSpawn(world, "N_S1_STRAIGHT");
    stepUntil(world, () => stalled.state === "STALLED");
    stepUntil(world, () => emergency.state === "AT_STOPLINE");
    expect(emergency.state).toBe("AT_STOPLINE");
    expect(world.applyAdmissions([stalled.id]).results[0]?.reason).toBe("STALLED");

    const view = world.buildObservation(0).stalledVehicles.find(
      (item) => item.vehicleId === stalled.id,
    );
    expect(view?.laneId).toBe("IN_N_S1_STRAIGHT");
    expect(view?.validBypassLanes).toEqual(["N_R1_RIGHT", "N_S2_STRAIGHT"]);
    expect(
      world.setLaneDetour(
        stalled.inboundLaneId,
        "DIVERT_TO_ADJACENT_LANE",
        "N_S2_STRAIGHT",
      ),
    ).toEqual({ ok: false, error: "SOURCE_NOT_SEVERED" });
    stepUntil(world, () => follower.state === "QUEUED");
    expect(view && world.buildObservation(0).stalledVehicles[0]?.blockedBehindCount).toBeGreaterThan(
      0,
    );
    expect(
      world
        .buildObservation(0)
        .stalledVehicles[0]?.bypassAvailability.find(
          (candidate) => candidate.routeId === "N_S2_STRAIGHT",
        ),
    ).toMatchObject({
      routeId: "N_S2_STRAIGHT",
      laneId: "IN_N_S2_STRAIGHT",
      maxMovableVehicles: 1,
    });

    const occupant = mustSpawn(world, "N_S2_STRAIGHT");
    occupant.inboundHeadSlot = follower.inboundHeadSlot;
    occupant.state = "QUEUED";
    expect(
      world
        .buildObservation(0)
        .stalledVehicles[0]?.bypassAvailability.find(
          (candidate) => candidate.routeId === "N_S2_STRAIGHT",
        ),
    ).toEqual({
      routeId: "N_S2_STRAIGHT",
      laneId: "IN_N_S2_STRAIGHT",
      maxMovableVehicles: 0,
      blockingVehicleId: occupant.id,
      blockedSlot: follower.inboundHeadSlot,
    });
    const occupied = world.rerouteQueueAroundStall(stalled.id, "N_S2_STRAIGHT");
    expect(occupied).toEqual({
      ok: false,
      error: "TARGET_LANE_SLOT_OCCUPIED",
      detail: `Target lane IN_N_S2_STRAIGHT slot ${follower.inboundHeadSlot} is occupied by ${occupant.id}.`,
    });
    expect(follower.routeId).toBe("N_S1_STRAIGHT");
    expect(follower.inboundLaneId).toBe("IN_N_S1_STRAIGHT");

    occupant.inboundHeadSlot = 0;
    expect(
      world
        .buildObservation(0)
        .stalledVehicles[0]?.bypassAvailability.find(
          (candidate) => candidate.routeId === "N_S2_STRAIGHT",
        )?.maxMovableVehicles,
    ).toBe(1);
    const moved = world.rerouteQueueAroundStall(stalled.id, "IN_N_S2_STRAIGHT");
    expect(moved.ok).toBe(true);
    expect(moved.movedVehicleIds).toEqual([follower.id]);
    expect(follower.routeId).toBe("N_S2_STRAIGHT");
    expect(follower.inboundLaneId).toBe("IN_N_S2_STRAIGHT");
    expect(stalled.state).toBe("STALLED");
    expect(stalled.inboundLaneId).toBe("IN_N_S1_STRAIGHT");

    const again = engine({ stallModulus: 1 }, { seed: 4 });
    const twin = engine({ stallModulus: 1 }, { seed: 4 });
    mustSpawn(again, "N_S1_STRAIGHT", "SEDAN");
    mustSpawn(twin, "N_S1_STRAIGHT", "SEDAN");
    stepUntil(again, () => [...again.vehicles.values()][0]?.state === "STALLED");
    stepUntil(twin, () => [...twin.vehicles.values()][0]?.state === "STALLED");
    expect(again.buildObservation(0).stalledVehicles).toEqual(
      twin.buildObservation(0).stalledVehicles,
    );
  });

  it("charges emergency queue bleed and a rising stall-chain penalty", () => {
    const emergencyWorld = engine();
    const ambulance = mustSpawn(emergencyWorld, "N_S1_STRAIGHT", EMERGENCY);
    stepUntil(emergencyWorld, () => ambulance.state === "AT_STOPLINE");
    expect(emergencyWorld.waitingCharges(0.02).emergency).toBe(0);
    for (let tick = 0; tick < 10; tick += 1) {
      emergencyWorld.step();
    }
    const bill = emergencyWorld.waitingCharges(0.02);
    expect(bill.emergency).toBeCloseTo(0.15);
    expect(bill.delay).toBe(0);

    const stalledWorld = engine({ stallModulus: 1 });
    const stalled = mustSpawn(stalledWorld, "N_S1_STRAIGHT");
    stalledWorld.step();
    const follower = mustSpawn(stalledWorld, "N_S1_STRAIGHT");
    stepUntil(
      stalledWorld,
      () => stalled.state === "STALLED" && follower.state === "QUEUED",
    );
    stepUntil(stalledWorld, () => follower.stallBlockedTicks === 20);
    expect(stalledWorld.waitingCharges(0.02).stallChain).toBe(0);
    stalledWorld.step();
    expect(follower.stallBlockedTicks).toBe(21);
    expect(stalledWorld.waitingCharges(0.02).stallChain).toBeCloseTo(0.02);
    stalledWorld.step();
    expect(stalledWorld.waitingCharges(0.02).stallChain).toBeCloseTo(0.04);
    const chainBill = stalledWorld.waitingCharges(0.02);
    const chainCharges = stalledWorld.vehicleWaitingCharges(0.02);
    expect(sumCharges(chainCharges)).toBeCloseTo(
      chainBill.delay + chainBill.emergency + chainBill.stallChain,
    );
    expect(chainCharges.some((charge) => charge.vehicleId === follower.id)).toBe(
      true,
    );
  });

  it("charges normal delay lane-wide but stall chains only inside the 24-slot horizon", () => {
    const world = engine({}, { inboundLaneLength: 62 });
    const lane = world.network.inboundLanes.get("IN_N_S1_STRAIGHT");
    expect(lane?.capacitySlots).toBe(62);
    const stop = (lane?.capacitySlots ?? 1) - 1;
    const queued = mustSpawn(world, "N_S1_STRAIGHT");
    queued.state = "QUEUED";
    queued.inboundHeadSlot = stop - 30;
    queued.stationaryTicks = 10;
    queued.stallBlockedTicks = 21;
    expect(world.waitingCharges(0.02).delay).toBeCloseTo(0.02);
    expect(world.waitingCharges(0.02).stallChain).toBe(0);

    const emergency = mustSpawn(world, "E_S1_STRAIGHT", EMERGENCY);
    emergency.state = "QUEUED";
    emergency.inboundHeadSlot = stop - 20;
    emergency.stationaryTicks = 10;
    const mid = world.waitingCharges(0.02);
    expect(mid.delay).toBeCloseTo(0.04);
    expect(mid.emergency).toBe(0);
    expect(
      world.buildObservation(0).emergencyAlerts.map((alert) => alert.vehicleId),
    ).not.toContain(emergency.id);

    emergency.inboundHeadSlot = stop - 8;
    const near = world.waitingCharges(0.02);
    expect(near.emergency).toBeCloseTo(0.15);
    const alert = world.buildObservation(0).emergencyAlerts.find(
      (item) => item.vehicleId === emergency.id,
    );
    expect(alert?.distanceToStopline).toBe(8);
    expect(alert?.delayBleedPerTick).toBeCloseTo(0.15);
    expect(alert?.stationaryTicks).toBe(10);
    expect(alert?.chargeActive).toBe(true);
    const attributed = world.vehicleWaitingCharges(0.02);
    expect(sumCharges(attributed)).toBeCloseTo(
      near.delay + near.emergency + near.stallChain,
    );
    expect(
      attributed.find((charge) => charge.vehicleId === queued.id)?.amount,
    ).toBeCloseTo(0.02);
    expect(
      attributed.find((charge) => charge.vehicleId === emergency.id)?.amount,
    ).toBeCloseTo(0.15);

    queued.inboundHeadSlot = stop - 24;
    const boundary = world.collectWaitingSettlement(0.02);
    expect(boundary.totals.delay).toBeCloseTo(0.02);
    expect(boundary.totals.stallChain).toBeCloseTo(0.02);
    expect(
      boundary.vehicles.find((charge) => charge.vehicleId === queued.id)?.amount,
    ).toBeCloseTo(0.04);
    expect(sumCharges(boundary.vehicles)).toBeCloseTo(
      boundary.totals.delay +
        boundary.totals.emergency +
        boundary.totals.stallChain,
    );

    queued.state = "ACCIDENT_STOPPED";
    expect(world.waitingCharges(0.02).delay).toBe(0);
    queued.state = "OUTBOUND";
    expect(world.waitingCharges(0.02).delay).toBe(0);
  });

  it("charges after ten stationary ticks and resets only the timer on movement", () => {
    const world = engine();
    const vehicle = mustSpawn(world, "N_S1_STRAIGHT", "SEDAN");
    stepUntil(world, () => vehicle.state === "AT_STOPLINE");
    expect(vehicle.stationaryTicks).toBe(0);

    for (let tick = 0; tick < 9; tick += 1) {
      world.step();
      expect(world.waitingCharges(0.02).delay).toBe(0);
    }
    expect(vehicle.stationaryTicks).toBe(9);
    world.step();
    expect(vehicle.stationaryTicks).toBe(10);
    expect(world.waitingCharges(0.02).delay).toBeCloseTo(0.02);

    const charged = world.vehicleWaitingCharges(0.02);
    expect(charged).toEqual([{ vehicleId: vehicle.id, amount: 0.02 }]);
    world.applyAdmissions([vehicle.id]);
    expect(vehicle.stationaryTicks).toBe(0);
    expect(world.waitingCharges(0.02).delay).toBe(0);

    for (let tick = 0; tick < 4; tick += 1) {
      const before = vehicle.trajectoryHeadSlot;
      world.step();
      if (vehicle.trajectoryHeadSlot > before) {
        expect(vehicle.stationaryTicks).toBe(0);
      }
    }
  });

  it("announces an emergency once outside the horizon and once when it enters", () => {
    const world = engine({}, { inboundLaneLength: 62 });
    const stop =
      (world.network.inboundLanes.get("IN_N_S1_STRAIGHT")?.capacitySlots ?? 1) - 1;
    const emergency = mustSpawn(world, "N_S1_STRAIGHT", EMERGENCY);
    emergency.state = "APPROACHING";
    emergency.inboundHeadSlot = stop - 40;

    const first = world.buildObservation(0).emergencyNotices;
    expect(first).toEqual([
      {
        vehicleId: emergency.id,
        laneId: "IN_N_S1_STRAIGHT",
        distanceToStopline: 40,
        kind: "OUTSIDE_HORIZON",
        surchargeActive: false,
      },
    ]);
    expect(world.buildObservation(0).emergencyNotices).toEqual([]);

    emergency.inboundHeadSlot = stop - 8;
    const entered = world.buildObservation(0).emergencyNotices;
    expect(entered.map((notice) => notice.kind)).toEqual(["ENTERED_HORIZON"]);
    expect(entered[0]?.surchargeActive).toBe(false);
    expect(world.buildObservation(0).emergencyNotices).toEqual([]);
    expect(world.buildObservation(0).emergencyAlerts).toHaveLength(1);
  });

  it("dispatches a paid tow once and removes the stalled vehicle on schedule", () => {
    const world = engine({ stallModulus: 1 });
    const stalled = mustSpawn(world, "N_S1_STRAIGHT");
    stepUntil(world, () => stalled.state === "STALLED");

    const dispatched = world.dispatchTowTruck(stalled.id, 4, 120);
    expect(dispatched).toMatchObject({
      ok: true,
      vehicleId: stalled.id,
      completionTick: world.currentTick + 4,
      cost: 120,
    });
    expect(world.consumeTowCharges()).toBe(120);
    expect(world.consumeTowCharges()).toBe(0);
    expect(world.dispatchTowTruck(stalled.id, 4, 120)).toMatchObject({
      ok: false,
      error: "TOW_ALREADY_DISPATCHED",
    });
    expect(world.buildObservation(0).stalledVehicles[0]?.towTask).toMatchObject({
      status: "EN_ROUTE",
      remainingTicks: 4,
      cost: 120,
    });

    for (let tick = 0; tick < 3; tick += 1) {
      world.step();
      expect(world.vehicles.has(stalled.id)).toBe(true);
    }
    world.step();
    expect(world.vehicles.has(stalled.id)).toBe(false);
    expect(world.buildObservation(0).stalledVehicles).toEqual([]);
    expect(
      world.drainIncidentLog().map((entry) => entry.kind),
    ).toEqual(expect.arrayContaining(["STALL", "TOW_DISPATCH", "TOW_COMPLETE"]));
  });
});
