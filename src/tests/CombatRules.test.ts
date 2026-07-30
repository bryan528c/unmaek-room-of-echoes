import { describe, expect, it } from 'vitest';
import { bossPhaseForHealth, parrySentenceReward } from '../game/systems/CombatRules';
import { rankFor } from '../game/utils/math';

describe('전투 규칙', () => {
  it('패링 보상은 기본값과 완벽한 호흡 중첩만큼 증가한다', () => {
    expect(parrySentenceReward(28, 0)).toBe(28);
    expect(parrySentenceReward(28, 2)).toBe(38);
  });

  it('보스 체력 경계에서 세 단계가 안정적으로 결정된다', () => {
    expect(bossPhaseForHealth(900, 900)).toBe(1);
    expect(bossPhaseForHealth(603, 900)).toBe(2);
    expect(bossPhaseForHealth(306, 900)).toBe(3);
  });

  it('초반 진행도 차이가 C 계열 랭크에 반영된다', () => {
    expect(rankFor(0, 100, 30, 1, false)).toBe('C-');
    expect(rankFor(700, 40, 120, 2, false)).toBe('C');
    expect(rankFor(1500, 40, 240, 3, false)).toBe('C+');
  });
});
