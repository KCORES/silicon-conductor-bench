import { describe, expect, it } from "vitest";
import {
  DRIVER_PATIENCE_RANGES,
  EXEMPT_DRIVER_PATIENCE,
  driverPatienceLimit,
  violationForfeitsToll,
} from "../src/core/drivers.js";
import { DEFAULT_DYNAMICS, type EngineDynamics } from "../src/core/dynamics.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import type { Vehicle, VehicleType } from "../src/core/types.js";
import {
  passengersFor,
  rewardTollForVehicle,
  riskTagFor,
  temperamentFor,
} from "../src/core/vehicleRoster.js";
import { createReplayScene, resolveVehiclePose } from "../src/replay/geometry.js";
import { VehicleLedger } from "../src/replay/vehicle-ledger.js";

const TAXI = "kenney-cars:taxi";
const SEDAN = "city-builder:car_sedan";
const BUS = "simplepoly-city:Bus";
const SCHOOL_BUS = "simplepoly-urban:SPW_Vehicle_Land_School Bus";
const TANKER = "simplepoly-urban:SPW_Vehicle_Land_Truck Tanker";
const AMBULANCE = "kenney-cars:ambulance";

/** Turns off seeded stalls, exit holds and crosswalk holds so scenarios stay scripted. */
const QUIET: Partial<EngineDynamics> = {
  stallModulus: 1_000_003,
  exitHoldModulus: 1_000_003,
  crosswalkModulus: 1_000_003,
};

function engineWith(aggression: boolean): SimulationEngine {
  return new SimulationEngine({
    network: createRoadNetwork(),
    seed: 7,
    dynamics: { ...DEFAULT_DYNAMICS, ...QUIET, vehicleAggression: aggression },
  });
}

function spawn(engine: SimulationEngine, routeId: string, type: VehicleType): Vehicle {
  const vehicle = engine.spawnVehicle(routeId, type);
  if (vehicle === undefined) {
    throw new Error(`could not spawn ${type} on ${routeId}`);
  }
  return vehicle;
}

function stepUntil(engine: SimulationEngine, done: () => boolean, limit = 80): string[] {
  const reasons: string[] = [];
  for (let tick = 0; tick < limit && !done(); tick += 1) {
    const result = engine.step();
    if (result.interruptReason !== undefined) {
      reasons.push(result.interruptReason);
    }
  }
  return reasons;
}

function exhaust(vehicle: Vehicle): void {
  vehicle.driverWaitTicks = vehicle.driverPatienceLimit;
}

describe("passenger tiers", () => {
  it("weights tolls by passengers and tags risky vehicles", () => {
    expect(passengersFor(SEDAN)).toBe(1);
    expect(passengersFor(TAXI)).toBe(2);
    expect(passengersFor("kenney-cars:van")).toBe(8);
    expect(passengersFor(BUS)).toBe(40);
    expect(passengersFor(SCHOOL_BUS)).toBe(40);
    expect(passengersFor(TANKER)).toBe(3);
    expect(passengersFor("kenney-cars:delivery")).toBe(1);
    expect(passengersFor("city-builder:car_taxi")).toBe(2);
    expect(rewardTollForVehicle(BUS, 0.2, 0.1, 1)).toBeCloseTo(4);
    expect(rewardTollForVehicle(AMBULANCE, 0.2, 0.1, 1)).toBe(1);
    expect(rewardTollForVehicle("MOTORCYCLE", 0.2, 0.1, 1)).toBe(0.2);
    expect(riskTagFor(SCHOOL_BUS)).toBe("SCHOOL_BUS");
    expect(riskTagFor(TANKER)).toBe("HAZMAT");
    expect(riskTagFor(BUS)).toBeUndefined();
  });

  it("charges queue delay per passenger", () => {
    const engine = engineWith(false);
    const bus = spawn(engine, "N_S1_STRAIGHT", BUS);
    stepUntil(engine, () => bus.state === "AT_STOPLINE");
    stepUntil(engine, () => bus.stationaryTicks >= DEFAULT_DYNAMICS.waitingChargeGraceTicks + 1);
    const settlement = engine.collectWaitingSettlement(0.001);
    expect(settlement.totals.delay).toBeCloseTo(0.04);
  });

  it("settles unserved liability per passenger and skips tolls for rogue vehicles", () => {
    const engine = engineWith(false);
    spawn(engine, "N_S1_STRAIGHT", BUS);
    spawn(engine, "E_S1_STRAIGHT", TAXI);
    const terminal = engine.terminalSettlement(() => 1, 0.1);
    expect(terminal.unservedOnMap).toBe(2);
    expect(terminal.unservedPassengers).toBe(42);
    expect(terminal.unservedLiability).toBeCloseTo(4.2);
    expect(violationForfeitsToll("RED_LIGHT")).toBe(true);
    expect(violationForfeitsToll("TAILGATE")).toBe(true);
    expect(violationForfeitsToll("CUT_IN")).toBe(false);
    expect(violationForfeitsToll(undefined)).toBe(false);
  });

  it("settles rogue vehicles in the ledger without a toll", () => {
    const ledger = new VehicleLedger();
    ledger.applyCharges([
      { vehicleId: "A", amount: 0.5 },
      { vehicleId: "B", amount: 0.5 },
    ]);
    ledger.settleOutbound(
      [
        { id: "A", type: TAXI, state: "OUTBOUND" },
        { id: "B", type: TAXI, state: "OUTBOUND", violation: "RED_LIGHT" },
      ],
      () => 2,
    );
    expect(ledger.scoreFor("A")?.score).toBeCloseTo(1.5);
    expect(ledger.scoreFor("B")?.score).toBeCloseTo(-0.5);
  });
});

