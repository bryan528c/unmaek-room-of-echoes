import Phaser from 'phaser';
import { DEPTH } from '../config';
import type { Enemy } from '../entities/Enemy';
import type { Projectile } from '../entities/Projectile';
import type { CreatureMotionSnapshot } from '../motion/MotionPilotRuntime';
import {
  ACT1_SHOWCASE_VFX,
  act1ShowcaseEnabledForAct,
  act1ShowcaseProjectileStyle,
  type Act1ShowcaseConfig,
  type Act1ShowcaseProjectileStyle,
  type Act1ShowcaseVisualProfile,
} from './Act1ShowcaseConfig';

interface ProjectileCompanion {
  graphics: Phaser.GameObjects.Graphics;
  style: Act1ShowcaseProjectileStyle;
  launchedAt: number;
  source: Enemy;
  start: Readonly<{ x: number; y: number }>;
  visualAnchorResolved: boolean;
  anchorOutcomeRecorded: boolean;
}

export interface ShowcaseBackgroundCue {
  image: Phaser.GameObjects.Image;
  motion: CreatureMotionSnapshot | undefined;
}

export interface Act1ShowcaseSnapshot {
  enabled: boolean;
  actActive: boolean;
  transientCount: number;
  projectileCompanionCount: number;
  liveEffectCount: number;
  emitted: Readonly<Record<string, number>>;
}

const rounded = (value: number): number => Math.round(value);

/**
 * Scene-owned, presentation-only VFX. Gameplay owners remain the source of all
 * collision, damage, velocity, range, cooldown, and hit timestamps.
 */
export class Act1ShowcaseVfx {
  private actActive = false;
  private readonly transient = new Set<Phaser.GameObjects.GameObject>();
  private readonly projectileCompanions = new Map<Projectile, ProjectileCompanion>();
  private readonly creatureSequences = new Map<string, string>();
  private readonly creatureTrailAt = new Map<string, number>();
  private readonly backgroundSequences = new WeakMap<Phaser.GameObjects.Image, string>();
  private readonly backgroundTrailAt = new WeakMap<Phaser.GameObjects.Image, number>();
  private readonly ownerBurstAt = new Map<string, number>();
  private readonly emitted = new Map<string, number>();

  public constructor(private readonly scene: Phaser.Scene, private readonly config: Readonly<Act1ShowcaseConfig>) {}

  public setAct(actIndex: number): void {
    const next = act1ShowcaseEnabledForAct(this.config, actIndex);
    if (this.actActive && !next) this.clear();
    this.actActive = next;
  }

  public get enabled(): boolean { return this.actActive; }

  public heroCut(start: Readonly<{ x: number; y: number }>, angle: number): void {
    if (!this.actActive) return;
    const profile = ACT1_SHOWCASE_VFX.heroCut;
    const length = profile.maximumExtent;
    const normalX = Math.cos(angle + Math.PI / 2); const normalY = Math.sin(angle + Math.PI / 2);
    const endX = start.x + Math.cos(angle) * length; const endY = start.y + Math.sin(angle) * length;
    const graphics = this.scene.add.graphics().setDepth(DEPTH.melee);
    graphics.lineStyle(profile.lineWidth, profile.color, profile.alpha)
      .beginPath().moveTo(rounded(start.x), rounded(start.y))
      .lineTo(rounded(endX + normalX * 5), rounded(endY + normalY * 5)).strokePath();
    graphics.lineStyle(1, profile.accent, profile.alpha * 0.72)
      .lineBetween(rounded(start.x + normalX * 2), rounded(start.y + normalY * 2), rounded(endX), rounded(endY));
    this.fadeTransient(graphics, profile.durationMs, { x: Math.cos(angle) * 4, y: Math.sin(angle) * 4 });
    this.note('hero-cut');
  }

  public parryAttempt(center: Readonly<{ x: number; y: number }>): void {
    if (!this.actActive) return;
    const profile = ACT1_SHOWCASE_VFX.parry;
    const ring = this.scene.add.ellipse(rounded(center.x), rounded(center.y), 28, 20, profile.color, 0.03)
      .setStrokeStyle(profile.lineWidth, profile.accent, profile.alpha).setDepth(DEPTH.melee);
    this.fadeTransient(ring, profile.durationMs, { scaleX: 1.28, scaleY: 1.28 });
    this.note('parry-attempt');
  }

