import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export function createArchiveArena(scene: Phaser.Scene, dim = false): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0).setDepth(0);
  const graphics = scene.add.graphics();
  graphics.fillStyle(dim ? 0x081012 : 0x101a1c).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  graphics.fillStyle(0x172224).fillRoundedRect(12, 18, 936, 510, 18);
  graphics.lineStyle(4, 0x302d29, 0.9).strokeRoundedRect(12, 18, 936, 510, 18);
  graphics.lineStyle(1, 0x334044, 0.38);
  for (let y = 52; y < 516; y += 54) {
    const offset = Math.floor(y / 54) % 2 === 0 ? 0 : 48;
    for (let x = 56 - offset; x < 920; x += 96) {
      graphics.strokeRoundedRect(x, y, 88, 48, 6);
      if ((x + y) % 3 === 0) graphics.lineBetween(x + 12, y + 16, x + 56, y + 35);
    }
  }
  graphics.fillStyle(0x090e10, 0.72).fillRect(0, 0, 960, 20).fillRect(0, 528, 960, 12).fillRect(0, 0, 12, 540).fillRect(948, 0, 12, 540);
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

export function createInkArchiveArena(scene: Phaser.Scene, endlessAct = 0): Phaser.GameObjects.Container {
  const container = scene.add.container(0, 0).setDepth(0);
  const graphics = scene.add.graphics();
  graphics.fillStyle(endlessAct > 0 ? 0x100b18 : 0x0d0b15).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  graphics.fillStyle(0x171421).fillRoundedRect(12, 18, 936, 510, 18);
  graphics.lineStyle(4, 0x4d3555, .85).strokeRoundedRect(12, 18, 936, 510, 18);
  // Collapsed vertical shelving gives this arena a different silhouette from
  // the brick-like inheritance room while preserving a quiet combat center.
  for (let side = 0; side < 2; side += 1) for (let index = 0; index < 7; index += 1) {
    const x = side === 0 ? 24 + index * 18 : 918 - index * 18;
    const top = 45 + (index % 3) * 19;
    graphics.fillStyle(index % 2 ? 0x29202f : 0x211b2b, .92).fillRect(x, top, 12, 438 - index * 12);
    graphics.lineStyle(1, 0x6a476f, .3).lineBetween(x + 3, top + 14, x + 9, 450 - index * 7);
  }
  graphics.fillStyle(0x291a34, .34);
  for (let index = 0; index < 10; index += 1) {
    const x = 145 + (index * 137) % 690; const y = 82 + (index * 89) % 355;
    graphics.fillEllipse(x, y, 45 + index % 4 * 14, 14 + index % 3 * 5);
  }
  graphics.lineStyle(2, 0x76527d, .24);
  for (let index = 0; index < 9; index += 1) {
    const x = 120 + index * 88;
    graphics.lineBetween(x, 38, x + (index % 2 ? 34 : -22), 122 + index % 3 * 28);
    graphics.lineBetween(x + 12, 420 - index % 2 * 35, x - 15, 515);
  }
  container.add(graphics);

  const glyphs = ['刪', '校', '綴', '裂', '墨', '稿'];
  glyphs.forEach((glyph, index) => container.add(scene.add.text(160 + index * 126, index % 2 ? 435 : 82, glyph, {
    fontFamily: 'serif', fontSize: `${22 + (index % 2) * 5}px`, color: '#8e6a98',
  }).setAlpha(.22).setRotation(index % 2 ? -.12 : .09)));
  for (let index = 0; index < 24; index += 1) {
    const x = 70 + (index * 157) % 835; const y = 66 + (index * 113) % 420;
    const paper = scene.add.rectangle(x, y, 8 + index % 4 * 6, 24 + index % 3 * 8, 0xd3c4c1, .08)
      .setRotation((index % 7 - 3) * .2);
    container.add(paper);
  }
  if (endlessAct > 0) {
    const seal = scene.add.text(480, 270, `ACT ${endlessAct}`, { fontFamily: 'Georgia, serif', fontSize: '58px', color: '#76527d' })
      .setOrigin(.5).setAlpha(.08).setRotation(-.08);
    container.add(seal);
  }
  const vignette = scene.add.graphics();
  for (let index = 0; index < 8; index += 1) vignette.lineStyle(24, 0x030206, .04 + index * .012).strokeRoundedRect(12 + index * 8, 12 + index * 6, 936 - index * 16, 516 - index * 12, 30);
  container.add(vignette);
  return container;
}
