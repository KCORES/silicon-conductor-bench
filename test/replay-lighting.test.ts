import { describe, expect, it } from "vitest";
import { computeContactAo } from "../apps/replay/src/scene/contactAo.js";
import { fitViewShadowFrustum } from "../apps/replay/src/scene/shadowFrustum.js";

describe("view-fitted shadow frustum", () => {
  it("covers the camera view and keeps depth range tight when zoomed in", () => {
    const zoomed = fitViewShadowFrustum({
      cameraDistance: 24,
      fovDegrees: 42,
      aspect: 16 / 9,
      mapSize: 2048,
      focusX: 3.2,
      focusZ: -4.4,
      sunDistance: 104,
    });
    const wide = fitViewShadowFrustum({
      cameraDistance: 180,
      fovDegrees: 42,
      aspect: 16 / 9,
      mapSize: 2048,
      focusX: 0,
      focusZ: 0,
      sunDistance: 104,
    });

    expect(zoomed.top).toBeLessThan(40);
    expect(wide.top).toBeGreaterThan(zoomed.top * 2);
    expect(zoomed.near).toBeGreaterThanOrEqual(40);
    expect(zoomed.far / zoomed.near).toBeLessThan(12);
    expect(wide.far / wide.near).toBeLessThan(12);
    expect(zoomed.left).toBeLessThan(0);
    expect(zoomed.right).toBeGreaterThan(0);
    expect(Math.abs(zoomed.snappedFocusX - 3.2)).toBeLessThanOrEqual(
      (zoomed.top * 2) / 2048,
    );
  });

  it("pulls the near plane back so clouds above the ground still cast", () => {
    const zoomed = fitViewShadowFrustum({
      cameraDistance: 24,
      fovDegrees: 42,
      aspect: 16 / 9,
      mapSize: 2048,
      focusX: 0,
      focusZ: 0,
      sunDistance: 104,
      casterMargin: 80,
    });
    const reach = Math.max(zoomed.top, zoomed.right);
    expect(zoomed.near).toBeLessThanOrEqual(Math.max(1, 104 - reach - 80));
    expect(zoomed.near).toBeLessThan(40);
    expect(zoomed.far).toBeGreaterThan(104);
  });
});

function normalize(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

describe("building contact AO", () => {
  it("darkens the ground face of a hard-edged box without crushing the roof", () => {
    const { positions, normals, indices, top, bottom } = splitBox();
    const ao = computeContactAo(positions, normals, indices);
    const average = (vertices: readonly number[]) =>
      vertices.reduce((sum, vertex) => sum + (ao[vertex] ?? 0), 0) /
      vertices.length;

    expect(average(top)).toBeGreaterThan(0.9);
    expect(average(bottom)).toBeGreaterThan(0.69);
    expect(average(bottom)).toBeLessThan(average(top));
  });

  it("darkens a concave crease more than a flat vertex at the same height", () => {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const add = (
      corners: ReadonlyArray<readonly [number, number, number]>,
      normal: readonly [number, number, number],
    ) => {
      const base = positions.length / 3;
      for (const corner of corners) {
        positions.push(corner[0], corner[1], corner[2]);
        normals.push(normal[0], normal[1], normal[2]);
      }
      indices.push(base, base + 1, base + 2, base, base + 3, base + 2);
    };
    const upLeft = normalize(-1, 1, 0);
    const upRight = normalize(1, 1, 0);
    add(
      [
        [-1, 1.5, -1],
        [-1, 1.5, 1],
        [0, 1, 1],
        [0, 1, -1],
      ],
      upLeft,
    );
    add(
      [
        [0, 1, -1],
        [0, 1, 1],
        [1, 1.5, 1],
        [1, 1.5, -1],
      ],
      upRight,
    );
    add(
      [
        [3, 1, -1],
        [4, 1, -1],
        [4, 1, 1],
        [3, 1, 1],
      ],
      [0, 1, 0],
    );
    const ao = computeContactAo(
      Float32Array.from(positions),
      Float32Array.from(normals),
      Uint32Array.from(indices),
    );
    const crease = ((ao[2] ?? 1) + (ao[3] ?? 1) + (ao[4] ?? 1) + (ao[5] ?? 1)) / 4;
    const flat = ((ao[8] ?? 0) + (ao[9] ?? 0) + (ao[10] ?? 0) + (ao[11] ?? 0)) / 4;
    expect(crease).toBeLessThan(flat - 0.05);
  });
});

function splitBox(): {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  top: number[];
  bottom: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const top: number[] = [];
  const bottom: number[] = [];
  const addFace = (
    corners: ReadonlyArray<readonly [number, number, number]>,
    normal: readonly [number, number, number],
    bucket: number[] | undefined,
  ) => {
    const base = positions.length / 3;
    corners.forEach((corner, offset) => {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(normal[0], normal[1], normal[2]);
      bucket?.push(base + offset);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  addFace(
    [
      [-1, 1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    [0, 1, 0],
    top,
  );
  addFace(
    [
      [-1, 0, 1],
      [1, 0, 1],
      [1, 0, -1],
      [-1, 0, -1],
    ],
    [0, -1, 0],
    bottom,
  );
  addFace(
    [
      [-1, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    [0, 0, 1],
    undefined,
  );
  addFace(
    [
      [1, 0, -1],
      [-1, 0, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
    [0, 0, -1],
    undefined,
  );
  addFace(
    [
      [1, 0, 1],
      [1, 0, -1],
      [1, 1, -1],
      [1, 1, 1],
    ],
    [1, 0, 0],
    undefined,
  );
  addFace(
    [
      [-1, 0, -1],
      [-1, 0, 1],
      [-1, 1, 1],
      [-1, 1, -1],
    ],
    [-1, 0, 0],
    undefined,
  );
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices),
    top,
    bottom,
  };
}
