import { RawShaderMaterial, Material } from 'three';

const keys = ['side', 'alphaTest', 'transparent', 'depthWrite', 'wireframe'];

class BaseRawShaderMaterial extends RawShaderMaterial {
  constructor(obj) {
    obj = obj || {};
    super(obj);
    const self = this;
    _.each(keys, function (property) {
      const method = obj[property];
      if (method !== undefined) {
        self[property] = method;
      }
    });
  }

  onPropertyChange(e, prop) {
    Object.defineProperty(this, e, {
      get() {
        return this['_' + e];
      },
      set(result) {
        this['_' + e] = result;
        prop.call(this, result);
      },
    });
  }

  clone(materialTmp) {
    const material = materialTmp || new Material();
    super.clone(material);
    material.wireframe = this.wireframe;
    material.wireframeLinewidth = this.wireframeLinewidth;
    material.fog = this.fog;
    material.lights = this.lights;
    material.vertexColors = this.vertexColors;
    material.skinning = this.skinning;
    return material;
  }
}

export default BaseRawShaderMaterial;
