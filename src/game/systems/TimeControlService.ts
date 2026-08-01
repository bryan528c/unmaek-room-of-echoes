export type TimePauseReason =
  | 'USER_PAUSE'
  | 'REWARD_SCREEN'
  | 'TAB_HIDDEN'
  | 'BOSS_TRANSITION'
  | 'BOSS_DEFEATED'
  | 'HITSTOP'
  | 'SCENE_TRANSITION'
  | 'RESULT';

export interface TimeControlAdapter {
  setPhysicsPaused(paused: boolean): void;
  setGameTimeScale(scale: number): void;
  /** Logical physics speed multiplier. The Phaser adapter must not pass this
   * directly to Arcade World.timeScale, whose semantics are inverse. */
  setPhysicsScale(scale: number): void;
  setTweenScale(scale: number): void;
  setAnimationScale(scale: number): void;
}

export interface RealtimeScheduler {
  now(): number;
  schedule(callback: () => void, delayMs: number): number;
  cancel(handle: number): void;
}

export interface TimeControlSnapshot {
  activeReasons: readonly TimePauseReason[];
  physicsPaused: boolean;
  gameTimeScale: number;
  physicsScale: number;
  tweenScale: number;
  animationScale: number;
  lastHitstopStartedAt?: number;
  lastHitstopEndedAt?: number;
  hitstopDeadline?: number;
}

const HARD_REASONS = new Set<TimePauseReason>(['USER_PAUSE', 'REWARD_SCREEN', 'TAB_HIDDEN', 'SCENE_TRANSITION', 'RESULT']);

const defaultScheduler: RealtimeScheduler = {
  now: () => performance.now(),
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: (handle) => window.clearTimeout(handle),
};

export class TimeControlService {
  private readonly tokens = new Map<string, { reason: TimePauseReason; owner: string; acquiredAt: number }>();
  private physicsPaused = false;
  private gameTimeScale = 1;
  private physicsScale = 1;
  private tweenScale = 1;
  private animationScale = 1;
  private hitstopHandle?: number;
  private hitstopGeneration = 0;
  private hitstopDeadline?: number;
  private hitstopOwner?: string;
  private lastHitstopStartedAt?: number;
  private lastHitstopEndedAt?: number;

  public constructor(
    private readonly adapter: TimeControlAdapter,
    private readonly scheduler: RealtimeScheduler = defaultScheduler,
    private readonly maximumHitstopMs = 120,
  ) {}

  public acquire(reason: TimePauseReason, owner: string): string {
    const token = `${owner}:${reason}`;
    if (!this.tokens.has(token)) this.tokens.set(token, { reason, owner, acquiredAt: this.scheduler.now() });
    this.apply();
    return token;
  }

  public release(reason: TimePauseReason, owner: string): boolean {
    const removed = this.tokens.delete(`${owner}:${reason}`);
    if (removed) this.apply();
    return removed;
  }

  public requestHitstop(owner: string, durationMs: number): void {
    const now = this.scheduler.now();
    const duration = Math.max(0, Math.min(this.maximumHitstopMs, durationMs));
    if (this.hitstopOwner && this.hitstopOwner !== owner) this.tokens.delete(`${this.hitstopOwner}:HITSTOP`);
    this.hitstopOwner = owner;
    const currentDeadline = this.hitstopDeadline ?? now;
    this.hitstopDeadline = Math.min(now + this.maximumHitstopMs, Math.max(currentDeadline, now + duration));
    this.lastHitstopStartedAt = now;
    this.acquire('HITSTOP', owner);
    this.hitstopGeneration += 1;
    const generation = this.hitstopGeneration;
    if (this.hitstopHandle !== undefined) this.scheduler.cancel(this.hitstopHandle);
    this.hitstopHandle = this.scheduler.schedule(() => {
      if (generation !== this.hitstopGeneration) return;
      this.hitstopHandle = undefined;
      this.hitstopDeadline = undefined;
      this.lastHitstopEndedAt = this.scheduler.now();
      const currentOwner = this.hitstopOwner;
      this.hitstopOwner = undefined;
      if (currentOwner) this.release('HITSTOP', currentOwner);
    }, Math.max(0, this.hitstopDeadline - now));
  }

