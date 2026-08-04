export type UpgradeRarity = '일반' | '희귀' | '전설';
export type UpgradeCategory = 'echo-blade' | 'cut-parry' | 'word' | 'survival' | 'generic';
export type UpgradeStackMode = 'additive' | 'unique';
import type { WordId } from '../systems/WordSystem';

export type UpgradeTriggerType =
  | 'echo-hit' | 'cut-hit' | 'dash-cut' | 'parry' | 'perfect-parry'
  | 'stop-end' | 'rewind' | 'link-death' | 'word-chain' | 'word-hit'
  | 'empowered-word' | 'first-hit' | 'reflected-projectile'
  | 'pull-end' | 'mark-explosion' | 'collision' | 'push-guard';

export type UpgradeId =
  | 'afterimage-slash' | 'dragon-fang' | 'broken-sentence' | 'regression-blade'
  | 'memory-echo' | 'link-overload' | 'inscription-spread' | 'perfect-breath'
  | 'ink-cloak' | 'sealed-sentence' | 'pursuit-mark' | 'fragment-recovery'
  | 'chain-breath' | 'stop-resonance' | 'backflow-shards' | 'regression-sword-shadow'
  | 'linked-counter' | 'unbroken-context' | 'dragon-rhythm' | 'echo-amplifier'
  | 'dual-moon-echo' | 'wide-orbit' | 'cut-sentence' | 'backflow-blade'
  | 'returning-scar' | 'isolation-chain'
  | 'perfect-counter' | 'counter-inscription' | 'link-contagion' | 'rewind-breath'
  | 'echo-harvest' | 'sentence-overcharge' | 'rupture-step'
  | 'gravity-inscription' | 'captured-projectile' | 'deep-mark'
  | 'contagious-mark' | 'recoil-ripple' | 'headwind-veil';

export type ResonanceId = 'moon-ring' | 'time-undertow' | 'counter-cut' | 'regression-chain'
  | 'compression-seal' | 'mark-chain' | 'reversal-burst';

export interface UpgradeIcon {
  glyph: string;
  color: string;
}

export interface UpgradeEffect {
  readonly [key: string]: number;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  category: UpgradeCategory;
  tag: string;
  tags: readonly string[];
  rarity: UpgradeRarity;
  maxStacks: number;
  stackMode: UpgradeStackMode;
  baseValues: UpgradeEffect;
  /** Compatibility alias. Runtime values and descriptions both originate from baseValues. */
  effect: UpgradeEffect;
  triggerTypes: readonly UpgradeTriggerType[];
  incompatibleIds: readonly UpgradeId[];
  synergyIds: readonly ResonanceId[];
  icon: UpgradeIcon;
  relatedKey: string;
  behaviorChange: boolean;
  active: boolean;
  survival?: boolean;
  requiredWordIds?: readonly WordId[];
  auditNote?: string;
}

export interface ResonanceDefinition {
  id: ResonanceId;
  name: string;
  requiredUpgradeIds: readonly [UpgradeId, UpgradeId];
  description: string;
  icon: UpgradeIcon;
}

interface UpgradeInput extends Omit<UpgradeDefinition, 'description' | 'tag' | 'stackMode' | 'effect' | 'incompatibleIds' | 'synergyIds' | 'active'> {
  incompatibleIds?: readonly UpgradeId[];
  synergyIds?: readonly ResonanceId[];
  active?: boolean;
  stackMode?: UpgradeStackMode;
}

const value = (upgrade: Pick<UpgradeDefinition, 'baseValues'> | Pick<UpgradeInput, 'baseValues'>, key: string): number => upgrade.baseValues[key] ?? 0;

