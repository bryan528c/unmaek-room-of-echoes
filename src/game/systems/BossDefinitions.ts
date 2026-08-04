export type BossId = 'record-devourer' | 'record-editor';
export type BossPhaseId = 1 | 2 | 3;

export interface BossPhaseDefinition {
  id: BossPhaseId;
  displayName: string;
  signaturePattern: string;
  guide: string;
  /** Portion of the original 900 HP budget assigned to this independent phase. */
  healthScale: number;
  /** Earliest completion time after entry; signature execution is also required. */
  minimumActiveMs: number;
}

export interface BossDefinition {
  bossId: BossId;
  displayName: string;
  silhouetteKey: string;
  paletteKey: 'devourer' | 'editor';
  phaseDefinitions: readonly [BossPhaseDefinition, BossPhaseDefinition, BossPhaseDefinition];
  telegraphStyle: 'devour' | 'correction';
  defeatSequence: 'release-records' | 'assemble-pages';
  rewardTable: 'act-boss';
}

const DEFINITIONS: Readonly<Record<BossId, BossDefinition>> = {
  'record-devourer': {
    bossId: 'record-devourer', displayName: '기록 포식자', silhouetteKey: 'enemy-boss', paletteKey: 'devourer',
    telegraphStyle: 'devour', defeatSequence: 'release-records', rewardTable: 'act-boss',
    phaseDefinitions: [
      { id: 1, displayName: '제1형 · 삼키는 기록', signaturePattern: 'devouring-volley', guide: '멎는다 · 탄환을 멈춰 되받아쳐라', healthScale: .34, minimumActiveMs: 1800 },
      { id: 2, displayName: '제2형 · 먹물의 기억', signaturePattern: 'ink-memory', guide: '되돌린다 · 지연 공격을 역행하라', healthScale: .33, minimumActiveMs: 2200 },
      { id: 3, displayName: '제3형 · 이어진 굶주림', signaturePattern: 'linked-hunger', guide: '잇는다 · 소환체와 포식자를 이어라', healthScale: .33, minimumActiveMs: 4200 },
    ],
  },
  'record-editor': {
    bossId: 'record-editor', displayName: '기록 편집자', silhouetteKey: 'enemy-boss-editor', paletteKey: 'editor',
    telegraphStyle: 'correction', defeatSequence: 'assemble-pages', rewardTable: 'act-boss',
    phaseDefinitions: [
      { id: 1, displayName: '제1형 · 교정', signaturePattern: 'correction-lines', guide: '교정 · 기록 탄환을 패링하라', healthScale: .38, minimumActiveMs: 2000 },
      { id: 2, displayName: '제2형 · 삭제', signaturePattern: 'past-erasure', guide: '삭제 · 과거 위치를 되돌려 기회를 만들라', healthScale: .40, minimumActiveMs: 2600 },
      { id: 3, displayName: '제3형 · 재편', signaturePattern: 'archive-reassembly', guide: '재편 · 파편을 이어 핵과 봉합을 절단하라', healthScale: .42, minimumActiveMs: 4200 },
    ],
  },
};

export function getBossDefinition(bossId: string): BossDefinition {
  const definition = DEFINITIONS[bossId as BossId];
  if (!definition) throw new Error(`[BossDefinition] Unknown bossId: ${bossId}`);
  return definition;
}

export interface BossPhaseSnapshot {
  phaseId: BossPhaseId;
  phaseHealth: number;
  phaseMaxHealth: number;
  signaturePatternExecuted: boolean;
  transitionLocked: boolean;
  phaseEnteredAt: number;
  phaseDamageReceived: number;
  skippedPhaseCount: number;
  defeated: boolean;
}

export interface BossDamageResult {
  appliedDamage: number;
  phaseCompleted: boolean;
  bossDefeated: boolean;
  nextPhase?: BossPhaseId;
}

/**
 * Keeps each phase on an independent health budget. Damage can finish at most
 * one phase and is held at one HP until that phase's representative pattern
 * has really started, so a high-damage build cannot erase the encounter's
 * combat grammar.
 */
