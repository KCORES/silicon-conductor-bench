import normalize from 'module/utils/normalize';
import convertArray from 'module/utils/ConvertArray';

function isUri(value) {
  return typeof value === 'string' && /^([a-z][a-z0-9+.-]*:)?\/\//i.test(value);
}

function joinPath(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && part !== '')
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
}

const urlUtils = function () {
  const array = convertArray(arguments).map(replaceUndefined);
  return isUri(array[0]) ? normalize.apply(normalize, array) : joinPath(...array);
};

urlUtils.isUri = function (value) {
  return isUri(value) || value === 'http://' || value === 'https://' || value === 'ftp://';
};

const replaceUndefined = (urlUtils.replaceUndefined = function (currentValue, index, arr) {
  return currentValue === undefined || currentValue === null
    ? isUri(arr[0])
      ? '/'
      : '/'
    : currentValue;
});

export default urlUtils;