function text(input: Pick<UpgradeDefinition, 'id' | 'baseValues' | 'maxStacks'>, stacks = 1): string {
  const n = (key: string): number => value(input, key);
  const stack = Math.max(1, Math.min(input.maxStacks, Math.floor(stacks)));
  switch (input.id) {
    case 'dual-moon-echo': return `잔향 칼날이 반대편에도 나타난다. 두 궤도의 합산 피해는 단일 칼날 대비 ${Math.round(n('combinedMultiplier') * 100)}%.`;
    case 'wide-orbit': return `잔향 칼날 반경 +${Math.round(n('range') * stack * 100)}%, 발동 간격 +${Math.round(n('interval') * stack * 100)}%.`;
    case 'cut-sentence': return `STOPPED 또는 LINKED 대상을 절단하면 상태별 파열 피해 ${n('damage') * stack}.`;
    case 'backflow-blade': return `잔향 칼날이 정지 탄환을 적에게 한 번 되돌린다. 역류 피해 ${Math.round(n('reflectedRatio') * 100)}%.`;
    case 'returning-scar': return `되돌린다 잔상이 추가 절단 ${stack}회, 각 ${Math.round(n('ratio') * 100)}% 피해로 재현.`;
    case 'isolation-chain': return `고립 연결의 절단·언령 피해 +${Math.round(n('bonus') * stack * 100)}%, 사망 폭발 +${n('explosion') * stack}.`;
    case 'chain-breath': return `언령 연계 성공 시 문장력 ${n('sentence') * stack}, Q/E/R 남은 쿨다운 ${(n('cooldown') * stack / 1000).toFixed(1)}초 감소.`;
    case 'stop-resonance': return `멎는다 종료 시 STOPPED 대상이 피해 ${n('damage') * stack}와 ${(n('slowDuration') / 1000).toFixed(2)}초 감속 파동을 1회 방출.`;
    case 'perfect-counter': return `완벽 패링 시 J 절단 즉시 준비. 다음 절단 범위 +${Math.round(n('rangeBonus') * 100)}%, 파열 피해 +${n('ruptureBonus')}.`;
    case 'counter-inscription': return `패링한 공격자에게 ${(n('duration') / 1000).toFixed(1)}초 반격 비문. J·언령 적중 시 추가 파열 ${n('damage') * stack}.`;
    case 'link-contagion': return `LINKED 적 사망 시 가까운 적 최대 ${n('targets')}명에게 ${(n('duration') / 1000).toFixed(1)}초 1세대 연결 전염.`;
    case 'rewind-breath': return `되돌린다가 실제 회복한 체력의 ${Math.round(n('ratio') * stack * 100)}% 추가 회복.`;
    case 'echo-harvest': return `잔향 칼날이 STOPPED·LINKED 적중 시 문장력 ${n('sentence') * stack}. 초당 최대 ${n('capPerSecond') * stack}.`;
    case 'ink-cloak': return `각 일반 전투 첫 피격 피해 -${Math.round(n('reduction') * stack * 100)}% (최소 ${Math.round(n('minimumMultiplier') * 100)}% 피해).`;
    case 'sentence-overcharge': return `F 강화 언령이 유효하게 적용되면 핵심 피해·지속 효과를 ${Math.round(n('bonus') * 100)}% 추가 강화.`;
    case 'rupture-step': return `대시 후 ${(n('window') / 1000).toFixed(1)}초 내 J 절단이 전방 파동 피해 ${n('damage') * stack}를 추가한다.`;
    case 'sealed-sentence': return `언령 재사용 대기시간 -${Math.round(n('cooldownReduction') * stack * 100)}%, 언령 적중 문장력 +${Math.round(n('gainBonus') * stack * 100)}%.`;
    case 'fragment-recovery': return `반사 탄환 적중 시 체력 ${n('heal') * stack} 회복.`;
    case 'gravity-inscription': return `당긴다 범위 +${Math.round(n('range') * stack * 100)}%, 지속 +${Math.round(n('duration') * stack)}ms. 종료 시 압축 파동 피해 ${n('damage') * stack}.`;
    case 'captured-projectile': return `당긴다가 포획한 탄환을 최대 ${n('count') * stack}개까지 적에게 방출한다.`;
    case 'deep-mark': return `각인 최대 스택 +${n('stacks') * stack}, 각인 폭발 피해 +${n('damage') * stack}.`;
    case 'contagious-mark': return `각인 대상 사망 시 가까운 적 ${n('targets')}명에게 ${Math.round(n('duration'))}ms 각인을 전염한다.`;
    case 'recoil-ripple': return `밀려난 적의 충돌 시 파동 피해 ${n('damage') * stack}, 반경 ${n('radius')}.`;
    case 'headwind-veil': return `밀어낸다 후 ${Math.round(n('duration'))}ms 동안 받는 피해 -${Math.round(n('reduction') * stack * 100)}%.`;
    case 'afterimage-slash': return `비활성: 파열의 발걸음으로 통합됨.`;
    case 'dragon-fang': return `비활성: 반복 절단 치명타는 상태 절단 역할과 충돌함.`;
    case 'broken-sentence': return `비활성: 절단 문장으로 통합됨.`;
    case 'regression-blade': return `비활성: 회귀의 칼자국으로 통합됨.`;
    case 'memory-echo': return `비활성: 회귀의 칼자국으로 통합됨.`;
    case 'link-overload': return `비활성: 고립의 사슬과 연결 전염으로 통합됨.`;
    case 'inscription-spread': return `비활성: 연결 전염으로 대체됨.`;
    case 'perfect-breath': return `비활성: 완벽한 반격으로 대체됨.`;
    case 'pursuit-mark': return `비활성: 제거된 자동 대상 고정을 전제로 함.`;
    case 'backflow-shards': return `비활성: 시간 역조 공명으로 통합됨.`;
    case 'regression-sword-shadow': return `비활성: 회귀의 칼자국으로 통합됨.`;
    case 'linked-counter': return `비활성: 반격 비문으로 대체됨.`;
    case 'unbroken-context': return `비활성: 연문의 숨과 역할이 중복됨.`;
    case 'dragon-rhythm': return `비활성: 잔향 수확과 역할이 중복됨.`;
    case 'echo-amplifier': return `비활성: 문장 과충전으로 대체됨.`;
  }
}

