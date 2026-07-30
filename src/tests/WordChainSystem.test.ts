import { describe, expect, it } from 'vitest';
import { WordChainSystem } from '../game/systems/WordChainSystem';

describe('언령 연쇄', () => {
  it('2.5초 안에서만 정해진 연쇄가 발동한다', () => {
    const chains = new WordChainSystem(2500);
    chains.use('link', 0, { successful: true, hasLinkedTargets: true });
    expect(chains.use('stop', 2400, { successful: true, hasLinkedTargets: true }).chain).toBe('chain-stop');
    chains.use('link', 3000, { successful: true, hasLinkedTargets: true });
    expect(chains.use('stop', 5600, { successful: true, hasLinkedTargets: true }).chain).toBeUndefined();
  });

  it('실패한 첫 언령은 연쇄 상태를 만들지 않는다', () => {
    const chains = new WordChainSystem(2500);
    expect(chains.use('link', 0, { successful: false, hasLinkedTargets: false }).snapshot).toBeUndefined();
  });

  it('하나의 두 번째 언령은 연쇄를 한 번만 발생시킨다', () => {
    const chains = new WordChainSystem(2500);
    chains.use('link', 0, { successful: true, hasLinkedTargets: true });
    expect(chains.use('rewind', 1000, { successful: true, hasLinkedTargets: true, hasRecordedDamage: true }).chain).toBe('damage-regression');
    expect(chains.use('rewind', 1100, { successful: true, hasLinkedTargets: true, hasRecordedDamage: true }).chain).toBeUndefined();
  });

  it('정지 탄환이 없으면 역류가 발동하지 않는다', () => {
    const chains = new WordChainSystem(2500);
    chains.use('stop', 0, { successful: true });
    expect(chains.use('rewind', 500, { successful: true, hasFrozenProjectiles: false }).chain).toBeUndefined();
  });

  it('reset은 장면 재시작처럼 연쇄 상태를 비운다', () => {
    const chains = new WordChainSystem(2500);
    chains.use('link', 0, { successful: true, hasLinkedTargets: true }); chains.reset();
    expect(chains.snapshot(100)).toBeUndefined();
  });
});
