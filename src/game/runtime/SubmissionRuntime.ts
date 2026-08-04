import creatureManifestJson from '../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/manifest/creature_manifest_v1.json?raw';
import displayStringsJson from '../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/manifest/display_strings_v1.json?raw';
import mapManifestJson from '../../../handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/manifest/map_manifest_v1.json?raw';

export const SUBMISSION_SOURCE_WIDTH = 1280;
export const SUBMISSION_SOURCE_HEIGHT = 720;
export const SUBMISSION_GAME_SCALE = 0.75;

export interface RuntimePoint {
  x: number;
  y: number;
}

export interface RuntimeRect extends RuntimePoint {
  width: number;
  height: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

interface RuntimeAnchorValue {
  normalized: NormalizedPoint;
  pixel: RuntimePoint;
}

interface RuntimeFlippableAnchor {
  original: RuntimeAnchorValue;
  flippedX: RuntimeAnchorValue | null;
}

interface RuntimeAttackAnchor extends RuntimeFlippableAnchor {
  id: string;
}

interface RuntimeHurtbox {
  original: RuntimeRect;
  flippedX: RuntimeRect | null;
  source: string;
}

interface RuntimeStateDefinition {
  resolution: 'unique-asset';
  assetKey: string;
  direction: string;
  file: string;
}

export interface RuntimeStateAlias {
  sourceState: string;
  rotationDeg?: number;
  scale?: number;
  tint?: string | null;
  shake?: boolean;
  flipX?: boolean;
  overlayFiles?: readonly string[];
  replaceAfterSubmission?: boolean;
}

interface RuntimeBossPhaseEntry {
  state: string;
  displayStringKey?: string;
  overlayFiles?: readonly string[];
}

export type RuntimeCreatureRole = 'environmental-cue' | 'regular-enemy' | 'boss';
export type RuntimeAiRole = 'background-cue' | 'chaser-melee' | 'projectile' | 'area-control' | 'defense-melee' | 'boss-3phase';
export type RuntimeDirectionMode = 'fixed' | 'flipX' | 'front-side' | 'front-back-side';

export interface RuntimeCreatureMetadata {
  id: string;
  displayName: string;
  act: 1 | 2 | 3;
  role: RuntimeCreatureRole;
  aiArchetypeRole: RuntimeAiRole;
  directionMode: RuntimeDirectionMode;
  canvasSize: { width: number; height: number };
  runtimeScale: number;
  groundPoint: RuntimeFlippableAnchor;
  shadowAnchor: RuntimeFlippableAnchor & { mode: 'procedural'; notes: string };
  hurtbox: RuntimeHurtbox | null;
  attackAnchors: readonly RuntimeAttackAnchor[];
  states: Readonly<Record<string, RuntimeStateDefinition>>;
  stateAliases: Readonly<Record<string, RuntimeStateAlias>>;
  bossPhaseMap: Readonly<Record<string, RuntimeBossPhaseEntry>> | null;
  runtimeFiles: Readonly<Record<string, string>>;
  optionalOverlays: readonly { id: string; file: string }[];
}

interface CreatureManifest {
  schemaVersion: number;
  packageId: string;
  creatures: readonly RuntimeCreatureMetadata[];
}

export type RuntimeForegroundOcclusion =
  | { id: string; shape: 'polygon'; points: readonly (readonly [number, number])[]; alphaWhenOccluding: number }
  | { id: string; shape: 'circle'; center: RuntimePoint; radius: number; alphaWhenOccluding: number }
  | { id: string; shape: 'ellipse'; bounds: RuntimeRect; alphaWhenOccluding: number }
  | { id: string; shape: 'edge-band'; width: number; alphaWhenOccluding: number }
  | { id: string; shape: 'multiple-ellipses'; bounds: readonly (readonly [number, number, number, number])[]; alphaWhenOccluding: number };

export type RuntimeBossTerritory =
  | { shape: 'circle'; center: RuntimePoint; radius: number }
  | { shape: 'ellipse'; bounds: RuntimeRect };

export interface RuntimeMapDefinition {
  id: string;
  displayName: string;
  act: 1 | 2 | 3;
  width: 1280;
  height: 720;
  backgroundFile: string;
  collisionMaskFile: string;
  hazardMaskFile: string | null;
  playerSpawn: RuntimePoint;
  enemySpawnSlots: readonly (RuntimePoint & { id: string })[];
  bossSpawn: RuntimePoint | null;
  bossTerritory: RuntimeBossTerritory | null;
  safeMargins: { top: number; right: number; bottom: number; left: number };
  mapBounds: RuntimeRect;
  foregroundOcclusion: readonly RuntimeForegroundOcclusion[];
}

interface MapManifest {
  schemaVersion: number;
  maps: readonly RuntimeMapDefinition[];
}

interface DisplayStringsManifest {
  schemaVersion: number;
  acts: Readonly<Record<string, string>>;
  maps: Readonly<Record<string, string>>;
  creatures: Readonly<Record<string, string>>;
  bosses: Readonly<Record<string, string>>;
  bossPhases: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface ResolvedRuntimeState {
  requestedState: string;
  sourceState: string;
  assetFile: string;
  rotationDeg: number;
  scale: number;
  tint: string | null;
  shake: boolean;
  flipX: boolean;
  overlayFiles: readonly string[];
  aliased: boolean;
}

export interface RuntimeMaskPixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export type RuntimeMaskKind = 'collision' | 'hazard';

const creatureManifest = JSON.parse(creatureManifestJson) as CreatureManifest;
const mapManifest = JSON.parse(mapManifestJson) as MapManifest;
const displayStrings = JSON.parse(displayStringsJson) as DisplayStringsManifest;

const creaturesById = new Map(creatureManifest.creatures.map((creature) => [creature.id, creature]));
const mapsById = new Map(mapManifest.maps.map((map) => [map.id, map]));

export const sourcePointToGame = (point: Readonly<RuntimePoint>): RuntimePoint => ({
  x: point.x * SUBMISSION_GAME_SCALE,
  y: point.y * SUBMISSION_GAME_SCALE,
});

export const sourceRectToGame = (rect: Readonly<RuntimeRect>): RuntimeRect => ({
  x: rect.x * SUBMISSION_GAME_SCALE,
  y: rect.y * SUBMISSION_GAME_SCALE,
  width: rect.width * SUBMISSION_GAME_SCALE,
  height: rect.height * SUBMISSION_GAME_SCALE,
});

export const gamePointToSource = (point: Readonly<RuntimePoint>): RuntimePoint => ({
  x: point.x / SUBMISSION_GAME_SCALE,
  y: point.y / SUBMISSION_GAME_SCALE,
});

export const flipSourceAnchor = (point: Readonly<RuntimePoint>, canvasWidth: number): RuntimePoint => ({
  x: canvasWidth - point.x,
  y: point.y,
});

export const flipSourceRect = (rect: Readonly<RuntimeRect>, canvasWidth: number): RuntimeRect => ({
  x: canvasWidth - rect.x - rect.width,
  y: rect.y,
  width: rect.width,
  height: rect.height,
});

export const isSubmissionCreatureId = (value: string): boolean => creaturesById.has(value);

export const resolveCreatureMetadata = (creatureId: string): RuntimeCreatureMetadata => {
  const creature = creaturesById.get(creatureId);
  if (!creature) throw new Error(`[SubmissionRuntime] Unknown creature id: ${creatureId}`);
  return creature;
};

export const resolveMapDefinition = (mapId: string): RuntimeMapDefinition => {
  const map = mapsById.get(mapId);
  if (!map) throw new Error(`[SubmissionRuntime] Unknown map id: ${mapId}`);
  return map;
};

export const submissionMapId = (act: number, encounter: 'general' | 'boss'): string | undefined => {
  const id = `act${act}_${encounter}`;
  return mapsById.has(id) ? id : undefined;
};

export const resolveCreatureState = (creatureId: string, stateId: string): ResolvedRuntimeState => {
  const creature = resolveCreatureMetadata(creatureId);
  const direct = creature.states[stateId];
  if (direct) return {
    requestedState: stateId,
    sourceState: stateId,
    assetFile: direct.file,
    rotationDeg: 0,
    scale: 1,
    tint: null,
    shake: false,
    flipX: false,
    overlayFiles: [],
    aliased: false,
  };

  const alias = creature.stateAliases[stateId];
  if (!alias) throw new Error(`[SubmissionRuntime] Missing state ${creatureId}:${stateId}`);
  if (creature.stateAliases[alias.sourceState]) {
    throw new Error(`[SubmissionRuntime] Alias chains are forbidden: ${creatureId}:${stateId} -> ${alias.sourceState}`);
  }
  const source = creature.states[alias.sourceState];
  if (!source) throw new Error(`[SubmissionRuntime] Alias source is not a unique state: ${creatureId}:${stateId} -> ${alias.sourceState}`);
  return {
    requestedState: stateId,
    sourceState: alias.sourceState,
    assetFile: source.file,
    rotationDeg: alias.rotationDeg ?? 0,
    scale: alias.scale ?? 1,
    tint: alias.tint ?? null,
    shake: alias.shake ?? false,
    flipX: alias.flipX ?? false,
    overlayFiles: [...(alias.overlayFiles ?? [])],
    aliased: true,
  };
};

export const invalidRuntimeAliases = (): readonly string[] => creatureManifest.creatures.flatMap((creature) => (
  Object.entries(creature.stateAliases).flatMap(([stateId, alias]) => {
    if (creature.stateAliases[alias.sourceState]) return [`${creature.id}:${stateId}->${alias.sourceState} (chain)`];
    if (!creature.states[alias.sourceState]) return [`${creature.id}:${stateId}->${alias.sourceState} (missing)`];
    return [];
  })
));

export const resolveBossPhaseState = (creatureId: string, phase: 1 | 2 | 3 | 'preFight' | 'defeated/nonlethal'): ResolvedRuntimeState => {
  const creature = resolveCreatureMetadata(creatureId);
  const entry = creature.bossPhaseMap?.[typeof phase === 'number' ? `phase${phase}` : phase];
  if (!entry) throw new Error(`[SubmissionRuntime] Missing boss phase ${creatureId}:${String(phase)}`);
  const state = resolveCreatureState(creatureId, entry.state);
  return { ...state, overlayFiles: [...new Set([...state.overlayFiles, ...(entry.overlayFiles ?? [])])] };
};

const flippableAnchorValue = (anchor: RuntimeFlippableAnchor, flipped: boolean): RuntimeAnchorValue => (
  flipped && anchor.flippedX ? anchor.flippedX : anchor.original
);

export const runtimeSpriteOrigin = (creatureId: string, flipped: boolean): NormalizedPoint => {
  const anchor = flippableAnchorValue(resolveCreatureMetadata(creatureId).groundPoint, flipped);
  return { ...anchor.normalized };
};

export const resolveWorldHurtbox = (creatureId: string, groundPoint: Readonly<RuntimePoint>, flipped: boolean): Readonly<{ x: number; y: number; radiusX: number; radiusY: number }> | null => {
  const creature = resolveCreatureMetadata(creatureId);
  if (!creature.hurtbox) return null;
  const box = flipped && creature.hurtbox.flippedX ? creature.hurtbox.flippedX : creature.hurtbox.original;
  const anchor = flippableAnchorValue(creature.groundPoint, flipped).pixel;
  const scale = SUBMISSION_GAME_SCALE * creature.runtimeScale;
  return {
    x: groundPoint.x + (box.x + box.width / 2 - anchor.x) * scale,
    y: groundPoint.y + (box.y + box.height / 2 - anchor.y) * scale,
    radiusX: box.width * scale / 2,
    radiusY: box.height * scale / 2,
  };
};

export const resolveWorldAttackAnchor = (creatureId: string, groundPoint: Readonly<RuntimePoint>, flipped: boolean, anchorId?: string): RuntimePoint => {
  const creature = resolveCreatureMetadata(creatureId);
  const attackAnchor = anchorId ? creature.attackAnchors.find((anchor) => anchor.id === anchorId) : creature.attackAnchors[0];
  if (!attackAnchor) return { ...groundPoint };
  const anchor = flippableAnchorValue(attackAnchor, flipped).pixel;
  const ground = flippableAnchorValue(creature.groundPoint, flipped).pixel;
  const scale = SUBMISSION_GAME_SCALE * creature.runtimeScale;
  return { x: groundPoint.x + (anchor.x - ground.x) * scale, y: groundPoint.y + (anchor.y - ground.y) * scale };
};

export const resolveWorldShadowAnchor = (creatureId: string, groundPoint: Readonly<RuntimePoint>, flipped: boolean): RuntimePoint => {
  const creature = resolveCreatureMetadata(creatureId);
  const anchor = flippableAnchorValue(creature.shadowAnchor, flipped).pixel;
  const ground = flippableAnchorValue(creature.groundPoint, flipped).pixel;
  const scale = SUBMISSION_GAME_SCALE * creature.runtimeScale;
  return { x: groundPoint.x + (anchor.x - ground.x) * scale, y: groundPoint.y + (anchor.y - ground.y) * scale };
};

export const nearestSourceMaskPixel = (pixels: RuntimeMaskPixels, gamePoint: Readonly<RuntimePoint>): Readonly<{ x: number; y: number; white: boolean }> => {
  const source = gamePointToSource(gamePoint);
  const x = Math.max(0, Math.min(pixels.width - 1, Math.round(source.x)));
  const y = Math.max(0, Math.min(pixels.height - 1, Math.round(source.y)));
  const offset = (y * pixels.width + x) * 4;
  const white = pixels.data[offset] === 255 && pixels.data[offset + 1] === 255 && pixels.data[offset + 2] === 255;
  return { x, y, white };
};

export const queryRuntimeMask = (pixels: RuntimeMaskPixels, gamePoint: Readonly<RuntimePoint>, kind: RuntimeMaskKind): boolean => {
  const { white } = nearestSourceMaskPixel(pixels, gamePoint);
  // White is the positive value for both contracts: walkable for collision,
  // hazardous for hazard. The caller gives that positive value its meaning.
  return kind === 'collision' ? white : white;
};

const collectRuntimeAssetReferences = (): readonly string[] => {
  const references: string[] = [];
  for (const creature of creatureManifest.creatures) {
    for (const state of Object.values(creature.states)) references.push(state.file);
    for (const overlay of creature.optionalOverlays) references.push(overlay.file);
    for (const alias of Object.values(creature.stateAliases)) references.push(...(alias.overlayFiles ?? []));
    for (const phase of Object.values(creature.bossPhaseMap ?? {})) references.push(...(phase.overlayFiles ?? []));
  }
  for (const map of mapManifest.maps) {
    references.push(map.backgroundFile, map.collisionMaskFile);
    if (map.hazardMaskFile) references.push(map.hazardMaskFile);
  }
  return [...new Set(references)].sort();
};

export const RUNTIME_ASSET_REFERENCES = collectRuntimeAssetReferences();
const runtimeAssetReferenceSet = new Set(RUNTIME_ASSET_REFERENCES);

export const isRuntimeAssetAllowed = (path: string): boolean => runtimeAssetReferenceSet.has(path)
  && !/(^|\/)(master|source_boards|previews|reports|tools)(\/|$)/i.test(path)
  && !/(contact.?sheet|review.?overlay)/i.test(path);

export const runtimeTextureKey = (path: string): string => `submission:${path}`;

export const shouldRestoreHitPresentation = (hitStateApplied: boolean, currentState: string | undefined): boolean => (
  hitStateApplied && currentState === 'hit'
);

export const actDisplayName = (act: number): string => displayStrings.acts[`act${act}`] ?? `Act ${act}`;
export const mapDisplayName = (mapId: string): string => displayStrings.maps[mapId] ?? resolveMapDefinition(mapId).displayName;
export const creatureDisplayName = (creatureId: string): string => displayStrings.creatures[creatureId] ?? resolveCreatureMetadata(creatureId).displayName;
export const bossDisplayName = (creatureId: string): string => displayStrings.bosses[creatureId] ?? creatureDisplayName(creatureId);
export const bossPhaseDisplayName = (creatureId: string, phase: 1 | 2 | 3): string => displayStrings.bossPhases[creatureId]?.[`phase${phase}`] ?? `제${phase}형`;

export const creaturesForAct = (act: number): readonly RuntimeCreatureMetadata[] => creatureManifest.creatures.filter((creature) => creature.act === act);
export const combatCreatureIdsForAct = (act: number): readonly string[] => creaturesForAct(act).filter((creature) => creature.aiArchetypeRole !== 'background-cue').map((creature) => creature.id);
export const backgroundCueCreatureIdsForAct = (act: number): readonly string[] => creaturesForAct(act).filter((creature) => creature.aiArchetypeRole === 'background-cue').map((creature) => creature.id);
export const bossCreatureIdForAct = (act: number): string | undefined => creaturesForAct(act).find((creature) => creature.role === 'boss')?.id;

export const creatureIdForAiRole = (act: number, role: RuntimeAiRole): string | undefined => creaturesForAct(act).find((creature) => creature.aiArchetypeRole === role)?.id;

export const creatureIdForEnemyKind = (act: number, kind: 'chaser' | 'archer' | 'ink' | 'elite' | 'boss' | 'minion'): string | undefined => {
  if (kind === 'boss') return bossCreatureIdForAct(act);
  const role: RuntimeAiRole = kind === 'archer' ? 'projectile'
    : kind === 'ink' ? 'area-control'
      : kind === 'elite' ? 'defense-melee'
        : 'chaser-melee';
  return creatureIdForAiRole(act, role);
};

export const bossDefeatPresentationFor = (creatureId: string): Readonly<{ mode: 'nonlethal-retreat'; state: ResolvedRuntimeState }> | Readonly<{ mode: 'death' }> => {
  const creature = resolveCreatureMetadata(creatureId);
  if (!creature.bossPhaseMap?.['defeated/nonlethal']) return { mode: 'death' };
  return { mode: 'nonlethal-retreat', state: resolveBossPhaseState(creatureId, 'defeated/nonlethal') };
};

export const runtimePackageId = creatureManifest.packageId;
