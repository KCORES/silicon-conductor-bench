import * as TWEEN from '@tweenjs/tween.js';
import _ from 'lodash';

window.TWEEN = TWEEN;
window._ = _;

Number.prototype.lerp = function (minIn, maxIn) {
  return this + (minIn - this) * maxIn;
};

if (!String.prototype.endsWith) {
  String.prototype.endsWith = function (value, offset) {
    const buffer = this.toString();
    if (typeof offset !== 'number' || !isFinite(offset) || Math.floor(offset) !== offset || offset > buffer.length) {
      offset = buffer.length;
    }
    offset = offset - value.length;
    const count = buffer.indexOf(value, offset);
    return count !== -1 && count === offset;
  };
}

Function.prototype.inherit = function (target, obj) {
  if (!target || !_.isFunction(target)) {
    throw new Error('parent argument must be a function');
  }
  this.prototype = _.extend(Object.create(target.prototype), obj);
};

Function.prototype.mixin = function (name) {
  const self = this;
  _.each(name, function (fn, methodName) {
    if (self.prototype[methodName] === undefined) {
      self.prototype[methodName] = fn;
    }
  });
};

window.WIDTH = window.innerWidth;
window.HEIGHT = window.innerHeight;
window.mouseX = 0;
window.mouseY = 0;
window.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
window.iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
