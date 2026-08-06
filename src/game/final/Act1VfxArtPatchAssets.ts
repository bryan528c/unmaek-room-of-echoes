import { ACT1_VFX_PATCH_DIRECTIONS, act1VfxArtPatchEnabled } from './Act1VfxArtPatchConfig';

type ViteAssetModules = Readonly<Record<string, string>>;

const playerSlashFrames = import.meta.glob(
  '../../../handoff/UNMAEK_ACT1_VFX_FINAL_ART_PATCH_v1/player_slash/*.png',
  { eager: true, query: '?url', import: 'default' },
) as ViteAssetModules;
const batSonicFrames = import.meta.glob(
  '../../../handoff/UNMAEK_ACT1_VFX_FINAL_ART_PATCH_v1/bat_sonic/*.png',
  { eager: true, query: '?url', import: 'default' },
) as ViteAssetModules;
const spiderWebFrames = import.meta.glob(
  '../../../handoff/UNMAEK_ACT1_VFX_FINAL_ART_PATCH_v1/spider_web/*.png',
  { eager: true, query: '?url', import: 'default' },
) as ViteAssetModules;
const goralStoneFrames = import.meta.glob(
  '../../../handoff/UNMAEK_ACT1_VFX_FINAL_ART_PATCH_v1/goral_stone/*.png',
  { eager: true, query: '?url', import: 'default' },
) as ViteAssetModules;

const MARKER = '/UNMAEK_ACT1_VFX_FINAL_ART_PATCH_v1/';
const normalize = (value: string): string => value.replaceAll('\\', '/');
const packagePath = (modulePath: string): string => {
  const normalized = normalize(modulePath);
  const index = normalized.indexOf(MARKER);
  if (index < 0) throw new Error(`[Act1VfxArtPatchAssets] Path outside handoff: ${modulePath}`);
  return normalized.slice(index + MARKER.length);
};

export const act1VfxPatchTextureKey = (path: string): string => `act1-vfx-patch:${normalize(path)}`;

export interface Act1VfxPatchImageAsset {
  path: string;
  key: string;
  url: string;
  category: 'player_slash' | 'bat_sonic' | 'spider_web' | 'goral_stone';
}

const categoryForPath = (path: string): Act1VfxPatchImageAsset['category'] => {
  const category = path.split('/')[0];
  if (category === 'player_slash' || category === 'bat_sonic' || category === 'spider_web' || category === 'goral_stone') return category;
  throw new Error(`[Act1VfxArtPatchAssets] Disallowed category: ${path}`);
};

const images: readonly Act1VfxPatchImageAsset[] = Object.entries({
  ...playerSlashFrames,
  ...batSonicFrames,
  ...spiderWebFrames,
  ...goralStoneFrames,
}).map(([modulePath, url]) => {
  const path = packagePath(modulePath);
  return { path, key: act1VfxPatchTextureKey(path), url, category: categoryForPath(path) };
}).sort((left, right) => left.key.localeCompare(right.key));

const frame = (prefix: string, index: number): string => `${prefix}_F${String(index).padStart(2, '0')}.png`;
const sequence = (folder: string, prefix: string, count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => `${folder}/${frame(prefix, index + 1)}`);

export const ACT1_VFX_PATCH_SEQUENCE_PATHS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(ACT1_VFX_PATCH_DIRECTIONS.map((direction) => [
    `player_slash:${direction}`,
    sequence('player_slash', `PLAYER_SLASH_${direction.toUpperCase()}`, 5),
  ])),
  'bat_sonic:form': sequence('bat_sonic', 'BAT_SONIC_FORM', 3),
  'bat_sonic:launch': sequence('bat_sonic', 'BAT_SONIC_LAUNCH', 2),
  'bat_sonic:travel': sequence('bat_sonic', 'BAT_SONIC_TRAVEL', 3),
  'bat_sonic:impact': sequence('bat_sonic', 'BAT_SONIC_IMPACT', 5),
  'spider_web:form': sequence('spider_web', 'SPIDER_WEB_FORM', 3),
  'spider_web:launch': sequence('spider_web', 'SPIDER_WEB_LAUNCH', 2),
  'spider_web:travel': sequence('spider_web', 'SPIDER_WEB_TRAVEL', 3),
  'spider_web:impact': sequence('spider_web', 'SPIDER_WEB_IMPACT', 5),
  'goral_stone:travel': sequence('goral_stone', 'GORAL_STONE_TRAVEL', 4),
  'goral_stone:impact': sequence('goral_stone', 'GORAL_STONE_IMPACT', 5),
};

const expectedPaths = new Set(Object.values(ACT1_VFX_PATCH_SEQUENCE_PATHS).flat());
const disallowedPattern = /(^|\/)(word_core3|previews|review|reports|source_boards|tools)(\/|$)|ACT1_VFX_FINAL_REVIEW_BOARD|\.(mp4|pptx?)$/i;

export const act1VfxPatchImageEntries = (enabled = act1VfxArtPatchEnabled()): readonly Act1VfxPatchImageAsset[] => enabled ? images : [];
export const act1VfxPatchSequencePaths = (sequenceId: string): readonly string[] => ACT1_VFX_PATCH_SEQUENCE_PATHS[sequenceId] ?? [];

export const act1VfxPatchAssetAudit = (): Readonly<{
  playerSlash: number;
  batSonic: number;
  spiderWeb: number;
  goralStone: number;
  total: number;
  missingExpected: readonly string[];
  unexpected: readonly string[];
  duplicateKeys: readonly string[];
  disallowed: readonly string[];
  wordCore3Preload: 0;
}> => {
  const seen = new Set<string>();
  const duplicateKeys: string[] = [];
  for (const image of images) {
    if (seen.has(image.key)) duplicateKeys.push(image.key);
    seen.add(image.key);
  }
  const actualPaths = new Set(images.map((image) => image.path));
  return {
    playerSlash: images.filter((asset) => asset.category === 'player_slash').length,
    batSonic: images.filter((asset) => asset.category === 'bat_sonic').length,
    spiderWeb: images.filter((asset) => asset.category === 'spider_web').length,
    goralStone: images.filter((asset) => asset.category === 'goral_stone').length,
    total: images.length,
    missingExpected: [...expectedPaths].filter((path) => !actualPaths.has(path)),
    unexpected: images.map((image) => image.path).filter((path) => !expectedPaths.has(path)),
    duplicateKeys,
    disallowed: images.filter((asset) => disallowedPattern.test(asset.path)).map((asset) => asset.path),
    wordCore3Preload: 0,
  };
};

