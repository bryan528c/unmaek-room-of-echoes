import { describe, expect, it, vi } from 'vitest';
import { GameFlowController } from '../game/systems/GameFlowController';

describe('GameFlowController', () => {
  it('runs Act combat through boss reward and transition without opening a result', () => {
    const flow = new GameFlowController('RUN_START');
    expect(flow.transition('ACT_INTRO')).toBe(true);
    expect(flow.transition('WAVE_COMBAT')).toBe(true);
    expect(flow.allowsCombatInput).toBe(true);
    expect(flow.transition('WAVE_CLEAR')).toBe(true);
    expect(flow.transition('BOSS_INTRO')).toBe(true);
    expect(flow.transition('BOSS_COMBAT')).toBe(true);
    expect(flow.transition('BOSS_DEFEATED')).toBe(true);
    expect(flow.transition('ACT_CLEAR')).toBe(true);
    expect(flow.transition('BOSS_REWARD_REVEAL')).toBe(true);
    expect(flow.allowsRewardInput).toBe(false);
    expect(flow.transition('BOSS_REWARD_SELECT')).toBe(true);
    expect(flow.allowsRewardInput).toBe(true);
    expect(flow.transition('ACT_TRANSITION')).toBe(true);
    expect(flow.transition('ACT_INTRO')).toBe(true);
    expect(flow.transition('WAVE_COMBAT')).toBe(true);
    expect(flow.baseState).not.toBe('RESULT');
  });

  it('opens the run-over context only when the run ends', () => {
    const flow = new GameFlowController('BOSS_COMBAT');
    expect(flow.transition('RUN_OVER')).toBe(true);
    expect(flow.allowsResultInput).toBe(true);
    expect(flow.allowsCombatInput).toBe(false);
  });

  it('allows an active wave to end through explicit Run abandonment', () => {
    const flow = new GameFlowController('WAVE_COMBAT');
    flow.setUserPaused(true);
    flow.setUserPaused(false);
    expect(flow.transition('RUN_OVER')).toBe(true);
    expect(flow.allowsResultInput).toBe(true);
  });
  it('accepts the supported combat to reward flow', () => {
    const flow = new GameFlowController();
    expect(flow.transition('ROUND_CLEAR', 10)).toBe(true);
    expect(flow.transition('REWARD_REVEAL', 20)).toBe(true);
    expect(flow.allowsRewardInput).toBe(false);
    expect(flow.transition('REWARD_SELECT', 30)).toBe(true);
    expect(flow.allowsRewardInput).toBe(true);
    expect(flow.transition('COMBAT', 40)).toBe(true);
    expect(flow.allowsCombatInput).toBe(true);
  });

  it('blocks invalid transitions and combat input outside COMBAT', () => {
    const warning = vi.fn();
    const flow = new GameFlowController('COMBAT', warning);
    expect(flow.transition('REWARD_SELECT')).toBe(false);
    expect(flow.state).toBe('COMBAT');
    expect(warning).toHaveBeenCalledOnce();
    flow.transition('RESULT');
    expect(flow.allowsCombatInput).toBe(false);
    expect(flow.allowsResultInput).toBe(true);
  });

  it('keeps pause and hidden overlays separate from the base state', () => {
    const flow = new GameFlowController();
    flow.transition('ROUND_CLEAR');
    flow.transition('REWARD_REVEAL');
    flow.setUserPaused(true);
    expect(flow.state).toBe('USER_PAUSED');
    flow.setTabHidden(true);
    expect(flow.state).toBe('TAB_HIDDEN');
    flow.setTabHidden(false);
    expect(flow.state).toBe('USER_PAUSED');
    flow.setUserPaused(false);
    expect(flow.state).toBe('REWARD_REVEAL');
  });

  it('blocks combat during boss defeat and permits only the explicit Act-clear route', () => {
    const flow = new GameFlowController('BOSS_COMBAT');
    expect(flow.transition('BOSS_DEFEATED', 10)).toBe(true);
    expect(flow.allowsCombatInput).toBe(false);
    expect(flow.allowsCombatSimulation).toBe(false);
    expect(flow.transition('COMBAT', 20)).toBe(false);
    expect(flow.transition('ACT_CLEAR', 30)).toBe(true);
  });

  it('blocks combat and enemy simulation throughout Act presentation states', () => {
    const flow = new GameFlowController('ACT_CLEAR');
    expect(flow.transition('BOSS_REWARD_REVEAL')).toBe(true);
    expect(flow.transition('BOSS_REWARD_SELECT')).toBe(true);
    expect(flow.allowsCombatInput).toBe(false);
    expect(flow.transition('ACT_TRANSITION')).toBe(true);
    expect(flow.transition('ACT_INTRO')).toBe(true);
    expect(flow.transition('MODIFIER_INTRO')).toBe(true);
    expect(flow.allowsCombatSimulation).toBe(false);
    expect(flow.transition('WAVE_COMBAT')).toBe(true);
  });
});
