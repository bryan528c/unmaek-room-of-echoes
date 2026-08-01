import { describe, expect, it } from 'vitest';
import { enemyGroundExtents } from '../game/balance';
import { clampCircleToBounds, circleInsideBounds, clampGroundPointToBounds, groundFootprintInsideBounds } from '../game/systems/CombatBounds';

const bounds = { left: 20, right: 940, top: 64, bottom: 520 };

describe('공식 combatBounds', () => {
  it('상단 밖 개체를 반경까지 고려해 정상 영역으로 보정한다', () => {
    const corrected = clampCircleToBounds({ x: 480, y: 40, radius: 18 }, bounds);
    expect(corrected.y).toBe(82); expect(corrected.correctedTop).toBe(true);
    expect(circleInsideBounds({ x: corrected.x, y: corrected.y, radius: 18 }, bounds)).toBe(true);
  });

  it('넉백으로 모서리를 벗어나도 가장 가까운 유효 위치로 보정한다', () => {
    expect(clampCircleToBounds({ x: 999, y: 999, radius: 27 }, bounds)).toMatchObject({ x: 913, y: 493, corrected: true });
  });
  it('does not report harmless sub-pixel edge drift as a boundary fault', () => {
    const edge = { x: 38, y: 81.98, radius: 18 };
    expect(clampCircleToBounds(edge, bounds).corrected).toBe(false);
    expect(circleInsideBounds(edge, bounds)).toBe(true);
  });

  it('keeps the complete archer and boss footprints inside the top edge', () => {
    for (const kind of ['archer', 'boss'] as const) {
      const extents = enemyGroundExtents(kind);
      const clamped = clampGroundPointToBounds(480, bounds.top, extents, bounds);
      expect(groundFootprintInsideBounds(clamped, extents, bounds)).toBe(true);
      expect(clamped.y).toBe(bounds.top + extents.top);
    }
  });
});
