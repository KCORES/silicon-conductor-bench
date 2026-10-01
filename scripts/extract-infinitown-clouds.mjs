import { readFileSync, writeFileSync } from "node:fs";
import { BufferGeometry, BufferAttribute, Matrix4 } from "../apps/replay/node_modules/three/build/three.module.js";

const bin = readFileSync(
  "assets/3d-models/infinitown/assets/scenes/data/main.bin",
);
const json = JSON.parse(
  readFileSync("assets/3d-models/infinitown/assets/scenes/main.json", "utf8"),
);
const geometryOrder = [
  "89C04C2C-3562-4497-A80D-87B7C47B2FC0",
  "F56A261D-23FE-4A75-BC23-FEE3A9F7DF76",
];
const byId = new Map(json.geometries.map((entry) => [entry.uuid, entry]));

function readGeometry(uuid) {
  const data = byId.get(uuid);
  const geometry = new BufferGeometry();
  for (const [key, range] of Object.entries(data.offsets)) {
    const start = range[0];
    const end = range[1] + 1;
    const slice = bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + end);
    if (key === "index") {
      geometry.setIndex(new BufferAttribute(new Uint32Array(slice), 1));
    } else if (key === "position" || key === "normal") {
      geometry.setAttribute(key, new BufferAttribute(new Float32Array(slice), 3));
    }
  }
  return geometry;
}

function packGeometry(geometry) {
  const index = geometry.getIndex().array;
  const position = geometry.getAttribute("position").array;
  const normal = geometry.getAttribute("normal").array;
  const indexBytes = index.length * 2;
  const padding = (4 - (indexBytes % 4)) % 4;
  const header = 8;
  const bytes = new Uint8Array(header + indexBytes + padding + position.byteLength + normal.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, position.length / 3, true);
  view.setUint32(4, index.length, true);
  const indices = new Uint16Array(bytes.buffer, header, index.length);
  for (let i = 0; i < index.length; i += 1) {
    if (index[i] > 0xffff) {
      throw new Error(`Cloud index ${index[i]} does not fit in uint16`);
    }
    indices[i] = index[i];
  }
  let offset = header + indexBytes + padding;
  new Float32Array(bytes.buffer, offset, position.length).set(position);
  offset += position.byteLength;
  new Float32Array(bytes.buffer, offset, normal.length).set(normal);
  return Buffer.from(bytes).toString("base64");
}

const payloads = geometryOrder.map((uuid) => packGeometry(readGeometry(uuid)));
const clouds = json.object.children.find((child) => child.name === "clouds");
const prefabs = clouds.children.map((child) => ({
  geometryIndex: geometryOrder.indexOf(child.geometry),
  matrix: child.matrix,
}));

const source = `// Generated from Infinitown assets/scenes/main.json cloud meshes. Do not edit by hand.
import * as THREE from "three";

export interface InfinitownCloudPrefab {
  readonly geometryIndex: number;
  readonly matrix: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ];
}

export const INFINITOWN_CLOUD_PREFABS = ${JSON.stringify(prefabs, null, 2)} as readonly InfinitownCloudPrefab[];

const CLOUD_GEOMETRY_BASE64 = ${JSON.stringify(payloads, null, 2)};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function geometryFromPayload(payload: string): THREE.BufferGeometry {
  const bytes = decodeBase64(payload);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertexCount = view.getUint32(0, true);
  const indexCount = view.getUint32(4, true);
  const indexBytes = indexCount * 2;
  const padding = (4 - (indexBytes % 4)) % 4;
  const indexOffset = 8;
  const positionOffset = indexOffset + indexBytes + padding;
  const normalOffset = positionOffset + vertexCount * 12;
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(
    new THREE.BufferAttribute(new Uint16Array(bytes.buffer, bytes.byteOffset + indexOffset, indexCount), 1),
  );
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(bytes.buffer, bytes.byteOffset + positionOffset, vertexCount * 3), 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(bytes.buffer, bytes.byteOffset + normalOffset, vertexCount * 3), 3),
  );
  return geometry;
}

let geometries: THREE.BufferGeometry[] | undefined;

export function infinitownCloudGeometries(): readonly THREE.BufferGeometry[] {
  geometries ??= CLOUD_GEOMETRY_BASE64.map((payload) => geometryFromPayload(payload));
  return geometries;
}

export function infinitownCloudPrefabMatrix(matrix: InfinitownCloudPrefab["matrix"]): THREE.Matrix4 {
  return new THREE.Matrix4().fromArray(matrix);
}
`;

writeFileSync("apps/replay/src/scene/infinitownCloudGeometry.generated.ts", source);
const check = new Matrix4();
console.log(
  "prefabs",
  prefabs.length,
  "payloads",
  payloads.map((value) => value.length),
  "sample",
  check.fromArray(prefabs[0].matrix).elements[0],
);
