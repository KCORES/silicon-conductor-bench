import type { VehicleState, VehicleViolation } from "../core/types.js";

export const STATUS_ICON_BASE = "/assets/status-icons";

export type AbnormalVehicleState =
  | "STALLED"
  | "ACCIDENT_STOPPED"
  | "EVACUATING"
  | "EXIT_BLOCKED";

export interface VehicleStatusBadge {
  readonly state: AbnormalVehicleState | VehicleViolation;
  readonly iconUrl: string;
  readonly color: string;
  readonly label: string;
}

const ABNORMAL_BADGES = {
  STALLED: {
    state: "STALLED",
    iconUrl: `${STATUS_ICON_BASE}/car-breakdown.svg`,
    color: "#e8a317",
    label: "抛锚",
  },
  ACCIDENT_STOPPED: {
    state: "ACCIDENT_STOPPED",
    iconUrl: `${STATUS_ICON_BASE}/car-crash.svg`,
    color: "#ff4d3d",
    label: "事故停车",
  },
  EVACUATING: {
    state: "EVACUATING",
    iconUrl: `${STATUS_ICON_BASE}/tow-truck.svg`,
    color: "#5ee0c8",
    label: "清障中",
  },
  EXIT_BLOCKED: {
    state: "EXIT_BLOCKED",
    iconUrl: `${STATUS_ICON_BASE}/road-block.svg`,
    color: "#ff8a1e",
    label: "出口受阻",
  },
} as const satisfies Record<AbnormalVehicleState, VehicleStatusBadge>;

const VIOLATION_BADGES = {
  RED_LIGHT: {
    state: "RED_LIGHT",
    iconUrl: `${STATUS_ICON_BASE}/traffic-light.svg`,
    color: "#ff2d6f",
    label: "闯红灯",
  },
  TAILGATE: {
    state: "TAILGATE",
    iconUrl: `${STATUS_ICON_BASE}/traffic-light.svg`,
    color: "#ff2d6f",
    label: "跟车闯入",
  },
  CUT_IN: {
    state: "CUT_IN",
    iconUrl: `${STATUS_ICON_BASE}/lane-cut.svg`,
    color: "#c58bff",
    label: "加塞",
  },
} as const satisfies Record<VehicleViolation, VehicleStatusBadge>;

/** Abnormal states win over driver violations; a violation badge lasts until the vehicle leaves. */
export function vehicleStatusBadge(
  state: VehicleState,
  violation?: VehicleViolation,
): VehicleStatusBadge | undefined {
  if (state in ABNORMAL_BADGES) {
    return ABNORMAL_BADGES[state as AbnormalVehicleState];
  }
  if (violation === undefined || state === "DESPAWNED") {
    return undefined;
  }
  return VIOLATION_BADGES[violation];
}

/** The score anchor stays up when either the bubble or an abnormal icon is showing. */
export function scoreAnchorVisible(
  scoreVisible: boolean,
  state: VehicleState,
  violation?: VehicleViolation,
): boolean {
  return scoreVisible || vehicleStatusBadge(state, violation) !== undefined;
}
