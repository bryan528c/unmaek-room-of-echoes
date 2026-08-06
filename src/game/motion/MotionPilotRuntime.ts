import type Phaser from 'phaser';
import {
  motionPilotEnabled,
  motionPilotPresentationProfile,
  type MotionPilotRenderSource,
  type MotionPilotPresentationProfile,
  type MotionPilotTarget,
} from './MotionPilotConfig';
import { MOTION_PILOT_CACHE_KEYS, motionPilotTextureKey } from './MotionPilotAssets';
import { VisualSequencePlayer, type VisualFrame, type VisualSequence } from './VisualSequencePlayer';
import { ACT1_FINAL_CACHE_KEYS, act1FinalImagePaths, act1FinalTextureKey } from '../final/Act1FinalAssets';
import {
  ACT1_FINAL_PLAYER_VISUAL_SCALE,
  act1FinalCorrectedFrameIsStable,
  act1FinalCreaturePresentationProfile,
  act1FinalEnabled,
} from '../final/Act1FinalConfig';

export type MotionDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type PlayerMotionSequenceId = 'idle' | 'move' | 'dash' | 'basic_attack' | 'parry' | 'word_skill' | 'hit_recover';
export type PlayerMotionSource = 'SEQUENCE' | 'STANDING_LOCK_FALLBACK' | 'PROCEDURAL_STANDING_FALLBACK';

interface RawPlayerFrame { file: string; durationMs: number; role?: string }
interface RawPlayerSequence { frames: readonly RawPlayerFrame[]; loop: boolean }
type LowerMotionDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
interface RawPlayerManifest {
  canonicalCanvas?: Readonly<{ width: number; height: number }>;
  groundPoint: Readonly<{ x: number; y: number }>;
  runtimeScale: number;
  directionLock: readonly string[];
  sequences: Readonly<Record<LowerMotionDirection, Readonly<Record<PlayerMotionSequenceId, RawPlayerSequence>>>>;
}
interface RawPlayerAnchors {
  anchors: Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>>;
}

interface FinalPlayerFrame { file: string; durationMsCandidate: number }
interface FinalPlayerSequence { frames: readonly FinalPlayerFrame[]; loop: boolean }
interface FinalPlayerManifest {
  canonicalCanvas: Readonly<{ width: number; height: number }>;
  groundPoint: Readonly<{ x: number; y: number }>;
  runtimeScale: number;
  directions: Readonly<Record<LowerMotionDirection, Readonly<Record<PlayerMotionSequenceId, FinalPlayerSequence>>>>;
}
interface FinalPlayerAnchors { frames: Readonly<Record<string, Readonly<Record<string, Readonly<{ x: number; y: number }>>>>> }

interface RawCreatureFrame { file: string; previewDurationMs: number }
interface RawCreatureSequence {
  id: string;
  frames: readonly RawCreatureFrame[];
  loopPlaybackOrder: readonly number[] | null;
  hitAlignedFrameCandidate: number | null;
}
interface RawCreatureSubject {
  id: string;
  pilotSequences: readonly RawCreatureSequence[];
}
interface RawCreatureManifest { subjects: readonly RawCreatureSubject[] }
interface RawCreatureAnchorOrigin {
  anchorId: string;
  visibleAttackOrigin: Readonly<{ x: number; y: number }>;
  flipXVisibleOrigin: Readonly<{ x: number; y: number }> | null;
}
interface RawCreatureAnchorFrame {
  file: string;
  applyToVfx: boolean;
  origins: readonly RawCreatureAnchorOrigin[];
}
interface RawCreatureAnchorSubject { id: string; frames?: readonly RawCreatureAnchorFrame[] }
interface RawCreatureAnchors { subjects: readonly RawCreatureAnchorSubject[] }

interface FinalCreatureStatusEntry {
  nativeCanvas: Readonly<{ width: number; height: number }>;
  nativeGroundPoint: Readonly<{ x: number; y: number }>;
  nativeDisplayScale: number;
}
interface FinalCreatureStatus {
  species: Readonly<Record<string, FinalCreatureStatusEntry>>;
  canonicalAnchorReference: Readonly<Record<string, Readonly<Record<string, Readonly<{ x: number; y: number }>>>>>;
}
interface FinalCreatureAnchors { frames: Readonly<Record<string, Readonly<Record<string, Readonly<{ x: number; y: number }>>>>> }

