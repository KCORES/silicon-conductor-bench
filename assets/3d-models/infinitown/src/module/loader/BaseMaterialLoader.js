import * as THREE from 'three';
import { TextureLoader } from 'three';
import { cloneUniforms } from 'three/src/renderers/shaders/UniformsUtils.js';
import 'module/material/BaseShaderMaterial';
import PBRMaterial from 'module/material/PBRMaterial';
import MatcapMaterial from 'module/material/MatcapMaterial';
import 'module/utils/LoaderUtils';
import shaders from 'module/render/shaders';

const THREEMateriaLoaderparse = THREE.MaterialLoader.prototype.parse;
const textureLoader = new TextureLoader();

THREE.MaterialLoader.prototype.parse = function (options) {
  const col = options.color;
  options.color = undefined;
  const json = THREEMateriaLoaderparse.call(this, options);
  options.color = col;

  if (options.customType && options.customType === 'MatcapMaterial') {
    return MatcapMaterial.create({
      uuid: options.uuid,
      name: options.name,
      normalMap: json.normalMap,
      matcapMap: textureLoader.load('textures/matcap.jpg'),
      normalMapFactor: 1,
    });
  }

  if (options.customType && options.customType === 'PBRMaterial') {
    const metalGlossMap = options.metalGlossMap ? this.textures[options.metalGlossMap] : null;
    const albedoMap2 = options.map2 ? this.textures[options.map2] : null;
    const normalMap2 = options.normalMap2 ? this.textures[options.normalMap2] : null;
    const aoMap2 = options.aoMap2 ? this.textures[options.aoMap2] : null;
    const lightMapM = options.lightMapM ? this.textures[options.lightMapM] : null;
    const lightMapDir = options.lightMapDir ? this.textures[options.lightMapDir] : null;
    const materialEmissiveMapRow = options.emissiveMap ? this.textures[options.emissiveMap] : null;
    const packedMap = options.packedPBRMap ? this.textures[options.packedPBRMap] : null;

    return PBRMaterial.create({
      vertexShader: shaders['pbr.vs'],
      fragmentShader: shaders['pbr.fs'],
      uuid: options.uuid,
      name: options.name,
      color: options.color,
      opacity: json.opacity,
      transparent: json.transparent,
      alphaTest: json.alphaTest,
      environment: options.environment,
      exposure: options.exposure,
      albedoMap: json.map,
      albedoMap2: albedoMap2,
      metalGlossMap: metalGlossMap,
      packedMap: packedMap,
      metalFactor: options.metalFactor,
      glossFactor: options.glossFactor,
      normalMapFactor: options.normalFactor,
      normalMap: json.normalMap,
      normalMap2: normalMap2,
      lightMap: json.lightMap,
      lightMapM: lightMapM,
      lightMapDir: lightMapDir,
      aoMap: json.aoMap,
      aoMap2: aoMap2,
      aoFactor: options.aoFactor,
      occludeSpecular: options.occludeSpecular,
      emissiveMap: materialEmissiveMapRow,
    });
  }

  if (options.customType === 'SkyboxMaterial') {
    const shader = THREE.ShaderLib.cube;
    json.vertexShader = shaders['skybox.vs'];
    json.fragmentShader = shaders['skybox.fs'];
    json.uniforms = cloneUniforms(shader.uniforms);
    json.uniforms.tCube.value = this.textures[options.cubemap];
  }

  return json;
};
