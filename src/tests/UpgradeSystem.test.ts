import { describe, expect, it } from 'vitest';
import { UpgradeSystem } from '../game/systems/UpgradeSystem';

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
});
