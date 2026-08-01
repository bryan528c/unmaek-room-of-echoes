import { UPGRADES, upgradeById, upgradeDescription, type UpgradeDefinition, type UpgradeId } from '../data/upgrades';

export interface SealedSentenceStats {
  stacks: number;
  cooldownReduction: number;
  wordHitSentenceBonus: number;
}

export interface UpgradeChoicePreview {
  currentStacks: number;
  nextStacks: number;
  currentDescription: string;
  nextDescription: string;
  stackMode: UpgradeDefinition['stackMode'];
}

export function sealedSentenceStats(stacks: number): SealedSentenceStats {
  const definition = upgradeById('sealed-sentence');
  const capped = Math.max(0, Math.min(definition?.maxStacks ?? 3, Math.floor(stacks)));
  return {
    stacks: capped,
    cooldownReduction: (definition?.effect.cooldownReduction ?? 0.06) * capped,
    wordHitSentenceBonus: (definition?.effect.gainBonus ?? 0.15) * capped,
  };
}

export class UpgradeSystem {
  private readonly stacks = new Map<UpgradeId, number>();
  private rerolls = 1;

  public getStack(id: UpgradeId): number {
    return this.stacks.get(id) ?? 0;
  }

  public canAdd(id: UpgradeId): boolean {
    const definition = UPGRADES.find((item) => item.id === id);
    return definition !== undefined && this.getStack(id) < definition.maxStacks;
  }

  public add(id: UpgradeId): boolean {
    if (!this.canAdd(id)) return false;
    this.stacks.set(id, this.getStack(id) + 1);
    return true;
  }

  public choices(count = 3, random: () => number = Math.random): UpgradeDefinition[] {
    const pool = UPGRADES.filter((upgrade) => this.canAdd(upgrade.id));
    const result: UpgradeDefinition[] = [];
    const ownedTags = new Set([...this.stacks.keys()].flatMap((id) => UPGRADES.find((upgrade) => upgrade.id === id)?.tags ?? []));
    const pick = (candidates: UpgradeDefinition[]): void => {
      const available = candidates.filter((item) => pool.includes(item) && (!item.survival || !result.some((choice) => choice.survival)));
      if (available.length === 0 || result.length >= count) return;
      const chosen = available[Math.min(available.length - 1, Math.floor(random() * available.length))];
      if (!chosen) return; result.push(chosen); pool.splice(pool.indexOf(chosen), 1);
    };
    if (ownedTags.size > 0) pick(pool.filter((upgrade) => upgrade.tags.some((tag) => ownedTags.has(tag))));
    pick(pool.filter((upgrade) => upgrade.tags.every((tag) => !ownedTags.has(tag))));
    while (result.length < count && pool.length > 0) pick(pool);
    if (result.length > 1 && result.every((upgrade) => upgrade.tags[0] === result[0]?.tags[0])) {
      const replacement = pool.find((upgrade) => upgrade.tags[0] !== result[0]?.tags[0] && (!upgrade.survival || !result.some((choice) => choice.survival)));
      if (replacement) result[result.length - 1] = replacement;
    }
    return result;
  }

  public preview(id: UpgradeId): UpgradeChoicePreview | undefined {
    const definition = upgradeById(id); if (!definition) return undefined;
    const currentStacks = this.getStack(id);
    const nextStacks = Math.min(definition.maxStacks, currentStacks + 1);
    return {
      currentStacks,
      nextStacks,
      currentDescription: currentStacks > 0 ? upgradeDescription(definition, currentStacks) : '미보유',
      nextDescription: upgradeDescription(definition, nextStacks),
      stackMode: definition.stackMode,
    };
  }

  /** First reward always demonstrates one word change, one active combat change and one safety choice. */
  public firstChoices(random: () => number = Math.random): UpgradeDefinition[] {
    const result: UpgradeDefinition[] = [];
    const pick = (ids: readonly UpgradeId[]): void => {
      const pool = ids.map((id) => UPGRADES.find((upgrade) => upgrade.id === id)).filter((upgrade): upgrade is UpgradeDefinition => upgrade !== undefined && this.canAdd(upgrade.id) && !result.includes(upgrade));
      if (pool.length === 0) return;
      result.push(pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!);
    };
    pick(['dual-moon-echo', 'wide-orbit', 'cut-sentence', 'backflow-blade', 'returning-scar', 'isolation-chain']);
    pick(['broken-sentence', 'regression-sword-shadow', 'link-overload', 'stop-resonance', 'perfect-breath']);
    pick(['ink-cloak', 'fragment-recovery', 'sealed-sentence']);
    if (result.length < 3) for (const upgrade of this.choices(3, random)) if (!result.includes(upgrade) && result.length < 3) result.push(upgrade);
    return result;
  }

  public reroll(random: () => number = Math.random): UpgradeDefinition[] | null {
    if (this.rerolls <= 0) return null;
    this.rerolls -= 1;
    return this.choices(3, random);
  }

  public get rerollsLeft(): number { return this.rerolls; }

  public entries(): Array<{ id: UpgradeId; stacks: number }> {
    return [...this.stacks.entries()].map(([id, stacks]) => ({ id, stacks }));
  }

  public summary(): string[] {
    return [...this.stacks.entries()].map(([id, count]) => {
      const name = UPGRADES.find((item) => item.id === id)?.name ?? id;
      return `${name}${count > 1 ? ` ×${count}` : ''}`;
    });
  }
}
