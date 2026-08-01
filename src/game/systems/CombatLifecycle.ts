export type EnemyDeathSource =
  | 'attack'
  | 'projectile-reflect'
  | 'stop'
  | 'word'
  | 'link'
  | 'rewind'
  | 'regression'
  | 'parry'
  | 'knockback'
  | 'qa'
  | 'other';

export type RunOutcome = 'VICTORY' | 'DEFEAT';

export interface RunOutcomeSnapshot {
  outcome?: RunOutcome;
  resultTransitions: number;
}

/** First confirmed death wins; the result transition can be consumed once. */
export class RunOutcomeController {
  private outcomeValue?: RunOutcome;
  private resultTransitionsValue = 0;

  public claim(outcome: RunOutcome): boolean {
    if (this.outcomeValue !== undefined) return this.outcomeValue === outcome;
    this.outcomeValue = outcome;
    return true;
  }

  public consumeResultTransition(outcome: RunOutcome): boolean {
    if (!this.claim(outcome) || this.outcomeValue !== outcome || this.resultTransitionsValue > 0) return false;
    this.resultTransitionsValue += 1;
    return true;
  }

  public get outcome(): RunOutcome | undefined { return this.outcomeValue; }
  public snapshot(): RunOutcomeSnapshot { return { outcome: this.outcomeValue, resultTransitions: this.resultTransitionsValue }; }
  public reset(): void { this.outcomeValue = undefined; this.resultTransitionsValue = 0; }
}
