import type {
  CompactObservation,
  CrosswalkSlotView,
  Direction,
  Maneuver,
  PedestrianDirection,
  RoadNetwork,
  SpeedProfile,
} from "../../core/types.js";
import { passengersFor } from "../../core/vehicleRoster.js";
import { config } from "../../config.js";
import type { JevQuestion } from "./client.js";

export const CHOICE_CONFIDENCE_THRESHOLD = 0.4;
export const NOUL_YES_THRESHOLD = 0.5;

// 是否给 Jev 补上「对话式 agent 早就拿到的」代价上下文。
//
// 背景：文本 agent 的 system prompt 有 10,443 字，逐项列出了所有扣费率；
// Jev 走 System One 协议，请求体只有 { model, state, questions }，没有
// system prompt 字段，规则只能写在 state 或 questions 的 criteria 里。
// 原版适配只给了裸数值，于是 Jev 完全不知道「睡久了在掉钱」「不放行会被罚」。
//
// 默认启用代价上下文、探测修补和安全校验，不修改仿真经济参数或物理规则。
// 未单独覆盖子开关时，JEV_ADAPT=off 恢复原版适配路径。
const JEV_ADAPT = !/^(0|off|false|no)$/i.test(String(process.env.JEV_ADAPT ?? "").trim());
// 拆分子开关：便于 A/B 归因（哪个维度的补充真正起作用）。
// 未单独设置时继承 JEV_ADAPT，实验性空间描述默认关闭。
const adaptOf = (key: string, defaultValue = JEV_ADAPT) =>
  process.env[key] === undefined
    ? defaultValue
    : /^(1|on|true|yes)$/i.test(String(process.env[key]).trim());
const ADAPT_RELEASE = adaptOf("JEV_ADAPT_RELEASE");
const ADAPT_SLEEP = adaptOf("JEV_ADAPT_SLEEP");
const ADAPT_HOLD = adaptOf("JEV_ADAPT_HOLD");
// 事故处置措辞。这是实测最大的失分点（hazardBleed 68.95 vs search 3.69），
// 单独给一个开关便于归因。
export const ADAPT_INCIDENT = adaptOf("JEV_ADAPT_INCIDENT");
// 相位探测预算：先试不同相位，再试去斑马线的修补版。
export const ADAPT_PROBE = adaptOf("JEV_ADAPT_PROBE");
// 把「相位会压过哪条斑马线、行人还剩几拍耐心」写进选项描述。
export const ADAPT_PEDESTRIAN = adaptOf("JEV_ADAPT_PEDESTRIAN");
// Experimental: the 5+5 comparison did not establish a score improvement.
// Opt in explicitly; the safety guard below does not depend on this context.
export const ADAPT_CROSSWALK = adaptOf("JEV_ADAPT_CROSSWALK", false);
export const ADAPT_JAYWALK_GUARD = adaptOf("JEV_ADAPT_JAYWALK_GUARD");
export const ADAPT_RESERVATIONS = adaptOf("JEV_ADAPT_RESERVATIONS");
export const ADAPT_PARITY_INPUT = adaptOf("JEV_ADAPT_PARITY_INPUT");
// The 5+5 ablation did not establish a meaningful score gain over full input.
export const ADAPT_FEEDBACK = adaptOf("JEV_ADAPT_FEEDBACK", false);
export const ADAPT_CONDITIONAL = adaptOf("JEV_ADAPT_CONDITIONAL", false);
// Isolated experiment: consume only a second probe the original selector left idle.
export const ADAPT_HORIZON_SHRINK = adaptOf("JEV_ADAPT_HORIZON_SHRINK", false);
export const ADAPT_PEDESTRIAN_WINDOW = adaptOf("JEV_ADAPT_PEDESTRIAN_WINDOW", false);
export const ADAPT_REPAIR_TAILGATE = adaptOf("JEV_ADAPT_REPAIR_TAILGATE", false);

export const PHASE_KEY = "phase";
export const RELEASE_KEY = "release_size";
export const SLEEP_KEY = "sleep";
export const INCIDENT_ID_KEY = "incident_id";
export const INCIDENT_ACTION_KEY = "incident_action";
export const EVAC_LANE_KEY = "evac_lane";
export const HOLD_LANE_KEY = "hold_lane";
export const STALL_VEHICLE_KEY = "stall_vehicle";
export const STALL_ACTION_KEY = "stall_action";
export const STALL_TARGET_KEY = "stall_target";
export const EMERGENCY_CLEAR_KEY = "clear_emergency";
export const EMERGENCY_VEHICLE_KEY = "emergency_vehicle";

export const HOLD_PHASE = "HOLD";
export const PEDESTRIAN_PHASE = "PEDESTRIANS_ONLY";

export const RELEASE_OPTIONS = {
  HEAD_ONLY: 1,
  SHORT_WAVE: 3,
  LONG_WAVE: 6,
} as const;
export type ReleaseOption = keyof typeof RELEASE_OPTIONS;

export const SLEEP_OPTIONS = {
  SHORT: 2,
  MEDIUM: 5,
  LONG: 9,
} as const;
export type SleepOption = keyof typeof SLEEP_OPTIONS;

const RELEASE_CRITERIA_BASE: Record<ReleaseOption, string> = {
  HEAD_ONLY: "Release only the vehicle at the stop line on each lane",
  SHORT_WAVE: "Release the first 3 queued vehicles on each lane",
  LONG_WAVE: "Release up to 6 queued vehicles on each lane to drain long queues",
};

