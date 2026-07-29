import Phaser from 'phaser';

export interface CropRegion { x: number; y: number; width: number; height: number }

const BASE_WIDTH = 1122;
const BASE_HEIGHT = 1402;

export const HERO_CROPS = {
  portrait: { x: 800, y: 205, width: 222, height: 225 },
  idle: { x: 50, y: 1160, width: 130, height: 185 },
  move: { x: 205, y: 1148, width: 150, height: 200 },
  attack: { x: 338, y: 1135, width: 182, height: 210 },
  cast: { x: 520, y: 1128, width: 160, height: 217 },
} as const;

function colorDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}

export function createCroppedTextures(scene: Phaser.Scene, sourceKey: string): boolean {
  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!source || source.width <= 0 || source.height <= 0) return false;
  const sx = source.width / BASE_WIDTH;
  const sy = source.height / BASE_HEIGHT;
  try {
    for (const [name, region] of Object.entries(HERO_CROPS)) {
      const scaled: CropRegion = {
        x: Math.round(region.x * sx), y: Math.round(region.y * sy),
        width: Math.round(region.width * sx), height: Math.round(region.height * sy),
      };
      const canvas = document.createElement('canvas');
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) continue;
      context.drawImage(source, scaled.x, scaled.y, scaled.width, scaled.height, 0, 0, scaled.width, scaled.height);
      const pixels = context.getImageData(0, 0, scaled.width, scaled.height);
      const corners = [[0, 0], [scaled.width - 1, 0], [0, scaled.height - 1], [scaled.width - 1, scaled.height - 1]].map(([x, y]) => {
        const index = ((y ?? 0) * scaled.width + (x ?? 0)) * 4;
        return [pixels.data[index] ?? 244, pixels.data[index + 1] ?? 241, pixels.data[index + 2] ?? 234] as const;
      });
      for (let index = 0; index < pixels.data.length; index += 4) {
        const color = [pixels.data[index] ?? 0, pixels.data[index + 1] ?? 0, pixels.data[index + 2] ?? 0] as const;
        const distance = Math.min(...corners.map((corner) => colorDistance(color, corner)));
        const brightness = (color[0] + color[1] + color[2]) / 3;
        if (brightness > 150 && distance < 70) {
          pixels.data[index + 3] = Math.round(Phaser.Math.Clamp((distance - 18) / 48, 0, 1) * (pixels.data[index + 3] ?? 255));
        }
      }
      context.putImageData(pixels, 0, 0);
      if (scene.textures.exists(`hero-${name}`)) scene.textures.remove(`hero-${name}`);
      scene.textures.addCanvas(`hero-${name}`, canvas);
    }
    return scene.textures.exists('hero-idle');
  } catch {
    return false;
  }
}

export function createHeroFallback(scene: Phaser.Scene): void {
  const poses = ['idle', 'move', 'attack', 'cast'];
  for (const [index, pose] of poses.entries()) {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x111a1b).fillCircle(28, 18, 12);
    graphics.fillStyle(0x202a2d).fillTriangle(15, 28, 42, 27, 48 - index * 2, 72);
    graphics.fillStyle(0x45c7b5).fillRect(20, 33, 3, 27).fillRect(35, 39, 3, 18);
    graphics.lineStyle(4, 0x7c6348).strokeLineShape(new Phaser.Geom.Line(31, 51, 48 + index * 5, 42 - index * 3));
    graphics.generateTexture(`hero-${pose}`, 64, 82);
    graphics.destroy();
  }
  const portrait = scene.make.graphics({ x: 0, y: 0 });
  portrait.fillStyle(0x10191b).fillCircle(56, 51, 42);
  portrait.fillStyle(0x2a211d).fillTriangle(14, 40, 96, 14, 88, 58);
  portrait.fillStyle(0xd6b08b).fillEllipse(56, 55, 49, 43);
  portrait.fillStyle(0x151515).fillRect(35, 50, 10, 5).fillRect(67, 50, 10, 5);
  portrait.fillStyle(0x52cab8).fillCircle(41, 52, 3);
  portrait.generateTexture('hero-portrait', 112, 112);
  portrait.destroy();
}
