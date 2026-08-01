export interface JOnlyTtkEstimate {
  comboDamage: number;
  combos: number;
  seconds: number;
  dps: number;
}

export function basicComboDamage(strikes: readonly number[]): number {
  return strikes.reduce((sum, damage) => sum + Math.max(0, damage), 0);
}

export function estimateJOnlyTtk(
  health: number,
  strikes: readonly number[],
  comboDurationMs: number,
  receivedDamageMultiplier = 1,
): JOnlyTtkEstimate {
  const comboDamage = basicComboDamage(strikes) * Math.max(0.001, receivedDamageMultiplier);
  const combos = Math.max(1, Math.ceil(Math.max(0, health) / comboDamage));
  const seconds = combos * Math.max(1, comboDurationMs) / 1000;
  return { comboDamage, combos, seconds, dps: comboDamage / (Math.max(1, comboDurationMs) / 1000) };
}

export function attackTargetMultiplier(targetIndex: number, secondaryMultiplier: number, maximumSecondaryTargets: number): number {
  if (targetIndex === 0) return 1;
  if (targetIndex > maximumSecondaryTargets) return 0;
  return Math.max(0, Math.min(1, secondaryMultiplier));
}
