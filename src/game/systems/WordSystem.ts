export type WordId = 'stop' | 'rewind' | 'link' | 'pull' | 'mark' | 'push';
export type WordSlot = 'Q' | 'E' | 'R';
export type WordStateId = 'STOPPED' | 'ECHO' | 'REWOUND' | 'LINKED' | 'ISOLATED' | 'PULLED' | 'COMPRESSED' | 'MARKED' | 'DISPLACED' | 'EXPOSED' | 'CUTTABLE';
export type WordRole = '공격' | '제어' | '방어' | '관계' | '이동';

export const WORD_STATUS_DISPLAY_NAMES: Readonly<Record<WordStateId, string>> = {
  STOPPED: '정지', ECHO: '잔향', REWOUND: '회귀', LINKED: '연결', ISOLATED: '고립',
  PULLED: '끌림', COMPRESSED: '압축', MARKED: '각인', DISPLACED: '밀려남',
  EXPOSED: '노출', CUTTABLE: '절단 가능',
};
export const wordStatusDisplayName = (id: WordStateId): string => WORD_STATUS_DISPLAY_NAMES[id];

export interface WordDefinition {
  id: WordId;
  displayName: string;
  shortDescription: string;
  iconKey: string;
  targetingType: 'cluster' | 'self-history' | 'nearest-group' | 'forward-area' | 'nearest-target' | 'forward-cone';
  cooldown: number;
  baseDamage: number;
  stateTagsApplied: readonly WordStateId[];
  empoweredEffect: string;
  visualStyle: string;
  audioKey: string;
  compatibleReactions: readonly string[];
  upgradeTags: readonly string[];
  roles: readonly WordRole[];
}

export const WORD_DEFINITIONS: Readonly<Record<WordId, WordDefinition>> = {
  stop: { id: 'stop', displayName: '멎는다', shortDescription: '적과 탄환의 시간을 멈춥니다.', iconKey: 'word-stop', targetingType: 'cluster', cooldown: 6000, baseDamage: 18, stateTagsApplied: ['STOPPED'], empoweredEffect: '범위와 정지 시간이 증가합니다.', visualStyle: 'concentric-runes', audioKey: 'stop', compatibleReactions: ['chain-stop', 'backflow', 'compressed-stop', 'sealed-inscription', 'stopped-shatter'], upgradeTags: ['word', 'stop'], roles: ['공격', '제어'] },
  rewind: { id: 'rewind', displayName: '되돌린다', shortDescription: '위치와 체력을 복구하고 잔상 검격을 남깁니다.', iconKey: 'word-rewind', targetingType: 'self-history', cooldown: 7600, baseDamage: 22, stateTagsApplied: ['ECHO', 'REWOUND'], empoweredEffect: '복구와 잔상 피해가 강화됩니다.', visualStyle: 'reverse-ghosts', audioKey: 'rewind', compatibleReactions: ['backflow', 'damage-regression', 'mark-regression'], upgradeTags: ['word', 'rewind'], roles: ['방어', '이동', '공격'] },
  link: { id: 'link', displayName: '잇는다', shortDescription: '최대 세 적의 피해 관계를 잇습니다.', iconKey: 'word-link', targetingType: 'nearest-group', cooldown: 8800, baseDamage: 10, stateTagsApplied: ['LINKED', 'ISOLATED'], empoweredEffect: '연결 수와 공유 피해가 증가합니다.', visualStyle: 'flowing-double-line', audioKey: 'link', compatibleReactions: ['chain-stop', 'damage-regression', 'binding', 'mark-spread', 'recoil-chain'], upgradeTags: ['word', 'link'], roles: ['관계', '공격'] },
  pull: { id: 'pull', displayName: '당긴다', shortDescription: '적과 탄환을 한곳으로 모읍니다.', iconKey: 'word-pull', targetingType: 'forward-area', cooldown: 7200, baseDamage: 9, stateTagsApplied: ['PULLED', 'COMPRESSED'], empoweredEffect: '범위가 커지고 포획 탄환을 적에게 방출합니다.', visualStyle: 'inward-spiral', audioKey: 'pull', compatibleReactions: ['compressed-stop', 'binding', 'compressed-burst'], upgradeTags: ['word', 'pull'], roles: ['제어', '이동'] },
  mark: { id: 'mark', displayName: '새긴다', shortDescription: '대상에 폭발하는 비문 각인을 새깁니다.', iconKey: 'word-mark', targetingType: 'nearest-target', cooldown: 6800, baseDamage: 14, stateTagsApplied: ['MARKED'], empoweredEffect: '최대 세 대상을 각인하고 폭발을 강화합니다.', visualStyle: 'single-seal', audioKey: 'mark', compatibleReactions: ['sealed-inscription', 'mark-spread', 'mark-regression'], upgradeTags: ['word', 'mark'], roles: ['공격', '관계'] },
  push: { id: 'push', displayName: '밀어낸다', shortDescription: '전방 충격파로 적과 탄환을 밀어냅니다.', iconKey: 'word-push', targetingType: 'forward-cone', cooldown: 7000, baseDamage: 11, stateTagsApplied: ['DISPLACED'], empoweredEffect: '360도 충격파와 대규모 탄환 반사를 일으킵니다.', visualStyle: 'outward-fan', audioKey: 'push', compatibleReactions: ['compressed-burst', 'stopped-shatter', 'recoil-chain'], upgradeTags: ['word', 'push'], roles: ['방어', '이동', '공격'] },
};

