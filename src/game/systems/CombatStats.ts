import type { ResonanceId, UpgradeId } from '../data/upgrades';
import type { EnemyKind } from '../balance';
import type { WordChainId, WordId } from './WordChainSystem';
import type { FinisherChargeSource, FinisherStatus } from './CombatCoreSystem';

export type DamageSource = 'melee' | 'projectile' | 'ink' | 'boss' | 'other';
export type AgencyDamageSource = 'basicJ' | 'enhancedJ' | 'stop' | 'rewind' | 'link' | 'chain' | 'automatic';
export type AgencyMilestone = 'manualHit' | 'stop' | 'rewind' | 'link' | 'chain' | 'enhancedThird' | 'empowerReady';

/**
 * Canonical per-upgrade/per-resonance contribution record.
 *
 * `activationCount` is deliberately not inferred from a contribution update.
 * A single activation can generate projectiles now and report damage later, so
 * the caller must explicitly include an activation delta at the actual trigger.
 */
export interface CombatContributionRecord {
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

  /** @deprecated Read compatibility for the pre-UPGRADE-04R result UI. */
  triggers: number;
  /** @deprecated Read compatibility for the pre-UPGRADE-04R result UI. */
  damage: number;
  /** @deprecated Read compatibility for the pre-UPGRADE-04R result UI. */
  healing: number;
  /** @deprecated Read compatibility for the pre-UPGRADE-04R result UI. */
  sentence: number;
  /** @deprecated Read compatibility for the pre-UPGRADE-04R result UI. */
  cooldownMs: number;
  /** @deprecated Read compatibility for the pre-UPGRADE-04R result UI. */
  reflectedProjectiles: number;
  /** @deprecated Read compatibility for the pre-UPGRADE-04R result UI. */
  affectedTargets: number;
  /** @deprecated Read compatibility for the pre-UPGRADE-04R result UI. */
  generated: number;
}

export interface CombatContributionDelta {
  activationCount?: number;
  damageContribution?: number;
  healingContribution?: number;
  resourceContribution?: number;
  cooldownReductionContribution?: number;
  reflectedProjectileCount?: number;
  affectedTargetCount?: number;
  preventedDamage?: number;
  failedConditionCount?: number;
  generatedCount?: number;
  hitCount?: number;
  missCount?: number;

  /** @deprecated Write compatibility while existing call sites migrate. */
  triggers?: number;
  /** @deprecated Write compatibility while existing call sites migrate. */
  damage?: number;
  /** @deprecated Write compatibility while existing call sites migrate. */
  healing?: number;
  /** @deprecated Write compatibility while existing call sites migrate. */
  sentence?: number;
  /** @deprecated Write compatibility while existing call sites migrate. */
  cooldownMs?: number;
  /** @deprecated Write compatibility while existing call sites migrate. */
  reflectedProjectiles?: number;
  /** @deprecated Write compatibility while existing call sites migrate. */
  affectedTargets?: number;
  /** @deprecated Write compatibility while existing call sites migrate. */
  generated?: number;
}

