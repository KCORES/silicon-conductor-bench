import type {
  CollisionOutcome,
  CollisionVector,
  IncidentSummary,
  Pedestrian,
  RoadNetwork,
  Trajectory,
  Vehicle,
  VehicleCollisionOutcome,
} from "./types.js";
import { vehicleClass, vehicleDimensions } from "./vehicleRoster.js";

export interface CollisionKinematicsInput {
  readonly tick: number;
  readonly resourceId: string;
  readonly collisionType: IncidentSummary["collisionType"];
  readonly severity: IncidentSummary["severity"];
  readonly vehicles: readonly Vehicle[];
  readonly pedestrians: readonly Pedestrian[];
  readonly network: RoadNetwork;
}

const SPEED_BY_PROFILE = {
  SLOW_SLIDE: 0.5,
  CRUISE: 1,
  BURST: 2,
} as const;

const DAMAGE_SCALE: Record<IncidentSummary["severity"], number> = {
  MINOR: 0.25,
  MODERATE: 0.48,
  SERIOUS: 0.72,
  CRITICAL: 1,
};

const MASS_RANGE_KG = {
  passenger: [1_000, 2_200],
  van: [1_800, 3_500],
  truck: [5_000, 18_000],
  bus: [9_000, 16_000],
  emergency: [2_400, 5_200],
} as const;

const BODY_STIFFNESS = {
  passenger: 1,
  van: 1.14,
  truck: 1.58,
  bus: 1.72,
  emergency: 1.42,
} as const;

const PEDESTRIAN_MASS_KG = 75;
const PEDESTRIAN_BODY_RADIUS = 0.22;

