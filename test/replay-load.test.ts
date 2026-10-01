import { describe, expect, it } from "vitest";
import { createDemoBundle } from "../apps/replay/src/demo/demoScenarios.js";
import {
  ReplayLoadError,
  parseReplayBundle,
} from "../apps/replay/src/loadReplay.js";

describe("replay bundle loading", () => {
  it("accepts only complete current-schema pedestrian replays", () => {
    const source = createDemoBundle("pedestrian-crossing");
    const parsed = parseReplayBundle(source);
    expect(parsed.schemaVersion).toBe(7);
    expect(parsed.scene.pedestrianApproachPaths?.length).toBeGreaterThan(0);
    expect(
      parsed.frames.some((frame) => (frame.pedestrians?.length ?? 0) > 0),
    ).toBe(true);
  });

  it("rejects schema versions 1 through 4", () => {
    const source = createDemoBundle("truck-startup-lag");
    for (const schemaVersion of [1, 2, 3, 4]) {
      expect(() =>
        parseReplayBundle({ ...source, schemaVersion }),
      ).toThrow(ReplayLoadError);
    }
  });

  it("rejects current-schema files without pedestrian topology", () => {
    const source = createDemoBundle("truck-startup-lag");
    expect(() =>
      parseReplayBundle({
        ...source,
        scene: { ...source.scene, pedestrianApproachPaths: undefined },
      }),
    ).toThrow(ReplayLoadError);
  });
});
