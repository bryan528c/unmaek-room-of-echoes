import {
  ACTIVE_UPGRADES,
  RESONANCES,
  upgradeById,
  upgradeDescription,
  type ResonanceId,
  type UpgradeDefinition,
  type UpgradeId,
} from '../data/upgrades';
import type { WordId } from './WordSystem';

export interface SealedSentenceStats {
  stacks: number;
  cooldownReduction: number;
  wordHitSentenceBonus: number;
}

/**
 * Run-scoped contribution counters. `activationCount` is deliberately separate
 * from the accumulated values: one activation may damage several targets and
 * can therefore add damage with activationCount: 0 after its first record.
 */
export interface UpgradeContribution {
  activationCount: number;
  damageContribution: number;
  healingContribution: number;
  resourceContribution: number;
  cooldownReductionContribution: number;
  reflectedProjectileCount: number;
  affectedTargetCount: number;
  preventedDamage: number;
  failedConditionCount: number;
  generatedCount: number;
  hitCount: number;
  missCount: number;
}

export type ResonanceContribution = UpgradeContribution;

export type ContributionDelta = Partial<UpgradeContribution>;

export interface UpgradeChoicePreview {
  currentStacks: number;
  nextStacks: number;
  currentDescription: string;
  nextDescription: string;
  stackMode: UpgradeDefinition['stackMode'];
  category: UpgradeDefinition['category'];
  tags: readonly string[];
  synergyPreview: readonly string[];
  completesResonance: readonly string[];
}

export interface UpgradeSelectionContext {
  parryUses?: number;
  wordUses?: number;
  echoDamage?: number;
  cutUses?: number;
  /** Current health divided by maximum health. Values are clamped to 0..1. */
  healthRatio?: number;
  rewardIndex?: number;
  equippedWordIds?: readonly WordId[];
}

export interface UpgradeOfferHistorySnapshot {
  lastOffered: UpgradeId[];
  recentUnselected: UpgradeId[];
  selected: UpgradeId[];
  offerCounts: Partial<Record<UpgradeId, number>>;
}

export interface UpgradeRuntimeSnapshot {
  owned: Array<{ id: UpgradeId; stacks: number }>;
  contributions: Partial<Record<UpgradeId, UpgradeContribution>>;
  resonances: ResonanceId[];
  resonanceContributions: Partial<Record<ResonanceId, ResonanceContribution>>;
}

const blankContribution = (): UpgradeContribution => ({
  activationCount: 0,
  damageContribution: 0,
  healingContribution: 0,
  resourceContribution: 0,
  cooldownReductionContribution: 0,
  reflectedProjectileCount: 0,
  affectedTargetCount: 0,
  preventedDamage: 0,
  failedConditionCount: 0,
  generatedCount: 0,
  hitCount: 0,
  missCount: 0,
});

function addContribution(target: UpgradeContribution, values: ContributionDelta): void {
  target.activationCount += Math.max(0, Math.floor(values.activationCount ?? 0));
  target.damageContribution += Math.max(0, values.damageContribution ?? 0);
  target.healingContribution += Math.max(0, values.healingContribution ?? 0);
  target.resourceContribution += Math.max(0, values.resourceContribution ?? 0);
  target.cooldownReductionContribution += Math.max(0, values.cooldownReductionContribution ?? 0);
  target.reflectedProjectileCount += Math.max(0, values.reflectedProjectileCount ?? 0);
  target.affectedTargetCount += Math.max(0, values.affectedTargetCount ?? 0);
  target.preventedDamage += Math.max(0, values.preventedDamage ?? 0);
  target.failedConditionCount += Math.max(0, values.failedConditionCount ?? 0);
  target.generatedCount += Math.max(0, values.generatedCount ?? 0);
  target.hitCount += Math.max(0, values.hitCount ?? 0);
  target.missCount += Math.max(0, values.missCount ?? 0);
}

export function sealedSentenceStats(stacks: number): SealedSentenceStats {
  const definition = upgradeById('sealed-sentence');
  const capped = Math.max(0, Math.min(definition?.maxStacks ?? 3, Math.floor(stacks)));
  return {
    stacks: capped,
    cooldownReduction: (definition?.baseValues.cooldownReduction ?? 0.06) * capped,
    wordHitSentenceBonus: (definition?.baseValues.gainBonus ?? 0.15) * capped,
  };
}

export class UpgradeSystem {
  private readonly stacks = new Map<UpgradeId, number>();
  private readonly contributions = new Map<UpgradeId, UpgradeContribution>();
  private readonly resonanceContributions = new Map<ResonanceId, ResonanceContribution>();
  private rerolls = 1;
  private lastOffered: UpgradeId[] = [];
  private recentUnselected = new Set<UpgradeId>();
  private readonly selectedHistory: UpgradeId[] = [];
  private readonly offerCounts = new Map<UpgradeId, number>();

