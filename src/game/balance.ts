export const BALANCE = {
  hero: {
    maxHealth: 100,
    speed: 190,
    attackDamage: [18, 22, 34] as readonly number[],
    attackRange: [62, 67, 78] as readonly number[],
    attackCooldown: 235,
    comboReset: 580,
    dashSpeed: 520,
    dashDuration: 170,
    dashCooldown: 760,
    dashInvulnerability: 220,
    hitInvulnerability: 620,
    parryWindow: 155,
    parryCooldown: 430,
  },
  sentence: {
    maximum: 100,
    hitGain: 6,
    parryGain: 20,
    nearMissGain: 8,
    stopCost: 25,
    rewindCost: 30,
    linkCost: 35,
  },
  words: {
    stopRadius: 145,
    stopDuration: 1300,
    rewindDuration: 2000,
    linkDuration: 5000,
    linkShare: 0.28,
    empoweredLinkShare: 0.42,
  },
  enemies: {
    chaser: { hp: 64, speed: 94, damage: 15, score: 120 },
    archer: { hp: 50, speed: 72, damage: 13, score: 160 },
    ink: { hp: 42, speed: 48, damage: 11, score: 180 },
    elite: { hp: 210, speed: 58, damage: 22, score: 600 },
    boss: { hp: 900, speed: 68, damage: 24, score: 3000 },
  },
  waveSpawns: [
    ['chaser', 'chaser', 'chaser', 'archer'],
    ['archer', 'ink', 'archer', 'ink', 'chaser'],
    ['elite', 'archer', 'ink', 'chaser'],
  ] as const,
} as const;

export type EnemyKind = 'chaser' | 'archer' | 'ink' | 'elite' | 'boss' | 'minion';
