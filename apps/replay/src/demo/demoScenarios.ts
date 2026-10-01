import { createRoadNetwork } from "../../../../src/core/network.js";
import type {
  Pedestrian,
  PedestrianDirection,
  PedestrianState,
  VehicleState,
  VehicleType,
} from "../../../../src/core/types.js";
import {
  createReplayScene,
  interpolatePose,
  resolvePedestrianPoses,
} from "../../../../src/replay/geometry.js";
import {
  REPLAY_SCHEMA_VERSION,
  SIMULATION_RULES_VERSION,
  type ReplayBundle,
  type ReplayEvent,
  type ReplayFrame,
  type ReplayPedestrianPose,
  type ReplayPose,
  type ReplayScene,
  type ReplayVehiclePose,
} from "../../../../src/replay/types.js";
import type { TrafficSignalPhase } from "../scene/TrafficSignalController.js";
import { mapSimulationPose } from "../scene/roadFrame.js";
import {
  createVehicleCollisionBox,
  vehicleBoxContact,
} from "../scene/vehicleCollisionGeometry.js";
import { VEHICLE_CATALOG } from "../scene/vehicleCatalog.generated.js";
import { VEHICLE_PAINT_PALETTES } from "../scene/vehiclePaintPalettes.js";

export const DEMO_IDS = [
  "traffic-light-bend",
  "truck-startup-lag",
  "bus-turn-slowdown",
  "exit-blockage",
  "vehicle-breakdown",
  "blocked-ambulance",
  "realistic-collision-visual",
  "chain-reaction-crash",
  "traditional-signal-cycle",
  "lane-guidance-overflow",
  "pedestrian-crossing",
] as const;

export type DemoId = (typeof DEMO_IDS)[number];

export interface DemoDescriptor {
  readonly id: DemoId;
  readonly title: string;
  readonly kind: "traffic-light" | "vehicles" | "pedestrians";
}

export const DEMO_CATALOG: readonly DemoDescriptor[] = [
  {
    id: "traffic-light-bend",
    title: "BEND ALL TRAFFIC LIGHTS",
    kind: "traffic-light",
  },
  {
    id: "truck-startup-lag",
    title: "HEAVY TRUCK STARTUP LAG",
    kind: "vehicles",
  },
  {
    id: "bus-turn-slowdown",
    title: "BUS TURN SLOWDOWN",
    kind: "vehicles",
  },
  {
    id: "exit-blockage",
    title: "EXIT BLOCKAGE",
    kind: "vehicles",
  },
  {
    id: "vehicle-breakdown",
    title: "RANDOM BREAKDOWN",
    kind: "vehicles",
  },
  {
    id: "blocked-ambulance",
    title: "BLOCKED AMBULANCE PENALTY",
    kind: "vehicles",
  },
  {
    id: "realistic-collision-visual",
    title: "REALISTIC COLLISION VISUAL",
    kind: "vehicles",
  },
  {
    id: "chain-reaction-crash",
    title: "CHAIN-REACTION CRASH",
    kind: "vehicles",
  },
  {
    id: "traditional-signal-cycle",
    title: "TRADITIONAL SIGNAL CYCLE",
    kind: "vehicles",
  },
  {
    id: "lane-guidance-overflow",
    title: "DYNAMIC LANE GUIDANCE",
    kind: "vehicles",
  },
  {
    id: "pedestrian-crossing",
    title: "BIDIRECTIONAL PEDESTRIAN CROSSING",
    kind: "pedestrians",
  },
];

const TICK_DURATION_MS = 200;
const DEMO_SCENE = createReplayScene(
  createRoadNetwork({ inboundLaneLength: 24, outboundLaneLength: 15 }),
);

interface RoutePath {
  readonly routeId: string;
  readonly inboundLaneId: string;
  readonly outboundLaneId: string;
  readonly inboundEnd: number;
  readonly trajectoryEnd: number;
  readonly poses: readonly ReplayPose[];
}

interface VehicleFrameInput {
  readonly id: string;
  readonly type: VehicleType;
  readonly route: RoutePath;
  readonly progress: number;
  readonly state?: VehicleState;
  readonly waitingTicks?: number;
  readonly score?: number;
  readonly scorePhase?: "charging" | "settled";
  readonly length?: number;
  readonly paintHex?: string;
}

export function createDemoBundle(id: DemoId): ReplayBundle {
  switch (id) {
    case "traffic-light-bend":
      return bundle(id, 9, (tick) => frame(tick, []));
    case "truck-startup-lag":
      return truckStartupLag();
    case "bus-turn-slowdown":
      return busTurnSlowdown();
    case "exit-blockage":
      return exitBlockage();
    case "vehicle-breakdown":
      return vehicleBreakdown();
    case "blocked-ambulance":
      return blockedAmbulance();
    case "realistic-collision-visual":
      return realisticCollisionVisual();
    case "chain-reaction-crash":
      return chainReactionCrash();
    case "traditional-signal-cycle":
      return traditionalSignalCycle();
    case "lane-guidance-overflow":
      return laneGuidanceOverflow();
    case "pedestrian-crossing":
      return pedestrianCrossing();
  }
}

const DEMO_CROSSWALK_ID = "CROSSWALK:NORTH";
const DEMO_CROSSWALK_COLUMNS = 8;
const DEMO_TICKS_PER_CELL = 2;

