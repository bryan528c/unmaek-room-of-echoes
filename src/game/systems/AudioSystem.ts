import type { GameSettings } from './SaveSystem';

type SoundName = 'slash' | 'hit' | 'dash' | 'parry' | 'stop' | 'rewind' | 'link' | 'upgrade' | 'hurt' | 'phase' | 'victory' | 'defeat';

const NOTES: Record<SoundName, readonly [number, number, OscillatorType, number]> = {
  slash: [260, 110, 'sawtooth', 0.07], hit: [120, 68, 'square', 0.07], dash: [340, 90, 'triangle', 0.12],
  parry: [760, 1240, 'sine', 0.16], stop: [310, 82, 'square', 0.24], rewind: [720, 180, 'triangle', 0.34],
  link: [220, 680, 'sine', 0.24], upgrade: [440, 880, 'triangle', 0.28], hurt: [96, 48, 'sawtooth', 0.18],
  phase: [82, 246, 'sawtooth', 0.42], victory: [420, 1040, 'triangle', 0.7], defeat: [180, 52, 'sine', 0.8],
};

export class AudioSystem {
  private context?: AudioContext;
  private muted = false;

  public constructor(private settings: GameSettings) {}

  public unlock(): void {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  public updateSettings(settings: GameSettings): void { this.settings = settings; }
  public toggleMute(): boolean { this.muted = !this.muted; return this.muted; }
  public get isMuted(): boolean { return this.muted; }

  public play(name: SoundName): void {
    if (this.muted || this.settings.masterVolume <= 0) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;
    const [from, to, type, length] = NOTES[name];
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, to), now + length);
    gain.gain.setValueAtTime(0.0001, now);
    const volume = this.settings.masterVolume * this.settings.effectsVolume * 0.14;
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + length + 0.03);
  }
}
