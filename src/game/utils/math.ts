import type { GameRank } from '../systems/SaveSystem';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleDelta(a: number, b: number): number {
  const full = Math.PI * 2;
  const wrapped = ((a - b + Math.PI) % full + full) % full - Math.PI;
  return Math.abs(wrapped);
}

export function rankFor(score: number, damage: number, timeSeconds: number, progressStage = 1, victory = false): GameRank {
  const performance = score - damage * 15 - Math.max(0, timeSeconds - 600) * 1.5 + progressStage * 360 + (victory ? 900 : 0);
  if (victory && performance >= 6100) return 'S';
  if (performance >= 4500 || (victory && performance >= 3600)) return 'A';
  if (performance >= 2850 || progressStage >= 4) return 'B';
  if (performance >= 1750 || progressStage >= 3) return 'C+';
  if (performance >= 720 || progressStage >= 2) return 'C';
  return 'C-';
}