function pedestrianCrossing(): ReplayBundle {
  const westOneClearTick = departureClearTick("A_TO_B", 24);
  const eastOneClearTick = departureClearTick("B_TO_A", 24);
  const westTwoClearTick = departureClearTick("A_TO_B", 42);
  const totalTicks = Math.max(
    westOneClearTick,
    eastOneClearTick,
    westTwoClearTick,
  );
  return bundle(
    "pedestrian-crossing",
    totalTicks,
    (tick) => frame(tick, [], pedestriansAt(tick)),
    [
      pedEvent("PED_SPAWN", 0, 0, [
        "demo-ped-west-1",
        "demo-ped-west-2",
        "demo-ped-east-1",
      ]),
      pedEvent(
        "PED_GRANT",
        8,
        1,
        ["demo-ped-west-1", "demo-ped-east-1"],
        {
          directions: ["A_TO_B", "B_TO_A"],
          cohortId: "demo-cohort-1",
        },
      ),
      pedEvent("PED_SPAWN", 16, 2, ["demo-ped-jay"]),
      pedEvent("PED_JAYWALK", 22, 3, ["demo-ped-jay"]),
      pedEvent("PED_GRANT", 26, 4, ["demo-ped-west-2"], {
        directions: ["A_TO_B"],
        cohortId: "demo-cohort-2",
      }),
      pedEvent("PED_COLLISION", 30, 5, ["demo-ped-jay"], {
        resourceId: `${DEMO_CROSSWALK_ID}:CELL:4:0`,
        incidentId: "demo-ped-incident",
      }),
      {
        id: "demo-ped-accident",
        kind: "ACCIDENT",
        tick: 30,
        sequence: 6,
        payload: {
          incidentId: "demo-ped-incident",
          vehicleIds: [],
          pedestrianIds: ["demo-ped-jay"],
          lockedResourceIds: [`${DEMO_CROSSWALK_ID}:CELL:4:0`],
          collisionType: "ANGLE_COLLISION",
          severity: "SERIOUS",
          collisionOutcomes: [
            {
              impactTick: 30,
              resourceId: `${DEMO_CROSSWALK_ID}:CELL:4:0`,
              contactPoint: { x: 0, z: -7 },
              collisionType: "ANGLE_COLLISION",
              severity: "SERIOUS",
              vehicles: [],
              pedestrians: [
                {
                  pedestrianId: "demo-ped-jay",
                  impulse: { x: 0.9, z: -0.35 },
                  restPose: { x: 0.9, z: -7.35, heading: 1.94 },
                  fallDirection: 1.94,
                  slideTicks: 5,
                },
              ],
            },
          ],
        },
      },
      pedEvent("PED_CLEAR", 42, 7, ["demo-ped-jay"]),
      {
        id: "demo-ped-cleared",
        kind: "ACCIDENT_CLEARED",
        tick: 42,
        sequence: 8,
        payload: {
          incidentId: "demo-ped-incident",
          vehicleIds: [],
          pedestrianIds: ["demo-ped-jay"],
          lockedResourceIds: [],
        },
      },
      pedEvent("PED_CLEAR", westOneClearTick, 9, ["demo-ped-west-1"]),
      pedEvent("PED_CLEAR", eastOneClearTick, 10, ["demo-ped-east-1"]),
      pedEvent("PED_CLEAR", westTwoClearTick, 11, ["demo-ped-west-2"]),
    ],
  );
}

function pedestriansAt(tick: number): ReplayPedestrianPose[] {
  const active: Pedestrian[] = [];
  if (tick < 42) {
    active.push(approachingDemoPedestrian("demo-ped-approach", "A_TO_B", tick));
  }
  if (tick < departureClearTick("A_TO_B", 24)) {
    active.push(
      tick < 8
        ? waitingPedestrian("demo-ped-west-1", "A_TO_B", 0, tick)
        : tick >= 24
          ? departingDemoPedestrian(
              "demo-ped-west-1",
              "A_TO_B",
              tick,
              24,
            )
        : crossingPedestrian(
            "demo-ped-west-1",
            "A_TO_B",
            0,
            columnTowardB(tick, 8),
            "CROSSING_RESERVED",
            tick,
            "demo-cohort-1",
          ),
    );
  }
  if (tick < departureClearTick("A_TO_B", 42)) {
    active.push(
      tick < 26
        ? waitingPedestrian("demo-ped-west-2", "A_TO_B", 1, tick)
        : tick >= 42
          ? departingDemoPedestrian(
              "demo-ped-west-2",
              "A_TO_B",
              tick,
              42,
            )
        : crossingPedestrian(
            "demo-ped-west-2",
            "A_TO_B",
            0,
            columnTowardB(tick, 26),
            "CROSSING_RESERVED",
            tick,
            "demo-cohort-2",
          ),
    );
  }
  if (tick < departureClearTick("B_TO_A", 24)) {
    active.push(
      tick < 8
        ? waitingPedestrian("demo-ped-east-1", "B_TO_A", 0, tick)
        : tick >= 24
          ? departingDemoPedestrian(
              "demo-ped-east-1",
              "B_TO_A",
              tick,
              24,
            )
        : crossingPedestrian(
            "demo-ped-east-1",
            "B_TO_A",
            1,
            columnTowardA(tick, 8),
            "CROSSING_RESERVED",
            tick,
            "demo-cohort-1",
          ),
    );
  }
  if (tick >= 16 && tick < 42) {
    if (tick < 22) {
      active.push(waitingPedestrian("demo-ped-jay", "A_TO_B", 40, tick - 16));
    } else if (tick < 30) {
      active.push(
        crossingPedestrian(
          "demo-ped-jay",
          "A_TO_B",
          0,
          columnTowardB(tick, 22),
          "CROSSING_JAYWALK",
          tick,
        ),
      );
    } else {
      active.push(
        crossingPedestrian("demo-ped-jay", "A_TO_B", 0, 4, "INJURED", tick),
      );
    }
  }
  return resolvePedestrianPoses(active, DEMO_SCENE).map((pose) =>
    stampPedestrianDemoScore(pose, tick),
  );
}

function stampPedestrianDemoScore(
  pose: ReplayPedestrianPose,
  tick: number,
): ReplayPedestrianPose {
  if (pose.id !== "demo-ped-west-2" || tick < 12) {
    return pose;
  }
  const chargedTicks = Math.min(15, Math.max(0, tick - 11));
  return {
    ...pose,
    score: -chargedTicks * 0.02,
    scorePhase: tick < 26 ? "charging" : "settled",
  };
}

