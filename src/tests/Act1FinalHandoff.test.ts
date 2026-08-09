import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../game/balance';
import { ACT1_FINAL_VFX_BINDINGS } from '../game/final/Act1FinalBindings';
import { act1FinalAssetAudit, act1FinalImageEntries, act1FinalImagePaths, act1FinalJsonEntries } from '../game/final/Act1FinalAssets';
import {
  ACT1_FINAL_CREATURE_PRESENTATION_PROFILES,
  ACT1_FINAL_IMPACT_TTL_MS,
  ACT1_FINAL_PROJECTILE_READABILITY,
  ACT1_FINAL_PLAYER_VISUAL_SCALE,
  ACT1_FINAL_STABLE_CORRECTED_FRAME_KEYS,
  act1FinalCorrectedFrameIsStable,
  projectileCoreGeometry,
  projectileCorridorLines,
  resolveAct1FinalPresentationSource,
  resolveAct1FinalConfig,
  resolveAct1RuntimeMode,
} from '../game/final/Act1FinalConfig';
import { playerMotionSource } from '../game/motion/MotionPilotRuntime';

interface PlayerSequence { frameCount: number; frames: { file: string; groundPoint: { x: number; y: number } }[] }
interface PlayerManifest {
  canonicalCanvas: { width: number; height: number };
  groundPoint: { x: number; y: number };
  runtimeScale: number;
  directions: Record<string, Record<string, PlayerSequence>>;
}
interface VfxManifest { gameplayAdditions: number; effects: { effectId: string; frameFiles: string[]; gameplayValuesChanged: number }[] }

const root = 'handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1';
const player = JSON.parse(readFileSync(`${root}/PLAYER_FULL8_MOTION_MANIFEST.json`, 'utf8')) as PlayerManifest;
const vfx = JSON.parse(readFileSync(`${root}/ACT1_VFX_MANIFEST.json`, 'utf8')) as VfxManifest;

describe('ACT 1 final handoff staging mode and loader', () => {
  it('promotes final by default while preserving explicit comparison and legacy rollback modes', () => {
    expect(resolveAct1FinalConfig('')).toMatchObject({ mode: 'FINAL', enabled: true, player: 'FINAL_HANDOFF', vfx: 'FINAL_PNG' });
    const enabled = resolveAct1FinalConfig('?act1Final=1');
    expect(enabled).toMatchObject({ mode: 'FINAL', enabled: true, player: 'FINAL_HANDOFF', vfx: 'FINAL_PNG' });
    expect(new Set(Object.values(enabled.creatures))).toEqual(new Set(['FINAL_CORRECTED']));
    expect(resolveAct1FinalConfig('?motionPilot=1&act1Showcase=1')).toMatchObject({ mode: 'COMPARISON', enabled: false, player: 'CURRENT_MOTION_PILOT', vfx: 'PROCEDURAL' });
    expect(resolveAct1FinalConfig('?legacyRuntime=1')).toMatchObject({ mode: 'LEGACY', enabled: false, player: 'LEGACY', vfx: 'LEGACY' });
    expect(resolveAct1RuntimeMode('?legacyRuntime=1&act1Final=1&motionPilot=1&act1Showcase=1')).toBe('LEGACY');
    expect(resolveAct1FinalConfig('?legacyRuntime=1&act1Final=1&motionPilot=1&act1Showcase=1')).toMatchObject({ mode: 'LEGACY', enabled: false, player: 'LEGACY', vfx: 'LEGACY' });
  });

  it('loads only the individual manifest assets and excludes review media and sheets', () => {
    expect(act1FinalImageEntries(false)).toHaveLength(0);
    expect(act1FinalJsonEntries(false)).toHaveLength(0);
    expect(act1FinalAssetAudit()).toEqual({
      playerFrames: 256, correctedFrames: 27, verifiedFrames: 99, vfxFrames: 138,
      jsonFiles: 6, duplicateKeys: [], disallowed: [],
    });
    const paths = act1FinalImageEntries(true).map((asset) => asset.path);
    expect(paths.some((path) => /review|previews|reports|sheet|\.mp4|\.pptx?/i.test(path))).toBe(false);
  });
});