// 补充版：说明放行量与等待代价的权衡。
// 注意一个容易搞错的事实：正常放行的车会检查出口容量，只有「闯红灯/跟车闯入」的
// 车才会停在路口里变成 EXIT_BLOCKED 并锁格。所以不能说「放太多会溢流出口锁格」——
// 那是违规车才有的行为。真正与放行量相关的是：
//   · 放行越多 → 队列越短 → 静止扣费越少（但每拍决策税照付）
//   · 放行越多 → 路口内车辆越多 → 越可能挤占后续相位，且每辆放行车会占用出口资源
//   · 截止时仍在进口道等待的车辆，每位乘员一次性扣 unservedVehicleLiability
const RELEASE_CRITERIA_ADAPT: Record<ReleaseOption, string> = {
  HEAD_ONLY: `Release only the vehicle at the stop line on each lane. Lowest throughput, so the queue behind keeps waiting and stationary queued vehicles keep being charged after the ${config.simulation.waitingChargeGraceTicks}-tick grace period. The decision tax is independent of wave size. A small wave leaves more exit capacity for the vehicles already inside`,
  SHORT_WAVE: "Release the first 3 queued vehicles on each lane. Balanced: the queue shrinks so fewer vehicles sit stationary and get charged, while you keep enough exit capacity for what is already crossing",
  LONG_WAVE: `Release up to 6 queued vehicles on each lane to drain long queues. Highest throughput, so fewer vehicles are left waiting and charged on the queue, and you carry more toll revenue; the cost is more vehicles inside the junction competing for exit capacity and for the next decision cycle, and anything still unserved at the deadline is charged ${config.economy.unservedVehicleLiability} per passenger as a one-off liability`,
};

const SLEEP_CRITERIA_BASE: Record<SleepOption, string> = {
  SHORT: "Wait 2 ticks and decide again soon, for example until a reservation expires",
  MEDIUM: "Wait 5 ticks while a short wave moves through",
  LONG: "Wait 9 ticks so a long released wave can leave the intersection",
};

// 补充版：把「等待本身在扣钱」讲清楚。费率取自 config，不硬编码。
// 措辞严格对齐 buildTrafficSystemPrompt() 的计分段，事实边界如下：
//   1. delayBleed 只对「连续静止满 grace(10) 拍」的车收取，且在 delay horizon 内；
//      仍在缓慢前移的车不扣。所以不能说「queued 全部每拍扣」。
//   2. upstream 积压是「已按种子生成但进不了已满车道」的界外 FIFO，每位乘员每拍扣，
//      与本车道是否放行无关，是纯粹的等待代价。
//   3. hazard 是「被事故锁住的冲突格」每拍扣，与车辆数无关。
//   4. stallChain 是抛锚车后方连续堵住超过 20 拍后的第 k 拍加价，随睡眠继续上涨。
const STALL_CHAIN_AFTER = config.simulation.stallChainAfterTicks;
const STALL_CHAIN_STEP = config.economy.stallChainStep;
const DELAY_GRACE = config.simulation.waitingChargeGraceTicks;
const SLEEP_CRITERIA_ADAPT: Record<SleepOption, string> = {
  SHORT: `Wait 2 ticks and decide again soon, for example until a reservation expires. Waiting is not free. Every tick you sleep, the vehicles still queued behind a stop line that have been stationary for ${DELAY_GRACE} ticks or more are charged ${config.economy.delayBleedPerTick} per passenger per tick, and the upstream backlog of vehicles that cannot enter a full lane is charged ${config.economy.upstreamBleedPerTick} per passenger per tick. Each open accident keeps charging ${config.economy.hazardBleedPerResource} per locked cell per tick, and a vehicle queued behind a broken one for more than ${STALL_CHAIN_AFTER} ticks is charged an escalating ${STALL_CHAIN_STEP} per extra blocked tick. A short sleep means more decision cycles, and every API decision costs ${config.economy.decisionTax}`,
  MEDIUM: `Wait 5 ticks while a short wave moves through. All 5 ticks keep charging: stationary queued vehicles after the ${DELAY_GRACE}-tick grace period, the upstream backlog at ${config.economy.upstreamBleedPerTick} per passenger per tick, every open accident at ${config.economy.hazardBleedPerResource} per locked cell per tick, and a stall chain behind a broken vehicle that keeps getting more expensive the longer you wait`,
  LONG: `Wait 9 ticks so a long released wave can leave the intersection. You pay for all 9 ticks of waiting: stationary queued vehicles after the ${DELAY_GRACE}-tick grace period, the upstream backlog at ${config.economy.upstreamBleedPerTick} per passenger per tick, every open accident at ${config.economy.hazardBleedPerResource} per locked cell per tick, and a stall chain behind a broken vehicle that keeps getting more expensive the longer you wait. You also get fewer decision cycles before the deadline, and each cycle costs ${config.economy.decisionTax}. Only worth it when a long wave really needs the whole window`,
};

// 旧版措辞（首版实现，含三处事实错误），保留用于 A/B 对照：
//   1. 说「queued and stranded vehicles are charged every tick」——实际只扣
//      「连续静止满 grace 拍」的车，仍在缓慢前移的不扣。
//   2. 说放行会「overflow a full exit and lock cells」——正常放行的车会检查出口容量，
//      只有闯红灯/跟车闯入的车才会 EXIT_BLOCKED 锁格。这条会误导模型回避放行。
//   3. 遗漏 stallChain（抛锚车后方逐拍加价），而这是睡眠期间最贵的隐藏成本之一。
// JEV_ADAPT_WORDING=legacy 可切回这版做对照实验。
const SLEEP_CRITERIA_LEGACY: Record<SleepOption, string> = {
  SHORT: `Wait 2 ticks and decide again soon, for example until a reservation expires. Waiting is not free: every tick, queued and stranded vehicles are charged (${config.economy.delayBleedPerTick}/passenger/tick after the grace period), the upstream backlog is charged (${config.economy.upstreamBleedPerTick}/passenger/tick) and every open accident is charged per locked cell (${config.economy.hazardBleedPerResource}/cell/tick). Short sleeps need more decisions, and each decision costs ${config.economy.decisionTax}`,
  MEDIUM: `Wait 5 ticks while a short wave moves through. All 5 ticks keep charging the waiting vehicles, the upstream backlog and every open accident's locked cells`,
  LONG: `Wait 9 ticks so a long released wave can leave the intersection. You pay for all 9 ticks: everything still queued or stranded is charged every tick, the upstream backlog is charged every tick, every open accident keeps charging per locked cell, and you get fewer decisions before the deadline. Only worth it when a long wave really needs the whole window`,
};

