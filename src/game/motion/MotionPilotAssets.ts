import { motionPilotEnabled } from './MotionPilotConfig';

type ViteAssetModules = Readonly<Record<string, string>>;

const playerFrameAssets = import.meta.glob([
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/direction_lock/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/s/idle/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/s/move/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/s/dash/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/s/basic_attack/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/s/parry/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/s/word_skill/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/s/hit_recover/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/e/idle/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/e/move/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/e/dash/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/e/basic_attack/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/e/parry/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/e/word_skill/*.png',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/player/e/hit_recover/*.png',
], { eager: true, query: '?url', import: 'default' }) as ViteAssetModules;

const creatureFrameAssets = import.meta.glob([
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/pressure_swift/fly/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/pressure_swift/evade/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/deflect_bat/idle/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/deflect_bat/move/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/deflect_bat/prep/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/deflect_bat/attack/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/deflect_bat/hit_recover/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/rewind_lizard/idle/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/rewind_lizard/move/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/rewind_lizard/prep/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/rewind_lizard/attack/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/rewind_lizard/hit_recover/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/mineral_spider/idle/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/mineral_spider/move/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/mineral_spider/idle_to_alert/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/mineral_spider/alert_to_deploy/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/mineral_spider/deploy_to_attack/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/mineral_spider/attack_to_recover/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/mineral_spider/stunned_or_retreat/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/resonance_goral/idle/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/resonance_goral/warning/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/resonance_goral/combat_prep/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/resonance_goral/charge_attack/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/resonance_goral/hit_recover/*.png',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/resonance_goral/retreat/*.png',
], { eager: true, query: '?url', import: 'default' }) as ViteAssetModules;

const jsonAssets = import.meta.glob([
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/PLAYER_MOTION_MANIFEST.json',
  '../../../handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/PLAYER_ANCHOR_OFFSETS.json',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/MOTION_FRAME_MANIFEST_PILOT_v1.json',
  '../../../handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/PER_FRAME_ANCHOR_OFFSET_PILOT_v1.json',
], { eager: true, query: '?url', import: 'default' }) as ViteAssetModules;

const PLAYER_MARKER = '/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/';
const CREATURE_MARKER = '/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/';
const normalize = (value: string): string => value.replaceAll('\\', '/');

const packagePath = (modulePath: string): Readonly<{ packageId: 'player' | 'act1'; path: string }> => {
  const normalized = normalize(modulePath);
  const playerIndex = normalized.indexOf(PLAYER_MARKER);
  if (playerIndex >= 0) return { packageId: 'player', path: normalized.slice(playerIndex + PLAYER_MARKER.length) };
  const creatureIndex = normalized.indexOf(CREATURE_MARKER);
  if (creatureIndex >= 0) return { packageId: 'act1', path: normalized.slice(creatureIndex + CREATURE_MARKER.length) };
  throw new Error(`[MotionPilotAssets] Path is outside the motion handoffs: ${modulePath}`);
};

export const motionPilotTextureKey = (packageId: 'player' | 'act1', path: string): string =>
  `motion-pilot:${packageId}:${normalize(path)}`;

export const MOTION_PILOT_CACHE_KEYS = {
  playerManifest: 'motion-pilot:player-manifest',
  playerAnchors: 'motion-pilot:player-anchors',
  creatureManifest: 'motion-pilot:creature-manifest',
  creatureAnchors: 'motion-pilot:creature-anchors',
} as const;

export interface MotionPilotImageAsset {
  packageId: 'player' | 'act1';
  path: string;
  key: string;
  url: string;
}

export interface MotionPilotJsonAsset {
  key: string;
  path: string;
  url: string;
}

const images: readonly MotionPilotImageAsset[] = Object.entries({ ...playerFrameAssets, ...creatureFrameAssets })
  .map(([modulePath, url]) => {
    const resolved = packagePath(modulePath);
    return { ...resolved, key: motionPilotTextureKey(resolved.packageId, resolved.path), url };
  })
  .sort((left, right) => left.key.localeCompare(right.key));

const jsonKeyForPath = (path: string): string => {
  if (path.endsWith('PLAYER_MOTION_MANIFEST.json')) return MOTION_PILOT_CACHE_KEYS.playerManifest;
  if (path.endsWith('PLAYER_ANCHOR_OFFSETS.json')) return MOTION_PILOT_CACHE_KEYS.playerAnchors;
  if (path.endsWith('MOTION_FRAME_MANIFEST_PILOT_v1.json')) return MOTION_PILOT_CACHE_KEYS.creatureManifest;
  if (path.endsWith('PER_FRAME_ANCHOR_OFFSET_PILOT_v1.json')) return MOTION_PILOT_CACHE_KEYS.creatureAnchors;
  throw new Error(`[MotionPilotAssets] Unknown motion pilot JSON: ${path}`);
};

const json: readonly MotionPilotJsonAsset[] = Object.entries(jsonAssets).map(([modulePath, url]) => {
  const resolved = packagePath(modulePath);
  return { key: jsonKeyForPath(resolved.path), path: resolved.path, url };
});

const excludedSegment = /(^|\/)(review|previews|before_after|sprite_sheets|reports|tools)(\/|$)|\.(mp4|pptx?)$/i;

export const motionPilotImageEntries = (enabled = motionPilotEnabled()): readonly MotionPilotImageAsset[] => enabled ? images : [];
export const motionPilotJsonEntries = (enabled = motionPilotEnabled()): readonly MotionPilotJsonAsset[] => enabled ? json : [];

export const motionPilotAssetAudit = (): Readonly<{
  playerFrames: number;
  creatureFrames: number;
  directionLocks: number;
  duplicateKeys: readonly string[];
  disallowed: readonly string[];
}> => {
  const keys = new Set<string>();
  const duplicateKeys: string[] = [];
  for (const image of images) {
    if (keys.has(image.key)) duplicateKeys.push(image.key);
    keys.add(image.key);
  }
  return {
    playerFrames: images.filter((asset) => asset.packageId === 'player').length,
    creatureFrames: images.filter((asset) => asset.packageId === 'act1').length,
    directionLocks: images.filter((asset) => asset.path.startsWith('player/direction_lock/')).length,
    duplicateKeys,
    disallowed: images.filter((asset) => excludedSegment.test(asset.path)).map((asset) => asset.path),
  };
};