export class BossPhaseIntegrity {
  private phaseIdValue: BossPhaseId = 1;
  private phaseHealthValue = 1;
  private phaseMaxHealthValue = 1;
  private signatureExecutedValue = false;
  private transitionLockedValue = false;
  private phaseEnteredAtValue = 0;
  private phaseDamageValue = 0;
  private skipped = 0;
  private defeatedValue = false;

  public constructor(private readonly definition: BossDefinition, private readonly baseHealth: number, now = 0) {
    this.enterPhase(1, now, false);
  }

  public applyDamage(amount: number, now = Number.POSITIVE_INFINITY): BossDamageResult {
    if (this.transitionLockedValue || this.defeatedValue || !Number.isFinite(amount) || amount <= 0) {
      return { appliedDamage: 0, phaseCompleted: false, bossDefeated: this.defeatedValue };
    }
    const phaseReady = this.signatureExecutedValue && now >= this.phaseEnteredAtValue + this.phaseDefinition().minimumActiveMs;
    const floor = phaseReady ? 0 : 1;
    const appliedDamage = Math.min(Math.max(0, amount), Math.max(0, this.phaseHealthValue - floor));
    this.phaseHealthValue = Math.max(floor, this.phaseHealthValue - appliedDamage);
    this.phaseDamageValue += appliedDamage;
    if (this.phaseHealthValue > 0 || !phaseReady) {
      return { appliedDamage, phaseCompleted: false, bossDefeated: false };
    }
    if (this.phaseIdValue === 3) {
      this.defeatedValue = true;
      return { appliedDamage, phaseCompleted: true, bossDefeated: true };
    }
    const nextPhase = (this.phaseIdValue + 1) as BossPhaseId;
    this.transitionLockedValue = true;
    return { appliedDamage, phaseCompleted: true, bossDefeated: false, nextPhase };
  }

  public markSignatureExecuted(): boolean {
    if (this.transitionLockedValue || this.defeatedValue || this.signatureExecutedValue) return false;
    this.signatureExecutedValue = true;
    return true;
  }

  public beginNextPhase(nextPhase: BossPhaseId, now: number): boolean {
    if (!this.transitionLockedValue || this.phaseHealthValue > 0 || nextPhase !== this.phaseIdValue + 1 || nextPhase > 3) {
      if (nextPhase > this.phaseIdValue + 1) this.skipped += nextPhase - this.phaseIdValue - 1;
      return false;
    }
    this.enterPhase(nextPhase, now, true);
    return true;
  }

  public unlockTransition(): void { this.transitionLockedValue = false; }

  public phaseDefinition(phase: BossPhaseId = this.phaseIdValue): BossPhaseDefinition {
    const definition = this.definition.phaseDefinitions[phase - 1];
    if (!definition || definition.id !== phase) throw new Error(`[BossDefinition] Unknown phase ${phase} for ${this.definition.bossId}`);
    return definition;
  }

  public snapshot(): BossPhaseSnapshot {
    return {
      phaseId: this.phaseIdValue,
      phaseHealth: this.phaseHealthValue,
      phaseMaxHealth: this.phaseMaxHealthValue,
      signaturePatternExecuted: this.signatureExecutedValue,
      transitionLocked: this.transitionLockedValue,
      phaseEnteredAt: this.phaseEnteredAtValue,
      phaseDamageReceived: this.phaseDamageValue,
      skippedPhaseCount: this.skipped,
      defeated: this.defeatedValue,
    };
  }

  private enterPhase(phase: BossPhaseId, now: number, keepTransitionLock: boolean): void {
    this.phaseIdValue = phase;
    const phaseDefinition = this.phaseDefinition(phase);
    this.phaseMaxHealthValue = Math.max(1, Math.round(this.baseHealth * phaseDefinition.healthScale));
    this.phaseHealthValue = this.phaseMaxHealthValue;
    this.signatureExecutedValue = false;
    this.transitionLockedValue = keepTransitionLock;
    this.phaseEnteredAtValue = now;
    this.phaseDamageValue = 0;
  }
}
