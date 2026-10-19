/* UXP exposes Motion points as {value: [x, y]} in Premiere 27. */
function readPoint(raw) {
  const value = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
  const point = Array.isArray(value) && value.length === 2 ? { x: value[0], y: value[1] } : value;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError('Coordonnées de cadrage illisibles.');
  }
  return { x: point.x, y: point.y };
}

module.exports = { readPoint };