export interface CombatStatsSnapshot {
  jInputs: number;
  attackAttempts: number;
  attackHits: number;
  combosStarted: number;
  combosCompleted: number;
  comboFinishes: number;
  nearbyMisses: number;
  comboTargetChanges: number;
  noTargetSelections: number;
  outOfRangeSelections: number;
  upperBoundaryCorrections: number;
  enemiesOutsideBounds: number;
  telegraphOutsideHits: number;
  parryAttempts: number;
  parrySuccesses: number;
  perfectParries: number;
  dashes: number;
  wordUses: Record<WordId, number>;
  empowerUses: number;
  empoweredWordUses: Record<WordId, number>;
  chainCounts: Record<WordChainId, number>;
  chainAttempts: Record<WordChainId, number>;
  chainFallbacks: Record<WordChainId, number>;
  chainDamage: Record<WordChainId, number>;
  autoTargetChanges: number;
  manualTargetChanges: number;
  damageTakenByType: Record<DamageSource, number>;
  bossPhaseTimes: Partial<Record<1 | 2 | 3, number>>;
  upgrades: Array<{ id: UpgradeId; stacks: number }>;
  lastComboDamage: number;
  maximumComboDamage: number;
  ttkByKind: Partial<Record<EnemyKind, { last: number; average: number; samples: number }>>;
  lastParryPosition?: { beforeX: number; beforeY: number; afterX: number; afterY: number; extraDistance: number };
  maximumParryExtraDistance: number;
  resultTransitions: number;
  defensiveSlash: { attempts: number; hits: number; damage: number };
  echoBlade: { activations: number; hits: number; damage: number; projectilesReflected: number };
  cut: { uses: number; hits: number; damage: number; stopped: number; linked: number; echo: number; exposed: number; projectilesCut: number };
  finisher: {
    inputs: number;
    uses: number;
    hits: number;
    damage: number;
    misses: number;
    chargesLostOnMiss: number;
    emptyInputs: number;
    chargesGained: number;
    chargesSpent: number;
    gainedBySource: Record<FinisherChargeSource, number>;
    statusHits: Record<FinisherStatus, number>;
  };
  attackHitsByStep: Record<1 | 2 | 3, number>;
  linkContribution: { sharedDamage: number; isolatedBonusDamage: number; explosionDamage: number };
  rewindContribution: { healthRecovered: number; echoDamage: number };
  upgradeContributions: Partial<Record<UpgradeId, CombatContributionRecord>>;
  resonanceContributions: Partial<Record<ResonanceId, CombatContributionRecord>>;
  invalidWordUses: Record<WordId, number>;
  encounterTimes: Partial<Record<'wave-1' | 'wave-2' | 'wave-3' | 'boss', number>>;
  agency: {
    firstAt: Partial<Record<AgencyMilestone, number>>;
    rejectedChargeInputs: number;
    rejectedTargetInputs: number;
    damage: Record<AgencyDamageSource, number>;
    firstRound?: { duration: number; healthBeforeRecovery: number; healthAfterRecovery: number };
  };
  damageAttribution: { echoBlade: number; cutParry: number; word: number; upgradeResonance: number };
}

const blankChains = (): Record<WordChainId, number> => ({ 'chain-stop': 0, backflow: 0, 'damage-regression': 0 });

const contributionValue = (value: number | undefined): number => Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;

const blankContribution = (): CombatContributionRecord => ({
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
  triggers: 0,
  damage: 0,
  healing: 0,
  sentence: 0,
  cooldownMs: 0,
  reflectedProjectiles: 0,
  affectedTargets: 0,
  generated: 0,
});

function addContribution(record: CombatContributionRecord, delta: CombatContributionDelta): void {
  record.activationCount += contributionValue(delta.activationCount ?? delta.triggers);
  record.damageContribution += contributionValue(delta.damageContribution ?? delta.damage);
  record.healingContribution += contributionValue(delta.healingContribution ?? delta.healing);
  record.resourceContribution += contributionValue(delta.resourceContribution ?? delta.sentence);
  record.cooldownReductionContribution += contributionValue(delta.cooldownReductionContribution ?? delta.cooldownMs);
  record.reflectedProjectileCount += contributionValue(delta.reflectedProjectileCount ?? delta.reflectedProjectiles);
  record.affectedTargetCount += contributionValue(delta.affectedTargetCount ?? delta.affectedTargets);
  record.preventedDamage += contributionValue(delta.preventedDamage);
  record.failedConditionCount += contributionValue(delta.failedConditionCount);
  record.generatedCount += contributionValue(delta.generatedCount ?? delta.generated);
  record.hitCount += contributionValue(delta.hitCount);
  record.missCount += contributionValue(delta.missCount);

  // Keep legacy readers correct during the UI migration without maintaining a
  // second independently accumulated set of counters.
  record.triggers = record.activationCount;
  record.damage = record.damageContribution;
  record.healing = record.healingContribution;
  record.sentence = record.resourceContribution;
  record.cooldownMs = record.cooldownReductionContribution;
  record.reflectedProjectiles = record.reflectedProjectileCount;
  record.affectedTargets = record.affectedTargetCount;
  record.generated = record.generatedCount;
}