const RELEASE_CRITERIA_LEGACY: Record<ReleaseOption, string> = {
  HEAD_ONLY: "Release only the vehicle at the stop line on each lane. Lowest risk of overflowing a downstream exit, but the queue behind keeps waiting and queued passengers are charged every tick",
  SHORT_WAVE: "Release the first 3 queued vehicles on each lane. Every released vehicle needs room in an exit lane; if an exit is full the vehicle blocks the junction and locks cells, which is charged every tick",
  LONG_WAVE: "Release up to 6 queued vehicles on each lane to drain long queues. Highest throughput but the highest risk of overflowing a full exit and locking junction cells, which is charged every tick",
};

const HOLD_DESCRIPTION_LEGACY =
  "Release nothing this cycle and let traffic already in the intersection clear. Nothing is served: the queues and the upstream backlog keep charging every tick, any open accident keeps charging per locked cell, and every vehicle still unserved at the deadline is charged a one-off liability. Only take this when releasing now would be unsafe";

const USE_LEGACY_WORDING =
  /^(legacy|1|on|true|yes)$/i.test(String(process.env.JEV_ADAPT_WORDING ?? "").trim());

const SLEEP_CRITERIA: Record<SleepOption, string> = ADAPT_SLEEP
  ? (USE_LEGACY_WORDING ? SLEEP_CRITERIA_LEGACY : SLEEP_CRITERIA_ADAPT)
  : SLEEP_CRITERIA_BASE;

const RELEASE_CRITERIA: Record<ReleaseOption, string> = ADAPT_RELEASE
  ? (USE_LEGACY_WORDING ? RELEASE_CRITERIA_LEGACY : RELEASE_CRITERIA_ADAPT)
  : RELEASE_CRITERIA_BASE;

export interface EligibleLane {
  readonly releaseCount?: number;
  readonly speedProfile?: SpeedProfile;
  readonly laneId: string;
  readonly routeId: string;
  readonly approach: Direction;
  readonly maneuver: Maneuver;
  readonly waitingTicks: number;
  readonly queuedVehicles: number;
  readonly queuedPassengers?: number;
  readonly impatientDrivers?: number;
  readonly crosswalkIds?: readonly string[];
}

export interface JevPedestrianPhase {
  readonly crosswalk_id: string;
  readonly directions: PedestrianDirection[];
}

export type PhaseKind = "VEHICLE" | "PEDESTRIANS" | "HOLD";

export interface PhaseCandidate {
  readonly key: string;
  readonly kind: PhaseKind;
  readonly lanes: readonly EligibleLane[];
  readonly pedestrianPhases: readonly JevPedestrianPhase[];
  readonly queuedVehicles: number;
  readonly queuedPassengers?: number;
  readonly impatientDrivers?: number;
  readonly maxWaitTicks: number;
  readonly emergencyVehicles: number;
  readonly waitingPedestrians: number;
  readonly minPatienceRemaining?: number;
  readonly description: string;
}

export interface JevIncidentFact {
  readonly incidentId: string;
  readonly suggestedEvacLanes: readonly string[];
  readonly severedLaneIds: readonly string[];
  readonly lockedCrosswalkIds?: readonly string[];
}

export interface JevStallTarget {
  readonly laneId: string;
  readonly maxMovableVehicles: number;
}

export interface JevStallFact {
  readonly vehicleId: string;
  readonly laneId: string;
  readonly blockedBehindCount: number;
  readonly targets: readonly JevStallTarget[];
}

export interface JevEmergencyFact {
  readonly vehicleId: string;
  readonly laneId: string;
  readonly stationaryTicks: number;
}

export type IncidentAction = "CLEAR" | "HOLD" | "IGNORE";
export type StallAction = "REROUTE" | "TOW" | "IGNORE";

export interface JevCrosswalkFact {
  readonly crosswalkId: string;
  readonly waiting: number;
  readonly minPatienceRemaining?: number;
  readonly jaywalking: number;
  readonly vehicleCells?: number;
  readonly vehicleReservedUntil?: number;
  readonly vehicleReservationTicksRemaining?: number;
}

export interface JevDecisionFacts {
  readonly phases: readonly PhaseCandidate[];
  readonly askRelease: boolean;
  readonly incidents: readonly JevIncidentFact[];
  readonly askIncidentId: boolean;
  readonly incidentActions: readonly IncidentAction[];
  readonly evacLanes: readonly string[];
  readonly holdLanes: readonly string[];
  readonly stalls: readonly JevStallFact[];
  readonly askStallVehicle: boolean;
  readonly stallActions: readonly StallAction[];
  readonly stallTargets: readonly string[];
  readonly emergencies: readonly JevEmergencyFact[];
  readonly askEmergencyVehicle: boolean;
  readonly jaywalkingCrosswalkIds?: readonly string[];
  readonly crosswalkMinPatience?: Readonly<Record<string, number>>;
  readonly crosswalks?: readonly JevCrosswalkFact[];
}

export interface JevQuestionBuild {
  readonly questions: Readonly<Record<string, JevQuestion>>;
  readonly facts: JevDecisionFacts;
}

interface PhaseTemplate {
  readonly key: string;
  readonly approaches: readonly Direction[];
  readonly maneuvers: readonly Maneuver[];
  readonly crosswalkApproaches: readonly Direction[];
  readonly label: string;
}

const PHASE_TEMPLATES: readonly PhaseTemplate[] = [
  {
    key: "NS_STRAIGHT",
    approaches: ["NORTH", "SOUTH"],
    maneuvers: ["STRAIGHT"],
    crosswalkApproaches: ["EAST", "WEST"],
    label: "north and south straight lanes",
  },
  {
    key: "EW_STRAIGHT",
    approaches: ["EAST", "WEST"],
    maneuvers: ["STRAIGHT"],
    crosswalkApproaches: ["NORTH", "SOUTH"],
    label: "east and west straight lanes",
  },
  {
    key: "NS_STRAIGHT_RIGHT",
    approaches: ["NORTH", "SOUTH"],
    maneuvers: ["STRAIGHT", "RIGHT"],
    crosswalkApproaches: [],
    label: "north and south straight and right-turn lanes",
  },
  {
    key: "EW_STRAIGHT_RIGHT",
    approaches: ["EAST", "WEST"],
    maneuvers: ["STRAIGHT", "RIGHT"],
    crosswalkApproaches: [],
    label: "east and west straight and right-turn lanes",
  },
  {
    key: "NS_LEFT",
    approaches: ["NORTH", "SOUTH"],
    maneuvers: ["LEFT"],
    crosswalkApproaches: [],
    label: "north and south left-turn lanes",
  },
  {
    key: "EW_LEFT",
    approaches: ["EAST", "WEST"],
    maneuvers: ["LEFT"],
    crosswalkApproaches: [],
    label: "east and west left-turn lanes",
  },
  ...(["NORTH", "EAST", "SOUTH", "WEST"] as const).map((direction) => ({
    key: `ALL_${direction}`,
    approaches: [direction],
    maneuvers: ["LEFT", "STRAIGHT", "RIGHT"] as const,
    crosswalkApproaches: [],
    label: `every lane approaching from the ${direction.toLowerCase()}`,
  })),
];

