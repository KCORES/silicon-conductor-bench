import { describe, expect, it } from "vitest";
import {
  accidentAnchorResourceIds,
  readAccidentPayload,
} from "../src/replay/accidentCues.js";
import { summarizeReplayEvent } from "../src/replay/event-summary.js";
import type {
  ReplayEvent,
  ReplayFrame,
  ReplayPedestrianPose,
} from "../src/replay/types.js";
import {
  buildPedestrianTravelIndex,
  interpolatePedestrianWorldPose,
  pedestrianTravelDistanceAt,
} from "../apps/replay/src/scene/pedestrianReplayMotion.js";
import {
  JAYWALK_TINT_HEX,
  HUMAN_SKIN_TONE_HEXES,
  PEDESTRIAN_CHARACTER_FILES,
  PEDESTRIAN_TEMPLATE_COUNT,
  hashPedestrianId,
  pedestrianActionTime,
  pedestrianActorLifecycle,
  pedestrianCharacterFile,
  pedestrianClipForState,
  pedestrianJaywalkCue,
  pedestrianSkinToneHex,
  pedestrianTemplateIndex,
} from "../apps/replay/src/scene/pedestrianReplayPolicy.js";
import { mapCrosswalkPose } from "../apps/replay/src/scene/roadFrame.js";

describe("pedestrian replay visual policy", () => {
  it("maps pedestrian ids to one of eight characters stably", () => {
    expect(PEDESTRIAN_CHARACTER_FILES).toHaveLength(8);
    expect(PEDESTRIAN_TEMPLATE_COUNT).toBe(8);
    expect(pedestrianCharacterFile("demo-ped-west-1")).toBe(
      PEDESTRIAN_CHARACTER_FILES[
        pedestrianTemplateIndex("demo-ped-west-1")
      ],
    );
    expect(pedestrianTemplateIndex("stable-id")).toBe(
      pedestrianTemplateIndex("stable-id"),
    );
    expect(hashPedestrianId("alpha")).not.toBe(hashPedestrianId("beta"));
  });

  it("assigns stable diverse skin tones only to human characters", () => {
    const humanFile = PEDESTRIAN_CHARACTER_FILES[0];
    const stableTone = pedestrianSkinToneHex("stable-id", humanFile);
    expect(stableTone).toBe(pedestrianSkinToneHex("stable-id", humanFile));
    expect(HUMAN_SKIN_TONE_HEXES).toContain(stableTone);

    const tones = new Set(
      Array.from({ length: 32 }, (_, index) =>
        pedestrianSkinToneHex(`pedestrian-${index}`, humanFile),
      ),
    );
    expect(tones.size).toBeGreaterThan(3);
    expect(
      pedestrianSkinToneHex("goblin-id", "Goblin_Male.gltf"),
    ).toBeUndefined();
  });

  it("maps discrete pedestrian states to Idle, Walk, or Death", () => {
    expect(pedestrianClipForState("WAITING")).toBe("Idle");
    expect(pedestrianClipForState("DEPARTING")).toBe("Walk");
    expect(pedestrianClipForState("CROSSING_RESERVED")).toBe("Walk");
    expect(pedestrianClipForState("CROSSING_JAYWALK")).toBe("Walk");
    expect(pedestrianClipForState("INJURED")).toBe("Death");
    expect(pedestrianClipForState("CLEARED")).toBeUndefined();
  });

  it("keeps jaywalk cues visible but restrained", () => {
    expect(pedestrianJaywalkCue("CROSSING_JAYWALK")).toEqual({
      tintHex: JAYWALK_TINT_HEX,
      haloVisible: true,
    });
    expect(pedestrianJaywalkCue("CROSSING_RESERVED")).toEqual({
      tintHex: 0xffffff,
      haloVisible: false,
    });
    expect(pedestrianJaywalkCue("INJURED").haloVisible).toBe(false);
  });

  it("derives walk mixer time from travelled body widths", () => {
    expect(pedestrianActionTime("Walk", 2.5, 1, 0.44, 0.4)).toBeCloseTo(
      0.5,
    );
    expect(pedestrianActionTime("Walk", 2.5, 1, 0.88, 0.4)).toBeCloseTo(0);
    expect(pedestrianActionTime("Idle", 4, 2)).toBeCloseTo(0);
    expect(pedestrianActionTime("Death", 0.1, 1.8)).toBeCloseTo(1.8);
    expect(pedestrianActionTime("Death", 12, 1.8)).toBeCloseTo(1.8);
  });

  it("indexes cumulative world travel deterministically across seeks", () => {
    const first = pedestrianPose(0);
    const second = pedestrianPose(1);
    const frames = [
      { tick: 0, phase: "tick", vehicles: [], pedestrians: [first] },
      { tick: 1, phase: "tick", vehicles: [], pedestrians: [second] },
    ] satisfies ReplayFrame[];
    const index = buildPedestrianTravelIndex(frames, new Map());

    expect(index[1]?.get(first.id)).toBeCloseTo(1);
    expect(
      pedestrianTravelDistanceAt(
        index,
        0,
        first.id,
        first,
        { ...first, x: 0.5 },
      ),
    ).toBeCloseTo(0.5);
  });

  it("describes actor acquire, retain, and recycle without rebuilding every frame", () => {
    expect(
      pedestrianActorLifecycle(
        ["keep", "leave"],
        ["keep", "arrive"],
      ),
    ).toEqual({
      acquire: ["arrive"],
      retain: ["keep"],
      recycle: ["leave"],
    });
    expect(pedestrianActorLifecycle(["only"], [])).toEqual({
      acquire: [],
      retain: [],
      recycle: ["only"],
    });
  });

  it("interpolates waiting-area and crosswalk poses in world space", () => {
    const waiting: ReplayPedestrianPose = {
      id: "pedestrian",
      crosswalkId: "CROSSWALK:SOUTH",
      direction: "B_TO_A",
      state: "CROSSING_RESERVED",
      waitingTicks: 0,
      patienceLimit: 30,
      x: 6.39,
      z: 7.81,
      heading: -Math.PI / 2,
      worldSpace: true,
    };
    const crossing: ReplayPedestrianPose = {
      ...waiting,
      x: 3,
      z: 6.97,
      row: 1,
      column: 7,
      worldSpace: false,
    };
    const mappedCrossing = mapCrosswalkPose(
      crossing.x,
      crossing.z,
      crossing.heading,
      "SOUTH",
    );

    expect(
      interpolatePedestrianWorldPose(waiting, crossing, 0.5, "SOUTH"),
    ).toMatchObject({
      x: (waiting.x + mappedCrossing.x) / 2,
      z: (waiting.z + mappedCrossing.z) / 2,
    });
    expect(
      interpolatePedestrianWorldPose(waiting, crossing, 1, "SOUTH"),
    ).toMatchObject(mappedCrossing);
  });
});

