export const TICKS_PER_SECOND = 254016000000;

function roundDiv(numerator, denominator) {
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  return sign * ((absolute * 2n + denominator) / (2n * denominator));
}

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function rational(numerator, denominator = 1) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) {
    throw new TypeError('Les fractions temporelles doivent utiliser des entiers sûrs et un dénominateur non nul.');
  }
  if (denominator < 0) { numerator = -numerator; denominator = -denominator; }
  const d = gcd(numerator, denominator);
  return { numerator: numerator / d, denominator: denominator / d };
}

export function secondsToTicks(seconds) {
  if (!Number.isFinite(seconds)) throw new RangeError('Durée invalide.');
  const [mantissa, exponentText] = seconds.toString().toLowerCase().split('e');
  const exponent = Number(exponentText || 0);
  const [whole, fraction = ''] = mantissa.split('.');
  let numerator = BigInt(`${whole}${fraction}`);
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent);
  const scaled = numerator * BigInt(TICKS_PER_SECOND);
  return roundDiv(scaled, denominator).toString();
}

export function ticksToSeconds(ticks) {
  let value;
  try { value = BigInt(ticks); } catch { throw new TypeError('Les ticks doivent être un entier.'); }
  return Number(value) / TICKS_PER_SECOND;
}

export function frameRate(numerator, denominator = 1) {
  const rate = rational(numerator, denominator);
  if (rate.numerator <= 0) throw new RangeError('Cadence invalide.');
  return rate;
}

export function frameIndexToTicks(frameIndex, rate) {
  if (!Number.isSafeInteger(frameIndex)) throw new RangeError('Image invalide.');
  const numerator = BigInt(frameIndex) * BigInt(TICKS_PER_SECOND) * BigInt(rate.denominator);
  const denominator = BigInt(rate.numerator);
  return roundDiv(numerator, denominator).toString();
}

export function ticksToFrameIndex(ticks, rate) {
  const tickValue = BigInt(ticks);
  const numerator = tickValue * BigInt(rate.numerator);
  const denominator = BigInt(TICKS_PER_SECOND) * BigInt(rate.denominator);
  return Number(roundDiv(numerator, denominator));
}

export function composeScale(basePercent, relativePercent) {
  if (![basePercent, relativePercent].every(Number.isFinite) || basePercent <= 0 || relativePercent <= 0) {
    throw new RangeError('Les échelles doivent être positives et finies.');
  }
  return basePercent * relativePercent / 100;
}
