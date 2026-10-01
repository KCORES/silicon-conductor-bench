import * as THREE from "three";
import { computeContactAo } from "./contactAo.js";

export function bakeGeometryContactAo(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute("contactAo") !== undefined) {
    return;
  }
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (position === undefined || normal === undefined) {
    return;
  }
  const positions = new Float32Array(position.count * 3);
  const normals = new Float32Array(normal.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    positions[index * 3] = position.getX(index);
    positions[index * 3 + 1] = position.getY(index);
    positions[index * 3 + 2] = position.getZ(index);
    normals[index * 3] = normal.getX(index);
    normals[index * 3 + 1] = normal.getY(index);
    normals[index * 3 + 2] = normal.getZ(index);
  }
  const index = geometry.getIndex();
  let indices: Uint32Array | null = null;
  if (index !== null) {
    indices = new Uint32Array(index.count);
    for (let offset = 0; offset < index.count; offset += 1) {
      indices[offset] = index.getX(offset);
    }
  }
  geometry.setAttribute(
    "contactAo",
    new THREE.BufferAttribute(computeContactAo(positions, normals, indices), 1),
  );
}

/**
 * Multiply baked contact AO into indirect light and the sun term.
 * Three.js aoMap only scales indirect light, which leaves creases flat in direct sun.
 */
export function applyContactAoMaterial(material: THREE.MeshStandardMaterial): void {
  if (material.userData.contactAo === true) {
    return;
  }
  material.userData.contactAo = true;
  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|contact-ao`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float contactAo;\nvarying float vContactAo;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvContactAo = contactAo;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vContactAo;",
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= vContactAo;
reflectedLight.directDiffuse *= vContactAo;
reflectedLight.directSpecular *= vContactAo;`,
      );
  };
}
