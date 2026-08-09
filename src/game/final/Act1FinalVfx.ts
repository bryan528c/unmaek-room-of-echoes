import Phaser from 'phaser';
import { BALANCE } from '../balance';
import { DEPTH } from '../config';
import type { Enemy } from '../entities/Enemy';
import type { Hero } from '../entities/Hero';
import type { Projectile } from '../entities/Projectile';
import { Act1ShowcaseVfx, type ShowcaseBackgroundCue } from '../showcase/Act1ShowcaseVfx';
import { ACT1_FINAL_CACHE_KEYS, act1FinalTextureKey } from './Act1FinalAssets';
import { Act1VfxArtPatchRuntime, type Act1VfxArtPatchSnapshot } from './Act1VfxArtPatchRuntime';
import {
  ACT1_FINAL_IMPACT_TTL_MS,
  ACT1_FINAL_PROJECTILE_READABILITY,
  act1FinalEnabledForAct,
  projectileCoreGeometry,
  projectileCorridorLines,
  resolveAct1FinalPresentationSource,
  type Act1FinalVfxSource,
} from './Act1FinalConfig';

interface FinalVfxEffect {
  effectId: string;
  sourceAnchor: string;
  frameFiles: readonly string[];
  frameDurationMsCandidates: readonly number[];
  canvas: Readonly<{ width: number; height: number }>;
  nativeDisplayScale: number;
  offset: Readonly<{ x: number; y: number }>;
  blendMode: string;
  loop: boolean;
}
interface FinalVfxManifest { effects: readonly FinalVfxEffect[] }

interface LiveEffect {
  instanceId: number;
  image: Phaser.GameObjects.Image;
  timer: Phaser.Time.TimerEvent;
  effect: FinalVfxEffect;
  frame: number;
  owner?: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  ownerOffset?: Readonly<{ x: number; y: number }>;
  startedAt: number;
  expiresAt?: number;
  expectedCleanup: 'TTL' | 'PROJECTILE_SPAWN' | 'SEQUENCE_CHANGE' | 'OWNER_DESTROY';
}
interface ProjectileEffect {
  effectId: string;
  image: Phaser.GameObjects.Image;
  collisionCore: Phaser.GameObjects.Graphics;
  source: Enemy;
  frame: number;
  startedAt: number;
  changedAt: number;
}

interface TelegraphCue {
  graphics: Phaser.GameObjects.Graphics;
  timer: Phaser.Time.TimerEvent;
}

interface EventSourceRecord {
  source: Act1FinalVfxSource;
  effectIds: readonly string[];
}

interface CleanupRecord {
  effectId: string;
  ownerId?: string;
  reason: string;
  at: number;
}

const MAX_FINAL_PROJECTILE_COMPANIONS = 28;

export interface Act1FinalVfxSnapshot {
  enabled: boolean;
  actActive: boolean;
  source: 'FINAL_PNG';
  recordCount: number;
  boundCount: number;
  unresolvedCount: number;
  liveEffectCount: number;
  projectileCompanionCount: number;
  collisionCoreCount: number;
  telegraphCorridorCount: number;
  orphanCount: number;
  oldestAgeMs: number;
  effectCounts: Readonly<Record<string, number>>;
  instances: readonly Readonly<{
    instanceId: string;
    effectId: string;
    ownerId?: string;
    projectileId?: string;
    createdAt: number;
    expectedCleanup: string;
    gameplayOwnerActive: boolean;
    age: number;
    pooled: false;
  }>[];
  emitted: Readonly<Record<string, number>>;
  eventSources: Readonly<Record<string, Readonly<{ source: Act1FinalVfxSource; liveInstances: number }>>>;
  recentCleanup: readonly CleanupRecord[];
  artPatch: Act1VfxArtPatchSnapshot;
}

const angleDirection = (angle: number): string => {
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'][sector] ?? 'e';
};

