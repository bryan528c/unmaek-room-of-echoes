import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../game/balance';
import { motionPilotAssetAudit, motionPilotImageEntries, motionPilotJsonEntries } from '../game/motion/MotionPilotAssets';
import {
  creatureMotionActionPriority,
  playerMotionSource,
  quantizeMotionDirection,
  resolveMotionVisualAnchor,
  shouldStartCreatureMotionAction,
} from '../game/motion/MotionPilotRuntime';
import { MOTION_PILOT_PRESENTATION_PROFILES, resolveMotionPilotConfig } from '../game/motion/MotionPilotConfig';
import { VisualSequencePlayer } from '../game/motion/VisualSequencePlayer';

interface PlayerManifest {
  canonicalCanvas: { width: number; height: number };
  groundPoint: { x: number; y: number };
  runtimeScale: number;
  directionLock: string[];
  sequences: Record<'s' | 'e', Record<string, { frames: { file: string; role?: string }[] }>>;
  gameplayChanges: Record<string, boolean>;
}

interface CreatureManifest {
  totalCreatureFrames: number;
  lockedChanges: Record<string, number | boolean>;
  subjects: { id: string; pilotSequences: { id: string; frames: { file: string }[]; hitAlignedFrameCandidate: number | null }[] }[];
}

const playerManifest = JSON.parse(readFileSync('handoff/UNMAEK_PLAYER_RUNTIME_MOTION_PILOT_v1/PLAYER_MOTION_MANIFEST.json', 'utf8')) as PlayerManifest;
const creatureManifest = JSON.parse(readFileSync('handoff/UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1/MOTION_FRAME_MANIFEST_PILOT_v1.json', 'utf8')) as CreatureManifest;

describe('motion pilot flag and strict loader', () => {
  it('follows final-by-default, comparison, and explicit legacy precedence', () => {
    expect(resolveMotionPilotConfig('')).toEqual({ enabled: true, source: 'DEFAULT_FINAL' });
    expect(resolveMotionPilotConfig('?motionPilot=0')).toEqual({ enabled: true, source: 'DEFAULT_FINAL' });
    expect(resolveMotionPilotConfig('?motionPilot=1')).toEqual({ enabled: true, source: 'URL_QUERY' });
    expect(resolveMotionPilotConfig('?motionPilot=1&act1Showcase=1')).toEqual({ enabled: true, source: 'URL_QUERY' });
    expect(resolveMotionPilotConfig('?act1Showcase=1')).toEqual({ enabled: false, source: 'DEFAULT_OFF' });
    expect(resolveMotionPilotConfig('?act1Final=1')).toEqual({ enabled: true, source: 'URL_QUERY' });
    expect(resolveMotionPilotConfig('?legacyRuntime=1&act1Final=1&motionPilot=1&act1Showcase=1')).toEqual({ enabled: false, source: 'LEGACY_OVERRIDE' });
  });

  it('preloads zero pilot assets when off and exactly manifest frames when on', () => {
    expect(motionPilotImageEntries(false)).toHaveLength(0);
    expect(motionPilotJsonEntries(false)).toHaveLength(0);
    expect(motionPilotImageEntries(true)).toHaveLength(175);
    expect(motionPilotJsonEntries(true)).toHaveLength(4);
    expect(motionPilotAssetAudit()).toEqual({
      playerFrames: 76,
      creatureFrames: 99,
      directionLocks: 8,
      duplicateKeys: [],
      disallowed: [],
    });
  });

  it('forces every staged texture to NEAREST after load', () => {
    const bootSource = readFileSync('src/game/scenes/BootScene.ts', 'utf8');
    expect(bootSource).toContain('setFilter(Phaser.Textures.FilterMode.NEAREST)');
  });

  it('contains no review, preview, sheet, movie, or presentation asset', () => {
    const paths = motionPilotImageEntries(true).map((entry) => entry.path);
    expect(paths.some((path) => /review|preview|before_after|sprite_sheets|\.mp4|\.pptx?/i.test(path))).toBe(false);
  });

  it('matches every frame path referenced by both handoff manifests', () => {
    const loaded = new Set(motionPilotImageEntries(true).map((entry) => `${entry.packageId}:${entry.path}`));
    const playerRefs = [
      ...playerManifest.directionLock,
      ...Object.values(playerManifest.sequences).flatMap((direction) => Object.values(direction).flatMap((sequence) => sequence.frames.map((frame) => frame.file))),
    ];
    const creatureRefs = creatureManifest.subjects.flatMap((subject) => subject.pilotSequences.flatMap((sequence) => sequence.frames.map((frame) => frame.file)));
    expect(new Set(playerRefs).size).toBe(76);
    expect(new Set(creatureRefs).size).toBe(99);
    expect(playerRefs.every((file) => loaded.has(`player:${file}`))).toBe(true);
    expect(creatureRefs.every((file) => loaded.has(`act1:${file}`))).toBe(true);
  });
});

