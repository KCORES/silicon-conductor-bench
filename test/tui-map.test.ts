import { describe, expect, it } from "vitest";
import { CITY_WORLD_EXTENT } from "../apps/replay/src/scene/city/cityConstants.js";
import { STOP_LINE_DISTANCE } from "../apps/replay/src/scene/mainRoadMarkings.js";
import { approachLaneLength } from "../src/core/approach-length.js";
import { createRoadNetwork } from "../src/core/network.js";
import { SimulationEngine } from "../src/core/engine.js";
import { formatBenchTrace, traceIsHot } from "../src/tui/format-trace.js";
import { emptyRadar, radarFrom } from "../src/tui/radar.js";
import { formatDuration, sidebarRows } from "../src/tui/render-console.js";
import { benchTiming } from "../src/tui/live-session.js";
import {
  VIEWPORT_X_MAX,
  VIEWPORT_X_MIN,
  VIEWPORT_Z_MAX,
  VIEWPORT_Z_MIN,
  intersectionGlyph,
  renderIntersection,
} from "../src/tui/render-intersection.js";

const NORTH_STOP_X = -3;
const NORTH_STOP_Z = -7;

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function cell(map: string, x: number, z: number): string {
  const lines = stripAnsi(map).split("\n");
  const row = lines[Math.round(z) - VIEWPORT_Z_MIN];
  const start = (Math.round(x) - VIEWPORT_X_MIN) * 2;
  return row?.slice(start, start + 2) ?? "  ";
}

function engine(): SimulationEngine {
  return new SimulationEngine({
    network: createRoadNetwork(),
    seed: 1,
    dynamics: {
      stallModulus: 1_000_000,
      creepAfterWaitingTicks: 100,
    },
  });
}

function driveToStopline(world: SimulationEngine, routeId: "N_S1_STRAIGHT" | "N_S2_STRAIGHT", type: "MOTORCYCLE" | "city-builder:car_police") {
  const vehicle = world.spawnVehicle(routeId, type);
  expect(vehicle).toBeDefined();
  if (vehicle === undefined) {
    throw new Error("spawn failed");
  }
  for (let step = 0; step < 40 && vehicle.state !== "AT_STOPLINE"; step += 1) {
    world.step();
  }
  return vehicle;
}

