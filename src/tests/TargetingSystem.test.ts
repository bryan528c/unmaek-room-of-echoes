import { describe, expect, it } from 'vitest';
import { TargetingSystem, type TargetCandidate } from '../game/systems/TargetingSystem';

const target = (id: string, x: number, y: number, overrides: Partial<TargetCandidate> = {}): TargetCandidate => ({ id, x, y, alive: true, visible: true, ...overrides });

describe('자동 조준', () => {
  it('더 가까운 후방 적보다 전방 적을 우선한다', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    expect(system.select({ x: 100, y: 100 }, [target('back', 70, 100), target('front', 220, 105)])?.id).toBe('front');
  });

  it('전방에 적이 없으면 범위 안 가장 가까운 적을 선택한다', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    expect(system.select({ x: 100, y: 100 }, [target('near', 90, 160), target('far', 80, 260)])?.id).toBe('near');
  });

  it('현재 대상이 유효하면 더 가까운 적이 생겨도 유지한다', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    expect(system.select({ x: 100, y: 100 }, [target('held', 220, 100)])?.id).toBe('held');
    expect(system.select({ x: 100, y: 100 }, [target('held', 230, 100), target('new', 150, 100)])?.id).toBe('held');
  });

  it('죽거나 화면 밖인 적은 제외한다', () => {
    const system = new TargetingSystem();
    expect(system.select({ x: 100, y: 100 }, [target('dead', 130, 100, { alive: false }), target('outside', 150, 100, { visible: false }), target('valid', 180, 100)])?.id).toBe('valid');
  });

  it('적이 없을 때 마지막 이동 방향을 유지한다', () => {
    const system = new TargetingSystem(); system.updateDirection(0, -1); system.select({ x: 100, y: 100 }, []);
    expect(system.lastDirection).toEqual({ x: 0, y: -1 });
  });
});
