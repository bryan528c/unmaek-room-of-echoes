import { describe, expect, it } from 'vitest';
import { BALANCE } from '../game/balance';
import { attackTargetMultiplier, basicComboDamage, estimateJOnlyTtk } from '../game/systems/BasicAttackBalance';

describe('temporary J balance', () => {
  const comboDuration = BALANCE.hero.comboStrikeInterval * 2 + BALANCE.hero.attackRecovery;

  it('keeps the combo in the 0.8-1.0 second readability window', () => {
    expect(comboDuration).toBeGreaterThanOrEqual(800); expect(comboDuration).toBeLessThanOrEqual(1000);
    expect(BALANCE.hero.comboStrikeInterval).toBeGreaterThanOrEqual(BALANCE.hero.attackHitDelay + 150);
  });

  it('does not kill normal enemies in one unupgraded combo', () => {
    const damage = basicComboDamage(BALANCE.hero.attackDamage);
    expect(damage).toBe(35);
    expect(damage).toBeLessThan(BALANCE.enemies.chaser.hp);
    expect(damage).toBeLessThan(BALANCE.enemies.archer.hp);
    expect(damage).toBeLessThan(BALANCE.enemies.ink.hp);
  });

  it('meets the temporary J-only TTK targets', () => {
    expect(estimateJOnlyTtk(BALANCE.enemies.chaser.hp, BALANCE.hero.attackDamage, comboDuration).combos).toBe(2);
    expect(estimateJOnlyTtk(BALANCE.enemies.archer.hp, BALANCE.hero.attackDamage, comboDuration).combos).toBe(2);
    expect(estimateJOnlyTtk(BALANCE.enemies.ink.hp, BALANCE.hero.attackDamage, comboDuration).combos).toBe(2);
    expect(estimateJOnlyTtk(BALANCE.enemies.elite.hp, BALANCE.hero.attackDamage, comboDuration, BALANCE.hero.eliteFrontalDamageMultiplier).combos).toBe(8);
    expect(estimateJOnlyTtk(BALANCE.enemies.boss.hp, BALANCE.hero.attackDamage, comboDuration).combos).toBe(26);
  });

  it('caps full damage to the primary target and attenuates two secondary targets', () => {
    expect(attackTargetMultiplier(0, 0.45, 2)).toBe(1);
    expect(attackTargetMultiplier(1, 0.45, 2)).toBe(0.45);
    expect(attackTargetMultiplier(2, 0.45, 2)).toBe(0.45);
    expect(attackTargetMultiplier(3, 0.45, 2)).toBe(0);
  });
});
