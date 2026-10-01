import type {
  ReplayBundle,
  ReplayEvent,
  ReplayPedestrianPose,
  ReplayVehiclePose,
} from "@replay/types.js";
import {
  collectCrossedAccidents,
  playbackCueMode,
} from "@replay/accidentCues.js";
import {
  advancePlayback,
  beginScrub,
  createPlaybackState,
  currentLogicalTick,
  endScrub,
  interpolateFramePedestrians,
  interpolateFrameVehicles,
  interpolateVehiclePose,
  jumpToDecision,
  pedestrianMotionTransitions,
  readFramePedestrians,
  pause,
  play,
  scrubToTick,
  setAutoPauseOnDecision,
  setSpeed,
  stepFrame,
  vehicleMotionTransitions,
  type PlaybackContext,
  type PlaybackState,
} from "@replay/playback.js";
import { withDerivedVehicleScores } from "@replay/derive-scores.js";
import { deriveRunSettlement } from "@replay/run-settlement.js";
import {
  ReplayLoadError,
  isDryRunPayload,
  parseReplayBundle,
  readReplayFile,
} from "./loadReplay.js";
import { TrafficScene, type DebugSceneMode } from "./scene/TrafficScene.js";
import {
  buildPedestrianTravelIndex,
  interpolatePedestrianWorldPose,
  mapPedestrianWorldPose,
  pedestrianTravelDistanceAt,
  type PedestrianTravelIndex,
} from "./scene/pedestrianReplayMotion.js";
import { CommandHud } from "./ui/hud.js";
import { ReplayList } from "./replay-list.js";
import { SettlementOverlay } from "./ui/settlement-overlay.js";
import {
  createDemoBundle,
  traditionalSignalPhaseAtTick,
  type DemoId,
} from "./demo/demoScenarios.js";
import {
  completeDemo,
  createDemoPlaybackState,
  toggleDemoPlaying,
  toggleDemoSelection,
  type DemoPlaybackState,
} from "./demo/demoPlayback.js";
import {
  ambulanceDemoPenalty,
  chainCrashDemoPenalties,
} from "./demo/demoPenalty.js";
import type { TrafficLogicPrecision } from "./scene/trafficLogicGrid.js";

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
const hudRoot = document.querySelector<HTMLElement>("#hud");
const replayListRoot = document.querySelector<HTMLElement>("#replay-list");
const settlementRoot = document.querySelector<HTMLElement>("#settlement");
if (
  canvas === null ||
  hudRoot === null ||
  replayListRoot === null ||
  settlementRoot === null
) {
  throw new Error("Replay viewer markup is missing a required root element");
}

