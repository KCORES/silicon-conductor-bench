import * as THREE from "three";
import type { ReplayDryRunPayload, ReplayScene } from "@replay/types.js";
import { mapSimulationPoint } from "./roadFrame.js";
import { turnCurve } from "./turnPath.js";

const FLOW_COLOR = 0x5ee0c8;
const CONFLICT_COLOR = 0xff4d3d;
/** Lifted off the road so ribbons do not z-fight the asphalt. */
const DECISION_LINE_Y = 0.42;

export type DecisionLineStyle = "dashed" | "solid";

export class DecisionVisualizer {
  private readonly group = new THREE.Group();
  private readonly ribbons: Array<THREE.Mesh | THREE.Line> = [];
  private readonly directionArrows: THREE.Mesh[] = [];
  private readonly markers: THREE.Mesh[] = [];
  private pulse = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = "decision-visualizer";
    this.scene.add(this.group);
  }

  clear(): void {
    for (const mesh of [
      ...this.ribbons,
      ...this.directionArrows,
      ...this.markers,
    ]) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        for (const item of material) {
          item.dispose();
        }
      } else {
        material.dispose();
      }
    }
    this.ribbons.length = 0;
    this.directionArrows.length = 0;
    this.markers.length = 0;
  }

  showRoutes(
    routeIds: readonly string[],
    style: DecisionLineStyle,
    replayScene: ReplayScene,
    conflict?: ReplayDryRunPayload["conflict"],
  ): void {
    this.clear();
    const seen = new Set<string>();
    for (const routeId of routeIds) {
      if (seen.has(routeId)) {
        continue;
      }
      seen.add(routeId);
      const trajectory = replayScene.trajectories.find((item) => item.id === routeId);
      if (trajectory === undefined || trajectory.slots.length < 2) {
        continue;
      }
      const curve = turnCurve(trajectory);
      const points =
        curve === undefined
          ? straightPoints(trajectory.slots)
          : curve.getSpacedPoints(64);
      const ribbon =
        style === "dashed"
          ? this.createDashedRibbon(points)
          : curve === undefined
            ? this.createRibbon(trajectory.slots)
            : this.createCurveRibbon(curve);
      this.ribbons.push(...(Array.isArray(ribbon) ? ribbon : [ribbon]));
      const arrow = this.createDirectionArrow(routeId, points, style);
      if (arrow !== undefined) {
        this.directionArrows.push(arrow);
      }
    }

    if (conflict !== undefined) {
      this.markers.push(this.createConflictMarker(conflict.x, conflict.z));
    }
  }

  update(deltaSeconds: number): void {
    this.pulse += deltaSeconds * 4;
    const wave = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(this.pulse));
    for (const ribbon of this.ribbons) {
      const material = ribbon.material as THREE.MeshBasicMaterial;
      material.opacity = wave;
    }
    for (const arrow of this.directionArrows) {
      const material = arrow.material as THREE.MeshBasicMaterial;
      const baseOpacity =
        typeof arrow.userData.baseOpacity === "number"
          ? arrow.userData.baseOpacity
          : 0.9;
      material.opacity = Math.min(1, baseOpacity * (0.82 + wave * 0.18));
    }
    for (const marker of this.markers) {
      const material = marker.material as THREE.MeshBasicMaterial;
      material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.pulse * 2));
      marker.position.y = 1.4 + Math.sin(this.pulse * 2) * 0.15;
    }
  }

  private createCurveRibbon(curve: THREE.Curve<THREE.Vector3>): THREE.Mesh {
    const geometry = new THREE.TubeGeometry(curve, 48, 0.18, 6, false);
    const material = new THREE.MeshBasicMaterial({
      color: FLOW_COLOR,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = DECISION_LINE_Y;
    this.group.add(mesh);
    return mesh;
  }

  private createRibbon(slots: readonly { x: number; z: number }[]): THREE.Mesh {
    const points = slots.map((slot, index) => {
      const mapped = mapSimulationPoint(
        slot.x,
        slot.z,
        slotHeading(slots, index),
      );
      return new THREE.Vector3(mapped.x, DECISION_LINE_Y, mapped.z);
    });
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.1);
    const geometry = new THREE.TubeGeometry(curve, 48, 0.18, 6, false);
    const material = new THREE.MeshBasicMaterial({
      color: FLOW_COLOR,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.group.add(mesh);
    return mesh;
  }

  private createDashedRibbon(points: readonly THREE.Vector3[]): THREE.Mesh[] {
    const raised = points.map(
      (point) => new THREE.Vector3(point.x, DECISION_LINE_Y, point.z),
    );
    const meshes: THREE.Mesh[] = [];
    const dashLength = 1.15;
    const gapLength = 0.62;
    let drawing = true;
    let remainingPhase = dashLength;
    let segment: THREE.Vector3[] = [];
    const flush = (): void => {
      if (segment.length < 2) {
        segment = [];
        return;
      }
      const curve = new THREE.CatmullRomCurve3(segment);
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.max(2, segment.length), 0.16, 5, false),
        new THREE.MeshBasicMaterial({
          color: FLOW_COLOR,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }),
      );
      this.group.add(mesh);
      meshes.push(mesh);
      segment = [];
    };
    for (let index = 1; index < raised.length; index += 1) {
      const from = raised[index - 1];
      const to = raised[index];
      if (from === undefined || to === undefined) {
        continue;
      }
      let left = from.distanceTo(to);
      let cursor = from.clone();
      while (left > 1e-4) {
        const step = Math.min(left, remainingPhase);
        const next = cursor.clone().lerp(to, step / Math.max(left, 1e-6));
        if (drawing) {
          if (segment.length === 0) {
            segment.push(cursor.clone());
          }
          segment.push(next.clone());
        }
        cursor = next;
        left -= step;
        remainingPhase -= step;
        if (remainingPhase <= 1e-4) {
          if (drawing) {
            flush();
          }
          drawing = !drawing;
          remainingPhase = drawing ? dashLength : gapLength;
        }
      }
    }
    if (drawing) {
      flush();
    }
    return meshes;
  }

  private createDirectionArrow(
    routeId: string,
    points: readonly THREE.Vector3[],
    style: DecisionLineStyle,
  ): THREE.Mesh | undefined {
    const finish = points.at(-1);
    if (finish === undefined) {
      return undefined;
    }
    let previousIndex = points.length - 2;
    let tangent: THREE.Vector3 | undefined;
    while (previousIndex >= 0) {
      const previous = points[previousIndex];
      if (previous !== undefined) {
        const candidate = finish.clone().sub(previous);
        if (candidate.lengthSq() > 1e-6) {
          tangent = candidate.normalize();
          break;
        }
      }
      previousIndex -= 1;
    }
    if (tangent === undefined) {
      return undefined;
    }

    const height = 1.35;
    const baseOpacity = style === "dashed" ? 0.78 : 0.96;
    const geometry = new THREE.ConeGeometry(0.42, height, 8);
    const material = new THREE.MeshBasicMaterial({
      color: FLOW_COLOR,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: -5,
    });
    const arrow = new THREE.Mesh(geometry, material);
    arrow.name = `decision-direction-arrow:${routeId}`;
    arrow.userData.baseOpacity = baseOpacity;
    arrow.position
      .copy(finish)
      .addScaledVector(tangent, -height * 0.42);
    arrow.position.y = DECISION_LINE_Y + 0.14;
    arrow.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tangent,
    );
    this.group.add(arrow);
    return arrow;
  }

  private createConflictMarker(x: number, z: number): THREE.Mesh {
    const geometry = new THREE.OctahedronGeometry(0.55, 0);
    const material = new THREE.MeshBasicMaterial({
      color: CONFLICT_COLOR,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const heading = Math.abs(z) >= Math.abs(x) ? 0 : Math.PI / 2;
    const mapped = mapSimulationPoint(x, z, heading);
    mesh.position.set(mapped.x, 1.4, mapped.z);
    this.group.add(mesh);
    return mesh;
  }
}

function straightPoints(
  slots: readonly { x: number; z: number }[],
): THREE.Vector3[] {
  return slots.map((slot, index) => {
    const mapped = mapSimulationPoint(slot.x, slot.z, slotHeading(slots, index));
    return new THREE.Vector3(mapped.x, 0, mapped.z);
  });
}

function slotHeading(
  slots: readonly { x: number; z: number }[],
  index: number,
): number {
  const current = slots[index];
  const next = slots[index + 1] ?? slots[index - 1];
  if (current === undefined || next === undefined || next === current) {
    return 0;
  }
  const forward = index + 1 < slots.length;
  const dx = forward ? next.x - current.x : current.x - next.x;
  const dz = forward ? next.z - current.z : current.z - next.z;
  if (dx * dx + dz * dz < 1e-8) {
    return 0;
  }
  return Math.atan2(dx, dz);
}
