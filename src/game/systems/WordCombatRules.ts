import { BALANCE } from '../balance';

export interface LinkedDamageAdjustment {
  adjustedAmount: number;
  isolatedBonus: number;
}

export function adjustLinkedIncomingDamage(amount: number, subjectLinked: boolean, activeLinkedTargets: number, propagated: boolean, isolatedMultiplier: number = BALANCE.words.singleLinkDamageTakenMultiplier): LinkedDamageAdjustment {
  const base = Math.max(0, amount);
  if (propagated || !subjectLinked || activeLinkedTargets !== 1) return { adjustedAmount: base, isolatedBonus: 0 };
  const adjustedAmount = base * Math.max(1, isolatedMultiplier);
  return { adjustedAmount, isolatedBonus: adjustedAmount - base };
}

export function linkShareRatio(enhanced: boolean): number {
  return enhanced ? BALANCE.words.empoweredLinkShare : BALANCE.words.linkShare;
}