export class CombatStats {
  private data: CombatStatsSnapshot = this.empty();

  public reset(): void { this.data = this.empty(); }
  public jInput(): void { this.data.jInputs += 1; }
  public attackAttempt(): void { this.data.attackAttempts += 1; }
  public attackHit(count = 1): void { this.data.attackHits += count; }
  public comboStarted(): void { this.data.combosStarted += 1; }
  public comboFinish(): void { this.data.comboFinishes += 1; this.data.combosCompleted += 1; }
  public nearbyMiss(): void { this.data.nearbyMisses += 1; }
  public comboTargetChanged(): void { this.data.comboTargetChanges += 1; }
  public noTarget(): void { this.data.noTargetSelections += 1; }
  public outOfRangeTarget(): void { this.data.outOfRangeSelections += 1; }
  public boundaryCorrection(top = false): void { if (top) this.data.upperBoundaryCorrections += 1; }
  public enemyOutsideBounds(): void { this.data.enemiesOutsideBounds += 1; }
  public telegraphOutsideHit(): void { this.data.telegraphOutsideHits += 1; }
  public parryAttempt(): void { this.data.parryAttempts += 1; }
  public parrySuccess(perfect: boolean): void { this.data.parrySuccesses += 1; if (perfect) this.data.perfectParries += 1; }
  public dash(): void { this.data.dashes += 1; }
  public word(word: WordId): void { this.data.wordUses[word] += 1; }
  public empower(): void { this.data.empowerUses += 1; }
  public empoweredWord(word: WordId, count = 1): void { this.data.empoweredWordUses[word] += contributionValue(count); }
  public chain(chain: WordChainId): void { this.data.chainCounts[chain] += 1; }
  public chainAttempt(chain: WordChainId, fallback: boolean): void { this.data.chainAttempts[chain] += 1; if (fallback) this.data.chainFallbacks[chain] += 1; }
  public addChainDamage(chain: WordChainId, amount: number): void {
    const value = contributionValue(amount);
    this.data.chainDamage[chain] += value;
    this.data.agency.damage.chain += value;
    this.data.damageAttribution.word += value;
  }
  public targetChanged(manual: boolean): void { if (manual) this.data.manualTargetChanges += 1; else this.data.autoTargetChanges += 1; }
  public damageTaken(source: DamageSource, amount: number): void { this.data.damageTakenByType[source] += Math.max(0, amount); }
  public setBossPhaseTime(phase: 1 | 2 | 3, seconds: number): void { this.data.bossPhaseTimes[phase] = Math.max(0, seconds); }
  public setUpgrades(upgrades: Array<{ id: UpgradeId; stacks: number }>): void { this.data.upgrades = upgrades.map((item) => ({ ...item })); }
  public comboDamage(amount: number): void {
    this.data.lastComboDamage = Math.max(0, amount);
    this.data.maximumComboDamage = Math.max(this.data.maximumComboDamage, this.data.lastComboDamage);
  }
  public enemyTtk(kind: EnemyKind, seconds: number): void {
    const value = Math.max(0, seconds); const previous = this.data.ttkByKind[kind];
    const samples = (previous?.samples ?? 0) + 1;
    const average = ((previous?.average ?? 0) * (samples - 1) + value) / samples;
    this.data.ttkByKind[kind] = { last: value, average, samples };
  }
  public parryPosition(beforeX: number, beforeY: number, afterX: number, afterY: number): void {
    const extraDistance = Math.hypot(afterX - beforeX, afterY - beforeY);
    this.data.lastParryPosition = { beforeX, beforeY, afterX, afterY, extraDistance };
    this.data.maximumParryExtraDistance = Math.max(this.data.maximumParryExtraDistance, extraDistance);
  }
  public resultTransition(): void { this.data.resultTransitions += 1; }
  public defensiveSlashAttempt(): void { this.data.defensiveSlash.attempts += 1; }
  public defensiveSlashHit(damage: number): void { this.data.defensiveSlash.hits += 1; this.data.defensiveSlash.damage += Math.max(0, damage); }
  public echoBladeActivation(): void { this.data.echoBlade.activations += 1; }
  public echoBladeHit(damage: number): void { this.data.echoBlade.hits += 1; this.data.echoBlade.damage += Math.max(0, damage); }
  public echoBladeProjectile(): void { this.data.echoBlade.projectilesReflected += 1; }
  public cutUse(): void { this.data.cut.uses += 1; }
  public cutHit(damage: number, states: Readonly<{ stopped: boolean; linked: boolean; echo: boolean; exposed: boolean }>): void {
    this.data.cut.hits += 1; this.data.cut.damage += Math.max(0, damage);
    if (states.stopped) this.data.cut.stopped += 1; if (states.linked) this.data.cut.linked += 1;
    if (states.echo) this.data.cut.echo += 1; if (states.exposed) this.data.cut.exposed += 1;
  }
  public cutProjectile(): void { this.data.cut.projectilesCut += 1; }
  public finisherInput(): void { this.data.finisher.inputs += 1; }
  public finisherUse(): void { this.data.finisher.uses += 1; this.data.finisher.chargesSpent += 1; }
  public finisherMiss(): void { this.data.finisher.misses += 1; }
  public finisherEmptyInput(): void { this.data.finisher.emptyInputs += 1; }
  public finisherHit(damage: number, status: FinisherStatus): void {
    this.data.finisher.hits += 1; this.data.finisher.damage += Math.max(0, damage); this.data.finisher.statusHits[status] += 1;
  }
  public attackStepHit(step: 1 | 2 | 3, count = 1): void { this.data.attackHitsByStep[step] += Math.max(0, count); }
  public linkSharedDamage(amount: number): void { this.data.linkContribution.sharedDamage += Math.max(0, amount); }
  public linkIsolatedBonus(amount: number): void { this.data.linkContribution.isolatedBonusDamage += Math.max(0, amount); }
  public linkExplosionDamage(amount: number): void { this.data.linkContribution.explosionDamage += Math.max(0, amount); }
  public rewindRecovered(amount: number): void { this.data.rewindContribution.healthRecovered += Math.max(0, amount); }
  public rewindEchoDamage(amount: number): void { this.data.rewindContribution.echoDamage += Math.max(0, amount); }
  public upgradeContribution(id: UpgradeId, values: CombatContributionDelta = {}): void {
    const item = this.data.upgradeContributions[id] ??= blankContribution();
    addContribution(item, values);
  }
  public resonanceContribution(id: ResonanceId, values: CombatContributionDelta = {}): void {
    const item = this.data.resonanceContributions[id] ??= blankContribution();
    addContribution(item, values);
  }

