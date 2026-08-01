import { describe, expect, it } from 'vitest';
import type { EnemyDeathSource } from '../game/systems/CombatLifecycle';
import { WaveDirector, type WaveEnemySnapshot } from '../game/systems/WaveDirector';

const enemy = (id: string, overrides: Partial<WaveEnemySnapshot> = {}): WaveEnemySnapshot => ({
  id, active: true, visible: true, alive: true, destroyed: false, tracked: true, x: 100, y: 100, insideBounds: true, ...overrides,
});

describe('WaveDirector', () => {
  const sources: EnemyDeathSource[] = ['attack', 'projectile-reflect', 'stop', 'link', 'regression', 'knockback'];

  it.each(sources)('ends exactly once when the last enemy dies from %s', (source) => {
    const director = new WaveDirector(320, 1500); director.startWave(1, 0); director.registerSpawn('last', 0);
    expect(director.registerDeath('last', source, 10)).toBe(true);
    expect(director.evaluate(329, []).shouldTransition).toBe(false);
    expect(director.evaluate(330, []).shouldTransition).toBe(true);
    expect(director.evaluate(1000, []).shouldTransition).toBe(false);
    expect(director.snapshot().transitionCount).toBe(1);
  });

  it('handles multiple same-frame deaths and ignores duplicate death events', () => {
    const director = new WaveDirector(300, 1500); director.startWave(3, 0);
    for (const id of ['a', 'b', 'c']) director.registerSpawn(id, 0);
    expect(director.registerDeath('a', 'attack', 50)).toBe(true);
    expect(director.registerDeath('b', 'link', 50)).toBe(true);
    expect(director.registerDeath('c', 'regression', 50)).toBe(true);
    expect(director.registerDeath('c', 'regression', 50)).toBe(false);
    expect(director.evaluate(350, []).shouldTransition).toBe(true);
    expect(director.snapshot().transitionCount).toBe(1);
  });

  it('does not finish while a spawn is pending', () => {
    const director = new WaveDirector(300, 1500); director.startWave(2, 0); director.registerSpawn('a', 0); director.registerDeath('a', 'attack', 20);
    expect(director.evaluate(1000, []).shouldTransition).toBe(false);
    expect(director.snapshot().pendingSpawnCount).toBe(1);
    director.registerSpawn('b', 1100); director.registerDeath('b', 'attack', 1200);
    expect(director.evaluate(1500, []).shouldTransition).toBe(true);
  });

  it('recovers a destroyed stale registry entry after diagnostics grace', () => {
    const director = new WaveDirector(320, 1500); director.startWave(1, 0); director.registerSpawn('stale', 0);
    const stale = enemy('stale', { active: false, alive: false, destroyed: true, visible: false });
    expect(director.evaluate(100, [stale]).staleRemoved).toEqual([]);
    expect(director.evaluate(1600, [stale]).staleRemoved).toEqual(['stale']);
    expect(director.evaluate(1919, []).shouldTransition).toBe(false);
    expect(director.evaluate(1920, []).shouldTransition).toBe(true);
  });

  it('restores missing registry entries for real tracked enemies and ignores decorations', () => {
    const director = new WaveDirector(300, 1500); director.startWave(0, 0);
    const result = director.evaluate(10, [enemy('real'), enemy('box', { tracked: false })]);
    expect(result.unregisteredAdded).toEqual(['real']);
    expect(director.snapshot().livingEnemyIds).toEqual(['real']);
    expect(director.evaluate(1000, [enemy('real'), enemy('box', { tracked: false })]).shouldTransition).toBe(false);
  });

  it('does not delete a living out-of-bounds enemy', () => {
    const director = new WaveDirector(300, 1500); director.startWave(1, 0); director.registerSpawn('edge', 0);
    const result = director.evaluate(2000, [enemy('edge', { insideBounds: false })]);
    expect(result.outsideBounds).toEqual(['edge']);
    expect(director.snapshot().livingEnemyIds).toEqual(['edge']);
  });

  it('completes 30 consecutive rounds without duplicate transitions', () => {
    for (let round = 0; round < 30; round += 1) {
      const director = new WaveDirector(300, 1500); director.startWave(2, 0);
      director.registerSpawn(`a-${round}`, 0); director.registerSpawn(`b-${round}`, 0);
      director.registerDeath(`a-${round}`, 'attack', 10); director.registerDeath(`b-${round}`, 'projectile-reflect', 10);
      expect(director.evaluate(310, []).shouldTransition).toBe(true);
      expect(director.evaluate(1000, []).shouldTransition).toBe(false);
      expect(director.snapshot().transitionCount).toBe(1);
    }
  });
});