const scene = new TrafficScene(canvas);
let debugMode: DebugSceneMode = "replay";
let randomFleetSeed = 1;
let xRayEnabled = false;
let xRayCellIdsEnabled = false;
let xRayVehicleIdsEnabled = false;
let xRayPedestrianIdsEnabled = false;
let xRayPrecision: TrafficLogicPrecision = "route-estimate";
const hud = new CommandHud(hudRoot, {
  onPlay: () => {
    if (debugMode === "replay" && demoPlayback.activeId === null) {
      settlement.close();
      mutate((state) => play(state));
    }
  },
  onPause: () => {
    if (demoPlayback.activeId === null) {
      mutate((state) => pause(state, "user"));
    }
  },
  onSpeed: (speed) => {
    if (debugMode === "replay" && demoPlayback.activeId === null) {
      mutate((state) => setSpeed(state, speed));
    }
  },
  onAutoPause: (enabled) =>
    mutate((state) => setAutoPauseOnDecision(state, enabled)),
  onScrubStart: () => {
    if (debugMode !== "replay" || demoPlayback.activeId !== null) {
      return;
    }
    mutate((state) => beginScrub(state));
  },
  onScrub: (tick) => {
    const playback = context;
    if (
      playback === undefined ||
      debugMode !== "replay" ||
      demoPlayback.activeId !== null
    ) {
      return;
    }
    mutate((current) => scrubToTick(current, tick, playback));
  },
  onScrubEnd: () => {
    const playback = context;
    if (
      playback === undefined ||
      debugMode !== "replay" ||
      demoPlayback.activeId !== null
    ) {
      return;
    }
    mutate((current) => endScrub(current, playback));
  },
  onStep: (direction) => {
    const playback = context;
    if (
      playback === undefined ||
      debugMode !== "replay" ||
      demoPlayback.activeId !== null
    ) {
      return;
    }
    mutate((current) => stepFrame(current, playback, direction));
  },
  onJumpDecision: (direction) => {
    const playback = context;
    if (
      playback === undefined ||
      debugMode !== "replay" ||
      demoPlayback.activeId !== null
    ) {
      return;
    }
    mutate((current) => jumpToDecision(current, playback, direction));
  },
  onFile: (file) => {
    void loadFile(file);
  },
  onOpenRuns: () => {
    settlement.close();
    replayList.open();
  },
  onScoreBubbles: (enabled) => {
    scene.setScoreBubblesVisible(enabled);
  },
  onXRay: (enabled) => {
    xRayEnabled = enabled;
    xRayPrecision = "route-estimate";
    scene.setXRayMode(enabled);
    refresh();
  },
  onXRayCellIds: (enabled) => {
    xRayCellIdsEnabled = enabled;
    scene.setXRayCellIdsVisible(enabled);
    refresh();
  },
  onXRayVehicleIds: (enabled) => {
    xRayVehicleIdsEnabled = enabled;
    scene.setXRayVehicleIdsVisible(enabled);
    refresh();
  },
  onXRayPedestrianIds: (enabled) => {
    xRayPedestrianIdsEnabled = enabled;
    scene.setXRayPedestrianIdsVisible(enabled);
    refresh();
  },
  onToggleDemo: (id) => {
    toggleDemo(id);
  },
  onDebugCatalog: () => {
    void changeDebugMode("catalog");
  },
  onDebugRandomFleet: () => {
    if (debugMode === "randomFleet") {
      randomFleetSeed += 1;
    }
    void changeDebugMode("randomFleet", randomFleetSeed);
  },
  onDebugReturn: () => {
    void changeDebugMode("replay");
  },
});

const replayList = new ReplayList(replayListRoot, {
  onPick: (replayFile) => {
    void loadReplayUrl(replayFile);
  },
});
const settlement = new SettlementOverlay(settlementRoot, {
  onReplay: () => restartPlayback(),
  onClose: () => settlement.close(),
});

let bundle: ReplayBundle | undefined;
let context: PlaybackContext | undefined;
let state = createPlaybackState();
let demoPlayback = createDemoPlaybackState();
let savedReplay: SavedReplay | undefined;
let notice: string | undefined;
let last = performance.now();
let lastEventCursor = state.eventCursor;
const pedestrianTravelIndexes = new WeakMap<
  ReplayBundle,
  PedestrianTravelIndex
>();

interface SavedReplay {
  readonly bundle: ReplayBundle | undefined;
  readonly context: PlaybackContext | undefined;
  readonly state: PlaybackState;
  readonly lastEventCursor: number;
}

await scene.loadWorld();
if (scene.usedFallbackGeometry) {
  notice = "Kenney GLB assets failed to load. Showing placeholder geometry.";
}
await loadDefaultSample();
bindResize();
bindPlaybackKeyboard();
refresh();
requestAnimationFrame(loop);

async function loadDefaultSample(): Promise<void> {
  try {
    const response = await fetch("/sample-replay.json");
    if (!response.ok) {
      return;
    }
    applyBundle(parseReplayBundle(await response.json()));
  } catch {
    // Optional demo fixture; the file picker remains the primary loader.
  }
}

function applyBundle(next: ReplayBundle): void {
  discardDemoMode();
  settlement.close();
  const scored = withDerivedVehicleScores(next);
  bundle = scored;
  scene.setReplayScene(scored.scene);
  context = {
    frames: scored.frames,
    events: scored.events,
    tickDurationMs: scored.tickDurationMs,
    eventHoldMs: 200,
  };
  state = createPlaybackState();
  lastEventCursor = state.eventCursor;
  scene.clearAccidentBursts();
}

function toggleDemo(id: DemoId): void {
  const wasActive = demoPlayback.activeId;
  const next = toggleDemoSelection(demoPlayback, id);
  if (next.activeId === null) {
    restoreSavedReplay();
    return;
  }
  if (wasActive === null) {
    savedReplay = {
      bundle,
      context,
      state: pause(state, "user"),
      lastEventCursor,
    };
  }
  installDemo(next);
}

