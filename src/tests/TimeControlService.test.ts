import { describe, expect, it } from 'vitest';
import { TimeControlService, type RealtimeScheduler, type TimeControlAdapter } from '../game/systems/TimeControlService';

class FakeScheduler implements RealtimeScheduler {
  public time = 0;
  private sequence = 0;
  private readonly tasks = new Map<number, { at: number; callback: () => void }>();
  public now(): number { return this.time; }
  public schedule(callback: () => void, delayMs: number): number {
    const id = ++this.sequence; this.tasks.set(id, { at: this.time + delayMs, callback }); return id;
  }
  public cancel(handle: number): void { this.tasks.delete(handle); }
  public advance(ms: number): void {
    this.time += ms;
    for (const [id, task] of [...this.tasks].sort((a, b) => a[1].at - b[1].at)) if (task.at <= this.time) { this.tasks.delete(id); task.callback(); }
  }
}

function fixture(): { control: TimeControlService; scheduler: FakeScheduler; state: Required<Pick<ReturnType<TimeControlService['snapshot']>, 'physicsPaused' | 'gameTimeScale' | 'physicsScale' | 'tweenScale' | 'animationScale'>> } {
  const scheduler = new FakeScheduler();
  const state = { physicsPaused: false, gameTimeScale: 1, physicsScale: 1, tweenScale: 1, animationScale: 1 };
  const adapter: TimeControlAdapter = {
    setPhysicsPaused: (value) => { state.physicsPaused = value; },
    setGameTimeScale: (value) => { state.gameTimeScale = value; },
    setPhysicsScale: (value) => { state.physicsScale = value; },
    setTweenScale: (value) => { state.tweenScale = value; },
    setAnimationScale: (value) => { state.animationScale = value; },
  };
  return { control: new TimeControlService(adapter, scheduler), scheduler, state };
}

describe('TimeControlService', () => {
  it('resumes only after every independent pause token is released', () => {
    const { control, state } = fixture();
    control.acquire('USER_PAUSE', 'scene'); control.acquire('REWARD_SCREEN', 'scene');
    expect(state.physicsPaused).toBe(true);
    control.release('USER_PAUSE', 'scene');
    expect(state.physicsPaused).toBe(true);
    control.release('REWARD_SCREEN', 'scene');
    expect(state.physicsPaused).toBe(false);
    expect(control.release('REWARD_SCREEN', 'scene')).toBe(false);
  });

  it('a hitstop timeout never releases USER_PAUSE', () => {
    const { control, scheduler, state } = fixture();
    control.acquire('USER_PAUSE', 'scene');
    control.requestHitstop('scene', 90); scheduler.advance(100);
    expect(control.hasReason('HITSTOP')).toBe(false);
    expect(control.hasReason('USER_PAUSE')).toBe(true);
    expect(state.physicsPaused).toBe(true);
  });

  it('TAB_HIDDEN release does not release REWARD_SCREEN', () => {
    const { control, state } = fixture();
    control.acquire('TAB_HIDDEN', 'visibility'); control.acquire('REWARD_SCREEN', 'scene');
    control.release('TAB_HIDDEN', 'visibility');
    expect(control.hasReason('REWARD_SCREEN')).toBe(true);
    expect(state.physicsPaused).toBe(true);
  });

  it('merges consecutive hitstops, caps them, and restores using real time', () => {
    const { control, scheduler, state } = fixture();
    control.requestHitstop('scene', 90);
    expect(state.physicsPaused).toBe(true);
    expect(state.physicsScale).toBe(1);
    scheduler.advance(40); control.requestHitstop('scene', 100);
    scheduler.advance(99); expect(control.hasReason('HITSTOP')).toBe(true);
    scheduler.advance(2); expect(control.hasReason('HITSTOP')).toBe(false);
    expect(state.physicsPaused).toBe(false);
    expect(state.physicsScale).toBe(1);
  });

  it('never feeds the logical slow-motion factor into inverse Arcade Physics timeScale', () => {
    const { control, scheduler, state } = fixture();
    control.requestHitstop('scene', 90);
    expect(control.snapshot().gameTimeScale).toBe(0.08);
    expect(state.physicsScale).toBe(1);
    expect(state.physicsPaused).toBe(true);
    scheduler.advance(90);
    expect(state.physicsPaused).toBe(false);
  });

  it('cleans owned tokens and pending real-time callbacks on scene shutdown', () => {
    const { control, scheduler, state } = fixture();
    control.acquire('REWARD_SCREEN', 'scene'); control.requestHitstop('scene', 90);
    control.releaseOwner('scene'); scheduler.advance(200);
    expect(control.snapshot().activeReasons).toEqual([]);
    expect(state.physicsPaused).toBe(false);
    expect(state.physicsScale).toBe(1);
  });

  it('pauses physics but keeps cinematic clocks running during boss defeat', () => {
    const { control, state } = fixture();
    control.acquire('BOSS_DEFEATED', 'scene');
    expect(state.physicsPaused).toBe(true);
    expect(state.gameTimeScale).toBe(1);
    expect(state.tweenScale).toBe(1);
    control.release('BOSS_DEFEATED', 'scene');
    expect(state.physicsPaused).toBe(false);
  });
});