describe('native player contract', () => {
  it('contains 256 unique 128px frames, 8 authored directions, 7 sequences, and fixed Ground Point', () => {
    expect(player.canonicalCanvas).toEqual({ width: 128, height: 128 });
    expect(player.groundPoint).toEqual({ x: 64, y: 112 });
    expect(player.runtimeScale).toBe(1);
    expect(ACT1_FINAL_PLAYER_VISUAL_SCALE).toBe(0.8125);
    expect(Object.keys(player.directions)).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
    const frames = Object.values(player.directions).flatMap((direction) => Object.values(direction).flatMap((sequence) => sequence.frames));
    expect(frames).toHaveLength(256);
    expect(new Set(frames.map((frame) => frame.file))).toHaveLength(256);
    expect(frames.every((frame) => frame.groundPoint.x === 64 && frame.groundPoint.y === 112)).toBe(true);
    for (const direction of Object.values(player.directions)) {
      expect(Object.keys(direction)).toEqual(['idle', 'move', 'dash', 'basic_attack', 'parry', 'word_skill', 'hit_recover']);
      expect(Object.values(direction).reduce((sum, sequence) => sum + sequence.frameCount, 0)).toBe(32);
    }
    for (const direction of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const) expect(playerMotionSource(direction, true)).toBe('SEQUENCE');
  });

  it('keeps physics and gameplay timing owners untouched', () => {
    const hero = readFileSync('src/game/entities/Hero.ts', 'utf8');
    expect(hero).toContain('scene.physics.add.existing(this)');
    expect(hero).toContain("this.motionPresentation?.startAction('basic_attack'");
    expect(BALANCE.hero.cut).toMatchObject({ damage: 14, range: 108, cooldown: 1050, hitDelay: 115, recovery: 245 });
    expect(BALANCE.hero.dashDuration).toBe(170);
    expect(BALANCE.hero.parryWindow).toBe(155);
  });
});

