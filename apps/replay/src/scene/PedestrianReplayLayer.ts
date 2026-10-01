import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { Direction } from "../../../../src/core/types.js";
import type { CollisionOutcome } from "../../../../src/core/types.js";
import {
  collisionOutcomeForPedestrian,
  pedestrianCollisionVisual,
} from "@replay/collisionVisual.js";
import {
  presentScoreBubble,
  scoreBubblePaintDue,
  type ScoreBubbleMemory,
} from "@replay/score-bubble.js";
import type { ReplayPedestrianPose, ReplayScene } from "@replay/types.js";
import { isPointOnMainRoad } from "./mainRoadMarkings.js";
import {
  interpolatePedestrianWorldPose,
  mapPedestrianWorldPose,
} from "./pedestrianReplayMotion.js";
import { mapCrosswalkPose } from "./roadFrame.js";
import {
  PEDESTRIAN_CHARACTER_FILES,
  pedestrianActionTime,
  pedestrianActorLifecycle,
  pedestrianClipForState,
  pedestrianJaywalkCue,
  pedestrianSkinToneHex,
  pedestrianTemplateIndex,
  type PedestrianClipName,
} from "./pedestrianReplayPolicy.js";

const MODEL_BASE_URL = "/assets/replay-models/characters/quaternius";
const TARGET_BIND_HEIGHT = 0.825;
const GROUND_Y = 0.08;
const IMPACT_CELL_SCALE = 1.36;
const CLIP_NAMES = ["Idle", "Walk", "Death"] as const satisfies readonly PedestrianClipName[];

interface CharacterTemplate {
  readonly index: number;
  readonly scene: THREE.Object3D;
  readonly clips: Readonly<Record<PedestrianClipName, THREE.AnimationClip>>;
}

interface PedestrianActor {
  readonly root: THREE.Group;
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly presence: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly halo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly scoreLabel: CSS2DObject;
  readonly scoreBubble: HTMLElement;
  readonly idLabel: CSS2DObject;
  readonly templateIndex: number;
  readonly bodyWidth: number;
  readonly baseColors: Map<THREE.Material, THREE.Color>;
  clipName: PedestrianClipName | undefined;
  action: THREE.AnimationAction | undefined;
  pedestrianId: string | undefined;
  placedHeading: number;
  collisionApproach: Direction | undefined;
  scoreMemory: ScoreBubbleMemory | undefined;
  scorePaintedAtMs: number | null;
  scorePaintedVisible: boolean;
  scorePaintedTone: string | undefined;
}

export class PedestrianReplayLayer {
  readonly group = new THREE.Group();
  private readonly waitingZoneGroup = new THREE.Group();
  private readonly loader = new GLTFLoader();
  private readonly actors = new Map<string, PedestrianActor>();
  private readonly pool = new Map<number, PedestrianActor[]>();
  private readonly templates: CharacterTemplate[] = [];
  private loadPromise: Promise<void> | undefined;
  private loaded = false;
  private loadFailed = false;
  private disposed = false;
  private replayVisible = true;
  private scoreBubblesVisible = true;
  private idLabelsVisible = false;
  private readonly crosswalkApproaches = new Map<string, Direction>();

  constructor(scene: THREE.Scene) {
    this.group.name = "pedestrian-replay-layer";
    this.waitingZoneGroup.name = "pedestrian-waiting-zones";
    this.group.add(this.waitingZoneGroup);
    scene.add(this.group);
  }

  apply(
    poses: readonly ReplayPedestrianPose[],
    logicalSeconds: number,
    walkingPedestrianIds: ReadonlySet<string> = new Set(),
    travelDistances: ReadonlyMap<string, number> = new Map(),
  ): void {
    if (this.disposed || !this.replayVisible) {
      this.recycleAll();
      return;
    }
    if (poses.length === 0) {
      this.recycleAll();
      return;
    }
    this.ensureLoaded();
    if (!this.loaded) {
      return;
    }
    const lifecycle = pedestrianActorLifecycle(
      [...this.actors.keys()],
      poses.map((pose) => pose.id),
    );
    for (const id of lifecycle.recycle) {
      this.recycle(id);
    }
    for (const pose of poses) {
      const actor = this.actors.get(pose.id) ?? this.acquire(pose.id);
      if (actor === undefined) {
        continue;
      }
      this.place(actor, pose);
      this.syncVisual(
        actor,
        pose,
        logicalSeconds,
        walkingPedestrianIds.has(pose.id),
        travelDistances.get(pose.id),
      );
      this.syncScoreBubble(actor, pose);
    }
  }

