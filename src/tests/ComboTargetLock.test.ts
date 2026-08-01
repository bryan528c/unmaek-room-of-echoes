import { describe, expect, it } from 'vitest';
import { SoftTargetLock } from '../game/systems/TargetingSystem';

describe('콤보 대상과 방향 고정', () => {
  it('콤보 중에는 다른 대상과 이동 방향으로 바뀌지 않는다', () => {
    const lock = new SoftTargetLock(); expect(lock.begin('first', { x: 0, y: -4 })).toBe(true);
    expect(lock.tryRetarget('second')).toBe(false);
    expect(lock.targetId).toBe('first'); expect(lock.direction.x).toBeCloseTo(0); expect(lock.direction.y).toBeCloseTo(-1);
  });

  it('콤보 종료 뒤에는 새 대상 잠금이 가능하다', () => {
    const lock = new SoftTargetLock(); lock.begin('first', { x: 1, y: 0 }); lock.clear();
    expect(lock.begin('second', { x: -1, y: 0 })).toBe(true); expect(lock.targetId).toBe('second');
  });
});
