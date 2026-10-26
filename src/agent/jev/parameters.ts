import type { SpeedProfile } from "../../core/types.js";
import type { JevAnswer, JevQuestion } from "./client.js";
import type { PhaseCandidate } from "./questions.js";

/** These are public tool parameters, not engine-scored candidate plans. */
export function buildJevParameterQuestions(phase: PhaseCandidate): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {};
  for (const lane of phase.lanes) {
    questions[`release:${lane.laneId}`] = { type: "choice",
      instructions: `For the selected phase, choose the batch on ${lane.laneId}. The total across all lanes may not exceed 16 vehicles. Use the observation and tool feedback; do not extend vehicle reservations across urgent pedestrian crossings unnecessarily.`,
      criteria: { SKIP: "Do not release this lane", ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`N${i + 1}`, `Release up to ${i + 1} queued vehicles on this lane`])) },
    };
    questions[`speed:${lane.laneId}`] = { type: "choice", instructions: `Choose the speed for the selected batch on ${lane.laneId}. The tool still validates all swept resources and applies heavy-vehicle limits.`,
      criteria: { SLOW_SLIDE: "0.5 cells/tick", CRUISE: "1 cell/tick", BURST: "1.5 cells/tick; swept path must still be safe" },
    };
  }
  for (const walk of phase.pedestrianPhases) {
    questions[`walk:${walk.crosswalk_id}`] = { type: "choice", instructions: `Choose pedestrian service on ${walk.crosswalk_id}. Avoid blocking the whole plan on an occupied crosswalk; other crosswalks may be served independently.`,
      criteria: { SKIP: "Do not release this crosswalk", ...Object.fromEntries(walk.directions.map(direction => [direction, `Release waiting pedestrians in direction ${direction}`])),
        ...(walk.directions.length === 2 ? { BOTH: "Release both waiting directions" } : {}) },
    };
  }
  questions.sleep = { type: "choice", instructions: "How many ticks should pass before the next decision for this particular plan? Use vehicle reservation end times, pedestrian patience and ticksRemaining. Waiting costs accrue per elapsed tick regardless of decision frequency; every API call also pays decision tax.",
    criteria: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`T${i + 1}`, `Wait ${i + 1} ticks, unless interrupted earlier`])),
  };
  return questions;
}

export function applyJevParameters(phase: PhaseCandidate, answers: Readonly<Record<string, JevAnswer>>): { phase: PhaseCandidate; sleepTicks: number } {
  const chosen = (key: string) => answers[key]?.type === "choice" ? answers[key].choice : undefined;
  const lanes = phase.lanes.flatMap(lane => {
    const option = chosen(`release:${lane.laneId}`);
    if (option === undefined || !/^N[1-8]$/.test(option)) return [];
    const speed = chosen(`speed:${lane.laneId}`);
    const speedProfile: SpeedProfile = speed === "BURST" || speed === "SLOW_SLIDE" ? speed : "CRUISE";
    return [{ ...lane, releaseCount: Number(option.slice(1)), speedProfile }];
  });
  const pedestrianPhases = phase.pedestrianPhases.flatMap(walk => {
    const option = chosen(`walk:${walk.crosswalk_id}`);
    if (option === "BOTH" && walk.directions.length === 2) return [walk];
    const direction = walk.directions.find(direction => direction === option);
    return direction === undefined ? [] : [{ ...walk, directions: [direction] }];
  });
  const sleep = chosen("sleep");
  return { phase: { ...phase, lanes, pedestrianPhases,
    kind: lanes.length > 0 ? "VEHICLE" : pedestrianPhases.length > 0 ? "PEDESTRIANS" : "HOLD" },
    sleepTicks: sleep !== undefined && /^T(?:[1-9]|10)$/.test(sleep) ? Number(sleep.slice(1)) : 1 };
}
