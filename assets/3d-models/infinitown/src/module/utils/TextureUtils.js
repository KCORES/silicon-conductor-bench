import { DataTexture, RGBAFormat, UnsignedByteType } from 'three';

class TextureUtils {
  static CreateWhiteTexture(width, height) {
    const dataTexture = TextureUtils.CreateDataTexture(width, height);
    dataTexture.image.data.fill(255);
    return dataTexture;
  }

  static CreateBlackTexture(width, height) {
    const dataTexture = TextureUtils.CreateDataTexture(width, height);
    dataTexture.image.data.fill(0);
    return dataTexture;
  }

  static CreateNormalTexture(width, height) {
    const dataTexture = TextureUtils.CreateDataTexture(width, height);
    const data = dataTexture.image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128;
      data[i + 1] = 128;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    return dataTexture;
  }

  static CreateDataTexture(width = 4, height = 4) {
    const length = width * height * 4;
    const typeArray = new Uint8Array(length);
    const texture = new DataTexture(typeArray, width, height, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;
    return texture;
  }
}

export default TextureUtils;
