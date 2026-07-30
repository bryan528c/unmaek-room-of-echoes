import type { UpgradeId } from '../data/upgrades';
import type { WordChainId, WordId } from './WordChainSystem';

export type DamageSource = 'melee' | 'projectile' | 'ink' | 'boss' | 'other';

export interface CombatStatsSnapshot {
  attackAttempts: number;
  attackHits: number;
  comboFinishes: number;
  parryAttempts: number;
  parrySuccesses: number;
  perfectParries: number;
  dashes: number;
  wordUses: Record<WordId, number>;
  empowerUses: number;
  chainCounts: Record<WordChainId, number>;
  chainDamage: Record<WordChainId, number>;
  autoTargetChanges: number;
  manualTargetChanges: number;
  damageTakenByType: Record<DamageSource, number>;
  bossPhaseTimes: Partial<Record<1 | 2 | 3, number>>;
  upgrades: Array<{ id: UpgradeId; stacks: number }>;
}

const blankChains = (): Record<WordChainId, number> => ({ 'chain-stop': 0, backflow: 0, 'damage-regression': 0 });

export class CombatStats {
  private data: CombatStatsSnapshot = this.empty();

  public reset(): void { this.data = this.empty(); }
  public attackAttempt(): void { this.data.attackAttempts += 1; }
  public attackHit(count = 1): void { this.data.attackHits += count; }
  public comboFinish(): void { this.data.comboFinishes += 1; }
  public parryAttempt(): void { this.data.parryAttempts += 1; }
  public parrySuccess(perfect: boolean): void { this.data.parrySuccesses += 1; if (perfect) this.data.perfectParries += 1; }
  public dash(): void { this.data.dashes += 1; }
  public word(word: WordId): void { this.data.wordUses[word] += 1; }
  public empower(): void { this.data.empowerUses += 1; }
  public chain(chain: WordChainId): void { this.data.chainCounts[chain] += 1; }
  public addChainDamage(chain: WordChainId, amount: number): void { this.data.chainDamage[chain] += Math.max(0, amount); }
  public targetChanged(manual: boolean): void { if (manual) this.data.manualTargetChanges += 1; else this.data.autoTargetChanges += 1; }
  public damageTaken(source: DamageSource, amount: number): void { this.data.damageTakenByType[source] += Math.max(0, amount); }
  public setBossPhaseTime(phase: 1 | 2 | 3, seconds: number): void { this.data.bossPhaseTimes[phase] = Math.max(0, seconds); }
  public setUpgrades(upgrades: Array<{ id: UpgradeId; stacks: number }>): void { this.data.upgrades = upgrades.map((item) => ({ ...item })); }
  public snapshot(): CombatStatsSnapshot { return structuredClone(this.data); }

  private empty(): CombatStatsSnapshot {
    return {
      attackAttempts: 0, attackHits: 0, comboFinishes: 0, parryAttempts: 0, parrySuccesses: 0, perfectParries: 0, dashes: 0,
      wordUses: { stop: 0, rewind: 0, link: 0 }, empowerUses: 0, chainCounts: blankChains(), chainDamage: blankChains(),
      autoTargetChanges: 0, manualTargetChanges: 0, damageTakenByType: { melee: 0, projectile: 0, ink: 0, boss: 0, other: 0 },
      bossPhaseTimes: {}, upgrades: [],
    };
  }
}