  interpolate(
    id: string,
    from: ReplayPedestrianPose,
    to: ReplayPedestrianPose,
    alpha: number,
  ): void {
    const actor = this.actors.get(id);
    if (actor === undefined) {
      return;
    }
    const approach = this.crosswalkApproaches.get(from.crosswalkId);
    const blended = interpolatePedestrianWorldPose(
      from,
      to,
      alpha,
      approach,
    );
    this.placeWorld(actor, blended);
  }

  applyCollisionVisuals(
    outcomes: readonly CollisionOutcome[],
    logicalTick: number,
    reducedMotion = false,
  ): void {
    for (const [id, actor] of this.actors) {
      const match = collisionOutcomeForPedestrian(
        outcomes.filter((outcome) => outcome.impactTick <= logicalTick),
        id,
      );
      if (match === undefined) {
        continue;
      }
      const visual = pedestrianCollisionVisual(
        match.outcome,
        match.participant,
        reducedMotion
          ? Math.max(
              logicalTick,
              match.outcome.impactTick + match.participant.slideTicks,
            )
          : logicalTick,
      );
      const participant = match.participant;
      if (
        participant.contactPoint !== undefined &&
        actor.collisionApproach !== undefined
      ) {
        const start = {
          x: participant.restPose.x - participant.impulse.x,
          z: participant.restPose.z - participant.impulse.z,
        };
        const startWorld = mapCrosswalkPose(
          start.x,
          start.z,
          participant.fallDirection,
          actor.collisionApproach,
        );
        const restWorld = mapCrosswalkPose(
          participant.restPose.x,
          participant.restPose.z,
          participant.restPose.heading,
          actor.collisionApproach,
        );
        actor.root.position.x =
          startWorld.x + (restWorld.x - startWorld.x) * visual.motionProgress;
        actor.root.position.z =
          startWorld.z + (restWorld.z - startWorld.z) * visual.motionProgress;
      } else {
        actor.root.position.x += visual.x * IMPACT_CELL_SCALE;
        actor.root.position.z += visual.z * IMPACT_CELL_SCALE;
      }
      actor.root.rotation.set(
        visual.fallProgress * (Math.PI / 2),
        visual.heading,
        0,
      );
      const template = this.templates[actor.templateIndex];
      const death = template?.clips.Death;
      if (death !== undefined && actor.clipName === "Death") {
        actor.mixer.setTime(death.duration * visual.animationProgress);
      }
      actor.halo.visible = false;
    }
  }

  worldPose(
    id: string,
  ): { readonly x: number; readonly z: number; readonly heading: number } | undefined {
    const actor = this.actors.get(id);
    if (actor === undefined) {
      return undefined;
    }
    return {
      x: actor.root.position.x,
      z: actor.root.position.z,
      heading: actor.placedHeading,
    };
  }

  setReplayVisible(visible: boolean): void {
    this.replayVisible = visible;
    this.group.visible = visible;
    if (!visible) {
      this.recycleAll();
    }
  }

  setScoreBubblesVisible(visible: boolean): void {
    this.scoreBubblesVisible = visible;
    for (const actor of this.actors.values()) {
      actor.scoreBubble.hidden = !visible || !actor.scorePaintedVisible;
      actor.scoreLabel.visible = visible && actor.scorePaintedVisible;
    }
  }

  setIdLabelsVisible(visible: boolean): void {
    this.idLabelsVisible = visible;
    for (const actor of this.actors.values()) {
      actor.idLabel.visible = visible;
    }
  }

