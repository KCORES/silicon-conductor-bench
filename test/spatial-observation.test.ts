import { describe, expect, it } from "vitest";
import { AgentMetricsCollector } from "../src/agent/metrics.js";
import {
  compactInterruptReason,
  compactObservationForModel,
  laneVehicleCounts,
} from "../src/agent/model-observation.js";
import {
  encodeCrosswalk,
  encodeCrosswalkReservations,
  encodeJunctionOccupancy,
  encodeJunctionReservations,
  encodeLane,
  vehicleLetter,
} from "../src/agent/spatial-encoding.js";
import {
  AGENT_TOOLS,
  AgentToolRuntime,
  INSPECT_JUNCTION,
} from "../src/agent/tools.js";
import { WorkingMemoryStack } from "../src/agent/working-memory.js";
import { arrivalsAt } from "../src/core/demand.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork, defaultRouteIds } from "../src/core/network.js";
import type { LaneSlotVehicle } from "../src/core/types.js";

function advance(engine: SimulationEngine, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    engine.step();
  }
}

function newMetrics(): AgentMetricsCollector {
  return new AgentMetricsCollector({
    decisionTax: 0.02,
    toolTax: 0.0015,
    recklessAttemptPenalty: 15,
    parallelTerminalWarningPenalty: 0.5,
  });
}

function runtimeFor(engine: SimulationEngine, metrics: AgentMetricsCollector) {
  return new AgentToolRuntime({
    engine,
    metrics,
    memory: new WorkingMemoryStack(),
    tollMotorcycle: 5,
    tollStandard: 20,
    tollEmergency: 50,
  });
}

describe("spatial encoding", () => {
  it("maps vehicle types to one letter per class and risk", () => {
    expect(vehicleLetter("MOTORCYCLE")).toBe("M");
    expect(vehicleLetter("city-builder:car_sedan")).toBe("P");
    expect(vehicleLetter("kenney-cars:taxi")).toBe("T");
    expect(vehicleLetter("simplepoly-city:Bus")).toBe("B");
    expect(vehicleLetter("simplepoly-urban:SPW_Vehicle_Land_School Bus")).toBe("S");
    expect(vehicleLetter("simplepoly-urban:SPW_Vehicle_Land_Truck Tanker")).toBe("H");
    expect(vehicleLetter("kenney-cars:ambulance")).toBe("E");
  });

  it("draws heads uppercase, bodies lowercase and trims trailing empty slots", () => {
    const vehicles: LaneSlotVehicle[] = [
      { vehicleId: "A", type: "simplepoly-city:Bus", headIndex: 1, lengthSlots: 4, scheduled: false },
      { vehicleId: "B", type: "MOTORCYCLE", headIndex: 6, lengthSlots: 1, scheduled: false },
    ];
    expect(encodeLane({ laneId: "IN", capacitySlots: 20, vehicles }, 1)).toBe(".Bbbb.M");
    expect(
      encodeLane(
        {
          laneId: "OUT",
          capacitySlots: 20,
          vehicles: [{ ...vehicles[0]!, headIndex: 5 }],
        },
        -1,
      ),
    ).toBe("..bbbB");
  });

  it("draws crosswalk cells as two rows of columns", () => {
    expect(
      encodeCrosswalk({
        crosswalkId: "CROSSWALK:NORTH",
        columns: 8,
        cells: [
          { row: 0, column: 0, mark: "c" },
          { row: 1, column: 7, mark: "x" },
        ],
      }),
    ).toEqual(["c.......", ".......x"]);
  });
});