describe("ascii intersection", () => {
  it("paints a double-width stop line and the east approach", () => {
    const map = renderIntersection(createRoadNetwork(), []);
    const plain = stripAnsi(map).split("\n");
    expect(plain).toHaveLength(VIEWPORT_Z_MAX - VIEWPORT_Z_MIN + 1);
    expect(plain[0]?.length).toBe((VIEWPORT_X_MAX - VIEWPORT_X_MIN + 1) * 2);
    expect(cell(map, NORTH_STOP_X, NORTH_STOP_Z)).toBe("══");
    expect(cell(map, 7, -2)).toBe("║ ");
    expect(cell(map, 7, -2)).not.toBe("  ");
  });

  it("keeps all four inbound approaches on their correct side of the centerline", () => {
    const map = renderIntersection(createRoadNetwork(), []);
    for (const x of [-4, -3, -2, -1]) {
      expect(cell(map, x, -7)).toBe("══");
    }
    for (const z of [-4, -3, -2, -1]) {
      expect(cell(map, 7, z)).toBe("║ ");
    }
    for (const x of [0, 1, 2, 3]) {
      expect(cell(map, x, 7)).toBe("══");
    }
    for (const z of [0, 1, 2, 3]) {
      expect(cell(map, -7, z)).toBe("║ ");
    }
    expect(cell(map, 0, -7)).not.toBe("══");
    expect(cell(map, 7, 0)).not.toBe("║ ");
  });

  it("paints a vehicle waiting on the north stop line", () => {
    const world = engine();
    const vehicle = driveToStopline(world, "N_S1_STRAIGHT", "MOTORCYCLE");
    expect(vehicle.state).toBe("AT_STOPLINE");

    const map = renderIntersection(world.network, world.vehicles.values());
    expect(cell(map, NORTH_STOP_X, NORTH_STOP_Z)).toBe("■■");
  });

  it("uses stall, accident, exit-blocked, and evacuation glyphs", () => {
    const world = engine();
    const vehicle = driveToStopline(world, "N_S1_STRAIGHT", "MOTORCYCLE");

    vehicle.state = "STALLED";
    expect(cell(renderIntersection(world.network, world.vehicles.values()), NORTH_STOP_X, NORTH_STOP_Z)).toBe("XX");

    vehicle.state = "ACCIDENT_STOPPED";
    vehicle.trajectoryHeadSlot = 0;
    expect(cell(renderIntersection(world.network, world.vehicles.values()), NORTH_STOP_X, NORTH_STOP_Z)).toBe("!!");

    vehicle.state = "EXIT_BLOCKED";
    expect(cell(renderIntersection(world.network, world.vehicles.values()), NORTH_STOP_X, NORTH_STOP_Z)).toBe("##");

    vehicle.state = "EVACUATING";
    expect(cell(renderIntersection(world.network, world.vehicles.values()), NORTH_STOP_X, NORTH_STOP_Z)).toBe(">>");
  });

  it("draws a creep arrow on the encroaching head", () => {
    const world = engine();
    const vehicle = driveToStopline(world, "N_S1_STRAIGHT", "MOTORCYCLE");
    vehicle.encroaching = true;
    expect(cell(renderIntersection(world.network, world.vehicles.values()), NORTH_STOP_X, NORTH_STOP_Z)).toBe("▼▼");
  });

  it("draws an emergency vehicle queued behind the lane head", () => {
    const world = engine();
    driveToStopline(world, "N_S1_STRAIGHT", "MOTORCYCLE");
    const police = world.spawnVehicle("N_S1_STRAIGHT", "city-builder:car_police");
    expect(police).toBeDefined();
    if (police === undefined) {
      return;
    }
    for (let step = 0; step < 40 && police.inboundHeadSlot < 22; step += 1) {
      world.step();
    }
    expect(police.state).not.toBe("AT_STOPLINE");
    const map = renderIntersection(world.network, world.vehicles.values());
    expect(cell(map, NORTH_STOP_X, NORTH_STOP_Z)).toBe("■■");
    expect(stripAnsi(map)).toContain("EE");
  });

  it("paints an active crosswalk and an upstream badge on an empty edge", () => {
    const network = createRoadNetwork();
    const held = renderIntersection(network, [], undefined, {
      crosswalkHolds: [{ laneId: "N_R1_RIGHT", occupied: true, blockedUntilTick: 40 }],
      upstreamQueues: [{ laneId: "IN_N_S1_STRAIGHT", waiting: 3 }],
    });
    expect(cell(held, 0, -6)).toBe("≈≈");
    expect(cell(held, NORTH_STOP_X, VIEWPORT_Z_MIN)).toBe("+3");

    const quiet = renderIntersection(network, [], undefined, {
      crosswalkHolds: [{ laneId: "N_R1_RIGHT", occupied: false, blockedUntilTick: 40 }],
    });
    expect(cell(quiet, 0, -6)).not.toBe("≈≈");
  });

  it("maps vehicle classes to body glyphs", () => {
    expect(intersectionGlyph("QUEUED", "MOTORCYCLE")).toBe("■■");
    expect(intersectionGlyph("QUEUED", "kenney-cars:van")).toBe("██");
    expect(intersectionGlyph("QUEUED", "kenney-cars:delivery")).toBe("██");
    expect(intersectionGlyph("QUEUED", "simplepoly-city:Bus")).toBe("██");
    expect(intersectionGlyph("QUEUED", "city-builder:car_police")).toBe("EE");
  });
});