  public clearStaleHitstop(now = this.scheduler.now(), graceMs = 80): boolean {
    if (this.hitstopDeadline === undefined || now <= this.hitstopDeadline + graceMs) return false;
    const token = [...this.tokens.values()].find((entry) => entry.reason === 'HITSTOP');
    if (!token) { this.hitstopDeadline = undefined; return false; }
    this.hitstopGeneration += 1;
    if (this.hitstopHandle !== undefined) this.scheduler.cancel(this.hitstopHandle);
    this.hitstopHandle = undefined;
    this.hitstopDeadline = undefined;
    this.hitstopOwner = undefined;
    this.lastHitstopEndedAt = now;
    this.release('HITSTOP', token.owner);
    return true;
  }

  public releaseOwner(owner: string): void {
    if (this.hitstopOwner === owner) {
      this.hitstopGeneration += 1;
      if (this.hitstopHandle !== undefined) this.scheduler.cancel(this.hitstopHandle);
      this.hitstopHandle = undefined;
      this.hitstopDeadline = undefined;
      this.hitstopOwner = undefined;
      this.lastHitstopEndedAt = this.scheduler.now();
    }
    let changed = false;
    for (const [token, entry] of this.tokens) if (entry.owner === owner) { this.tokens.delete(token); changed = true; }
    if (changed) this.apply();
  }

  public hasReason(reason: TimePauseReason): boolean {
    return [...this.tokens.values()].some((entry) => entry.reason === reason);
  }

  public get isHardPaused(): boolean {
    return [...this.tokens.values()].some((entry) => HARD_REASONS.has(entry.reason) || entry.reason === 'BOSS_TRANSITION' || entry.reason === 'BOSS_DEFEATED');
  }

  public snapshot(): TimeControlSnapshot {
    return {
      activeReasons: [...new Set([...this.tokens.values()].map((entry) => entry.reason))].sort(),
      physicsPaused: this.physicsPaused,
      gameTimeScale: this.gameTimeScale,
      physicsScale: this.physicsScale,
      tweenScale: this.tweenScale,
      animationScale: this.animationScale,
      lastHitstopStartedAt: this.lastHitstopStartedAt,
      lastHitstopEndedAt: this.lastHitstopEndedAt,
      hitstopDeadline: this.hitstopDeadline,
    };
  }

  public dispose(restoreAdapter = true): void {
    this.hitstopGeneration += 1;
    if (this.hitstopHandle !== undefined) this.scheduler.cancel(this.hitstopHandle);
    this.hitstopHandle = undefined;
    this.hitstopDeadline = undefined;
    this.hitstopOwner = undefined;
    this.tokens.clear();
    if (restoreAdapter) this.apply();
    else {
      this.physicsPaused = false; this.gameTimeScale = 1; this.physicsScale = 1; this.tweenScale = 1; this.animationScale = 1;
    }
  }

  private apply(): void {
    const reasons = new Set([...this.tokens.values()].map((entry) => entry.reason));
    const hardPaused = [...reasons].some((reason) => HARD_REASONS.has(reason));
    const bossTransition = reasons.has('BOSS_TRANSITION');
    const bossDefeated = reasons.has('BOSS_DEFEATED');
    const cinematicPause = bossTransition || bossDefeated;
    const hitstop = reasons.has('HITSTOP') && !hardPaused && !cinematicPause;
    // Arcade World.timeScale is inverse (0.5 is double speed), so applying the
    // logical 0.08 hitstop scale directly causes a 12.5x physics burst. A short
    // real-time hitstop pauses Arcade Physics instead; World.update then returns
    // before accumulating elapsed time, preventing a catch-up burst on resume.
    const nextPaused = hardPaused || cinematicPause || hitstop;
    const nextGameTimeScale = hardPaused ? 0 : hitstop ? 0.08 : 1;
    const nextPhysicsScale = 1;
    const nextTweenScale = hardPaused ? 0 : hitstop ? 0.18 : 1;
    const nextAnimationScale = hardPaused ? 0 : hitstop ? 0.18 : 1;

    if (nextGameTimeScale !== this.gameTimeScale) { this.gameTimeScale = nextGameTimeScale; this.adapter.setGameTimeScale(nextGameTimeScale); }
    if (nextPhysicsScale !== this.physicsScale) { this.physicsScale = nextPhysicsScale; this.adapter.setPhysicsScale(nextPhysicsScale); }
    if (nextTweenScale !== this.tweenScale) { this.tweenScale = nextTweenScale; this.adapter.setTweenScale(nextTweenScale); }
    if (nextAnimationScale !== this.animationScale) { this.animationScale = nextAnimationScale; this.adapter.setAnimationScale(nextAnimationScale); }
    if (nextPaused !== this.physicsPaused) { this.physicsPaused = nextPaused; this.adapter.setPhysicsPaused(nextPaused); }
  }
}
