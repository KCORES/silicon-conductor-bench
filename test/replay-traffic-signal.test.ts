import { describe, expect, it } from "vitest";
import {
  TRAFFIC_SIGNAL_LENSES,
  signalColorForAxis,
} from "../apps/replay/src/scene/TrafficSignalController.js";

describe("replay traffic signal controller", () => {
  it("matches the model's vertical red-yellow-green lens order", () => {
    expect(TRAFFIC_SIGNAL_LENSES.red.y).toBeGreaterThan(
      TRAFFIC_SIGNAL_LENSES.yellow.y,
    );
    expect(TRAFFIC_SIGNAL_LENSES.yellow.y).toBeGreaterThan(
      TRAFFIC_SIGNAL_LENSES.green.y,
    );
    expect(TRAFFIC_SIGNAL_LENSES.red.x).toBe(
      TRAFFIC_SIGNAL_LENSES.yellow.x,
    );
    expect(TRAFFIC_SIGNAL_LENSES.yellow.x).toBe(
      TRAFFIC_SIGNAL_LENSES.green.x,
    );
    expect(TRAFFIC_SIGNAL_LENSES.red.z).toBeGreaterThan(0.09);
  });

  it("maps east-west phases to the correct opposing colors", () => {
    expect(signalColorForAxis("EW_GREEN", "EW")).toBe("green");
    expect(signalColorForAxis("EW_GREEN", "NS")).toBe("red");
    expect(signalColorForAxis("EW_YELLOW", "EW")).toBe("yellow");
    expect(signalColorForAxis("EW_YELLOW", "NS")).toBe("red");
  });

  it("holds all red before releasing north-south traffic", () => {
    expect(signalColorForAxis("ALL_RED", "EW")).toBe("red");
    expect(signalColorForAxis("ALL_RED", "NS")).toBe("red");
    expect(signalColorForAxis("NS_GREEN", "EW")).toBe("red");
    expect(signalColorForAxis("NS_GREEN", "NS")).toBe("green");
  });
});
