import * as THREE from "three";
import type { ReplayScene } from "@replay/types.js";
import {
  buildTrafficLogicGridIndex,
  type TrafficLogicCellKind,
  type TrafficLogicGridIndex,
} from "./trafficLogicGrid.js";
import {
  buildVisualLattice,
  crosswalkHalfCells,
  type CrosswalkHalfCell,
  type PaintedQuad,
  type VisualLattice,
  type VisualOccupancyFrame,
} from "./visualOccupancyGrid.js";

const ROAD_Y = 0.22;
const CROSSWALK_Y = 0.36;
const KIND_Y_STEP = 0.016;
const BORDER_LIFT = 0.006;
const CELL_COLORS: Readonly<Record<TrafficLogicCellKind, number>> = {
  idle: 0x5b7180,
  predicted: 0x16d9ff,
  actual: 0x4ff0a4,
  overlap: 0xd884ff,
  occupied: 0xff5a36,
};
const CELL_OPACITY: Readonly<Record<TrafficLogicCellKind, number>> = {
  idle: 0.5,
  predicted: 0.58,
  actual: 0.46,
  overlap: 0.74,
  occupied: 0.82,
};
const CELL_KINDS = Object.keys(CELL_COLORS) as TrafficLogicCellKind[];
/** Lowest layer first. Occupied stays above every other X-Ray color. */
const KIND_RANK: Readonly<Record<TrafficLogicCellKind, number>> = {
  idle: 0,
  actual: 1,
  predicted: 2,
  overlap: 3,
  occupied: 4,
};

interface KindMesh {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  readonly positions: Float32Array;
  readonly positionAttribute: THREE.BufferAttribute;
  readonly border: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly borderPositions: Float32Array;
  readonly borderAttribute: THREE.BufferAttribute;
}

