import { describe, expect, it } from 'vitest';
import { CombatStats } from '../game/systems/CombatStats';

describe('player death cause history', () => {
  it('keeps the newest three damage events with their combat context', () => {
    const stats = new CombatStats();
    for (let index = 0; index < 4; index += 1) stats.playerDamage({
      time: index * 100,
      attackerId: `enemy-${index}`,
      attackId: `attack-${index}`,
      patternName: `pattern-${index}`,
      modifier: index === 3 ? 'mixed-archive' : undefined,
      amount: 10 + index,
      act: 2,
      wave: '편집 실험',
      x: 400,
      y: 280,
      parryable: index % 2 === 0,
    });
    const recent = stats.snapshot().recentPlayerDamage;
    expect(recent.map((event) => event.attackId)).toEqual(['attack-1', 'attack-2', 'attack-3']);
    expect(recent.at(-1)).toMatchObject({ patternName: 'pattern-3', modifier: 'mixed-archive', amount: 13 });
  });

  it('clears damage history with the run statistics', () => {
    const stats = new CombatStats();
    stats.playerDamage({ time: 0, attackerId: 'boss', attackId: 'fatal', patternName: '삭제', amount: 50, act: 2, wave: 'Boss P2', x: 0, y: 0, parryable: false });
    stats.reset();
    expect(stats.snapshot().recentPlayerDamage).toEqual([]);
  });
});
