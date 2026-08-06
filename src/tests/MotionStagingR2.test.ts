import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveMirroredStagingFlip } from '../game/motion/MotionPilotConfig';
import { playerMotionSource, proceduralStandingFallbackTransform, resolveMotionVisualAnchor } from '../game/motion/MotionPilotRuntime';
import { nearestRuntimeSafeGroundPoint, runtimeGroundPointIsSafe, type RuntimeSafeGroundQuery } from '../game/runtime/RuntimeSafeSpawn';
import { heroDamageRejectionReason, resolveDevelopmentCombatFlags, sceneDamageRejectionReason } from '../game/systems/HeroDamagePolicy';

describe('motion staging R2 player damage policy', () => {
  it('keeps QA diagnostic-only and requires the explicit godMode=1 query for invulnerability', () => {
    expect(resolveDevelopmentCombatFlags('', true)).toEqual({ qa: false, godMode: false });
    expect(resolveDevelopmentCombatFlags('?motionPilot=1', true)).toEqual({ qa: false, godMode: false });
    expect(resolveDevelopmentCombatFlags('?qa=1&skipLoadout=1', true)).toEqual({ qa: true, godMode: false });
    expect(resolveDevelopmentCombatFlags('?motionPilot=1&qa=1&skipLoadout=1', true)).toEqual({ qa: true, godMode: false });
    expect(resolveDevelopmentCombatFlags('?qa=1&godMode=1', true)).toEqual({ qa: true, godMode: true });
    expect(resolveDevelopmentCombatFlags('?qa=1&godMode=1', false)).toEqual({ qa: false, godMode: false });
  });

  it('reports scene and Hero rejection reasons without making QA a damage gate', () => {
    expect(sceneDamageRejectionReason({ flowLocked: false, godMode: false, bossTransition: false })).toBeUndefined();
    expect(sceneDamageRejectionReason({ flowLocked: false, godMode: true, bossTransition: false })).toBe('GOD_MODE');
    expect(sceneDamageRejectionReason({ flowLocked: false, godMode: false, bossTransition: true })).toBe('BOSS_TRANSITION');
    expect(heroDamageRejectionReason({ rewinding: false, dashing: false, now: 1000, invulnerableUntil: 999, active: true })).toBeUndefined();
    expect(heroDamageRejectionReason({ rewinding: false, dashing: true, now: 1000, invulnerableUntil: 0, active: true })).toBe('DASHING');
    expect(heroDamageRejectionReason({ rewinding: false, dashing: false, now: 1000, invulnerableUntil: 1001, active: true })).toBe('HIT_INVULNERABILITY');
  });

  it('routes projectile, melee, and boss damage through the gameplay Hero owner and starts hit motion only after positive damage', () => {
    const source = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    const hitHero = source.slice(source.indexOf('private hitHero('), source.indexOf('private recordState('));
    expect(hitHero).not.toContain('this.qaMode ||');
    expect(hitHero).toContain('godMode: this.godMode || this.debugInvulnerable');
    expect(hitHero).toContain('const dealt = this.hero.takeDamage');
    expect(source).toContain("this.hitHero(projectile.damage");
    expect(source).toContain("enemy.kind === 'boss' ? 'boss' : 'melee'");
    const hero = readFileSync('src/game/entities/Hero.ts', 'utf8');
    const takeDamage = hero.slice(hero.indexOf('public takeDamage('), hero.indexOf('public heal('));
    expect(takeDamage).toContain("if (actual > 0) this.motionPresentation?.startAction('hit_recover'");
  });
});

