import { resolveAct1RuntimeMode } from './Act1FinalConfig';

export type Act1VfxArtPatchCategory = 'playerSlash' | 'batSonic' | 'spiderWeb' | 'goralStone';
export type Act1VfxArtPatchSource = 'PATCH_PNG' | 'CURRENT_FINAL_PNG' | 'PROCEDURAL' | 'LEGACY';

export interface Act1VfxArtPatchConfig {
  enabled: boolean;
  sources: Readonly<Record<Act1VfxArtPatchCategory, Act1VfxArtPatchSource>>;
}

export const ACT1_VFX_PATCH_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Act1VfxPatchDirection = typeof ACT1_VFX_PATCH_DIRECTIONS[number];

export const ACT1_VFX_PATCH_PRESENTATION = {
  // 5/8 preserves a crisp binary-fraction scale while reducing the native
  // slash's apparent stroke weight. Directional offsets move the canvas away
  // from the hand without changing the gameplay cut origin or range.
  playerSlash: { displayScale: 0.625, alpha: 0.88, tint: 0xc7c1b3, frameCount: 5, totalDurationMs: 245 },
  batSonic: { displayScale: 1, formFrames: 3, launchFrames: 2, travelFrames: 3, impactFrames: 5, frameDurationMs: 70, showCollisionCore: false },
  spiderWeb: { displayScale: 1, saturation: -1, formFrames: 3, launchFrames: 2, travelFrames: 3, impactFrames: 5, frameDurationMs: 70, showCollisionCore: false },
  goralStone: { displayScale: 1, saturation: -1, travelFrames: 4, impactFrames: 5, frameDurationMs: 70, showCollisionCore: false },
} as const;

export const ACT1_VFX_PATCH_SLASH_OFFSET: Readonly<Record<Act1VfxPatchDirection, Readonly<{ x: number; y: number }>>> = {
  n: { x: 0, y: -16 },
  ne: { x: 13, y: -13 },
  e: { x: 18, y: 0 },
  se: { x: 13, y: 13 },
  s: { x: 0, y: 16 },
  sw: { x: -13, y: 13 },
  w: { x: -18, y: 0 },
  nw: { x: -13, y: -13 },
};

export const offsetAct1VfxPatchSlashAnchor = (
  anchor: Readonly<{ x: number; y: number }>,
  direction: Act1VfxPatchDirection,
): Readonly<{ x: number; y: number }> => ({
  x: anchor.x + ACT1_VFX_PATCH_SLASH_OFFSET[direction].x,
  y: anchor.y + ACT1_VFX_PATCH_SLASH_OFFSET[direction].y,
});

export const ACT1_VFX_PATCH_SLASH_CONTACT_FRAME: Readonly<Record<Act1VfxPatchDirection, number>> = {
  n: 3,
  ne: 2,
  e: 3,
  se: 3,
  s: 3,
  sw: 3,
  w: 3,
  nw: 3,
};

export const resolveAct1VfxArtPatchConfig = (search: string): Act1VfxArtPatchConfig => {
  const enabled = resolveAct1RuntimeMode(search) === 'FINAL'
    && new URLSearchParams(search).get('act1VfxPatch') === '1';
  const source: Act1VfxArtPatchSource = enabled ? 'PATCH_PNG' : 'CURRENT_FINAL_PNG';
  return {
    enabled,
    sources: { playerSlash: source, batSonic: source, spiderWeb: source, goralStone: source },
  };
};

export const act1VfxArtPatchConfig = (): Act1VfxArtPatchConfig => resolveAct1VfxArtPatchConfig(
  typeof window === 'undefined' ? '' : window.location.search,
);

export const act1VfxArtPatchEnabled = (): boolean => act1VfxArtPatchConfig().enabled;
export const act1VfxArtPatchEnabledForAct = (actIndex: number): boolean => act1VfxArtPatchEnabled() && actIndex === 1;

export const resolveAct1VfxArtPatchSource = (
  patchEnabled: boolean,
  patchReady: boolean,
  currentFinalReady = true,
  proceduralReady = true,
): Act1VfxArtPatchSource => {
  if (patchEnabled && patchReady) return 'PATCH_PNG';
  if (currentFinalReady) return 'CURRENT_FINAL_PNG';
  if (proceduralReady) return 'PROCEDURAL';
  return 'LEGACY';
};

export const normalizedSlashFrameDurations = (
  contactFrame: number,
  contactAtMs: number,
  totalDurationMs: number,
  frameCount = ACT1_VFX_PATCH_PRESENTATION.playerSlash.frameCount,
): readonly number[] => {
  const safeContactFrame = Math.max(1, Math.min(frameCount - 1, contactFrame));
  const safeContactAt = Math.max(0, Math.min(totalDurationMs, contactAtMs));
  const preDuration = safeContactAt / safeContactFrame;
  const postFrameCount = frameCount - safeContactFrame;
  const postDuration = (totalDurationMs - safeContactAt) / postFrameCount;
  return Array.from({ length: frameCount }, (_, frame) => frame < safeContactFrame ? preDuration : postDuration);
};

export type Act1VfxPatchImpactReason = 'TARGET_COLLISION' | 'MAP_COLLISION' | 'PROJECTILE_DESTROY' | 'PROJECTILE_INACTIVE' | 'ACT_CLEANUP' | 'RUN_RESET' | 'SCENE_SHUTDOWN' | 'OWNER_DESPAWN';

export const act1VfxPatchImpactAllowed = (reason: Act1VfxPatchImpactReason): boolean =>
  reason === 'TARGET_COLLISION' || reason === 'MAP_COLLISION';
