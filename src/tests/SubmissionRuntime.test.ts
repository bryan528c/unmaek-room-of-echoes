import { describe, expect, it } from 'vitest';
import { RunActDirector } from '../game/systems/RunActDirector';
import {
  backgroundCueCreatureIdsForAct,
  bossDefeatPresentationFor,
  combatCreatureIdsForAct,
  creatureIdForEnemyKind,
  flipSourceAnchor,
  flipSourceRect,
  gamePointToSource,
  invalidRuntimeAliases,
  isRuntimeAssetAllowed,
  nearestSourceMaskPixel,
  queryRuntimeMask,
  resolveMapDefinition,
  resolveCreatureState,
  resolveWorldAttackAnchor,
  resolveWorldHurtbox,
  RUNTIME_ASSET_REFERENCES,
  sourcePointToGame,
  sourceRectToGame,
  shouldRestoreHitPresentation,
  type RuntimeMaskPixels,
} from '../game/runtime/SubmissionRuntime';
import { runtimeAssetAudit } from '../game/runtime/SubmissionRuntimeAssets';

const mask = (whiteAt: readonly [number, number][]): RuntimeMaskPixels => {
  const width = 4; const height = 2; const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  for (const [x, y] of whiteAt) {
    const offset = (y * width + x) * 4;
    data[offset] = 255; data[offset + 1] = 255; data[offset + 2] = 255;
  }
  return { width, height, data };
};

describe('submission runtime coordinate and mask contract', () => {
  it('uses the single 1280x720 to 960x540 scale for points and rects', () => {
    expect(sourcePointToGame({ x: 1280, y: 720 })).toEqual({ x: 960, y: 540 });
    expect(sourceRectToGame({ x: 100, y: 80, width: 200, height: 120 })).toEqual({ x: 75, y: 60, width: 150, height: 90 });
    expect(gamePointToSource({ x: 960, y: 540 })).toEqual({ x: 1280, y: 720 });
  });

  it('inverse-samples the original mask with nearest-neighbor coordinates', () => {
    const pixels = mask([[2, 1]]);
    expect(nearestSourceMaskPixel(pixels, { x: 1.5, y: 0.75 })).toEqual({ x: 2, y: 1, white: true });
    expect(nearestSourceMaskPixel(pixels, { x: 0.75, y: 0 })).toEqual({ x: 1, y: 0, white: false });
  });

  it('interprets white and black according to collision and hazard semantics', () => {
    const pixels = mask([[2, 1]]);
    expect(queryRuntimeMask(pixels, { x: 1.5, y: 0.75 }, 'collision')).toBe(true);
    expect(queryRuntimeMask(pixels, { x: 0.75, y: 0 }, 'collision')).toBe(false);
    expect(queryRuntimeMask(pixels, { x: 1.5, y: 0.75 }, 'hazard')).toBe(true);
    expect(queryRuntimeMask(pixels, { x: 0.75, y: 0 }, 'hazard')).toBe(false);
  });
});

describe('submission creature metadata contract', () => {
  it('uses the central flip formula for anchors and rects', () => {
    expect(flipSourceAnchor({ x: 9, y: 22 }, 72)).toEqual({ x: 63, y: 22 });
    expect(flipSourceRect({ x: 9, y: 12, width: 48, height: 22 }, 72)).toEqual({ x: 15, y: 12, width: 48, height: 22 });
    expect(resolveWorldAttackAnchor('rewind_lizard', { x: 100, y: 200 }, false)).toEqual({ x: 82, y: 191 });
    expect(resolveWorldAttackAnchor('rewind_lizard', { x: 100, y: 200 }, true)).toEqual({ x: 118, y: 191 });
  });

  it('converts the metadata hurtbox around the Ground Point', () => {
    expect(resolveWorldHurtbox('rewind_lizard', { x: 100, y: 200 }, false)).toEqual({
      x: 100, y: 191.75, radiusX: 18, radiusY: 8.25,
    });
    expect(resolveWorldHurtbox('rewind_lizard', { x: 100, y: 200 }, true)).toEqual({
      x: 100, y: 191.75, radiusX: 18, radiusY: 8.25,
    });
  });

  it('resolves aliases exactly one hop and preserves visual transforms', () => {
    const hit = resolveCreatureState('deflect_bat', 'hit');
    expect(hit).toMatchObject({ sourceState: 'move', aliased: true, tint: '#B94A3E', shake: true });
    expect(resolveCreatureState('rewind_lizard', 'prep').rotationDeg).toBe(-3);
    expect(resolveCreatureState('channel_otter_mother', 'phase2')).toMatchObject({
      sourceState: 'warning', scale: 1.03,
      overlayFiles: ['vfx/channel_otter_mother_water_membrane_overlay.png'],
    });
    expect(resolveCreatureState('channel_otter_mother', 'retreat')).toMatchObject({ rotationDeg: 3, flipX: true });
    expect(invalidRuntimeAliases()).toEqual([]);
  });

  it('does not let a stale hit callback overwrite a new boss phase state', () => {
    expect(shouldRestoreHitPresentation(true, 'hit')).toBe(true);
    expect(shouldRestoreHitPresentation(true, 'phase2')).toBe(false);
    expect(shouldRestoreHitPresentation(false, 'phase2')).toBe(false);
  });
});