describe("engine spatial snapshots", () => {
  it("lays out queued vehicles from the stopline outward", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    engine.spawnVehicle("N_S1_STRAIGHT", "city-builder:car_sedan");
    advance(engine, 30);
    engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    advance(engine, 30);
    const snapshot = engine.spatialSnapshot();
    const lane = snapshot.inbound.find((item) => item.laneId === "IN_N_S1_STRAIGHT");
    expect(lane?.vehicles[0]?.headIndex).toBe(0);
    expect(encodeLane(lane!, 1)).toMatch(/^Pp+M$/);
    expect(snapshot.inbound).toHaveLength(16);
    expect(snapshot.crosswalks).toHaveLength(4);
    expect(laneVehicleCounts(snapshot).get("IN_N_S1_STRAIGHT")).toBe(2);
  });

  it("shows crossing vehicles and their reservations on a north-up 15x15 grid", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "simplepoly-city:Bus");
    advance(engine, 40);
    expect(vehicle).toBeDefined();
    engine.commitSchedule([vehicle!.id], [], []);
    advance(engine, 4);

    const junction = engine.junctionSnapshot(6);
    const grid = encodeJunctionOccupancy(junction);
    const reserved = encodeJunctionReservations(junction);
    expect(grid).toHaveLength(15);
    expect(reserved).toHaveLength(15);
    expect(grid.join("")).toContain("B");
    expect(reserved.join("")).toContain("0");
    const [view] = junction.vehicles;
    expect(view).toMatchObject({
      vehicleId: vehicle!.id,
      routeId: "N_S1_STRAIGHT",
      state: "CROSSING",
      stale: false,
    });
    expect(view?.reservedUntilTick).toBeGreaterThan(engine.currentTick);
    const head = junction.vehicleCells.find((cell) => cell.head);
    expect(head).toBeDefined();
    const row = grid[head!.y - junction.minCoordinate] ?? "";
    expect(row[head!.x - junction.minCoordinate]).toBe("B");
  });

  it("reports vehicle reservations on the entry and exit crosswalks only", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("N_S1_STRAIGHT", "city-builder:car_sedan");
    advance(engine, 40);
    engine.commitSchedule([vehicle!.id], [], []);

    const until = new Map(
      engine
        .spatialSnapshot()
        .crosswalks.map((view) => [view.crosswalkId, view.vehicleReservedUntil]),
    );
    expect(until.get("CROSSWALK:NORTH")).toBeGreaterThanOrEqual(engine.currentTick);
    expect(until.get("CROSSWALK:SOUTH")).toBeGreaterThan(until.get("CROSSWALK:NORTH")!);
    expect(until.get("CROSSWALK:EAST")).toBeUndefined();
    expect(until.get("CROSSWALK:WEST")).toBeUndefined();

    const north = engine
      .junctionSnapshot(10)
      .crosswalkReservations.find((view) => view.crosswalkId === "CROSSWALK:NORTH");
    expect(north?.cells.length).toBeGreaterThan(0);
    const [row0, row1] = encodeCrosswalkReservations(north!);
    expect(row0).toHaveLength(8);
    expect(row1).toHaveLength(8);
    expect(`${row0}${row1}`).toMatch(/\d/);
  });

  it("puts every route on its entry crosswalk and the crosswalk of its exit side", () => {
    const network = createRoadNetwork();
    const crosswalkByCell = new Map<string, string>();
    for (const zone of network.crosswalks.values()) {
      for (const cell of zone.cells) {
        crosswalkByCell.set(cell.conflictResourceId, zone.id.split(":")[1]!.charAt(0));
      }
    }
    const exitSide: Record<string, Record<string, string>> = {
      STRAIGHT: { N: "S", S: "N", E: "W", W: "E" },
      RIGHT: { N: "W", E: "N", S: "E", W: "S" },
      LEFT: { N: "E", E: "S", S: "W", W: "N" },
    };
    for (const trajectory of network.trajectories.values()) {
      const entry = trajectory.id.charAt(0);
      const turn = trajectory.id.split("_").at(-1)!;
      const crossed = new Set(
        trajectory.slots.flatMap((slot) =>
          slot.conflictResourceIds.flatMap((id) => {
            const side = crosswalkByCell.get(id);
            return side === undefined ? [] : [side];
          }),
        ),
      );
      expect([...crossed].sort(), trajectory.id).toEqual(
        [entry, exitSide[turn]![entry]!].sort(),
      );
    }
  });
});

describe("inspect_junction", () => {
  it("is a billed non-terminal tool with a bounded horizon", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const metrics = new AgentMetricsCollector({
      decisionTax: 0.02,
      toolTax: 0.0015,
      recklessAttemptPenalty: 15,
      parallelTerminalWarningPenalty: 0.5,
    });
    const runtime = runtimeFor(engine, metrics);
    const result = runtime.execute(INSPECT_JUNCTION, "{}");
    expect(result.terminal).toBe(false);
    expect(result.output).toMatchObject({ horizon_ticks: 6, vehicles: [] });
    expect((result.output as { grid: string[] }).grid).toHaveLength(15);
    expect(metrics.snapshot().nonTerminalToolCalls).toBe(1);
    const tooFar = runtime.execute(INSPECT_JUNCTION, JSON.stringify({ horizon_ticks: 11 }));
    expect(tooFar.output).toMatchObject({ error: { code: "TOOL_EXECUTION_ERROR" } });
    expect(JSON.stringify(AGENT_TOOLS)).toContain(`"name":"${INSPECT_JUNCTION}"`);
    expect(metrics.snapshot().toolTaxCharged).toBeGreaterThan(0);
  });

  it("lists booked crosswalk cells and omits idle crosswalks", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("E_R1_RIGHT", "city-builder:car_sedan");
    advance(engine, 40);
    engine.commitSchedule([vehicle!.id], [], []);
    const runtime = runtimeFor(engine, newMetrics());
    const output = runtime.execute(INSPECT_JUNCTION, JSON.stringify({ horizon_ticks: 10 }))
      .output as { crosswalks?: Record<string, string[]> };
    expect(Object.keys(output.crosswalks ?? {}).sort()).toEqual(["E", "N"]);
    expect(output.crosswalks?.E?.join("")).toMatch(/\d/);
  });
});