function define(input: UpgradeInput): UpgradeDefinition {
  const definition: UpgradeDefinition = {
    ...input,
    tag: input.tags.join(' / '),
    stackMode: input.stackMode ?? (input.maxStacks === 1 ? 'unique' : 'additive'),
    effect: input.baseValues,
    incompatibleIds: input.incompatibleIds ?? [],
    synergyIds: input.synergyIds ?? [],
    active: input.active ?? true,
    description: '',
  };
  definition.description = text(definition);
  return definition;
}

const active = (input: Omit<UpgradeInput, 'active'>): UpgradeDefinition => define({ ...input, active: true });
const inactive = (input: Omit<UpgradeInput, 'active' | 'behaviorChange' | 'icon' | 'triggerTypes'> & { auditNote: string }): UpgradeDefinition => define({
  ...input, active: false, behaviorChange: false, triggerTypes: [], icon: { glyph: '×', color: '#6e7774' },
});

export const RESONANCES: readonly ResonanceDefinition[] = [
  { id: 'moon-ring', name: '월환 공명', requiredUpgradeIds: ['dual-moon-echo', 'wide-orbit'], description: '두 칼날이 반대 궤도로 회전하며 4회 적중마다 제한된 원형 파동을 낸다.', icon: { glyph: '雙', color: '#89ead8' } },
  { id: 'time-undertow', name: '시간 역조', requiredUpgradeIds: ['backflow-blade', 'stop-resonance'], description: '멎는다 종료 시 정지 탄환 일부가 원래 발사자에게 한 번 역류한다.', icon: { glyph: '逆', color: '#73d6e8' } },
  { id: 'counter-cut', name: '반격 절문', requiredUpgradeIds: ['perfect-counter', 'cut-sentence'], description: '완벽 패링 직후 절단은 상태가 없어도 작은 비문 파열을 일으킨다.', icon: { glyph: '斷', color: '#b4f3db' } },
  { id: 'regression-chain', name: '회귀 사슬', requiredUpgradeIds: ['returning-scar', 'isolation-chain'], description: '되돌린다 잔상 절단이 고립 연결에 강해지고 다중 연결에는 일부 공유된다.', icon: { glyph: '廻', color: '#68cde2' } },
  { id: 'compression-seal', name: '압축 인장', requiredUpgradeIds: ['gravity-inscription', 'stop-resonance'], description: '당긴다 종료 시 압축 대상에 짧은 정지 파동이 발생한다.', icon: { glyph: '壓', color: '#8edfd4' } },
  { id: 'mark-chain', name: '각인 사슬', requiredUpgradeIds: ['deep-mark', 'link-contagion'], description: '연결된 대상 사이로 각인 스택이 한 번 공유된다.', icon: { glyph: '刻', color: '#a1e8ce' } },
  { id: 'reversal-burst', name: '반전 폭발', requiredUpgradeIds: ['captured-projectile', 'recoil-ripple'], description: '압축 폭발 시 포획 탄환과 충돌 파동이 함께 방출된다.', icon: { glyph: '反', color: '#88d8e9' } },
] as const;

