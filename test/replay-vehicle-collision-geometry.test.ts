import { describe, expect, it } from "vitest";
import {
  createVehicleCollisionBox,
  separateVehicleBoxes,
  vehicleBoxContact,
} from "../apps/replay/src/scene/vehicleCollisionGeometry.js";

describe("vehicle collision geometry", () => {
  it("finds the contact manifold between perpendicular vehicle bodies", () => {
    const vertical = createVehicleCollisionBox({
      headX: 0,
      headZ: 0,
      heading: 0,
      length: 2.4,
      width: 1.1,
    });
    const horizontal = createVehicleCollisionBox({
      headX: 0.2,
      headZ: -0.2,
      heading: Math.PI / 2,
      length: 2,
      width: 1.1,
    });

    const contact = vehicleBoxContact(vertical, horizontal);
    expect(contact).toBeDefined();
    expect(contact?.penetration).toBeGreaterThan(0);
    expect(Number.isFinite(contact?.point.x)).toBe(true);
    expect(Number.isFinite(contact?.point.z)).toBe(true);
  });

  it("does not report separated vehicle bodies", () => {
    const first = createVehicleCollisionBox({
      headX: 0,
      headZ: 0,
      heading: 0,
      length: 2,
      width: 1,
    });
    const second = createVehicleCollisionBox({
      headX: 4,
      headZ: 0,
      heading: 0,
      length: 2,
      width: 1,
    });
    expect(vehicleBoxContact(first, second)).toBeUndefined();
  });

  it("separates overlap according to inverse vehicle mass", () => {
    const first = createVehicleCollisionBox({
      headX: 0,
      headZ: 0,
      heading: 0,
      length: 2,
      width: 1,
    });
    const second = createVehicleCollisionBox({
      headX: 0.4,
      headZ: 0,
      heading: 0,
      length: 2,
      width: 1,
    });
    const resolution = separateVehicleBoxes({
      first,
      second,
      firstMass: 1_000,
      secondMass: 10_000,
    });
    expect(resolution).toBeDefined();
    expect(Math.hypot(
      resolution?.firstOffset.x ?? 0,
      resolution?.firstOffset.z ?? 0,
    )).toBeGreaterThan(
      Math.hypot(
        resolution?.secondOffset.x ?? 0,
        resolution?.secondOffset.z ?? 0,
      ),
    );
  });
});
