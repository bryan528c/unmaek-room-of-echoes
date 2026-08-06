import { resolveAct1RuntimeMode } from '../final/Act1FinalConfig';

export interface MotionPilotConfig {
  enabled: boolean;
  source: 'URL_QUERY' | 'DEFAULT_FINAL' | 'DEFAULT_OFF' | 'LEGACY_OVERRIDE';
}

export type MotionPilotTarget =
  | 'player'
  | 'pressure_swift'
  | 'deflect_bat'
  | 'rewind_lizard'
  | 'mineral_spider'
  | 'resonance_goral';

export type MotionPilotRenderSource = 'PILOT' | 'PARTIAL_FALLBACK' | 'LEGACY_QUALITY_FALLBACK' | 'PILOT_MIRRORED_STAGING_FALLBACK' | 'FINAL_HANDOFF' | 'FINAL_CORRECTED' | 'VERIFIED_MOTION';

export interface MotionPilotPresentationProfile {
  source: MotionPilotRenderSource;
  uniformScale: number;
  outlinePixels: number;
  outlineAlpha: number;
  directionPolicy: 'SEQUENCE_OR_LOCK' | 'FULL_8' | 'FLIP_X' | 'INVERTED_FLIP_X' | 'FRONT_SIDE' | 'MIRRORED_STAGING';
}

/**
 * Staging-only visual policy. These values never alter movement, collision,
 * damage, cooldown, or any official runtime manifest value.
 *
 * At the review viewport (960 logical pixels displayed at 1280 CSS pixels),
 * 1.5 logical scale maps one source pixel to exactly two CSS pixels. The
 * The large-canvas lizard, spider, and goral retain integer logical scale;
 * their finer source pixels already provide the required on-screen silhouette.
 */
export const MOTION_PILOT_PRESENTATION_PROFILES: Readonly<Record<MotionPilotTarget, MotionPilotPresentationProfile>> = {
  player: { source: 'PILOT', uniformScale: 1.5, outlinePixels: 1, outlineAlpha: 0.32, directionPolicy: 'SEQUENCE_OR_LOCK' },
  pressure_swift: { source: 'PILOT', uniformScale: 1.5, outlinePixels: 0, outlineAlpha: 0, directionPolicy: 'FLIP_X' },
  deflect_bat: { source: 'PILOT', uniformScale: 1.5, outlinePixels: 0, outlineAlpha: 0, directionPolicy: 'FLIP_X' },
  // Both corrected and verified lizard frames are authored head-left. Keep the
  // gameplay owner's metadata flip untouched and invert only the pilot image.
  rewind_lizard: { source: 'PILOT', uniformScale: 1, outlinePixels: 0, outlineAlpha: 0, directionPolicy: 'INVERTED_FLIP_X' },
  mineral_spider: { source: 'PILOT', uniformScale: 1, outlinePixels: 0, outlineAlpha: 0, directionPolicy: 'FRONT_SIDE' },
  resonance_goral: { source: 'PILOT_MIRRORED_STAGING_FALLBACK', uniformScale: 1, outlinePixels: 1, outlineAlpha: 0.28, directionPolicy: 'MIRRORED_STAGING' },
};

export const motionPilotPresentationProfile = (target: MotionPilotTarget): MotionPilotPresentationProfile =>
  MOTION_PILOT_PRESENTATION_PROFILES[target];

/** Canonical goral frames face left; only the staging visual mirrors right. */
export const resolveMirroredStagingFlip = (current: boolean, horizontalDelta: number, hysteresis = 6): boolean =>
  Math.abs(horizontalDelta) > hysteresis ? horizontalDelta > 0 : current;

export const resolveMotionPilotConfig = (search: string): MotionPilotConfig => {
  const params = new URLSearchParams(search);
  const mode = resolveAct1RuntimeMode(search);
  if (mode === 'LEGACY') return { enabled: false, source: 'LEGACY_OVERRIDE' };
  if (mode === 'FINAL') return { enabled: true, source: params.get('act1Final') === '1' ? 'URL_QUERY' : 'DEFAULT_FINAL' };
  const enabled = params.get('motionPilot') === '1';
  return { enabled, source: enabled ? 'URL_QUERY' : 'DEFAULT_OFF' };
};

export const motionPilotConfig = (): MotionPilotConfig => resolveMotionPilotConfig(
  typeof window === 'undefined' ? '?legacyRuntime=1' : window.location.search,
);

export const motionPilotEnabled = (): boolean => motionPilotConfig().enabled;
