import { distanceToEllipse, sectorHitsEllipse, type Ellipse, type Point, type Sector } from './CombatGeometry';

export interface WeaponCandidate {
  id: string;
  hurtbox: Ellipse;
  alive: boolean;
  visible: boolean;
  attackable: boolean;
  insideCombatBounds: boolean;
}

export interface EchoBladeProfile {
  interval: number;
  range: number;
  damage: number;
  maximumTargets: number;
  orbitCount: 1 | 2;
}

export interface CutProfile {
  damage: number;
  range: number;
  halfAngle: number;
  cooldown: number;
  stoppedMultiplier: number;
  linkedMultiplier: number;
  echoMultiplier: number;
  exposedMultiplier: number;
}

export interface CutTargetState {
  stopped: boolean;
  linked: boolean;
  echo: boolean;
  exposed: boolean;
}

export function echoBladeProfile(
  base: Readonly<Omit<EchoBladeProfile, 'orbitCount'>>,
  dualMoonStacks: number,
  wideOrbitStacks: number,
): EchoBladeProfile {
  const twin = Math.max(0, Math.min(1, Math.floor(dualMoonStacks)));
  const wide = Math.max(0, Math.min(2, Math.floor(wideOrbitStacks)));
  return {
    interval: base.interval * (1 + wide * 0.12),
    range: base.range * (1 + wide * 0.22),
    damage: base.damage * (twin > 0 ? 1.36 : 1),
    maximumTargets: base.maximumTargets,
    orbitCount: twin > 0 ? 2 : 1,
  };
}

/** Circular proximity hit: no facing, score or selected target participates. */
export function echoBladeTargets(origin: Point, candidates: readonly WeaponCandidate[], profile: EchoBladeProfile): WeaponCandidate[] {
  return candidates
    .filter((candidate) => candidate.alive && candidate.visible && candidate.attackable && candidate.insideCombatBounds)
    .map((candidate) => ({ candidate, distance: distanceToEllipse(origin, candidate.hurtbox) }))
    .filter((item) => item.distance <= profile.range)
    .sort((first, second) => first.distance - second.distance || first.candidate.id.localeCompare(second.candidate.id))
    .slice(0, profile.maximumTargets)
    .map((item) => item.candidate);
}

export function quantizeEightDirection(direction: Point, fallbackAngle = 0): Readonly<{ x: number; y: number; angle: number }> {
  const rawAngle = Math.hypot(direction.x, direction.y) > 0.001 ? Math.atan2(direction.y, direction.x) : fallbackAngle;
  const step = Math.PI / 4;
  const angle = Math.round(rawAngle / step) * step;
  return { x: Math.cos(angle), y: Math.sin(angle), angle };
}

export function cutHitsTarget(origin: Point, angle: number, profile: CutProfile, hurtbox: Ellipse): boolean {
  const sector: Sector = { x: origin.x, y: origin.y, angle, range: profile.range, halfAngle: profile.halfAngle };
  return sectorHitsEllipse(sector, hurtbox);
}

export function cutDamageMultiplier(state: CutTargetState, profile: CutProfile): number {
  let multiplier = 1;
  if (state.stopped) multiplier *= profile.stoppedMultiplier;
  if (state.linked) multiplier *= profile.linkedMultiplier;
  if (state.echo) multiplier *= profile.echoMultiplier;
  if (state.exposed) multiplier *= profile.exposedMultiplier;
  return multiplier;
}

export function cutSentenceBonus(stopped: boolean, linked: boolean, stacks: number): number {
  return stopped || linked ? Math.max(0, Math.min(2, Math.floor(stacks))) * 9 : 0;
}

export function backflowBladeDamage(originalDamage: number, stacks: number): number {
  return stacks > 0 ? Math.max(0, originalDamage) * 0.65 : 0;
}

export function returningScarProfile(stacks: number): Readonly<{ replayCount: number; damageRatio: number }> {
  const count = Math.max(0, Math.min(2, Math.floor(stacks)));
  return { replayCount: count, damageRatio: count > 0 ? 0.42 : 0 };
}

export function isolationChainProfile(stacks: number): Readonly<{ isolatedMultiplier: number; explosionBonus: number }> {
  const count = Math.max(0, Math.min(2, Math.floor(stacks)));
  return { isolatedMultiplier: 1.18 + count * 0.1, explosionBonus: count * 12 };
}

export class WeaponCooldowns {
  private echoReadyAt = 0;
  private cutReadyAt = 0;

  public reset(now = 0): void { this.echoReadyAt = now; this.cutReadyAt = now; }
  public canEcho(now: number): boolean { return now >= this.echoReadyAt; }
  public canCut(now: number): boolean { return now >= this.cutReadyAt; }
  public commitEcho(now: number, intervalMs: number): void { this.echoReadyAt = now + Math.max(0, intervalMs); }
  public commitCut(now: number, cooldownMs: number): void { this.cutReadyAt = now + Math.max(0, cooldownMs); }
  public cutRemaining(now: number): number { return Math.max(0, this.cutReadyAt - now); }
  public snapshot(): Readonly<{ echoReadyAt: number; cutReadyAt: number }> { return { echoReadyAt: this.echoReadyAt, cutReadyAt: this.cutReadyAt }; }
}
