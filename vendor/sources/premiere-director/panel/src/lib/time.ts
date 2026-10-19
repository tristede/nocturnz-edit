export const TICKS_PER_SECOND = 254016000000;

export function secondsToTicks(sec: number): string {
  return String(Math.round(sec * TICKS_PER_SECOND));
}

export function ticksToSeconds(ticks: string): number {
  return Number(ticks) / TICKS_PER_SECOND;
}
