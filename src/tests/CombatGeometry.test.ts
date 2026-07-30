import { describe, expect, it } from 'vitest';
import { AttackHitRegistry, canDamageHero, circlesOverlap, sectorHitsCircle, separationOffset, telegraphCoversReach } from '../game/systems/CombatGeometry';

describe('전투 판정 기반', () => {
  it('하나의 attackId는 같은 대상을 한 번만 적중시킨다', () => {
    const registry = new AttackHitRegistry();
    expect(registry.claim(7, 'enemy')).toBe(true); expect(registry.claim(7, 'enemy')).toBe(false); expect(registry.claim(8, 'enemy')).toBe(true);
  });
  it('단검 부채꼴은 방향과 Hurtbox 반경을 함께 고려한다', () => {
    const sector = { x: 0, y: 0, angle: 0, range: 60, halfAngle: .7 };
    expect(sectorHitsCircle(sector, { x: 64, y: 0, radius: 8 })).toBe(true); expect(sectorHitsCircle(sector, { x: -30, y: 0, radius: 8 })).toBe(false);
  });
  it('대시·되돌리기·피격 무적은 피해를 차단한다', () => {
    expect(canDamageHero(100, 120, false, false)).toBe(false); expect(canDamageHero(100, 0, true, false)).toBe(false);
    expect(canDamageHero(100, 0, false, true)).toBe(false); expect(canDamageHero(100, 0, false, false)).toBe(true);
  });
  it('Telegraph는 실제 공격 길이와 반경보다 작지 않아야 한다', () => {
    expect(telegraphCoversReach(185, 38, 185, 38)).toBe(true); expect(telegraphCoversReach(170, 38, 185, 38)).toBe(false);
  });
  it('탄환 충돌 원과 겹침 분리 벡터가 안정적이다', () => {
    expect(circlesOverlap({ x: 0, y: 0, radius: 5 }, { x: 10, y: 0, radius: 6 })).toBe(true);
    const offset = separationOffset({ x: 0, y: 0, radius: 15 }, { x: 20, y: 0, radius: 15 }, .5);
    expect(offset.x).toBeLessThan(0); expect(offset.y).toBeCloseTo(0);
  });
});