describe('player motion contract', () => {
  it('keeps the canonical canvas, Ground Point, nearest 2x scale, and gameplay locks', () => {
    expect(playerManifest.canonicalCanvas).toEqual({ width: 64, height: 64 });
    expect(playerManifest.groundPoint).toEqual({ x: 32, y: 57 });
    expect(playerManifest.runtimeScale).toBe(2);
    expect(Object.values(playerManifest.gameplayChanges).every((changed) => changed === false)).toBe(true);
  });

  it('keeps the Physics Sprite transform on the legacy owner and renders pilot frames on a separate visual', () => {
    const source = readFileSync('src/game/motion/MotionPilotRuntime.ts', 'utf8');
    const heroClass = source.slice(source.indexOf('export class HeroMotionPresentation'), source.indexOf('const stateSequenceFor'));
    expect(heroClass).toContain('this.visual.setTexture');
    expect(heroClass).not.toContain('this.sprite.setTexture');
    expect(heroClass).toContain('this.sprite.setVisible(false)');
  });

  it('uses centralized uniform pixel-density profiles without synthesizing unsupported facing', () => {
    expect(MOTION_PILOT_PRESENTATION_PROFILES.player).toMatchObject({ uniformScale: 1.5, directionPolicy: 'SEQUENCE_OR_LOCK' });
    expect(MOTION_PILOT_PRESENTATION_PROFILES.deflect_bat).toMatchObject({ uniformScale: 1.5, directionPolicy: 'FLIP_X' });
    expect(MOTION_PILOT_PRESENTATION_PROFILES.rewind_lizard).toMatchObject({ uniformScale: 1, directionPolicy: 'INVERTED_FLIP_X' });
    expect(MOTION_PILOT_PRESENTATION_PROFILES.mineral_spider).toMatchObject({ uniformScale: 1, source: 'PILOT' });
    expect(MOTION_PILOT_PRESENTATION_PROFILES.resonance_goral).toMatchObject({
      uniformScale: 1,
      directionPolicy: 'MIRRORED_STAGING',
      source: 'PILOT_MIRRORED_STAGING_FALLBACK',
    });
    for (const profile of Object.values(MOTION_PILOT_PRESENTATION_PROFILES)) {
      expect(profile.uniformScale).toBeGreaterThan(0);
      expect(Number.isFinite(profile.uniformScale)).toBe(true);
    }
  });

  it('keeps the creature Physics Sprite on official runtime textures and stages frames on a non-physics primary visual', () => {
    const source = readFileSync('src/game/runtime/CreaturePresentation.ts', 'utf8');
    const applyMotion = source.slice(source.indexOf('private applyMotionFrame'), source.indexOf('private applyOriginAndFlip'));
    expect(applyMotion).toContain('this.pilotVisual');
    expect(applyMotion).toContain('this.sprite.setVisible(false)');
    expect(applyMotion).not.toContain('this.sprite.setTexture(textureKey)');
  });

  it('has eight direction locks and 34 staged sequence frames for S and E', () => {
    expect(playerManifest.directionLock).toHaveLength(8);
    expect(new Set(playerManifest.directionLock).size).toBe(8);
    for (const direction of ['s', 'e'] as const) {
      expect(Object.values(playerManifest.sequences[direction]).reduce((sum, sequence) => sum + sequence.frames.length, 0)).toBe(34);
      expect(playerManifest.sequences[direction].parry!.frames.filter((frame) => frame.role === 'success_aux')).toHaveLength(1);
      expect(playerManifest.sequences[direction].parry!.frames.filter((frame) => frame.role === 'failure_aux')).toHaveLength(1);
    }
  });

  it('uses real S/E sequences and standing-lock fallback for all other directions without flip synthesis', () => {
    expect(playerMotionSource('S')).toBe('SEQUENCE');
    expect(playerMotionSource('E')).toBe('SEQUENCE');
    for (const direction of ['N', 'NE', 'SE', 'SW', 'W', 'NW'] as const) expect(playerMotionSource(direction)).toBe('STANDING_LOCK_FALLBACK');
    expect(quantizeMotionDirection(-1, 0)).toBe('W');
    expect(playerManifest.directionLock).toContain('player/direction_lock/player_w.png');
    expect(playerManifest.directionLock).not.toContain('player/direction_lock/player_e_flip.png');
  });

  it('quantizes the existing movement/aim vector into all eight visual directions', () => {
    expect([
      quantizeMotionDirection(0, -1), quantizeMotionDirection(1, -1), quantizeMotionDirection(1, 0), quantizeMotionDirection(1, 1),
      quantizeMotionDirection(0, 1), quantizeMotionDirection(-1, 1), quantizeMotionDirection(-1, 0), quantizeMotionDirection(-1, -1),
    ]).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  });

  it('does not change attack, dash, parry, hit, or cooldown constants', () => {
    expect({
      speed: BALANCE.hero.speed,
      attackHitDelay: BALANCE.hero.attackHitDelay,
      attackRecovery: BALANCE.hero.attackRecovery,
      dashDuration: BALANCE.hero.dashDuration,
      dashInvulnerability: BALANCE.hero.dashInvulnerability,
      parryWindow: BALANCE.hero.parryWindow,
      hitInvulnerability: BALANCE.hero.hitInvulnerability,
      cutDamage: BALANCE.hero.cut.damage,
      cutRange: BALANCE.hero.cut.range,
      cutCooldown: BALANCE.hero.cut.cooldown,
    }).toEqual({ speed: 190, attackHitDelay: 86, attackRecovery: 190, dashDuration: 170, dashInvulnerability: 220, parryWindow: 155, hitInvulnerability: 620, cutDamage: 14, cutRange: 108, cutCooldown: 1050 });
  });
});

