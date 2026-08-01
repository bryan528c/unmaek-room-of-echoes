import { describe, expect, it } from 'vitest';
import { AttackHitRegistry, distanceToEllipse, sectorHitsEllipse, separationOffset, sweptCircleHitsEllipse } from '../game/systems/CombatGeometry';

describe('Combat Feel v3 판정', () => {
  it('Hurtbox 가장자리 거리와 공격 부채꼴이 같은 좌표를 사용한다', () => {
    const hurtbox = { x: 70, y: 0, radiusX: 15, radiusY: 24 };
    expect(distanceToEllipse({ x: 0, y: 0 }, hurtbox)).toBeCloseTo(55);
    expect(sectorHitsEllipse({ x: 10, y: 0, angle: 0, range: 44, halfAngle: 0.72 }, hurtbox)).toBe(false);
    expect(sectorHitsEllipse({ x: 10, y: 0, angle: 0, range: 56, halfAngle: 0.72 }, hurtbox)).toBe(true);
    expect(sectorHitsEllipse({ x: 10, y: 0, angle: Math.PI, range: 80, halfAngle: 0.72 }, hurtbox)).toBe(false);
  });

  it('빠른 탄환은 이전 위치와 현재 위치 사이 Swept Collision을 사용한다', () => {
    const hero = { x: 50, y: 0, radiusX: 10, radiusY: 18 };
    expect(sweptCircleHitsEllipse({ x: 0, y: 0 }, { x: 100, y: 0 }, 4, hero)).toBe(true);
    expect(sweptCircleHitsEllipse({ x: 0, y: 40 }, { x: 100, y: 40 }, 4, hero)).toBe(false);
  });

  it('attackId는 같은 타격의 중복 피해를 차단한다', () => {
    const registry = new AttackHitRegistry();
    expect(registry.claim(1, 'enemy')).toBe(true); expect(registry.claim(1, 'enemy')).toBe(false); expect(registry.claim(2, 'enemy')).toBe(true);
  });
  it('uses the supplied escape direction when movement circles share the same center', () => {
    const correction = separationOffset(
      { x: 100, y: 100, radius: 15 },
      { x: 100, y: 100, radius: 18 },
      1,
      2.5,
      { x: -1, y: 0 },
    );
    expect(correction.x).toBeCloseTo(-2.5);
    expect(correction.y).toBeCloseTo(0);
  });
});
