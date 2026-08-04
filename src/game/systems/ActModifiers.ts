import type { ActPatternId, EndlessModifierId } from './RunActDirector';

export type GuidedModifierId = 'stitch-pair' | 'past-position' | 'mixed-archive';
export type ModifierId = GuidedModifierId | EndlessModifierId;

export interface ModifierPresentation {
  id: ModifierId;
  name: string;
  icon: string;
  description: string;
  detailed: boolean;
  durationMs: number;
}

export interface ModifierDefinition {
  id: ActPatternId | EndlessModifierId;
  displayName: string;
  icon: string;
  shortDescription: string;
  counterHint: string;
  iconKey: string;
}

export const ACT_MODIFIERS: Readonly<Record<GuidedModifierId, ModifierDefinition>> = {
  'stitch-pair': { id: 'stitch-pair', displayName: '봉합 쌍', icon: '縫', iconKey: 'stitch', shortDescription: '두 적이 피해를 나눕니다.', counterHint: 'J 절단이나 R 잇는다로 관계를 이용하세요.' },
  'past-position': { id: 'past-position', displayName: '과거 교정', icon: '削', iconKey: 'past', shortDescription: '1.2초 전 위치가 공격받습니다.', counterHint: 'E 되돌린다와 이동으로 역이용하세요.' },
  'mixed-archive': { id: 'mixed-archive', displayName: '편집 실험', icon: '編', iconKey: 'mixed', shortDescription: '봉합과 과거 교정이 함께 적용됩니다.', counterHint: '큰 위험 예고를 먼저 피한 뒤 관계를 끊으세요.' },
};

export const ENDLESS_MODIFIERS: Readonly<Record<EndlessModifierId, ModifierDefinition>> = {
  'projectile-echo': { id: 'projectile-echo', displayName: '잔향 탄환', icon: '響', iconKey: 'projectile-echo', shortDescription: '탄환이 지나간 자리에 잔향탄이 생깁니다.', counterHint: 'Q로 멈춘 뒤 E로 역류시키세요.' },
  'stitched-armor': { id: 'stitched-armor', displayName: '봉합 갑주', icon: '縫', iconKey: 'stitched-armor', shortDescription: '일부 적이 봉합 보호막을 가집니다.', counterHint: 'J 절단이나 언령 반응으로 갑주를 끊으세요.' },
  'time-rift': { id: 'time-rift', displayName: '시간 균열', icon: '刻', iconKey: 'time-rift', shortDescription: '플레이어의 과거 위치가 공격받습니다.', counterHint: 'E 되돌린다와 이동으로 역이용하세요.' },
  'linked-swarm': { id: 'linked-swarm', displayName: '연결 무리', icon: '聯', iconKey: 'linked-swarm', shortDescription: '적 무리가 피해 관계를 공유합니다.', counterHint: 'R로 관계를 덮어쓰거나 J로 끊으세요.' },
  'parry-vulnerable': { id: 'parry-vulnerable', displayName: '패링 취약', icon: '反', iconKey: 'parry-vulnerable', shortDescription: '패링 뒤 적의 약점이 오래 노출됩니다.', counterHint: '패링 직후 J와 언령을 집중하세요.' },
  'ink-floor': { id: 'ink-floor', displayName: '먹물 장판', icon: '墨', iconKey: 'ink-floor', shortDescription: '전장에 먹물 위험 지대가 생깁니다.', counterHint: '안전 지대를 확보하고 이동하세요.' },
  'empowered-elites': { id: 'empowered-elites', displayName: '강화 엘리트', icon: '強', iconKey: 'empowered-elites', shortDescription: '엘리트의 패턴이 강화됩니다.', counterHint: '상태 반응과 패링 기회를 활용하세요.' },
  'accelerated-record': { id: 'accelerated-record', displayName: '가속 기록', icon: '速', iconKey: 'accelerated-record', shortDescription: '적 패턴의 간격이 짧아집니다.', counterHint: '위험 예고를 보고 한 번씩 대응하세요.' },
};

const SPECIAL_PATTERNS: Partial<Record<ActPatternId, ModifierDefinition>> = {
  'ink-echo-projectile': { id: 'ink-echo-projectile', displayName: '먹물 잔향탄', icon: '響', iconKey: 'ink-echo', shortDescription: '탄환 뒤에 한 번의 잔향탄이 생깁니다.', counterHint: '멎는다와 역류로 되받아치세요.' },
};

export function modifierDefinition(id: ActPatternId | EndlessModifierId): ModifierDefinition | undefined {
  return ACT_MODIFIERS[id as GuidedModifierId] ?? ENDLESS_MODIFIERS[id as EndlessModifierId] ?? SPECIAL_PATTERNS[id as ActPatternId];
}

export function modifierLabel(id: ActPatternId | EndlessModifierId): string {
  return modifierDefinition(id)?.displayName ?? '알 수 없는 변칙';
}

export function modifierDescription(id: ActPatternId | EndlessModifierId): string {
  const definition = modifierDefinition(id);
  return definition ? `${definition.shortDescription} ${definition.counterHint}` : '정의되지 않은 변칙입니다.';
}

export function modifierLabelsForAct(
  patterns: readonly ActPatternId[],
  modifiers: readonly EndlessModifierId[],
): string[] {
  const ids = [...modifiers, ...patterns.filter((pattern) => pattern !== 'archive-baseline')];
  return [...new Set(ids)].map((id) => modifierLabel(id));
}

export class ModifierIntroductionTracker {
  private readonly seen = new Set<ModifierId>();

  public constructor(initiallySeen: readonly string[] = []) {
    for (const id of initiallySeen) if (modifierDefinition(id as ModifierId)) this.seen.add(id as ModifierId);
  }

  public presentationFor(patterns: readonly ActPatternId[], modifiers: readonly EndlessModifierId[] = []): ModifierPresentation | undefined {
    const guided = patterns.includes('mixed-archive') ? ['mixed-archive'] as const : patterns.filter((pattern): pattern is GuidedModifierId => pattern === 'stitch-pair' || pattern === 'past-position');
    const candidates: readonly ModifierId[] = [...guided, ...modifiers];
    const id = candidates[0]; if (!id) return undefined;
    const definition = modifierDefinition(id); if (!definition) return undefined;
    const detailed = !this.seen.has(id);
    this.seen.add(id);
    return { id, name: definition.displayName, icon: definition.icon, description: `${definition.shortDescription} ${definition.counterHint}`, detailed, durationMs: detailed ? 1400 : 700 };
  }

  public hasSeen(id: ModifierId): boolean { return this.seen.has(id); }
  public seenIds(): ModifierId[] { return [...this.seen]; }
  public reset(): void { this.seen.clear(); }
}
