import Phaser from 'phaser';
import { BALANCE } from '../balance';
import { DEPTH } from '../config';
import type { Enemy } from '../entities/Enemy';
import type { Hero } from '../entities/Hero';
import type { Projectile } from '../entities/Projectile';
import { projectileCoreGeometry, ACT1_FINAL_PROJECTILE_READABILITY } from './Act1FinalConfig';
import { act1VfxPatchSequencePaths, act1VfxPatchTextureKey } from './Act1VfxArtPatchAssets';
import {
  ACT1_VFX_PATCH_PRESENTATION,
  ACT1_VFX_PATCH_SLASH_CONTACT_FRAME,
  act1VfxArtPatchEnabledForAct,
  normalizedSlashFrameDurations,
  offsetAct1VfxPatchEnemyAnchor,
  offsetAct1VfxPatchSlashAnchor,
  resolveAct1VfxArtPatchSource,
  type Act1VfxArtPatchCategory,
  type Act1VfxArtPatchSource,
  type Act1VfxPatchDirection,
} from './Act1VfxArtPatchConfig';

interface PatchLiveEffect {
  instanceId: number;
  sequenceId: string;
  image: Phaser.GameObjects.Image;
  frames: readonly string[];
  durations: readonly number[];
  frame: number;
  timer?: Phaser.Time.TimerEvent;
  owner?: Phaser.GameObjects.GameObject;
  anchor?: () => Readonly<{ x: number; y: number }> | undefined;
  startedAt: number;
  expectedCleanup: string;
}

interface PatchProjectileEffect {
  category: Exclude<Act1VfxArtPatchCategory, 'playerSlash'>;
  travelSequenceId: string;
  impactSequenceId: string;
  image: Phaser.GameObjects.Image;
  collisionCore?: Phaser.GameObjects.Graphics;
  source: Enemy;
  frame: number;
  changedAt: number;
  startedAt: number;
}

const projectileSequences = (source: Enemy): Readonly<{
  category: Exclude<Act1VfxArtPatchCategory, 'playerSlash'>;
  launch: string;
  travel: string;
  impact: string;
}> | undefined => {
  if (source.creatureId === 'deflect_bat') return { category: 'batSonic', launch: 'bat_sonic:launch', travel: 'bat_sonic:travel', impact: 'bat_sonic:impact' };
  if (source.creatureId === 'mineral_spider') return { category: 'spiderWeb', launch: 'spider_web:launch', travel: 'spider_web:travel', impact: 'spider_web:impact' };
  if (source.creatureId === 'resonance_goral') return { category: 'goralStone', launch: '', travel: 'goral_stone:travel', impact: 'goral_stone:impact' };
  return undefined;
};

const categorySequences: Readonly<Record<Act1VfxArtPatchCategory, readonly string[]>> = {
  playerSlash: [],
  batSonic: ['bat_sonic:form', 'bat_sonic:launch', 'bat_sonic:travel', 'bat_sonic:impact'],
  spiderWeb: ['spider_web:form', 'spider_web:launch', 'spider_web:travel', 'spider_web:impact'],
  goralStone: ['goral_stone:travel', 'goral_stone:impact'],
};

const directionForAngle = (angle: number): Act1VfxPatchDirection => {
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'][sector] as Act1VfxPatchDirection;
};

const sequenceScale = (sequenceId: string): number => {
  if (sequenceId.startsWith('player_slash:')) return ACT1_VFX_PATCH_PRESENTATION.playerSlash.displayScale;
  if (sequenceId.startsWith('bat_sonic:')) return ACT1_VFX_PATCH_PRESENTATION.batSonic.displayScale;
  if (sequenceId.startsWith('spider_web:')) return ACT1_VFX_PATCH_PRESENTATION.spiderWeb.displayScale;
  return ACT1_VFX_PATCH_PRESENTATION.goralStone.displayScale;
};

const sequenceFrameDuration = (sequenceId: string): number => {
  if (sequenceId.startsWith('bat_sonic:')) return ACT1_VFX_PATCH_PRESENTATION.batSonic.frameDurationMs;
  if (sequenceId.startsWith('spider_web:')) return ACT1_VFX_PATCH_PRESENTATION.spiderWeb.frameDurationMs;
  return ACT1_VFX_PATCH_PRESENTATION.goralStone.frameDurationMs;
};