  setReplayScene(scene: ReplayScene | undefined): void {
    this.clear();
    this.clearWaitingZones();
    this.crosswalkApproaches.clear();
    const renderedCornerCells = new Set<string>();
    for (const crosswalk of scene?.crosswalks ?? []) {
      this.crosswalkApproaches.set(crosswalk.id, crosswalk.approach);
      for (const area of crosswalk.waitingAreas ?? []) {
        for (const cell of area.cells) {
          if (renderedCornerCells.has(cell.id)) {
            continue;
          }
          renderedCornerCells.add(cell.id);
          const pose = { x: cell.x, z: cell.z, heading: 0 };
          const marker = new THREE.Mesh(
            createClippedWaitingMarkerGeometry(pose.x, pose.z, 1.36),
            new THREE.MeshBasicMaterial({
              color:
                cell.kind === "SIDEWALK_QUEUE" ? 0x4aa8ff : 0x39e6d0,
              transparent: true,
              opacity: 0.24,
              depthWrite: false,
            }),
          );
          marker.name = cell.id;
          marker.position.set(pose.x, GROUND_Y + 0.004, pose.z);
          this.waitingZoneGroup.add(marker);
        }
      }
    }
  }

  clear(): void {
    this.recycleAll();
  }

  dispose(): void {
    this.disposed = true;
    this.recycleAll();
    this.clearWaitingZones();
    this.group.removeFromParent();
    this.templates.length = 0;
    this.loaded = false;
    this.loadFailed = false;
    this.loadPromise = undefined;
  }

  private clearWaitingZones(): void {
    for (const child of [...this.waitingZoneGroup.children]) {
      this.waitingZoneGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    }
  }

  private ensureLoaded(): void {
    if (
      this.loaded ||
      this.loadFailed ||
      this.loadPromise !== undefined ||
      this.disposed
    ) {
      return;
    }
    this.loadPromise = this.loadTemplates().catch((error: unknown) => {
      this.loadFailed = true;
      console.warn(
        "Pedestrian character assets failed to load; replay will continue without pedestrian models.",
        error,
      );
    });
  }

  private async loadTemplates(): Promise<void> {
    const templates = await Promise.all(
      PEDESTRIAN_CHARACTER_FILES.map(async (fileName, index) => {
        const gltf = await this.loader.loadAsync(`${MODEL_BASE_URL}/${fileName}`);
        const clips = {} as Record<PedestrianClipName, THREE.AnimationClip>;
        for (const name of CLIP_NAMES) {
          const clip = THREE.AnimationClip.findByName(gltf.animations, name);
          if (clip === null) {
            throw new Error(`Character is missing ${name} animation: ${fileName}`);
          }
          clips[name] = clip;
        }
        return { index, scene: gltf.scene, clips };
      }),
    );
    if (this.disposed) {
      return;
    }
    this.templates.push(...templates);
    this.loaded = true;
  }

  private acquire(id: string): PedestrianActor | undefined {
    const templateIndex = pedestrianTemplateIndex(id);
    const pooled = this.pool.get(templateIndex);
    const actor = pooled?.pop() ?? this.spawn(templateIndex);
    if (actor === undefined) {
      return undefined;
    }
    const characterFile = PEDESTRIAN_CHARACTER_FILES[templateIndex];
    if (characterFile !== undefined) {
      const skinToneHex = pedestrianSkinToneHex(id, characterFile);
      if (skinToneHex !== undefined) {
        applySkinTone(actor.model, skinToneHex);
      }
    }
    captureBaseColors(actor.model, actor.baseColors);
    actor.pedestrianId = id;
    actor.idLabel.element.textContent = id;
    actor.idLabel.visible = this.idLabelsVisible;
    actor.root.visible = true;
    this.group.add(actor.root);
    this.actors.set(id, actor);
    return actor;
  }

