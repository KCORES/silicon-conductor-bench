import { describe, expect, it } from "vitest";
import type { CollisionOutcome } from "../src/core/types.js";
import {
  buildCollisionOutcomeIndex,
  collisionAlignmentRetention,
  collisionOutcomeForPedestrian,
  collisionOutcomeForVehicle,
  collisionSettleTick,
  damageAmount,
  pedestrianCollisionVisual,
  pedestrianStrikeLunge,
  vehicleCollisionVisual,
} from "../src/replay/collisionVisual.js";
import { readCollisionOutcomes } from "../src/replay/accidentCues.js";

const outcome: CollisionOutcome = {
  impactTick: 10,
  resourceId: "SPACE:0:0",
  contactPoint: { x: 0, z: 0 },
  collisionType: "ANGLE_COLLISION",
  severity: "SERIOUS",
  vehicles: [
    {
      vehicleId: "vehicle",
      preImpactVelocity: { x: 1, z: 0 },
      impulse: { x: 0.8, z: 0.2 },
      restPose: { x: 0.8, z: 0.2, heading: 0.2 },
      contactPoint: { x: 0, z: 0 },
      contactNormal: { x: -1, z: 0 },
      damageSeverity: "SERIOUS",
      massKg: 1_450,
      impactEnergy: 1_200,
      dentRadius: 0.72,
      dentDepth: 0.36,
      deformation: 0.58,
      slideTicks: 4,
      hazardResourceIds: ["SPACE:1:0"],
    },
  ],
  pedestrians: [
    {
      pedestrianId: "pedestrian",
      impulse: { x: 1.2, z: 0 },
      restPose: { x: 1.2, z: 0, heading: Math.PI / 2 },
      fallDirection: Math.PI / 2,
      slideTicks: 5,
    },
  ],
};

