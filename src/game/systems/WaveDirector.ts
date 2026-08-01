import type { EnemyDeathSource } from './CombatLifecycle';

export type WaveState = 'IDLE' | 'SPAWNING' | 'COMBAT' | 'CLEAR_STABILIZING' | 'TRANSITIONED';

export interface WaveEnemySnapshot {
  id: string;
  active: boolean;
  visible: boolean;
  alive: boolean;
  destroyed: boolean;
  tracked: boolean;
  x: number;
  y: number;
  insideBounds: boolean;
}

export interface WaveDirectorSnapshot {
  waveState: WaveState;
  spawnSequenceComplete: boolean;
  pendingSpawnCount: number;
  livingEnemyIds: readonly string[];
  roundTransitionStarted: boolean;
  lastSpawnEvent?: { id: string; at: number };
  lastDeathEvent?: { id: string; source: EnemyDeathSource; at: number };
  lastRoundEvaluation: string;
  transitionCount: number;
}

export interface WaveEvaluation {
  shouldTransition: boolean;
  staleRemoved: readonly string[];
  unregisteredAdded: readonly string[];
  outsideBounds: readonly string[];
}

export class WaveDirector {
  private state: WaveState = 'IDLE';
  private spawnComplete = false;
  private pending = 0;
  private readonly living = new Set<string>();
  private readonly spawned = new Set<string>();
  private readonly staleSince = new Map<string, number>();
  private transitionStarted = false;
  private emptySince?: number;
  private lastSpawn?: { id: string; at: number };
  private lastDeath?: { id: string; source: EnemyDeathSource; at: number };
  private lastEvaluation = 'wave idle';
  private transitionCountValue = 0;

  public constructor(
    private readonly clearStabilityMs = 320,
    private readonly staleRecoveryMs = 1500,
  ) {}

  public startWave(expectedSpawnCount: number, now: number): void {
    this.state = expectedSpawnCount > 0 ? 'SPAWNING' : 'CLEAR_STABILIZING';
    this.spawnComplete = expectedSpawnCount <= 0;
    this.pending = Math.max(0, expectedSpawnCount);
    this.living.clear(); this.spawned.clear(); this.staleSince.clear();
    this.transitionStarted = false; this.emptySince = expectedSpawnCount <= 0 ? now : undefined;
    this.lastSpawn = undefined; this.lastDeath = undefined; this.lastEvaluation = 'waiting for spawn sequence';
    this.transitionCountValue = 0;
  }

  public registerSpawn(id: string, now: number): boolean {
    if (this.spawned.has(id)) return false;
    this.spawned.add(id); this.living.add(id);
    this.pending = Math.max(0, this.pending - 1);
    this.spawnComplete = this.pending === 0;
    this.state = this.spawnComplete ? 'COMBAT' : 'SPAWNING';
    this.emptySince = undefined; this.lastSpawn = { id, at: now };
    this.lastEvaluation = this.spawnComplete ? 'spawn sequence complete; enemies alive' : `${this.pending} spawn(s) pending`;
    return true;
  }

  public cancelPendingSpawn(count = 1): void {
    this.pending = Math.max(0, this.pending - Math.max(0, count));
    this.spawnComplete = this.pending === 0;
    if (this.spawnComplete && this.living.size === 0) this.state = 'CLEAR_STABILIZING';
  }

  public registerDeath(id: string, source: EnemyDeathSource, now: number): boolean {
    this.lastDeath = { id, source, at: now };
    this.staleSince.delete(id);
    const removed = this.living.delete(id);
    if (removed && this.spawnComplete && this.living.size === 0) {
      this.emptySince = now; this.state = 'CLEAR_STABILIZING';
    }
    return removed;
  }

  public evaluate(now: number, actualEnemies: readonly WaveEnemySnapshot[]): WaveEvaluation {
    const actualById = new Map(actualEnemies.filter((enemy) => enemy.tracked).map((enemy) => [enemy.id, enemy]));
    const staleRemoved: string[] = []; const unregisteredAdded: string[] = []; const outsideBounds: string[] = [];

    for (const id of [...this.living]) {
      const actual = actualById.get(id);
      const stale = !actual || !actual.active || !actual.alive || actual.destroyed;
      if (!stale) {
        this.staleSince.delete(id);
        if (!actual.insideBounds) outsideBounds.push(id);
        continue;
      }
      const since = this.staleSince.get(id) ?? now; this.staleSince.set(id, since);
      if (now - since >= this.staleRecoveryMs) {
        this.living.delete(id); this.staleSince.delete(id); staleRemoved.push(id);
      }
    }

    for (const enemy of actualEnemies) {
      if (!enemy.tracked || !enemy.active || !enemy.alive || enemy.destroyed || this.living.has(enemy.id)) continue;
      this.living.add(enemy.id); this.spawned.add(enemy.id); this.emptySince = undefined;
      unregisteredAdded.push(enemy.id);
      if (!enemy.insideBounds) outsideBounds.push(enemy.id);
    }

    const clearConditions = this.spawnComplete && this.pending === 0 && this.living.size === 0;
    if (!clearConditions) {
      this.emptySince = undefined;
      this.state = this.spawnComplete ? 'COMBAT' : 'SPAWNING';
      const blockers = [!this.spawnComplete ? 'spawn sequence incomplete' : '', this.pending > 0 ? `${this.pending} pending spawn(s)` : '', this.living.size > 0 ? `${this.living.size} living enemy id(s)` : ''].filter(Boolean);
      this.lastEvaluation = blockers.join(', ') || 'combat active';
      return { shouldTransition: false, staleRemoved, unregisteredAdded, outsideBounds };
    }

    this.emptySince ??= now;
    this.state = 'CLEAR_STABILIZING';
    const stableFor = now - this.emptySince;
    this.lastEvaluation = `clear conditions stable for ${Math.round(stableFor)}ms`;
    if (!this.transitionStarted && stableFor >= this.clearStabilityMs) {
      this.transitionStarted = true; this.state = 'TRANSITIONED'; this.transitionCountValue += 1;
      this.lastEvaluation = 'round transition authorized';
      return { shouldTransition: true, staleRemoved, unregisteredAdded, outsideBounds };
    }
    return { shouldTransition: false, staleRemoved, unregisteredAdded, outsideBounds };
  }

  public snapshot(): WaveDirectorSnapshot {
    return {
      waveState: this.state,
      spawnSequenceComplete: this.spawnComplete,
      pendingSpawnCount: this.pending,
      livingEnemyIds: [...this.living].sort(),
      roundTransitionStarted: this.transitionStarted,
      lastSpawnEvent: this.lastSpawn ? { ...this.lastSpawn } : undefined,
      lastDeathEvent: this.lastDeath ? { ...this.lastDeath } : undefined,
      lastRoundEvaluation: this.lastEvaluation,
      transitionCount: this.transitionCountValue,
    };
  }

  public reset(): void {
    this.state = 'IDLE'; this.spawnComplete = false; this.pending = 0;
    this.living.clear(); this.spawned.clear(); this.staleSince.clear();
    this.transitionStarted = false; this.emptySince = undefined;
    this.lastSpawn = undefined; this.lastDeath = undefined; this.lastEvaluation = 'wave idle'; this.transitionCountValue = 0;
  }
}