export function solveCollisionOutcome(
  input: CollisionKinematicsInput,
): CollisionOutcome {
  const samples = input.vehicles.flatMap((vehicle) => {
    const trajectory = input.network.trajectories.get(vehicle.routeId);
    if (trajectory === undefined) {
      return [];
    }
    const pose = vehiclePose(vehicle, trajectory);
    return [
      {
        vehicle,
        trajectory,
        pose,
        body: vehicleBodyBounds(vehicle, pose),
      },
    ];
  });
  const pedestrianSamples = input.pedestrians.map((pedestrian) => ({
    pedestrian,
    point:
      pedestrianPoint(pedestrian, input.network) ??
      pointForResource(input.resourceId, input.network) ?? { x: 0, z: 0 },
    velocity: pedestrianVelocity(pedestrian, input.network),
  }));
  const fallbackContactPoint =
    pointForResource(input.resourceId, input.network) ??
    averagePoint(samples.map((sample) => sample.pose));
  const pedestrianBodyContact =
    samples.length === 1 && pedestrianSamples.length > 0
      ? closestBodyContact(
          samples[0]!.body,
          pedestrianSamples[0]!.point,
          pedestrianSamples[0]!.velocity,
        )
      : undefined;
  const contactPoint =
    samples.length >= 2
      ? obbContactPoint(samples[0]!.body, samples[1]!.body) ??
        fallbackContactPoint
      : pedestrianBodyContact !== undefined
        ? pedestrianBodyContact.point
      : fallbackContactPoint;
  const velocities = samples.map((sample) => ({
    vehicleId: sample.vehicle.id,
    velocity: vehicleVelocity(sample.vehicle, sample.trajectory),
    mass: vehicleMass(sample.vehicle),
  }));
  const totalMomentum = velocities.reduce(
    (sum, item) => ({
      x: sum.x + item.velocity.x * item.mass,
      z: sum.z + item.velocity.z * item.mass,
    }),
    { x: 0, z: 0 },
  );
  const pedestrianMass = pedestrianSamples.length * PEDESTRIAN_MASS_KG;
  const totalMass =
    velocities.reduce((sum, item) => sum + item.mass, 0) + pedestrianMass;
  const impactDirection =
    normalized(totalMomentum) ??
    normalized(velocities[0]?.velocity ?? { x: 0, z: 1 }) ?? { x: 0, z: 1 };
  const damageScale = DAMAGE_SCALE[input.severity];
  const vehicles: VehicleCollisionOutcome[] = samples.map((sample, index) => {
    const velocity = velocities[index]?.velocity ?? { x: 0, z: 0 };
    const mass = velocities[index]?.mass ?? 1_500;
    const otherMass = Math.max(0, totalMass - mass);
    const otherMomentum = {
      x: totalMomentum.x - velocity.x * mass,
      z: totalMomentum.z - velocity.z * mass,
    };
    const otherVelocity =
      otherMass > 0
        ? { x: otherMomentum.x / otherMass, z: otherMomentum.z / otherMass }
        : { x: 0, z: 0 };
    const relativeVelocity = {
      x: velocity.x - otherVelocity.x,
      z: velocity.z - otherVelocity.z,
    };
    const effectiveMass =
      otherMass > 0 ? (mass * otherMass) / (mass + otherMass) : 75;
    const impactEnergy =
      0.5 * effectiveMass * Math.pow(magnitude(relativeVelocity), 2);
    const energyIntensity = Math.sqrt(Math.max(0, impactEnergy) / 1_800);
    const stiffness = BODY_STIFFNESS[vehicleClass(sample.vehicle.type)];
    const dentRadius = clamp(
      0.34 +
        energyIntensity * 0.2 +
        damageScale * 0.2 +
        Math.min(0.18, sample.vehicle.lengthSlots * 0.025),
      0.32,
      1.15,
    );
    const dentDepth = clamp(
      ((0.12 + energyIntensity * 0.3) * damageScale) / stiffness,
      0.05,
      0.68,
    );
    const ownDirection = normalized(velocity) ?? impactDirection;
    const crossDirection =
      input.collisionType === "ANGLE_COLLISION" ||
      input.collisionType === "PILEUP" ||
      input.collisionType === "SCRAPE";
    const sideSign = index % 2 === 0 ? 1 : -1;
    const impulseDirection = crossDirection
      ? normalized({
          x: ownDirection.x * 0.72 + impactDirection.z * 0.28 * sideSign,
          z: ownDirection.z * 0.72 - impactDirection.x * 0.28 * sideSign,
        }) ?? ownDirection
      : ownDirection;
    const speed = magnitude(velocity);
    const pedestrianImpactScale =
      samples.length === 1 && pedestrianSamples.length > 0 ? 0.28 : 1;
    const slide = clamp(
      (0.18 + speed * 0.28) * damageScale * pedestrianImpactScale,
      0.03,
      0.9,
    );
    const yaw =
      crossDirection ? sideSign * damageScale * Math.min(0.38, speed * 0.16) : 0;
    const restPose = {
      x: sample.pose.x + impulseDirection.x * slide,
      z: sample.pose.z + impulseDirection.z * slide,
      heading: sample.pose.heading + yaw,
    };
    const contactNormal =
      normalized({
        x: sample.body.center.x - contactPoint.x,
        z: sample.body.center.z - contactPoint.z,
      }) ?? {
        x: -impulseDirection.x,
        z: -impulseDirection.z,
      };
    return {
      vehicleId: sample.vehicle.id,
      preImpactVelocity: velocity,
      impulse: {
        x: impulseDirection.x * slide,
        z: impulseDirection.z * slide,
      },
      restPose,
      contactPoint,
      contactNormal,
      damageSeverity: input.severity,
      massKg: mass,
      impactEnergy,
      dentRadius,
      dentDepth,
      deformation: clamp(dentDepth / 0.68, 0.1, 1),
      slideTicks: Math.max(2, Math.round(2 + damageScale * 4)),
      hazardResourceIds: vehicleHazardResources(
        restPose,
        vehicleDimensions(sample.vehicle.type),
      ),
    };
  });
  const strikingSpeed = magnitude(velocities[0]?.velocity ?? { x: 0, z: 0 });
  const pedestrianTravel = clamp(
    (0.42 + strikingSpeed * 0.46) * damageScale,
    0.18,
    2.15,
  );
  const pedestrianImpulse = {
    x: impactDirection.x * pedestrianTravel,
    z: impactDirection.z * pedestrianTravel,
  };
  const strikingMass = velocities[0]?.mass ?? 1_500;
  const pedestrianImpactEnergy =
    0.5 *
    ((strikingMass * PEDESTRIAN_MASS_KG) /
      (strikingMass + PEDESTRIAN_MASS_KG)) *
    strikingSpeed *
    strikingSpeed;
  return {
    impactTick: input.tick,
    resourceId: input.resourceId,
    contactPoint,
    collisionType: input.collisionType,
    severity: input.severity,
    vehicles,
    pedestrians: pedestrianSamples.map((sample, index) => {
      const base = sample.point;
      const spread = (index - (pedestrianSamples.length - 1) / 2) * 0.12;
      const impulse = {
        x: pedestrianImpulse.x + impactDirection.z * spread,
        z: pedestrianImpulse.z - impactDirection.x * spread,
      };
      const bodyContact =
        samples.length === 1
          ? closestBodyContact(samples[0]!.body, base, sample.velocity)
          : undefined;
      const pedestrianContact = bodyContact?.point ?? contactPoint;
      const contactNormal =
        bodyContact?.normal ??
        normalized({
          x: base.x - pedestrianContact.x,
          z: base.z - pedestrianContact.z,
        }) ??
        impactDirection;
      const impactStart = {
        x: pedestrianContact.x + contactNormal.x * PEDESTRIAN_BODY_RADIUS,
        z: pedestrianContact.z + contactNormal.z * PEDESTRIAN_BODY_RADIUS,
      };
      const restPose = {
        x: impactStart.x + impulse.x,
        z: impactStart.z + impulse.z,
        heading: Math.atan2(impulse.x, impulse.z),
      };
      return {
        pedestrianId: sample.pedestrian.id,
        contactPoint: pedestrianContact,
        contactNormal,
        preImpactVelocity: sample.velocity,
        impulse,
        restPose,
        fallDirection: restPose.heading,
        massKg: PEDESTRIAN_MASS_KG,
        impactEnergy: pedestrianImpactEnergy,
        slideTicks: Math.max(3, Math.round(3 + damageScale * 4)),
        hazardResourceIds: sweptHazardResources(impactStart, restPose),
      };
    }),
  };
}