export const WORD_IDS = Object.freeze(Object.keys(WORD_DEFINITIONS) as WordId[]);
export const DEFAULT_WORD_LOADOUT: readonly [WordId, WordId, WordId] = ['stop', 'rewind', 'link'];
export const wordDefinition = (id: WordId): WordDefinition => WORD_DEFINITIONS[id];
export const wordDisplayName = (id: WordId): string => WORD_DEFINITIONS[id].displayName;
export const validWordLoadout = (value: readonly unknown[]): value is readonly [WordId, WordId, WordId] => value.length === 3 && new Set(value).size === 3 && value.every((id) => typeof id === 'string' && id in WORD_DEFINITIONS);

export class WordLoadoutState {
  private selectedValue: WordId[];
  public constructor(initial: readonly unknown[] = DEFAULT_WORD_LOADOUT) { this.selectedValue = validWordLoadout(initial) ? [...initial] : [...DEFAULT_WORD_LOADOUT]; }
  public toggle(id: WordId): boolean { const index = this.selectedValue.indexOf(id); if (index >= 0) { this.selectedValue.splice(index, 1); return true; } if (this.selectedValue.length >= 3) return false; this.selectedValue.push(id); return true; }
  public replace(loadout: readonly unknown[]): boolean { if (!validWordLoadout(loadout)) return false; this.selectedValue = [...loadout]; return true; }
  public get selected(): readonly WordId[] { return [...this.selectedValue]; }
  public get ready(): boolean { return this.selectedValue.length === 3; }
  public finalize(): [WordId, WordId, WordId] { return this.ready ? [...this.selectedValue] as [WordId, WordId, WordId] : [...DEFAULT_WORD_LOADOUT]; }
  public wordForSlot(slot: WordSlot): WordId { return this.finalize()[slot === 'Q' ? 0 : slot === 'E' ? 1 : 2]; }
}

export interface ActiveWordStatus { id: WordStateId; sourceWordId: WordId; duration: number; expiresAt: number; stacks: number; sourceEntityId: string; runId: number; actId: string; visualKey: string; consumedBy: readonly string[]; canSpread: boolean; canTriggerReaction: boolean; }
export class WordStatusRuntime {
  private readonly byEntity = new Map<string, Map<WordStateId, ActiveWordStatus>>();
  public apply(entityId: string, status: Omit<ActiveWordStatus, 'expiresAt' | 'stacks'> & { now: number; stacks?: number }): ActiveWordStatus { const statuses = this.byEntity.get(entityId) ?? new Map<WordStateId, ActiveWordStatus>(); const current = statuses.get(status.id); const stacks = Math.max(1, Math.min(status.id === 'MARKED' ? 8 : 3, (current?.stacks ?? 0) + (status.stacks ?? 1))); const next: ActiveWordStatus = { ...status, stacks, expiresAt: Math.max(current?.expiresAt ?? 0, status.now + status.duration) }; statuses.set(status.id, next); this.byEntity.set(entityId, statuses); return { ...next }; }
  public get(entityId: string, id: WordStateId, now: number): ActiveWordStatus | undefined { this.expire(now); const value = this.byEntity.get(entityId)?.get(id); return value ? { ...value } : undefined; }
  public has(entityId: string, id: WordStateId, now: number): boolean { return this.get(entityId, id, now) !== undefined; }
  public consume(entityId: string, id: WordStateId): boolean { const statuses = this.byEntity.get(entityId); if (!statuses?.delete(id)) return false; if (statuses.size === 0) this.byEntity.delete(entityId); return true; }
  public removeEntity(entityId: string): void { this.byEntity.delete(entityId); }
  public clear(): void { this.byEntity.clear(); }
  public count(id: WordStateId, now: number): number { this.expire(now); let count = 0; for (const statuses of this.byEntity.values()) if (statuses.has(id)) count += 1; return count; }
  private expire(now: number): void { for (const [entity, statuses] of this.byEntity) { for (const [id, value] of statuses) if (value.expiresAt <= now) statuses.delete(id); if (statuses.size === 0) this.byEntity.delete(entity); } }
}

