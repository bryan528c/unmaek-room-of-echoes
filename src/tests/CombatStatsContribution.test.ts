import { describe, expect, it } from 'vitest';
import { CombatStats, empoweredWordEffectIsValid } from '../game/systems/CombatStats';

describe('CombatStats contribution ledger', () => {
  it('accumulates every canonical upgrade contribution field', () => {
    const stats = new CombatStats();
    stats.upgradeContribution('returning-scar', {
      activationCount: 1,
      damageContribution: 24,
      healingContribution: 3,
      resourceContribution: 4,
      cooldownReductionContribution: 250,
      reflectedProjectileCount: 2,
      affectedTargetCount: 3,
      preventedDamage: 5,
      failedConditionCount: 1,
      generatedCount: 2,
      hitCount: 1,
      missCount: 1,
    });
    stats.upgradeContribution('returning-scar', {
      damageContribution: 6,
      hitCount: 1,
    });

    expect(stats.snapshot().upgradeContributions['returning-scar']).toMatchObject({
      activationCount: 1,
      damageContribution: 30,
      healingContribution: 3,
      resourceContribution: 4,
      cooldownReductionContribution: 250,
      reflectedProjectileCount: 2,
      affectedTargetCount: 3,
      preventedDamage: 5,
      failedConditionCount: 1,
      generatedCount: 2,
      hitCount: 2,
      missCount: 1,
    });
  });

  it('does not inflate activation count when delayed damage arrives', () => {
    const stats = new CombatStats();
    stats.resonanceContribution('time-undertow', {
      activationCount: 1,
      reflectedProjectileCount: 3,
    });
    stats.resonanceContribution('time-undertow', { damageContribution: 8, hitCount: 1, affectedTargetCount: 1 });
    stats.resonanceContribution('time-undertow', { damageContribution: 7, hitCount: 1, affectedTargetCount: 1 });

    expect(stats.snapshot().resonanceContributions['time-undertow']).toMatchObject({
      activationCount: 1,
      damageContribution: 15,
      reflectedProjectileCount: 3,
      affectedTargetCount: 2,
      hitCount: 2,
    });
  });

  it('keeps legacy readers synchronized without implicit activations', () => {
    const stats = new CombatStats();
    stats.upgradeContribution('chain-breath', { damage: 3, healing: 2, sentence: 12, cooldownMs: 400, generated: 1 });
    stats.upgradeContribution('chain-breath', { triggers: 1 });

    const contribution = stats.snapshot().upgradeContributions['chain-breath'];
    expect(contribution).toMatchObject({
      activationCount: 1,
      damageContribution: 3,
      healingContribution: 2,
      resourceContribution: 12,
      cooldownReductionContribution: 400,
      generatedCount: 1,
      triggers: 1,
      damage: 3,
      healing: 2,
      sentence: 12,
      cooldownMs: 400,
      generated: 1,
    });
  });

  it('clamps invalid and negative contribution deltas', () => {
    const stats = new CombatStats();
    stats.upgradeContribution('ink-cloak', {
      activationCount: -1,
      damageContribution: Number.NaN,
      preventedDamage: -20,
      failedConditionCount: Number.POSITIVE_INFINITY,
    });

    expect(stats.snapshot().upgradeContributions['ink-cloak']).toMatchObject({
      activationCount: 0,
      damageContribution: 0,
      preventedDamage: 0,
      failedConditionCount: 0,
    });
  });

  it('records which Q/E/R consumed an empowered word', () => {
    const stats = new CombatStats();
    stats.empower();
    stats.empoweredWord('stop');
    stats.empoweredWord('rewind', 2);
    stats.empoweredWord('link');

    expect(stats.snapshot()).toMatchObject({
      empowerUses: 1,
      empoweredWordUses: { stop: 1, rewind: 2, link: 1 },
    });
  });

  it('keeps damage source attribution exhaustive without overlapping standalone upgrade damage', () => {
    const stats = new CombatStats();
    stats.agencyDamage('automatic', 10);
    stats.agencyDamage('basicJ', 20);
    stats.parryDamage(5);
    stats.agencyDamage('stop', 30);
    stats.addChainDamage('chain-stop', 7);
    stats.attributedUpgradeDamage(8);

    const attribution = stats.snapshot().damageAttribution;
    expect(attribution).toEqual({
      echoBlade: 10,
      cut: 20,
      parry: 5,
      word: 37,
      other: 0,
    });
    expect(Object.values(attribution).reduce((sum, value) => sum + value, 0)).toBe(72);
  });

  it('rejects invalid damage-attribution deltas', () => {
    const stats = new CombatStats();
    stats.agencyDamage('automatic', Number.NaN);
    stats.parryDamage(Number.POSITIVE_INFINITY);
    stats.addChainDamage('backflow', -10);
    stats.attributedUpgradeDamage(Number.NaN);

    expect(stats.snapshot().damageAttribution).toEqual({
      echoBlade: 0,
      cut: 0,
      parry: 0,
      word: 0,
      other: 0,
    });
  });

  it('records a scoped damage event once without folding modifier cards into the base axis', () => {
    const stats = new CombatStats();
    expect(stats.damageEvent({
      baseSource: 'cut', sourceEntityId: 'hero', skillId: 'cut',
      modifierSourceIds: ['cut-sentence', 'counter-inscription'], resonanceId: 'counter-cut',
      amount: 28, runId: 4, actId: 'act-2', recursiveDepth: 0,
    }, 4, 'act-2')).toBe(true);
    expect(stats.snapshot()).toMatchObject({ damageAttribution: { cut: 28 }, damageEventCount: 1 });
    expect(stats.damageEvent({ baseSource: 'word', amount: 20, runId: 3, actId: 'act-1' }, 4, 'act-2')).toBe(false);
    expect(stats.damageEvent({ baseSource: 'word', amount: 20, runId: 4, actId: 'act-2', recursiveDepth: 2 }, 4, 'act-2')).toBe(false);
    expect(stats.snapshot()).toMatchObject({ damageEventCount: 1, staleDamageEventsRejected: 1 });
  });

  it('commits an empowered word for damage, recovery, status or duration but not an empty cast', () => {
    expect(empoweredWordEffectIsValid({ damage: 1 })).toBe(true);
    expect(empoweredWordEffectIsValid({ healing: 1 })).toBe(true);
    expect(empoweredWordEffectIsValid({ movedDistance: 24 })).toBe(true);
    expect(empoweredWordEffectIsValid({ statusApplications: 1 })).toBe(true);
    expect(empoweredWordEffectIsValid({ durationApplications: 1 })).toBe(true);
    expect(empoweredWordEffectIsValid({ damage: 0, healing: 0, statusApplications: 0 })).toBe(false);
  });

  it('separates perfect parries and records empowered-word failure reasons', () => {
    const stats = new CombatStats();
    stats.parryAttempt(); stats.parrySuccess(false, 'projectile');
    stats.parryAttempt(); stats.parrySuccess(true, 'melee');
    stats.empoweredWordFailure('stop', 'no-stop-effect');
    stats.empoweredWordFailure('rewind', 'no-rewind-effect');
    stats.empoweredWordFailure('link', 'no-link-target');
    expect(stats.snapshot()).toMatchObject({
      parryAttempts: 2, parrySuccesses: 2, perfectParries: 1,
      parryBreakdown: { normalParries: 1, projectileReflections: 1, meleeCounters: 1 },
      empoweredWordFailures: {
        stop: { 'no-stop-effect': 1 }, rewind: { 'no-rewind-effect': 1 }, link: { 'no-link-target': 1 },
      },
    });
  });

  it('clears contribution metrics without discarding owned cards and resets all data for a new run', () => {
    const stats = new CombatStats();
    stats.setUpgrades([{ id: 'stop-resonance', stacks: 2 }]);
    stats.upgradeContribution('stop-resonance', { activationCount: 1, damageContribution: 18 });
    stats.resonanceContribution('time-undertow', { activationCount: 1, reflectedProjectileCount: 2 });
    stats.resetUpgradeContributions();

    expect(stats.snapshot().upgrades).toEqual([{ id: 'stop-resonance', stacks: 2 }]);
    expect(stats.snapshot().upgradeContributions).toEqual({});
    expect(stats.snapshot().resonanceContributions).toEqual({});

    stats.reset();
    expect(stats.snapshot().upgrades).toEqual([]);
    expect(stats.snapshot().empoweredWordUses).toEqual({ stop: 0, rewind: 0, link: 0, pull: 0, mark: 0, push: 0 });
  });
});
