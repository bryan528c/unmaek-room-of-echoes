export interface DistantPursuitState {
  distance: number;
  resumeDistance: number;
  velocityX: number;
  velocityY: number;
  actionLocked: boolean;
  frozen: boolean;
  attackActive: boolean;
}

/**
 * Recovers an enemy that is outside its preferred combat distance but has
 * accidentally been left without movement by a cancelled action or a body
 * synchronization edge case. Telegraphs, freezes, and active attacks retain
 * authority and are never overridden by this fallback.
 */
export function shouldRecoverDistantPursuit(state: DistantPursuitState): boolean {
  if (!Number.isFinite(state.distance) || state.distance <= state.resumeDistance) return false;
  if (state.actionLocked || state.frozen || state.attackActive) return false;
  return state.velocityX * state.velocityX + state.velocityY * state.velocityY < 1;
}
