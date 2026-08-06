export type Act1FinalPlayerSource = 'FINAL_HANDOFF' | 'CURRENT_MOTION_PILOT' | 'LEGACY';
export type Act1FinalCreatureSource = 'FINAL_CORRECTED' | 'VERIFIED_MOTION' | 'LEGACY';
export type Act1FinalVfxSource = 'FINAL_PNG' | 'PROCEDURAL' | 'LEGACY';
export type Act1RuntimeMode = 'FINAL' | 'LEGACY' | 'COMPARISON';

export interface Act1FinalCreaturePresentationProfile {
  uniformScale: number;
  verifiedCanvas: Readonly<{ width: number; height: number }>;
  verifiedGroundPoint: Readonly<{ x: number; y: number }>;
  correctedCanvas: Readonly<{ width: number; height: number }>;
  correctedGroundPoint: Readonly<{ x: number; y: number }>;
}

export interface Act1FinalConfig {
  mode: Act1RuntimeMode;
  enabled: boolean;
  player: Act1FinalPlayerSource;
  creatures: Readonly<Record<string, Act1FinalCreatureSource>>;
  vfx: Act1FinalVfxSource;
}

const CREATURES = ['pressure_swift', 'deflect_bat', 'rewind_lizard', 'mineral_spider', 'resonance_goral'] as const;

/**
 * Final-mode presentation envelopes. A species keeps one scale for every
 * action and frame. Corrected key frames are admitted separately only when
 * their native alpha envelope is within the stability gate of the verified
 * frame they replace.
 */
export const ACT1_FINAL_CREATURE_PRESENTATION_PROFILES: Readonly<Record<string, Act1FinalCreaturePresentationProfile>> = {
  pressure_swift: {
    uniformScale: 2.75,
    verifiedCanvas: { width: 36, height: 24 }, verifiedGroundPoint: { x: 18, y: 20 },
    correctedCanvas: { width: 64, height: 64 }, correctedGroundPoint: { x: 32, y: 54 },
  },
  deflect_bat: {
    uniformScale: 1.8,
    verifiedCanvas: { width: 52, height: 36 }, verifiedGroundPoint: { x: 26, y: 29 },
    correctedCanvas: { width: 80, height: 72 }, correctedGroundPoint: { x: 40, y: 62 },
  },
  rewind_lizard: {
    uniformScale: 1.2,
    verifiedCanvas: { width: 72, height: 40 }, verifiedGroundPoint: { x: 33, y: 34 },
    correctedCanvas: { width: 88, height: 64 }, correctedGroundPoint: { x: 44, y: 56 },
  },
  mineral_spider: {
    uniformScale: 1.02,
    verifiedCanvas: { width: 104, height: 88 }, verifiedGroundPoint: { x: 52, y: 72 },
    correctedCanvas: { width: 104, height: 88 }, correctedGroundPoint: { x: 52, y: 72 },
  },
  resonance_goral: {
    uniformScale: 1.16,
    verifiedCanvas: { width: 220, height: 175 }, verifiedGroundPoint: { x: 110, y: 154 },
    correctedCanvas: { width: 240, height: 200 }, correctedGroundPoint: { x: 120, y: 184 },
  },
};

export const ACT1_FINAL_STABLE_CORRECTED_FRAME_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  pressure_swift: new Set(),
  deflect_bat: new Set(),
  rewind_lizard: new Set(['attack:1']),
  mineral_spider: new Set(['move:0']),
  resonance_goral: new Set(['charge_attack:1']),
};

// 13/16 keeps the 128 px source on a stable binary fraction while reducing the
// prior final presentation. Physics and gameplay anchors remain owned
// by the unchanged Hero sprite.
export const ACT1_FINAL_PLAYER_VISUAL_SCALE = 0.8125;
export const ACT1_FINAL_IMPACT_TTL_MS = 400;
export const ACT1_FINAL_PROJECTILE_READABILITY = {
  outerColor: 0x170f13,
  innerColor: 0xffe2a8,
  batColor: 0xf47e78,
  spiderColor: 0xe8d8ff,
  goralColor: 0xffc56f,
  outerAlpha: 0.96,
  innerAlpha: 0.94,
  corridorAlpha: 0.34,
  corridorOutlineAlpha: 0.72,
  batCueLength: 36,
  batCueLifetimeMs: 170,
} as const;

export const resolveAct1FinalPresentationSource = (
  finalReady: boolean,
  proceduralReady = true,
): Act1FinalVfxSource => finalReady ? 'FINAL_PNG' : proceduralReady ? 'PROCEDURAL' : 'LEGACY';

export interface ProjectileCoreGeometry {
  x: number;
  y: number;
  radius: number;
  diameter: number;
}

