import { describe, expect, it } from "vitest";
import {
  completeDemo,
  createDemoPlaybackState,
  toggleDemoPlaying,
  toggleDemoSelection,
} from "../apps/replay/src/demo/demoPlayback.js";

describe("replay demo playback state", () => {
  it("selects a demo without starting playback", () => {
    const selected = toggleDemoSelection(
      createDemoPlaybackState(),
      "truck-startup-lag",
    );
    expect(selected).toMatchObject({
      activeId: "truck-startup-lag",
      phase: "ready",
    });
  });

  it("toggles playing and paused with the active demo intact", () => {
    const ready = toggleDemoSelection(
      createDemoPlaybackState(),
      "bus-turn-slowdown",
    );
    const playing = toggleDemoPlaying(ready);
    expect(playing.phase).toBe("playing");
    expect(toggleDemoPlaying(playing)).toMatchObject({
      activeId: "bus-turn-slowdown",
      phase: "paused",
    });
  });

  it("restarts a completed demo on the next play command", () => {
    const ready = toggleDemoSelection(
      createDemoPlaybackState(),
      "exit-blockage",
    );
    const completed = completeDemo(toggleDemoPlaying(ready));
    const replaying = toggleDemoPlaying(completed);
    expect(replaying.phase).toBe("playing");
    expect(replaying.restartCount).toBe(1);
  });

  it("deactivates when the active selection is clicked again", () => {
    const selected = toggleDemoSelection(
      createDemoPlaybackState(),
      "vehicle-breakdown",
    );
    expect(
      toggleDemoSelection(selected, "vehicle-breakdown"),
    ).toEqual(createDemoPlaybackState());
  });

  it("switches directly to another ready demo", () => {
    const selected = toggleDemoSelection(
      createDemoPlaybackState(),
      "blocked-ambulance",
    );
    expect(
      toggleDemoSelection(selected, "traffic-light-bend"),
    ).toMatchObject({
      activeId: "traffic-light-bend",
      phase: "ready",
    });
  });
});