function approachingDemoPedestrian(
  id: string,
  direction: PedestrianDirection,
  tick: number,
): Pedestrian {
  const path = DEMO_SCENE.pedestrianApproachPaths?.find(
    (candidate) =>
      candidate.crosswalkId === DEMO_CROSSWALK_ID &&
      candidate.direction === direction,
  );
  const index = Math.min(
    Math.floor(tick / 4),
    Math.max(0, (path?.cells.length ?? 1) - 1),
  );
  const cell = path?.cells[index];
  if (path === undefined || cell === undefined) {
    throw new Error(`Missing pedestrian demo approach path for ${direction}`);
  }
  return {
    id,
    crosswalkId: DEMO_CROSSWALK_ID,
    direction,
    generatedAtTick: 0,
    patienceLimit: 50,
    state: "APPROACHING",
    waitingTicks: 0,
    approachPathId: path.id,
    approachIndex: index,
    approachCellId: cell.id,
  };
}

function departingDemoPedestrian(
  id: string,
  direction: PedestrianDirection,
  tick: number,
  departureTick: number,
): Pedestrian {
  const path = departurePath(direction);
  const steps = Math.floor(
    Math.max(0, tick - departureTick) / DEMO_TICKS_PER_CELL,
  );
  const approachIndex = Math.max(0, path.cells.length - steps);
  const cell = path.cells[approachIndex];
  return {
    id,
    crosswalkId: DEMO_CROSSWALK_ID,
    direction,
    generatedAtTick: 0,
    patienceLimit: 50,
    state: "DEPARTING",
    waitingTicks: tick,
    approachPathId: path.id,
    approachIndex,
    approachCellId:
      cell?.id ?? `DEPARTURE:ENTRY:${path.id}`,
  };
}

function departureClearTick(
  direction: PedestrianDirection,
  departureTick: number,
): number {
  return (
    departureTick +
    (departurePath(direction).cells.length + 1) * DEMO_TICKS_PER_CELL
  );
}

function departurePath(direction: PedestrianDirection) {
  const destinationDirection =
    direction === "A_TO_B" ? "B_TO_A" : "A_TO_B";
  const path = (DEMO_SCENE.pedestrianApproachPaths ?? [])
    .filter(
      (candidate) =>
        candidate.crosswalkId === DEMO_CROSSWALK_ID &&
        candidate.direction === destinationDirection,
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0];
  if (path === undefined) {
    throw new Error(`Missing pedestrian demo departure path for ${direction}`);
  }
  return path;
}

function waitingPedestrian(
  id: string,
  direction: PedestrianDirection,
  generatedAtTick: number,
  tick: number,
): Pedestrian {
  const area = DEMO_SCENE.crosswalks
    .find((crosswalk) => crosswalk.id === DEMO_CROSSWALK_ID)
    ?.waitingAreas?.find((candidate) => candidate.direction === direction);
  const cell = area?.cells.find((candidate) => candidate.kind === "WAITING_ZONE");
  const waitingSubslot =
    id === "demo-ped-west-2" ? 1 : id === "demo-ped-jay" ? 2 : 0;
  return {
    id,
    crosswalkId: DEMO_CROSSWALK_ID,
    direction,
    generatedAtTick,
    patienceLimit: id === "demo-ped-jay" ? 8 : 50,
    state: "WAITING",
    waitingTicks: Math.max(0, tick - generatedAtTick),
    ...(cell === undefined ? {} : { waitingCellId: cell.id, waitingSubslot }),
  };
}

function crossingPedestrian(
  id: string,
  direction: PedestrianDirection,
  row: 0 | 1,
  column: number,
  state: Exclude<PedestrianState, "WAITING" | "CLEARED">,
  tick: number,
  cohortId?: string,
): Pedestrian {
  return {
    id,
    crosswalkId: DEMO_CROSSWALK_ID,
    direction,
    generatedAtTick: 0,
    patienceLimit: id === "demo-ped-jay" ? 8 : 50,
    state,
    waitingTicks: tick,
    row,
    column,
    ...(cohortId === undefined ? {} : { cohortId }),
  };
}

function columnTowardB(tick: number, startTick: number): number {
  return Math.min(
    DEMO_CROSSWALK_COLUMNS - 1,
    Math.floor(Math.max(0, tick - startTick) / DEMO_TICKS_PER_CELL),
  );
}

function columnTowardA(tick: number, startTick: number): number {
  return Math.max(
    0,
    DEMO_CROSSWALK_COLUMNS -
      1 -
      Math.floor(Math.max(0, tick - startTick) / DEMO_TICKS_PER_CELL),
  );
}

function pedEvent(
  kind: Extract<
    ReplayEvent["kind"],
    "PED_SPAWN" | "PED_GRANT" | "PED_JAYWALK" | "PED_CLEAR" | "PED_COLLISION"
  >,
  tick: number,
  sequence: number,
  pedestrianIds: readonly string[],
  extra: {
    readonly directions?: readonly PedestrianDirection[];
    readonly cohortId?: string;
    readonly resourceId?: string;
    readonly incidentId?: string;
  } = {},
): ReplayEvent {
  return {
    id: `demo-${kind.toLowerCase()}-${sequence}`,
    kind,
    tick,
    sequence,
    payload: {
      kind,
      tick,
      pedestrianIds,
      crosswalkId: DEMO_CROSSWALK_ID,
      ...extra,
    },
  };
}