  private spawn(templateIndex: number): PedestrianActor | undefined {
    const template = this.templates[templateIndex];
    if (template === undefined) {
      return undefined;
    }
    const model = cloneSkeleton(template.scene);
    prepareCharacter(model);
    normalizeCharacter(model);
    const bodyWidth = Math.max(
      0.1,
      new THREE.Box3()
        .setFromObject(model, true)
        .getSize(new THREE.Vector3()).x,
    );
    const presence = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.14, 24),
      new THREE.MeshBasicMaterial({
        color: 0x39e6d0,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      }),
    );
    presence.rotation.x = -Math.PI / 2;
    presence.position.y = 0.025;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.155, 0.215, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff8a3d,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.03;
    halo.visible = false;
    const scoreBubble = document.createElement("span");
    scoreBubble.className = "score-bubble pedestrian-score-bubble";
    scoreBubble.hidden = true;
    const scoreLabel = new CSS2DObject(scoreBubble);
    scoreLabel.center.set(0.5, 1);
    scoreLabel.position.set(0, TARGET_BIND_HEIGHT + 0.55, 0);
    scoreLabel.visible = false;
    const idElement = document.createElement("span");
    idElement.className = "entity-id-label pedestrian-id-label";
    const idLabel = new CSS2DObject(idElement);
    idLabel.center.set(0.5, 1);
    idLabel.position.set(0, TARGET_BIND_HEIGHT + 0.9, 0);
    idLabel.visible = false;
    const root = new THREE.Group();
    root.add(model);
    root.add(presence);
    root.add(halo);
    root.add(scoreLabel);
    root.add(idLabel);
    return {
      root,
      model,
      mixer: new THREE.AnimationMixer(model),
      presence,
      halo,
      scoreLabel,
      scoreBubble,
      idLabel,
      templateIndex,
      bodyWidth,
      baseColors: captureBaseColors(model),
      clipName: undefined,
      action: undefined,
      pedestrianId: undefined,
      placedHeading: 0,
      collisionApproach: undefined,
      scoreMemory: undefined,
      scorePaintedAtMs: null,
      scorePaintedVisible: false,
      scorePaintedTone: undefined,
    };
  }

  private recycle(id: string): void {
    const actor = this.actors.get(id);
    if (actor === undefined) {
      return;
    }
    this.actors.delete(id);
    actor.action?.stop();
    actor.action = undefined;
    actor.clipName = undefined;
    actor.pedestrianId = undefined;
    actor.halo.visible = false;
    actor.scoreLabel.visible = false;
    actor.scoreBubble.hidden = true;
    actor.scoreMemory = undefined;
    actor.scorePaintedAtMs = null;
    actor.scorePaintedVisible = false;
    actor.scorePaintedTone = undefined;
    actor.idLabel.visible = false;
    actor.idLabel.element.remove();
    restoreBaseColors(actor);
    actor.root.visible = false;
    actor.root.removeFromParent();
    const bucket = this.pool.get(actor.templateIndex) ?? [];
    bucket.push(actor);
    this.pool.set(actor.templateIndex, bucket);
  }

  private recycleAll(): void {
    for (const id of [...this.actors.keys()]) {
      this.recycle(id);
    }
  }

  private place(actor: PedestrianActor, pose: ReplayPedestrianPose): void {
    const approach = this.crosswalkApproaches.get(pose.crosswalkId);
    actor.collisionApproach = approach;
    const mapped = mapPedestrianWorldPose(pose, approach);
    this.placeWorld(actor, mapped);
  }

  private placeWorld(
    actor: PedestrianActor,
    pose: { readonly x: number; readonly z: number; readonly heading: number },
  ): void {
    const mapped = pose;
    actor.placedHeading = mapped.heading;
    actor.root.position.set(mapped.x, GROUND_Y, mapped.z);
    actor.root.rotation.set(0, mapped.heading, 0);
  }

  private syncVisual(
    actor: PedestrianActor,
    pose: ReplayPedestrianPose,
    logicalSeconds: number,
    forceWalking = false,
    travelDistance?: number,
  ): void {
    const clipName = forceWalking ? "Walk" : pedestrianClipForState(pose.state);
    const template = this.templates[actor.templateIndex];
    if (clipName === undefined || template === undefined) {
      actor.root.visible = false;
      return;
    }
    actor.root.visible = true;
    if (actor.clipName !== clipName) {
      actor.action?.stop();
      const action = actor.mixer.clipAction(template.clips[clipName]);
      if (clipName === "Death") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      }
      action.enabled = true;
      action.play();
      actor.action = action;
      actor.clipName = clipName;
    }
    const duration = template.clips[clipName].duration;
    const time = pedestrianActionTime(
      clipName,
      logicalSeconds,
      duration,
      travelDistance,
      actor.bodyWidth,
    );
    actor.mixer.setTime(time);
    const cue = pedestrianJaywalkCue(pose.state);
    actor.halo.visible = cue.haloVisible;
    applyTint(actor, cue.tintHex);
  }

  private syncScoreBubble(
    actor: PedestrianActor,
    pose: ReplayPedestrianPose,
  ): void {
    const now = performance.now();
    const presented = presentScoreBubble(pose, actor.scoreMemory, now);
    actor.scoreMemory = presented.memory;
    const tone = presented.view.visible ? presented.view.tone : undefined;
    const appearanceChanged =
      presented.view.visible !== actor.scorePaintedVisible ||
      tone !== actor.scorePaintedTone;
    if (!scoreBubblePaintDue(actor.scorePaintedAtMs, now, appearanceChanged)) {
      return;
    }
    const shake =
      presented.view.visible &&
      presented.view.tone === "charge" &&
      actor.scorePaintedVisible &&
      actor.scoreBubble.textContent !== presented.view.text;
    actor.scorePaintedAtMs = now;
    actor.scorePaintedVisible = presented.view.visible;
    actor.scorePaintedTone = tone;
    actor.scoreBubble.hidden =
      !this.scoreBubblesVisible || !presented.view.visible;
    actor.scoreLabel.visible =
      this.scoreBubblesVisible && presented.view.visible;
    if (!presented.view.visible) {
      return;
    }
    actor.scoreBubble.textContent = presented.view.text;
    actor.scoreBubble.classList.toggle(
      "score-bubble-charge",
      presented.view.tone === "charge",
    );
    actor.scoreBubble.classList.toggle(
      "score-bubble-gain",
      presented.view.tone === "gain",
    );
    actor.scoreBubble.classList.toggle(
      "score-bubble-loss",
      presented.view.tone === "loss",
    );
    if (shake) {
      actor.scoreBubble.classList.remove("score-bubble-shake");
      void actor.scoreBubble.offsetWidth;
      actor.scoreBubble.classList.add("score-bubble-shake");
    }
  }
}