/** PNG-only ACT 1 presentation. Gameplay owners remain authoritative. */
export class Act1FinalVfx {
  private actActive = false;
  private readonly effects = new Map<string, FinalVfxEffect>();
  private readonly live = new Set<LiveEffect>();
  private readonly projectiles = new Map<Projectile, ProjectileEffect>();
  private readonly telegraphCorridors = new Map<Enemy, TelegraphCue>();
  private readonly sequenceByOwner = new Map<string, string>();
  private readonly phaseByOwner = new Map<string, number | undefined>();
  private readonly cueSequence = new WeakMap<Phaser.GameObjects.Image, string>();
  private readonly emitted = new Map<string, number>();
  private readonly eventSources = new Map<string, EventSourceRecord>();
  private readonly cleanupHistory: CleanupRecord[] = [];
  private readonly fallback: Act1ShowcaseVfx;
  private readonly artPatch: Act1VfxArtPatchRuntime;
  private instanceSequence = 0;

  public constructor(private readonly scene: Phaser.Scene) {
    const manifest = scene.cache.json.get(ACT1_FINAL_CACHE_KEYS.vfxManifest) as FinalVfxManifest | undefined;
    if (!manifest) throw new Error('[Act1FinalVfx] final VFX manifest was not preloaded');
    for (const effect of manifest.effects) this.effects.set(effect.effectId, effect);
    this.fallback = new Act1ShowcaseVfx(scene, { enabled: true, source: 'URL_QUERY' });
    this.artPatch = new Act1VfxArtPatchRuntime(scene);
  }

  public setAct(actIndex: number): void {
    const next = act1FinalEnabledForAct(actIndex);
    if (this.actActive && !next) this.clear();
    this.actActive = next;
    this.fallback.setAct(next ? 1 : 2);
    this.artPatch.setAct(actIndex);
  }

  public get enabled(): boolean { return this.actActive; }

  public beginHeroCut(hero: Hero, angle: number, hitDelayMs: number, totalDurationMs: number): void {
    this.artPatch.beginHeroSlash(hero, angle, hitDelayMs, totalDurationMs);
  }

  public endHeroCut(reason = 'ACTION_END'): void { this.artPatch.endHeroSlash(reason); }

  public heroCut(start: Readonly<{ x: number; y: number }>, angle: number, hero?: Hero): void {
    if (hero && this.artPatch.heroSlashContact(hero, angle)) return;
    const effectId = `player_basic_attack_cut_${angleDirection(angle)}`;
    if (this.selectSource('player:cut', [effectId]) === 'FINAL_PNG') this.play(effectId, start);
    else this.fallback.heroCut(start, angle);
  }

  public parryAttempt(center: Readonly<{ x: number; y: number }>): void {
    const effects = ['player_parry_attempt', 'player_parry_active'] as const;
    if (this.selectSource('player:parry-attempt', effects) === 'FINAL_PNG') {
      for (const effectId of effects) this.play(effectId, center);
    } else this.fallback.parryAttempt(center);
  }

  public parrySuccess(center: Readonly<{ x: number; y: number }>, facing: number): void {
    if (this.selectSource('player:parry-success', ['player_parry_success']) === 'FINAL_PNG') this.play('player_parry_success', center);
    else this.fallback.parrySuccess(center, facing);
  }

  public parryFailure(center: Readonly<{ x: number; y: number }>): void {
    if (this.selectSource('player:parry-failure', ['player_parry_failure']) === 'FINAL_PNG') this.play('player_parry_failure', center);
    else this.fallback.parryFailure(center);
  }

  public wordStop(center: Readonly<{ x: number; y: number }>): void {
    this.playWord('word_stop', center, () => this.fallback.wordStop(center));
  }

  public wordRewind(points: readonly Readonly<{ x: number; y: number }>[]): void {
    const center = points[0]; if (!center) return;
    this.playWord('word_rewind', center, () => this.fallback.wordRewind(points));
  }

