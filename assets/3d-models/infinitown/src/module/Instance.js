import * as THREE from 'three';
import bluebird from 'bluebird';
import 'module/loader/BaseMaterialLoader';
import loaderUtils from 'module/utils/LoaderUtils';
import 'module/material/PBRMaterial';
import 'module/scene/LoadSceneManager';

class Instance {
  static loadScene(name, data, scene, callback) {
    const suffix = typeof callback === 'string' ? callback : '.json';

    return new bluebird(function (resolve, reject) {
      const binaryGeometryBuffer = loaderUtils.getGeometry(name);
      if (binaryGeometryBuffer) {
        loaderUtils.sceneLoader.setBinaryGeometryBuffer(binaryGeometryBuffer);
      }

      loaderUtils
        .loadScene(data + name + suffix)
        .then(function (result) {
          const sceneParam = Array.isArray(result) ? result[0] : result;
          const json = Array.isArray(result) ? result[1] : null;

          sceneParam.materials = {};

          if (sceneParam.animations) {
            const mixer = new THREE.AnimationMixer(sceneParam);
            for (let i = 0; i < sceneParam.animations.length; i++) {
              mixer.clipAction(sceneParam.animations[i]).play();
            }
          }

          sceneParam.traverse(function (object3D) {
            if (object3D.material) {
              if (object3D.material.materials) {
                object3D.material.materials.forEach(function (material) {
                  sceneParam.materials[material.uuid] = material;
                });
              } else {
                sceneParam.materials[object3D.material.uuid] = object3D.material;
              }
            }
          });

          resolve(sceneParam);
        })
        .catch(reject);
    });
  }
}

export default Instance;
