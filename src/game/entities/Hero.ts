import Phaser from 'phaser';
import { BALANCE } from '../balance';
import { clamp } from '../utils/math';

export interface HeroAttack {
  attackId: number;
  combo: number;
  angle: number;
  x: number;
  y: number;
}

const HERO_SCALE = 0.63;
const HERO_HALF_WIDTH = 62;
const HERO_VISIBLE_HEIGHT = 141;
const HERO_FLOOR_LIMIT = 494;

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

  private combo = 0;
  private attacking = false;
  private dashing = false;
  private dashEndsAt = 0;
  private attackBuffered = false;
  private attackBufferedUntil = 0;
  private attackCancelableAt = 0;
  private attackTarget = new Phaser.Math.Vector2();
  private attackHandler?: (attack: HeroAttack) => void;
  private delayedSlash?: Phaser.Time.TimerEvent;
  private attackHitTimer?: Phaser.Time.TimerEvent;
  private attackRecoveryTimer?: Phaser.Time.TimerEvent;
  private attackSequence = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'hero-idle');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(400).setOrigin(0.5, 1).setScale(HERO_SCALE);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(28, 28);
    body.setOffset((this.width - 28) / 2, this.height - 30);
    body.setCollideWorldBounds(true);
  }

  public updateMovement(time: number, x: number, y: number, aimX: number, aimY: number): void {
    this.setDepth(100 + Math.floor(this.y));
    if (!this.attacking && !this.dashing) {
      this.facing = Phaser.Math.Angle.Between(this.x, this.y, aimX, aimY);
      this.setFlipX(Math.cos(this.facing) < 0);
    }
    if (this.rewinding || this.controlsLocked) { this.setVelocity(0); return; }
    if (this.dashing) {
      if (time >= this.dashEndsAt) { this.dashing = false; this.setVelocity(0); }
      return;
    }
    const vector = new Phaser.Math.Vector2(x, y);
    if (vector.lengthSq() > 0) vector.normalize().scale(BALANCE.hero.speed);
    this.setVelocity(vector.x, vector.y);
    if (!this.attacking) {
      this.setTexture(vector.lengthSq() > 0 ? 'hero-move' : 'hero-idle');
      this.setScale(HERO_SCALE, HERO_SCALE + (vector.lengthSq() > 0 ? Math.abs(Math.sin(time / 78)) * 0.006 : Math.sin(time / 330) * 0.008));
      this.setRotation(vector.lengthSq() > 0 ? Math.sin(time / 105) * 0.012 : 0);
    }
    this.constrainToArena();
    if (this.attackBuffered && time > this.attackBufferedUntil) this.attackBuffered = false;
    if (this.attackBuffered && time - this.lastAttackAt >= BALANCE.hero.attackCooldown) {
      this.attackBuffered = false;
      this.performAttack(this.attackTarget.x, this.attackTarget.y, this.attackHandler);
    }
  }

  public tryAttack(targetX: number, targetY: number, handler: (attack: HeroAttack) => void): boolean {
    if (this.controlsLocked || this.rewinding) return false;
    const now = this.scene.time.now;
    if (this.dashing || now - this.lastAttackAt < BALANCE.hero.attackCooldown) {
      this.attackBuffered = true;
      this.attackBufferedUntil = now + BALANCE.hero.inputBuffer;
      this.attackTarget.set(targetX, targetY);
      this.attackHandler = handler;
      return false;
    }
    this.performAttack(targetX, targetY, handler);
    return true;
  }

  private performAttack(targetX: number, targetY: number, handler?: (attack: HeroAttack) => void): void {
    const now = this.scene.time.now;
    if (now - this.lastAttackAt > BALANCE.hero.comboReset) this.combo = 0;
    this.combo = (this.combo % 3) + 1;
    this.lastAttackAt = now;
    this.attacking = true;
    this.attackCancelableAt = now + BALANCE.hero.attackHitDelay;
    this.facing = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    this.setFlipX(Math.cos(this.facing) < 0).setTexture('hero-attack');
    const startRotation = this.rotation;
    this.scene.tweens.add({ targets: this, rotation: startRotation + (this.flipX ? -0.075 : 0.075), scaleX: HERO_SCALE * 1.06, scaleY: HERO_SCALE * 1.03, duration: 70, yoyo: true });
    this.attackHitTimer?.remove(false); this.attackRecoveryTimer?.remove(false);
    const attackId = ++this.attackSequence;
    this.attackHitTimer = this.scene.time.delayedCall(BALANCE.hero.attackHitDelay, () => handler?.({ attackId, combo: this.combo, angle: this.facing, x: this.x, y: this.y }));
    this.attackRecoveryTimer = this.scene.time.delayedCall(BALANCE.hero.attackRecovery, () => { if (this.active) { this.attacking = false; this.rotation = 0; this.setScale(HERO_SCALE); } });
  }

  public dash(directionX: number, directionY: number, onTrail: (x: number, y: number) => void): boolean {
    const now = this.scene.time.now;
    if (this.controlsLocked || this.rewinding || this.dashing || now < this.dashReadyAt || !this.canCancelAttack(now)) return false;
    this.cancelAttackRecovery();
    const vector = new Phaser.Math.Vector2(directionX, directionY);
    if (vector.lengthSq() === 0) vector.set(Math.cos(this.facing), Math.sin(this.facing));
    vector.normalize();
    this.dashing = true;
    this.dashEndsAt = now + BALANCE.hero.dashDuration;
    this.dashReadyAt = now + BALANCE.hero.dashCooldown;
    this.invulnerableUntil = Math.max(this.invulnerableUntil, now + BALANCE.hero.dashInvulnerability);
    this.setVelocity(vector.x * BALANCE.hero.dashSpeed, vector.y * BALANCE.hero.dashSpeed).setTexture('hero-move');
    for (let index = 1; index <= 3; index += 1) {
      this.scene.time.delayedCall(index * 38, () => {
        if (!this.active) return;
        const echo = this.scene.add.image(this.x - vector.x * index * 18, this.y - vector.y * index * 18, this.texture.key)
          .setOrigin(0.5, 1).setScale(HERO_SCALE).setFlipX(this.flipX).setTint(0x39a6be).setAlpha(0.3).setDepth(this.depth - 2);
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
    this.cancelAttackRecovery();
    this.setData('parryReadyAt', now + BALANCE.hero.parryCooldown);
    this.parryUntil = now + BALANCE.hero.parryWindow + extraWindow;
    this.setTint(0xa5fff0);
    this.scene.time.delayedCall(BALANCE.hero.parryWindow + extraWindow, () => { if (this.active && !this.isTinted) return; this.clearTint(); });
    return true;
  }

  public get isParrying(): boolean { return this.scene.time.now <= this.parryUntil; }
  public get isDashing(): boolean { return this.dashing; }
  public get isAttacking(): boolean { return this.attacking; }
  public get comboStep(): number { return this.combo; }
  public get movementCircle(): Readonly<{ x: number; y: number; radius: number }> { return { x: this.x, y: this.y, radius: BALANCE.collision.heroMovementRadius }; }
  public get hurtCircle(): Readonly<{ x: number; y: number; radius: number }> { return { x: this.x, y: this.y + BALANCE.collision.heroHurtOffsetY, radius: BALANCE.collision.heroHurtRadius }; }

  public canCancelAttack(time = this.scene.time.now): boolean { return !this.attacking || time >= this.attackCancelableAt; }

  public setFacing(angle: number): void { this.facing = angle; this.setFlipX(Math.cos(angle) < 0); }

  public cancelAttackRecovery(): void {
    if (!this.attacking) return;
    this.attackRecoveryTimer?.remove(false); this.attackRecoveryTimer = undefined;
    this.attacking = false; this.rotation = 0; this.setScale(HERO_SCALE);
  }

  public clearBufferedInput(): void { this.attackBuffered = false; this.attackBufferedUntil = 0; this.attackHandler = undefined; }

  public castPose(): void {
    if (!this.active) return;
    this.cancelAttackRecovery();
    this.setTexture('hero-cast').setTint(0x9effec);
    this.scene.tweens.add({ targets: this, scaleX: HERO_SCALE * 1.035, scaleY: HERO_SCALE * 1.045, duration: 90, yoyo: true });
    this.scene.time.delayedCall(260, () => { if (this.active) { this.clearTint(); this.setTexture('hero-idle').setScale(HERO_SCALE); } });
  }

  public takeDamage(amount: number, sourceX: number, sourceY: number): number {
    const now = this.scene.time.now;
    if (this.rewinding || this.dashing || now < this.invulnerableUntil || !this.active) return 0;
    this.invulnerableUntil = now + BALANCE.hero.hitInvulnerability;
    const actual = Math.min(this.health, Math.max(0, amount));
    this.health -= actual;
    const knockback = new Phaser.Math.Vector2(this.x - sourceX, this.y - sourceY).normalize().scale(210);
    this.setVelocity(knockback.x, knockback.y).setTintFill(0xf2e7d4);
    this.scene.time.delayedCall(95, () => { if (this.active) this.clearTint(); });
    return actual;
  }

  public heal(amount: number): void { this.health = clamp(this.health + amount, 0, this.maxHealth); }
  public restoreHealth(value: number): void { this.health = clamp(value, 1, this.maxHealth); }

  public constrainToArena(): void {
    this.x = clamp(this.x, HERO_HALF_WIDTH, 960 - HERO_HALF_WIDTH);
    this.y = clamp(this.y, HERO_VISIBLE_HEIGHT + 8, HERO_FLOOR_LIMIT);
  }

  public override destroy(fromScene?: boolean): void {
    this.delayedSlash?.remove(false);
    this.attackHitTimer?.remove(false); this.attackRecoveryTimer?.remove(false);
    super.destroy(fromScene);
  }
}
