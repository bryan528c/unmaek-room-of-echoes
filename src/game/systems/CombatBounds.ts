export interface CombatBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface BoundedCircle {
  x: number;
  y: number;
  radius: number;
}

export interface GroundExtents {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ClampedPoint {
  x: number;
  y: number;
  corrected: boolean;
  correctedTop: boolean;
}

export function clampCircleToBounds(circle: BoundedCircle, bounds: CombatBounds): ClampedPoint {
  const x = Math.max(bounds.left + circle.radius, Math.min(bounds.right - circle.radius, circle.x));
  const y = Math.max(bounds.top + circle.radius, Math.min(bounds.bottom - circle.radius, circle.y));
  // Physics integration can leave harmless sub-pixel drift on an exact edge.
  // Count only a visible correction so diagnostics describe gameplay faults.
  const epsilon = 0.05;
  return {
    x,
    y,
    corrected: Math.abs(x - circle.x) > epsilon || Math.abs(y - circle.y) > epsilon,
    correctedTop: circle.y < bounds.top + circle.radius - epsilon,
  };
}

export function circleInsideBounds(circle: BoundedCircle, bounds: CombatBounds): boolean {
  const epsilon = 0.05;
  return circle.x - circle.radius >= bounds.left - epsilon
    && circle.x + circle.radius <= bounds.right + epsilon
    && circle.y - circle.radius >= bounds.top - epsilon
    && circle.y + circle.radius <= bounds.bottom + epsilon;
}

export function clampPointToBounds(x: number, y: number, bounds: CombatBounds, padding = 0): Readonly<{ x: number; y: number }> {
  return {
    x: Math.max(bounds.left + padding, Math.min(bounds.right - padding, x)),
    y: Math.max(bounds.top + padding, Math.min(bounds.bottom - padding, y)),
  };
}

export function clampGroundPointToBounds(
  x: number,
  y: number,
  extents: GroundExtents,
  bounds: CombatBounds,
): ClampedPoint {
  const clampedX = Math.max(bounds.left + extents.left, Math.min(bounds.right - extents.right, x));
  const clampedY = Math.max(bounds.top + extents.top, Math.min(bounds.bottom - extents.bottom, y));
  const epsilon = 0.05;
  return {
    x: clampedX,
    y: clampedY,
    corrected: Math.abs(clampedX - x) > epsilon || Math.abs(clampedY - y) > epsilon,
    correctedTop: y < bounds.top + extents.top - epsilon,
  };
}

export function groundFootprintInsideBounds(
  point: Readonly<{ x: number; y: number }>,
  extents: GroundExtents,
  bounds: CombatBounds,
): boolean {
  const epsilon = 0.05;
  return point.x - extents.left >= bounds.left - epsilon
    && point.x + extents.right <= bounds.right + epsilon
    && point.y - extents.top >= bounds.top - epsilon
    && point.y + extents.bottom <= bounds.bottom + epsilon;
}
