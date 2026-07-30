import Phaser from 'phaser';
import { BALANCE, type EnemyKind } from '../balance';
import { angleDelta } from '../utils/math';

export interface EnemyCallbacks {
  shoot: (x: number, y: number, angle: number, speed: number, damage: number, texture?: string) => void;
  melee: (enemy: Enemy, damage: number) => void;
  died: (enemy: Enemy) => void;
  cue: (cue: 'warning' | 'parryWindow') => void;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public readonly id: string;
  public health: number;
  public readonly maxHealth: number;
  public frozenUntil = 0;
  public vulnerableUntil = 0;
  public attackActiveUntil = 0;
  public linkedUntil = 0;
  public linked = false;
  public facingAngle = 0;
  public spawned = false;
  public kind: EnemyKind;

  protected nextActionAt: number;
  protected actionLockedUntil = 0;
  protected readonly callbacks: EnemyCallbacks;
  protected telegraph?: Phaser.GameObjects.Graphics;
  protected statusGraphics?: Phaser.GameObjects.Graphics;
  protected readonly baseScale: number;
  private static sequence = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, callbacks: EnemyCallbacks) {
    super(scene, x, y, `enemy-${kind === 'minion' ? 'chaser' : kind}`);
    this.kind = kind;
    this.callbacks = callbacks;
    const definition = kind === 'minion' ? { hp: 34, speed: 112, damage: 10, score: 80 } : BALANCE.enemies[kind];
    this.health = definition.hp; this.maxHealth = definition.hp;
    this.id = `${kind}-${Enemy.sequence += 1}`;
    this.nextActionAt = scene.time.now + Phaser.Math.Between(700, 1300);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.baseScale = kind === 'elite' ? 1.18 : kind === 'boss' ? 1.32 : 0.92;
    this.setDepth(16).setOrigin(0.5, 0.7).setAlpha(0).setScale(this.baseScale);
    this.statusGraphics = scene.add.graphics().setDepth(15);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(kind === 'elite' ? 42 : 30, kind === 'elite' ? 48 : 35).setOffset((this.width - (kind === 'elite' ? 42 : 30)) / 2, this.height * 0.42);
    body.setCollideWorldBounds(true).setEnable(false);
  }

  public spawn(): void {
    const marker = this.scene.add.graphics().setDepth(7);
    marker.lineStyle(2, 0xc4543c, 0.8).strokeEllipse(this.x, this.y + 8, 58, 26);
    marker.lineStyle(1, 0xe5ad68, 0.55).strokeCircle(this.x, this.y + 8, 9);
    this.scene.tweens.add({ targets: marker, alpha: 0.22, scaleX: 1.2, scaleY: 1.2, duration: 560, onComplete: () => marker.destroy() });
    this.scene.time.delayedCall(560, () => {
      if (!this.active) return;
      this.spawned = true; (this.body as Phaser.Physics.Arcade.Body).setEnable(true);
      this.scene.tweens.add({ targets: this, alpha: 1, y: this.y - 8, duration: 200, ease: 'Back.Out' });
    });
  }

  public updateAI(time: number, hero: Phaser.Physics.Arcade.Sprite): void {
    if (!this.active || !this.spawned) return;
    if (this.linked && time >= this.linkedUntil) this.linked = false;
    this.updateStatusGraphics(time);
    if (time < this.frozenUntil) { this.setVelocity(0); this.setTint(0x54bbaa); return; }
    this.clearTint();
    if ((this.kind === 'elite' || this.kind === 'boss') && time < this.vulnerableUntil) this.setTint(0x91e2d3);
    if (time < this.actionLockedUntil) return;
    const distance = Phaser.Math.Distance.Between(this.x, this.y, hero.x, hero.y);
    this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.setFlipX(Math.cos(this.facingAngle) < 0);
    switch (this.kind) {
      case 'chaser': case 'minion': this.updateChaser(time, hero, distance); break;
      case 'archer': this.updateArcher(time, distance); break;
      case 'ink': this.updateInk(time, distance); break;
      case 'elite': this.updateElite(time, hero, distance); break;
      case 'boss': break;
    }
  }

  protected moveToward(angle: number, speed: number): void { this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed); }

  protected updateChaser(time: number, hero: Phaser.Physics.Arcade.Sprite, distance: number): void {
    const stats = this.kind === 'minion' ? { speed: 112, damage: 10 } : BALANCE.enemies.chaser;
    if (time >= this.nextActionAt && distance < 175) {
      this.telegraphDash(hero, stats.damage, 430, 350); this.nextActionAt = time + Phaser.Math.Between(1450, 1900); return;
    }
    if (distance > 58) this.moveToward(this.facingAngle, stats.speed); else this.setVelocity(0);
  }

  protected updateArcher(time: number, distance: number): void {
    if (time >= this.nextActionAt && distance < 500) {
      this.setVelocity(0); this.actionLockedUntil = time + 620;
      const angle = this.facingAngle; this.showAim(angle, 520, 0xd05b45);
      this.scene.time.delayedCall(500, () => this.callbacks.cue('parryWindow'));
      this.scene.time.delayedCall(540, () => { if (this.active && this.health > 0) this.callbacks.shoot(this.x, this.y - 12, angle, 250, BALANCE.enemies.archer.damage); });
      this.nextActionAt = time + Phaser.Math.Between(1500, 2100); return;
    }
    if (distance < 190) this.moveToward(this.facingAngle + Math.PI, BALANCE.enemies.archer.speed);
    else if (distance > 280) this.moveToward(this.facingAngle, BALANCE.enemies.archer.speed * 0.7);
    else this.setVelocity(Math.cos(this.facingAngle + Math.PI / 2) * 32, Math.sin(this.facingAngle + Math.PI / 2) * 32);
  }

  protected updateInk(time: number, distance: number): void {
    if (time >= this.nextActionAt && distance < 480) {
      this.setVelocity(0); this.actionLockedUntil = time + 780;
      this.telegraph = this.scene.add.graphics().setDepth(8).lineStyle(2, 0xd26c52, 0.65).strokeCircle(this.x, this.y, 44);
      this.scene.tweens.add({ targets: this.telegraph, scaleX: 1.6, scaleY: 1.6, alpha: 0, duration: 670, onComplete: () => { this.telegraph?.destroy(); this.telegraph = undefined; } });
      const count = 7;
      this.scene.time.delayedCall(650, () => { if (!this.active || this.health <= 0) return; for (let index = 0; index < count; index += 1) this.callbacks.shoot(this.x, this.y, this.facingAngle - 0.75 + index * 1.5 / (count - 1), 170, BALANCE.enemies.ink.damage, 'projectile-ink'); });
      this.nextActionAt = time + Phaser.Math.Between(2100, 2600); return;
    }
    if (distance > 260) this.moveToward(this.facingAngle, BALANCE.enemies.ink.speed); else this.setVelocity(0);
  }

  protected updateElite(time: number, hero: Phaser.Physics.Arcade.Sprite, distance: number): void {
    if (time >= this.nextActionAt && distance < 220) {
      this.telegraphDash(hero, BALANCE.enemies.elite.damage, 650, 300);
      this.nextActionAt = time + Phaser.Math.Between(1800, 2300); return;
    }
    if (distance > 76) this.moveToward(this.facingAngle, BALANCE.enemies.elite.speed); else this.setVelocity(0);
  }

  protected telegraphDash(hero: Phaser.Physics.Arcade.Sprite, damage: number, warningMs: number, speed: number): void {
    this.setVelocity(0); this.actionLockedUntil = this.scene.time.now + warningMs + 310;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, hero.x, hero.y);
    this.showAim(angle, warningMs, 0xd56343, 185);
    this.scene.tweens.add({ targets: this, scaleX: this.baseScale * 1.08, scaleY: this.baseScale * 0.82, rotation: Math.cos(angle) < 0 ? -0.06 : 0.06, duration: warningMs * 0.72, yoyo: true });
    this.scene.time.delayedCall(warningMs, () => {
      if (!this.active || this.health <= 0) return;
      this.callbacks.cue('parryWindow'); this.setScale(this.baseScale).setRotation(0);
      this.attackActiveUntil = this.scene.time.now + 300;
      this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.scene.time.delayedCall(280, () => { if (this.active) { this.setVelocity(0); this.attackActiveUntil = 0; } });
    });
    this.setData('meleeDamage', damage);
  }

  protected showAim(angle: number, duration: number, color: number, length = 540): void {
    this.telegraph?.destroy();
    this.telegraph = this.scene.add.graphics().setDepth(8);
    this.callbacks.cue('warning');
    this.telegraph.lineStyle(7, 0x5b1715, 0.22).lineBetween(this.x, this.y, this.x + Math.cos(angle) * length, this.y + Math.sin(angle) * length);
    this.telegraph.lineStyle(2, color, 0.88).lineBetween(this.x, this.y, this.x + Math.cos(angle) * length, this.y + Math.sin(angle) * length);
    this.telegraph.fillStyle(0xe7844e, 0.68).fillTriangle(this.x + Math.cos(angle) * 28, this.y + Math.sin(angle) * 28, this.x + Math.cos(angle + 0.18) * 46, this.y + Math.sin(angle + 0.18) * 46, this.x + Math.cos(angle - 0.18) * 46, this.y + Math.sin(angle - 0.18) * 46);
    this.scene.tweens.add({ targets: this.telegraph, alpha: 0.15, duration, onComplete: () => { this.telegraph?.destroy(); this.telegraph = undefined; } });
  }

  public freeze(until: number, bossSlow = false): void {
    this.frozenUntil = Math.max(this.frozenUntil, bossSlow ? this.scene.time.now + (until - this.scene.time.now) * 0.45 : until);
  }

  public takeDamage(amount: number, sourceAngle: number, parried = false): number {
    if (!this.active || this.health <= 0) return 0;
    let actual = amount;
    if (this.kind === 'elite') {
      const frontal = angleDelta(sourceAngle + Math.PI, this.facingAngle) < 1.05;
      if (frontal && this.scene.time.now > this.vulnerableUntil && !parried) actual *= 0.28;
      if (parried) this.vulnerableUntil = this.scene.time.now + 1800;
    }
    if (this.kind === 'boss' && this.scene.time.now < this.vulnerableUntil) actual *= BALANCE.boss.vulnerabilityMultiplier;
    this.health -= actual;
    this.setTintFill(0xf1e7d2);
    this.scene.time.delayedCall(70, () => { if (this.active) this.clearTint(); });
    if (this.health <= 0) this.die();
    return actual;
  }

  protected die(): void {
    if (!this.active) return;
    this.callbacks.died(this);
    (this.body as Phaser.Physics.Arcade.Body).setEnable(false);
    this.scene.tweens.add({ targets: this, alpha: 0, scaleX: this.scaleX * 1.35, scaleY: this.scaleY * 0.45, tint: 0x4fc0ad, duration: 190, onComplete: () => this.destroy() });
  }

  private updateStatusGraphics(time: number): void {
    const graphics = this.statusGraphics; if (!graphics) return; graphics.clear();
    if (this.kind !== 'elite' && this.kind !== 'boss') return;
    const vulnerable = time < this.vulnerableUntil;
    const radius = this.kind === 'boss' ? 45 : 30;
    const color = vulnerable ? 0x76d8c7 : this.kind === 'boss' ? 0xa85b4d : 0x8b7965;
    graphics.lineStyle(vulnerable ? 3 : 5, color, vulnerable ? 0.82 : 0.45);
    graphics.beginPath(); graphics.arc(this.x, this.y - 14, radius, this.facingAngle - 0.72, this.facingAngle + 0.72); graphics.strokePath();
    if (vulnerable) graphics.strokeCircle(this.x, this.y - 14, radius + 5 + Math.sin(time / 90) * 2);
  }

  public override destroy(fromScene?: boolean): void { this.telegraph?.destroy(); this.statusGraphics?.destroy(); super.destroy(fromScene); }
}