  /** Clears only upgrade/resonance contribution counters for the F4 laboratory. */
  public resetUpgradeContributions(): void {
    this.data.upgradeContributions = {};
    this.data.resonanceContributions = {};
  }
  public finisherCharge(source: FinisherChargeSource, amount: number): void {
    const gained = Math.max(0, amount); this.data.finisher.chargesGained += gained; this.data.finisher.gainedBySource[source] += gained;
  }
  public invalidWord(word: WordId): void { this.data.invalidWordUses[word] += 1; }
  public setEncounterTime(encounter: 'wave-1' | 'wave-2' | 'wave-3' | 'boss', seconds: number): void { this.data.encounterTimes[encounter] = Math.max(0, seconds); }
  public agencyMilestone(name: AgencyMilestone, seconds: number): void { if (this.data.agency.firstAt[name] === undefined) this.data.agency.firstAt[name] = Math.max(0, seconds); }
  public agencyDamage(source: AgencyDamageSource, amount: number): void {
    const value = contributionValue(amount); this.data.agency.damage[source] += value;
    if (source === 'automatic') this.data.damageAttribution.echoBlade += value;
    else if (source === 'basicJ' || source === 'enhancedJ') this.data.damageAttribution.cutParry += value;
    else this.data.damageAttribution.word += value;
  }
  /** Records parry/reflection damage that has no legacy agency damage source. */
  public parryDamage(amount: number): void { this.data.damageAttribution.cutParry += contributionValue(amount); }
  /**
   * Records standalone card/resonance damage only. Damage already reported via
   * `agencyDamage` remains attributed to that originating combat action so the
   * four result-screen buckets stay mutually exclusive.
   */
  public attributedUpgradeDamage(amount: number): void { this.data.damageAttribution.upgradeResonance += contributionValue(amount); }
  public firstRound(duration: number, healthBeforeRecovery: number, healthAfterRecovery: number): void { this.data.agency.firstRound = { duration: Math.max(0, duration), healthBeforeRecovery, healthAfterRecovery }; }
  public snapshot(): CombatStatsSnapshot { return structuredClone(this.data); }

