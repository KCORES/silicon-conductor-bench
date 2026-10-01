import * as THREE from "three";

export type TrafficSignalAxis = "EW" | "NS";
export type TrafficSignalColor = "red" | "yellow" | "green";
export type TrafficSignalPhase =
  | "EW_GREEN"
  | "EW_YELLOW"
  | "ALL_RED"
  | "NS_GREEN";

export const TRAFFIC_SIGNAL_LENSES = {
  red: { x: -0.665, y: 0.93, z: 0.094 },
  yellow: { x: -0.665, y: 0.865, z: 0.094 },
  green: { x: -0.665, y: 0.8, z: 0.094 },
} as const;

const LENS_COLORS: Readonly<Record<TrafficSignalColor, number>> = {
  red: 0xff3b30,
  yellow: 0xffc400,
  green: 0x25e36f,
};
const LENS_RADIUS = 0.021;
const GLOW_RADIUS = 0.033;

interface LampView {
  readonly face: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  readonly glow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
}

interface SignalView {
  readonly axis: TrafficSignalAxis;
  readonly root: THREE.Group;
  readonly lamps: Readonly<Record<TrafficSignalColor, LampView>>;
}

export class TrafficSignalController {
  private readonly signals: SignalView[] = [];

  add(root: THREE.Object3D, axis: TrafficSignalAxis): void {
    const signalRoot = new THREE.Group();
    signalRoot.name = `demo-traffic-signal-${axis.toLowerCase()}`;
    signalRoot.visible = false;
    const lamps = {
      red: createLamp("red"),
      yellow: createLamp("yellow"),
      green: createLamp("green"),
    };
    for (const color of ["red", "yellow", "green"] as const) {
      const lamp = lamps[color];
      const position = TRAFFIC_SIGNAL_LENSES[color];
      lamp.glow.position.set(position.x, position.y, position.z + 0.001);
      lamp.face.position.set(position.x, position.y, position.z + 0.002);
      signalRoot.add(lamp.glow, lamp.face);
    }
    root.add(signalRoot);
    this.signals.push({ axis, root: signalRoot, lamps });
  }

  setPhase(phase: TrafficSignalPhase | undefined): void {
    for (const signal of this.signals) {
      signal.root.visible = phase !== undefined;
      if (phase === undefined) {
        continue;
      }
      const active = signalColorForAxis(phase, signal.axis);
      for (const color of ["red", "yellow", "green"] as const) {
        const lit = color === active;
        const lamp = signal.lamps[color];
        lamp.face.material.color.setHex(
          lit ? LENS_COLORS[color] : dimColor(color),
        );
        lamp.face.material.opacity = lit ? 1 : 0.72;
        lamp.glow.visible = lit;
      }
    }
  }

  dispose(): void {
    for (const signal of this.signals) {
      for (const color of ["red", "yellow", "green"] as const) {
        const lamp = signal.lamps[color];
        lamp.face.geometry.dispose();
        lamp.face.material.dispose();
        lamp.glow.geometry.dispose();
        lamp.glow.material.dispose();
      }
      signal.root.removeFromParent();
    }
    this.signals.length = 0;
  }
}

export function signalColorForAxis(
  phase: TrafficSignalPhase,
  axis: TrafficSignalAxis,
): TrafficSignalColor {
  switch (phase) {
    case "EW_GREEN":
      return axis === "EW" ? "green" : "red";
    case "EW_YELLOW":
      return axis === "EW" ? "yellow" : "red";
    case "ALL_RED":
      return "red";
    case "NS_GREEN":
      return axis === "NS" ? "green" : "red";
  }
}

function createLamp(color: TrafficSignalColor): LampView {
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(LENS_RADIUS, 20),
    new THREE.MeshBasicMaterial({
      color: dimColor(color),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(GLOW_RADIUS, 24),
    new THREE.MeshBasicMaterial({
      color: LENS_COLORS[color],
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  glow.visible = false;
  return { face, glow };
}

function dimColor(color: TrafficSignalColor): number {
  switch (color) {
    case "red":
      return 0x4a1716;
    case "yellow":
      return 0x493d12;
    case "green":
      return 0x123d24;
  }
}
