import { describe, expect, it } from "vitest";
import { arrivalsAt } from "../src/core/demand.js";
import { SimulationEngine } from "../src/core/engine.js";
import { createRoadNetwork } from "../src/core/network.js";
import type { RouteId, VehicleDespawnEvent } from "../src/core/types.js";
import type { WorldSnapshot } from "../src/core/types.js";

function routeIds(): RouteId[] {
  return [...createRoadNetwork().trajectories.keys()];
}

function plannedArrivals(seed: number, ticks: number, routes: readonly RouteId[]) {
  return Array.from({ length: ticks }, (_, tick) =>
    arrivalsAt(seed, tick, routes),
  );
}

interface RealizedRun {
  readonly planned: ReturnType<typeof plannedArrivals>;
  readonly spawned: readonly string[];
  readonly despawned: readonly VehicleDespawnEvent[];
  readonly snapshot: WorldSnapshot;
}

function runPolicy(
  seed: number,
  ticks: number,
  admit: boolean,
  inboundLaneLength = 24,
): RealizedRun {
  const network = createRoadNetwork({ inboundLaneLength });
  const engine = new SimulationEngine({ network, seed });
  const routes = [...engine.network.trajectories.keys()];
  const planned = [];
  const spawned: string[] = [];
  const despawned: VehicleDespawnEvent[] = [];

  for (let step = 0; step < ticks; step += 1) {
    for (const vehicle of engine.drainUpstreamQueues()) {
      spawned.push(
        `${engine.currentTick}:${vehicle.id}:${vehicle.type}:${vehicle.routeId}`,
      );
    }
    const arrivals = arrivalsAt(seed, engine.currentTick, routes);
    planned.push(arrivals);
    for (const arrival of arrivals) {
      const vehicle = engine.spawnScheduled(arrival);
      if (vehicle !== undefined) {
        spawned.push(
          `${engine.currentTick}:${vehicle.id}:${vehicle.type}:${vehicle.routeId}`,
        );
      }
    }
    if (admit) {
      const ready = [...engine.vehicles.values()]
        .filter((vehicle) => vehicle.state === "AT_STOPLINE")
        .map((vehicle) => vehicle.id)
        .sort();
      if (ready.length > 0) {
        engine.applyAdmissions(ready);
      }
    }
    despawned.push(...engine.step().despawnEvents);
  }

  return {
    planned,
    spawned,
    despawned,
    snapshot: engine.getSnapshot(),
  };
}

