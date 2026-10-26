import { afterEach, describe, expect, it, vi } from "vitest";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import { config } from "../src/config.js";
import { buildJevQuestions, buildJevState, PEDESTRIAN_PHASE } from "../src/agent/jev/questions.js";

vi.hoisted(() => { vi.stubEnv("JEV_ADAPT_CROSSWALK", "on"); });

const network = createRoadNetwork();
const observation = new SimulationEngine({ network }).buildObservation(1000);
const input = {
  network,
  observation: {
    ...observation, currentTick: 12,
    crosswalks: [{ crosswalkId: "CROSSWALK:NORTH", directions: [{ direction: "A_TO_B" as const, approaching: 0, waiting: 3, crossing: 0, minPatienceRemaining: 4, clearTick: null, jaywalking: 0 }] }],
  },
  crosswalkSlots: [{ crosswalkId: "CROSSWALK:NORTH", columns: 8, cells: [{ row: 0 as const, column: 2, mark: "v" as const }], vehicleReservedUntil: 18 }],
};

describe("Jev crosswalk context", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("exposes current occupancy and future vehicle reservations without dropping pedestrian choices", () => {
    const built = buildJevQuestions(input);
    const state = buildJevState({ observation: input.observation, facts: built.facts, recentCycles: [] });
    expect(state.crosswalks).toEqual([{ crosswalkId: "CROSSWALK:NORTH", waiting: 3, minPatienceRemaining: 4, jaywalking: 0, vehicleCells: 1, vehicleReservedUntil: 18, vehicleReservationTicksRemaining: 6 }]);
    expect(built.facts.phases.find(p => p.key === PEDESTRIAN_PHASE)?.description).toContain("vehicle reservations through tick 18");
    expect(built.facts.phases.find(p => p.key === PEDESTRIAN_PHASE)?.pedestrianPhases).toHaveLength(1);
  });

  it("does not mistake an empty current grid for a free future crossing", () => {
    const built = buildJevQuestions({ ...input, crosswalkSlots: [{ ...input.crosswalkSlots[0]!, cells: [] }] });
    expect(buildJevState({ observation: input.observation, facts: built.facts, recentCycles: [] }).crosswalks).toMatchObject([{ vehicleCells: 0, vehicleReservationTicksRemaining: 6 }]);
  });

  it("omits unknown spatial data and expires past reservations", () => {
    const unknown = buildJevQuestions({ network, observation: input.observation });
    expect(buildJevState({ observation: input.observation, facts: unknown.facts, recentCycles: [] }).crosswalks).toMatchObject([{ waiting: 3 }]);
    expect((buildJevState({ observation: input.observation, facts: unknown.facts, recentCycles: [] }).crosswalks as object[])[0]).not.toHaveProperty("vehicleCells");
    const expired = buildJevQuestions({ ...input, crosswalkSlots: [{ ...input.crosswalkSlots[0]!, cells: [], vehicleReservedUntil: 11 }] });
    expect((buildJevState({ observation: input.observation, facts: expired.facts, recentCycles: [] }).crosswalks as object[])[0]).not.toHaveProperty("vehicleReservedUntil");
  });

  it("keeps the legacy request unchanged when adaptation is off", async () => {
    vi.stubEnv("JEV_ADAPT", "off");
    vi.stubEnv("JEV_ADAPT_CROSSWALK", "off");
    vi.resetModules();
    const legacy = await import("../src/agent/jev/questions.js");
    const built = legacy.buildJevQuestions(input);
    expect(legacy.buildJevState({ observation: input.observation, facts: built.facts, recentCycles: [] })).not.toHaveProperty("crosswalks");
    expect(built.facts.phases.find(p => p.key === PEDESTRIAN_PHASE)?.description).not.toContain("vehicle reservations");
  });

  it("isolates crosswalk context with its own switch", async () => {
    vi.stubEnv("JEV_ADAPT_CROSSWALK", "off");
    vi.resetModules();
    const disabled = await import("../src/agent/jev/questions.js");
    const built = disabled.buildJevQuestions(input);
    expect(disabled.buildJevState({ observation: input.observation, facts: built.facts, recentCycles: [] })).not.toHaveProperty("crosswalks");
  });

  it("keeps experimental spatial context disabled by default", async () => {
    vi.stubEnv("JEV_ADAPT_CROSSWALK", undefined);
    vi.resetModules();
    const defaults = await import("../src/agent/jev/questions.js");
    expect(defaults.ADAPT_CROSSWALK).toBe(false);
  });

  it("interpolates release costs and keeps decision tax independent of wave size", () => {
    const built = buildJevQuestions({ network, observation: { ...observation,
      stoplineCandidates: [{ vehicleId: "v1", type: "SEDAN", lane: "IN_N_S1_STRAIGHT", waitingTicks: 5, routeId: "N_S1_STRAIGHT" }],
      lanePressureSignals: [{ laneId: "IN_N_S1_STRAIGHT", queuedVehicles: 4, capacityOccupancy: 4 }],
    } });
    const release = built.questions.release_size;
    expect(release?.type).toBe("choice");
    if (release?.type !== "choice") return;
    expect(release.criteria.LONG_WAVE).toContain(`${config.economy.unservedVehicleLiability} per passenger`);
    expect(release.criteria.LONG_WAVE).not.toContain("${");
    expect(release.criteria.HEAD_ONLY).toContain("decision tax is independent of wave size");
  });
});
