export interface CollisionPoint {
  readonly x: number;
  readonly z: number;
}

export interface VehicleCollisionBox {
  readonly center: CollisionPoint;
  readonly heading: number;
  readonly length: number;
  readonly width: number;
  readonly corners: readonly CollisionPoint[];
}

export interface VehicleCollisionPolygon {
  readonly center: CollisionPoint;
  readonly corners: readonly CollisionPoint[];
}

export interface VehicleBoxContact {
  /** Unit vector pointing from the first box toward the second box. */
  readonly normal: CollisionPoint;
  /** Positive overlap depth. Zero means touching without penetration. */
  readonly penetration: number;
  readonly point: CollisionPoint;
}

export function createVehicleCollisionBox(input: {
  readonly headX: number;
  readonly headZ: number;
  readonly heading: number;
  readonly length: number;
  readonly width: number;
}): VehicleCollisionBox {
  const forward = {
    x: Math.sin(input.heading),
    z: Math.cos(input.heading),
  };
  const right = { x: forward.z, z: -forward.x };
  const halfLength = input.length / 2;
  const halfWidth = input.width / 2;
  const center = {
    x: input.headX - forward.x * halfLength,
    z: input.headZ - forward.z * halfLength,
  };
  return {
    center,
    heading: input.heading,
    length: input.length,
    width: input.width,
    corners: [
      offset(center, forward, halfLength, right, halfWidth),
      offset(center, forward, halfLength, right, -halfWidth),
      offset(center, forward, -halfLength, right, -halfWidth),
      offset(center, forward, -halfLength, right, halfWidth),
    ],
  };
}

export function vehicleBoxContact(
  first: VehicleCollisionBox,
  second: VehicleCollisionBox,
  tolerance = 1e-4,
): VehicleBoxContact | undefined {
  return vehiclePolygonContact(first, second, tolerance);
}

export function createVehicleCollisionPolygon(
  localHull: readonly CollisionPoint[],
  pose: { readonly x: number; readonly z: number; readonly heading: number },
): VehicleCollisionPolygon {
  const sine = Math.sin(pose.heading);
  const cosine = Math.cos(pose.heading);
  const corners = localHull.map((point) => ({
    x: pose.x + point.x * cosine + point.z * sine,
    z: pose.z - point.x * sine + point.z * cosine,
  }));
  return { center: average(corners), corners };
}

export function vehiclePolygonContact(
  first: VehicleCollisionPolygon,
  second: VehicleCollisionPolygon,
  tolerance = 1e-4,
): VehicleBoxContact | undefined {
  const axes = [...polygonAxes(first.corners), ...polygonAxes(second.corners)];
  let bestSeparation = Number.NEGATIVE_INFINITY;
  let bestAxis = axes[0] ?? { x: 1, z: 0 };
  for (const candidate of axes) {
    const firstRange = project(first.corners, candidate);
    const secondRange = project(second.corners, candidate);
    const separation = Math.max(
      secondRange.min - firstRange.max,
      firstRange.min - secondRange.max,
    );
    if (separation > tolerance) {
      return undefined;
    }
    if (separation > bestSeparation) {
      bestSeparation = separation;
      bestAxis = candidate;
    }
  }
  const centerDelta = {
    x: second.center.x - first.center.x,
    z: second.center.z - first.center.z,
  };
  const normal =
    dot(centerDelta, bestAxis) < 0
      ? { x: -bestAxis.x, z: -bestAxis.z }
      : bestAxis;
  const polygon = intersectPolygons(first.corners, second.corners);
  const point =
    polygon.length > 0
      ? average(polygon)
      : average([
          support(first.corners, normal),
          support(second.corners, { x: -normal.x, z: -normal.z }),
        ]);
  return {
    normal,
    penetration: Math.max(0, -bestSeparation),
    point,
  };
}