  public wordLink(origin: Readonly<{ x: number; y: number }>, targets: ReadonlyArray<Readonly<{ x: number; y: number }>>): void {
    const effects = ['player_word_collarbone_resonance', 'word_connect'] as const;
    if (this.selectSource('player:word:word_connect', effects, true) === 'FINAL_PNG') {
      // Keep the approved collarbone cue, but use the existing thin procedural
      // connector instead of the oversized endpoint rings/laser raster.
      this.play('player_word_collarbone_resonance', origin);
      this.fallback.wordLink(origin, targets);
    } else this.fallback.wordLink(origin, targets);
  }

  public wordPush(center: Readonly<{ x: number; y: number }>): void { this.playWord('word_push', center); }
  public wordPull(center: Readonly<{ x: number; y: number }>): void { this.playWord('word_hold', center); }
  public wordMark(center: Readonly<{ x: number; y: number }>): void { this.playWord('word_flow', center); }

  public attachProjectile(projectile: Projectile, source: Enemy): void {
    if (!this.actActive || this.projectiles.has(projectile)) return;
    if (this.artPatch.attachProjectile(projectile, source)) return;
    const effectId = source.creatureId === 'deflect_bat' ? 'deflect_bat_projectile'
      : source.creatureId === 'mineral_spider' ? 'mineral_spider_projectile'
        : source.creatureId === 'resonance_goral' ? 'resonance_goral_projectile' : undefined;
    if (!effectId) return;
    if (this.selectSource(`projectile:${effectId}`, [effectId]) !== 'FINAL_PNG') { this.fallback.attachProjectile(projectile, source); return; }
    const effect = this.effects.get(effectId)!; const frame = effect.frameFiles[0]!;
    while (this.projectiles.size >= MAX_FINAL_PROJECTILE_COMPANIONS) {
      const oldest = this.projectiles.keys().next().value as Projectile | undefined;
      if (!oldest) break;
      this.releaseProjectile(oldest);
    }
    this.removeOwnerEffects(source, 'PROJECTILE_SPAWN');
    this.removeTelegraphCorridor(source);
    const anchor = source.visualAttackAnchor ?? source.attackAnchor;
    const image = this.scene.add.image(Math.round(anchor.x), Math.round(anchor.y), act1FinalTextureKey(frame))
      .setOrigin(0.5).setScale(effect.nativeDisplayScale).setDepth(DEPTH.projectile);
    const collisionCore = this.createProjectileCollisionCore(projectile, source);
    projectile.setVisible(false);
    this.projectiles.set(projectile, { effectId, image, collisionCore, source, frame: 0, startedAt: this.scene.time.now, changedAt: this.scene.time.now });
    this.note(effectId);
  }

  public projectileImpact(projectile: Projectile): void {
    if (this.artPatch.projectileImpact(projectile)) return;
    const companion = this.projectiles.get(projectile);
    if (!companion) { this.fallback.projectileImpact(projectile); return; }
    const impact = companion.effectId === 'deflect_bat_projectile' ? 'deflect_bat_impact'
      : companion.effectId === 'mineral_spider_projectile' ? 'mineral_spider_impact' : undefined;
    this.releaseProjectile(projectile, 'PROJECTILE_IMPACT');
    if (impact && this.selectSource(`impact:${impact}`, [impact]) === 'FINAL_PNG') this.play(impact, { x: projectile.x, y: projectile.y }, undefined, { ttlMs: ACT1_FINAL_IMPACT_TTL_MS });
  }

  public releaseProjectile(projectile: Projectile, reason = 'PROJECTILE_DESTROY'): void {
    if (this.artPatch.releaseProjectile(projectile, reason)) return;
    const companion = this.projectiles.get(projectile);
    if (!companion) { this.fallback.releaseProjectile(projectile); return; }
    companion.image.destroy(); companion.collisionCore.destroy(); this.projectiles.delete(projectile);
    this.recordCleanup(companion.effectId, companion.source, reason);
    if (projectile.active) projectile.setVisible(true);
  }