const applySequencePresentation = (image: Phaser.GameObjects.Image, sequenceId: string): Phaser.GameObjects.Image => {
  image.setBlendMode(Phaser.BlendModes.NORMAL).clearTint().setAlpha(1);
  if (sequenceId.startsWith('player_slash:')) {
    return image
      .setTint(ACT1_VFX_PATCH_PRESENTATION.playerSlash.tint)
      .setAlpha(ACT1_VFX_PATCH_PRESENTATION.playerSlash.alpha);
  }
  const presentation = sequenceId.startsWith('spider_web:')
    ? ACT1_VFX_PATCH_PRESENTATION.spiderWeb
    : sequenceId.startsWith('goral_stone:')
      ? ACT1_VFX_PATCH_PRESENTATION.goralStone
      : undefined;
  if (presentation && 'saturation' in presentation) image.preFX?.addColorMatrix().saturate(presentation.saturation);
  return image;
};

const applySequenceFrameAlpha = (image: Phaser.GameObjects.Image, sequenceId: string, frame: number): void => {
  if (!sequenceId.startsWith('player_slash:')) return;
  const presentation = ACT1_VFX_PATCH_PRESENTATION.playerSlash;
  image.setAlpha(frame === 0 || frame === presentation.frameCount - 1 ? presentation.edgeAlpha : presentation.alpha);
};

export interface Act1VfxArtPatchSnapshot {
  enabled: boolean;
  sources: Readonly<Record<Act1VfxArtPatchCategory, Act1VfxArtPatchSource>>;
  liveEffectCount: number;
  projectileCompanionCount: number;
  collisionCoreCount: number;
  orphanCount: number;
  wordCore3TextureCount: 0;
  emitted: Readonly<Record<string, number>>;
}

/** Presentation-only owner for the four approved final-art patch categories. */
export class Act1VfxArtPatchRuntime {
  private actActive = false;
  private readonly live = new Set<PatchLiveEffect>();
  private readonly projectiles = new Map<Projectile, PatchProjectileEffect>();
  private readonly impactedProjectiles = new WeakSet<Projectile>();
  private readonly emitted = new Map<string, number>();
  private currentSlash?: PatchLiveEffect;
  private instanceSequence = 0;

  public constructor(private readonly scene: Phaser.Scene) {}

  public setAct(actIndex: number): void {
    const next = act1VfxArtPatchEnabledForAct(actIndex);
    if (this.actActive && !next) this.clear('ACT_TRANSITION');
    this.actActive = next;
  }

  public get enabled(): boolean { return this.actActive; }

  public beginHeroSlash(hero: Hero, angle: number, hitDelayMs: number, totalDurationMs: number): boolean {
    if (!this.actActive) return false;
    const direction = directionForAngle(angle);
    const sequenceId = `player_slash:${direction}`;
    if (this.sourceForSequence(sequenceId) !== 'PATCH_PNG') return false;
    if (this.currentSlash) this.remove(this.currentSlash, 'ACTION_RESTART');
    const contactFrame = ACT1_VFX_PATCH_SLASH_CONTACT_FRAME[direction];
    const durations = normalizedSlashFrameDurations(contactFrame, hitDelayMs, totalDurationMs);
    const live = this.play(sequenceId, () => offsetAct1VfxPatchSlashAnchor(
      hero.motionVisualAnchor('dagger_tip') ?? hero.groundPoint,
      direction,
    ), hero, durations, 'ACTION_END');
    if (!live) return false;
    this.currentSlash = live;
    return true;
  }

  public heroSlashContact(hero: Hero, angle: number): boolean {
    if (!this.actActive) return false;
    const direction = directionForAngle(angle);
    const sequenceId = `player_slash:${direction}`;
    if (this.sourceForSequence(sequenceId) !== 'PATCH_PNG') return false;
    const contactFrame = ACT1_VFX_PATCH_SLASH_CONTACT_FRAME[direction];
    if (!this.currentSlash || this.currentSlash.sequenceId !== sequenceId) {
      const remaining = ACT1_VFX_PATCH_PRESENTATION.playerSlash.totalDurationMs - BALANCE.hero.cut.hitDelay;
      const durations = normalizedSlashFrameDurations(contactFrame, 0, remaining);
      this.currentSlash = this.play(sequenceId, () => offsetAct1VfxPatchSlashAnchor(
        hero.motionVisualAnchor('dagger_tip') ?? hero.groundPoint,
        direction,
      ), hero, durations, 'ACTION_END', contactFrame);
    } else this.setFrame(this.currentSlash, contactFrame);
    return Boolean(this.currentSlash);
  }

