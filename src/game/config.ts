import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { SUBMISSION_FOREGROUND_DEPTH } from './runtime/SubmissionRuntime';

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const DEPTH = {
  background: 0,
  floor: 20,
  telegraph: 80,
  shadow: 100,
  target: 170,
  characterBase: 200,
  rewind: 190,
  // Submission occlusion keeps depth cues without hiding combatants or their
  // Telegraphs. The map image/mask stays unchanged; only its presentation
  // layer is constrained below combat-readable layers.
  foreground: SUBMISSION_FOREGROUND_DEPTH,
  melee: 760,
  projectile: 780,
  word: 800,
  combatText: 840,
  screenEffect: 900,
  debug: 950,
} as const;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#081113',
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  render: { antialias: false, antialiasGL: false, powerPreference: 'high-performance' },
  scene: [BootScene, MenuScene, GameScene],
};