  public meleeContact(enemy: Enemy): void {
    if (enemy.creatureId === 'rewind_lizard' && this.selectSource('rewind_lizard:contact', ['rewind_lizard_contact']) === 'FINAL_PNG') this.play('rewind_lizard_contact', enemy.visualAttackAnchor ?? enemy.attackAnchor);
    else this.fallback.meleeContact(enemy);
  }

  public update(time: number, enemies: readonly Enemy[], projectiles: readonly Projectile[], cues: readonly ShowcaseBackgroundCue[]): void {
    if (!this.actActive) return;
    this.artPatch.update(time, projectiles);
    const activeProjectiles = new Set(projectiles);
    for (const [projectile, companion] of [...this.projectiles]) {
      if (!projectile.active || !activeProjectiles.has(projectile) || !projectile.enemyOwned) { this.releaseProjectile(projectile, 'PROJECTILE_INACTIVE'); continue; }
      const effect = this.effects.get(companion.effectId); if (!effect) continue;
      const duration = effect.frameDurationMsCandidates[companion.frame] ?? 70;
      if (time - companion.changedAt >= duration) {
        companion.frame = (companion.frame + 1) % effect.frameFiles.length; companion.changedAt = time;
        const file = effect.frameFiles[companion.frame]; if (file) companion.image.setTexture(act1FinalTextureKey(file));
      }
      const core = projectileCoreGeometry(projectile.collisionCircle);
      companion.image.setPosition(Math.round(core.x), Math.round(core.y)).setRotation(projectile.rotation);
      companion.collisionCore.setPosition(Math.round(core.x), Math.round(core.y)).setRotation(projectile.rotation);
    }
    const activeEnemies = new Set(enemies);
    for (const enemy of enemies) this.updateEnemy(enemy);
    for (const enemy of [...this.telegraphCorridors.keys()]) if (!enemy.active || !activeEnemies.has(enemy)) this.removeTelegraphCorridor(enemy, 'OWNER_DESTROY');
    for (const cue of cues) {
      const sequence = cue.motion?.sequence ?? 'fly'; const previous = this.cueSequence.get(cue.image);
      if (sequence.includes('evade') && previous !== sequence) this.play('pressure_swift_evade_pressure', { x: cue.image.x, y: cue.image.y }, cue.image);
      this.cueSequence.set(cue.image, sequence);
    }
    for (const item of [...this.live]) {
      if (item.expiresAt !== undefined && time >= item.expiresAt) { this.remove(item, 'TTL'); continue; }
      if (item.owner && !item.owner.active) { this.remove(item, 'OWNER_DESTROY'); continue; }
      if (item.owner?.active) item.image.setPosition(
        Math.round(item.owner.x + (item.ownerOffset?.x ?? 0)),
        Math.round(item.owner.y + (item.ownerOffset?.y ?? 0)),
      );
    }
  }

  public clear(): void {
    this.clearAttackPresentations();
    this.emitted.clear();
  }

  public clearAttackPresentations(): void {
    this.artPatch.clear('ACT_OR_PHASE_CLEANUP');
    for (const projectile of [...this.projectiles.keys()]) this.releaseProjectile(projectile, 'ACT_OR_PHASE_CLEANUP');
    for (const cue of this.telegraphCorridors.values()) { cue.timer.remove(false); cue.graphics.destroy(); }
    this.telegraphCorridors.clear();
    for (const item of [...this.live]) this.remove(item, 'ACT_OR_PHASE_CLEANUP');
    this.live.clear(); this.sequenceByOwner.clear(); this.phaseByOwner.clear(); this.fallback.clear();
  }

  public destroy(): void {
    this.clear();
    this.artPatch.destroy();
    this.fallback.destroy();
  }