export const projectileCoreGeometry = (circle: Readonly<{ x: number; y: number; radius: number }>): ProjectileCoreGeometry => ({
  x: circle.x, y: circle.y, radius: circle.radius, diameter: circle.radius * 2,
});

export const projectileCorridorLines = (
  origin: Readonly<{ x: number; y: number }>,
  angle: number,
  length: number,
  radius: number,
): readonly [Readonly<{ x1: number; y1: number; x2: number; y2: number }>, Readonly<{ x1: number; y1: number; x2: number; y2: number }>] => {
  const normalX = -Math.sin(angle) * radius;
  const normalY = Math.cos(angle) * radius;
  const directionX = Math.cos(angle) * length;
  const directionY = Math.sin(angle) * length;
  return [
    { x1: origin.x + normalX, y1: origin.y + normalY, x2: origin.x + normalX + directionX, y2: origin.y + normalY + directionY },
    { x1: origin.x - normalX, y1: origin.y - normalY, x2: origin.x - normalX + directionX, y2: origin.y - normalY + directionY },
  ];
};

export const act1FinalCreaturePresentationProfile = (creatureId: string): Act1FinalCreaturePresentationProfile | undefined =>
  ACT1_FINAL_CREATURE_PRESENTATION_PROFILES[creatureId];

export const act1FinalCorrectedFrameIsStable = (creatureId: string, sequenceId: string, frameIndex: number): boolean =>
  ACT1_FINAL_STABLE_CORRECTED_FRAME_KEYS[creatureId]?.has(`${sequenceId}:${frameIndex}`) ?? false;

export const resolveAct1RuntimeMode = (search: string): Act1RuntimeMode => {
  const params = new URLSearchParams(search);
  if (params.get('legacyRuntime') === '1') return 'LEGACY';
  if (params.get('act1Final') === '1') return 'FINAL';
  if (params.get('motionPilot') === '1' || params.get('act1Showcase') === '1') return 'COMPARISON';
  return 'FINAL';
};

export const resolveAct1FinalConfig = (search: string): Act1FinalConfig => {
  const params = new URLSearchParams(search);
  const mode = resolveAct1RuntimeMode(search);
  const enabled = mode === 'FINAL';
  const comparisonMotion = mode === 'COMPARISON' && params.get('motionPilot') === '1';
  const comparisonVfx = comparisonMotion && params.get('act1Showcase') === '1';
  return {
    mode,
    enabled,
    player: enabled ? 'FINAL_HANDOFF' : comparisonMotion ? 'CURRENT_MOTION_PILOT' : 'LEGACY',
    creatures: Object.fromEntries(CREATURES.map((id) => [id, enabled ? 'FINAL_CORRECTED' : comparisonMotion ? 'VERIFIED_MOTION' : 'LEGACY'])),
    vfx: enabled ? 'FINAL_PNG' : comparisonVfx ? 'PROCEDURAL' : 'LEGACY',
  };
};

export const act1FinalConfig = (): Act1FinalConfig => resolveAct1FinalConfig(
  typeof window === 'undefined' ? '?legacyRuntime=1' : window.location.search,
);

export const act1FinalEnabled = (): boolean => act1FinalConfig().enabled;

export const act1FinalEnabledForAct = (actIndex: number): boolean => act1FinalEnabled() && actIndex === 1;

/** Final ACT 1 keeps gameplay word feedback but omits large world-space type. */
export const act1FinalCombatTypographyEnabled = (
  actIndex: number,
  finalEnabled = act1FinalEnabled(),
): boolean => act1FinalCombatWorldTextEnabled(actIndex, finalEnabled);

/** Final ACT 1 keeps HUD/debug text, but renders no world-space combat labels. */
export const act1FinalCombatWorldTextEnabled = (
  actIndex: number,
  finalEnabled = act1FinalEnabled(),
): boolean => !(finalEnabled && actIndex === 1);

/** The approved phase state remains authoritative; only its decorative arc is suppressed. */
export const act1FinalBossPhaseOverlayEnabled = (
  creatureId: string,
  phase: 1 | 2 | 3 | 'preFight' | 'defeated/nonlethal',
  finalEnabled = act1FinalEnabled(),
): boolean => !(finalEnabled && creatureId === 'resonance_goral' && phase === 3);

export type Act1FinalBossRetreatPresentation = 'IN_PLACE_DISSOLVE' | 'LEGACY_SLIDE';

export const act1FinalBossRetreatPresentation = (
  creatureId: string,
  finalEnabled = act1FinalEnabled(),
): Act1FinalBossRetreatPresentation => finalEnabled && creatureId === 'resonance_goral'
  ? 'IN_PLACE_DISSOLVE'
  : 'LEGACY_SLIDE';