export function buildJevQuestions(input: {
  readonly observation: CompactObservation;
  readonly network: RoadNetwork;
  readonly incidents?: readonly JevIncidentFact[];
  readonly crosswalkSlots?: readonly CrosswalkSlotView[];
  readonly allowReservedLanes?: boolean;
  readonly flexiblePhases?: boolean;
}): JevQuestionBuild {
  const observation = input.observation;
  const heldLanes = new Set(observation.activeLaneHolds.map((hold) => hold.laneId));
  const incidents = (input.incidents ?? [])
    .map((incident) => ({
      ...incident,
      severedLaneIds: incident.severedLaneIds.filter((laneId) => !heldLanes.has(laneId)),
    }))
    .filter(
      (incident) =>
        incident.suggestedEvacLanes.length > 0 || incident.severedLaneIds.length > 0,
    );
  const lockedCrosswalks = new Set(
    (input.incidents ?? []).flatMap((incident) => incident.lockedCrosswalkIds ?? []),
  );
  const crosswalks = ADAPT_CROSSWALK ? crosswalkFacts(observation, input.crosswalkSlots) : undefined;
  const phases = phaseCandidates(observation, input.network, lockedCrosswalks, crosswalks, input.allowReservedLanes ?? ADAPT_RESERVATIONS, input.flexiblePhases ?? false);
  const stalls = stallFactsFrom(observation);
  const emergencies = emergencyFactsFrom(observation);
  const evacLanes = unique(incidents.flatMap((incident) => incident.suggestedEvacLanes));
  const holdLanes = unique(incidents.flatMap((incident) => incident.severedLaneIds));
  const incidentActions: IncidentAction[] = [];
  if (incidents.length > 0) {
    if (evacLanes.length > 0) {
      incidentActions.push("CLEAR");
    }
    if (holdLanes.length > 0) {
      incidentActions.push("HOLD");
    }
    incidentActions.push("IGNORE");
  }
  const stallTargets = unique(
    stalls.flatMap((stall) =>
      stall.targets
        .filter((target) => target.maxMovableVehicles > 0)
        .map((target) => target.laneId),
    ),
  );
  const stallActions: StallAction[] =
    stalls.length === 0
      ? []
      : stallTargets.length > 0
        ? ["REROUTE", "TOW", "IGNORE"]
        : ["TOW", "IGNORE"];
  const facts: JevDecisionFacts = {
    phases,
    askRelease: phases.some((phase) => phase.kind === "VEHICLE"),
    incidents,
    askIncidentId: incidents.length > 1,
    incidentActions,
    evacLanes,
    holdLanes,
    stalls,
    askStallVehicle: stalls.length > 1,
    stallActions,
    stallTargets,
    emergencies,
    askEmergencyVehicle: emergencies.length > 1,
    jaywalkingCrosswalkIds: jaywalkingCrosswalkIds(observation),
    crosswalkMinPatience: crosswalkMinPatience(observation),
    ...(crosswalks === undefined ? {} : { crosswalks }),
  };

  const questions: Record<string, JevQuestion> = {
    [PHASE_KEY]: {
      type: "choice",
      instructions:
        "Pick the signal phase this traffic intersection should run next. The goal is to earn exit revenue while avoiding delay, pedestrian and accident penalties. Revenue and delay are counted per passenger, so a 40-seat bus is worth many cars. Drivers left waiting too long run the red light, pay nothing, and may crash.",
      criteria: Object.fromEntries(
        phases.map((phase) => [phase.key, phase.description]),
      ),
    },
  };
  if (facts.askRelease) {
    questions[RELEASE_KEY] = {
      type: "choice",
      instructions: "If vehicles are released, how many should each lane release?",
      criteria: RELEASE_CRITERIA,
    };
  }
  questions[SLEEP_KEY] = {
    type: "choice",
    instructions: "How long should the intersection run before the next decision?",
    criteria: SLEEP_CRITERIA,
  };
  if (facts.askIncidentId) {
    questions[INCIDENT_ID_KEY] = {
      type: "choice",
      instructions: "Which open accident should be handled this cycle?",
      criteria: Object.fromEntries(
        incidents.map((incident) => [
          incident.incidentId,
          `Open accident ${incident.incidentId}`,
        ]),
      ),
    };
  }
  if (incidentActions.length > 0) {
    questions[INCIDENT_ACTION_KEY] = {
      type: "choice",
      instructions: "How should the open accident be handled this cycle?",
      criteria: Object.fromEntries(
        incidentActions.map((action) => [action, incidentActionText(action)]),
      ),
    };
  }
  if (evacLanes.length > 0) {
    questions[EVAC_LANE_KEY] = {
      type: "choice",
      instructions: "Which suggested evacuation lane should the accident vehicles use?",
      criteria: Object.fromEntries(
        evacLanes.map((laneId) => [laneId, `Evacuation lane ${laneId}`]),
      ),
    };
  }
  if (holdLanes.length > 0) {
    questions[HOLD_LANE_KEY] = {
      type: "choice",
      instructions: "Which severed inbound lane should be held at the stop line?",
      criteria: Object.fromEntries(
        holdLanes.map((laneId) => [laneId, `Hold inbound lane ${laneId}`]),
      ),
    };
  }
  if (facts.askStallVehicle) {
    questions[STALL_VEHICLE_KEY] = {
      type: "choice",
      instructions: "Which stalled vehicle should be handled this cycle?",
      criteria: Object.fromEntries(
        stalls.map((stall) => [
          stall.vehicleId,
          `Stalled vehicle on ${stall.laneId} blocking ${stall.blockedBehindCount} vehicles`,
        ]),
      ),
    };
  }
  if (stallActions.length > 0) {
    questions[STALL_ACTION_KEY] = {
      type: "choice",
      instructions: "How should the stalled vehicle be handled?",
      criteria: Object.fromEntries(
        stallActions.map((action) => [action, stallActionText(action)]),
      ),
    };
  }
  if (stallTargets.length > 0) {
    questions[STALL_TARGET_KEY] = {
      type: "choice",
      instructions: "Which adjacent lane should vehicles behind the stall move into?",
      criteria: Object.fromEntries(
        stallTargets.map((laneId) => [laneId, `Bypass lane ${laneId}`]),
      ),
    };
  }
  if (emergencies.length > 0) {
    questions[EMERGENCY_CLEAR_KEY] = {
      type: "noul",
      instructions: "Release the emergency vehicle and the cars in front of it as a convoy now.",
      criteria: {
        true: "Dispatch the emergency convoy",
        false: "Leave the emergency vehicle in queue",
      },
    };
  }
  if (facts.askEmergencyVehicle) {
    questions[EMERGENCY_VEHICLE_KEY] = {
      type: "choice",
      instructions: "Which emergency vehicle should the convoy release?",
      criteria: Object.fromEntries(
        emergencies.map((alert) => [
          alert.vehicleId,
          `Emergency vehicle on ${alert.laneId}, stopped for ${alert.stationaryTicks} ticks`,
        ]),
      ),
    };
  }
  return { questions, facts };
}