  public endHeroSlash(reason = 'ACTION_END'): void {
    if (this.currentSlash) this.remove(this.currentSlash, reason);
    this.currentSlash = undefined;
  }

  public playEnemyForm(enemy: Enemy): boolean {
    const sequenceId = enemy.creatureId === 'deflect_bat' ? 'bat_sonic:form'
      : enemy.creatureId === 'mineral_spider' ? 'spider_web:form' : undefined;
    if (!sequenceId || this.sourceForSequence(sequenceId) !== 'PATCH_PNG') return false;
    const lockedAimAngle = enemy.facingAngle;
    const forwardOffset = enemy.creatureId === 'deflect_bat'
      ? ACT1_VFX_PATCH_PRESENTATION.batSonic.formForwardOffset
      : ACT1_VFX_PATCH_PRESENTATION.spiderWeb.formForwardOffset;
    return Boolean(this.play(sequenceId, () => offsetAct1VfxPatchEnemyAnchor(
      enemy.visualAttackAnchor ?? enemy.attackAnchor,
      lockedAimAngle,
      forwardOffset,
    ), enemy, undefined, 'PROJECTILE_SPAWN', 0, lockedAimAngle));
  }

  public attachProjectile(projectile: Projectile, source: Enemy): boolean {
    if (this.projectiles.has(projectile)) return true;
    if (!this.actActive) return false;
    const sequences = projectileSequences(source);
    if (!sequences || this.sourceForCategory(sequences.category) !== 'PATCH_PNG') return false;
    this.removeOwnerEffects(source, 'PROJECTILE_SPAWN');
    if (sequences.launch) {
      const lockedAimAngle = projectile.rotation;
      const forwardOffset = sequences.category === 'batSonic'
        ? ACT1_VFX_PATCH_PRESENTATION.batSonic.formForwardOffset
        : ACT1_VFX_PATCH_PRESENTATION.spiderWeb.formForwardOffset;
      this.play(sequences.launch, () => offsetAct1VfxPatchEnemyAnchor(
        source.visualAttackAnchor ?? source.attackAnchor,
        lockedAimAngle,
        forwardOffset,
      ), source, undefined, 'FRAME_COMPLETE', 0, lockedAimAngle);
    }
    const frames = act1VfxPatchSequencePaths(sequences.travel);
    const first = frames[0];
    if (!first) return false;
    const core = projectileCoreGeometry(projectile.collisionCircle);
    const image = applySequencePresentation(this.scene.add.image(Math.round(core.x), Math.round(core.y), act1VfxPatchTextureKey(first))
      .setOrigin(0.5)
      .setScale(sequenceScale(sequences.travel))
      .setRotation(projectile.rotation)
      .setDepth(DEPTH.projectile), sequences.travel);
    const collisionCore = ACT1_VFX_PATCH_PRESENTATION[sequences.category].showCollisionCore
      ? this.createProjectileCollisionCore(projectile, source)
      : undefined;
    projectile.setVisible(false);
    this.projectiles.set(projectile, {
      category: sequences.category,
      travelSequenceId: sequences.travel,
      impactSequenceId: sequences.impact,
      image,
      collisionCore,
      source,
      frame: 0,
      changedAt: this.scene.time.now,
      startedAt: this.scene.time.now,
    });
    this.note(sequences.travel);
    return true;
  }

  public projectileImpact(projectile: Projectile): boolean {
    if (this.impactedProjectiles.has(projectile)) return true;
    const companion = this.projectiles.get(projectile);
    if (!companion) return false;
    const position = { x: projectile.x, y: projectile.y };
    this.impactedProjectiles.add(projectile);
    this.releaseProjectile(projectile, 'PROJECTILE_IMPACT');
    this.play(companion.impactSequenceId, () => position, undefined, undefined, 'FRAME_COMPLETE');
    return true;
  }

