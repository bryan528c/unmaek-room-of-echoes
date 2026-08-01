import { distanceToEllipse, type Ellipse, type Point } from './CombatGeometry';

export type FinisherChargeSource = 'round-start' | 'parry' | 'perfect-parry' | 'word-chain' | 'boss-mechanic' | 'tutorial' | 'qa';
export type FinisherStatus = 'normal' | 'stopped' | 'linked' | 'echo';

export interface DefensiveSlashCandidate {
  id: string;
  hurtbox: Ellipse;
  alive: boolean;
  visible: boolean;
  attackable: boolean;
  insideCombatBounds: boolean;
}

export interface FinisherProfile {
  status: FinisherStatus;
  damageMultiplier: number;
  burstsStoppedArea: boolean;
  reactsThroughLinks: boolean;
  replaysEcho: boolean;
}

export class FinisherChargeSystem {
  private value = 0;

  public constructor(private readonly maximum: number) {}

  public gain(amount = 1): number {
    const previous = this.value;
    this.value = Math.min(this.maximum, this.value + Math.max(0, Math.floor(amount)));
    return this.value - previous;
  }

  public ensureMinimum(minimum: number): number {
    return this.gain(Math.max(0, Math.floor(minimum) - this.value));
  }

  public spend(): boolean {
    if (this.value <= 0) return false;
    this.value -= 1;
    return true;
  }

  public reset(): void { this.value = 0; }
  public get charges(): number { return this.value; }
  public get maxCharges(): number { return this.maximum; }
  public get ready(): boolean { return this.value > 0; }
}

export function selectDefensiveSlashTarget(
  origin: Point,
  candidates: readonly DefensiveSlashCandidate[],
  range: number,
): DefensiveSlashCandidate | undefined {
  return candidates
    .filter((candidate) => candidate.alive && candidate.visible && candidate.attackable && candidate.insideCombatBounds)
    .map((candidate) => ({ candidate, distance: distanceToEllipse(origin, candidate.hurtbox) }))
    .filter((item) => item.distance <= range)
    .sort((first, second) => first.distance - second.distance || first.candidate.id.localeCompare(second.candidate.id))[0]?.candidate;
}

export function finisherStatusFor(target: Readonly<{ stopped: boolean; linked: boolean; echo: boolean }>): FinisherStatus {
  if (target.stopped) return 'stopped';
  if (target.linked) return 'linked';
  if (target.echo) return 'echo';
  return 'normal';
}

export function finisherProfile(
  status: FinisherStatus,
  multipliers: Readonly<{ stopped: number; linked: number; echo: number }>,
): FinisherProfile {
  return {
    status,
    damageMultiplier: status === 'stopped' ? multipliers.stopped : status === 'linked' ? multipliers.linked : status === 'echo' ? multipliers.echo : 1,
    burstsStoppedArea: status === 'stopped',
    reactsThroughLinks: status === 'linked',
    replaysEcho: status === 'echo',
  };
}

export function repeatedAttackTtk(health: number, damage: number, intervalMs: number): number {
  if (health <= 0) return 0;
  if (damage <= 0 || intervalMs < 0) return Number.POSITIVE_INFINITY;
  const hits = Math.ceil(health / damage);
  return Math.max(0, hits - 1) * intervalMs / 1000;
}