  private empty(): CombatStatsSnapshot {
    return {
      jInputs: 0, attackAttempts: 0, attackHits: 0, combosStarted: 0, combosCompleted: 0, comboFinishes: 0,
      nearbyMisses: 0, comboTargetChanges: 0, noTargetSelections: 0, outOfRangeSelections: 0,
      upperBoundaryCorrections: 0, enemiesOutsideBounds: 0, telegraphOutsideHits: 0,
      parryAttempts: 0, parrySuccesses: 0, perfectParries: 0, dashes: 0,
      wordUses: { stop: 0, rewind: 0, link: 0 }, empowerUses: 0, empoweredWordUses: { stop: 0, rewind: 0, link: 0 }, chainCounts: blankChains(), chainAttempts: blankChains(), chainFallbacks: blankChains(), chainDamage: blankChains(),
      autoTargetChanges: 0, manualTargetChanges: 0, damageTakenByType: { melee: 0, projectile: 0, ink: 0, boss: 0, other: 0 },
      bossPhaseTimes: {}, upgrades: [],
      lastComboDamage: 0, maximumComboDamage: 0, ttkByKind: {}, maximumParryExtraDistance: 0, resultTransitions: 0,
      defensiveSlash: { attempts: 0, hits: 0, damage: 0 },
      echoBlade: { activations: 0, hits: 0, damage: 0, projectilesReflected: 0 },
      cut: { uses: 0, hits: 0, damage: 0, stopped: 0, linked: 0, echo: 0, exposed: 0, projectilesCut: 0 },
      finisher: {
        inputs: 0, uses: 0, hits: 0, damage: 0, misses: 0, chargesLostOnMiss: 0, emptyInputs: 0, chargesGained: 0, chargesSpent: 0,
        gainedBySource: { 'round-start': 0, parry: 0, 'perfect-parry': 0, 'word-chain': 0, 'boss-mechanic': 0, tutorial: 0, qa: 0 },
        statusHits: { normal: 0, stopped: 0, linked: 0, echo: 0 },
      },
      attackHitsByStep: { 1: 0, 2: 0, 3: 0 },
      linkContribution: { sharedDamage: 0, isolatedBonusDamage: 0, explosionDamage: 0 },
      rewindContribution: { healthRecovered: 0, echoDamage: 0 },
      upgradeContributions: {}, resonanceContributions: {},
      invalidWordUses: { stop: 0, rewind: 0, link: 0 }, encounterTimes: {},
      agency: { firstAt: {}, rejectedChargeInputs: 0, rejectedTargetInputs: 0, damage: { basicJ: 0, enhancedJ: 0, stop: 0, rewind: 0, link: 0, chain: 0, automatic: 0 } },
      damageAttribution: { echoBlade: 0, cutParry: 0, word: 0, upgradeResonance: 0 },
    };
  }
}
