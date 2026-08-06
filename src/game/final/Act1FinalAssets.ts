import { act1FinalEnabled } from './Act1FinalConfig';

type ViteAssetModules = Readonly<Record<string, string>>;

const playerFrames = import.meta.glob(
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/player/{n,ne,e,se,s,sw,w,nw}/{idle,move,dash,basic_attack,parry,word_skill,hit_recover}/*.png',
  { eager: true, query: '?url', import: 'default' },
) as ViteAssetModules;

const creatureFrames = import.meta.glob([
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/creatures/*/readability_corrected/*.png',
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/creatures/*/readability_verified/**/*.png',
  '!../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/creatures/**/*sheet*.png',
  // The current presentation has one combined stunned_or_retreat sequence, so these
  // semantically distinct candidates stay in the handoff until an existing signal can
  // select them without inventing a gameplay state.
  '!../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/creatures/mineral_spider/readability_corrected/act1_mineral_spider_stunned_front_corrected_candidate_104x88.png',
  '!../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/creatures/mineral_spider/readability_corrected/act1_mineral_spider_retreat_side_corrected_candidate_104x88.png',
], { eager: true, query: '?url', import: 'default' }) as ViteAssetModules;

const vfxFrames = import.meta.glob([
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/vfx/**/*.png',
  '!../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/vfx/**/*sheet*.png',
],
  { eager: true, query: '?url', import: 'default' },
) as ViteAssetModules;

const jsonAssets = import.meta.glob([
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/PLAYER_FULL8_MOTION_MANIFEST.json',
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/PLAYER_FULL8_ANCHORS.json',
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/ACT1_VFX_MANIFEST.json',
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/ACT1_VFX_EVENT_MAP.json',
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/creatures/READABILITY_STATUS.json',
  '../../../handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/creatures/ACT1_CREATURE_NATIVE_ANCHORS.json',
], { eager: true, query: '?url', import: 'default' }) as ViteAssetModules;

const MARKER = '/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/';
const normalize = (value: string): string => value.replaceAll('\\', '/');
const packagePath = (modulePath: string): string => {
  const normalized = normalize(modulePath);
  const index = normalized.indexOf(MARKER);
  if (index < 0) throw new Error(`[Act1FinalAssets] Path outside handoff: ${modulePath}`);
  return normalized.slice(index + MARKER.length);
};

export const act1FinalTextureKey = (path: string): string => `act1-final:${normalize(path)}`;

export const ACT1_FINAL_CACHE_KEYS = {
  playerManifest: 'act1-final:player-manifest',
  playerAnchors: 'act1-final:player-anchors',
  vfxManifest: 'act1-final:vfx-manifest',
  vfxEventMap: 'act1-final:vfx-event-map',
  creatureStatus: 'act1-final:creature-status',
  creatureAnchors: 'act1-final:creature-anchors',
} as const;

export interface Act1FinalImageAsset { path: string; key: string; url: string; category: 'player' | 'corrected' | 'verified' | 'vfx' }
export interface Act1FinalJsonAsset { path: string; key: string; url: string }

const category = (path: string): Act1FinalImageAsset['category'] => {
  if (path.startsWith('player/')) return 'player';
  if (path.startsWith('vfx/')) return 'vfx';
  return path.includes('/readability_corrected/') ? 'corrected' : 'verified';
};

const images: readonly Act1FinalImageAsset[] = Object.entries({ ...playerFrames, ...creatureFrames, ...vfxFrames })
  .map(([modulePath, url]) => {
    const path = packagePath(modulePath);
    return { path, key: act1FinalTextureKey(path), url, category: category(path) };
  })
  .sort((left, right) => left.key.localeCompare(right.key));

const jsonKey = (path: string): string => {
  if (path.endsWith('PLAYER_FULL8_MOTION_MANIFEST.json')) return ACT1_FINAL_CACHE_KEYS.playerManifest;
  if (path.endsWith('PLAYER_FULL8_ANCHORS.json')) return ACT1_FINAL_CACHE_KEYS.playerAnchors;
  if (path.endsWith('ACT1_VFX_MANIFEST.json')) return ACT1_FINAL_CACHE_KEYS.vfxManifest;
  if (path.endsWith('ACT1_VFX_EVENT_MAP.json')) return ACT1_FINAL_CACHE_KEYS.vfxEventMap;
  if (path.endsWith('READABILITY_STATUS.json')) return ACT1_FINAL_CACHE_KEYS.creatureStatus;
  if (path.endsWith('ACT1_CREATURE_NATIVE_ANCHORS.json')) return ACT1_FINAL_CACHE_KEYS.creatureAnchors;
  throw new Error(`[Act1FinalAssets] Unknown JSON: ${path}`);
};

const json: readonly Act1FinalJsonAsset[] = Object.entries(jsonAssets).map(([modulePath, url]) => {
  const path = packagePath(modulePath);
  return { path, key: jsonKey(path), url };
});

const disallowedPattern = /(^|\/)(previews|review|reports|source_boards|tools|sprite_sheets)(\/|$)|\.(mp4|pptx?)$/i;

export const act1FinalImageEntries = (enabled = act1FinalEnabled()): readonly Act1FinalImageAsset[] => enabled ? images : [];
export const act1FinalJsonEntries = (enabled = act1FinalEnabled()): readonly Act1FinalJsonAsset[] => enabled ? json : [];

export const act1FinalImagePaths = (categoryName?: Act1FinalImageAsset['category']): readonly string[] =>
  images.filter((asset) => categoryName === undefined || asset.category === categoryName).map((asset) => asset.path);

export const act1FinalAssetAudit = (): Readonly<{
  playerFrames: number; correctedFrames: number; verifiedFrames: number; vfxFrames: number;
  jsonFiles: number; duplicateKeys: readonly string[]; disallowed: readonly string[];
}> => {
  const seen = new Set<string>(); const duplicateKeys: string[] = [];
  for (const image of images) { if (seen.has(image.key)) duplicateKeys.push(image.key); seen.add(image.key); }
  return {
    playerFrames: images.filter((asset) => asset.category === 'player').length,
    correctedFrames: images.filter((asset) => asset.category === 'corrected').length,
    verifiedFrames: images.filter((asset) => asset.category === 'verified').length,
    vfxFrames: images.filter((asset) => asset.category === 'vfx').length,
    jsonFiles: json.length,
    duplicateKeys,
    disallowed: [...images, ...json].filter((asset) => disallowedPattern.test(asset.path)).map((asset) => asset.path),
  };
};
