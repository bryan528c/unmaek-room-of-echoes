import { describe, expect, it } from 'vitest';
import { separateAttackerFromAnchoredHero, separationOffset } from '../game/systems/CombatGeometry';

describe('parry position lock', () => {
  const hero = { x: 480, y: 300, radius: 15 };

  it('keeps the hero fixed and caps the attacker correction in 8 directions', () => {
    for (let direction = 0; direction < 8; direction += 1) {
      const angle = direction * Math.PI / 4;
      const attacker = { x: hero.x + Math.cos(angle) * 10, y: hero.y + Math.sin(angle) * 10, radius: 18 };
      const result = separateAttackerFromAnchoredHero(hero, attacker, 3, 4);
      expect(hero).toEqual({ x: 480, y: 300, radius: 15 });
      expect(Math.hypot(result.x - attacker.x, result.y - attacker.y)).toBeCloseTo(4, 6);
      expect(Math.hypot(result.x - hero.x, result.y - hero.y)).toBeCloseTo(14, 6);
    }
  });

  it('resolves deep overlap over multiple capped steps instead of teleporting', () => {
    let attacker = { x: hero.x, y: hero.y, radius: 18 };
    for (let step = 0; step < 9; step += 1) {
      const next = separateAttackerFromAnchoredHero(hero, attacker, 3, 4);
      expect(Math.hypot(next.x - attacker.x, next.y - attacker.y)).toBeLessThanOrEqual(4.000001);
      attacker = { ...attacker, ...next };
    }
    expect(Math.hypot(attacker.x - hero.x, attacker.y - hero.y)).toBeCloseTo(36, 6);
  });

  it('caps shared overlap correction even when entities occupy the same point', () => {
    const correction = separationOffset(hero, { x: hero.x, y: hero.y, radius: 44 }, 0.82, 2.5);
    expect(Math.hypot(correction.x, correction.y)).toBeCloseTo(2.5, 6);
  });

  it('does not pull a distant attacker or move a hero near an arena edge', () => {
    const edgeHero = { x: 40, y: 100, radius: 15 };
    const attacker = { x: 100, y: 100, radius: 18 };
    expect(separateAttackerFromAnchoredHero(edgeHero, attacker)).toEqual({ x: 100, y: 100 });
    expect(edgeHero).toEqual({ x: 40, y: 100, radius: 15 });
  });
});
