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

export type MotionDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type PlayerMotionSequenceId = 'idle' | 'move' | 'dash' | 'basic_attack' | 'parry' | 'word_skill' | 'hit_recover';
export type PlayerMotionSource = 'SEQUENCE' | 'STANDING_LOCK_FALLBACK' | 'PROCEDURAL_STANDING_FALLBACK';

interface RawPlayerFrame { file: string; durationMs: number; role?: string }
interface RawPlayerSequence { frames: readonly RawPlayerFrame[]; loop: boolean }
interface RawPlayerManifest {
  groundPoint: Readonly<{ x: number; y: number }>;
  runtimeScale: number;
  directionLock: readonly string[];
  sequences: Readonly<Record<'s' | 'e', Readonly<Record<PlayerMotionSequenceId, RawPlayerSequence>>>>;
}
interface RawPlayerAnchors {
  anchors: Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>>;
}

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

export const playerMotionSource = (direction: MotionDirection): PlayerMotionSource =>
  direction === 'S' || direction === 'E' ? 'SEQUENCE' : 'STANDING_LOCK_FALLBACK';

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

const toPlayerSequence = (direction: 's' | 'e', id: PlayerMotionSequenceId, raw: RawPlayerSequence): VisualSequence => {
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
  private readonly profile = motionPilotPresentationProfile('player');
  private readonly visual: Phaser.GameObjects.Image;

  public static create(sprite: Phaser.Physics.Arcade.Sprite): HeroMotionPresentation | undefined {
    if (!motionPilotEnabled()) return undefined;
    const manifest = sprite.scene.cache.json.get(MOTION_PILOT_CACHE_KEYS.playerManifest) as RawPlayerManifest | undefined;
    const anchors = sprite.scene.cache.json.get(MOTION_PILOT_CACHE_KEYS.playerAnchors) as RawPlayerAnchors | undefined;
    if (!manifest || !anchors) throw new Error('[HeroMotionPresentation] motionPilot=1 but player data was not preloaded');
    return new HeroMotionPresentation(sprite, manifest, anchors);
  }

  private constructor(
    private readonly sprite: Phaser.Physics.Arcade.Sprite,
    manifest: RawPlayerManifest,
    anchors: RawPlayerAnchors,
  ) {
    this.manifest = manifest;
    this.anchors = anchors;
    this.visual = sprite.scene.add.image(Math.round(sprite.x), Math.round(sprite.y), motionPilotTextureKey('player', this.frameFile))
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
    const direction = quantizeMotionDirection(directionX, directionY, fallbackAngle);
    this.actionUntil = time + durationMs;
    this.start(direction, sequence, time, durationMs, contactOffsetMs);
    if (sequence === 'parry') this.parryResolved = false;
  }

  public resolveParry(success: boolean, time: number): void {
    if (this.sequence !== 'parry' || this.parryResolved) return;
    this.parryResolved = true;
    this.actionUntil = Math.max(this.actionUntil, time + 110);
    if (this.source !== 'SEQUENCE') { this.fallbackUntil = Math.max(this.fallbackUntil, time + 110); return; }
    const raw = this.manifest.sequences[this.direction.toLowerCase() as 's' | 'e'].parry;
    const role = success ? 'success_aux' : 'failure_aux';
    const frame = raw.frames.find((candidate) => candidate.role === role);
    if (!frame) return;
    this.player.play({ id: `player:${this.direction.toLowerCase()}:parry:${role}`, frames: [frame], loop: false }, { startAt: time, durationMs: frame.durationMs });
    this.applyFrame(frame.file);
  }

  public update(time: number): void {
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
    if (!this.visual.active) return;
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
      enabled: true,
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
  public get origin(): Readonly<{ x: number; y: number }> {
    return { x: this.manifest.groundPoint.x / 64, y: this.manifest.groundPoint.y / 64 };
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
    const authoredSource = playerMotionSource(direction);
    this.source = authoredSource === 'STANDING_LOCK_FALLBACK' && sequence === 'move' ? 'PROCEDURAL_STANDING_FALLBACK' : authoredSource;
    this.player.stop();
    if (this.source !== 'SEQUENCE') {
      this.fallbackUntil = durationMs === undefined ? 0 : time + durationMs;
      this.applyFrame(directionLockPath(direction));
      return;
    }
    const raw = this.manifest.sequences[direction.toLowerCase() as 's' | 'e'][sequence];
    const resolved = toPlayerSequence(direction.toLowerCase() as 's' | 'e', sequence, raw);
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
    this.visual.setTexture(motionPilotTextureKey('player', file))
      .setOrigin(this.origin.x, this.origin.y)
      .setScale(this.profile.uniformScale)
      .setRotation(this.proceduralRotation)
      .setFlipX(false);
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
  private readonly profile: MotionPilotPresentationProfile;

  public static create(
    sprite: Phaser.GameObjects.Image,
    creatureId: string,
    applyFrame: (textureKey: string) => void,
  ): CreatureMotionPresentation | undefined {
    if (!motionPilotEnabled()) return undefined;
    const scene = sprite.scene;
    const manifest = scene.cache.json.get(MOTION_PILOT_CACHE_KEYS.creatureManifest) as RawCreatureManifest | undefined;
    const anchors = scene.cache.json.get(MOTION_PILOT_CACHE_KEYS.creatureAnchors) as RawCreatureAnchors | undefined;
    const subject = manifest?.subjects.find((candidate) => candidate.id === creatureId);
    if (!subject) return undefined;
    return new CreatureMotionPresentation(sprite, subject, anchors, applyFrame);
  }

  private constructor(
    private readonly sprite: Phaser.GameObjects.Image,
    private readonly subject: RawCreatureSubject,
    private readonly anchors: RawCreatureAnchors | undefined,
    private readonly applyFrame: (textureKey: string) => void,
  ) {
    this.profile = motionPilotPresentationProfile(subject.id as MotionPilotTarget);
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
    const frame = this.player.update(time);
    if (frame) this.applyMotionFrame(frame.file);
    if (time < this.actionUntil || this.player.isActive) return;
    this.actionUntil = 0;
    this.currentActionPriority = 0;
    const fallback = stateSequenceFor(this.subject.id, this.baseState) ?? 'idle';
    if (fallback !== this.currentSequence && this.sequences.has(fallback)) this.play(fallback, time);
  }

  public visualAnchor(groundPoint: Readonly<{ x: number; y: number }>, flipX: boolean, anchorId?: string): Readonly<{ x: number; y: number }> | undefined {
    const subject = this.anchors?.subjects.find((candidate) => candidate.id === this.subject.id);
    const frame = subject?.frames?.find((candidate) => candidate.file === this.frameFile && candidate.applyToVfx);
    const origin = anchorId ? frame?.origins.find((candidate) => candidate.anchorId === anchorId) : frame?.origins[0];
    const texture = this.sprite.scene.textures.get(motionPilotTextureKey('act1', this.frameFile)).getSourceImage() as HTMLImageElement;
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
      { x: this.profile.uniformScale, y: this.profile.uniformScale },
    );
  }

  public snapshot(): CreatureMotionSnapshot {
    const sequence = this.player.snapshot();
    const texture = this.frameFile ? this.sprite.scene.textures.get(motionPilotTextureKey('act1', this.frameFile)) : undefined;
    const alphaBounds = texture ? textureAlphaBounds(texture) : { x: 0, y: 0, width: 0, height: 0 };
    return {
      enabled: true,
      creatureId: this.subject.id,
      sequence: this.currentSequence,
      frameFile: this.frameFile,
      frameIndex: sequence.frameIndex,
      actionLocked: this.sprite.scene.time.now < this.actionUntil,
      renderSource: this.profile.source,
      uniformScale: this.profile.uniformScale,
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
      visibleWidth: alphaBounds.width * this.profile.uniformScale,
      visibleHeight: alphaBounds.height * this.profile.uniformScale,
    };
  }

  public destroy(): void { this.player.stop(); this.actionUntil = 0; this.currentActionPriority = 0; }

  public get uniformScale(): number { return this.profile.uniformScale; }
  public get outlinePixels(): number { return this.profile.outlinePixels; }
  public get outlineAlpha(): number { return this.profile.outlineAlpha; }
  public get renderSource(): MotionPilotRenderSource { return this.profile.source; }

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
    this.applyFrame(motionPilotTextureKey('act1', file));
  }
}
