import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import { rewardTollForVehicle } from "../src/core/vehicleRoster.js";
import { VehicleLedger } from "../src/replay/vehicle-ledger.js";

describe("vehicle ledger", () => {
  it("settles the exit toll once, on the first outbound frame", () => {
    const world = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 1,
      dynamics: {
        stallModulus: 1_000_000,
        exitHoldModulus: 1_000_000,
        crosswalkModulus: 1_000_000,
        creepAfterWaitingTicks: 100,
      },
    });
    const vehicle = world.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    if (vehicle === undefined) {
      throw new Error("expected a sedan");
    }
    for (let tick = 0; tick < 80 && vehicle.state !== "AT_STOPLINE"; tick += 1) {
      world.step();
    }
    expect(vehicle.state).toBe("AT_STOPLINE");

    const ledger = new VehicleLedger();
    const toll = (type: typeof vehicle.type): number =>
      rewardTollForVehicle(type, 20, 50, 100);
    vehicle.stationaryTicks = 10;
    ledger.applyCharges(world.vehicleWaitingCharges(0.02));
    expect(ledger.scoreFor(vehicle.id)?.scorePhase).toBe("charging");
    expect(ledger.scoreFor(vehicle.id)?.score).toBeCloseTo(-0.02);

    world.applyAdmissions([vehicle.id]);
    let settledAtOutbound = false;
    for (let tick = 0; tick < 80 && vehicle.state !== "DESPAWNED"; tick += 1) {
      ledger.applyCharges(world.vehicleWaitingCharges(0.02));
      world.step();
      const wasCharging = ledger.scoreFor(vehicle.id)?.scorePhase === "charging";
      const beforeToll = ledger.scoreFor(vehicle.id)?.score ?? 0;
      ledger.settleOutbound(world.vehicles.values(), toll);
      if (wasCharging && vehicle.state === "OUTBOUND") {
        settledAtOutbound = true;
        const settled = ledger.scoreFor(vehicle.id);
        expect(settled?.scorePhase).toBe("settled");
        expect(settled?.score).toBeCloseTo(beforeToll + 50);
        break;
      }
    }
    expect(settledAtOutbound).toBe(true);
    const settled = ledger.scoreFor(vehicle.id);
    expect(settled?.scorePhase).toBe("settled");
    expect(settled?.score).toBeCloseTo(49.98);
    ledger.settleOutbound(
      [{ id: vehicle.id, type: "SEDAN", state: "OUTBOUND" }],
      toll,
    );
    expect(ledger.scoreFor(vehicle.id)?.score).toBeCloseTo(settled?.score ?? 0);
  });

  it("does not open a ledger for a vehicle that never incurred a charge", () => {
    const ledger = new VehicleLedger();
    ledger.settleOutbound(
      [{ id: "fresh", type: "SEDAN", state: "OUTBOUND" }],
      () => 10,
    );
    expect(ledger.scoreFor("fresh")).toBeUndefined();
  });

  it("settles a charged actor without adding a reward", () => {
    const ledger = new VehicleLedger();
    ledger.applyCharges([{ vehicleId: "pedestrian", amount: 0.04 }]);
    ledger.settleActors(["pedestrian"]);

    expect(ledger.scoreFor("pedestrian")).toEqual({
      score: -0.04,
      scorePhase: "settled",
    });
  });

  it("adds the motorcycle toll when an already charged bike reaches outbound", () => {
    const ledger = new VehicleLedger();
    ledger.applyCharges([{ vehicleId: "bike", amount: 0.15 }]);
    ledger.settleOutbound(
      [{ id: "bike", type: "MOTORCYCLE", state: "CROSSING" }],
      (type) => rewardTollForVehicle(type, 20, 50, 100),
    );
    expect(ledger.scoreFor("bike")?.scorePhase).toBe("charging");
    expect(ledger.scoreFor("bike")?.score).toBeCloseTo(-0.15);
    ledger.settleOutbound(
      [{ id: "bike", type: "MOTORCYCLE", state: "OUTBOUND" }],
      (type) => rewardTollForVehicle(type, 20, 50, 100),
    );
    expect(ledger.scoreFor("bike")?.scorePhase).toBe("settled");
    expect(ledger.scoreFor("bike")?.score).toBeCloseTo(19.85);
  });
});
