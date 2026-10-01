import chalk from "chalk";
import type { ReplayLaneGeometry, ReplayScene } from "../replay/types.js";
import { createReplayScene, resolveVehiclePose } from "../replay/geometry.js";
import type {
  Direction,
  HoldView,
  RoadNetwork,
  UpstreamQueueView,
  Vehicle,
  VehicleState,
  VehicleType,
} from "../core/types.js";
import { vehicleClass } from "../core/vehicleRoster.js";

/** Inclusive world-x range. 27 slots, each drawn as two characters. */
export const VIEWPORT_X_MIN = -13;
export const VIEWPORT_X_MAX = 13;
/** Inclusive world-z range. 24 rows: five cells north of the stop line, six south. */
export const VIEWPORT_Z_MIN = -11;
export const VIEWPORT_Z_MAX = 12;
export const CELL_WIDTH = 2;

export interface IntersectionOverlay {
  readonly crosswalkHolds?: readonly HoldView[];
  readonly upstreamQueues?: readonly UpstreamQueueView[];
}

interface Stamp {
  readonly x: number;
  readonly z: number;
  readonly glyph: string;
  readonly priority: number;
  readonly id: string;
}

export function intersectionGlyph(state: VehicleState, type: VehicleType): string {
  switch (state) {
    case "STALLED":
      return "XX";
    case "ACCIDENT_STOPPED":
      return "!!";
    case "EVACUATING":
      return ">>";
    case "EXIT_BLOCKED":
      return "##";
    default:
      return classPlain(type);
  }
}

export function renderIntersection(
  network: RoadNetwork,
  vehicles: Iterable<Vehicle>,
  scene: ReplayScene = createReplayScene(network),
  overlay: IntersectionOverlay = {},
): string {
  const width = VIEWPORT_X_MAX - VIEWPORT_X_MIN + 1;
  const height = VIEWPORT_Z_MAX - VIEWPORT_Z_MIN + 1;
  const cells = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "  "),
  );
  const occupied = new Set<string>();

  const paint = (x: number, z: number, glyph: string): void => {
    const col = Math.round(x) - VIEWPORT_X_MIN;
    const row = Math.round(z) - VIEWPORT_Z_MIN;
    const line = cells[row];
    if (
      line === undefined ||
      col < 0 ||
      col >= width ||
      row < 0 ||
      row >= height
    ) {
      return;
    }
    line[col] = glyph;
  };

  for (const lane of scene.inboundLanes) {
    for (const slot of lane.slots) {
      paint(slot.x, slot.z, chalk.gray("· "));
    }
  }
  for (const lane of scene.outboundLanes) {
    for (const slot of lane.slots) {
      paint(slot.x, slot.z, chalk.gray("· "));
    }
  }
  for (const trajectory of scene.trajectories) {
    for (const slot of trajectory.slots) {
      paint(slot.x, slot.z, chalk.gray("· "));
    }
  }
  for (const lane of scene.inboundLanes) {
    const stop = lane.slots[lane.slots.length - 1];
    if (stop === undefined) {
      continue;
    }
    paint(stop.x, stop.z, stopLineGlyph(lane.direction));
  }
  for (const hold of overlay.crosswalkHolds ?? []) {
    if (!hold.occupied) {
      continue;
    }
    const trajectory = scene.trajectories.find(
      (trajectory) => trajectory.id === hold.laneId || trajectory.routeId === hold.laneId,
    );
    const crosswalk = scene.crosswalks.find(
      (item) => item.approach === trajectory?.direction,
    );
    if (crosswalk === undefined) {
      continue;
    }
    paint(
      (crosswalk.start.x + crosswalk.end.x) / 2,
      (crosswalk.start.z + crosswalk.end.z) / 2,
      chalk.bgCyan.black("≈≈"),
    );
  }

  const stamps = [...vehicles]
    .filter((vehicle) => vehicle.state !== "DESPAWNED")
    .flatMap((vehicle) => vehicleStamps(vehicle, scene))
    .sort(
      (left, right) =>
        left.priority - right.priority || left.id.localeCompare(right.id),
    );
  for (const stamp of stamps) {
    paint(stamp.x, stamp.z, stamp.glyph);
    occupied.add(key(stamp.x, stamp.z));
  }

  for (const queue of overlay.upstreamQueues ?? []) {
    if (queue.waiting <= 0) {
      continue;
    }
    const lane = scene.inboundLanes.find((item) => item.id === queue.laneId);
    const edge = lane === undefined ? undefined : outermostVisible(lane);
    if (edge === undefined || occupied.has(key(edge.x, edge.z))) {
      continue;
    }
    paint(edge.x, edge.z, chalk.redBright(overflowBadge(queue.waiting)));
  }

  return cells.map((line) => line.join("")).join("\n");
}

