import { describe, expect, it } from 'vitest';
import { CombatStats } from '../game/systems/CombatStats';

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
      cutParry: 25,
      word: 37,
      upgradeResonance: 8,
    });
    expect(Object.values(attribution).reduce((sum, value) => sum + value, 0)).toBe(80);
  });

  it('rejects invalid damage-attribution deltas', () => {
    const stats = new CombatStats();
    stats.agencyDamage('automatic', Number.NaN);
    stats.parryDamage(Number.POSITIVE_INFINITY);
    stats.addChainDamage('backflow', -10);
    stats.attributedUpgradeDamage(Number.NaN);

    expect(stats.snapshot().damageAttribution).toEqual({
      echoBlade: 0,
      cutParry: 0,
      word: 0,
      upgradeResonance: 0,
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
    expect(stats.snapshot().empoweredWordUses).toEqual({ stop: 0, rewind: 0, link: 0 });
  });
});