const FINAL_CORRECTED_FRAME_MAP: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  pressure_swift: {
    'fly:0': 'creatures/pressure_swift/readability_corrected/pressure_swift_native_fly_f01.png',
    'fly:1': 'creatures/pressure_swift/readability_corrected/pressure_swift_native_fly_f02.png',
    'fly:2': 'creatures/pressure_swift/readability_corrected/pressure_swift_native_fly_f03.png',
    'evade:0': 'creatures/pressure_swift/readability_corrected/pressure_swift_native_evade_f01.png',
  },
  deflect_bat: {
    'idle:0': 'creatures/deflect_bat/readability_corrected/deflect_bat_native_idle_f01.png',
    'move:0': 'creatures/deflect_bat/readability_corrected/deflect_bat_native_move_f01.png',
    'prep:0': 'creatures/deflect_bat/readability_corrected/deflect_bat_native_prep_f01.png',
    'attack:0': 'creatures/deflect_bat/readability_corrected/deflect_bat_native_attack_f01.png',
    'attack:1': 'creatures/deflect_bat/readability_corrected/deflect_bat_native_attack_f02.png',
    'hit_recover:0': 'creatures/deflect_bat/readability_corrected/deflect_bat_native_hit_recover_f01.png',
  },
  rewind_lizard: {
    'idle:0': 'creatures/rewind_lizard/readability_corrected/rewind_lizard_native_idle_f01.png',
    'move:0': 'creatures/rewind_lizard/readability_corrected/rewind_lizard_native_move_f01.png',
    'prep:0': 'creatures/rewind_lizard/readability_corrected/rewind_lizard_native_prep_f01.png',
    'attack:0': 'creatures/rewind_lizard/readability_corrected/rewind_lizard_native_attack_f01.png',
    'attack:1': 'creatures/rewind_lizard/readability_corrected/rewind_lizard_native_attack_f02.png',
    'hit_recover:0': 'creatures/rewind_lizard/readability_corrected/rewind_lizard_native_hit_recover_f01.png',
  },
  mineral_spider: {
    'idle:0': 'creatures/mineral_spider/readability_corrected/act1_mineral_spider_idle_front_corrected_candidate_104x88.png',
    'move:0': 'creatures/mineral_spider/readability_corrected/act1_mineral_spider_move_side_corrected_candidate_104x88.png',
    'idle_to_alert:2': 'creatures/mineral_spider/readability_corrected/act1_mineral_spider_alert_front_corrected_candidate_104x88.png',
    'alert_to_deploy:2': 'creatures/mineral_spider/readability_corrected/act1_mineral_spider_deploy_side_corrected_candidate_104x88.png',
    'deploy_to_attack:3': 'creatures/mineral_spider/readability_corrected/act1_mineral_spider_attack_side_corrected_candidate_104x88.png',
  },
  resonance_goral: {
    'idle:0': 'creatures/resonance_goral/readability_corrected/resonance_goral_native_idle_f01.png',
    'warning:0': 'creatures/resonance_goral/readability_corrected/resonance_goral_native_warning_f01.png',
    'combat_prep:0': 'creatures/resonance_goral/readability_corrected/resonance_goral_native_combat_prep_f01.png',
    'charge_attack:0': 'creatures/resonance_goral/readability_corrected/resonance_goral_native_charge_attack_f01.png',
    'charge_attack:1': 'creatures/resonance_goral/readability_corrected/resonance_goral_native_charge_attack_f02.png',
    'hit_recover:0': 'creatures/resonance_goral/readability_corrected/resonance_goral_native_hit_recover_f01.png',
  },
};

export interface MotionAlphaBounds { x: number; y: number; width: number; height: number }

const alphaBoundsCache = new Map<string, MotionAlphaBounds>();

const textureAlphaBounds = (texture: Phaser.Textures.Texture): MotionAlphaBounds => {
  const cached = alphaBoundsCache.get(texture.key);
  if (cached) return cached;
  const source = texture.getSourceImage() as CanvasImageSource & { width: number; height: number };
  const fallback = { x: 0, y: 0, width: source.width, height: source.height };
  if (typeof document === 'undefined') return fallback;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallback;
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width; let top = canvas.height; let right = -1; let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      if ((data[(y * canvas.width + x) * 4 + 3] ?? 0) === 0) continue;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    const bounds = right < left || bottom < top ? fallback : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
    alphaBoundsCache.set(texture.key, bounds);
    return bounds;
  } catch {
    return fallback;
  }
};