describe('submission runtime isolation and lifecycle contract', () => {
  it('loads the manifest allowlist only and rejects review/source artifacts', () => {
    const audit = runtimeAssetAudit();
    expect(audit).toMatchObject({ referenceCount: 62, discoveredCount: 62, missing: [], unreferenced: [], disallowed: [] });
    expect(RUNTIME_ASSET_REFERENCES).toHaveLength(62);
    expect(isRuntimeAssetAllowed('creatures/act1/rewind_lizard/master/x.png')).toBe(false);
    expect(isRuntimeAssetAllowed('previews/contact_sheet.png')).toBe(false);
    expect(isRuntimeAssetAllowed('source_boards/review_overlay.png')).toBe(false);
  });

  it('keeps background cues outside combat aggregation', () => {
    expect(backgroundCueCreatureIdsForAct(1)).toEqual(['pressure_swift']);
    expect(combatCreatureIdsForAct(1)).not.toContain('pressure_swift');
    expect(['chaser', 'archer', 'ink'].map((kind) => creatureIdForEnemyKind(1, kind as 'chaser' | 'archer' | 'ink'))).toEqual([
      'rewind_lizard', 'deflect_bat', 'mineral_spider',
    ]);
  });

  it('maps Act 2 onto only the existing chaser and projectile roles without hazards', () => {
    expect(['chaser', 'archer'].map((kind) => creatureIdForEnemyKind(2, kind as 'chaser' | 'archer'))).toEqual([
      'resonance_civet', 'pleated_frog',
    ]);
    expect(creatureIdForEnemyKind(2, 'ink')).toBeUndefined();
    expect(resolveMapDefinition('act2_general').hazardMaskFile).toBeNull();
    expect(resolveMapDefinition('act2_boss').hazardMaskFile).toBeNull();
    expect(bossDefeatPresentationFor('diffraction_pangolin').mode).toBe('nonlethal-retreat');
  });

  it('maps Act 3 onto the existing defense and projectile roles without hazards', () => {
    expect(['elite', 'archer'].map((kind) => creatureIdForEnemyKind(3, kind as 'elite' | 'archer'))).toEqual([
      'flowjaw_crab', 'pulsebarbel_catfish',
    ]);
    expect(resolveMapDefinition('act3_general').hazardMaskFile).toBeNull();
    expect(resolveMapDefinition('act3_boss').hazardMaskFile).toBeNull();
    expect(bossDefeatPresentationFor('channel_otter_mother').mode).toBe('nonlethal-retreat');
  });

  it('keeps the existing boss-clear statistics path for nonlethal retreat', () => {
    expect(bossDefeatPresentationFor('resonance_goral').mode).toBe('nonlethal-retreat');
    const director = new RunActDirector();
    expect(director.beginRun(1)).toBe(true);
    director.completeBoss(12_000, 7);
    expect(director.snapshot()).toMatchObject({ bossesDefeated: 1, completedActs: 1 });
    expect(director.snapshot().results[0]).toMatchObject({ bossDefeated: true, damageTaken: 7 });
  });
});
