import { describe, expect, it } from 'vitest';
import { shouldRecoverDistantPursuit } from '../game/systems/EnemyPursuit';

describe('distant enemy pursuit recovery', () => {
  it('reactivates an idle enemy outside its preferred combat distance', () => {
    expect(shouldRecoverDistantPursuit({
      distance: 420,
      resumeDistance: 175,
      velocityX: 0,
      velocityY: 0,
      actionLocked: false,
      frozen: false,
      attackActive: false,
    })).toBe(true);
  });

  it('does not override telegraphs, freezes, active attacks, or deliberate movement', () => {
    const base = {
      distance: 420,
      resumeDistance: 175,
      velocityX: 0,
      velocityY: 0,
      actionLocked: false,
      frozen: false,
      attackActive: false,
    };
    expect(shouldRecoverDistantPursuit({ ...base, actionLocked: true })).toBe(false);
    expect(shouldRecoverDistantPursuit({ ...base, frozen: true })).toBe(false);
    expect(shouldRecoverDistantPursuit({ ...base, attackActive: true })).toBe(false);
    expect(shouldRecoverDistantPursuit({ ...base, velocityX: 40 })).toBe(false);
    expect(shouldRecoverDistantPursuit({ ...base, distance: 170 })).toBe(false);
  });
});