export const quantizeMotionDirection = (x: number, y: number, fallbackAngle = 0): MotionDirection => {
  const angle = x * x + y * y > 0.0001 ? Math.atan2(y, x) : fallbackAngle;
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return (['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const)[sector] ?? 'E';
};

export const playerMotionSource = (direction: MotionDirection, fullEight = false): PlayerMotionSource =>
  fullEight || direction === 'S' || direction === 'E' ? 'SEQUENCE' : 'STANDING_LOCK_FALLBACK';

export interface ProceduralStandingFallbackTransform { y: number; rotation: number }

export const proceduralStandingFallbackTransform = (time: number, moving: boolean): ProceduralStandingFallbackTransform => {
  if (!moving) return { y: 0, rotation: 0 };
  const phase = Math.floor(Math.max(0, time) / 90) % 4;
  const lean = 1.5 * Math.PI / 180;
  return [
    { y: 0, rotation: 0 },
    { y: -1, rotation: -lean },
    { y: 0, rotation: 0 },
    { y: 1, rotation: lean },
  ][phase] ?? { y: 0, rotation: 0 };
};

export const resolveMotionVisualAnchor = (
  groundPoint: Readonly<{ x: number; y: number }>,
  point: Readonly<{ x: number; y: number }>,
  textureSize: Readonly<{ width: number; height: number }>,
  origin: Readonly<{ x: number; y: number }>,
  scale: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> => ({
  x: groundPoint.x + (point.x - origin.x * textureSize.width) * Math.abs(scale.x),
  y: groundPoint.y + (point.y - origin.y * textureSize.height) * Math.abs(scale.y),
});

const directionLockPath = (direction: MotionDirection): string => `player/direction_lock/player_${direction.toLowerCase()}.png`;

const toPlayerSequence = (direction: LowerMotionDirection, id: PlayerMotionSequenceId, raw: RawPlayerSequence): VisualSequence => {
  const mainFrames = id === 'parry' ? raw.frames.filter((frame) => !frame.role || frame.role === 'main') : raw.frames;
  return {
    id: `player:${direction}:${id}`,
    frames: mainFrames.map((frame) => ({ file: frame.file, durationMs: frame.durationMs, role: frame.role })),
    loop: raw.loop,
    contactFrame: id === 'basic_attack' ? 3 : undefined,
  };
};

export interface PlayerMotionSnapshot {
  enabled: boolean;
  direction: MotionDirection;
  sequence: PlayerMotionSequenceId;
  source: PlayerMotionSource;
  frameFile: string;
  frameIndex: number;
  renderSource: MotionPilotRenderSource;
  textureKey: string;
  uniformScale: number;
  sourceWidth: number;
  sourceHeight: number;
  displayWidth: number;
  displayHeight: number;
  alphaBounds: MotionAlphaBounds;
  visibleWidth: number;
  visibleHeight: number;
  groundPointDelta: number;
  proceduralOffsetY: number;
  proceduralRotationDeg: number;
  visualObjectCount: number;
  playCount: number;
  completionCount: number;
  frameAdvanceCount: number;
  filterMode: number;
}

export class HeroMotionPresentation {
  private readonly manifest: RawPlayerManifest;
  private readonly anchors: RawPlayerAnchors;
  private readonly player = new VisualSequencePlayer();
  private direction: MotionDirection = 'S';
  private sequence: PlayerMotionSequenceId = 'idle';
  private source: PlayerMotionSource = 'SEQUENCE';
  private frameFile = directionLockPath('S');
  private fallbackUntil = 0;
  private actionUntil = 0;
  private parryResolved = false;
  private proceduralOffsetY = 0;
  private proceduralRotation = 0;
  private readonly profile: MotionPilotPresentationProfile;
  private readonly visual: Phaser.GameObjects.Image;
  private readonly finalHandoff: boolean;
  private actActive = true;

  public static create(sprite: Phaser.Physics.Arcade.Sprite): HeroMotionPresentation | undefined {
    if (!motionPilotEnabled()) return undefined;
    if (act1FinalEnabled()) {
      const raw = sprite.scene.cache.json.get(ACT1_FINAL_CACHE_KEYS.playerManifest) as FinalPlayerManifest | undefined;
      const rawAnchors = sprite.scene.cache.json.get(ACT1_FINAL_CACHE_KEYS.playerAnchors) as FinalPlayerAnchors | undefined;
      if (!raw || !rawAnchors) throw new Error('[HeroMotionPresentation] act1Final=1 but player data was not preloaded');
      const sequences = Object.fromEntries(Object.entries(raw.directions).map(([direction, directionSequences]) => [
        direction,
        Object.fromEntries(Object.entries(directionSequences).map(([id, sequence]) => [id, {
          loop: sequence.loop,
          frames: sequence.frames.map((frame) => ({ file: frame.file, durationMs: frame.durationMsCandidate })),
        }])),
      ])) as unknown as RawPlayerManifest['sequences'];
      const anchors: RawPlayerAnchors = { anchors: Object.fromEntries(Object.entries(rawAnchors.frames).map(([file, values]) => [
        file,
        Object.fromEntries(Object.entries(values).map(([id, point]) => [id, [point.x, point.y] as const])),
      ])) };
      return new HeroMotionPresentation(sprite, {
        canonicalCanvas: raw.canonicalCanvas,
        groundPoint: raw.groundPoint,
        runtimeScale: raw.runtimeScale,
        directionLock: [],
        sequences,
      }, anchors, true);
    }
    const manifest = sprite.scene.cache.json.get(MOTION_PILOT_CACHE_KEYS.playerManifest) as RawPlayerManifest | undefined;
    const anchors = sprite.scene.cache.json.get(MOTION_PILOT_CACHE_KEYS.playerAnchors) as RawPlayerAnchors | undefined;
    if (!manifest || !anchors) throw new Error('[HeroMotionPresentation] motionPilot=1 but player data was not preloaded');
    return new HeroMotionPresentation(sprite, manifest, anchors, false);
  }

  private constructor(
    private readonly sprite: Phaser.Physics.Arcade.Sprite,
    manifest: RawPlayerManifest,
    anchors: RawPlayerAnchors,
    finalHandoff: boolean,
  ) {
    this.manifest = manifest;
    this.anchors = anchors;
    this.finalHandoff = finalHandoff;
    this.profile = finalHandoff
      ? { source: 'FINAL_HANDOFF', uniformScale: ACT1_FINAL_PLAYER_VISUAL_SCALE, outlinePixels: 1, outlineAlpha: 0.28, directionPolicy: 'FULL_8' }
      : motionPilotPresentationProfile('player');
    if (finalHandoff) this.frameFile = this.manifest.sequences.s.idle.frames[0]?.file ?? this.frameFile;
    this.visual = sprite.scene.add.image(Math.round(sprite.x), Math.round(sprite.y), this.textureKey(this.frameFile))
      .setOrigin(this.origin.x, this.origin.y)
      .setScale(this.profile.uniformScale)
      .setDepth(sprite.depth);
    // Keep the legacy Physics Sprite alive and geometrically unchanged. Only
    // its renderer is hidden while the non-physics pilot visual is active.
    this.sprite.setVisible(false);
    this.applyFrame(this.frameFile);
    this.syncVisual();
  }

  public setLocomotion(time: number, velocityX: number, velocityY: number, facingAngle: number): void {
    if (!this.actActive) return;
    if (time < this.actionUntil || time < this.fallbackUntil) { this.update(time); return; }
    const direction = quantizeMotionDirection(velocityX, velocityY, facingAngle);
    const sequence: PlayerMotionSequenceId = velocityX * velocityX + velocityY * velocityY > 0.0001 ? 'move' : 'idle';
    if (direction === this.direction && sequence === this.sequence && (this.source !== 'SEQUENCE' || this.player.snapshot().sequenceId)) { this.update(time); return; }
    this.start(direction, sequence, time);
  }

  public startAction(
    sequence: Exclude<PlayerMotionSequenceId, 'idle' | 'move'>,
    directionX: number,
    directionY: number,
    fallbackAngle: number,
    time: number,
    durationMs: number,
    contactOffsetMs?: number,
  ): void {
    if (!this.actActive) return;
    const direction = quantizeMotionDirection(directionX, directionY, fallbackAngle);
    this.actionUntil = time + durationMs;
    this.start(direction, sequence, time, durationMs, contactOffsetMs);
    if (sequence === 'parry') this.parryResolved = false;
  }

  public resolveParry(success: boolean, time: number): void {
    if (!this.actActive) return;
    if (this.sequence !== 'parry' || this.parryResolved) return;
    this.parryResolved = true;
    this.actionUntil = Math.max(this.actionUntil, time + 110);
    if (this.source !== 'SEQUENCE') { this.fallbackUntil = Math.max(this.fallbackUntil, time + 110); return; }
    if (this.finalHandoff) return;
    const raw = this.manifest.sequences[this.direction.toLowerCase() as LowerMotionDirection].parry;
    const role = success ? 'success_aux' : 'failure_aux';
    const frame = raw.frames.find((candidate) => candidate.role === role);
    if (!frame) return;
    this.player.play({ id: `player:${this.direction.toLowerCase()}:parry:${role}`, frames: [frame], loop: false }, { startAt: time, durationMs: frame.durationMs });
    this.applyFrame(frame.file);
  }

  public update(time: number): void {
    if (!this.actActive) return;
    if (this.source !== 'SEQUENCE') {
      const transform = proceduralStandingFallbackTransform(time, this.source === 'PROCEDURAL_STANDING_FALLBACK' && this.sequence === 'move');
      this.proceduralOffsetY = transform.y;
      this.proceduralRotation = transform.rotation;
      this.applyFrame(directionLockPath(this.direction));
      this.syncVisual();
      return;
    }
    const frame = this.player.update(time);
    if (frame) this.applyFrame(frame.file);
    this.syncVisual();
  }

  public cancel(): void {
    this.player.stop();
    this.fallbackUntil = 0;
    this.actionUntil = 0;
    this.parryResolved = false;
    this.proceduralOffsetY = 0;
    this.proceduralRotation = 0;
  }

  public destroy(): void {
    this.cancel();
    this.visual.destroy();
  }

  public anchorWorld(anchorId: 'dagger_tip' | 'parry_center' | 'word_target' | 'collarbone_resonance'): Readonly<{ x: number; y: number }> | undefined {
    if (!this.actActive) return undefined;
    const anchor = this.anchors.anchors[this.frameFile]?.[anchorId];
    if (!anchor) return undefined;
    const ground = this.manifest.groundPoint;
    return {
      x: this.sprite.x + (anchor[0] - ground.x) * this.profile.uniformScale,
      y: this.sprite.y + (anchor[1] - ground.y) * this.profile.uniformScale,
    };
  }

  public setTint(color: number, fill = false): void {
    if (!this.visual.active) return;
    if (fill) this.visual.setTintFill(color);
    else this.visual.setTint(color);
  }

  public clearTint(): void { if (this.visual.active) this.visual.clearTint(); }

  public createAfterimage(x: number, y: number, depth: number): Phaser.GameObjects.Image {
    return this.sprite.scene.add.image(Math.round(x), Math.round(y), this.visual.texture.key)
      .setOrigin(this.visual.originX, this.visual.originY)
      .setScale(this.profile.uniformScale)
      .setRotation(this.visual.rotation)
      .setFlipX(this.visual.flipX)
      .setTint(0x39a6be)
      .setAlpha(0.3)
      .setDepth(depth);
  }

  public syncCompanion(companion: Phaser.GameObjects.Image, outlinePixels: number, outlineAlpha: number): void {
    if (!this.visual.active || !this.actActive) { companion.setVisible(false); return; }
    if (companion.texture.key !== this.visual.texture.key) companion.setTexture(this.visual.texture.key);
    const frameWidth = Math.max(1, this.visual.frame.realWidth);
    const frameHeight = Math.max(1, this.visual.frame.realHeight);
    companion.setPosition(this.visual.x, this.visual.y)
      .setOrigin(this.visual.originX, this.visual.originY)
      .setScale(
        this.profile.uniformScale + outlinePixels * 2 / frameWidth,
        this.profile.uniformScale + outlinePixels * 2 / frameHeight,
      )
      .setRotation(this.visual.rotation)
      .setFlipX(this.visual.flipX)
      .setAlpha(this.visual.alpha * outlineAlpha)
      .setVisible(this.visual.visible)
      .setDepth(this.visual.depth - 0.1);
  }

  public snapshot(): PlayerMotionSnapshot {
    const sequence = this.player.snapshot();
    const sourceWidth = this.visual.frame.realWidth;
    const sourceHeight = this.visual.frame.realHeight;
    const alphaBounds = textureAlphaBounds(this.visual.texture);
    return {
      enabled: this.actActive,
      direction: this.direction,
      sequence: this.sequence,
      source: this.source,
      frameFile: this.frameFile,
      frameIndex: sequence.frameIndex,
      renderSource: this.profile.source,
      textureKey: this.visual.texture.key,
      uniformScale: this.profile.uniformScale,
      sourceWidth,
      sourceHeight,
      displayWidth: sourceWidth * this.profile.uniformScale,
      displayHeight: sourceHeight * this.profile.uniformScale,
      alphaBounds,
      visibleWidth: alphaBounds.width * this.profile.uniformScale,
      visibleHeight: alphaBounds.height * this.profile.uniformScale,
      groundPointDelta: Math.hypot(this.visual.x - this.sprite.x, this.visual.y - this.sprite.y),
      proceduralOffsetY: this.proceduralOffsetY,
      proceduralRotationDeg: this.proceduralRotation * 180 / Math.PI,
      visualObjectCount: Number(this.visual.active),
      playCount: sequence.playCount,
      completionCount: sequence.completionCount,
      frameAdvanceCount: sequence.frameAdvanceCount,
      filterMode: this.visual.texture.source[0]?.scaleMode ?? -1,
    };
  }

  public get scale(): number { return this.profile.uniformScale; }
  public get enabled(): boolean { return this.actActive; }
  public get isFinalHandoff(): boolean { return this.finalHandoff && this.actActive; }
  public setAct(actIndex: number): void {
    if (!this.finalHandoff) return;
    this.actActive = actIndex === 1;
    this.visual.setActive(this.actActive).setVisible(this.actActive);
    this.sprite.setVisible(!this.actActive);
    if (!this.actActive) this.cancel();
  }
  public get origin(): Readonly<{ x: number; y: number }> {
    const canvas = this.manifest.canonicalCanvas ?? { width: 64, height: 64 };
    return { x: this.manifest.groundPoint.x / canvas.width, y: this.manifest.groundPoint.y / canvas.height };
  }

  private start(
    direction: MotionDirection,
    sequence: PlayerMotionSequenceId,
    time: number,
    durationMs?: number,
    contactOffsetMs?: number,
  ): void {
    this.direction = direction;
    this.sequence = sequence;
    const authoredSource = playerMotionSource(direction, this.finalHandoff);
    this.source = authoredSource === 'STANDING_LOCK_FALLBACK' && sequence === 'move' ? 'PROCEDURAL_STANDING_FALLBACK' : authoredSource;
    this.player.stop();
    if (this.source !== 'SEQUENCE') {
      this.fallbackUntil = durationMs === undefined ? 0 : time + durationMs;
      this.applyFrame(directionLockPath(direction));
      return;
    }
    const lowerDirection = direction.toLowerCase() as LowerMotionDirection;
    const raw = this.manifest.sequences[lowerDirection][sequence];
    const resolved = toPlayerSequence(lowerDirection, sequence, raw);
    this.player.play(resolved, {
      startAt: time,
      durationMs,
      contactAt: contactOffsetMs === undefined ? undefined : time + contactOffsetMs,
    });
    const frame = this.player.update(time);
    if (frame) this.applyFrame(frame.file);
  }

  private applyFrame(file: string): void {
    this.frameFile = file;
    this.visual.setTexture(this.textureKey(file))
      .setOrigin(this.origin.x, this.origin.y)
      .setScale(this.profile.uniformScale)
      .setRotation(this.proceduralRotation)
      .setFlipX(false);
  }

  private textureKey(file: string): string {
    return this.finalHandoff ? act1FinalTextureKey(file) : motionPilotTextureKey('player', file);
  }

  private syncVisual(): void {
    if (!this.visual.active) return;
    this.visual.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y) + this.proceduralOffsetY)
      .setRotation(this.proceduralRotation)
      .setDepth(this.sprite.depth)
      .setAlpha(this.sprite.alpha)
      .setVisible(this.sprite.active);
  }
}

const stateSequenceFor = (creatureId: string, stateId: string): string | undefined => {
  if (creatureId === 'mineral_spider') {
    if (stateId === 'hit' || stateId === 'stunned' || stateId === 'retreat') return 'stunned_or_retreat';
    if (stateId === 'attack') return 'attack_to_recover';
    if (stateId === 'idle' || stateId === 'move') return stateId;
    return undefined;
  }
  if (stateId === 'hit') return 'hit_recover';
  return stateId;
};

export interface CreatureMotionSnapshot {
  enabled: boolean;
  creatureId: string;
  sequence: string;
  frameFile: string;
  frameIndex: number;
  actionLocked: boolean;
  renderSource: MotionPilotRenderSource;
  uniformScale: number;
  outlinePixels: number;
  directionPolicy: MotionPilotPresentationProfile['directionPolicy'];
  playCount: number;
  completionCount: number;
  frameAdvanceCount: number;
  blockedRestartCount: number;
  baseStateApplyCount: number;
  filterMode: number;
  alphaBounds: MotionAlphaBounds;
  visibleWidth: number;
  visibleHeight: number;
  sourceCanvas: Readonly<{ width: number; height: number }>;
  sourceGroundPoint: Readonly<{ x: number; y: number }>;
  groundPointDelta: number;
}

export const creatureMotionActionPriority = (sequenceIds: readonly string[]): number => {
  if (sequenceIds.includes('retreat')) return 4;
  if (sequenceIds.some((id) => id === 'attack' || id === 'charge_attack' || id === 'deploy_to_attack')) return 3;
  if (sequenceIds.some((id) => id === 'warning' || id === 'combat_prep' || id === 'prep')) return 2;
  if (sequenceIds.includes('hit_recover')) return 1;
  return 0;
};

export const shouldStartCreatureMotionAction = (
  currentSignature: string,
  currentPriority: number,
  actionUntil: number,
  time: number,
  nextSignature: string,
  nextPriority: number,
): boolean => time >= actionUntil || nextSignature !== currentSignature && nextPriority > currentPriority;

const finalCreatureSubject = (creatureId: string): RawCreatureSubject | undefined => {
  const prefix = `creatures/${creatureId}/readability_verified/`;
  const grouped = new Map<string, string[]>();
  for (const path of act1FinalImagePaths('verified')) {
    if (!path.startsWith(prefix)) continue;
    const sequence = path.slice(prefix.length).split('/')[0];
    if (!sequence) continue;
    const list = grouped.get(sequence) ?? []; list.push(path); grouped.set(sequence, list);
  }
  if (grouped.size === 0) return undefined;
  const corrected = FINAL_CORRECTED_FRAME_MAP[creatureId] ?? {};
  const contactBySequence: Readonly<Record<string, number>> = { attack: 2, charge_attack: 4, deploy_to_attack: 3 };
  return {
    id: creatureId,
    pilotSequences: [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, paths]) => {
      const ordered = [...paths].sort();
      return {
        id,
        frames: ordered.map((file, index) => ({
          file: act1FinalCorrectedFrameIsStable(creatureId, id, index) ? corrected[`${id}:${index}`] ?? file : file,
          previewDurationMs: id === 'idle' ? 180 : id === 'move' || id === 'fly' ? 95 : 110,
        })),
        loopPlaybackOrder: id === 'idle' || id === 'move' || id === 'fly' ? ordered.map((_, index) => index) : null,
        hitAlignedFrameCandidate: contactBySequence[id] ?? null,
      };
    }),
  };
};

