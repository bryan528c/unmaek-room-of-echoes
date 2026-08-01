import type { Ellipse, Point } from './CombatGeometry';

export interface ParryEvent {
  attackId: string;
  parryable: boolean;
  overlapsHurtbox: boolean;
}

export interface ParryResolution {
  cancelDamage: boolean;
  grantReward: boolean;
}

export function pointInsideParryEnvelope(point: Point, hurtbox: Ellipse, padding: number): boolean {
  const radiusX = Math.max(0.001, hurtbox.radiusX + padding);
  const radiusY = Math.max(0.001, hurtbox.radiusY + padding);
  const dx = (point.x - hurtbox.x) / radiusX;
  const dy = (point.y - hurtbox.y) / radiusY;
  return dx * dx + dy * dy <= 1.0001;
}

export class ParryResolver {
  private readonly parriedIds = new Set<string>();

  public resolve(active: boolean, event: ParryEvent): ParryResolution {
    if (!active || !event.parryable || !event.overlapsHurtbox) return { cancelDamage: false, grantReward: false };
    if (this.parriedIds.has(event.attackId)) return { cancelDamage: true, grantReward: false };
    this.parriedIds.add(event.attackId);
    if (this.parriedIds.size > 160) this.parriedIds.delete(this.parriedIds.values().next().value as string);
    return { cancelDamage: true, grantReward: true };
  }

  public reset(): void { this.parriedIds.clear(); }
}
