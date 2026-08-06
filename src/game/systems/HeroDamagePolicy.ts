export type HeroDamageRejectionReason =
  | 'FLOW_LOCKED'
  | 'GOD_MODE'
  | 'BOSS_TRANSITION'
  | 'REWINDING'
  | 'DASHING'
  | 'HIT_INVULNERABILITY'
  | 'HERO_INACTIVE';

export interface DevelopmentCombatFlags {
  qa: boolean;
  godMode: boolean;
}

export const resolveDevelopmentCombatFlags = (search: string, development: boolean): DevelopmentCombatFlags => {
  if (!development) return { qa: false, godMode: false };
  const params = new URLSearchParams(search);
  return { qa: params.has('qa'), godMode: params.get('godMode') === '1' };
};

export const sceneDamageRejectionReason = (input: Readonly<{
  flowLocked: boolean;
  godMode: boolean;
  bossTransition: boolean;
}>): HeroDamageRejectionReason | undefined => {
  if (input.flowLocked) return 'FLOW_LOCKED';
  if (input.godMode) return 'GOD_MODE';
  if (input.bossTransition) return 'BOSS_TRANSITION';
  return undefined;
};

export const heroDamageRejectionReason = (input: Readonly<{
  rewinding: boolean;
  dashing: boolean;
  now: number;
  invulnerableUntil: number;
  active: boolean;
}>): HeroDamageRejectionReason | undefined => {
  if (input.rewinding) return 'REWINDING';
  if (input.dashing) return 'DASHING';
  if (input.now < input.invulnerableUntil) return 'HIT_INVULNERABILITY';
  if (!input.active) return 'HERO_INACTIVE';
  return undefined;
};
