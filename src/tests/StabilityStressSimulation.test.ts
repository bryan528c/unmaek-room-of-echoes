import { describe, expect, it } from 'vitest';
import { runStabilityStressSimulation } from '../game/systems/StabilityStressSimulation';

describe('STABILITY-01 accelerated stress simulation', () => {
  it('simulates ten minutes and twenty scene restarts without stale pause state', () => {
    const report = runStabilityStressSimulation();
    expect(report.simulatedMs).toBe(600_000);
    expect(report.restarts).toBe(20);
    expect(report.hitstops).toBeGreaterThan(1000);
    expect(report.parries).toBeGreaterThan(500);
    expect(report.unexpectedPauseStates).toBe(0);
    expect(report.staleTokens).toBe(0);
  });

  it('simulates a twenty-minute word/reaction Run without accumulating pause tokens', () => {
    const report = runStabilityStressSimulation(1_200_000, 20);
    expect(report.simulatedMs).toBe(1_200_000);
    expect(report.restarts).toBe(20);
    expect(report.hitstops).toBeGreaterThan(4000);
    expect(report.parries).toBeGreaterThan(2500);
    expect(report.unexpectedPauseStates).toBe(0);
    expect(report.staleTokens).toBe(0);
  });
});