describe('motion staging R2 goral mirrored presentation', () => {
  it('mirrors only after horizontal hysteresis and retains the last facing near center', () => {
    expect(resolveMirroredStagingFlip(false, 20)).toBe(true);
    expect(resolveMirroredStagingFlip(true, -20)).toBe(false);
    expect(resolveMirroredStagingFlip(true, 4)).toBe(true);
    expect(resolveMirroredStagingFlip(false, -4)).toBe(false);
  });

  it('mirrors the visual anchor around the same Ground Point without changing gameplay coordinates', () => {
    const ground = { x: 480, y: 270 };
    const left = resolveMotionVisualAnchor(ground, { x: 64, y: 40 }, { width: 220, height: 175 }, { x: 0.5, y: 0.88 }, { x: 1, y: 1 });
    const right = resolveMotionVisualAnchor(ground, { x: 156, y: 40 }, { width: 220, height: 175 }, { x: 0.5, y: 0.88 }, { x: 1, y: 1 });
    expect(left.y).toBe(right.y);
    expect((left.x + right.x) / 2).toBe(ground.x);
  });

  it('keeps gameplay hurtbox and attack anchors on effectiveFlipX while companions use presentationFlipX', () => {
    const source = readFileSync('src/game/runtime/CreaturePresentation.ts', 'utf8');
    expect(source).toContain('resolveWorldHurtbox(this.creatureId, groundPoint, this.effectiveFlipX)');
    expect(source).toContain('resolveWorldAttackAnchor(this.creatureId, groundPoint, this.effectiveFlipX');
    expect(source).toContain('this.motion?.visualAnchor(groundPoint, this.presentationFlipX');
    expect(source).toContain('.setFlipX(this.presentationFlipX)');
  });
});

describe('motion staging R2 safe summon projection', () => {
  const query: RuntimeSafeGroundQuery = {
    isWalkable: ({ x, y }) => x >= 20 && x <= 80 && y >= 20 && y <= 80,
    isHazard: ({ x, y }) => x >= 45 && x <= 55 && y >= 45 && y <= 55,
    constrainToBossTerritory: ({ x, y }) => {
      const clampedX = Math.max(15, Math.min(85, x)); const clampedY = Math.max(15, Math.min(85, y));
      return { x: clampedX, y: clampedY, corrected: clampedX !== x || clampedY !== y };
    },
  };

  it('rejects an invalid corner and projects once to a clear, walkable territory point', () => {
    expect(runtimeGroundPointIsSafe(query, { x: 15, y: 15 }, 5)).toBe(false);
    const resolved = nearestRuntimeSafeGroundPoint(query, { x: 0, y: 0 }, 5, () => true, 100, 5);
    expect(resolved).toBeDefined();
    expect(runtimeGroundPointIsSafe(query, resolved!, 5)).toBe(true);
    expect(query.constrainToBossTerritory(resolved!).corrected).toBe(false);
  });

  it('selects distinct valid points without changing summon count or kind in GameScene', () => {
    const used: { x: number; y: number }[] = [];
    for (const raw of [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]) {
      const resolved = nearestRuntimeSafeGroundPoint(query, raw, 5, (point) => used.every((item) => Math.hypot(point.x - item.x, point.y - item.y) >= 18), 100, 5);
      expect(resolved).toBeDefined(); used.push(resolved!);
    }
    expect(used).toHaveLength(3);
    const source = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    expect(source).toContain("this.summonMinions(count)");
    expect(source).toContain("Array.from({ length: count }, () => kind)");
  });
});

describe('motion staging R2 six-direction procedural fallback', () => {
  it('keeps each authored direction lock and uses only a one-pixel, 1.5-degree cadence', () => {
    for (const direction of ['N', 'NE', 'SE', 'SW', 'W', 'NW'] as const) expect(playerMotionSource(direction)).toBe('STANDING_LOCK_FALLBACK');
    const cadence = [0, 90, 180, 270].map((time) => proceduralStandingFallbackTransform(time, true));
    expect(cadence.map((item) => item.y)).toEqual([0, -1, 0, 1]);
    expect(Math.max(...cadence.map((item) => Math.abs(item.rotation * 180 / Math.PI)))).toBeCloseTo(1.5);
    expect(proceduralStandingFallbackTransform(90, false)).toEqual({ y: 0, rotation: 0 });
  });
});
