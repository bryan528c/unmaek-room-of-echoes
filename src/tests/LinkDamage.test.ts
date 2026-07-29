import { describe, expect, it } from 'vitest';
import { distributeLinkedDamage } from '../game/systems/LinkDamage';

describe('연결 피해', () => {
  const targets = [{ id: 'a', alive: true }, { id: 'b', alive: true }, { id: 'c', alive: false }];

  it('살아 있는 다른 연결 대상에게만 피해를 분배한다', () => {
    expect(distributeLinkedDamage('a', 100, targets, 0.3)).toEqual([
      { targetId: 'a', amount: 100, propagated: false },
      { targetId: 'b', amount: 30, propagated: true },
    ]);
  });

  it('이미 전달된 피해는 다시 분배하지 않아 무한 재귀를 막는다', () => {
    expect(distributeLinkedDamage('b', 30, targets, 0.3, true)).toEqual([
      { targetId: 'b', amount: 30, propagated: true },
    ]);
  });
});
