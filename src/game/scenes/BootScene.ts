import Phaser from 'phaser';
import { act1FinalAssetAudit, act1FinalImageEntries, act1FinalJsonEntries } from '../final/Act1FinalAssets';
import { act1FinalEnabled } from '../final/Act1FinalConfig';
import { act1VfxPatchAssetAudit, act1VfxPatchImageEntries } from '../final/Act1VfxArtPatchAssets';
import { act1VfxArtPatchEnabled } from '../final/Act1VfxArtPatchConfig';
import { motionPilotAssetAudit, motionPilotImageEntries, motionPilotJsonEntries } from '../motion/MotionPilotAssets';
import { motionPilotEnabled } from '../motion/MotionPilotConfig';
import { runtimeAssetAudit, runtimeAssetEntries } from '../runtime/SubmissionRuntimeAssets';
import { createCroppedTextures, createHeroFallback } from '../utils/assetCrop';

export class BootScene extends Phaser.Scene {
  private heroLoadFailed = false;

  public constructor() { super('BootScene'); }

  public preload(): void {
    this.load.image('hero-concept', './assets/hero-concept.png');
    const audit = runtimeAssetAudit();
    if (audit.missing.length || audit.unreferenced.length || audit.disallowed.length) {
      throw new Error(`[BootScene] Submission runtime allowlist audit failed: ${JSON.stringify(audit)}`);
    }
    for (const asset of runtimeAssetEntries()) this.load.image(asset.key, asset.url);
    if (motionPilotEnabled() && !act1FinalEnabled()) {
      const motionAudit = motionPilotAssetAudit();
      if (motionAudit.playerFrames !== 76 || motionAudit.creatureFrames !== 99 || motionAudit.directionLocks !== 8
        || motionAudit.duplicateKeys.length || motionAudit.disallowed.length) {
        throw new Error(`[BootScene] Motion pilot allowlist audit failed: ${JSON.stringify(motionAudit)}`);
      }
      for (const asset of motionPilotImageEntries(true)) this.load.image(asset.key, asset.url);
      for (const asset of motionPilotJsonEntries(true)) this.load.json(asset.key, asset.url);
    }
    if (act1FinalEnabled()) {
      const finalAudit = act1FinalAssetAudit();
      if (finalAudit.playerFrames !== 256 || finalAudit.correctedFrames !== 27 || finalAudit.verifiedFrames !== 99
        || finalAudit.vfxFrames !== 138 || finalAudit.jsonFiles !== 6
        || finalAudit.duplicateKeys.length || finalAudit.disallowed.length) {
        throw new Error(`[BootScene] ACT 1 final allowlist audit failed: ${JSON.stringify(finalAudit)}`);
      }
      for (const asset of act1FinalImageEntries(true)) this.load.image(asset.key, asset.url);
      for (const asset of act1FinalJsonEntries(true)) this.load.json(asset.key, asset.url);
    }
    if (act1VfxArtPatchEnabled()) {
      const patchAudit = act1VfxPatchAssetAudit();
      if (patchAudit.duplicateKeys.length || patchAudit.disallowed.length || patchAudit.unexpected.length) {
        throw new Error(`[BootScene] ACT 1 VFX art patch allowlist audit failed: ${JSON.stringify(patchAudit)}`);
      }
      for (const asset of act1VfxPatchImageEntries(true)) this.load.image(asset.key, asset.url);
    }
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => { this.heroLoadFailed = true; });
  }

  public create(): void {
    const cropped = !this.heroLoadFailed && createCroppedTextures(this, 'hero-concept');
    if (!cropped) createHeroFallback(this);
    if (motionPilotEnabled() && !act1FinalEnabled()) {
      for (const asset of motionPilotImageEntries(true)) {
        this.textures.get(asset.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
    if (act1FinalEnabled()) {
      for (const asset of act1FinalImageEntries(true)) this.textures.get(asset.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    if (act1VfxArtPatchEnabled()) {
      for (const asset of act1VfxPatchImageEntries(true)) this.textures.get(asset.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.createEnemyTextures();
    this.scene.start('MenuScene');
  }

  private createEnemyTextures(): void {
    this.makeChaser(); this.makeArcher(); this.makeInk(); this.makeElite(); this.makeBoss(); this.makeProjectiles();
  }

  private makeChaser(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x080b0c).fillTriangle(4, 66, 28, 16, 56, 66).fillTriangle(11, 55, 3, 65, 18, 61).fillCircle(29, 17, 13);
    g.fillStyle(0x352e2b).fillTriangle(16, 11, 23, 0, 27, 14).fillTriangle(34, 11, 42, 2, 38, 16);
    g.fillStyle(0xcf533d).fillRect(21, 17, 6, 3).fillRect(33, 17, 6, 3);
    g.lineStyle(4, 0x9b876b).lineBetween(31, 38, 55, 24); g.lineStyle(2, 0xe0c193).lineBetween(47, 30, 59, 19); g.lineStyle(2, 0x522e26).strokeCircle(29, 46, 14);
    g.generateTexture('enemy-chaser', 60, 70); g.destroy();
  }

  private makeArcher(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x121315).fillTriangle(10, 66, 29, 13, 48, 66).fillCircle(29, 16, 12);
    g.fillStyle(0x4c3e31).fillRect(17, 31, 24, 22); g.fillStyle(0xe18d52).fillRect(22, 16, 5, 3).fillRect(33, 16, 5, 3);
    g.fillStyle(0x6c4d30).fillRect(7, 21, 7, 39).fillTriangle(5, 18, 16, 18, 10, 10);
    g.lineStyle(3, 0x9d7b4d).strokeEllipse(49, 37, 19, 46).lineBetween(49, 14, 49, 60).lineBetween(18, 36, 56, 36);
    g.generateTexture('enemy-archer', 62, 70); g.destroy();
  }

  private makeInk(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x121014).fillCircle(30, 24, 19).fillTriangle(9, 58, 14, 27, 52, 27).fillCircle(15, 55, 7).fillCircle(28, 62, 6).fillCircle(44, 54, 8);
    g.fillStyle(0x8856a3, 0.35).fillCircle(30, 27, 13); g.fillStyle(0xc85450).fillCircle(23, 22, 3).fillCircle(37, 22, 3);
    g.lineStyle(2, 0x6b465d, 0.7).strokeCircle(30, 28, 21).lineBetween(15, 52, 7, 69).lineBetween(28, 57, 27, 71).lineBetween(43, 51, 53, 67);
    g.generateTexture('enemy-ink', 62, 72); g.destroy();
  }

  private makeElite(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x161719).fillRoundedRect(13, 18, 51, 58, 12).fillCircle(38, 18, 19);
    g.fillStyle(0x47413b).fillRect(4, 29, 68, 20).fillRect(21, 58, 34, 21);
    g.lineStyle(3, 0x917053).lineBetween(15, 29, 61, 67).lineBetween(60, 24, 18, 69);
    g.fillStyle(0xef6b46).fillRect(26, 16, 7, 4).fillRect(44, 16, 7, 4);
    g.lineStyle(4, 0x5eb9a9, 0.55).strokeCircle(38, 50, 19); g.lineStyle(5, 0x786a59, 0.9).strokeEllipse(68, 51, 15, 42);
    g.generateTexture('enemy-elite', 78, 84); g.destroy();
  }

  private makeBoss(): void {
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x090a0c).fillTriangle(1, 104, 45, 19, 95, 104).fillCircle(48, 25, 27);
    g.fillStyle(0x31282b).fillTriangle(18, 17, 27, 0, 35, 23).fillTriangle(61, 21, 76, 2, 74, 29);
    g.lineStyle(7, 0x241c20).strokeEllipse(48, 59, 63, 60); g.lineStyle(4, 0x685451).strokeEllipse(48, 59, 56, 53);
    g.fillStyle(0xee674b).fillCircle(36, 25, 5).fillCircle(60, 25, 5).fillRect(34, 50, 28, 6);
    g.fillStyle(0x5fc5b4, 0.8).fillTriangle(25, 77, 48, 94, 72, 75).fillCircle(48, 61, 9); g.fillStyle(0x071012).fillCircle(48, 61, 4);
    g.generateTexture('enemy-boss', 96, 108); g.destroy();

    // 기록 편집자: 포식자의 덩어리형 몸체와 달리 분리된 기록판,
    // 펜촉, 교정선을 사용해 중간 충실도 단계에서도 실루엣을 구분한다.
    const editor = this.make.graphics({ x: 0, y: 0 });
    editor.fillStyle(0x0d0b12).fillRoundedRect(17, 12, 62, 22, 4).fillRoundedRect(8, 40, 80, 20, 3).fillRoundedRect(20, 68, 58, 20, 3);
    editor.fillStyle(0x35233f, .94).fillRect(22, 17, 52, 12).fillRect(14, 45, 68, 10).fillRect(26, 73, 46, 10);
    editor.lineStyle(3, 0xc74955, .9).lineBetween(8, 35, 87, 18).lineBetween(10, 66, 86, 47).lineBetween(21, 94, 76, 74);
    editor.lineStyle(2, 0xd57a91, .65).strokeRect(17, 12, 62, 22).strokeRect(8, 40, 80, 20).strokeRect(20, 68, 58, 20);
    editor.fillStyle(0xd75655).fillCircle(33, 26, 4).fillCircle(63, 26, 4);
    editor.fillStyle(0x70d6c4, .9).fillCircle(48, 54, 10); editor.fillStyle(0x091315).fillCircle(48, 54, 4);
    editor.fillStyle(0x130e19).fillTriangle(38, 88, 58, 88, 48, 108); editor.lineStyle(3, 0xbda1be).lineBetween(48, 87, 48, 104);
    editor.generateTexture('enemy-boss-editor', 96, 108); editor.destroy();
  }

  private makeProjectiles(): void {
    const ink = this.make.graphics({ x: 0, y: 0 }); ink.fillStyle(0x351619, 0.7).fillTriangle(0, 7, 18, 2, 18, 12).fillStyle(0x5a2027).fillCircle(19, 7, 7).fillStyle(0xf2c79d).fillCircle(20, 7, 3).fillStyle(0xffebc8).fillCircle(21, 6, 1).generateTexture('projectile-ink', 27, 14); ink.destroy();
    const boss = this.make.graphics({ x: 0, y: 0 }); boss.fillStyle(0x511b17).fillTriangle(0, 7, 20, 0, 20, 14).fillStyle(0x9f3728).fillCircle(20, 7, 7).fillStyle(0xffb16a).fillCircle(21, 7, 3).fillStyle(0xffedbd).fillCircle(22, 6, 1).generateTexture('projectile-boss', 28, 15); boss.destroy();
    const rune = this.make.graphics({ x: 0, y: 0 }); rune.fillStyle(0x1d5c68, 0.7).fillTriangle(0, 8, 12, 3, 12, 13).fillStyle(0xa7fff0).fillRect(15, 0, 4, 16).fillRect(9, 6, 16, 4).fillStyle(0x3db9a7).fillCircle(17, 8, 4).generateTexture('projectile-rune', 26, 16); rune.destroy();
    const pixel = this.make.graphics({ x: 0, y: 0 }); pixel.fillStyle(0x73d7c4).fillRect(0, 0, 4, 4).generateTexture('rune-pixel', 4, 4); pixel.destroy();
  }
}
