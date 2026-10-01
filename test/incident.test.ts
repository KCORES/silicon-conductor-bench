import { describe, expect, it } from "vitest";
import { AgentMetricsCollector } from "../src/agent/metrics.js";
import {
  AgentToolRuntime,
  COMMIT_SCHEDULE,
  INSPECT_INCIDENT,
  ORDER_ACCIDENT_CLEARANCE,
  SET_LANE_DETOUR,
} from "../src/agent/tools.js";
import { WorkingMemoryStack } from "../src/agent/working-memory.js";
import { config } from "../src/config.js";
import { adjacentRouteIds } from "../src/core/dynamics.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import type { Vehicle } from "../src/core/types.js";
import { ReplayRecorder } from "../src/replay/recorder.js";
import { createReplayScene, resolveVehiclePose } from "../src/replay/geometry.js";

function moveAllVehiclesToStoplines(engine: SimulationEngine): void {
  for (let tick = 0; tick < 30; tick += 1) {
    engine.step();
  }
}

function mustSpawn(
  engine: SimulationEngine,
  routeId: string,
): Vehicle {
  const vehicle = engine.spawnVehicle(routeId, "MOTORCYCLE");
  if (vehicle === undefined) {
    throw new Error(`Failed to spawn ${routeId}`);
  }
  return vehicle;
}

function driveUntilInterrupt(engine: SimulationEngine, limit = 50): string {
  for (let tick = 0; tick < limit; tick += 1) {
    const reason = engine.step().interruptReason;
    if (reason !== undefined) {
      return reason;
    }
  }
  throw new Error("Expected an accident interrupt");
}

function scheduleCrossingStraight(
  engine: SimulationEngine,
  movingId: string,
  enteringId: string,
): void {
  engine.applyAdmissions([movingId]);
  for (let wait = 0; wait < 24; wait += 1) {
    const preview = engine.dryRunAdmissions([enteringId]);
    if (preview.conflictDetected !== undefined) {
      engine.applyAdmissions([enteringId]);
      return;
    }
    engine.step();
  }
  throw new Error("Crossing straights did not share a conflict tick");
}

function crashCrossingStraights(seed: number): {
  engine: SimulationEngine;
  moving: Vehicle;
  entering: Vehicle;
  interrupt: string;
} {
  const engine = new SimulationEngine({
    network: createRoadNetwork(),
    seed,
    dynamics: { stallModulus: 1_000_000 },
  });
  const moving = mustSpawn(engine, "E_S1_STRAIGHT");
  const entering = mustSpawn(engine, "N_S1_STRAIGHT");
  moveAllVehiclesToStoplines(engine);
  scheduleCrossingStraight(engine, moving.id, entering.id);
  const interrupt = driveUntilInterrupt(engine);
  return { engine, moving, entering, interrupt };
}