export class CreatureMotionPresentation {
  private readonly sequences = new Map<string, VisualSequence>();
  private readonly player = new VisualSequencePlayer();
  private baseState = 'idle';
  private currentSequence = 'idle';
  private frameFile = '';
  private actionUntil = 0;
  private currentActionPriority = 0;
  private blockedRestartCount = 0;
  private baseStateApplyCount = 0;
  private pausedAt?: number;
  private pausedUntil = 0;
  private readonly profile: MotionPilotPresentationProfile;
  private readonly finalHandoff: boolean;
  private readonly finalStatus?: FinalCreatureStatus;
  private readonly finalAnchors?: FinalCreatureAnchors;

  public static create(
    sprite: Phaser.GameObjects.Image,
    creatureId: string,
    applyFrame: (textureKey: string) => void,
  ): CreatureMotionPresentation | undefined {
    if (!motionPilotEnabled()) return undefined;
    const scene = sprite.scene;
    if (act1FinalEnabled()) {
      const subject = finalCreatureSubject(creatureId);
      if (!subject) return undefined;
      const status = scene.cache.json.get(ACT1_FINAL_CACHE_KEYS.creatureStatus) as FinalCreatureStatus | undefined;
      const anchors = scene.cache.json.get(ACT1_FINAL_CACHE_KEYS.creatureAnchors) as FinalCreatureAnchors | undefined;
      if (!status || !anchors) throw new Error('[CreatureMotionPresentation] final creature data was not preloaded');
      return new CreatureMotionPresentation(sprite, subject, undefined, applyFrame, true, status, anchors);
    }
    const manifest = scene.cache.json.get(MOTION_PILOT_CACHE_KEYS.creatureManifest) as RawCreatureManifest | undefined;
    const anchors = scene.cache.json.get(MOTION_PILOT_CACHE_KEYS.creatureAnchors) as RawCreatureAnchors | undefined;
    const subject = manifest?.subjects.find((candidate) => candidate.id === creatureId);
    if (!subject) return undefined;
    return new CreatureMotionPresentation(sprite, subject, anchors, applyFrame, false);
  }

