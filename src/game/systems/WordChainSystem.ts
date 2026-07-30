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
  costDiscount: number;
}

const NEXT_WORDS: Readonly<Record<'stop' | 'link', readonly WordId[]>> = {
  stop: ['rewind'],
  link: ['stop', 'rewind'],
};

export class WordChainSystem {
  private active?: { opener: 'stop' | 'link'; expiresAt: number; extended: boolean };

  public constructor(private readonly windowMs: number, private readonly discount = 0.25) {}

  public use(word: WordId, now: number, context: ChainContext): ChainUseResult {
    this.expire(now);
    if (!context.successful) return { snapshot: this.snapshot(now), costDiscount: 0 };

    const opener = this.active?.opener;
    this.active = undefined;
    const chain = opener ? this.resolve(opener, word, context) : undefined;
    if (chain) return { chain, costDiscount: this.discount };

    if (word === 'link' && context.hasLinkedTargets) this.active = { opener: 'link', expiresAt: now + this.windowMs, extended: false };
    if (word === 'stop') this.active = { opener: 'stop', expiresAt: now + this.windowMs, extended: false };
    return { snapshot: this.snapshot(now), costDiscount: 0 };
  }

  public preview(word: WordId, now: number, context: Omit<ChainContext, 'successful'>): WordChainId | undefined {
    this.expire(now);
    return this.active ? this.resolve(this.active.opener, word, { ...context, successful: true }) : undefined;
  }

  public extendOnce(now: number, milliseconds: number): boolean {
    this.expire(now);
    if (!this.active || this.active.extended || milliseconds <= 0) return false;
    this.active.expiresAt += milliseconds; this.active.extended = true; return true;
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