  public parrySuccess(center: Readonly<{ x: number; y: number }>, facing: number): void {
    if (!this.actActive) return;
    const profile = ACT1_SHOWCASE_VFX.parry;
    const graphics = this.scene.add.graphics().setDepth(DEPTH.word);
    for (let index = -1; index <= 1; index += 1) {
      const angle = facing + Math.PI + index * 0.42;
      const inner = 7; const outer = profile.maximumExtent - Math.abs(index) * 5;
      graphics.lineStyle(index === 0 ? 2 : 1, index === 0 ? profile.accent : profile.color, profile.alpha)
        .lineBetween(rounded(center.x + Math.cos(angle) * inner), rounded(center.y + Math.sin(angle) * inner), rounded(center.x + Math.cos(angle) * outer), rounded(center.y + Math.sin(angle) * outer));
    }
    this.fadeTransient(graphics, 115, { x: -Math.cos(facing) * 6, y: -Math.sin(facing) * 6 });
    this.note('parry-success');
  }

  public parryFailure(center: Readonly<{ x: number; y: number }>): void {
    if (!this.actActive) return;
    const profile = ACT1_SHOWCASE_VFX.parry;
    const ring = this.scene.add.ellipse(rounded(center.x), rounded(center.y), 25, 18, profile.color, 0)
      .setStrokeStyle(1, profile.color, profile.alpha * 0.42).setDepth(DEPTH.melee);
    this.fadeTransient(ring, 120, { scaleX: 1.12, scaleY: 1.12 });
    this.note('parry-failure');
  }

  public wordStop(center: Readonly<{ x: number; y: number }>): void {
    if (!this.actActive) return;
    const profile = ACT1_SHOWCASE_VFX.stop;
    const graphics = this.scene.add.graphics().setDepth(DEPTH.word).setPosition(rounded(center.x), rounded(center.y));
    const extent = profile.maximumExtent;
    graphics.lineStyle(profile.lineWidth, profile.color, profile.alpha);
    for (const sign of [-1, 1]) {
      graphics.beginPath().moveTo(sign * extent, -13).lineTo(sign * (extent - 10), -4).lineTo(sign * extent, 5).strokePath();
      graphics.beginPath().moveTo(-13, sign * extent).lineTo(-4, sign * (extent - 10)).lineTo(5, sign * extent).strokePath();
    }
    graphics.lineStyle(1, profile.accent, profile.alpha * 0.72).lineBetween(-9, 0, 9, 0).lineBetween(0, -9, 0, 9);
    this.fadeTransient(graphics, profile.durationMs, { scaleX: 0.48, scaleY: 0.48 });
    this.note('word-stop');
  }