function installDemo(next: DemoPlaybackState): void {
  const id = next.activeId;
  if (id === null) {
    return;
  }
  settlement.close();
  replayList.close();
  scene.clearAccidentBursts();
  scene.setTrafficLightsBendProgress(0);
  mountDemoBundle(id);
  state = createPlaybackState();
  lastEventCursor = state.eventCursor;
  demoPlayback = next;
  refresh();
}

function mountDemoBundle(id: DemoId): void {
  const demo = createDemoBundle(id);
  bundle = demo;
  context = {
    frames: demo.frames,
    events: demo.events,
    tickDurationMs: demo.tickDurationMs,
    eventHoldMs: 0,
  };
  scene.setReplayScene(demo.scene);
}

function restoreSavedReplay(): void {
  scene.setTrafficLightsBendProgress(0);
  scene.clearAccidentBursts();
  demoPlayback = createDemoPlaybackState();
  const saved = savedReplay;
  savedReplay = undefined;
  if (saved === undefined) {
    bundle = undefined;
    context = undefined;
    state = createPlaybackState();
    lastEventCursor = state.eventCursor;
    scene.setReplayScene(undefined);
  } else {
    bundle = saved.bundle;
    context = saved.context;
    state = pause(saved.state, "user");
    lastEventCursor = saved.lastEventCursor;
    scene.setReplayScene(saved.bundle?.scene);
  }
  refresh();
}

function discardDemoMode(): void {
  if (demoPlayback.activeId === null) {
    return;
  }
  scene.setTrafficLightsBendProgress(0);
  demoPlayback = createDemoPlaybackState();
  savedReplay = undefined;
}

function toggleActiveDemoPlayback(): void {
  const previous = demoPlayback;
  const next = toggleDemoPlaying(previous);
  if (next === previous) {
    return;
  }
  if (previous.phase === "complete" && next.phase === "playing") {
    if (previous.activeId === "traditional-signal-cycle") {
      mountDemoBundle(previous.activeId);
    }
    state = play(createPlaybackState());
    scene.clearAccidentBursts();
    scene.setTrafficLightsBendProgress(0);
    lastEventCursor = state.eventCursor;
  } else if (next.phase === "playing") {
    state = play(state);
  } else {
    state = pause(state, "user");
  }
  demoPlayback = next;
  refresh();
}

async function loadFile(file: File): Promise<void> {
  settlement.close();
  await changeDebugMode("replay");
  try {
    applyBundle(await readReplayFile(file));
    notice = undefined;
    replayList.close();
  } catch (error) {
    bundle = undefined;
    context = undefined;
    scene.setReplayScene(undefined);
    notice =
      error instanceof ReplayLoadError
        ? error.message
        : "Could not load the replay file.";
  }
  refresh();
}

async function loadReplayUrl(replayFile: string): Promise<void> {
  settlement.close();
  replayList.setStatus("正在加载回放…");
  await changeDebugMode("replay");
  try {
    const response = await fetch(`/api/replays/${encodeURIComponent(replayFile)}`);
    if (!response.ok) {
      throw new ReplayLoadError("找不到这次运行的回放文件。");
    }
    applyBundle(parseReplayBundle(await response.json()));
    notice = undefined;
    replayList.close();
  } catch (error) {
    notice =
      error instanceof ReplayLoadError
        ? error.message
        : "Could not load the replay file.";
    replayList.setStatus(notice);
  }
  refresh();
}

async function changeDebugMode(
  mode: DebugSceneMode,
  seed = randomFleetSeed,
): Promise<void> {
  if (mode !== "replay") {
    settlement.close();
  }
  const previous = debugMode;
  debugMode = mode;
  if (mode !== "replay") {
    state = pause(state, "user");
  }
  try {
    await scene.setDebugMode(mode, seed);
  } catch {
    debugMode = previous;
    notice = "Could not load the debug vehicle view.";
    await scene.setDebugMode(previous, randomFleetSeed).catch(() => undefined);
  }
  refresh();
}

function mutate(update: (current: PlaybackState) => PlaybackState): void {
  state = update(state);
  refresh();
}

