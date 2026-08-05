import { describe, expect, it } from 'vitest';
import { RunOutcomeController } from '../game/systems/CombatLifecycle';
import { activeModifiersForWave, actDefinition, RunActDirector, shouldFinishSubmissionRun, simulateLongRun } from '../game/systems/RunActDirector';

describe('RunActDirector', () => {
  it('keeps the run alive after the Act 1 boss and advances to the distinct Act 2 definition', () => {
    const director = new RunActDirector(); expect(director.beginRun(1, 0, 0)).toBe(true);
    director.current.waves.forEach((_wave, index) => expect(director.beginWave(index)).toBe(true));
    director.completeBoss(180_000, 36);
    const act2 = director.advanceAct(184_000, 36);
    expect(act2).toMatchObject({ index: 2, id: 'act-2-sinkhole-lowland', name: '천갱 저지림', bossId: 'diffraction_pangolin' });
    expect(act2.waves).toHaveLength(4);
    expect(new Set(act2.waves.flatMap((wave) => wave.batches.flat()))).toEqual(new Set(['chaser', 'archer']));
    expect(new Set(act2.waves.flatMap((wave) => wave.patterns))).toEqual(new Set(['ink-echo-projectile', 'stitch-pair', 'past-position', 'mixed-archive']));
    expect(director.snapshot()).toMatchObject({ bossesDefeated: 1, completedActs: 1, highestAct: 2 });
  });

  it('enters the official Act 3, then preserves the generated Endless flow after its boss', () => {
    const director = new RunActDirector(); director.beginRun(7);
    director.completeBoss(100_000, 20); director.advanceAct(104_000, 20);
    director.completeBoss(240_000, 45); const act3 = director.advanceAct(244_000, 45);
    expect(act3).toMatchObject({ index: 3, id: 'act-3-central-waterway', name: '중앙 습지와 지하 수로', bossId: 'channel_otter_mother' });
    expect(new Set(act3.waves.flatMap((wave) => wave.batches.flat()))).toEqual(new Set(['elite', 'archer']));
    expect(act3.modifiers.length).toBeGreaterThanOrEqual(1);
    expect(activeModifiersForWave(act3, 0)).toHaveLength(1);
    expect(activeModifiersForWave(act3, 1)).toEqual(act3.modifiers);
    expect(act3.waves.every((wave) => !wave.label.startsWith('Act '))).toBe(true);
    expect(act3.healthMultiplier).toBeGreaterThan(1); expect(act3.damageMultiplier).toBeGreaterThan(1);
    director.completeBoss(380_000, 60); const act4 = director.advanceAct(384_000, 60);
    expect(act4).toMatchObject({ index: 4, name: '끊기지 않는 기록' });
    expect(actDefinition(30).healthMultiplier).toBeLessThanOrEqual(2.35);
    expect(actDefinition(30).damageMultiplier).toBeLessThanOrEqual(1.85);
    expect(director.snapshot()).toMatchObject({ bossesDefeated: 3, completedActs: 3, highestAct: 4 });
  });

  it('ends the production submission after Act 3 exactly once while keeping explicit development Endless access', () => {
    expect(shouldFinishSubmissionRun(2, { development: false, endlessRequested: false })).toBe(false);
    expect(shouldFinishSubmissionRun(3, { development: false, endlessRequested: false })).toBe(true);
    expect(shouldFinishSubmissionRun(3, { development: false, endlessRequested: true })).toBe(true);
    expect(shouldFinishSubmissionRun(3, { development: true, endlessRequested: false })).toBe(true);
    expect(shouldFinishSubmissionRun(3, { development: true, endlessRequested: true })).toBe(false);

    const director = new RunActDirector(); director.beginRun(11);
    director.completeBoss(100_000, 10); director.advanceAct(104_000, 10);
    director.completeBoss(220_000, 20); director.advanceAct(224_000, 20);
    director.completeBoss(340_000, 30);
    const outcome = new RunOutcomeController(); let resultTransitions = 0;
    if (outcome.claim('VICTORY') && outcome.consumeResultTransition('VICTORY')) resultTransitions += 1;
    if (outcome.claim('VICTORY') && outcome.consumeResultTransition('VICTORY')) resultTransitions += 1;
    expect(resultTransitions).toBe(1);
    expect(director.snapshot()).toMatchObject({ current: { index: 3 }, bossesDefeated: 3, completedActs: 3, highestAct: 3 });
  });

  it('blocks old act callbacks without discarding run-wide boss and result records', () => {
    const director = new RunActDirector(); director.beginRun(2);
    const stale = director.captureScope(); director.completeBoss(90_000, 10); director.advanceAct(94_000, 10);
    let changed = false; expect(director.invoke(stale, () => { changed = true; })).toBe(false);
    expect(changed).toBe(false);
    expect(director.snapshot()).toMatchObject({ staleActCallbacksBlocked: 1, bossesDefeated: 1, results: [{ actIndex: 1, bossDefeated: true }] });
  });

  it('resets every Act/result counter for a new run', () => {
    const director = new RunActDirector(); director.beginRun(1); director.completeBoss(1000, 5); director.advanceAct(2000, 5);
    expect(director.beginRun(2, 0, 0)).toBe(true);
    expect(director.snapshot()).toMatchObject({ runId: 2, waveIndex: 0, bossesDefeated: 0, completedActs: 0, highestAct: 1, results: [] });
  });

  it('simulates at least twenty minutes and five Acts without premature result or lifecycle accumulation', () => {
    const report = simulateLongRun(20);
    expect(report.simulatedMinutes).toBe(20);
    expect(report.actsCompleted).toBeGreaterThanOrEqual(5);
    expect(report.bossesDefeated).toBe(report.actsCompleted);
    expect(report.prematureResults).toBe(0);
    expect(report.staleCallbacksAccepted).toBe(0);
    expect(report.maximumTimers).toBeLessThanOrEqual(8);
    expect(report.maximumListeners).toBeLessThanOrEqual(12);
  });
});
