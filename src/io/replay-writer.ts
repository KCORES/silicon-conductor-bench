import { ARTIFACT_PURPOSES, type RunArtifactStore } from "./artifacts.js";
import type { ReplayBundle } from "../replay/types.js";

export function writeReplayBundle(
  store: RunArtifactStore,
  bundle: ReplayBundle,
): string {
  return store.writeJson(ARTIFACT_PURPOSES.replay, bundle);
}
