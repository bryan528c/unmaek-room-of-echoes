import Phaser from 'phaser';
import { BALANCE } from '../balance';
import { DEPTH } from '../config';
import type { Circle } from '../systems/CombatGeometry';

export class Projectile extends Phaser.Physics.Arcade.Image {
  private static sequence = 0;
  public readonly attackId: string;
  public readonly parryable: boolean;
  public enemyOwned = true;
  public reflected = false;
  public frozenUntil = 0;
  public damage = 12;
  public readonly originalDamage: number;
  public readonly sourceId?: string;
  private expiresAt: number;
  private previousX: number;
  private previousY: number;

  public constructor(scene: Phaser.Scene, x: number, y: number, angle: number, speed: number, damage: number, texture = 'projectile-ink', sourceId?: string, parryable = true) {
    super(scene, x, y, texture);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setDepth(DEPTH.projectile).setRotation(angle).setScale(0.9);
    this.damage = damage; this.originalDamage = damage; this.sourceId = sourceId; this.parryable = parryable;
    this.attackId = `${sourceId ?? 'projectile'}:${Projectile.sequence += 1}`;
    this.previousX = x; this.previousY = y;
    this.expiresAt = scene.time.now + 5500;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    const body = this.body as Phaser.Physics.Arcade.Body; body.setCircle(BALANCE.collision.projectileRadius, Math.max(0, this.width - BALANCE.collision.projectileRadius * 2), Math.max(0, (this.height - BALANCE.collision.projectileRadius * 2) / 2));
  }

  public override update(time: number): void {
    if (time >= this.expiresAt || this.x < -50 || this.x > 1010 || this.y < -50 || this.y > 590) { this.destroy(); return; }
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (time < this.frozenUntil) { body.moves = false; this.setTint(0x63d6c2).setAlpha(0.78); }
    else if (!body.moves) { body.moves = true; this.clearTint().setAlpha(1); }
  }

  public freeze(until: number): void { this.frozenUntil = Math.max(this.frozenUntil, until); }

  public get previousPosition(): Readonly<{ x: number; y: number }> { return { x: this.previousX, y: this.previousY }; }
  public get collisionCircle(): Circle { return { x: this.x, y: this.y, radius: BALANCE.collision.projectileRadius }; }
  public commitPosition(): void { this.previousX = this.x; this.previousY = this.y; }

  public reflect(targetX: number, targetY: number, damage = 30, backflow = false): void {
    this.enemyOwned = false; this.reflected = true; this.frozenUntil = 0;
    const body = this.body as Phaser.Physics.Arcade.Body; body.moves = true;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    this.previousX = this.x; this.previousY = this.y;
    this.setVelocity(Math.cos(angle) * 390, Math.sin(angle) * 390).setRotation(angle).setTexture('projectile-rune').setTint(backflow ? 0x64c8ec : 0xb0fff0).setAlpha(1);
    this.damage = damage; this.setData('chainBackflow', backflow);
  }
}