function laneGuidanceOverflow(): ReplayBundle {
  const source = routePath("N_L1_LEFT", "IN_N_L1_LEFT", "OUT_EAST_3");
  const guided = routePath(
    "N_S2_GUIDED_LEFT",
    "IN_N_S2_STRAIGHT",
    "OUT_EAST_3",
  );
  const eventTick = 8;
  return bundle(
    "lane-guidance-overflow",
    36,
    (tick) => {
      const activeRoute = tick < eventTick ? source : guided;
      const progress =
        Math.min(source.inboundEnd - 8, 5 + tick * 0.65) +
        Math.max(0, tick - 18) * 0.9;
      return frame(tick, [
        vehicle({
          id: "demo-guided-left",
          type: "simplepoly-city:Car",
          route: activeRoute,
          progress,
          ...(tick < 18 ? { state: "QUEUED" as const } : {}),
          waitingTicks: Math.max(0, 18 - tick),
        }),
      ]);
    },
    [
      {
        id: "demo-lane-guidance-1",
        kind: "LANE_GUIDANCE",
        tick: eventTick,
        sequence: 1,
        payload: {
          vehicleId: "demo-guided-left",
          sourceLaneId: "IN_N_L1_LEFT",
          targetLaneId: "IN_N_S2_STRAIGHT",
          intentRouteId: "N_L1_LEFT",
          guidedRouteId: "N_S2_GUIDED_LEFT",
        },
      },
    ],
  );
}

export function demoDescriptor(id: DemoId): DemoDescriptor {
  const descriptor = DEMO_CATALOG.find((item) => item.id === id);
  if (descriptor === undefined) {
    throw new Error(`Unknown demo: ${id}`);
  }
  return descriptor;
}

function truckStartupLag(): ReplayBundle {
  const route = routePath("N_S1_STRAIGHT", "IN_N_S1_STRAIGHT", "OUT_SOUTH_1");
  const comparisonRoute = routePath(
    "N_S2_STRAIGHT",
    "IN_N_S2_STRAIGHT",
    "OUT_SOUTH_2",
  );
  return bundle("truck-startup-lag", 38, (tick) => {
    const elapsed = Math.max(0, tick - 10);
    const truckProgress =
      tick <= 10
        ? route.inboundEnd
        : route.inboundEnd + dampedTravel(elapsed, 0.95, 4.5);
    const followerProgress = Math.min(
      route.inboundEnd - 5,
      route.inboundEnd -
        9 +
        dampedTravel(Math.max(0, tick - 13), 0.78, 3.5),
      truckProgress - 5,
    );
    return frame(tick, [
      vehicle({
        id: "demo-heavy-truck",
        type: "simplepoly-urban:SPW_Vehicle_Land_Truck Container",
        route,
        progress: truckProgress,
        ...(tick <= 10 ? { state: "AT_STOPLINE" as const } : {}),
        waitingTicks: tick <= 10 ? tick : 0,
        length: 5,
      }),
      vehicle({
        id: "demo-truck-follower",
        type: "city-builder:car_taxi",
        route,
        progress: followerProgress,
        state: "QUEUED",
        waitingTicks: Math.max(0, tick - 2),
      }),
      vehicle({
        id: "demo-truck-comparison-car",
        type: "simplepoly-city:Car",
        route: comparisonRoute,
        progress:
          comparisonRoute.inboundEnd +
          dampedTravel(elapsed, 1.05, 0.8),
        ...(tick <= 10 ? { state: "AT_STOPLINE" as const } : {}),
        waitingTicks: tick <= 10 ? tick : 0,
      }),
    ]);
  });
}

function busTurnSlowdown(): ReplayBundle {
  const route = routePath("S_R1_RIGHT", "IN_S_R1_RIGHT", "OUT_EAST_0");
  const control = routePath(
    "S_S1_STRAIGHT",
    "IN_S_S1_STRAIGHT",
    "OUT_NORTH_1",
  );
  let busProgress = route.inboundEnd - 5;
  let busVelocity = 0;
  return bundle("bus-turn-slowdown", 44, (tick) => {
    if (tick > 0) {
      const turning =
        busProgress >= route.inboundEnd &&
        busProgress < route.trajectoryEnd;
      const targetVelocity = turning ? 0.2 : 0.82;
      busVelocity += (targetVelocity - busVelocity) * 0.24;
      busProgress += busVelocity;
    }
    return frame(tick, [
      vehicle({
        id: "demo-turning-bus",
        type: "simplepoly-city:Bus",
        route,
        progress: busProgress,
        length: 4,
      }),
      vehicle({
        id: "demo-control-car",
        type: "simplepoly-city:Car",
        route: control,
        progress: control.inboundEnd - 6 + tick * 0.78,
      }),
      vehicle({
        id: "demo-bus-follower",
        type: "kenney-cars:sedan",
        route,
        progress: Math.min(route.inboundEnd - 3, busProgress - 5),
        ...(busProgress < route.trajectoryEnd
          ? { state: "QUEUED" as const }
          : {}),
      }),
    ]);
  });
}

function exitBlockage(): ReplayBundle {
  const route = routePath("N_S1_STRAIGHT", "IN_N_S1_STRAIGHT", "OUT_SOUTH_1");
  const outboundQueue = [2, 5, 8, 11, 14] as const;
  return bundle("exit-blockage", 38, (tick) => {
    const incomingProgress = Math.min(
      route.trajectoryEnd,
      route.inboundEnd - 5 + dampedTravel(tick, 0.9, 2),
    );
    const tailProgress = Math.min(
      route.inboundEnd - 2,
      route.inboundEnd - 10 + dampedTravel(tick, 0.8, 2.5),
      incomingProgress - 4,
    );
    return frame(tick, [
      ...outboundQueue.map((offset, index) =>
        vehicle({
          id: `demo-exit-queue-${index + 1}`,
          type:
            index % 2 === 0
              ? "city-builder:car_stationwagon"
              : "kenney-cars:taxi",
          route,
          progress: route.trajectoryEnd + offset,
          state: "EXIT_BLOCKED",
          waitingTicks: tick,
        }),
      ),
      vehicle({
        id: "demo-exit-incoming",
        type: "simplepoly-city:Car",
        route,
        progress: incomingProgress,
        ...(incomingProgress >= route.trajectoryEnd
          ? { state: "EXIT_BLOCKED" as const }
          : {}),
        waitingTicks:
          incomingProgress >= route.trajectoryEnd
            ? Math.max(0, tick - 15)
            : 0,
      }),
      vehicle({
        id: "demo-exit-tail",
        type: "kenney-cars:sedan",
        route,
        progress: tailProgress,
        state: "QUEUED",
        waitingTicks: tick,
      }),
    ]);
  });
}

