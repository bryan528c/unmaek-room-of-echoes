import Phaser from 'phaser';
import { BALANCE, COMBAT_BOUNDS, enemyGroundExtents, type EnemyKind } from '../balance';
import { DEPTH } from '../config';
import { synchronizeArcadeBodyAfterGameObjectMove } from '../systems/ArcadeBodySync';
import { clampGroundPointToBounds } from '../systems/CombatBounds';
import type { Ellipse } from '../systems/CombatGeometry';
import type { EnemyDeathSource } from '../systems/CombatLifecycle';
import { shouldRecoverDistantPursuit } from '../systems/EnemyPursuit';
import { angleDelta } from '../utils/math';
import { CreaturePresentation } from '../runtime/CreaturePresentation';
import { shouldRestoreHitPresentation } from '../runtime/SubmissionRuntime';

export interface EnemyCallbacks {
  shoot: (source: Enemy, x: number, y: number, angle: number, speed: number, damage: number, texture?: string) => void;
  melee: (enemy: Enemy, damage: number) => void;
  died: (enemy: Enemy, source: EnemyDeathSource) => void;
  cue: (cue: 'warning' | 'parryWindow') => void;
  requestAttack?: (enemy: Enemy) => boolean;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public readonly id: string;
  public health: number;
  public readonly maxHealth: number;
  public frozenUntil = 0;
  public slowUntil = 0;
  public echoUntil = 0;
  public vulnerableUntil = 0;
  public attackActiveUntil = 0;
  public linkedUntil = 0;
  public linked = false;
  public facingAngle = 0;
  public spawned = false;
  public kind: EnemyKind;
  public removing = false;
  public lastDamageSource: EnemyDeathSource = 'other';

