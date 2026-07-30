import { describe, expect, it } from 'vitest';
import { CombatStats } from '../game/systems/CombatStats';

describe('로컬 전투 통계', () => {
  it('연쇄 피해와 조작 통계를 분리해 기록한다', () => {
    const stats = new CombatStats(); stats.attackAttempt(); stats.attackHit(2); stats.parryAttempt(); stats.parrySuccess(true);
    stats.chain('backflow'); stats.addChainDamage('backflow', 18); stats.targetChanged(false); stats.targetChanged(true); stats.empower();
    const result = stats.snapshot();
    expect(result.attackHits).toBe(2); expect(result.perfectParries).toBe(1); expect(result.chainCounts.backflow).toBe(1); expect(result.chainDamage.backflow).toBe(18);
    expect(result.autoTargetChanges).toBe(1); expect(result.manualTargetChanges).toBe(1); expect(result.empowerUses).toBe(1);
  });
  it('snapshot은 내부 상태와 분리되고 reset은 장면 재시작 상태를 만든다', () => {
    const stats = new CombatStats(); stats.word('stop'); const snapshot = stats.snapshot(); snapshot.wordUses.stop = 99;
    expect(stats.snapshot().wordUses.stop).toBe(1); stats.reset(); expect(stats.snapshot().wordUses.stop).toBe(0);
  });
});