describe("pedestrian replay event surfaces", () => {
  it("summarizes jaywalk and collision events for the HUD", () => {
    expect(
      summarizeReplayEvent(
        event("PED_JAYWALK", {
          pedestrianIds: ["demo-ped-jay"],
          crosswalkId: "CROSSWALK:NORTH",
        }),
      ),
    ).toBe("demo-ped-jay jaywalked at CROSSWALK:NORTH");
    expect(
      summarizeReplayEvent(
        event("PED_COLLISION", {
          pedestrianIds: ["demo-ped-jay"],
          crosswalkId: "CROSSWALK:NORTH",
          resourceId: "CROSSWALK:NORTH:CELL:4:0",
        }),
      ),
    ).toBe("demo-ped-jay injured at CROSSWALK:NORTH:CELL:4:0");
    expect(summarizeReplayEvent(event("COMMIT", { vehicleIds: ["V1"] }))).toBeUndefined();
  });

  it("reads pedestrianIds on accident payloads and prefers crosswalk cells", () => {
    expect(
      readAccidentPayload({
        vehicleIds: ["V1"],
        pedestrianIds: ["P1"],
        lockedResourceIds: ["PAIR:A|B", "CROSSWALK:NORTH:CELL:4:0"],
      }),
    ).toEqual({
      vehicleIds: ["V1"],
      pedestrianIds: ["P1"],
      lockedResourceIds: ["PAIR:A|B", "CROSSWALK:NORTH:CELL:4:0"],
    });
    expect(
      accidentAnchorResourceIds([
        "PAIR:A|B",
        "CROSSWALK:NORTH:CELL:4:0",
        "CROSSWALK:NORTH:CELL:4:1",
      ]),
    ).toEqual(["CROSSWALK:NORTH:CELL:4:0", "CROSSWALK:NORTH:CELL:4:1"]);
  });
});

function event(kind: ReplayEvent["kind"], payload: unknown): ReplayEvent {
  return { id: kind, kind, tick: 0, sequence: 0, payload };
}

function pedestrianPose(x: number): ReplayPedestrianPose {
  return {
    id: "distance-pedestrian",
    crosswalkId: "CROSSWALK:NORTH",
    direction: "A_TO_B",
    state: "APPROACHING",
    waitingTicks: 0,
    patienceLimit: 30,
    x,
    z: 0,
    heading: Math.PI / 2,
    worldSpace: true,
  };
}
