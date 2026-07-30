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
});
