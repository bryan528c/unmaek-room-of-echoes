export type UpgradeRarity = '일반' | '희귀' | '전설';

export type UpgradeId =
  | 'afterimage-slash'
  | 'dragon-fang'
  | 'broken-sentence'
  | 'regression-blade'
  | 'memory-echo'
  | 'link-overload'
  | 'inscription-spread'
  | 'perfect-breath'
  | 'ink-cloak'
  | 'sealed-sentence'
  | 'pursuit-mark'
  | 'fragment-recovery';

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  tag: string;
  rarity: UpgradeRarity;
  maxStacks: number;
}

export const UPGRADES: readonly UpgradeDefinition[] = [
  { id: 'afterimage-slash', name: '잔상 베기', description: '대시 경로에 45% 피해의 지연 참격을 남긴다.', tag: '대시', rarity: '희귀', maxStacks: 2 },
  { id: 'dragon-fang', name: '용의 이빨', description: '3연격 마지막 타격의 치명 확률이 22% 증가한다.', tag: '공격', rarity: '희귀', maxStacks: 3 },
  { id: 'broken-sentence', name: '부서진 문장', description: '정지된 적을 공격하면 12의 파열 피해를 준다.', tag: '멎는다', rarity: '일반', maxStacks: 3 },
  { id: 'regression-blade', name: '역행의 칼날', description: '되돌린다 후 첫 공격 피해가 55% 증가한다.', tag: '되돌린다', rarity: '희귀', maxStacks: 2 },
  { id: 'memory-echo', name: '기억의 잔상', description: '되돌린다 분신이 직전 공격을 재현한다.', tag: '되돌린다', rarity: '전설', maxStacks: 2 },
  { id: 'link-overload', name: '연결 과부하', description: '연결 대상 사망 폭발 반경과 피해가 증가한다.', tag: '잇는다', rarity: '희귀', maxStacks: 3 },
  { id: 'inscription-spread', name: '비문 전염', description: '연결 폭발이 근처 적에게 2초간 전염된다.', tag: '잇는다', rarity: '전설', maxStacks: 1 },
  { id: 'perfect-breath', name: '완벽한 호흡', description: '패링 판정이 22ms 늘어나고 문장력 획득이 증가한다.', tag: '패링', rarity: '일반', maxStacks: 2 },
  { id: 'ink-cloak', name: '먹빛 망토', description: '각 전투의 첫 피격 피해를 35% 감소시킨다.', tag: '생존', rarity: '일반', maxStacks: 2 },
  { id: 'sealed-sentence', name: '봉인된 문장', description: '언령 비용이 10% 감소하고 적중 문장력이 증가한다.', tag: '문장력', rarity: '희귀', maxStacks: 3 },
  { id: 'pursuit-mark', name: '추격의 각인', description: '같은 적 연속 공격마다 피해가 8%씩 증가한다.', tag: '공격', rarity: '일반', maxStacks: 3 },
  { id: 'fragment-recovery', name: '파편 회수', description: '반사 탄환 적중 시 체력을 4 회복한다.', tag: '패링', rarity: '희귀', maxStacks: 2 },
] as const;

export function upgradeById(id: string): UpgradeDefinition | undefined {
  return UPGRADES.find((upgrade) => upgrade.id === id);
}
