'use strict';

/**
 * Recursive deep-merge. Returns `target` with `source` merged in.
 * Plain objects merge recursively; arrays and primitives are overwritten.
 */
function mergeDeep(target, source) {
  const output = target || {};
  Object.keys(source || {}).forEach((key) => {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = mergeDeep(
        output[key] && typeof output[key] === 'object' ? output[key] : {},
        value,
      );
    } else if (value !== undefined) {
      output[key] = value;
    }
  });
  return output;
}

module.exports = mergeDeep;