describe("intersection fender-benders", () => {
  it("keeps same-origin straight and right routes open after a left/opposing-straight crash", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      dynamics: {
        stallModulus: 1_000_000,
        crosswalkModulus: 1_000_000,
      },
    });
    const left = mustSpawn(engine, "N_L1_LEFT");
    const opposing = mustSpawn(engine, "S_S1_STRAIGHT");
    const straight = mustSpawn(engine, "N_S1_STRAIGHT");
    const right = mustSpawn(engine, "N_R1_RIGHT");
    moveAllVehiclesToStoplines(engine);
    scheduleCrossingStraight(engine, left.id, opposing.id);
    driveUntilInterrupt(engine);

    const incident = engine.incidentSummaries()[0];
    expect(incident?.severedRouteIds).toContain("N_L1_LEFT");
    expect(incident?.severedRouteIds).not.toContain("N_S1_STRAIGHT");
    expect(incident?.severedRouteIds).not.toContain("N_R1_RIGHT");
    expect(engine.dryRunAdmissions([straight.id]).feasible).toBe(true);
    expect(engine.dryRunAdmissions([right.id]).feasible).toBe(true);
  });

  it("stops crossing straights on the shared cell and interrupts sleep", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 4,
      dynamics: { stallModulus: 1_000_000 },
    });
    const moving = mustSpawn(engine, "E_S1_STRAIGHT");
    const entering = mustSpawn(engine, "N_S1_STRAIGHT");
    const healthy = mustSpawn(engine, "W_S1_STRAIGHT");
    moveAllVehiclesToStoplines(engine);
    const poseBeforeCommit = engine.getSnapshot();

    const looked = engine.dryRunAdmissions([moving.id]);
    expect(looked.feasible).toBe(true);
    expect(engine.getSnapshot()).toEqual(poseBeforeCommit);

    scheduleCrossingStraight(engine, moving.id, entering.id);
    expect(engine.scheduledCollisionCount).toBe(1);
    expect(moving.state).toBe("CROSSING");
    expect(entering.state).toBe("CROSSING");

    const interrupt = driveUntilInterrupt(engine);
    const incident = engine.incidentSummaries()[0];
    expect(incident).toBeDefined();
    expect(interrupt).toBe(
      `ACCIDENT_INTERRUPT incident=${incident?.id} locked=${incident?.lockedResourceIds.join(",")} vehicles=${incident?.vehicleIds.join(",")}`,
    );
    expect(engine.currentTick).toBe(incident?.triggerTick);
    expect(moving.state).toBe("ACCIDENT_STOPPED");
    expect(entering.state).toBe("ACCIDENT_STOPPED");
    expect(incident?.lockedResourceIds.some((id) => id.startsWith("SPACE:"))).toBe(
      true,
    );
    expect(incident?.collisionOutcomes).toHaveLength(1);
    expect(incident?.collisionOutcomes?.[0]?.vehicles).toHaveLength(2);

    const scene = createReplayScene(engine.network);
    const pose = resolveVehiclePose(moving, scene);
    expect(pose.state).toBe("ACCIDENT_STOPPED");
    expect(pose.segments).toHaveLength(moving.lengthSlots);

    expect(config.economy.hazardBleedPerResource).toBeGreaterThan(0);
    expect(config.economy.secondaryAdmitPenalty).toBeGreaterThan(0);
    expect(
      engine.lockedResourceCount() * config.economy.hazardBleedPerResource,
    ).toBeGreaterThan(0);
    expect(engine.dryRunAdmissions([healthy.id]).feasible).toBe(true);
    expect(engine.applyAdmissions([healthy.id]).admittedVehicleIds).toEqual([
      healthy.id,
    ]);
    expect(healthy.state).toBe("CROSSING");
    expect(engine.incidentSummaries()).toHaveLength(1);

    const recorder = new ReplayRecorder({
      network: engine.network,
      identity: { model: "test", testDate: "2026-09-22", postfix: "" },
      model: "test",
      seed: 4,
      tickDurationMs: 100,
      warmupTicks: 0,
    });
    for (const entry of engine.drainIncidentLog()) {
      recorder.recordWorldEvent(entry.kind, entry.tick, entry);
    }
    const kinds = recorder.finalize().events.map((event) => event.kind);
    expect(kinds).toContain("ACCIDENT");
    expect(kinds).toContain("ACCIDENT_INTERRUPT");
  });

  it("keeps an inbound follower behind a crashed vehicle body", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 4,
      dynamics: {
        stallModulus: 1_000_000,
        crosswalkModulus: 1_000_000,
      },
    });
    const crashed = engine.spawnVehicle(
      "E_R1_RIGHT",
      "city-builder:car_stationwagon",
    );
    for (let tick = 0; tick < 6; tick += 1) {
      engine.step();
    }
    const follower = engine.spawnVehicle("E_R1_RIGHT", "SEDAN");
    expect(crashed).toBeDefined();
    expect(follower).toBeDefined();
    if (crashed === undefined || follower === undefined) {
      return;
    }

    moveAllVehiclesToStoplines(engine);
    crashed.state = "ACCIDENT_STOPPED";
    crashed.trajectoryHeadSlot = 0;
    engine.step();

    expect(crashed.state).toBe("ACCIDENT_STOPPED");
    expect(follower.state).not.toBe("AT_STOPLINE");

    const scene = createReplayScene(engine.network);
    const crashedPose = resolveVehiclePose(crashed, scene);
    const followerPose = resolveVehiclePose(follower, scene);
    const crashedCells = new Set(
      crashedPose.segments.map((segment) => `${segment.x}:${segment.z}`),
    );
    expect(
      followerPose.segments.some((segment) =>
        crashedCells.has(`${segment.x}:${segment.z}`),
      ),
    ).toBe(false);
  });

  it("repeats the same crash tick and locked cells for the same commits", () => {
    const left = crashCrossingStraights(42);
    const right = crashCrossingStraights(42);
    expect(left.interrupt).toBe(right.interrupt);
    expect(left.engine.currentTick).toBe(right.engine.currentTick);
    expect(left.engine.incidentSummaries()[0]?.lockedResourceIds).toEqual(
      right.engine.incidentSummaries()[0]?.lockedResourceIds,
    );
    expect(left.engine.incidentSummaries()[0]?.triggerTick).toBe(
      right.engine.incidentSummaries()[0]?.triggerTick,
    );
  });

  it("rejects a severed-route admit without a second crash", () => {
    const { engine, entering } = crashCrossingStraights(3);
    const incident = engine.incidentSummaries()[0];
    expect(incident?.severedRouteIds).toContain(entering.routeId);
    const follower = mustSpawn(engine, entering.routeId);
    for (
      let tick = 0;
      tick < 40 && follower.state !== "AT_STOPLINE";
      tick += 1
    ) {
      engine.step();
    }
    expect(follower.state).toBe("AT_STOPLINE");

    const metrics = new AgentMetricsCollector({
      decisionTax: config.economy.decisionTax,
      toolTax: config.economy.toolTax,
      recklessAttemptPenalty: config.economy.recklessAttemptPenalty,
      parallelTerminalWarningPenalty:
        config.economy.parallelTerminalWarningPenalty,
    });
    const runtime = new AgentToolRuntime({
      engine,
      memory: new WorkingMemoryStack(4),
      metrics,
      tollMotorcycle: config.economy.tollMotorcycle,
      tollStandard: config.economy.tollStandard,
      tollEmergency: config.economy.tollEmergency,
    });
    runtime.execute(
      COMMIT_SCHEDULE,
      JSON.stringify({
        admit_vehicle_ids: [follower.id],
        sleep_ticks: 1,
        tactical_summary: "Push into the wreck",
      }),
    );

    expect(follower.state).toBe("AT_STOPLINE");
    expect(engine.incidentSummaries()).toHaveLength(1);
    expect(engine.consumeSecondaryAdmitCount()).toBe(1);
    expect(metrics.snapshot().recklessAttempts).toBe(1);
    expect(engine.drainIncidentLog().some((entry) => entry.kind === "SECONDARY_REJECT")).toBe(
      true,
    );
  });

  it("labels incident-severed routes separately from temporary reservations", () => {
    const { engine } = crashCrossingStraights(31);
    const incident = engine.incidentSummaries()[0];
    const routeId = incident?.severedRouteIds[0];
    const target = incident?.suggestedEvacLanes[0];
    expect(routeId).toBeDefined();
    expect(target).toBeDefined();
    if (incident === undefined || routeId === undefined || target === undefined) {
      return;
    }

    engine.orderAccidentClearance(incident.id, target);
    const first = engine
      .buildObservation(0)
      .blockedRoutes.find((route) => route.routeId === routeId);
    expect(first).toMatchObject({
      blockKind: "INCIDENT",
      incidentIds: [incident.id],
    });
    expect(first?.blockedUntilTick).toBeGreaterThan(engine.currentTick);

    engine.step();
    const second = engine
      .buildObservation(0)
      .blockedRoutes.find((route) => route.routeId === routeId);
    expect(second?.blockKind).toBe("INCIDENT");
    expect(second?.blockedUntilTick).toBe(first?.blockedUntilTick);
  });

  it("keeps wrecks fixed when clearance is repeated or retargeted", () => {
    const { engine, moving } = crashCrossingStraights(32);
    const incident = engine.incidentSummaries()[0];
    const firstTarget = incident?.suggestedEvacLanes[0];
    expect(firstTarget).toBeDefined();
    if (incident === undefined || firstTarget === undefined) {
      return;
    }

    engine.orderAccidentClearance(incident.id, firstTarget);
    const initialHead = moving.trajectoryHeadSlot;
    const estimate = engine.inspectIncident(incident.id)?.estimatedClearanceTicks;
    engine.drainIncidentLog();

    const repeated = engine.orderAccidentClearance(incident.id, firstTarget);
    expect(repeated).toMatchObject({
      ok: true,
      noOp: true,
      startedVehicleIds: [],
      currentTargetEvacLane: firstTarget,
    });
    expect(moving.trajectoryHeadSlot).toBe(initialHead);
    expect(engine.inspectIncident(incident.id)?.estimatedClearanceTicks).toBe(
      estimate,
    );
    expect(engine.drainIncidentLog()).toEqual([]);

    const secondTarget = engine
      .inspectIncident(incident.id)
      ?.suggestedEvacLanes.find((lane) => lane !== firstTarget);
    expect(secondTarget).toBeDefined();
    if (secondTarget === undefined) {
      return;
    }
    const retargeted = engine.orderAccidentClearance(incident.id, secondTarget);
    expect(retargeted).toMatchObject({
      ok: true,
      targetChanged: true,
      startedVehicleIds: [],
      currentTargetEvacLane: secondTarget,
    });
    expect(moving.routeId).toBe("E_S1_STRAIGHT");
    expect(moving.trajectoryHeadSlot).toBe(initialHead);
  });

  it("fails a bad tow lane, then removes fixed wrecks when clearance completes", () => {
    const { engine, moving, entering } = crashCrossingStraights(8);
    const incident = engine.incidentSummaries()[0];
    expect(incident).toBeDefined();
    if (incident === undefined) {
      return;
    }

    const metrics = new AgentMetricsCollector({
      decisionTax: 2,
      toolTax: 0.15,
      recklessAttemptPenalty: 15,
      parallelTerminalWarningPenalty: 0.5,
    });
    const runtime = new AgentToolRuntime({
      engine,
      memory: new WorkingMemoryStack(4),
      metrics,
      tollMotorcycle: 5,
      tollStandard: 20,
      tollEmergency: 50,
    });
    const inspected = runtime.execute(
      INSPECT_INCIDENT,
      JSON.stringify({ incident_id: incident.id }),
    );
    expect(inspected.output).toMatchObject({
      ok: true,
      incident_id: incident.id,
      collision_type: expect.any(String),
      severity: expect.any(String),
      estimated_clearance_ticks: expect.any(Number),
    });
    const inspectedOutput = inspected.output as {
      lock_grid: string[];
      locked_count: number;
      locked_space_cells: number;
    };
    expect(inspectedOutput).not.toHaveProperty("locked_resources");
    expect(inspectedOutput.locked_count).toBe(incident.lockedResourceIds.length);
    expect(inspectedOutput.lock_grid).toHaveLength(15);
    expect(inspectedOutput.lock_grid.join("").split("#").length - 1).toBe(
      inspectedOutput.locked_space_cells,
    );
    expect(inspectedOutput.locked_space_cells).toBeGreaterThan(0);
    expect(JSON.stringify(inspected.output).length).toBeLessThanOrEqual(800);
    const heldRoute = incident.severedRouteIds[0];
    expect(heldRoute).toBeDefined();
    const held = runtime.execute(
      SET_LANE_DETOUR,
      JSON.stringify({
        severed_lane_id: heldRoute,
        action: "HOLD_AT_STOPLINE",
      }),
    );
    expect(held.output).toMatchObject({
      ok: true,
      incident_id: incident.id,
      state: "HELD",
      auto_release: "ACCIDENT_CLEARED",
    });
    expect(engine.buildObservation(0).activeLaneHolds).toHaveLength(1);
    const suggested = incident.suggestedEvacLanes;
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.every((lane) => lane.startsWith("OUT_"))).toBe(true);

    const rejected = runtime.execute(
      ORDER_ACCIDENT_CLEARANCE,
      JSON.stringify({
        incident_id: incident.id,
        target_evac_lane: "OUT_NOWHERE",
      }),
    );
    expect(rejected.output).toMatchObject({
      ok: false,
      error: "UNKNOWN_EVAC_LANE",
    });
    expect(moving.state).toBe("ACCIDENT_STOPPED");
    expect(entering.state).toBe("ACCIDENT_STOPPED");

    const target = suggested[0];
    expect(target).toBeDefined();
    const scene = createReplayScene(engine.network);
    const movingBefore = resolveVehiclePose(moving, scene);
    const enteringBefore = resolveVehiclePose(entering, scene);
    const ordered = runtime.execute(
      ORDER_ACCIDENT_CLEARANCE,
      JSON.stringify({
        incident_id: incident.id,
        target_evac_lane: target,
      }),
    );
    expect(ordered.output).toMatchObject({
      ok: true,
      no_op: false,
      started_vehicle_ids: expect.arrayContaining([moving.id, entering.id]),
      current_target_evac_lane: target,
    });
    expect(moving.state).toBe("ACCIDENT_STOPPED");
    expect(entering.state).toBe("ACCIDENT_STOPPED");
    expect(resolveVehiclePose(moving, scene)).toMatchObject({
      x: movingBefore.x,
      z: movingBefore.z,
      heading: movingBefore.heading,
    });
    expect(resolveVehiclePose(entering, scene)).toMatchObject({
      x: enteringBefore.x,
      z: enteringBefore.z,
      heading: enteringBefore.heading,
    });

    const head = moving.trajectoryHeadSlot;
    const estimate = engine.inspectIncident(incident.id)?.estimatedClearanceTicks;
    expect(estimate).toBeGreaterThan(2);
    for (let tick = 0; tick < (estimate ?? 0) - 1; tick += 1) {
      engine.step();
      expect(moving.trajectoryHeadSlot).toBe(head);
      expect(engine.vehicles.has(moving.id)).toBe(true);
    }
    engine.step();
    expect(engine.vehicles.has(moving.id)).toBe(false);
    expect(engine.vehicles.has(entering.id)).toBe(false);
    const closed = engine.incidentSummaries()[0];
    expect(closed?.status).toBe("CLOSED");
    expect(closed?.clearanceLatencyTicks).toBeGreaterThan(0);
    expect(engine.lockedResourceCount()).toBe(0);
    expect(engine.buildObservation(0).activeLaneHolds).toEqual([]);
    expect(
      engine.drainIncidentLog().some((entry) => entry.kind === "EVACUATION"),
    ).toBe(true);
  });

  it("rejects detour controls for a healthy, non-severed lane", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork() });
    const vehicle = mustSpawn(engine, "N_S1_STRAIGHT");
    moveAllVehiclesToStoplines(engine);
    const metrics = new AgentMetricsCollector({
      decisionTax: 2,
      toolTax: 0.15,
      recklessAttemptPenalty: 15,
      parallelTerminalWarningPenalty: 0.5,
    });
    const runtime = new AgentToolRuntime({
      engine,
      memory: new WorkingMemoryStack(4),
      metrics,
      tollMotorcycle: 5,
      tollStandard: 20,
      tollEmergency: 50,
    });
    const held = runtime.execute(
      SET_LANE_DETOUR,
      JSON.stringify({
        severed_lane_id: vehicle.inboundLaneId,
        action: "HOLD_AT_STOPLINE",
      }),
    );
    expect(held.output).toMatchObject({
      ok: false,
      error: "SOURCE_NOT_SEVERED",
    });
    const admitted = engine.applyAdmissions([vehicle.id]);
    expect(admitted.admittedVehicleIds).toEqual([vehicle.id]);
    expect(vehicle.state).toBe("CROSSING");
    expect(engine.consumeSecondaryAdmitCount()).toBe(0);
    expect(engine.incidentSummaries()).toEqual([]);
  });

  it("does not disguise a stalled head as a successful accident detour", () => {
    const { engine, entering } = crashCrossingStraights(17);
    const severed = new Set(
      engine.incidentSummaries()[0]?.severedRouteIds ?? [],
    );
    expect(severed.has(entering.routeId)).toBe(true);
    const target = adjacentRouteIds(engine.network, entering.routeId)
      .filter((routeId) => !severed.has(routeId))
      .map((routeId) => engine.network.trajectories.get(routeId))
      .find((trajectory) => trajectory !== undefined);
    expect(target).toBeDefined();
    if (target === undefined) {
      return;
    }

    const follower = mustSpawn(engine, entering.routeId);
    Object.assign(engine.dynamics, { stallModulus: 1 });
    for (
      let tick = 0;
      tick < 80 && follower.state !== "STALLED";
      tick += 1
    ) {
      engine.step();
    }
    expect(follower.state).toBe("STALLED");
    expect(
      engine.setLaneDetour(
        entering.routeId,
        "DIVERT_TO_ADJACENT_LANE",
        target.id,
      ),
    ).toEqual({ ok: false, error: "STALLED_HEAD" });
    expect(follower.routeId).toBe(entering.routeId);
  });

  it("diverts only the inbound head onto a route that is still open", () => {
    const engine = new SimulationEngine({ network: createRoadNetwork(), seed: 11 });
    const lead = mustSpawn(engine, "N_S1_STRAIGHT");
    engine.step();
    const follower = mustSpawn(engine, "N_S1_STRAIGHT");
    engine.step();
    const trailer = mustSpawn(engine, "N_S1_STRAIGHT");
    engine.step();
    const moving = mustSpawn(engine, "E_S1_STRAIGHT");
    moveAllVehiclesToStoplines(engine);
    scheduleCrossingStraight(engine, moving.id, lead.id);
    driveUntilInterrupt(engine);

    const severed = new Set(
      engine.incidentSummaries()[0]?.severedRouteIds ?? [],
    );
    expect(severed.has("N_S1_STRAIGHT")).toBe(true);
    const target = adjacentRouteIds(engine.network, "N_S1_STRAIGHT")
      .filter((routeId) => !severed.has(routeId))
      .map((routeId) => engine.network.trajectories.get(routeId))
      .find((trajectory) => trajectory !== undefined);
    expect(target).toBeDefined();
    if (target === undefined) {
      return;
    }

    const metrics = new AgentMetricsCollector({
      decisionTax: 2,
      toolTax: 0.15,
      recklessAttemptPenalty: 15,
      parallelTerminalWarningPenalty: 0.5,
    });
    const runtime = new AgentToolRuntime({
      engine,
      memory: new WorkingMemoryStack(4),
      metrics,
      tollMotorcycle: 5,
      tollStandard: 20,
      tollEmergency: 50,
    });
    const rejected = runtime.execute(
      SET_LANE_DETOUR,
      JSON.stringify({
        severed_lane_id: follower.inboundLaneId,
        action: "DIVERT_TO_ADJACENT_LANE",
        target_adjacent_lane: "N_S1_STRAIGHT",
      }),
    );
    expect(rejected.output).toMatchObject({ ok: false, error: "TARGET_SEVERED" });
    expect(follower.routeId).toBe("N_S1_STRAIGHT");
    expect(trailer.routeId).toBe("N_S1_STRAIGHT");

    const nonAdjacentTarget = [...engine.network.trajectories.values()].find(
      (trajectory) =>
        trajectory.origin !== "NORTH" && !severed.has(trajectory.id),
    );
    expect(nonAdjacentTarget).toBeDefined();
    if (nonAdjacentTarget === undefined) {
      return;
    }
    const nonAdjacent = runtime.execute(
      SET_LANE_DETOUR,
      JSON.stringify({
        severed_lane_id: "N_S1_STRAIGHT",
        action: "DIVERT_TO_ADJACENT_LANE",
        target_adjacent_lane: nonAdjacentTarget.id,
      }),
    );
    expect(nonAdjacent.output).toMatchObject({
      ok: false,
      error: "TARGET_NOT_ADJACENT",
      valid_target_route_ids: expect.arrayContaining([target.id]),
    });
    expect(follower.inboundLaneId).toBe("IN_N_S1_STRAIGHT");

    const occupant = mustSpawn(engine, target.id);
    occupant.inboundHeadSlot = follower.inboundHeadSlot;
    occupant.state = "QUEUED";
    const occupied = runtime.execute(
      SET_LANE_DETOUR,
      JSON.stringify({
        severed_lane_id: "N_S1_STRAIGHT",
        action: "DIVERT_TO_ADJACENT_LANE",
        target_adjacent_lane: target.id,
      }),
    );
    expect(occupied.output).toMatchObject({
      ok: false,
      error: "TARGET_LANE_SLOT_OCCUPIED",
      blocking_vehicle_id: occupant.id,
      blocked_slot: follower.inboundHeadSlot,
    });
    expect(follower.inboundLaneId).toBe("IN_N_S1_STRAIGHT");
    engine.vehicles.delete(occupant.id);

    const diverted = runtime.execute(
      SET_LANE_DETOUR,
      JSON.stringify({
        severed_lane_id: "N_S1_STRAIGHT",
        action: "DIVERT_TO_ADJACENT_LANE",
        target_adjacent_lane: target.id,
      }),
    );
    const keptPath = [...engine.network.trajectories.values()].find(
      (trajectory) =>
        trajectory.inboundLaneId === target.inboundLaneId &&
        trajectory.destination === "SOUTH" &&
        trajectory.maneuver === "STRAIGHT",
    );
    expect(keptPath).toBeDefined();
    expect(diverted.output).toMatchObject({
      ok: true,
      vehicle_id: follower.id,
      route_id: keptPath?.id,
      target_lane_id: target.inboundLaneId,
    });
    expect(follower.inboundLaneId).toBe(target.inboundLaneId);
    expect(follower.intentRouteId).toBe("N_S1_STRAIGHT");
    expect(follower.outboundLaneId).toBe(keptPath?.outboundLaneId);
    expect(trailer.routeId).toBe("N_S1_STRAIGHT");
    expect(trailer.inboundLaneId).toBe("IN_N_S1_STRAIGHT");

    for (
      let tick = 0;
      tick < 40 && follower.state !== "AT_STOPLINE";
      tick += 1
    ) {
      engine.step();
    }
    const admitted = engine.applyAdmissions([follower.id]);
    expect(admitted.admittedVehicleIds).toEqual([follower.id]);
    expect(follower.state).toBe("CROSSING");
    expect(follower.routeId).toBe(keptPath?.id);
    expect(trailer.routeId).toBe("N_S1_STRAIGHT");
    expect(engine.incidentSummaries().filter((item) => item.status === "OPEN")).toHaveLength(
      1,
    );
  });

  it("explicitly releases an incident-bound stopline hold", () => {
    const { engine } = crashCrossingStraights(17);
    const incident = engine.incidentSummaries()[0];
    const routeId = incident?.severedRouteIds[0];
    expect(routeId).toBeDefined();
    if (incident === undefined || routeId === undefined) {
      return;
    }
    const held = engine.setLaneDetour(routeId, "HOLD_AT_STOPLINE");
    expect(held).toMatchObject({
      ok: true,
      incidentId: incident.id,
      holdState: "HELD",
    });
    expect(engine.inspectIncident(incident.id)?.activeLaneHolds).toHaveLength(1);

    const released = engine.setLaneDetour(routeId, "RELEASE_AT_STOPLINE");
    expect(released).toMatchObject({
      ok: true,
      incidentId: incident.id,
      holdState: "RELEASED",
    });
    expect(engine.inspectIncident(incident.id)?.activeLaneHolds).toEqual([]);
    expect(engine.setLaneDetour(routeId, "RELEASE_AT_STOPLINE")).toMatchObject({
      ok: false,
      error: "LANE_NOT_HELD",
    });
  });

  it("partially commits a mixed batch and charges severed-route rejects", () => {
    const { engine, entering } = crashCrossingStraights(19);
    const severedFollower = mustSpawn(engine, entering.routeId);
    const healthy = mustSpawn(engine, "W_R1_RIGHT");
    for (
      let tick = 0;
      tick < 60 &&
      (severedFollower.state !== "AT_STOPLINE" ||
        healthy.state !== "AT_STOPLINE");
      tick += 1
    ) {
      engine.step();
    }
    const result = engine.applyAdmissionPlan(
      [severedFollower.id],
      [{ laneId: healthy.inboundLaneId, topN: 1 }],
    );
    expect(result.admittedVehicleIds).toContain(healthy.id);
    expect(result.results).toContainEqual(
      expect.objectContaining({
        vehicleId: severedFollower.id,
        reason: "ROUTE_SEVERED",
      }),
    );
    expect(engine.consumeSecondaryAdmitCount()).toBe(1);
  });

  it("locks and clears a vehicle-pedestrian swept collision", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork(),
      seed: 27,
      dynamics: { stallModulus: 1_000_000 },
    });
    const cell = engine.network.crosswalks
      .get("CROSSWALK:NORTH")
      ?.cells.find((candidate) => candidate.row === 0 && candidate.column === 0);
    const slotId = cell?.vehicleSlotIds[0];
    expect(cell).toBeDefined();
    expect(slotId).toBeDefined();
    if (cell === undefined || slotId === undefined) {
      return;
    }
    const separator = slotId.lastIndexOf(":");
    const routeId = slotId.slice(0, separator);
    const targetSlot = Number(slotId.slice(separator + 1));
    const vehicle = mustSpawn(engine, routeId);
    vehicle.state = "CROSSING";
    vehicle.trajectoryHeadSlot = targetSlot - 1;
    const pedestrian = engine.spawnScheduledPedestrian({
      id: "collision-pedestrian",
      tick: engine.currentTick,
      slot: 0,
      crosswalkId: "CROSSWALK:NORTH",
      direction: "A_TO_B",
    });
    expect(pedestrian).toBeDefined();
    if (pedestrian === undefined) {
      return;
    }
    pedestrian.state = "CROSSING_JAYWALK";
    pedestrian.row = 0;
    pedestrian.column = 0;
    pedestrian.nextMoveTick = engine.currentTick + 20;

    const result = engine.step();
    const incident = engine.incidentSummaries()[0];

    expect(result.interruptReason).toContain("pedestrians=collision-pedestrian");
    expect(vehicle.state).toBe("ACCIDENT_STOPPED");
    expect(pedestrian.state).toBe("INJURED");
    expect(incident?.pedestrianIds).toEqual([pedestrian.id]);
    expect(incident?.lockedResourceIds).toContain(cell.conflictResourceId);
    const pedestrianOutcome =
      incident?.collisionOutcomes?.[0]?.pedestrians[0];
    expect(pedestrianOutcome?.hazardResourceIds?.length).toBeGreaterThan(0);
    expect(
      pedestrianOutcome?.hazardResourceIds?.every((resourceId) =>
        incident?.lockedResourceIds.includes(resourceId),
      ),
    ).toBe(true);
    expect(engine.lockedResourceCount()).toBeGreaterThan(0);
    expect(
      engine.collectPedestrianSettlement({
        delayPerTick: 0.02,
        waitingGraceTicks: 10,
        completionReward: 4,
        jaywalkWavePenalty: 50,
        jaywalkerPenalty: 10,
        collisionPenalty: 500,
      }).collisionCost,
    ).toBe(500);
    expect(
      engine.collectPedestrianSettlement({
        delayPerTick: 0.02,
        waitingGraceTicks: 10,
        completionReward: 4,
        jaywalkWavePenalty: 50,
        jaywalkerPenalty: 10,
        collisionPenalty: 500,
      }).collisionCost,
    ).toBe(0);
    expect(
      engine
        .drainPedestrianEvents()
        .map((event) => event.kind),
    ).toEqual(["PED_SPAWN", "PED_COLLISION"]);

    const targetLane = incident?.suggestedEvacLanes[0];
    expect(targetLane).toBeDefined();
    if (incident === undefined || targetLane === undefined) {
      return;
    }
    expect(
      engine.orderAccidentClearance(incident.id, targetLane),
    ).toMatchObject({ ok: true });
    expect(engine.pedestrians.has(pedestrian.id)).toBe(true);

    for (
      let tick = 0;
      tick < 100 &&
      engine.inspectIncident(incident.id)?.status === "OPEN";
      tick += 1
    ) {
      engine.step();
    }
    expect(engine.pedestrians.has(pedestrian.id)).toBe(false);
    expect(engine.inspectIncident(incident.id)?.status).toBe("CLOSED");
    expect(engine.lockedResourceCount()).toBe(0);
  });
});
