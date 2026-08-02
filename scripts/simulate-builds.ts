import { simulateAllUpgradeBuilds } from '../src/game/systems/UpgradeBuildSimulation';

console.log(JSON.stringify(simulateAllUpgradeBuilds(60).map((result) => ({
  preset: result.preset,
  totalDamage: Math.round(result.totalDamage),
  cardAndResonanceDamage: Math.round(result.cardDamage + result.resonanceDamage),
  preventedDamage: Math.round(result.preventedDamage),
  statusUptimePercent: Math.round(result.statusUptime * 100),
  failedConditions: result.failedConditions,
  bossPhaseSeconds: Number(result.bossPhaseSeconds.toFixed(1)),
  automaticDamagePercent: Math.round(result.automaticDamageRatio * 100),
  directInputPercent: Math.round(result.directInputRatio * 100),
})), null, 2));
