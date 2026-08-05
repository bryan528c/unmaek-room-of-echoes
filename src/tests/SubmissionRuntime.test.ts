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
  resolveCreaturePresentationProfile,
  resolveMapDefinition,
  resolveCreatureState,
  resolveWorldAttackAnchor,
  resolveWorldHurtbox,
  runtimePresentationScale,
  runtimeSpriteOrigin,
  RUNTIME_ASSET_REFERENCES,
  sourcePointToGame,
  sourceRectToGame,
  SUBMISSION_FOREGROUND_DEPTH,
  SUBMISSION_HERO_PRESENTATION_SCALE,
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
    const left = resolveWorldAttackAnchor('rewind_lizard', { x: 100, y: 200 }, false);
    const right = resolveWorldAttackAnchor('rewind_lizard', { x: 100, y: 200 }, true);
    expect(left.x).toBeCloseTo(67.6); expect(left.y).toBeCloseTo(183.8);
    expect(right.x).toBeCloseTo(132.4); expect(right.y).toBeCloseTo(183.8);
  });

  it('converts the metadata hurtbox around the Ground Point', () => {
    const original = resolveWorldHurtbox('rewind_lizard', { x: 100, y: 200 }, false);
    const flipped = resolveWorldHurtbox('rewind_lizard', { x: 100, y: 200 }, true);
    expect(original?.x).toBeCloseTo(100); expect(original?.y).toBeCloseTo(185.15);
    expect(original?.radiusX).toBeCloseTo(32.4); expect(original?.radiusY).toBeCloseTo(14.85);
    expect(flipped?.x).toBeCloseTo(100); expect(flipped?.y).toBeCloseTo(185.15);
    expect(flipped?.radiusX).toBeCloseTo(32.4); expect(flipped?.radiusY).toBeCloseTo(14.85);
  });

  it('resolves presentation scale and hostile readability centrally', () => {
    expect(SUBMISSION_HERO_PRESENTATION_SCALE).toBeCloseTo(0.34);
    expect(runtimePresentationScale('deflect_bat')).toBeCloseTo(1.35);
    expect(resolveCreaturePresentationProfile('deflect_bat')).toMatchObject({ sizeTier: 'small', visualScale: 1.8, hostileReadability: 'neutral-outline', outlinePixels: 1, contactMode: 'shadow' });
    expect(resolveCreaturePresentationProfile('mineral_spider')).toMatchObject({ sizeTier: 'regular', visualScale: 0.95, outlinePixels: 1, contactMode: 'shadow' });
    expect(resolveCreaturePresentationProfile('resonance_civet')).toMatchObject({ sizeTier: 'regular', visualScale: 1, outlinePixels: 1, contactMode: 'shadow' });
    expect(resolveCreaturePresentationProfile('pleated_frog')).toMatchObject({ sizeTier: 'regular', visualScale: 1, outlinePixels: 1, contactMode: 'shadow' });
    expect(resolveCreaturePresentationProfile('diffraction_pangolin')).toMatchObject({ sizeTier: 'boss', visualScale: 1.12, outlinePixels: 2, contactMode: 'shadow' });
    expect(resolveCreaturePresentationProfile('flowjaw_crab')).toMatchObject({ sizeTier: 'defense', visualScale: 0.92, outlinePixels: 1, contactMode: 'ripple' });
    expect(resolveCreaturePresentationProfile('pulsebarbel_catfish')).toMatchObject({ sizeTier: 'regular', visualScale: 1.25, outlinePixels: 1, contactMode: 'ripple' });
    expect(resolveCreaturePresentationProfile('channel_otter_mother')).toMatchObject({ sizeTier: 'boss', visualScale: 1.4, outlinePixels: 2, contactMode: 'ripple' });
    expect(resolveCreaturePresentationProfile('resonance_goral')).toMatchObject({ sizeTier: 'boss', visualScale: 1.17, outlinePixels: 2, contactMode: 'shadow' });
    expect(resolveCreaturePresentationProfile('pressure_swift')).toMatchObject({ sizeTier: 'background-cue', visualScale: 2, hostileReadability: 'none', outlinePixels: 0, contactMode: 'none' });
  });

  it('keeps the mineral spider transform Ground Point-relative after its visual override', () => {
    expect(runtimePresentationScale('mineral_spider')).toBeCloseTo(0.7125);
    expect(runtimeSpriteOrigin('mineral_spider', false)).toEqual({ x: 0.5, y: 0.82 });
    const groundPoint = { x: 420, y: 310 };
    const hurtbox = resolveWorldHurtbox('mineral_spider', groundPoint, false);
    const attackAnchor = resolveWorldAttackAnchor('mineral_spider', groundPoint, false);
    expect(hurtbox?.x).toBeCloseTo(420); expect(hurtbox?.y).toBeCloseTo(292.1875);
    expect(hurtbox?.radiusX).toBeCloseTo(24.9375); expect(hurtbox?.radiusY).toBeCloseTo(17.8125);
    expect(attackAnchor.x).toBeCloseTo(409.3125); expect(attackAnchor.y).toBeCloseTo(283.6375);
    expect(resolveCreatureState('mineral_spider', 'idle').assetFile).toBe('creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_idle_front_corrected_candidate_104x88.png');
  });

  it('keeps submission foreground below Telegraphs and Ground Point sorted characters', () => {
    expect(SUBMISSION_FOREGROUND_DEPTH).toBeGreaterThan(20);
    expect(SUBMISSION_FOREGROUND_DEPTH).toBeLessThan(80);
    expect(SUBMISSION_FOREGROUND_DEPTH).toBeLessThan(200);
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
    expect(isRuntimeAssetAllowed('maps/act1/general/act1_general_gameplay_composite_960x540.png')).toBe(false);
  });

  it('uses only the approved Act 1 recovery map candidates and reviewed spawn data', () => {
    const general = resolveMapDefinition('act1_general');
    const boss = resolveMapDefinition('act1_boss');
    expect(general).toMatchObject({
      backgroundFile: 'maps/act1/general/act1_general_bg_recovery_1280x720.png',
      collisionMaskFile: 'maps/act1/general/act1_general_collision_recovery.png',
      hazardMaskFile: 'maps/act1/general/act1_general_hazard_recovery.png',
      playerSpawn: { x: 410, y: 525 },
    });
    expect(boss).toMatchObject({
      backgroundFile: 'maps/act1/boss/act1_boss_bg_recovery_1280x720.png',
      collisionMaskFile: 'maps/act1/boss/act1_boss_collision_recovery.png',
      hazardMaskFile: 'maps/act1/boss/act1_boss_hazard_recovery.png',
      bossSpawn: { x: 640, y: 265 },
      bossTerritory: { shape: 'circle', center: { x: 640, y: 350 }, radius: 280 },
    });
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
    expect(resolveMapDefinition('act2_general')).toMatchObject({
      backgroundFile: 'maps/act2/general/act2_general_bg_recovery_1280x720.png',
      collisionMaskFile: 'maps/act2/general/act2_general_collision_recovery.png',
      playerSpawn: { x: 599, y: 604 },
    });
    expect(resolveMapDefinition('act2_boss')).toMatchObject({
      backgroundFile: 'maps/act2/boss/act2_boss_bg_recovery_1280x720.png',
      collisionMaskFile: 'maps/act2/boss/act2_boss_collision_recovery.png',
      bossSpawn: { x: 640, y: 320 },
      bossTerritory: { shape: 'ellipse', bounds: { x: 166, y: 95, width: 953, height: 479 } },
    });
    expect(bossDefeatPresentationFor('diffraction_pangolin').mode).toBe('nonlethal-retreat');
  });

  it('maps Act 3 onto the existing defense and projectile roles without hazards', () => {
    expect(['elite', 'archer'].map((kind) => creatureIdForEnemyKind(3, kind as 'elite' | 'archer'))).toEqual([
      'flowjaw_crab', 'pulsebarbel_catfish',
    ]);
    expect(resolveMapDefinition('act3_general').hazardMaskFile).toBeNull();
    expect(resolveMapDefinition('act3_boss').hazardMaskFile).toBeNull();
    expect(resolveMapDefinition('act3_general')).toMatchObject({
      backgroundFile: 'maps/act3/general/act3_general_bg_recovery_1280x720.png',
      collisionMaskFile: 'maps/act3/general/act3_general_collision_recovery.png',
      playerSpawn: { x: 605, y: 604 },
    });
    expect(resolveMapDefinition('act3_boss')).toMatchObject({
      backgroundFile: 'maps/act3/boss/act3_boss_bg_recovery_1280x720.png',
      collisionMaskFile: 'maps/act3/boss/act3_boss_collision_recovery.png',
      bossSpawn: { x: 340, y: 270 },
      bossTerritory: { shape: 'ellipse', bounds: { x: 157, y: 91, width: 972, height: 483 } },
    });
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
