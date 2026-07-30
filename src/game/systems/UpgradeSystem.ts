import { UPGRADES, type UpgradeDefinition, type UpgradeId } from '../data/upgrades';

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
