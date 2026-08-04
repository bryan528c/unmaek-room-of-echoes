import { compatibleNextWords, reactionFor, type WordId, type WordReactionId } from './WordSystem';
export type { WordId } from './WordSystem';
export type WordChainId = WordReactionId;

export interface ChainContext {
  successful: boolean;
  hasLinkedTargets?: boolean;
  hasFrozenProjectiles?: boolean;
  hasStoppedTargets?: boolean;
  hasRecordedDamage?: boolean;
  relevantTargetCount?: number;
  frozenProjectileCount?: number;
  recordedDamage?: number;
}
export interface ChainSnapshot { opener: WordId; expiresAt: number; nextWords: readonly WordId[]; }
export interface ChainUseResult { chain?: WordChainId; attemptedChain?: WordChainId; reactionName?: string; usedFallback: boolean; snapshot?: ChainSnapshot; costDiscount: number; }

export class WordChainSystem {
  private active?: { opener: WordId; expiresAt: number; extended: boolean };
  public constructor(private readonly windowMs: number, private readonly discount = 0) {}

  public use(word: WordId, now: number, context: ChainContext): ChainUseResult {
    this.expire(now);
    if (!context.successful) return { snapshot: this.snapshot(now), costDiscount: 0, usedFallback: false };
    const opener = this.active?.opener;
    this.active = undefined;
    const attemptedChain = opener ? this.combination(opener, word) : undefined;
    const chain = opener ? this.resolve(opener, word, context) : undefined;
    if (chain) return { chain, attemptedChain, reactionName: opener ? reactionFor(opener, word)?.displayName : undefined, usedFallback: this.fallback(chain, context), costDiscount: this.discount };
    if (compatibleNextWords(word).length > 0) this.active = { opener: word, expiresAt: now + this.windowMs, extended: false };
    return { attemptedChain, snapshot: this.snapshot(now), costDiscount: 0, usedFallback: false };
  }

  public preview(word: WordId, now: number, context: Omit<ChainContext, 'successful'>): WordChainId | undefined { this.expire(now); return this.active ? this.resolve(this.active.opener, word, { ...context, successful: true }) : undefined; }
  public extendOnce(now: number, milliseconds: number): boolean { this.expire(now); if (!this.active || this.active.extended || milliseconds <= 0) return false; this.active.expiresAt += milliseconds; this.active.extended = true; return true; }
  public snapshot(now: number): ChainSnapshot | undefined { this.expire(now); if (!this.active) return undefined; return { opener: this.active.opener, expiresAt: this.active.expiresAt, nextWords: compatibleNextWords(this.active.opener) }; }
  public reset(): void { this.active = undefined; }
  public expected(opener: WordId, next: WordId): WordChainId | undefined { return this.combination(opener, next); }

  private resolve(opener: WordId, word: WordId, _context: ChainContext): WordChainId | undefined {
    const result = this.combination(opener, word); if (!result) return undefined;
    // Every compatible pair resolves. Missing world-state conditions are
    // handled by a named minimum-effect fallback rather than silently losing
    // the reaction window.
    return result;
  }
  private fallback(chain: WordChainId, context: ChainContext): boolean {
    return chain === 'chain-stop' ? !context.hasLinkedTargets
      : chain === 'backflow' ? !context.hasFrozenProjectiles
      : chain === 'damage-regression' ? !context.hasRecordedDamage
        : (context.relevantTargetCount ?? 1) <= 0;
  }
  private combination(opener: WordId, word: WordId): WordChainId | undefined { return reactionFor(opener, word)?.id; }
  private expire(now: number): void { if (this.active && now > this.active.expiresAt) this.active = undefined; }
}
