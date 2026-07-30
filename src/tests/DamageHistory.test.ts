import { describe, expect, it } from 'vitest';
import { DamageHistory } from '../game/systems/DamageHistory';

describe('피해 회귀 기록', () => {
  it('허용된 직접 피해만 명시적으로 기록하고 최근 피해를 합산한다', () => {
    const history = new DamageHistory(2200);
    history.record(100, 'a', 20, 'attack'); history.record(900, 'a', 30, 'word'); history.record(900, 'b', 99, 'attack');
    history.record(1000, 'a', 200, 'linked'); history.record(1100, 'a', 300, 'chain'); history.record(1200, 'a', 400, 'damage-over-time');
    expect(history.recentDamage('a', 2000, 2000)).toBe(50);
  });

  it('보관 시간을 지난 피해를 제거한다', () => {
    const history = new DamageHistory(2200); history.record(0, 'a', 20, 'attack'); history.record(2500, 'a', 10, 'attack');
    expect(history.recentDamage('a', 2500, 2000)).toBe(10);
  });

  it('reset 후에는 재시작 전 피해가 남지 않는다', () => {
    const history = new DamageHistory(2200); history.record(100, 'a', 20, 'attack'); history.reset();
    expect(history.hasRecentDamage(['a'], 500, 2000)).toBe(false);
  });
});
