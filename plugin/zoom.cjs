function calculateRelativeScale(basePercent, increasePercent) {
  if (!Number.isFinite(basePercent) || basePercent <= 0) {
    throw new RangeError('L’échelle de départ doit être positive et finie.');
  }
  if (!Number.isFinite(increasePercent) || increasePercent < 1 || increasePercent > 200) {
    throw new RangeError('L’intensité doit être comprise entre 1 et 200 %.');
  }
  return basePercent * (100 + increasePercent) / 100;
}

module.exports = { calculateRelativeScale };
