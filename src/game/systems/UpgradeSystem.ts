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
    while (result.length < count && pool.length > 0) {
      const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
      const [picked] = pool.splice(index, 1);
      if (picked) result.push(picked);
    }
    return result;
  }

  public reroll(random: () => number = Math.random): UpgradeDefinition[] | null {
    if (this.rerolls <= 0) return null;
    this.rerolls -= 1;
    return this.choices(3, random);
  }

  public get rerollsLeft(): number { return this.rerolls; }

  public summary(): string[] {
    return [...this.stacks.entries()].map(([id, count]) => {
      const name = UPGRADES.find((item) => item.id === id)?.name ?? id;
      return `${name}${count > 1 ? ` ×${count}` : ''}`;
    });
  }
}
