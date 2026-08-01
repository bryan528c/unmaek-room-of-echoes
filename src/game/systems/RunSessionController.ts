export type RunId = number;

export interface RunBossState {
  id?: string;
  health: number;
  maxHealth: number;
  phase: 1 | 2 | 3;
  active: boolean;
  defeated: boolean;
}

export interface RunSessionSnapshot {
  runId: RunId;
  boss: RunBossState;
  staleCallbacksBlocked: number;
}

const emptyBoss = (): RunBossState => ({
  id: undefined,
  health: 0,
  maxHealth: 0,
  phase: 1,
  active: false,
  defeated: false,
});

/**
 * Owns all state that must never survive a new run. The controller itself is
 * retained by Phaser's reused Scene instance so every beginRun() gets a fresh
 * monotonically increasing id.
 */
export class RunSessionController {
  private currentRunId = 0;
  private bossState = emptyBoss();
  private blockedCallbacks = 0;

  public beginRun(): RunId {
    this.currentRunId += 1;
    this.bossState = emptyBoss();
    return this.currentRunId;
  }

  public isCurrent(runId: RunId): boolean { return runId === this.currentRunId; }

  public invoke(runId: RunId, callback: () => void): boolean {
    if (!this.isCurrent(runId)) {
      this.blockedCallbacks += 1;
      return false;
    }
    callback();
    return true;
  }

  public activateBoss(runId: RunId, id: string, health: number, maxHealth: number): boolean {
    if (!this.isCurrent(runId)) { this.blockedCallbacks += 1; return false; }
    this.bossState = { id, health, maxHealth, phase: 1, active: true, defeated: false };
    return true;
  }

  public updateBoss(runId: RunId, values: Partial<Pick<RunBossState, 'health' | 'maxHealth' | 'phase'>>): boolean {
    if (!this.isCurrent(runId) || !this.bossState.active) {
      if (!this.isCurrent(runId)) this.blockedCallbacks += 1;
      return false;
    }
    this.bossState = { ...this.bossState, ...values };
    return true;
  }

  public clearBoss(runId: RunId, defeated = false): boolean {
    if (!this.isCurrent(runId)) { this.blockedCallbacks += 1; return false; }
    this.bossState = { ...emptyBoss(), defeated };
    return true;
  }

  public shouldShowBossHud(runId: RunId, flowState: string, liveBossId?: string): boolean {
    return this.isCurrent(runId)
      && flowState === 'COMBAT'
      && this.bossState.active
      && this.bossState.id !== undefined
      && this.bossState.id === liveBossId;
  }

  public snapshot(): RunSessionSnapshot {
    return { runId: this.currentRunId, boss: { ...this.bossState }, staleCallbacksBlocked: this.blockedCallbacks };
  }
}