describe("tool id aliases", () => {
  it("accepts route ids as lane ids and short crosswalk keys", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    engine.spawnVehicle("S_L1_LEFT", "city-builder:car_sedan");
    advance(engine, 40);
    const runtime = runtimeFor(engine, newMetrics());

    const lane = runtime.execute("inspect_lane_queue", JSON.stringify({ lane_id: "S_L1_LEFT" }));
    expect(lane.output).toMatchObject({ lane: "IN_S_L1_LEFT", n: 1 });

    for (const alias of ["N", "north", "CROSSWALK:N", "CROSSWALK:NORTH"]) {
      const crosswalk = runtime.execute(
        "inspect_crosswalk",
        JSON.stringify({ crosswalk_id: alias }),
      );
      expect(crosswalk.output).toMatchObject({ crosswalk_id: "CROSSWALK:NORTH" });
    }

    const dryRun = runtime.execute(
      "dry_run_admit",
      JSON.stringify({
        lane_batches: [{ lane_id: "S_L1_LEFT", top_n: 1 }],
        pedestrian_phases: [{ crosswalk_id: "E", directions: ["A_TO_B"] }],
      }),
    );
    expect(dryRun.output).toMatchObject({ ok: true });
  });

  it("documents the aliases in the tool schemas", () => {
    const tools = JSON.stringify(AGENT_TOOLS);
    expect(tools).toContain("也接受路线 ID");
    expect(tools).toContain("也接受观测 crosswalks 的短键");
  });
});

describe("compressed model observation", () => {
  it("collapses accident lock lists to a count", () => {
    expect(
      compactInterruptReason(
        "ACCIDENT_INTERRUPT incident=INC0001 locked=SPACE:1:2,SPACE:1:3,PAIR:a|b vehicles=V1,V2",
      ),
    ).toBe("ACCIDENT_INTERRUPT incident=INC0001 locked=3 vehicles=V1,V2");
  });

  it("reports per-lane net change against the previous cycle", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    engine.spawnVehicle("E_S1_STRAIGHT", "MOTORCYCLE");
    advance(engine, 30);
    const snapshot = engine.spatialSnapshot();
    const compact = compactObservationForModel(engine.buildObservation(0), undefined, {
      snapshot,
      previousLaneCounts: new Map([["IN_E_S1_STRAIGHT", 3]]),
    });
    const lanes = compact.lanes as Record<string, unknown[]>;
    expect(lanes.IN_E_S1_STRAIGHT).toEqual(["M", 1, 0, 0, -2]);
    expect(Object.keys(lanes)).toEqual(["IN_E_S1_STRAIGHT"]);
  });

  it("appends the vehicle reservation end tick to booked crosswalks", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = engine.spawnVehicle("W_R1_RIGHT", "city-builder:car_sedan");
    advance(engine, 40);
    engine.commitSchedule([vehicle!.id], [], []);
    const compact = compactObservationForModel(engine.buildObservation(0), undefined, {
      snapshot: engine.spatialSnapshot(),
    });
    const crosswalks = compact.crosswalks as Record<string, unknown[]>;
    expect(crosswalks.W).toHaveLength(4);
    expect(crosswalks.W?.[3]).toBeGreaterThanOrEqual(engine.currentTick);
    expect(crosswalks.S).toHaveLength(4);
    expect(crosswalks.N).toHaveLength(3);
  });

  it("keeps a busy seeded observation under 9k characters", () => {
    const seed = 63916;
    const engine = new SimulationEngine({ network: createRoadNetwork(), seed });
    const routes = defaultRouteIds(engine.network);
    for (let tick = 0; tick < 120; tick += 1) {
      engine.drainUpstreamQueues();
      for (const arrival of arrivalsAt(seed, engine.currentTick, routes)) {
        engine.spawnScheduled(arrival);
      }
      engine.generatePedestrianDemand();
      engine.step();
    }
    const observation = engine.buildObservation(1000);
    const compact = compactObservationForModel(observation, 320, {
      snapshot: engine.spatialSnapshot(),
    });
    const size = JSON.stringify(compact).length;
    expect(size).toBeLessThanOrEqual(9000);
    expect(size).toBeLessThan(JSON.stringify(observation).length / 2);
    expect(Object.keys(compact.lanes as object).length).toBeGreaterThan(0);
    expect(compact.crosswalks).toHaveProperty("N");
  });
});