  public wordRewind(points: readonly Readonly<{ x: number; y: number }>[]): void {
    if (!this.actActive || points.length === 0) return;
    const profile = ACT1_SHOWCASE_VFX.rewind;
    const sampled = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / 5)) === 0).slice(0, 6);
    sampled.forEach((point, index) => {
      const graphics = this.scene.add.graphics().setDepth(DEPTH.rewind);
      const x = rounded(point.x); const y = rounded(point.y - 11); const alpha = profile.alpha * (1 - index / (sampled.length + 1));
      graphics.lineStyle(profile.lineWidth, profile.color, alpha)
        .beginPath().moveTo(x - 8, y + 8).lineTo(x, y - 12).lineTo(x + 8, y + 8).strokePath();
      graphics.lineStyle(1, profile.accent, alpha * 0.72).lineBetween(x - 6, y + 11, x + 6, y + 11);
      this.fadeTransient(graphics, profile.durationMs + index * 28, { x: -3, alpha: 0 });
    });
    this.note('word-rewind');
  }

  public wordLink(origin: Readonly<{ x: number; y: number }>, targets: ReadonlyArray<Readonly<{ x: number; y: number }>>): void {
    if (!this.actActive || targets.length === 0) return;
    const profile = ACT1_SHOWCASE_VFX.link;
    const graphics = this.scene.add.graphics().setDepth(DEPTH.word);
    targets.forEach((target, index) => {
      const offset = index % 2 === 0 ? 2 : -2;
      graphics.lineStyle(profile.lineWidth, index === 0 ? profile.accent : profile.color, profile.alpha)
        .beginPath().moveTo(rounded(origin.x), rounded(origin.y))
        .lineTo(rounded((origin.x + target.x) / 2 + offset), rounded((origin.y + target.y) / 2 - offset))
        .lineTo(rounded(target.x), rounded(target.y - 8)).strokePath();
    });
    this.fadeTransient(graphics, profile.durationMs, { alpha: 0 });
    this.note('word-link');
  }

  public attachProjectile(projectile: Projectile, source: Enemy): void {
    if (!this.actActive || this.projectileCompanions.has(projectile)) return;
    const style = act1ShowcaseProjectileStyle(source.creatureId); if (!style) return;
    while (this.projectileCompanions.size >= ACT1_SHOWCASE_VFX.maximumProjectileCompanions) {
      const oldest = this.projectileCompanions.keys().next().value as Projectile | undefined;
      if (!oldest) break; this.releaseProjectile(oldest);
    }
    const visualAnchor = source.visualAttackAnchor;
    const start = visualAnchor ?? source.attackAnchor;
    const graphics = this.scene.add.graphics().setDepth(DEPTH.projectile);
    this.drawProjectile(graphics, style);
    graphics.setPosition(rounded(start.x), rounded(start.y)).setRotation(projectile.rotation);
    projectile.setData('act1ShowcaseProjectileStyle', style).setVisible(false);
    this.projectileCompanions.set(projectile, { graphics, style, source, launchedAt: this.scene.time.now, start, visualAnchorResolved: Boolean(visualAnchor), anchorOutcomeRecorded: false });
    if (style === 'goral-stone') this.goralStomp(source);
    this.note(`projectile-${style}`);
  }

  public projectileImpact(projectile: Projectile): void {
    const companion = this.projectileCompanions.get(projectile); if (!companion) return;
    const { style } = companion; const x = rounded(projectile.x); const y = rounded(projectile.y);
    this.releaseProjectile(projectile);
    const graphics = this.scene.add.graphics().setDepth(DEPTH.projectile);
    if (style === 'bat-sonic') {
      const profile = ACT1_SHOWCASE_VFX.bat;
      graphics.lineStyle(1, profile.accent, profile.alpha).strokeEllipse(x, y, 13, 8);
      graphics.lineStyle(1, profile.color, profile.alpha * 0.66).strokeEllipse(x, y, 23, 14);
    } else if (style === 'spider-web') {
      const profile = ACT1_SHOWCASE_VFX.spider;
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4; const radius = index % 2 ? 12 : 16;
        graphics.lineStyle(1, profile.accent, profile.alpha).lineBetween(x, y, rounded(x + Math.cos(angle) * radius), rounded(y + Math.sin(angle) * radius));
      }
      graphics.lineStyle(1, profile.color, profile.alpha * 0.62).strokeCircle(x, y, 8);
    } else {
      const profile = ACT1_SHOWCASE_VFX.goral;
      graphics.fillStyle(profile.color, profile.alpha).fillTriangle(x - 4, y, x + 1, y - 7, x + 6, y + 1);
      graphics.fillStyle(profile.accent, profile.alpha * 0.7).fillRect(x - 11, y - 2, 3, 2).fillRect(x + 9, y - 4, 3, 2);
    }
    this.fadeTransient(graphics, style === 'bat-sonic' ? 150 : 180, { scaleX: 1.28, scaleY: 1.28 });
    this.note(`impact-${style}`);
  }

  public releaseProjectile(projectile: Projectile): void {
    const companion = this.projectileCompanions.get(projectile); if (!companion) return;
    companion.graphics.destroy();
    this.projectileCompanions.delete(projectile);
    if (projectile.active) projectile.setVisible(true);
    projectile.setData('act1ShowcaseProjectileStyle', undefined);
  }

  public meleeContact(enemy: Enemy): void {
    if (!this.actActive || enemy.creatureId !== 'rewind_lizard') return;
    const profile = ACT1_SHOWCASE_VFX.lizard;
    const graphics = this.scene.add.graphics().setDepth(DEPTH.melee);
    const x = rounded(enemy.x); const y = rounded(enemy.y - 6);
    for (let index = -1; index <= 1; index += 1) {
      const distance = 13 + Math.abs(index) * 4;
      graphics.lineStyle(index === 0 ? 2 : 1, index === 0 ? profile.accent : profile.color, profile.alpha)
        .lineBetween(rounded(x - Math.cos(enemy.facingAngle) * distance), rounded(y - Math.sin(enemy.facingAngle) * distance + index * 5), x, y);
    }
    this.fadeTransient(graphics, 125, { alpha: 0 });
    this.note('lizard-contact');
  }

  public update(time: number, enemies: readonly Enemy[], projectiles: readonly Projectile[], backgroundCues: readonly ShowcaseBackgroundCue[]): void {
    if (!this.actActive) return;
    for (const object of [...this.transient]) if (!object.active) this.transient.delete(object);
    for (const [projectile] of [...this.projectileCompanions]) if (!projectile.active || projectile.reflected || !projectile.enemyOwned || !projectiles.includes(projectile)) this.releaseProjectile(projectile);
    for (const [projectile, companion] of this.projectileCompanions) {
      if (!companion.visualAnchorResolved && time - companion.launchedAt <= 95) {
        const resolved = companion.source.visualAttackAnchor;
        if (resolved) { companion.start = resolved; companion.visualAnchorResolved = true; }
      }
      if (!companion.anchorOutcomeRecorded && (companion.visualAnchorResolved || time - companion.launchedAt > 95)) {
        companion.anchorOutcomeRecorded = true;
        this.note(`anchor-${companion.visualAnchorResolved ? 'per-frame' : 'canonical'}-${companion.style}`);
      }
      const t = Phaser.Math.Clamp((time - companion.launchedAt) / 75, 0, 1);
      companion.graphics.setPosition(
        rounded(Phaser.Math.Linear(companion.start.x, projectile.x, t)),
        rounded(Phaser.Math.Linear(companion.start.y, projectile.y, t)),
      ).setRotation(projectile.rotation).setAlpha(projectile.frozenUntil > time ? 0.52 : 1);
    }
    for (const enemy of enemies) this.updateCreature(time, enemy);
    for (const cue of backgroundCues) this.updateBackgroundCue(time, cue);
  }

  public clear(): void {
    for (const object of this.transient) {
      this.scene.tweens.killTweensOf(object);
      if (object.active) object.destroy();
    }
    this.transient.clear();
    for (const projectile of [...this.projectileCompanions.keys()]) this.releaseProjectile(projectile);
    this.creatureSequences.clear(); this.creatureTrailAt.clear(); this.ownerBurstAt.clear();
  }

  public destroy(): void { this.clear(); this.actActive = false; }

  public snapshot(): Act1ShowcaseSnapshot {
    return {
      enabled: this.config.enabled,
      actActive: this.actActive,
      transientCount: this.transient.size,
      projectileCompanionCount: this.projectileCompanions.size,
      liveEffectCount: this.transient.size + this.projectileCompanions.size,
      emitted: Object.fromEntries(this.emitted),
    };
  }

  private drawProjectile(graphics: Phaser.GameObjects.Graphics, style: Act1ShowcaseProjectileStyle): void {
    if (style === 'bat-sonic') {
      const profile = ACT1_SHOWCASE_VFX.bat;
      for (let index = 0; index < 3; index += 1) graphics.lineStyle(index === 0 ? 2 : 1, index === 0 ? profile.accent : profile.color, profile.alpha - index * 0.16)
        .beginPath().arc(index * 5 - 4, 0, 4 + index * 2, -0.82, 0.82).strokePath();
      return;
    }
    if (style === 'spider-web') {
      const profile = ACT1_SHOWCASE_VFX.spider;
      graphics.lineStyle(1, profile.color, profile.alpha).beginPath().moveTo(-15, -3).lineTo(-7, 1).lineTo(0, 0).strokePath();
      for (let index = 0; index < 6; index += 1) {
        const angle = index * Math.PI / 3;
        graphics.lineStyle(1, profile.accent, profile.alpha).lineBetween(0, 0, rounded(Math.cos(angle) * 7), rounded(Math.sin(angle) * 7));
      }
      graphics.lineStyle(1, profile.color, profile.alpha * 0.72).strokeCircle(0, 0, 5);
      return;
    }
    const profile = ACT1_SHOWCASE_VFX.goral;
    graphics.fillStyle(profile.color, profile.alpha).fillTriangle(-7, 3, 4, -4, 8, 3);
    graphics.lineStyle(1, profile.accent, profile.alpha * 0.82).lineBetween(-5, 1, 4, -2);
  }

  private updateCreature(time: number, enemy: Enemy): void {
    if (!enemy.active || !enemy.spawned || enemy.removing) return;
    const motion = enemy.motionSnapshot; const sequence = motion?.sequence ?? enemy.runtimeState ?? 'idle';
    const previous = this.creatureSequences.get(enemy.id);
    if (previous !== sequence) {
      this.creatureSequences.set(enemy.id, sequence);
      if (enemy.creatureId === 'deflect_bat' && sequence.includes('prep')) this.emitMouthCompression(enemy);
      if (enemy.creatureId === 'rewind_lizard' && sequence.includes('prep')) this.emitLizardPrep(enemy);
      if (enemy.creatureId === 'mineral_spider' && (sequence.includes('alert') || sequence.includes('deploy'))) this.emitSpiderPrep(enemy);
      if (enemy.creatureId === 'resonance_goral' && (sequence.includes('warning') || sequence.includes('combat_prep'))) this.goralStomp(enemy);
    }
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    const moving = Math.hypot(body.velocity.x, body.velocity.y) > 40;
    const lastTrail = this.creatureTrailAt.get(enemy.id) ?? Number.NEGATIVE_INFINITY;
    if (!moving || time - lastTrail < 72) return;
    if (enemy.creatureId === 'rewind_lizard' && sequence.includes('attack')) this.emitGroundTrail(enemy, ACT1_SHOWCASE_VFX.lizard, 'lizard-trail');
    else if (enemy.creatureId === 'resonance_goral' && sequence.includes('charge_attack')) this.emitGroundTrail(enemy, ACT1_SHOWCASE_VFX.goral, 'goral-gravel');
    else return;
    this.creatureTrailAt.set(enemy.id, time);
  }

  private updateBackgroundCue(time: number, cue: ShowcaseBackgroundCue): void {
    if (!cue.image.active) return;
    const sequence = cue.motion?.sequence ?? 'fly'; const previous = this.backgroundSequences.get(cue.image);
    const lastTrail = this.backgroundTrailAt.get(cue.image) ?? Number.NEGATIVE_INFINITY;
    if (previous !== sequence && sequence.includes('evade')) {
      const profile = ACT1_SHOWCASE_VFX.swift; const graphics = this.scene.add.graphics().setDepth(cue.image.depth - 1);
      const direction = cue.image.flipX ? -1 : 1; const x = rounded(cue.image.x); const y = rounded(cue.image.y - 4);
      graphics.lineStyle(1, profile.accent, profile.alpha).beginPath().moveTo(x - direction * 7, y - 7).lineTo(x - direction * 22, y).lineTo(x - direction * 8, y + 7).strokePath();
      this.fadeTransient(graphics, profile.durationMs, { x: -direction * 6 }); this.note('swift-evade');
    }
    if (time - lastTrail >= 235) {
      const profile = ACT1_SHOWCASE_VFX.swift; const graphics = this.scene.add.graphics().setDepth(cue.image.depth - 1);
      const direction = cue.image.flipX ? -1 : 1; const x = rounded(cue.image.x - direction * 10); const y = rounded(cue.image.y);
      graphics.lineStyle(1, profile.color, profile.alpha).lineBetween(x, y - 3, x - direction * 16, y - 3).lineBetween(x - direction * 3, y + 3, x - direction * 20, y + 3);
      this.fadeTransient(graphics, 130, { x: -direction * 4 }); this.backgroundTrailAt.set(cue.image, time); this.note('swift-fly');
    }
    this.backgroundSequences.set(cue.image, sequence);
  }

  private emitMouthCompression(enemy: Enemy): void {
    const anchor = enemy.visualAttackAnchor ?? enemy.attackAnchor;
    const profile = ACT1_SHOWCASE_VFX.bat; const graphics = this.scene.add.graphics().setDepth(DEPTH.projectile);
    const direction = enemy.visualFlipX ? -1 : 1; const x = rounded(anchor.x); const y = rounded(anchor.y);
    graphics.lineStyle(1, profile.accent, profile.alpha).beginPath().arc(x + direction * 3, y, 6, direction > 0 ? 2.35 : -0.78, direction > 0 ? 3.93 : 0.78).strokePath();
    this.fadeTransient(graphics, 165, { scaleX: 0.62, scaleY: 0.62 }); this.note('bat-prep');
  }

  private emitLizardPrep(enemy: Enemy): void {
    const echo = enemy.createPresentationAfterimage(-Math.cos(enemy.facingAngle) * 10, -Math.sin(enemy.facingAngle) * 5, 0xa98a68, 0.22);
    if (echo) this.fadeTransient(echo, ACT1_SHOWCASE_VFX.lizard.durationMs, { x: -Math.cos(enemy.facingAngle) * 7, y: -Math.sin(enemy.facingAngle) * 4 });
    this.note('lizard-prep');
  }

  private emitSpiderPrep(enemy: Enemy): void {
    const anchor = enemy.visualAttackAnchor ?? enemy.attackAnchor;
    const profile = ACT1_SHOWCASE_VFX.spider; const graphics = this.scene.add.graphics().setDepth(DEPTH.projectile);
    const x = rounded(anchor.x); const y = rounded(anchor.y);
    graphics.lineStyle(1, profile.accent, profile.alpha).lineBetween(x - 8, y + 4, x, y).lineBetween(x + 7, y + 5, x, y).lineBetween(x, y + 10, x, y);
    this.fadeTransient(graphics, profile.durationMs, { scaleX: 0.68, scaleY: 0.68 }); this.note('spider-prep');
  }

  private goralStomp(enemy: Enemy): void {
    const now = this.scene.time.now; const previous = this.ownerBurstAt.get(enemy.id) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < 120) return; this.ownerBurstAt.set(enemy.id, now);
    const profile = ACT1_SHOWCASE_VFX.goral; const graphics = this.scene.add.graphics().setDepth(DEPTH.melee);
    const x = rounded(enemy.x + (enemy.visualFlipX ? 18 : -18)); const y = rounded(enemy.y - 1);
    graphics.fillStyle(profile.color, profile.alpha).fillRect(x - 9, y, 4, 2).fillRect(x + 5, y - 2, 3, 3).fillRect(x + 11, y, 2, 2);
    graphics.lineStyle(1, profile.accent, profile.alpha * 0.64).lineBetween(x - 14, y + 2, x + 15, y + 2);
    this.fadeTransient(graphics, profile.durationMs, { y: -5 }); this.note('goral-stomp');
  }

  private emitGroundTrail(enemy: Enemy, profile: Act1ShowcaseVisualProfile, event: string): void {
    const body = enemy.body as Phaser.Physics.Arcade.Body; const length = Math.max(1, Math.hypot(body.velocity.x, body.velocity.y));
    const backX = -body.velocity.x / length; const backY = -body.velocity.y / length;
    const x = rounded(enemy.x + backX * 13); const y = rounded(enemy.y + backY * 5);
    const graphics = this.scene.add.graphics().setDepth(DEPTH.shadow + 2);
    graphics.fillStyle(profile.color, profile.alpha).fillRect(x - 3, y - 1, 4, 2).fillRect(x + 5, y, 3, 2);
    graphics.lineStyle(1, profile.accent, profile.alpha * 0.55).lineBetween(x, y + 2, rounded(x + backX * profile.maximumExtent), rounded(y + backY * 4 + 2));
    this.fadeTransient(graphics, 145, { x: backX * 5, y: backY * 2 }); this.note(event);
  }

  private fadeTransient(
    object: Phaser.GameObjects.GameObject,
    duration: number,
    change: Readonly<{ x?: number; y?: number; scaleX?: number; scaleY?: number; alpha?: number }> = {},
  ): void {
    this.trackTransient(object);
    const transform = object as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Alpha;
    this.scene.tweens.add({
      targets: object,
      x: change.x === undefined ? transform.x : transform.x + change.x,
      y: change.y === undefined ? transform.y : transform.y + change.y,
      scaleX: change.scaleX ?? transform.scaleX,
      scaleY: change.scaleY ?? transform.scaleY,
      alpha: change.alpha ?? 0,
      duration,
      ease: 'Sine.Out',
      onComplete: () => { this.transient.delete(object); if (object.active) object.destroy(); },
    });
  }

  private trackTransient(object: Phaser.GameObjects.GameObject): void {
    while (this.transient.size >= ACT1_SHOWCASE_VFX.maximumTransientEffects) {
      const oldest = this.transient.values().next().value as Phaser.GameObjects.GameObject | undefined;
      if (!oldest) break;
      this.scene.tweens.killTweensOf(oldest); this.transient.delete(oldest); if (oldest.active) oldest.destroy();
    }
    this.transient.add(object);
  }

  private note(event: string): void { this.emitted.set(event, (this.emitted.get(event) ?? 0) + 1); }
}
