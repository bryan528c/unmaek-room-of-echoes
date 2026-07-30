export type BossPhase = 1 | 2 | 3;

export function parrySentenceReward(baseGain: number, perfectBreathStacks: number): number {
  return baseGain + Math.max(0, perfectBreathStacks) * 5;
}

export function bossPhaseForHealth(health: number, maximumHealth: number): BossPhase {
  if (maximumHealth <= 0) return 3;
  const ratio = Math.max(0, health) / maximumHealth;
  if (ratio <= 0.34) return 3;
  if (ratio <= 0.67) return 2;
  return 1;
}
