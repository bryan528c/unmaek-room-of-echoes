export type DamageEventFlag =
  | 'direct'
  | 'shared'
  | 'reflected'
  | 'cardDerived'
  | 'resonanceDerived'
  | 'echoDerived'
  | 'cannotTriggerShare'
  | 'cannotTriggerCard'
  | 'cannotTriggerResonance'
  | 'cannotReflectAgain';

export interface DamageQueueConfig {
  maximumDepth: number;
  maximumDerivedPerRoot: number;
  maximumEventsPerFrame: number;
  historySize: number;
}

export const DEFAULT_DAMAGE_QUEUE_CONFIG: Readonly<DamageQueueConfig> = {
  maximumDepth: 6,
  maximumDerivedPerRoot: 64,
  maximumEventsPerFrame: 256,
  historySize: 200,
};

export interface DamageEventInput {
  runId: number;
  actId: string;
  frameId: number;
  sourceEntityId?: string;
  targetEntityId: string;
  baseSource: 'echoBlade' | 'cut' | 'parry' | 'word' | 'other';
  skillId?: string;
  cardId?: string;
  resonanceId?: string;
  modifierSourceIds?: readonly string[];
  damageKind: string;
  handler: string;
  flags?: readonly DamageEventFlag[];
}

export interface DamageQueueEvent extends DamageEventInput {
  eventId: string;
  rootEventId: string;
  parentEventId?: string;
  depth: number;
  processedHandlers: readonly string[];
}

export type DamageBlockReason = 'maximum-depth' | 'root-event-limit' | 'frame-event-limit' | 'duplicate-handler' | 'stale-scope' | 'executor-error';

export interface DamageTrace extends DamageQueueEvent {
  amount: number;
  appliedAmount: number;
  queueLength: number;
  blockedReason?: DamageBlockReason;
}

export interface DamageQueueSnapshot {
  queueLength: number;
  processedThisFrame: number;
  maximumDepthSeen: number;
  blockedEvents: number;
  blockedByReason: Readonly<Record<DamageBlockReason, number>>;
  lastRootEventId?: string;
  lastRootLineage: readonly DamageTrace[];
  recent: readonly DamageTrace[];
}

interface QueuedDamage {
  event: DamageQueueEvent;
  amount: number;
  execute: () => number;
  onApplied?: (amount: number) => void;
  result: number;
}

interface RootState {
  derived: number;
  handlerKeys: Set<string>;
}

const blankBlocked = (): Record<DamageBlockReason, number> => ({
  'maximum-depth': 0,
  'root-event-limit': 0,
  'frame-event-limit': 0,
  'duplicate-handler': 0,
  'stale-scope': 0,
  'executor-error': 0,
});

/**
 * Iterative damage dispatcher. Any damage requested by a damage/death handler
 * is appended to the current root lineage instead of re-entering the call
 * stack. Limits discard only the unsafe derived packet, never the game loop.
 */
export class DamageQueue {
  private readonly queue: QueuedDamage[] = [];
  private readonly roots = new Map<string, RootState>();
  private readonly history: DamageTrace[] = [];
  private readonly blockedByReason = blankBlocked();
  private current?: DamageQueueEvent;
  private draining = false;
  private sequence = 0;
  private currentFrame = -1;
  private processedThisFrame = 0;
  private maximumDepthSeen = 0;
  private blockedEvents = 0;
  private lastRootEventId?: string;

  public constructor(
    private readonly config: Readonly<DamageQueueConfig> = DEFAULT_DAMAGE_QUEUE_CONFIG,
    private readonly scopeIsCurrent: (runId: number, actId: string) => boolean = () => true,
    private readonly report?: (trace: DamageTrace) => void,
  ) {}

  public beginFrame(frameId: number): void {
    if (frameId === this.currentFrame) return;
    this.currentFrame = frameId;
    this.processedThisFrame = 0;
  }

  public submit(input: DamageEventInput, amount: number, execute: () => number, onApplied?: (amount: number) => void): number {
    const parent = this.current;
    const eventId = `damage-${this.sequence += 1}`;
    const rootEventId = parent?.rootEventId ?? eventId;
    const depth = parent ? parent.depth + 1 : 0;
    const root = this.roots.get(rootEventId) ?? { derived: 0, handlerKeys: new Set<string>() };
    this.roots.set(rootEventId, root);
    const handlerKey = `${input.handler}:${input.targetEntityId}`;
    const event: DamageQueueEvent = {
      ...input,
      eventId,
      rootEventId,
      parentEventId: parent?.eventId,
      depth,
      processedHandlers: [...root.handlerKeys],
    };
    const blocked = this.blockReason(event, root, handlerKey);
    if (blocked) {
      this.record(event, amount, 0, blocked);
      return 0;
    }
    root.handlerKeys.add(handlerKey);
    if (depth > 0) root.derived += 1;
    const queued: QueuedDamage = { event, amount: Math.max(0, amount), execute, onApplied, result: 0 };
    this.queue.push(queued);
    if (!this.draining) this.drain();
    return queued.result;
  }

