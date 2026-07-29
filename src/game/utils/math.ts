import Phaser from 'phaser';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleDelta(a: number, b: number): number {
  return Math.abs(Phaser.Math.Angle.Wrap(a - b));
}

export function rankFor(score: number, damage: number, timeSeconds: number): 'S' | 'A' | 'B' | 'C' {
  const performance = score - damage * 18 - Math.max(0, timeSeconds - 600) * 2;
  if (performance >= 5600) return 'S';
  if (performance >= 3900) return 'A';
  if (performance >= 2300) return 'B';
  return 'C';
}
