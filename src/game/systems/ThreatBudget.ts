export type ThreatTier = 'low' | 'medium' | 'high' | 'large-telegraph' | 'tracking' | 'modifier';

export interface ThreatRequest {
  id: string;
  tier: ThreatTier;
  now: number;
  durationMs: number;
  dangerousLimit?: number;
  minimumTierGapMs?: number;
}

export interface ThreatBudgetSnapshot {
  active: readonly { id: string; tier: ThreatTier; expiresAt: number }[];
  denied: number;
}

/** Prevents unrelated AI and modifier attacks from converging on one frame. */
export class ThreatBudget {
  private readonly active = new Map<string, { tier: ThreatTier; expiresAt: number }>();
  private denied = 0;
  private readonly lastGrantedAt = new Map<ThreatTier, number>();

  public request(request: ThreatRequest): boolean {
    this.expire(request.now);
    const active = [...this.active.values()];
    const dangerous = active.filter((entry) => entry.tier === 'high' || entry.tier === 'large-telegraph' || entry.tier === 'tracking' || entry.tier === 'modifier').length;
    const sameTier = active.filter((entry) => entry.tier === request.tier).length;
    const dangerousLimit = Math.max(1, request.dangerousLimit ?? 1);
    const tooSoon = request.minimumTierGapMs !== undefined
      && request.now - (this.lastGrantedAt.get(request.tier) ?? Number.NEGATIVE_INFINITY) < request.minimumTierGapMs;
    const denied = active.length >= 3
      || tooSoon
      || ((request.tier === 'high' || request.tier === 'large-telegraph' || request.tier === 'tracking' || request.tier === 'modifier') && dangerous >= dangerousLimit)
      || (request.tier === 'large-telegraph' && sameTier >= 1)
      || (request.tier === 'modifier' && sameTier >= 1);
    if (denied) { this.denied += 1; return false; }
    this.active.set(request.id, { tier: request.tier, expiresAt: request.now + Math.max(1, request.durationMs) });
    this.lastGrantedAt.set(request.tier, request.now);
    return true;
  }

  public release(id: string): void { this.active.delete(id); }
  public reset(): void { this.active.clear(); this.lastGrantedAt.clear(); this.denied = 0; }
  public snapshot(now = Number.POSITIVE_INFINITY): ThreatBudgetSnapshot {
    if (Number.isFinite(now)) this.expire(now);
    return { active: [...this.active].map(([id, entry]) => ({ id, ...entry })), denied: this.denied };
  }

  private expire(now: number): void {
    for (const [id, entry] of this.active) if (entry.expiresAt <= now) this.active.delete(id);
  }
}

export interface MixedModifierProfile {
  frequencyMultiplier: number;
  damageMultiplier: number;
  openingGraceMs: number;
}

export const mixedModifierProfile = (mixed: boolean): MixedModifierProfile => mixed
  ? { frequencyMultiplier: 0.75, damageMultiplier: 0.88, openingGraceMs: 2600 }
  : { frequencyMultiplier: 1, damageMultiplier: 1, openingGraceMs: 2100 };