export class TrafficLogicGridOverlay {
  readonly group = new THREE.Group();
  private readonly labels = new THREE.Group();
  private readonly pedestrianMarkerGeometry = new THREE.CapsuleGeometry(
    0.2,
    0.5,
    4,
    8,
  );
  private readonly road = new Map<TrafficLogicCellKind, KindMesh>();
  private readonly crosswalk = new Map<TrafficLogicCellKind, KindMesh>();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private index: TrafficLogicGridIndex | undefined;
  private lattice: VisualLattice | undefined;
  private halfCells: readonly CrosswalkHalfCell[] = [];
  private pedestrianMarkers:
    | THREE.InstancedMesh<THREE.CapsuleGeometry, THREE.MeshBasicMaterial>
    | undefined;
  private pedestrianMarkerCapacity = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = "traffic-logic-grid-overlay";
    this.group.userData.xRayExempt = true;
    this.group.visible = false;
    this.labels.name = "traffic-logic-cell-id-labels";
    this.labels.visible = false;
    this.group.add(this.labels);
    scene.add(this.group);
  }

  rebuild(scene: ReplayScene | undefined): TrafficLogicGridIndex | undefined {
    this.clearMeshes();
    this.index =
      scene === undefined ? undefined : buildTrafficLogicGridIndex(scene);
    this.lattice = scene === undefined ? undefined : buildVisualLattice(scene);
    this.halfCells = scene === undefined ? [] : crosswalkHalfCells(scene);
    const roadCapacity = this.lattice?.cells.length ?? 0;
    const crosswalkCapacity = this.halfCells.length;
    if (roadCapacity === 0 && crosswalkCapacity === 0) {
      return this.index;
    }
    this.allocateLayer(this.road, "road", roadCapacity, 10);
    this.allocateLayer(this.crosswalk, "crosswalk", crosswalkCapacity, 30);
    this.allocatePedestrianMarkers(Math.max(crosswalkCapacity, 1));
    this.rebuildLabels();
    return this.index;
  }

  private allocatePedestrianMarkers(capacity: number): void {
    if (this.pedestrianMarkers !== undefined) {
      this.group.remove(this.pedestrianMarkers);
      this.pedestrianMarkers.material.dispose();
    }
    const pedestrianMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb33c,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      depthWrite: false,
    });
    this.pedestrianMarkers = new THREE.InstancedMesh(
      this.pedestrianMarkerGeometry,
      pedestrianMaterial,
      capacity,
    );
    this.pedestrianMarkerCapacity = capacity;
    this.pedestrianMarkers.name = "traffic-logic-pedestrian-markers";
    this.pedestrianMarkers.count = 0;
    this.pedestrianMarkers.frustumCulled = false;
    this.pedestrianMarkers.renderOrder = 60;
    this.group.add(this.pedestrianMarkers);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  setLabelsVisible(visible: boolean): void {
    this.labels.visible = visible;
  }

  update(frame: VisualOccupancyFrame | undefined): void {
    if (frame === undefined || !this.group.visible) {
      return;
    }
    this.writeLayer(this.road, frame.road, ROAD_Y);
    this.writeLayer(this.crosswalk, frame.crosswalk, CROSSWALK_Y);
    if (frame.markers.length > this.pedestrianMarkerCapacity) {
      let capacity = Math.max(this.pedestrianMarkerCapacity, 1);
      while (capacity < frame.markers.length) {
        capacity *= 2;
      }
      this.allocatePedestrianMarkers(capacity);
    }
    if (this.pedestrianMarkers === undefined) {
      return;
    }
    const markerCount = Math.min(
      frame.markers.length,
      this.pedestrianMarkers.instanceMatrix.count,
    );
    for (let index = 0; index < markerCount; index += 1) {
      const marker = frame.markers[index];
      if (marker === undefined) {
        continue;
      }
      this.position.set(marker.x, 0.62, marker.z);
      this.rotation.identity();
      this.scale.set(1, 1, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.pedestrianMarkers.setMatrixAt(index, this.matrix);
    }
    this.pedestrianMarkers.count = markerCount;
    this.pedestrianMarkers.instanceMatrix.needsUpdate = true;
  }

  get gridIndex(): TrafficLogicGridIndex | undefined {
    return this.index;
  }

  get visualLattice(): VisualLattice | undefined {
    return this.lattice;
  }

  get crosswalkCells(): readonly CrosswalkHalfCell[] {
    return this.halfCells;
  }

  dispose(): void {
    this.clearMeshes();
    this.pedestrianMarkerGeometry.dispose();
    this.group.removeFromParent();
  }

  private allocateLayer(
    target: Map<TrafficLogicCellKind, KindMesh>,
    name: string,
    capacity: number,
    renderOrder: number,
  ): void {
    if (capacity === 0) {
      return;
    }
    for (const kind of CELL_KINDS) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(capacity * 4 * 3);
      const indices = new Uint32Array(capacity * 6);
      for (let cell = 0; cell < capacity; cell += 1) {
        const vertex = cell * 4;
        const index = cell * 6;
        indices[index] = vertex;
        indices[index + 1] = vertex + 1;
        indices[index + 2] = vertex + 2;
        indices[index + 3] = vertex;
        indices[index + 4] = vertex + 2;
        indices[index + 5] = vertex + 3;
      }
      const positionAttribute = new THREE.BufferAttribute(positions, 3);
      geometry.setAttribute("position", positionAttribute);
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.setDrawRange(0, 0);
      const borderGeometry = new THREE.BufferGeometry();
      const borderPositions = new Float32Array(capacity * 8 * 3);
      const borderAttribute = new THREE.BufferAttribute(borderPositions, 3);
      borderGeometry.setAttribute("position", borderAttribute);
      borderGeometry.setDrawRange(0, 0);
      const rank = KIND_RANK[kind];
      const material = new THREE.MeshBasicMaterial({
        color: CELL_COLORS[kind],
        transparent: true,
        opacity: CELL_OPACITY[kind],
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -6,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `traffic-logic-grid-${name}-${kind}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder + rank * 2;
      const border = new THREE.LineSegments(
        borderGeometry,
        new THREE.LineBasicMaterial({
          color: 0xe7eef6,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          depthTest: true,
        }),
      );
      border.name = `traffic-logic-grid-${name}-${kind}-border`;
      border.frustumCulled = false;
      border.renderOrder = mesh.renderOrder + 1;
      target.set(kind, {
        mesh,
        positions,
        positionAttribute,
        border,
        borderPositions,
        borderAttribute,
      });
      this.group.add(mesh);
      this.group.add(border);
    }
  }

  private writeLayer(
    target: Map<TrafficLogicCellKind, KindMesh>,
    quads: readonly PaintedQuad[],
    y: number,
  ): void {
    const counts = new Map<TrafficLogicCellKind, number>(
      CELL_KINDS.map((kind) => [kind, 0]),
    );
    for (const quad of quads) {
      const bucket = target.get(quad.kind);
      const index = counts.get(quad.kind) ?? 0;
      if (bucket === undefined) {
        continue;
      }
      const height = y + KIND_RANK[quad.kind] * KIND_Y_STEP;
      for (const [cornerIndex, corner] of quad.corners.entries()) {
        const offset = (index * 4 + cornerIndex) * 3;
        bucket.positions[offset] = corner.x;
        bucket.positions[offset + 1] = height;
        bucket.positions[offset + 2] = corner.z;
      }
      writeBorder(bucket.borderPositions, index, quad.corners, height + BORDER_LIFT);
      counts.set(quad.kind, index + 1);
    }
    for (const kind of CELL_KINDS) {
      const bucket = target.get(kind);
      if (bucket === undefined) {
        continue;
      }
      const count = counts.get(kind) ?? 0;
      bucket.positionAttribute.needsUpdate = true;
      bucket.mesh.geometry.setDrawRange(0, count * 6);
      bucket.borderAttribute.needsUpdate = true;
      bucket.border.geometry.setDrawRange(0, count * 8);
    }
  }

  private clearMeshes(): void {
    for (const bucket of [...this.road.values(), ...this.crosswalk.values()]) {
      this.group.remove(bucket.mesh);
      this.group.remove(bucket.border);
      bucket.mesh.geometry.dispose();
      bucket.mesh.material.dispose();
      bucket.border.geometry.dispose();
      bucket.border.material.dispose();
    }
    this.road.clear();
    this.crosswalk.clear();
    for (const child of [...this.labels.children]) {
      this.labels.remove(child);
      if (child instanceof THREE.Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
    }
    this.lattice = undefined;
    this.halfCells = [];
    if (this.pedestrianMarkers !== undefined) {
      this.group.remove(this.pedestrianMarkers);
      this.pedestrianMarkers.material.dispose();
      this.pedestrianMarkers = undefined;
    }
    this.pedestrianMarkerCapacity = 0;
  }

  private rebuildLabels(): void {
    for (const cell of this.lattice?.cells ?? []) {
      this.labels.add(
        createCellIdLabel(cell.key, cell.center.x, cell.center.z, false),
      );
    }
    for (const cell of this.halfCells) {
      this.labels.add(
        createCellIdLabel(cell.key, cell.center.x, cell.center.z, true),
      );
    }
  }
}

function createCellIdLabel(
  key: string,
  x: number,
  z: number,
  crosswalk: boolean,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = crosswalk ? 256 : 128;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `700 ${crosswalk ? 13 : 18}px ui-monospace, monospace`;
    context.lineWidth = 5;
    context.strokeStyle = "rgba(5, 12, 16, 0.98)";
    context.fillStyle = crosswalk ? "#8ff8e5" : "#f4fbff";
    const displayedId = compactCellId(key);
    context.strokeText(displayedId, canvas.width / 2, canvas.height / 2);
    context.fillText(displayedId, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  label.name = `traffic-cell-id:${key}`;
  label.position.set(x, CROSSWALK_Y + 0.14, z);
  label.scale.set(crosswalk ? 2.1 : 1.15, crosswalk ? 0.27 : 0.25, 1);
  label.renderOrder = 80;
  label.frustumCulled = true;
  return label;
}

function compactCellId(key: string): string {
  const parts = key.split(":");
  if (parts[0] === "CROSSWALK" && parts.length === 4) {
    return `CW-${parts[1]?.[0] ?? "?"}-${parts[2]}-${parts[3]}`;
  }
  if (parts[0] === "WAITING" && parts.length === 6) {
    const direction = parts[2] === "A_TO_B" ? "A2B" : "B2A";
    return `W-${parts[1]?.[0] ?? "?"}-${direction}-${parts[4]}-${parts[5]}`;
  }
  if (parts[0] === "CORNER" && parts[2] === "CELL") {
    return `${parts[3]}:${parts[4]}`;
  }
  if (parts[0] === "CORNER" && parts[2] === "ENTRY") {
    return `E-${parts[3]}:${parts[4]}`;
  }
  return key;
}

function writeBorder(
  positions: Float32Array,
  index: number,
  corners: PaintedQuad["corners"],
  y: number,
): void {
  const pairs = [0, 1, 1, 2, 2, 3, 3, 0] as const;
  for (const [pairIndex, cornerIndex] of pairs.entries()) {
    const corner = corners[cornerIndex];
    if (corner === undefined) {
      continue;
    }
    const offset = (index * 8 + pairIndex) * 3;
    positions[offset] = corner.x;
    positions[offset + 1] = y;
    positions[offset + 2] = corner.z;
  }
}
