import Phaser from 'phaser';
import { BALANCE } from '../balance';
import { Enemy, type EnemyCallbacks } from './Enemy';
import { bossPhaseForHealth } from '../systems/CombatRules';

export interface BossCallbacks extends EnemyCallbacks {
  phaseChanged: (phase: number) => void;
  summon: (count: number) => void;
  inkZone: (x: number, y: number, radius: number, duration: number) => void;
}

export class Boss extends Enemy {
  public phase = 1;
  private patternIndex = 0;
  private phaseTransitionUntil = 0;
  private readonly bossCallbacks: BossCallbacks;

  public constructor(scene: Phaser.Scene, x: number, y: number, callbacks: BossCallbacks) {
    super(scene, x, y, 'boss', callbacks);
    this.bossCallbacks = callbacks;
    this.setScale(1.22);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const diameter = BALANCE.collision.movementRadius.boss * 2;
    body.setCircle(BALANCE.collision.movementRadius.boss).setOffset((this.width - diameter) / 2, this.height - diameter - 2);
  }

  public override updateAI(time: number, hero: Phaser.Physics.Arcade.Sprite): void {
    if (!this.active || !this.spawned) return;
    const desiredPhase = bossPhaseForHealth(this.health, this.maxHealth);
    if (desiredPhase > this.phase) this.transition(desiredPhase);
    if (time < this.phaseTransitionUntil) { this.setVelocity(0); return; }
    if (time < this.frozenUntil) { this.setVelocity(0); this.setTint(0x62b9aa); return; }
    const slowed = time < this.slowUntil;
    if (slowed) this.setTint(0x62b9aa); else this.clearTint();
    const distance = Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y);
    this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.setFlipX(Math.cos(this.facingAngle) < 0);
    if (time < this.actionLockedUntil) return;
    if (time < this.nextActionAt) {
      if (distance > 145) this.moveToward(this.facingAngle, BALANCE.enemies.boss.speed * (this.phase === 3 ? 1.16 : 1) * (slowed ? 0.36 : 1));
      else this.setVelocity(0);
      return;
    }
    if (this.phase === 1) this.phaseOne(hero);
    else if (this.phase === 2) this.phaseTwo(hero);
    else this.phaseThree(hero);
  }

  private transition(phase: number): void {
    this.phase = phase;
    this.phaseTransitionUntil = this.scene.time.now + BALANCE.boss.phaseTransition;
    this.actionLockedUntil = this.phaseTransitionUntil;
    this.nextActionAt = this.phaseTransitionUntil + BALANCE.boss.phaseOpeningDelay;
    this.setVelocity(0).setTint(0xa0f4e5);
    this.scene.tweens.add({ targets: this, scaleX: 1.48, scaleY: 1.48, duration: 330, yoyo: true });
    this.bossCallbacks.phaseChanged(phase);
    if (phase === 3) this.scene.time.delayedCall(900, () => { if (this.active) this.bossCallbacks.summon(3); });
  }

  private phaseOne(hero: Phaser.Physics.Arcade.Sprite): void {
    this.patternIndex += 1;
    if (this.patternIndex % 2 === 1) {
      this.telegraphDash(hero, BALANCE.enemies.boss.damage, 620, 410);
      this.nextActionAt = this.scene.time.now + 1800;
      return;
    }
    const angle = this.facingAngle;
    this.actionLockedUntil = this.scene.time.now + 850;
    this.showAim(angle, 720, 0xd95842, 650);
    const generation = this.attackIntentGeneration;
    this.scene.time.delayedCall(680, () => {
      if (!this.active || generation !== this.attackIntentGeneration || this.scene.time.now < this.phaseTransitionUntil) return;
      for (let index = -2; index <= 2; index += 1) this.callbacks.shoot(this, this.x, this.y - 18, angle + index * 0.12, 245, 15, 'projectile-boss');
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
      if (this.active && generation === this.attackIntentGeneration && this.scene.time.now >= this.phaseTransitionUntil) this.bossCallbacks.inkZone(spot.x, spot.y, 62, 3500);
    }));
    this.scene.time.delayedCall(650, () => {
      if (!this.active || generation !== this.attackIntentGeneration || this.scene.time.now < this.phaseTransitionUntil) return;
      for (let index = 0; index < 12; index += 1) this.callbacks.shoot(this, this.x, this.y, index * Math.PI * 2 / 12 + this.patternIndex * 0.14, 155, 14, 'projectile-ink');
    });
    this.nextActionAt = this.scene.time.now + 2050;
  }

  private phaseThree(hero: Phaser.Physics.Arcade.Sprite): void {
    this.patternIndex += 1;
    if (this.patternIndex % 4 === 0) this.bossCallbacks.summon(2);
    if (this.patternIndex % 2 === 0) {
      this.telegraphDash(hero, 28, 520, 475);
      this.nextActionAt = this.scene.time.now + 1250;
      return;
    }
    const angle = this.facingAngle;
    this.actionLockedUntil = this.scene.time.now + 720;
    this.showAim(angle, 520, 0xe36f4b, 680);
    const generation = this.attackIntentGeneration;
    this.scene.time.delayedCall(480, () => {
      if (!this.active || generation !== this.attackIntentGeneration || this.scene.time.now < this.phaseTransitionUntil) return;
      for (let index = -3; index <= 3; index += 1) this.callbacks.shoot(this, this.x, this.y - 14, angle + index * 0.17, 270 - Math.abs(index) * 12, 17, 'projectile-boss');
    });
    this.nextActionAt = this.scene.time.now + 1350;
  }

  public debugSetPhase(phase: 1 | 2 | 3): void {
    if (phase <= this.phase) return;
    this.transition(phase);
  }
}
