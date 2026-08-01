import { describe, expect, it } from 'vitest';
import { ParryResolver, pointInsideParryEnvelope } from '../game/systems/ParrySystem';

const hurtbox = { x: 100, y: 80, radiusX: 13, radiusY: 20 };

describe('360-degree hurtbox parry', () => {
  it('covers projectile impacts from all eight directions equally', () => {
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      const point = { x: hurtbox.x + Math.cos(angle) * 22, y: hurtbox.y + Math.sin(angle) * 22 };
      expect(pointInsideParryEnvelope(point, hurtbox, 10)).toBe(true);
      const result = new ParryResolver().resolve(true, { attackId: `shot-${index}`, parryable: true, overlapsHurtbox: true });
      expect(result).toEqual({ cancelDamage: true, grantReward: true });
    }
  });

  it('does not consult four possible facings for projectile or melee resolution', () => {
    const facings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const attackKinds = ['projectile', 'melee'] as const;
    for (const _facing of facings) for (const kind of attackKinds) for (let direction = 0; direction < 8; direction += 1) {
      const resolver = new ParryResolver();
      expect(resolver.resolve(true, { attackId: `${kind}-${direction}`, parryable: true, overlapsHurtbox: true }))
        .toEqual({ cancelDamage: true, grantReward: true });
    }
  });

  it('parries upper and lower melee attacks without a facing arc', () => {
    const resolver = new ParryResolver();
    expect(resolver.resolve(true, { attackId: 'upper-melee', parryable: true, overlapsHurtbox: true }).cancelDamage).toBe(true);
    expect(resolver.resolve(true, { attackId: 'lower-melee', parryable: true, overlapsHurtbox: true }).cancelDamage).toBe(true);
  });

  it('does not block outside the timing window or an unparryable zone', () => {
    const resolver = new ParryResolver();
    expect(resolver.resolve(false, { attackId: 'late', parryable: true, overlapsHurtbox: true }).cancelDamage).toBe(false);
    expect(resolver.resolve(true, { attackId: 'ink-zone', parryable: false, overlapsHurtbox: true }).cancelDamage).toBe(false);
  });

  it('cancels duplicate contact without granting duplicate rewards', () => {
    const resolver = new ParryResolver();
    expect(resolver.resolve(true, { attackId: 'same', parryable: true, overlapsHurtbox: true })).toEqual({ cancelDamage: true, grantReward: true });
    expect(resolver.resolve(true, { attackId: 'same', parryable: true, overlapsHurtbox: true })).toEqual({ cancelDamage: true, grantReward: false });
  });
});
