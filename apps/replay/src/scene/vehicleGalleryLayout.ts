export interface VehicleGalleryItem {
  readonly id: string;
  readonly width: number;
  readonly length: number;
}

export interface VehicleGalleryPlacement extends VehicleGalleryItem {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly laneIndex: number;
}

export interface RoadFleetItem extends VehicleGalleryItem {
  readonly gap: number;
}

const LANE_CENTERS = [0.71, 2.135, 3.575, 5.025] as const;
const INNER_DISTANCE = 17;
const LONGITUDINAL_GAP = 0.8;
export const ROAD_FLEET_INNER_DISTANCE = INNER_DISTANCE;
export const ROAD_FLEET_MAX_DISTANCE = 67;

interface GalleryLane {
  readonly x: number;
  readonly z: number;
  readonly outwardX: -1 | 0 | 1;
  readonly outwardZ: -1 | 0 | 1;
  readonly heading: number;
}

export function createVehicleGalleryLayout(
  items: readonly VehicleGalleryItem[],
): readonly VehicleGalleryPlacement[] {
  const lanes = createGalleryLanes();
  const cursors = lanes.map(() => INNER_DISTANCE);
  return [...items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item, index) => {
      const laneIndex = index % lanes.length;
      const lane = lanes[laneIndex];
      if (lane === undefined) {
        throw new Error("Vehicle gallery has no available road lanes");
      }
      const halfLength = item.length / 2;
      const distance = (cursors[laneIndex] ?? INNER_DISTANCE) + halfLength;
      cursors[laneIndex] = distance + halfLength + LONGITUDINAL_GAP;
      return {
        ...item,
        x: lane.x + lane.outwardX * distance,
        z: lane.z + lane.outwardZ * distance,
        heading: lane.heading,
        laneIndex,
      };
    });
}

export function createRoadFleetLayout(
  items: readonly RoadFleetItem[],
  maxDistance = ROAD_FLEET_MAX_DISTANCE,
): readonly VehicleGalleryPlacement[] {
  const lanes = createGalleryLanes();
  const cursors = lanes.map(() => ROAD_FLEET_INNER_DISTANCE);
  const placements: VehicleGalleryPlacement[] = [];
  let nextLane = 0;
  for (const item of items) {
    let laneIndex: number | undefined;
    for (let attempt = 0; attempt < lanes.length; attempt += 1) {
      const candidate = (nextLane + attempt) % lanes.length;
      const cursor = cursors[candidate] ?? ROAD_FLEET_INNER_DISTANCE;
      if (cursor + item.length <= maxDistance) {
        laneIndex = candidate;
        break;
      }
    }
    if (laneIndex === undefined) {
      break;
    }
    const lane = lanes[laneIndex];
    if (lane === undefined) {
      break;
    }
    const halfLength = item.length / 2;
    const distance = (cursors[laneIndex] ?? ROAD_FLEET_INNER_DISTANCE) + halfLength;
    cursors[laneIndex] = distance + halfLength + item.gap;
    nextLane = (laneIndex + 1) % lanes.length;
    placements.push({
      ...item,
      x: lane.x + lane.outwardX * distance,
      z: lane.z + lane.outwardZ * distance,
      heading: lane.heading,
      laneIndex,
    });
  }
  return placements;
}

export function placementsOverlap(
  left: VehicleGalleryPlacement,
  right: VehicleGalleryPlacement,
): boolean {
  const leftSize = orientedSize(left);
  const rightSize = orientedSize(right);
  return (
    Math.abs(left.x - right.x) <
      (leftSize.width + rightSize.width) / 2 &&
    Math.abs(left.z - right.z) <
      (leftSize.depth + rightSize.depth) / 2
  );
}

function createGalleryLanes(): readonly GalleryLane[] {
  return LANE_CENTERS.flatMap((offset): readonly GalleryLane[] => [
    {
      x: -offset,
      z: 0,
      outwardX: 0,
      outwardZ: -1,
      heading: 0,
    },
    {
      x: offset,
      z: 0,
      outwardX: 0,
      outwardZ: 1,
      heading: Math.PI,
    },
    {
      x: 0,
      z: -offset,
      outwardX: 1,
      outwardZ: 0,
      heading: -Math.PI / 2,
    },
    {
      x: 0,
      z: offset,
      outwardX: -1,
      outwardZ: 0,
      heading: Math.PI / 2,
    },
  ]);
}

function orientedSize(
  placement: VehicleGalleryPlacement,
): { readonly width: number; readonly depth: number } {
  const travelsHorizontally =
    Math.abs(Math.sin(placement.heading)) > 0.5;
  return travelsHorizontally
    ? { width: placement.length, depth: placement.width }
    : { width: placement.width, depth: placement.length };
}
