import { describe, expect, it } from 'vitest';
import { RisingEdgeInput } from '../game/systems/CombatInputGate';

describe('J 상승 에지 입력', () => {
  it('누르고 있는 동안 한 번만 입력되고 keyup 후 다시 입력된다', () => {
    const input = new RisingEdgeInput();
    expect(input.update(false)).toBe(false);
    expect(input.update(true)).toBe(true);
    expect(input.update(true)).toBe(false);
    expect(input.update(true)).toBe(false);
    expect(input.update(false)).toBe(false);
    expect(input.update(true)).toBe(true);
  });

  it('메뉴나 일시정지 뒤에는 키를 놓기 전까지 잔류 입력을 막는다', () => {
    const input = new RisingEdgeInput(); input.suppressUntilRelease();
    expect(input.update(true)).toBe(false);
    expect(input.update(false)).toBe(false);
    expect(input.update(true)).toBe(true);
  });
  it('queues a fast tap even when down and up occur between frames', () => {
    const input = new RisingEdgeInput();
    input.keyDown(); input.keyUp();
    expect(input.consume()).toBe(true);
    expect(input.consume()).toBe(false);
  });

  it('ignores browser key repeat until a physical release', () => {
    const input = new RisingEdgeInput();
    input.keyDown(); input.keyDown(true); input.keyDown(true);
    expect(input.consume()).toBe(true);
    expect(input.consume()).toBe(false);
    input.keyUp(); input.keyDown();
    expect(input.consume()).toBe(true);
  });

  it('exposes a held state for combo-level repeat without creating repeat edges', () => {
    const input = new RisingEdgeInput();
    input.keyDown();
    expect(input.consume()).toBe(true);
    expect(input.isHeld).toBe(true);
    expect(input.consume()).toBe(false);
    input.keyUp();
    expect(input.isHeld).toBe(false);
  });

  it('a combat cancel blocks held J until a physical release', () => {
    const input = new RisingEdgeInput();
    input.keyDown(); input.consume();
    input.suppressUntilRelease(true);
    expect(input.isHeld).toBe(false);
    input.keyDown(true);
    expect(input.consume()).toBe(false);
    input.keyUp(); input.keyDown();
    expect(input.consume()).toBe(true);
  });

  it('does not swallow the next attack when a menu closed with another key', () => {
    const input = new RisingEdgeInput();
    input.suppressUntilRelease(false);
    input.keyDown();
    expect(input.consume()).toBe(true);
  });
});
