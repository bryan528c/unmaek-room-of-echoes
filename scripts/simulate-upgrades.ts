import { ACTIVE_UPGRADES, type UpgradeId } from '../src/game/data/upgrades';
import { UpgradeSystem } from '../src/game/systems/UpgradeSystem';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}

const builds: readonly (readonly UpgradeId[])[] = [
  [],
  ['dual-moon-echo'],
  ['perfect-counter'],
  ['returning-scar'],
  ['stop-resonance'],
  ['isolation-chain'],
] as const;
const healthStates = [0.3, 0.44, 0.72, 0.95] as const;
const frequencies = new Map<UpgradeId, number>();
let screens = 0;
let behaviorScreens = 0;
let sameCategoryScreens = 0;
let immediateUnselectedRepeats = 0;
let resonanceOpportunityScreens = 0;
let maximumStackLeaks = 0;
let lowHealthScreens = 0;
let lowHealthSurvivalScreens = 0;
let healthyScreens = 0;
let healthySurvivalScreens = 0;

for (let seed = 1; seed <= 500; seed += 1) {
  const random = seeded(seed);
  const run = new UpgradeSystem();
  for (const id of builds[seed % builds.length] ?? []) run.add(id);
  let previousUnselected = new Set<UpgradeId>();

  for (let reward = 0; reward < 3; reward += 1) {
    const healthRatio = healthStates[(seed + reward) % healthStates.length] ?? 1;
    const choices = run.choices(3, random, {
      healthRatio,
      rewardIndex: reward,
      parryUses: seed % 9,
      wordUses: seed % 13,
      echoDamage: seed % 120,
      cutUses: seed % 11,
    });
    screens += 1;
    if (choices.some((choice) => choice.behaviorChange)) behaviorScreens += 1;
    if (new Set(choices.map((choice) => choice.category)).size === 1) sameCategoryScreens += 1;
    if (choices.some((choice) => run.resonanceCompleters(choice.id).length > 0)) resonanceOpportunityScreens += 1;
    immediateUnselectedRepeats += choices.filter((choice) => previousUnselected.has(choice.id)).length;
    if (choices.some((choice) => run.getStack(choice.id) >= choice.maxStacks)) maximumStackLeaks += 1;
    if (healthRatio <= 0.45) {
      lowHealthScreens += 1;
      if (choices.some((choice) => choice.survival)) lowHealthSurvivalScreens += 1;
    } else if (healthRatio >= 0.7) {
      healthyScreens += 1;
      if (choices.some((choice) => choice.survival)) healthySurvivalScreens += 1;
    }
    for (const choice of choices) frequencies.set(choice.id, (frequencies.get(choice.id) ?? 0) + 1);

    const selected = choices[(seed + reward) % choices.length];
    if (!selected) continue;
    previousUnselected = new Set(choices.filter((choice) => choice.id !== selected.id).map((choice) => choice.id));
    run.add(selected.id);
    run.recordSelection(selected.id);
  }
}

const sortedFrequency = [...frequencies.entries()].sort((a, b) => b[1] - a[1]);
const averageFrequency = sortedFrequency.reduce((sum, [, count]) => sum + count, 0) / Math.max(1, sortedFrequency.length);
const result = {
  runs: 500,
  rewardScreens: screens,
  activeCards: ACTIVE_UPGRADES.length,
  distinctCardsOffered: frequencies.size,
  immediateUnselectedRepeats,
  maximumStackLeaks,
  behaviorChangeRate: behaviorScreens / Math.max(1, screens),
  sameCategoryRate: sameCategoryScreens / Math.max(1, screens),
  resonanceOpportunityRate: resonanceOpportunityScreens / Math.max(1, screens),
  lowHealthSurvivalRate: lowHealthSurvivalScreens / Math.max(1, lowHealthScreens),
  healthySurvivalRate: healthySurvivalScreens / Math.max(1, healthyScreens),
  maximumToAverageFrequency: (sortedFrequency[0]?.[1] ?? 0) / Math.max(1, averageFrequency),
  frequency: Object.fromEntries(sortedFrequency),
};

console.log(JSON.stringify(result, null, 2));

if (immediateUnselectedRepeats > 0
  || maximumStackLeaks > 0
  || behaviorScreens !== screens
  || sameCategoryScreens > 0
  || lowHealthSurvivalScreens <= healthySurvivalScreens) process.exitCode = 1;
