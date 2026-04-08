function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(target, source) {
  const output = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = output[key];

    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      output[key] = deepMerge(targetValue, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  }

  return output;
}