  private constructor(
    private readonly sprite: Phaser.GameObjects.Image,
    private readonly subject: RawCreatureSubject,
    private readonly anchors: RawCreatureAnchors | undefined,
    private readonly applyFrame: (textureKey: string) => void,
    finalHandoff: boolean,
    finalStatus?: FinalCreatureStatus,
    finalAnchors?: FinalCreatureAnchors,
  ) {
    this.finalHandoff = finalHandoff;
    this.finalStatus = finalStatus;
    this.finalAnchors = finalAnchors;
    const legacyProfile = motionPilotPresentationProfile(subject.id as MotionPilotTarget);
    const finalProfile = act1FinalCreaturePresentationProfile(subject.id);
    this.profile = finalHandoff ? {
      source: 'FINAL_CORRECTED',
      uniformScale: finalProfile?.uniformScale ?? finalStatus?.species[subject.id]?.nativeDisplayScale ?? 1,
      outlinePixels: legacyProfile.outlinePixels,
      outlineAlpha: legacyProfile.outlineAlpha,
      directionPolicy: subject.id === 'resonance_goral' ? 'MIRRORED_STAGING' : legacyProfile.directionPolicy,
    } : legacyProfile;
    for (const raw of subject.pilotSequences) {
      this.sequences.set(raw.id, {
        id: `${subject.id}:${raw.id}`,
        frames: raw.frames.map((frame) => ({ file: frame.file, durationMs: frame.previewDurationMs })),
        loop: Boolean(raw.loopPlaybackOrder),
        playbackOrder: raw.loopPlaybackOrder ?? undefined,
        contactFrame: raw.hitAlignedFrameCandidate ?? undefined,
      });
    }
    this.setState('idle', sprite.scene.time.now);
  }

