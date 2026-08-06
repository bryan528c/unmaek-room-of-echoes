import Phaser from 'phaser';
import { BALANCE, COMBAT_BOUNDS } from '../balance';
import { DEPTH } from '../config';
import { HeroMotionPresentation, type PlayerMotionSnapshot } from '../motion/MotionPilotRuntime';
import { SUBMISSION_HERO_OUTLINE_PIXELS, SUBMISSION_HERO_PRESENTATION_SCALE } from '../runtime/SubmissionRuntime';
import { synchronizeArcadeBodyAfterGameObjectMove } from '../systems/ArcadeBodySync';
import type { Ellipse } from '../systems/CombatGeometry';
import { heroDamageRejectionReason, type HeroDamageRejectionReason } from '../systems/HeroDamagePolicy';
import { clamp } from '../utils/math';

export interface HeroAttack {
  attackId: number;
  combo: number;
  style: HeroAttackStyle;
  angle: number;
  groundX: number;
  groundY: number;
  originX: number;
  originY: number;
}

export type HeroAttackStyle = 'legacy' | 'finisher' | 'cut';

export interface HeroDamageAttemptSnapshot {
  requestedDamage: number;
  actualDamage: number;
  healthBefore: number;
  healthAfter: number;
  reason?: HeroDamageRejectionReason;
  at: number;
}

const HERO_SCALE = SUBMISSION_HERO_PRESENTATION_SCALE;
const HERO_OUTLINE_ALPHA = 0.52;
const HERO_VISUAL_HALF_WIDTH = 42;
const HERO_VISUAL_HEIGHT = 86;

export class Hero extends Phaser.Physics.Arcade.Sprite {
  public health: number = BALANCE.hero.maxHealth;
  public readonly maxHealth = BALANCE.hero.maxHealth;
  public facing = 0;
  public invulnerableUntil = 0;
  public parryUntil = 0;
  public rewinding = false;
  public controlsLocked = false;
  public dashReadyAt = 0;
  public lastAttackAt = -9999;