function vehicleBreakdown(): ReplayBundle {
  const route = routePath("E_S1_STRAIGHT", "IN_E_S1_STRAIGHT", "OUT_WEST_1");
  const stallAt = route.inboundEnd - 2;
  return bundle("vehicle-breakdown", 36, (tick) => {
    const leadProgress = tick < 9 ? stallAt - 6 + tick * 0.72 : stallAt;
    const followerProgress = Math.min(
      stallAt - 4,
      stallAt - 11 + tick * 0.65,
      leadProgress - 4,
    );
    return frame(tick, [
      vehicle({
        id: "demo-stalled-car",
        type: "kenney-cars:suv",
        route,
        progress: leadProgress,
        state: tick < 9 ? "APPROACHING" : "STALLED",
        waitingTicks: Math.max(0, tick - 9),
      }),
      vehicle({
        id: "demo-stall-follower",
        type: "city-builder:car_hatchback",
        route,
        progress: followerProgress,
        state: tick < 14 ? "APPROACHING" : "QUEUED",
        waitingTicks: Math.max(0, tick - 14),
      }),
      vehicle({
        id: "demo-stall-tail",
        type: "kenney-cars:delivery",
        route,
        progress: Math.min(stallAt - 8, followerProgress - 4),
        state: tick < 18 ? "APPROACHING" : "QUEUED",
        waitingTicks: Math.max(0, tick - 18),
      }),
    ]);
  });
}

function blockedAmbulance(): ReplayBundle {
  const route = routePath("W_S1_STRAIGHT", "IN_W_S1_STRAIGHT", "OUT_EAST_1");
  return bundle("blocked-ambulance", 40, (tick) => {
    return frame(tick, [
      vehicle({
        id: "demo-ambulance-blocker",
        type: "simplepoly-city:Car",
        route,
        progress: route.inboundEnd,
        state: "AT_STOPLINE",
        waitingTicks: tick,
      }),
      vehicle({
        id: "demo-ambulance",
        type: "simplepoly-city:Ambulance",
        route,
        progress: route.inboundEnd - 4,
        state: "QUEUED",
        waitingTicks: tick,
      }),
      vehicle({
        id: "demo-ambulance-tail",
        type: "kenney-cars:sedan",
        route,
        progress: route.inboundEnd - 8,
        state: "QUEUED",
        waitingTicks: tick,
      }),
    ]);
  });
}

function chainReactionCrash(): ReplayBundle {
  const north = routePath(
    "N_S1_STRAIGHT",
    "IN_N_S1_STRAIGHT",
    "OUT_SOUTH_1",
  );
  const west = routePath(
    "W_S1_STRAIGHT",
    "IN_W_S1_STRAIGHT",
    "OUT_EAST_1",
  );
  const south = routePath(
    "S_S1_STRAIGHT",
    "IN_S_S1_STRAIGHT",
    "OUT_NORTH_1",
  );
  const east = routePath(
    "E_S1_STRAIGHT",
    "IN_E_S1_STRAIGHT",
    "OUT_WEST_1",
  );
  const incidents = [
    accidentEvent(12, 0, ["demo-crash-north", "demo-crash-west"]),
    accidentEvent(16, 1, ["demo-crash-south", "demo-crash-north"]),
    accidentEvent(19, 2, ["demo-crash-north-tail", "demo-crash-north"]),
    accidentEvent(22, 3, ["demo-crash-east", "demo-crash-south"]),
    accidentEvent(25, 4, ["demo-crash-west-tail", "demo-crash-west"]),
  ];
  return bundle(
    "chain-reaction-crash",
    34,
    (tick) =>
      frame(tick, [
        crashingVehicle(
          tick,
          12,
          "demo-crash-north",
          "simplepoly-city:Car",
          north,
          0,
        ),
        crashingVehicle(
          tick,
          12,
          "demo-crash-west",
          "kenney-cars:suv",
          west,
          0,
        ),
        crashingVehicle(
          tick,
          16,
          "demo-crash-south",
          "simplepoly-city:Bus",
          south,
          0,
          4,
        ),
        crashingVehicle(
          tick,
          19,
          "demo-crash-north-tail",
          "city-builder:car_taxi",
          north,
          -4,
        ),
        crashingVehicle(
          tick,
          22,
          "demo-crash-east",
          "simplepoly-urban:SPW_Vehicle_Land_Truck Tanker",
          east,
          1,
          5,
        ),
        crashingVehicle(
          tick,
          25,
          "demo-crash-west-tail",
          "kenney-cars:delivery",
          west,
          -4,
        ),
      ]),
    incidents,
  );
}

function realisticCollisionVisual(): ReplayBundle {
  const north = routePath(
    "N_S1_STRAIGHT",
    "IN_N_S1_STRAIGHT",
    "OUT_SOUTH_1",
  );
  const west = routePath(
    "W_S1_STRAIGHT",
    "IN_W_S1_STRAIGHT",
    "OUT_EAST_1",
  );
  const impactTick = 18;
  const ids = ["demo-realistic-north", "demo-realistic-west"] as const;
  const northSpec = VEHICLE_CATALOG.find(
    (vehicle) => vehicle.id === "simplepoly-city:Car",
  );
  const westSpec = VEHICLE_CATALOG.find(
    (vehicle) => vehicle.id === "kenney-cars:suv",
  );
  const contact = closestRouteContact(
    north,
    west,
    {
      length: northSpec?.length ?? 2.4,
      width: northSpec?.width ?? 1.12,
    },
    {
      length: westSpec?.length ?? 2.03,
      width: westSpec?.width ?? 1.12,
    },
  );
  return bundle(
    "realistic-collision-visual",
    52,
    (tick) =>
      frame(tick, [
        crashingVehicle(
          tick,
          impactTick,
          ids[0],
          "simplepoly-city:Car",
          north,
          0,
          undefined,
          contact.leftProgress,
          impactTick - 3,
        ),
        crashingVehicle(
          tick,
          impactTick,
          ids[1],
          "kenney-cars:suv",
          west,
          0,
          undefined,
          contact.rightProgress,
          impactTick - 3,
        ),
      ]),
    [
      accidentEvent(impactTick, 0, ids, contact.point, {
        [ids[0]]: contact.leftPoint,
        [ids[1]]: contact.rightPoint,
      }, contact.visualPoint, {
        [ids[0]]: contact.leftNormal,
        [ids[1]]: contact.rightNormal,
      }),
    ],
  );
}

