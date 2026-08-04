import { describe, expect, it } from 'vitest';
import { DamageQueue, simulateDamageFreezeRegression } from '../game/systems/DamageQueue';
import { WORD_REACTIONS } from '../game/systems/WordSystem';

const input = (handler = 'direct', targetEntityId = 'enemy-1') => ({
  runId: 1, actId: 'act-1', frameId: 1, sourceEntityId: 'hero', targetEntityId,
  baseSource: 'cut' as const, skillId: 'cut', damageKind: 'direct', handler,
});

describe('DamageQueue', () => {
  it('processes derived shared/card/reflected damage iteratively after its parent', () => {
    const queue = new DamageQueue(); const order: string[] = [];
    queue.beginFrame(1);
    expect(queue.submit(input(), 10, () => {
      order.push('direct');
      queue.submit({ ...input('share', 'enemy-2'), damageKind: 'shared', flags: ['shared', 'cannotTriggerShare'] }, 3, () => { order.push('shared'); return 3; });
      queue.submit({ ...input('card', 'enemy-2'), damageKind: 'card', flags: ['cardDerived', 'cannotTriggerCard'] }, 2, () => { order.push('card'); return 2; });
      queue.submit({ ...input('reflect', 'enemy-3'), damageKind: 'reflected', flags: ['reflected', 'cannotReflectAgain'] }, 4, () => { order.push('reflected'); return 4; });
      return 10;
    })).toBe(10);
    expect(order).toEqual(['direct', 'shared', 'card', 'reflected']);
    expect(queue.snapshot()).toMatchObject({ queueLength: 0, processedThisFrame: 4, blockedEvents: 0, maximumDepthSeen: 1 });
  });

  it('blocks the same handler/target from re-entering one root lineage', () => {
    const queue = new DamageQueue(); queue.beginFrame(1); let calls = 0;
    queue.submit(input(), 10, () => {
      calls += 1;
      queue.submit(input('loop'), 2, () => {
        calls += 1;
        queue.submit(input('loop'), 2, () => { calls += 1; return 2; });
        return 2;
      });
      return 10;
    });
    expect(calls).toBe(2);
    expect(queue.snapshot().blockedByReason['duplicate-handler']).toBe(1);
  });

  it('enforces depth, root and frame caps without throwing or retaining work', () => {
    const queue = new DamageQueue({ maximumDepth: 2, maximumDerivedPerRoot: 3, maximumEventsPerFrame: 4, historySize: 200 });
    queue.beginFrame(1);
    const recurse = (depth: number): number => {
      queue.submit(input(`depth-${depth}`, `enemy-${depth}`), 1, () => { if (depth < 10) recurse(depth + 1); return 1; });
      return 1;
    };
    expect(() => queue.submit(input(), 1, () => recurse(1))).not.toThrow();
    const snapshot = queue.snapshot();
    expect(snapshot.queueLength).toBe(0);
    expect(snapshot.blockedEvents).toBeGreaterThan(0);
    expect(snapshot.maximumDepthSeen).toBeLessThanOrEqual(2);
  });

  it('rejects stale run/Act events without executing them', () => {
    const queue = new DamageQueue(undefined, (runId, actId) => runId === 2 && actId === 'act-2');
    let applied = false;
    expect(queue.submit(input(), 5, () => { applied = true; return 5; })).toBe(0);
    expect(applied).toBe(false);
    expect(queue.snapshot().blockedByReason['stale-scope']).toBe(1);
  });

  it('survives 1,000 roots of recursive linked/card damage', () => {
    const result = simulateDamageFreezeRegression(1000);
    expect(result.roots).toBe(1000);
    expect(result.processed).toBeGreaterThan(1000);
    expect(result.blocked).toBeGreaterThan(0);
    expect(result.queueLength).toBe(0);
    expect(result.maximumDepth).toBeLessThanOrEqual(6);
  });

  it('passes the phase-three freeze regression thirty consecutive times', () => {
    for (let repetition = 0; repetition < 30; repetition += 1) {
      const result = simulateDamageFreezeRegression(1000);
      expect(result.queueLength).toBe(0);
      expect(result.processed).toBeGreaterThan(1000);
      expect(result.maximumDepth).toBeLessThanOrEqual(6);
    }
  }, 15_000);

  it('drains every word reaction with card and resonance descendants without synchronous re-entry', () => {
    const queue = new DamageQueue();
    let applied = 0;
    for (let root = 0; root < 1000; root += 1) {
      queue.beginFrame(root);
      const reaction = WORD_REACTIONS[root % WORD_REACTIONS.length]!;
      queue.submit({ ...input(`reaction:${reaction.id}`, `enemy-${root}`), skillId: reaction.id, damageKind: 'reaction', flags: ['echoDerived'] }, 14, () => {
        applied += 1;
        queue.submit({ ...input(`card:${reaction.id}`, `enemy-${root}`), skillId: reaction.id, cardId: 'derived-card', damageKind: 'card-derived', flags: ['cardDerived', 'cannotTriggerCard'] }, 4, () => { applied += 1; return 4; });
        queue.submit({ ...input(`resonance:${reaction.id}`, `enemy-${root}-linked`), skillId: reaction.id, resonanceId: 'derived-resonance', damageKind: 'resonance-derived', flags: ['resonanceDerived', 'cannotTriggerResonance', 'cannotTriggerShare'] }, 3, () => { applied += 1; return 3; });
        return 14;
      });
    }
    const snapshot = queue.snapshot();
    expect(applied).toBe(3000);
    expect(snapshot.queueLength).toBe(0);
    expect(snapshot.maximumDepthSeen).toBe(1);
    expect(snapshot.blockedEvents).toBe(0);
  });
});
