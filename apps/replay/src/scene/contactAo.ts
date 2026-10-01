const MIN_AO = 0.4;
const POSITION_QUANT = 1000;

/**
 * Per-vertex ambient occlusion for hard-edged building meshes.
 * Creases are found by welding vertices that share a position, so split
 * glTF normals still darken eaves and corners. The result multiplies both
 * direct and indirect light in the material.
 */
export function computeContactAo(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint32Array | null,
): Float32Array {
  const vertexCount = Math.floor(positions.length / 3);
  const ao = new Float32Array(vertexCount);
  if (vertexCount === 0) {
    return ao;
  }

  const cornerCount = indices === null ? vertexCount : indices.length;
  const triCount = Math.floor(cornerCount / 3);
  const corner = (offset: number): number =>
    indices === null ? offset : (indices[offset] ?? 0);

  const faceNormalX = new Float32Array(triCount);
  const faceNormalY = new Float32Array(triCount);
  const faceNormalZ = new Float32Array(triCount);
  let minY = Infinity;
  let maxY = -Infinity;

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const y = positions[vertex * 3 + 1] ?? 0;
    if (y < minY) {
      minY = y;
    }
    if (y > maxY) {
      maxY = y;
    }
  }
  const height = Math.max(maxY - minY, 1e-4);

  for (let tri = 0; tri < triCount; tri += 1) {
    const ia = corner(tri * 3);
    const ib = corner(tri * 3 + 1);
    const ic = corner(tri * 3 + 2);
    const ax = positions[ia * 3] ?? 0;
    const ay = positions[ia * 3 + 1] ?? 0;
    const az = positions[ia * 3 + 2] ?? 0;
    const abx = (positions[ib * 3] ?? 0) - ax;
    const aby = (positions[ib * 3 + 1] ?? 0) - ay;
    const abz = (positions[ib * 3 + 2] ?? 0) - az;
    const acx = (positions[ic * 3] ?? 0) - ax;
    const acy = (positions[ic * 3 + 1] ?? 0) - ay;
    const acz = (positions[ic * 3 + 2] ?? 0) - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-8) {
      ny = 1;
      nx = 0;
      nz = 0;
    } else {
      nx /= length;
      ny /= length;
      nz /= length;
    }
    faceNormalX[tri] = nx;
    faceNormalY[tri] = ny;
    faceNormalZ[tri] = nz;
  }

  const crease = new Float32Array(vertexCount);
  const weld = new Map<string, number[]>();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const key = positionKey(positions, vertex);
    const list = weld.get(key);
    if (list === undefined) {
      weld.set(key, [vertex]);
    } else {
      list.push(vertex);
    }
  }
  const darken = (vertex: number, amount: number): void => {
    const list = weld.get(positionKey(positions, vertex));
    if (list === undefined) {
      return;
    }
    for (const index of list) {
      crease[index] = (crease[index] ?? 0) + amount;
    }
  };
  const edges = new Map<string, { tri: number; from: number; to: number }>();
  const rememberEdge = (from: number, to: number, tri: number): void => {
    const fromKey = positionKey(positions, from);
    const toKey = positionKey(positions, to);
    const key = fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
    const existing = edges.get(key);
    if (existing === undefined) {
      edges.set(key, { tri, from, to });
      return;
    }
    const amount = concaveAngle(
      positions,
      faceNormalX,
      faceNormalY,
      faceNormalZ,
      existing,
      tri,
    );
    if (amount > 0) {
      darken(existing.from, amount);
      darken(existing.to, amount);
    }
  };

  for (let tri = 0; tri < triCount; tri += 1) {
    const ia = corner(tri * 3);
    const ib = corner(tri * 3 + 1);
    const ic = corner(tri * 3 + 2);
    rememberEdge(ia, ib, tri);
    rememberEdge(ib, ic, tri);
    rememberEdge(ic, ia, tri);
  }

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const y = ((positions[vertex * 3 + 1] ?? 0) - minY) / height;
    const ground = Math.exp(-y * 10) * 0.28;
    const ny = normals[vertex * 3 + 1] ?? 1;
    const underside = ny < -0.2 ? (1 - smoothstep(-1, -0.2, ny)) * 0.22 : 0;
    const fold = Math.min(1, crease[vertex] ?? 0) * 0.55;
    const occlusion = Math.min(1, fold + ground + underside);
    ao[vertex] = 1 - occlusion * (1 - MIN_AO);
  }
  return ao;
}

function positionKey(positions: Float32Array, vertex: number): string {
  const x = Math.round((positions[vertex * 3] ?? 0) * POSITION_QUANT);
  const y = Math.round((positions[vertex * 3 + 1] ?? 0) * POSITION_QUANT);
  const z = Math.round((positions[vertex * 3 + 2] ?? 0) * POSITION_QUANT);
  return `${x}:${y}:${z}`;
}

function concaveAngle(
  positions: Float32Array,
  faceNormalX: Float32Array,
  faceNormalY: Float32Array,
  faceNormalZ: Float32Array,
  existing: { tri: number; from: number; to: number },
  tri: number,
): number {
  const n0x = faceNormalX[existing.tri] ?? 0;
  const n0y = faceNormalY[existing.tri] ?? 0;
  const n0z = faceNormalZ[existing.tri] ?? 0;
  const n1x = faceNormalX[tri] ?? 0;
  const n1y = faceNormalY[tri] ?? 0;
  const n1z = faceNormalZ[tri] ?? 0;
  const ex = (positions[existing.to * 3] ?? 0) - (positions[existing.from * 3] ?? 0);
  const ey = (positions[existing.to * 3 + 1] ?? 0) - (positions[existing.from * 3 + 1] ?? 0);
  const ez = (positions[existing.to * 3 + 2] ?? 0) - (positions[existing.from * 3 + 2] ?? 0);
  const length = Math.hypot(ex, ey, ez) || 1;
  const ux = ex / length;
  const uy = ey / length;
  const uz = ez / length;
  const cx = n0y * uz - n0z * uy;
  const cy = n0z * ux - n0x * uz;
  const cz = n0x * uy - n0y * ux;
  // Positive means the second face sits on the inside of the first: a concave fold.
  const convexity = cx * n1x + cy * n1y + cz * n1z;
  if (convexity <= 1e-4) {
    return 0;
  }
  const dot = Math.min(1, Math.max(-1, n0x * n1x + n0y * n1y + n0z * n1z));
  return Math.acos(dot) / Math.PI;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
