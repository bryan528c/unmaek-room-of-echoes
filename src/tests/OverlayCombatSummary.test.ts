import { describe, expect, it } from 'vitest';
import { describeBackflowOpportunity, formatDamageRatio } from '../ui/OverlayUI';

describe('combat summary formatting', () => {
  it('never renders a positive sub-one-percent contribution as zero', () => {
    expect(formatDamageRatio(0, 1000)).toBe('0%');
    expect(formatDamageRatio(1, 1000)).toBe('<1%');
    expect(formatDamageRatio(25, 1000)).toBe('3%');
  });

  it('describes projectile backflow separately from its minimum stopped-target fallback', () => {
    expect(describeBackflowOpportunity(6, 2)).toContain('탄환 6개');
    expect(describeBackflowOpportunity(0, 3)).toContain('최소 역류 파동');
    expect(describeBackflowOpportunity(0, 3)).toContain('정지 적 3명');
  });
});
