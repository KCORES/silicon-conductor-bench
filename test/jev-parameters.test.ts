import { describe, expect, it } from "vitest";
import { buildJevParameterQuestions, applyJevParameters } from "../src/agent/jev/parameters.js";
import { laneBatchesFor } from "../src/agent/jev/compile.js";
import type { PhaseCandidate } from "../src/agent/jev/questions.js";
const phase: PhaseCandidate = { key: "NS", kind: "VEHICLE", description: "NS", queuedVehicles: 20,
  maxWaitTicks: 5, emergencyVehicles: 0, waitingPedestrians: 4,
  lanes: ["IN_N_S1_STRAIGHT", "IN_S_S1_STRAIGHT"].map(laneId => ({ laneId, routeId: laneId, approach: "NORTH", maneuver: "STRAIGHT", waitingTicks: 5, queuedVehicles: 10 })),
  pedestrianPhases: [{ crosswalk_id: "CROSSWALK:EAST", directions: ["A_TO_B", "B_TO_A"] }, { crosswalk_id: "CROSSWALK:WEST", directions: ["A_TO_B"] }],
};
const choice = (value: string) => ({ type: "choice" as const, choice: value, confidence: 1 });
describe("Jev conditional plan parameters", () => {
  it("asks only about the selected plan and exposes the common legal sleep and speed ranges", () => {
    const questions = buildJevParameterQuestions(phase);
    expect(questions).not.toHaveProperty("phase");
    expect(questions).toHaveProperty("release:IN_N_S1_STRAIGHT");
    expect(questions.sleep?.type === "choice" && Object.keys(questions.sleep.criteria)).toHaveLength(10);
    expect(questions["speed:IN_N_S1_STRAIGHT"]).toMatchObject({ criteria: { BURST: expect.any(String) } });
  });
  it("keeps lane amounts, speed, crosswalk direction and sleep attached to the selected plan", () => {
    const result = applyJevParameters(phase, {
      "release:IN_N_S1_STRAIGHT": choice("N8"), "release:IN_S_S1_STRAIGHT": choice("SKIP"),
      "speed:IN_N_S1_STRAIGHT": choice("BURST"),
      "walk:CROSSWALK:EAST": choice("B_TO_A"), "walk:CROSSWALK:WEST": choice("SKIP"), sleep: choice("T7"),
    });
    expect(laneBatchesFor(result.phase, 1)).toEqual([{ lane_id: "IN_N_S1_STRAIGHT", top_n: 8, speed_profile: "BURST" }]);
    expect(result.phase.pedestrianPhases).toEqual([{ crosswalk_id: "CROSSWALK:EAST", directions: ["B_TO_A"] }]);
    expect(result.sleepTicks).toBe(7);
  });
  it("does not execute malformed or unavailable parameter choices", () => {
    const result = applyJevParameters(phase, { "release:IN_N_S1_STRAIGHT": choice("N99"), "walk:CROSSWALK:WEST": choice("B_TO_A"), sleep: choice("T99") });
    expect(result.phase.lanes).toHaveLength(0);
    expect(result.phase.pedestrianPhases).toHaveLength(0);
    expect(result.sleepTicks).toBe(1);
  });
});