export const UPGRADES: readonly UpgradeDefinition[] = [
  active({ id: 'dual-moon-echo', name: '쌍월의 잔향', category: 'echo-blade', tags: ['weapon', 'echo-blade', 'orbit'], rarity: '희귀', maxStacks: 1, relatedKey: '잔향 칼날', baseValues: { combinedMultiplier: 1.36, bladeMultiplier: .68 }, triggerTypes: ['echo-hit'], synergyIds: ['moon-ring'], icon: { glyph: '雙', color: '#86e5d2' }, behaviorChange: true }),
  active({ id: 'wide-orbit', name: '넓은 궤도', category: 'echo-blade', tags: ['weapon', 'echo-blade', 'orbit'], rarity: '일반', maxStacks: 2, relatedKey: '잔향 칼날', baseValues: { range: .22, interval: .12 }, triggerTypes: ['echo-hit'], synergyIds: ['moon-ring'], icon: { glyph: '環', color: '#78d8c8' }, behaviorChange: true }),
  active({ id: 'cut-sentence', name: '절단 문장', category: 'cut-parry', tags: ['weapon', 'cut', 'stop', 'link'], rarity: '희귀', maxStacks: 2, relatedKey: 'J · Q · R', baseValues: { damage: 9 }, triggerTypes: ['cut-hit'], synergyIds: ['counter-cut'], icon: { glyph: '斷', color: '#a3f1de' }, behaviorChange: true }),
  active({ id: 'backflow-blade', name: '역류 칼날', category: 'echo-blade', tags: ['weapon', 'echo-blade', 'projectile', 'stop'], rarity: '전설', maxStacks: 1, relatedKey: '잔향 칼날 · Q', baseValues: { reflectedRatio: .65 }, triggerTypes: ['echo-hit'], synergyIds: ['time-undertow'], icon: { glyph: '逆', color: '#72d6e5' }, behaviorChange: true }),
  active({ id: 'returning-scar', name: '회귀의 칼자국', category: 'word', tags: ['weapon', 'rewind', 'cut'], rarity: '희귀', maxStacks: 2, relatedKey: 'E', baseValues: { ratio: .42 }, triggerTypes: ['rewind'], synergyIds: ['regression-chain'], icon: { glyph: '廻', color: '#69cce4' }, behaviorChange: true }),
  active({ id: 'isolation-chain', name: '고립의 사슬', category: 'word', tags: ['weapon', 'link', 'isolation'], rarity: '희귀', maxStacks: 2, relatedKey: 'R', baseValues: { bonus: .1, explosion: 12 }, triggerTypes: ['cut-hit', 'word-hit', 'link-death'], synergyIds: ['regression-chain'], icon: { glyph: '孤', color: '#90e5cc' }, behaviorChange: true }),
  active({ id: 'chain-breath', name: '연문의 숨', category: 'word', tags: ['word', 'chain', 'resource'], rarity: '희귀', maxStacks: 2, relatedKey: 'Q · E · R', baseValues: { sentence: 12, cooldown: 400 }, triggerTypes: ['word-chain'], icon: { glyph: '聯', color: '#8ce7d5' }, behaviorChange: true }),
  active({ id: 'stop-resonance', name: '정지 공명', category: 'word', tags: ['word', 'stop', 'pulse'], rarity: '희귀', maxStacks: 2, relatedKey: 'Q', baseValues: { damage: 9, slowDuration: 650, radius: 76 }, triggerTypes: ['stop-end'], synergyIds: ['time-undertow'], icon: { glyph: '止', color: '#83dccd' }, behaviorChange: true }),
  active({ id: 'perfect-counter', name: '완벽한 반격', category: 'cut-parry', tags: ['parry', 'cut', 'counter'], rarity: '희귀', maxStacks: 1, relatedKey: 'K · Shift → J', baseValues: { rangeBonus: .28, ruptureBonus: 16, duration: 2600 }, triggerTypes: ['perfect-parry', 'cut-hit'], synergyIds: ['counter-cut'], icon: { glyph: '返', color: '#b1f2d9' }, behaviorChange: true }),
  active({ id: 'counter-inscription', name: '반격 비문', category: 'cut-parry', tags: ['parry', 'mark', 'cut', 'word'], rarity: '희귀', maxStacks: 2, relatedKey: 'K · Shift → J/Q/E/R', baseValues: { duration: 4000, damage: 11 }, triggerTypes: ['parry', 'cut-hit', 'word-hit'], icon: { glyph: '標', color: '#9debd4' }, behaviorChange: true }),
  active({ id: 'link-contagion', name: '연결 전염', category: 'word', tags: ['word', 'link', 'spread'], rarity: '전설', maxStacks: 1, relatedKey: 'R', baseValues: { targets: 2, duration: 2400, generations: 1 }, triggerTypes: ['link-death'], icon: { glyph: '傳', color: '#78d9bd' }, behaviorChange: true }),
  active({ id: 'rewind-breath', name: '되감긴 숨', category: 'survival', tags: ['rewind', 'survival', 'healing'], rarity: '일반', maxStacks: 2, relatedKey: 'E', survival: true, baseValues: { ratio: .28 }, triggerTypes: ['rewind'], icon: { glyph: '息', color: '#80d7e8' }, behaviorChange: true }),
  active({ id: 'echo-harvest', name: '잔향 수확', category: 'echo-blade', tags: ['echo-blade', 'resource', 'stop', 'link'], rarity: '일반', maxStacks: 2, relatedKey: '잔향 칼날', baseValues: { sentence: 1.5, capPerSecond: 6 }, triggerTypes: ['echo-hit'], icon: { glyph: '收', color: '#86e0ce' }, behaviorChange: true }),
  active({ id: 'ink-cloak', name: '먹빛 망토', category: 'survival', tags: ['survival', 'first-hit'], rarity: '일반', maxStacks: 2, relatedKey: '피격', survival: true, baseValues: { reduction: .35, minimumMultiplier: .4 }, triggerTypes: ['first-hit'], icon: { glyph: '墨', color: '#819994' }, behaviorChange: true }),
  active({ id: 'sentence-overcharge', name: '문장 과충전', category: 'word', tags: ['empower', 'word'], rarity: '전설', maxStacks: 1, relatedKey: 'F → Q/E/R', baseValues: { bonus: .35, durationBonus: 500 }, triggerTypes: ['empowered-word'], icon: { glyph: '極', color: '#b8f0d4' }, behaviorChange: true }),
  active({ id: 'rupture-step', name: '파열의 발걸음', category: 'cut-parry', tags: ['dash', 'cut', 'wave'], rarity: '희귀', maxStacks: 2, relatedKey: 'Space → J', baseValues: { window: 1800, damage: 10, range: 142 }, triggerTypes: ['dash-cut'], icon: { glyph: '步', color: '#9ae5d1' }, behaviorChange: true }),
  active({ id: 'sealed-sentence', name: '봉인된 문장', category: 'generic', tags: ['resource', 'word', 'cooldown'], rarity: '일반', maxStacks: 3, relatedKey: 'Q · E · R', baseValues: { cooldownReduction: .06, gainBonus: .15 }, triggerTypes: ['word-hit'], icon: { glyph: '封', color: '#9ac8bd' }, behaviorChange: false }),
  active({ id: 'fragment-recovery', name: '파편 회수', category: 'survival', tags: ['projectile', 'survival', 'healing'], rarity: '희귀', maxStacks: 2, relatedKey: 'K · Q', survival: true, baseValues: { heal: 4 }, triggerTypes: ['reflected-projectile'], icon: { glyph: '片', color: '#82cfc0' }, behaviorChange: true }),
  active({ id: 'gravity-inscription', name: '중력 비문', category: 'word', tags: ['word', 'pull', 'compressed'], rarity: '희귀', maxStacks: 2, relatedKey: '당긴다', requiredWordIds: ['pull'], baseValues: { range: .14, duration: 180, damage: 8 }, triggerTypes: ['pull-end'], synergyIds: ['compression-seal'], icon: { glyph: '引', color: '#82d8d1' }, behaviorChange: true }),
  active({ id: 'captured-projectile', name: '포획된 탄환', category: 'word', tags: ['word', 'pull', 'projectile'], rarity: '전설', maxStacks: 1, relatedKey: '당긴다', requiredWordIds: ['pull'], baseValues: { count: 4, damageRatio: .7 }, triggerTypes: ['pull-end', 'reflected-projectile'], synergyIds: ['reversal-burst'], icon: { glyph: '捕', color: '#7bd7e7' }, behaviorChange: true }),
  active({ id: 'deep-mark', name: '깊은 각인', category: 'word', tags: ['word', 'mark', 'burst'], rarity: '희귀', maxStacks: 2, relatedKey: '새긴다', requiredWordIds: ['mark'], baseValues: { stacks: 1, damage: 10 }, triggerTypes: ['mark-explosion'], synergyIds: ['mark-chain'], icon: { glyph: '深', color: '#9fe1c9' }, behaviorChange: true }),
  active({ id: 'contagious-mark', name: '전염 각인', category: 'word', tags: ['word', 'mark', 'spread'], rarity: '희귀', maxStacks: 1, relatedKey: '새긴다', requiredWordIds: ['mark'], baseValues: { targets: 2, duration: 3200 }, triggerTypes: ['mark-explosion', 'link-death'], icon: { glyph: '染', color: '#a4dfc2' }, behaviorChange: true }),
  active({ id: 'recoil-ripple', name: '반동 파문', category: 'word', tags: ['word', 'push', 'collision'], rarity: '희귀', maxStacks: 2, relatedKey: '밀어낸다', requiredWordIds: ['push'], baseValues: { damage: 9, radius: 68 }, triggerTypes: ['collision'], synergyIds: ['reversal-burst'], icon: { glyph: '震', color: '#93d9e8' }, behaviorChange: true }),
  active({ id: 'headwind-veil', name: '역풍 장막', category: 'survival', tags: ['word', 'push', 'survival'], rarity: '일반', maxStacks: 2, relatedKey: '밀어낸다', requiredWordIds: ['push'], survival: true, baseValues: { reduction: .14, duration: 1300 }, triggerTypes: ['push-guard', 'reflected-projectile'], icon: { glyph: '幕', color: '#91cbd8' }, behaviorChange: true }),

  inactive({ id: 'afterimage-slash', name: '잔상 베기', category: 'cut-parry', tags: ['blade', 'dash'], rarity: '희귀', maxStacks: 2, relatedKey: 'Space', baseValues: { damageRatio: .45, perStack: .18 }, auditNote: '파열의 발걸음으로 통합' }),
  inactive({ id: 'dragon-fang', name: '용의 이빨', category: 'cut-parry', tags: ['blade'], rarity: '희귀', maxStacks: 3, relatedKey: 'J', baseValues: { chance: .22, multiplier: 1.75 }, auditNote: '상태 절단의 역할을 흐리는 무조건 치명타' }),
  inactive({ id: 'broken-sentence', name: '부서진 문장', category: 'cut-parry', tags: ['stop', 'blade'], rarity: '일반', maxStacks: 3, relatedKey: 'Q · J', baseValues: { damage: 12 }, auditNote: '절단 문장과 중복' }),
  inactive({ id: 'regression-blade', name: '역행의 칼날', category: 'word', tags: ['rewind', 'blade'], rarity: '희귀', maxStacks: 2, relatedKey: 'E · J', baseValues: { bonus: .55 }, auditNote: '회귀의 칼자국과 중복' }),
  inactive({ id: 'memory-echo', name: '기억의 잔상', category: 'word', tags: ['rewind'], rarity: '전설', maxStacks: 2, relatedKey: 'E', baseValues: { power: .22 }, auditNote: '회귀의 칼자국에 통합' }),
  inactive({ id: 'link-overload', name: '연결 과부하', category: 'word', tags: ['link'], rarity: '희귀', maxStacks: 3, relatedKey: 'R', baseValues: { baseRadius: 76, radiusPerStack: 24, baseDamage: 22, damagePerStack: 12 }, auditNote: '고립의 사슬로 통합' }),
  inactive({ id: 'inscription-spread', name: '비문 전염', category: 'word', tags: ['link'], rarity: '전설', maxStacks: 1, relatedKey: 'R', baseValues: { duration: 2000 }, auditNote: '연결 전염으로 대체' }),
  inactive({ id: 'perfect-breath', name: '완벽한 호흡', category: 'cut-parry', tags: ['parry'], rarity: '일반', maxStacks: 2, relatedKey: 'K · Shift', baseValues: { window: 22, sentence: 5 }, auditNote: '완벽한 반격으로 대체' }),
  inactive({ id: 'pursuit-mark', name: '추격의 각인', category: 'cut-parry', tags: ['blade', 'target'], rarity: '일반', maxStacks: 3, relatedKey: 'J', baseValues: { perHit: .08, maxHits: 5 }, auditNote: '자동 대상 고정 폐기' }),
  inactive({ id: 'backflow-shards', name: '역류 파편', category: 'word', tags: ['stop', 'rewind', 'projectile'], rarity: '전설', maxStacks: 1, relatedKey: 'Q → E', baseValues: { count: 2, ratio: .4 }, auditNote: '시간 역조 공명으로 통합' }),
  inactive({ id: 'regression-sword-shadow', name: '회귀 검영', category: 'word', tags: ['rewind', 'blade'], rarity: '희귀', maxStacks: 2, relatedKey: 'E · J', baseValues: { baseRatio: .45, perStack: .18 }, auditNote: '회귀의 칼자국으로 통합' }),
  inactive({ id: 'linked-counter', name: '이어진 반격', category: 'cut-parry', tags: ['parry', 'link'], rarity: '희귀', maxStacks: 2, relatedKey: 'K → R → J', baseValues: { duration: 4000, share: .18 }, auditNote: '반격 비문으로 대체' }),
  inactive({ id: 'unbroken-context', name: '끊기지 않는 문맥', category: 'word', tags: ['parry', 'chain'], rarity: '전설', maxStacks: 1, relatedKey: 'K · Shift', baseValues: { extension: 600 }, auditNote: '연문의 숨과 역할 중복' }),
  inactive({ id: 'dragon-rhythm', name: '용의 박자', category: 'generic', tags: ['blade', 'resource'], rarity: '일반', maxStacks: 2, relatedKey: 'J', baseValues: { sentence: 4, cooldown: 500 }, auditNote: '잔향 수확과 역할 중복' }),
  inactive({ id: 'echo-amplifier', name: '잔향 증폭', category: 'word', tags: ['chain', 'word'], rarity: '전설', maxStacks: 2, relatedKey: 'Q · E · R', baseValues: { window: 5000, bonus: .18 }, auditNote: '문장 과충전으로 대체' }),
] as const;

export const ACTIVE_UPGRADES: readonly UpgradeDefinition[] = UPGRADES.filter((upgrade) => upgrade.active);

export function upgradeById(id: string): UpgradeDefinition | undefined { return UPGRADES.find((upgrade) => upgrade.id === id); }
export function resonanceById(id: string): ResonanceDefinition | undefined { return RESONANCES.find((resonance) => resonance.id === id); }
export function upgradeDescription(upgrade: UpgradeDefinition, stacks = 1): string { return text(upgrade, stacks); }