export type WordReactionId = 'chain-stop' | 'backflow' | 'damage-regression' | 'compressed-stop' | 'binding' | 'compressed-burst' | 'sealed-inscription' | 'mark-spread' | 'mark-regression' | 'stopped-shatter' | 'recoil-chain';
export interface WordReactionDefinition { id: WordReactionId; displayName: string; firstWordId: WordId; secondWordId: WordId; requiredState?: WordStateId; resultEffect: string; damageSource: string; stateConsumption: readonly WordStateId[]; visualKey: string; audioKey: string; fallbackEffect: string; }
const reaction = (id: WordReactionId, displayName: string, firstWordId: WordId, secondWordId: WordId, requiredState: WordStateId | undefined, resultEffect: string, fallbackEffect: string): WordReactionDefinition => ({ id, displayName, firstWordId, secondWordId, requiredState, resultEffect, damageSource: 'reaction', stateConsumption: requiredState === 'COMPRESSED' || requiredState === 'STOPPED' ? [requiredState] : [], visualKey: `seal-${id}`, audioKey: 'chain', fallbackEffect });
export const WORD_REACTIONS: readonly WordReactionDefinition[] = [
  reaction('chain-stop', '연쇄 정지', 'link', 'stop', 'LINKED', '연결 대상을 동시에 정지하고 피해를 줍니다.', '한 대상에 정지 파동을 일으킵니다.'),
  reaction('backflow', '역류', 'stop', 'rewind', 'STOPPED', '정지 탄환을 적에게 되돌립니다.', '정지 대상에 역류 파동 피해를 줍니다.'),
  reaction('damage-regression', '피해 회귀', 'link', 'rewind', 'LINKED', '연결 대상의 최근 피해를 다시 적용합니다.', '최소 회귀 피해를 적용합니다.'),
  reaction('compressed-stop', '압축 정지', 'pull', 'stop', 'COMPRESSED', '모인 적을 정지하고 압축 파열합니다.', '소형 정지 파동을 일으킵니다.'),
  reaction('binding', '결속', 'pull', 'link', 'PULLED', '모인 적을 자동 연결합니다.', '가장 가까운 한 대상을 고립 연결합니다.'),
  reaction('compressed-burst', '압축 폭발', 'pull', 'push', 'COMPRESSED', '압축된 적을 바깥으로 폭발시킵니다.', '전방 압력파를 강화합니다.'),
  reaction('sealed-inscription', '봉인 문장', 'mark', 'stop', 'MARKED', '각인을 폭발시키고 정지 시간을 늘립니다.', '각인 대상에 최소 봉인 피해를 줍니다.'),
  reaction('mark-spread', '각인 전염', 'mark', 'link', 'MARKED', '연결 대상 전체에 각인을 전파합니다.', '가장 가까운 연결 대상에 각인을 옮깁니다.'),
  reaction('mark-regression', '각인 회귀', 'mark', 'rewind', 'MARKED', '최근 각인 피해를 다시 적용합니다.', '최소 각인 회귀 피해를 줍니다.'),
  reaction('stopped-shatter', '정지 파쇄', 'stop', 'push', 'STOPPED', '정지된 적과 탄환을 파쇄·반사합니다.', '충격파 피해를 강화합니다.'),
  reaction('recoil-chain', '반동 사슬', 'push', 'link', 'DISPLACED', '밀려난 적 사이에 짧은 연결을 만듭니다.', '가장 가까운 대상에 짧은 고립 연결을 만듭니다.'),
];
export const reactionFor = (first: WordId, second: WordId): WordReactionDefinition | undefined => WORD_REACTIONS.find((item) => item.firstWordId === first && item.secondWordId === second);
export const reactionDefinition = (id: WordReactionId): WordReactionDefinition | undefined => WORD_REACTIONS.find((item) => item.id === id);
export const compatibleNextWords = (first: WordId): WordId[] => WORD_REACTIONS.filter((item) => item.firstWordId === first).map((item) => item.secondWordId);
export const availableReactionCount = (loadout: readonly WordId[]): number => WORD_REACTIONS.filter((item) => loadout.includes(item.firstWordId) && loadout.includes(item.secondWordId)).length;
