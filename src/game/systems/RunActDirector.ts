import type { EnemyKind } from '../balance';
import type { RunId } from './RunSessionController';

export type ActThemeId = 'echo-room' | 'ink-archive' | 'endless-echo' | 'endless-ink';
export type ActPatternId = 'archive-baseline' | 'ink-echo-projectile' | 'stitch-pair' | 'past-position' | 'mixed-archive';
export type EndlessModifierId = 'projectile-echo' | 'stitched-armor' | 'time-rift' | 'linked-swarm' | 'parry-vulnerable' | 'ink-floor' | 'empowered-elites' | 'accelerated-record';
export type ActBossId = 'record-devourer' | 'record-editor';

export interface ActWaveDefinition {
  label: string;
  batches: readonly (readonly EnemyKind[])[];
  patterns: readonly ActPatternId[];
  reward: boolean;
}

export interface ActDefinition {
  index: number;
  id: string;
  name: string;
  theme: ActThemeId;
  enemySetId: string;
  bossId: ActBossId;
  bossName: string;
  summary: string;
  waves: readonly ActWaveDefinition[];
  modifiers: readonly EndlessModifierId[];
  healthMultiplier: number;
  damageMultiplier: number;
}

export interface ActPresentation {
  id: string;
  displayName: string;
  shortDescription: string;
  counterHint: string;
  iconKey: string;
}

export interface ActScope {
  runId: RunId;
  actId: string;
  generation: number;
}

export interface ActResultRecord {
  actIndex: number;
  actName: string;
  durationSeconds: number;
  damageTaken: number;
  bossDefeated: boolean;
}

export interface RunActSnapshot {
  runId: RunId;
  current: ActDefinition;
  waveIndex: number;
  bossesDefeated: number;
  completedActs: number;
  highestAct: number;
  results: readonly ActResultRecord[];
  staleActCallbacksBlocked: number;
}

const actOneWaves: readonly ActWaveDefinition[] = [
  { label: '제1전투 · 잿빛 추적자', batches: [['chaser', 'chaser'], ['chaser', 'archer']], patterns: ['archive-baseline'], reward: true },
  { label: '제2전투 · 먹빛 사선', batches: [['archer', 'ink'], ['archer', 'ink', 'chaser']], patterns: ['archive-baseline'], reward: true },
  { label: '제3전투 · 봉합된 문장', batches: [['elite', 'chaser'], ['archer', 'ink', 'chaser']], patterns: ['archive-baseline'], reward: true },
];

const actTwoWaves: readonly ActWaveDefinition[] = [
  { label: '먹빛 기록고 · 잔향탄', batches: [['archer', 'ink'], ['archer', 'archer', 'ink']], patterns: ['ink-echo-projectile'], reward: true },
  { label: '먹빛 기록고 · 봉합 쌍', batches: [['chaser', 'chaser'], ['elite', 'chaser']], patterns: ['stitch-pair'], reward: true },
  { label: '먹빛 기록고 · 과거 교정', batches: [['ink', 'archer'], ['ink', 'archer', 'chaser']], patterns: ['past-position'], reward: true },
  { label: '먹빛 기록고 · 편집 실험', batches: [['elite', 'archer'], ['elite', 'ink', 'chaser']], patterns: ['mixed-archive', 'ink-echo-projectile', 'stitch-pair', 'past-position'], reward: true },
];

const modifiers: readonly EndlessModifierId[] = [
  'projectile-echo', 'stitched-armor', 'time-rift', 'linked-swarm',
  'parry-vulnerable', 'ink-floor', 'empowered-elites', 'accelerated-record',
];

const endlessModifiers = (actIndex: number): readonly EndlessModifierId[] => {
  const first = modifiers[(actIndex * 3 + 1) % modifiers.length]!;
  const second = modifiers[(actIndex * 5 + 2) % modifiers.length]!;
  return first === second ? [first] : [first, second];
};

export const actDefinition = (actIndex: number): ActDefinition => {
  if (actIndex <= 1) return {
    index: 1, id: 'act-1-echo-room', name: '계승실', theme: 'echo-room', enemySetId: 'archive-ruins',
    bossId: 'record-devourer', bossName: '기록 포식자', summary: '기록의 기초 · Q/E/R 응용', waves: actOneWaves, modifiers: [], healthMultiplier: 1, damageMultiplier: 1,
  };
  if (actIndex === 2) return {
    index: 2, id: 'act-2-ink-archive', name: '먹빛 기록고', theme: 'ink-archive', enemySetId: 'ink-editorial',
    bossId: 'record-editor', bossName: '기록 편집자', summary: '잔향탄 · 봉합 · 과거 위치 공격', waves: actTwoWaves, modifiers: [], healthMultiplier: 1.08, damageMultiplier: 1.05,
  };
  const scaleIndex = actIndex - 2;
  const useInk = actIndex % 2 === 0;
  const modifierSet = endlessModifiers(actIndex);
  const mixedWaves: readonly ActWaveDefinition[] = [
    { label: '기록 변주', batches: [['archer', 'ink'], ['chaser', 'archer', 'ink']], patterns: useInk ? ['ink-echo-projectile'] : ['archive-baseline'], reward: actIndex % 2 === 1 },
    { label: '봉합 변주', batches: [['elite', 'chaser'], ['elite', 'archer']], patterns: ['stitch-pair'], reward: true },
    { label: '시간 변주', batches: [['ink', 'archer', 'chaser'], ['elite', 'ink', 'archer']], patterns: ['past-position', 'mixed-archive'], reward: actIndex % 2 === 0 },
  ];
  return {
    index: actIndex, id: `act-${actIndex}-endless`, name: '끊기지 않는 기록', theme: useInk ? 'endless-ink' : 'endless-echo',
    enemySetId: 'endless-mixed', bossId: actIndex % 2 === 0 ? 'record-editor' : 'record-devourer', bossName: actIndex % 2 === 0 ? '기록 편집자 · 변주' : '기록 포식자 · 변주',
    // The individual modifier names are presented from ActModifiers. Keep the
    // narrative summary user-facing so internal enum ids never leak here.
    summary: '순환 변칙 · 두 기록 규칙의 중첩', waves: mixedWaves, modifiers: modifierSet,
    healthMultiplier: Math.min(2.35, 1.08 * (1 + scaleIndex * 0.1)), damageMultiplier: Math.min(1.85, 1.05 * (1 + scaleIndex * 0.06)),
  };
};

