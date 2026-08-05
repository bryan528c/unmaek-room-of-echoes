import { isRuntimeAssetAllowed, RUNTIME_ASSET_REFERENCES, runtimeTextureKey } from './SubmissionRuntime';

type ViteAssetModules = Readonly<Record<string, string>>;

const creatureAssets = import.meta.glob([
  '../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/creatures/*/*/runtime/*.png',
  '!../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/creatures/act1/mineral_spider/runtime/*.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const recoveryAct1CreatureAssets = import.meta.glob('../../../handoff/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/creatures/act1/mineral_spider/runtime_corrected/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const mapBackgroundAssets = import.meta.glob([
  '../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/*/*_bg_1280x720.png',
  '!../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/act1/*.png',
  '!../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/act2/*.png',
  '!../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/act3/*.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const collisionMaskAssets = import.meta.glob([
  '../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/*/*_collision.png',
  '!../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/act1/*.png',
  '!../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/act2/*.png',
  '!../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/act3/*.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const hazardMaskAssets = import.meta.glob([
  '../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/*/*_hazard.png',
  '!../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/act1/*.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const recoveryAct1MapAssets = import.meta.glob([
  '../../../handoff/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/maps/act1/*/*_bg_recovery_1280x720.png',
  '../../../handoff/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/maps/act1/*/*_collision_recovery.png',
  '../../../handoff/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/maps/act1/*/*_hazard_recovery.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const recoveryAct2MapAssets = import.meta.glob([
  '../../../handoff/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/maps/act2/*/*_bg_recovery_1280x720.png',
  '../../../handoff/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/maps/act2/*/*_collision_recovery.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const recoveryAct3MapAssets = import.meta.glob([
  '../../../handoff/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/maps/act3/*/*_bg_recovery_1280x720.png',
  '../../../handoff/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/maps/act3/*/*_collision_recovery.png',
], {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const vfxAssets = import.meta.glob('../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/vfx/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;

const packageMarkers = ['/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/', '/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/'] as const;
const toPackagePath = (modulePath: string): string => {
  const normalized = modulePath.replaceAll('\\', '/');
  for (const marker of packageMarkers) {
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) return normalized.slice(markerIndex + marker.length);
  }
  throw new Error(`[SubmissionRuntimeAssets] Path is outside the approved runtime packages: ${modulePath}`);
};

const discoveredModules: ViteAssetModules = {
  ...creatureAssets,
  ...recoveryAct1CreatureAssets,
  ...mapBackgroundAssets,
  ...collisionMaskAssets,
  ...hazardMaskAssets,
  ...recoveryAct1MapAssets,
  ...recoveryAct2MapAssets,
  ...recoveryAct3MapAssets,
  ...vfxAssets,
};

const discoveredByPackagePath = new Map<string, string>();
for (const [modulePath, url] of Object.entries(discoveredModules)) discoveredByPackagePath.set(toPackagePath(modulePath), url);

export interface RuntimeAssetAudit {
  referenceCount: number;
  discoveredCount: number;
  missing: readonly string[];
  unreferenced: readonly string[];
  disallowed: readonly string[];
}

export const runtimeAssetAudit = (): RuntimeAssetAudit => {
  const referenced = new Set(RUNTIME_ASSET_REFERENCES);
  const discovered = [...discoveredByPackagePath.keys()];
  return {
    referenceCount: RUNTIME_ASSET_REFERENCES.length,
    discoveredCount: discovered.length,
    missing: RUNTIME_ASSET_REFERENCES.filter((path) => !discoveredByPackagePath.has(path)),
    unreferenced: discovered.filter((path) => !referenced.has(path)).sort(),
    disallowed: discovered.filter((path) => !isRuntimeAssetAllowed(path)).sort(),
  };
};

export const runtimeAssetUrl = (path: string): string => {
  if (!isRuntimeAssetAllowed(path)) throw new Error(`[SubmissionRuntimeAssets] Asset is outside the manifest allowlist: ${path}`);
  const url = discoveredByPackagePath.get(path);
  if (!url) throw new Error(`[SubmissionRuntimeAssets] Manifest asset was not discovered: ${path}`);
  return url;
};

export const runtimeAssetEntries = (): readonly Readonly<{ path: string; key: string; url: string }>[] => RUNTIME_ASSET_REFERENCES.map((path) => ({
  path,
  key: runtimeTextureKey(path),
  url: runtimeAssetUrl(path),
}));
