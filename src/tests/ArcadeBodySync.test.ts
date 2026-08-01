import { describe, expect, it } from 'vitest';
import { synchronizeArcadeBodyAfterGameObjectMove } from '../game/systems/ArcadeBodySync';

function point(x: number, y: number): { x: number; y: number; copy(source: Readonly<{ x: number; y: number }>): void } {
  return { x, y, copy(source) { this.x = source.x; this.y = source.y; } };
}

describe('Arcade body Ground Point synchronization', () => {
  it('clears the pending postUpdate delta without changing velocity state', () => {
    const body = {
      position: point(120, 80),
      prev: point(100, 70),
      prevFrame: point(100, 70),
      autoFrame: point(100, 70),
      velocity: point(190, 0),
      updateFromGameObject() { this.position.x = 104; this.position.y = 72; },
    };

    synchronizeArcadeBodyAfterGameObjectMove(body);

    expect(body.prev).toMatchObject({ x: 104, y: 72 });
    expect(body.prevFrame).toMatchObject({ x: 104, y: 72 });
    expect(body.autoFrame).toMatchObject({ x: 104, y: 72 });
    expect(body.velocity).toMatchObject({ x: 190, y: 0 });
    expect(body.position.x - body.prevFrame.x).toBe(0);
    expect(body.position.y - body.prevFrame.y).toBe(0);
  });
});
