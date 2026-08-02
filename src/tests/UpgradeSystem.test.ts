import { describe, expect, it } from 'vitest';
import { upgradeById, upgradeDescription } from '../game/data/upgrades';
import { sealedSentenceStats, UpgradeSystem } from '../game/systems/UpgradeSystem';

describe('UpgradeSystem', () => {
  it('정의된 강화는 최대 중첩까지 중복 선택할 수 있다', () => {
    const system = new UpgradeSystem();
    expect(system.add('wide-orbit')).toBe(true);
    expect(system.add('wide-orbit')).toBe(true);
    expect(system.add('wide-orbit')).toBe(false);
    expect(system.getStack('wide-orbit')).toBe(2);
  });

  it('존재하지 않는 강화는 거부한다', () => {
    const system = new UpgradeSystem();
    expect(system.add('missing' as never)).toBe(false);
  });

  it('선택지에는 최대 중첩에 도달한 강화가 나오지 않는다', () => {
    const system = new UpgradeSystem();
    system.add('backflow-blade');
    const choices = system.choices(12, () => 0);
    expect(choices.some((choice) => choice.id === 'backflow-blade')).toBe(false);
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(choices.length);
  });

  it('다시 뽑기는 한 판에 한 번만 가능하다', () => {
    const system = new UpgradeSystem();
    expect(system.reroll(() => 0)).not.toBeNull();
    expect(system.reroll(() => 0)).toBeNull();
  });

  it('첫 보상은 새 무기의 행동 변화와 전투 변화, 생존 카드를 보장한다', () => {
    const choices = new UpgradeSystem().firstChoices(() => 0);
    expect(choices).toHaveLength(3);
    expect(choices[0]?.tags).toContain('weapon');
    expect(choices[1]?.tags.some((tag) => ['stop', 'rewind', 'link', 'parry'].includes(tag))).toBe(true);
    expect(choices[2]?.survival || choices[2]?.id === 'sealed-sentence').toBe(true);
    expect(new Set(choices.map((choice) => choice.id)).size).toBe(choices.length);
  });

  it('새 무기 카드 6개는 실제 수치, 중첩 제한과 생성 설명을 가진다', () => {
    const ids = ['dual-moon-echo', 'wide-orbit', 'cut-sentence', 'backflow-blade', 'returning-scar', 'isolation-chain'] as const;
    const system = new UpgradeSystem();
    for (const id of ids) {
      const definition = upgradeById(id);
      expect(definition).toBeDefined();
      expect(Object.keys(definition?.effect ?? {})).not.toHaveLength(0);
      expect(upgradeDescription(definition!, 1)).toBe(definition?.description);
      for (let stack = 0; stack < (definition?.maxStacks ?? 0); stack += 1) expect(system.add(id)).toBe(true);
      expect(system.add(id)).toBe(false);
      expect(system.getStack(id)).toBe(definition?.maxStacks);
    }
  });

  it('봉인된 문장은 1·2·3중첩을 가산 적용하고 카드 미리보기와 일치한다', () => {
    [1, 2, 3].forEach((stack) => {
      expect(sealedSentenceStats(stack).cooldownReduction).toBeCloseTo(0.06 * stack);
      expect(sealedSentenceStats(stack).wordHitSentenceBonus).toBeCloseTo(0.15 * stack);
    });
    const system = new UpgradeSystem();
    expect(system.preview('sealed-sentence')).toMatchObject({ currentStacks: 0, nextStacks: 1, stackMode: 'additive' });
    system.add('sealed-sentence'); system.add('sealed-sentence');
    const preview = system.preview('sealed-sentence');
    expect(preview?.currentDescription).toContain('-12%'); expect(preview?.nextDescription).toContain('-18%');
  });

  it('봉인된 문장 실제 Q/E/R 쿨다운과 언령 적중 문장력 수치가 정확하다', () => {
    const bases = [6000, 7500, 9000];
    expect([1, 2, 3].map((stack) => bases.map((base) => Math.round(base * (1 - sealedSentenceStats(stack).cooldownReduction))))).toEqual([
      [5640, 7050, 8460], [5280, 6600, 7920], [4920, 6150, 7380],
    ]);
    [6.9, 7.8, 8.7].forEach((expected, index) => expect(6 * (1 + sealedSentenceStats(index + 1).wordHitSentenceBonus)).toBeCloseTo(expected));
  });

  it('새 Run 인스턴스에서는 중첩이 초기화되고 기존 Run 인스턴스에서는 유지된다', () => {
    const run = new UpgradeSystem(); run.add('sealed-sentence'); run.add('sealed-sentence');
    expect(run.entries()).toContainEqual({ id: 'sealed-sentence', stacks: 2 });
    expect(new UpgradeSystem().getStack('sealed-sentence')).toBe(0);
  });

  it('records an explicit activation count separately from per-target contribution totals', () => {
    const run = new UpgradeSystem(); run.add('returning-scar');
    run.record('returning-scar', {
      activationCount: 1,
      damageContribution: 16,
      generatedCount: 2,
      hitCount: 1,
      missCount: 1,
    });
    run.record('returning-scar', {
      activationCount: 0,
      damageContribution: 8,
      affectedTargetCount: 1,
      failedConditionCount: 1,
    });
    expect(run.runtimeSnapshot().contributions['returning-scar']).toEqual({
      activationCount: 1,
      damageContribution: 24,
      healingContribution: 0,
      resourceContribution: 0,
      cooldownReductionContribution: 0,
      reflectedProjectileCount: 0,
      affectedTargetCount: 1,
      preventedDamage: 0,
      failedConditionCount: 1,
      generatedCount: 2,
      hitCount: 1,
      missCount: 1,
    });
  });

  it('does not immediately re-offer cards the player left unselected', () => {
    const run = new UpgradeSystem();
    const first = run.firstChoices(() => 0.15);
    const selected = first[0]!;
    expect(run.add(selected.id)).toBe(true);
    expect(run.recordSelection(selected.id)).toBe(true);
    const next = run.choices(3, () => 0.2, { healthRatio: 0.8 });
    const unselected = new Set(first.slice(1).map((choice) => choice.id));
    expect(next.some((choice) => unselected.has(choice.id))).toBe(false);
    expect(run.selectionHistory().selected).toEqual([selected.id]);
  });

  it('keeps survival cards in a low-health flex slot without forcing them at high health', () => {
    let lowHealthSurvival = 0;
    let highHealthSurvival = 0;
    for (let seed = 1; seed <= 80; seed += 1) {
      let lowState = seed;
      let highState = seed;
      const lowRandom = (): number => { lowState = (lowState * 1664525 + 1013904223) >>> 0; return lowState / 0x1_0000_0000; };
      const highRandom = (): number => { highState = (highState * 1664525 + 1013904223) >>> 0; return highState / 0x1_0000_0000; };
      if (new UpgradeSystem().choices(3, lowRandom, { healthRatio: 0.35 }).some((choice) => choice.survival)) lowHealthSurvival += 1;
      if (new UpgradeSystem().choices(3, highRandom, { healthRatio: 0.9 }).some((choice) => choice.survival)) highHealthSurvival += 1;
    }
    expect(lowHealthSurvival).toBe(80);
    expect(highHealthSurvival).toBeLessThan(lowHealthSurvival);
  });
});