  public rejectStale(input: DamageEventInput, amount: number): void {
    const eventId = `damage-${this.sequence += 1}`;
    this.record({ ...input, eventId, rootEventId: eventId, depth: 0, processedHandlers: [] }, amount, 0, 'stale-scope');
  }

  public snapshot(): DamageQueueSnapshot {
    return {
      queueLength: this.queue.length,
      processedThisFrame: this.processedThisFrame,
      maximumDepthSeen: this.maximumDepthSeen,
      blockedEvents: this.blockedEvents,
      blockedByReason: { ...this.blockedByReason },
      lastRootEventId: this.lastRootEventId,
      lastRootLineage: this.lastRootEventId ? this.history.filter((entry) => entry.rootEventId === this.lastRootEventId) : [],
      recent: [...this.history],
    };
  }

  public reset(): void {
    this.queue.length = 0;
    this.roots.clear();
    this.history.length = 0;
    Object.assign(this.blockedByReason, blankBlocked());
    this.current = undefined;
    this.draining = false;
    this.currentFrame = -1;
    this.processedThisFrame = 0;
    this.maximumDepthSeen = 0;
    this.blockedEvents = 0;
    this.lastRootEventId = undefined;
  }

  private blockReason(event: DamageQueueEvent, root: RootState, handlerKey: string): DamageBlockReason | undefined {
    if (!this.scopeIsCurrent(event.runId, event.actId)) return 'stale-scope';
    if (event.depth > this.config.maximumDepth) return 'maximum-depth';
    if (event.depth > 0 && root.derived >= this.config.maximumDerivedPerRoot) return 'root-event-limit';
    if (this.processedThisFrame + this.queue.length >= this.config.maximumEventsPerFrame) return 'frame-event-limit';
    if (root.handlerKeys.has(handlerKey)) return 'duplicate-handler';
    return undefined;
  }

  private drain(): void {
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const queued = this.queue.shift();
        if (!queued) break;
        if (this.processedThisFrame >= this.config.maximumEventsPerFrame) {
          this.record(queued.event, queued.amount, 0, 'frame-event-limit');
          continue;
        }
        this.current = queued.event;
        this.maximumDepthSeen = Math.max(this.maximumDepthSeen, queued.event.depth);
        this.processedThisFrame += 1;
        try {
          queued.result = Math.max(0, queued.execute());
          queued.onApplied?.(queued.result);
          this.record(queued.event, queued.amount, queued.result);
        } catch (error) {
          this.record(queued.event, queued.amount, 0, 'executor-error');
          if (import.meta.env.DEV) console.error('[DamageQueue] damage executor failed', { event: queued.event, error });
        } finally {
          this.current = undefined;
        }
      }
    } finally {
      this.draining = false;
      this.current = undefined;
      this.roots.clear();
    }
  }

  private record(event: DamageQueueEvent, amount: number, appliedAmount: number, blockedReason?: DamageBlockReason): void {
    const trace: DamageTrace = { ...event, amount: Math.max(0, amount), appliedAmount: Math.max(0, appliedAmount), queueLength: this.queue.length, blockedReason };
    this.lastRootEventId = event.rootEventId;
    this.history.push(trace);
    if (this.history.length > this.config.historySize) this.history.splice(0, this.history.length - this.config.historySize);
    if (blockedReason) { this.blockedEvents += 1; this.blockedByReason[blockedReason] += 1; this.report?.(trace); }
  }
}

export interface DamageQueueStressReport {
  roots: number;
  processed: number;
  blocked: number;
  queueLength: number;
  maximumDepth: number;
}

/** Reproduces linked/card/resonance re-entry without depending on Phaser. */
export function simulateDamageFreezeRegression(roots = 1000): DamageQueueStressReport {
  const queue = new DamageQueue();
  let processed = 0;
  const branch = (remaining: number, target: string): void => {
    queue.submit({ runId: 1, actId: 'act-1', frameId: Math.floor(processed / 128), sourceEntityId: 'boss', targetEntityId: target, baseSource: 'cut', skillId: 'cut', damageKind: 'card-derived', handler: `chain-${remaining}`, flags: ['cardDerived'] }, 1, () => {
      processed += 1;
      if (remaining > 0) {
        branch(remaining - 1, target);
        branch(remaining - 1, `${target}-share`);
      }
      return 1;
    });
  };
  for (let root = 0; root < roots; root += 1) {
    queue.beginFrame(root);
    branch(12, `target-${root}`);
  }
  const snapshot = queue.snapshot();
  return { roots, processed, blocked: snapshot.blockedEvents, queueLength: snapshot.queueLength, maximumDepth: snapshot.maximumDepthSeen };
}