export const TRADITIONAL_SIGNAL_TIMING = {
  ewGreenEnd: 40,
  ewYellowEnd: 45,
  allRedEnd: 50,
  totalTicks: 90,
} as const;

export function traditionalSignalPhaseAtTick(
  logicalTick: number,
): TrafficSignalPhase {
  if (logicalTick < TRADITIONAL_SIGNAL_TIMING.ewGreenEnd) {
    return "EW_GREEN";
  }
  if (logicalTick < TRADITIONAL_SIGNAL_TIMING.ewYellowEnd) {
    return "EW_YELLOW";
  }
  if (logicalTick < TRADITIONAL_SIGNAL_TIMING.allRedEnd) {
    return "ALL_RED";
  }
  return "NS_GREEN";
}

function traditionalSignalCycle(): ReplayBundle {
  const lanes = [
    signalLane("W_R1_RIGHT", "OUT_SOUTH_0", "EW", true),
    signalLane("W_S1_STRAIGHT", "OUT_EAST_1", "EW", true),
    signalLane("W_S2_STRAIGHT", "OUT_EAST_2", "EW", true),
    signalLane("W_L1_LEFT", "OUT_NORTH_3", "EW", false),
    signalLane("E_R1_RIGHT", "OUT_NORTH_0", "EW", true),
    signalLane("E_S1_STRAIGHT", "OUT_WEST_1", "EW", true),
    signalLane("E_S2_STRAIGHT", "OUT_WEST_2", "EW", true),
    signalLane("E_L1_LEFT", "OUT_SOUTH_3", "EW", false),
    signalLane("N_R1_RIGHT", "OUT_WEST_0", "NS", true),
    signalLane("N_S1_STRAIGHT", "OUT_SOUTH_1", "NS", true),
    signalLane("N_S2_STRAIGHT", "OUT_SOUTH_2", "NS", true),
    signalLane("N_L1_LEFT", "OUT_EAST_3", "NS", false),
    signalLane("S_R1_RIGHT", "OUT_EAST_0", "NS", true),
    signalLane("S_S1_STRAIGHT", "OUT_NORTH_1", "NS", true),
    signalLane("S_S2_STRAIGHT", "OUT_NORTH_2", "NS", true),
    signalLane("S_L1_LEFT", "OUT_WEST_3", "NS", false),
  ] as const;
  return bundle(
    "traditional-signal-cycle",
    TRADITIONAL_SIGNAL_TIMING.totalTicks,
    (tick) =>
      frame(
        tick,
        lanes.flatMap((lane) =>
          signalLaneVehicles(tick, lane),
        ),
      ),
  );
}

interface SignalDemoLane {
  readonly id: string;
  readonly axis: "EW" | "NS";
  readonly release: boolean;
  readonly route: RoutePath;
  readonly vehicles: readonly SignalDemoVehicle[];
}

interface SignalDemoVehicle {
  readonly type: VehicleType;
  readonly paintHex: string;
}

const SIGNAL_VEHICLE_SPECS = VEHICLE_CATALOG.filter(
  (spec) =>
    (spec.vehicleClass === "passenger" ||
      spec.vehicleClass === "van" ||
      spec.vehicleClass === "truck") &&
    spec.length <= 2.8,
);

const SIGNAL_PAINTS = [
  ...VEHICLE_PAINT_PALETTES.passenger,
  ...VEHICLE_PAINT_PALETTES.commercial,
  ...VEHICLE_PAINT_PALETTES.truck,
].map((swatch) => swatch.hex);

function signalLane(
  routeId: string,
  outboundLaneId: string,
  axis: "EW" | "NS",
  release: boolean,
): SignalDemoLane {
  const count = 4 + Math.floor(Math.random() * 3);
  return {
    id: routeId.toLowerCase(),
    axis,
    release,
    route: routePath(routeId, `IN_${routeId}`, outboundLaneId),
    vehicles: Array.from({ length: count }, () => randomSignalVehicle()),
  };
}

function randomSignalVehicle(): SignalDemoVehicle {
  const spec =
    SIGNAL_VEHICLE_SPECS[
      Math.floor(Math.random() * SIGNAL_VEHICLE_SPECS.length)
    ];
  const paintHex =
    SIGNAL_PAINTS[Math.floor(Math.random() * SIGNAL_PAINTS.length)] ??
    "#e7e4dc";
  return {
    type: (spec?.id ?? "SEDAN") as VehicleType,
    paintHex,
  };
}

function signalLaneVehicles(
  tick: number,
  lane: SignalDemoLane,
): ReplayVehiclePose[] {
  const phaseStart =
    lane.axis === "EW" ? 0 : TRADITIONAL_SIGNAL_TIMING.allRedEnd;
  return lane.vehicles.map((member, index) => {
    const releaseTick = phaseStart + index * 2;
    const released = lane.release && tick >= releaseTick;
    const initialProgress = lane.route.inboundEnd - index * 3;
    const progress =
      initialProgress +
      (released
        ? dampedTravel(tick - releaseTick, 0.96, 1.4)
        : 0);
    return vehicle({
      id: `demo-signal-${lane.id}-${index + 1}`,
      type: member.type,
      route: lane.route,
      progress,
      paintHex: member.paintHex,
      ...(released
        ? {}
        : { state: index === 0 ? "AT_STOPLINE" as const : "QUEUED" as const }),
      waitingTicks: released ? 0 : tick,
    });
  });
}

