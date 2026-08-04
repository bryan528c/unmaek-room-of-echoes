import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import {
  mapDisplayName,
  queryRuntimeMask,
  resolveMapDefinition,
  runtimeTextureKey,
  sourcePointToGame,
  sourceRectToGame,
  SUBMISSION_GAME_SCALE,
  type RuntimeBossTerritory,
  type RuntimeForegroundOcclusion,
  type RuntimeMapDefinition,
  type RuntimeMaskKind,
  type RuntimeMaskPixels,
  type RuntimePoint,
} from './SubmissionRuntime';

const pixelsFromTexture = (scene: Phaser.Scene, textureKey: string): RuntimeMaskPixels => {
  const source = scene.textures.get(textureKey).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error(`[SubmissionMapRuntime] Canvas context unavailable for ${textureKey}`);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
};

const containsEllipse = (point: Readonly<RuntimePoint>, bounds: Readonly<{ x: number; y: number; width: number; height: number }>): boolean => {
  const radiusX = bounds.width / 2; const radiusY = bounds.height / 2;
  const centerX = bounds.x + radiusX; const centerY = bounds.y + radiusY;
  if (radiusX <= 0 || radiusY <= 0) return false;
  const x = (point.x - centerX) / radiusX; const y = (point.y - centerY) / radiusY;
  return x * x + y * y <= 1;
};

const containsPolygon = (point: Readonly<RuntimePoint>, points: readonly (readonly [number, number])[]): boolean => {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index]; const previousPoint = points[previous];
    if (!currentPoint || !previousPoint) continue;
    const [currentX, currentY] = currentPoint; const [previousX, previousY] = previousPoint;
    const crosses = (currentY > point.y) !== (previousY > point.y)
      && point.x < (previousX - currentX) * (point.y - currentY) / Math.max(0.000001, previousY - currentY) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
};

const scaledOcclusionContains = (occlusion: RuntimeForegroundOcclusion, point: Readonly<RuntimePoint>): boolean => {
  if (occlusion.shape === 'polygon') return containsPolygon(point, occlusion.points.map(([x, y]) => [x * SUBMISSION_GAME_SCALE, y * SUBMISSION_GAME_SCALE] as const));
  if (occlusion.shape === 'circle') {
    const center = sourcePointToGame(occlusion.center); const radius = occlusion.radius * SUBMISSION_GAME_SCALE;
    const offsetX = point.x - center.x; const offsetY = point.y - center.y;
    return offsetX * offsetX + offsetY * offsetY <= radius * radius;
  }
  if (occlusion.shape === 'ellipse') return containsEllipse(point, sourceRectToGame(occlusion.bounds));
  if (occlusion.shape === 'edge-band') {
    const width = occlusion.width * SUBMISSION_GAME_SCALE;
    return point.x <= width || point.x >= GAME_WIDTH - width || point.y <= width || point.y >= GAME_HEIGHT - width;
  }
  return occlusion.bounds.some(([x, y, width, height]) => containsEllipse(point, sourceRectToGame({ x, y, width, height })));
};

const drawOcclusionMask = (graphics: Phaser.GameObjects.Graphics, occlusion: RuntimeForegroundOcclusion): void => {
  graphics.fillStyle(0xffffff, 1);
  if (occlusion.shape === 'polygon') {
    const points = occlusion.points.map(([x, y]) => new Phaser.Geom.Point(x * SUBMISSION_GAME_SCALE, y * SUBMISSION_GAME_SCALE));
    graphics.fillPoints(points, true);
  } else if (occlusion.shape === 'circle') {
    const center = sourcePointToGame(occlusion.center);
    graphics.fillCircle(center.x, center.y, occlusion.radius * SUBMISSION_GAME_SCALE);
  } else if (occlusion.shape === 'ellipse') {
    const bounds = sourceRectToGame(occlusion.bounds);
    graphics.fillEllipse(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width, bounds.height);
  } else if (occlusion.shape === 'edge-band') {
    const width = occlusion.width * SUBMISSION_GAME_SCALE;
    graphics.fillRect(0, 0, GAME_WIDTH, width).fillRect(0, GAME_HEIGHT - width, GAME_WIDTH, width)
      .fillRect(0, width, width, GAME_HEIGHT - width * 2).fillRect(GAME_WIDTH - width, width, width, GAME_HEIGHT - width * 2);
  } else {
    for (const [x, y, width, height] of occlusion.bounds) {
      const bounds = sourceRectToGame({ x, y, width, height });
      graphics.fillEllipse(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width, bounds.height);
    }
  }
};

export class SubmissionMapRuntime {
  public readonly definition: RuntimeMapDefinition;
  public readonly displayName: string;
  private readonly collisionPixels: RuntimeMaskPixels;
  private readonly hazardPixels?: RuntimeMaskPixels;
  private readonly background: Phaser.GameObjects.Image;
  private readonly foreground?: Phaser.GameObjects.Image;
  private readonly foregroundMaskGraphics?: Phaser.GameObjects.Graphics;
  private readonly foregroundMask?: Phaser.Display.Masks.GeometryMask;
  private readonly collisionDebug: Phaser.GameObjects.Image;
  private readonly hazardDebug?: Phaser.GameObjects.Image;

