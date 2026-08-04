import { describe, expect, it } from 'vitest';
import { mixedModifierProfile, ThreatBudget } from '../game/systems/ThreatBudget';

describe('ThreatBudget', () => {
  it('prevents high-risk and modifier attacks from starting together', () => {
    const budget = new ThreatBudget();
    expect(budget.request({ id: 'elite', tier: 'high', now: 100, durationMs: 700 })).toBe(true);
    expect(budget.request({ id: 'past', tier: 'modifier', now: 100, durationMs: 900 })).toBe(false);
    expect(budget.request({ id: 'past', tier: 'modifier', now: 801, durationMs: 900 })).toBe(true);
  });

  it('allows several low/medium attacks but caps total concurrent intents', () => {
    const budget = new ThreatBudget();
    expect(budget.request({ id: 'a', tier: 'low', now: 0, durationMs: 500 })).toBe(true);
    expect(budget.request({ id: 'b', tier: 'medium', now: 0, durationMs: 500 })).toBe(true);
    expect(budget.request({ id: 'c', tier: 'low', now: 0, durationMs: 500 })).toBe(true);
    expect(budget.request({ id: 'd', tier: 'medium', now: 0, durationMs: 500 })).toBe(false);
  });

  it('reduces mixed modifier frequency and damage while extending its opening grace', () => {
    expect(mixedModifierProfile(true)).toEqual({ frequencyMultiplier: .75, damageMultiplier: .88, openingGraceMs: 2600 });
    expect(mixedModifierProfile(false)).toEqual({ frequencyMultiplier: 1, damageMultiplier: 1, openingGraceMs: 2100 });
  });

  it('limits Act 3 tracking charges to one and enforces a start gap', () => {
    const budget = new ThreatBudget();
    expect(budget.request({ id: 'chaser-a', tier: 'tracking', now: 1000, durationMs: 580, dangerousLimit: 1, minimumTierGapMs: 720 })).toBe(true);
    expect(budget.request({ id: 'chaser-b', tier: 'tracking', now: 1100, durationMs: 580, dangerousLimit: 1, minimumTierGapMs: 720 })).toBe(false);
    expect(budget.request({ id: 'chaser-b', tier: 'tracking', now: 1720, durationMs: 580, dangerousLimit: 1, minimumTierGapMs: 720 })).toBe(true);
  });
});
