import type { ResonanceId, UpgradeId } from '../data/upgrades';

export const ACTIVE_EFFECT_HANDLERS: ReadonlySet<UpgradeId> = new Set([
  'dual-moon-echo', 'wide-orbit', 'cut-sentence', 'backflow-blade', 'returning-scar', 'isolation-chain',
  'chain-breath', 'stop-resonance', 'perfect-counter', 'counter-inscription', 'link-contagion', 'rewind-breath',
  'echo-harvest', 'ink-cloak', 'sentence-overcharge', 'rupture-step', 'sealed-sentence', 'fragment-recovery',
  'gravity-inscription', 'captured-projectile', 'deep-mark', 'contagious-mark', 'recoil-ripple', 'headwind-veil',
]);
export const RESONANCE_EFFECT_HANDLERS: ReadonlySet<ResonanceId> = new Set(['moon-ring', 'time-undertow', 'counter-cut', 'regression-chain', 'compression-seal', 'mark-chain', 'reversal-burst']);

export interface PerfectCounterProfile {
  cutReady: boolean;
  rangeMultiplier: number;
  ruptureBonus: number;
  duration: number;
}

export function perfectCounterProfile(stacks: number): PerfectCounterProfile {
  const active = stacks > 0;
  return { cutReady: active, rangeMultiplier: active ? 1.28 : 1, ruptureBonus: active ? 16 : 0, duration: active ? 2600 : 0 };
}

export function counterInscriptionProfile(stacks: number): { duration: number; damage: number } {
  const capped = Math.max(0, Math.min(2, Math.floor(stacks)));
  return { duration: capped > 0 ? 4000 : 0, damage: capped * 11 };
}

export function linkContagionProfile(stacks: number): { targets: number; duration: number; maximumGeneration: number } {
  return stacks > 0 ? { targets: 2, duration: 2400, maximumGeneration: 1 } : { targets: 0, duration: 0, maximumGeneration: 0 };
}

export function rewindBreathHealing(recoveredHealth: number, stacks: number): number {
  return Math.max(0, recoveredHealth) * Math.max(0, Math.min(2, Math.floor(stacks))) * .28;
}

export function echoHarvestGain(stacks: number, gainedDuringWindow: number): number {
  const capped = Math.max(0, Math.min(2, Math.floor(stacks)));
  const cap = capped * 6;
  return Math.max(0, Math.min(capped * 1.5, cap - Math.max(0, gainedDuringWindow)));
}

export function overchargedWordProfile(stacks: number, empowered: boolean): { multiplier: number; durationBonus: number } {
  return stacks > 0 && empowered ? { multiplier: 1.35, durationBonus: 500 } : { multiplier: 1, durationBonus: 0 };
}

export function ruptureStepProfile(stacks: number, dashAge: number): { active: boolean; damage: number; range: number } {
  const capped = Math.max(0, Math.min(2, Math.floor(stacks)));
  const active = capped > 0 && dashAge >= 0 && dashAge <= 1800;
  return { active, damage: active ? capped * 10 : 0, range: 142 };
}

export function stopResonanceProfile(stacks: number): { damage: number; radius: number; slowDuration: number } {
  const capped = Math.max(0, Math.min(2, Math.floor(stacks)));
  return { damage: capped * 9, radius: 76, slowDuration: capped > 0 ? 650 : 0 };
}

export function gravityInscriptionProfile(stacks: number): { rangeMultiplier: number; durationBonus: number; damage: number } {
  const capped = Math.max(0, Math.min(2, Math.floor(stacks)));
  return { rangeMultiplier: 1 + capped * .14, durationBonus: capped * 180, damage: capped * 8 };
}

export function deepMarkProfile(stacks: number): { maximumStacks: number; explosionDamage: number } {
  const capped = Math.max(0, Math.min(2, Math.floor(stacks)));
  return { maximumStacks: 3 + capped, explosionDamage: 24 + capped * 10 };
}

export function recoilRippleProfile(stacks: number): { damage: number; radius: number } {
  const capped = Math.max(0, Math.min(2, Math.floor(stacks)));
  return { damage: capped * 9, radius: 68 };
}

export function headwindVeilProfile(stacks: number): { reduction: number; duration: number } {
  const capped = Math.max(0, Math.min(2, Math.floor(stacks)));
  return { reduction: capped * .14, duration: capped > 0 ? 1300 : 0 };
}

export class ResonanceRuntime {
  private moonRingHits = 0;

  public registerMoonRingHit(active: boolean): boolean {
    if (!active) { this.moonRingHits = 0; return false; }
    this.moonRingHits += 1;
    if (this.moonRingHits < 4) return false;
    this.moonRingHits = 0;
    return true;
  }

  public reset(): void { this.moonRingHits = 0; }
  public snapshot(): { moonRingHits: number } { return { moonRingHits: this.moonRingHits }; }
}