export function buildJevState(input: {
  readonly observation: CompactObservation;
  readonly facts: JevDecisionFacts;
  readonly recentCycles: readonly {
    readonly tick: number;
    readonly admittedVehicleIds: readonly string[];
    readonly tacticalSummary: string;
  }[];
}): Record<string, unknown> {
  const observation = input.observation;
  return {
    tick: observation.currentTick,
    balance: Number(observation.financialBalance.toFixed(2)),
    ...(input.facts.crosswalks === undefined ? {} : { crosswalks: input.facts.crosswalks }),
    ...(observation.interruptReason === undefined
      ? {}
      : { interrupt: observation.interruptReason }),
    phases: input.facts.phases.map((phase) => ({
      phase: phase.key,
      queued: phase.queuedVehicles,
      ...(phase.kind === "VEHICLE" ? { passengers: phase.queuedPassengers ?? phase.queuedVehicles } : {}),
      ...((phase.impatientDrivers ?? 0) > 0 ? { impatientDrivers: phase.impatientDrivers } : {}),
      longestWait: phase.maxWaitTicks,
      emergency: phase.emergencyVehicles,
      pedestrians: phase.waitingPedestrians,
    })),
    ...(input.facts.incidents.length === 0
      ? {}
      : { openAccidents: input.facts.incidents.map((incident) => incident.incidentId) }),
    ...(input.facts.stalls.length === 0
      ? {}
      : {
          stalls: input.facts.stalls.map((stall) => ({
            lane: stall.laneId,
            blockedBehind: stall.blockedBehindCount,
          })),
        }),
    ...(input.facts.emergencies.length === 0
      ? {}
      : {
          emergencies: input.facts.emergencies.map((alert) => ({
            lane: alert.laneId,
            stoppedTicks: alert.stationaryTicks,
          })),
        }),
    recentCycles: input.recentCycles.map((cycle) => ({
      tick: cycle.tick,
      admitted: cycle.admittedVehicleIds.length,
      decision: cycle.tacticalSummary,
    })),
  };
}