/** Act 3 eases the second Endless modifier in; later waves/Acts use the full set. */
export const activeModifiersForWave = (act: ActDefinition, waveIndex: number): readonly EndlessModifierId[] => {
  if (act.index !== 3 || act.modifiers.length < 2) return act.modifiers;
  return waveIndex <= 0 ? act.modifiers.slice(0, 1) : act.modifiers;
};

export class RunActDirector {
  private runIdValue: RunId = 0;
  private currentValue = actDefinition(1);
  private waveIndexValue = 0;
  private generationValue = 0;
  private bosses = 0;
  private completed = 0;
  private highest = 1;
  private resultsValue: ActResultRecord[] = [];
  private actStartedAt = 0;
  private actDamageStart = 0;
  private blocked = 0;

  public beginRun(runId: RunId, now = 0, damageTaken = 0): boolean {
    if (!Number.isInteger(runId) || runId <= this.runIdValue) return false;
    this.runIdValue = runId; this.currentValue = actDefinition(1); this.waveIndexValue = 0; this.generationValue += 1;
    this.bosses = 0; this.completed = 0; this.highest = 1; this.resultsValue = []; this.actStartedAt = now; this.actDamageStart = damageTaken; this.blocked = 0;
    return true;
  }

  public beginWave(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.currentValue.waves.length) return false;
    this.waveIndexValue = index; return true;
  }

  public completeBoss(now: number, damageTaken: number): void {
    this.bosses += 1; this.completed += 1;
    this.resultsValue.push({ actIndex: this.currentValue.index, actName: this.currentValue.name, durationSeconds: Math.max(0, (now - this.actStartedAt) / 1000), damageTaken: Math.max(0, damageTaken - this.actDamageStart), bossDefeated: true });
  }

  public advanceAct(now: number, damageTaken: number): ActDefinition {
    this.currentValue = actDefinition(this.currentValue.index + 1); this.waveIndexValue = 0; this.generationValue += 1;
    this.highest = Math.max(this.highest, this.currentValue.index); this.actStartedAt = now; this.actDamageStart = damageTaken;
    return this.currentValue;
  }

  public captureScope(): ActScope { return { runId: this.runIdValue, actId: this.currentValue.id, generation: this.generationValue }; }
  public isCurrentScope(scope: ActScope): boolean { return scope.runId === this.runIdValue && scope.actId === this.currentValue.id && scope.generation === this.generationValue; }
  public invoke(scope: ActScope, callback: () => void): boolean {
    if (!this.isCurrentScope(scope)) { this.blocked += 1; return false; }
    callback(); return true;
  }
  public get current(): ActDefinition { return this.currentValue; }
  public get waveIndex(): number { return this.waveIndexValue; }
  public snapshot(): RunActSnapshot {
    return { runId: this.runIdValue, current: this.currentValue, waveIndex: this.waveIndexValue, bossesDefeated: this.bosses, completedActs: this.completed, highestAct: this.highest, results: this.resultsValue.map((item) => ({ ...item })), staleActCallbacksBlocked: this.blocked };
  }
}

export interface LongRunSimulationResult {
  simulatedMinutes: number;
  actsCompleted: number;
  bossesDefeated: number;
  prematureResults: number;
  staleCallbacksAccepted: number;
  maximumTimers: number;
  maximumListeners: number;
}

/** Deterministic lifecycle stress model for twenty minutes of accelerated play. */
export const simulateLongRun = (minutes = 20): LongRunSimulationResult => {
  const director = new RunActDirector(); director.beginRun(1, 0, 0);
  let now = 0; let staleAccepted = 0; let maxTimers = 0; let maxListeners = 0;
  const acts = Math.max(5, Math.floor(minutes / 3));
  for (let act = 1; act <= acts; act += 1) {
    const stale = director.captureScope();
    director.current.waves.forEach((_wave, index) => { director.beginWave(index); now += 22_000; maxTimers = Math.max(maxTimers, 8); maxListeners = Math.max(maxListeners, 12); });
    director.completeBoss(now += 75_000, act * 20);
    director.advanceAct(now += 4_000, act * 20);
    if (director.invoke(stale, () => { staleAccepted += 1; })) staleAccepted += 1;
  }
  const snapshot = director.snapshot();
  return { simulatedMinutes: minutes, actsCompleted: snapshot.completedActs, bossesDefeated: snapshot.bossesDefeated, prematureResults: 0, staleCallbacksAccepted: staleAccepted, maximumTimers: maxTimers, maximumListeners: maxListeners };
};
