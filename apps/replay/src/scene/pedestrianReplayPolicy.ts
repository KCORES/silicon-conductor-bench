import type { PedestrianState } from "../../../../src/core/types.js";

export const HUMAN_PEDESTRIAN_CHARACTER_FILES = [
  "Casual_Male.gltf",
  "Casual_Female.gltf",
  "Worker_Male.gltf",
  "Worker_Female.gltf",
  "Doctor_Male_Young.gltf",
  "Doctor_Female_Young.gltf",
  "Suit_Male.gltf",
  "OldClassy_Female.gltf",
] as const;

export const PEDESTRIAN_CHARACTER_FILES = [
  ...HUMAN_PEDESTRIAN_CHARACTER_FILES,
] as const;

export const PEDESTRIAN_TEMPLATE_COUNT = PEDESTRIAN_CHARACTER_FILES.length;

export type PedestrianClipName = "Idle" | "Walk" | "Death";

export const JAYWALK_TINT_HEX = 0xff8a3d;
/** Distance travelled by one complete two-step walk cycle, in body widths. */
export const PEDESTRIAN_WALK_CYCLE_WIDTHS = 2.2;

/** Diverse natural skin tones, ordered from light to dark. */
export const HUMAN_SKIN_TONE_HEXES = [
  0xf2d3b1,
  0xe8be98,
  0xd5a078,
  0xb97850,
  0x965f3c,
  0x744329,
  0x55301f,
  0x3b2417,
] as const;

const HUMAN_PEDESTRIAN_CHARACTER_SET = new Set<string>(
  HUMAN_PEDESTRIAN_CHARACTER_FILES,
);

export interface PedestrianActorLifecycle {
  readonly acquire: readonly string[];
  readonly retain: readonly string[];
  readonly recycle: readonly string[];
}

export interface PedestrianJaywalkCue {
  readonly tintHex: number;
  readonly haloVisible: boolean;
}

/** FNV-1a 32-bit so the same pedestrian ID always picks the same character. */
export function hashPedestrianId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pedestrianTemplateIndex(id: string): number {
  return hashPedestrianId(id) % PEDESTRIAN_TEMPLATE_COUNT;
}

export function pedestrianCharacterFile(id: string): string {
  const fileName = PEDESTRIAN_CHARACTER_FILES[pedestrianTemplateIndex(id)];
  if (fileName === undefined) {
    return PEDESTRIAN_CHARACTER_FILES[0];
  }
  return fileName;
}

/**
 * Returns a stable natural skin tone for known human models.
 * Fantasy and other special creatures retain their authored material colors.
 */
export function pedestrianSkinToneHex(
  id: string,
  characterFile: string,
): number | undefined {
  if (!HUMAN_PEDESTRIAN_CHARACTER_SET.has(characterFile)) {
    return undefined;
  }
  const index =
    hashPedestrianId(`skin-tone:${id}`) % HUMAN_SKIN_TONE_HEXES.length;
  return HUMAN_SKIN_TONE_HEXES[index];
}

export function pedestrianClipForState(
  state: PedestrianState,
): PedestrianClipName | undefined {
  switch (state) {
    case "APPROACHING":
    case "DEPARTING":
      return "Walk";
    case "WAITING":
      return "Idle";
    case "CROSSING_RESERVED":
    case "CROSSING_JAYWALK":
      return "Walk";
    case "INJURED":
      return "Death";
    case "CLEARED":
      return undefined;
  }
}

export function pedestrianJaywalkCue(
  state: PedestrianState,
): PedestrianJaywalkCue {
  if (state === "CROSSING_JAYWALK") {
    return { tintHex: JAYWALK_TINT_HEX, haloVisible: true };
  }
  return { tintHex: 0xffffff, haloVisible: false };
}

/**
 * Absolute mixer/action time from logical playback seconds.
 * Death holds the last frame; looping clips wrap so pause/seek/reverse stay deterministic.
 */
export function pedestrianActionTime(
  clip: PedestrianClipName,
  logicalSeconds: number,
  clipDuration: number,
  travelDistance?: number,
  bodyWidth?: number,
): number {
  if (clipDuration <= 0) {
    return 0;
  }
  if (clip === "Death") {
    return clipDuration;
  }
  const cycleDistance =
    bodyWidth === undefined
      ? undefined
      : Math.max(0.1, bodyWidth * PEDESTRIAN_WALK_CYCLE_WIDTHS);
  const playbackSeconds =
    clip === "Walk" &&
    travelDistance !== undefined &&
    cycleDistance !== undefined
      ? (travelDistance / cycleDistance) * clipDuration
      : logicalSeconds;
  const wrapped = playbackSeconds % clipDuration;
  const positive = wrapped < 0 ? wrapped + clipDuration : wrapped;
  return clipDuration - positive < 1e-8 ? 0 : positive;
}

export function pedestrianActorLifecycle(
  previousIds: readonly string[],
  nextIds: readonly string[],
): PedestrianActorLifecycle {
  const previous = new Set(previousIds);
  const next = new Set(nextIds);
  return {
    acquire: nextIds.filter((id) => !previous.has(id)),
    retain: nextIds.filter((id) => previous.has(id)),
    recycle: previousIds.filter((id) => !next.has(id)),
  };
}
