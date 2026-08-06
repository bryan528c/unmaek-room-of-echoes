export interface Act1ShowcaseConfig {
  enabled: boolean;
  source: 'URL_QUERY' | 'DEFAULT_OFF' | 'MOTION_PILOT_REQUIRED';
}

export type Act1ShowcaseProjectileStyle = 'bat-sonic' | 'spider-web' | 'goral-stone';

export interface Act1ShowcaseVisualProfile {
  color: number;
  accent: number;
  alpha: number;
  lineWidth: number;
  durationMs: number;
  maximumExtent: number;
}

/**
 * Presentation-only settings for the ACT 1 capture pass. None of these values
 * participate in damage, collision, range, cooldown, velocity, or AI timing.
 */
export const ACT1_SHOWCASE_VFX = {
  maximumTransientEffects: 56,
  maximumProjectileCompanions: 28,
  heroCut: { color: 0xf1e4bd, accent: 0xffffff, alpha: 0.88, lineWidth: 2, durationMs: 105, maximumExtent: 46 },
  parry: { color: 0x78dac7, accent: 0xc8fff4, alpha: 0.82, lineWidth: 2, durationMs: 155, maximumExtent: 31 },
  stop: { color: 0x69cbb9, accent: 0xb2f3e7, alpha: 0.72, lineWidth: 2, durationMs: 230, maximumExtent: 42 },
  rewind: { color: 0x55aeca, accent: 0x9ce9f3, alpha: 0.58, lineWidth: 2, durationMs: 310, maximumExtent: 34 },
  link: { color: 0x70cfbc, accent: 0xb4f4e4, alpha: 0.62, lineWidth: 2, durationMs: 260, maximumExtent: 14 },
  bat: { color: 0xc78089, accent: 0xf0b5bd, alpha: 0.84, lineWidth: 2, durationMs: 145, maximumExtent: 18 },
  lizard: { color: 0xa98a68, accent: 0xd9c19b, alpha: 0.48, lineWidth: 1, durationMs: 190, maximumExtent: 24 },
  spider: { color: 0xb8b1a1, accent: 0xe2ddd1, alpha: 0.76, lineWidth: 1, durationMs: 180, maximumExtent: 17 },
  goral: { color: 0x9d8569, accent: 0xd2b78c, alpha: 0.62, lineWidth: 1, durationMs: 210, maximumExtent: 20 },
  swift: { color: 0x9eb9b1, accent: 0xd6e5df, alpha: 0.42, lineWidth: 1, durationMs: 170, maximumExtent: 22 },
} as const satisfies Readonly<Record<string, number | Act1ShowcaseVisualProfile>>;

export const resolveAct1ShowcaseConfig = (search: string): Act1ShowcaseConfig => {
  const params = new URLSearchParams(search);
  const motionPilot = params.get('motionPilot') === '1';
  const showcase = params.get('act1Showcase') === '1';
  if (!motionPilot && showcase) return { enabled: false, source: 'MOTION_PILOT_REQUIRED' };
  return { enabled: motionPilot && showcase, source: motionPilot && showcase ? 'URL_QUERY' : 'DEFAULT_OFF' };
};

export const act1ShowcaseConfig = (): Act1ShowcaseConfig => resolveAct1ShowcaseConfig(
  typeof window === 'undefined' ? '' : window.location.search,
);

export const act1ShowcaseProjectileStyle = (creatureId: string | undefined): Act1ShowcaseProjectileStyle | undefined => {
  if (creatureId === 'deflect_bat') return 'bat-sonic';
  if (creatureId === 'mineral_spider') return 'spider-web';
  if (creatureId === 'resonance_goral') return 'goral-stone';
  return undefined;
};

export const act1ShowcaseEnabledForAct = (config: Readonly<Act1ShowcaseConfig>, actIndex: number): boolean =>
  config.enabled && actIndex === 1;
