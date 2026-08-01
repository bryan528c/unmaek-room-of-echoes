import { describe, expect, it } from 'vitest';
import { backflowBladeDamage, cutDamageMultiplier, cutHitsTarget, cutSentenceBonus, echoBladeProfile, echoBladeTargets, isolationChainProfile, quantizeEightDirection, returningScarProfile, WeaponCooldowns } from '../game/systems/WeaponCombatSystem';

const candidate = (id: string, x: number, y: number, overrides = {}) => ({
  id, hurtbox: { x, y, radiusX: 10, radiusY: 16 }, alive: true, visible: true, attackable: true, insideCombatBounds: true, ...overrides,
});

describe('잔향 칼날', () => {
  const base = { interval: 950, range: 92, damage: 5, maximumTargets: 3 };

  it('uses a 360-degree proximity area without a facing target', () => {
    const profile = echoBladeProfile(base, 0, 0);
    const targets = echoBladeTargets({ x: 0, y: 0 }, [candidate('left', -70, 0), candidate('up', 0, -70), candidate('right', 70, 0), candidate('outside', 150, 0)], profile);
    expect(new Set(targets.map((item) => item.id))).toEqual(new Set(['left', 'right', 'up']));
  });

  it('excludes off-screen, dead and out-of-bounds candidates', () => {
    const profile = echoBladeProfile(base, 0, 0);
    expect(echoBladeTargets({ x: 0, y: 0 }, [
      candidate('dead', 20, 0, { alive: false }), candidate('hidden', 30, 0, { visible: false }), candidate('outside', 40, 0, { insideCombatBounds: false }),
    ], profile)).toEqual([]);
  });

  it('applies both visible prototype card profiles', () => {
    const twin = echoBladeProfile(base, 1, 0);
    expect(twin).toMatchObject({ orbitCount: 2, range: 92 });
    expect(twin.damage).toBeCloseTo(6.8);
    expect(echoBladeProfile(base, 0, 2)).toMatchObject({ orbitCount: 1, range: 132.48, interval: 1178 });
  });
});

describe('J 절단', () => {
  const profile = { damage: 14, range: 108, halfAngle: Math.PI * 5 / 12, cooldown: 1050, stoppedMultiplier: 1.65, linkedMultiplier: 1.2, echoMultiplier: 1.35, exposedMultiplier: 1.5 };

  it('quantizes movement into eight directions without selecting an enemy', () => {
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      expect(quantizeEightDirection({ x: Math.cos(angle), y: Math.sin(angle) }).angle).toBeCloseTo(angle <= Math.PI ? angle : angle - Math.PI * 2);
    }
  });

  it('uses one wide sector and rejects targets behind it', () => {
    expect(cutHitsTarget({ x: 0, y: 0 }, 0, profile, candidate('front', 80, 0).hurtbox)).toBe(true);
    expect(cutHitsTarget({ x: 0, y: 0 }, 0, profile, candidate('behind', -80, 0).hurtbox)).toBe(false);
  });

  it('turns combat states into explicit damage opportunities', () => {
    expect(cutDamageMultiplier({ stopped: true, linked: false, echo: false, exposed: false }, profile)).toBeCloseTo(1.65);
    expect(cutDamageMultiplier({ stopped: false, linked: true, echo: true, exposed: true }, profile)).toBeCloseTo(1.2 * 1.35 * 1.5);
  });

  it('applies all state-oriented prototype card values with capped stacks', () => {
    expect(cutSentenceBonus(true, false, 1)).toBe(9);
    expect(cutSentenceBonus(false, true, 9)).toBe(18);
    expect(cutSentenceBonus(false, false, 2)).toBe(0);
    expect(backflowBladeDamage(20, 1)).toBe(13);
    expect(backflowBladeDamage(20, 0)).toBe(0);
    expect(returningScarProfile(2)).toEqual({ replayCount: 2, damageRatio: 0.42 });
    expect(isolationChainProfile(2)).toEqual({ isolatedMultiplier: 1.38, explosionBonus: 24 });
  });

  it('accepts one activation per cooldown and resets for a new run', () => {
    const cooldowns = new WeaponCooldowns(); cooldowns.reset(100);
    expect(cooldowns.canCut(100)).toBe(true); cooldowns.commitCut(100, 1050);
    expect(cooldowns.canCut(1149)).toBe(false); expect(cooldowns.canCut(1150)).toBe(true);
    cooldowns.reset(0); expect(cooldowns.snapshot()).toEqual({ echoReadyAt: 0, cutReadyAt: 0 });
  });
});
