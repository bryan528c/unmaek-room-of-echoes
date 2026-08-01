import { describe, expect, it } from 'vitest';
import { adjustLinkedIncomingDamage, linkShareRatio } from '../game/systems/WordCombatRules';

describe('되돌린다·잇는다 기본 효용 규칙', () => {
  it('단일 고립 연결은 직접 피해를 18% 높인다', () => {
    expect(adjustLinkedIncomingDamage(100, true, 1, false)).toEqual({ adjustedAmount: 118, isolatedBonus: 18 });
    expect(adjustLinkedIncomingDamage(100, true, 1, false, 1.38)).toEqual({ adjustedAmount: 138, isolatedBonus: 38 });
  });

  it('다수 연결과 전달 피해에는 고립 보너스를 재귀 적용하지 않는다', () => {
    expect(adjustLinkedIncomingDamage(100, true, 3, false)).toEqual({ adjustedAmount: 100, isolatedBonus: 0 });
    expect(adjustLinkedIncomingDamage(100, true, 1, true)).toEqual({ adjustedAmount: 100, isolatedBonus: 0 });
  });

  it('기본 공유 32%, 강화 공유 42%를 사용한다', () => {
    expect(linkShareRatio(false)).toBeCloseTo(0.32); expect(linkShareRatio(true)).toBeCloseTo(0.42);
  });
});
