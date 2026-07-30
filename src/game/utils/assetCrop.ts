import Phaser from 'phaser';

export interface CropRegion { x: number; y: number; width: number; height: number }

const BASE_WIDTH = 1122;
const BASE_HEIGHT = 1402;
export const HERO_POSE_WIDTH = 196;
export const HERO_POSE_HEIGHT = 224;
const HERO_VISIBLE_HEIGHT = 204;
const GAMEPLAY_POSES = new Set(['idle', 'move', 'attack', 'cast']);

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

function removePaperBackground(context: CanvasRenderingContext2D, width: number, height: number): ImageData {
  const pixels = context.getImageData(0, 0, width, height);
  const samplePoints: Array<[number, number]> = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
    [Math.floor(width / 2), 0], [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)], [width - 1, Math.floor(height / 2)],
  ];
  const samples = samplePoints.map(([x, y]) => {
    const index = (y * width + x) * 4;
    return [pixels.data[index] ?? 244, pixels.data[index + 1] ?? 241, pixels.data[index + 2] ?? 234] as const;
  });
  for (let index = 0; index < pixels.data.length; index += 4) {
    const color = [pixels.data[index] ?? 0, pixels.data[index + 1] ?? 0, pixels.data[index + 2] ?? 0] as const;
    const distance = Math.min(...samples.map((sample) => colorDistance(color, sample)));
    const brightness = (color[0] + color[1] + color[2]) / 3;
    const chroma = Math.max(...color) - Math.min(...color);
    const paperLikelihood = brightness > 142 && distance < 88;
    const neutralHighlight = brightness > 205 && chroma < 26;
    if (paperLikelihood || neutralHighlight) {
      const feather = paperLikelihood ? Phaser.Math.Clamp((distance - 12) / 58, 0, 1) : Phaser.Math.Clamp((chroma - 5) / 21, 0, 1);
      pixels.data[index + 3] = Math.round(feather * (pixels.data[index + 3] ?? 255));
    }
  }
  context.putImageData(pixels, 0, 0);
  return pixels;
}

function alphaBounds(pixels: ImageData): CropRegion | undefined {
  let minX = pixels.width; let minY = pixels.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < pixels.height; y += 1) {
    for (let x = 0; x < pixels.width; x += 1) {
      if ((pixels.data[(y * pixels.width + x) * 4 + 3] ?? 0) < 18) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return maxX < minX || maxY < minY ? undefined : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function createCroppedTextures(scene: Phaser.Scene, sourceKey: string): boolean {
  if (['portrait', ...GAMEPLAY_POSES].every((name) => scene.textures.exists(`hero-${name}`))) return true;
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
      context.imageSmoothingEnabled = false;
      context.drawImage(source, scaled.x, scaled.y, scaled.width, scaled.height, 0, 0, scaled.width, scaled.height);
      const pixels = removePaperBackground(context, scaled.width, scaled.height);
      let output = canvas;
      if (GAMEPLAY_POSES.has(name)) {
        const bounds = alphaBounds(pixels);
        if (!bounds) continue;
        output = document.createElement('canvas');
        output.width = HERO_POSE_WIDTH; output.height = HERO_POSE_HEIGHT;
        const outputContext = output.getContext('2d');
        if (!outputContext) continue;
        outputContext.imageSmoothingEnabled = false;
        const scale = Math.min((HERO_POSE_WIDTH - 12) / bounds.width, HERO_VISIBLE_HEIGHT / bounds.height);
        const drawWidth = Math.round(bounds.width * scale); const drawHeight = Math.round(bounds.height * scale);
        const drawX = Math.round((HERO_POSE_WIDTH - drawWidth) / 2); const drawY = HERO_POSE_HEIGHT - drawHeight;
        outputContext.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, drawX, drawY, drawWidth, drawHeight);
      }
      if (scene.textures.exists(`hero-${name}`)) scene.textures.remove(`hero-${name}`);
      scene.textures.addCanvas(`hero-${name}`, output);
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
    graphics.generateTexture(`hero-fallback-${pose}`, 64, 82);
    graphics.destroy();
    const source = scene.textures.get(`hero-fallback-${pose}`).getSourceImage() as HTMLCanvasElement;
    const canvas = document.createElement('canvas'); canvas.width = HERO_POSE_WIDTH; canvas.height = HERO_POSE_HEIGHT;
    const context = canvas.getContext('2d');
    if (context) { context.imageSmoothingEnabled = false; context.drawImage(source, 0, 0, 64, 82, 16, HERO_POSE_HEIGHT - HERO_VISIBLE_HEIGHT, 159, HERO_VISIBLE_HEIGHT); }
    scene.textures.addCanvas(`hero-${pose}`, canvas);
    scene.textures.remove(`hero-fallback-${pose}`);
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
