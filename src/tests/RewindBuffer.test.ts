import { describe, expect, it } from 'vitest';
import { RewindBuffer, type RewindState } from '../game/systems/RewindBuffer';

const state = (time: number, health = 100): RewindState => ({ time, x: time / 10, y: 20, health, velocityX: 1, velocityY: 2, facing: 0.5 });

describe('RewindBuffer', () => {
  it('최대 보관 시간을 넘긴 오래된 상태를 제거한다', () => {
    const buffer = new RewindBuffer(2000);
    buffer.push(state(0)); buffer.push(state(1000)); buffer.push(state(2101));
    expect(buffer.size).toBe(2);
    expect(buffer.oldest()?.time).toBe(1000);
  });

  it('요청한 시간 범위 안의 유효 상태만 복사해 반환한다', () => {
    const buffer = new RewindBuffer(2000);
    buffer.push(state(1000)); buffer.push(state(1500, 80)); buffer.push(state(2000, 60));
    const result = buffer.getRange(2000, 600);
    expect(result.map((item) => item.time)).toEqual([1500, 2000]);
    result[0]!.health = 1;
    expect(buffer.getRange(2000, 600)[0]?.health).toBe(80);
  });

  it('기록이 부족하면 가장 오래된 유효 기록까지만 반환한다', () => {
    const buffer = new RewindBuffer(2000);
    buffer.push(state(1800)); buffer.push(state(2000));
    expect(buffer.getRange(2000, 2000)).toHaveLength(2);
    expect(buffer.getRange(2000, 2000)[0]?.time).toBe(1800);
  });

  it('빈 버퍼는 안전하게 undefined와 빈 배열을 반환한다', () => {
    const buffer = new RewindBuffer(2000);
    expect(buffer.oldest()).toBeUndefined();
    expect(buffer.latest()).toBeUndefined();
    expect(buffer.getRange(500, 2000)).toEqual([]);
  });
});
