import { describe, expect, it } from 'vitest';
import { InputRouter } from '../game/systems/InputRouter';

describe('InputRouter reward isolation', () => {
  it.each(['KeyJ', 'Space', 'KeyQ', 'KeyE', 'KeyR', 'KeyF'])('held %s cannot enter reward selection', (code) => {
    const router = new InputRouter(); router.setContext('COMBAT'); router.noteKeyDown(code);
    router.setContext('REWARD');
    expect(router.accepts('REWARD', code)).toBe(false);
    router.noteKeyUp(code);
    expect(router.accepts('REWARD', code)).toBe(true);
  });

  it('requires a new keydown after reward reveal', () => {
    const router = new InputRouter(); router.setContext('COMBAT');
    router.noteKeyDown('Enter'); router.setContext('NONE'); router.setContext('REWARD');
    expect(router.accepts('REWARD', 'Enter')).toBe(false);
    router.noteKeyUp('Enter'); router.noteKeyDown('Enter');
    expect(router.accepts('REWARD', 'Enter')).toBe(true);
  });

  it('blocks a card selection key from leaking into the next combat', () => {
    const router = new InputRouter(); router.setContext('REWARD'); router.noteKeyDown('Digit1');
    router.setContext('COMBAT');
    expect(router.accepts('COMBAT', 'Digit1')).toBe(false);
    router.noteKeyUp('Digit1'); router.noteKeyDown('KeyJ');
    expect(router.accepts('COMBAT', 'KeyJ')).toBe(true);
  });

  it('clears all physical state on scene restart', () => {
    const router = new InputRouter(); router.setContext('COMBAT'); router.noteKeyDown('KeyJ'); router.setContext('RESULT');
    router.clear();
    expect(router.snapshot()).toEqual({ context: 'NONE', held: [], blockedUntilRelease: [], transitionCount: 0 });
  });
});
