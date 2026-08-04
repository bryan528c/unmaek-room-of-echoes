import Phaser from 'phaser';
import type { Ellipse } from '../systems/CombatGeometry';
import {
  bossDefeatPresentationFor,
  resolveBossPhaseState,
  resolveCreatureMetadata,
  resolveCreatureState,
  resolveWorldAttackAnchor,
  resolveWorldHurtbox,
  resolveWorldShadowAnchor,
  runtimeSpriteOrigin,
  runtimeTextureKey,
  SUBMISSION_GAME_SCALE,
  type ResolvedRuntimeState,
  type RuntimeCreatureMetadata,
  type RuntimePoint,
} from './SubmissionRuntime';

const parseTint = (tint: string): number => Number.parseInt(tint.replace('#', ''), 16);

export class CreaturePresentation {
  public readonly metadata: RuntimeCreatureMetadata;
  private state: ResolvedRuntimeState;
  private requestedFlipX = false;
  private overlay?: Phaser.GameObjects.Image;
  private shakeUntil = 0;

  public constructor(private readonly sprite: Phaser.Physics.Arcade.Sprite, creatureId: string) {
    this.metadata = resolveCreatureMetadata(creatureId);
    const initialState = this.metadata.states.idle || this.metadata.stateAliases.idle
      ? 'idle'
      : Object.keys(this.metadata.states)[0];
    if (!initialState) throw new Error(`[CreaturePresentation] ${creatureId} has no runtime state`);
    this.state = resolveCreatureState(creatureId, initialState);
    this.applyResolvedState(this.state);
  }

  public get creatureId(): string { return this.metadata.id; }
  public get displayName(): string { return this.metadata.displayName; }
  public get baseScale(): number { return SUBMISSION_GAME_SCALE * this.metadata.runtimeScale; }
  public get stateScale(): number { return this.state.scale; }
  public get effectiveFlipX(): boolean { return this.requestedFlipX !== this.state.flipX; }
  public get currentState(): string { return this.state.requestedState; }
  public get currentAssetFile(): string { return this.state.assetFile; }
  public get hasOverlay(): boolean { return Boolean(this.overlay?.active); }
  public get hasNonlethalRetreat(): boolean { return bossDefeatPresentationFor(this.creatureId).mode === 'nonlethal-retreat'; }

  public hasState(stateId: string): boolean { return Boolean(this.metadata.states[stateId] || this.metadata.stateAliases[stateId]); }

  public applyState(stateId: string): void {
    this.applyResolvedState(resolveCreatureState(this.creatureId, stateId));
  }

  public applyBossPhase(phase: 1 | 2 | 3 | 'preFight' | 'defeated/nonlethal'): void {
    this.applyResolvedState(resolveBossPhaseState(this.creatureId, phase));
  }

  public setFacingFlipX(flipped: boolean): void {
    this.requestedFlipX = this.metadata.directionMode === 'fixed' ? false : flipped;
    this.applyOriginAndFlip();
  }

  public updateLayout(): void {
    this.applyOriginAndFlip();
    if (this.state.tint) this.sprite.setTint(parseTint(this.state.tint));
    const overlay = this.overlay;
    if (!overlay) return;
    overlay.setPosition(this.sprite.x, this.sprite.y)
      .setOrigin(this.sprite.originX, this.sprite.originY)
      .setScale(Math.abs(this.sprite.scaleX), Math.abs(this.sprite.scaleY))
      .setRotation(this.sprite.rotation)
      .setFlipX(this.sprite.flipX)
      .setAlpha(this.sprite.alpha)
      .setVisible(this.sprite.visible)
      .setDepth(this.sprite.depth + 1);
  }

  public hurtbox(groundPoint: Readonly<RuntimePoint>): Ellipse | null {
    return resolveWorldHurtbox(this.creatureId, groundPoint, this.effectiveFlipX);
  }

  public attackAnchor(groundPoint: Readonly<RuntimePoint>, anchorIndex = 0): RuntimePoint {
    const anchor = this.metadata.attackAnchors[anchorIndex % Math.max(1, this.metadata.attackAnchors.length)];
    return resolveWorldAttackAnchor(this.creatureId, groundPoint, this.effectiveFlipX, anchor?.id);
  }

  public shadowAnchor(groundPoint: Readonly<RuntimePoint>): RuntimePoint {
    return resolveWorldShadowAnchor(this.creatureId, groundPoint, this.effectiveFlipX);
  }

  public restoreStateTransform(): void {
    this.sprite.setScale(this.baseScale * this.state.scale).setRotation(Phaser.Math.DegToRad(this.state.rotationDeg));
    this.applyOriginAndFlip();
  }

  public destroy(): void { this.overlay?.destroy(); this.overlay = undefined; }

  private applyResolvedState(state: ResolvedRuntimeState): void {
    this.state = state;
    this.sprite.setTexture(runtimeTextureKey(state.assetFile));
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

  private applyOriginAndFlip(): void {
    const origin = runtimeSpriteOrigin(this.creatureId, this.effectiveFlipX);
    const shaking = this.sprite.scene.time.now < this.shakeUntil;
    const shakeOffset = shaking ? Math.sin(this.sprite.scene.time.now * 0.55) * 0.018 : 0;
    this.sprite.setOrigin(origin.x + shakeOffset, origin.y).setFlipX(this.effectiveFlipX);
  }
}