describe("driver patience", () => {
  it("draws deterministic limits inside each temperament band", () => {
    expect(temperamentFor(TAXI)).toBe("AGGRESSIVE");
    expect(temperamentFor(SEDAN)).toBe("NORMAL");
    expect(temperamentFor(BUS)).toBe("CALM");
    expect(temperamentFor(TANKER)).toBe("CALM");
    expect(temperamentFor(AMBULANCE)).toBe("EXEMPT");
    for (const temperament of ["AGGRESSIVE", "NORMAL", "CALM"] as const) {
      const [low, high] = DRIVER_PATIENCE_RANGES[temperament];
      for (let index = 0; index < 20; index += 1) {
        const limit = driverPatienceLimit(3, `V${index}`, temperament);
        expect(limit).toBeGreaterThanOrEqual(low);
        expect(limit).toBeLessThanOrEqual(high);
        expect(driverPatienceLimit(3, `V${index}`, temperament)).toBe(limit);
      }
    }
    expect(driverPatienceLimit(3, "V1", "EXEMPT")).toBe(EXEMPT_DRIVER_PATIENCE);
  });

  it("accumulates waiting ticks and warns before patience runs out", () => {
    const engine = engineWith(true);
    const taxi = spawn(engine, "N_S1_STRAIGHT", TAXI);
    stepUntil(engine, () => taxi.state === "AT_STOPLINE");
    const before = taxi.driverWaitTicks;
    engine.step();
    engine.step();
    expect(taxi.driverWaitTicks).toBe(before + 2);
    expect(engine.buildObservation(0).driverAlerts ?? []).toEqual([]);
    taxi.driverWaitTicks = taxi.driverPatienceLimit - 5;
    const alerts = engine.buildObservation(0).driverAlerts ?? [];
    expect(alerts).toEqual([
      {
        vehicleId: taxi.id,
        laneId: taxi.inboundLaneId,
        distanceToStopline: 0,
        temperament: "AGGRESSIVE",
        patienceRemaining: 5,
      },
    ]);
  });
});