describe('visual sequence timing', () => {
  it('normalizes frame cadence into the existing engine window and lands the contact frame on the existing callback', () => {
    const player = new VisualSequencePlayer();
    const frames = Array.from({ length: 5 }, (_, index) => ({ file: `attack-${index + 1}.png`, durationMs: 100 }));
    player.play({ id: 'attack', frames, loop: false, contactFrame: 3 }, { startAt: 1000, durationMs: 245, contactAt: 1115 });
    expect(player.update(1000)?.file).toBe('attack-1.png');
    expect(player.update(1115)?.file).toBe('attack-3.png');
    expect(player.update(1244)?.file).toBe('attack-5.png');
    expect(player.snapshot()).toMatchObject({ sequenceId: 'attack', frameIndex: 4, active: true });
  });

  it('loops by frame duration without timers and stops a non-loop exactly once', () => {
    const player = new VisualSequencePlayer();
    player.play({ id: 'move', frames: [{ file: 'a', durationMs: 90 }, { file: 'b', durationMs: 90 }], loop: true }, { startAt: 0 });
    expect(player.update(0)?.file).toBe('a');
    expect(player.update(90)?.file).toBe('b');
    expect(player.update(180)?.file).toBe('a');
    player.play({ id: 'dash', frames: [{ file: 'a', durationMs: 90 }, { file: 'b', durationMs: 90 }], loop: false }, { startAt: 200, durationMs: 170 });
    expect(player.update(370)?.file).toBe('b');
    expect(player.isActive).toBe(false);
    player.stop();
    expect(player.snapshot()).toMatchObject({ sequenceId: null, frameFile: null, frameIndex: 0, active: false, loop: false, playCount: 2, completionCount: 1 });
  });

  it('records progression and completes a non-loop only once without accumulating a timer', () => {
    const player = new VisualSequencePlayer();
    player.play({ id: 'goral:charge', frames: [
      { file: 'prep', durationMs: 100 }, { file: 'contact', durationMs: 100 }, { file: 'recover', durationMs: 100 },
    ], loop: false, contactFrame: 2 }, { startAt: 0, durationMs: 300, contactAt: 180 });
    expect(player.update(0)?.file).toBe('prep');
    expect(player.update(180)?.file).toBe('contact');
    expect(player.update(299)?.file).toBe('recover');
    player.update(300);
    player.update(500);
    expect(player.snapshot()).toMatchObject({ playCount: 1, completionCount: 1, active: false });
    expect(player.snapshot().frameAdvanceCount).toBeGreaterThanOrEqual(2);
  });
});

