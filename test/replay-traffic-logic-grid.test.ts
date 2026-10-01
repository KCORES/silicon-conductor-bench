import { describe, expect, it } from "vitest";
import { createRoadNetwork } from "../src/core/network.js";
import { createReplayScene } from "../src/replay/geometry.js";
import type {
  ReplayBundle,
  ReplayEvent,
  ReplayPedestrianPose,
  ReplayPose,
  ReplayVehiclePose,
} from "../src/replay/types.js";
import {
  buildTrafficLogicGridIndex,
  buildTrafficLogicGridView,
} from "../apps/replay/src/scene/trafficLogicGrid.js";

describe("traffic logic grid", () => {
  it("indexes lane slots and exact conflict resources", () => {
    const scene = createReplayScene(createRoadNetwork());
    const index = buildTrafficLogicGridIndex(scene);
    const slot = scene.trajectories[0]?.slots[1];
    expect(index.cells.length).toBeGreaterThan(500);
    expect(index.byKey.get(slot?.slotKey ?? "")).toMatchObject({
      x: slot?.x,
      z: slot?.z,
    });
    for (const resourceId of slot?.conflictResourceIds ?? []) {
      expect(index.byResource.get(resourceId)).toContain(slot?.slotKey);
    }
  });

  it("separates route estimates, actual history, and current occupation", () => {
    const bundle = fixtureBundle();
    const index = buildTrafficLogicGridIndex(bundle.scene);
    const actualVehicle = bundle.frames[1]?.vehicles[0];
    const predictedRoute = "E_S1_STRAIGHT";
    const event: ReplayEvent = {
      id: "dry-run",
      kind: "DRY_RUN_ADMIT",
      tick: 1,
      sequence: 0,
      payload: {
        vehicleIds: ["predicted"],
        candidates: [{ vehicleId: "predicted", routeId: predictedRoute }],
        feasible: true,
      },
    };
    const view = buildTrafficLogicGridView({
      index,
      bundle,
      vehicles: actualVehicle === undefined ? [] : [actualVehicle],
      tick: 1,
      activeEvent: event,
    });
    expect(view.precision).toBe("route-estimate");
    expect(view.cells.some((cell) => cell.kind === "predicted")).toBe(true);
    expect(view.cells.some((cell) => cell.kind === "occupied")).toBe(true);
    expect(
      view.cells.some(
        (cell) => cell.laneId === predictedRoute && cell.kind === "predicted",
      ),
    ).toBe(true);
  });

  it("uses reservation footprints and deterministically rebuilds after seeking", () => {
    const bundle = fixtureBundle();
    const index = buildTrafficLogicGridIndex(bundle.scene);
    const trajectory = bundle.scene.trajectories.find(
      (lane) => lane.id === "E_S1_STRAIGHT",
    );
    const resourceId = trajectory?.slots[2]?.conflictResourceIds?.[0];
    expect(resourceId).toBeDefined();
    const event: ReplayEvent = {
      id: "dry-run-reservation",
      kind: "DRY_RUN_ADMIT",
      tick: 1,
      sequence: 0,
      payload: {
        vehicleIds: ["predicted"],
        candidates: [
          { vehicleId: "predicted", routeId: "E_S1_STRAIGHT" },
        ],
        feasible: true,
        reservationPreview: [
          {
            vehicleId: "predicted",
            routeId: "E_S1_STRAIGHT",
            enterTick: 1,
            steps: [{ tickOffset: 0, resourceIds: [resourceId ?? ""] }],
          },
        ],
      },
    };
    const later = buildTrafficLogicGridView({
      index,
      bundle,
      vehicles: [],
      tick: 1,
      activeEvent: event,
    });
    const earlier = buildTrafficLogicGridView({
      index,
      bundle,
      vehicles: [],
      tick: 0,
    });
    expect(later.precision).toBe("reservation");
    expect(later.cells.some((cell) => cell.kind === "predicted")).toBe(true);
    expect(
      later.cells.filter((cell) => cell.kind === "actual").length,
    ).toBeGreaterThan(
      earlier.cells.filter((cell) => cell.kind === "actual").length,
    );
  });

  it("indexes crosswalk cells and tracks pedestrian occupation history", () => {
    const scene = createReplayScene(createRoadNetwork());
    const crosswalk = scene.crosswalks[0];
    const cell = crosswalk?.cells?.[0];
    expect(crosswalk?.cells).toHaveLength(16);
    expect(cell).toBeDefined();
    if (crosswalk === undefined || cell === undefined) {
      return;
    }
    const pedestrian: ReplayPedestrianPose = {
      id: "pedestrian",
      crosswalkId: crosswalk.id,
      direction: "A_TO_B",
      state: "CROSSING_RESERVED",
      waitingTicks: 0,
      patienceLimit: 10,
      row: cell.row,
      column: cell.column,
      x: cell.x,
      z: cell.z,
      heading: Math.atan2(
        crosswalk.end.x - crosswalk.start.x,
        crosswalk.end.z - crosswalk.start.z,
      ),
    };
    const bundle: ReplayBundle = {
      schemaVersion: 2,
      tickDurationMs: 100,
      warmupTicks: 0,
      totalTicks: 1,
      identity: { model: "test", testDate: "2026-09-28", postfix: "ped-xray" },
      model: "test",
      seed: 1,
      scene,
      frames: [
        { tick: 0, phase: "tick", vehicles: [], pedestrians: [pedestrian] },
        { tick: 1, phase: "tick", vehicles: [], pedestrians: [] },
      ],
      events: [],
      cycles: [],
    };
    const index = buildTrafficLogicGridIndex(scene);
    expect(index.byResource.get(cell.conflictResourceId)).toContain(cell.id);
    expect(
      buildTrafficLogicGridView({
        index,
        bundle,
        vehicles: [],
        pedestrians: [pedestrian],
        tick: 0,
      }).cells.find((item) => item.key === cell.id)?.kind,
    ).toBe("occupied");
    expect(
      buildTrafficLogicGridView({
        index,
        bundle,
        vehicles: [],
        pedestrians: [],
        tick: 1,
      }).cells.find((item) => item.key === cell.id)?.kind,
    ).toBe("actual");
  });
});

