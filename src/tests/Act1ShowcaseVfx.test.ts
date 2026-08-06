import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../game/balance';
import {
  ACT1_SHOWCASE_VFX,
  act1ShowcaseEnabledForAct,
  act1ShowcaseProjectileStyle,
  resolveAct1ShowcaseConfig,
} from '../game/showcase/Act1ShowcaseConfig';

describe('ACT 1 showcase procedural VFX staging', () => {
  it('requires both explicit flags and is limited to ACT 1', () => {
    expect(resolveAct1ShowcaseConfig('')).toEqual({ enabled: false, source: 'DEFAULT_OFF' });
    expect(resolveAct1ShowcaseConfig('?motionPilot=1')).toEqual({ enabled: false, source: 'DEFAULT_OFF' });
    expect(resolveAct1ShowcaseConfig('?act1Showcase=1')).toEqual({ enabled: false, source: 'MOTION_PILOT_REQUIRED' });
    const enabled = resolveAct1ShowcaseConfig('?motionPilot=1&act1Showcase=1');
    expect(enabled).toEqual({ enabled: true, source: 'URL_QUERY' });
    expect(act1ShowcaseEnabledForAct(enabled, 1)).toBe(true);
    expect(act1ShowcaseEnabledForAct(enabled, 2)).toBe(false);
    expect(act1ShowcaseEnabledForAct(enabled, 3)).toBe(false);
  });

  it('maps only approved ACT 1 projectile presentations', () => {
    expect(act1ShowcaseProjectileStyle('deflect_bat')).toBe('bat-sonic');
    expect(act1ShowcaseProjectileStyle('mineral_spider')).toBe('spider-web');
    expect(act1ShowcaseProjectileStyle('resonance_goral')).toBe('goral-stone');
    expect(act1ShowcaseProjectileStyle('rewind_lizard')).toBeUndefined();
    expect(act1ShowcaseProjectileStyle('pleated_frog')).toBeUndefined();
    expect(act1ShowcaseProjectileStyle('channel_otter_mother')).toBeUndefined();
  });

  it('keeps every effect bounded and centrally capped', () => {
    expect(ACT1_SHOWCASE_VFX.maximumTransientEffects).toBe(56);
    expect(ACT1_SHOWCASE_VFX.maximumProjectileCompanions).toBe(28);
    for (const profile of [
      ACT1_SHOWCASE_VFX.heroCut,
      ACT1_SHOWCASE_VFX.parry,
      ACT1_SHOWCASE_VFX.stop,
      ACT1_SHOWCASE_VFX.rewind,
      ACT1_SHOWCASE_VFX.link,
      ACT1_SHOWCASE_VFX.bat,
      ACT1_SHOWCASE_VFX.lizard,
      ACT1_SHOWCASE_VFX.spider,
      ACT1_SHOWCASE_VFX.goral,
      ACT1_SHOWCASE_VFX.swift,
    ]) {
      expect(profile.maximumExtent).toBeLessThanOrEqual(46);
      expect(profile.lineWidth).toBeLessThanOrEqual(2);
      expect(profile.alpha).toBeLessThan(0.9);
    }
  });

  it('does not change locked gameplay balance values', () => {
    expect(BALANCE.hero.cut).toMatchObject({ damage: 14, range: 108, cooldown: 1050, hitDelay: 115, recovery: 245 });
    expect(BALANCE.hero.parryWindow).toBe(155);
    expect(BALANCE.hero.parryCooldown).toBe(430);
    expect(BALANCE.collision.projectileRadius).toBe(5);
    expect(BALANCE.enemies.archer).toMatchObject({ speed: 72, damage: 13 });
    expect(BALANCE.enemies.chaser).toMatchObject({ speed: 94, damage: 15 });
    expect(BALANCE.enemies.ink).toMatchObject({ speed: 48, damage: 11 });
    expect(BALANCE.enemies.boss).toMatchObject({ speed: 68, damage: 24 });
  });

  it('keeps physics projectiles authoritative and cleans the manager at the ACT boundary', () => {
    const scene = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    const projectile = readFileSync('src/game/entities/Projectile.ts', 'utf8');
    const showcase = readFileSync('src/game/showcase/Act1ShowcaseVfx.ts', 'utf8');
    expect(scene).toContain('new Projectile(this, x, y, angle, speed, scaledDamage, texture, source.id)');
    expect(scene).toContain('this.showcaseVfx?.attachProjectile(projectile, source)');
    expect(scene).toContain('this.showcaseVfx?.clear();');
    expect(scene).toContain('this.showcaseVfx?.setAct(next.index);');
    expect(projectile).toContain('this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed)');
    expect(projectile).toContain('this.damage = damage; this.originalDamage = damage');
    expect(showcase).not.toContain('review/');
    expect(showcase).not.toContain('previews/');
    expect(showcase).not.toContain('.mp4');
  });

  it('preserves lizard, spider, and goral gameplay timestamps and boss projectile counts', () => {
    const enemy = readFileSync('src/game/entities/Enemy.ts', 'utf8');
    const boss = readFileSync('src/game/entities/Boss.ts', 'utf8');
    expect(enemy).toContain("this.scene.time.delayedCall(540");
    expect(enemy).toContain("this.scene.time.delayedCall(650");
    expect(enemy).toContain('this.scene.time.delayedCall(warningMs');
    expect(boss).toContain('for (let index = -2; index <= 2; index += 1)');
    expect(boss).toContain('for (let index = 0; index < 12; index += 1)');
    expect(boss).toContain('for (let index = -3; index <= 3; index += 1)');
  });
});