describe("replay collision visuals", () => {
  it("samples vehicle impact deterministically and freezes at rest", () => {
    const participant = outcome.vehicles[0];
    if (participant === undefined) {
      throw new Error("Missing vehicle");
    }
    expect(vehicleCollisionVisual(outcome, participant, 10).x).toBe(0);
    const middle = vehicleCollisionVisual(outcome, participant, 12);
    expect(middle.x).toBeGreaterThan(0);
    expect(middle.x).toBeLessThan(participant.impulse.x);
    expect(vehicleCollisionVisual(outcome, participant, 14)).toMatchObject({
      x: participant.impulse.x,
      z: participant.impulse.z,
      settled: true,
    });
    expect(vehicleCollisionVisual(outcome, participant, 30)).toEqual(
      vehicleCollisionVisual(outcome, participant, 14),
    );
  });

  it("falls and slides pedestrians in the recorded impulse direction", () => {
    const participant = outcome.pedestrians[0];
    if (participant === undefined) {
      throw new Error("Missing pedestrian");
    }
    const middle = pedestrianCollisionVisual(outcome, participant, 12.5);
    expect(middle.x).toBeGreaterThan(0);
    expect(middle.fallProgress).toBeGreaterThan(0);
    expect(middle.animationProgress).toBeGreaterThan(0);
    expect(middle.motionProgress).toBeGreaterThan(0);
    expect(middle.motionProgress).toBeLessThan(1);
    const settled = pedestrianCollisionVisual(outcome, participant, 20);
    expect(settled).toMatchObject({
      x: participant.impulse.x,
      z: participant.impulse.z,
      settled: true,
    });
  });

  it("coasts the striking vehicle into a pedestrian it was resolved short of", () => {
    const striking = outcome.vehicles[0];
    if (striking === undefined) {
      throw new Error("Missing vehicle");
    }
    const ahead: CollisionOutcome = {
      ...outcome,
      pedestrians: [
        {
          pedestrianId: "pedestrian",
          contactPoint: { x: 0, z: 0 },
          impulse: { x: 1.2, z: 0 },
          restPose: { x: 2.2, z: 0, heading: Math.PI / 2 },
          fallDirection: Math.PI / 2,
          slideTicks: 5,
        },
      ],
    };
    const pedestrian = ahead.pedestrians[0];
    if (pedestrian === undefined) {
      throw new Error("Missing pedestrian");
    }
    const lunge = pedestrianStrikeLunge(ahead);
    expect(lunge?.offset.x).toBeCloseTo(0.78);
    expect(lunge?.offset.z).toBeCloseTo(0);
    expect(lunge?.ticks).toBeCloseTo(0.78);
    expect(pedestrianStrikeLunge(outcome)).toBeUndefined();

    expect(vehicleCollisionVisual(ahead, striking, 10.39).x).toBeCloseTo(0.39);
    expect(pedestrianCollisionVisual(ahead, pedestrian, 10.78).motionProgress).toBe(0);
    expect(
      pedestrianCollisionVisual(ahead, pedestrian, 11.5).motionProgress,
    ).toBeGreaterThan(0);
    const rest = vehicleCollisionVisual(ahead, striking, 30);
    expect(rest.x).toBeCloseTo(striking.impulse.x + 0.78);
    expect(rest.settled).toBe(true);
    expect(collisionSettleTick(ahead, striking.slideTicks)).toBeCloseTo(14.78);
  });

  it("increases deformation monotonically with severity", () => {
    expect(damageAmount("MINOR")).toBeLessThan(damageAmount("MODERATE"));
    expect(damageAmount("MODERATE")).toBeLessThan(damageAmount("SERIOUS"));
    expect(damageAmount("SERIOUS")).toBeLessThan(damageAmount("CRITICAL"));
  });

  it("retains contact alignment while a wreck is stopped or being cleared", () => {
    expect(collisionAlignmentRetention("ACCIDENT_STOPPED")).toBe(1);
    expect(collisionAlignmentRetention("EVACUATING")).toBe(1);
    expect(collisionAlignmentRetention("OUTBOUND")).toBe(0);
  });

  it("indexes the same outcome the linear scan would return", () => {
    const earlier = {
      ...outcome,
      impactTick: 4,
      resourceId: "SPACE:1:0",
    };
    const sameTickLater = {
      ...outcome,
      impactTick: 10,
      resourceId: "SPACE:2:0",
      vehicles: [
        {
          ...outcome.vehicles[0],
          vehicleId: "vehicle",
          deformation: 0.2,
        },
      ],
    };
    const outOfOrder = {
      ...outcome,
      impactTick: 7,
      resourceId: "SPACE:3:0",
      vehicles: [
        {
          ...outcome.vehicles[0],
          vehicleId: "vehicle",
          deformation: 0.9,
        },
      ],
      pedestrians: [
        {
          ...outcome.pedestrians[0],
          pedestrianId: "other-pedestrian",
        },
      ],
    };
    const outcomes = [earlier, outcome, sameTickLater, outOfOrder];
    const index = buildCollisionOutcomeIndex(outcomes);
    for (const tick of [0, 4, 7, 9, 10, 10.5, 30]) {
      expect(index.vehicle("vehicle", tick)).toEqual(
        collisionOutcomeForVehicle(
          outcomes.filter((item) => item.impactTick <= tick),
          "vehicle",
        ),
      );
      expect(index.pedestrian("pedestrian", tick)).toEqual(
        collisionOutcomeForPedestrian(
          outcomes.filter((item) => item.impactTick <= tick),
          "pedestrian",
        ),
      );
    }
    expect(index.vehicle("vehicle", 10)?.outcome.resourceId).toBe("SPACE:3:0");
    expect(index.vehicle("missing", 10)).toBeUndefined();
    expect(index.pedestrian("pedestrian", 9)?.outcome.resourceId).toBe(
      "SPACE:1:0",
    );
    expect(index.pedestrian("other-pedestrian", 6)).toBeUndefined();
  });

  it("accepts legacy participants and rejects malformed collision payloads", () => {
    expect(
      readCollisionOutcomes({ collisionOutcomes: [outcome] }),
    ).toEqual([outcome]);
    expect(
      readCollisionOutcomes({
        collisionOutcomes: [
          {
            ...outcome,
            pedestrians: [{ pedestrianId: "broken" }],
          },
        ],
      }),
    ).toEqual([]);
  });
});