function phaseCandidates(
  observation: CompactObservation,
  network: RoadNetwork,
  lockedCrosswalks: ReadonlySet<string>,
  crosswalks?: readonly JevCrosswalkFact[],
  allowReservedLanes = false,
  flexiblePhases = false,
): PhaseCandidate[] {
  const lanes = eligibleLanes(observation, network, allowReservedLanes);
  const pedestrianPhases = waitingPedestrianPhases(observation).filter(
    (phase) => !lockedCrosswalks.has(phase.crosswalkId),
  );
  const emergencyLanes = new Set(observation.emergencyAlerts.map((alert) => alert.laneId));
  // 斑马线层面的行人耐心。baselines 的 balanced 策略一直在用（过滤掉
  // 「车道经过高风险斑马线」的相位、行人快失望时把行人相位提到最前），
  // 但这份信息从来没有传给 Jev —— 它只能看到相位自身附带的行人数，
  // 看不到「我放这条车道，会挡住那条有 3 拍就闯红灯的行人的斑马线」。
  const cxPatience = crosswalkMinPatience(observation);
  const jaywalking = new Set(jaywalkingCrosswalkIds(observation));
  const candidates: PhaseCandidate[] = [];
  const seen = new Set<string>();
  for (const template of PHASE_TEMPLATES) {
    const selected = lanes.filter(
      (lane) =>
        template.approaches.includes(lane.approach) &&
        template.maneuvers.includes(lane.maneuver),
    );
    if (selected.length === 0) {
      continue;
    }
    const peds = pedestrianPhases.filter((phase) =>
      template.crosswalkApproaches.some(
        (direction) => phase.crosswalkId === `CROSSWALK:${direction}`,
      ),
    );
    const signature = `${selected.map((lane) => lane.laneId).join(",")}|${peds
      .map((phase) => phase.crosswalkId)
      .join(",")}`;
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    const queued = selected.reduce((sum, lane) => sum + lane.queuedVehicles, 0);
    const passengers = selected.reduce(
      (sum, lane) => sum + (lane.queuedPassengers ?? lane.queuedVehicles),
      0,
    );
    const impatient = selected.reduce((sum, lane) => sum + (lane.impatientDrivers ?? 0), 0);
    const maxWait = Math.max(...selected.map((lane) => lane.waitingTicks));
    const emergency = selected.filter((lane) => emergencyLanes.has(lane.laneId)).length;
    const pedestrians = peds.reduce((sum, phase) => sum + phase.waiting, 0);
    const patience = minPatience(peds);
    // 这条相位放行时，车道会压过哪些斑马线，以及那些斑马线上最急的行人还剩几拍。
    const crossedCrosswalks = [...new Set(selected.flatMap((lane) => lane.crosswalkIds ?? []))];
    const crosswalkRisk = crossedCrosswalks
      .map((crosswalkId) => ({ crosswalkId, patience: cxPatience[crosswalkId], jaywalking: jaywalking.has(crosswalkId) }))
      .filter((item) => item.patience !== undefined || item.jaywalking)
      .sort((left, right) => (left.patience ?? 999) - (right.patience ?? 999));
    candidates.push({
      key: template.key,
      kind: "VEHICLE",
      lanes: selected,
      pedestrianPhases: peds.map(toToolPhase),
      queuedVehicles: queued,
      queuedPassengers: passengers,
      impatientDrivers: impatient,
      maxWaitTicks: maxWait,
      emergencyVehicles: emergency,
      waitingPedestrians: pedestrians,
      ...(patience === undefined ? {} : { minPatienceRemaining: patience }),
      description: vehicleDescription({
        label: template.label,
        laneCount: selected.length,
        queued,
        passengers,
        impatient,
        maxWait,
        emergency,
        pedestrians,
        patience,
        crosswalkRisk,
      }) + crosswalkContext(crosswalks, peds.map(p => p.crosswalkId), crossedCrosswalks),
    });
  }
  const totalWaiting = pedestrianPhases.reduce((sum, phase) => sum + phase.waiting, 0);
  if (flexiblePhases) {
    for (const lane of lanes) candidates.push({
      key: `LANE:${lane.laneId}`, kind: "VEHICLE", lanes: [lane], pedestrianPhases: [],
      queuedVehicles: lane.queuedVehicles, queuedPassengers: lane.queuedPassengers ?? lane.queuedVehicles,
      maxWaitTicks: lane.waitingTicks, emergencyVehicles: emergencyLanes.has(lane.laneId) ? 1 : 0, waitingPedestrians: 0,
      description: `Release only ${lane.laneId} (${lane.routeId}); ${lane.queuedVehicles} queued vehicles, ${lane.queuedPassengers ?? lane.queuedVehicles} passengers; crosses ${(lane.crosswalkIds ?? []).join(", ")}`,
    });
    for (const walk of pedestrianPhases) candidates.push({
      key: `WALK:${walk.crosswalkId}`, kind: "PEDESTRIANS", lanes: [], pedestrianPhases: [toToolPhase(walk)],
      queuedVehicles: 0, maxWaitTicks: 0, emergencyVehicles: 0, waitingPedestrians: walk.waiting,
      description: `Serve only ${walk.crosswalkId}: ${walk.waiting} waiting${patienceText(walk.minPatienceRemaining)}; other crosswalks need not be available`,
    });
  }
  if (pedestrianPhases.length > 0) {
    const patience = minPatience(pedestrianPhases);
    candidates.push({
      key: PEDESTRIAN_PHASE,
      kind: "PEDESTRIANS",
      lanes: [],
      pedestrianPhases: pedestrianPhases.slice(0, 4).map(toToolPhase),
      queuedVehicles: 0,
      maxWaitTicks: 0,
      emergencyVehicles: 0,
      waitingPedestrians: totalWaiting,
      ...(patience === undefined ? {} : { minPatienceRemaining: patience }),
      description: `Release only pedestrians: ${totalWaiting} waiting across ${pedestrianPhases.length} crosswalks${patienceText(patience)}, no vehicles` + crosswalkContext(crosswalks, pedestrianPhases.map(p => p.crosswalkId), []),
    });
  }
  candidates.push({
    key: HOLD_PHASE,
    kind: "HOLD",
    lanes: [],
    pedestrianPhases: [],
    queuedVehicles: 0,
    maxWaitTicks: 0,
    emergencyVehicles: 0,
    waitingPedestrians: 0,
    // 补充版：讲清「什么都不放」的代价。文本 agent 的规则里写着
    // 「完全不放行会被这些成本持续惩罚」，Jev 原本拿不到。
    description: ADAPT_HOLD
      ? (USE_LEGACY_WORDING
          ? HOLD_DESCRIPTION_LEGACY
          : `Release nothing this cycle and let traffic already in the intersection clear. Nothing is served: the upstream backlog is charged every tick for every passenger it holds, queued vehicles that stay stationary past the ${DELAY_GRACE}-tick grace period are charged per tick, any open accident keeps charging per locked cell, and every vehicle still unserved at the deadline is charged a one-off liability of ${config.economy.unservedVehicleLiability} per passenger. Only take this when releasing now would be unsafe`)
      : "Release nothing this cycle and let traffic already in the intersection clear",
  });
  return candidates;
}

function crosswalkFacts(
  observation: CompactObservation,
  slots: readonly CrosswalkSlotView[] | undefined,
): JevCrosswalkFact[] {
  const patience = crosswalkMinPatience(observation);
  return (observation.crosswalks ?? []).map(crosswalk => {
    const spatial = slots?.find(view => view.crosswalkId === crosswalk.crosswalkId);
    const reservedUntil = spatial?.vehicleReservedUntil;
    return {
      crosswalkId: crosswalk.crosswalkId,
      waiting: crosswalk.directions.reduce((sum, direction) => sum + direction.waiting, 0),
      ...(patience[crosswalk.crosswalkId] === undefined ? {} : { minPatienceRemaining: patience[crosswalk.crosswalkId]! }),
      jaywalking: crosswalk.directions.reduce((sum, direction) => sum + direction.jaywalking, 0),
      ...(spatial === undefined ? {} : { vehicleCells: spatial.cells.filter(cell => cell.mark === "v").length }),
      ...(reservedUntil === undefined || reservedUntil < observation.currentTick ? {} : {
        vehicleReservedUntil: reservedUntil,
        vehicleReservationTicksRemaining: reservedUntil - observation.currentTick,
      }),
    };
  });
}

