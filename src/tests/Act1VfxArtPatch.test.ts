import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../game/balance';
import {
  ACT1_VFX_PATCH_SEQUENCE_PATHS,
  act1VfxPatchAssetAudit,
  act1VfxPatchImageEntries,
} from '../game/final/Act1VfxArtPatchAssets';
import {
  ACT1_VFX_PATCH_DIRECTIONS,
  ACT1_VFX_PATCH_PRESENTATION,
  ACT1_VFX_PATCH_SLASH_CONTACT_FRAME,
  ACT1_VFX_PATCH_SLASH_OFFSET,
  act1VfxPatchImpactAllowed,
  normalizedSlashFrameDurations,
  offsetAct1VfxPatchEnemyAnchor,
  offsetAct1VfxPatchSlashAnchor,
  resolveAct1VfxArtPatchConfig,
  resolveAct1VfxArtPatchSource,
} from '../game/final/Act1VfxArtPatchConfig';
import {
  ACT1_FINAL_CREATURE_PRESENTATION_PROFILES,
  ACT1_FINAL_PLAYER_VISUAL_SCALE,
  act1FinalCorrectedFrameIsStable,
  act1FinalBossPhaseOverlayEnabled,
  act1FinalBossRetreatPresentation,
  act1FinalCombatTypographyEnabled,
  act1FinalCombatWorldTextEnabled,
} from '../game/final/Act1FinalConfig';

describe('ACT 1 final VFX art patch mode and strict loader', () => {
  it('is the FINAL-mode default, with explicit rollback and legacy/comparison precedence', () => {
    expect(resolveAct1VfxArtPatchConfig('').enabled).toBe(true);
    expect(resolveAct1VfxArtPatchConfig('?act1VfxPatch=1')).toMatchObject({ enabled: true });
    expect(resolveAct1VfxArtPatchConfig('?act1Final=1&act1VfxPatch=1')).toMatchObject({ enabled: true });
    expect(resolveAct1VfxArtPatchConfig('?act1VfxPatch=0')).toMatchObject({ enabled: false, sources: {
      playerSlash: 'CURRENT_FINAL_PNG', batSonic: 'CURRENT_FINAL_PNG', spiderWeb: 'CURRENT_FINAL_PNG', goralStone: 'CURRENT_FINAL_PNG',
    } });
    expect(resolveAct1VfxArtPatchConfig('?legacyRuntime=1&act1VfxPatch=1')).toMatchObject({ enabled: false });
    expect(resolveAct1VfxArtPatchConfig('?legacyRuntime=1&act1VfxPatch=0')).toMatchObject({ enabled: false });
    expect(resolveAct1VfxArtPatchConfig('?motionPilot=1&act1Showcase=1&act1VfxPatch=1')).toMatchObject({ enabled: false });
  });

  it('preloads only the 75 approved PNGs and excludes word_core3 and review media', () => {
    expect(act1VfxPatchImageEntries(false)).toHaveLength(0);
    expect(act1VfxPatchAssetAudit()).toEqual({
      playerSlash: 40,
      batSonic: 13,
      spiderWeb: 13,
      goralStone: 9,
      total: 75,
      missingExpected: [],
      unexpected: [],
      duplicateKeys: [],
      disallowed: [],
      wordCore3Preload: 0,
    });
    const paths = act1VfxPatchImageEntries(true).map((asset) => asset.path);
    expect(paths.some((path) => /word_core3|previews|review|\.mp4|\.pptx?/i.test(path))).toBe(false);
    expect(new Set(act1VfxPatchImageEntries(true).map((asset) => asset.key))).toHaveLength(75);
  });

  it('registers the approved sequence inventory without a word effect registry', () => {
    for (const direction of ACT1_VFX_PATCH_DIRECTIONS) expect(ACT1_VFX_PATCH_SEQUENCE_PATHS[`player_slash:${direction}`]).toHaveLength(5);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['bat_sonic:form']).toHaveLength(3);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['bat_sonic:launch']).toHaveLength(2);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['bat_sonic:travel']).toHaveLength(3);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['bat_sonic:impact']).toHaveLength(5);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['spider_web:form']).toHaveLength(3);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['spider_web:launch']).toHaveLength(2);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['spider_web:travel']).toHaveLength(3);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['spider_web:impact']).toHaveLength(5);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['goral_stone:travel']).toHaveLength(4);
    expect(ACT1_VFX_PATCH_SEQUENCE_PATHS['goral_stone:impact']).toHaveLength(5);
    expect(Object.keys(ACT1_VFX_PATCH_SEQUENCE_PATHS).some((id) => id.includes('word'))).toBe(false);
  });

  it('falls back one source at a time when a patch or current source is unavailable', () => {
    expect(resolveAct1VfxArtPatchSource(true, true, true, true)).toBe('PATCH_PNG');
    expect(resolveAct1VfxArtPatchSource(true, false, true, true)).toBe('CURRENT_FINAL_PNG');
    expect(resolveAct1VfxArtPatchSource(true, false, false, true)).toBe('PROCEDURAL');
    expect(resolveAct1VfxArtPatchSource(true, false, false, false)).toBe('LEGACY');
  });
});

