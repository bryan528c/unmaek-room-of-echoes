export type WordId = 'stop' | 'rewind' | 'link';
export type WordChainId = 'chain-stop' | 'backflow' | 'damage-regression';

export interface ChainContext {
  successful: boolean;
  hasLinkedTargets?: boolean;
  hasFrozenProjectiles?: boolean;
  hasRecordedDamage?: boolean;
}

export interface ChainSnapshot {
  opener: WordId;
  expiresAt: number;
  nextWords: readonly WordId[];
}

export interface ChainUseResult {
  chain?: WordChainId;
  snapshot?: ChainSnapshot;
}

const NEXT_WORDS: Readonly<Record<'stop' | 'link', readonly WordId[]>> = {
  stop: ['rewind'],
  link: ['stop', 'rewind'],
};

export class WordChainSystem {
  private active?: { opener: 'stop' | 'link'; expiresAt: number };

  public constructor(private readonly windowMs: number) {}

  public use(word: WordId, now: number, context: ChainContext): ChainUseResult {
    this.expire(now);
    if (!context.successful) return { snapshot: this.snapshot(now) };

    const opener = this.active?.opener;
    this.active = undefined;
    const chain = opener ? this.resolve(opener, word, context) : undefined;
    if (chain) return { chain };

    if (word === 'link' && context.hasLinkedTargets) this.active = { opener: 'link', expiresAt: now + this.windowMs };
    if (word === 'stop') this.active = { opener: 'stop', expiresAt: now + this.windowMs };
    return { snapshot: this.snapshot(now) };
  }

  public snapshot(now: number): ChainSnapshot | undefined {
    this.expire(now);
    if (!this.active) return undefined;
    return { opener: this.active.opener, expiresAt: this.active.expiresAt, nextWords: NEXT_WORDS[this.active.opener] };
  }

  public reset(): void { this.active = undefined; }

  private resolve(opener: 'stop' | 'link', word: WordId, context: ChainContext): WordChainId | undefined {
    if (opener === 'link' && word === 'stop' && context.hasLinkedTargets) return 'chain-stop';
    if (opener === 'stop' && word === 'rewind' && context.hasFrozenProjectiles) return 'backflow';
    if (opener === 'link' && word === 'rewind' && context.hasLinkedTargets && context.hasRecordedDamage) return 'damage-regression';
    return undefined;
  }

  private expire(now: number): void { if (this.active && now > this.active.expiresAt) this.active = undefined; }
}
