import { describe, expect, it } from "vitest";
import { vehicleModelPivotOffset } from "../apps/replay/src/scene/vehicleModelPivot.js";

describe("replay vehicle model pivot", () => {
  it("centers offset geometry horizontally and seats it on the road", () => {
    expect(
      vehicleModelPivotOffset({
        min: { x: -1, y: 0.4, z: -9.2 },
        max: { x: 1, y: 5.2, z: 4.6 },
      }),
    ).toEqual({
      x: 0,
      y: -0.32,
      z: 2.3,
    });
  });
});
