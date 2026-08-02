import { describe, expect, it } from 'vitest';
import { ACTIVE_UPGRADES, RESONANCES, type UpgradeId } from '../game/data/upgrades';
import { UpgradeSystem } from '../game/systems/UpgradeSystem';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}

const BUILDS: readonly (readonly UpgradeId[])[] = [
  [],
  ['dual-moon-echo'],
  ['perfect-counter'],
  ['returning-scar'],
  ['stop-resonance'],
  ['isolation-chain'],
] as const;

describe('UPGRADE-04R 500-run reward simulation', () => {
  it('keeps immediate unselected repeats and max-stack leaks at zero while preserving varied behavior offers', () => {
    const frequencies = new Map<UpgradeId, number>();
    let screens = 0;
    let behaviorScreens = 0;
    let sameCategoryScreens = 0;
    let immediateUnselectedRepeats = 0;
    let resonanceOpportunityScreens = 0;

    for (let seed = 1; seed <= 500; seed += 1) {
      const random = seeded(seed);
      const run = new UpgradeSystem();
      for (const id of BUILDS[seed % BUILDS.length] ?? []) run.add(id);
      let previousUnselected = new Set<UpgradeId>();

      for (let reward = 0; reward < 3; reward += 1) {
        const healthRatio = [0.3, 0.44, 0.72, 0.95][(seed + reward) % 4] ?? 1;
        const choices = run.choices(3, random, {
          healthRatio,
          rewardIndex: reward,
          parryUses: seed % 9,
          wordUses: seed % 13,
          echoDamage: seed % 120,
          cutUses: seed % 11,
        });
        expect(choices).toHaveLength(3);
        expect(new Set(choices.map((choice) => choice.id)).size).toBe(3);
        expect(choices.every((choice) => run.canAdd(choice.id))).toBe(true);
        immediateUnselectedRepeats += choices.filter((choice) => previousUnselected.has(choice.id)).length;
        if (choices.some((choice) => choice.behaviorChange)) behaviorScreens += 1;
        if (new Set(choices.map((choice) => choice.category)).size === 1) sameCategoryScreens += 1;
        if (choices.some((choice) => run.resonanceCompleters(choice.id).length > 0)) resonanceOpportunityScreens += 1;
        choices.forEach((choice) => frequencies.set(choice.id, (frequencies.get(choice.id) ?? 0) + 1));
        screens += 1;

        const selected = choices[(seed + reward) % choices.length]!;
        previousUnselected = new Set(choices.filter((choice) => choice.id !== selected.id).map((choice) => choice.id));
        expect(run.add(selected.id)).toBe(true);
        expect(run.recordSelection(selected.id)).toBe(true);
      }
    }

    expect(immediateUnselectedRepeats).toBe(0);
    expect(behaviorScreens).toBe(screens);
    expect(sameCategoryScreens).toBe(0);
    expect(resonanceOpportunityScreens).toBeGreaterThan(250);
    expect(frequencies.size).toBe(ACTIVE_UPGRADES.length);
    const counts = [...frequencies.values()];
    const average = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    expect(Math.max(...counts)).toBeLessThan(average * 2.5);
  });

  it('weights survival toward low health without forcing it at healthy HP', () => {
    let lowHealthScreens = 0;
    let healthyScreens = 0;
    for (let seed = 1; seed <= 500; seed += 1) {
      if (new UpgradeSystem().choices(3, seeded(seed), { healthRatio: 0.35 }).some((choice) => choice.survival)) lowHealthScreens += 1;
      if (new UpgradeSystem().choices(3, seeded(seed), { healthRatio: 0.9 }).some((choice) => choice.survival)) healthyScreens += 1;
    }
    expect(lowHealthScreens).toBe(500);
    expect(healthyScreens).toBeLessThan(125);
  });

  it('never offers a card at maximum stacks', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const run = new UpgradeSystem();
      run.add('wide-orbit'); run.add('wide-orbit');
      expect(run.choices(3, seeded(seed), { healthRatio: 0.7 }).some((choice) => choice.id === 'wide-orbit')).toBe(false);
    }
  });

  it('replaces all three cards on reroll when the pool permits', () => {
    const run = new UpgradeSystem(); const random = seeded(42);
    const first = run.choices(3, random, { healthRatio: 0.8 });
    const rerolled = run.reroll(random, { healthRatio: 0.8 });
    expect(rerolled).not.toBeNull();
    expect(rerolled?.some((choice) => first.some((previous) => previous.id === choice.id))).toBe(false);
  });

  it('shows every resonance partner as a completion preview', () => {
    for (const resonance of RESONANCES) {
      const run = new UpgradeSystem(); run.add(resonance.requiredUpgradeIds[0]);
      expect(run.preview(resonance.requiredUpgradeIds[1])?.completesResonance).toContain(resonance.name);
    }
  });
});
