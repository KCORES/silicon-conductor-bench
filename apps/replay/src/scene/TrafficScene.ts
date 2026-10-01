import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type {
  ReplayBundle,
  ReplayEvent,
  ReplayPedestrianPose,
  ReplayScene,
  ReplayVehiclePose,
} from "@replay/types.js";
import type { CollisionOutcome } from "../../../../src/core/types.js";
import {
  collisionAlignmentRetention,
  collisionOutcomeForVehicle,
  vehicleCollisionVisual,
} from "@replay/collisionVisual.js";
import { AccidentEffects } from "./AccidentEffects.js";
import { DecisionVisualizer } from "./DecisionVisualizer.js";
import { isDryRunPayload } from "../loadReplay.js";
import { BUILDING_CATALOG } from "./city/buildingCatalog.generated.js";
import { CityTileComposer } from "./city/CityTileComposer.js";
import { VEHICLE_CATALOG } from "./vehicleCatalog.generated.js";
import type { VehicleSpec } from "./vehicleTypes.js";
import { createVehicleGalleryLayout } from "./vehicleGalleryLayout.js";
import { findVehiclePaintConfig } from "./vehiclePaintConfig.js";
import { applyVehiclePaint } from "./vehiclePaintMaterial.js";
import { createRandomVehicleFleet } from "./randomVehicleFleet.js";
import {
  CITY_INNER_TILE,
  CITY_WORLD_EXTENT,
  TILE_SIZE,
  createCityLayout,
  type CityLayout,
} from "./city/cityLayout.js";
import {
  CONTROL_OUTWARD_SHIFT,
  createMainRoadMarkings,
  CROSSWALK_DISTANCE,
  ROAD_CORNER_CENTER,
  ROAD_CORNER_RADIUS,
  ROAD_HALF_WIDTH,
  ROAD_WIDTH,
  STOP_LINE_DISTANCE,
  type LaneArrowKind,
} from "./mainRoadMarkings.js";
import {
  distanceFromMapEdge,
  edgeFadeOpacity,
  mapSimulationPoint,
  mapSimulationPose,
} from "./roadFrame.js";
import { constrainTurnProgresses, TurnPathIndex } from "./turnPath.js";
import {
  applyContactAoMaterial,
  bakeGeometryContactAo,
} from "./contactAoMaterial.js";
import { CloudField } from "./cloudField.js";
import { CLOUD_ALTITUDE } from "./cloudMotion.js";
import { fitViewShadowFrustum } from "./shadowFrustum.js";
import {
  accidentAnchorResourceIds,
  readCollisionOutcomes,
  readAccidentPayload,
} from "@replay/accidentCues.js";
import {
  presentScoreBubble,
  scoreBubblePaintDue,
  type ScoreBubbleMemory,
  type ScoreBubbleView,
} from "@replay/score-bubble.js";
import { vehicleStatusBadge } from "@replay/vehicleStatus.js";
import {
  createInstancedMeshes,
  fitRootToHeight,
  placeTemplate,
  type InstanceBatch,
} from "./staticInstances.js";
import { TrafficLightBendController } from "./TrafficLightBend.js";
import {
  TrafficSignalController,
  type TrafficSignalPhase,
} from "./TrafficSignalController.js";
import { TrafficLogicGridOverlay } from "./TrafficLogicGridOverlay.js";
import {
  addPedestrianTrafficCellKeys,
  addVehicleTrafficCellKeys,
  buildTrafficLogicGridView,
  type TrafficLogicPrecision,
} from "./trafficLogicGrid.js";
import {
  paintVisualOccupancy,
  VISUAL_CELL_SIZE,
} from "./visualOccupancyGrid.js";
import { normalizeVehicleModelPivot } from "./vehicleModelPivot.js";
import {
  replayVehicleSpec,
  vehicleTemplateKey,
} from "./vehicleModelSpec.js";
import { PedestrianReplayLayer } from "./PedestrianReplayLayer.js";
import {
  createVehicleDamageController,
  type VehicleDamageController,
} from "./vehicleDamageMaterial.js";
import {
  convexHull,
  createVehicleCollisionPolygon,
  separateVehiclePolygons,
  vehiclePolygonContact,
  type CollisionPoint,
} from "./vehicleCollisionGeometry.js";

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const BACKGROUND_COLOR = 0x000000;
const FOG_NEAR = 225;
const FOG_FAR = 325;
const MAX_PIXEL_RATIO = 1.5;
const SUN_OFFSET = new THREE.Vector3(48, 86, 34);
const SUN_DISTANCE = SUN_OFFSET.length();
// Distance along the sun ray from a ground point up to a cloud, plus mesh thickness.
function cloudShadowCasterMargin(): number {
  const elevation = SUN_OFFSET.y / SUN_DISTANCE;
  return CLOUD_ALTITUDE / elevation + 16;
}
// Infinitown adds albedo * NdotL * intensity. MeshStandardMaterial divides by PI.
const INFINITOWN_SUN_INTENSITY = 1.25 * Math.PI;
const MODEL_BASE_URL = "/assets/replay-models";
const SIDEWALK_OUTER_EDGE = 7 * VISUAL_CELL_SIZE;
const SIDEWALK_CORNER_ARM_END = 10 * VISUAL_CELL_SIZE;
const CITY_ROAD_ASPHALT_COLOR = 0x60676c;
const BIKE_LANE_DIVIDER_OFFSET = 4 * VISUAL_CELL_SIZE;
const BIKE_LANE_DIVIDER_WIDTH = 0.08;

function shortestAngle(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  return ((((to - from) % twoPi) + Math.PI * 3) % twoPi) - Math.PI;
}

function accidentIntensity(
  severity: "MINOR" | "MODERATE" | "SERIOUS" | "CRITICAL" | undefined,
): number {
  return severity === "CRITICAL"
    ? 1
    : severity === "SERIOUS"
      ? 0.78
      : severity === "MODERATE"
        ? 0.52
        : 0.32;
}

function createInfinitownFill(): THREE.HemisphereLight {
  // Intensity is PI because MeshStandardMaterial divides diffuse by PI.
  // Sky is the env-probe upward lobe; ground is set so a vertical wall
  // averages to the probe's side irradiance (0.19, 0.24, 0.33).
  const fill = new THREE.HemisphereLight(0xffffff, 0xffffff, Math.PI);
  fill.color.setRGB(0.16, 0.24, 0.42);
  fill.groundColor.setRGB(0.22, 0.24, 0.24);
  return fill;
}
export type DebugSceneMode = "replay" | "catalog" | "randomFleet";

const REPLAY_SEDAN_SPEC = VEHICLE_CATALOG.find(
  (spec) => spec.id === "kenney-cars:sedan",
);

interface VehicleActor {
  readonly root: THREE.Object3D;
  readonly model: THREE.Object3D;
  readonly damage: VehicleDamageController;
  readonly halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly hazardLamps: readonly THREE.Mesh[];
  readonly scoreLabel: CSS2DObject;
  readonly scoreBubble: HTMLElement;
  readonly idLabel: CSS2DObject;
  readonly demoPenaltyLabel: CSS2DObject;
  readonly demoPenaltyBubble: HTMLElement;
  readonly statusIcon: HTMLElement;
  /** Distance from the rendered center back to the simulation head cell. */
  readonly centerOffset: number;
  edgeFade: number;
  hazardActive: boolean;
  scoreMemory: ScoreBubbleMemory | undefined;
  scorePaintedAtMs: number | null;
  scorePaintedVisible: boolean;
  scorePaintedTone: string | undefined;
  pendingScoreView: ScoreBubbleView | undefined;
  demoPenaltyStep: number;
  routeId: string;
  turnProgress: number | undefined;
  readonly visualHalfLength: number;
  readonly visualHalfWidth: number;
  readonly collisionHull: readonly CollisionPoint[];
  statusState: ReplayVehiclePose["state"] | undefined;
  statusViolation: ReplayVehiclePose["violation"];
  statusVisible: boolean;
  placedHeading: number;
  damageOutcomeTick: number | undefined;
}

function createHazardStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.clearRect(0, 0, 64, 64);
    context.fillStyle = "rgba(18, 14, 6, 0.55)";
    context.fillRect(0, 0, 64, 64);
    context.strokeStyle = "#ffcc00";
    context.lineWidth = 14;
    for (let offset = -64; offset <= 64; offset += 16) {
      context.beginPath();
      context.moveTo(offset, 64);
      context.lineTo(offset + 64, 0);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function modelCollisionHull(
  model: THREE.Object3D,
  bounds: THREE.Box3,
): readonly CollisionPoint[] {
  model.updateMatrixWorld(true);
  const unique = new Map<string, CollisionPoint>();
  const point = new THREE.Vector3();
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const positions = child.geometry.getAttribute("position");
    if (!(positions instanceof THREE.BufferAttribute)) {
      return;
    }
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
      const key = `${Math.round(point.x * 100)}:${Math.round(point.z * 100)}`;
      unique.set(key, { x: point.x, z: point.z });
    }
  });
  const hull = convexHull([...unique.values()]);
  if (hull.length >= 3) {
    return hull;
  }
  return [
    { x: bounds.min.x, z: bounds.min.z },
    { x: bounds.max.x, z: bounds.min.z },
    { x: bounds.max.x, z: bounds.max.z },
    { x: bounds.min.x, z: bounds.max.z },
  ];
}