  public setState(stateId: string, time: number): void {
    this.baseStateApplyCount += 1;
    this.baseState = stateId;
    if (time < this.actionUntil) return;
    const sequenceId = stateSequenceFor(this.subject.id, stateId);
    if (!sequenceId || !this.sequences.has(sequenceId)) return;
    if (this.currentSequence === sequenceId && this.player.isActive) return;
    this.play(sequenceId, time);
  }

  public playAction(sequenceIds: readonly string[], time: number, durationMs: number, contactOffsetMs?: number): void {
    const sequences = sequenceIds.map((id) => this.sequences.get(id)).filter((sequence): sequence is VisualSequence => Boolean(sequence));
    if (!sequences.length) return;
    const signature = sequenceIds.join('+');
    const priority = creatureMotionActionPriority(sequenceIds);
    if (!shouldStartCreatureMotionAction(this.currentSequence, this.currentActionPriority, this.actionUntil, time, signature, priority)) {
      this.blockedRestartCount += 1;
      return;
    }
    const frames: VisualFrame[] = [];
    let contactFrame: number | undefined;
    for (const sequence of sequences) {
      if (contactFrame === undefined && sequence.contactFrame !== undefined) contactFrame = frames.length + sequence.contactFrame;
      frames.push(...sequence.frames);
    }
    this.currentSequence = signature;
    this.currentActionPriority = priority;
    this.actionUntil = time + durationMs;
    this.player.play({ id: `${this.subject.id}:${this.currentSequence}`, frames, loop: false, contactFrame }, {
      startAt: time,
      durationMs,
      contactAt: contactOffsetMs === undefined ? undefined : time + contactOffsetMs,
    });
    this.update(time);
  }