  private comboStepValue = 0;
  private comboActive = false;
  private attacking = false;
  private dashing = false;
  private dashEndsAt = 0;
  private attackCancelableAt = 0;
  private attackDirectionValue = new Phaser.Math.Vector2(1, 0);
  private comboHandler?: (attack: HeroAttack) => void;
  private comboCompleteHandler?: (cancelled: boolean) => void;
  private comboTimers: Phaser.Time.TimerEvent[] = [];
  private delayedSlash?: Phaser.Time.TimerEvent;
  private attackSequence = 0;
  private attackHitActiveUntil = 0;
  private lungeEndsAt = 0;
  private lungeVelocity = new Phaser.Math.Vector2();
  private lungeDistanceValue = 0;
  private comboStyle: HeroAttackStyle = 'legacy';
  private readabilityOutline?: Phaser.GameObjects.Image;
  private readonly motionPresentation?: HeroMotionPresentation;
  private lastDamageAttemptValue?: HeroDamageAttemptSnapshot;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'hero-idle');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.readabilityOutline = scene.add.image(x, y, 'hero-idle').setTint(0x071012).setAlpha(0);
    this.setDepth(DEPTH.characterBase + Math.floor(y)).setOrigin(0.5, 1).setScale(HERO_SCALE);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(BALANCE.collision.heroMovementRadius);
    body.setOffset((this.width - BALANCE.collision.heroMovementRadius * 2) / 2, this.height - BALANCE.collision.heroMovementRadius * 2 - 2);
    body.setCollideWorldBounds(true);
    this.motionPresentation = HeroMotionPresentation.create(this);
    this.updateReadabilityOutline();
  }

  public override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.motionPresentation?.update(time);
    this.updateReadabilityOutline();
  }

  public updateMovement(time: number, x: number, y: number, aimX: number, aimY: number): void {
    this.setDepth(DEPTH.characterBase + Math.floor(this.y));
    if (!this.comboActive && !this.dashing) {
      this.facing = Phaser.Math.Angle.Between(this.x, this.y, aimX, aimY);
      if (Math.abs(Math.cos(this.facing)) > 0.12) this.setFlipX(Math.cos(this.facing) < 0);
    }
    if (this.rewinding || this.controlsLocked) { this.setVelocity(0); this.motionPresentation?.setLocomotion(time, 0, 0, this.facing); return; }
    if (this.dashing) {
      if (time >= this.dashEndsAt) { this.dashing = false; this.setVelocity(0); }
      this.motionPresentation?.update(time);
      this.constrainToArena();
      return;
    }
    if (time < this.lungeEndsAt) {
      this.setVelocity(this.lungeVelocity.x, this.lungeVelocity.y);
    } else {
      const vector = new Phaser.Math.Vector2(x, y);
      if (vector.lengthSq() > 0) vector.normalize().scale(BALANCE.hero.speed);
      this.setVelocity(vector.x, vector.y);
      if (!this.comboActive) {
        this.setTexture(vector.lengthSq() > 0 ? 'hero-move' : 'hero-idle');
        this.setScale(HERO_SCALE, HERO_SCALE + (vector.lengthSq() > 0 ? Math.abs(Math.sin(time / 78)) * 0.005 : Math.sin(time / 330) * 0.006));
        this.setRotation(vector.lengthSq() > 0 ? Math.sin(time / 105) * 0.01 : 0);
      }
      if (!this.comboActive) this.motionPresentation?.setLocomotion(time, vector.x, vector.y, this.facing);
    }
    this.constrainToArena();
  }

  public startCombo(
    directionX: number,
    directionY: number,
    strikes: 1 | 3,
    handler: (attack: HeroAttack) => void,
    onComplete: (cancelled: boolean) => void,
    lungeDistance = 0,
    style: HeroAttackStyle = 'legacy',
  ): boolean {
    if (this.controlsLocked || this.rewinding || this.dashing || this.comboActive) return false;
    const now = this.scene.time.now;
    const cooldown = style === 'finisher' ? BALANCE.hero.finisher.cooldown : style === 'cut' ? BALANCE.hero.cut.cooldown : BALANCE.hero.attackCooldown;
    if (now - this.lastAttackAt < cooldown) return false;
    const direction = new Phaser.Math.Vector2(directionX, directionY);
    if (direction.lengthSq() <= 0.0001) direction.set(Math.cos(this.facing), Math.sin(this.facing));
    direction.normalize();
    this.attackDirectionValue.copy(direction);
    this.facing = direction.angle();
    if (Math.abs(direction.x) > 0.12) this.setFlipX(direction.x < 0);
    this.comboActive = true; this.attacking = true; this.comboStepValue = 0; this.lastAttackAt = now; this.comboStyle = style;
    const hitDelay = style === 'finisher' ? BALANCE.hero.finisher.hitDelay : style === 'cut' ? BALANCE.hero.cut.hitDelay : BALANCE.hero.attackHitDelay;
    this.attackCancelableAt = now + hitDelay;
    this.comboHandler = handler; this.comboCompleteHandler = onComplete;
    this.lungeDistanceValue = Math.max(0, Math.min(BALANCE.hero.attackLungeMaximum, lungeDistance));
    if (this.lungeDistanceValue > 0) {
      const seconds = BALANCE.hero.attackLungeDuration / 1000;
      this.lungeVelocity.set(direction.x * this.lungeDistanceValue / seconds, direction.y * this.lungeDistanceValue / seconds);
      this.lungeEndsAt = now + BALANCE.hero.attackLungeDuration;
    }
    for (let index = 0; index < strikes; index += 1) {
      const timer = this.scene.time.delayedCall(index * BALANCE.hero.comboStrikeInterval, () => this.performAttackStep(index + 1));
      this.comboTimers.push(timer);
    }
    const recovery = style === 'finisher' ? BALANCE.hero.finisher.recovery : style === 'cut' ? BALANCE.hero.cut.recovery : BALANCE.hero.attackRecovery;
    const totalDuration = (strikes - 1) * BALANCE.hero.comboStrikeInterval + recovery;
    this.comboTimers.push(this.scene.time.delayedCall(totalDuration, () => this.finishCombo(false)));
    return true;
  }

  private performAttackStep(combo: number): void {
    if (!this.active || !this.comboActive) return;
    const now = this.scene.time.now;
    const hitDelay = this.comboStyle === 'finisher' ? BALANCE.hero.finisher.hitDelay : this.comboStyle === 'cut' ? BALANCE.hero.cut.hitDelay : BALANCE.hero.attackHitDelay;
    this.comboStepValue = combo; this.attacking = true;
    this.attackCancelableAt = now + hitDelay;
    this.facing = this.attackDirectionValue.angle();
    if (Math.abs(this.attackDirectionValue.x) > 0.12) this.setFlipX(this.attackDirectionValue.x < 0);
    this.setTexture('hero-attack');
    const startRotation = this.rotation;
    const emphasis = this.comboStyle === 'finisher' ? 1.12 : this.comboStyle === 'cut' ? 1.09 : 1.06;
    this.scene.tweens.add({ targets: this, rotation: startRotation + (this.flipX ? -0.075 : 0.075) * (this.comboStyle === 'finisher' ? 1.7 : 1), scaleX: HERO_SCALE * emphasis, scaleY: HERO_SCALE * (this.comboStyle === 'finisher' ? 1.08 : 1.03), duration: 64, yoyo: true });
    const recovery = this.comboStyle === 'finisher' ? BALANCE.hero.finisher.recovery : this.comboStyle === 'cut' ? BALANCE.hero.cut.recovery : BALANCE.hero.attackRecovery;
    this.motionPresentation?.startAction('basic_attack', this.attackDirectionValue.x, this.attackDirectionValue.y, this.facing, now, recovery, hitDelay);
    const attackId = ++this.attackSequence;
    this.comboTimers.push(this.scene.time.delayedCall(hitDelay, () => {
      if (!this.active || !this.comboActive) return;
      const originX = this.x + this.attackDirectionValue.x * BALANCE.hero.attackOriginOffset;
      const originY = this.y + this.attackDirectionValue.y * BALANCE.hero.attackOriginOffset;
      this.attackHitActiveUntil = this.scene.time.now + 42;
      this.comboHandler?.({ attackId, combo, style: this.comboStyle, angle: this.attackDirectionValue.angle(), groundX: this.x, groundY: this.y, originX, originY });
    }));
  }

  public dash(directionX: number, directionY: number, onTrail: (x: number, y: number) => void): boolean {
    const now = this.scene.time.now;
    if (this.controlsLocked || this.rewinding || this.dashing || now < this.dashReadyAt || !this.canCancelAttack(now)) return false;
    this.cancelAttackRecovery();
    const vector = new Phaser.Math.Vector2(directionX, directionY);
    if (vector.lengthSq() === 0) vector.copy(this.attackDirectionValue);
    vector.normalize();
    this.dashing = true;
    this.dashEndsAt = now + BALANCE.hero.dashDuration;
    this.dashReadyAt = now + BALANCE.hero.dashCooldown;
    this.invulnerableUntil = Math.max(this.invulnerableUntil, now + BALANCE.hero.dashInvulnerability);
    this.setVelocity(vector.x * BALANCE.hero.dashSpeed, vector.y * BALANCE.hero.dashSpeed);
    this.motionPresentation?.startAction('dash', vector.x, vector.y, this.facing, now, BALANCE.hero.dashDuration);
    this.setTexture('hero-move');
    for (let index = 1; index <= 3; index += 1) {
      this.scene.time.delayedCall(index * 38, () => {
        if (!this.active) return;
        const x = this.x - vector.x * index * 18;
        const y = this.y - vector.y * index * 18;
        const echo = this.motionPresentation?.createAfterimage(x, y, this.depth - 2)
          ?? this.scene.add.image(x, y, this.texture.key)
            .setOrigin(this.originX, this.originY).setScale(HERO_SCALE).setFlipX(this.flipX).setTint(0x39a6be).setAlpha(0.3).setDepth(this.depth - 2);
        this.scene.tweens.add({ targets: echo, alpha: 0, duration: 220, onComplete: () => echo.destroy() });
      });
    }
    this.delayedSlash = this.scene.time.delayedCall(120, () => onTrail(this.x, this.y));
    return true;
  }

  public startParry(extraWindow: number): boolean {
    const now = this.scene.time.now;
    const cooldown = Number(this.getData('parryReadyAt') ?? 0);
    if (this.controlsLocked || this.rewinding || now < cooldown || !this.canCancelAttack(now)) return false;
    const cancelledLunge = this.comboActive || now < this.lungeEndsAt;
    this.cancelAttackRecovery();
    this.scene.tweens.killTweensOf(this);
    this.setRotation(0);
    this.setScale(HERO_SCALE);
    this.lungeEndsAt = 0; this.lungeVelocity.set(0, 0); this.lungeDistanceValue = 0;
    if (cancelledLunge) this.setVelocity(0);
    this.setData('parryReadyAt', now + BALANCE.hero.parryCooldown);
    this.parryUntil = now + BALANCE.hero.parryWindow + extraWindow;
    this.motionPresentation?.startAction('parry', Math.cos(this.facing), Math.sin(this.facing), this.facing, now, BALANCE.hero.parryWindow + extraWindow);
    if (this.motionPresentation) this.motionPresentation.setTint(0xa5fff0);
    else this.setTint(0xa5fff0);
    this.scene.time.delayedCall(BALANCE.hero.parryWindow + extraWindow, () => {
      if (!this.active) return;
      if (this.motionPresentation) this.motionPresentation.clearTint();
      else this.clearTint();
      this.motionPresentation?.resolveParry(false, this.scene.time.now);
    });
    return true;
  }

  public get isParrying(): boolean { return this.scene.time.now <= this.parryUntil; }
  public get isDashing(): boolean { return this.dashing; }
  public get isAttacking(): boolean { return this.attacking; }
  public get isComboActive(): boolean { return this.comboActive; }
  public get comboStep(): number { return this.comboStepValue; }
  public get isAttackHitActive(): boolean { return this.scene.time.now <= this.attackHitActiveUntil; }
  public get attackDirection(): Readonly<{ x: number; y: number }> { return { x: this.attackDirectionValue.x, y: this.attackDirectionValue.y }; }
  public get attackLungeDistance(): number { return this.lungeDistanceValue; }
  public get groundPoint(): Readonly<{ x: number; y: number }> { return { x: this.x, y: this.y }; }
  public get movementCircle(): Readonly<{ x: number; y: number; radius: number }> { return { x: this.x, y: this.y, radius: BALANCE.collision.heroMovementRadius }; }
  public get hurtbox(): Ellipse { return { x: this.x, y: this.y + BALANCE.collision.heroHurtOffsetY, radiusX: BALANCE.collision.heroHurtRadiusX, radiusY: BALANCE.collision.heroHurtRadiusY }; }
  public get motionPilotActive(): boolean { return Boolean(this.motionPresentation); }
  public get lastDamageAttempt(): HeroDamageAttemptSnapshot | undefined { return this.lastDamageAttemptValue ? { ...this.lastDamageAttemptValue } : undefined; }
  public get motionSnapshot(): PlayerMotionSnapshot | undefined { return this.motionPresentation?.snapshot(); }
  public get motionGeometrySnapshot(): Readonly<{
    ownerTexture: string;
    ownerOrigin: Readonly<{ x: number; y: number }>;
    ownerScale: Readonly<{ x: number; y: number }>;
    body: Readonly<{ x: number; y: number; width: number; height: number; offsetX: number; offsetY: number }>;
    movementCircle: Readonly<{ x: number; y: number; radius: number }>;
    hurtbox: Ellipse;
    mapQueryPoint: Readonly<{ x: number; y: number }>;
  }> {
    const body = this.body as Phaser.Physics.Arcade.Body;
    return {
      ownerTexture: this.texture.key,
      ownerOrigin: { x: this.originX, y: this.originY },
      ownerScale: { x: this.scaleX, y: this.scaleY },
      body: { x: body.x, y: body.y, width: body.width, height: body.height, offsetX: body.offset.x, offsetY: body.offset.y },
      movementCircle: this.movementCircle,
      hurtbox: this.hurtbox,
      mapQueryPoint: this.groundPoint,
    };
  }

  public motionVisualAnchor(anchorId: 'dagger_tip' | 'parry_center' | 'word_target' | 'collarbone_resonance'): Readonly<{ x: number; y: number }> | undefined {
    return this.motionPresentation?.anchorWorld(anchorId);
  }

  public resolveParryMotion(success: boolean): void { this.motionPresentation?.resolveParry(success, this.scene.time.now); }

  public setPresentationTint(color: number): void {
    if (this.motionPresentation) this.motionPresentation.setTint(color);
    else this.setTint(color);
  }

  public clearPresentationTint(): void {
    if (this.motionPresentation) this.motionPresentation.clearTint();
    else this.clearTint();
  }

  public setGroundPosition(x: number, y: number): this {
    this.setPosition(x, y);
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    if (body?.enable) synchronizeArcadeBodyAfterGameObjectMove(body);
    return this;
  }

  public canCancelAttack(time = this.scene.time.now): boolean { return !this.comboActive || time >= this.attackCancelableAt; }

  public setFacing(angle: number): void {
    this.facing = angle; this.attackDirectionValue.setToPolar(angle, 1);
    if (Math.abs(Math.cos(angle)) > 0.12) this.setFlipX(Math.cos(angle) < 0);
  }

  public cancelAttackRecovery(): void { if (this.comboActive) this.finishCombo(true); }

  private updateReadabilityOutline(): void {
    const outline = this.readabilityOutline;
    if (!outline?.active) return;
    if (this.motionPresentation) {
      this.motionPresentation.syncCompanion(outline, SUBMISSION_HERO_OUTLINE_PIXELS, 0.32);
      return;
    }
    if (outline.texture.key !== this.texture.key) outline.setTexture(this.texture.key);
    const frameWidth = Math.max(1, outline.frame.realWidth);
    const frameHeight = Math.max(1, outline.frame.realHeight);
    outline.setPosition(this.x, this.y)
      .setOrigin(this.originX, this.originY)
      .setScale(
        Math.abs(this.scaleX) + SUBMISSION_HERO_OUTLINE_PIXELS * 2 / frameWidth,
        Math.abs(this.scaleY) + SUBMISSION_HERO_OUTLINE_PIXELS * 2 / frameHeight,
      )
      .setRotation(this.rotation)
      .setFlipX(this.flipX)
      .setAlpha(this.alpha * HERO_OUTLINE_ALPHA)
      .setVisible(this.visible)
      .setDepth(this.depth - 0.1);
  }

  private finishCombo(cancelled: boolean): void {
    if (!this.comboActive) return;
    for (const timer of this.comboTimers) if (!timer.hasDispatched) timer.remove(false);
    this.comboTimers = [];
    this.comboActive = false; this.attacking = false; this.comboStepValue = 0; this.lungeEndsAt = 0; this.lungeDistanceValue = 0;
    this.rotation = 0;
    this.motionPresentation?.cancel();
    this.setScale(HERO_SCALE).setTexture('hero-idle');
    const complete = this.comboCompleteHandler; this.comboHandler = undefined; this.comboCompleteHandler = undefined;
    complete?.(cancelled);
  }

  public castPose(): void {
    if (!this.active) return;
    this.cancelAttackRecovery();
    this.motionPresentation?.startAction('word_skill', Math.cos(this.facing), Math.sin(this.facing), this.facing, this.scene.time.now, 260);
    const wordAnchor = this.motionPresentation?.anchorWorld('word_target');
    if (wordAnchor) {
      const cue = this.scene.add.circle(wordAnchor.x, wordAnchor.y, 4, 0x6be7d2, 0.8).setDepth(DEPTH.word);
      this.scene.tweens.add({ targets: cue, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 120, onComplete: () => cue.destroy() });
    }
    this.setTexture('hero-cast');
    this.scene.tweens.add({ targets: this, scaleX: HERO_SCALE * 1.035, scaleY: HERO_SCALE * 1.045, duration: 90, yoyo: true });
    if (this.motionPresentation) this.motionPresentation.setTint(0x9effec);
    else this.setTint(0x9effec);
    this.scene.time.delayedCall(260, () => {
      if (!this.active || this.comboActive) return;
      if (this.motionPresentation) this.motionPresentation.clearTint();
      else this.clearTint();
      this.setTexture('hero-idle').setScale(HERO_SCALE);
    });
  }

  public takeDamage(amount: number, sourceX: number, sourceY: number): number {
    const now = this.scene.time.now;
    const healthBefore = this.health;
    const reason = heroDamageRejectionReason({ rewinding: this.rewinding, dashing: this.dashing, now, invulnerableUntil: this.invulnerableUntil, active: this.active });
    if (reason) {
      this.lastDamageAttemptValue = { requestedDamage: amount, actualDamage: 0, healthBefore, healthAfter: this.health, reason, at: now };
      return 0;
    }
    this.cancelAttackRecovery();
    this.invulnerableUntil = now + BALANCE.hero.hitInvulnerability;
    const actual = Math.min(this.health, Math.max(0, amount));
    this.health -= actual;
    this.lastDamageAttemptValue = { requestedDamage: amount, actualDamage: actual, healthBefore, healthAfter: this.health, at: now };
    if (actual > 0) this.motionPresentation?.startAction('hit_recover', this.x - sourceX, this.y - sourceY, this.facing, now, BALANCE.hero.hitInvulnerability);
    const knockback = new Phaser.Math.Vector2(this.x - sourceX, this.y - sourceY);
    if (knockback.lengthSq() <= 0.001) knockback.set(0, 1); else knockback.normalize();
    knockback.scale(210);
    this.setVelocity(knockback.x, knockback.y);
    if (this.motionPresentation) this.motionPresentation.setTint(0xf2e7d4);
    else this.setTintFill(0xf2e7d4);
    this.scene.time.delayedCall(this.motionPresentation ? 48 : 95, () => {
      if (!this.active) return;
      if (this.motionPresentation) this.motionPresentation.clearTint();
      else this.clearTint();
    });
    return actual;
  }

  public heal(amount: number): void { this.health = clamp(this.health + amount, 0, this.maxHealth); }
  public restoreHealth(value: number): void { this.health = clamp(value, 1, this.maxHealth); }

  public constrainToArena(): void {
    const minimumX = Math.max(COMBAT_BOUNDS.left + BALANCE.collision.heroMovementRadius, HERO_VISUAL_HALF_WIDTH);
    const maximumX = Math.min(COMBAT_BOUNDS.right - BALANCE.collision.heroMovementRadius, 960 - HERO_VISUAL_HALF_WIDTH);
    const minimumY = Math.max(COMBAT_BOUNDS.top + BALANCE.collision.heroMovementRadius, HERO_VISUAL_HEIGHT);
    const maximumY = COMBAT_BOUNDS.bottom - BALANCE.collision.heroMovementRadius;
    const x = clamp(this.x, minimumX, maximumX);
    const y = clamp(this.y, minimumY, maximumY);
    if (x !== this.x || y !== this.y) this.setGroundPosition(x, y);
  }

  public override destroy(fromScene?: boolean): void {
    this.delayedSlash?.remove(false);
    for (const timer of this.comboTimers) timer.remove(false);
    this.comboTimers = [];
    this.motionPresentation?.destroy();
    this.readabilityOutline?.destroy();
    this.readabilityOutline = undefined;
    super.destroy(fromScene);
  }
}