  public getStack(id: UpgradeId): number { return this.stacks.get(id) ?? 0; }

  public canAdd(id: UpgradeId): boolean {
    const definition = upgradeById(id);
    return definition?.active === true
      && this.getStack(id) < definition.maxStacks
      && !definition.incompatibleIds.some((other) => this.getStack(other) > 0);
  }

  public add(id: UpgradeId): boolean {
    if (!this.canAdd(id)) return false;
    this.stacks.set(id, this.getStack(id) + 1);
    return true;
  }

  /** Records the player's decision after add() succeeds. */
  public recordSelection(id: UpgradeId): boolean {
    if (!this.lastOffered.includes(id)) return false;
    this.recentUnselected = new Set(this.lastOffered.filter((offered) => offered !== id));
    this.selectedHistory.push(id);
    return true;
  }

  public record(id: UpgradeId, values: ContributionDelta = {}): void {
    if (this.getStack(id) <= 0) return;
    const contribution = this.contributions.get(id) ?? blankContribution();
    addContribution(contribution, values);
    this.contributions.set(id, contribution);
  }

  public recordResonance(id: ResonanceId, values: ContributionDelta = {}): void {
    if (!this.hasResonance(id)) return;
    const contribution = this.resonanceContributions.get(id) ?? blankContribution();
    addContribution(contribution, values);
    this.resonanceContributions.set(id, contribution);
  }

  public hasResonance(id: ResonanceId): boolean {
    const resonance = RESONANCES.find((item) => item.id === id);
    return resonance !== undefined && resonance.requiredUpgradeIds.every((upgradeId) => this.getStack(upgradeId) > 0);
  }

  public activeResonances(): ResonanceId[] {
    return RESONANCES.filter((resonance) => this.hasResonance(resonance.id)).map((resonance) => resonance.id);
  }

  public resonanceCompleters(id: UpgradeId): ResonanceId[] {
    if (!this.canAdd(id)) return [];
    return RESONANCES.filter((resonance) => resonance.requiredUpgradeIds.includes(id)
      && resonance.requiredUpgradeIds.every((required) => required === id || this.getStack(required) > 0))
      .map((resonance) => resonance.id);
  }

  private pool(exclude: ReadonlySet<UpgradeId> = new Set(), equippedWordIds?: readonly WordId[]): UpgradeDefinition[] {
    const equipped = equippedWordIds ? new Set(equippedWordIds) : undefined;
    return ACTIVE_UPGRADES.filter((upgrade) => this.canAdd(upgrade.id) && !exclude.has(upgrade.id)
      && (!upgrade.requiredWordIds?.length || !equipped || upgrade.requiredWordIds.some((id) => equipped.has(id))));
  }

  private score(upgrade: UpgradeDefinition, ownedTags: ReadonlySet<string>, context: UpgradeSelectionContext): number {
    const sharedTags = upgrade.tags.filter((tag) => ownedTags.has(tag)).length;
    const resonance = this.resonanceCompleters(upgrade.id).length;
    let score = 1 + sharedTags * 2.2 + resonance * 5 + (upgrade.behaviorChange ? 1.2 : 0);
    if ((context.parryUses ?? 0) > 3 && upgrade.tags.includes('parry')) score += 1.5;
    if ((context.wordUses ?? 0) > 4 && upgrade.category === 'word') score += 1.3;
    if ((context.echoDamage ?? 0) > 40 && upgrade.category === 'echo-blade') score += 1;
    if ((context.cutUses ?? 0) > 4 && upgrade.category === 'cut-parry') score += 1;

    const healthRatio = Math.max(0, Math.min(1, context.healthRatio ?? 1));
    if (upgrade.survival) {
      if (healthRatio <= 0.45) score *= 2.8;
      else if (healthRatio >= 0.7) score *= 0.55;
    }
    if (this.getStack(upgrade.id) > 0) score *= 1.15;

    // Repeatedly seeing the same unchosen card erodes trust. Immediate repeats
    // are excluded completely; older appearances receive this soft penalty.
    // A selected card may legitimately return for stacking, but each prior
    // appearance must still reduce its offer weight.  This keeps stackable
    // survival/behavior cards from dominating short runs while resonance
    // completers remain reachable through the dedicated first slot.
    score /= 1 + (this.offerCounts.get(upgrade.id) ?? 0);
    if (upgrade.rarity === '전설') score *= 0.82;
    return Math.max(0.05, score);
  }

