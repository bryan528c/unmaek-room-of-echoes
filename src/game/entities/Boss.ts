import Phaser from 'phaser';
import { BALANCE } from '../balance';
import { Enemy, type EnemyCallbacks } from './Enemy';
import { BossPhaseIntegrity, getBossDefinition, type BossDefinition, type BossId, type BossPhaseId, type BossPhaseSnapshot } from '../systems/BossDefinitions';
import type { EnemyDeathSource } from '../systems/CombatLifecycle';
import { isSubmissionCreatureId } from '../runtime/SubmissionRuntime';

export interface BossCallbacks extends EnemyCallbacks {
  phaseChanged: (phase: number) => void;
  signatureExecuted: (phase: BossPhaseId, signaturePattern: string) => void;
  summon: (count: number) => void;
  inkZone: (x: number, y: number, radius: number, duration: number, style?: 'ink' | 'erasure') => void;
}

export class Boss extends Enemy {
  public phase = 1;
  private patternIndex = 0;
  private phaseTransitionUntil = 0;
  private readonly bossCallbacks: BossCallbacks;
  private readonly bossDefinitionValue: BossDefinition;
  private readonly phaseIntegrity: BossPhaseIntegrity;

  public constructor(scene: Phaser.Scene, x: number, y: number, callbacks: BossCallbacks, archetype: BossArchetype = 'record-devourer', healthMultiplier = 1) {
    super(scene, x, y, 'boss', callbacks, healthMultiplier, isSubmissionCreatureId(archetype) ? archetype : undefined);
    this.bossCallbacks = callbacks;
    this.bossDefinitionValue = getBossDefinition(archetype);
    this.phaseIntegrity = new BossPhaseIntegrity(this.bossDefinitionValue, this.maxHealth, scene.time.now);
    this.health = this.phaseIntegrity.snapshot().phaseHealth;
    if (this.presentation) {
      if (this.presentation.metadata.bossPhaseMap?.preFight) this.applyBossPresentationPhase('preFight');
      else this.applyBossPresentationPhase(1);
    }
    else this.setTexture(this.bossDefinitionValue.silhouetteKey).setScale(1.22);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const diameter = BALANCE.collision.movementRadius.boss * 2;
    body.setCircle(BALANCE.collision.movementRadius.boss).setOffset((this.width - diameter) / 2, this.height - diameter - 2);
  }