function fixtureBundle(): ReplayBundle {
  const scene = createReplayScene(createRoadNetwork());
  const inbound = scene.inboundLanes.find(
    (lane) => lane.id === "IN_N_S1_STRAIGHT",
  );
  const trajectory = scene.trajectories.find(
    (lane) => lane.id === "N_S1_STRAIGHT",
  );
  const first = inbound?.slots.at(-2) ?? fallbackPose();
  const second = trajectory?.slots[2] ?? fallbackPose();
  return {
    schemaVersion: 1,
    tickDurationMs: 100,
    warmupTicks: 0,
    totalTicks: 1,
    identity: { model: "test", testDate: "2026-09-25", postfix: "xray" },
    model: "test",
    seed: 1,
    scene,
    frames: [
      { tick: 0, phase: "tick", vehicles: [vehicleAt(first)] },
      { tick: 1, phase: "tick", vehicles: [vehicleAt(second)] },
    ],
    events: [],
    cycles: [],
  };
}

function vehicleAt(pose: ReplayPose): ReplayVehiclePose {
  return {
    id: "actual",
    type: "SEDAN",
    state: "CROSSING",
    routeId: "N_S1_STRAIGHT",
    inboundLaneId: "IN_N_S1_STRAIGHT",
    outboundLaneId: "OUT_SOUTH_1",
    waitingTicks: 0,
    x: pose.x,
    z: pose.z,
    heading: pose.heading,
    segments: [pose],
  };
}

function fallbackPose(): ReplayPose {
  return { x: 0, z: 0, heading: 0 };
}
