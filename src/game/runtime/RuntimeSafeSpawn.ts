import type { RuntimePoint } from './SubmissionRuntime';

export interface RuntimeSafeGroundQuery {
  isWalkable(point: Readonly<RuntimePoint>): boolean;
  isHazard(point: Readonly<RuntimePoint>): boolean;
  constrainToBossTerritory(point: Readonly<RuntimePoint>): Readonly<RuntimePoint & { corrected: boolean }>;
}

export const runtimeGroundPointIsSafe = (
  query: RuntimeSafeGroundQuery,
  point: Readonly<RuntimePoint>,
  clearance: number,
): boolean => {
  const samples: RuntimePoint[] = [{ ...point }];
  for (const radius of [Math.max(1, clearance * 0.55), Math.max(1, clearance)]) {
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      samples.push({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius });
    }
  }
  return samples.every((sample) => {
    const territory = query.constrainToBossTerritory(sample);
    return !territory.corrected && query.isWalkable(sample) && !query.isHazard(sample);
  });
};

export const nearestRuntimeSafeGroundPoint = (
  query: RuntimeSafeGroundQuery,
  rawPoint: Readonly<RuntimePoint>,
  clearance: number,
  accept: (point: Readonly<RuntimePoint>) => boolean = () => true,
  maxRadius = 220,
  step = 10,
): Readonly<RuntimePoint> | undefined => {
  const origin = query.constrainToBossTerritory(rawPoint);
  if (runtimeGroundPointIsSafe(query, origin, clearance) && accept(origin)) return { x: origin.x, y: origin.y };
  for (let radius = step; radius <= maxRadius; radius += step) {
    const samples = Math.max(16, Math.ceil(Math.PI * 2 * radius / step));
    for (let index = 0; index < samples; index += 1) {
      const angle = index * Math.PI * 2 / samples;
      const candidate = query.constrainToBossTerritory({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius });
      if (candidate.corrected || !runtimeGroundPointIsSafe(query, candidate, clearance) || !accept(candidate)) continue;
      return { x: candidate.x, y: candidate.y };
    }
  }
  return undefined;
};
