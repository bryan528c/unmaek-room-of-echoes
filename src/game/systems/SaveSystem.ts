export interface GameSettings {
  masterVolume: number;
  effectsVolume: number;
  shake: number;
  reducedMotion: boolean;
  showTutorial: boolean;
}

export interface GameSave {
  settings: GameSettings;
  bestScore: number;
  bestRank: GameRank;
  tutorialSeen: boolean;
  bestStage: number;
  bossReached: boolean;
  cleared: boolean;
}

export type GameRank = 'S' | 'A' | 'B' | 'C+' | 'C' | 'C-' | '-';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.72,
  effectsVolume: 0.68,
  shake: 0.7,
  reducedMotion: false,
  showTutorial: true,
};

export const DEFAULT_SAVE: GameSave = {
  settings: { ...DEFAULT_SETTINGS },
  bestScore: 0,
  bestRank: '-',
  tutorialSeen: false,
  bestStage: 0,
  bossReached: false,
  cleared: false,
};

const KEY = 'eonmaek-save-v1';

function validNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function loadSave(storage: StorageLike): GameSave {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const parsed = JSON.parse(raw) as Partial<GameSave>;
    const settings = parsed.settings;
    if (!settings || !validNumber(settings.masterVolume, 0, 1) || !validNumber(settings.effectsVolume, 0, 1) ||
        !validNumber(settings.shake, 0, 1) || typeof settings.reducedMotion !== 'boolean' || typeof settings.showTutorial !== 'boolean') {
      return structuredClone(DEFAULT_SAVE);
    }
    const ranks: readonly GameRank[] = ['S', 'A', 'B', 'C+', 'C', 'C-', '-'];
    const bestRank = typeof parsed.bestRank === 'string' && ranks.includes(parsed.bestRank as GameRank) ? parsed.bestRank as GameRank : '-';
    return {
      settings: { ...settings },
      bestScore: typeof parsed.bestScore === 'number' && parsed.bestScore >= 0 ? parsed.bestScore : 0,
      bestRank,
      tutorialSeen: parsed.tutorialSeen === true,
      bestStage: typeof parsed.bestStage === 'number' && parsed.bestStage >= 0 ? Math.min(7, Math.floor(parsed.bestStage)) : 0,
      bossReached: parsed.bossReached === true,
      cleared: parsed.cleared === true,
    } as GameSave;
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function saveGame(storage: StorageLike, save: GameSave): void {
  try { storage.setItem(KEY, JSON.stringify(save)); } catch { /* private storage can be unavailable */ }
}
