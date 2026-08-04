import { describe, expect, it } from 'vitest';
import { DEFAULT_SAVE, loadSave, saveGame, type StorageLike } from '../game/systems/SaveSystem';

class MemoryStorage implements StorageLike {
  public value: string | null = null;
  public getItem(): string | null { return this.value; }
  public setItem(_key: string, value: string): void { this.value = value; }
}

describe('SaveSystem', () => {
  it('정상 설정과 최고 기록을 저장하고 읽는다', () => {
    const storage = new MemoryStorage();
    const save = structuredClone(DEFAULT_SAVE);
    save.settings.masterVolume = 0.35; save.bestScore = 4321; save.bestRank = 'A';
    saveGame(storage, save);
    expect(loadSave(storage)).toEqual(save);
  });

  it('손상된 JSON은 안전한 기본값으로 복구한다', () => {
    const storage = new MemoryStorage(); storage.value = '{broken';
    expect(loadSave(storage)).toEqual(DEFAULT_SAVE);
  });

  it('범위를 벗어난 설정도 기본값으로 복구한다', () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({ ...DEFAULT_SAVE, settings: { ...DEFAULT_SAVE.settings, shake: 8 } });
    expect(loadSave(storage)).toEqual(DEFAULT_SAVE);
  });

  it('폴리시 이전 저장 데이터는 기록을 보존하고 새 진행 필드만 기본값으로 채운다', () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({ settings: DEFAULT_SAVE.settings, bestScore: 2180, bestRank: 'B', tutorialSeen: true });
    expect(loadSave(storage)).toEqual({ ...DEFAULT_SAVE, bestScore: 2180, bestRank: 'B', tutorialSeen: true });
  });

  it('기존 저장 데이터에는 키보드 전용 모드를 기본 적용한다', () => {
    const storage = new MemoryStorage();
    const { controlMode: _controlMode, ...legacySettings } = DEFAULT_SAVE.settings;
    storage.value = JSON.stringify({ settings: legacySettings, bestScore: 320, bestRank: 'C', tutorialSeen: false });
    expect(loadSave(storage).settings.controlMode).toBe('keyboard');
  });

  it('마우스 조준 비교 모드를 저장하고 다시 읽는다', () => {
    const storage = new MemoryStorage(); const save = structuredClone(DEFAULT_SAVE);
    save.settings.controlMode = 'mouse'; saveGame(storage, save);
    expect(loadSave(storage).settings.controlMode).toBe('mouse');
  });

  it('Act 기록은 저장하고 기존 저장에는 안전한 기본값을 채운다', () => {
    const storage = new MemoryStorage();
    const save = structuredClone(DEFAULT_SAVE);
    save.highestAct = 7; save.mostBossesDefeated = 6; save.longestSurvivalSeconds = 1284;
    saveGame(storage, save);
    expect(loadSave(storage)).toMatchObject({ highestAct: 7, mostBossesDefeated: 6, longestSurvivalSeconds: 1284 });

    storage.value = JSON.stringify({ settings: DEFAULT_SAVE.settings, bestScore: 100, bestRank: 'C' });
    expect(loadSave(storage)).toMatchObject({ highestAct: 1, mostBossesDefeated: 0, longestSurvivalSeconds: 0 });
  });
  it('persists modifier tutorial history and defaults legacy saves to none seen', () => {
    const storage = new MemoryStorage(); const save = structuredClone(DEFAULT_SAVE);
    save.modifierTutorialsSeen = ['stitch-pair', 'past-position'];
    saveGame(storage, save);
    expect(loadSave(storage).modifierTutorialsSeen).toEqual(['stitch-pair', 'past-position']);
    storage.value = JSON.stringify({ settings: DEFAULT_SAVE.settings, tutorialSeen: true });
    expect(loadSave(storage).modifierTutorialsSeen).toEqual([]);
  });

  it('persists the most recent valid word loadout for the next Run', () => {
    const storage = new MemoryStorage(); const save = structuredClone(DEFAULT_SAVE);
    save.recentWordLoadout = ['pull', 'link', 'push'];
    saveGame(storage, save);
    expect(loadSave(storage).recentWordLoadout).toEqual(['pull', 'link', 'push']);
    storage.value = JSON.stringify({ settings: DEFAULT_SAVE.settings });
    expect(loadSave(storage).recentWordLoadout).toEqual(['stop', 'rewind', 'link']);
  });
});
