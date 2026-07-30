import { describe, expect, it } from 'vitest';
import { WordChainSystem } from '../game/systems/WordChainSystem';

describe('WordChainSystem v2', () => {
  it('유효한 두 번째 언령에만 25% 비용 할인을 반환한다', () => {
    const chains = new WordChainSystem(2500, .25);
    chains.use('link', 0, { successful: true, hasLinkedTargets: true });
    expect(chains.use('stop', 500, { successful: true, hasLinkedTargets: true }).costDiscount).toBe(.25);
    expect(chains.use('stop', 600, { successful: true }).costDiscount).toBe(0);
  });

  it('완벽 패링 연장은 같은 연쇄에서 한 번만 적용된다', () => {
    const chains = new WordChainSystem(2500);
    chains.use('link', 0, { successful: true, hasLinkedTargets: true });
    expect(chains.extendOnce(100, 600)).toBe(true); expect(chains.extendOnce(200, 600)).toBe(false);
    expect(chains.snapshot(3000)).toBeDefined(); expect(chains.snapshot(3101)).toBeUndefined();
  });

  it('미리보기는 상태를 소비하지 않고 유효 연쇄만 반환한다', () => {
    const chains = new WordChainSystem(2500); chains.use('stop', 0, { successful: true });
    expect(chains.preview('rewind', 500, { hasFrozenProjectiles: false })).toBeUndefined();
    expect(chains.preview('rewind', 500, { hasFrozenProjectiles: true })).toBe('backflow');
    expect(chains.snapshot(600)?.opener).toBe('stop');
  });
});
