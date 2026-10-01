import type { JevAnswer } from "./client.js";
import {
  CHOICE_CONFIDENCE_THRESHOLD,
  EMERGENCY_CLEAR_KEY,
  EMERGENCY_VEHICLE_KEY,
  EVAC_LANE_KEY,
  HOLD_LANE_KEY,
  HOLD_PHASE,
  INCIDENT_ACTION_KEY,
  INCIDENT_ID_KEY,
  NOUL_YES_THRESHOLD,
  PHASE_KEY,
  RELEASE_KEY,
  RELEASE_OPTIONS,
  SLEEP_KEY,
  SLEEP_OPTIONS,
  STALL_ACTION_KEY,
  STALL_TARGET_KEY,
  STALL_VEHICLE_KEY,
  type JevDecisionFacts,
  type JevEmergencyFact,
  type JevIncidentFact,
  type JevStallFact,
  type PhaseCandidate,
  type ReleaseOption,
  type SleepOption,
  type StallAction,
} from "./questions.js";

export interface JevLaneBatch {
  readonly lane_id: string;
  readonly top_n: number;
  readonly speed_profile: "CRUISE";
}

export interface JevToolCall {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface JevSchedule {
  readonly rankedPhases: readonly PhaseCandidate[];
  readonly topN: number;
  readonly sleepTicks: number;
  readonly sideEffects: readonly JevToolCall[];
}

export interface PhaseSelection {
  readonly phase: PhaseCandidate | undefined;
  readonly rejectedKeys: readonly string[];
}

const SUMMARY_LIMIT = 300;
const MAX_DRY_RUNS = 2;

export function noulValue(
  answers: Readonly<Record<string, JevAnswer>>,
  key: string,
): number {
  const answer = answers[key];
  return answer?.type === "noul" && Number.isFinite(answer.noul) ? answer.noul : 0;
}

export function confidentChoice(
  answers: Readonly<Record<string, JevAnswer>>,
  key: string,
  allowed: ReadonlySet<string>,
): string | undefined {
  const answer = answers[key];
  if (answer?.type !== "choice" || !allowed.has(answer.choice)) {
    return undefined;
  }
  if ((answer.confidence ?? 0) < CHOICE_CONFIDENCE_THRESHOLD) {
    return undefined;
  }
  return answer.choice;
}

export function rankPhases(
  phases: readonly PhaseCandidate[],
  answer: JevAnswer | undefined,
): PhaseCandidate[] {
  const hold = phases.find((phase) => phase.key === HOLD_PHASE);
  if (answer?.type !== "choice") {
    return hold === undefined ? [] : [hold];
  }
  const probabilities = answer.probabilities ?? {};
  const score = (phase: PhaseCandidate): number => {
    if (phase.key === answer.choice) {
      return Number.POSITIVE_INFINITY;
    }
    const value = probabilities[phase.key];
    return typeof value === "number" && Number.isFinite(value) ? value : -1;
  };
  return phases
    .map((phase, index) => ({ phase, index, score: score(phase) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.phase);
}

export function compileJevSchedule(
  facts: JevDecisionFacts,
  answers: Readonly<Record<string, JevAnswer>>,
): JevSchedule {
  const release = facts.askRelease
    ? choiceOf<ReleaseOption>(answers, RELEASE_KEY, RELEASE_OPTIONS, "SHORT_WAVE")
    : "HEAD_ONLY";
  const sleep = choiceOf<SleepOption>(answers, SLEEP_KEY, SLEEP_OPTIONS, "SHORT");
  return {
    rankedPhases: rankPhases(facts.phases, answers[PHASE_KEY]),
    topN: RELEASE_OPTIONS[release],
    sleepTicks: SLEEP_OPTIONS[sleep],
    sideEffects: sideEffectsFor(facts, answers),
  };
}

export function laneBatchesFor(
  phase: PhaseCandidate | undefined,
  topN: number,
): JevLaneBatch[] {
  return (phase?.lanes ?? []).map((lane) => ({
    lane_id: lane.laneId,
    top_n: topN,
    speed_profile: "CRUISE",
  }));
}

export interface PhaseProbeResult {
  readonly ok: boolean;
  readonly conflictCrosswalkId?: string | undefined;
}

/**
 * Walks the ranked phases with at most two dry runs. When a dry run fails on
 * one crosswalk, the next probe retries the same phase without that crosswalk.
 */
export function selectVerifiedPhase(
  ranked: readonly PhaseCandidate[],
  probe: (phase: PhaseCandidate) => PhaseProbeResult,
): PhaseSelection {
  const rejectedKeys: string[] = [];
  const queue = [...ranked];
  let probes = 0;
  while (queue.length > 0 && probes < MAX_DRY_RUNS) {
    const phase = queue.shift();
    if (phase === undefined || phase.kind === "HOLD") {
      return { phase: undefined, rejectedKeys };
    }
    probes += 1;
    const result = probe(phase);
    if (result.ok) {
      return { phase, rejectedKeys };
    }
    rejectedKeys.push(phase.key);
    const repaired = withoutCrosswalk(phase, result.conflictCrosswalkId);
    if (repaired !== undefined) {
      queue.unshift(repaired);
    }
  }
  return { phase: undefined, rejectedKeys };
}

function withoutCrosswalk(
  phase: PhaseCandidate,
  crosswalkId: string | undefined,
): PhaseCandidate | undefined {
  if (
    crosswalkId === undefined ||
    !phase.pedestrianPhases.some((item) => item.crosswalk_id === crosswalkId)
  ) {
    return undefined;
  }
  const pedestrianPhases = phase.pedestrianPhases.filter(
    (item) => item.crosswalk_id !== crosswalkId,
  );
  if (phase.lanes.length === 0 && pedestrianPhases.length === 0) {
    return undefined;
  }
  return { ...phase, key: `${phase.key}-${crosswalkId.replace("CROSSWALK:", "")}`, pedestrianPhases };
}

export function formatJevSummary(input: {
  readonly decider: string;
  readonly selection: PhaseSelection;
  readonly topN: number;
  readonly sleepTicks: number;
  readonly actions: readonly string[];
}): string {
  const phase = input.selection.phase;
  const parts = [input.decider, `phase=${phase?.key ?? HOLD_PHASE}`];
  if (phase !== undefined && phase.lanes.length > 0) {
    parts.push(`top_n=${input.topN}`);
  }
  if (phase !== undefined && phase.pedestrianPhases.length > 0) {
    parts.push(`peds=${phase.pedestrianPhases.length}`);
  }
  parts.push(`sleep=${input.sleepTicks}`);
  if (input.selection.rejectedKeys.length > 0) {
    parts.push(`rejected=${input.selection.rejectedKeys.join(",")}`);
  }
  parts.push(...input.actions);
  const summary = parts.join(" ");
  return summary.length > SUMMARY_LIMIT ? summary.slice(0, SUMMARY_LIMIT) : summary;
}

function choiceOf<Key extends string>(
  answers: Readonly<Record<string, JevAnswer>>,
  key: string,
  options: Readonly<Record<Key, number>>,
  fallback: Key,
): Key {
  const answer = answers[key];
  if (answer?.type === "choice" && Object.hasOwn(options, answer.choice)) {
    return answer.choice as Key;
  }
  return fallback;
}

function sideEffectsFor(
  facts: JevDecisionFacts,
  answers: Readonly<Record<string, JevAnswer>>,
): JevToolCall[] {
  return [
    incidentToolCall(facts, answers),
    stallToolCall(facts, answers),
    emergencyToolCall(facts, answers),
  ].filter((call): call is JevToolCall => call !== undefined);
}

function incidentToolCall(
  facts: JevDecisionFacts,
  answers: Readonly<Record<string, JevAnswer>>,
): JevToolCall | undefined {
  const incident = selectedIncident(facts, answers);
  if (incident === undefined || facts.incidentActions.length === 0) {
    return undefined;
  }
  const action = confidentChoice(
    answers,
    INCIDENT_ACTION_KEY,
    new Set(facts.incidentActions),
  );
  if (action === "CLEAR") {
    const laneId = confidentChoice(
      answers,
      EVAC_LANE_KEY,
      new Set(incident.suggestedEvacLanes),
    );
    return laneId === undefined
      ? undefined
      : {
          name: "order_accident_clearance",
          arguments: {
            incident_id: incident.incidentId,
            target_evac_lane: laneId,
          },
        };
  }
  if (action === "HOLD") {
    const laneId = confidentChoice(
      answers,
      HOLD_LANE_KEY,
      new Set(incident.severedLaneIds),
    );
    return laneId === undefined
      ? undefined
      : {
          name: "set_lane_detour",
          arguments: {
            severed_lane_id: laneId,
            action: "HOLD_AT_STOPLINE",
          },
        };
  }
  return undefined;
}

function selectedIncident(
  facts: JevDecisionFacts,
  answers: Readonly<Record<string, JevAnswer>>,
): JevIncidentFact | undefined {
  if (facts.incidents.length === 1) {
    return facts.incidents[0];
  }
  if (!facts.askIncidentId) {
    return undefined;
  }
  const incidentId = confidentChoice(
    answers,
    INCIDENT_ID_KEY,
    new Set(facts.incidents.map((incident) => incident.incidentId)),
  );
  return facts.incidents.find((incident) => incident.incidentId === incidentId);
}

function stallToolCall(
  facts: JevDecisionFacts,
  answers: Readonly<Record<string, JevAnswer>>,
): JevToolCall | undefined {
  const stall = selectedStall(facts, answers);
  if (stall === undefined || facts.stallActions.length === 0) {
    return undefined;
  }
  const action = confidentChoice(
    answers,
    STALL_ACTION_KEY,
    new Set<StallAction>(facts.stallActions),
  );
  if (action === "TOW") {
    return {
      name: "dispatch_tow_truck",
      arguments: { stalled_vehicle_id: stall.vehicleId },
    };
  }
  if (action !== "REROUTE") {
    return undefined;
  }
  const laneId = confidentChoice(
    answers,
    STALL_TARGET_KEY,
    new Set(
      stall.targets
        .filter((target) => target.maxMovableVehicles > 0)
        .map((target) => target.laneId),
    ),
  );
  const target = stall.targets.find((item) => item.laneId === laneId);
  if (target === undefined || target.maxMovableVehicles <= 0) {
    return undefined;
  }
  return {
    name: "reroute_queue_around_stall",
    arguments: {
      stalled_vehicle_id: stall.vehicleId,
      target_lane_id: target.laneId,
      vehicles_to_divert: Math.min(8, target.maxMovableVehicles),
    },
  };
}

function selectedStall(
  facts: JevDecisionFacts,
  answers: Readonly<Record<string, JevAnswer>>,
): JevStallFact | undefined {
  if (facts.stalls.length === 1) {
    return facts.stalls[0];
  }
  if (!facts.askStallVehicle) {
    return undefined;
  }
  const vehicleId = confidentChoice(
    answers,
    STALL_VEHICLE_KEY,
    new Set(facts.stalls.map((stall) => stall.vehicleId)),
  );
  return facts.stalls.find((stall) => stall.vehicleId === vehicleId);
}

function emergencyToolCall(
  facts: JevDecisionFacts,
  answers: Readonly<Record<string, JevAnswer>>,
): JevToolCall | undefined {
  if (
    facts.emergencies.length === 0 ||
    noulValue(answers, EMERGENCY_CLEAR_KEY) < NOUL_YES_THRESHOLD
  ) {
    return undefined;
  }
  const alert = selectedEmergency(facts, answers);
  return alert === undefined
    ? undefined
    : {
        name: "dispatch_emergency_convoy",
        arguments: {
          lane_id: alert.laneId,
          emergency_vehicle_id: alert.vehicleId,
        },
      };
}

function selectedEmergency(
  facts: JevDecisionFacts,
  answers: Readonly<Record<string, JevAnswer>>,
): JevEmergencyFact | undefined {
  if (facts.emergencies.length === 1) {
    return facts.emergencies[0];
  }
  if (!facts.askEmergencyVehicle) {
    return undefined;
  }
  const vehicleId = confidentChoice(
    answers,
    EMERGENCY_VEHICLE_KEY,
    new Set(facts.emergencies.map((alert) => alert.vehicleId)),
  );
  return facts.emergencies.find((alert) => alert.vehicleId === vehicleId);
}