function loop(now: number): void {
  const delta = now - last;
  last = now;
  const wasPlaying = state.playing && !state.isScrubbing;
  if (context !== undefined) {
    state = advancePlayback(state, delta, context);
  }
  draw(delta / 1000, wasPlaying);
  if (
    wasPlaying &&
    !state.playing &&
    state.pausedReason === "complete" &&
    bundle !== undefined &&
    debugMode === "replay" &&
    demoPlayback.activeId === null
  ) {
    replayList.close();
    settlement.open(deriveRunSettlement(bundle));
  }
  if (
    demoPlayback.activeId !== null &&
    demoPlayback.phase === "playing" &&
    !state.playing &&
    state.pausedReason === "complete"
  ) {
    demoPlayback = completeDemo(demoPlayback);
  }
  hud.render(
    bundle,
    state,
    context,
    notice,
    debugMode,
    demoPlayback.activeId,
    demoPlayback.phase,
    xRayEnabled,
    xRayPrecision,
    xRayCellIdsEnabled,
    xRayVehicleIdsEnabled,
    xRayPedestrianIdsEnabled,
  );
  requestAnimationFrame(loop);
}

function draw(deltaSeconds: number, wasPlaying: boolean): void {
  if (bundle !== undefined && context !== undefined) {
    const frame = bundle.frames[state.frameIndex];
    const next = bundle.frames[state.frameIndex + 1];
    let visibleVehicles: readonly ReplayVehiclePose[] = [];
    let visiblePedestrians: readonly ReplayPedestrianPose[] = [];
    if (frame !== undefined) {
      const logicalTick = currentLogicalTick(state, context);
      const recordedVehicles = interpolateFrameVehicles(
        frame,
        next,
        state.alpha,
      );
      const vehicleTransitions = vehicleMotionTransitions(
        context.frames,
        state.frameIndex,
        logicalTick,
      );
      const vehicleTransitionsById = new Map(
        vehicleTransitions.map((transition) => [transition.id, transition]),
      );
      const vehicles = recordedVehicles.map((vehicle) => {
        const transition = vehicleTransitionsById.get(vehicle.id);
        return transition === undefined
          ? vehicle
          : interpolateVehiclePose(
              transition.from,
              transition.to,
              transition.alpha,
            );
      });
      visibleVehicles = vehicles;
      scene.applyVehicles(vehicles, collectHighlights(bundle, state, context));
      if (next !== undefined && frame.tick !== next.tick) {
        slerpVisibleVehicles(
          frame.vehicles,
          next.vehicles,
          state.alpha,
          new Set(vehicleTransitionsById.keys()),
        );
      }
      for (const transition of vehicleTransitions) {
        scene.interpolateVehicle(
          transition.id,
          transition.from,
          transition.to,
          transition.alpha,
        );
      }
      const logicalSeconds = (logicalTick * context.tickDurationMs) / 1000;
      const pedestrians = interpolateFramePedestrians(frame, next, state.alpha);
      visiblePedestrians = pedestrians;
      if (debugMode === "replay") {
        const pedestrianTransitions = pedestrianMotionTransitions(
          context.frames,
          state.frameIndex,
          logicalTick,
        );
        const walkingPedestrianIds = new Set(
          pedestrianTransitions
            .filter(
              (transition) =>
                transition.from.state === "WAITING" && transition.alpha > 0,
            )
            .map((transition) => transition.id),
        );
        const transitionsById = new Map(
          pedestrianTransitions.map((transition) => [transition.id, transition]),
        );
        const recordedById = new Map(
          readFramePedestrians(frame).map((pedestrian) => [
            pedestrian.id,
            pedestrian,
          ]),
        );
        const travelIndex = pedestrianTravelIndexFor(bundle);
        const crosswalks = bundle.scene.crosswalks;
        const travelDistances = new Map(
          pedestrians.map((pedestrian) => {
            const approach = crosswalks.find(
              (crosswalk) => crosswalk.id === pedestrian.crosswalkId,
            )?.approach;
            const recorded = recordedById.get(pedestrian.id) ?? pedestrian;
            const transition = transitionsById.get(pedestrian.id);
            const visibleWorld =
              transition === undefined
                ? mapPedestrianWorldPose(pedestrian, approach)
                : interpolatePedestrianWorldPose(
                    transition.from,
                    transition.to,
                    transition.alpha,
                    approach,
                  );
            return [
              pedestrian.id,
              pedestrianTravelDistanceAt(
                travelIndex,
                state.frameIndex,
                pedestrian.id,
                mapPedestrianWorldPose(recorded, approach),
                visibleWorld,
              ),
            ] as const;
          }),
        );
        scene.applyPedestrians(
          pedestrians,
          logicalSeconds,
          walkingPedestrianIds,
          travelDistances,
        );
        if (next !== undefined && frame.tick !== next.tick) {
          slerpVisiblePedestrians(
            readFramePedestrians(frame),
            readFramePedestrians(next),
            state.alpha,
          );
        }
        for (const transition of pedestrianTransitions) {
          scene.interpolatePedestrian(
            transition.id,
            transition.from,
            transition.to,
            transition.alpha,
          );
        }
        visiblePedestrians = pedestrians.map((pedestrian) => {
          const approach = bundle?.scene.crosswalks.find(
            (crosswalk) => crosswalk.id === pedestrian.crosswalkId,
          )?.approach;
          const transition = transitionsById.get(pedestrian.id);
          const world =
            transition === undefined
              ? mapPedestrianWorldPose(pedestrian, approach)
              : interpolatePedestrianWorldPose(
                  transition.from,
                  transition.to,
                  transition.alpha,
                  approach,
                );
          return { ...pedestrian, ...world, worldSpace: true };
        });
      } else {
        scene.applyPedestrians([], logicalSeconds);
      }
      scene.applyCollisionVisuals(bundle, logicalTick, visibleVehicles);
    }
    syncAccidentCues(wasPlaying);
    const activeEvent = context.events[state.eventCursor];
    scene.showEvent(activeEvent, bundle);
    xRayPrecision = scene.updateTrafficLogic(
      bundle,
      visibleVehicles,
      visiblePedestrians,
      currentLogicalTick(state, context),
      activeEvent,
      state.frameIndex,
    );
  }
  if (demoPlayback.activeId === "traffic-light-bend" && context !== undefined) {
    const progress =
      bundle === undefined || bundle.totalTicks <= 0
        ? 0
        : currentLogicalTick(state, context) / bundle.totalTicks;
    scene.setTrafficLightsBendProgress(progress);
  }
  if (
    demoPlayback.activeId === "traditional-signal-cycle" &&
    context !== undefined
  ) {
    scene.setTrafficSignalPhase(
      traditionalSignalPhaseAtTick(currentLogicalTick(state, context)),
    );
  } else {
    scene.setTrafficSignalPhase(undefined);
  }
  scene.setDemoCamera(
    debugMode !== "replay"
      ? undefined
      : demoPlayback.activeId === "pedestrian-crossing"
        ? "pedestrian"
        : demoPlayback.activeId === "realistic-collision-visual"
          ? "collision"
          : undefined,
  );
  if (demoPlayback.activeId === "blocked-ambulance" && context !== undefined) {
    scene.setDemoPenalty(
      "demo-ambulance",
      ambulanceDemoPenalty(
        currentLogicalTick(state, context),
        context.tickDurationMs,
      ),
    );
  } else if (
    demoPlayback.activeId === "chain-reaction-crash" &&
    context !== undefined
  ) {
    scene.setDemoPenalties(
      chainCrashDemoPenalties(
        currentLogicalTick(state, context),
        context.tickDurationMs,
      ),
    );
  } else {
    scene.setDemoPenalty(undefined, 0);
  }
  scene.update(settlement.isOpen ? 0 : deltaSeconds);
}