  public releaseProjectile(projectile: Projectile, reason = 'PROJECTILE_DESTROY'): boolean {
    const companion = this.projectiles.get(projectile);
    if (!companion) return this.impactedProjectiles.has(projectile);
    companion.image.destroy();
    companion.collisionCore?.destroy();
    this.projectiles.delete(projectile);
    if (projectile.active) projectile.setVisible(true);
    this.note(`${companion.travelSequenceId}:cleanup:${reason}`);
    return true;
  }

  public removeOwnerEffects(owner: Phaser.GameObjects.GameObject, reason = 'SEQUENCE_CHANGE'): void {
    for (const item of [...this.live]) if (item.owner === owner) this.remove(item, reason);
  }

  public update(time: number, activeProjectiles: readonly Projectile[]): void {
    if (!this.actActive) return;
    for (const item of [...this.live]) {
      if (item.owner && !item.owner.active) { this.remove(item, 'OWNER_DESTROY'); continue; }
      const anchor = item.anchor?.();
      if (anchor) item.image.setPosition(Math.round(anchor.x), Math.round(anchor.y));
    }
    const active = new Set(activeProjectiles);
    for (const [projectile, companion] of [...this.projectiles]) {
      if (!projectile.active || !active.has(projectile) || !projectile.enemyOwned) {
        this.releaseProjectile(projectile, 'PROJECTILE_INACTIVE');
        continue;
      }
      const frames = act1VfxPatchSequencePaths(companion.travelSequenceId);
      const duration = sequenceFrameDuration(companion.travelSequenceId);
      if (frames.length > 0 && time - companion.changedAt >= duration) {
        companion.frame = (companion.frame + 1) % frames.length;
        companion.changedAt = time;
        const next = frames[companion.frame];
        if (next) companion.image.setTexture(act1VfxPatchTextureKey(next));
      }
      const core = projectileCoreGeometry(projectile.collisionCircle);
      companion.image.setPosition(Math.round(core.x), Math.round(core.y)).setRotation(projectile.rotation);
      companion.collisionCore?.setPosition(Math.round(core.x), Math.round(core.y)).setRotation(projectile.rotation);
    }
  }

  public clear(reason = 'ACT_OR_RUN_CLEANUP'): void {
    this.endHeroSlash(reason);
    for (const projectile of [...this.projectiles.keys()]) this.releaseProjectile(projectile, reason);
    for (const item of [...this.live]) this.remove(item, reason);
    this.live.clear();
    this.emitted.clear();
  }

  public destroy(): void { this.clear('SCENE_SHUTDOWN'); }

  public snapshot(): Act1VfxArtPatchSnapshot {
    return {
      enabled: this.actActive,
      sources: {
        playerSlash: this.sourceForCategory('playerSlash'),
        batSonic: this.sourceForCategory('batSonic'),
        spiderWeb: this.sourceForCategory('spiderWeb'),
        goralStone: this.sourceForCategory('goralStone'),
      },
      liveEffectCount: this.live.size + this.projectiles.size,
      projectileCompanionCount: this.projectiles.size,
      collisionCoreCount: [...this.projectiles.values()].filter((item) => item.collisionCore?.active).length,
      orphanCount: [...this.live].filter((item) => item.owner && !item.owner.active).length
        + [...this.projectiles.keys()].filter((projectile) => !projectile.active).length,
      wordCore3TextureCount: 0,
      emitted: Object.fromEntries(this.emitted),
    };
  }

  private sourceForCategory(category: Act1VfxArtPatchCategory): Act1VfxArtPatchSource {
    const sequenceIds = category === 'playerSlash'
      ? ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((direction) => `player_slash:${direction}`)
      : categorySequences[category];
    return resolveAct1VfxArtPatchSource(this.actActive, sequenceIds.every((sequenceId) => this.sequenceReady(sequenceId)));
  }

  private sourceForSequence(sequenceId: string): Act1VfxArtPatchSource {
    return resolveAct1VfxArtPatchSource(this.actActive, this.sequenceReady(sequenceId));
  }

  private sequenceReady(sequenceId: string): boolean {
    const frames = act1VfxPatchSequencePaths(sequenceId);
    return frames.length > 0 && frames.every((path) => this.scene.textures.exists(act1VfxPatchTextureKey(path)));
  }

