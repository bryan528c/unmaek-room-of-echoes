import { isRuntimeAssetAllowed, RUNTIME_ASSET_REFERENCES, runtimeTextureKey } from './SubmissionRuntime';

type ViteAssetModules = Readonly<Record<string, string>>;

const creatureAssets = import.meta.glob('../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/creatures/*/*/runtime/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const mapBackgroundAssets = import.meta.glob('../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/*/*_bg_1280x720.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const collisionMaskAssets = import.meta.glob('../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/*/*_collision.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const hazardMaskAssets = import.meta.glob('../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/maps/*/*_hazard.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;
const vfxAssets = import.meta.glob('../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/vfx/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as ViteAssetModules;

const packageMarker = '/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/';
const toPackagePath = (modulePath: string): string => {
  const normalized = modulePath.replaceAll('\\', '/');
  const markerIndex = normalized.indexOf(packageMarker);
  if (markerIndex < 0) throw new Error(`[SubmissionRuntimeAssets] Path is outside the runtime package: ${modulePath}`);
  return normalized.slice(markerIndex + packageMarker.length);
};

const discoveredModules: ViteAssetModules = {
  ...creatureAssets,
  ...mapBackgroundAssets,
  ...collisionMaskAssets,
  ...hazardMaskAssets,
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