  public constructor(scene: Phaser.Scene, mapId: string) {
    this.definition = resolveMapDefinition(mapId);
    this.displayName = mapDisplayName(mapId);
    const backgroundKey = runtimeTextureKey(this.definition.backgroundFile);
    const collisionKey = runtimeTextureKey(this.definition.collisionMaskFile);
    this.background = scene.add.image(0, 0, backgroundKey).setOrigin(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(DEPTH.background);
    this.collisionPixels = pixelsFromTexture(scene, collisionKey);
    if (this.definition.hazardMaskFile) this.hazardPixels = pixelsFromTexture(scene, runtimeTextureKey(this.definition.hazardMaskFile));

    const occlusion = this.definition.foregroundOcclusion[0];
    if (occlusion) {
      const maskGraphics = scene.make.graphics({ x: 0, y: 0 });
      drawOcclusionMask(maskGraphics, occlusion);
      const mask = maskGraphics.createGeometryMask();
      this.foregroundMaskGraphics = maskGraphics; this.foregroundMask = mask;
      this.foreground = scene.add.image(0, 0, backgroundKey).setOrigin(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT).setDepth(DEPTH.foreground).setMask(mask);
    }

    this.collisionDebug = scene.add.image(0, 0, collisionKey).setOrigin(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setTint(0x55e6a2).setAlpha(0.2).setDepth(DEPTH.debug - 2).setVisible(false);
    if (this.definition.hazardMaskFile) {
      this.hazardDebug = scene.add.image(0, 0, runtimeTextureKey(this.definition.hazardMaskFile)).setOrigin(0).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setTint(0xff5b55).setAlpha(0.24).setDepth(DEPTH.debug - 1).setVisible(false);
    }
  }

  public get playerSpawn(): RuntimePoint { return sourcePointToGame(this.definition.playerSpawn); }
  public get enemySpawnSlots(): readonly RuntimePoint[] { return this.definition.enemySpawnSlots.map((point) => sourcePointToGame(point)); }
  public get bossSpawn(): RuntimePoint | undefined { return this.definition.bossSpawn ? sourcePointToGame(this.definition.bossSpawn) : undefined; }
  public get hasHazardMask(): boolean { return this.hazardPixels !== undefined; }

  public isWalkable(point: Readonly<RuntimePoint>): boolean { return queryRuntimeMask(this.collisionPixels, point, 'collision'); }
  public isHazard(point: Readonly<RuntimePoint>): boolean { return this.hazardPixels ? queryRuntimeMask(this.hazardPixels, point, 'hazard') : false; }
  public query(point: Readonly<RuntimePoint>, kind: RuntimeMaskKind): boolean { return kind === 'collision' ? this.isWalkable(point) : this.isHazard(point); }

  public constrainToBossTerritory(point: Readonly<RuntimePoint>): Readonly<RuntimePoint & { corrected: boolean }> {
    const territory = this.definition.bossTerritory;
    if (!territory) return { ...point, corrected: false };
    return constrainToTerritory(point, territory);
  }

  public updateForegroundOcclusion(point: Readonly<RuntimePoint>): void {
    const occlusion = this.definition.foregroundOcclusion[0];
    if (!this.foreground || !occlusion) return;
    this.foreground.setAlpha(scaledOcclusionContains(occlusion, point) ? occlusion.alphaWhenOccluding : 1);
  }

  public setDebugVisible(visible: boolean): void {
    this.collisionDebug.setVisible(visible);
    this.hazardDebug?.setVisible(visible);
  }

  public destroy(): void {
    this.background.destroy(); this.foreground?.destroy(); this.foregroundMask?.destroy(); this.foregroundMaskGraphics?.destroy();
    this.collisionDebug.destroy(); this.hazardDebug?.destroy();
  }
}

export const constrainToTerritory = (point: Readonly<RuntimePoint>, territory: RuntimeBossTerritory): Readonly<RuntimePoint & { corrected: boolean }> => {
  if (territory.shape === 'circle') {
    const center = sourcePointToGame(territory.center); const radius = territory.radius * SUBMISSION_GAME_SCALE;
    const offsetX = point.x - center.x; const offsetY = point.y - center.y; const distance = Math.hypot(offsetX, offsetY);
    if (distance <= radius || distance <= 0.0001) return { ...point, corrected: false };
    return { x: center.x + offsetX / distance * radius, y: center.y + offsetY / distance * radius, corrected: true };
  }
  const bounds = sourceRectToGame(territory.bounds);
  const radiusX = bounds.width / 2; const radiusY = bounds.height / 2; const centerX = bounds.x + radiusX; const centerY = bounds.y + radiusY;
  const normalizedX = (point.x - centerX) / radiusX; const normalizedY = (point.y - centerY) / radiusY;
  const length = Math.hypot(normalizedX, normalizedY);
  if (length <= 1 || length <= 0.0001) return { ...point, corrected: false };
  return { x: centerX + normalizedX / length * radiusX, y: centerY + normalizedY / length * radiusY, corrected: true };
};
