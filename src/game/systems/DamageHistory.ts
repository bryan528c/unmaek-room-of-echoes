export type RecordedDamageKind = 'attack' | 'word';
export type CombatDamageKind = RecordedDamageKind | 'linked' | 'chain' | 'damage-over-time';

interface DamageRecord {
  time: number;
  targetId: string;
  amount: number;
  kind: RecordedDamageKind;
}

export class DamageHistory {
  private records: DamageRecord[] = [];

  public constructor(private readonly retentionMs: number) {}

  public record(time: number, targetId: string, amount: number, kind: CombatDamageKind): void {
    if (amount <= 0 || (kind !== 'attack' && kind !== 'word')) return;
    this.records.push({ time, targetId, amount, kind });
    this.prune(time);
  }

  public recentDamage(targetId: string, now: number, durationMs: number): number {
    this.prune(now);
    const since = now - durationMs;
    return this.records.filter((record) => record.targetId === targetId && record.time >= since).reduce((sum, record) => sum + record.amount, 0);
  }

  public hasRecentDamage(targetIds: readonly string[], now: number, durationMs: number): boolean {
    const ids = new Set(targetIds); const since = now - durationMs;
    this.prune(now);
    return this.records.some((record) => ids.has(record.targetId) && record.time >= since);
  }

  public reset(): void { this.records = []; }

  private prune(now: number): void { this.records = this.records.filter((record) => record.time >= now - this.retentionMs); }
}
