import type { UpgradeRuntimeSnapshot } from './UpgradeSystem';
import { UpgradeSystem } from './UpgradeSystem';
import { CombatStats, type CombatStatsSnapshot } from './CombatStats';
import type { RunId } from './RunSessionController';

export interface ActState {
  actNumber: number;
  actId: string;
  actName: string;
  waveIndex: number;
  themeId: string;
  enemySetId: string;
  bossId: string;
  modifiers: readonly string[];
  generation: number;
}

export interface ActConfiguration {
  actNumber: number;
  actId?: string;
  actName?: string;
  themeId: string;
  enemySetId: string;
  bossId?: string;
  modifiers?: readonly string[];
}

export interface RunActScope {
  runId: RunId;
  actGeneration: number;
}

export interface RunProgressSnapshot {
  runId: RunId;
  act: ActState;
  upgrades: UpgradeRuntimeSnapshot;
  combatStats: CombatStatsSnapshot;
  staleScopeCallbacksBlocked: number;
}

const initialAct = (generation = 0): ActState => ({
  actNumber: 1,
  actId: 'act-1-echo-room',
  actName: '계승실',
  waveIndex: 0,
  themeId: 'echo-room',
  enemySetId: 'archive-ruins',
  bossId: 'record-devourer',
  modifiers: [],
  generation,
});

/**
 * Separates state that survives an Act boundary from disposable Act progress.
 * A new Run replaces upgrades/statistics; beginAct intentionally preserves
 * those objects while issuing a new generation for stale callback rejection.
 */
export class RunProgressController {
  private currentRunId: RunId = 0;
  private actState = initialAct();
  private upgradesValue = new UpgradeSystem();
  private combatStatsValue = new CombatStats();
  private blockedCallbacks = 0;

  public beginRun(runId: RunId): boolean {
    if (!Number.isInteger(runId) || runId <= this.currentRunId) return false;
    this.currentRunId = runId;
    this.actState = initialAct(this.actState.generation + 1);
    this.upgradesValue = new UpgradeSystem();
    this.combatStatsValue = new CombatStats();
    return true;
  }

  public beginAct(runId: RunId, configuration: ActConfiguration): boolean {
    if (!this.isCurrentRun(runId) || !Number.isInteger(configuration.actNumber) || configuration.actNumber < 1) return false;
    this.actState = {
      actNumber: configuration.actNumber,
      actId: configuration.actId ?? `act-${configuration.actNumber}`,
      actName: configuration.actName ?? `Act ${configuration.actNumber}`,
      waveIndex: 0,
      themeId: configuration.themeId,
      enemySetId: configuration.enemySetId,
      bossId: configuration.bossId ?? 'record-devourer',
      modifiers: [...(configuration.modifiers ?? [])],
      generation: this.actState.generation + 1,
    };
    return true;
  }

  public setWave(runId: RunId, actGeneration: number, waveIndex: number): boolean {
    if (!this.isCurrentScope({ runId, actGeneration }) || !Number.isInteger(waveIndex) || waveIndex < 0) return false;
    this.actState = { ...this.actState, waveIndex };
    return true;
  }

  public isCurrentRun(runId: RunId): boolean { return runId === this.currentRunId; }

  public isCurrentScope(scope: RunActScope): boolean {
    return this.isCurrentRun(scope.runId) && scope.actGeneration === this.actState.generation;
  }

  public captureScope(): RunActScope {
    return { runId: this.currentRunId, actGeneration: this.actState.generation };
  }

  public invoke(scope: RunActScope, callback: () => void): boolean {
    if (!this.isCurrentScope(scope)) {
      this.blockedCallbacks += 1;
      return false;
    }
    callback();
    return true;
  }

  public get upgrades(): UpgradeSystem { return this.upgradesValue; }
  public get combatStats(): CombatStats { return this.combatStatsValue; }
  public get act(): ActState { return { ...this.actState }; }

  public snapshot(): RunProgressSnapshot {
    return {
      runId: this.currentRunId,
      act: { ...this.actState },
      upgrades: this.upgradesValue.runtimeSnapshot(),
      combatStats: this.combatStatsValue.snapshot(),
      staleScopeCallbacksBlocked: this.blockedCallbacks,
    };
  }
}