function crashingVehicle(
  tick: number,
  crashTick: number,
  id: string,
  type: VehicleType,
  route: RoutePath,
  collisionOffset: number,
  length?: number,
  impactProgress?: number,
  arrivalTick: number = crashTick,
): ReplayVehiclePose {
  const center =
    (impactProgress ??
      route.inboundEnd +
        (route.trajectoryEnd - route.inboundEnd) / 2) + collisionOffset;
  const start = center - arrivalTick * 0.82;
  const progress = Math.min(
    center,
    start + dampedTravel(tick, 0.96, 1.5),
  );
  return vehicle({
    id,
    type,
    route,
    progress,
    ...(tick >= crashTick
      ? { state: "ACCIDENT_STOPPED" as const }
      : {}),
    waitingTicks: Math.max(0, tick - crashTick),
    ...(length === undefined ? {} : { length }),
  });
}

function closestRouteContact(
  left: RoutePath,
  right: RoutePath,
  leftDimensions: { readonly length: number; readonly width: number },
  rightDimensions: { readonly length: number; readonly width: number },
): {
  readonly leftProgress: number;
  readonly rightProgress: number;
  readonly leftPoint: { readonly x: number; readonly z: number };
  readonly rightPoint: { readonly x: number; readonly z: number };
  readonly point: { readonly x: number; readonly z: number };
  readonly visualPoint: { readonly x: number; readonly z: number };
  readonly leftNormal: { readonly x: number; readonly z: number };
  readonly rightNormal: { readonly x: number; readonly z: number };
} {
  let best:
    | {
        leftProgress: number;
        rightProgress: number;
        visualPoint: { x: number; z: number };
        normal: { x: number; z: number };
        score: number;
      }
    | undefined;
  for (
    let leftProgress = left.inboundEnd;
    leftProgress <= left.trajectoryEnd;
    leftProgress += 0.1
  ) {
    const leftPose = poseAt(left.poses, leftProgress);
    const leftWorld = mapSimulationPose(
      leftPose.x,
      leftPose.z,
      leftPose.heading,
    );
    const leftBox = createVehicleCollisionBox({
      headX: leftWorld.x,
      headZ: leftWorld.z,
      heading: leftWorld.heading,
      ...leftDimensions,
    });
    for (
      let rightProgress = right.inboundEnd;
      rightProgress <= right.trajectoryEnd;
      rightProgress += 0.1
    ) {
      const rightPose = poseAt(right.poses, rightProgress);
      const rightWorld = mapSimulationPose(
        rightPose.x,
        rightPose.z,
        rightPose.heading,
      );
      const rightBox = createVehicleCollisionBox({
        headX: rightWorld.x,
        headZ: rightWorld.z,
        heading: rightWorld.heading,
        ...rightDimensions,
      });
      const contact = vehicleBoxContact(leftBox, rightBox, 0.04);
      if (contact === undefined) {
        continue;
      }
      const leftFront = frontRatio(leftBox, contact.point);
      const rightFront = frontRatio(rightBox, contact.point);
      if (leftFront < 0.72 || rightFront < 0.72) {
        continue;
      }
      const score =
        contact.penetration * 100 +
        (2 - leftFront - rightFront) * 4 +
        Math.hypot(contact.point.x, contact.point.z) * 0.001;
      if (best === undefined || score < best.score) {
        best = {
          leftProgress,
          rightProgress,
          visualPoint: contact.point,
          normal: contact.normal,
          score,
        };
      }
    }
  }
  if (best === undefined) {
    throw new Error("Could not solve a model-accurate demo collision");
  }
  const leftPose = poseAt(left.poses, best.leftProgress);
  const rightPose = poseAt(right.poses, best.rightProgress);
  return {
    leftProgress: best.leftProgress,
    rightProgress: best.rightProgress,
    leftPoint: { x: leftPose.x, z: leftPose.z },
    rightPoint: { x: rightPose.x, z: rightPose.z },
    point: {
      x: (leftPose.x + rightPose.x) / 2,
      z: (leftPose.z + rightPose.z) / 2,
    },
    visualPoint: best.visualPoint,
    leftNormal: { x: -best.normal.x, z: -best.normal.z },
    rightNormal: best.normal,
  };
}

function frontRatio(
  box: ReturnType<typeof createVehicleCollisionBox>,
  point: { readonly x: number; readonly z: number },
): number {
  const forward = { x: Math.sin(box.heading), z: Math.cos(box.heading) };
  return (
    ((point.x - box.center.x) * forward.x +
      (point.z - box.center.z) * forward.z) /
    (box.length / 2)
  );
}

function accidentEvent(
  tick: number,
  sequence: number,
  vehicleIds: readonly string[],
  contactPoint: { readonly x: number; readonly z: number } = { x: 0, z: 0 },
  participantContactPoints: Readonly<
    Record<string, { readonly x: number; readonly z: number }>
  > = {},
  visualContactPoint?: { readonly x: number; readonly z: number },
  participantContactNormals: Readonly<
    Record<string, { readonly x: number; readonly z: number }>
  > = {},
): ReplayEvent {
  const severity = sequence < 2 ? "SERIOUS" as const : "CRITICAL" as const;
  const participants = vehicleIds.map((vehicleId, index) => {
    const heading = demoCrashHeading(vehicleId);
    const sign = index % 2 === 0 ? 1 : -1;
    const impulse = {
      x: Math.sin(heading) * 0.55 + Math.cos(heading) * 0.2 * sign,
      z: Math.cos(heading) * 0.55 - Math.sin(heading) * 0.2 * sign,
    };
    const dentDepth = Math.min(0.62, 0.3 + sequence * 0.045 + index * 0.035);
    return {
      vehicleId,
      preImpactVelocity: {
        x: Math.sin(heading),
        z: Math.cos(heading),
      },
      impulse,
      restPose: {
        x: impulse.x,
        z: impulse.z,
        heading: heading + sign * 0.24,
      },
      contactPoint: participantContactPoints[vehicleId] ?? contactPoint,
      ...(visualContactPoint === undefined ? {} : { visualContactPoint }),
      contactNormal:
        participantContactNormals[vehicleId] ??
        { x: -impulse.x, z: -impulse.z },
      damageSeverity: severity,
      massKg: 1_280 + index * 420,
      impactEnergy: 1_450 + sequence * 380 + index * 240,
      dentRadius: Math.min(1.08, 0.7 + sequence * 0.055 + index * 0.04),
      dentDepth,
      deformation: dentDepth / 0.68,
      slideTicks: 4 + sequence % 3,
      hazardResourceIds: ["SPACE:0:0"],
    };
  });
  return {
    id: `demo-chain-crash-${sequence}`,
    kind: "ACCIDENT",
    tick,
    sequence,
    payload: {
      incidentId: `demo-chain-incident-${sequence}`,
      vehicleIds,
      lockedResourceIds: [],
      collisionType: "ANGLE_COLLISION",
      severity,
      collisionOutcomes: [
        {
          impactTick: tick,
          resourceId: "SPACE:0:0",
          contactPoint,
          collisionType: "ANGLE_COLLISION",
          severity,
          vehicles: participants,
          pedestrians: [],
        },
      ],
    },
  };
}