  protected nextActionAt: number;
  protected actionLockedUntil = 0;
  protected readonly callbacks: EnemyCallbacks;
  protected telegraph?: Phaser.GameObjects.Graphics;
  protected statusGraphics?: Phaser.GameObjects.Graphics;
  protected readonly baseScale: number;
  protected readonly presentation?: CreaturePresentation;
  protected attackIntentGeneration = 0;
  protected telegraphState?: { angle: number; length: number; halfWidth: number; until: number };
  private meleeSequence = 0;
  private meleeAttackIdValue = '';
  private deathDispatched = false;
  private previousGroundX: number;
  private previousGroundY: number;
  private frozenStartedAt = 0;
  private runtimeShadow?: Phaser.GameObjects.Ellipse;
  private static sequence = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, callbacks: EnemyCallbacks, healthMultiplier = 1, creatureId?: string) {
    super(scene, x, y, `enemy-${kind === 'minion' ? 'chaser' : kind}`);
    this.kind = kind;
    this.callbacks = callbacks;
    const definition = kind === 'minion' ? { hp: 34, speed: 112, damage: 10, score: 80 } : BALANCE.enemies[kind];
    this.health = Math.max(1, Math.round(definition.hp * healthMultiplier)); this.maxHealth = this.health;
    this.id = `${kind}-${Enemy.sequence += 1}`;
    this.nextActionAt = scene.time.now + Phaser.Math.Between(700, 1300);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.presentation = creatureId ? new CreaturePresentation(this, creatureId) : undefined;
    this.baseScale = this.presentation?.baseScale ?? (kind === 'elite' ? 1.08 : kind === 'boss' ? 1.22 : 0.85);
    this.previousGroundX = x; this.previousGroundY = y;
    this.setDepth(DEPTH.characterBase + Math.floor(y)).setOrigin(0.5, 1).setAlpha(0).setScale(this.baseScale);
    this.presentation?.restoreStateTransform();
    this.statusGraphics = scene.add.graphics().setDepth(DEPTH.word);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const movementDiameter = BALANCE.collision.movementRadius[kind] * 2;
    body.setCircle(BALANCE.collision.movementRadius[kind]).setOffset((this.width - movementDiameter) / 2, this.height - movementDiameter - 2);
    body.setCollideWorldBounds(true).setEnable(false);
    if (this.presentation) {
      const hurtbox = this.presentation.hurtbox({ x, y });
      const waterContact = creatureId === 'pulsebarbel_catfish';
      this.runtimeShadow = scene.add.ellipse(x, y, Math.max(22, (hurtbox?.radiusX ?? 18) * 1.7), Math.max(7, (hurtbox?.radiusY ?? 8) * 0.7), waterContact ? 0x3f8790 : 0x020506, waterContact ? 0.08 : 0.5)
        .setStrokeStyle(waterContact ? 2 : 0, waterContact ? 0x79b9b5 : 0x020506, waterContact ? 0.42 : 0)
        .setDepth(DEPTH.shadow).setAlpha(0);
      this.updatePresentationLayout();
    }
  }

  public spawn(): void {
    const marker = this.scene.add.graphics().setDepth(DEPTH.telegraph);
    marker.lineStyle(2, 0xc4543c, 0.8).strokeEllipse(this.x, this.y + 8, 58, 26);
    marker.lineStyle(1, 0xe5ad68, 0.55).strokeCircle(this.x, this.y + 8, 9);
    this.scene.tweens.add({ targets: marker, alpha: 0.22, scaleX: 1.2, scaleY: 1.2, duration: 560, onComplete: () => marker.destroy() });
    const groundX = this.x; const groundY = this.y;
    this.setScale(this.baseScale * 0.92, this.baseScale * 0.84);
    this.scene.time.delayedCall(560, () => {
      if (!this.active) return;
      const body = this.body as Phaser.Physics.Arcade.Body;
      this.spawned = true; body.setEnable(true); this.setGroundPosition(groundX, groundY);
      this.runtimeShadow?.setAlpha(1);
      this.scene.tweens.add({
        targets: this,
        alpha: 1,
        scaleX: this.baseScale,
        scaleY: this.baseScale,
        duration: 200,
        ease: 'Back.Out',
        onComplete: () => { this.previousGroundX = this.x; this.previousGroundY = this.y; },
      });
    });
  }

  public updateAI(time: number, hero: Phaser.Physics.Arcade.Sprite): void {
    if (!this.active || !this.spawned) return;
    this.setDepth(DEPTH.characterBase + Math.floor(this.y));
    this.updatePresentationLayout();
    if (this.linked && time >= this.linkedUntil) this.linked = false;
    this.updateStatusGraphics(time);
    if (time < this.frozenUntil) { this.setVelocity(0); this.setPresentationState('stunned'); this.setTint(0x54bbaa); return; }
    this.clearTint();
    if ((this.kind === 'elite' || this.kind === 'boss') && time < this.vulnerableUntil) this.setTint(0x91e2d3);
    if (time < this.actionLockedUntil) return;
    const distance = Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y);
    this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.setFacingFlipX(Math.cos(this.facingAngle) < 0);
    switch (this.kind) {
      case 'chaser': case 'minion': this.updateChaser(time, hero, distance); break;
      case 'archer': this.updateArcher(time, distance); break;
      case 'ink': this.updateInk(time, distance); break;
      case 'elite': this.updateElite(time, hero, distance); break;
      case 'boss': break;
    }
    this.recoverDistantPursuit(time, distance);
  }

  private recoverDistantPursuit(time: number, distance: number): void {
    if (this.kind === 'boss') return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!shouldRecoverDistantPursuit({
      distance,
      resumeDistance: BALANCE.enemyAI.pursuitResumeDistance[this.kind],
      velocityX: body.velocity.x,
      velocityY: body.velocity.y,
      actionLocked: time < this.actionLockedUntil,
      frozen: time < this.frozenUntil,
      attackActive: time < this.attackActiveUntil,
    })) return;
    const baseSpeed = this.kind === 'minion' ? 112 : BALANCE.enemies[this.kind].speed;
    this.moveToward(this.facingAngle, baseSpeed * BALANCE.enemyAI.pursuitRecoverySpeedRatio);
  }

  protected moveToward(angle: number, speed: number): void {
    let velocityX = Math.cos(angle) * speed; let velocityY = Math.sin(angle) * speed;
    const extents = enemyGroundExtents(this.kind);
    if (this.x <= COMBAT_BOUNDS.left + extents.left + 18 && velocityX < 0) velocityX = Math.max(speed * 0.42, -velocityX * 0.35);
    else if (this.x >= COMBAT_BOUNDS.right - extents.right - 18 && velocityX > 0) velocityX = -Math.max(speed * 0.42, velocityX * 0.35);
    if (this.y <= COMBAT_BOUNDS.top + extents.top + 18 && velocityY < 0) velocityY = Math.max(speed * 0.42, -velocityY * 0.35);
    else if (this.y >= COMBAT_BOUNDS.bottom - extents.bottom - 18 && velocityY > 0) velocityY = -Math.max(speed * 0.42, velocityY * 0.35);
    this.setVelocity(velocityX, velocityY);
  }

  protected updateChaser(time: number, hero: Phaser.Physics.Arcade.Sprite, distance: number): void {
    const stats = this.kind === 'minion' ? { speed: 112, damage: 10 } : BALANCE.enemies.chaser;
    if (time >= this.nextActionAt && distance < 175) {
      if (this.callbacks.requestAttack?.(this) === false) { this.nextActionAt = time + 160; return; }
      this.telegraphDash(hero, stats.damage, 430, 350); this.nextActionAt = time + Phaser.Math.Between(1450, 1900); return;
    }
    if (distance > 58) { this.setPresentationState('move'); this.moveToward(this.facingAngle, stats.speed); } else { this.setPresentationState('idle'); this.setVelocity(0); }
  }

  protected updateArcher(time: number, distance: number): void {
    if (time >= this.nextActionAt && distance < 500) {
      if (this.callbacks.requestAttack?.(this) === false) { this.nextActionAt = time + 160; return; }
      this.setVelocity(0); this.setPresentationState('prep'); this.actionLockedUntil = time + 620;
      const angle = this.facingAngle; this.showAim(angle, 520, 0xd05b45);
      const generation = this.attackIntentGeneration;
      this.scene.time.delayedCall(500, () => { if (generation === this.attackIntentGeneration) this.callbacks.cue('parryWindow'); });
      this.scene.time.delayedCall(540, () => { if (generation === this.attackIntentGeneration && this.active && this.health > 0) { this.setPresentationState('attack'); const origin = this.projectileOrigin(-12); this.callbacks.shoot(this, origin.x, origin.y, angle, 250, BALANCE.enemies.archer.damage); } });
      this.nextActionAt = time + Phaser.Math.Between(1500, 2100); return;
    }
    this.setPresentationState('move');
    if (distance < 190) this.moveToward(this.facingAngle + Math.PI, BALANCE.enemies.archer.speed);
    else if (distance > 280) this.moveToward(this.facingAngle, BALANCE.enemies.archer.speed * 0.7);
    else this.moveToward(this.facingAngle + Math.PI / 2, 32);
  }

  protected updateInk(time: number, distance: number): void {
    if (time >= this.nextActionAt && distance < 480) {
      if (this.callbacks.requestAttack?.(this) === false) { this.nextActionAt = time + 160; return; }
      this.setVelocity(0); this.setPresentationState('deploy'); this.actionLockedUntil = time + 780;
      const telegraph = this.scene.add.graphics().setDepth(DEPTH.telegraph).lineStyle(2, 0xd26c52, 0.65).strokeCircle(this.x, this.y, 48);
      this.telegraph = telegraph;
      this.telegraphState = { angle: 0, length: 48, halfWidth: 48, until: time + 670 };
      this.scene.tweens.add({ targets: telegraph, scaleX: 1.6, scaleY: 1.6, alpha: 0, duration: 670, onComplete: () => { telegraph.destroy(); if (this.telegraph === telegraph) { this.telegraph = undefined; this.telegraphState = undefined; } } });
      const count = 7;
      const generation = this.attackIntentGeneration;
      this.scene.time.delayedCall(650, () => { if (generation !== this.attackIntentGeneration || !this.active || this.health <= 0) return; this.setPresentationState('attack'); for (let index = 0; index < count; index += 1) { const origin = this.projectileOrigin(0, index); this.callbacks.shoot(this, origin.x, origin.y, this.facingAngle - 0.75 + index * 1.5 / (count - 1), 170, BALANCE.enemies.ink.damage, 'projectile-ink'); } });
      this.nextActionAt = time + Phaser.Math.Between(2100, 2600); return;
    }
    if (distance > 260) { this.setPresentationState('move'); this.moveToward(this.facingAngle, BALANCE.enemies.ink.speed); } else { this.setPresentationState('idle'); this.setVelocity(0); }
  }

  protected updateElite(time: number, hero: Phaser.Physics.Arcade.Sprite, distance: number): void {
    if (time >= this.nextActionAt && distance < 220) {
      if (this.callbacks.requestAttack?.(this) === false) { this.nextActionAt = time + 160; return; }
      this.telegraphDash(hero, BALANCE.enemies.elite.damage, 650, 300);
      this.nextActionAt = time + Phaser.Math.Between(1800, 2300); return;
    }
    if (distance > 76) { this.setPresentationState('move'); this.moveToward(this.facingAngle, BALANCE.enemies.elite.speed); } else { this.setPresentationState('idle'); this.setVelocity(0); }
  }

  protected telegraphDash(hero: Phaser.Physics.Arcade.Sprite, damage: number, warningMs: number, speed: number): void {
    this.setVelocity(0); this.setPresentationState('prep'); this.actionLockedUntil = this.scene.time.now + warningMs + 310;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.showAim(angle, warningMs, 0xd56343, 185);
    this.scene.tweens.add({ targets: this, scaleX: this.baseScale * 1.08, scaleY: this.baseScale * 0.82, rotation: Math.cos(angle) < 0 ? -0.06 : 0.06, duration: warningMs * 0.72, yoyo: true });
    const generation = this.attackIntentGeneration;
    this.scene.time.delayedCall(warningMs, () => {
      if (generation !== this.attackIntentGeneration || !this.active || this.health <= 0) return;
      this.setPresentationState('attack');
      this.callbacks.cue('parryWindow'); this.setScale(this.baseScale).setRotation(0);
      this.meleeAttackIdValue = `${this.id}:melee:${this.meleeSequence += 1}`;
      this.attackActiveUntil = this.scene.time.now + 300;
      this.telegraphState = { angle, length: Math.max(40, speed * 0.28), halfWidth: this.meleeHitRadius * BALANCE.collision.meleeTelegraphPadding, until: this.attackActiveUntil };
      this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.scene.time.delayedCall(280, () => { if (this.active) { this.setVelocity(0); this.setPresentationState('idle'); this.attackActiveUntil = 0; this.telegraphState = undefined; } });
    });
    this.setData('meleeDamage', damage);
  }

  protected showAim(angle: number, duration: number, color: number, length = 540): void {
    this.clearTelegraph();
    const telegraph = this.scene.add.graphics().setDepth(DEPTH.telegraph);
    this.telegraph = telegraph;
    const halfWidth = Math.max(30, this.movementCircle.radius + 14) * BALANCE.collision.meleeTelegraphPadding;
    this.telegraphState = { angle, length, halfWidth, until: this.scene.time.now + duration };
    this.callbacks.cue('warning');
    const origin = this.projectileOrigin();
    telegraph.lineStyle(7, 0x5b1715, 0.22).lineBetween(origin.x, origin.y, origin.x + Math.cos(angle) * length, origin.y + Math.sin(angle) * length);
    telegraph.lineStyle(2, color, 0.88).lineBetween(origin.x, origin.y, origin.x + Math.cos(angle) * length, origin.y + Math.sin(angle) * length);
    telegraph.fillStyle(0xe7844e, 0.68).fillTriangle(origin.x + Math.cos(angle) * 28, origin.y + Math.sin(angle) * 28, origin.x + Math.cos(angle + 0.18) * 46, origin.y + Math.sin(angle + 0.18) * 46, origin.x + Math.cos(angle - 0.18) * 46, origin.y + Math.sin(angle - 0.18) * 46);
    this.scene.tweens.add({ targets: telegraph, alpha: 0.15, duration, onComplete: () => {
      telegraph.destroy();
      if (!this.active) return;
      if (this.telegraph === telegraph) this.telegraph = undefined;
      if ((this.telegraphState?.until ?? 0) <= this.scene.time.now) this.telegraphState = undefined;
    } });
  }

  public freeze(until: number, bossSlow = false): void {
    const now = this.scene.time.now;
    if (bossSlow) {
      const slowedUntil = now + Math.max(0, until - now) * 0.58;
      this.slowUntil = Math.max(this.slowUntil, slowedUntil);
      this.nextActionAt = Math.max(this.nextActionAt, now + Math.max(0, slowedUntil - now) * 0.72);
      return;
    }
    if (until > this.frozenUntil) { this.frozenStartedAt = now; this.frozenUntil = until; }
  }

  public markEcho(until: number): void { this.echoUntil = Math.max(this.echoUntil, until); }
  public consumeStopped(now = this.scene.time.now): boolean {
    if (this.frozenUntil <= now && this.slowUntil <= now) return false;
    this.frozenUntil = now; this.slowUntil = now; return true;
  }

  public cancelAttackIntent(until: number): void {
    this.attackIntentGeneration += 1;
    this.clearTelegraph(); this.telegraphState = undefined; this.attackActiveUntil = 0;
    this.actionLockedUntil = Math.max(this.actionLockedUntil, until); this.nextActionAt = Math.max(this.nextActionAt, until);
    this.scene.tweens.killTweensOf(this);
    this.setVelocity(0).setRotation(0).setScale(this.baseScale);
    this.presentation?.restoreStateTransform();
  }

  public takeDamage(amount: number, sourceAngle: number, parried = false, deathSource: EnemyDeathSource = 'other'): number {
    if (!this.active || this.health <= 0) return 0;
    this.lastDamageSource = deathSource;
    const actual = this.resolveIncomingDamage(amount, sourceAngle, parried);
    return this.commitResolvedDamage(actual, deathSource);
  }

  protected resolveIncomingDamage(amount: number, sourceAngle: number, parried = false): number {
    let actual = amount;
    if (this.kind === 'elite') {
      const frontal = angleDelta(sourceAngle + Math.PI, this.facingAngle) < 1.05;
      if (frontal && this.scene.time.now > this.vulnerableUntil && !parried) actual *= BALANCE.hero.eliteFrontalDamageMultiplier;
      if (parried) this.vulnerableUntil = this.scene.time.now + 1800;
    }
    if (this.kind === 'boss' && this.scene.time.now < this.vulnerableUntil) actual *= BALANCE.boss.vulnerabilityMultiplier;
    return Math.max(0, actual);
  }

  protected commitResolvedDamage(actual: number, deathSource: EnemyDeathSource): number {
    if (!this.active || this.health <= 0 || actual <= 0) return 0;
    this.health -= actual;
    this.flashDamage();
    if (this.health <= 0) this.die(deathSource);
    return actual;
  }

  protected flashDamage(): void {
    const previousState = this.presentation?.currentState;
    this.setPresentationState('hit');
    const hitStateApplied = this.presentation?.currentState === 'hit';
    this.setTintFill(0xf1e7d2);
    this.scene.time.delayedCall(70, () => {
      if (!this.active) return;
      this.clearTint();
      // A phase transition may replace the presentation while the short hit
      // flash is pending. Restore only a hit state that is still current so a
      // stale callback cannot overwrite the new boss phase.
      if (shouldRestoreHitPresentation(hitStateApplied, this.presentation?.currentState) && previousState) this.setPresentationState(previousState);
    });
  }

  protected die(source: EnemyDeathSource): void {
    if (!this.active || this.deathDispatched) return;
    this.deathDispatched = true;
    this.removing = true;
    const scene = this.scene;
    (this.body as Phaser.Physics.Arcade.Body | undefined)?.setEnable(false);
    if (this.kind === 'boss' && this.presentation?.hasNonlethalRetreat) {
      this.presentation.applyBossPhase('defeated/nonlethal');
      const exitX = this.x < 480 ? -140 : 1100;
      scene.tweens.add({ targets: this.runtimeShadow, alpha: 0, duration: 900 });
      scene.tweens.add({ targets: this, x: exitX, alpha: 0.78, duration: 1100, ease: 'Sine.In', onComplete: () => { this.callbacks.died(this, source); if (this.active) this.destroy(); } });
      return;
    }
    const duration = this.kind === 'boss' ? 1450 : 190;
    scene.tweens.add({ targets: this, alpha: 0, scaleX: this.scaleX * (this.kind === 'boss' ? 1.65 : 1.35), scaleY: this.scaleY * 0.45, tint: 0x4fc0ad, duration, onComplete: () => { if (this.active) this.destroy(); } });
    // External death callbacks may pause time or transition the Scene. Register
    // all object-owned cleanup before handing control back to the director.
    this.callbacks.died(this, source);
  }

  /** Delays only the next attack; movement and pursuit remain responsive. */
  public delayAttackUntil(until: number): void { this.nextActionAt = Math.max(this.nextActionAt, until); }

  private updateStatusGraphics(time: number): void {
    const graphics = this.statusGraphics; if (!graphics) return; graphics.clear().setDepth(DEPTH.word);
    const stopped = time < this.frozenUntil;
    const echo = time < this.echoUntil;
    const slowed = time < this.slowUntil;
    const statusRadius = this.kind === 'boss' ? 51 : this.kind === 'elite' ? 35 : 27;
    if (stopped) {
      const duration = Math.max(1, this.frozenUntil - this.frozenStartedAt);
      const remaining = Math.max(0, Math.min(1, (this.frozenUntil - time) / duration));
      graphics.lineStyle(2, 0x8ef3df, 0.35).strokeCircle(this.x, this.y - 14, statusRadius);
      graphics.lineStyle(3, 0xb8fff0, 0.9).beginPath().arc(this.x, this.y - 14, statusRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * remaining).strokePath();
      graphics.fillStyle(0xa9f8e7, 0.9).fillTriangle(this.x, this.y - statusRadius - 22, this.x - 6, this.y - statusRadius - 11, this.x + 6, this.y - statusRadius - 11);
    }
    if (echo) {
      const pulse = 1 + Math.sin(time / 95) * 0.12;
      const cx = this.x; const cy = this.y - statusRadius - 17; const radius = 7 * pulse;
      graphics.lineStyle(2, 0x62c8e8, 0.78).beginPath().moveTo(cx, cy - radius).lineTo(cx + radius, cy).lineTo(cx, cy + radius).lineTo(cx - radius, cy).closePath().strokePath();
    }
    if (slowed) graphics.lineStyle(3, 0x63cdbd, 0.68).strokeCircle(this.x, this.y - 14, statusRadius + 6 + Math.sin(time / 120) * 2);
    if (this.kind !== 'elite' && this.kind !== 'boss') return;
    const vulnerable = time < this.vulnerableUntil;
    const radius = this.kind === 'boss' ? 45 : 30;
    const color = vulnerable ? 0x76d8c7 : this.kind === 'boss' ? 0xa85b4d : 0x8b7965;
    graphics.lineStyle(vulnerable ? 3 : 5, color, vulnerable ? 0.82 : 0.45);
    graphics.beginPath(); graphics.arc(this.x, this.y - 14, radius, this.facingAngle - 0.72, this.facingAngle + 0.72); graphics.strokePath();
    if (vulnerable) graphics.strokeCircle(this.x, this.y - 14, radius + 5 + Math.sin(time / 90) * 2);
  }

  public get groundPoint(): Readonly<{ x: number; y: number }> { return { x: this.x, y: this.y }; }
  public get previousGroundPoint(): Readonly<{ x: number; y: number }> { return { x: this.previousGroundX, y: this.previousGroundY }; }
  public get movementCircle(): Readonly<{ x: number; y: number; radius: number }> { return { x: this.x, y: this.y, radius: BALANCE.collision.movementRadius[this.kind] }; }
  public get hurtbox(): Ellipse {
    const runtime = this.presentation?.hurtbox(this.groundPoint);
    if (runtime) return runtime;
    return {
      x: this.x,
      y: this.y + BALANCE.collision.hurtOffsetY[this.kind],
      radiusX: BALANCE.collision.hurtRadiusX[this.kind],
      radiusY: BALANCE.collision.hurtRadiusY[this.kind],
    };
  }
  public get activeTelegraph(): Readonly<{ angle: number; length: number; halfWidth: number; until: number }> | undefined { return this.telegraphState; }
  public get meleeHitRadius(): number { return BALANCE.collision.movementRadius[this.kind] + 14; }
  public get meleeAttackId(): string { return this.meleeAttackIdValue || `${this.id}:melee:idle`; }
  public get meleeParryable(): boolean { return true; }
  public get isStopped(): boolean {
    const now = this.scene?.time?.now;
    return typeof now === 'number' && (now < this.frozenUntil || now < this.slowUntil);
  }
  public get isEchoMarked(): boolean {
    const now = this.scene?.time?.now;
    return typeof now === 'number' && now < this.echoUntil;
  }
  public get creatureId(): string | undefined { return this.presentation?.creatureId; }
  public get displayName(): string { return this.presentation?.displayName ?? this.kind; }
  public get nonlethalRetreat(): boolean { return this.presentation?.hasNonlethalRetreat ?? false; }
  public get attackAnchor(): Readonly<{ x: number; y: number }> { return this.projectileOrigin(); }
  public get runtimeState(): string | undefined { return this.presentation?.currentState; }
  public get runtimeAssetFile(): string | undefined { return this.presentation?.currentAssetFile; }
  public get runtimeOverlayActive(): boolean { return this.presentation?.hasOverlay ?? false; }

  public setGroundPosition(x: number, y: number): this {
    this.setPosition(x, y);
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    if (body?.enable) synchronizeArcadeBodyAfterGameObjectMove(body);
    return this;
  }

  public constrainToCombatBounds(): Readonly<{ corrected: boolean; correctedTop: boolean }> {
    const extents = enemyGroundExtents(this.kind);
    const result = clampGroundPointToBounds(this.x, this.y, extents, COMBAT_BOUNDS);
    if (!result.corrected) return result;
    this.setGroundPosition(result.x, result.y);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if ((this.x <= COMBAT_BOUNDS.left + extents.left && body.velocity.x < 0)
      || (this.x >= COMBAT_BOUNDS.right - extents.right && body.velocity.x > 0)) body.velocity.x *= -0.45;
    if ((this.y <= COMBAT_BOUNDS.top + extents.top && body.velocity.y < 0)
      || (this.y >= COMBAT_BOUNDS.bottom - extents.bottom && body.velocity.y > 0)) body.velocity.y *= -0.45;
    return result;
  }

  public commitGroundPosition(): void { this.previousGroundX = this.x; this.previousGroundY = this.y; }

  private clearTelegraph(): void {
    const telegraph = this.telegraph;
    if (!telegraph) return;
    this.scene?.tweens?.killTweensOf(telegraph);
    telegraph.destroy();
    this.telegraph = undefined;
  }

  public override destroy(fromScene?: boolean): void {
    this.clearTelegraph();
    this.scene?.tweens?.killTweensOf(this);
    this.statusGraphics?.destroy();
    this.runtimeShadow?.destroy(); this.runtimeShadow = undefined;
    this.presentation?.destroy();
    super.destroy(fromScene);
  }

  protected setFacingFlipX(flipped: boolean): void {
    if (this.presentation) this.presentation.setFacingFlipX(flipped);
    else this.setFlipX(flipped);
  }

  protected projectileOrigin(fallbackYOffset = 0, anchorIndex = 0): Readonly<{ x: number; y: number }> {
    return this.presentation?.attackAnchor(this.groundPoint, anchorIndex) ?? { x: this.x, y: this.y + fallbackYOffset };
  }

  protected setPresentationState(stateId: string): void {
    // Boss visuals are owned exclusively by bossPhaseMap. Reused regular-enemy
    // helpers (for example telegraphDash) must not replace a phase with idle,
    // prep, or attack after their timing callback completes.
    if (this.kind === 'boss') return;
    if (!this.presentation?.hasState(stateId) || this.presentation.currentState === stateId) return;
    this.presentation.applyState(stateId);
  }

  protected applyBossPresentationPhase(phase: 1 | 2 | 3 | 'preFight'): void {
    this.presentation?.applyBossPhase(phase);
  }

  private updatePresentationLayout(): void {
    const presentation = this.presentation; if (!presentation) return;
    presentation.updateLayout();
    const shadow = presentation.shadowAnchor(this.groundPoint);
    this.runtimeShadow?.setPosition(shadow.x, shadow.y).setDepth(DEPTH.shadow);
  }
}
