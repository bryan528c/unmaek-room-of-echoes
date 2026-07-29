import Phaser from 'phaser';
import { createCroppedTextures, createHeroFallback } from '../utils/assetCrop';

export class BootScene extends Phaser.Scene {
  private heroLoadFailed = false;

  public constructor() { super('BootScene'); }

  public preload(): void {
    this.load.image('hero-concept', './assets/hero-concept.png');
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => { this.heroLoadFailed = true; });
  }

  public create(): void {
    const cropped = !this.heroLoadFailed && createCroppedTextures(this, 'hero-concept');
    if (!cropped) createHeroFallback(this);
    this.createEnemyTextures();
    this.scene.start('MenuScene');
  }

  private createEnemyTextures(): void {
    this.makeChaser(); this.makeArcher(); this.makeInk(); this.makeElite(); this.makeBoss(); this.makeProjectiles();
  }

  private makeChaser(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x080b0c).fillTriangle(8, 64, 28, 16, 52, 64).fillCircle(29, 17, 13);
    g.fillStyle(0x352e2b).fillTriangle(16, 11, 23, 0, 27, 14).fillTriangle(34, 11, 42, 2, 38, 16);
    g.fillStyle(0xcf533d).fillRect(21, 17, 6, 3).fillRect(33, 17, 6, 3);
    g.lineStyle(4, 0x9b876b).lineBetween(31, 38, 52, 27); g.lineStyle(2, 0x522e26).strokeCircle(29, 46, 14);
    g.generateTexture('enemy-chaser', 60, 70); g.destroy();
  }

  private makeArcher(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x121315).fillTriangle(10, 64, 29, 13, 48, 64).fillCircle(29, 16, 12);
    g.fillStyle(0x4c3e31).fillRect(17, 31, 24, 22); g.fillStyle(0xe18d52).fillRect(22, 16, 5, 3).fillRect(33, 16, 5, 3);
    g.lineStyle(3, 0x9d7b4d).strokeEllipse(48, 37, 17, 44).lineBetween(48, 15, 48, 59).lineBetween(18, 36, 53, 36);
    g.generateTexture('enemy-archer', 62, 70); g.destroy();
  }

  private makeInk(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x121014).fillCircle(30, 24, 19).fillTriangle(9, 64, 14, 27, 52, 27).fillCircle(15, 55, 7).fillCircle(28, 62, 6).fillCircle(44, 54, 8);
    g.fillStyle(0x8856a3, 0.35).fillCircle(30, 27, 13); g.fillStyle(0xc85450).fillCircle(23, 22, 3).fillCircle(37, 22, 3);
    g.lineStyle(2, 0x6b465d, 0.7).strokeCircle(30, 28, 21);
    g.generateTexture('enemy-ink', 62, 72); g.destroy();
  }

  private makeElite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x161719).fillRoundedRect(13, 18, 51, 58, 12).fillCircle(38, 18, 19);
    g.fillStyle(0x47413b).fillRect(7, 31, 62, 16).fillRect(21, 58, 34, 21);
    g.lineStyle(3, 0x917053).lineBetween(15, 29, 61, 67).lineBetween(60, 24, 18, 69);
    g.fillStyle(0xef6b46).fillRect(26, 16, 7, 4).fillRect(44, 16, 7, 4);
    g.lineStyle(4, 0x5eb9a9, 0.55).strokeCircle(38, 50, 19);
    g.generateTexture('enemy-elite', 78, 84); g.destroy();
  }

  private makeBoss(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x090a0c).fillTriangle(6, 100, 45, 19, 90, 100).fillCircle(48, 25, 27);
    g.fillStyle(0x31282b).fillTriangle(18, 17, 27, 0, 35, 23).fillTriangle(61, 21, 76, 2, 74, 29);
    g.lineStyle(5, 0x685451).strokeEllipse(48, 59, 56, 53);
    g.fillStyle(0xee674b).fillCircle(36, 25, 5).fillCircle(60, 25, 5).fillRect(34, 50, 28, 6);
    g.fillStyle(0x5fc5b4, 0.7).fillTriangle(25, 77, 48, 91, 72, 75);
    g.generateTexture('enemy-boss', 96, 108); g.destroy();
  }

  private makeProjectiles(): void {
    const ink = this.make.graphics({ x: 0, y: 0 }); ink.fillStyle(0x9e4d57).fillCircle(8, 8, 6).fillStyle(0xefd1b4).fillCircle(6, 6, 2).generateTexture('projectile-ink', 16, 16); ink.destroy();
    const boss = this.make.graphics({ x: 0, y: 0 }); boss.fillStyle(0xd45a41).fillTriangle(0, 6, 18, 0, 18, 12).fillStyle(0xffb16a).fillCircle(13, 6, 3).generateTexture('projectile-boss', 20, 14); boss.destroy();
    const rune = this.make.graphics({ x: 0, y: 0 }); rune.fillStyle(0xa7fff0).fillRect(6, 0, 4, 16).fillRect(0, 6, 16, 4).fillStyle(0x3db9a7).fillCircle(8, 8, 4).generateTexture('projectile-rune', 16, 16); rune.destroy();
    const pixel = this.make.graphics({ x: 0, y: 0 }); pixel.fillStyle(0x73d7c4).fillRect(0, 0, 4, 4).generateTexture('rune-pixel', 4, 4); pixel.destroy();
  }
}