  private play(
    sequenceId: string,
    anchor: () => Readonly<{ x: number; y: number }> | undefined,
    owner?: Phaser.GameObjects.GameObject,
    durations?: readonly number[],
    expectedCleanup = owner ? 'SEQUENCE_CHANGE' : 'FRAME_COMPLETE',
    initialFrame = 0,
    rotation = 0,
  ): PatchLiveEffect | undefined {
    if (!this.actActive || this.sourceForSequence(sequenceId) !== 'PATCH_PNG') return undefined;
    const frames = act1VfxPatchSequencePaths(sequenceId);
    const frameIndex = Math.max(0, Math.min(frames.length - 1, initialFrame));
    const first = frames[frameIndex];
    const position = anchor();
    if (!first || !position) return undefined;
    const image = applySequencePresentation(this.scene.add.image(Math.round(position.x), Math.round(position.y), act1VfxPatchTextureKey(first))
      .setOrigin(0.5)
      .setScale(sequenceScale(sequenceId))
      .setRotation(rotation)
      .setDepth(sequenceId.startsWith('player_slash:') ? DEPTH.melee : DEPTH.projectile), sequenceId);
    applySequenceFrameAlpha(image, sequenceId, frameIndex);
    const frameDurations = durations ?? frames.map(() => sequenceFrameDuration(sequenceId));
    const live: PatchLiveEffect = {
      instanceId: this.instanceSequence += 1,
      sequenceId,
      image,
      frames,
      durations: frameDurations,
      frame: frameIndex,
      owner,
      anchor,
      startedAt: this.scene.time.now,
      expectedCleanup,
    };
    this.live.add(live);
    this.note(sequenceId);
    this.scheduleAdvance(live);
    return live;
  }

  private scheduleAdvance(item: PatchLiveEffect): void {
    item.timer?.remove(false);
    item.timer = this.scene.time.delayedCall(item.durations[item.frame] ?? 70, () => {
      if (!item.image.active || !this.live.has(item)) return;
      const next = item.frame + 1;
      if (next >= item.frames.length) { this.remove(item, 'FRAME_COMPLETE'); return; }
      item.frame = next;
      const path = item.frames[next];
      if (path) item.image.setTexture(act1VfxPatchTextureKey(path));
      applySequenceFrameAlpha(item.image, item.sequenceId, item.frame);
      this.scheduleAdvance(item);
    });
  }

  private setFrame(item: PatchLiveEffect, frame: number): void {
    item.frame = Math.max(item.frame, Math.min(item.frames.length - 1, frame));
    const path = item.frames[item.frame];
    if (path) item.image.setTexture(act1VfxPatchTextureKey(path));
    applySequenceFrameAlpha(item.image, item.sequenceId, item.frame);
    this.scheduleAdvance(item);
  }

  private remove(item: PatchLiveEffect, reason: string): void {
    item.timer?.remove(false);
    if (item.image.active) item.image.destroy();
    this.live.delete(item);
    if (this.currentSlash === item) this.currentSlash = undefined;
    this.note(`${item.sequenceId}:cleanup:${reason}`);
  }

  private createProjectileCollisionCore(projectile: Projectile, source: Enemy): Phaser.GameObjects.Graphics {
    const core = projectileCoreGeometry(projectile.collisionCircle);
    const color = source.creatureId === 'deflect_bat' ? ACT1_FINAL_PROJECTILE_READABILITY.batColor
      : source.creatureId === 'mineral_spider' ? ACT1_FINAL_PROJECTILE_READABILITY.spiderColor
        : ACT1_FINAL_PROJECTILE_READABILITY.goralColor;
    return this.scene.add.graphics()
      .setPosition(Math.round(core.x), Math.round(core.y))
      .setDepth(DEPTH.projectile + 0.2)
      .fillStyle(ACT1_FINAL_PROJECTILE_READABILITY.outerColor, ACT1_FINAL_PROJECTILE_READABILITY.outerAlpha)
      .fillCircle(0, 0, core.radius)
      .lineStyle(1, ACT1_FINAL_PROJECTILE_READABILITY.innerColor, ACT1_FINAL_PROJECTILE_READABILITY.innerAlpha)
      .strokeCircle(0, 0, core.radius)
      .fillStyle(color, ACT1_FINAL_PROJECTILE_READABILITY.innerAlpha)
      .fillCircle(0, 0, Math.max(2, core.radius - 2));
  }

  private note(effectId: string): void { this.emitted.set(effectId, (this.emitted.get(effectId) ?? 0) + 1); }
}