describe('patch timing, attachment, and lifecycle contract', () => {
  it('aligns the largest approved slash pose with the unchanged cut contact', () => {
    expect(ACT1_VFX_PATCH_SLASH_CONTACT_FRAME).toEqual({ n: 3, ne: 2, e: 3, se: 3, s: 3, sw: 3, w: 3, nw: 3 });
    for (const direction of ACT1_VFX_PATCH_DIRECTIONS) {
      const contactFrame = ACT1_VFX_PATCH_SLASH_CONTACT_FRAME[direction];
      const durations = normalizedSlashFrameDurations(contactFrame, BALANCE.hero.cut.hitDelay, BALANCE.hero.cut.recovery);
      expect(durations).toHaveLength(5);
      expect(durations.slice(0, contactFrame).reduce((sum, value) => sum + value, 0)).toBeCloseTo(BALANCE.hero.cut.hitDelay, 5);
      expect(durations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(BALANCE.hero.cut.recovery, 5);
    }
    expect(ACT1_VFX_PATCH_PRESENTATION.playerSlash).toMatchObject({ displayScale: 0.53125, alpha: 0.54, edgeAlpha: 0.38, tint: 0x9eaaa1 });
  });

  it('keeps every slash attached in front of the dagger with one crisp uniform scale', () => {
    const directionVectors = {
      n: { x: 0, y: -1 }, ne: { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, e: { x: 1, y: 0 }, se: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
      s: { x: 0, y: 1 }, sw: { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, w: { x: -1, y: 0 }, nw: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
    } as const;
    for (const direction of ACT1_VFX_PATCH_DIRECTIONS) {
      const offset = ACT1_VFX_PATCH_SLASH_OFFSET[direction];
      const vector = directionVectors[direction];
      expect(offset.x * vector.x + offset.y * vector.y).toBeGreaterThanOrEqual(25);
      expect(offsetAct1VfxPatchSlashAnchor({ x: 100, y: 200 }, direction)).toEqual({ x: 100 + offset.x, y: 200 + offset.y });
    }
    expect(ACT1_VFX_PATCH_PRESENTATION.playerSlash.displayScale).toBeLessThan(0.75);
  });

  it('locks bat and spider FORM/LAUNCH to the attack angle in front of the visual anchor', () => {
    const anchor = { x: 100, y: 100 };
    expect(offsetAct1VfxPatchEnemyAnchor(anchor, 0, 10)).toEqual({ x: 110, y: 100 });
    expect(offsetAct1VfxPatchEnemyAnchor(anchor, Math.PI / 2, 10)).toMatchObject({ x: 100, y: 110 });
    expect(offsetAct1VfxPatchEnemyAnchor(anchor, Math.PI, 10)).toMatchObject({ x: 90, y: 100 });
    expect(offsetAct1VfxPatchEnemyAnchor(anchor, -Math.PI / 2, 10)).toMatchObject({ x: 100, y: 90 });
    const runtime = readFileSync('src/game/final/Act1VfxArtPatchRuntime.ts', 'utf8');
    expect(runtime).toContain('const lockedAimAngle = enemy.facingAngle');
    expect(runtime).toContain('const lockedAimAngle = projectile.rotation');
    expect(runtime).toContain('.setRotation(rotation)');
  });

  it('uses verified charge keys instead of corrected frames with baked magenta edges', () => {
    expect(act1FinalCorrectedFrameIsStable('rewind_lizard', 'attack', 1)).toBe(false);
    expect(act1FinalCorrectedFrameIsStable('resonance_goral', 'charge_attack', 1)).toBe(false);
    expect(act1FinalCorrectedFrameIsStable('mineral_spider', 'move', 0)).toBe(true);
  });

  it('hides patch collision-core helpers while preserving fallback presentation paths', () => {
    expect(ACT1_VFX_PATCH_PRESENTATION.batSonic.showCollisionCore).toBe(false);
    expect(ACT1_VFX_PATCH_PRESENTATION.spiderWeb.showCollisionCore).toBe(false);
    expect(ACT1_VFX_PATCH_PRESENTATION.goralStone.showCollisionCore).toBe(false);
    expect(ACT1_VFX_PATCH_PRESENTATION.spiderWeb.saturation).toBe(-1);
    expect(ACT1_VFX_PATCH_PRESENTATION.goralStone.saturation).toBe(-1);
  });

  it('uses smaller central player and bat presentation scales without touching gameplay owners', () => {
    expect(ACT1_FINAL_PLAYER_VISUAL_SCALE).toBe(0.8125);
    expect(ACT1_FINAL_CREATURE_PRESENTATION_PROFILES.deflect_bat?.uniformScale).toBe(1.8);
  });

  it('allows impact art only for real collision paths', () => {
    expect(act1VfxPatchImpactAllowed('TARGET_COLLISION')).toBe(true);
    expect(act1VfxPatchImpactAllowed('MAP_COLLISION')).toBe(true);
    for (const reason of ['PROJECTILE_DESTROY', 'PROJECTILE_INACTIVE', 'ACT_CLEANUP', 'RUN_RESET', 'SCENE_SHUTDOWN', 'OWNER_DESPAWN'] as const) {
      expect(act1VfxPatchImpactAllowed(reason)).toBe(false);
    }
  });

  it('uses existing presentation callbacks and keeps gameplay owners unchanged', () => {
    const finalVfx = readFileSync('src/game/final/Act1FinalVfx.ts', 'utf8');
    const patchRuntime = readFileSync('src/game/final/Act1VfxArtPatchRuntime.ts', 'utf8');
    const scene = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    expect(finalVfx).toContain('this.artPatch.attachProjectile(projectile, source)');
    expect(finalVfx).toContain('this.artPatch.projectileImpact(projectile)');
    expect(finalVfx).toContain('this.artPatch.releaseProjectile(projectile, reason)');
    expect(scene).toContain('this.showcaseVfx.beginHeroCut');
    expect(scene).toContain('this.showcaseVfx.endHeroCut');
    expect(scene).toContain('this.showcaseVfx.heroCut(anchor, attack.angle, this.hero)');
    expect(patchRuntime).toContain('projectile.collisionCircle');
    expect(patchRuntime).toContain('projectile.rotation');
    expect(patchRuntime).toContain('projectile.setVisible(false)');
    expect(patchRuntime).not.toContain('setVelocity(');
    expect(patchRuntime).not.toContain('.damage =');
    expect(BALANCE.collision.projectileRadius).toBe(5);
    expect(BALANCE.hero.cut).toMatchObject({ damage: 14, range: 108, cooldown: 1050, hitDelay: 115, recovery: 245 });
  });

  it('uses one thin final link pulse without the raster endpoint rings', () => {
    const finalVfx = readFileSync('src/game/final/Act1FinalVfx.ts', 'utf8');
    const scene = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    expect(finalVfx).toContain('this.fallback.wordLink(origin, targets)');
    expect(finalVfx).not.toContain("this.playWord('word_connect'");
    expect(scene).toContain('drawWave(0, 1, 0x6f9c91, 0.48)');
  });

  it('keeps the bottom combat cards and dynamic J text inside their panels', () => {
    const overlay = readFileSync('src/ui/OverlayUI.ts', 'utf8');
    const css = readFileSync('src/styles.css', 'utf8');
    expect(overlay).toContain('잔향 ${state.echoBladeOrbitCount} · 범위 ${Math.round(state.echoBladeRange)} · ${state.echoBladeInterval.toFixed(1)}s');
    expect(css).toContain('.finisher-slot { position: relative; height: 56px;');
    expect(css).toContain('overflow: hidden; border: 1px solid #56635f88');
    expect(css).toContain('.chain-status small { display: none; }');
  });

  it('cleans presentation without synthesizing cleanup impacts', () => {
    const runtime = readFileSync('src/game/final/Act1VfxArtPatchRuntime.ts', 'utf8');
    const finalVfx = readFileSync('src/game/final/Act1FinalVfx.ts', 'utf8');
    expect(runtime).toContain("this.clear('ACT_TRANSITION')");
    expect(runtime).toContain('const next = act1VfxArtPatchEnabledForAct(actIndex);');
    expect(runtime).toContain("this.clear('SCENE_SHUTDOWN')");
    expect(runtime).toContain("this.releaseProjectile(projectile, 'PROJECTILE_INACTIVE')");
    expect(runtime).toContain('private readonly impactedProjectiles = new WeakSet<Projectile>()');
    expect(runtime).toContain('wordCore3TextureCount: 0');
    expect(runtime).toContain('collisionCoreCount:');
    expect(finalVfx).toContain('this.artPatch.setAct(actIndex);');
  });

  it('suppresses only final ACT 1 world typography and the decorative goral phase overlay', () => {
    expect(act1FinalCombatTypographyEnabled(1, true)).toBe(false);
    expect(act1FinalCombatWorldTextEnabled(1, true)).toBe(false);
    expect(act1FinalCombatTypographyEnabled(2, true)).toBe(true);
    expect(act1FinalCombatWorldTextEnabled(2, true)).toBe(true);
    expect(act1FinalCombatTypographyEnabled(1, false)).toBe(true);
    expect(act1FinalBossPhaseOverlayEnabled('resonance_goral', 3, true)).toBe(false);
    expect(act1FinalBossPhaseOverlayEnabled('resonance_goral', 2, true)).toBe(true);
    expect(act1FinalBossPhaseOverlayEnabled('channel_otter_mother', 3, true)).toBe(true);
  });

  it('guards every non-debug combat text family in the final ACT 1 scene', () => {
    const scene = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    expect(scene.match(/combatWorldTextEnabled\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(scene).toContain('if (!this.combatWorldTextEnabled()) return;');
    expect(scene).toContain('worldTextEnabled && !this.linkMarkers.has(enemy)');
    expect(scene).toContain('this.debugMotionText');
    expect(scene).toContain('this.debugStatsText');
  });

  it('uses an in-place final goral dissolve while preserving every legacy boss retreat', () => {
    expect(act1FinalBossRetreatPresentation('resonance_goral', true)).toBe('IN_PLACE_DISSOLVE');
    expect(act1FinalBossRetreatPresentation('resonance_goral', false)).toBe('LEGACY_SLIDE');
    expect(act1FinalBossRetreatPresentation('diffraction_pangolin', true)).toBe('LEGACY_SLIDE');
    const enemy = readFileSync('src/game/entities/Enemy.ts', 'utf8');
    expect(enemy).toContain("act1FinalBossRetreatPresentation(this.creatureId ?? '') === 'IN_PLACE_DISSOLVE'");
    expect(enemy).toContain('this.callbacks.died(this, source)');
  });
});