export function nearestCollisionVehicle(
  striking: Vehicle,
  candidates: readonly Vehicle[],
  network: RoadNetwork,
): Vehicle | undefined {
  const strikingTrajectory = network.trajectories.get(striking.routeId);
  if (strikingTrajectory === undefined) {
    return undefined;
  }
  const strikingBody = vehicleBodyBounds(
    striking,
    vehiclePose(striking, strikingTrajectory),
  );
  return candidates
    .flatMap((candidate) => {
      const trajectory = network.trajectories.get(candidate.routeId);
      if (trajectory === undefined) {
        return [];
      }
      const body = vehicleBodyBounds(
        candidate,
        vehiclePose(candidate, trajectory),
      );
      return [{ candidate, gap: bodyGap(strikingBody, body) }];
    })
    .sort(
      (left, right) =>
        left.gap - right.gap ||
        left.candidate.id.localeCompare(right.candidate.id),
    )[0]?.candidate;
}

function vehicleVelocity(
  vehicle: Vehicle,
  trajectory: Trajectory,
): CollisionVector {
  if (vehicle.state === "ACCIDENT_STOPPED" || vehicle.state === "STALLED") {
    return { x: 0, z: 0 };
  }
  const pose = vehiclePose(vehicle, trajectory);
  const speed = SPEED_BY_PROFILE[vehicle.speedProfile];
  return {
    x: Math.sin(pose.heading) * speed,
    z: Math.cos(pose.heading) * speed,
  };
}

function vehiclePose(
  vehicle: Vehicle,
  trajectory: Trajectory,
): { x: number; z: number; heading: number } {
  const index = clamp(
    vehicle.trajectoryHeadSlot,
    0,
    Math.max(0, trajectory.slots.length - 1),
  );
  const slot = trajectory.slots[index] ?? { x: 0, y: 0 };
  const previous = trajectory.slots[Math.max(0, index - 1)] ?? slot;
  const next =
    trajectory.slots[Math.min(trajectory.slots.length - 1, index + 1)] ?? slot;
  const dx = next.x - previous.x;
  const dz = next.y - previous.y;
  return {
    x: slot.x,
    z: slot.y,
    heading: dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz),
  };
}

