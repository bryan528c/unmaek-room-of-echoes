import { AudioSystem } from './systems/AudioSystem';
import { loadSave, saveGame, type GameSave } from './systems/SaveSystem';
import { OverlayUI } from '../ui/OverlayUI';

export interface AppServices {
  save: GameSave;
  audio: AudioSystem;
  ui: OverlayUI;
  persist: () => void;
}

let services: AppServices | undefined;

export function initializeServices(overlay: HTMLElement): AppServices {
  const save = loadSave(window.localStorage);
  const audio = new AudioSystem(save.settings);
  const ui = new OverlayUI(overlay, save, audio);
  services = {
    save, audio, ui,
    persist: () => saveGame(window.localStorage, save),
  };
  ui.setPersistHandler(() => services?.persist());
  return services;
}

export function getServices(): AppServices {
  if (!services) throw new Error('App services were not initialized');
  return services;
}