describe("red-light runners", () => {
  it("runs an exhausted unscheduled head into the junction and forfeits its toll", () => {
    const engine = engineWith(true);
    const taxi = spawn(engine, "N_S1_STRAIGHT", TAXI);
    stepUntil(engine, () => taxi.state === "AT_STOPLINE");
    exhaust(taxi);
    const result = engine.step();
    expect(result.interruptReason).toContain(`VEHICLE_RED_LIGHT vehicle=${taxi.id}`);
    expect(result.enteredVehicleIds).toContain(taxi.id);
    expect(taxi.state).toBe("CROSSING");
    expect(taxi.violation).toBe("RED_LIGHT");
    expect(engine.aggressionSummary().redLight).toBe(1);
    const despawn = stepUntil(engine, () => !engine.vehicles.has(taxi.id), 120);
    expect(engine.vehicles.has(taxi.id)).toBe(false);
    expect(despawn.join(";")).not.toContain("VEHICLE_RED_LIGHT");
  });

  it("reports the violation on the despawn event", () => {
    const engine = engineWith(true);
    const taxi = spawn(engine, "N_S1_STRAIGHT", TAXI);
    stepUntil(engine, () => taxi.state === "AT_STOPLINE");
    exhaust(taxi);
    const events = [];
    for (let tick = 0; tick < 120 && engine.vehicles.has(taxi.id); tick += 1) {
      events.push(...engine.step().despawnEvents);
    }
    expect(events.find((event) => event.vehicleId === taxi.id)?.violation).toBe("RED_LIGHT");
  });

  it("carries the violation into replay poses", () => {
    const engine = engineWith(true);
    const taxi = spawn(engine, "N_S1_STRAIGHT", TAXI);
    stepUntil(engine, () => taxi.state === "AT_STOPLINE");
    const scene = createReplayScene(engine.network);
    expect(resolveVehiclePose(taxi, scene).violation).toBeUndefined();
    exhaust(taxi);
    engine.step();
    expect(resolveVehiclePose(taxi, scene).violation).toBe("RED_LIGHT");
  });

  it("keeps patient drivers, emergency vehicles and disabled runs at the stop line", () => {
    for (const [aggression, type, exhausted] of [
      [true, TAXI, false],
      [true, AMBULANCE, true],
      [false, TAXI, true],
    ] as const) {
      const engine = engineWith(aggression);
      const vehicle = spawn(engine, "N_S1_STRAIGHT", type);
      stepUntil(engine, () => vehicle.state === "AT_STOPLINE");
      if (exhausted) {
        exhaust(vehicle);
      }
      const reasons = stepUntil(engine, () => false, 5);
      expect(vehicle.state).toBe("AT_STOPLINE");
      expect(vehicle.violation).toBeUndefined();
      expect(reasons.join(";")).not.toContain("VEHICLE_RED_LIGHT");
    }
  });

  it("collides with crossing traffic it cannot see coming", () => {
    const engine = engineWith(true);
    const runner = spawn(engine, "N_S1_STRAIGHT", TAXI);
    const crossing = spawn(engine, "S_L1_LEFT", SEDAN);
    stepUntil(engine, () => runner.state === "AT_STOPLINE" && crossing.state === "AT_STOPLINE");
    engine.applyAdmissions([crossing.id]);
    exhaust(runner);
    const reasons = stepUntil(
      engine,
      () => engine.incidentSummaries().length > 0,
      40,
    );
    expect(reasons.join(";")).toContain("VEHICLE_RED_LIGHT");
    expect(runner.state).toBe("ACCIDENT_STOPPED");
    expect(crossing.state).toBe("ACCIDENT_STOPPED");
  });

  it("keeps a doomed runner's path visible to later dry runs", () => {
    const engine = engineWith(true);
    const runner = spawn(engine, "N_S1_STRAIGHT", TAXI);
    const crossing = spawn(engine, "S_L1_LEFT", SEDAN);
    const later = spawn(engine, "W_L1_LEFT", SEDAN);
    stepUntil(
      engine,
      () =>
        runner.state === "AT_STOPLINE" &&
        crossing.state === "AT_STOPLINE" &&
        later.state === "AT_STOPLINE",
    );
    engine.applyAdmissions([crossing.id]);
    exhaust(runner);
    engine.step();
    expect(runner.violation).toBe("RED_LIGHT");
    const result = engine.dryRunAdmissions([later.id]).batch.results[0];
    expect(result?.status).toBe("SAFETY_REJECTED");
    expect(result?.conflictingVehicleId).toBe(runner.id);
  });

  it("revokes scheduled admissions whose path the runner takes", () => {
    const engine = engineWith(true);
    const runner = spawn(engine, "N_S1_STRAIGHT", TAXI);
    const first = spawn(engine, "W_S1_STRAIGHT", SEDAN);
    stepUntil(engine, () => false, 6);
    const second = spawn(engine, "W_S1_STRAIGHT", SEDAN);
    stepUntil(
      engine,
      () =>
        runner.state === "AT_STOPLINE" &&
        first.state === "AT_STOPLINE" &&
        second.stationaryTicks > 0,
    );
    engine.commitSchedule([], [{ laneId: first.inboundLaneId, topN: 2 }], []);
    exhaust(runner);
    const revocations = [];
    for (let tick = 0; tick < 10; tick += 1) {
      engine.step();
      revocations.push(...(engine.buildObservation(0).revokedAdmissions ?? []));
    }
    expect(runner.violation).toBe("RED_LIGHT");
    expect(
      revocations.some(
        (item) =>
          item.reason === "RED_LIGHT_RUNNER" && item.vehicleIds.includes(second.id),
      ),
    ).toBe(true);
    expect(second.state).toBe("AT_STOPLINE");
    expect(engine.incidentSummaries()).toEqual([]);
  });
});