interface VehicleBodyBounds {
  readonly center: CollisionVector;
  readonly forward: CollisionVector;
  readonly right: CollisionVector;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly corners: readonly CollisionVector[];
}

function vehicleBodyBounds(
  vehicle: Vehicle,
  head: { readonly x: number; readonly z: number; readonly heading: number },
): VehicleBodyBounds {
  const forward = {
    x: Math.sin(head.heading),
    z: Math.cos(head.heading),
  };
  const right = { x: forward.z, z: -forward.x };
  const dimensions = vehicleDimensions(vehicle.type);
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  const center = {
    x: head.x - forward.x * halfLength,
    z: head.z - forward.z * halfLength,
  };
  return {
    center,
    forward,
    right,
    halfLength,
    halfWidth,
    corners: [
      offsetPoint(center, forward, halfLength, right, halfWidth),
      offsetPoint(center, forward, halfLength, right, -halfWidth),
      offsetPoint(center, forward, -halfLength, right, -halfWidth),
      offsetPoint(center, forward, -halfLength, right, halfWidth),
    ],
  };
}

function closestBodyContact(
  body: VehicleBodyBounds,
  point: CollisionVector,
  entryVelocity: CollisionVector,
): { readonly point: CollisionVector; readonly normal: CollisionVector } {
  const delta = {
    x: point.x - body.center.x,
    z: point.z - body.center.z,
  };
  const rawAlong =
    delta.x * body.forward.x + delta.z * body.forward.z;
  const rawAcross = delta.x * body.right.x + delta.z * body.right.z;
  const along = clamp(rawAlong, -body.halfLength, body.halfLength);
  const across = clamp(rawAcross, -body.halfWidth, body.halfWidth);
  if (
    Math.abs(rawAlong) > body.halfLength ||
    Math.abs(rawAcross) > body.halfWidth
  ) {
    const nearest = offsetPoint(
      body.center,
      body.forward,
      along,
      body.right,
      across,
    );
    return {
      point: nearest,
      normal:
        normalized({ x: point.x - nearest.x, z: point.z - nearest.z }) ??
        normalized(entryVelocity) ??
        body.forward,
    };
  }
  const faces = [
    {
      distance: body.halfLength - rawAlong,
      along: body.halfLength,
      across: rawAcross,
      normal: body.forward,
    },
    {
      distance: body.halfLength + rawAlong,
      along: -body.halfLength,
      across: rawAcross,
      normal: { x: -body.forward.x, z: -body.forward.z },
    },
    {
      distance: body.halfWidth - rawAcross,
      along: rawAlong,
      across: body.halfWidth,
      normal: body.right,
    },
    {
      distance: body.halfWidth + rawAcross,
      along: rawAlong,
      across: -body.halfWidth,
      normal: { x: -body.right.x, z: -body.right.z },
    },
  ].sort((left, right) => {
    const distanceDelta = left.distance - right.distance;
    if (Math.abs(distanceDelta) > 1e-7) {
      return distanceDelta;
    }
    return dot(entryVelocity, left.normal) - dot(entryVelocity, right.normal);
  });
  const face = faces[0]!;
  return {
    point: offsetPoint(
      body.center,
      body.forward,
      face.along,
      body.right,
      face.across,
    ),
    normal: face.normal,
  };
}

function offsetPoint(
  center: CollisionVector,
  forward: CollisionVector,
  forwardScale: number,
  right: CollisionVector,
  rightScale: number,
): CollisionVector {
  return {
    x: center.x + forward.x * forwardScale + right.x * rightScale,
    z: center.z + forward.z * forwardScale + right.z * rightScale,
  };
}

