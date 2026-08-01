export type InputContext = 'NONE' | 'MENU' | 'COMBAT' | 'REWARD' | 'PAUSE' | 'RESULT' | 'DEVELOPMENT';

export interface InputRouterSnapshot {
  context: InputContext;
  held: readonly string[];
  blockedUntilRelease: readonly string[];
  transitionCount: number;
}

/**
 * Separates physical key state from the currently active input consumer.
 * Any key held while a context changes is blocked until its physical key-up.
 */
export class InputRouter {
  private contextValue: InputContext = 'NONE';
  private readonly held = new Set<string>();
  private readonly blocked = new Set<string>();
  private transitions = 0;

  public get context(): InputContext { return this.contextValue; }

  public noteKeyDown(code: string, repeat = false): void {
    if (!repeat) this.held.add(code);
  }

  public noteKeyUp(code: string): void {
    this.held.delete(code);
    this.blocked.delete(code);
  }

  public setContext(next: InputContext): void {
    if (next === this.contextValue) return;
    this.contextValue = next;
    this.blocked.clear();
    for (const code of this.held) this.blocked.add(code);
    this.transitions += 1;
  }

  public accepts(context: InputContext, code: string, repeat = false): boolean {
    return this.contextValue === context && !repeat && !this.blocked.has(code);
  }

  public blockHeldKeys(): void {
    for (const code of this.held) this.blocked.add(code);
  }

  public clear(): void {
    this.contextValue = 'NONE';
    this.held.clear();
    this.blocked.clear();
    this.transitions = 0;
  }

  public snapshot(): InputRouterSnapshot {
    return {
      context: this.contextValue,
      held: [...this.held].sort(),
      blockedUntilRelease: [...this.blocked].sort(),
      transitionCount: this.transitions,
    };
  }
}
