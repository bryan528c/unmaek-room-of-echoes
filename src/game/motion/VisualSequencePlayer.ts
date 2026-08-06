export interface VisualFrame {
  file: string;
  durationMs: number;
  role?: 'main' | 'success_aux' | 'failure_aux' | string;
}

export interface VisualSequence {
  id: string;
  frames: readonly VisualFrame[];
  loop: boolean;
  playbackOrder?: readonly number[];
  contactFrame?: number;
}

export interface VisualSequenceWindow {
  startAt: number;
  durationMs?: number;
  contactAt?: number;
}

export interface VisualSequenceSnapshot {
  sequenceId: string | null;
  frameFile: string | null;
  frameIndex: number;
  active: boolean;
  loop: boolean;
  playCount: number;
  completionCount: number;
  frameAdvanceCount: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class VisualSequencePlayer {
  private sequence?: VisualSequence;
  private window?: VisualSequenceWindow;
  private frameIndex = 0;
  private active = false;
  private playCount = 0;
  private completionCount = 0;
  private frameAdvanceCount = 0;
  private completionRecorded = false;

  public play(sequence: VisualSequence, window: VisualSequenceWindow): void {
    if (sequence.frames.length === 0) throw new Error(`[VisualSequencePlayer] ${sequence.id} has no frames`);
    this.sequence = sequence;
    this.window = window;
    this.frameIndex = 0;
    this.active = true;
    this.playCount += 1;
    this.completionRecorded = false;
  }

  public stop(): void {
    this.sequence = undefined;
    this.window = undefined;
    this.frameIndex = 0;
    this.active = false;
  }

  public update(now: number): VisualFrame | undefined {
    const sequence = this.sequence;
    const window = this.window;
    if (!sequence || !window) return undefined;
    const order = sequence.playbackOrder?.length
      ? sequence.playbackOrder.map((number) => Math.max(0, Math.min(sequence.frames.length - 1, number - 1)))
      : sequence.frames.map((_, index) => index);
    if (sequence.loop) {
      const cycleDuration = Math.max(1, order.reduce((sum, index) => sum + (sequence.frames[index]?.durationMs ?? 1), 0));
      let cursor = Math.max(0, now - window.startAt) % cycleDuration;
      let orderIndex = 0;
      for (; orderIndex < order.length - 1; orderIndex += 1) {
        const duration = sequence.frames[order[orderIndex] ?? 0]?.durationMs ?? 1;
        if (cursor < duration) break;
        cursor -= duration;
      }
      this.setFrameIndex(order[orderIndex] ?? 0);
      return sequence.frames[this.frameIndex];
    }

    const duration = Math.max(1, window.durationMs ?? sequence.frames.reduce((sum, frame) => sum + frame.durationMs, 0));
    const endAt = window.startAt + duration;
    if (now >= endAt) {
      this.setFrameIndex(sequence.frames.length - 1);
      this.active = false;
      if (!this.completionRecorded) {
        this.completionCount += 1;
        this.completionRecorded = true;
      }
      return sequence.frames[this.frameIndex];
    }
    const contactIndex = sequence.contactFrame === undefined
      ? undefined
      : Math.max(0, Math.min(sequence.frames.length - 1, sequence.contactFrame - 1));
    if (contactIndex !== undefined && window.contactAt !== undefined) {
      if (now <= window.contactAt) {
        const before = Math.max(1, window.contactAt - window.startAt);
        this.setFrameIndex(Math.min(contactIndex, Math.floor(clamp01((now - window.startAt) / before) * (contactIndex + 1))));
      } else {
        const afterCount = sequence.frames.length - contactIndex - 1;
        const after = Math.max(1, endAt - window.contactAt);
        this.setFrameIndex(contactIndex + Math.min(afterCount, Math.floor(clamp01((now - window.contactAt) / after) * (afterCount + 1))));
      }
    } else {
      this.setFrameIndex(Math.min(sequence.frames.length - 1, Math.floor(clamp01((now - window.startAt) / duration) * sequence.frames.length)));
    }
    return sequence.frames[this.frameIndex];
  }

  public get isActive(): boolean { return this.active; }

  public snapshot(): VisualSequenceSnapshot {
    return {
      sequenceId: this.sequence?.id ?? null,
      frameFile: this.sequence?.frames[this.frameIndex]?.file ?? null,
      frameIndex: this.frameIndex,
      active: this.active,
      loop: this.sequence?.loop ?? false,
      playCount: this.playCount,
      completionCount: this.completionCount,
      frameAdvanceCount: this.frameAdvanceCount,
    };
  }

  private setFrameIndex(frameIndex: number): void {
    if (frameIndex !== this.frameIndex) this.frameAdvanceCount += 1;
    this.frameIndex = frameIndex;
  }
}