describe("tailgaters", () => {
  it("flags followers in dry runs and lets them chase the last released vehicle", () => {
    const engine = engineWith(true);
    const leader = spawn(engine, "N_S1_STRAIGHT", SEDAN);
    stepUntil(engine, () => leader.inboundHeadSlot >= 8);
    const follower = spawn(engine, "N_S1_STRAIGHT", TAXI);
    stepUntil(engine, () => leader.state === "AT_STOPLINE");
    stepUntil(engine, () => follower.stationaryTicks > 0);
    exhaust(follower);
    follower.driverWaitTicks = follower.driverPatienceLimit - 3;
    expect(engine.tailgateRisk([leader.id])).toEqual([
      { vehicleId: follower.id, laneId: leader.inboundLaneId, behindVehicleId: leader.id },
    ]);
    engine.applyAdmissions([leader.id]);
    const reasons = stepUntil(engine, () => follower.state === "CROSSING", 20);
    expect(follower.violation).toBe("TAILGATE");
    expect(follower.state).toBe("CROSSING");
    expect(reasons.join(";")).toContain(`VEHICLE_TAILGATE vehicle=${follower.id}`);
    expect(engine.aggressionSummary().tailgate).toBe(1);
  });

  it("does not tailgate when the follower is released in the same batch", () => {
    const engine = engineWith(true);
    const leader = spawn(engine, "N_S1_STRAIGHT", SEDAN);
    stepUntil(engine, () => leader.inboundHeadSlot >= 8);
    const follower = spawn(engine, "N_S1_STRAIGHT", TAXI);
    stepUntil(engine, () => leader.state === "AT_STOPLINE");
    stepUntil(engine, () => follower.stationaryTicks > 0);
    exhaust(follower);
    engine.commitSchedule([], [{ laneId: leader.inboundLaneId, topN: 2 }], []);
    stepUntil(engine, () => follower.state === "CROSSING", 30);
    expect(follower.state).toBe("CROSSING");
    expect(follower.violation).toBeUndefined();
    expect(engine.aggressionSummary().tailgate).toBe(0);
  });
});

describe("cut-ins", () => {
  it("lets exhausted drivers in the guidance zone jump to a shorter adjacent queue", () => {
    const engine = engineWith(true);
    const queue: Vehicle[] = [];
    for (let index = 0; index < 8; index += 1) {
      const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", SEDAN);
      if (vehicle !== undefined) {
        queue.push(vehicle);
      }
      stepUntil(engine, () => false, 4);
    }
    stepUntil(engine, () => false, 20);
    for (const vehicle of queue.slice(1)) {
      exhaust(vehicle);
    }
    const reasons = stepUntil(engine, () => engine.aggressionSummary().cutIn > 0, 10);
    const jumper = queue.find((vehicle) => vehicle.violation === "CUT_IN");
    expect(jumper).toBeDefined();
    expect(jumper?.inboundLaneId).not.toBe(queue[0]?.inboundLaneId);
    expect(reasons.join(";")).not.toContain("CUT_IN");
  });
});

describe("risk vehicles", () => {
  function runIntoLeftTurner(runnerType: VehicleType, hazmat = 3): SimulationEngine {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 7,
      dynamics: {
        ...DEFAULT_DYNAMICS,
        ...QUIET,
        vehicleAggression: true,
        hazmatHazardMultiplier: hazmat,
      },
    });
    const runner = spawn(engine, "N_S1_STRAIGHT", runnerType);
    const crossing = spawn(engine, "S_L1_LEFT", SEDAN);
    stepUntil(engine, () => runner.state === "AT_STOPLINE" && crossing.state === "AT_STOPLINE");
    engine.applyAdmissions([crossing.id]);
    exhaust(runner);
    stepUntil(engine, () => engine.incidentSummaries().length > 0, 40);
    return engine;
  }

  it("counts school bus accidents once", () => {
    const engine = runIntoLeftTurner(SCHOOL_BUS);
    expect(engine.incidentSummaries().length).toBeGreaterThan(0);
    expect(engine.consumeSchoolBusAccidents()).toBe(1);
    expect(engine.consumeSchoolBusAccidents()).toBe(0);
  });

  it("multiplies hazard charges for incidents involving a tanker", () => {
    const tripled = runIntoLeftTurner(TANKER, 3);
    const plain = runIntoLeftTurner(TANKER, 1);
    expect(tripled.incidentSummaries().length).toBeGreaterThan(0);
    const tripledHazard = tripled.hazardResourceUnits();
    const plainHazard = plain.hazardResourceUnits();
    expect(plainHazard).toBeGreaterThan(0);
    expect(tripledHazard).toBeCloseTo(plainHazard * 3);
  });
});

describe("checkpoints", () => {
  it("round-trips patience, violations and aggression counters", () => {
    const engine = engineWith(true);
    const taxi = spawn(engine, "N_S1_STRAIGHT", TAXI);
    stepUntil(engine, () => taxi.state === "AT_STOPLINE");
    exhaust(taxi);
    engine.step();
    const restored = engineWith(true);
    restored.restoreCheckpoint(structuredClone(engine.exportCheckpoint()));
    const copy = restored.vehicles.get(taxi.id);
    expect(copy?.violation).toBe("RED_LIGHT");
    expect(copy?.driverPatienceLimit).toBe(taxi.driverPatienceLimit);
    expect(copy?.driverWaitTicks).toBe(taxi.driverWaitTicks);
    expect(restored.aggressionSummary()).toEqual(engine.aggressionSummary());
  });
});
