import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export function createArchiveArena(scene: Phaser.Scene, dim = false): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0).setDepth(0);
  const graphics = scene.add.graphics();
  graphics.fillStyle(dim ? 0x081012 : 0x101a1c).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  graphics.fillStyle(0x172224).fillRoundedRect(28, 30, 904, 488, 18);
  graphics.lineStyle(5, 0x302d29, 0.9).strokeRoundedRect(28, 30, 904, 488, 18);
  graphics.lineStyle(1, 0x334044, 0.38);
  for (let y = 52; y < 516; y += 54) {
    const offset = Math.floor(y / 54) % 2 === 0 ? 0 : 48;
    for (let x = 56 - offset; x < 920; x += 96) {
      graphics.strokeRoundedRect(x, y, 88, 48, 6);
      if ((x + y) % 3 === 0) graphics.lineBetween(x + 12, y + 16, x + 56, y + 35);
    }
  }
  graphics.fillStyle(0x090e10, 0.82).fillRect(0, 0, 960, 34).fillRect(0, 518, 960, 22).fillRect(0, 0, 28, 540).fillRect(932, 0, 28, 540);
  graphics.fillStyle(0x28241f, 0.9);
  for (let x = 65; x < 900; x += 138) {
    graphics.fillRect(x, 3, 88, 31).fillRect(x, 508, 88, 22);
    graphics.fillStyle(0x3b3025, 0.6).fillRect(x + 8, 7, 8, 23).fillRect(x + 22, 5, 6, 27).fillRect(x + 34, 11, 10, 20).fillRect(x + 50, 6, 7, 25).fillRect(x + 64, 9, 11, 22);
    graphics.fillStyle(0x28241f, 0.9);
  }
  container.add(graphics);

  const runes = ['止', '逆', '連', '記', '聲', '脈'];
  runes.forEach((rune, index) => {
    const text = scene.add.text(115 + index * 150, index % 2 === 0 ? 90 : 450, rune, { fontFamily: 'serif', fontSize: '24px', color: '#4b938b' }).setAlpha(0.18).setRotation(index % 2 ? 0.1 : -0.08);
    container.add(text);
  });
  for (let index = 0; index < 17; index += 1) {
    const x = 75 + ((index * 173) % 820); const y = 100 + ((index * 97) % 350);
    const paper = scene.add.rectangle(x, y, 16 + index % 3 * 7, 10 + index % 2 * 8, 0xb8a88d, 0.11).setRotation((index % 5 - 2) * 0.18);
    container.add(paper);
  }
  const vignette = scene.add.graphics();
  for (let index = 0; index < 8; index += 1) vignette.lineStyle(24, 0x020606, 0.035 + index * 0.012).strokeRoundedRect(12 + index * 8, 12 + index * 6, 936 - index * 16, 516 - index * 12, 30);
  container.add(vignette);
  return container;
}
