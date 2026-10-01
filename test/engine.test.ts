import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";

function moveAllVehiclesToStoplines(engine: SimulationEngine): void {
  for (let tick = 0; tick < 30; tick += 1) {
    engine.step();
  }
}

describe("simulation engine", () => {
  it("moves a vehicle through its complete lifecycle", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({ network, seed: 7 });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    expect(vehicle).toBeDefined();

    moveAllVehiclesToStoplines(engine);
    expect(vehicle?.state).toBe("AT_STOPLINE");

    const admission = engine.applyAdmissions([vehicle?.id ?? "missing"]);
    expect(admission.admittedVehicleIds).toEqual([vehicle?.id]);
    expect(vehicle?.state).toBe("CROSSING");

    const events = [];
    for (let tick = 0; tick < 100 && engine.vehicles.size > 0; tick += 1) {
      events.push(...engine.step().despawnEvents);
    }

    expect(engine.vehicles.size).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.vehicleId).toBe(vehicle?.id);
  });

  it("does not despawn a sedan until its tail crosses the outbound boundary", () => {
    const network = createRoadNetwork({ outboundLaneLength: 15 });
    const engine = new SimulationEngine({ network });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    expect(vehicle).toBeDefined();
    moveAllVehiclesToStoplines(engine);
    engine.applyAdmissions([vehicle?.id ?? "missing"]);

    while (vehicle?.state !== "OUTBOUND") {
      engine.step();
    }
    while ((vehicle?.outboundHeadSlot ?? 0) < 15) {
      engine.step();
    }

    expect(vehicle?.outboundHeadSlot).toBe(15);
    expect(engine.vehicles.has(vehicle?.id ?? "missing")).toBe(true);
    engine.step();
    expect(engine.vehicles.has(vehicle?.id ?? "missing")).toBe(false);
  });

  it("admits a conflicting pair and schedules one fender-bender", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({ network });

    for (const routeId of network.trajectories.keys()) {
      engine.spawnVehicle(routeId, "MOTORCYCLE");
    }
    moveAllVehiclesToStoplines(engine);

    const observation = engine.buildObservation(0);
    const conflict = observation.candidateConflicts[0];
    expect(conflict).toBeDefined();
    if (conflict === undefined) {
      return;
    }

    const before = engine.getSnapshot();
    const dryRun = engine.dryRunAdmissions([
      conflict.vehicleIdA,
      conflict.vehicleIdB,
    ]);
    expect(dryRun.feasible).toBe(false);
    expect(dryRun.conflictDetected).toBeDefined();
    expect(engine.getSnapshot()).toEqual(before);
    expect(engine.incidentSummaries()).toEqual([]);

    const result = engine.applyAdmissions([
      conflict.vehicleIdA,
      conflict.vehicleIdB,
    ]);
    expect(result.admittedVehicleIds).toEqual([
      conflict.vehicleIdA,
      conflict.vehicleIdB,
    ]);
    expect(result.rejectedVehicleIds).toEqual([]);
    expect(engine.scheduledCollisionCount).toBe(1);

    let interrupt: string | undefined;
    for (let tick = 0; tick < 40 && interrupt === undefined; tick += 1) {
      interrupt = engine.step().interruptReason;
    }
    expect(interrupt).toMatch(/^ACCIDENT_INTERRUPT incident=INC0001 /);
    expect(engine.vehicles.get(conflict.vehicleIdA)?.state).toBe(
      "ACCIDENT_STOPPED",
    );
    expect(engine.vehicles.get(conflict.vehicleIdB)?.state).toBe(
      "ACCIDENT_STOPPED",
    );
    expect(engine.lockedResourceCount()).toBeGreaterThan(0);
  });

  it("rejects duplicate and invalid admission requests safely", () => {
    const network = createRoadNetwork();
    const engine = new SimulationEngine({ network });
    const vehicle = engine.spawnVehicle("W_S1_STRAIGHT", "MOTORCYCLE");
    expect(vehicle).toBeDefined();
    moveAllVehiclesToStoplines(engine);

    const result = engine.applyAdmissions([
      vehicle?.id ?? "missing",
      vehicle?.id ?? "missing",
      "unknown",
    ]);

    expect(result.results.map((entry) => entry.status)).toEqual([
      "ADMITTED",
      "SAFETY_REJECTED",
      "SAFETY_REJECTED",
    ]);
    expect(result.results[1]?.reason).toBe("DUPLICATE_REQUEST");
    expect(result.results[2]?.reason).toBe("UNKNOWN_VEHICLE");
  });

  it("rejects a route that does not belong to the physical inbound lane", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: { stallModulus: 1_000_000 },
    });
    const vehicle = engine.spawnVehicle("N_R1_RIGHT", "MOTORCYCLE");
    expect(vehicle).toBeDefined();
    moveAllVehiclesToStoplines(engine);
    if (vehicle === undefined) {
      return;
    }
    vehicle.routeId = "N_S1_STRAIGHT";
    vehicle.outboundLaneId =
      engine.network.trajectories.get("N_S1_STRAIGHT")?.outboundLaneId ??
      vehicle.outboundLaneId;

    const result = engine.applyAdmissions([vehicle.id]);
    expect(result.admittedVehicleIds).toEqual([]);
    expect(result.results[0]?.reason).toBe("LANE_ROUTE_MISMATCH");
    expect(vehicle.state).toBe("AT_STOPLINE");
  });

  it("is reproducible for the same seed", () => {
    const left = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 42,
    });
    const right = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 42,
    });

    for (let tick = 0; tick < 20; tick += 1) {
      left.spawnRandomVehicle();
      right.spawnRandomVehicle();
      left.step();
      right.step();
    }

    expect(left.getSnapshot()).toEqual(right.getSnapshot());
  });

  it("restores a checkpoint and continues like an uninterrupted engine", () => {
    const network = createRoadNetwork();
    const original = new SimulationEngine({ network, seed: 11 });
    for (let tick = 0; tick < 25; tick += 1) {
      original.spawnRandomVehicle();
      original.step();
    }
    const checkpoint = original.exportCheckpoint();
    const restored = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 11,
    });
    restored.restoreCheckpoint(checkpoint);
    expect(restored.exportCheckpoint()).toEqual(original.exportCheckpoint());

    for (let tick = 0; tick < 10; tick += 1) {
      original.step();
      restored.step();
    }
    expect(restored.exportCheckpoint()).toEqual(original.exportCheckpoint());
    expect(restored.getSnapshot()).toEqual(original.getSnapshot());
  });
});
