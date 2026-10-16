import type { Object3D } from "three";
import type { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const SCORE_SHAKE_FRAMES: Keyframe[] = [
  { transform: "translateX(0)" },
  { transform: "translateX(-3px) rotate(-2deg)", offset: 0.2 },
  { transform: "translateX(3px) rotate(2deg)", offset: 0.4 },
  { transform: "translateX(-2px)", offset: 0.6 },
  { transform: "translateX(2px)", offset: 0.8 },
  { transform: "translateX(0)" },
];

const DEMO_PENALTY_PULSE_FRAMES: Keyframe[] = [
  { transform: "translateY(2px) scale(0.94)", filter: "brightness(1.7)" },
  { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
];

/** Hidden labels stay out of the scene so CSS2DRenderer does not visit them. */
export function setCss2DMounted(
  label: CSS2DObject,
  parent: Object3D,
  visible: boolean,
): void {
  label.visible = visible;
  if (visible) {
    if (label.parent !== parent) {
      parent.add(label);
    }
    return;
  }
  if (label.parent !== null) {
    label.removeFromParent();
  }
}

export function replayScoreShake(element: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  for (const animation of element.getAnimations()) {
    animation.cancel();
  }
  element.animate(SCORE_SHAKE_FRAMES, { duration: 300, easing: "ease" });
}

export function replayDemoPenaltyPulse(element: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  for (const animation of element.getAnimations()) {
    animation.cancel();
  }
  element.animate(DEMO_PENALTY_PULSE_FRAMES, {
    duration: 100,
    easing: "ease-out",
  });
}
