export const REWARD_SELECTION_KEYS = ['Digit1', 'Digit2', 'Digit3', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Enter', 'KeyR'] as const;

export function isRewardSelectionKey(code: string): boolean {
  return (REWARD_SELECTION_KEYS as readonly string[]).includes(code);
}