function crosswalkContext(
  crosswalks: readonly JevCrosswalkFact[] | undefined,
  served: readonly string[],
  crossed: readonly string[],
): string {
  if (crosswalks === undefined) return "";
  const parts: string[] = [];
  for (const crosswalk of crosswalks) {
    if (served.includes(crosswalk.crosswalkId) &&
        ((crosswalk.vehicleCells ?? 0) > 0 || crosswalk.vehicleReservedUntil !== undefined)) {
      parts.push(`${crosswalk.crosswalkId}: ${crosswalk.vehicleCells ?? "unknown"} visible vehicle cells` +
        (crosswalk.vehicleReservedUntil === undefined ? "" : `, vehicle reservations through tick ${crosswalk.vehicleReservedUntil} (${crosswalk.vehicleReservationTicksRemaining} ticks from now)`) +
        "; pedestrian admission may conflict with these vehicles; dry-run verification is required");
    }
    if (crossed.includes(crosswalk.crosswalkId) && crosswalk.waiting > 0) {
      parts.push(`New vehicles cross ${crosswalk.crosswalkId}, where ${crosswalk.waiting} pedestrians wait, and may delay its next pedestrian window. Let existing traffic drain to open a crossing window; avoid extending vehicle waves across urgent waiting pedestrians`);
    }
  }
  return parts.length === 0 ? "" : `. ${parts.join(". ")}`;
}

function vehicleDescription(input: {
  readonly label: string;
  readonly laneCount: number;
  readonly queued: number;
  readonly passengers: number;
  readonly impatient: number;
  readonly maxWait: number;
  readonly emergency: number;
  readonly pedestrians: number;
  readonly patience: number | undefined;
  readonly crosswalkRisk?: readonly { readonly crosswalkId: string; readonly patience?: number | undefined; readonly jaywalking?: boolean | undefined }[];
}): string {
  const { label, laneCount, queued, passengers, impatient, maxWait, emergency, pedestrians, patience, crosswalkRisk } = input;
  const parts = [
    `Release ${label} (${laneCount} lane${laneCount === 1 ? "" : "s"}): ${queued} queued vehicles carrying ${passengers} passengers, longest head wait ${maxWait} ticks`,
  ];
  if (impatient > 0) {
    parts.push(
      `${impatient} driver${impatient === 1 ? " is" : "s are"} about to lose patience and force through`,
    );
  }
  if (emergency > 0) {
    parts.push(`${emergency} emergency vehicle lane${emergency === 1 ? "" : "s"}`);
  }
  if (pedestrians > 0) {
    parts.push(`also lets ${pedestrians} waiting pedestrians cross${patienceText(patience)}`);
  }
  // 斑马线冲突风险。这句是 Jev 原本完全拿不到的信息：
  // balanced 基线靠它过滤掉高风险相位，Jev 只能盲选。
  if (ADAPT_PEDESTRIAN && crosswalkRisk !== undefined && crosswalkRisk.length > 0) {
    const urgent = crosswalkRisk.filter((item) => item.jaywalking || (item.patience ?? 999) <= 12);
    if (urgent.length > 0) {
      const detail = urgent
        .map((item) => {
          const name = item.crosswalkId.replace("CROSSWALK:", "");
          if (item.jaywalking) return `${name} (pedestrians already jaywalking)`;
          return `${name} (most impatient pedestrian has ${item.patience} ticks before jaywalking)`;
        })
        .join(", ");
      parts.push(
        `RELEASE RISK: this phase sends vehicles across ${detail}. When pedestrians run out of patience they walk into the junction anyway and get struck, which creates an accident that locks cells and is charged every tick`,
      );
    }
  }
  return parts.join(", ");
}

function minPatience(phases: readonly WaitingPedestrianPhase[]): number | undefined {
  const values = phases.flatMap((phase) =>
    phase.minPatienceRemaining === undefined ? [] : [phase.minPatienceRemaining],
  );
  return values.length === 0 ? undefined : Math.min(...values);
}

function patienceText(patience: number | undefined): string {
  return patience === undefined
    ? ""
    : ` (the most impatient will jaywalk in ${patience} ticks)`;
}

function eligibleLanes(
  observation: CompactObservation,
  network: RoadNetwork,
  allowReservedLanes: boolean,
): EligibleLane[] {
  const blocked = new Set(observation.blockedRoutes
    .filter(route => !allowReservedLanes || route.blockKind === "INCIDENT")
    .map(route => route.routeId));
  const held = new Set(observation.activeLaneHolds.map((hold) => hold.laneId));
  const stalled = new Set(observation.stalledVehicles.map((vehicle) => vehicle.laneId));
  const pressure = new Map(
    observation.lanePressureSignals.map((signal) => [signal.laneId, signal]),
  );
  const impatient = new Map<string, number>();
  for (const alert of observation.driverAlerts ?? []) {
    impatient.set(alert.laneId, (impatient.get(alert.laneId) ?? 0) + 1);
  }
  const lanes: EligibleLane[] = [];
  const seen = new Set<string>();
  for (const candidate of observation.stoplineCandidates) {
    if (
      seen.has(candidate.lane) ||
      blocked.has(candidate.routeId) ||
      held.has(candidate.lane) ||
      stalled.has(candidate.lane)
    ) {
      continue;
    }
    const lane = network.inboundLanes.get(candidate.lane);
    const trajectory = network.trajectories.get(candidate.routeId);
    if (lane === undefined || trajectory === undefined) {
      continue;
    }
    seen.add(candidate.lane);
    lanes.push({
      laneId: candidate.lane,
      routeId: candidate.routeId,
      approach: lane.direction,
      maneuver: trajectory.maneuver,
      waitingTicks: candidate.waitingTicks,
      queuedVehicles: Math.max(1, pressure.get(candidate.lane)?.queuedVehicles ?? 1),
      queuedPassengers: Math.max(
        passengersFor(candidate.type),
        pressure.get(candidate.lane)?.queuedPassengers ?? 0,
      ),
      impatientDrivers: impatient.get(candidate.lane) ?? 0,
      crosswalkIds: trajectoryCrosswalkIds(trajectory.slots),
    });
  }
  return lanes.sort((left, right) => left.laneId.localeCompare(right.laneId));
}

