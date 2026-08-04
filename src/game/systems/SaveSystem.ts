export type ControlMode = 'keyboard' | 'mouse';

export interface GameSettings {
  masterVolume: number;
  effectsVolume: number;
  shake: number;
  reducedMotion: boolean;
  showTutorial: boolean;
  controlMode: ControlMode;
  holdCutRepeat: boolean;
}

export interface GameSave {
  settings: GameSettings;
  bestScore: number;
  bestRank: GameRank;
  tutorialSeen: boolean;
  modifierTutorialsSeen: string[];
  bestStage: number;
  bossReached: boolean;
  cleared: boolean;
  highestAct: number;
  mostBossesDefeated: number;
  longestSurvivalSeconds: number;
  recentWordLoadout: string[];
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
  controlMode: 'keyboard',
  holdCutRepeat: false,
};

export const DEFAULT_SAVE: GameSave = {
  settings: { ...DEFAULT_SETTINGS },
  bestScore: 0,
  bestRank: '-',
  tutorialSeen: false,
  modifierTutorialsSeen: [],
  bestStage: 0,
  bossReached: false,
  cleared: false,
  highestAct: 1,
  mostBossesDefeated: 0,
  longestSurvivalSeconds: 0,
  recentWordLoadout: ['stop', 'rewind', 'link'],
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
      settings: { ...settings, controlMode: settings.controlMode === 'mouse' ? 'mouse' : 'keyboard', holdCutRepeat: settings.holdCutRepeat === true },
      bestScore: typeof parsed.bestScore === 'number' && parsed.bestScore >= 0 ? parsed.bestScore : 0,
      bestRank,
      tutorialSeen: parsed.tutorialSeen === true,
      modifierTutorialsSeen: Array.isArray(parsed.modifierTutorialsSeen)
        ? parsed.modifierTutorialsSeen.filter((id): id is string => typeof id === 'string')
        : [],
      bestStage: typeof parsed.bestStage === 'number' && parsed.bestStage >= 0 ? Math.min(7, Math.floor(parsed.bestStage)) : 0,
      bossReached: parsed.bossReached === true,
      cleared: parsed.cleared === true,
      highestAct: typeof parsed.highestAct === 'number' && parsed.highestAct >= 1 ? Math.floor(parsed.highestAct) : 1,
      mostBossesDefeated: typeof parsed.mostBossesDefeated === 'number' && parsed.mostBossesDefeated >= 0 ? Math.floor(parsed.mostBossesDefeated) : 0,
      longestSurvivalSeconds: typeof parsed.longestSurvivalSeconds === 'number' && parsed.longestSurvivalSeconds >= 0 ? parsed.longestSurvivalSeconds : 0,
      recentWordLoadout: Array.isArray(parsed.recentWordLoadout) ? parsed.recentWordLoadout.filter((id): id is string => typeof id === 'string') : ['stop', 'rewind', 'link'],
    } as GameSave;
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function saveGame(storage: StorageLike, save: GameSave): void {
  try { storage.setItem(KEY, JSON.stringify(save)); } catch { /* private storage can be unavailable */ }
}
