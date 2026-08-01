import { describe, expect, it, vi } from 'vitest';
import { GameFlowController } from '../game/systems/GameFlowController';

describe('GameFlowController', () => {
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

  it('blocks combat during boss defeat and allows exactly the result route', () => {
    const flow = new GameFlowController();
    expect(flow.transition('BOSS_DEFEATED', 10)).toBe(true);
    expect(flow.allowsCombatInput).toBe(false);
    expect(flow.allowsCombatSimulation).toBe(false);
    expect(flow.transition('COMBAT', 20)).toBe(false);
    expect(flow.transition('RESULT', 30)).toBe(true);
  });
});
