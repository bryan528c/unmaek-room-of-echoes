import { describe, expect, it } from 'vitest';
import { upgradeById, upgradeDescription } from '../game/data/upgrades';
import { sealedSentenceStats, UpgradeSystem } from '../game/systems/UpgradeSystem';

describe('UpgradeSystem', () => {
  it('정의된 강화는 최대 중첩까지 중복 선택할 수 있다', () => {
    const system = new UpgradeSystem();
    expect(system.add('dragon-fang')).toBe(true);
    expect(system.add('dragon-fang')).toBe(true);
    expect(system.add('dragon-fang')).toBe(true);
    expect(system.add('dragon-fang')).toBe(false);
    expect(system.getStack('dragon-fang')).toBe(3);
  });

  it('존재하지 않는 강화는 거부한다', () => {
    const system = new UpgradeSystem();
    expect(system.add('missing' as never)).toBe(false);
  });

  it('선택지에는 최대 중첩에 도달한 강화가 나오지 않는다', () => {
    const system = new UpgradeSystem();
    system.add('inscription-spread');
    const choices = system.choices(12, () => 0);
    expect(choices.some((choice) => choice.id === 'inscription-spread')).toBe(false);
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
});