describe("bench console", () => {
  it("keeps a 24-row sidebar and highlights convoy tools", () => {
    const rows = sidebarRows({
      cycle: 1,
      cycleCount: 4,
      tick: 3,
      seed: 7,
      balance: 1.5,
      phase: "advancing",
      tacticalSummary: "",
      interruptReason: "",
      radar: emptyRadar(),
      elapsedMs: 65_000,
      estimatedRemainingMs: 125_000,
    });
    expect(rows).toHaveLength(24);
    expect(rows.some((row) => row.kind === "text" && row.text.includes("N-S1"))).toBe(true);
    expect(rows.some((row) => row.kind === "text" && row.text.includes("E-S1"))).toBe(true);
    expect(rows.some((row) => row.kind === "phase" && !row.thinking)).toBe(true);
    expect(
      rows.some(
        (row) =>
          row.kind === "text" &&
          row.text.includes("elapsed 00:01:05  eta 00:02:05"),
      ),
    ).toBe(true);

    const convoy = formatBenchTrace(
      '[agent-api] TOOL_CALL tick=1 cycle=1 round=1\n{"toolName":"dispatch_emergency_convoy"}',
    );
    expect(convoy).toBe("tool dispatch_emergency_convoy");
    expect(traceIsHot(convoy)).toBe(true);
    expect(traceIsHot(formatBenchTrace('{"toolName":"reroute_queue_around_stall"}'))).toBe(true);
    expect(traceIsHot(formatBenchTrace('{"toolName":"commit_schedule"}'))).toBe(false);
    expect(
      formatBenchTrace(
        '{"toolName":"commit_schedule","arguments":{"vehicle_speed_profiles":[{"speed_profile":"BURST"}],"lane_batches":[{"speed_profile":"SLOW_SLIDE"}]}}',
      ),
    ).toBe("tool commit_schedule speed BURST/SLOW_SLIDE");

    const radar = radarFrom(
      {
        currentTick: 1,
        financialBalance: 0,
        stoplineCandidates: [],
        blockedRoutes: [],
        candidateConflicts: [],
        candidateConflictScope: "STOPLINE_HEADS_SAME_TICK",
        lanePressureSignals: [],
        workingMemoryTop: {
          phaseName: "clear",
          targetTick: 20,
          isExpired: false,
          depth: 1,
        },
        emergencyAlerts: [],
        emergencyNotices: [],
        stalledVehicles: [],
        activeLaneHolds: [],
        exitHolds: [{ laneId: "OUT_SOUTH_1", occupied: false, blockedUntilTick: 9 }],
        crosswalkHolds: [],
        upstreamQueues: [],
        crosswalks: [
          {
            crosswalkId: "CROSSWALK:NORTH",
            directions: [
              {
                direction: "A_TO_B",
                approaching: 0,
                waiting: 3,
                crossing: 1,
                minPatienceRemaining: 4,
                clearTick: 18,
                jaywalking: 1,
              },
              {
                direction: "B_TO_A",
                approaching: 0,
                waiting: 0,
                crossing: 0,
                minPatienceRemaining: null,
                clearTick: null,
                jaywalking: 0,
              },
            ],
          },
        ],
        pedestrianAlerts: [],
      },
      [],
    );
    expect(radar.exits).toEqual([]);
    expect(radar.memory?.phaseName).toBe("clear");
    expect(radar.crosswalks).toEqual([
      "PX NORTH A>B w3 x1 p4 j1",
      "PX NORTH B>A w0 x0 p- j0",
    ]);
    expect(radar.lanes).toHaveLength(16);
  });

  it("estimates remaining wall time from completed cycle throughput", () => {
    expect(formatDuration(3_661_999)).toBe("01:01:01");
    expect(
      benchTiming(
        {
          startedAtMs: 1_000,
          completedCycles: 0,
          completedAtMs: 1_000,
          cycleCount: 10,
        },
        6_000,
      ),
    ).toEqual({ elapsedMs: 5_000, estimatedRemainingMs: null });
    expect(
      benchTiming(
        {
          startedAtMs: 1_000,
          completedCycles: 2,
          completedAtMs: 21_000,
          cycleCount: 10,
        },
        26_000,
      ),
    ).toEqual({ elapsedMs: 25_000, estimatedRemainingMs: 75_000 });
  });

  it("leaves vehicles in the long approach outside the ascii map", () => {
    const length = approachLaneLength(CITY_WORLD_EXTENT, STOP_LINE_DISTANCE);
    const network = createRoadNetwork({
      inboundLaneLength: length,
      outboundLaneLength: length,
    });
    const sim = new SimulationEngine({
      network,
      seed: 1,
      dynamics: { stallModulus: 1_000_000, creepAfterWaitingTicks: 100 },
    });
    const spawned = sim.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    expect(spawned).toBeDefined();
    const empty = stripAnsi(renderIntersection(network, []));
    const withApproach = stripAnsi(renderIntersection(network, sim.vehicles.values()));
    expect(withApproach).toBe(empty);
    expect(withApproach.split("\n")).toHaveLength(
      VIEWPORT_Z_MAX - VIEWPORT_Z_MIN + 1,
    );
  });
});