function demoCrashHeading(vehicleId: string): number {
  if (vehicleId.includes("north")) {
    return 0;
  }
  if (vehicleId.includes("south")) {
    return Math.PI;
  }
  if (vehicleId.includes("east")) {
    return -Math.PI / 2;
  }
  return Math.PI / 2;
}

function bundle(
  id: DemoId,
  totalTicks: number,
  makeFrame: (tick: number) => ReplayFrame,
  events: readonly ReplayEvent[] = [],
): ReplayBundle {
  const frames = Array.from({ length: totalTicks + 1 }, (_, tick) =>
    makeFrame(tick),
  );
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    simulationRulesVersion: SIMULATION_RULES_VERSION,
    tickDurationMs: TICK_DURATION_MS,
    warmupTicks: 0,
    totalTicks,
    identity: {
      model: `demo:${id}`,
      testDate: "demo",
      postfix: id,
    },
    model: `DEMO · ${demoDescriptor(id).title}`,
    seed: 63916,
    scene: DEMO_SCENE,
    frames,
    events,
    cycles: [],
  };
}

function frame(
  tick: number,
  vehicles: readonly ReplayVehiclePose[],
  pedestrians: readonly ReplayPedestrianPose[] = [],
): ReplayFrame {
  return {
    tick,
    phase: "tick",
    vehicles,
    pedestrians,
    financialBalance: vehicles.reduce(
      (sum, item) => sum + (item.score ?? 0),
      0,
    ),
  };
}

function vehicle(input: VehicleFrameInput): ReplayVehiclePose {
  const progress = Math.max(0, input.progress);
  const head = poseAt(input.route.poses, progress);
  const length = input.length ?? 3;
  const inferredState =
    progress < input.route.inboundEnd
      ? "APPROACHING"
      : progress <= input.route.trajectoryEnd
        ? "CROSSING"
        : "OUTBOUND";
  return {
    id: input.id,
    type: input.type,
    state: input.state ?? inferredState,
    routeId: input.route.routeId,
    inboundLaneId: input.route.inboundLaneId,
    outboundLaneId: input.route.outboundLaneId,
    waitingTicks: input.waitingTicks ?? 0,
    turnPathProgress: progress - input.route.inboundEnd,
    x: head.x,
    z: head.z,
    heading: head.heading,
    segments: Array.from({ length }, (_, offset) =>
      poseAt(input.route.poses, Math.max(0, progress - offset)),
    ),
    ...(input.score === undefined ? {} : { score: input.score }),
    ...(input.scorePhase === undefined
      ? {}
      : { scorePhase: input.scorePhase }),
    ...(input.paintHex === undefined ? {} : { paintHex: input.paintHex }),
  };
}

function routePath(
  routeId: string,
  inboundLaneId: string,
  outboundLaneId: string,
  scene: ReplayScene = DEMO_SCENE,
): RoutePath {
  const inbound = scene.inboundLanes.find((lane) => lane.id === inboundLaneId);
  const trajectory = scene.trajectories.find((lane) => lane.id === routeId);
  const outbound = scene.outboundLanes.find((lane) => lane.id === outboundLaneId);
  if (inbound === undefined || trajectory === undefined || outbound === undefined) {
    throw new Error(`Missing demo route geometry for ${routeId}`);
  }
  const poses = [
    ...inbound.slots,
    ...trajectory.slots.slice(1),
    ...outbound.slots.slice(1),
  ];
  return {
    routeId,
    inboundLaneId,
    outboundLaneId,
    inboundEnd: inbound.slots.length - 1,
    trajectoryEnd: inbound.slots.length + trajectory.slots.length - 2,
    poses,
  };
}

function poseAt(poses: readonly ReplayPose[], progress: number): ReplayPose {
  const lastIndex = poses.length - 1;
  const last = poses[lastIndex];
  if (last !== undefined && progress >= lastIndex) {
    const overflow = progress - lastIndex;
    return {
      x: last.x + Math.sin(last.heading) * overflow,
      z: last.z + Math.cos(last.heading) * overflow,
      heading: last.heading,
    };
  }
  const lower = Math.floor(progress);
  const upper = Math.min(lastIndex, Math.ceil(progress));
  const from = poses[lower] ?? poses[0] ?? { x: 0, z: 0, heading: 0 };
  const to = poses[upper] ?? from;
  return interpolatePose(from, to, progress - lower);
}

export function dampedTravel(
  elapsedTicks: number,
  terminalSpeed: number,
  dampingTicks: number,
): number {
  const elapsed = Math.max(0, elapsedTicks);
  const damping = Math.max(0.001, dampingTicks);
  return (
    Math.max(0, terminalSpeed) *
    (elapsed - damping * (1 - Math.exp(-elapsed / damping)))
  );
}