function vehicleStamps(vehicle: Vehicle, scene: ReplayScene): Stamp[] {
  const pose = resolveVehiclePose(vehicle, scene);
  const lane = scene.inboundLanes.find((item) => item.id === vehicle.inboundLaneId);
  const creeping = vehicle.encroaching && vehicle.state === "AT_STOPLINE";
  return pose.segments.map((segment, index) => {
    const head = index === 0;
    return {
      x: segment.x,
      z: segment.z,
      glyph: cellGlyph(vehicle, head && creeping, lane?.direction),
      priority: cellPriority(vehicle.state, vehicle.type, head && creeping),
      id: vehicle.id,
    };
  });
}

function cellGlyph(
  vehicle: Vehicle,
  creepHead: boolean,
  direction: Direction | undefined,
): string {
  if (creepHead && direction !== undefined && !specialState(vehicle.state)) {
    return chalk.yellowBright(creepArrow(direction));
  }
  switch (vehicle.state) {
    case "STALLED":
      return chalk.bgMagenta.whiteBright("XX");
    case "ACCIDENT_STOPPED":
      return chalk.bgRed.whiteBright("!!");
    case "EVACUATING":
      return chalk.bgYellow.black(">>");
    case "EXIT_BLOCKED":
      return chalk.bgGray.white("##");
    default:
      return classColored(vehicle.type);
  }
}

function cellPriority(state: VehicleState, type: VehicleType, creepHead: boolean): number {
  switch (state) {
    case "ACCIDENT_STOPPED":
    case "EVACUATING":
      return 5;
    case "EXIT_BLOCKED":
      return 4;
    case "STALLED":
      return 3;
    default:
      if (creepHead) {
        return 2;
      }
      return vehicleClass(type) === "emergency" ? 1 : 0;
  }
}

function specialState(state: VehicleState): boolean {
  return (
    state === "STALLED" ||
    state === "ACCIDENT_STOPPED" ||
    state === "EVACUATING" ||
    state === "EXIT_BLOCKED"
  );
}

function classColored(type: VehicleType): string {
  switch (vehicleClass(type)) {
    case "van":
      return chalk.cyan("██");
    case "truck":
    case "bus":
      return chalk.yellow("██");
    case "emergency":
      return chalk.bgRed.whiteBright("EE");
    case "passenger":
      return chalk.greenBright("■■");
  }
}

function classPlain(type: VehicleType): string {
  switch (vehicleClass(type)) {
    case "van":
    case "truck":
    case "bus":
      return "██";
    case "emergency":
      return "EE";
    case "passenger":
      return "■■";
  }
}

function stopLineGlyph(direction: Direction | undefined): string {
  if (direction === "EAST" || direction === "WEST") {
    return chalk.whiteBright("║ ");
  }
  return chalk.whiteBright("══");
}

function creepArrow(direction: Direction): string {
  switch (direction) {
    case "NORTH":
      return "▼▼";
    case "SOUTH":
      return "▲▲";
    case "WEST":
      return "▶▶";
    case "EAST":
      return "◀◀";
  }
}

function outermostVisible(
  lane: ReplayLaneGeometry,
): { readonly x: number; readonly z: number } | undefined {
  for (const slot of lane.slots) {
    const x = Math.round(slot.x);
    const z = Math.round(slot.z);
    if (
      x >= VIEWPORT_X_MIN &&
      x <= VIEWPORT_X_MAX &&
      z >= VIEWPORT_Z_MIN &&
      z <= VIEWPORT_Z_MAX
    ) {
      return { x, z };
    }
  }
  return undefined;
}

function overflowBadge(waiting: number): string {
  return waiting > 9 ? "9+" : `+${waiting}`;
}

function key(x: number, z: number): string {
  return `${Math.round(x)}:${Math.round(z)}`;
}
