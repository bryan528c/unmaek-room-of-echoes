export interface Point { x: number; y: number }
export interface Circle extends Point { radius: number }
export interface Ellipse extends Point { radiusX: number; radiusY: number }
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

export function ellipseRadiusAtAngle(ellipse: Ellipse, angle: number): number {
  const cosine = Math.cos(angle); const sine = Math.sin(angle);
  const radiusX = Math.max(0.001, ellipse.radiusX); const radiusY = Math.max(0.001, ellipse.radiusY);
  const denominator = Math.sqrt((cosine * cosine) / (radiusX * radiusX)
    + (sine * sine) / (radiusY * radiusY));
  return denominator <= 0.0001 ? Math.max(ellipse.radiusX, ellipse.radiusY) : 1 / denominator;
}

export function closestPointOnEllipse(point: Point, ellipse: Ellipse): Point {
  const dx = point.x - ellipse.x; const dy = point.y - ellipse.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.0001) return { x: ellipse.x, y: ellipse.y };
  const angle = Math.atan2(dy, dx);
  const radius = ellipseRadiusAtAngle(ellipse, angle);
  if (distance <= radius) return { x: point.x, y: point.y };
  return { x: ellipse.x + Math.cos(angle) * radius, y: ellipse.y + Math.sin(angle) * radius };
}

export function distanceToEllipse(point: Point, ellipse: Ellipse): number {
  const closest = closestPointOnEllipse(point, ellipse);
  return Math.hypot(closest.x - point.x, closest.y - point.y);
}

export function sectorHitsEllipse(sector: Sector, target: Ellipse): boolean {
  const closest = closestPointOnEllipse(sector, target);
  const dx = closest.x - sector.x; const dy = closest.y - sector.y;
  const closestDistance = Math.hypot(dx, dy);
  if (closestDistance > sector.range) return false;
  if (closestDistance <= 0.001) return true;
  const centerAngle = Math.atan2(target.y - sector.y, target.x - sector.x);
  const centerDistance = Math.hypot(target.x - sector.x, target.y - sector.y);
  const effectiveRadius = ellipseRadiusAtAngle(target, centerAngle + Math.PI);
  const allowance = centerDistance <= effectiveRadius ? Math.PI : Math.asin(Math.min(1, effectiveRadius / centerDistance));
  return wrappedAngleDelta(centerAngle, sector.angle) <= sector.halfAngle + allowance;
}

export function sectorHitsCircle(sector: Sector, target: Circle): boolean {
  return sectorHitsEllipse(sector, { x: target.x, y: target.y, radiusX: target.radius, radiusY: target.radius });
}

export function separationOffset(
  moving: Circle,
  obstacle: Circle,
  strength = 1,
  maximumCorrection = Number.POSITIVE_INFINITY,
  fallbackDirection?: Point,
): Point {
  const dx = moving.x - obstacle.x; const dy = moving.y - obstacle.y;
  const distance = Math.hypot(dx, dy);
  const overlap = moving.radius + obstacle.radius - distance;
  if (overlap <= 0) return { x: 0, y: 0 };
  const fallbackLength = fallbackDirection ? Math.hypot(fallbackDirection.x, fallbackDirection.y) : 0;
  const angle = distance > 0.001
    ? Math.atan2(dy, dx)
    : fallbackDirection && fallbackLength > 0.001
      ? Math.atan2(fallbackDirection.y, fallbackDirection.x)
      : -Math.PI / 2;
  const correction = Math.min(overlap * strength, Math.max(0, maximumCorrection));
  return { x: Math.cos(angle) * correction, y: Math.sin(angle) * correction };
}

/** Keeps the hero Ground Point fixed and applies only a capped correction to the parried attacker. */
export function separateAttackerFromAnchoredHero(hero: Circle, attacker: Circle, padding = 3, maximumCorrection = 4): Point {
  const dx = attacker.x - hero.x; const dy = attacker.y - hero.y;
  const distance = Math.hypot(dx, dy);
  const minimumDistance = hero.radius + attacker.radius + Math.max(0, padding);
  if (distance >= minimumDistance) return { x: attacker.x, y: attacker.y };
  const angle = distance > 0.001 ? Math.atan2(dy, dx) : -Math.PI / 2;
  const correction = Math.min(minimumDistance - distance, Math.max(0, maximumCorrection));
  return { x: attacker.x + Math.cos(angle) * correction, y: attacker.y + Math.sin(angle) * correction };
}

export function pointToSegmentDistanceSquared(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return distanceSquared(point, start);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const closest = { x: start.x + dx * ratio, y: start.y + dy * ratio };
  return distanceSquared(point, closest);
}

export function sweptCircleHitsEllipse(start: Point, end: Point, radius: number, target: Ellipse): boolean {
  const expandedRadius = Math.max(target.radiusX, target.radiusY) + radius;
  return pointToSegmentDistanceSquared(target, start, end) <= expandedRadius * expandedRadius;
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
    if (this.hits.size > 18) this.hits.delete(this.hits.keys().next().value as number);
    return true;
  }

  public reset(): void { this.hits.clear(); }
}

export function canDamageHero(now: number, invulnerableUntil: number, dashing: boolean, rewinding: boolean): boolean {
  return !dashing && !rewinding && now >= invulnerableUntil;
}
