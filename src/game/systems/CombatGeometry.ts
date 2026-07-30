export interface Point { x: number; y: number }
export interface Circle extends Point { radius: number }
export interface Sector extends Point { angle: number; range: number; halfAngle: number }

export function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x; const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function wrappedAngleDelta(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function circlesOverlap(a: Circle, b: Circle): boolean {
  return distanceSquared(a, b) <= (a.radius + b.radius) ** 2;
}

export function sectorHitsCircle(sector: Sector, target: Circle): boolean {
  const dx = target.x - sector.x; const dy = target.y - sector.y;
  const distance = Math.hypot(dx, dy);
  if (distance > sector.range + target.radius) return false;
  if (distance <= target.radius) return true;
  const allowance = Math.asin(Math.min(1, target.radius / Math.max(target.radius, distance)));
  return wrappedAngleDelta(Math.atan2(dy, dx), sector.angle) <= sector.halfAngle + allowance;
}

export function separationOffset(moving: Circle, obstacle: Circle, strength = 1): Point {
  const dx = moving.x - obstacle.x; const dy = moving.y - obstacle.y;
  const distance = Math.hypot(dx, dy);
  const overlap = moving.radius + obstacle.radius - distance;
  if (overlap <= 0) return { x: 0, y: 0 };
  const angle = distance > 0.001 ? Math.atan2(dy, dx) : Math.PI / 2;
  return { x: Math.cos(angle) * overlap * strength, y: Math.sin(angle) * overlap * strength };
}

export function telegraphCoversReach(telegraphLength: number, telegraphHalfWidth: number, hitReach: number, hitRadius: number): boolean {
  return telegraphLength >= hitReach && telegraphHalfWidth >= hitRadius;
}

export class AttackHitRegistry {
  private readonly hits = new Map<number, Set<string>>();

  public claim(attackId: number, targetId: string): boolean {
    const targets = this.hits.get(attackId) ?? new Set<string>();
    if (targets.has(targetId)) return false;
    targets.add(targetId); this.hits.set(attackId, targets);
    if (this.hits.size > 12) this.hits.delete(this.hits.keys().next().value as number);
    return true;
  }

  public reset(): void { this.hits.clear(); }
}

export function canDamageHero(now: number, invulnerableUntil: number, dashing: boolean, rewinding: boolean): boolean {
  return !dashing && !rewinding && now >= invulnerableUntil;
}
