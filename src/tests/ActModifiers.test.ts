import { describe, expect, it } from 'vitest';
import { ModifierIntroductionTracker, modifierDescription, modifierLabel, modifierLabelsForAct } from '../game/systems/ActModifiers';

describe('Act modifier presentation', () => {
  it('shows detailed guidance once and a compact reminder on reappearance', () => {
    const tracker = new ModifierIntroductionTracker();
    const first = tracker.presentationFor(['stitch-pair']);
    const repeated = tracker.presentationFor(['stitch-pair']);
    expect(first).toMatchObject({ name: '봉합 쌍', detailed: true, durationMs: 1400 });
    expect(first?.description).toContain('J 절단이나 R');
    expect(repeated).toMatchObject({ name: '봉합 쌍', detailed: false, durationMs: 700 });
  });

  it('presents the mixed rule as one combined modifier and exposes readable labels', () => {
    const tracker = new ModifierIntroductionTracker();
    expect(tracker.presentationFor(['mixed-archive', 'stitch-pair', 'past-position'])?.name).toBe('편집 실험');
    expect(modifierLabel('ink-echo-projectile')).toBe('먹물 잔향탄');
    expect(modifierDescription('past-position')).toContain('1.2초 전 위치');
  });

  it('does not interrupt baseline waves', () => {
    expect(new ModifierIntroductionTracker().presentationFor(['archive-baseline'])).toBeUndefined();
  });

  it('restores modifier tutorial history across new runs', () => {
    const tracker = new ModifierIntroductionTracker(['stitch-pair']);
    expect(tracker.presentationFor(['stitch-pair'])?.detailed).toBe(false);
    expect(tracker.presentationFor(['past-position'])?.detailed).toBe(true);
    expect(tracker.seenIds()).toEqual(expect.arrayContaining(['stitch-pair', 'past-position']));
  });

  it('includes guided wave patterns in the Act introduction and removes duplicates', () => {
    expect(modifierLabelsForAct(
      ['ink-echo-projectile', 'stitch-pair', 'past-position', 'mixed-archive', 'stitch-pair'],
      [],
    )).toEqual(['먹물 잔향탄', '봉합 쌍', '과거 교정', '편집 실험']);
  });

  it('omits the baseline pattern and includes endless modifiers', () => {
    expect(modifierLabelsForAct(['archive-baseline'], ['time-rift'])).toEqual(['시간 균열']);
  });
});
