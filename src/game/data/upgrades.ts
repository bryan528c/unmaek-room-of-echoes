export type UpgradeRarity = '일반' | '희귀' | '전설';

export type UpgradeId =
  | 'afterimage-slash' | 'dragon-fang' | 'broken-sentence' | 'regression-blade'
  | 'memory-echo' | 'link-overload' | 'inscription-spread' | 'perfect-breath'
  | 'ink-cloak' | 'sealed-sentence' | 'pursuit-mark' | 'fragment-recovery'
  | 'chain-breath' | 'stop-resonance' | 'backflow-shards' | 'regression-sword-shadow'
  | 'linked-counter' | 'unbroken-context' | 'dragon-rhythm' | 'echo-amplifier'
  | 'dual-moon-echo' | 'wide-orbit' | 'cut-sentence' | 'backflow-blade'
  | 'returning-scar' | 'isolation-chain';

export interface UpgradeEffect {
  readonly [key: string]: number;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  tag: string;
  tags: readonly string[];
  rarity: UpgradeRarity;
  maxStacks: number;
  stackMode: 'additive' | 'unique';
  relatedKey: string;
  effect: UpgradeEffect;
  survival?: boolean;
}

type UpgradeInput = Omit<UpgradeDefinition, 'description' | 'tag' | 'stackMode'>;

function text(input: UpgradeInput, stacks = 1): string {
  const n = (key: string): number => input.effect[key] ?? 0; const stack = Math.max(1, stacks);
  switch (input.id) {
    case 'afterimage-slash': return `대시 경로에 기본 피해의 ${Math.round((n('damageRatio') + n('perStack') * (stack - 1)) * 100)}% 지연 참격을 남긴다.`;
    case 'dragon-fang': return `절단 치명타 확률 +${Math.round(Math.min(.55, n('chance') * stack) * 100)}% (피해 ${n('multiplier').toFixed(2)}배).`;
    case 'broken-sentence': return `STOPPED 대상을 절단하면 파열 피해 +${n('damage') * stack}.`;
    case 'regression-blade': return `되돌린다 뒤 첫 절단 피해 +${Math.round(n('bonus') * stack * 100)}%.`;
    case 'memory-echo': return `되돌린다 잔상 공격 배율 +${Math.round(n('power') * stack * 100)}%.`;
    case 'link-overload': return `연결 사망 폭발 피해 ${n('baseDamage') + n('damagePerStack') * stack}, 반경 ${n('baseRadius') + n('radiusPerStack') * stack}.`;
    case 'inscription-spread': return `연결 사망 폭발이 가까운 적 하나를 ${n('duration') / 1000}초간 연결한다.`;
    case 'perfect-breath': return `패링 판정 +${n('window') * stack}ms, 성공 문장력 +${n('sentence') * stack}.`;
    case 'ink-cloak': return `전투 첫 피격 피해 -${Math.round(n('reduction') * stack * 100)}% (최소 ${Math.round(n('minimumMultiplier') * 100)}% 피해).`;
    case 'sealed-sentence': return `언령 재사용 대기시간 -${Math.round(n('cooldownReduction') * stack * 100)}%, 언령 적중 문장력 +${Math.round(n('gainBonus') * stack * 100)}%.`;
    case 'pursuit-mark': return `같은 적에게 연속 절단 적중 시 피해 +${Math.round(n('perHit') * stack * 100)}% (최대 ${n('maxHits')}회).`;
    case 'fragment-recovery': return `반사 탄환 적중 시 체력 ${n('heal') * stack} 회복.`;
    case 'chain-breath': return `연쇄 성공 시 문장력 ${n('sentence') * stack} 회복, 모든 언령 쿨다운 ${(n('cooldown') * stack / 1000).toFixed(1)}초 감소.`;
    case 'stop-resonance': return `연쇄 정지 대상이 피해 ${n('damage') * stack}와 ${n('slowDuration') / 1000}초 감속 파동을 1회 방출.`;
    case 'backflow-shards': return `역류 탄환 적중 시 피해 ${Math.round(n('ratio') * 100)}% 파편 ${n('count')}개로 분열.`;
    case 'regression-sword-shadow': return `되돌린다 종료 후 최근 절단을 최대 3회, ${Math.round((n('baseRatio') + n('perStack') * (stack - 1)) * 100)}% 피해로 재현.`;
    case 'linked-counter': return `완벽 패링 표식 대상을 절단하면 ${Math.round(n('share') * stack * 100)}%를 연결 대상에게 전달.`;
    case 'unbroken-context': return `연쇄 대기 중 완벽 패링 시 연쇄 시간을 ${n('extension') / 1000}초 한 번 연장.`;
    case 'dragon-rhythm': return `상태가 있는 적을 절단하면 문장력 ${n('sentence') * stack}, 가장 짧은 언령 쿨다운 ${(n('cooldown') * stack / 1000).toFixed(1)}초 감소.`;
    case 'echo-amplifier': return `연쇄 성공 후 ${(n('window') * stack) / 1000}초 내 다음 언령을 강화한다.`;
    case 'dual-moon-echo': return `잔향 칼날이 반대편에도 나타난다. 두 궤도의 합산 피해 +${Math.round((n('combinedMultiplier') - 1) * 100)}%.`;
    case 'wide-orbit': return `잔향 칼날 범위 +${Math.round(n('range') * stack * 100)}%, 발동 간격 +${Math.round(n('interval') * stack * 100)}%.`;
    case 'cut-sentence': return `STOPPED 또는 LINKED 대상을 절단하면 파열 피해 ${n('damage') * stack}.`;
    case 'backflow-blade': return `잔향 칼날이 닿은 정지 탄환을 적에게 한 번 되돌린다.`;
    case 'returning-scar': return `되돌린다 잔상이 추가 절단 ${stack}회, 각 ${Math.round(n('ratio') * 100)}% 피해로 재현.`;
    case 'isolation-chain': return `고립 연결 피해 증가 +${Math.round(n('bonus') * stack * 100)}%, 폭발 피해 +${n('explosion') * stack}.`;
  }
}

