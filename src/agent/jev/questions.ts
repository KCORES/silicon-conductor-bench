import type {
  CompactObservation,
  Direction,
  Maneuver,
  PedestrianDirection,
  RoadNetwork,
} from "../../core/types.js";
import { passengersFor } from "../../core/vehicleRoster.js";
import type { JevQuestion } from "./client.js";

export const CHOICE_CONFIDENCE_THRESHOLD = 0.4;
export const NOUL_YES_THRESHOLD = 0.5;

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

const RELEASE_CRITERIA: Record<ReleaseOption, string> = {
  HEAD_ONLY: "Release only the vehicle at the stop line on each lane",
  SHORT_WAVE: "Release the first 3 queued vehicles on each lane",
  LONG_WAVE: "Release up to 6 queued vehicles on each lane to drain long queues",
};

const SLEEP_CRITERIA: Record<SleepOption, string> = {
  SHORT: "Wait 2 ticks and decide again soon, for example until a reservation expires",
  MEDIUM: "Wait 5 ticks while a short wave moves through",
  LONG: "Wait 9 ticks so a long released wave can leave the intersection",
};

export interface EligibleLane {
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
  const phases = phaseCandidates(observation, input.network, lockedCrosswalks);
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
): PhaseCandidate[] {
  const lanes = eligibleLanes(observation, network);
  const pedestrianPhases = waitingPedestrianPhases(observation).filter(
    (phase) => !lockedCrosswalks.has(phase.crosswalkId),
  );
  const emergencyLanes = new Set(observation.emergencyAlerts.map((alert) => alert.laneId));
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
      }),
    });
  }
  const totalWaiting = pedestrianPhases.reduce((sum, phase) => sum + phase.waiting, 0);
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
      description: `Release only pedestrians: ${totalWaiting} waiting across ${pedestrianPhases.length} crosswalks${patienceText(patience)}, no vehicles`,
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
    description: "Release nothing this cycle and let traffic already in the intersection clear",
  });
  return candidates;
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
}): string {
  const { label, laneCount, queued, passengers, impatient, maxWait, emergency, pedestrians, patience } = input;
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
): EligibleLane[] {
  const blocked = new Set(observation.blockedRoutes.map((route) => route.routeId));
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

function incidentActionText(action: IncidentAction): string {
  switch (action) {
    case "CLEAR":
      return "Start accident vehicles creeping toward an evacuation lane";
    case "HOLD":
      return "Hold the severed inbound lane until the accident closes";
    case "IGNORE":
      return "Do not change accident handling this cycle";
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