  private weightedPick(pool: UpgradeDefinition[], random: () => number, ownedTags: ReadonlySet<string>, context: UpgradeSelectionContext): UpgradeDefinition | undefined {
    if (pool.length === 0) return undefined;
    const weighted = pool.map((upgrade) => ({ upgrade, weight: this.score(upgrade, ownedTags, context) }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let cursor = Math.max(0, Math.min(0.999999, random())) * total;
    for (const item of weighted) {
      cursor -= item.weight;
      if (cursor <= 0) return item.upgrade;
    }
    return weighted.at(-1)?.upgrade;
  }

  private recordOffer(result: readonly UpgradeDefinition[]): void {
    this.lastOffered = result.map((upgrade) => upgrade.id);
    for (const id of this.lastOffered) this.offerCounts.set(id, (this.offerCounts.get(id) ?? 0) + 1);
  }

  public choices(count = 3, random: () => number = Math.random, context: UpgradeSelectionContext = {}, excludePrevious = false): UpgradeDefinition[] {
    const excluded = new Set(this.recentUnselected);
    if (excludePrevious) for (const id of this.lastOffered) excluded.add(id);
    let pool = this.pool(excluded, context.equippedWordIds);
    const result: UpgradeDefinition[] = [];
    const ownedEntries = this.entries();
    const ownedTags = new Set(ownedEntries.flatMap(({ id }) => upgradeById(id)?.tags ?? []));
    const ownedCategories = new Set(ownedEntries.map(({ id }) => upgradeById(id)?.category).filter((category): category is UpgradeDefinition['category'] => category !== undefined));
    const take = (candidates: UpgradeDefinition[]): boolean => {
      if (result.length >= count) return false;
      const available = candidates.filter((candidate) => pool.includes(candidate)
        && !result.some((choice) => choice.id === candidate.id)
        && (!candidate.survival || !result.some((choice) => choice.survival)));
      const selected = this.weightedPick(available, random, ownedTags, context);
      if (!selected) return false;
      result.push(selected);
      pool = pool.filter((candidate) => candidate.id !== selected.id);
      return true;
    };

    // Slot one deepens the current build, with a resonance completion taking
    // precedence over a merely shared tag.
    if (ownedEntries.length > 0) {
      const completers = pool.filter((upgrade) => this.resonanceCompleters(upgrade.id).length > 0);
      const buildMatches = pool.filter((upgrade) => upgrade.tags.some((tag) => ownedTags.has(tag)));
      // Completion cards receive a strong score bonus, but are not a mandatory
      // first-slot pick on every reward. This preserves player choice and stops
      // a single common partner (notably 절단 문장) from crowding out a build's
      // other compatible behavior cards.
      if (completers.length > 0) take([...new Set([...completers, ...buildMatches])]);
      else take(buildMatches);
    }

    // Slot two exposes an unowned behavior, preferably from a new category.
    take(pool.filter((upgrade) => upgrade.behaviorChange && this.getStack(upgrade.id) === 0 && !ownedCategories.has(upgrade.category)));
    take(pool.filter((upgrade) => upgrade.behaviorChange && this.getStack(upgrade.id) === 0
      && !result.some((choice) => choice.category === upgrade.category)));

    // Survival belongs in the flex slot and is only forced while health is low.
    const healthRatio = Math.max(0, Math.min(1, context.healthRatio ?? 1));
    if (healthRatio <= 0.45) take(pool.filter((upgrade) => upgrade.survival));
    else take(pool.filter((upgrade) => !upgrade.survival && !result.some((choice) => choice.category === upgrade.category)));

    while (result.length < count && pool.length > 0) if (!take(pool)) break;

    if (!result.some((upgrade) => upgrade.behaviorChange)) {
      const replacement = pool.find((upgrade) => upgrade.behaviorChange);
      if (replacement && result.length > 0) result[result.length - 1] = replacement;
    }
    if (result.length === count && new Set(result.map((upgrade) => upgrade.category)).size === 1) {
      const replacement = pool.find((upgrade) => upgrade.category !== result[0]?.category);
      if (replacement) result[result.length - 1] = replacement;
    }
    this.recordOffer(result);
    return result;
  }

  public preview(id: UpgradeId): UpgradeChoicePreview | undefined {
    const definition = upgradeById(id);
    if (!definition?.active) return undefined;
    const currentStacks = this.getStack(id);
    const nextStacks = Math.min(definition.maxStacks, currentStacks + 1);
    const synergyPreview = definition.synergyIds.map((resonanceId) => {
      const resonance = RESONANCES.find((item) => item.id === resonanceId);
      if (!resonance) return resonanceId;
      const partnerId = resonance.requiredUpgradeIds.find((upgradeId) => upgradeId !== id);
      return `${resonance.name} · ${upgradeById(partnerId ?? '')?.name ?? partnerId ?? ''}`;
    });
    return {
      currentStacks,
      nextStacks,
      currentDescription: currentStacks > 0 ? upgradeDescription(definition, currentStacks) : '미보유',
      nextDescription: upgradeDescription(definition, nextStacks),
      stackMode: definition.stackMode,
      category: definition.category,
      tags: definition.tags,
      synergyPreview,
      completesResonance: this.resonanceCompleters(id).map((resonanceId) => RESONANCES.find((item) => item.id === resonanceId)?.name ?? resonanceId),
    };
  }

  public firstChoices(random: () => number = Math.random, context: UpgradeSelectionContext = {}): UpgradeDefinition[] {
    const result: UpgradeDefinition[] = [];
    const pick = (ids: readonly UpgradeId[]): void => {
      const equipped = context.equippedWordIds ? new Set(context.equippedWordIds) : undefined;
      const pool = ids.map((id) => upgradeById(id)).filter((upgrade): upgrade is UpgradeDefinition => upgrade?.active === true && this.canAdd(upgrade.id) && !result.includes(upgrade)
        && (!upgrade.requiredWordIds?.length || !equipped || upgrade.requiredWordIds.some((wordId) => equipped.has(wordId))));
      if (pool.length === 0) return;
      result.push(pool[Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(.999999, random())) * pool.length))]!);
    };
    pick(['dual-moon-echo', 'wide-orbit', 'cut-sentence', 'rupture-step']);
    pick(['perfect-counter', 'counter-inscription', 'chain-breath', 'stop-resonance', 'gravity-inscription', 'deep-mark', 'recoil-ripple']);
    pick(['ink-cloak', 'rewind-breath', 'fragment-recovery']);
    this.recordOffer(result);
    return result;
  }

  public bossChoices(random: () => number = Math.random, context: UpgradeSelectionContext = {}): UpgradeDefinition[] {
    const pool = this.pool(new Set(this.recentUnselected), context.equippedWordIds);
    const result: UpgradeDefinition[] = [];
    const take = (candidates: UpgradeDefinition[]): void => {
      const available = candidates.filter((candidate) => !result.some((item) => item.id === candidate.id));
      if (available.length === 0) return;
      const ownedTags = new Set(this.entries().flatMap(({ id }) => upgradeById(id)?.tags ?? []));
      const selected = this.weightedPick(available, random, ownedTags, context); if (selected) result.push(selected);
    };
    take(pool.filter((upgrade) => upgrade.behaviorChange && (upgrade.rarity === '희귀' || upgrade.rarity === '전설')));
    take(pool.filter((upgrade) => this.resonanceCompleters(upgrade.id).length > 0 || (this.getStack(upgrade.id) > 0 && upgrade.behaviorChange)));
    take(pool.filter((upgrade) => upgrade.survival || upgrade.category === 'generic' || !result.some((item) => item.category === upgrade.category)));
    while (result.length < 3) take(pool);
    this.recordOffer(result); return result;
  }

  public reroll(random: () => number = Math.random, context: UpgradeSelectionContext = {}): UpgradeDefinition[] | null {
    if (this.rerolls <= 0) return null;
    this.rerolls -= 1;
    return this.choices(3, random, context, true);
  }

  public get rerollsLeft(): number { return this.rerolls; }

  public selectionHistory(): UpgradeOfferHistorySnapshot {
    return {
      lastOffered: [...this.lastOffered],
      recentUnselected: [...this.recentUnselected],
      selected: [...this.selectedHistory],
      offerCounts: Object.fromEntries(this.offerCounts),
    };
  }

  /** Development-only metric reset. Ownership and stacks intentionally remain intact. */
  public resetRuntimeMetrics(): void {
    this.contributions.clear();
    this.resonanceContributions.clear();
  }

  public entries(): Array<{ id: UpgradeId; stacks: number }> {
    return [...this.stacks.entries()].map(([id, stacks]) => ({ id, stacks }));
  }

  public runtimeSnapshot(): UpgradeRuntimeSnapshot {
    return {
      owned: this.entries(),
      contributions: Object.fromEntries([...this.contributions.entries()].map(([id, contribution]) => [id, { ...contribution }])),
      resonances: this.activeResonances(),
      resonanceContributions: Object.fromEntries([...this.resonanceContributions.entries()].map(([id, contribution]) => [id, { ...contribution }])),
    };
  }

  public summary(): string[] {
    return this.entries().map(({ id, stacks }) => `${upgradeById(id)?.name ?? id}${stacks > 1 ? ` ×${stacks}` : ''}`);
  }
}