function restartPlayback(): void {
  if (context === undefined || bundle === undefined) {
    settlement.close();
    return;
  }
  const speed = state.speed;
  const autoPauseOnDecision = state.autoPauseOnDecision;
  settlement.close();
  scene.clearAccidentBursts();
  state = play(createPlaybackState({ speed, autoPauseOnDecision }));
  lastEventCursor = state.eventCursor;
  refresh();
}

function syncAccidentCues(wasPlaying: boolean): void {
  const playback = context;
  const current = bundle;
  if (playback === undefined || current === undefined) {
    return;
  }
  const nextCursor = state.eventCursor;
  const mode = playbackCueMode({
    wasPlaying,
    isScrubbing: state.isScrubbing,
    previousCursor: lastEventCursor,
    nextCursor,
  });
  if (mode === "seek") {
    scene.clearAccidentBursts();
  } else if (mode === "forward") {
    for (const event of collectCrossedAccidents(
      playback.events,
      lastEventCursor,
      nextCursor,
    )) {
      scene.triggerAccident(event, current);
    }
  }
  lastEventCursor = nextCursor;
}

function slerpVisibleVehicles(
  from: readonly ReplayVehiclePose[],
  to: readonly ReplayVehiclePose[],
  alpha: number,
  excludedIds: ReadonlySet<string> = new Set(),
): void {
  const incoming = new Map(to.map((vehicle) => [vehicle.id, vehicle]));
  for (const vehicle of from) {
    if (excludedIds.has(vehicle.id)) {
      continue;
    }
    const next = incoming.get(vehicle.id);
    if (next !== undefined) {
      scene.interpolateVehicle(vehicle.id, vehicle, next, alpha);
    }
  }
}

