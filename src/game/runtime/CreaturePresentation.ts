import Phaser from 'phaser';
import { act1FinalBossPhaseOverlayEnabled } from '../final/Act1FinalConfig';
import { CreatureMotionPresentation, type CreatureMotionSnapshot } from '../motion/MotionPilotRuntime';
import { motionPilotPresentationProfile, resolveMirroredStagingFlip, type MotionPilotTarget } from '../motion/MotionPilotConfig';
import type { Ellipse } from '../systems/CombatGeometry';
import {
  bossDefeatPresentationFor,
  resolveBossPhaseState,
  resolveCreatureMetadata,
  resolveCreaturePresentationProfile,
  resolveCreatureState,
  resolveWorldAttackAnchor,
  resolveWorldHurtbox,
  resolveWorldShadowAnchor,
  runtimePresentationScale,
  runtimeSpriteOrigin,
  runtimeTextureKey,
  type ResolvedRuntimeState,
  type RuntimeCreatureMetadata,
  type RuntimePoint,
  type RuntimePresentationProfile,
} from './SubmissionRuntime';

const parseTint = (tint: string): number => Number.parseInt(tint.replace('#', ''), 16);

export interface PresentationCompanionTransform {
  textureKey: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  flipX: boolean;
  alpha: number;
  depth: number;
}

export interface CreaturePresentationCompanionSnapshot {
  outline: PresentationCompanionTransform | null;
  overlay: PresentationCompanionTransform | null;
  total: number;
}

const companionTransform = (image?: Phaser.GameObjects.Image): PresentationCompanionTransform | null => {
  if (!image?.active) return null;
  return {
    textureKey: image.texture.key,
    x: image.x,
    y: image.y,
    scaleX: image.scaleX,
    scaleY: image.scaleY,
    rotation: image.rotation,
    flipX: image.flipX,
    alpha: image.alpha,
    depth: image.depth,
  };
};

export class CreaturePresentation {
  public readonly metadata: RuntimeCreatureMetadata;
  public readonly profile: RuntimePresentationProfile;
  private state: ResolvedRuntimeState;
  private requestedFlipX = false;
  private pilotVisualFlipX = false;
  private outline?: Phaser.GameObjects.Image;
  private overlay?: Phaser.GameObjects.Image;
  private shakeUntil = 0;
  private readonly motion?: CreatureMotionPresentation;
  private pilotVisual?: Phaser.GameObjects.Image;

  public constructor(private readonly sprite: Phaser.Physics.Arcade.Sprite, creatureId: string) {
    this.metadata = resolveCreatureMetadata(creatureId);
    this.profile = resolveCreaturePresentationProfile(creatureId);
    const initialState = this.metadata.states.idle || this.metadata.stateAliases.idle
      ? 'idle'
      : Object.keys(this.metadata.states)[0];
    if (!initialState) throw new Error(`[CreaturePresentation] ${creatureId} has no runtime state`);
    this.state = resolveCreatureState(creatureId, initialState);
    if (this.profile.hostileReadability === 'neutral-outline' && this.profile.outlinePixels > 0) {
      this.outline = this.sprite.scene.add.image(this.sprite.x, this.sprite.y, runtimeTextureKey(this.state.assetFile))
        .setTint(0x071012).setAlpha(0);
    }
    this.applyResolvedState(this.state);
    this.motion = CreatureMotionPresentation.create(this.sprite, creatureId, (textureKey) => this.applyMotionFrame(textureKey));
    if (this.motion && this.motion.outlinePixels <= 0) {
      this.outline?.destroy();
      this.outline = undefined;
    }
    this.restoreStateTransform();
    this.motion?.setState(initialState, this.sprite.scene.time.now);
  }

  public get creatureId(): string { return this.metadata.id; }
  public get displayName(): string { return this.metadata.displayName; }
  public get baseScale(): number { return runtimePresentationScale(this.creatureId); }
  public get stateScale(): number { return this.state.scale; }
  public get effectiveFlipX(): boolean { return this.requestedFlipX !== this.state.flipX; }
  public get presentationFlipX(): boolean {
    const policy = this.motion?.directionPolicy;
    return policy === 'MIRRORED_STAGING' || policy === 'INVERTED_FLIP_X' ? this.pilotVisualFlipX : this.effectiveFlipX;
  }
  public get currentState(): string { return this.state.requestedState; }
  public get currentAssetFile(): string { return this.state.assetFile; }
  public get hasOverlay(): boolean { return Boolean(this.overlay?.active); }
  public get hasHostileReadability(): boolean { return Boolean(this.outline?.active); }
  public get hasNonlethalRetreat(): boolean { return bossDefeatPresentationFor(this.creatureId).mode === 'nonlethal-retreat'; }
  public get motionSnapshot(): CreatureMotionSnapshot | undefined { return this.motion?.snapshot(); }
  public get motionPilotActive(): boolean { return Boolean(this.motion); }