function createClippedWaitingMarkerGeometry(
  centerX: number,
  centerZ: number,
  size: number,
): THREE.BufferGeometry {
  const segments = 16;
  const half = size / 2;
  const step = size / segments;
  const positions: number[] = [];
  for (let ix = 0; ix < segments; ix += 1) {
    const x0 = -half + ix * step;
    const x1 = x0 + step;
    for (let iz = 0; iz < segments; iz += 1) {
      const z0 = -half + iz * step;
      const z1 = z0 + step;
      const corners = [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ] as const;
      if (
        corners.some(([x, z]) =>
          isPointOnMainRoad(centerX + x, centerZ + z),
        )
      ) {
        continue;
      }
      positions.push(
        x0, 0, z0,
        x1, 0, z0,
        x1, 0, z1,
        x0, 0, z0,
        x1, 0, z1,
        x0, 0, z1,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeBoundingSphere();
  return geometry;
}

function prepareCharacter(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = false;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });
}

function normalizeCharacter(model: THREE.Object3D): void {
  model.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(model, true);
  const sourceHeight = sourceBounds.getSize(new THREE.Vector3()).y;
  if (sourceHeight <= 0) {
    return;
  }
  model.scale.setScalar(TARGET_BIND_HEIGHT / sourceHeight);
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model, true);
  model.position.set(
    -(bounds.min.x + bounds.max.x) / 2,
    -bounds.min.y,
    -(bounds.min.z + bounds.max.z) / 2,
  );
  model.updateMatrixWorld(true);
}

function captureBaseColors(
  model: THREE.Object3D,
  colors = new Map<THREE.Material, THREE.Color>(),
): Map<THREE.Material, THREE.Color> {
  colors.clear();
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if ("color" in material && material.color instanceof THREE.Color) {
        colors.set(material, material.color.clone());
      }
    }
  });
  return colors;
}

function applySkinTone(model: THREE.Object3D, skinToneHex: number): void {
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (
        material.name === "Skin" &&
        "color" in material &&
        material.color instanceof THREE.Color
      ) {
        material.color.setHex(skinToneHex);
      }
    }
  });
}

function restoreBaseColors(actor: PedestrianActor): void {
  for (const [material, color] of actor.baseColors) {
    if ("color" in material && material.color instanceof THREE.Color) {
      material.color.copy(color);
    }
  }
}

function applyTint(actor: PedestrianActor, tintHex: number): void {
  const tint = new THREE.Color(tintHex);
  for (const [material, base] of actor.baseColors) {
    if (!("color" in material) || !(material.color instanceof THREE.Color)) {
      continue;
    }
    material.color.copy(base);
    if (tintHex !== 0xffffff) {
      material.color.lerp(tint, 0.38);
    }
  }
}
