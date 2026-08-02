import { describe, expect, it } from 'vitest';
import { RunProgressController } from '../game/systems/RunProgressController';

describe('RunProgressController', () => {
  it('keeps cards, resonances, contributions, and combat stats across a virtual Act transition', () => {
    const progress = new RunProgressController();
    expect(progress.beginRun(1)).toBe(true);
    const upgrades = progress.upgrades;
    const stats = progress.combatStats;
    upgrades.add('returning-scar');
    upgrades.add('isolation-chain');
    upgrades.record('returning-scar', { activationCount: 1, damageContribution: 24, hitCount: 1 });
    stats.word('rewind');

    expect(progress.beginAct(1, { actNumber: 2, themeId: 'sealed-hall', enemySetId: 'ink-depths' })).toBe(true);
    expect(progress.upgrades).toBe(upgrades);
    expect(progress.combatStats).toBe(stats);
    expect(progress.upgrades.hasResonance('regression-chain')).toBe(true);
    expect(progress.snapshot().upgrades.contributions['returning-scar']).toMatchObject({
      activationCount: 1,
      damageContribution: 24,
      hitCount: 1,
    });
    expect(progress.snapshot().combatStats.wordUses.rewind).toBe(1);
    expect(progress.act).toMatchObject({ actNumber: 2, waveIndex: 0, themeId: 'sealed-hall', enemySetId: 'ink-depths' });
  });

  it('clears all Run-scoped cards, resonances, and statistics on a new Run', () => {
    const progress = new RunProgressController();
    progress.beginRun(1);
    const oldUpgrades = progress.upgrades;
    const oldStats = progress.combatStats;
    progress.upgrades.add('dual-moon-echo');
    progress.upgrades.add('wide-orbit');
    progress.upgrades.recordResonance('moon-ring', { activationCount: 1, damageContribution: 9 });
    progress.combatStats.echoBladeHit(12);

    expect(progress.beginRun(2)).toBe(true);
    expect(progress.upgrades).not.toBe(oldUpgrades);
    expect(progress.combatStats).not.toBe(oldStats);
    expect(progress.snapshot().upgrades.owned).toEqual([]);
    expect(progress.snapshot().upgrades.resonances).toEqual([]);
    expect(progress.snapshot().upgrades.resonanceContributions).toEqual({});
    expect(progress.snapshot().combatStats.echoBlade.damage).toBe(0);
    expect(progress.act).toMatchObject({ actNumber: 1, waveIndex: 0 });
  });

  it('rejects stale Run and stale Act callbacks without mutating current progress', () => {
    const progress = new RunProgressController();
    progress.beginRun(7);
    const actOne = progress.captureScope();
    expect(progress.setWave(7, actOne.actGeneration, 2)).toBe(true);
    progress.beginAct(7, { actNumber: 2, themeId: 'next', enemySetId: 'next-enemies' });
    const actTwo = progress.captureScope();
    let calls = 0;

    expect(progress.invoke(actOne, () => { calls += 1; })).toBe(false);
    expect(progress.setWave(7, actOne.actGeneration, 3)).toBe(false);
    expect(progress.invoke(actTwo, () => { calls += 1; })).toBe(true);
    expect(progress.beginAct(6, { actNumber: 3, themeId: 'stale', enemySetId: 'stale' })).toBe(false);
    expect(calls).toBe(1);
    expect(progress.act).toMatchObject({ actNumber: 2, waveIndex: 0 });
    expect(progress.snapshot().staleScopeCallbacksBlocked).toBe(1);
  });
});
