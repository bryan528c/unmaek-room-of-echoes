import Phaser from 'phaser';

export class Projectile extends Phaser.Physics.Arcade.Image {
  public enemyOwned = true;
  public reflected = false;
  public frozenUntil = 0;
  public damage = 12;
  private expiresAt: number;

  public constructor(scene: Phaser.Scene, x: number, y: number, angle: number, speed: number, damage: number, texture = 'projectile-ink') {
    super(scene, x, y, texture);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setDepth(14).setRotation(angle).setScale(0.9);
    this.damage = damage;
    this.expiresAt = scene.time.now + 5500;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    const body = this.body as Phaser.Physics.Arcade.Body; body.setCircle(5, Math.max(0, this.width - 12), Math.max(0, (this.height - 10) / 2));
  }

  public override update(time: number): void {
    if (time >= this.expiresAt || this.x < -50 || this.x > 1010 || this.y < -50 || this.y > 590) { this.destroy(); return; }
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (time < this.frozenUntil) { body.moves = false; this.setTint(0x63d6c2).setAlpha(0.78); }
    else if (!body.moves) { body.moves = true; this.clearTint().setAlpha(1); }
  }

  public freeze(until: number): void { this.frozenUntil = Math.max(this.frozenUntil, until); }

  public reflect(targetX: number, targetY: number): void {
    this.enemyOwned = false; this.reflected = true; this.frozenUntil = 0;
    const body = this.body as Phaser.Physics.Arcade.Body; body.moves = true;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
    this.setVelocity(Math.cos(angle) * 390, Math.sin(angle) * 390).setRotation(angle).setTexture('projectile-rune').setTint(0xb0fff0).setAlpha(1);
    this.damage = 30;
  }
}
