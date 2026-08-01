import { describe, expect, it } from 'vitest';
import { RunOutcomeController } from '../game/systems/CombatLifecycle';

describe('RunOutcomeController', () => {
  it('keeps victory when the boss is confirmed dead before residual player damage', () => {
    const controller = new RunOutcomeController();
    expect(controller.claim('VICTORY')).toBe(true);
    expect(controller.claim('DEFEAT')).toBe(false);
    expect(controller.consumeResultTransition('VICTORY')).toBe(true);
    expect(controller.consumeResultTransition('VICTORY')).toBe(false);
    expect(controller.snapshot()).toEqual({ outcome: 'VICTORY', resultTransitions: 1 });
  });

  it('keeps defeat when player death is confirmed first', () => {
    const controller = new RunOutcomeController();
    expect(controller.claim('DEFEAT')).toBe(true);
    expect(controller.claim('VICTORY')).toBe(false);
    expect(controller.consumeResultTransition('DEFEAT')).toBe(true);
    expect(controller.snapshot()).toEqual({ outcome: 'DEFEAT', resultTransitions: 1 });
  });
});