function obbContactPoint(
  left: VehicleBodyBounds,
  right: VehicleBodyBounds,
): CollisionVector | undefined {
  let polygon = [...left.corners];
  for (let index = 0; index < right.corners.length; index += 1) {
    const start = right.corners[index];
    const end = right.corners[(index + 1) % right.corners.length];
    if (start === undefined || end === undefined) {
      continue;
    }
    polygon = clipPolygon(polygon, start, end);
    if (polygon.length === 0) {
      return undefined;
    }
  }
  return averagePoint(polygon);
}

function bodyGap(left: VehicleBodyBounds, right: VehicleBodyBounds): number {
  if (obbContactPoint(left, right) !== undefined) {
    return 0;
  }
  let nearest = Number.POSITIVE_INFINITY;
  const measure = (
    points: readonly CollisionVector[],
    polygon: readonly CollisionVector[],
  ): void => {
    for (const point of points) {
      for (let index = 0; index < polygon.length; index += 1) {
        const start = polygon[index];
        const end = polygon[(index + 1) % polygon.length];
        if (start === undefined || end === undefined) {
          continue;
        }
        nearest = Math.min(nearest, pointSegmentDistance(point, start, end));
      }
    }
  };
  measure(left.corners, right.corners);
  measure(right.corners, left.corners);
  return nearest;
}

function pointSegmentDistance(
  point: CollisionVector,
  start: CollisionVector,
  end: CollisionVector,
): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-12) {
    return Math.hypot(point.x - start.x, point.z - start.z);
  }
  const progress = clamp(
    ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared,
    0,
    1,
  );
  return Math.hypot(
    point.x - (start.x + dx * progress),
    point.z - (start.z + dz * progress),
  );
}

function clipPolygon(
  polygon: readonly CollisionVector[],
  edgeStart: CollisionVector,
  edgeEnd: CollisionVector,
): CollisionVector[] {
  const output: CollisionVector[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const currentInside = leftOfEdge(current, edgeStart, edgeEnd) >= -1e-7;
    const previousInside = leftOfEdge(previous, edgeStart, edgeEnd) >= -1e-7;
    if (currentInside !== previousInside) {
      const intersection = segmentLineIntersection(
        previous,
        current,
        edgeStart,
        edgeEnd,
      );
      if (intersection !== undefined) {
        output.push(intersection);
      }
    }
    if (currentInside) {
      output.push(current);
    }
  }
  return output;
}

function leftOfEdge(
  point: CollisionVector,
  start: CollisionVector,
  end: CollisionVector,
): number {
  return (
    (end.x - start.x) * (point.z - start.z) -
    (end.z - start.z) * (point.x - start.x)
  );
}

function segmentLineIntersection(
  from: CollisionVector,
  to: CollisionVector,
  edgeStart: CollisionVector,
  edgeEnd: CollisionVector,
): CollisionVector | undefined {
  const segment = { x: to.x - from.x, z: to.z - from.z };
  const edge = { x: edgeEnd.x - edgeStart.x, z: edgeEnd.z - edgeStart.z };
  const denominator = segment.x * edge.z - segment.z * edge.x;
  if (Math.abs(denominator) < 1e-8) {
    return undefined;
  }
  const delta = { x: edgeStart.x - from.x, z: edgeStart.z - from.z };
  const t = (delta.x * edge.z - delta.z * edge.x) / denominator;
  return {
    x: from.x + segment.x * t,
    z: from.z + segment.z * t,
  };
}

export function vehicleMassKg(vehicle: Pick<Vehicle, "id" | "type">): number {
  const range = MASS_RANGE_KG[vehicleClass(vehicle.type)];
  const unit = stableUnit(`${vehicle.type}:${vehicle.id}`);
  return Math.round(range[0] + (range[1] - range[0]) * unit);
}

