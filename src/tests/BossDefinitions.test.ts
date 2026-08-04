import { describe, expect, it } from 'vitest';
import { BossPhaseIntegrity, getBossDefinition } from '../game/systems/BossDefinitions';

describe('BossDefinition and phase integrity', () => {
  it('keeps the devourer and editor definitions, silhouettes, phases, and signatures distinct', () => {
    const devourer = getBossDefinition('record-devourer');
    const editor = getBossDefinition('record-editor');
    expect(devourer.displayName).toBe('기록 포식자');
    expect(editor.displayName).toBe('기록 편집자');
    expect(editor.silhouetteKey).not.toBe(devourer.silhouetteKey);
    expect(editor.phaseDefinitions.map((phase) => phase.displayName)).toEqual([
      '제1형 · 교정', '제2형 · 삭제', '제3형 · 재편',
    ]);
    expect(editor.phaseDefinitions.map((phase) => phase.signaturePattern)).not.toEqual(
      devourer.phaseDefinitions.map((phase) => phase.signaturePattern),
    );
    expect(editor.phaseDefinitions.some((phase) => phase.displayName.includes('먹물의 기억'))).toBe(false);
  });

  it('throws for an unknown boss instead of silently using another definition', () => {
    expect(() => getBossDefinition('missing-boss')).toThrow(/Unknown bossId/);
  });

  it('holds at one HP until the representative pattern executes', () => {
    const integrity = new BossPhaseIntegrity(getBossDefinition('record-devourer'), 900, 0);
    const result = integrity.applyDamage(99_999);
    expect(result.nextPhase).toBeUndefined();
    expect(integrity.snapshot()).toMatchObject({ phaseId: 1, phaseHealth: 1, signaturePatternExecuted: false });
    integrity.markSignatureExecuted();
    expect(integrity.applyDamage(99_999).nextPhase).toBe(2);
  });

  it('keeps the devourer final phase alive until its signature and minimum combat window both complete', () => {
    const integrity = new BossPhaseIntegrity(getBossDefinition('record-devourer'), 900, 0);
    integrity.markSignatureExecuted();
    const early = integrity.applyDamage(99_999, 1200);
    expect(early.nextPhase).toBeUndefined();
    expect(integrity.snapshot().phaseHealth).toBe(1);
    expect(integrity.applyDamage(99_999, 1900).nextPhase).toBe(2);
    expect(integrity.beginNextPhase(2, 2000)).toBe(true); integrity.unlockTransition(); integrity.markSignatureExecuted(); integrity.applyDamage(99_999, 4300); integrity.beginNextPhase(3, 4400); integrity.unlockTransition(); integrity.markSignatureExecuted();
    expect(integrity.applyDamage(99_999, 8200).bossDefeated).toBe(false);
    expect(integrity.applyDamage(99_999, 8700).bossDefeated).toBe(true);
  });

  it('caps one damage event to one phase and never carries overflow into the next phase', () => {
    const integrity = new BossPhaseIntegrity(getBossDefinition('record-editor'), 1_000, 0);
    integrity.markSignatureExecuted();
    const first = integrity.applyDamage(1_000_000);
    expect(first.nextPhase).toBe(2);
    expect(integrity.snapshot()).toMatchObject({ phaseId: 1, transitionLocked: true, skippedPhaseCount: 0 });
    expect(integrity.beginNextPhase(2, 100)).toBe(true);
    const phaseTwo = integrity.snapshot();
    expect(phaseTwo.phaseId).toBe(2);
    expect(phaseTwo.phaseHealth).toBe(phaseTwo.phaseMaxHealth);
    expect(phaseTwo.skippedPhaseCount).toBe(0);
    expect(integrity.beginNextPhase(3, 101)).toBe(false);
  });

  it('runs all three phases in order and reports one final defeat', () => {
    const integrity = new BossPhaseIntegrity(getBossDefinition('record-editor'), 1_000, 0);
    for (const phase of [1, 2] as const) {
      if (phase > 1) integrity.unlockTransition();
      integrity.markSignatureExecuted();
      const result = integrity.applyDamage(1_000_000);
      expect(result.nextPhase).toBe(phase + 1);
      expect(result.bossDefeated).toBe(false);
      expect(integrity.beginNextPhase((phase + 1) as 2 | 3, phase * 100)).toBe(true);
    }
    integrity.unlockTransition();
    integrity.markSignatureExecuted();
    expect(integrity.applyDamage(1_000_000).bossDefeated).toBe(true);
    expect(integrity.applyDamage(1_000_000).appliedDamage).toBe(0);
    expect(integrity.snapshot()).toMatchObject({ phaseId: 3, defeated: true, skippedPhaseCount: 0 });
  });
});
