import { describe, expect, it } from 'vitest';
import { ACTIVE_UPGRADES, RESONANCES, upgradeDescription } from '../game/data/upgrades';
import {
  ACTIVE_EFFECT_HANDLERS,
  RESONANCE_EFFECT_HANDLERS,
  ResonanceRuntime,
  counterInscriptionProfile,
  echoHarvestGain,
  linkContagionProfile,
  overchargedWordProfile,
  perfectCounterProfile,
  rewindBreathHealing,
  ruptureStepProfile,
  stopResonanceProfile,
  gravityInscriptionProfile,
  deepMarkProfile,
  recoilRippleProfile,
  headwindVeilProfile,
} from '../game/systems/UpgradeRuntime';
import { UpgradeSystem } from '../game/systems/UpgradeSystem';

describe('UPGRADE-04 runtime', () => {
  it('활성 카드 24개 모두 효과 핸들러와 실제 수치 기반 설명을 가진다', () => {
    expect(ACTIVE_UPGRADES).toHaveLength(24);
    expect(ACTIVE_UPGRADES.filter((upgrade) => upgrade.behaviorChange).length / ACTIVE_UPGRADES.length).toBeGreaterThanOrEqual(.6);
    for (const upgrade of ACTIVE_UPGRADES) {
      expect(ACTIVE_EFFECT_HANDLERS.has(upgrade.id), upgrade.id).toBe(true);
      expect(upgrade.triggerTypes.length, upgrade.id).toBeGreaterThan(0);
      expect(Object.keys(upgrade.baseValues).length, upgrade.id).toBeGreaterThan(0);
      expect(upgrade.effect).toBe(upgrade.baseValues);
      expect(upgradeDescription(upgrade, 1)).toBe(upgrade.description);
    }
  });

  it('중첩·기여 통계는 한 Run에서 유지되고 새 Run에서 초기화된다', () => {
    const run = new UpgradeSystem();
    expect(run.add('cut-sentence')).toBe(true); expect(run.add('cut-sentence')).toBe(true); expect(run.add('cut-sentence')).toBe(false);
    run.record('cut-sentence', { activationCount: 1, damageContribution: 18, hitCount: 1 });
    run.record('cut-sentence', { activationCount: 0, damageContribution: 9, resourceContribution: 3, affectedTargetCount: 1 });
    expect(run.runtimeSnapshot().contributions['cut-sentence']).toMatchObject({
      activationCount: 1,
      damageContribution: 27,
      resourceContribution: 3,
      hitCount: 1,
      affectedTargetCount: 1,
    });
    expect(new UpgradeSystem().runtimeSnapshot().owned).toEqual([]);
    expect(new UpgradeSystem().runtimeSnapshot().contributions).toEqual({});
  });

  it('신규 카드 수치와 상한이 중첩 정의와 일치한다', () => {
    expect(perfectCounterProfile(1)).toEqual({ cutReady: true, rangeMultiplier: 1.28, ruptureBonus: 16, duration: 2600 });
    expect(counterInscriptionProfile(2)).toEqual({ duration: 4000, damage: 22 });
    expect(linkContagionProfile(1)).toEqual({ targets: 2, duration: 2400, maximumGeneration: 1 });
    expect(rewindBreathHealing(20, 2)).toBeCloseTo(11.2);
    expect(echoHarvestGain(2, 11)).toBe(1);
    expect(echoHarvestGain(2, 12)).toBe(0);
    expect(overchargedWordProfile(1, true)).toEqual({ multiplier: 1.35, durationBonus: 500 });
    expect(ruptureStepProfile(2, 1800)).toMatchObject({ active: true, damage: 20, range: 142 });
    expect(ruptureStepProfile(2, 1801).active).toBe(false);
    expect(stopResonanceProfile(2)).toEqual({ damage: 18, radius: 76, slowDuration: 650 });
    expect(gravityInscriptionProfile(2)).toEqual({ rangeMultiplier: 1.28, durationBonus: 360, damage: 16 });
    expect(deepMarkProfile(2)).toEqual({ maximumStacks: 5, explosionDamage: 44 });
    expect(recoilRippleProfile(2)).toEqual({ damage: 18, radius: 68 });
    expect(headwindVeilProfile(2)).toEqual({ reduction: .28, duration: 1300 });
    const wordCards = ['gravity-inscription', 'captured-projectile', 'deep-mark', 'contagious-mark', 'recoil-ripple', 'headwind-veil'] as const;
    for (const id of wordCards) {
      const definition = ACTIVE_UPGRADES.find((upgrade) => upgrade.id === id);
      expect(definition, id).toBeDefined();
      expect(definition?.requiredWordIds?.length, id).toBeGreaterThan(0);
      expect(definition?.behaviorChange, id).toBe(true);
      expect(upgradeDescription(definition!, definition!.maxStacks), id).not.toContain('undefined');
    }
  });

  it('일곱 공명은 두 필요 카드가 모두 있을 때만 한 번 활성화된다', () => {
    expect(RESONANCES).toHaveLength(7);
    for (const resonance of RESONANCES) {
      expect(RESONANCE_EFFECT_HANDLERS.has(resonance.id)).toBe(true);
      const run = new UpgradeSystem();
      expect(run.hasResonance(resonance.id)).toBe(false);
      expect(run.add(resonance.requiredUpgradeIds[0])).toBe(true);
      expect(run.hasResonance(resonance.id)).toBe(false);
      expect(run.add(resonance.requiredUpgradeIds[1])).toBe(true);
      expect(run.hasResonance(resonance.id)).toBe(true);
      run.recordResonance(resonance.id, { activationCount: 1, damageContribution: 7, affectedTargetCount: 1 });
      expect(run.runtimeSnapshot().resonanceContributions[resonance.id]).toMatchObject({ activationCount: 1, damageContribution: 7, affectedTargetCount: 1 });
    }
  });

  it('월환 공명은 네 번째 적중마다 한 번만 파동을 허용한다', () => {
    const runtime = new ResonanceRuntime();
    expect([1, 2, 3].map(() => runtime.registerMoonRingHit(true))).toEqual([false, false, false]);
    expect(runtime.registerMoonRingHit(true)).toBe(true);
    expect(runtime.registerMoonRingHit(true)).toBe(false);
    runtime.reset(); expect(runtime.snapshot().moonRingHits).toBe(0);
  });
});
