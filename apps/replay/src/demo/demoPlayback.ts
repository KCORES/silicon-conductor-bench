import type { DemoId } from "./demoScenarios.js";

export type DemoPhase =
  | "inactive"
  | "ready"
  | "playing"
  | "paused"
  | "complete";

export interface DemoPlaybackState {
  readonly activeId: DemoId | null;
  readonly phase: DemoPhase;
  readonly restartCount: number;
}

export function createDemoPlaybackState(): DemoPlaybackState {
  return {
    activeId: null,
    phase: "inactive",
    restartCount: 0,
  };
}

export function toggleDemoSelection(
  state: DemoPlaybackState,
  id: DemoId,
): DemoPlaybackState {
  if (state.activeId === id) {
    return createDemoPlaybackState();
  }
  return {
    activeId: id,
    phase: "ready",
    restartCount: state.restartCount,
  };
}

export function toggleDemoPlaying(
  state: DemoPlaybackState,
): DemoPlaybackState {
  if (state.activeId === null) {
    return state;
  }
  switch (state.phase) {
    case "ready":
    case "paused":
      return { ...state, phase: "playing" };
    case "playing":
      return { ...state, phase: "paused" };
    case "complete":
      return {
        ...state,
        phase: "playing",
        restartCount: state.restartCount + 1,
      };
    case "inactive":
      return state;
  }
}

export function completeDemo(
  state: DemoPlaybackState,
): DemoPlaybackState {
  return state.activeId === null
    ? state
    : { ...state, phase: "complete" };
}
