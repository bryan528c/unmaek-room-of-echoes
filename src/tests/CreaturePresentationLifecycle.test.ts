import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { CreaturePresentation } from '../game/runtime/CreaturePresentation';
import { Enemy } from '../game/entities/Enemy';

vi.mock('phaser', () => ({
  default: {
    Math: { DegToRad: (degrees: number) => degrees * Math.PI / 180 },
    Physics: { Arcade: { Sprite: class { public preUpdate(): void {} } } },
  },
}));

vi.mock('../game/config', () => ({
  DEPTH: { telegraph: 80, shadow: 100, characterBase: 200, word: 800 },
}));

class FakeImage {
  public active = true;
  public x: number;
  public y: number;
  public originX = 0.5;
  public originY = 0.5;
  public scaleX = 1;
  public scaleY = 1;
  public rotation = 0;
  public flipX = false;
  public alpha = 1;
  public visible = true;
  public depth = 0;
  public texture: { key: string };
  public frame = { realWidth: 210, realHeight: 148 };

  public constructor(x: number, y: number, textureKey: string) {
    this.x = x;
    this.y = y;
    this.texture = { key: textureKey };
  }

  public setTint(): this { return this; }
  public clearTint(): this { return this; }
  public setAlpha(alpha: number): this { this.alpha = alpha; return this; }
  public setTexture(textureKey: string): this { this.texture.key = textureKey; return this; }
  public setPosition(x: number, y: number): this { this.x = x; this.y = y; return this; }
  public setOrigin(x: number, y: number): this { this.originX = x; this.originY = y; return this; }
  public setScale(x: number, y = x): this { this.scaleX = x; this.scaleY = y; return this; }
  public setRotation(rotation: number): this { this.rotation = rotation; return this; }
  public setFlipX(flipX: boolean): this { this.flipX = flipX; return this; }
  public setVisible(visible: boolean): this { this.visible = visible; return this; }
  public setDepth(depth: number): this { this.depth = depth; return this; }
  public destroy(): void { this.active = false; }
}

const createHarness = () => {
  const companions: FakeImage[] = [];
  const scene = {
    time: { now: 100 },
    add: {
      image: (x: number, y: number, textureKey: string) => {
        const image = new FakeImage(x, y, textureKey);
        companions.push(image);
        return image;
      },
    },
  };
  const sprite = new FakeImage(120, 220, 'placeholder') as FakeImage & { scene: typeof scene };
  sprite.scene = scene;
  sprite.originY = 1;
  sprite.depth = 360;
  return { companions, sprite };
};

const submissionCreatures = [
  'pressure_swift',
  'deflect_bat',
  'rewind_lizard',
  'mineral_spider',
  'resonance_goral',
  'resonance_civet',
  'pleated_frog',
  'diffraction_pangolin',
  'flowjaw_crab',
  'pulsebarbel_catfish',
  'channel_otter_mother',
] as const;

describe('creature presentation companion lifecycle', () => {
  it('synchronizes companions from the owner render lifecycle even when AI is skipped', () => {
    const synchronize = vi.fn();
    const owner = Object.create(Enemy.prototype) as Enemy;
    Object.defineProperty(owner, 'syncPresentationCompanions', { value: synchronize });

    owner.preUpdate(420, 16);

    expect(synchronize).toHaveBeenCalledOnce();
  });

  it('keeps one outline and replaces the Act 3 boss phase overlay without accumulation', () => {
    const { companions, sprite } = createHarness();
    const presentation = new CreaturePresentation(sprite as unknown as Phaser.Physics.Arcade.Sprite, 'channel_otter_mother');

    presentation.applyBossPhase(1);
    expect(presentation.companionSnapshot()).toMatchObject({ total: 1, overlay: null });

    presentation.applyBossPhase(2);
    const phaseTwo = presentation.companionSnapshot();
    const firstOverlay = companions[1];
    expect(phaseTwo.total).toBe(2);
    expect(phaseTwo.overlay?.textureKey).toContain('channel_otter_mother_water_membrane_overlay');

    presentation.applyBossPhase(2);
    expect(companions).toHaveLength(2);
    expect(presentation.companionSnapshot().total).toBe(2);

    presentation.applyBossPhase(3);
    expect(firstOverlay?.active).toBe(false);
    expect(presentation.companionSnapshot()).toMatchObject({ total: 1, overlay: null });

    presentation.applyBossPhase(2);
    expect(companions).toHaveLength(3);
    expect(companions.filter((image) => image.active)).toHaveLength(2);
  });

  it('synchronizes outline and overlay transforms with the owner through movement, flip, and retreat', () => {
    const { sprite } = createHarness();
    const presentation = new CreaturePresentation(sprite as unknown as Phaser.Physics.Arcade.Sprite, 'channel_otter_mother');
    presentation.applyBossPhase(2);

    sprite.setPosition(472, 318).setScale(1.51, 1.43).setRotation(0.08).setAlpha(0.78).setDepth(478);
    presentation.setFacingFlipX(true);
    presentation.updateLayout();

    const moving = presentation.companionSnapshot();
    expect(moving.outline).toMatchObject({ x: 472, y: 318, rotation: 0.08, flipX: true, alpha: 0.78 * 0.52, depth: 477.9 });
    expect(moving.overlay).toMatchObject({ x: 472, y: 318, scaleX: 1.51, scaleY: 1.43, rotation: 0.08, flipX: true, alpha: 0.78, depth: 479 });

    const firstContact = presentation.shadowAnchor({ x: 472, y: 318 });
    const movedContact = presentation.shadowAnchor({ x: 612, y: 344 });
    expect(movedContact.x - firstContact.x).toBeCloseTo(140);
    expect(movedContact.y - firstContact.y).toBeCloseTo(26);

    presentation.applyBossPhase('defeated/nonlethal');
    sprite.setPosition(-140, 344).setAlpha(0.3);
    presentation.updateLayout();
    expect(presentation.companionSnapshot()).toMatchObject({
      total: 1,
      overlay: null,
      outline: { x: -140, y: 344, alpha: 0.156 },
    });

    presentation.destroy();
    expect(presentation.companionSnapshot()).toEqual({ outline: null, overlay: null, total: 0 });
  });

  it('never duplicates companions across every submission creature state and destroys all owned visuals', () => {
    for (const creatureId of submissionCreatures) {
      const { companions, sprite } = createHarness();
      const presentation = new CreaturePresentation(sprite as unknown as Phaser.Physics.Arcade.Sprite, creatureId);
      for (const stateId of [...Object.keys(presentation.metadata.states), ...Object.keys(presentation.metadata.stateAliases)]) {
        presentation.applyState(stateId);
        presentation.setFacingFlipX(true);
        presentation.updateLayout();
        const snapshot = presentation.companionSnapshot();
        expect(snapshot.total, `${creatureId}:${stateId}`).toBeLessThanOrEqual(2);
        expect(companions.filter((image) => image.active).length, `${creatureId}:${stateId}`).toBe(snapshot.total);
      }
      presentation.destroy();
      expect(companions.filter((image) => image.active), creatureId).toHaveLength(0);
    }
  });
});