  public snapshot(): Act1FinalVfxSnapshot {
    const now = this.scene.time.now;
    const effectCounts = new Map<string, number>();
    for (const item of this.live) effectCounts.set(item.effect.effectId, (effectCounts.get(item.effect.effectId) ?? 0) + 1);
    for (const item of this.projectiles.values()) effectCounts.set(item.effectId, (effectCounts.get(item.effectId) ?? 0) + 1);
    return {
      enabled: this.actActive,
      actActive: this.actActive,
      source: 'FINAL_PNG',
      recordCount: this.effects.size,
      boundCount: this.effects.size,
      unresolvedCount: 0,
      liveEffectCount: this.live.size + this.projectiles.size,
      projectileCompanionCount: this.projectiles.size,
      collisionCoreCount: this.projectiles.size,
      telegraphCorridorCount: this.telegraphCorridors.size,
      orphanCount: [...this.live].filter((item) => item.owner && !item.owner.active).length
        + [...this.projectiles.keys()].filter((projectile) => !projectile.active).length,
      oldestAgeMs: Math.max(
        0,
        ...[...this.live].map((item) => now - item.startedAt),
        ...[...this.projectiles.values()].map((item) => now - item.startedAt),
      ),
      effectCounts: Object.fromEntries(effectCounts),
      instances: [
        ...[...this.live].map((item) => ({
          instanceId: `effect:${item.instanceId}`,
          effectId: item.effect.effectId,
          ownerId: (item.owner as unknown as { id?: string } | undefined)?.id,
          createdAt: item.startedAt,
          expectedCleanup: item.expectedCleanup,
          gameplayOwnerActive: item.owner?.active ?? true,
          age: now - item.startedAt,
          pooled: false as const,
        })),
        ...[...this.projectiles].map(([projectile, item]) => ({
          instanceId: `projectile:${projectile.attackId}`,
          effectId: item.effectId,
          ownerId: item.source.id,
          projectileId: projectile.attackId,
          createdAt: item.startedAt,
          expectedCleanup: 'PROJECTILE_DESTROY_OR_IMPACT',
          gameplayOwnerActive: projectile.active,
          age: now - item.startedAt,
          pooled: false as const,
        })),
      ],
      emitted: Object.fromEntries(this.emitted),
      eventSources: Object.fromEntries([...this.eventSources].map(([eventId, record]) => [eventId, {
        source: record.source,
        liveInstances: record.source === 'FINAL_PNG'
          ? record.effectIds.reduce((sum, effectId) => sum + (effectCounts.get(effectId) ?? 0), 0)
          : 0,
      }])),
      recentCleanup: [...this.cleanupHistory],
      artPatch: this.artPatch.snapshot(),
    };
  }

