import Phaser from 'phaser';
import { getServices } from '../services';
import { createArchiveArena } from '../utils/arena';

export class MenuScene extends Phaser.Scene {
  public constructor() { super('MenuScene'); }

  public create(): void {
    createArchiveArena(this, true);
    const motes = this.add.particles(0, 0, 'rune-pixel', {
      x: { min: 80, max: 880 }, y: { min: 90, max: 480 }, lifespan: 5000,
      speedY: { min: -7, max: -2 }, speedX: { min: -2, max: 2 }, alpha: { start: 0.1, end: 0 }, frequency: 340, quantity: 1,
    }).setDepth(2);
    const services = getServices();
    services.ui.showMenu(() => { motes.destroy(); this.scene.start('GameScene'); });
  }
}
