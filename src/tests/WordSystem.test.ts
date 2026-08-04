import { describe, expect, it } from 'vitest';
import { UpgradeSystem } from '../game/systems/UpgradeSystem';
import { WordChainSystem } from '../game/systems/WordChainSystem';
import {
  availableReactionCount,
  DEFAULT_WORD_LOADOUT,
  reactionFor,
  validWordLoadout,
  WORD_DEFINITIONS,
  WORD_IDS,
  WORD_REACTIONS,
  WordLoadoutState,
  WordStatusRuntime,
  type WordId,
} from '../game/systems/WordSystem';

describe('WORD-SYNERGY-06 data model', () => {
  it('defines six distinct words and eleven named reactions', () => {
    expect(WORD_IDS).toEqual(['stop', 'rewind', 'link', 'pull', 'mark', 'push']);
    expect(new Set(WORD_IDS.map((id) => WORD_DEFINITIONS[id].displayName)).size).toBe(6);
    expect(WORD_REACTIONS).toHaveLength(11);
    for (const word of ['pull', 'mark', 'push'] as const) expect(WORD_REACTIONS.filter((item) => item.firstWordId === word || item.secondWordId === word).length).toBeGreaterThanOrEqual(2);
  });

  it('validates and fixes a Q/E/R loadout for one Run', () => {
    expect(validWordLoadout(['pull', 'link', 'push'])).toBe(true);
    expect(validWordLoadout(['pull', 'pull', 'push'])).toBe(false);
    const state = new WordLoadoutState(['pull', 'link', 'push']);
    expect(state.wordForSlot('Q')).toBe('pull'); expect(state.wordForSlot('E')).toBe('link'); expect(state.wordForSlot('R')).toBe('push');
    expect(new WordLoadoutState(['bad']).finalize()).toEqual(DEFAULT_WORD_LOADOUT);
  });

  it('scopes status duration, stacks and cleanup by entity', () => {
    const statuses = new WordStatusRuntime();
    const base = { id: 'MARKED' as const, sourceWordId: 'mark' as const, duration: 1000, now: 20, sourceEntityId: 'hero', runId: 2, actId: 'run-2-act-1', visualKey: 'mark', consumedBy: ['reaction'], canSpread: true, canTriggerReaction: true };
    statuses.apply('enemy-1', base); statuses.apply('enemy-1', { ...base, now: 50 });
    expect(statuses.get('enemy-1', 'MARKED', 100)?.stacks).toBe(2);
    expect(statuses.has('enemy-1', 'MARKED', 1100)).toBe(false);
    statuses.apply('enemy-2', base); statuses.removeEntity('enemy-2'); expect(statuses.count('MARKED', 100)).toBe(0);
  });

  it('all compatible pairs resolve and missing conditions use a fallback', () => {
    for (const reaction of WORD_REACTIONS) {
      expect(reactionFor(reaction.firstWordId, reaction.secondWordId)?.id).toBe(reaction.id);
      const chains = new WordChainSystem(4300); chains.use(reaction.firstWordId, 0, { successful: true });
      const result = chains.use(reaction.secondWordId, 100, { successful: true, relevantTargetCount: 0 });
      expect(result.chain).toBe(reaction.id);
      expect(result.reactionName).toBe(reaction.displayName);
    }
  });

  it('gives every reaction a user-facing result, fallback, visual and audio identity', () => {
    for (const reaction of WORD_REACTIONS) {
      expect(reaction.displayName.length, reaction.id).toBeGreaterThan(1);
      expect(reaction.resultEffect.length, reaction.id).toBeGreaterThan(4);
      expect(reaction.fallbackEffect.length, reaction.id).toBeGreaterThan(4);
      expect(reaction.visualKey, reaction.id).toMatch(/^seal-/);
      expect(reaction.audioKey, reaction.id).toBeTruthy();
    }
  });

  it('filters unequipped word cards without hiding neutral combat cards', () => {
    const oldWords = new UpgradeSystem().choices(24, () => .31, { equippedWordIds: ['stop', 'rewind', 'link'] });
    expect(oldWords.some((card) => card.requiredWordIds?.includes('pull'))).toBe(false);
    const newWords = new UpgradeSystem().choices(24, () => .31, { equippedWordIds: ['pull', 'mark', 'push'] });
    expect(newWords.some((card) => card.id === 'gravity-inscription' || card.id === 'captured-projectile')).toBe(true);
    expect(availableReactionCount(['pull', 'link', 'push'])).toBeGreaterThanOrEqual(3);
  });

  it('keeps all three recommended presets reaction-capable', () => {
    expect(availableReactionCount(['stop', 'rewind', 'link'])).toBe(3);
    expect(availableReactionCount(['pull', 'link', 'push'])).toBeGreaterThanOrEqual(3);
    expect(availableReactionCount(['mark', 'stop', 'rewind'])).toBeGreaterThanOrEqual(2);
  });

  it('allows at least eight deliberate reactions within fifty uses for each QA preset', () => {
    const presets: readonly (readonly WordId[])[] = [DEFAULT_WORD_LOADOUT, ['pull', 'link', 'push'], ['mark', 'stop', 'rewind']];
    for (const loadout of presets) {
      const compatible = WORD_REACTIONS.filter((reaction) => loadout.includes(reaction.firstWordId) && loadout.includes(reaction.secondWordId));
      const chains = new WordChainSystem(4300); let reactions = 0; let now = 0;
      for (let use = 0; use < 50; use += 2) {
        const reaction = compatible[(use / 2) % compatible.length]!;
        chains.use(reaction.firstWordId, now, { successful: true, relevantTargetCount: 2 });
        const result = chains.use(reaction.secondWordId, now + 500, { successful: true, relevantTargetCount: 2, hasLinkedTargets: true, hasFrozenProjectiles: true, hasRecordedDamage: true });
        if (result.chain) reactions += 1;
        now += 1000;
      }
      expect(reactions, loadout.join('/')).toBeGreaterThanOrEqual(8);
    }
  });
});
