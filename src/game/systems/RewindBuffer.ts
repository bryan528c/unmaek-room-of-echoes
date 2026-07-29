export interface RewindState {
  time: number;
  x: number;
  y: number;
  health: number;
  velocityX: number;
  velocityY: number;
  facing: number;
}

export class RewindBuffer {
  private readonly entries: RewindState[] = [];

  public constructor(private readonly maximumAgeMs: number) {}

  public push(state: RewindState): void {
    this.entries.push({ ...state });
    this.prune(state.time);
  }

  public prune(now: number): void {
    const cutoff = now - this.maximumAgeMs;
    while (this.entries.length > 0 && (this.entries[0]?.time ?? now) < cutoff) this.entries.shift();
  }

  public getRange(now: number, durationMs: number): RewindState[] {
    const cutoff = now - Math.min(durationMs, this.maximumAgeMs);
    return this.entries.filter((entry) => entry.time >= cutoff && entry.time <= now).map((entry) => ({ ...entry }));
  }

  public oldest(): RewindState | undefined {
    const value = this.entries[0];
    return value ? { ...value } : undefined;
  }

  public latest(): RewindState | undefined {
    const value = this.entries.at(-1);
    return value ? { ...value } : undefined;
  }

  public clear(): void {
    this.entries.length = 0;
  }

  public get size(): number {
    return this.entries.length;
  }
}
