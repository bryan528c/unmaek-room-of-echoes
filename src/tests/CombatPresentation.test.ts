import { describe, expect, it } from 'vitest';
import { modifierDefinition, modifierLabel } from '../game/systems/ActModifiers';
import { attackDisplayName, enemyDisplayName } from '../game/systems/CombatPresentation';

describe('player-facing combat presentation', () => {
  it('never exposes endless modifier IDs', () => {
    expect(modifierLabel('time-rift')).toBe('시간 균열');
    expect(modifierLabel('stitched-armor')).toBe('봉합 갑주');
    expect(modifierDefinition('time-rift')).toMatchObject({ shortDescription: expect.any(String), counterHint: expect.any(String), iconKey: 'time-rift' });
  });
  it('maps internal enemy and attack identifiers to Korean names', () => {
    expect(enemyDisplayName('chaser')).toBe('추적자');
    expect(enemyDisplayName('archer')).toBe('궁수');
    expect(attackDisplayName('chaser-59:melee:2')).toBe('돌진');
  });
});