export function convexHull(
  points: readonly CollisionPoint[],
): CollisionPoint[] {
  const sorted = [...points].sort((left, right) =>
    left.x === right.x ? left.z - right.z : left.x - right.x,
  );
  if (sorted.length <= 2) {
    return sorted;
  }
  const lower: CollisionPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower.at(-2)!, lower.at(-1)!, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: CollisionPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    if (point === undefined) {
      continue;
    }
    while (
      upper.length >= 2 &&
      cross(upper.at(-2)!, upper.at(-1)!, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function separateVehicleBoxes(input: {
  readonly first: VehicleCollisionBox;
  readonly second: VehicleCollisionBox;
  readonly firstMass: number;
  readonly secondMass: number;
}): {
  readonly firstOffset: CollisionPoint;
  readonly secondOffset: CollisionPoint;
  readonly contact: VehicleBoxContact;
} | undefined {
  const contact = vehicleBoxContact(input.first, input.second);
  if (contact === undefined) {
    return undefined;
  }
  const firstInverseMass = 1 / Math.max(1, input.firstMass);
  const secondInverseMass = 1 / Math.max(1, input.secondMass);
  const totalInverseMass = firstInverseMass + secondInverseMass;
  const correction = contact.penetration + 0.002;
  const firstShare = firstInverseMass / totalInverseMass;
  const secondShare = secondInverseMass / totalInverseMass;
  return {
    firstOffset: {
      x: -contact.normal.x * correction * firstShare,
      z: -contact.normal.z * correction * firstShare,
    },
    secondOffset: {
      x: contact.normal.x * correction * secondShare,
      z: contact.normal.z * correction * secondShare,
    },
    contact,
  };
}

export function separateVehiclePolygons(input: {
  readonly first: VehicleCollisionPolygon;
  readonly second: VehicleCollisionPolygon;
  readonly firstMass: number;
  readonly secondMass: number;
}): ReturnType<typeof separateVehicleBoxes> {
  const contact = vehiclePolygonContact(input.first, input.second);
  if (contact === undefined) {
    return undefined;
  }
  const firstInverseMass = 1 / Math.max(1, input.firstMass);
  const secondInverseMass = 1 / Math.max(1, input.secondMass);
  const totalInverseMass = firstInverseMass + secondInverseMass;
  const correction = contact.penetration + 0.002;
  return {
    firstOffset: {
      x:
        -contact.normal.x *
        correction *
        (firstInverseMass / totalInverseMass),
      z:
        -contact.normal.z *
        correction *
        (firstInverseMass / totalInverseMass),
    },
    secondOffset: {
      x:
        contact.normal.x *
        correction *
        (secondInverseMass / totalInverseMass),
      z:
        contact.normal.z *
        correction *
        (secondInverseMass / totalInverseMass),
    },
    contact,
  };
}

function polygonAxes(corners: readonly CollisionPoint[]): CollisionPoint[] {
  const axes: CollisionPoint[] = [];
  for (let index = 0; index < corners.length; index += 1) {
    const start = corners[index];
    const end = corners[(index + 1) % corners.length];
    if (start === undefined || end === undefined) {
      continue;
    }
    const edge = { x: end.x - start.x, z: end.z - start.z };
    const length = Math.hypot(edge.x, edge.z);
    if (length > 1e-8) {
      axes.push({ x: -edge.z / length, z: edge.x / length });
    }
  }
  return axes;
}

function cross(
  origin: CollisionPoint,
  left: CollisionPoint,
  right: CollisionPoint,
): number {
  return (
    (left.x - origin.x) * (right.z - origin.z) -
    (left.z - origin.z) * (right.x - origin.x)
  );
}

function offset(
  center: CollisionPoint,
  forward: CollisionPoint,
  forwardScale: number,
  right: CollisionPoint,
  rightScale: number,
): CollisionPoint {
  return {
    x: center.x + forward.x * forwardScale + right.x * rightScale,
    z: center.z + forward.z * forwardScale + right.z * rightScale,
  };
}

function project(
  corners: readonly CollisionPoint[],
  axis: CollisionPoint,
): { readonly min: number; readonly max: number } {
  const values = corners.map((corner) => dot(corner, axis));
  return { min: Math.min(...values), max: Math.max(...values) };
}

function support(
  corners: readonly CollisionPoint[],
  axis: CollisionPoint,
): CollisionPoint {
  return corners.reduce((best, candidate) =>
    dot(candidate, axis) > dot(best, axis) ? candidate : best,
  );
}

function dot(left: CollisionPoint, right: CollisionPoint): number {
  return left.x * right.x + left.z * right.z;
}

function intersectPolygons(
  subject: readonly CollisionPoint[],
  clip: readonly CollisionPoint[],
): CollisionPoint[] {
  let polygon = [...subject];
  for (let index = 0; index < clip.length; index += 1) {
    const start = clip[index];
    const end = clip[(index + 1) % clip.length];
    if (start === undefined || end === undefined) {
      continue;
    }
    polygon = clipPolygon(polygon, start, end);
  }
  return polygon;
}

function clipPolygon(
  polygon: readonly CollisionPoint[],
  edgeStart: CollisionPoint,
  edgeEnd: CollisionPoint,
): CollisionPoint[] {
  const output: CollisionPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    if (current === undefined || previous === undefined) {
      continue;
    }
    const currentInside = edgeSide(current, edgeStart, edgeEnd) >= -1e-7;
    const previousInside = edgeSide(previous, edgeStart, edgeEnd) >= -1e-7;
    if (currentInside !== previousInside) {
      const intersection = lineIntersection(
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

function edgeSide(
  point: CollisionPoint,
  start: CollisionPoint,
  end: CollisionPoint,
): number {
  return (
    (end.x - start.x) * (point.z - start.z) -
    (end.z - start.z) * (point.x - start.x)
  );
}

function lineIntersection(
  from: CollisionPoint,
  to: CollisionPoint,
  edgeStart: CollisionPoint,
  edgeEnd: CollisionPoint,
): CollisionPoint | undefined {
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

function average(points: readonly CollisionPoint[]): CollisionPoint {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  };
}