describe("seeded demand script", () => {
  it("repeats the same arrivals for a seed and tick without replaying earlier ticks", () => {
    const routes = routeIds();
    const first = arrivalsAt(11, 100, routes);
    const second = arrivalsAt(11, 100, [...routes].reverse());
    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first.map((arrival) => arrival.slot)).toEqual([0, 1]);
    expect(first.every((arrival) => arrival.tick === 100)).toBe(true);
  });

  it("changes the arrival script when the seed changes", () => {
    const routes = routeIds();
    expect(plannedArrivals(1, 12, routes)).not.toEqual(
      plannedArrivals(2, 12, routes),
    );
  });

  it("replays the same world when the seed and admissions match", () => {
    const left = runPolicy(7, 30, true);
    const right = runPolicy(7, 30, true);
    expect(left).toEqual(right);
    expect(left.spawned.length).toBeGreaterThan(0);
  });

  it("keeps the planned script when admissions change which vehicles actually enter", () => {
    const routes = routeIds();
    const script = plannedArrivals(9, 40, routes);
    const admitted = runPolicy(9, 40, true, 8);
    const held = runPolicy(9, 40, false, 8);

    expect(admitted.planned).toEqual(script);
    expect(held.planned).toEqual(script);
    expect(held.spawned.length).toBeLessThan(admitted.spawned.length);
    expect(arrivalsAt(9, 40, routes)).toEqual(arrivalsAt(9, 40, routes));
  });

  it("drains each lane in FIFO order and ignores a repeated scheduled arrival", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork({ inboundLaneLength: 2 }),
      seed: 3,
    });
    const blocker = engine.spawnVehicle("N_S1_STRAIGHT", "MOTORCYCLE");
    expect(blocker).toBeDefined();
    if (blocker === undefined) {
      return;
    }
    const first = {
      tick: 7,
      slot: 0,
      routeId: "N_S1_STRAIGHT" as const,
      type: "MOTORCYCLE" as const,
    };
    const second = {
      tick: 7,
      slot: 1,
      routeId: "N_S1_STRAIGHT" as const,
      type: "SEDAN" as const,
    };

    expect(engine.spawnScheduled(first)).toBeUndefined();
    expect(engine.spawnScheduled(first)).toBeUndefined();
    expect(engine.spawnScheduled(second)).toBeUndefined();
    expect(engine.buildObservation(0).upstreamQueues).toEqual([
      { laneId: "IN_N_S1_STRAIGHT", waiting: 2 },
    ]);
    expect(engine.waitingCharges(0.02).upstream).toBe(0);

    blocker.inboundHeadSlot = 1;
    const firstDrain = engine.drainUpstreamQueues();
    expect(firstDrain).toHaveLength(1);
    expect(firstDrain[0]).toMatchObject({
      routeId: first.routeId,
      type: first.type,
      generatedAtTick: first.tick,
    });
    expect(engine.buildObservation(0).upstreamQueues[0]?.waiting).toBe(1);

    blocker.state = "CROSSING";
    const firstVehicle = firstDrain[0];
    if (firstVehicle !== undefined) {
      firstVehicle.state = "CROSSING";
    }
    const secondDrain = engine.drainUpstreamQueues();
    expect(secondDrain).toHaveLength(1);
    expect(secondDrain[0]).toMatchObject({
      routeId: second.routeId,
      type: second.type,
      generatedAtTick: second.tick,
    });
    expect(engine.buildObservation(0).upstreamQueues).toEqual([]);
  });

  it("bleeds upstream backlog each tick and charges unserved liability at the horizon", () => {
    const engine = new SimulationEngine({
      network: createRoadNetwork({ inboundLaneLength: 2 }),
      seed: 3,
    });
    const waiting = engine.spawnVehicle("N_S1_STRAIGHT", "SEDAN");
    const crossing = engine.spawnVehicle("E_S1_STRAIGHT", "SEDAN");
    const outbound = engine.spawnVehicle("S_S1_STRAIGHT", "MOTORCYCLE");
    expect(waiting && crossing && outbound).toBeDefined();
    if (waiting === undefined || crossing === undefined || outbound === undefined) {
      return;
    }
    for (const slot of [0, 1]) {
      engine.spawnScheduled({
        tick: 5,
        slot,
        routeId: "N_S1_STRAIGHT",
        type: "SEDAN",
      });
    }
    expect(engine.upstreamBacklogCount()).toBe(2);
    expect(engine.collectWaitingSettlement(0.1, 1.5).totals.upstream).toBeCloseTo(3);

    const slots =
      engine.network.trajectories.get(crossing.routeId)?.slots.length ?? 0;
    expect(slots).toBeGreaterThan(1);
    crossing.state = "CROSSING";
    crossing.trajectoryHeadSlot = Math.floor(slots / 2) - 1;
    outbound.state = "OUTBOUND";
    const terminal = engine.terminalSettlement(
      (vehicle) => (vehicle.type === "MOTORCYCLE" ? 20 : 50),
      50,
    );
    expect(terminal.outboundToll).toBe(20);
    expect(terminal.crossingToll).toBeCloseTo((50 * Math.floor(slots / 2)) / slots);
    expect(terminal.unservedOnMap).toBe(1);
    expect(terminal.unservedUpstream).toBe(2);
    expect(terminal.unservedLiability).toBe(150);
  });
});
