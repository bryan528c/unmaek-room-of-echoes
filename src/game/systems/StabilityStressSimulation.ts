import { GameFlowController } from './GameFlowController';
import { InputRouter } from './InputRouter';
import { ParryResolver } from './ParrySystem';
import { TimeControlService, type RealtimeScheduler, type TimeControlAdapter } from './TimeControlService';

class ManualScheduler implements RealtimeScheduler {
  private time = 0;
  private sequence = 0;
  private readonly callbacks = new Map<number, { at: number; callback: () => void }>();
  public now(): number { return this.time; }
  public schedule(callback: () => void, delayMs: number): number {
    const handle = ++this.sequence; this.callbacks.set(handle, { at: this.time + delayMs, callback }); return handle;
  }
  public cancel(handle: number): void { this.callbacks.delete(handle); }
  public advance(delayMs: number): void {
    this.time += delayMs;
    for (const [handle, task] of [...this.callbacks].sort((a, b) => a[1].at - b[1].at)) {
      if (task.at > this.time) continue;
      this.callbacks.delete(handle); task.callback();
    }
  }
}

export interface StabilityStressReport {
  simulatedMs: number;
  restarts: number;
  hitstops: number;
  parries: number;
  unexpectedPauseStates: number;
  staleTokens: number;
}

/** Deterministic, accelerated lifecycle stress used by Vitest and the F4 dev menu. */
export function runStabilityStressSimulation(simulatedMs = 600_000, restarts = 20): StabilityStressReport {
  const scheduler = new ManualScheduler();
  let hitstops = 0; let parries = 0; let unexpectedPauseStates = 0; let staleTokens = 0;
  const slice = Math.floor(simulatedMs / restarts);
  for (let restart = 0; restart < restarts; restart += 1) {
    let physicsPaused = false; let gameScale = 1; let physicsScale = 1; let tweenScale = 1; let animationScale = 1;
    const adapter: TimeControlAdapter = {
      setPhysicsPaused: (value) => { physicsPaused = value; }, setGameTimeScale: (value) => { gameScale = value; },
      setPhysicsScale: (value) => { physicsScale = value; }, setTweenScale: (value) => { tweenScale = value; },
      setAnimationScale: (value) => { animationScale = value; },
    };
    const time = new TimeControlService(adapter, scheduler);
    const flow = new GameFlowController(); const input = new InputRouter(); const parry = new ParryResolver(); input.setContext('COMBAT');
    for (let elapsed = 0; elapsed < slice; elapsed += 50) {
      if (elapsed % 250 === 0) { time.requestHitstop(`scene-${restart}`, 90); hitstops += 1; }
      if (elapsed % 3000 === 1000) { flow.setUserPaused(true); time.acquire('USER_PAUSE', `scene-${restart}`); input.setContext('PAUSE'); }
      if (elapsed % 3000 === 1150) { flow.setUserPaused(false); time.release('USER_PAUSE', `scene-${restart}`); input.setContext('COMBAT'); }
      if (elapsed % 5000 === 2000) { time.acquire('TAB_HIDDEN', 'visibility'); flow.setTabHidden(true); input.setContext('NONE'); }
      if (elapsed % 5000 === 2200) { time.release('TAB_HIDDEN', 'visibility'); flow.setTabHidden(false); input.setContext('COMBAT'); }
      if (elapsed % 7000 === 3000) { time.acquire('REWARD_SCREEN', `scene-${restart}`); input.setContext('NONE'); }
      if (elapsed % 7000 === 3250) { time.release('REWARD_SCREEN', `scene-${restart}`); input.setContext('COMBAT'); }
      if (elapsed % 400 === 0) {
        const resolution = parry.resolve(true, { attackId: `${restart}:${elapsed}`, parryable: true, overlapsHurtbox: true });
        if (resolution.grantReward) parries += 1;
      }
      scheduler.advance(50);
      const expectedPhysicsPause = flow.isUserPaused || flow.isTabHidden || time.hasReason('REWARD_SCREEN') || time.hasReason('HITSTOP');
      if (physicsPaused !== expectedPhysicsPause || gameScale < 0 || physicsScale <= 0 || tweenScale < 0 || animationScale < 0) unexpectedPauseStates += 1;
    }
    time.releaseOwner(`scene-${restart}`); time.release('TAB_HIDDEN', 'visibility'); scheduler.advance(200);
    if (time.snapshot().activeReasons.length > 0) staleTokens += time.snapshot().activeReasons.length;
    time.dispose(); input.clear(); parry.reset();
  }
  return { simulatedMs, restarts, hitstops, parries, unexpectedPauseStates, staleTokens };
}
