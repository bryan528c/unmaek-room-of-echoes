import type { EnemyKind } from '../balance';

export interface CombatPresentationDefinition {
  id: string;
  displayName: string;
  shortDescription: string;
  counterHint: string;
  iconKey: string;
}

export const ENEMY_PRESENTATION: Readonly<Record<EnemyKind, CombatPresentationDefinition>> = {
  chaser: { id: 'chaser', displayName: '추적자', shortDescription: '직선으로 돌진합니다.', counterHint: '예고선을 벗어나거나 패링하세요.', iconKey: 'enemy-chaser' },
  archer: { id: 'archer', displayName: '궁수', shortDescription: '원거리 기록탄을 발사합니다.', counterHint: '탄환을 패링하거나 멎게 하세요.', iconKey: 'enemy-archer' },
  ink: { id: 'ink-spirit', displayName: '먹물령', shortDescription: '부채꼴 먹물탄을 발사합니다.', counterHint: '발사 전 옆으로 이동하세요.', iconKey: 'enemy-ink' },
  elite: { id: 'stitched-elite', displayName: '봉합체', shortDescription: '강한 돌진을 준비합니다.', counterHint: '갑주를 절단한 뒤 공격하세요.', iconKey: 'enemy-elite' },
  minion: { id: 'minion', displayName: '기록 파편', shortDescription: '보스가 만든 소환체입니다.', counterHint: '연결 피해로 함께 처리하세요.', iconKey: 'enemy-minion' },
  boss: { id: 'boss', displayName: '보스', shortDescription: '기록의 주인입니다.', counterHint: '단계 기믹을 이용하세요.', iconKey: 'enemy-boss' },
};

export const enemyDisplayName = (kind: EnemyKind): string => ENEMY_PRESENTATION[kind].displayName;

export const attackDisplayName = (attackId: string, fallback = '공격'): string => {
  if (attackId.includes('melee')) return '돌진';
  if (attackId.includes('projectile')) return '기록탄';
  if (attackId.includes('past')) return '과거 교정';
  if (attackId.includes('ink')) return '먹물 폭발';
  return fallback;
};
