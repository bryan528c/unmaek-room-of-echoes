export interface TargetCandidate {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  visible: boolean;
}

export interface TargetOrigin { x: number; y: number }

export interface TargetingOptions {
  maximumRange: number;
  retainRange: number;
  forwardDot: number;
}

const DEFAULT_OPTIONS: TargetingOptions = {
  maximumRange: 390,
  retainRange: 430,
  forwardDot: Math.cos(Math.PI * 0.38),
};

function distanceSquared(a: TargetOrigin, b: TargetOrigin): number {
  const dx = a.x - b.x; const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export class TargetingSystem {
  private currentId?: string;
  private direction = { x: 1, y: 0 };

  public constructor(private readonly options: TargetingOptions = DEFAULT_OPTIONS) {}

  public updateDirection(x: number, y: number): void {
    const length = Math.hypot(x, y);
    if (length < 0.01) return;
    this.direction = { x: x / length, y: y / length };
  }

  public select(origin: TargetOrigin, candidates: readonly TargetCandidate[]): TargetCandidate | undefined {
    const valid = candidates.filter((candidate) => candidate.alive && candidate.visible);
    const retained = valid.find((candidate) => candidate.id === this.currentId && distanceSquared(origin, candidate) <= this.options.retainRange ** 2);
    if (retained) return retained;

    const inRange = valid.filter((candidate) => distanceSquared(origin, candidate) <= this.options.maximumRange ** 2);
    const forward = inRange.filter((candidate) => {
      const dx = candidate.x - origin.x; const dy = candidate.y - origin.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      return (dx / length) * this.direction.x + (dy / length) * this.direction.y >= this.options.forwardDot;
    });
    const pool = forward.length > 0 ? forward : inRange;
    const selected = [...pool].sort((a, b) => distanceSquared(origin, a) - distanceSquared(origin, b))[0];
    this.currentId = selected?.id;
    return selected;
  }

  public get lastDirection(): Readonly<{ x: number; y: number }> { return this.direction; }
  public get targetId(): string | undefined { return this.currentId; }
  public clear(): void { this.currentId = undefined; }
}
