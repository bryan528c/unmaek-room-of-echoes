import { describe, expect, it } from 'vitest';
import { AudioSystem, soundBus } from '../game/systems/AudioSystem';
import { DEFAULT_SETTINGS } from '../game/systems/SaveSystem';

describe('AudioSystem diagnostics', () => {
  it('routes interface cues separately from combat cues', () => {
    expect(soundBus('upgrade')).toBe('ui');
    expect(soundBus('sentenceFull')).toBe('ui');
    expect(soundBus('parry')).toBe('combat');
    expect(soundBus('damageRegression')).toBe('combat');
  });

  it('reports compatible defaults before creating an AudioContext', () => {
    const audio = new AudioSystem({ ...DEFAULT_SETTINGS });
    expect(audio.diagnostics()).toMatchObject({
      contextState: 'uninitialized',
      muted: false,
      master: DEFAULT_SETTINGS.masterVolume,
      effects: DEFAULT_SETTINGS.effectsVolume,
      ui: 0.86,
      combat: 1,
      music: 0.72,
      activeVoices: 0,
    });
  });
});
