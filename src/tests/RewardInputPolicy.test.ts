import { describe, expect, it } from 'vitest';
import { isRewardSelectionKey } from '../game/systems/RewardInputPolicy';

describe('reward input policy', () => {
  it.each(['KeyJ', 'KeyK', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyQ', 'KeyE', 'KeyF'])('%s never confirms a reward card', (code) => {
    expect(isRewardSelectionKey(code)).toBe(false);
  });

  it.each(['Digit1', 'Digit2', 'Digit3', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Enter', 'KeyR'])('allows %s only in reward context', (code) => {
    expect(isRewardSelectionKey(code)).toBe(true);
  });
});
