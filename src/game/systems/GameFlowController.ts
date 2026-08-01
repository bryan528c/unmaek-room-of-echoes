export type BaseGameFlowState =
  | 'COMBAT'
  | 'ROUND_CLEAR'
  | 'REWARD_REVEAL'
  | 'REWARD_SELECT'
  | 'BOSS_TRANSITION'
  | 'BOSS_DEFEATED'
  | 'ACT_TRANSITION'
  | 'RESULT';

export type GameFlowState = BaseGameFlowState | 'USER_PAUSED' | 'TAB_HIDDEN';

export interface FlowTransition {
  from: GameFlowState;
  to: GameFlowState;
  at: number;
}

const ALLOWED: Readonly<Record<BaseGameFlowState, readonly BaseGameFlowState[]>> = {
  COMBAT: ['ROUND_CLEAR', 'BOSS_TRANSITION', 'BOSS_DEFEATED', 'ACT_TRANSITION', 'RESULT'],
  ROUND_CLEAR: ['REWARD_REVEAL', 'RESULT'],
  REWARD_REVEAL: ['REWARD_SELECT', 'RESULT'],
  REWARD_SELECT: ['REWARD_REVEAL', 'COMBAT', 'BOSS_TRANSITION', 'RESULT'],
  BOSS_TRANSITION: ['COMBAT', 'RESULT'],
  BOSS_DEFEATED: ['RESULT'],
  ACT_TRANSITION: ['COMBAT', 'RESULT'],
  RESULT: ['COMBAT'],
};

export class GameFlowController {
  private base: BaseGameFlowState;
  private userPaused = false;
  private tabHidden = false;
  private transitionValue: FlowTransition;

  public constructor(
    initial: BaseGameFlowState = 'COMBAT',
    private readonly warning?: (message: string) => void,
    now = 0,
  ) {
    this.base = initial;
    this.transitionValue = { from: initial, to: initial, at: now };
  }

  public get state(): GameFlowState {
    if (this.tabHidden) return 'TAB_HIDDEN';
    if (this.userPaused) return 'USER_PAUSED';
    return this.base;
  }

  public get baseState(): BaseGameFlowState { return this.base; }
  public get lastTransition(): FlowTransition { return { ...this.transitionValue }; }
  public get isTabHidden(): boolean { return this.tabHidden; }
  public get isUserPaused(): boolean { return this.userPaused; }
  public get allowsCombatInput(): boolean { return this.state === 'COMBAT'; }
  public get allowsRewardInput(): boolean { return this.state === 'REWARD_SELECT'; }
  public get allowsResultInput(): boolean { return this.state === 'RESULT'; }
  public get allowsCombatSimulation(): boolean { return this.state === 'COMBAT'; }

  public transition(next: BaseGameFlowState, now = 0): boolean {
    if (next === this.base) return true;
    if (!ALLOWED[this.base].includes(next)) {
      this.warning?.(`Invalid game-flow transition: ${this.base} -> ${next}`);
      return false;
    }
    const from = this.state;
    this.base = next;
    this.transitionValue = { from, to: this.state, at: now };
    return true;
  }

  public setUserPaused(paused: boolean, now = 0): void {
    if (this.userPaused === paused) return;
    const from = this.state;
    this.userPaused = paused;
    this.transitionValue = { from, to: this.state, at: now };
  }

  public setTabHidden(hidden: boolean, now = 0): void {
    if (this.tabHidden === hidden) return;
    const from = this.state;
    this.tabHidden = hidden;
    this.transitionValue = { from, to: this.state, at: now };
  }

  public reset(initial: BaseGameFlowState = 'COMBAT', now = 0): void {
    const from = this.state;
    this.base = initial;
    this.userPaused = false;
    this.tabHidden = false;
    this.transitionValue = { from, to: initial, at: now };
  }
}