export class TrafficScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  private readonly labelRenderer: CSS2DRenderer;
  private readonly scene = new THREE.Scene();
  private readonly controls: OrbitControls;
  private readonly vehicles = new Map<string, VehicleActor>();
  private readonly loader = new GLTFLoader();
  private readonly templates = new Map<string, THREE.Object3D>();
  private readonly trafficLightBend = new TrafficLightBendController();
  private readonly trafficSignals = new TrafficSignalController();
  private readonly trafficLogicGrid: TrafficLogicGridOverlay;
  private readonly pedestrians: PedestrianReplayLayer;
  private readonly reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  private readonly vehicleGallery = new THREE.Group();
  private readonly randomFleet = new THREE.Group();
  private readonly sun = new THREE.DirectionalLight(0xfff5da, INFINITOWN_SUN_INTENSITY);
  private readonly visualizer: DecisionVisualizer;
  private readonly accidents: AccidentEffects;
  private readonly fromQuat = new THREE.Quaternion();
  private readonly toQuat = new THREE.Quaternion();
  private readonly scratchQuat = new THREE.Quaternion();
  private readonly scratchForward = new THREE.Vector3();
  private readonly replayCameraPosition = new THREE.Vector3();
  private readonly replayCameraTarget = new THREE.Vector3();
  private readonly pedestrianCameraPosition = new THREE.Vector3();
  private readonly pedestrianCameraTarget = new THREE.Vector3();
  private demoCameraMode: "pedestrian" | "collision" | undefined;
  private fallbackWarned = false;
  private scorePaintTimer: number | undefined;
  private hazardPhase = 0;
  private readonly hazardZones = new THREE.Group();
  private readonly hazardPads: THREE.Mesh[] = [];
  private readonly hazardMaterial: THREE.MeshBasicMaterial;
  private vehicleGalleryReady = false;
  private debugMode: DebugSceneMode = "replay";
  private randomFleetSeed = Number.NaN;
  private scoreBubblesVisible = true;
  private clouds: CloudField | undefined;
  private turnPaths = TurnPathIndex.empty();
  private xRayMode = false;
  private xRayVehicleIdsVisible = false;
  private xRayPedestrianIdsVisible = false;
  private readonly wireframeStates = new Map<
    THREE.Material & { wireframe: boolean },
    boolean
  >();
  private trafficLogicBundle: ReplayBundle | undefined;
  private collisionBundle: ReplayBundle | undefined;
  private collisionOutcomes: readonly CollisionOutcome[] = [];
  private readonly visualCollisionContacts = new Map<
    string,
    {
      readonly firstId: string;
      readonly secondId: string;
      readonly point: CollisionPoint;
      readonly normal: CollisionPoint;
    }
  >();
  private readonly settledCollisionOffsets = new Map<
    string,
    {
      readonly firstId: string;
      readonly secondId: string;
      readonly firstOffset: CollisionPoint;
      readonly secondOffset: CollisionPoint;
    }
  >();
  private readonly collisionAlignmentAdvances = new Map<
    string,
    {
      readonly first: CollisionPoint;
      readonly second: CollisionPoint;
    }
  >();
  private trafficLogicHistoryFrame = -1;
  private readonly trafficLogicHistory = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(BACKGROUND_COLOR, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.5, 360);
    this.camera.position.set(105, 112, 108);
    this.camera.lookAt(0, 2, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.minDistance = 24;
    this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minPolarAngle = 0.35;
    this.controls.target.set(0, 2, 0);

    this.scene.fog = new THREE.Fog(BACKGROUND_COLOR, FOG_NEAR, FOG_FAR);
    this.scene.add(createInfinitownFill());
    this.sun.position.copy(SUN_OFFSET);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 1;
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.01;
    this.sun.shadow.camera.near = 40;
    this.sun.shadow.camera.far = 220;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.visualizer = new DecisionVisualizer(this.scene);
    this.accidents = new AccidentEffects(this.scene);
    this.trafficLogicGrid = new TrafficLogicGridOverlay(this.scene);
    this.pedestrians = new PedestrianReplayLayer(this.scene);
    this.hazardMaterial = new THREE.MeshBasicMaterial({
      map: createHazardStripeTexture(),
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.hazardZones.name = "hazard-zones";
    this.scene.add(this.hazardZones);
    this.vehicleGallery.name = "debug-vehicle-gallery";
    this.vehicleGallery.visible = false;
    this.randomFleet.name = "debug-random-fleet";
    this.randomFleet.visible = false;
    this.scene.add(this.vehicleGallery);
    this.scene.add(this.randomFleet);
    const scoreLayer = document.createElement("div");
    scoreLayer.className = "score-layer";
    this.labelRenderer = new CSS2DRenderer({ element: scoreLayer });
    canvas.parentElement?.append(scoreLayer);
    this.resize();
  }

  async loadWorld(): Promise<void> {
    const layout = createCityLayout();
    await Promise.all([
      this.cacheTemplate("sedan", `${MODEL_BASE_URL}/cars/sedan.glb`),
      this.cacheTemplate("moto", `${MODEL_BASE_URL}/cars/kart-oobi.glb`),
      ...VEHICLE_CATALOG.map((spec) =>
        this.cacheTemplate(vehicleTemplateKey(spec), spec.assetPath),
      ),
      this.cacheTemplate(
        "kay-road-straight",
        `${MODEL_BASE_URL}/city-builder/gltf/road_straight.gltf`,
      ),
      this.cacheTemplate(
        "kay-road-crossing",
        `${MODEL_BASE_URL}/city-builder/gltf/road_straight_crossing.gltf`,
      ),
      this.cacheTemplate(
        "kay-road-corner",
        `${MODEL_BASE_URL}/city-builder/gltf/road_corner_curved.gltf`,
      ),
      this.cacheTemplate(
        "kay-road-tsplit",
        `${MODEL_BASE_URL}/city-builder/gltf/road_tsplit.gltf`,
      ),
      this.cacheTemplate(
        "kay-road-junction",
        `${MODEL_BASE_URL}/city-builder/gltf/road_junction.gltf`,
      ),
      this.cacheTemplate(
        "kay-streetlight",
        `${MODEL_BASE_URL}/city-builder/gltf/streetlight.gltf`,
      ),
      this.cacheTemplate(
        "kay-trafficlight",
        `${MODEL_BASE_URL}/city-builder/gltf/trafficlight_C.gltf`,
      ),
      this.cacheTemplate(
        "kay-firehydrant",
        `${MODEL_BASE_URL}/city-builder/gltf/firehydrant.gltf`,
      ),
      this.cacheTemplate(
        "kay-dumpster",
        `${MODEL_BASE_URL}/city-builder/gltf/dumpster.gltf`,
      ),
    ]);
    const usedTemplateKeys = new Set(
      layout.buildingTiles.map((building) => building.templateKey),
    );
    await Promise.all(
      BUILDING_CATALOG.filter((spec) =>
        usedTemplateKeys.has(spec.templateKey),
      ).map((spec) => this.cacheTemplate(spec.templateKey, spec.assetPath)),
    );
    for (const [key, template] of this.templates) {
      if (key.startsWith("building:")) {
        this.prepareTexturedModel(template, { contactAo: true, castShadow: true });
      } else if (key.startsWith("kay-")) {
        this.prepareTexturedModel(template, { contactAo: false, castShadow: false });
      }
    }
    this.configureLayoutView(layout);
    this.composeStaticCity(layout);
  }

  applyVehicles(
    vehicles: readonly ReplayVehiclePose[],
    highlights: ReadonlyMap<string, number>,
  ): void {
    if (this.debugMode !== "replay") {
      this.syncHazardZones([]);
      for (const actor of this.vehicles.values()) {
        actor.scoreLabel.visible = false;
        actor.demoPenaltyLabel.visible = false;
      }
      return;
    }
    const seen = new Set<string>();
    for (const pose of vehicles) {
      seen.add(pose.id);
      const actor = this.vehicles.get(pose.id) ?? this.spawnVehicle(pose);
      actor.routeId = pose.routeId;
      this.placeReplayActor(actor, pose.x, pose.z, pose.heading, pose.routeId);
      this.syncStatusIcon(actor, pose);
      const hazard =
        pose.state === "ACCIDENT_STOPPED" ||
        pose.state === "EVACUATING" ||
        pose.state === "STALLED";
      actor.hazardActive = hazard;
      this.syncScoreBubble(actor, pose);
      const rogue = pose.violation === "RED_LIGHT" || pose.violation === "TAILGATE";
      const color = hazard
        ? 0xffb000
        : (highlights.get(pose.id) ?? (rogue ? 0xff2d6f : 0xffffff));
      actor.halo.visible = hazard || color !== 0xffffff;
      actor.halo.material.color.setHex(color);
    }
    this.syncHazardZones(vehicles);
    for (const [id, actor] of this.vehicles) {
      if (!seen.has(id)) {
        this.removeVehicleActor(actor);
        this.vehicles.delete(id);
      }
    }
  }

  applyCollisionVisuals(
    bundle: ReplayBundle,
    logicalTick: number,
    vehicles: readonly ReplayVehiclePose[],
  ): void {
    if (this.collisionBundle !== bundle) {
      this.collisionBundle = bundle;
      this.visualCollisionContacts.clear();
      this.settledCollisionOffsets.clear();
      this.collisionAlignmentAdvances.clear();
      this.collisionOutcomes = bundle.events.flatMap((event) =>
        event.kind === "ACCIDENT" || event.kind === "SECONDARY_ACCIDENT"
          ? readCollisionOutcomes(event.payload)
          : [],
      );
    }
    for (const pose of vehicles) {
      const actor = this.vehicles.get(pose.id);
      const match = collisionOutcomeForVehicle(
        this.collisionOutcomes.filter(
          (outcome) => outcome.impactTick <= logicalTick,
        ),
        pose.id,
      );
      if (actor === undefined) {
        continue;
      }
      if (match === undefined) {
        actor.root.visible = true;
        if (actor.damageOutcomeTick !== undefined) {
          actor.damage.clearDamage();
          actor.damageOutcomeTick = undefined;
        }
        continue;
      }
      actor.root.visible = pose.state !== "OUTBOUND";
      if (!actor.root.visible) {
        continue;
      }
      if (pose.state === "ACCIDENT_STOPPED") {
        const smokeStartTick =
          match.outcome.impactTick + match.participant.slideTicks;
        actor.damage.setSmoke(
          logicalTick < smokeStartTick
            ? undefined
            : ((logicalTick - smokeStartTick) * bundle.tickDurationMs) / 1_000,
        );
        const visual = vehicleCollisionVisual(
          match.outcome,
          match.participant,
          this.reducedMotion
            ? Math.max(
                logicalTick,
                match.outcome.impactTick + match.participant.slideTicks,
              )
            : logicalTick,
        );
        const heading =
          pose.heading +
          shortestAngle(pose.heading, match.participant.restPose.heading) *
            visual.yawProgress;
        const mapped = mapSimulationPose(
          pose.x + visual.x,
          pose.z + visual.z,
          heading,
        );
        this.placeVisualActor(actor, mapped.x, mapped.z, mapped.heading);
        actor.root.rotateX(visual.pitch);
      } else if (pose.state === "EVACUATING") {
        const mapped = mapSimulationPose(
          match.participant.restPose.x,
          match.participant.restPose.z,
          match.participant.restPose.heading,
        );
        this.placeVisualActor(actor, mapped.x, mapped.z, mapped.heading);
        actor.damage.setSmoke(
          ((logicalTick - match.outcome.impactTick) * bundle.tickDurationMs) /
            1_000,
        );
      } else {
        actor.damage.setSmoke(undefined);
      }
    }
    this.alignUpcomingCollision(logicalTick);
    this.retainCollisionAlignment(logicalTick, vehicles);
    this.separateAccidentVehicles(logicalTick);
    this.applyVehicleCollisionDamage(logicalTick, vehicles);
    this.pedestrians.applyCollisionVisuals(
      this.collisionOutcomes,
      logicalTick,
      this.reducedMotion,
    );
  }

  private alignUpcomingCollision(logicalTick: number): void {
    for (const outcome of this.collisionOutcomes) {
      if (
        outcome.vehicles.length < 2 ||
        logicalTick < outcome.impactTick - 3 ||
        logicalTick > outcome.impactTick
      ) {
        continue;
      }
      this.alignCollisionPair(outcome);
    }
  }

  private alignCollisionPair(outcome: CollisionOutcome): void {
    const firstOutcome = outcome.vehicles[0];
    const secondOutcome = outcome.vehicles[1];
    const first =
      firstOutcome === undefined
        ? undefined
        : this.vehicles.get(firstOutcome.vehicleId);
    const second =
      secondOutcome === undefined
        ? undefined
        : this.vehicles.get(secondOutcome.vehicleId);
    if (
      firstOutcome === undefined ||
      secondOutcome === undefined ||
      first === undefined ||
      second === undefined
    ) {
      return;
    }
    const firstStart = first.root.position.clone();
    const secondStart = second.root.position.clone();
    const firstForward = new THREE.Vector3(
      Math.sin(first.placedHeading),
      0,
      Math.cos(first.placedHeading),
    );
    const secondForward = new THREE.Vector3(
      Math.sin(second.placedHeading),
      0,
      Math.cos(second.placedHeading),
    );
    const key = this.collisionContactKey(
      outcome,
      firstOutcome.vehicleId,
      secondOutcome.vehicleId,
    );
    const cachedAdvance = this.collisionAlignmentAdvances.get(key);
    if (cachedAdvance !== undefined) {
      first.root.position.x += cachedAdvance.first.x;
      first.root.position.z += cachedAdvance.first.z;
      second.root.position.x += cachedAdvance.second.x;
      second.root.position.z += cachedAdvance.second.z;
      this.captureVisualContact(
        outcome,
        firstOutcome,
        secondOutcome,
        first,
        second,
      );
      return;
    }
    const maxAdvance =
      first.visualHalfWidth +
      second.visualHalfWidth +
      Math.min(first.visualHalfLength, second.visualHalfLength);
    const step = maxAdvance / 180;
    let found = false;
    for (let distance = 0; distance <= maxAdvance; distance += step) {
      first.root.position.copy(firstStart).addScaledVector(firstForward, distance);
      second.root.position
        .copy(secondStart)
        .addScaledVector(secondForward, distance);
      const contact = vehiclePolygonContact(
        this.collisionPolygonForActor(first),
        this.collisionPolygonForActor(second),
        0.006,
      );
      if (contact === undefined) {
        continue;
      }
      this.collisionAlignmentAdvances.set(key, {
        first: {
          x: firstForward.x * distance,
          z: firstForward.z * distance,
        },
        second: {
          x: secondForward.x * distance,
          z: secondForward.z * distance,
        },
      });
      this.captureVisualContact(
        outcome,
        firstOutcome,
        secondOutcome,
        first,
        second,
      );
      found = true;
      break;
    }
    if (!found) {
      first.root.position.copy(firstStart);
      second.root.position.copy(secondStart);
    }
  }

  private retainCollisionAlignment(
    logicalTick: number,
    vehicles: readonly ReplayVehiclePose[],
  ): void {
    const poses = new Map(vehicles.map((pose) => [pose.id, pose]));
    for (const outcome of this.collisionOutcomes) {
      if (logicalTick <= outcome.impactTick || outcome.vehicles.length < 2) {
        continue;
      }
      for (let leftIndex = 0; leftIndex < outcome.vehicles.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < outcome.vehicles.length;
          rightIndex += 1
        ) {
          const leftOutcome = outcome.vehicles[leftIndex];
          const rightOutcome = outcome.vehicles[rightIndex];
          if (leftOutcome === undefined || rightOutcome === undefined) {
            continue;
          }
          const key = this.collisionContactKey(
            outcome,
            leftOutcome.vehicleId,
            rightOutcome.vehicleId,
          );
          const alignment = this.collisionAlignmentAdvances.get(key);
          if (alignment === undefined) {
            continue;
          }
          this.retainVehicleCollisionAlignment(
            leftOutcome.vehicleId,
            alignment.first,
            poses,
          );
          this.retainVehicleCollisionAlignment(
            rightOutcome.vehicleId,
            alignment.second,
            poses,
          );
        }
      }
    }
  }

  private retainVehicleCollisionAlignment(
    vehicleId: string,
    offset: CollisionPoint,
    poses: ReadonlyMap<string, ReplayVehiclePose>,
  ): void {
    const actor = this.vehicles.get(vehicleId);
    const pose = poses.get(vehicleId);
    if (actor === undefined || pose === undefined) {
      return;
    }
    const retention = collisionAlignmentRetention(pose.state);
    actor.root.position.x += offset.x * retention;
    actor.root.position.z += offset.z * retention;
  }

  private captureVisualContact(
    outcome: CollisionOutcome,
    firstOutcome: CollisionOutcome["vehicles"][number],
    secondOutcome: CollisionOutcome["vehicles"][number],
    first: VehicleActor,
    second: VehicleActor,
  ): void {
    const firstPolygon = this.collisionPolygonForActor(first);
    const secondPolygon = this.collisionPolygonForActor(second);
    const contact = vehiclePolygonContact(firstPolygon, secondPolygon, 0.006);
    if (contact === undefined) {
      return;
    }
    this.visualCollisionContacts.set(
      this.collisionContactKey(
        outcome,
        firstOutcome.vehicleId,
        secondOutcome.vehicleId,
      ),
      {
        firstId: firstOutcome.vehicleId,
        secondId: secondOutcome.vehicleId,
        point: contact.point,
        normal: contact.normal,
      },
    );
    const resolution = separateVehiclePolygons({
      first: firstPolygon,
      second: secondPolygon,
      firstMass: firstOutcome.massKg ?? 1_500,
      secondMass: secondOutcome.massKg ?? 1_500,
    });
    if (resolution === undefined) {
      return;
    }
    first.root.position.x += resolution.firstOffset.x;
    first.root.position.z += resolution.firstOffset.z;
    second.root.position.x += resolution.secondOffset.x;
    second.root.position.z += resolution.secondOffset.z;
  }

  private applyVehicleCollisionDamage(
    logicalTick: number,
    vehicles: readonly ReplayVehiclePose[],
  ): void {
    for (const pose of vehicles) {
      const actor = this.vehicles.get(pose.id);
      const match = collisionOutcomeForVehicle(
        this.collisionOutcomes.filter(
          (outcome) => outcome.impactTick <= logicalTick,
        ),
        pose.id,
      );
      if (
        actor === undefined ||
        match === undefined ||
        actor.damageOutcomeTick === match.outcome.impactTick
      ) {
        continue;
      }
      const pair = match.outcome.vehicles.find(
        (candidate) => candidate.vehicleId !== pose.id,
      );
      const cached =
        pair === undefined
          ? undefined
          : this.visualCollisionContacts.get(
              this.collisionContactKey(
                match.outcome,
                match.participant.vehicleId,
                pair.vehicleId,
              ),
            );
      const participantContact =
        match.participant.contactPoint ?? match.outcome.contactPoint;
      const fallbackContact =
        match.participant.visualContactPoint ??
        mapSimulationPose(
          participantContact.x,
          participantContact.z,
          pose.heading,
        );
      const contact = cached?.point ?? fallbackContact;
      const contactNormal =
        cached === undefined
          ? match.participant.contactNormal
          : cached.firstId === pose.id
            ? { x: -cached.normal.x, z: -cached.normal.z }
            : cached.normal;
      actor.root.updateMatrixWorld(true);
      const localContact = actor.root.worldToLocal(
        new THREE.Vector3(contact.x, actor.root.position.y, contact.z),
      );
      actor.damage.setDamage(
        match.participant.damageSeverity,
        contactNormal,
        match.participant.deformation,
        actor.placedHeading,
        {
          sphericalDent:
            match.participant.dentRadius !== undefined &&
            match.participant.dentDepth !== undefined,
          dentRadius: match.participant.dentRadius,
          dentDepth: match.participant.dentDepth,
          contactPointBody: { x: localContact.x, z: localContact.z },
        },
      );
      actor.damageOutcomeTick = match.outcome.impactTick;
    }
  }

  private separateAccidentVehicles(logicalTick: number): void {
    for (const outcome of this.collisionOutcomes) {
      if (outcome.impactTick > logicalTick || outcome.vehicles.length < 2) {
        continue;
      }
      for (let leftIndex = 0; leftIndex < outcome.vehicles.length; leftIndex += 1) {
        for (
          let rightIndex = leftIndex + 1;
          rightIndex < outcome.vehicles.length;
          rightIndex += 1
        ) {
          const leftOutcome = outcome.vehicles[leftIndex];
          const rightOutcome = outcome.vehicles[rightIndex];
          if (leftOutcome === undefined || rightOutcome === undefined) {
            continue;
          }
          const left = this.vehicles.get(leftOutcome.vehicleId);
          const right = this.vehicles.get(rightOutcome.vehicleId);
          if (left === undefined || right === undefined) {
            continue;
          }
          const key = this.collisionContactKey(
            outcome,
            leftOutcome.vehicleId,
            rightOutcome.vehicleId,
          );
          const settled =
            logicalTick >=
            outcome.impactTick +
              Math.max(leftOutcome.slideTicks, rightOutcome.slideTicks);
          const cachedOffset = settled
            ? this.settledCollisionOffsets.get(key)
            : undefined;
          if (cachedOffset !== undefined) {
            left.root.position.x += cachedOffset.firstOffset.x;
            left.root.position.z += cachedOffset.firstOffset.z;
            right.root.position.x += cachedOffset.secondOffset.x;
            right.root.position.z += cachedOffset.secondOffset.z;
            continue;
          }
          const resolution = separateVehiclePolygons({
            first: this.collisionPolygonForActor(left),
            second: this.collisionPolygonForActor(right),
            firstMass: leftOutcome.massKg ?? 1_500,
            secondMass: rightOutcome.massKg ?? 1_500,
          });
          if (resolution === undefined) {
            if (settled) {
              this.settledCollisionOffsets.set(key, {
                firstId: leftOutcome.vehicleId,
                secondId: rightOutcome.vehicleId,
                firstOffset: { x: 0, z: 0 },
                secondOffset: { x: 0, z: 0 },
              });
            }
            continue;
          }
          this.visualCollisionContacts.set(
            this.collisionContactKey(
              outcome,
              leftOutcome.vehicleId,
              rightOutcome.vehicleId,
            ),
            {
              firstId: leftOutcome.vehicleId,
              secondId: rightOutcome.vehicleId,
              point: resolution.contact.point,
              normal: resolution.contact.normal,
            },
          );
          left.root.position.x += resolution.firstOffset.x;
          left.root.position.z += resolution.firstOffset.z;
          right.root.position.x += resolution.secondOffset.x;
          right.root.position.z += resolution.secondOffset.z;
          if (settled) {
            this.settledCollisionOffsets.set(key, {
              firstId: leftOutcome.vehicleId,
              secondId: rightOutcome.vehicleId,
              firstOffset: resolution.firstOffset,
              secondOffset: resolution.secondOffset,
            });
          }
        }
      }
    }
  }

  private collisionPolygonForActor(actor: VehicleActor) {
    return createVehicleCollisionPolygon(actor.collisionHull, {
      x: actor.root.position.x,
      z: actor.root.position.z,
      heading: actor.placedHeading,
    });
  }

  private collisionContactKey(
    outcome: CollisionOutcome,
    firstId: string,
    secondId: string,
  ): string {
    return `${outcome.impactTick}:${outcome.resourceId}:${[firstId, secondId]
      .sort()
      .join("|")}`;
  }

  private syncHazardZones(vehicles: readonly ReplayVehiclePose[]): void {
    const cells: Array<{ x: number; z: number }> = [];
    const seen = new Set<string>();
    for (const pose of vehicles) {
      if (pose.state !== "ACCIDENT_STOPPED" && pose.state !== "EVACUATING") {
        continue;
      }
      for (const segment of pose.segments) {
        const key = `${segment.x.toFixed(2)}:${segment.z.toFixed(2)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        cells.push(mapSimulationPoint(segment.x, segment.z, pose.heading));
      }
    }
    while (this.hazardPads.length < cells.length) {
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(VISUAL_CELL_SIZE, VISUAL_CELL_SIZE),
        this.hazardMaterial,
      );
      pad.rotation.x = -Math.PI / 2;
      this.hazardZones.add(pad);
      this.hazardPads.push(pad);
    }
    for (let index = 0; index < this.hazardPads.length; index += 1) {
      const pad = this.hazardPads[index];
      const cell = cells[index];
      if (pad === undefined) {
        continue;
      }
      if (cell === undefined) {
        pad.visible = false;
        continue;
      }
      pad.visible = true;
      pad.position.set(cell.x, 0.08, cell.z);
    }
  }

  applyPedestrians(
    poses: readonly ReplayPedestrianPose[],
    logicalSeconds: number,
    walkingPedestrianIds?: ReadonlySet<string>,
    travelDistances?: ReadonlyMap<string, number>,
  ): void {
    if (this.debugMode !== "replay") {
      this.pedestrians.clear();
      return;
    }
    this.pedestrians.apply(
      poses,
      logicalSeconds,
      walkingPedestrianIds,
      travelDistances,
    );
    if (this.xRayMode) {
      this.applyWireframe(this.pedestrians.group);
    }
  }

  interpolatePedestrian(
    id: string,
    from: ReplayPedestrianPose,
    to: ReplayPedestrianPose,
    alpha: number,
  ): void {
    this.pedestrians.interpolate(id, from, to, alpha);
  }

  interpolateVehicle(
    id: string,
    from: ReplayVehiclePose,
    to: ReplayVehiclePose,
    alpha: number,
  ): void {
    const actor = this.vehicles.get(id);
    if (actor === undefined) {
      return;
    }
    const curved = this.turnPaths.interpolateVehicle(
      from,
      to,
      alpha,
      actor.visualHalfLength * 2,
    );
    if (curved !== undefined) {
      this.placeTurnActor(actor, curved);
      return;
    }
    this.fromQuat.setFromAxisAngle(Y_AXIS, from.heading);
    this.toQuat.setFromAxisAngle(Y_AXIS, to.heading);
    this.scratchQuat.slerpQuaternions(this.fromQuat, this.toQuat, alpha);
    this.scratchForward.set(0, 0, 1).applyQuaternion(this.scratchQuat);
    this.placeReplayActor(
      actor,
      from.x + (to.x - from.x) * alpha,
      from.z + (to.z - from.z) * alpha,
      Math.atan2(this.scratchForward.x, this.scratchForward.z),
    );
  }

  setReplayScene(scene: ReplayScene | undefined): void {
    this.clearReplayVehicles();
    this.collisionBundle = undefined;
    this.collisionOutcomes = [];
    this.visualCollisionContacts.clear();
    this.settledCollisionOffsets.clear();
    this.collisionAlignmentAdvances.clear();
    this.pedestrians.setReplayScene(scene);
    this.turnPaths =
      scene === undefined ? TurnPathIndex.empty() : TurnPathIndex.fromScene(scene);
    this.trafficLogicGrid.rebuild(scene);
    this.trafficLogicGrid.setVisible(
      this.xRayMode && this.debugMode === "replay" && scene !== undefined,
    );
    this.resetTrafficLogicHistory();
  }

  setXRayMode(enabled: boolean): void {
    if (this.xRayMode === enabled) {
      return;
    }
    this.xRayMode = enabled;
    for (const actor of this.vehicles.values()) {
      actor.idLabel.visible = enabled && this.xRayVehicleIdsVisible;
    }
    this.pedestrians.setIdLabelsVisible(
      enabled && this.xRayPedestrianIdsVisible,
    );
    this.trafficLogicGrid.setVisible(
      enabled &&
        this.debugMode === "replay" &&
        this.trafficLogicGrid.gridIndex !== undefined,
    );
    if (enabled) {
      this.applyWireframe(this.scene);
      return;
    }
    for (const [material, wireframe] of this.wireframeStates) {
      material.wireframe = wireframe;
      material.needsUpdate = true;
    }
    this.wireframeStates.clear();
  }

  setXRayCellIdsVisible(visible: boolean): void {
    this.trafficLogicGrid.setLabelsVisible(visible);
  }

  setXRayVehicleIdsVisible(visible: boolean): void {
    this.xRayVehicleIdsVisible = visible;
    for (const actor of this.vehicles.values()) {
      actor.idLabel.visible = this.xRayMode && visible;
    }
  }

  setXRayPedestrianIdsVisible(visible: boolean): void {
    this.xRayPedestrianIdsVisible = visible;
    this.pedestrians.setIdLabelsVisible(this.xRayMode && visible);
  }

  updateTrafficLogic(
    bundle: ReplayBundle,
    vehicles: readonly ReplayVehiclePose[],
    pedestrians: readonly ReplayPedestrianPose[],
    tick: number,
    activeEvent: ReplayEvent | undefined,
    frameIndex: number,
  ): TrafficLogicPrecision {
    const index = this.trafficLogicGrid.gridIndex;
    if (!this.xRayMode || index === undefined) {
      return "route-estimate";
    }
    if (
      this.trafficLogicBundle !== bundle ||
      frameIndex < this.trafficLogicHistoryFrame
    ) {
      this.resetTrafficLogicHistory();
      this.trafficLogicBundle = bundle;
    }
    for (
      let indexToAdd = this.trafficLogicHistoryFrame + 1;
      indexToAdd <= frameIndex;
      indexToAdd += 1
    ) {
      const frame = bundle.frames[indexToAdd];
      if (frame !== undefined) {
        addVehicleTrafficCellKeys(
          index,
          frame.vehicles,
          this.trafficLogicHistory,
        );
        addPedestrianTrafficCellKeys(
          index,
          frame.pedestrians ?? [],
          this.trafficLogicHistory,
        );
      }
      this.trafficLogicHistoryFrame = indexToAdd;
    }
    const view = buildTrafficLogicGridView({
      index,
      bundle,
      vehicles,
      pedestrians: [],
      tick,
      actualCellKeys: this.trafficLogicHistory,
      ...(activeEvent === undefined ? {} : { activeEvent }),
    });
    const lattice = this.trafficLogicGrid.visualLattice;
    if (lattice !== undefined) {
      this.trafficLogicGrid.update(
        paintVisualOccupancy({
          scene: bundle.scene,
          index,
          view,
          lattice,
          crosswalkCells: this.trafficLogicGrid.crosswalkCells,
          vehicles,
          pedestrians,
        }),
      );
    }
    return view.precision;
  }

  setScoreBubblesVisible(visible: boolean): void {
    this.scoreBubblesVisible = visible;
    this.pedestrians.setScoreBubblesVisible(visible);
    for (const actor of this.vehicles.values()) {
      actor.scoreBubble.hidden = !visible || !actor.scorePaintedVisible;
      actor.scoreLabel.visible =
        actor.statusVisible || (visible && actor.scorePaintedVisible);
    }
  }

  setDemoPenalty(vehicleId: string | undefined, amount: number): void {
    this.setDemoPenalties(
      vehicleId === undefined
        ? new Map()
        : new Map([[vehicleId, amount]]),
    );
  }

  setDemoPenalties(penalties: ReadonlyMap<string, number>): void {
    for (const [id, actor] of this.vehicles) {
      const absolute = Math.max(0, -(penalties.get(id) ?? 0));
      const visible = absolute > 0;
      actor.demoPenaltyLabel.visible = visible;
      actor.demoPenaltyBubble.hidden = !visible;
      if (!visible) {
        actor.demoPenaltyStep = -1;
        continue;
      }
      const nextStep = Math.floor(absolute / 10);
      actor.demoPenaltyBubble.textContent = `−${Math.floor(absolute).toLocaleString()}`;
      if (nextStep !== actor.demoPenaltyStep) {
        actor.demoPenaltyStep = nextStep;
        actor.demoPenaltyBubble.classList.remove("demo-penalty-pulse");
        void actor.demoPenaltyBubble.offsetWidth;
        actor.demoPenaltyBubble.classList.add("demo-penalty-pulse");
      }
    }
  }

  animateTrafficLightsBend(): void {
    this.trafficLightBend.bendAll();
  }

  resetTrafficLights(): void {
    this.trafficLightBend.resetAll();
  }

  setTrafficLightsBendProgress(progress: number): void {
    this.trafficLightBend.setProgress(progress);
  }

  setTrafficSignalPhase(phase: TrafficSignalPhase | undefined): void {
    this.trafficSignals.setPhase(phase);
  }

  setDemoCamera(mode: "pedestrian" | "collision" | undefined): void {
    if (mode === this.demoCameraMode) {
      return;
    }
    if (this.demoCameraMode === undefined && mode !== undefined) {
      this.pedestrianCameraPosition.copy(this.camera.position);
      this.pedestrianCameraTarget.copy(this.controls.target);
    }
    if (mode === "pedestrian") {
      this.camera.position.set(16, 12, 13);
      this.controls.target.set(0, 0.6, -CROSSWALK_DISTANCE);
    } else if (mode === "collision") {
      this.camera.position.set(0, 20, 15);
      this.controls.target.set(0, 0.8, 0);
    } else {
      this.camera.position.copy(this.pedestrianCameraPosition);
      this.controls.target.copy(this.pedestrianCameraTarget);
    }
    this.controls.update();
    this.demoCameraMode = mode;
  }

  private clearReplayVehicles(): void {
    if (this.scorePaintTimer !== undefined) {
      window.clearTimeout(this.scorePaintTimer);
      this.scorePaintTimer = undefined;
    }
    for (const actor of this.vehicles.values()) {
      this.removeVehicleActor(actor);
    }
    this.vehicles.clear();
  }

  private removeVehicleActor(actor: VehicleActor): void {
    actor.pendingScoreView = undefined;
    actor.scoreLabel.visible = false;
    actor.idLabel.visible = false;
    actor.demoPenaltyLabel.visible = false;
    // CSS2DObject only removes its DOM element when the label itself receives
    // the removed event; removing an ancestor group does not trigger it.
    actor.scoreLabel.removeFromParent();
    actor.idLabel.removeFromParent();
    actor.demoPenaltyLabel.removeFromParent();
    actor.damage.dispose();
    clearOwnedMaterials(actor.model);
    this.scene.remove(actor.root);
  }

  private placeReplayActor(
    actor: VehicleActor,
    x: number,
    z: number,
    heading: number,
    routeId?: string,
  ): void {
    const curved =
      routeId === undefined
        ? undefined
        : this.turnPaths.sampleVehicle(
            { routeId, x, z, heading },
            actor.visualHalfLength * 2,
          );
    if (curved !== undefined) {
      this.placeTurnActor(actor, curved);
      return;
    }
    const mapped = mapSimulationPose(x, z, heading);
    this.placeVisualActor(actor, mapped.x, mapped.z, mapped.heading);
  }

  private placeTurnActor(
    actor: VehicleActor,
    pose: { x: number; z: number; heading: number; progress: number },
  ): void {
    actor.turnProgress = pose.progress;
    this.placeCenteredVisualActor(actor, pose.x, pose.z, pose.heading);
  }

  private placeVisualActor(
    actor: VehicleActor,
    x: number,
    z: number,
    heading: number,
  ): void {
    actor.turnProgress = undefined;
    const half = actor.centerOffset;
    const placedX = x - Math.sin(heading) * half;
    const placedZ = z - Math.cos(heading) * half;
    this.placeCenteredVisualActor(actor, placedX, placedZ, heading);
  }

  private placeCenteredVisualActor(
    actor: VehicleActor,
    x: number,
    z: number,
    heading: number,
  ): void {
    actor.placedHeading = heading;
    actor.root.position.set(x, 0, z);
    actor.root.quaternion.setFromAxisAngle(Y_AXIS, heading);
    this.applyEdgeFade(actor, x, z);
  }

  private enforceVehicleSpacing(): void {
    const byRoute = new Map<string, VehicleActor[]>();
    for (const actor of this.vehicles.values()) {
      if (
        actor.statusState === "ACCIDENT_STOPPED" ||
        actor.statusState === "EVACUATING"
      ) {
        continue;
      }
      const group = byRoute.get(actor.routeId) ?? [];
      group.push(actor);
      byRoute.set(actor.routeId, group);
    }
    const minimumGap = 0.5;
    const delta = new THREE.Vector3();
    const forward = new THREE.Vector3();
    for (const [routeId, actors] of byRoute) {
      if (actors.every((actor) => actor.turnProgress !== undefined)) {
        actors.sort(
          (left, right) =>
            (right.turnProgress ?? -Infinity) -
            (left.turnProgress ?? -Infinity),
        );
        const constrained = constrainTurnProgresses(
          actors.map((actor) => ({
            progress: actor.turnProgress ?? 0,
            length: actor.visualHalfLength * 2,
          })),
          minimumGap,
        );
        for (let index = 1; index < actors.length; index += 1) {
          const follower = actors[index];
          const progress = constrained[index];
          if (follower?.turnProgress === undefined || progress === undefined) {
            continue;
          }
          if (follower.turnProgress === progress) {
            continue;
          }
          const pose = this.turnPaths.vehiclePoseAt(
            routeId,
            progress,
            follower.visualHalfLength * 2,
          );
          if (pose !== undefined) {
            this.placeTurnActor(follower, pose);
          }
        }
        continue;
      }
      for (let pass = 0; pass < 2; pass += 1) {
        for (let leftIndex = 0; leftIndex < actors.length; leftIndex += 1) {
          const left = actors[leftIndex];
          if (left === undefined) {
            continue;
          }
          for (
            let rightIndex = leftIndex + 1;
            rightIndex < actors.length;
            rightIndex += 1
          ) {
            const right = actors[rightIndex];
            if (right === undefined) {
              continue;
            }
            delta.subVectors(right.root.position, left.root.position);
            const distance = Math.hypot(delta.x, delta.z);
            const required =
              left.visualHalfLength + right.visualHalfLength + minimumGap;
            if (distance >= required || distance < 1e-6) {
              continue;
            }
            forward.set(0, 0, 1).applyQuaternion(left.root.quaternion);
            const rightAhead = delta.dot(forward) >= 0;
            const follower = rightAhead ? left : right;
            const leader = rightAhead ? right : left;
            forward.set(0, 0, 1).applyQuaternion(follower.root.quaternion);
            follower.root.position.set(
              leader.root.position.x - forward.x * required,
              follower.root.position.y,
              leader.root.position.z - forward.z * required,
            );
          }
        }
      }
    }
  }

  private syncScoreBubble(actor: VehicleActor, pose: ReplayVehiclePose): void {
    const now = performance.now();
    const presented = presentScoreBubble(pose, actor.scoreMemory, now);
    actor.scoreMemory = presented.memory;
    if (!presented.view.visible && !actor.scorePaintedVisible) {
      actor.scorePaintedAtMs ??= now;
      return;
    }
    const tone = presented.view.visible ? presented.view.tone : undefined;
    const appearanceChanged =
      presented.view.visible !== actor.scorePaintedVisible ||
      tone !== actor.scorePaintedTone;
    if (!scoreBubblePaintDue(actor.scorePaintedAtMs, now, appearanceChanged)) {
      return;
    }
    const view =
      presented.view.visible &&
      presented.view.tone === "charge" &&
      actor.scorePaintedVisible &&
      actor.scoreBubble.textContent !== presented.view.text
        ? { ...presented.view, shake: true }
        : presented.view;
    actor.pendingScoreView = view;
    if (this.scorePaintTimer !== undefined) {
      return;
    }
    this.scorePaintTimer = window.setTimeout(() => {
      this.scorePaintTimer = undefined;
      this.flushScoreBubbles();
    }, 0);
  }

  private flushScoreBubbles(): void {
    const now = performance.now();
    for (const actor of this.vehicles.values()) {
      const view = actor.pendingScoreView;
      if (view === undefined) {
        continue;
      }
      actor.pendingScoreView = undefined;
      actor.scorePaintedAtMs = now;
      actor.scorePaintedVisible = view.visible;
      actor.scorePaintedTone = view.visible ? view.tone : undefined;
      actor.scoreBubble.hidden = !this.scoreBubblesVisible || !view.visible;
      actor.scoreLabel.visible =
        actor.statusVisible || (this.scoreBubblesVisible && view.visible);
      if (!view.visible) {
        continue;
      }
      actor.scoreBubble.textContent = view.text;
      actor.scoreBubble.classList.toggle(
        "score-bubble-charge",
        view.tone === "charge",
      );
      actor.scoreBubble.classList.toggle("score-bubble-gain", view.tone === "gain");
      actor.scoreBubble.classList.toggle("score-bubble-loss", view.tone === "loss");
      if (view.shake) {
        actor.scoreBubble.classList.remove("score-bubble-shake");
        void actor.scoreBubble.offsetWidth;
        actor.scoreBubble.classList.add("score-bubble-shake");
      }
    }
  }

  private syncStatusIcon(actor: VehicleActor, pose: ReplayVehiclePose): void {
    if (
      actor.statusState === pose.state &&
      actor.statusViolation === pose.violation
    ) {
      return;
    }
    actor.statusState = pose.state;
    actor.statusViolation = pose.violation;
    const badge = vehicleStatusBadge(pose.state, pose.violation);
    actor.statusVisible = badge !== undefined;
    const icon = actor.statusIcon;
    if (badge === undefined) {
      icon.hidden = true;
      icon.classList.remove("is-pop");
    } else {
      icon.hidden = false;
      icon.style.color = badge.color;
      icon.style.setProperty("--status-icon", `url("${badge.iconUrl}")`);
      icon.setAttribute("aria-label", badge.label);
      icon.title = badge.label;
      icon.classList.remove("is-pop");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        void icon.offsetWidth;
        icon.classList.add("is-pop");
      }
    }
    actor.scoreLabel.visible =
      actor.statusVisible ||
      (this.scoreBubblesVisible && actor.scorePaintedVisible);
  }

  private applyEdgeFade(actor: VehicleActor, x: number, z: number): void {
    const fade = edgeFadeOpacity(distanceFromMapEdge(x, z));
    actor.edgeFade = fade;
    const opaque = fade >= 1;
    actor.root.traverse((child) => {
      if (
        !(child instanceof THREE.Mesh) ||
        child === actor.halo ||
        actor.hazardLamps.includes(child)
      ) {
        return;
      }
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        material.opacity = opaque ? 1 : fade;
        material.transparent = !opaque;
        material.depthWrite = opaque;
        material.needsUpdate = true;
      }
    });
    actor.halo.material.opacity = 0.8 * fade;
  }

  showEvent(event: ReplayEvent | undefined, bundle: ReplayBundle): void {
    if (this.debugMode !== "replay") {
      this.visualizer.clear();
      return;
    }
    if (event?.kind === "DRY_RUN_ADMIT" && isDryRunPayload(event.payload)) {
      const routeIds = event.payload.candidates.map((candidate) => candidate.routeId);
      const conflict = event.payload.feasible ? undefined : event.payload.conflict;
      if (conflict === undefined) {
        this.visualizer.showRoutes(routeIds, "dashed", bundle.scene);
      } else {
        this.visualizer.showRoutes(routeIds, "dashed", bundle.scene, conflict);
      }
      return;
    }
    if (event?.kind === "COMMIT") {
      this.visualizer.showRoutes(
        executedRouteIds(bundle, event),
        "solid",
        bundle.scene,
      );
      return;
    }
    if (event?.kind === "LANE_GUIDANCE") {
      const payload =
        typeof event.payload === "object" && event.payload !== null
          ? (event.payload as Record<string, unknown>)
          : {};
      const guidedRouteId = payload.guidedRouteId;
      if (typeof guidedRouteId === "string") {
        this.visualizer.showRoutes([guidedRouteId], "dashed", bundle.scene);
        return;
      }
    }
    this.visualizer.clear();
  }

  triggerAccident(event: ReplayEvent, bundle: ReplayBundle): void {
    const payload = readAccidentPayload(event.payload);
    if (payload === undefined || this.debugMode !== "replay") {
      return;
    }
    const headings = payload.vehicleIds.map(
      (id) => this.vehicles.get(id)?.placedHeading ?? 0,
    );
    const locked = accidentAnchorResourceIds(payload.lockedResourceIds).flatMap(
      (resourceId) => {
        const point = bundle.scene.conflictResources[resourceId];
        return point === undefined ? [] : [point];
      },
    );
    const heading = headings[0] ?? this.pedestrianAccidentHeading(payload.pedestrianIds);
    if (locked.length === 0) {
      const actor = this.vehicles.get(payload.vehicleIds[0] ?? "");
      const pedestrian = this.pedestrianAccidentAnchor(payload.pedestrianIds);
      if (actor === undefined && pedestrian === undefined) {
        return;
      }
      this.accidents.trigger({
        x: actor?.root.position.x ?? pedestrian?.x ?? 0,
        z: actor?.root.position.z ?? pedestrian?.z ?? 0,
        vehicleIds: payload.vehicleIds,
        headings,
        intensity: accidentIntensity(payload.severity),
      });
      return;
    }
    const simX = locked.reduce((sum, point) => sum + point.x, 0) / locked.length;
    const simZ = locked.reduce((sum, point) => sum + point.z, 0) / locked.length;
    const mapped = mapSimulationPoint(simX, simZ, heading);
    this.accidents.trigger({
      x: mapped.x,
      z: mapped.z,
      vehicleIds: payload.vehicleIds,
      headings,
      intensity: accidentIntensity(payload.severity),
    });
  }

  clearAccidentBursts(): void {
    this.accidents.clear();
  }

  private pedestrianAccidentAnchor(
    pedestrianIds: readonly string[] | undefined,
  ): { readonly x: number; readonly z: number } | undefined {
    for (const id of pedestrianIds ?? []) {
      const pose = this.pedestrians.worldPose(id);
      if (pose !== undefined) {
        return pose;
      }
    }
    return undefined;
  }

  private pedestrianAccidentHeading(
    pedestrianIds: readonly string[] | undefined,
  ): number {
    for (const id of pedestrianIds ?? []) {
      const pose = this.pedestrians.worldPose(id);
      if (pose !== undefined) {
        return pose.heading;
      }
    }
    return 0;
  }

  update(deltaSeconds: number): void {
    this.visualizer.update(deltaSeconds);
    this.hazardPhase += deltaSeconds;
    const blinkOn = Math.floor(this.hazardPhase * 4) % 2 === 0;
    this.hazardMaterial.opacity = blinkOn ? 0.82 : 0.4;
    for (const actor of this.vehicles.values()) {
      for (const lamp of actor.hazardLamps) {
        const material = lamp.material;
        lamp.visible = actor.hazardActive;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = (blinkOn ? 1 : 0.2) * actor.edgeFade;
        }
      }
    }
    this.trafficLightBend.update(deltaSeconds);
    this.clouds?.update(deltaSeconds);
    this.controls.update();
    this.updateShadowFrustum();
    this.enforceVehicleSpacing();
    this.accidents.update(deltaSeconds);
    const shake = this.accidents.cameraNudge();
    this.camera.position.add(shake);
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
    this.camera.position.sub(shake);
  }

  async setDebugMode(mode: DebugSceneMode, seed = 1): Promise<void> {
    const leavingReplay = this.debugMode === "replay" && mode !== "replay";
    const returning = mode === "replay" && this.debugMode !== "replay";
    if (
      mode === this.debugMode &&
      (mode !== "randomFleet" || seed === this.randomFleetSeed)
    ) {
      return;
    }
    if (leavingReplay) {
      this.replayCameraPosition.copy(this.camera.position);
      this.replayCameraTarget.copy(this.controls.target);
      this.camera.position.set(52, 58, 52);
      this.controls.target.set(0, 1, 0);
      this.controls.update();
      this.visualizer.clear();
      this.accidents.clear();
    }
    for (const actor of this.vehicles.values()) {
      actor.root.visible = mode === "replay";
    }
    this.pedestrians.setReplayVisible(mode === "replay");
    this.debugMode = mode;
    this.trafficLogicGrid.setVisible(
      this.xRayMode &&
        mode === "replay" &&
        this.trafficLogicGrid.gridIndex !== undefined,
    );
    this.vehicleGallery.visible = mode === "catalog";
    this.randomFleet.visible = mode === "randomFleet";
    if (returning) {
      this.camera.position.copy(this.replayCameraPosition);
      this.controls.target.copy(this.replayCameraTarget);
      this.controls.update();
      return;
    }
    if (mode === "catalog" && !this.vehicleGalleryReady) {
      await this.prepareVehicleGallery();
      this.vehicleGalleryReady = true;
    }
    if (mode === "randomFleet" && seed !== this.randomFleetSeed) {
      await this.rebuildRandomFleet(seed);
      this.randomFleetSeed = seed;
    }
    this.vehicleGallery.visible = this.debugMode === "catalog";
    this.randomFleet.visible = this.debugMode === "randomFleet";
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.updateShadowFrustum();
  }

  dispose(): void {
    if (this.scorePaintTimer !== undefined) {
      window.clearTimeout(this.scorePaintTimer);
      this.scorePaintTimer = undefined;
    }
    this.clearReplayVehicles();
    this.trafficLightBend.dispose();
    this.trafficSignals.dispose();
    this.setXRayMode(false);
    this.trafficLogicGrid.dispose();
    this.pedestrians.dispose();
    this.visualizer.clear();
    this.labelRenderer.domElement.remove();
    this.renderer.dispose();
    this.controls.dispose();
  }

  private spawnVehicle(pose: ReplayVehiclePose): VehicleActor {
    const motorcycle = pose.type === "MOTORCYCLE";
    const spec = replayVehicleSpec(pose.type);
    const template = motorcycle
      ? this.templates.get("moto")
      : spec === undefined
        ? this.templates.get("sedan")
        : (this.templates.get(vehicleTemplateKey(spec)) ??
          this.templates.get("sedan"));
    const model =
      template === undefined
        ? this.fallbackVehicle(pose.type, spec)
        : template.clone(true);
    if (template !== undefined) {
      this.prepareTexturedModel(model);
    }
    if (pose.paintHex !== undefined && spec !== undefined) {
      const paintConfig = findVehiclePaintConfig(spec.id);
      if (paintConfig !== undefined) {
        applyVehiclePaint(model, {
          hex: pose.paintHex,
          darkCutoff: paintConfig.darkCutoff,
          brightCutoff: paintConfig.brightCutoff,
        });
      }
    }
    model.scale.setScalar(
      motorcycle
        ? 0.62
        : (spec?.targetScale ?? REPLAY_SEDAN_SPEC?.targetScale ?? 1),
    );
    model.rotation.y = (spec?.modelQuarterTurns ?? 0) * (Math.PI / 2);
    const bounds = normalizeVehicleModelPivot(model);
    const collisionHull = modelCollisionHull(model, bounds);
    const body = new THREE.Group();
    body.name = "vehicle-damage-body";
    body.add(model);
    const root = new THREE.Group();
    root.add(body);
    const damage = createVehicleDamageController(model, body, bounds);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(
        motorcycle ? 0.45 : 0.72,
        motorcycle ? 0.6 : 0.92,
        32,
      ),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.28;
    halo.material.polygonOffset = true;
    halo.material.polygonOffsetFactor = -2;
    halo.material.polygonOffsetUnits = -2;
    halo.visible = false;
    root.add(halo);
    const scoreBubble = document.createElement("span");
    scoreBubble.className = "score-bubble";
    scoreBubble.hidden = true;
    const statusIcon = document.createElement("span");
    statusIcon.className = "vehicle-state-icon";
    statusIcon.hidden = true;
    statusIcon.setAttribute("role", "img");
    const scoreAnchor = document.createElement("div");
    scoreAnchor.className = "score-anchor";
    scoreAnchor.append(scoreBubble, statusIcon);
    const scoreLabel = new CSS2DObject(scoreAnchor);
    scoreLabel.center.set(0.5, 1);
    scoreLabel.visible = false;
    const roof = Number.isFinite(bounds.max.y) ? bounds.max.y + 0.45 : 2;
    scoreLabel.position.set(0, roof, 0);
    root.add(scoreLabel);
    const idElement = document.createElement("span");
    idElement.className = "entity-id-label vehicle-id-label";
    idElement.textContent = pose.id;
    const idLabel = new CSS2DObject(idElement);
    idLabel.center.set(0.5, 1);
    idLabel.position.set(0, roof + 0.68, 0);
    idLabel.visible = this.xRayMode && this.xRayVehicleIdsVisible;
    root.add(idLabel);
    const demoPenaltyBubble = document.createElement("span");
    demoPenaltyBubble.className = "demo-penalty-bubble";
    demoPenaltyBubble.hidden = true;
    const demoPenaltyAnchor = document.createElement("div");
    demoPenaltyAnchor.className = "demo-penalty-anchor";
    demoPenaltyAnchor.append(demoPenaltyBubble);
    const demoPenaltyLabel = new CSS2DObject(demoPenaltyAnchor);
    demoPenaltyLabel.center.set(0.5, 1);
    demoPenaltyLabel.visible = false;
    demoPenaltyLabel.position.set(0, roof + 0.7, 0);
    root.add(demoPenaltyLabel);
    const hazardLamps = [-1, 1].map((side) => {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshBasicMaterial({
          color: side < 0 ? 0xffb000 : 0xfff1a8,
          transparent: true,
        }),
      );
      lamp.position.set(side * 0.42, 0.85, -0.7);
      lamp.scale.setScalar(1.8);
      lamp.visible = false;
      root.add(lamp);
      return lamp;
    });
    this.scene.add(root);
    if (this.xRayMode) {
      this.applyWireframe(root);
    }
    const actor = {
      root,
      model,
      damage,
      halo,
      hazardLamps,
      scoreLabel,
      scoreBubble,
      idLabel,
      demoPenaltyLabel,
      demoPenaltyBubble,
      statusIcon,
      centerOffset: (spec?.length ?? 1) / 2,
      edgeFade: 1,
      hazardActive: false,
      scoreMemory: undefined,
      scorePaintedAtMs: null,
      scorePaintedVisible: false,
      scorePaintedTone: undefined,
      pendingScoreView: undefined,
      demoPenaltyStep: -1,
      routeId: pose.routeId,
      turnProgress: undefined,
      visualHalfLength: (spec?.length ?? 1) / 2,
      visualHalfWidth: (spec?.width ?? 1.1) / 2,
      collisionHull,
      statusState: undefined,
      statusViolation: undefined,
      statusVisible: false,
      placedHeading: pose.heading,
      damageOutcomeTick: undefined,
    };
    this.vehicles.set(pose.id, actor);
    return actor;
  }

  private async prepareVehicleGallery(): Promise<void> {
    await Promise.all(
      VEHICLE_CATALOG.map((spec) =>
        this.cacheTemplate(vehicleTemplateKey(spec), spec.assetPath),
      ),
    );
    const placements = createVehicleGalleryLayout(
      VEHICLE_CATALOG.map((spec) => ({
        id: spec.id,
        width: spec.width,
        length: spec.length,
      })),
    );
    const specsById = new Map<string, VehicleSpec>(
      VEHICLE_CATALOG.map((spec) => [spec.id, spec]),
    );
    for (const placement of placements) {
      const spec = specsById.get(placement.id);
      if (spec === undefined) {
        continue;
      }
      const template = this.templates.get(vehicleTemplateKey(spec));
      if (template === undefined) {
        this.fallbackWarned = true;
        continue;
      }
      const instance = template.clone(true);
      this.prepareTexturedModel(instance);
      instance.scale.setScalar(spec.targetScale);
      instance.rotation.y = spec.modelQuarterTurns * (Math.PI / 2);
      normalizeVehicleModelPivot(instance);

      const actor = new THREE.Group();
      actor.name = spec.id;
      actor.position.set(placement.x, 0, placement.z);
      actor.rotation.y = placement.heading;
      actor.add(instance);
      this.vehicleGallery.add(actor);
    }
  }

  private async rebuildRandomFleet(seed: number): Promise<void> {
    clearOwnedMaterials(this.randomFleet);
    this.randomFleet.clear();
    const fleet = createRandomVehicleFleet(seed);
    const specsById = new Map<string, VehicleSpec>(
      VEHICLE_CATALOG.map((spec) => [spec.id, spec]),
    );
    await Promise.all(
      [...new Set(fleet.map((vehicle) => vehicle.specId))].map((id) => {
        const spec = specsById.get(id);
        return spec === undefined
          ? Promise.resolve()
          : this.cacheTemplate(vehicleTemplateKey(spec), spec.assetPath);
      }),
    );
    for (const vehicle of fleet) {
      const spec = specsById.get(vehicle.specId);
      const config = findVehiclePaintConfig(vehicle.specId);
      const template =
        spec === undefined
          ? undefined
          : this.templates.get(vehicleTemplateKey(spec));
      if (spec === undefined || config === undefined || template === undefined) {
        this.fallbackWarned = true;
        continue;
      }
      const instance = template.clone(true);
      this.prepareTexturedModel(instance);
      applyVehiclePaint(instance, {
        hex: vehicle.hex,
        darkCutoff: config.darkCutoff,
        brightCutoff: config.brightCutoff,
      });
      instance.scale.setScalar(spec.targetScale);
      instance.rotation.y = spec.modelQuarterTurns * (Math.PI / 2);
      normalizeVehicleModelPivot(instance);
      const actor = new THREE.Group();
      actor.name = vehicle.instanceId;
      actor.position.set(vehicle.x, 0, vehicle.z);
      actor.rotation.y = vehicle.heading;
      actor.add(instance);
      this.randomFleet.add(actor);
    }
  }

  private fallbackVehicle(
    type: ReplayVehiclePose["type"],
    spec: VehicleSpec | undefined,
  ): THREE.Object3D {
    this.fallbackWarned = true;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        spec?.width ?? (type === "MOTORCYCLE" ? 0.45 : 0.8),
        0.5,
        spec?.length ?? (type === "MOTORCYCLE" ? 0.8 : 1.6),
      ),
      new THREE.MeshStandardMaterial({
        color: type === "MOTORCYCLE" ? 0x8fd3c4 : 0xd9c27a,
      }),
    );
    mesh.position.y = 0.25;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const root = new THREE.Group();
    root.add(mesh);
    return root;
  }

  private async cacheTemplate(key: string, url: string): Promise<void> {
    if (this.templates.has(key)) {
      return;
    }
    try {
      const gltf = await this.loader.loadAsync(url);
      this.templates.set(key, gltf.scene);
    } catch {
      this.fallbackWarned = true;
    }
  }

  private configureLayoutView(layout: CityLayout): void {
    const extent = layout.worldExtent || CITY_WORLD_EXTENT;
    this.camera.position.set(extent * 1.45, extent * 1.55, extent * 1.5);
    this.camera.near = 0.5;
    this.camera.far = extent * 5;
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = extent * 3.2;
    this.scene.fog = new THREE.Fog(BACKGROUND_COLOR, FOG_NEAR, FOG_FAR);
    this.updateShadowFrustum();
  }

  private updateShadowFrustum(): void {
    const focus = this.controls.target;
    const distance = this.camera.position.distanceTo(focus);
    const fitted = fitViewShadowFrustum({
      cameraDistance: distance,
      fovDegrees: this.camera.fov,
      aspect: this.camera.aspect,
      mapSize: this.sun.shadow.mapSize.y,
      focusX: focus.x,
      focusZ: focus.z,
      sunDistance: SUN_DISTANCE,
      casterMargin: this.clouds === undefined ? 0 : cloudShadowCasterMargin(),
    });
    this.sun.position.set(
      fitted.snappedFocusX + SUN_OFFSET.x,
      focus.y + SUN_OFFSET.y,
      fitted.snappedFocusZ + SUN_OFFSET.z,
    );
    this.sun.target.position.set(fitted.snappedFocusX, focus.y, fitted.snappedFocusZ);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = fitted.left;
    shadowCamera.right = fitted.right;
    shadowCamera.top = fitted.top;
    shadowCamera.bottom = fitted.bottom;
    shadowCamera.near = fitted.near;
    shadowCamera.far = fitted.far;
    shadowCamera.updateProjectionMatrix();
  }

  private composeStaticCity(layout: CityLayout): void {
    const floorSize = layout.worldExtent * 2;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorSize, floorSize),
      new THREE.MeshStandardMaterial({ color: 0x8ea49a, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.composeRoad(layout);
    if (this.clouds !== undefined) {
      this.scene.remove(this.clouds.object);
    }
    this.clouds = new CloudField(layout.worldExtent);
    this.scene.add(this.clouds.object);
    const cityComposer = new CityTileComposer(this.templates);
    this.scene.add(cityComposer.compose(layout));
    this.composeMainStreetFurniture(layout.worldExtent);
  }

  private composeRoad(layout: CityLayout): void {
    const { worldExtent } = layout;
    const roadLength = worldExtent * 2;
    const asphalt = new THREE.MeshStandardMaterial({
      color: CITY_ROAD_ASPHALT_COLOR,
      roughness: 0.4,
      metalness: 0,
    });
    const asphaltArmLength = (roadLength - ROAD_WIDTH) / 2;
    const asphaltArmOffset = ROAD_HALF_WIDTH + asphaltArmLength / 2;
    const asphaltSegments: Array<
      readonly [number, number, number, number]
    > = [[0, 0, ROAD_WIDTH, ROAD_WIDTH]];
    for (const sign of [-1, 1] as const) {
      asphaltSegments.push(
        [0, sign * asphaltArmOffset, ROAD_WIDTH, asphaltArmLength],
        [sign * asphaltArmOffset, 0, asphaltArmLength, ROAD_WIDTH],
      );
    }
    this.addMergedBoxes(asphaltSegments, asphalt, 0.12, 0);
    const cornerAprons: THREE.BufferGeometry[] = [];
    for (const signX of [-1, 1] as const) {
      for (const signZ of [-1, 1] as const) {
        cornerAprons.push(
          createRoadCornerSurface(signX, signZ, "apron", 0.061),
        );
      }
    }
    this.addMergedGeometry(cornerAprons, asphalt, true);

    const sidewalkSpan = SIDEWALK_OUTER_EDGE - ROAD_HALF_WIDTH;
    const sidewalkCenter = ROAD_HALF_WIDTH + sidewalkSpan / 2;
    const entryConnectors: Array<
      readonly [number, number, number, number]
    > = [];
    for (const district of layout.districts) {
      for (const entry of district.entries) {
        if (entry.edge === "x") {
          entryConnectors.push([
            district.signX * sidewalkCenter,
            district.signZ *
              (CITY_INNER_TILE + entry.localZ) *
              TILE_SIZE,
            sidewalkSpan,
            TILE_SIZE,
          ]);
        } else {
          entryConnectors.push([
            district.signX *
              (CITY_INNER_TILE + entry.localX) *
              TILE_SIZE,
            district.signZ * sidewalkCenter,
            TILE_SIZE,
            sidewalkSpan,
          ]);
        }
      }
    }
    this.addMergedBoxes(entryConnectors, asphalt, 0.12, 0);

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8bab2,
      roughness: 0.88,
    });
    const curbWidth = sidewalkSpan;
    const curbOffset = ROAD_HALF_WIDTH + curbWidth / 2;
    const roadHalfLength = roadLength / 2;
    const curbSegments: Array<readonly [number, number, number, number]> = [];
    for (const side of [-1, 1] as const) {
      for (const arm of [-1, 1] as const) {
        const district = layout.districts.find(
          (item) => item.signX === side && item.signZ === arm,
        );
        const verticalGaps = (district?.entries ?? [])
          .filter((entry) => entry.edge === "x")
          .map((entry) => (CITY_INNER_TILE + entry.localZ) * TILE_SIZE);
        for (const segment of splitSidewalkArm(
          ROAD_CORNER_CENTER,
          roadHalfLength,
          verticalGaps,
        )) {
          curbSegments.push([
            side * curbOffset,
            arm * segment.center,
            curbWidth,
            segment.length,
          ]);
        }

        const horizontalDistrict = layout.districts.find(
          (item) => item.signX === arm && item.signZ === side,
        );
        const horizontalGaps = (horizontalDistrict?.entries ?? [])
          .filter((entry) => entry.edge === "z")
          .map((entry) => (CITY_INNER_TILE + entry.localX) * TILE_SIZE);
        for (const segment of splitSidewalkArm(
          ROAD_CORNER_CENTER,
          roadHalfLength,
          horizontalGaps,
        )) {
          curbSegments.push([
            arm * segment.center,
            side * curbOffset,
            segment.length,
            curbWidth,
          ]);
        }
      }
    }
    this.addMergedBoxes(curbSegments, edgeMaterial, 0.16, 0.06);
    const cornerSidewalks: THREE.BufferGeometry[] = [];
    for (const signX of [-1, 1] as const) {
      for (const signZ of [-1, 1] as const) {
        cornerSidewalks.push(
          createRoadCornerSurface(signX, signZ, "sidewalk", 0.141),
        );
      }
    }
    this.addMergedGeometry(cornerSidewalks, edgeMaterial, true);

    const white = new THREE.MeshBasicMaterial({
      color: 0xe4e2d6,
      side: THREE.DoubleSide,
    });
    const yellow = new THREE.MeshBasicMaterial({ color: 0xe7aa32 });
    const markings = createMainRoadMarkings(worldExtent);
    const whitePieces: THREE.BufferGeometry[] = [];
    const yellowPieces: THREE.BufferGeometry[] = [];
    for (const marking of markings.rects) {
      const geometry = new THREE.PlaneGeometry(marking.width, marking.depth);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(marking.x, 0.075, marking.z);
      (marking.color === "yellow" ? yellowPieces : whitePieces).push(geometry);
    }
    const bikeLaneStart = STOP_LINE_DISTANCE + 0.12;
    for (const side of [-1, 1] as const) {
      for (const arm of [-1, 1] as const) {
        const district = layout.districts.find(
          (item) => item.signX === side && item.signZ === arm,
        );
        const verticalGaps = (district?.entries ?? [])
          .filter((entry) => entry.edge === "x")
          .map((entry) => (CITY_INNER_TILE + entry.localZ) * TILE_SIZE);
        for (const segment of splitSidewalkArm(
          bikeLaneStart,
          roadHalfLength,
          verticalGaps,
        )) {
          const geometry = new THREE.PlaneGeometry(
            BIKE_LANE_DIVIDER_WIDTH,
            segment.length,
          );
          geometry.rotateX(-Math.PI / 2);
          geometry.translate(
            side * BIKE_LANE_DIVIDER_OFFSET,
            0.076,
            arm * segment.center,
          );
          whitePieces.push(geometry);
        }

        const horizontalDistrict = layout.districts.find(
          (item) => item.signX === arm && item.signZ === side,
        );
        const horizontalGaps = (horizontalDistrict?.entries ?? [])
          .filter((entry) => entry.edge === "z")
          .map((entry) => (CITY_INNER_TILE + entry.localX) * TILE_SIZE);
        for (const segment of splitSidewalkArm(
          bikeLaneStart,
          roadHalfLength,
          horizontalGaps,
        )) {
          const geometry = new THREE.PlaneGeometry(
            segment.length,
            BIKE_LANE_DIVIDER_WIDTH,
          );
          geometry.rotateX(-Math.PI / 2);
          geometry.translate(
            arm * segment.center,
            0.076,
            side * BIKE_LANE_DIVIDER_OFFSET,
          );
          whitePieces.push(geometry);
        }
      }
    }
    for (const arrow of markings.arrows) {
      const geometry = this.createLaneArrowGeometry(arrow.kind);
      geometry.rotateX(Math.PI / 2);
      geometry.rotateY(arrow.heading);
      geometry.translate(arrow.x, 0.077, arrow.z);
      whitePieces.push(geometry);
    }
    this.addMergedGeometry(whitePieces, white);
    this.addMergedGeometry(yellowPieces, yellow);
  }

  private composeMainStreetFurniture(worldExtent: number): void {
    const batches = new Map<string, InstanceBatch>();
    const shadows = { castShadow: false, receiveShadow: true };
    const trafficLight = this.templates.get("kay-trafficlight");
    if (trafficLight !== undefined) {
      const cornerFurnitureOffset =
        ROAD_HALF_WIDTH + ROAD_CORNER_RADIUS * 0.45 + CONTROL_OUTWARD_SHIFT;
      for (const [x, z, rotation, signalAxis] of [
        [-cornerFurnitureOffset, cornerFurnitureOffset, Math.PI, "NS"],
        [cornerFurnitureOffset, -cornerFurnitureOffset, 0, "NS"],
        [-cornerFurnitureOffset, -cornerFurnitureOffset, Math.PI / 2, "EW"],
        [cornerFurnitureOffset, cornerFurnitureOffset, -Math.PI / 2, "EW"],
      ] as const) {
        const root = trafficLight.clone(true);
        root.rotation.set(0, 0, 0);
        root.position.set(0, 0, 0);
        fitRootToHeight(root, 4.5);
        root.position.set(x, 0.08, z);
        root.rotation.y = rotation;
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = shadows.castShadow;
            child.receiveShadow = shadows.receiveShadow;
          }
        });
        this.scene.add(root);
        this.trafficLightBend.add(
          root,
          new THREE.Vector3(-x, 0, -z).normalize(),
        );
        this.trafficSignals.add(root, signalAxis);
      }
    }

    const streetlight = this.templates.get("kay-streetlight");
    if (streetlight !== undefined) {
      const furnitureOffset = ROAD_HALF_WIDTH + 0.9;
      const distances: number[] = [];
      for (let distance = 13; distance <= worldExtent - 4; distance += 11) {
        distances.push(-distance, distance);
      }
      for (const distance of distances) {
        for (const side of [-1, 1]) {
          placeTemplate(batches, streetlight, (root) => {
            root.rotation.set(0, 0, 0);
            root.position.set(0, 0, 0);
            fitRootToHeight(root, 3.4);
            root.position.set(side * furnitureOffset, 0.08, distance);
            root.rotation.y = (side > 0 ? Math.PI : 0) + Math.PI;
          }, shadows);
          placeTemplate(batches, streetlight, (root) => {
            root.rotation.set(0, 0, 0);
            root.position.set(0, 0, 0);
            fitRootToHeight(root, 3.4);
            root.position.set(distance, 0.08, side * furnitureOffset);
            root.rotation.y = (side > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI;
          }, shadows);
        }
      }
    }

    for (const mesh of createInstancedMeshes(batches.values())) {
      this.scene.add(mesh);
    }
  }

  private prepareTexturedModel(
    root: THREE.Object3D,
    options: { contactAo: boolean; castShadow: boolean } = {
      contactAo: false,
      castShadow: true,
    },
  ): void {
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) {
        return;
      }
      const material = child.material.clone();
      if (material.map !== null) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      }
      material.metalness = 0;
      material.roughness = 0.76;
      child.material = material;
      child.castShadow = options.castShadow;
      child.receiveShadow = true;
      if (options.contactAo) {
        bakeGeometryContactAo(child.geometry);
        applyContactAoMaterial(material);
      }
    });
  }

  private addMergedBoxes(
    segments: ReadonlyArray<readonly [number, number, number, number]>,
    material: THREE.Material,
    height: number,
    y: number,
  ): void {
    const pieces: THREE.BufferGeometry[] = [];
    for (const [x, z, width, depth] of segments) {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      geometry.translate(x, y, z);
      pieces.push(geometry);
    }
    this.addMergedGeometry(pieces, material, true);
  }

  private addMergedGeometry(
    pieces: THREE.BufferGeometry[],
    material: THREE.Material,
    receiveShadow = false,
  ): void {
    if (pieces.length === 0) {
      return;
    }
    const merged = mergeGeometries(pieces);
    if (merged === null) {
      for (const piece of pieces) {
        const mesh = new THREE.Mesh(piece, material);
        mesh.castShadow = false;
        mesh.receiveShadow = receiveShadow;
        this.scene.add(mesh);
      }
      return;
    }
    for (const piece of pieces) {
      piece.dispose();
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = false;
    mesh.receiveShadow = receiveShadow;
    this.scene.add(mesh);
  }

  private createLaneArrowGeometry(kind: LaneArrowKind): THREE.ShapeGeometry {
    const shape = new THREE.Shape();
    if (kind === "straight") {
      shape.moveTo(-0.13, -0.68);
      shape.lineTo(0.13, -0.68);
      shape.lineTo(0.13, 0.16);
      shape.lineTo(0.34, 0.16);
      shape.lineTo(0, 0.68);
      shape.lineTo(-0.34, 0.16);
      shape.lineTo(-0.13, 0.16);
    } else {
      shape.moveTo(-0.1, -0.68);
      shape.lineTo(0.1, -0.68);
      shape.lineTo(0.1, 0.05);
      shape.quadraticCurveTo(0.1, 0.28, -0.16, 0.28);
      shape.lineTo(-0.42, 0.28);
      shape.lineTo(-0.42, 0.5);
      shape.lineTo(-0.76, 0.18);
      shape.lineTo(-0.42, -0.14);
      shape.lineTo(-0.42, 0.08);
      shape.lineTo(-0.16, 0.08);
      shape.quadraticCurveTo(-0.1, 0.08, -0.1, 0.05);
    }
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    if (kind === "left") {
      geometry.scale(-1, 1, 1);
    }
    if (kind !== "straight") {
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (bounds !== null) {
        geometry.translate(-(bounds.min.x + bounds.max.x) / 2, 0, 0);
      }
    }
    return geometry;
  }

  get usedFallbackGeometry(): boolean {
    return this.fallbackWarned;
  }

  private applyWireframe(root: THREE.Object3D): void {
    const exempt = new Set<THREE.Object3D>();
    this.trafficLogicGrid.group.traverse((child) => exempt.add(child));
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || exempt.has(child)) {
        return;
      }
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if (!("wireframe" in material) || typeof material.wireframe !== "boolean") {
          continue;
        }
        const wireframeMaterial = material as THREE.Material & {
          wireframe: boolean;
        };
        if (!this.wireframeStates.has(wireframeMaterial)) {
          this.wireframeStates.set(wireframeMaterial, wireframeMaterial.wireframe);
        }
        wireframeMaterial.wireframe = true;
        wireframeMaterial.needsUpdate = true;
      }
    });
  }

  private resetTrafficLogicHistory(): void {
    this.trafficLogicBundle = undefined;
    this.trafficLogicHistoryFrame = -1;
    this.trafficLogicHistory.clear();
  }
}

function createRoadCornerSurface(
  signX: -1 | 1,
  signZ: -1 | 1,
  kind: "apron" | "sidewalk",
  y: number,
): THREE.ShapeGeometry {
  const centerX = signX * ROAD_CORNER_CENTER;
  const centerZ = signZ * ROAD_CORNER_CENTER;
  const arc: Array<{ x: number; z: number }> = [];
  const segments = 20;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * (Math.PI / 2);
    arc.push({
      x: centerX - signX * ROAD_CORNER_RADIUS * Math.cos(angle),
      z: centerZ - signZ * ROAD_CORNER_RADIUS * Math.sin(angle),
    });
  }
  const points =
    kind === "apron"
      ? [
          { x: signX * ROAD_HALF_WIDTH, z: signZ * ROAD_HALF_WIDTH },
          ...arc,
        ]
      : [
          ...arc,
          {
            x: signX * SIDEWALK_CORNER_ARM_END,
            z: signZ * ROAD_HALF_WIDTH,
          },
          {
            x: signX * SIDEWALK_CORNER_ARM_END,
            z: signZ * SIDEWALK_OUTER_EDGE,
          },
          {
            x: signX * SIDEWALK_OUTER_EDGE,
            z: signZ * SIDEWALK_OUTER_EDGE,
          },
          {
            x: signX * SIDEWALK_OUTER_EDGE,
            z: signZ * SIDEWALK_CORNER_ARM_END,
          },
          {
            x: signX * ROAD_HALF_WIDTH,
            z: signZ * SIDEWALK_CORNER_ARM_END,
          },
        ];
  const shape = new THREE.Shape(
    points.map((point) => new THREE.Vector2(point.x, -point.z)),
  );
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

function splitSidewalkArm(
  start: number,
  end: number,
  roadCenters: readonly number[],
): Array<{ readonly center: number; readonly length: number }> {
  const halfRoad = TILE_SIZE / 2;
  const cuts = roadCenters
    .map((center) => ({
      start: Math.max(start, center - halfRoad),
      end: Math.min(end, center + halfRoad),
    }))
    .filter((cut) => cut.end > cut.start)
    .sort((left, right) => left.start - right.start);
  const segments: Array<{ center: number; length: number }> = [];
  let cursor = start;
  for (const cut of cuts) {
    if (cut.start > cursor) {
      segments.push({
        center: (cursor + cut.start) / 2,
        length: cut.start - cursor,
      });
    }
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < end) {
    segments.push({
      center: (cursor + end) / 2,
      length: end - cursor,
    });
  }
  return segments;
}

function executedRouteIds(bundle: ReplayBundle, commit: ReplayEvent): string[] {
  const payload =
    typeof commit.payload === "object" && commit.payload !== null
      ? (commit.payload as {
          admittedVehicleIds?: unknown;
          enterPlan?: unknown;
        })
      : {};
  const plannedIds = Array.isArray(payload.enterPlan)
    ? payload.enterPlan.flatMap((item) => {
        if (typeof item !== "object" || item === null) {
          return [];
        }
        const vehicleId = (item as { vehicleId?: unknown }).vehicleId;
        return typeof vehicleId === "string" ? [vehicleId] : [];
      })
    : Array.isArray(payload.admittedVehicleIds)
      ? payload.admittedVehicleIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
  const frame = [...bundle.frames]
    .reverse()
    .find((item) => item.tick <= commit.tick);
  const plannedRoutes = plannedIds.flatMap((vehicleId) => {
    const routeId = frame?.vehicles.find((vehicle) => vehicle.id === vehicleId)?.routeId;
    return routeId === undefined ? [] : [routeId];
  });
  if (plannedRoutes.length > 0) {
    return plannedRoutes;
  }
  const start = bundle.events.findIndex((event) => event.id === commit.id);
  if (start < 0) {
    return [];
  }
  const routeIds: string[] = [];
  for (let index = start + 1; index < bundle.events.length; index += 1) {
    const event = bundle.events[index];
    if (event === undefined || event.tick !== commit.tick || event.kind !== "ADMIT") {
      break;
    }
    const payload = event.payload;
    if (typeof payload !== "object" || payload === null) {
      continue;
    }
    const routeId = (payload as { routeId?: unknown }).routeId;
    if (typeof routeId === "string" && routeId.length > 0) {
      routeIds.push(routeId);
    }
  }
  return routeIds;
}

function clearOwnedMaterials(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}