  private updateEnemy(enemy: Enemy): void {
    if (!enemy.active) { this.removeOwnerEffects(enemy, undefined, 'OWNER_DESTROY'); this.removeTelegraphCorridor(enemy, 'OWNER_DESTROY'); return; }
    const sequence = enemy.motionSnapshot?.sequence ?? 'idle';
    const previous = this.sequenceByOwner.get(enemy.id);
    if (sequence !== previous) {
      this.removeOwnerEffects(enemy, undefined, 'SEQUENCE_CHANGE');
      this.removeTelegraphCorridor(enemy, 'SEQUENCE_CHANGE');
      const anchor = enemy.visualAttackAnchor ?? enemy.attackAnchor;
      if (enemy.creatureId === 'deflect_bat' && sequence.includes('prep')) {
        if (!this.artPatch.playEnemyForm(enemy)) this.play('deflect_bat_prep', anchor, enemy, { expectedCleanup: 'PROJECTILE_SPAWN' });
        this.ensureProjectileCorridor(enemy);
      }
      if (enemy.creatureId === 'rewind_lizard' && sequence.includes('prep')) this.play('rewind_lizard_prep', anchor, enemy);
      if (enemy.creatureId === 'rewind_lizard' && sequence.includes('attack')) this.play('rewind_lizard_lunge', anchor, enemy);
      if (enemy.creatureId === 'mineral_spider' && sequence.includes('deploy_to_attack')) {
        if (!this.artPatch.playEnemyForm(enemy)) {
          this.play('mineral_spider_thread_spawn_marker_approved', anchor, enemy, { expectedCleanup: 'PROJECTILE_SPAWN' });
          this.play('mineral_spider_prep', anchor, enemy, { expectedCleanup: 'PROJECTILE_SPAWN' });
        }
      }
      if (enemy.creatureId === 'resonance_goral' && sequence.includes('charge_attack')) this.play('resonance_goral_charge', anchor, enemy);
      this.sequenceByOwner.set(enemy.id, sequence);
    }
    const phase = (enemy as Enemy & { phase?: number }).phase;
    if (this.phaseByOwner.has(enemy.id) && this.phaseByOwner.get(enemy.id) !== phase) this.removeOwnerEffects(enemy);
    this.phaseByOwner.set(enemy.id, phase);
    if (enemy.creatureId === 'resonance_goral' && phase === 3 && !this.sequenceByOwner.has(`${enemy.id}:phase3`)) {
      // CreaturePresentation keeps the phase state but suppresses the
      // decorative overhead resonance arcs in final ACT 1 presentation.
      this.note('resonance_goral_phase3_overlay_suppressed');
      this.sequenceByOwner.set(`${enemy.id}:phase3`, 'active');
    }
  }

  private playWord(effectId: string, center: Readonly<{ x: number; y: number }>, fallback?: () => void): void {
    const effects = ['player_word_collarbone_resonance', effectId] as const;
    if (this.selectSource(`player:word:${effectId}`, effects, Boolean(fallback)) === 'FINAL_PNG') {
      for (const item of effects) this.play(item, center);
    } else fallback?.();
  }

  private play(
    effectId: string,
    anchor: Readonly<{ x: number; y: number }>,
    owner?: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
    options: Readonly<{ ttlMs?: number; expectedCleanup?: LiveEffect['expectedCleanup'] }> = {},
  ): boolean {
    if (!this.actActive) return false;
    const effect = this.effects.get(effectId); const first = effect?.frameFiles[0];
    if (!effect || !first || !this.scene.textures.exists(act1FinalTextureKey(first))) return false;
    while (this.live.size >= 56) { const oldest = this.live.values().next().value as LiveEffect | undefined; if (!oldest) break; this.remove(oldest, 'LIVE_CAP'); }
    const x = Math.round(anchor.x + effect.offset.x + effect.canvas.width / 2);
    const y = Math.round(anchor.y + effect.offset.y + effect.canvas.height / 2);
    const image = this.scene.add.image(x, y, act1FinalTextureKey(first)).setOrigin(0.5).setScale(effect.nativeDisplayScale).setDepth(DEPTH.word);
    if (effect.blendMode.includes('additive')) image.setBlendMode(Phaser.BlendModes.ADD);
    const live = {
      instanceId: this.instanceSequence += 1,
      image, effect, frame: 0, owner, startedAt: this.scene.time.now,
      expiresAt: options.ttlMs === undefined ? undefined : this.scene.time.now + options.ttlMs,
      expectedCleanup: options.expectedCleanup ?? (owner ? 'SEQUENCE_CHANGE' : 'TTL'),
      ownerOffset: owner ? { x: x - owner.x, y: y - owner.y } : undefined,
    } as LiveEffect;
    const advance = (): void => {
      if (!image.active) return;
      const next = live.frame + 1;
      if (next >= effect.frameFiles.length) {
        if (!effect.loop) { this.remove(live, 'FRAME_COMPLETE'); return; }
        live.frame = 0;
      } else live.frame = next;
      const file = effect.frameFiles[live.frame]; if (file) image.setTexture(act1FinalTextureKey(file));
      live.timer = this.scene.time.delayedCall(effect.frameDurationMsCandidates[live.frame] ?? 70, advance);
    };
    live.timer = this.scene.time.delayedCall(effect.frameDurationMsCandidates[0] ?? 70, advance);
    this.live.add(live); this.note(effectId); return true;
  }