  public cancelAction(time: number): void {
    this.player.stop();
    this.actionUntil = 0;
    this.currentActionPriority = 0;
    const fallback = stateSequenceFor(this.subject.id, this.baseState) ?? 'idle';
    if (this.sequences.has(fallback)) this.play(fallback, time);
  }

  public update(time: number): void {
    if (this.pausedAt !== undefined) {
      if (time < this.pausedUntil) {
        const frame = this.player.update(this.pausedAt);
        if (frame) this.applyMotionFrame(frame.file);
        return;
      }
      const pausedDuration = Math.max(0, this.pausedUntil - this.pausedAt);
      this.player.shiftWindow(pausedDuration);
      if (this.actionUntil > this.pausedAt) this.actionUntil += pausedDuration;
      this.pausedAt = undefined;
      this.pausedUntil = 0;
    }
    const frame = this.player.update(time);
    if (frame) this.applyMotionFrame(frame.file);
    if (time < this.actionUntil || this.player.isActive) return;
    this.actionUntil = 0;
    this.currentActionPriority = 0;
    const fallback = stateSequenceFor(this.subject.id, this.baseState) ?? 'idle';
    if (fallback !== this.currentSequence && this.sequences.has(fallback)) this.play(fallback, time);
  }

  public pause(time: number, until: number): void {
    if (until <= time) return;
    if (this.pausedAt === undefined) this.pausedAt = time;
    this.pausedUntil = Math.max(this.pausedUntil, until);
  }

  public visualAnchor(groundPoint: Readonly<{ x: number; y: number }>, flipX: boolean, anchorId?: string): Readonly<{ x: number; y: number }> | undefined {
    if (this.finalHandoff) {
      const aliases: Readonly<Record<string, string>> = {
        'mouth-organ': 'mouth_resonance_organ',
        snout: 'snout',
        'thread-spawn-a': 'thread_spawn_a',
        'thread-spawn-b': 'thread_spawn_b',
        'thread-spawn-c': 'thread_spawn_c',
        'horn-root': 'horn_root',
        'forehoof-left': 'forehoof_left',
        'forehoof-right': 'forehoof_right',
      };
      const resolvedId = anchorId ? aliases[anchorId] ?? anchorId : undefined;
      const exact = this.finalAnchors?.frames[this.frameFile];
      const canonical = this.finalStatus?.canonicalAnchorReference[this.subject.id];
      const point = resolvedId ? exact?.[resolvedId] ?? canonical?.[resolvedId] : Object.values(exact ?? canonical ?? {})[0];
      if (!point) return undefined;
      const source = this.sprite.scene.textures.get(this.textureKey(this.frameFile)).getSourceImage() as HTMLImageElement;
      const sourceProfile = this.sourceFamilyProfile;
      const correctedProfile = act1FinalCreaturePresentationProfile(this.subject.id);
      const familyPoint = this.renderSource === 'VERIFIED_MOTION' && correctedProfile
        ? {
          x: point.x * sourceProfile.canvas.width / correctedProfile.correctedCanvas.width,
          y: point.y * sourceProfile.canvas.height / correctedProfile.correctedCanvas.height,
        }
        : point;
      const mirrored = flipX ? { x: source.width - familyPoint.x, y: familyPoint.y } : familyPoint;
      return resolveMotionVisualAnchor(groundPoint, mirrored, source, this.origin, { x: this.uniformScale, y: this.uniformScale });
    }
    const subject = this.anchors?.subjects.find((candidate) => candidate.id === this.subject.id);
    const frame = subject?.frames?.find((candidate) => candidate.file === this.frameFile && candidate.applyToVfx);
    const origin = anchorId ? frame?.origins.find((candidate) => candidate.anchorId === anchorId) : frame?.origins[0];
    const texture = this.sprite.scene.textures.get(this.textureKey(this.frameFile)).getSourceImage() as HTMLImageElement;
    const original = origin?.visibleAttackOrigin;
    const point = flipX
      ? origin?.flipXVisibleOrigin ?? (original ? { x: texture.width - original.x, y: original.y } : undefined)
      : original;
    if (!point) return undefined;
    return resolveMotionVisualAnchor(
      groundPoint,
      point,
      texture,
      { x: this.sprite.originX, y: this.sprite.originY },
      { x: this.uniformScale, y: this.uniformScale },
    );
  }

