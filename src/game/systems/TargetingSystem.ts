export interface TargetCandidate {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  visible: boolean;
  attackable?: boolean;
  lineOfSight?: boolean;
  threat?: number;
  priority?: number;
}

export interface TargetOrigin { x: number; y: number }

export interface TargetingOptions {
  maximumRange: number;
  retainRange: number;
  forwardDot: number;
  minimumHold: number;
  switchThreshold: number;
  distanceWeight: number;
  angleWeight: number;
  currentBonus: number;
  threatWeight: number;
  priorityWeight: number;
  closeDangerWeight: number;
  closeDangerDistance: number;
}

const DEFAULT_OPTIONS: TargetingOptions = {
  maximumRange: 390,
  retainRange: 430,
  forwardDot: Math.cos(Math.PI * 0.38),
  minimumHold: 420,
  switchThreshold: 0.18,
  distanceWeight: 0.44,
  angleWeight: 0.36,
  currentBonus: 0.3,
  threatWeight: 0.2,
  priorityWeight: 0.16,
  closeDangerWeight: 0.18,
  closeDangerDistance: 96,
};

function distanceSquared(a: TargetOrigin, b: TargetOrigin): number {
  const dx = a.x - b.x; const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export class TargetingSystem {
  private currentId?: string;
  private selectedAt = 0;
  private manualId?: string;
  private direction = { x: 1, y: 0 };

  public constructor(private readonly options: TargetingOptions = DEFAULT_OPTIONS) {}

  public updateDirection(x: number, y: number): void {
    const length = Math.hypot(x, y);
    if (length < 0.01) return;
    this.direction = { x: x / length, y: y / length };
  }

  public select(origin: TargetOrigin, candidates: readonly TargetCandidate[], now = 0, comboLocked = false): TargetCandidate | undefined {
    const valid = this.validCandidates(origin, candidates, this.options.retainRange);
    const retained = valid.find((candidate) => candidate.id === this.currentId && distanceSquared(origin, candidate) <= this.options.retainRange ** 2);
    const manual = valid.find((candidate) => candidate.id === this.manualId);
    if (manual) return this.setCurrent(manual, now);
    this.manualId = undefined;
    if (retained && (comboLocked || now - this.selectedAt < this.options.minimumHold)) return retained;

    const inRange = this.validCandidates(origin, candidates, this.options.maximumRange);
    const forward = inRange.filter((candidate) => {
      const dx = candidate.x - origin.x; const dy = candidate.y - origin.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      return (dx / length) * this.direction.x + (dy / length) * this.direction.y >= this.options.forwardDot;
    });
    const pool = forward.length > 0 ? forward : inRange;
    const selected = [...pool].sort((a, b) => this.score(origin, b) - this.score(origin, a))[0];
    if (retained && selected && selected.id !== retained.id) {
      const gain = this.score(origin, selected) - this.score(origin, retained);
      if (gain < this.options.switchThreshold) return retained;
    }
    return selected ? this.setCurrent(selected, now) : this.setCurrent(undefined, now);
  }

  public cycle(origin: TargetOrigin, candidates: readonly TargetCandidate[], direction = 1, now = 0): TargetCandidate | undefined {
    const valid = this.validCandidates(origin, candidates, this.options.maximumRange)
      .sort((a, b) => Math.atan2(a.y - origin.y, a.x - origin.x) - Math.atan2(b.y - origin.y, b.x - origin.x));
    if (valid.length === 0) return this.setCurrent(undefined, now);
    const currentIndex = valid.findIndex((candidate) => candidate.id === this.currentId);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + (direction >= 0 ? 1 : -1) + valid.length) % valid.length;
    const selected = valid[nextIndex];
    this.manualId = selected?.id;
    return this.setCurrent(selected, now);
  }

  public releaseManual(): void { this.manualId = undefined; }

  public get lastDirection(): Readonly<{ x: number; y: number }> { return this.direction; }
  public get targetId(): string | undefined { return this.currentId; }
  public clear(): void { this.currentId = undefined; this.manualId = undefined; this.selectedAt = 0; }

  private validCandidates(origin: TargetOrigin, candidates: readonly TargetCandidate[], range: number): TargetCandidate[] {
    return candidates.filter((candidate) => candidate.alive && candidate.visible && candidate.attackable !== false && candidate.lineOfSight !== false
      && distanceSquared(origin, candidate) <= range ** 2);
  }

  private score(origin: TargetOrigin, candidate: TargetCandidate): number {
    const dx = candidate.x - origin.x; const dy = candidate.y - origin.y;
    const distance = Math.hypot(dx, dy);
    const dot = distance > 0.001 ? (dx / distance) * this.direction.x + (dy / distance) * this.direction.y : 1;
    const distanceScore = 1 - Math.min(1, distance / this.options.maximumRange);
    const angleScore = (dot + 1) * 0.5;
    const closeDanger = distance < this.options.closeDangerDistance ? 1 - distance / this.options.closeDangerDistance : 0;
    return distanceScore * this.options.distanceWeight + angleScore * this.options.angleWeight
      + (candidate.id === this.currentId ? this.options.currentBonus : 0)
      + Math.max(0, candidate.threat ?? 0) * this.options.threatWeight
      + Math.max(0, candidate.priority ?? 0) * this.options.priorityWeight
      + closeDanger * this.options.closeDangerWeight;
  }

  private setCurrent(candidate: TargetCandidate | undefined, now: number): TargetCandidate | undefined {
    if (candidate?.id !== this.currentId) this.selectedAt = now;
    this.currentId = candidate?.id;
    return candidate;
  }
}
