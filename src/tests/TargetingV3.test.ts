import { describe, expect, it } from 'vitest';
import { TargetingSystem, type TargetCandidate } from '../game/systems/TargetingSystem';

const enemy = (id: string, x: number, y: number, radiusX = 12, overrides: Partial<TargetCandidate> = {}): TargetCandidate => ({
  id, x, y, hurtbox: { x, y, radiusX, radiusY: 18 }, alive: true, visible: true, insideCombatBounds: true, ...overrides,
});

describe('입력 순간 소프트 타기팅', () => {
  it('개체 중심이 아니라 Hurtbox 가장자리 거리를 사용한다', () => {
    const system = new TargetingSystem();
    const result = system.selectSoft({ x: 0, y: 0 }, [enemy('wide', 80, 0, 35), enemy('small', 60, 0, 5)], { range: 100, assistRange: 100 });
    expect(result?.candidate.id).toBe('wide');
    expect(result?.hurtboxDistance).toBeCloseTo(45);
  });

  it('근접 긴급 대상은 이동 방향 반대라도 우선한다', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    const result = system.selectSoft({ x: 0, y: 0 }, [enemy('behind', -25, 0, 8), enemy('front', 55, 0, 8)], { range: 80, assistRange: 100 });
    expect(result?.candidate.id).toBe('behind');
  });

  it('거리가 거의 같을 때만 정면과 위협도를 보조 기준으로 쓴다', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    const result = system.selectSoft({ x: 0, y: 0 }, [enemy('back', -70, 0), enemy('front', 74, 0)], { range: 100, assistRange: 100 });
    expect(result?.candidate.id).toBe('front');
  });

  it('사망·제거 예정·화면 밖·combatBounds 밖 대상을 제외한다', () => {
    const system = new TargetingSystem();
    const result = system.selectSoft({ x: 0, y: 0 }, [
      enemy('dead', 20, 0, 8, { alive: false }), enemy('removing', 25, 0, 8, { removing: true }),
      enemy('screen', 30, 0, 8, { visible: false }), enemy('bounds', 35, 0, 8, { insideCombatBounds: false }), enemy('valid', 60, 0),
    ], { range: 100, assistRange: 100 });
    expect(result?.candidate.id).toBe('valid');
  });

  it('수직 대상에도 정규화된 360도 공격 방향을 만든다', () => {
    const system = new TargetingSystem();
    const result = system.selectSoft({ x: 50, y: 50 }, [enemy('up', 50, 10)], { range: 100, assistRange: 100 });
    expect(result?.direction.x).toBeCloseTo(0); expect(result?.direction.y).toBeCloseTo(-1);
  });

  it('measures dagger reach from the prospective attack origin', () => {
    const system = new TargetingSystem();
    const result = system.selectSoft(
      { x: 0, y: 0 },
      [enemy('edge', 91, 0, 12)],
      { range: 62, assistRange: 90, attackOriginOffset: 17 },
    );
    expect(result?.candidate.id).toBe('edge');
    expect(result?.hurtboxDistance).toBeCloseTo(62);
    expect(result?.requiresLunge).toBe(false);
  });

  it('held J keeps the same living target even when another target becomes slightly closer', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    const first = system.selectHeld({ x: 0, y: 0 }, [enemy('held', 58, 0), enemy('other', 64, 0)], undefined, { range: 90, assistRange: 90 });
    expect(first?.candidate.id).toBe('held');
    const next = system.selectHeld({ x: 0, y: 0 }, [enemy('held', 62, 0), enemy('other', 44, 0)], 'held', { range: 90, assistRange: 90 });
    expect(next?.candidate.id).toBe('held');
  });

  it('held target death or range exit triggers selection only for the next combo', () => {
    const system = new TargetingSystem();
    expect(system.selectHeld({ x: 0, y: 0 }, [enemy('dead', 30, 0, 8, { alive: false }), enemy('next', 48, 0)], 'dead', { range: 90, assistRange: 90 })?.candidate.id).toBe('next');
    expect(system.selectHeld({ x: 0, y: 0 }, [enemy('far', 180, 0), enemy('next', 52, 0)], 'far', { range: 90, assistRange: 90 })?.candidate.id).toBe('next');
  });

  it('distance priority cannot be reversed by a farther forward target', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    const result = system.selectHeld({ x: 0, y: 0 }, [enemy('close-behind', -30, 0, 8), enemy('far-front', 74, 0, 8)], undefined, { range: 90, assistRange: 90 });
    expect(result?.candidate.id).toBe('close-behind');
  });
});