  public snapshot(): CreatureMotionSnapshot {
    const sequence = this.player.snapshot();
    const texture = this.frameFile ? this.sprite.scene.textures.get(this.textureKey(this.frameFile)) : undefined;
    const alphaBounds = texture ? textureAlphaBounds(texture) : { x: 0, y: 0, width: 0, height: 0 };
    return {
      enabled: true,
      creatureId: this.subject.id,
      sequence: this.currentSequence,
      frameFile: this.frameFile,
      frameIndex: sequence.frameIndex,
      actionLocked: this.sprite.scene.time.now < this.actionUntil,
      renderSource: this.renderSource,
      uniformScale: this.uniformScale,
      outlinePixels: this.profile.outlinePixels,
      directionPolicy: this.profile.directionPolicy,
      playCount: sequence.playCount,
      completionCount: sequence.completionCount,
      frameAdvanceCount: sequence.frameAdvanceCount,
      blockedRestartCount: this.blockedRestartCount,
      baseStateApplyCount: this.baseStateApplyCount,
      filterMode: this.frameFile
        ? texture?.source[0]?.scaleMode ?? -1
        : -1,
      alphaBounds,
      visibleWidth: alphaBounds.width * this.uniformScale,
      visibleHeight: alphaBounds.height * this.uniformScale,
      sourceCanvas: this.sourceFamilyProfile.canvas,
      sourceGroundPoint: this.sourceFamilyProfile.groundPoint,
      groundPointDelta: Math.hypot(this.sprite.x - Math.round(this.sprite.x), this.sprite.y - Math.round(this.sprite.y)),
    };
  }

  public destroy(): void {
    this.player.stop(); this.actionUntil = 0; this.currentActionPriority = 0;
    this.pausedAt = undefined; this.pausedUntil = 0;
  }

  public get uniformScale(): number { return this.profile.uniformScale; }
  public get outlinePixels(): number { return this.profile.outlinePixels; }
  public get outlineAlpha(): number { return this.profile.outlineAlpha; }
  public get renderSource(): MotionPilotRenderSource {
    if (!this.finalHandoff) return this.profile.source;
    return this.frameFile.includes('/readability_corrected/') ? 'FINAL_CORRECTED' : 'VERIFIED_MOTION';
  }
  public get directionPolicy(): MotionPilotPresentationProfile['directionPolicy'] { return this.profile.directionPolicy; }
  public get origin(): Readonly<{ x: number; y: number }> {
    if (!this.finalHandoff) return { x: this.sprite.originX, y: this.sprite.originY };
    const source = this.sourceFamilyProfile;
    return { x: source.groundPoint.x / source.canvas.width, y: source.groundPoint.y / source.canvas.height };
  }

  private get sourceFamilyProfile(): Readonly<{
    canvas: Readonly<{ width: number; height: number }>;
    groundPoint: Readonly<{ x: number; y: number }>;
  }> {
    const profile = act1FinalCreaturePresentationProfile(this.subject.id);
    if (profile) return this.renderSource === 'FINAL_CORRECTED'
      ? { canvas: profile.correctedCanvas, groundPoint: profile.correctedGroundPoint }
      : { canvas: profile.verifiedCanvas, groundPoint: profile.verifiedGroundPoint };
    const species = this.finalStatus?.species[this.subject.id];
    return species
      ? { canvas: species.nativeCanvas, groundPoint: species.nativeGroundPoint }
      : { canvas: { width: 1, height: 1 }, groundPoint: { x: this.sprite.originX, y: this.sprite.originY } };
  }

  private play(sequenceId: string, time: number): void {
    const sequence = this.sequences.get(sequenceId);
    if (!sequence) return;
    this.currentSequence = sequenceId;
    this.player.play(sequence, { startAt: time });
    this.update(time);
  }

  private applyMotionFrame(file: string): void {
    if (file === this.frameFile) return;
    this.frameFile = file;
    this.applyFrame(this.textureKey(file));
  }

  private textureKey(file: string): string {
    return this.finalHandoff ? act1FinalTextureKey(file) : motionPilotTextureKey('act1', file);
  }
}