describe('creature selection and VFX bindings', () => {
  it('keeps a single species scale and admits only corrected keys that pass the visual stability gate', () => {
    const corrected = act1FinalImagePaths('corrected');
    expect(corrected).toHaveLength(27);
    expect(act1FinalImagePaths('verified')).toHaveLength(99);
    expect(corrected.some((path) => path.includes('stunned_front_corrected'))).toBe(false);
    expect(corrected.some((path) => path.includes('retreat_side_corrected'))).toBe(false);
    const runtime = readFileSync('src/game/motion/MotionPilotRuntime.ts', 'utf8');
    expect(runtime).toContain('FINAL_CORRECTED_FRAME_MAP');
    expect(runtime).toContain('act1FinalCorrectedFrameIsStable');
    expect(runtime).toContain("source: 'FINAL_CORRECTED'");
    expect(runtime).toContain("return this.frameFile.includes('/readability_corrected/') ? 'FINAL_CORRECTED' : 'VERIFIED_MOTION'");
    expect(Object.values(ACT1_FINAL_STABLE_CORRECTED_FRAME_KEYS).reduce((sum, keys) => sum + keys.size, 0)).toBe(1);
    expect(act1FinalCorrectedFrameIsStable('rewind_lizard', 'attack', 1)).toBe(false);
    expect(act1FinalCorrectedFrameIsStable('mineral_spider', 'move', 0)).toBe(true);
    expect(act1FinalCorrectedFrameIsStable('resonance_goral', 'charge_attack', 1)).toBe(false);
    expect(act1FinalCorrectedFrameIsStable('deflect_bat', 'attack', 0)).toBe(false);
    for (const profile of Object.values(ACT1_FINAL_CREATURE_PRESENTATION_PROFILES)) expect(profile.uniformScale).toBeGreaterThan(0);
    expect(ACT1_FINAL_CREATURE_PRESENTATION_PROFILES.resonance_goral?.uniformScale).toBe(1.16);
    expect(ACT1_FINAL_CREATURE_PRESENTATION_PROFILES.deflect_bat?.uniformScale).toBe(1.8);
    for (const [correctedLongSide, verifiedLongSide] of [[60, 58], [72, 72], [178, 176]] satisfies Array<[number, number]>) {
      expect(Math.abs(correctedLongSide - verifiedLongSide) / verifiedLongSide).toBeLessThanOrEqual(0.08);
    }
  });

  it('exhaustively binds all 33 records to existing presentation hooks with fallback', () => {
    expect(vfx.gameplayAdditions).toBe(0);
    expect(vfx.effects).toHaveLength(33);
    expect(ACT1_FINAL_VFX_BINDINGS).toHaveLength(33);
    expect(new Set(ACT1_FINAL_VFX_BINDINGS.map((entry) => entry.effectId))).toEqual(new Set(vfx.effects.map((entry) => entry.effectId)));
    expect(ACT1_FINAL_VFX_BINDINGS.every((entry) => entry.status === 'BOUND')).toBe(true);
    expect(vfx.effects.every((effect) => effect.gameplayValuesChanged === 0)).toBe(true);
  });

  it('keeps lifecycle cleanup at projectile, ACT, Run, and Scene boundaries', () => {
    const finalVfx = readFileSync('src/game/final/Act1FinalVfx.ts', 'utf8');
    const scene = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    expect(finalVfx).toContain('releaseProjectile');
    expect(finalVfx).toContain('removeOwnerEffects');
    expect(finalVfx).toContain('removeTelegraphCorridor');
    expect(finalVfx).toContain('activeProjectiles');
    expect(finalVfx).toContain('public clear(): void');
    expect(finalVfx).toContain('public destroy(): void');
    expect(scene).toContain('this.showcaseVfx?.clear();');
    expect(scene).toContain('this.showcaseVfx?.destroy()');
    expect(scene).toContain('this.hero.setPresentationAct(next.index)');
  });

  it('renders a readability core and corridor from the unchanged gameplay collision geometry', () => {
    expect(BALANCE.collision.projectileRadius).toBe(5);
    expect(projectileCoreGeometry({ x: 42, y: 18, radius: BALANCE.collision.projectileRadius })).toEqual({
      x: 42, y: 18, radius: 5, diameter: 10,
    });
    expect(projectileCorridorLines({ x: 10, y: 20 }, 0, 100, 5)).toEqual([
      { x1: 10, y1: 25, x2: 110, y2: 25 },
      { x1: 10, y1: 15, x2: 110, y2: 15 },
    ]);
    expect(ACT1_FINAL_IMPACT_TTL_MS).toBeGreaterThanOrEqual(250);
    expect(ACT1_FINAL_IMPACT_TTL_MS).toBeLessThanOrEqual(450);
    expect(ACT1_FINAL_PROJECTILE_READABILITY.batCueLength).toBeLessThanOrEqual(40);
    expect(ACT1_FINAL_PROJECTILE_READABILITY.batCueLifetimeMs).toBeGreaterThanOrEqual(120);
    expect(ACT1_FINAL_PROJECTILE_READABILITY.batCueLifetimeMs).toBeLessThanOrEqual(200);
  });

  it('selects exactly one presentation source for a gameplay event', () => {
    expect(resolveAct1FinalPresentationSource(true, true)).toBe('FINAL_PNG');
    expect(resolveAct1FinalPresentationSource(false, true)).toBe('PROCEDURAL');
    expect(resolveAct1FinalPresentationSource(false, false)).toBe('LEGACY');
    const source = readFileSync('src/game/final/Act1FinalVfx.ts', 'utf8');
    expect(source).toContain("this.selectSource('player:parry-attempt', effects)");
    expect(source).toContain('effectIds.every((effectId) => this.canPlay(effectId))');
  });
});