function trajectoryCrosswalkIds(
  slots: readonly { readonly conflictResourceIds: readonly string[] }[],
): string[] {
  return unique(
    slots.flatMap((slot) =>
      slot.conflictResourceIds.flatMap((resourceId) => {
        const match = /^(CROSSWALK:[A-Z]+)(?::|$)/.exec(resourceId);
        return match?.[1] === undefined ? [] : [match[1]];
      }),
    ),
  );
}

function crosswalkMinPatience(observation: CompactObservation): Record<string, number> {
  const result: Record<string, number> = {};
  for (const crosswalk of observation.crosswalks ?? []) {
    for (const direction of crosswalk.directions) {
      if (direction.waiting === 0 || direction.minPatienceRemaining === null) {
        continue;
      }
      result[crosswalk.crosswalkId] = Math.min(
        result[crosswalk.crosswalkId] ?? Number.POSITIVE_INFINITY,
        direction.minPatienceRemaining,
      );
    }
  }
  return result;
}

function jaywalkingCrosswalkIds(observation: CompactObservation): string[] {
  return unique([
    ...(observation.crosswalks ?? [])
      .filter((crosswalk) =>
        crosswalk.directions.some((direction) => direction.jaywalking > 0),
      )
      .map((crosswalk) => crosswalk.crosswalkId),
    ...(observation.pedestrianAlerts ?? [])
      .filter((alert) => alert.kind === "JAYWALKING")
      .map((alert) => alert.crosswalkId),
  ]);
}

interface WaitingPedestrianPhase {
  readonly crosswalkId: string;
  readonly directions: PedestrianDirection[];
  readonly waiting: number;
  readonly minPatienceRemaining: number | undefined;
}

function waitingPedestrianPhases(
  observation: CompactObservation,
): WaitingPedestrianPhase[] {
  return (observation.crosswalks ?? []).flatMap((crosswalk) => {
    const waiting = crosswalk.directions.filter((direction) => direction.waiting > 0);
    const jaywalking = crosswalk.directions.some((direction) => direction.jaywalking > 0);
    if (waiting.length === 0 || jaywalking) {
      return [];
    }
    const patience = waiting.flatMap((direction) =>
      direction.minPatienceRemaining === null ? [] : [direction.minPatienceRemaining],
    );
    return [
      {
        crosswalkId: crosswalk.crosswalkId,
        directions: waiting.map((direction) => direction.direction),
        waiting: waiting.reduce((sum, direction) => sum + direction.waiting, 0),
        minPatienceRemaining: patience.length === 0 ? undefined : Math.min(...patience),
      },
    ];
  });
}

function toToolPhase(phase: WaitingPedestrianPhase): JevPedestrianPhase {
  return { crosswalk_id: phase.crosswalkId, directions: [...phase.directions] };
}

function stallFactsFrom(observation: CompactObservation): JevStallFact[] {
  return observation.stalledVehicles
    .filter((vehicle) => vehicle.towTask === undefined)
    .map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      laneId: vehicle.laneId,
      blockedBehindCount: vehicle.blockedBehindCount,
      targets: vehicle.bypassAvailability.map((bypass) => ({
        laneId: bypass.laneId,
        maxMovableVehicles: bypass.maxMovableVehicles,
      })),
    }));
}

function emergencyFactsFrom(observation: CompactObservation): JevEmergencyFact[] {
  const readyLanes = new Set(observation.stoplineCandidates.map((candidate) => candidate.lane));
  const stalledLanes = new Set(observation.stalledVehicles.map((vehicle) => vehicle.laneId));
  return observation.emergencyAlerts
    .filter((alert) => readyLanes.has(alert.laneId) && !stalledLanes.has(alert.laneId))
    .map((alert) => ({
      vehicleId: alert.vehicleId,
      laneId: alert.laneId,
      stationaryTicks: alert.stationaryTicks,
    }));
}

// 事故处置的三个选项。
//
// 原版措辞有一个会误导模型的暗示：HOLD 写成 "Hold the severed inbound lane
// until the accident closes"，读起来像是「事故会自己关闭，只需等」。
// 但引擎里事故关闭的唯一条件是「所有事故车辆都离开冲突区」
// （engine.ts: allClear → status = CLOSED），而事故车只有 CLEAR 才会移动。
// 实测：Jev 因此有 70~90% 的轮次选 HOLD、几乎从不 CLEAR，
// 6 起事故全部停留在 OPEN，hazardBleed 68.95（search 只有 3.69）。
//
// 补充版把因果讲清楚：CLEAR 是唯一能推进事故关闭的动作，
// HOLD 只是封住进口道、不清障，事故会一直锁着格子每拍扣费。
function incidentActionText(action: IncidentAction): string {
  switch (action) {
    case "CLEAR":
      return ADAPT_INCIDENT
        ? `Start accident vehicles creeping toward an evacuation lane. This is the only action that moves the wrecked vehicles out of the conflict area, and an accident closes only once every one of its vehicles has left that area. While it stays open, every locked cell is charged ${config.economy.hazardBleedPerResource} per tick, so clearing is what stops the bleed`
        : "Start accident vehicles creeping toward an evacuation lane";
    case "HOLD":
      return ADAPT_INCIDENT
        ? `Hold the severed inbound lane at the stop line to keep new traffic out of the crash site. This does not clear the accident: the wrecked vehicles do not move, the accident stays open, and every locked cell keeps being charged ${config.economy.hazardBleedPerResource} per tick until something else clears it. Only use this when releasing from that lane right now would cause another collision`
        : "Hold the severed inbound lane until the accident closes";
    case "IGNORE":
      return ADAPT_INCIDENT
        ? `Do not change accident handling this cycle. The accident stays open and keeps charging ${config.economy.hazardBleedPerResource} per locked cell per tick`
        : "Do not change accident handling this cycle";
  }
}

function stallActionText(action: StallAction): string {
  switch (action) {
    case "REROUTE":
      return "Slide queued vehicles behind the stall into an adjacent lane";
    case "TOW":
      return "Dispatch a paid tow truck";
    case "IGNORE":
      return "Leave the stall in place";
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