  public companionSnapshot(): CreaturePresentationCompanionSnapshot {
    const outline = companionTransform(this.outline);
    const overlay = companionTransform(this.overlay);
    return { outline, overlay, total: Number(Boolean(outline)) + Number(Boolean(overlay)) };
  }

  public hasState(stateId: string): boolean { return Boolean(this.metadata.states[stateId] || this.metadata.stateAliases[stateId]); }

  public applyState(stateId: string): void {
    this.applyResolvedState(resolveCreatureState(this.creatureId, stateId));
    this.motion?.setState(stateId, this.sprite.scene.time.now);
    this.motion?.update(this.sprite.scene.time.now);
  }

  public applyBossPhase(phase: 1 | 2 | 3 | 'preFight' | 'defeated/nonlethal'): void {
    const resolved = resolveBossPhaseState(this.creatureId, phase);
    this.applyResolvedState(act1FinalBossPhaseOverlayEnabled(this.creatureId, phase)
      ? resolved
      : { ...resolved, overlayFiles: [] });
    this.motion?.setState(phase === 'defeated/nonlethal' ? 'retreat' : 'idle', this.sprite.scene.time.now);
    this.motion?.update(this.sprite.scene.time.now);
  }

  public playMotionAction(sequenceIds: readonly string[], durationMs: number, contactOffsetMs?: number): void {
    this.motion?.playAction(sequenceIds, this.sprite.scene.time.now, durationMs, contactOffsetMs);
  }

  public cancelMotionAction(): void { this.motion?.cancelAction(this.sprite.scene.time.now); }

  public setFacingFlipX(flipped: boolean, horizontalDelta = flipped ? -1 : 1): void {
    this.requestedFlipX = this.metadata.directionMode === 'fixed' ? false : flipped;
    if (this.motion?.directionPolicy === 'MIRRORED_STAGING') {
      // The approved goral pilot is canonically left-facing. Staging may
      // mirror only its non-physics presentation; six logical pixels of
      // hysteresis prevents target crossings from flickering at the center.
      this.pilotVisualFlipX = resolveMirroredStagingFlip(this.pilotVisualFlipX, horizontalDelta);
    } else if (this.motion?.directionPolicy === 'INVERTED_FLIP_X') {
      this.pilotVisualFlipX = !this.effectiveFlipX;
    } else this.pilotVisualFlipX = this.effectiveFlipX;
    this.applyOriginAndFlip();
  }

  public pauseMotion(until: number): void { this.motion?.pause(this.sprite.scene.time.now, until); }