function slerpVisiblePedestrians(
  from: readonly ReplayPedestrianPose[],
  to: readonly ReplayPedestrianPose[],
  alpha: number,
): void {
  const incoming = new Map(to.map((pedestrian) => [pedestrian.id, pedestrian]));
  for (const pedestrian of from) {
    const next = incoming.get(pedestrian.id);
    if (next !== undefined) {
      scene.interpolatePedestrian(pedestrian.id, pedestrian, next, alpha);
    }
  }
}

function pedestrianTravelIndexFor(
  current: ReplayBundle,
): PedestrianTravelIndex {
  const cached = pedestrianTravelIndexes.get(current);
  if (cached !== undefined) {
    return cached;
  }
  const approaches = new Map(
    current.scene.crosswalks.map((crosswalk) => [
      crosswalk.id,
      crosswalk.approach,
    ]),
  );
  const created = buildPedestrianTravelIndex(current.frames, approaches);
  pedestrianTravelIndexes.set(current, created);
  return created;
}

function collectHighlights(
  current: ReplayBundle,
  playback: PlaybackState,
  playbackContext: PlaybackContext,
): Map<string, number> {
  const highlights = new Map<string, number>();
  const tick = currentLogicalTick(playback, playbackContext);
  const cycle = [...current.cycles]
    .reverse()
    .find((item) => tick >= item.decisionTick);
  for (const candidate of cycle?.observation.stoplineCandidates ?? []) {
    highlights.set(candidate.vehicleId, 0xe8a317);
  }
  for (const vehicleId of cycle?.admittedVehicleIds ?? []) {
    highlights.set(vehicleId, 0x5ee0c8);
  }
  const event: ReplayEvent | undefined =
    playbackContext.events[playback.eventCursor];
  if (event?.kind === "DRY_RUN_ADMIT" && isDryRunPayload(event.payload)) {
    for (const candidate of event.payload.candidates) {
      highlights.set(candidate.vehicleId, 0x5ee0c8);
    }
    for (const vehicleId of event.payload.conflict?.conflictingVehicleIds ?? []) {
      highlights.set(vehicleId, 0xff4d3d);
    }
  }
  if (event?.kind === "LANE_GUIDANCE") {
    const payload =
      typeof event.payload === "object" && event.payload !== null
        ? (event.payload as Record<string, unknown>)
        : {};
    if (typeof payload.vehicleId === "string") {
      highlights.set(payload.vehicleId, 0x4fc3f7);
    }
  }
  return highlights;
}

function refresh(): void {
  hud.render(
    bundle,
    state,
    context,
    notice,
    debugMode,
    demoPlayback.activeId,
    demoPlayback.phase,
    xRayEnabled,
    xRayPrecision,
    xRayCellIdsEnabled,
  );
}

function bindResize(): void {
  window.addEventListener("resize", () => scene.resize());
}

function bindPlaybackKeyboard(): void {
  document.addEventListener("keydown", (event) => {
    if (
      event.code !== "Space" ||
      event.repeat ||
      debugMode !== "replay" ||
      settlement.isOpen ||
      replayList.isOpen ||
      isEditableTarget(event.target)
    ) {
      return;
    }
    if (demoPlayback.activeId !== null) {
      event.preventDefault();
      toggleActiveDemoPlayback();
      return;
    }
    if (
      bundle === undefined ||
      context === undefined ||
      state.isScrubbing
    ) {
      return;
    }
    event.preventDefault();
    if (state.playing) {
      mutate((current) => pause(current, "user"));
    } else {
      mutate((current) => play(current));
    }
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select, button, [contenteditable]") !==
        null)
  );
}