  private remove(item: LiveEffect, reason = 'SEQUENCE_CHANGE'): void {
    item.timer?.remove(false); if (item.image.active) item.image.destroy(); this.live.delete(item);
    this.recordCleanup(item.effect.effectId, item.owner, reason);
  }

  private removeOwnerEffects(owner: Phaser.GameObjects.GameObject, expectedCleanup?: LiveEffect['expectedCleanup'], reason = expectedCleanup ?? 'SEQUENCE_CHANGE'): void {
    this.artPatch.removeOwnerEffects(owner, reason);
    for (const item of [...this.live]) if (item.owner === owner && (!expectedCleanup || item.expectedCleanup === expectedCleanup)) this.remove(item, reason);
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

  private ensureProjectileCorridor(enemy: Enemy): void {
    const telegraph = enemy.activeTelegraph;
    if (!telegraph || telegraph.until <= this.scene.time.now) return;
    const anchor = enemy.visualAttackAnchor ?? enemy.attackAnchor;
    const lines = projectileCorridorLines(anchor, telegraph.angle, ACT1_FINAL_PROJECTILE_READABILITY.batCueLength, BALANCE.collision.projectileRadius);
    const graphics = this.scene.add.graphics().setDepth(DEPTH.telegraph + 0.2);
    for (const line of lines) {
      graphics.lineStyle(3, ACT1_FINAL_PROJECTILE_READABILITY.outerColor, ACT1_FINAL_PROJECTILE_READABILITY.corridorAlpha)
        .lineBetween(line.x1, line.y1, line.x2, line.y2);
      graphics.lineStyle(1, ACT1_FINAL_PROJECTILE_READABILITY.innerColor, ACT1_FINAL_PROJECTILE_READABILITY.corridorOutlineAlpha)
        .lineBetween(line.x1, line.y1, line.x2, line.y2);
    }
    const cue: TelegraphCue = {
      graphics,
      timer: this.scene.time.delayedCall(ACT1_FINAL_PROJECTILE_READABILITY.batCueLifetimeMs, () => {
        if (this.telegraphCorridors.get(enemy) === cue) this.removeTelegraphCorridor(enemy, 'CUE_TTL');
      }),
    };
    this.telegraphCorridors.set(enemy, cue);
  }

  private removeTelegraphCorridor(enemy: Enemy, reason = 'PROJECTILE_SPAWN'): void {
    const cue = this.telegraphCorridors.get(enemy);
    cue?.timer.remove(false); cue?.graphics.destroy();
    this.telegraphCorridors.delete(enemy);
    if (cue) this.recordCleanup('deflect_bat_short_direction_cue', enemy, reason);
  }
  private canPlay(effectId: string): boolean {
    const effect = this.effects.get(effectId); const first = effect?.frameFiles[0];
    return Boolean(effect && first && this.scene.textures.exists(act1FinalTextureKey(first)));
  }
  private selectSource(eventId: string, effectIds: readonly string[], proceduralReady = true): Act1FinalVfxSource {
    const source = resolveAct1FinalPresentationSource(effectIds.every((effectId) => this.canPlay(effectId)), proceduralReady);
    this.eventSources.set(eventId, { source, effectIds: [...effectIds] });
    return source;
  }
  private recordCleanup(effectId: string, owner: Phaser.GameObjects.GameObject | undefined, reason: string): void {
    this.cleanupHistory.push({ effectId, ownerId: (owner as unknown as { id?: string } | undefined)?.id, reason, at: this.scene.time.now });
    if (this.cleanupHistory.length > 32) this.cleanupHistory.splice(0, this.cleanupHistory.length - 32);
  }
  private note(effectId: string): void { this.emitted.set(effectId, (this.emitted.get(effectId) ?? 0) + 1); }
}