function vehicleMass(vehicle: Vehicle): number {
  return vehicleMassKg(vehicle);
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function pointForResource(
  resourceId: string,
  network: RoadNetwork,
): CollisionVector | undefined {
  const space = /^SPACE:(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/.exec(resourceId);
  if (space !== null) {
    return { x: Number(space[1]), z: Number(space[2]) };
  }
  for (const crosswalk of network.crosswalks.values()) {
    const cell = crosswalk.cells.find(
      (candidate) => candidate.conflictResourceId === resourceId,
    );
    if (cell !== undefined) {
      return { x: cell.x, z: cell.y };
    }
  }
  return undefined;
}

function pedestrianPoint(
  pedestrian: Pedestrian,
  network: RoadNetwork,
): CollisionVector | undefined {
  const crosswalk = network.crosswalks.get(pedestrian.crosswalkId);
  const cell = crosswalk?.cells.find(
    (candidate) =>
      candidate.column === pedestrian.column && candidate.row === pedestrian.row,
  );
  return cell === undefined ? undefined : { x: cell.x, z: cell.y };
}

function pedestrianVelocity(
  pedestrian: Pedestrian,
  network: RoadNetwork,
): CollisionVector {
  const crosswalk = network.crosswalks.get(pedestrian.crosswalkId);
  const cells = (crosswalk?.cells ?? [])
    .filter((cell) => cell.row === pedestrian.row)
    .sort((left, right) => left.column - right.column);
  if (pedestrian.direction === "B_TO_A") {
    cells.reverse();
  }
  const index = cells.findIndex(
    (cell) => cell.column === pedestrian.column,
  );
  if (index < 0) {
    return { x: 0, z: 0 };
  }
  const current = cells[index]!;
  const next = cells[index + 1];
  const previous = cells[index - 1];
  const vector =
    next !== undefined
      ? { x: next.x - current.x, z: next.y - current.y }
      : previous !== undefined
        ? { x: current.x - previous.x, z: current.y - previous.y }
        : { x: 0, z: 0 };
  return normalized(vector) ?? { x: 0, z: 0 };
}

function vehicleHazardResources(
  pose: { readonly x: number; readonly z: number; readonly heading: number },
  dimensions: { readonly length: number; readonly width: number },
): string[] {
  const resources = new Set<string>();
  const forward = {
    x: Math.sin(pose.heading),
    z: Math.cos(pose.heading),
  };
  const right = { x: forward.z, z: -forward.x };
  const center = {
    x: pose.x - forward.x * dimensions.length * 0.5,
    z: pose.z - forward.z * dimensions.length * 0.5,
  };
  const radius = Math.ceil(Math.hypot(dimensions.length, dimensions.width) / 2);
  for (
    let x = Math.floor(center.x) - radius;
    x <= Math.ceil(center.x) + radius;
    x += 1
  ) {
    for (
      let z = Math.floor(center.z) - radius;
      z <= Math.ceil(center.z) + radius;
      z += 1
    ) {
      const delta = { x: x - center.x, z: z - center.z };
      const along = Math.abs(delta.x * forward.x + delta.z * forward.z);
      const across = Math.abs(delta.x * right.x + delta.z * right.z);
      if (
        along <= dimensions.length / 2 + 0.5 &&
        across <= dimensions.width / 2 + 0.5
      ) {
        resources.add(`SPACE:${x}:${z}`);
      }
    }
  }
  return [...resources].sort();
}

function sweptHazardResources(
  start: CollisionVector,
  rest: CollisionVector,
): string[] {
  const resources = new Set<string>();
  const distance = Math.hypot(rest.x - start.x, rest.z - start.z);
  const steps = Math.max(1, Math.ceil(distance * 4));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    resources.add(
      `SPACE:${Math.round(start.x + (rest.x - start.x) * progress)}:${Math.round(
        start.z + (rest.z - start.z) * progress,
      )}`,
    );
  }
  return [...resources].sort();
}

function averagePoint(points: readonly PointLike[]): CollisionVector {
  if (points.length === 0) {
    return { x: 0, z: 0 };
  }
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  };
}

interface PointLike {
  readonly x: number;
  readonly z: number;
}

function normalized(vector: CollisionVector): CollisionVector | undefined {
  const length = magnitude(vector);
  return length < 1e-6
    ? undefined
    : { x: vector.x / length, z: vector.z / length };
}

function magnitude(vector: CollisionVector): number {
  return Math.hypot(vector.x, vector.z);
}

function dot(left: CollisionVector, right: CollisionVector): number {
  return left.x * right.x + left.z * right.z;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
