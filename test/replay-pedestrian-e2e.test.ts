import { describe, expect, it } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import type {
  PedestrianEconomyRates,
  PedestrianSettlement,
} from "../src/core/types.js";
import { ReplayRecorder } from "../src/replay/recorder.js";
import { REPLAY_SCHEMA_VERSION } from "../src/replay/types.js";

const RATES: PedestrianEconomyRates = {
  delayPerTick: 0.02,
  waitingGraceTicks: 10,
  completionReward: 4,
  jaywalkWavePenalty: 50,
  jaywalkerPenalty: 10,
  collisionPenalty: 500,
};

describe("pedestrian engine to replay integration", () => {
  it("records a fixed-seed waiting, grant, crossing, and clear lifecycle", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 63916,
      dynamics: { stallModulus: 1_000_000 },
    });
    const recorder = createRecorder(engine, "normal");
    const pedestrian = engine.spawnScheduledPedestrian({
      id: "mini-normal-pedestrian",
      tick: 0,
      slot: 0,
      crosswalkId: "CROSSWALK:NORTH",
      direction: "A_TO_B",
    });
    expect(pedestrian).toBeDefined();

    flushEngineEvents(engine, recorder);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
    );
    for (
      let step = 0;
      pedestrian?.state === "APPROACHING" && step < 256;
      step += 1
    ) {
      engine.step();
      recorder.recordFrame(
        engine.currentTick,
        engine.vehicles.values(),
        engine.pedestrians.values(),
        "tick",
      );
    }
    expect(pedestrian?.state).toBe("WAITING");
    expect(
      engine.grantPedestrianPhase("CROSSWALK:NORTH", ["A_TO_B"]),
    ).toMatchObject({
      ok: true,
      pedestrianIds: ["mini-normal-pedestrian"],
    });
    flushEngineEvents(engine, recorder);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "decision",
    );

    const settlements: PedestrianSettlement[] = [];
    for (
      let step = 0;
      pedestrian?.state !== "CLEARED" && step < 256;
      step += 1
    ) {
      engine.step();
      flushEngineEvents(engine, recorder);
      settlements.push(engine.collectPedestrianSettlement(RATES));
      recorder.recordFrame(
        engine.currentTick,
        engine.vehicles.values(),
        engine.pedestrians.values(),
        "tick",
      );
    }

    const bundle = recorder.finalize();
    expect(bundle.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
    expect(bundle.seed).toBe(63916);
    expect(bundle.frames[0]?.pedestrians).toMatchObject([
      { id: "mini-normal-pedestrian", state: "APPROACHING" },
    ]);
    expect(
      bundle.frames.some((frame) =>
        frame.pedestrians?.some(
          (pose) =>
            pose.id === "mini-normal-pedestrian" &&
            pose.state === "CROSSING_RESERVED" &&
            pose.row === 0 &&
            pose.column === 0,
        ),
      ),
    ).toBe(true);
    expect(
      bundle.frames.some((frame) =>
        frame.pedestrians?.some(
          (pose) =>
            pose.id === "mini-normal-pedestrian" &&
            pose.state === "CROSSING_RESERVED" &&
            (pose.column ?? 0) > 0,
        ),
      ),
    ).toBe(true);
    expect(bundle.frames.at(-1)?.pedestrians).toEqual([]);
    expect(bundle.events.map((event) => event.kind)).toEqual([
      "PED_SPAWN",
      "PED_GRANT",
      "PED_CLEAR",
    ]);
    expect(
      settlements.reduce(
        (sum, settlement) => sum + settlement.completedPedestrians,
        0,
      ),
    ).toBe(1);
    expect(
      settlements.reduce(
        (sum, settlement) => sum + settlement.completionRevenue,
        0,
      ),
    ).toBe(RATES.completionReward);
  });

  it("records real jaywalk, collision, injury, and accident clearance", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 63916,
      dynamics: { stallModulus: 1_000_000 },
    });
    const recorder = createRecorder(engine, "collision");
    const crosswalk = engine.network.crosswalks.get("CROSSWALK:NORTH");
    const cell = crosswalk?.cells.find(
      (candidate) => candidate.row === 0 && candidate.column === 0,
    );
    const slotId = cell?.vehicleSlotIds[0];
    expect(crosswalk).toBeDefined();
    expect(cell).toBeDefined();
    expect(slotId).toBeDefined();
    if (crosswalk === undefined || cell === undefined || slotId === undefined) {
      return;
    }

    const pedestrian = engine.spawnScheduledPedestrian({
      id: "mini-jaywalker",
      tick: 0,
      slot: 0,
      crosswalkId: crosswalk.id,
      direction: "A_TO_B",
    });
    expect(pedestrian).toBeDefined();
    if (pedestrian === undefined) {
      return;
    }
    for (
      let step = 0;
      pedestrian.state === "APPROACHING" && step < 256;
      step += 1
    ) {
      engine.step();
      recorder.recordFrame(
        engine.currentTick,
        engine.vehicles.values(),
        engine.pedestrians.values(),
        "tick",
      );
    }
    expect(pedestrian.state).toBe("WAITING");
    pedestrian.waitingTicks = pedestrian.patienceLimit - 1;
    flushEngineEvents(engine, recorder);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
    );

    engine.step();
    flushEngineEvents(engine, recorder);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
    );
    expect(pedestrian.state).toBe("CROSSING_JAYWALK");
    expect(pedestrian.row).toBe(0);
    expect(pedestrian.column).toBe(0);
    pedestrian.nextMoveTick = engine.currentTick + 20;

    const separator = slotId.lastIndexOf(":");
    const routeId = slotId.slice(0, separator);
    const targetSlot = Number(slotId.slice(separator + 1));
    const vehicle = engine.spawnVehicle(routeId, "SEDAN");
    expect(vehicle).toBeDefined();
    if (vehicle === undefined) {
      return;
    }
    vehicle.state = "CROSSING";
    vehicle.trajectoryHeadSlot = targetSlot - 1;

    const collisionStep = engine.step();
    flushEngineEvents(engine, recorder);
    const collisionSettlement = engine.collectPedestrianSettlement(RATES);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "tick",
    );

    const incident = engine.incidentSummaries()[0];
    expect(collisionStep.interruptReason).toContain("mini-jaywalker");
    expect(pedestrian.state).toBe("INJURED");
    expect(vehicle.state).toBe("ACCIDENT_STOPPED");
    expect(incident?.pedestrianIds).toEqual([pedestrian.id]);
    expect(incident?.lockedResourceIds).toContain(cell.conflictResourceId);
    expect(collisionSettlement).toMatchObject({
      jaywalkWaves: 1,
      firstJaywalks: 1,
      collisionInjuries: 1,
      jaywalkCost: 60,
      collisionCost: 500,
    });

    const targetLane = incident?.suggestedEvacLanes[0];
    expect(targetLane).toBeDefined();
    if (incident === undefined || targetLane === undefined) {
      return;
    }
    expect(engine.orderAccidentClearance(incident.id, targetLane)).toMatchObject({
      ok: true,
    });
    flushEngineEvents(engine, recorder);
    recorder.recordFrame(
      engine.currentTick,
      engine.vehicles.values(),
      engine.pedestrians.values(),
      "decision",
    );
    expect(engine.pedestrians.has(pedestrian.id)).toBe(true);

    for (
      let step = 0;
      step < 100 &&
      engine.inspectIncident(incident.id)?.status === "OPEN";
      step += 1
    ) {
      engine.step();
      flushEngineEvents(engine, recorder);
      recorder.recordFrame(
        engine.currentTick,
        engine.vehicles.values(),
        engine.pedestrians.values(),
        "tick",
      );
    }
    expect(engine.pedestrians.has(pedestrian.id)).toBe(false);

    const bundle = recorder.finalize();
    const injuredFrame = bundle.frames.find((frame) =>
      frame.pedestrians?.some(
        (pose) => pose.id === pedestrian.id && pose.state === "INJURED",
      ),
    );
    const clearanceFrame = bundle.frames.find(
      (frame) =>
        frame.tick > (injuredFrame?.tick ?? -1) &&
        !frame.pedestrians?.some((pose) => pose.id === pedestrian.id),
    );
    const accident = bundle.events.find((event) => event.kind === "ACCIDENT");
    const pedestrianCollision = bundle.events.find(
      (event) => event.kind === "PED_COLLISION",
    );
    const cleared = bundle.events.find(
      (event) => event.kind === "ACCIDENT_CLEARED",
    );

    expect(injuredFrame).toBeDefined();
    expect(clearanceFrame).toBeDefined();
    expect(pedestrianCollision?.payload).toMatchObject({
      pedestrianIds: [pedestrian.id],
      crosswalkId: crosswalk.id,
      resourceId: cell.conflictResourceId,
    });
    expect(accident?.payload).toMatchObject({
      pedestrianIds: [pedestrian.id],
      lockedResourceIds: expect.arrayContaining([cell.conflictResourceId]),
      collisionOutcomes: [
        expect.objectContaining({
          pedestrians: [
            expect.objectContaining({
              pedestrianId: pedestrian.id,
              massKg: 75,
              contactPoint: expect.objectContaining({
                x: expect.any(Number),
                z: expect.any(Number),
              }),
              contactNormal: expect.objectContaining({
                x: expect.any(Number),
                z: expect.any(Number),
              }),
              impactEnergy: expect.any(Number),
              hazardResourceIds: expect.arrayContaining([
                expect.stringMatching(/^SPACE:/),
              ]),
            }),
          ],
        }),
      ],
    });
    expect(cleared?.payload).toMatchObject({
      pedestrianIds: [pedestrian.id],
    });
    expect(engine.inspectIncident(incident.id)?.status).toBe("CLOSED");
    expect(engine.lockedResourceCount()).toBe(0);
    expect(engine.collectPedestrianSettlement(RATES)).toMatchObject({
      jaywalkCost: 0,
      collisionCost: 0,
      completionRevenue: 0,
    });
  });
});

function createRecorder(
  engine: SimulationEngine,
  postfix: string,
): ReplayRecorder {
  return new ReplayRecorder({
    network: engine.network,
    identity: {
      model: "fixed-seed-mini",
      testDate: "2026-09-28",
      postfix,
    },
    model: "fixed-seed-mini",
    seed: 63916,
    tickDurationMs: 100,
    warmupTicks: 0,
  });
}

function flushEngineEvents(
  engine: SimulationEngine,
  recorder: ReplayRecorder,
): void {
  for (const entry of engine.drainIncidentLog()) {
    recorder.recordWorldEvent(entry.kind, entry.tick, entry);
  }
  for (const event of engine.drainPedestrianEvents()) {
    recorder.recordWorldEvent(event.kind, event.tick, event);
  }
}
