import { describe, expect, it } from 'vitest';
import { simulateAllUpgradeBuilds, simulateUpgradeBuild } from '../game/systems/UpgradeBuildSimulation';

describe('fixed UPGRADE-04R build comparison', () => {
  it('keeps all three presets viable without one winning damage and defense together', () => {
    const builds = simulateAllUpgradeBuilds(60);
    const damages = builds.map((build) => build.totalDamage);
    expect(Math.min(...damages)).toBeGreaterThan(900);
    expect(Math.max(...damages) / Math.min(...damages)).toBeLessThan(1.45);
    const damageLeader = [...builds].sort((a, b) => b.totalDamage - a.totalDamage)[0];
    const defenseLeader = [...builds].sort((a, b) => b.preventedDamage - a.preventedDamage)[0];
    expect(damageLeader?.preset).not.toBe(defenseLeader?.preset);
  });

  it('keeps the echo build below automatic-play dominance', () => {
    const echo = simulateUpgradeBuild('echo-cut', 60);
    expect(echo.automaticDamageRatio).toBeLessThan(.55);
    expect(echo.directInputRatio).toBeGreaterThan(.35);
  });

  it('rewards the harder regression condition and caps stop control', () => {
    const regression = simulateUpgradeBuild('regression-link', 60);
    const stop = simulateUpgradeBuild('stop-backflow', 60);
    expect(regression.cardDamage + regression.resonanceDamage).toBeGreaterThan(120);
    expect(regression.failedConditions).toBeLessThanOrEqual(1);
    expect(stop.statusUptime).toBeLessThan(.7);
    expect(stop.preventedDamage).toBeGreaterThan(regression.preventedDamage);
  });
});
