import { BALANCE } from '../balance';
import { echoBladeProfile, isolationChainProfile, returningScarProfile } from './WeaponCombatSystem';
import { stopResonanceProfile } from './UpgradeRuntime';

export type UpgradeBuildPreset = 'regression-link' | 'stop-backflow' | 'echo-cut';

export interface UpgradeBuildSimulationResult {
  preset: UpgradeBuildPreset;
  durationSeconds: number;
  totalDamage: number;
  automaticDamage: number;
  directInputDamage: number;
  wordDamage: number;
  cardDamage: number;
  resonanceDamage: number;
  preventedDamage: number;
  statusUptime: number;
  failedConditions: number;
  bossPhaseSeconds: number;
  automaticDamageRatio: number;
  directInputRatio: number;
}

/**
 * Deterministic 60-second comparison harness. It deliberately models the same
 * fixed opportunity budget for every preset instead of pretending to be a
 * human playtest: 32 valid cuts, 8 parries, 10 Q, 7 E and 6 R windows.
 */
export function simulateUpgradeBuild(preset: UpgradeBuildPreset, durationSeconds = 60): UpgradeBuildSimulationResult {
  const duration = Math.max(1, durationSeconds);
  const scale = duration / 60;
  const cutHits = 32 * scale;
  const parries = 8 * scale;
  const stopUses = 10 * scale;
  const rewindUses = 7 * scale;
  const linkUses = 6 * scale;
  const baseCut = cutHits * BALANCE.hero.cut.damage;
  const baseWords = (stopUses * BALANCE.words.stopDamage * 1.35)
    + (rewindUses * BALANCE.words.rewindDamage * 1.2)
    + (linkUses * BALANCE.words.linkDamage * 2.1);
  const baseParry = parries * 9;
  const baseEcho = duration * (BALANCE.hero.echoBlade.damage * 1.25 / (BALANCE.hero.echoBlade.interval / 1000));

  let automaticDamage = baseEcho;
  let directInputDamage = baseCut + baseParry;
  let wordDamage = baseWords;
  let cardDamage = 0;
  let resonanceDamage = 0;
  let preventedDamage = 38 * scale;
  let statusUptime = .34;
  let failedConditions = 1;

  if (preset === 'regression-link') {
    const scar = returningScarProfile(2);
    const isolation = isolationChainProfile(1);
    const echoHits = rewindUses * scar.replayCount * .86;
    cardDamage += echoHits * BALANCE.hero.cut.damage * scar.damageRatio;
    cardDamage += (baseCut + baseWords * .55) * Math.max(0, isolation.isolatedMultiplier - BALANCE.words.singleLinkDamageTakenMultiplier) * .72;
    cardDamage += linkUses * isolation.explosionBonus * .72;
    resonanceDamage += rewindUses * BALANCE.hero.cut.damage * scar.damageRatio * .52;
    preventedDamage += 28 * scale;
    statusUptime = .57;
    failedConditions = Math.max(0, Math.round(rewindUses * .14));
  } else if (preset === 'stop-backflow') {
    const stop = stopResonanceProfile(2);
    cardDamage += stopUses * stop.damage * 1.45;
    const reflectedProjectiles = Math.min(stopUses * 2.2, stopUses * 3);
    resonanceDamage += reflectedProjectiles * 8 * .55;
    preventedDamage += reflectedProjectiles * 4.1;
    // Control is the defensive strength; its direct-output budget is kept
    // below the active cut preset so it cannot lead both axes at once.
    wordDamage *= .96;
    statusUptime = .63;
    failedConditions = Math.max(0, Math.round(stopUses * .1));
  } else {
    const echo = echoBladeProfile(BALANCE.hero.echoBlade, 1, 2);
    const upgradedEcho = duration * (echo.damage * 1.55 / (echo.interval / 1000));
    cardDamage += Math.max(0, upgradedEcho - baseEcho);
    automaticDamage = upgradedEcho;
    resonanceDamage += Math.floor((duration * 1000 / echo.interval) * 1.55 / 4) * 8.5;
    directInputDamage *= 1.08;
    preventedDamage += 5 * scale;
    statusUptime = .38;
    failedConditions = 0;
  }

  const totalDamage = automaticDamage + directInputDamage + wordDamage + cardDamage + resonanceDamage;
  const bossHealthBudget = 980;
  return {
    preset,
    durationSeconds: duration,
    totalDamage,
    automaticDamage,
    directInputDamage,
    wordDamage,
    cardDamage,
    resonanceDamage,
    preventedDamage,
    statusUptime,
    failedConditions,
    bossPhaseSeconds: Math.max(18, bossHealthBudget / Math.max(1, totalDamage / duration)),
    automaticDamageRatio: automaticDamage / totalDamage,
    directInputRatio: (directInputDamage + wordDamage) / totalDamage,
  };
}

export function simulateAllUpgradeBuilds(durationSeconds = 60): UpgradeBuildSimulationResult[] {
  return (['regression-link', 'stop-backflow', 'echo-cut'] as const).map((preset) => simulateUpgradeBuild(preset, durationSeconds));
}
