import { describe, expect, it } from "vitest";
import { createRoadNetwork } from "../src/core/network.js";
import type { Pedestrian } from "../src/core/types.js";
import {
  createReplayScene,
  resolvePedestrianPose,
  resolvePedestrianPoses,
} from "../src/replay/geometry.js";

describe("replay pedestrian geometry", () => {
  it("copies every 8x2 crosswalk cell and indexes its conflict resource", () => {
    const network = createRoadNetwork();
    const scene = createReplayScene(network);

    for (const crosswalk of scene.crosswalks) {
      const source = network.crosswalks.get(crosswalk.id);
      expect(crosswalk.cells).toHaveLength(16);
      expect(crosswalk.cells).toEqual(
        source?.cells
          .map((cell) => ({
            id: cell.id,
            conflictResourceId: cell.conflictResourceId,
            column: cell.column,
            row: cell.row,
            x: cell.x,
            z: cell.y,
          }))
          .sort(
            (left, right) =>
              left.column - right.column || left.row - right.row,
          ),
      );
      for (const cell of crosswalk.cells ?? []) {
        expect(scene.conflictResources[cell.conflictResourceId]).toEqual({
          x: cell.x,
          z: cell.z,
        });
      }
    }
  });

  it("copies approach paths and resolves an approaching pedestrian on its true cell", () => {
    const network = createRoadNetwork();
    const scene = createReplayScene(network);
    const path = [...network.pedestrianApproachPaths.values()][0];
    const cell = path?.cells[1];
    expect(scene.pedestrianApproachPaths).toHaveLength(
      network.pedestrianApproachPaths.size,
    );
    if (path === undefined || cell === undefined) {
      return;
    }
    const pose = resolvePedestrianPose(
      pedestrian("approaching", path.direction, "APPROACHING", {
        crosswalkId: path.crosswalkId,
        approachPathId: path.id,
        approachIndex: 1,
        approachCellId: cell.id,
      }),
      scene,
    );
    expect(pose).toMatchObject({
      x: cell.x,
      z: cell.y,
      worldSpace: true,
      approachCellId: cell.id,
    });
  });

  it("resolves a departing pedestrian from the opposite entry back to its portal", () => {
    const network = createRoadNetwork();
    const scene = createReplayScene(network);
    const path = [...network.pedestrianApproachPaths.values()].find(
      (candidate) =>
        candidate.crosswalkId === "CROSSWALK:NORTH" &&
        candidate.direction === "B_TO_A",
    );
    const crosswalk = scene.crosswalks.find(
      (candidate) => candidate.id === "CROSSWALK:NORTH",
    );
    const entry = crosswalk?.waitingAreas?.find(
      (candidate) => candidate.direction === "B_TO_A",
    )?.entry;
    const portal = path?.cells[0];
    expect(path).toBeDefined();
    expect(entry).toBeDefined();
    expect(portal).toBeDefined();
    if (path === undefined || entry === undefined || portal === undefined) {
      return;
    }

    const atEntry = resolvePedestrianPose(
      pedestrian("departing-entry", "A_TO_B", "DEPARTING", {
        approachPathId: path.id,
        approachIndex: path.cells.length,
      }),
      scene,
    );
    const atPortal = resolvePedestrianPose(
      pedestrian("departing-portal", "A_TO_B", "DEPARTING", {
        approachPathId: path.id,
        approachIndex: 0,
        approachCellId: portal.id,
      }),
      scene,
    );

    expect(atEntry).toMatchObject({
      x: entry.x,
      z: entry.z,
      worldSpace: true,
    });
    expect(atPortal).toMatchObject({
      x: portal.x,
      z: portal.y,
      worldSpace: true,
    });
  });

  it("uses the true cell for crossing and injured pedestrians", () => {
    const scene = createReplayScene(createRoadNetwork());
    const crosswalk = scene.crosswalks.find(
      (item) => item.id === "CROSSWALK:EAST",
    );
    const cell = crosswalk?.cells?.find(
      (item) => item.row === 1 && item.column === 5,
    );
    const crossing = resolvePedestrianPose(
      pedestrian("crossing", "A_TO_B", "CROSSING_RESERVED", {
        crosswalkId: "CROSSWALK:EAST",
        row: 1,
        column: 5,
        cohortId: "cohort-1",
      }),
      scene,
    );
    const injured = resolvePedestrianPose(
      pedestrian("injured", "B_TO_A", "INJURED", {
        crosswalkId: "CROSSWALK:EAST",
        row: 1,
        column: 5,
      }),
      scene,
    );

    expect(crossing).toMatchObject({
      x: cell?.x,
      z: cell?.z,
      row: 1,
      column: 5,
      cohortId: "cohort-1",
    });
    expect(injured).toMatchObject({ x: cell?.x, z: cell?.z });
    expect(Math.abs(crossing.heading - injured.heading)).toBeCloseTo(Math.PI);
  });

  it("places nine stable subslots in a shared corner cell and stages at the curb ramp", () => {
    const scene = createReplayScene(createRoadNetwork());
    const crosswalk = scene.crosswalks.find(
      (item) => item.id === "CROSSWALK:SOUTH",
    );
    const area = crosswalk?.waitingAreas?.find(
      (item) => item.direction === "B_TO_A",
    );
    const cell = area?.cells.find((item) => item.kind === "WAITING_ZONE");
    expect(cell).toBeDefined();
    expect(area?.entry).toBeDefined();
    if (cell === undefined || area?.entry === undefined) {
      return;
    }
    const poses = Array.from({ length: 9 }, (_, waitingSubslot) =>
      resolvePedestrianPose(
        pedestrian(`slot-${waitingSubslot}`, "B_TO_A", "WAITING", {
          crosswalkId: "CROSSWALK:SOUTH",
          waitingCellId: cell.id,
          waitingSubslot,
        }),
        scene,
      ),
    );
    expect(new Set(poses.map((pose) => `${pose.x}:${pose.z}`)).size).toBe(9);
    expect(poses.every((pose) => pose.worldSpace === true)).toBe(true);
    const xSpread =
      Math.max(...poses.map((pose) => pose.x)) -
      Math.min(...poses.map((pose) => pose.x));
    expect(xSpread).toBeGreaterThan(0.8);
    expect(xSpread).toBeLessThan(1.08);
    expect(new Set(poses.map((pose) => pose.heading.toFixed(6))).size)
      .toBeGreaterThan(1);
    const staged = resolvePedestrianPose(
      pedestrian("staged", "B_TO_A", "CROSSING_RESERVED", {
        crosswalkId: "CROSSWALK:SOUTH",
        row: 1,
      }),
      scene,
    );
    expect(staged).toMatchObject({
      x: area.entry.x,
      z: area.entry.z,
      worldSpace: true,
    });
  });

  it("does not resolve cleared pedestrians into a recorded snapshot", () => {
    const scene = createReplayScene(createRoadNetwork());
    const area = scene.crosswalks
      .find((crosswalk) => crosswalk.id === "CROSSWALK:NORTH")
      ?.waitingAreas?.find((candidate) => candidate.direction === "A_TO_B");
    const waitingCell = area?.cells[0];
    expect(waitingCell).toBeDefined();
    if (waitingCell === undefined) {
      return;
    }
    const poses = resolvePedestrianPoses(
      [
        pedestrian("waiting", "A_TO_B", "WAITING", {
          waitingCellId: waitingCell.id,
          waitingSubslot: 0,
        }),
        pedestrian("cleared", "A_TO_B", "CLEARED"),
      ],
      scene,
    );
    expect(poses.map((pose) => pose.id)).toEqual(["waiting"]);
  });
});

function pedestrian(
  id: string,
  direction: Pedestrian["direction"],
  state: Pedestrian["state"],
  overrides: Partial<Pedestrian> = {},
): Pedestrian {
  return {
    id,
    crosswalkId: "CROSSWALK:NORTH",
    direction,
    generatedAtTick: 0,
    patienceLimit: 30,
    state,
    waitingTicks: 0,
    ...overrides,
  };
}
