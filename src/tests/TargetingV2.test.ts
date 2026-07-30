import { describe, expect, it } from 'vitest';
import { TargetingSystem, type TargetCandidate } from '../game/systems/TargetingSystem';

const target = (id: string, x: number, y: number, overrides: Partial<TargetCandidate> = {}): TargetCandidate => ({ id, x, y, alive: true, visible: true, ...overrides });

describe('TargetingSystem v2', () => {
  it('최소 유지 시간과 교체 임계값으로 작은 점수 차이를 무시한다', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    expect(system.select({ x: 0, y: 0 }, [target('held', 180, 0)], 0)?.id).toBe('held');
    expect(system.select({ x: 0, y: 0 }, [target('held', 180, 0), target('new', 150, 0)], 900)?.id).toBe('held');
  });

  it('3연격 잠금 동안 현재 대상이 유효하면 유지한다', () => {
    const system = new TargetingSystem(); system.updateDirection(1, 0);
    system.select({ x: 0, y: 0 }, [target('held', 250, 0)], 0);
    expect(system.select({ x: 0, y: 0 }, [target('held', 250, 0), target('danger', 35, 0, { threat: 1 })], 2000, true)?.id).toBe('held');
  });

  it('수동 순환 대상은 죽을 때까지 우선 유지한다', () => {
    const system = new TargetingSystem(); const candidates = [target('a', 120, -20), target('b', 120, 20)];
    const cycled = system.cycle({ x: 0, y: 0 }, candidates, 1, 0);
    expect(system.select({ x: 0, y: 0 }, candidates, 1000)?.id).toBe(cycled?.id);
    const remaining = candidates.map((item) => item.id === cycled?.id ? { ...item, alive: false } : item);
    expect(system.select({ x: 0, y: 0 }, remaining, 1100)?.id).not.toBe(cycled?.id);
  });

  it('죽음·화면 밖·공격 불가·시야 차단 대상을 제외한다', () => {
    const system = new TargetingSystem();
    expect(system.select({ x: 0, y: 0 }, [target('dead', 20, 0, { alive: false }), target('outside', 30, 0, { visible: false }), target('blocked', 40, 0, { lineOfSight: false }), target('immune', 50, 0, { attackable: false }), target('valid', 100, 0)])?.id).toBe('valid');
  });

  it('clear는 장면 재시작처럼 수동 잠금과 현재 대상을 초기화한다', () => {
    const system = new TargetingSystem(); system.cycle({ x: 0, y: 0 }, [target('a', 100, 0)], 1, 0); system.clear();
    expect(system.targetId).toBeUndefined();
  });
});
