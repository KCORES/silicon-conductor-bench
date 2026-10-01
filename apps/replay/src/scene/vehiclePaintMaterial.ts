import * as THREE from "three";

export interface VehiclePaintTint {
  readonly hex: string;
  readonly darkCutoff: number;
  readonly brightCutoff: number;
}

const PAINT_CHUNK = `
{
  vec3 paintLinear = pow(max(paintColor, vec3(0.0)), vec3(2.2));
  float luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float paintLuma = max(dot(paintLinear, vec3(0.2126, 0.7152, 0.0722)), 0.001);
  float bodyMask = smoothstep(paintDark, paintDark + 0.08, luma)
    * (1.0 - smoothstep(paintBright - 0.08, paintBright, luma));
  diffuseColor.rgb = mix(diffuseColor.rgb, paintLinear * (luma / paintLuma), bodyMask);
}
`;

export function applyVehiclePaint(
  root: THREE.Object3D,
  tint: VehiclePaintTint,
): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || isWheelNode(child, root)) {
      return;
    }
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) =>
        material instanceof THREE.MeshStandardMaterial
          ? paintMaterial(material, tint)
          : material,
      );
      return;
    }
    if (child.material instanceof THREE.MeshStandardMaterial) {
      child.material = paintMaterial(child.material, tint);
    }
  });
}

function paintMaterial(
  source: THREE.MeshStandardMaterial,
  tint: VehiclePaintTint,
): THREE.MeshStandardMaterial {
  const material = source.clone();
  if (material.map === null) {
    material.color.set(tint.hex);
    return material;
  }
  material.color.set(0xffffff);
  try {
    installPaintShader(material, tint);
  } catch {
    material.color.set(tint.hex);
  }
  return material;
}

function installPaintShader(
  material: THREE.MeshStandardMaterial,
  tint: VehiclePaintTint,
): void {
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|vehicle-paint`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.paintColor = { value: new THREE.Color(tint.hex) };
    shader.uniforms.paintDark = { value: tint.darkCutoff };
    shader.uniforms.paintBright = { value: tint.brightCutoff };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 paintColor;\nuniform float paintDark;\nuniform float paintBright;",
      )
      .replace("#include <map_fragment>", `#include <map_fragment>\n${PAINT_CHUNK}`);
  };
  material.needsUpdate = true;
}

function isWheelNode(object: THREE.Object3D, root: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current !== null && current !== root) {
    if (/(?:wheel|tire|tyre)/iu.test(current.name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