function define(input: UpgradeInput): UpgradeDefinition {
  return { ...input, tag: input.tags.join(' / '), stackMode: input.maxStacks === 1 ? 'unique' : 'additive', description: text(input) };
}

export const UPGRADES: readonly UpgradeDefinition[] = [
  define({ id: 'afterimage-slash', name: '잔상 베기', tags: ['blade', 'dash'], rarity: '희귀', maxStacks: 2, relatedKey: 'Space', effect: { damageRatio: .45, perStack: .18 } }),
  define({ id: 'dragon-fang', name: '용의 이빨', tags: ['blade'], rarity: '희귀', maxStacks: 3, relatedKey: 'J', effect: { chance: .22, multiplier: 1.75 } }),
  define({ id: 'broken-sentence', name: '부서진 문장', tags: ['stop', 'blade'], rarity: '일반', maxStacks: 3, relatedKey: 'Q · J', effect: { damage: 12 } }),
  define({ id: 'regression-blade', name: '역행의 칼날', tags: ['rewind', 'blade'], rarity: '희귀', maxStacks: 2, relatedKey: 'E · J', effect: { bonus: .55 } }),
  define({ id: 'memory-echo', name: '기억의 잔상', tags: ['rewind'], rarity: '전설', maxStacks: 2, relatedKey: 'E', effect: { power: .22 } }),
  define({ id: 'link-overload', name: '연결 과부하', tags: ['link'], rarity: '희귀', maxStacks: 3, relatedKey: 'R', effect: { baseRadius: 76, radiusPerStack: 24, baseDamage: 22, damagePerStack: 12 } }),
  define({ id: 'inscription-spread', name: '비문 전염', tags: ['link'], rarity: '전설', maxStacks: 1, relatedKey: 'R', effect: { duration: 2000 } }),
  define({ id: 'perfect-breath', name: '완벽한 호흡', tags: ['parry'], rarity: '일반', maxStacks: 2, relatedKey: 'K · Shift', effect: { window: 22, sentence: 5 } }),
  define({ id: 'ink-cloak', name: '먹빛 망토', tags: ['survival'], rarity: '일반', maxStacks: 2, relatedKey: '피격', survival: true, effect: { reduction: .35, minimumMultiplier: .4 } }),
  define({ id: 'sealed-sentence', name: '봉인된 문장', tags: ['resource', 'word'], rarity: '희귀', maxStacks: 3, relatedKey: 'Q · E · R', effect: { cooldownReduction: .06, gainBonus: .15 } }),
  define({ id: 'pursuit-mark', name: '추격의 각인', tags: ['blade', 'target'], rarity: '일반', maxStacks: 3, relatedKey: 'J', effect: { perHit: .08, maxHits: 5 } }),
  define({ id: 'fragment-recovery', name: '파편 회수', tags: ['projectile', 'survival'], rarity: '희귀', maxStacks: 2, relatedKey: 'K · Q', survival: true, effect: { heal: 4 } }),
  define({ id: 'chain-breath', name: '연문의 숨', tags: ['chain', 'resource'], rarity: '희귀', maxStacks: 2, relatedKey: 'Q · E · R', effect: { sentence: 12, cooldown: 400 } }),
  define({ id: 'stop-resonance', name: '정지 공명', tags: ['stop', 'link', 'chain'], rarity: '희귀', maxStacks: 2, relatedKey: 'R → Q', effect: { damage: 9, slowDuration: 650 } }),
  define({ id: 'backflow-shards', name: '역류 파편', tags: ['stop', 'rewind', 'projectile'], rarity: '전설', maxStacks: 1, relatedKey: 'Q → E', effect: { count: 2, ratio: .4 } }),
  define({ id: 'regression-sword-shadow', name: '회귀 검영', tags: ['rewind', 'blade'], rarity: '희귀', maxStacks: 2, relatedKey: 'E · J', effect: { baseRatio: .45, perStack: .18 } }),
  define({ id: 'linked-counter', name: '이어진 반격', tags: ['parry', 'link'], rarity: '희귀', maxStacks: 2, relatedKey: 'K → R → J', effect: { duration: 4000, share: .18 } }),
  define({ id: 'unbroken-context', name: '끊기지 않는 문맥', tags: ['parry', 'chain'], rarity: '전설', maxStacks: 1, relatedKey: 'K · Shift', effect: { extension: 600 } }),
  define({ id: 'dragon-rhythm', name: '용의 박자', tags: ['blade', 'resource'], rarity: '일반', maxStacks: 2, relatedKey: 'J', effect: { sentence: 4, cooldown: 500 } }),
  define({ id: 'echo-amplifier', name: '잔향 증폭', tags: ['chain', 'word'], rarity: '전설', maxStacks: 2, relatedKey: 'Q · E · R', effect: { window: 5000, bonus: .18 } }),
  define({ id: 'dual-moon-echo', name: '쌍월의 잔향', tags: ['weapon', 'echo-blade'], rarity: '희귀', maxStacks: 1, relatedKey: '잔향 칼날', effect: { combinedMultiplier: 1.36 } }),
  define({ id: 'wide-orbit', name: '넓은 궤도', tags: ['weapon', 'echo-blade'], rarity: '일반', maxStacks: 2, relatedKey: '잔향 칼날', effect: { range: .22, interval: .12 } }),
  define({ id: 'cut-sentence', name: '절단 문장', tags: ['weapon', 'cut', 'word'], rarity: '희귀', maxStacks: 2, relatedKey: 'J · Q · R', effect: { damage: 9 } }),
  define({ id: 'backflow-blade', name: '역류 칼날', tags: ['weapon', 'projectile', 'stop'], rarity: '전설', maxStacks: 1, relatedKey: '잔향 칼날 · Q', effect: { reflectedRatio: .65 } }),
  define({ id: 'returning-scar', name: '회귀의 칼자국', tags: ['weapon', 'rewind'], rarity: '희귀', maxStacks: 2, relatedKey: 'E', effect: { ratio: .42 } }),
  define({ id: 'isolation-chain', name: '고립의 사슬', tags: ['weapon', 'link'], rarity: '희귀', maxStacks: 2, relatedKey: 'R', effect: { bonus: .1, explosion: 12 } }),
] as const;

export function upgradeById(id: string): UpgradeDefinition | undefined { return UPGRADES.find((upgrade) => upgrade.id === id); }
export function upgradeDescription(upgrade: UpgradeDefinition, stacks = 1): string { return text(upgrade, stacks); }
