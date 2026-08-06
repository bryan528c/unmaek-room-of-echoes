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
import { act1FinalBossRetreatPresentation, act1FinalEnabled } from '../final/Act1FinalConfig';

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
  private readonly attackTimers = new Set<Phaser.Time.TimerEvent>();
  private pausedAttackTweens = new Set<Phaser.Tweens.Tween>();
  private stopResumeTimer?: Phaser.Time.TimerEvent;
  private fullStopPausedAt?: number;
  private pausedAttackGeneration = -1;
  private pausedVelocity?: Readonly<{ x: number; y: number }>;
  private pausedBodyMoves?: boolean;
  private pausedBodyImmovable?: boolean;
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
      const contactMode = this.presentation.profile.contactMode;
      if (contactMode !== 'none') {
        const waterContact = contactMode === 'ripple';
        this.runtimeShadow = scene.add.ellipse(x, y, Math.max(22, (hurtbox?.radiusX ?? 18) * 1.7), Math.max(7, (hurtbox?.radiusY ?? 8) * 0.7), waterContact ? 0x3f8790 : 0x020506, waterContact ? 0.08 : 0.28)
          .setStrokeStyle(waterContact ? 2 : 0, waterContact ? 0x79b9b5 : 0x020506, waterContact ? 0.32 : 0)
          .setDepth(DEPTH.shadow).setAlpha(0);
      }
      this.syncPresentationCompanions();
    }
  }

  public spawn(minimalPresentation = false): void {
    const marker = this.scene.add.graphics().setDepth(DEPTH.telegraph);
    if (minimalPresentation) marker.lineStyle(1, 0xe5ad68, 0.42).strokeCircle(this.x, this.y + 3, 7);
    else {
      marker.lineStyle(2, 0xc4543c, 0.8).strokeEllipse(this.x, this.y + 8, 58, 26);
      marker.lineStyle(1, 0xe5ad68, 0.55).strokeCircle(this.x, this.y + 8, 9);
    }
    this.scene.tweens.add({
      targets: marker,
      alpha: minimalPresentation ? 0 : 0.22,
      scaleX: minimalPresentation ? 1.12 : 1.2,
      scaleY: minimalPresentation ? 1.12 : 1.2,
      duration: minimalPresentation ? 160 : 560,
      onComplete: () => marker.destroy(),
    });
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

  public override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    // Presentation companions belong to the render owner, not to a particular
    // AI implementation. Boss overrides updateAI, and retreating owners skip AI
    // entirely, so synchronizing here keeps every companion on the owner for
    // normal movement, phase tweens, nonlethal retreat, and scene cleanup.
    this.syncPresentationCompanions();
  }

  public updateAI(time: number, hero: Phaser.Physics.Arcade.Sprite): void {
    if (!this.active || !this.spawned) return;
    this.setDepth(DEPTH.characterBase + Math.floor(this.y));
    if (this.linked && time >= this.linkedUntil) this.linked = false;
    this.updateStatusGraphics(time);
    if (time < this.frozenUntil) { this.setVelocity(0); this.setPresentationState('stunned'); this.setTint(0x54bbaa); return; }
    this.clearTint();
    if ((this.kind === 'elite' || this.kind === 'boss') && time < this.vulnerableUntil) this.setTint(0x91e2d3);
    if (time < this.actionLockedUntil) return;
    const distance = Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y);
    this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.setFacingFlipX(Math.cos(this.facingAngle) < 0, hero.x - this.x);
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
      // End the presentation window just before the existing 620 ms recovery
      // callback so timer ordering cannot reject the recover sequence. The
      // projectile still spawns at the unchanged 540 ms gameplay timestamp.
      this.presentation?.playMotionAction(['prep', 'attack'], 610, 540);
      const angle = this.facingAngle; this.showAim(angle, 520, 0xd05b45);
      const generation = this.attackIntentGeneration;
      this.scene.time.delayedCall(500, () => { if (generation === this.attackIntentGeneration) this.callbacks.cue('parryWindow'); });
      this.scene.time.delayedCall(540, () => { if (generation === this.attackIntentGeneration && this.active && this.health > 0) { this.setPresentationState('attack'); this.showMotionContactCue(); const origin = this.projectileOrigin(-12); this.callbacks.shoot(this, origin.x, origin.y, angle, 250, BALANCE.enemies.archer.damage); } });
      this.scene.time.delayedCall(620, () => {
        if (generation === this.attackIntentGeneration && this.active && this.health > 0) this.presentation?.playMotionAction(['hit_recover'], 220);
      });
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
      this.presentation?.playMotionAction(['idle_to_alert', 'alert_to_deploy', 'deploy_to_attack', 'attack_to_recover'], 780, 650);
      const telegraph = this.scene.add.graphics().setDepth(DEPTH.telegraph).lineStyle(2, 0xd26c52, 0.65).strokeCircle(this.x, this.y, 48);
      this.telegraph = telegraph;
      this.telegraphState = { angle: 0, length: 48, halfWidth: 48, until: time + 670 };
      this.scene.tweens.add({ targets: telegraph, scaleX: 1.6, scaleY: 1.6, alpha: 0, duration: 670, onComplete: () => { telegraph.destroy(); if (this.telegraph === telegraph) { this.telegraph = undefined; this.telegraphState = undefined; } } });
      const count = 7;
      const generation = this.attackIntentGeneration;
      this.scene.time.delayedCall(650, () => { if (generation !== this.attackIntentGeneration || !this.active || this.health <= 0) return; this.setPresentationState('attack'); this.showMotionContactCue(); for (let index = 0; index < count; index += 1) { const origin = this.projectileOrigin(0, index); this.callbacks.shoot(this, origin.x, origin.y, this.facingAngle - 0.75 + index * 1.5 / (count - 1), 170, BALANCE.enemies.ink.damage, 'projectile-ink'); } });
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
    // Keep a 10 ms presentation-only gap before the existing recovery
    // callback. This avoids same-tick ordering suppressing hit_recover without
    // changing warning, movement, contact, damage, or action-lock timing.
    if (this.creatureId === 'rewind_lizard') this.presentation?.playMotionAction(['prep', 'attack'], warningMs + 300, warningMs);
    if (this.creatureId === 'resonance_goral') this.presentation?.playMotionAction(['combat_prep', 'charge_attack'], warningMs + 300, warningMs);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.showAim(angle, warningMs, 0xd56343, 185);
    // Preserve the legacy physics-owner transform on both flag paths. The
    // motion-pilot image is a separate, uniformly-scaled presentation object,
    // so this tween cannot stretch or rotate its source pixels.
    this.scene.tweens.add({ targets: this, scaleX: this.baseScale * 1.08, scaleY: this.baseScale * 0.82, rotation: Math.cos(angle) < 0 ? -0.06 : 0.06, duration: warningMs * 0.72, yoyo: true });
    const generation = this.attackIntentGeneration;
    this.scheduleAttackCallback(warningMs, () => {
      if (generation !== this.attackIntentGeneration || !this.active || this.health <= 0) return;
      this.setPresentationState('attack');
      this.callbacks.cue('parryWindow'); this.setScale(this.baseScale).setRotation(0);
      this.showMotionContactCue();
      this.meleeAttackIdValue = `${this.id}:melee:${this.meleeSequence += 1}`;
      this.attackActiveUntil = this.scene.time.now + 300;
      this.telegraphState = { angle, length: Math.max(40, speed * 0.28), halfWidth: this.meleeHitRadius * BALANCE.collision.meleeTelegraphPadding, until: this.attackActiveUntil };
      this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.scheduleAttackCallback(280, () => { if (this.active) { this.setVelocity(0); this.setPresentationState('idle'); this.attackActiveUntil = 0; this.telegraphState = undefined; } });
      this.scheduleAttackCallback(310, () => {
        if (generation === this.attackIntentGeneration && this.active && this.health > 0) this.presentation?.playMotionAction(['hit_recover'], 220);
      });
    });
    this.setData('meleeDamage', damage);
  }

  protected showAim(angle: number, duration: number, color: number, length = 540): void {
    this.clearTelegraph();
    const halfWidth = Math.max(30, this.movementCircle.radius + 14) * BALANCE.collision.meleeTelegraphPadding;
    this.telegraphState = { angle, length, halfWidth, until: this.scene.time.now + duration };
    this.callbacks.cue('warning');
    // Final bat presentation owns its short mouth cue. Preserve the gameplay
    // telegraph state/timing while suppressing the legacy full-screen line.
    if (act1FinalEnabled() && this.creatureId === 'deflect_bat') return;
    const telegraph = this.scene.add.graphics().setDepth(DEPTH.telegraph);
    this.telegraph = telegraph;
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

  private showMotionContactCue(): void {
    if (!this.presentation?.motionPilotActive) return;
    const anchor = this.presentation.visualAttackAnchor(this.groundPoint);
    if (!anchor) return;
    const cue = this.scene.add.circle(anchor.x, anchor.y, 3, 0xf2fff8, 0.78).setStrokeStyle(1, 0x61cdb9, 0.82).setDepth(DEPTH.melee);
    this.scene.tweens.add({ targets: cue, alpha: 0, scaleX: 1.7, scaleY: 1.7, duration: 85, onComplete: () => cue.destroy() });
  }

  public freeze(until: number, bossSlow = false): boolean {
    const now = this.scene.time.now;
    const fullBossStop = bossSlow && this.kind === 'boss' && this.creatureId === 'resonance_goral';
    if (fullBossStop && !this.canAcceptFullStop(now)) return false;
    if (bossSlow && !fullBossStop) {
      const slowedUntil = now + Math.max(0, until - now) * 0.58;
      this.slowUntil = Math.max(this.slowUntil, slowedUntil);
      this.nextActionAt = Math.max(this.nextActionAt, now + Math.max(0, slowedUntil - now) * 0.72);
      return true;
    }
    if (until > this.frozenUntil) { this.frozenStartedAt = now; this.frozenUntil = until; }
    if (fullBossStop) this.pauseFullStop(until);
    return true;
  }

  public markEcho(until: number): void { this.echoUntil = Math.max(this.echoUntil, until); }
  public consumeStopped(now = this.scene.time.now): boolean {
    if (this.frozenUntil <= now && this.slowUntil <= now) return false;
    this.frozenUntil = now; this.slowUntil = now;
    if (this.fullStopPausedAt !== undefined) {
      this.stopResumeTimer?.remove(false);
      this.resumeFullStop();
    }
    return true;
  }

  public cancelAttackIntent(until: number): void {
    this.attackIntentGeneration += 1;
    for (const timer of this.attackTimers) timer.remove(false);
    this.attackTimers.clear();
    this.pausedVelocity = undefined;
    this.pausedAttackGeneration = -1;
    this.pausedAttackTweens.clear();
    this.clearTelegraph(); this.telegraphState = undefined; this.attackActiveUntil = 0;
    this.actionLockedUntil = Math.max(this.actionLockedUntil, until); this.nextActionAt = Math.max(this.nextActionAt, until);
    this.scene.tweens.killTweensOf(this);
    this.setVelocity(0).setRotation(0).setScale(this.baseScale);
    this.presentation?.cancelMotionAction();
    this.presentation?.restoreStateTransform();
  }

  /**
   * A resolved melee overlap cancels the gameplay dash generation immediately.
   * Start only the authored recovery pose after that cancellation so the
   * contact remains readable without reviving an attack callback or changing
   * the stagger/damage timing.
   */
  public playResolvedContactRecovery(): void {
    if (this.creatureId !== 'rewind_lizard' && this.creatureId !== 'resonance_goral') return;
    this.presentation?.playMotionAction(['hit_recover'], 220);
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
    if (this.kind === 'boss') this.presentation?.playMotionAction(['hit_recover'], 240);
    const hitStateApplied = this.presentation?.currentState === 'hit';
    if (this.presentation?.motionPilotActive) this.setTint(0xe8d9c3);
    else this.setTintFill(0xf1e7d2);
    this.scene.time.delayedCall(this.presentation?.motionPilotActive ? 45 : 70, () => {
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
      this.presentation.playMotionAction(['retreat'], 1100);
      scene.tweens.add({ targets: this.runtimeShadow, alpha: 0, duration: 900 });
      if (act1FinalBossRetreatPresentation(this.creatureId ?? '') === 'IN_PLACE_DISSOLVE') {
        const restingX = this.x;
        scene.tweens.add({ targets: this, x: restingX + 2, duration: 65, ease: 'Sine.InOut', yoyo: true, repeat: 4 });
        scene.tweens.add({
          targets: this,
          y: this.y + 12,
          alpha: 0,
          duration: 1100,
          ease: 'Sine.In',
          onComplete: () => { this.callbacks.died(this, source); if (this.active) this.destroy(); },
        });
        return;
      }
      const exitX = this.x < 480 ? -140 : 1100;
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
  public get isStopPositionLocked(): boolean { return this.fullStopPausedAt !== undefined; }
  public get stopSnapshot(): Readonly<{
    frozenUntil: number;
    slowUntil: number;
    fullStopPaused: boolean;
    pendingAttackCallbacks: number;
    velocity: Readonly<{ x: number; y: number }>;
  }> {
    const body = this.body as Phaser.Physics.Arcade.Body;
    return {
      frozenUntil: this.frozenUntil,
      slowUntil: this.slowUntil,
      fullStopPaused: this.fullStopPausedAt !== undefined,
      pendingAttackCallbacks: this.attackTimers.size,
      velocity: { x: body.velocity.x, y: body.velocity.y },
    };
  }
  public get isEchoMarked(): boolean {
    const now = this.scene?.time?.now;
    return typeof now === 'number' && now < this.echoUntil;
  }
  public get creatureId(): string | undefined { return this.presentation?.creatureId; }
  public get displayName(): string { return this.presentation?.displayName ?? this.kind; }
  public get nonlethalRetreat(): boolean { return this.presentation?.hasNonlethalRetreat ?? false; }
  public get attackAnchor(): Readonly<{ x: number; y: number }> { return this.projectileOrigin(); }
  public get visualAttackAnchor(): Readonly<{ x: number; y: number }> | undefined { return this.presentation?.visualAttackAnchor(this.groundPoint); }
  public createPresentationAfterimage(offsetX: number, offsetY: number, tint: number, alpha: number): Phaser.GameObjects.Image | undefined {
    return this.presentation?.createAfterimage(offsetX, offsetY, tint, alpha);
  }
  public get motionSnapshot() { return this.presentation?.motionSnapshot; }
  public get runtimeState(): string | undefined { return this.presentation?.currentState; }
  public get runtimeAssetFile(): string | undefined { return this.presentation?.currentAssetFile; }
  public get runtimeOverlayActive(): boolean { return this.presentation?.hasOverlay ?? false; }
  public get presentationCompanions(): Readonly<{
    primary: 0 | 1;
    outline: 0 | 1;
    contact: 0 | 1;
    stateOverlay: 0 | 1;
    phaseOverlay: 0 | 1;
    total: number;
    outlineTransform: ReturnType<CreaturePresentation['companionSnapshot']>['outline'];
    overlayTransform: ReturnType<CreaturePresentation['companionSnapshot']>['overlay'];
    contactTransform: { x: number; y: number; alpha: number; depth: number } | null;
  }> {
    const presentation = this.presentation?.companionSnapshot();
    const overlay = presentation?.overlay ? 1 : 0;
    const contact = this.runtimeShadow?.active ? 1 : 0;
    return {
      primary: this.active ? 1 : 0,
      outline: presentation?.outline ? 1 : 0,
      contact,
      stateOverlay: this.kind === 'boss' ? 0 : overlay,
      phaseOverlay: this.kind === 'boss' ? overlay : 0,
      total: (presentation?.total ?? 0) + contact,
      outlineTransform: presentation?.outline ?? null,
      overlayTransform: presentation?.overlay ?? null,
      contactTransform: this.runtimeShadow?.active
        ? { x: this.runtimeShadow.x, y: this.runtimeShadow.y, alpha: this.runtimeShadow.alpha, depth: this.runtimeShadow.depth }
        : null,
    };
  }

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
    this.stopResumeTimer?.remove(false); this.stopResumeTimer = undefined;
    for (const timer of this.attackTimers) timer.remove(false);
    this.attackTimers.clear(); this.pausedAttackTweens.clear();
    this.clearTelegraph();
    this.scene?.tweens?.killTweensOf(this);
    this.statusGraphics?.destroy();
    this.runtimeShadow?.destroy(); this.runtimeShadow = undefined;
    this.presentation?.destroy();
    super.destroy(fromScene);
  }

  protected setFacingFlipX(flipped: boolean, horizontalDelta?: number): void {
    if (this.presentation) this.presentation.setFacingFlipX(flipped, horizontalDelta);
    else this.setFlipX(flipped);
  }

  protected canAcceptFullStop(_now: number): boolean { return true; }

  protected scheduleAttackCallback(delay: number, callback: () => void): Phaser.Time.TimerEvent {
    let timer!: Phaser.Time.TimerEvent;
    timer = this.scene.time.delayedCall(delay, () => {
      this.attackTimers.delete(timer);
      callback();
    });
    if (this.fullStopPausedAt !== undefined) timer.paused = true;
    this.attackTimers.add(timer);
    return timer;
  }

  private pauseFullStop(until: number): void {
    const now = this.scene.time.now;
    if (until <= now) return;
    if (this.fullStopPausedAt === undefined) {
      this.fullStopPausedAt = now;
      this.pausedAttackGeneration = this.attackIntentGeneration;
      const body = this.body as Phaser.Physics.Arcade.Body;
      this.pausedVelocity = { x: body.velocity.x, y: body.velocity.y };
      this.pausedBodyMoves = body.moves;
      this.pausedBodyImmovable = body.immovable;
      body.moves = false;
      body.immovable = true;
      this.setVelocity(0);
      for (const timer of this.attackTimers) timer.paused = true;
      const tweenTargets: object[] = [this];
      if (this.telegraph?.active) tweenTargets.push(this.telegraph);
      for (const tween of this.scene.tweens.getTweensOf(tweenTargets)) {
        if (tween.isPaused()) continue;
        tween.pause(); this.pausedAttackTweens.add(tween);
      }
    }
    this.presentation?.pauseMotion(until);
    this.stopResumeTimer?.remove(false);
    this.stopResumeTimer = this.scene.time.delayedCall(Math.max(0, until - now), () => this.resumeFullStop());
  }

  private resumeFullStop(): void {
    const pausedAt = this.fullStopPausedAt;
    if (pausedAt === undefined || this.scene.time.now < this.frozenUntil) return;
    const pausedDuration = Math.max(0, this.frozenUntil - pausedAt);
    const sameAttack = this.pausedAttackGeneration === this.attackIntentGeneration;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.moves = this.pausedBodyMoves ?? body.moves;
    body.immovable = this.pausedBodyImmovable ?? body.immovable;
    if (sameAttack) {
      if (this.actionLockedUntil > pausedAt) this.actionLockedUntil += pausedDuration;
      if (this.nextActionAt > pausedAt) this.nextActionAt += pausedDuration;
      if (this.attackActiveUntil > pausedAt) this.attackActiveUntil += pausedDuration;
      if (this.telegraphState && this.telegraphState.until > pausedAt) this.telegraphState.until += pausedDuration;
      for (const timer of this.attackTimers) timer.paused = false;
      for (const tween of this.pausedAttackTweens) if (tween.isPaused()) tween.resume();
      if (this.active && this.pausedVelocity) this.setVelocity(this.pausedVelocity.x, this.pausedVelocity.y);
    }
    this.fullStopPausedAt = undefined;
    this.pausedAttackGeneration = -1;
    this.pausedVelocity = undefined;
    this.pausedBodyMoves = undefined;
    this.pausedBodyImmovable = undefined;
    this.pausedAttackTweens.clear();
    this.stopResumeTimer = undefined;
  }

  public get visualFlipX(): boolean { return this.presentation?.presentationFlipX ?? this.flipX; }

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

  public syncPresentationCompanions(): void {
    const presentation = this.presentation; if (!presentation) return;
    presentation.updateLayout();
    const shadow = presentation.shadowAnchor(this.groundPoint);
    this.runtimeShadow?.setPosition(shadow.x, shadow.y).setDepth(DEPTH.shadow);
  }
}
