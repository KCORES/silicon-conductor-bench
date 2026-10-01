import { describe, expect, it } from "vitest";
import {
  accidentImpactStyle,
  collectCrossedAccidents,
  playbackCueMode,
  vehicleImpactNudge,
} from "../src/replay/accidentCues.js";
import type { ReplayEvent, ReplayEventKind } from "../src/replay/types.js";
import {
  scoreAnchorVisible,
  vehicleStatusBadge,
} from "../src/replay/vehicleStatus.js";
import type { VehicleState } from "../src/core/types.js";

const NORMAL_STATES: readonly VehicleState[] = [
  "GENERATED",
  "APPROACHING",
  "QUEUED",
  "AT_STOPLINE",
  "CROSSING",
  "OUTBOUND",
  "DESPAWNED",
];

function marker(kind: ReplayEventKind): ReplayEvent {
  return { id: kind, kind, tick: 0, sequence: 0, payload: {} };
}

describe("vehicle status badges", () => {
  it("hides the icon for every normal state", () => {
    for (const state of NORMAL_STATES) {
      expect(vehicleStatusBadge(state)).toBeUndefined();
      expect(scoreAnchorVisible(false, state)).toBe(false);
    }
  });

  it("maps each abnormal state to one tinted svg", () => {
    expect(vehicleStatusBadge("STALLED")).toMatchObject({
      iconUrl: "/assets/status-icons/car-breakdown.svg",
      color: "#e8a317",
      label: "抛锚",
    });
    expect(vehicleStatusBadge("ACCIDENT_STOPPED")).toMatchObject({
      iconUrl: "/assets/status-icons/car-crash.svg",
      color: "#ff4d3d",
      label: "事故停车",
    });
    expect(vehicleStatusBadge("EVACUATING")).toMatchObject({
      iconUrl: "/assets/status-icons/tow-truck.svg",
      color: "#5ee0c8",
      label: "清障中",
    });
    expect(vehicleStatusBadge("EXIT_BLOCKED")).toMatchObject({
      iconUrl: "/assets/status-icons/road-block.svg",
      color: "#ff8a1e",
      label: "出口受阻",
    });
    expect(scoreAnchorVisible(false, "STALLED")).toBe(true);
    expect(scoreAnchorVisible(true, "QUEUED")).toBe(true);
  });

  it("marks driver violations unless an abnormal state takes precedence", () => {
    expect(vehicleStatusBadge("CROSSING", "RED_LIGHT")).toMatchObject({
      iconUrl: "/assets/status-icons/traffic-light.svg",
      label: "闯红灯",
    });
    expect(vehicleStatusBadge("CROSSING", "TAILGATE")?.label).toBe("跟车闯入");
    expect(vehicleStatusBadge("QUEUED", "CUT_IN")).toMatchObject({
      iconUrl: "/assets/status-icons/lane-cut.svg",
      label: "加塞",
    });
    expect(vehicleStatusBadge("ACCIDENT_STOPPED", "RED_LIGHT")?.label).toBe("事故停车");
    expect(vehicleStatusBadge("DESPAWNED", "RED_LIGHT")).toBeUndefined();
    expect(scoreAnchorVisible(false, "OUTBOUND", "TAILGATE")).toBe(true);
  });
});

describe("accident playback cues", () => {
  const events = [
    marker("COMMIT"),
    marker("ACCIDENT"),
    marker("STALL"),
    marker("ACCIDENT"),
    marker("DRY_RUN_ADMIT"),
  ];

  it("collects only accidents crossed while playing forward", () => {
    expect(collectCrossedAccidents(events, 0, 4).map((event) => event.kind)).toEqual([
      "ACCIDENT",
      "ACCIDENT",
    ]);
    expect(
      playbackCueMode({
        wasPlaying: true,
        isScrubbing: false,
        previousCursor: 0,
        nextCursor: 4,
      }),
    ).toBe("forward");
  });

  it("does not collect on an unchanged cursor", () => {
    expect(collectCrossedAccidents(events, 2, 2)).toEqual([]);
    expect(
      playbackCueMode({
        wasPlaying: true,
        isScrubbing: false,
        previousCursor: 2,
        nextCursor: 2,
      }),
    ).toBe("idle");
  });

  it("treats reverse, scrub, and paused steps as seeks", () => {
    expect(
      playbackCueMode({
        wasPlaying: true,
        isScrubbing: false,
        previousCursor: 4,
        nextCursor: 1,
      }),
    ).toBe("seek");
    expect(
      playbackCueMode({
        wasPlaying: true,
        isScrubbing: true,
        previousCursor: 1,
        nextCursor: 4,
      }),
    ).toBe("seek");
    expect(
      playbackCueMode({
        wasPlaying: false,
        isScrubbing: false,
        previousCursor: 1,
        nextCursor: 3,
      }),
    ).toBe("seek");
  });

  it("still plays a burst when forward playback pauses at the end of the tape", () => {
    expect(
      playbackCueMode({
        wasPlaying: true,
        isScrubbing: false,
        previousCursor: 1,
        nextCursor: 3,
      }),
    ).toBe("forward");
  });

  it("returns the recorded pose at the start and end of a nudge", () => {
    for (const style of ["rear", "cross"] as const) {
      expect(vehicleImpactNudge(style, 0.4, 0, 0)).toEqual({
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
      });
      expect(vehicleImpactNudge(style, 0.4, 1, 1)).toEqual({
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
      });
    }
    expect(accidentImpactStyle([0, 0.1])).toBe("rear");
    expect(accidentImpactStyle([0, Math.PI / 2])).toBe("cross");
    const rear = vehicleImpactNudge("rear", 0, 0, 0.35);
    const cross = vehicleImpactNudge("cross", 0, 0, 0.35);
    expect(rear.z).toBeGreaterThan(0);
    expect(cross.x).not.toBe(0);
  });
});
