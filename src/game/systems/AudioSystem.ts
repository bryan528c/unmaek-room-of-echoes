import type { GameSettings } from './SaveSystem';

export type SoundName = 'slash' | 'slash1' | 'slash2' | 'slash3' | 'guardSlash' | 'echoBlade' | 'cut' | 'cutHit' | 'finisher' | 'hit' | 'dash' | 'warning' | 'parryOpen' | 'parry' | 'perfectParry' | 'sealGain' | 'bossVulnerable' | 'sentenceFull' | 'stop' | 'rewind' | 'link' | 'chain' | 'chainStop' | 'backflow' | 'damageRegression' | 'upgrade' | 'hurt' | 'critical' | 'phase' | 'victory' | 'defeat';
export type AudioBus = 'ui' | 'combat' | 'music';

export interface AudioDiagnosticsSnapshot {
  contextState: AudioContextState | 'uninitialized';
  muted: boolean;
  master: number;
  effects: number;
  ui: number;
  combat: number;
  music: number;
  activeVoices: number;
}

const UI_SOUNDS = new Set<SoundName>(['upgrade', 'sentenceFull', 'sealGain']);
const BUS_GAIN: Readonly<Record<AudioBus, number>> = { ui: 0.86, combat: 1, music: 0.72 };
export function soundBus(name: SoundName): AudioBus { return UI_SOUNDS.has(name) ? 'ui' : 'combat'; }

const NOTES: Record<SoundName, readonly [number, number, OscillatorType, number]> = {
  slash: [260, 110, 'sawtooth', 0.07], slash1: [250, 125, 'sawtooth', 0.065], slash2: [310, 145, 'triangle', 0.075], slash3: [210, 520, 'sawtooth', 0.105], guardSlash: [230, 150, 'triangle', 0.055], echoBlade: [360, 190, 'triangle', 0.065], cut: [230, 520, 'sawtooth', 0.11], cutHit: [145, 92, 'square', 0.085], finisher: [190, 720, 'sawtooth', 0.18], hit: [120, 68, 'square', 0.07], dash: [340, 90, 'triangle', 0.12],
  warning: [150, 210, 'triangle', 0.11], parryOpen: [540, 690, 'sine', 0.07],
  parry: [760, 1240, 'sine', 0.16], perfectParry: [880, 1560, 'sine', 0.2], sealGain: [420, 720, 'triangle', 0.12], bossVulnerable: [290, 860, 'triangle', 0.24], stop: [310, 82, 'square', 0.24], rewind: [720, 180, 'triangle', 0.34],
  sentenceFull: [520, 780, 'sine', 0.2], critical: [112, 72, 'triangle', 0.28],
  link: [220, 680, 'sine', 0.24], upgrade: [440, 880, 'triangle', 0.28], hurt: [96, 48, 'sawtooth', 0.18],
  chain: [360, 960, 'triangle', 0.3], chainStop: [280, 760, 'square', 0.24], backflow: [820, 230, 'triangle', 0.31], damageRegression: [260, 690, 'sine', 0.34],
  phase: [82, 246, 'sawtooth', 0.42], victory: [420, 1040, 'triangle', 0.7], defeat: [180, 52, 'sine', 0.8],
};

export class AudioSystem {
  private context?: AudioContext;
  private masterGain?: GainNode;
  private effectsGain?: GainNode;
  private uiGain?: GainNode;
  private combatGain?: GainNode;
  private musicGain?: GainNode;
  private muted = false;
  private activeVoices = 0;
  private readonly lastPlayed = new Map<SoundName, number>();

  public constructor(private settings: GameSettings) {}

  public unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain(); this.effectsGain = this.context.createGain();
      this.uiGain = this.context.createGain(); this.combatGain = this.context.createGain(); this.musicGain = this.context.createGain();
      this.uiGain.connect(this.effectsGain); this.combatGain.connect(this.effectsGain);
      this.effectsGain.connect(this.masterGain); this.musicGain.connect(this.masterGain); this.masterGain.connect(this.context.destination);
      this.applyGainSettings();
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  public updateSettings(settings: GameSettings): void { this.settings = settings; this.applyGainSettings(); }
  public toggleMute(): boolean { this.muted = !this.muted; this.applyGainSettings(); return this.muted; }
  public get isMuted(): boolean { return this.muted; }
  public get contextState(): AudioContextState | 'uninitialized' { return this.context?.state ?? 'uninitialized'; }

  public diagnostics(): AudioDiagnosticsSnapshot {
    return {
      contextState: this.contextState,
      muted: this.muted,
      master: this.muted ? 0 : Math.max(0, this.settings.masterVolume),
      effects: Math.max(0, this.settings.effectsVolume),
      ui: BUS_GAIN.ui,
      combat: BUS_GAIN.combat,
      music: BUS_GAIN.music,
      activeVoices: this.activeVoices,
    };
  }

  public suspend(): void {
    if (this.context?.state === 'running') void this.context.suspend().catch(() => undefined);
  }

  public resume(): void {
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
  }

  public play(name: SoundName): void {
    if (this.muted || this.settings.masterVolume <= 0) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;
    const last = this.lastPlayed.get(name) ?? -1;
    if (ctx.currentTime - last < (name === 'warning' ? 0.12 : 0.045)) return;
    this.lastPlayed.set(name, ctx.currentTime);
    const [from, to, type, length] = NOTES[name];
    this.playTone(from, to, type, length, soundBus(name));
  }

  public playDiagnostic(target: AudioBus | SoundName): void {
    if (target === 'ui') { this.play('upgrade'); return; }
    if (target === 'combat') { this.play('parry'); return; }
    if (target === 'music') { this.unlock(); this.playTone(174, 246, 'sine', 0.42, 'music', 0.1); return; }
    this.play(target);
  }

  private playTone(from: number, to: number, type: OscillatorType, length: number, bus: AudioBus, volume = 0.14): void {
    const ctx = this.context; if (!ctx) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, to), now + length);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    const destination = bus === 'ui' ? this.uiGain : bus === 'music' ? this.musicGain : this.combatGain;
    oscillator.connect(gain).connect(destination ?? this.effectsGain ?? ctx.destination);
    this.activeVoices += 1;
    oscillator.addEventListener('ended', () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      oscillator.disconnect(); gain.disconnect();
    }, { once: true });
    oscillator.start(now); oscillator.stop(now + length + 0.03);
  }

  private applyGainSettings(): void {
    const now = this.context?.currentTime ?? 0;
    this.masterGain?.gain.setTargetAtTime(this.muted ? 0 : Math.max(0, this.settings.masterVolume), now, 0.015);
    this.effectsGain?.gain.setTargetAtTime(Math.max(0, this.settings.effectsVolume), now, 0.015);
    this.uiGain?.gain.setTargetAtTime(BUS_GAIN.ui, now, 0.015);
    this.combatGain?.gain.setTargetAtTime(BUS_GAIN.combat, now, 0.015);
    this.musicGain?.gain.setTargetAtTime(BUS_GAIN.music, now, 0.015);
  }
}
