import type { Direction } from "../../../../src/core/types.js";
import { interpolatePose } from "../../../../src/replay/geometry.js";
import type {
  ReplayFrame,
  ReplayPedestrianPose,
} from "../../../../src/replay/types.js";
import { mapCrosswalkPose, mapSimulationPose } from "./roadFrame.js";

export interface PedestrianWorldPose {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export type PedestrianTravelIndex = readonly ReadonlyMap<string, number>[];

export function buildPedestrianTravelIndex(
  frames: readonly ReplayFrame[],
  approaches: ReadonlyMap<string, Direction>,
): PedestrianTravelIndex {
  const index: Map<string, number>[] = [];
  let previous = new Map<
    string,
    { readonly pose: PedestrianWorldPose; readonly distance: number }
  >();
  for (const frame of frames) {
    const distances = new Map<string, number>();
    const active = new Map<
      string,
      { readonly pose: PedestrianWorldPose; readonly distance: number }
    >();
    for (const pedestrian of frame.pedestrians ?? []) {
      const pose = mapPedestrianWorldPose(
        pedestrian,
        approaches.get(pedestrian.crosswalkId),
      );
      const before = previous.get(pedestrian.id);
      const distance =
        before === undefined
          ? 0
          : before.distance +
            Math.hypot(pose.x - before.pose.x, pose.z - before.pose.z);
      distances.set(pedestrian.id, distance);
      active.set(pedestrian.id, { pose, distance });
    }
    index.push(distances);
    previous = active;
  }
  return index;
}

export function pedestrianTravelDistanceAt(
  index: PedestrianTravelIndex,
  frameIndex: number,
  id: string,
  recordedPose: PedestrianWorldPose,
  visiblePose: PedestrianWorldPose,
): number {
  return (
    (index[frameIndex]?.get(id) ?? 0) +
    Math.hypot(
      visiblePose.x - recordedPose.x,
      visiblePose.z - recordedPose.z,
    )
  );
}

export function interpolatePedestrianWorldPose(
  from: ReplayPedestrianPose,
  to: ReplayPedestrianPose,
  alpha: number,
  approach: Direction | undefined,
): PedestrianWorldPose {
  return interpolatePose(
    mapPedestrianWorldPose(from, approach),
    mapPedestrianWorldPose(to, approach),
    alpha,
  );
}

export function mapPedestrianWorldPose(
  pose: ReplayPedestrianPose,
  approach: Direction | undefined,
): PedestrianWorldPose {
  if (pose.worldSpace === true) {
    return { x: pose.x, z: pose.z, heading: pose.heading };
  }
  return approach === undefined
    ? mapSimulationPose(pose.x, pose.z, pose.heading)
    : mapCrosswalkPose(pose.x, pose.z, pose.heading, approach);
}