  public override updateAI(time: number, hero: Phaser.Physics.Arcade.Sprite): void {
    if (!this.active || !this.spawned) return;
    if (time >= this.phaseTransitionUntil && this.phaseIntegrity.snapshot().transitionLocked) this.phaseIntegrity.unlockTransition();
    if (time < this.phaseTransitionUntil) { this.setVelocity(0); return; }
    if (time < this.frozenUntil) { this.setVelocity(0); this.setTint(0x62b9aa); return; }
    const slowed = time < this.slowUntil;
    if (slowed) this.setTint(0x62b9aa); else this.clearTint();
    const distance = Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y);
    this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.setFacingFlipX(Math.cos(this.facingAngle) < 0, hero.x - this.x);
    if (time < this.actionLockedUntil) return;
    if (time < this.nextActionAt) {
      if (distance > 145) this.moveToward(this.facingAngle, BALANCE.enemies.boss.speed * (this.phase === 3 ? 1.16 : 1) * (slowed ? 0.36 : 1));
      else this.setVelocity(0);
      return;
    }
    if (this.bossDefinitionValue.paletteKey === 'editor') {
      if (this.phase === 1) this.editorPhaseOne(hero);
      else if (this.phase === 2) this.editorPhaseTwo(hero);
      else this.editorPhaseThree(hero);
    } else if (this.phase === 1) this.phaseOne(hero);
    else if (this.phase === 2) this.phaseTwo(hero);
    else this.phaseThree(hero);
  }

  public override takeDamage(amount: number, sourceAngle: number, parried = false, deathSource: EnemyDeathSource = 'other'): number {
    if (!this.active || this.health <= 0 && this.phaseIntegrity.snapshot().defeated) return 0;
    this.lastDamageSource = deathSource;
    const result = this.phaseIntegrity.applyDamage(this.resolveIncomingDamage(amount, sourceAngle, parried), this.scene.time.now);
    if (result.appliedDamage > 0) this.flashDamage();
    this.health = this.phaseIntegrity.snapshot().phaseHealth;
    if (result.bossDefeated) {
      this.health = 0;
      this.die(deathSource);
    } else if (result.nextPhase) this.transition(result.nextPhase);
    return result.appliedDamage;
  }

  public beginCombatPresentation(): void { this.applyBossPresentationPhase(1); }

  private transition(phase: BossPhaseId): void {
    if (!this.phaseIntegrity.beginNextPhase(phase, this.scene.time.now)) return;
    this.phase = phase;
    this.health = this.phaseIntegrity.snapshot().phaseHealth;
    this.phaseTransitionUntil = this.scene.time.now + BALANCE.boss.phaseTransition;
    this.actionLockedUntil = this.phaseTransitionUntil;
    this.nextActionAt = this.phaseTransitionUntil + BALANCE.boss.phaseOpeningDelay;
    this.patternIndex = 0;
    this.setVelocity(0).setTint(0xa0f4e5);
    this.applyBossPresentationPhase(phase);
    // Keep the hidden gameplay owner on the legacy transform path. A pilot
    // visual, when present, is independent and remains uniformly scaled.
    this.scene.tweens.add({ targets: this, scaleX: 1.48, scaleY: 1.48, duration: 330, yoyo: true });
    // The phase callback cancels all outstanding gameplay attack intents,
    // including the boss. Start the authored warning after that cleanup so it
    // is not immediately replaced by the base phase texture.
    this.bossCallbacks.phaseChanged(phase);
    this.presentation?.playMotionAction(['warning'], BALANCE.boss.phaseTransition);
    if (phase === 3) this.scene.time.delayedCall(900, () => { if (this.active) this.bossCallbacks.summon(3); });
  }

  private phaseOne(hero: Phaser.Physics.Arcade.Sprite): void {
    this.patternIndex += 1;
    if (this.patternIndex % 2 === 0) {
      this.markSignaturePattern();
      this.telegraphDash(hero, BALANCE.enemies.boss.damage, 620, 410);
      this.nextActionAt = this.scene.time.now + 1800;
      return;
    }
    const angle = this.facingAngle;
    this.actionLockedUntil = this.scene.time.now + 850;
    this.presentation?.playMotionAction(['warning'], 720);
    this.showAim(angle, 720, 0xd95842, 650);
    const generation = this.attackIntentGeneration;
    this.scene.time.delayedCall(680, () => {
      if (!this.active || generation !== this.attackIntentGeneration || this.scene.time.now < this.phaseTransitionUntil) return;
      this.markSignaturePattern();
      for (let index = -2; index <= 2; index += 1) { const origin = this.projectileOrigin(-18, index + 2); this.callbacks.shoot(this, origin.x, origin.y, angle + index * 0.12, 245, 15, 'projectile-boss'); }
    });
    this.nextActionAt = this.scene.time.now + 1850;
  }

  private phaseTwo(hero: Phaser.Physics.Arcade.Sprite): void {
    this.patternIndex += 1;
    if (this.patternIndex % 3 === 0) {
      this.telegraphDash(hero, 30, 760, 440);
      this.nextActionAt = this.scene.time.now + 1600;
      return;
    }
    this.setVelocity(0); this.actionLockedUntil = this.scene.time.now + 1100;
    const spots = [
      { x: hero.x, y: hero.y },
      { x: Phaser.Math.Clamp(hero.x + Phaser.Math.Between(-150, 150), 100, 860), y: Phaser.Math.Clamp(hero.y + Phaser.Math.Between(-100, 100), 110, 475) },
    ];
    const generation = this.attackIntentGeneration;
    spots.forEach((spot, index) => this.scene.time.delayedCall(index * 220, () => {
      if (this.active && generation === this.attackIntentGeneration && this.scene.time.now >= this.phaseTransitionUntil) { this.markSignaturePattern(); this.bossCallbacks.inkZone(spot.x, spot.y, 62, 3500); }
    }));
    this.scene.time.delayedCall(650, () => {
      if (!this.active || generation !== this.attackIntentGeneration || this.scene.time.now < this.phaseTransitionUntil) return;
      for (let index = 0; index < 12; index += 1) { const origin = this.projectileOrigin(0, index); this.callbacks.shoot(this, origin.x, origin.y, index * Math.PI * 2 / 12 + this.patternIndex * 0.14, 155, 14, 'projectile-ink'); }
    });
    this.nextActionAt = this.scene.time.now + 2050;
  }

  private phaseThree(hero: Phaser.Physics.Arcade.Sprite): void {
    this.patternIndex += 1;
    if (this.patternIndex === 1 || this.patternIndex % 4 === 0) this.bossCallbacks.summon(this.patternIndex === 1 ? 3 : 2);
    if (this.patternIndex % 2 === 0) {
      this.telegraphDash(hero, 28, 520, 475);
      this.scene.time.delayedCall(520, () => { if (this.active && this.phase === 3) this.markSignaturePattern(); });
      this.nextActionAt = this.scene.time.now + 1250;
      return;
    }
    const angle = this.facingAngle;
    this.actionLockedUntil = this.scene.time.now + 720;
    this.presentation?.playMotionAction(['warning'], 520);
    this.showAim(angle, 520, 0xe36f4b, 680);
    const generation = this.attackIntentGeneration;
    this.scene.time.delayedCall(480, () => {
      if (!this.active || generation !== this.attackIntentGeneration || this.scene.time.now < this.phaseTransitionUntil) return;
      this.markSignaturePattern();
      for (let index = -3; index <= 3; index += 1) { const origin = this.projectileOrigin(-14, index + 3); this.callbacks.shoot(this, origin.x, origin.y, angle + index * 0.17, 270 - Math.abs(index) * 12, 17, 'projectile-boss'); }
    });
    this.nextActionAt = this.scene.time.now + 1350;
  }

  private editorPhaseOne(hero: Phaser.Physics.Arcade.Sprite): void {
    this.patternIndex += 1;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.setVelocity(0); this.actionLockedUntil = this.scene.time.now + 820;
    this.presentation?.playMotionAction(['warning'], 680);
    this.showAim(angle, 680, 0xb44861, 700);
    const generation = this.attackIntentGeneration;
    this.scene.time.delayedCall(650, () => {
      if (!this.active || generation !== this.attackIntentGeneration || this.scene.time.now < this.phaseTransitionUntil) return;
      this.markSignaturePattern();
      for (let index = -2; index <= 2; index += 1) { const origin = this.projectileOrigin(-18, index + 2); this.callbacks.shoot(this, origin.x, origin.y, angle + index * .18, 220, 14, 'projectile-boss'); }
    });
    this.nextActionAt = this.scene.time.now + 1750;
  }

  private editorPhaseTwo(hero: Phaser.Physics.Arcade.Sprite): void {
    this.patternIndex += 1;
    this.setVelocity(0); this.actionLockedUntil = this.scene.time.now + 1250;
    const delayed = [
      { x: hero.x, y: hero.y },
      { x: Phaser.Math.Clamp(hero.x + Phaser.Math.Between(-95, 95), 92, 868), y: Phaser.Math.Clamp(hero.y + Phaser.Math.Between(-70, 70), 105, 478) },
      { x: Phaser.Math.Clamp(hero.x + Phaser.Math.Between(-140, 140), 92, 868), y: Phaser.Math.Clamp(hero.y + Phaser.Math.Between(-105, 105), 105, 478) },
    ];
    const generation = this.attackIntentGeneration;
    delayed.forEach((spot, index) => this.scene.time.delayedCall(index * 230, () => {
      if (this.active && generation === this.attackIntentGeneration && this.scene.time.now >= this.phaseTransitionUntil) { this.markSignaturePattern(); this.bossCallbacks.inkZone(spot.x, spot.y, 54, 2600, 'erasure'); }
    }));
    this.nextActionAt = this.scene.time.now + 2100;
  }

  private editorPhaseThree(hero: Phaser.Physics.Arcade.Sprite): void {
    this.patternIndex += 1;
    if (this.patternIndex % 3 === 0) this.bossCallbacks.summon(3);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.setVelocity(0); this.actionLockedUntil = this.scene.time.now + 780;
    this.presentation?.playMotionAction(['warning'], 620);
    this.showAim(angle, 620, 0xa53d68, 650);
    const generation = this.attackIntentGeneration;
    this.scene.time.delayedCall(590, () => {
      if (!this.active || generation !== this.attackIntentGeneration || this.scene.time.now < this.phaseTransitionUntil) return;
      this.markSignaturePattern();
      for (let index = -4; index <= 4; index += 1) { const origin = this.projectileOrigin(-16, index + 4); this.callbacks.shoot(this, origin.x, origin.y, angle + index * .14, 250 - Math.abs(index) * 10, 16, 'projectile-ink'); }
    });
    this.nextActionAt = this.scene.time.now + 1450;
  }

  public debugSetPhase(phase: 1 | 2 | 3): void {
    if (phase !== this.phase + 1) return;
    this.phaseIntegrity.markSignatureExecuted();
    const current = this.phaseIntegrity.snapshot().phaseHealth;
    this.takeDamage(current, 0, false, 'other');
  }

  private markSignaturePattern(): void {
    if (!this.phaseIntegrity.markSignatureExecuted()) return;
    const phase = this.phaseIntegrity.phaseDefinition();
    this.bossCallbacks.signatureExecuted(phase.id, phase.signaturePattern);
  }

  public get definition(): BossDefinition { return this.bossDefinitionValue; }
  public get phaseSnapshot(): BossPhaseSnapshot { return this.phaseIntegrity.snapshot(); }
  public get phaseHealth(): number { return this.phaseIntegrity.snapshot().phaseHealth; }
  public get phaseMaxHealth(): number { return this.phaseIntegrity.snapshot().phaseMaxHealth; }
}

export type BossArchetype = BossId;
