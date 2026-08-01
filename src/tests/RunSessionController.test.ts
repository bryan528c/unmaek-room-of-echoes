import { describe, expect, it } from 'vitest';
import { RunSessionController } from '../game/systems/RunSessionController';

describe('RunSessionController', () => {
  it('clears every boss field when a new run starts', () => {
    const runs = new RunSessionController();
    const first = runs.beginRun();
    runs.activateBoss(first, 'boss-old', 417, 900);
    runs.updateBoss(first, { phase: 3, health: 63 });

    const second = runs.beginRun();
    expect(second).not.toBe(first);
    expect(runs.snapshot().boss).toEqual({ id: undefined, health: 0, maxHealth: 0, phase: 1, active: false, defeated: false });
    expect(runs.shouldShowBossHud(second, 'COMBAT')).toBe(false);
  });

  it.each([1, 2, 3] as const)('resets a run after death in boss phase %s', (phase) => {
    const runs = new RunSessionController();
    const oldRun = runs.beginRun();
    runs.activateBoss(oldRun, 'record-eater', 900, 900);
    runs.updateBoss(oldRun, { phase, health: 900 - phase * 200 });
    const newRun = runs.beginRun();
    expect(runs.snapshot().runId).toBe(newRun);
    expect(runs.snapshot().boss.active).toBe(false);
    expect(runs.shouldShowBossHud(newRun, 'COMBAT', 'record-eater')).toBe(false);
  });

  it('blocks callbacks and boss writes captured by an earlier run', () => {
    const runs = new RunSessionController();
    const oldRun = runs.beginRun();
    let calls = 0;
    const newRun = runs.beginRun();
    expect(runs.invoke(oldRun, () => { calls += 1; })).toBe(false);
    expect(runs.activateBoss(oldRun, 'stale-boss', 1, 900)).toBe(false);
    expect(runs.invoke(newRun, () => { calls += 1; })).toBe(true);
    expect(calls).toBe(1);
    expect(runs.snapshot().staleCallbacksBlocked).toBe(2);
  });

  it('survives twenty restart cycles without exposing a stale boss HUD', () => {
    const runs = new RunSessionController();
    let previous = 0;
    for (let index = 0; index < 20; index += 1) {
      const runId = runs.beginRun();
      expect(runId).toBeGreaterThan(previous);
      expect(runs.shouldShowBossHud(runId, 'COMBAT')).toBe(false);
      runs.activateBoss(runId, `boss-${index}`, 900, 900);
      expect(runs.shouldShowBossHud(runId, 'COMBAT', `boss-${index}`)).toBe(true);
      runs.clearBoss(runId, true);
      expect(runs.shouldShowBossHud(runId, 'COMBAT', `boss-${index}`)).toBe(false);
      previous = runId;
    }
  });
});