  public updateLayout(): void {
    this.motion?.update(this.sprite.scene.time.now);
    this.applyOriginAndFlip();
    if (this.state.tint) this.sprite.setTint(parseTint(this.state.tint));
    const primary = this.pilotVisual?.active ? this.pilotVisual : this.sprite;
    if (this.pilotVisual?.active) {
      const tint = this.sprite as unknown as {
        isTinted: boolean; tintFill: boolean; tintTopLeft: number; tintTopRight: number; tintBottomLeft: number; tintBottomRight: number;
      };
      this.pilotVisual.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y))
        .setDepth(this.sprite.depth)
        .setAlpha(this.sprite.alpha)
        .setVisible(this.sprite.active)
        // Transient squash/rotation tweens remain on the hidden physics owner
        // for OFF/ON gameplay parity. Pilot pixels only use authored alias
        // rotation and therefore stay uniformly scaled and pixel crisp.
        .setRotation(Phaser.Math.DegToRad(this.state.rotationDeg));
      if (!tint.isTinted) this.pilotVisual.clearTint();
      else if (tint.tintFill) this.pilotVisual.setTintFill(tint.tintTopLeft, tint.tintTopRight, tint.tintBottomLeft, tint.tintBottomRight);
      else this.pilotVisual.setTint(tint.tintTopLeft, tint.tintTopRight, tint.tintBottomLeft, tint.tintBottomRight);
    }
    const outline = this.outline;
    if (outline) {
      const outlinePixels = this.motion?.outlinePixels ?? this.profile.outlinePixels;
      const outlineAlpha = this.motion?.outlineAlpha ?? 0.52;
      const frameWidth = Math.max(1, outline.frame.realWidth);
      const frameHeight = Math.max(1, outline.frame.realHeight);
      outline.setPosition(primary.x, primary.y)
        .setOrigin(primary.originX, primary.originY)
        .setScale(
          Math.abs(primary.scaleX) + outlinePixels * 2 / frameWidth,
          Math.abs(primary.scaleY) + outlinePixels * 2 / frameHeight,
        )
        .setRotation(primary.rotation)
        .setFlipX(primary.flipX)
        .setAlpha(primary.alpha * outlineAlpha)
        .setVisible(primary.visible)
        .setDepth(primary.depth - 0.1);
    }
    const overlay = this.overlay;
    if (!overlay) return;
    overlay.setPosition(primary.x, primary.y)
      .setOrigin(primary.originX, primary.originY)
      .setScale(Math.abs(primary.scaleX), Math.abs(primary.scaleY))
      .setRotation(primary.rotation)
      .setFlipX(primary.flipX)
      .setAlpha(primary.alpha)
      .setVisible(primary.visible)
      .setDepth(primary.depth + 1);
  }

  public hurtbox(groundPoint: Readonly<RuntimePoint>): Ellipse | null {
    return resolveWorldHurtbox(this.creatureId, groundPoint, this.effectiveFlipX);
  }

  public attackAnchor(groundPoint: Readonly<RuntimePoint>, anchorIndex = 0): RuntimePoint {
    const anchor = this.metadata.attackAnchors[anchorIndex % Math.max(1, this.metadata.attackAnchors.length)];
    return resolveWorldAttackAnchor(this.creatureId, groundPoint, this.effectiveFlipX, anchor?.id);
  }

  public visualAttackAnchor(groundPoint: Readonly<RuntimePoint>, anchorIndex = 0): RuntimePoint | undefined {
    const anchor = this.metadata.attackAnchors[anchorIndex % Math.max(1, this.metadata.attackAnchors.length)];
    return this.motion?.visualAnchor(groundPoint, this.presentationFlipX, anchor?.id);
  }

  public shadowAnchor(groundPoint: Readonly<RuntimePoint>): RuntimePoint {
    return resolveWorldShadowAnchor(this.creatureId, groundPoint, this.effectiveFlipX);
  }

  public restoreStateTransform(): void {
    this.sprite.setScale(this.baseScale * this.state.scale).setRotation(Phaser.Math.DegToRad(this.state.rotationDeg));
    this.applyOriginAndFlip();
  }

  /** Creates a presentation-only echo without changing the gameplay owner. */
  public createAfterimage(offsetX: number, offsetY: number, tint: number, alpha: number): Phaser.GameObjects.Image {
    const source = this.pilotVisual?.active ? this.pilotVisual : this.sprite;
    return this.sprite.scene.add.image(source.x + offsetX, source.y + offsetY, source.texture.key)
      .setOrigin(source.originX, source.originY)
      .setScale(Math.abs(source.scaleX), Math.abs(source.scaleY))
      .setRotation(source.rotation)
      .setFlipX(source.flipX)
      .setTint(tint)
      .setAlpha(alpha)
      .setDepth(source.depth - 1);
  }

  public destroy(): void {
    this.motion?.destroy();
    this.pilotVisual?.destroy(); this.pilotVisual = undefined;
    this.outline?.destroy(); this.outline = undefined;
    this.overlay?.destroy(); this.overlay = undefined;
  }

  private applyResolvedState(state: ResolvedRuntimeState): void {
    this.state = state;
    this.sprite.setTexture(runtimeTextureKey(state.assetFile));
    this.outline?.setTexture(runtimeTextureKey(state.assetFile));
    this.restoreStateTransform();
    if (state.tint) this.sprite.setTint(parseTint(state.tint));
    else this.sprite.clearTint();
    if (state.shake) this.shakeUntil = this.sprite.scene.time.now + 140;
    const overlayFile = state.overlayFiles[0];
    if (!overlayFile) { this.overlay?.destroy(); this.overlay = undefined; return; }
    if (!this.overlay?.active || this.overlay.texture.key !== runtimeTextureKey(overlayFile)) {
      this.overlay?.destroy();
      this.overlay = this.sprite.scene.add.image(this.sprite.x, this.sprite.y, runtimeTextureKey(overlayFile));
    }
    this.updateLayout();
  }

  private applyMotionFrame(textureKey: string): void {
    if (!this.pilotVisual?.active) {
      this.pilotVisual = this.sprite.scene.add.image(this.sprite.x, this.sprite.y, textureKey);
      this.sprite.setVisible(false);
    } else this.pilotVisual.setTexture(textureKey);
    this.pilotVisual.setScale(this.motion?.uniformScale ?? motionPilotPresentationProfile(this.creatureId as MotionPilotTarget).uniformScale);
    this.outline?.setTexture(textureKey);
    this.applyOriginAndFlip();
  }

  private applyOriginAndFlip(): void {
    const origin = runtimeSpriteOrigin(this.creatureId, this.effectiveFlipX);
    const presentationOrigin = this.motion?.origin ?? runtimeSpriteOrigin(this.creatureId, this.presentationFlipX);
    const shaking = this.sprite.scene.time.now < this.shakeUntil;
    const shakeOffset = shaking ? Math.sin(this.sprite.scene.time.now * 0.55) * 0.018 : 0;
    this.sprite.setOrigin(origin.x + shakeOffset, origin.y).setFlipX(this.effectiveFlipX);
    this.pilotVisual?.setOrigin(presentationOrigin.x + shakeOffset, presentationOrigin.y)
      .setScale(this.motion?.uniformScale ?? motionPilotPresentationProfile(this.creatureId as MotionPilotTarget).uniformScale)
      .setFlipX(this.presentationFlipX);
  }
}
