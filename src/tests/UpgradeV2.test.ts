import { describe, expect, it } from 'vitest';
import { UPGRADES, upgradeDescription } from '../game/data/upgrades';
import { UpgradeSystem } from '../game/systems/UpgradeSystem';

describe('UpgradeSystem v2', () => {
  it('신규 행동 변화 강화 8개가 실제 효과 수치와 중첩 제한을 가진다', () => {
    const ids = ['chain-breath', 'stop-resonance', 'backflow-shards', 'regression-sword-shadow', 'linked-counter', 'unbroken-context', 'dragon-rhythm', 'echo-amplifier'];
    for (const id of ids) {
      const upgrade = UPGRADES.find((item) => item.id === id);
      expect(upgrade).toBeDefined(); expect(Object.keys(upgrade?.effect ?? {}).length).toBeGreaterThan(0); expect(upgrade?.maxStacks).toBeGreaterThan(0);
      expect(upgradeDescription(upgrade!, 1)).not.toContain('undefined');
    }
  });
  it('보유 태그 연관 카드와 새 빌드 카드가 함께 제시된다', () => {
    const system = new UpgradeSystem(); system.add('dragon-fang'); const choices = system.choices(3, () => 0);
    expect(choices.some((choice) => choice.tags.includes('blade'))).toBe(true);
    expect(choices.some((choice) => !choice.tags.includes('blade'))).toBe(true);
    expect(choices.filter((choice) => choice.survival).length).toBeLessThanOrEqual(1);
  });
  it('최대 중첩 카드는 제외되고 설명은 다음 중첩 수치를 반영한다', () => {
    const system = new UpgradeSystem(); system.add('unbroken-context'); expect(system.choices(20, () => 0).some((item) => item.id === 'unbroken-context')).toBe(false);
    const upgrade = UPGRADES.find((item) => item.id === 'chain-breath')!;
    expect(upgradeDescription(upgrade, 2)).toContain('24'); expect(upgradeDescription(upgrade, 2)).toContain('0.8초');
  });
});
