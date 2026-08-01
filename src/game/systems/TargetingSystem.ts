import { distanceToEllipse, type Ellipse } from './CombatGeometry';

export interface TargetCandidate {
  id: string;
  x: number;
  y: number;
  alive: boolean;
  visible: boolean;
  attackable?: boolean;
  lineOfSight?: boolean;
  insideCombatBounds?: boolean;
  removing?: boolean;
  threat?: number;
  priority?: number;
  hurtbox?: Ellipse;
}

export interface TargetOrigin { x: number; y: number }

export interface TargetingOptions {
  attackRange: number;
  lungeRange: number;
  wordRange: number;
  emergencyDistance: number;
  distanceTie: number;
  forwardTieWeight: number;
  threatTieWeight: number;
  markerLerp: number;
  markerDuration: number;
}

export interface SoftTargetOptions {
  range?: number;
  assistRange?: number;
  emergencyDistance?: number;
  attackOriginOffset?: number;
}

export interface TargetSelection {
  candidate: TargetCandidate;
  hurtboxDistance: number;
  direction: Readonly<{ x: number; y: number }>;
  requiresLunge: boolean;
}

const DEFAULT_OPTIONS: TargetingOptions = {
  attackRange: 62,
  lungeRange: 28,
  wordRange: 270,
  emergencyDistance: 24,
  distanceTie: 6,
  forwardTieWeight: 9,
  threatTieWeight: 5,
  markerLerp: 0.32,
  markerDuration: 420,
};

interface ScoredCandidate {
  candidate: TargetCandidate;
  hurtboxDistance: number;
  centerDistance: number;
  dot: number;
  category: number;
  tieScore: number;
}

export class TargetingSystem {
  private direction = { x: 1, y: 0 };
  private lastSelectedId?: string;

  public constructor(private readonly options: TargetingOptions = DEFAULT_OPTIONS) {}

  public updateDirection(x: number, y: number): void {
    const length = Math.hypot(x, y);
    if (length < 0.01) return;
    this.direction = { x: x / length, y: y / length };
  }

  public selectSoft(origin: TargetOrigin, candidates: readonly TargetCandidate[], selection: SoftTargetOptions = {}): TargetSelection | undefined {
    const range = selection.range ?? this.options.attackRange;
    const assistRange = selection.assistRange ?? range + this.options.lungeRange;
    const emergencyDistance = selection.emergencyDistance ?? this.options.emergencyDistance;
    const scored = this.validCandidates(candidates).map((candidate): ScoredCandidate => {
      const hurtbox = candidate.hurtbox ?? { x: candidate.x, y: candidate.y, radiusX: 0, radiusY: 0 };
      const dx = hurtbox.x - origin.x; const dy = hurtbox.y - origin.y;
      const centerDistance = Math.max(0.001, Math.hypot(dx, dy));
      const attackOrigin = {
        x: origin.x + dx / centerDistance * (selection.attackOriginOffset ?? 0),
        y: origin.y + dy / centerDistance * (selection.attackOriginOffset ?? 0),
      };
      const hurtboxDistance = distanceToEllipse(attackOrigin, hurtbox);
      const dot = dx / centerDistance * this.direction.x + dy / centerDistance * this.direction.y;
      const category = hurtboxDistance <= emergencyDistance ? 0 : hurtboxDistance <= range ? 1 : hurtboxDistance <= assistRange ? 2 : 3;
      const tieScore = dot * this.options.forwardTieWeight + Math.max(0, candidate.threat ?? 0) * this.options.threatTieWeight
        + Math.max(0, candidate.priority ?? 0) * 2;
      return { candidate, hurtboxDistance, centerDistance, dot, category, tieScore };
    }).filter((item) => item.hurtboxDistance <= assistRange);
    scored.sort((a, b) => {
      if (a.category !== b.category) return a.category - b.category;
      const distanceDifference = a.hurtboxDistance - b.hurtboxDistance;
      if (Math.abs(distanceDifference) > this.options.distanceTie) return distanceDifference;
      if (a.tieScore !== b.tieScore) return b.tieScore - a.tieScore;
      return a.centerDistance - b.centerDistance;
    });
    const selected = scored[0];
    if (!selected) { this.lastSelectedId = undefined; return undefined; }
    this.lastSelectedId = selected.candidate.id;
    const target = selected.candidate.hurtbox ?? { x: selected.candidate.x, y: selected.candidate.y, radiusX: 0, radiusY: 0 };
    const dx = target.x - origin.x; const dy = target.y - origin.y; const length = Math.max(0.001, Math.hypot(dx, dy));
    return {
      candidate: selected.candidate,
      hurtboxDistance: selected.hurtboxDistance,
      direction: { x: dx / length, y: dy / length },
      requiresLunge: selected.hurtboxDistance > range,
    };
  }

  /** Keeps a valid held-input target; only re-evaluates the candidate set after that target becomes invalid. */
  public selectHeld(origin: TargetOrigin, candidates: readonly TargetCandidate[], heldTargetId: string | undefined, selection: SoftTargetOptions = {}): TargetSelection | undefined {
    const held = heldTargetId ? candidates.find((candidate) => candidate.id === heldTargetId) : undefined;
    if (held) {
      const retained = this.selectSoft(origin, [held], selection);
      if (retained) return retained;
    }
    return this.selectSoft(origin, candidates, selection);
  }

  public select(origin: TargetOrigin, candidates: readonly TargetCandidate[]): TargetCandidate | undefined {
    return this.selectSoft(origin, candidates, { range: this.options.wordRange, assistRange: this.options.wordRange })?.candidate;
  }

  public distanceToCandidate(origin: TargetOrigin, candidate: TargetCandidate): number {
    return distanceToEllipse(origin, candidate.hurtbox ?? { x: candidate.x, y: candidate.y, radiusX: 0, radiusY: 0 });
  }

  public get lastDirection(): Readonly<{ x: number; y: number }> { return this.direction; }
  public get targetId(): string | undefined { return this.lastSelectedId; }
  public clearSelection(): void { this.lastSelectedId = undefined; }
  public clear(): void { this.lastSelectedId = undefined; this.direction = { x: 1, y: 0 }; }

  private validCandidates(candidates: readonly TargetCandidate[]): TargetCandidate[] {
    return candidates.filter((candidate) => candidate.alive && candidate.visible && candidate.attackable !== false
      && candidate.lineOfSight !== false && candidate.insideCombatBounds !== false && !candidate.removing);
  }
}

export class SoftTargetLock {
  private lockedId?: string;
  private lockedDirection = { x: 1, y: 0 };
  private active = false;

  public begin(targetId: string | undefined, direction: Readonly<{ x: number; y: number }>): boolean {
    if (this.active) return false;
    const length = Math.max(0.001, Math.hypot(direction.x, direction.y));
    this.lockedId = targetId; this.lockedDirection = { x: direction.x / length, y: direction.y / length }; this.active = true;
    return true;
  }

  public tryRetarget(targetId: string): boolean {
    if (this.active) return targetId === this.lockedId;
    this.lockedId = targetId; return true;
  }

  public clear(): void { this.active = false; this.lockedId = undefined; }
  public get targetId(): string | undefined { return this.lockedId; }
  public get direction(): Readonly<{ x: number; y: number }> { return this.lockedDirection; }
  public get isActive(): boolean { return this.active; }
}