describe('ACT 1 creature motion inventory', () => {
  it('keeps five existing subjects, 99 frames, and zero gameplay system additions', () => {
    expect(creatureManifest.subjects.map((subject) => subject.id)).toEqual([
      'pressure_swift', 'deflect_bat', 'rewind_lizard', 'mineral_spider', 'resonance_goral',
    ]);
    expect(creatureManifest.totalCreatureFrames).toBe(99);
    expect(creatureManifest.subjects.flatMap((subject) => subject.pilotSequences.flatMap((sequence) => sequence.frames))).toHaveLength(99);
    expect(creatureManifest.lockedChanges).toMatchObject({ newStateMachine: 0, newAttack: 0, newAI: 0, manifestModified: false });
  });

  it('preserves the handoff contact candidates for existing projectile, melee, zone, and boss callbacks', () => {
    const contact = Object.fromEntries(creatureManifest.subjects.flatMap((subject) => subject.pilotSequences
      .filter((sequence) => sequence.hitAlignedFrameCandidate !== null)
      .map((sequence) => [`${subject.id}/${sequence.id}`, sequence.hitAlignedFrameCandidate])));
    expect(contact).toEqual({
      'deflect_bat/attack': 2,
      'rewind_lizard/attack': 2,
      'mineral_spider/deploy_to_attack': 3,
      'resonance_goral/charge_attack': 4,
    });
  });

  it('maps bat and dash contact frames to existing callbacks while keeping recovery presentation-only', () => {
    const enemySource = readFileSync('src/game/entities/Enemy.ts', 'utf8');
    expect(enemySource).toContain("playMotionAction(['prep', 'attack'], 610, 540)");
    expect(enemySource).toContain('this.scene.time.delayedCall(540');
    expect(enemySource).toContain("playMotionAction(['combat_prep', 'charge_attack'], warningMs + 300, warningMs)");
    expect(enemySource).toContain('this.scheduleAttackCallback(310');
    expect(enemySource).toContain("playMotionAction(['hit_recover'], 220)");
    const sceneSource = readFileSync('src/game/scenes/GameScene.ts', 'utf8').replace(/\r\n/g, '\n');
    expect(sceneSource).toContain('enemy.cancelAttackIntent(time + 120);\n      enemy.playResolvedContactRecovery();');
  });

  it('starts phase warning after gameplay intent cleanup and keeps projectile VFX on visual anchors', () => {
    const bossSource = readFileSync('src/game/entities/Boss.ts', 'utf8');
    const callbackAt = bossSource.indexOf('this.bossCallbacks.phaseChanged(phase);');
    const warningAt = bossSource.indexOf("this.presentation?.playMotionAction(['warning'], BALANCE.boss.phaseTransition);");
    expect(callbackAt).toBeGreaterThan(-1);
    expect(warningAt).toBeGreaterThan(callbackAt);
    const enemySource = readFileSync('src/game/entities/Enemy.ts', 'utf8');
    expect(enemySource.match(/this\.showMotionContactCue\(\);/g)?.length).toBeGreaterThanOrEqual(3);
    expect(enemySource).toContain('const origin = this.projectileOrigin(-12);');
    expect(enemySource).toContain('const origin = this.projectileOrigin(0, index);');
  });

  it('blocks per-update restart and prevents a low-priority hit flash from replacing charge or retreat', () => {
    const charge = creatureMotionActionPriority(['combat_prep', 'charge_attack', 'hit_recover']);
    const hit = creatureMotionActionPriority(['hit_recover']);
    const retreat = creatureMotionActionPriority(['retreat']);
    expect(shouldStartCreatureMotionAction('charge', charge, 1000, 500, 'charge', charge)).toBe(false);
    expect(shouldStartCreatureMotionAction('charge', charge, 1000, 500, 'hit_recover', hit)).toBe(false);
    expect(shouldStartCreatureMotionAction('charge', charge, 1000, 500, 'retreat', retreat)).toBe(true);
    expect(shouldStartCreatureMotionAction('charge', charge, 1000, 1000, 'hit_recover', hit)).toBe(true);
  });

  it('keeps official goral metadata fixed while identifying the reversible mirrored staging presentation', () => {
    const goral = creatureManifest.subjects.find((subject) => subject.id === 'resonance_goral');
    const metadata = JSON.parse(readFileSync('handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/creatures/act1/resonance_goral/metadata.json', 'utf8')) as { directionMode: string; attackAnchors: { flippedX: unknown }[] };
    expect(goral?.pilotSequences.flatMap((sequence) => sequence.frames)).toHaveLength(23);
    expect(metadata.directionMode).toBe('fixed');
    expect(metadata.attackAnchors.every((anchor) => anchor.flippedX === null)).toBe(true);
    expect(MOTION_PILOT_PRESENTATION_PROFILES.resonance_goral.directionPolicy).toBe('MIRRORED_STAGING');
    expect(MOTION_PILOT_PRESENTATION_PROFILES.resonance_goral.source).toBe('PILOT_MIRRORED_STAGING_FALLBACK');
  });

  it('retains the corrected seven-state spider as the legacy fallback source', () => {
    const official = readFileSync('handoff/UNMAEK_SUBMISSION_RUNTIME_PACK_v1/manifest/creature_manifest_v1.json', 'utf8');
    for (const state of ['idle', 'move', 'alert', 'deploy', 'attack', 'stunned', 'retreat']) {
      expect(official).toContain(`act1_mineral_spider_${state}_`);
      expect(official).toContain('runtime_corrected');
    }
  });

  it('resolves original and flipX visual anchors from the same Ground Point without changing gameplay geometry', () => {
    const groundPoint = { x: 400, y: 300 };
    const common = [{ width: 52, height: 36 }, { x: 0.5, y: 1 }, { x: 1.5, y: 1.5 }] as const;
    const original = resolveMotionVisualAnchor(groundPoint, { x: 16, y: 18 }, ...common);
    const flipped = resolveMotionVisualAnchor(groundPoint, { x: 36, y: 18 }, ...common);
    expect(original).toEqual({ x: 385, y: 273 });
    expect(flipped).toEqual({ x: 415, y: 273 });
    expect((original.x + flipped.x) / 2).toBe(groundPoint.x);
  });
});
