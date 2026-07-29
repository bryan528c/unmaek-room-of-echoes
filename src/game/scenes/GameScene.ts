import Phaser from 'phaser';
import { BALANCE, type EnemyKind } from '../balance';
import { Boss, type BossCallbacks } from '../entities/Boss';
import { Enemy, type EnemyCallbacks } from '../entities/Enemy';
import { Hero, type HeroAttack } from '../entities/Hero';
import { Projectile } from '../entities/Projectile';
import { getServices, type AppServices } from '../services';
import { distributeLinkedDamage } from '../systems/LinkDamage';
import { RewindBuffer } from '../systems/RewindBuffer';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { angleDelta, distanceSq, rankFor } from '../utils/math';
import { createArchiveArena } from '../utils/arena';
import type { ResultStats } from '../../ui/OverlayUI';

interface InkZone { circle: Phaser.GameObjects.Arc; expiresAt: number; nextDamageAt: number; radius: number }
interface RecordedAttack { time: number; x: number; y: number; angle: number; combo: number }
type RunState = 'combat' | 'upgrade' | 'boss' | 'result';

const WAVE_LABELS = ['제1전투 · 잿빛 추적자', '제2전투 · 먹빛 사선', '제3전투 · 봉합된 문장'] as const;
const TUTORIAL = [
  { action: 'move', text: '<kbd>WASD</kbd> 또는 <kbd>방향키</kbd>로 움직여 공격선을 벗어나라' },
  { action: 'attack', text: '<kbd>좌클릭</kbd> 또는 <kbd>J</kbd>로 단검 3연격을 이어라' },
  { action: 'dash', text: '<kbd>Space</kbd>로 위험을 관통해 대시하라' },
  { action: 'parry', text: '<kbd>우클릭</kbd> 또는 <kbd>K</kbd>로 붉은 순간을 패링하라' },
  { action: 'stop', text: '<kbd>Q</kbd> <b>멎는다</b> — 조준점 주변 적과 탄환을 정지시킨다' },
  { action: 'rewind', text: '<kbd>E</kbd> <b>되돌린다</b> — 너의 위치와 체력만 2초 전으로' },
  { action: 'link', text: '<kbd>R</kbd> <b>잇는다</b> — 최대 3명의 피해를 서로 잇는다' },
] as const;

export class GameScene extends Phaser.Scene {
  private services!: AppServices;
  private hero!: Hero;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'w' | 'a' | 's' | 'd' | 'j' | 'k' | 'space' | 'q' | 'e' | 'r' | 'f' | 'p', Phaser.Input.Keyboard.Key>;
  private enemies = new Set<Enemy>();
  private projectiles = new Set<Projectile>();
  private inkZones: InkZone[] = [];
  private linkedTargets = new Set<Enemy>();
  private linkShareRatio: number = BALANCE.words.linkShare;
  private linkGraphics?: Phaser.GameObjects.Graphics;
  private boss?: Boss;
  private upgrades = new UpgradeSystem();
  private rewind = new RewindBuffer(BALANCE.words.rewindDuration);
  private attacks: RecordedAttack[] = [];
  private waveIndex = 0;
  private pendingSpawns = 0;
  private runState: RunState = 'combat';
  private paused = false;
  private score = 0;
  private sentence = 0;
  private sentenceMax = BALANCE.sentence.maximum;
  private empowered = false;
  private stopReadyAt = 0;
  private rewindReadyAt = 0;
  private linkReadyAt = 0;
  private wordInputAt = -1;
  private startTime = 0;
  private damageTaken = 0;
  private parries = 0;
  private wordUses: ResultStats['wordUses'] = { '멎는다': 0, '되돌린다': 0, '잇는다': 0 };
  private tutorialIndex = 0;
  private tutorialEnabled = false;
  private firstHitAvailable = true;
  private lastPursuitId = '';
  private pursuitCount = 0;
  private regressionCharged = false;
  private timeouts: number[] = [];
  private qaMode = false;
  private pointerHandler!: (pointer: Phaser.Input.Pointer) => void;
  private escapeHandler!: (event: KeyboardEvent) => void;

  public constructor() { super('GameScene'); }

  public create(): void {
    this.resetRunState();
    this.services = getServices();
    this.qaMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('qa');
    createArchiveArena(this);
    this.createAtmosphere();
    this.heroShadow = this.add.ellipse(480, 304, 48, 17, 0x020506, 0.55).setDepth(11);
    this.hero = new Hero(this, 480, 300);
    this.linkGraphics = this.add.graphics().setDepth(13);
    this.setupInput();
    this.services.ui.showHud();
    this.startTime = this.time.now;
    this.tutorialEnabled = this.services.save.settings.showTutorial;
    if (this.tutorialEnabled) this.services.ui.showTutorial(TUTORIAL[0].text);
    this.spawnWave(0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private resetRunState(): void {
    this.enemies = new Set(); this.projectiles = new Set(); this.inkZones = []; this.linkedTargets = new Set(); this.linkShareRatio = BALANCE.words.linkShare;
    this.upgrades = new UpgradeSystem(); this.rewind = new RewindBuffer(BALANCE.words.rewindDuration); this.attacks = [];
    this.waveIndex = 0; this.pendingSpawns = 0; this.runState = 'combat'; this.paused = false; this.score = 0;
    this.sentence = 0; this.empowered = false; this.stopReadyAt = 0; this.rewindReadyAt = 0; this.linkReadyAt = 0;
    this.damageTaken = 0; this.parries = 0; this.wordUses = { '멎는다': 0, '되돌린다': 0, '잇는다': 0 };
    this.tutorialIndex = 0; this.firstHitAvailable = true; this.lastPursuitId = ''; this.pursuitCount = 0; this.regressionCharged = false; this.timeouts = [];
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D', j: 'J', k: 'K', space: 'SPACE', q: 'Q', e: 'E', r: 'R', f: 'F', p: 'P' }) as typeof this.keys;
    this.pointerHandler = (pointer: Phaser.Input.Pointer): void => {
      if (this.paused || this.runState === 'upgrade' || this.runState === 'result') return;
      if (pointer.leftButtonDown()) this.attack(pointer.worldX, pointer.worldY);
      if (pointer.rightButtonDown()) this.parry();
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerHandler);
    this.escapeHandler = (event: KeyboardEvent): void => { if (event.code === 'Escape' && this.scene.isActive()) this.togglePause(); };
    window.addEventListener('keydown', this.escapeHandler);
  }

  public override update(time: number): void {
    if (this.runState === 'result' || this.paused) return;
    const pointer = this.input.activePointer;
    const x = (this.keys.d.isDown || this.cursors.right.isDown ? 1 : 0) - (this.keys.a.isDown || this.cursors.left.isDown ? 1 : 0);
    const y = (this.keys.s.isDown || this.cursors.down.isDown ? 1 : 0) - (this.keys.w.isDown || this.cursors.up.isDown ? 1 : 0);
    this.hero.updateMovement(time, x, y, pointer.worldX, pointer.worldY);
    this.heroShadow.setPosition(this.hero.x, this.hero.y + 9).setScale(this.hero.isDashing ? 1.5 : 1);
    if (x !== 0 || y !== 0) this.markTutorial('move');
    if (Phaser.Input.Keyboard.JustDown(this.keys.j)) this.attack(pointer.worldX, pointer.worldY);
    if (Phaser.Input.Keyboard.JustDown(this.keys.k)) this.parry();
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) this.dash(x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.f)) this.armEmpower();
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.castStop(pointer.worldX, pointer.worldY);
    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) this.castRewind();
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.castLink(pointer.worldX, pointer.worldY);
    if (this.qaMode && Phaser.Input.Keyboard.JustDown(this.keys.p)) this.qaAdvance();
    this.recordState(time);
    for (const enemy of [...this.enemies]) enemy.updateAI(time, this.hero);
    for (const projectile of [...this.projectiles]) {
      if (!projectile.active) { this.projectiles.delete(projectile); continue; }
      projectile.update(time); this.checkProjectileCollision(projectile);
    }
    this.checkMeleeCollisions(time);
    this.updateInkZones(time);
    this.updateLinks(time);
    this.updateHud(time);
  }

  private spawnWave(index: number): void {
    this.runState = 'combat'; this.firstHitAvailable = true;
    const list = BALANCE.waveSpawns[index]; if (!list) return;
    const positions = this.spawnPositions(list.length);
    list.forEach((kind, itemIndex) => {
      this.pendingSpawns += 1;
      this.time.delayedCall(itemIndex * 390, () => {
        const position = positions[itemIndex] ?? { x: 120, y: 130 };
        this.spawnEnemy(kind, position.x, position.y); this.pendingSpawns -= 1;
      });
    });
  }

  private spawnPositions(count: number): { x: number; y: number }[] {
    const slots = [{ x: 120, y: 130 }, { x: 840, y: 140 }, { x: 125, y: 430 }, { x: 835, y: 425 }, { x: 480, y: 105 }, { x: 480, y: 455 }];
    return slots.slice(0, count).sort(() => Math.random() - 0.5);
  }

  private enemyCallbacks(): EnemyCallbacks {
    return {
      shoot: (x, y, angle, speed, damage, texture) => this.spawnProjectile(x, y, angle, speed, damage, texture),
      melee: (enemy, damage) => this.hitHero(damage, enemy.x, enemy.y),
      died: (enemy) => this.onEnemyDied(enemy),
    };
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const enemy = new Enemy(this, x, y, kind, this.enemyCallbacks());
    this.enemies.add(enemy); enemy.spawn(); return enemy;
  }

  private spawnProjectile(x: number, y: number, angle: number, speed: number, damage: number, texture?: string): void {
    const projectile = new Projectile(this, x, y, angle, speed, damage, texture);
    this.projectiles.add(projectile);
  }

  private attack(targetX: number, targetY: number): void {
    if (this.hero.tryAttack(targetX, targetY, (attack) => this.resolveAttack(attack))) {
      this.services.audio.play('slash'); this.markTutorial('attack');
    }
  }

  private resolveAttack(attack: HeroAttack): void {
    const index = attack.combo - 1;
    const baseDamage = BALANCE.hero.attackDamage[index] ?? 18;
    const range = BALANCE.hero.attackRange[index] ?? 60;
    const slash = this.add.graphics().setDepth(22);
    slash.lineStyle(attack.combo === 3 ? 9 : 6, attack.combo === 3 ? 0xb9fff1 : 0xd9c49e, 0.85);
    slash.beginPath().arc(attack.x, attack.y, range, attack.angle - 0.72, attack.angle + 0.72).strokePath();
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.18, scaleY: 1.18, duration: 130, onComplete: () => slash.destroy() });
    this.attacks.push({ time: this.time.now, x: attack.x, y: attack.y, angle: attack.angle, combo: attack.combo });
    let hits = 0;
    for (const enemy of [...this.enemies]) {
      const distance = Phaser.Math.Distance.Between(attack.x, attack.y, enemy.x, enemy.y);
      const targetAngle = Phaser.Math.Angle.Between(attack.x, attack.y, enemy.x, enemy.y);
      if (!enemy.spawned || distance > range + (enemy.kind === 'boss' ? 22 : 10) || angleDelta(targetAngle, attack.angle) > 0.88) continue;
      let damage = baseDamage;
      const fang = this.upgrades.getStack('dragon-fang');
      if (attack.combo === 3 && Math.random() < fang * 0.22) damage *= 1.75;
      if (this.regressionCharged) { damage *= 1 + this.upgrades.getStack('regression-blade') * 0.55; this.regressionCharged = false; }
      const pursuit = this.upgrades.getStack('pursuit-mark');
      if (enemy.id === this.lastPursuitId) this.pursuitCount = Math.min(5, this.pursuitCount + 1); else { this.lastPursuitId = enemy.id; this.pursuitCount = 0; }
      damage *= 1 + pursuit * this.pursuitCount * 0.08;
      if (enemy.frozenUntil > this.time.now) damage += this.upgrades.getStack('broken-sentence') * 12;
      this.damageEnemy(enemy, damage, attack.angle); hits += 1;
      if (attack.combo === 3) {
        const body = enemy.body as Phaser.Physics.Arcade.Body; body.velocity.add(new Phaser.Math.Vector2(Math.cos(attack.angle), Math.sin(attack.angle)).scale(120));
      }
    }
    for (const projectile of [...this.projectiles]) {
      if (!projectile.enemyOwned || projectile.frozenUntil <= this.time.now) continue;
      if (Phaser.Math.Distance.Between(attack.x, attack.y, projectile.x, projectile.y) <= range) {
        const target = this.nearestEnemy(projectile.x, projectile.y); if (target) projectile.reflect(target.x, target.y);
      }
    }
    if (hits > 0) { this.gainSentence(BALANCE.sentence.hitGain * hits); this.services.audio.play('hit'); this.cameraKick(0.0026, 60); }
  }

  private dash(x: number, y: number): void {
    if (!this.hero.dash(x, y, (trailX, trailY) => this.resolveDashTrail(trailX, trailY))) return;
    this.markTutorial('dash'); this.services.audio.play('dash');
  }

  private resolveDashTrail(x: number, y: number): void {
    const stacks = this.upgrades.getStack('afterimage-slash'); if (stacks <= 0) return;
    const rune = this.add.rectangle(x, y, 96, 8, 0x61cfbd, 0.5).setRotation(this.hero.facing).setDepth(12);
    this.time.delayedCall(190, () => {
      for (const enemy of [...this.enemies]) if (distanceSq(x, y, enemy.x, enemy.y) < 86 * 86) this.damageEnemy(enemy, 18 * (0.45 + stacks * 0.18), this.hero.facing);
      this.tweens.add({ targets: rune, alpha: 0, duration: 130, onComplete: () => rune.destroy() });
    });
  }

  private parry(): void {
    const extra = this.upgrades.getStack('perfect-breath') * 22;
    if (!this.hero.startParry(extra)) return;
    this.markTutorial('parry');
    const ring = this.add.circle(this.hero.x, this.hero.y, 20, 0x72d7c5, 0.12).setStrokeStyle(3, 0x9affeb, 0.8).setDepth(23);
    this.tweens.add({ targets: ring, radius: 43, alpha: 0, duration: 190, onComplete: () => ring.destroy() });
  }

  private parrySuccess(enemy?: Enemy, projectile?: Projectile): void {
    this.parries += 1; this.gainSentence(BALANCE.sentence.parryGain + this.upgrades.getStack('perfect-breath') * 5);
    this.services.audio.play('parry'); this.cameraKick(0.008, 95); this.cameras.main.flash(85, 132, 255, 227, true);
    if (enemy) { enemy.vulnerableUntil = this.time.now + 1500; enemy.attackActiveUntil = 0; enemy.setVelocity(0); this.damageEnemy(enemy, 12, this.hero.facing, true); }
    if (projectile) { const target = this.nearestEnemy(projectile.x, projectile.y); if (target) projectile.reflect(target.x, target.y); else projectile.destroy(); }
    this.physics.world.timeScale = 0.28; this.tweens.timeScale = 0.35;
    const handle = window.setTimeout(() => { if (this.sys.isActive()) { this.physics.world.timeScale = 1; this.tweens.timeScale = 1; } }, this.services.save.settings.reducedMotion ? 35 : 90);
    this.timeouts.push(handle);
  }

  private armEmpower(): void {
    if (this.empowered || this.sentence < this.sentenceMax) return;
    this.empowered = true; this.sentence = 0; this.services.audio.play('upgrade'); this.hero.setTint(0x86ead8);
    this.time.delayedCall(220, () => { if (this.hero.active) this.hero.clearTint(); });
  }

  private wordCost(base: number): number { return Math.ceil(base * Math.max(0.64, 1 - this.upgrades.getStack('sealed-sentence') * 0.1)); }
  private canCast(baseCost: number, readyAt: number): boolean { return this.runState !== 'upgrade' && this.runState !== 'result' && this.time.now >= readyAt && (this.empowered || this.sentence >= this.wordCost(baseCost)) && this.wordInputAt !== this.game.loop.frame; }
  private spendWord(baseCost: number): boolean { const enhanced = this.empowered; if (!enhanced) this.sentence -= this.wordCost(baseCost); this.empowered = false; this.wordInputAt = this.game.loop.frame; return enhanced; }

  private castStop(x: number, y: number): void {
    if (!this.canCast(BALANCE.sentence.stopCost, this.stopReadyAt)) return;
    const enhanced = this.spendWord(BALANCE.sentence.stopCost); this.stopReadyAt = this.time.now + 5100; this.wordUses['멎는다'] += 1; this.markTutorial('stop');
    this.hero.castPose(); this.services.audio.play('stop'); this.showWordTypography('멎는다', x, y);
    const circle = this.add.circle(x, y, BALANCE.words.stopRadius, 0x55c4b1, 0.08).setStrokeStyle(3, 0x76d8c7, 0.74).setDepth(9).setScale(0.2);
    this.tweens.add({ targets: circle, scale: 1, duration: 180 });
    this.time.delayedCall(180, () => {
      const until = this.time.now + BALANCE.words.stopDuration;
      for (const enemy of this.enemies) if (enhanced || distanceSq(x, y, enemy.x, enemy.y) <= BALANCE.words.stopRadius ** 2) enemy.freeze(until + (enhanced ? 500 : 0), enemy.kind === 'boss');
      let projectileIndex = 0;
      for (const projectile of this.projectiles) {
        if (enhanced || distanceSq(x, y, projectile.x, projectile.y) <= BALANCE.words.stopRadius ** 2) {
          projectile.freeze(until + (enhanced ? 500 : 0));
          if (enhanced && projectileIndex++ % 3 === 0) this.time.delayedCall(280, () => this.explodeStoppedProjectile(projectile));
        }
      }
      this.tweens.add({ targets: circle, alpha: 0, duration: 220, onComplete: () => circle.destroy() });
    });
  }

  private explodeStoppedProjectile(projectile: Projectile): void {
    if (!projectile.active) return; const x = projectile.x; const y = projectile.y; projectile.destroy(); this.projectiles.delete(projectile);
    this.runeBurst(x, y, 10); for (const enemy of [...this.enemies]) if (distanceSq(x, y, enemy.x, enemy.y) < 90 ** 2) this.damageEnemy(enemy, 22, Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y));
  }

  private castRewind(): void {
    if (!this.canCast(BALANCE.sentence.rewindCost, this.rewindReadyAt)) return;
    const records = this.rewind.getRange(this.time.now, BALANCE.words.rewindDuration); if (records.length === 0) return;
    const enhanced = this.spendWord(BALANCE.sentence.rewindCost); this.rewindReadyAt = this.time.now + 7200; this.wordUses['되돌린다'] += 1; this.markTutorial('rewind');
    this.services.audio.play('rewind'); this.showWordTypography('되돌린다', this.hero.x, this.hero.y - 48); this.hero.rewinding = true; this.hero.invulnerableUntil = this.time.now + 900;
    const reverse = [...records].reverse(); const echoTrail: Phaser.GameObjects.Image[] = [];
    this.tweens.addCounter({ from: 0, to: reverse.length - 1, duration: 470, ease: 'Sine.InOut', onUpdate: (tween) => {
      const state = reverse[Math.floor(tween.getValue() ?? 0)]; if (!state) return;
      this.hero.setPosition(state.x, state.y).setFlipX(Math.cos(state.facing) < 0).restoreHealth(state.health);
      if (echoTrail.length < 8 && Math.random() < 0.28) {
        const echo = this.add.image(state.x, state.y, 'hero-move').setOrigin(this.hero.originX, this.hero.originY).setScale(this.hero.scaleX, this.hero.scaleY).setFlipX(this.hero.flipX).setTint(0x65d5c1).setAlpha(0.22).setDepth(18);
        echoTrail.push(echo); this.tweens.add({ targets: echo, alpha: 0, duration: 320, onComplete: () => echo.destroy() });
      }
    }, onComplete: () => {
      this.hero.rewinding = false; const oldest = reverse.at(-1); if (oldest) { this.hero.setVelocity(oldest.velocityX, oldest.velocityY); this.hero.restoreHealth(oldest.health); }
      if (enhanced || this.upgrades.getStack('memory-echo') > 0) this.replayAttackEcho(records[0]?.time ?? this.time.now - 2000, enhanced);
      if (this.upgrades.getStack('regression-blade') > 0) this.regressionCharged = true;
    }});
  }

  private replayAttackEcho(fromTime: number, enhanced: boolean): void {
    const recent = this.attacks.filter((attack) => attack.time >= fromTime).slice(-6);
    const power = 0.48 + this.upgrades.getStack('memory-echo') * 0.22 + (enhanced ? 0.2 : 0);
    recent.forEach((record, index) => this.time.delayedCall(index * 115, () => {
      const echo = this.add.image(record.x, record.y, 'hero-attack').setOrigin(this.hero.originX, this.hero.originY).setScale(0.68).setFlipX(Math.cos(record.angle) < 0).setTint(0x65d5c1).setAlpha(0.55).setDepth(19);
      this.tweens.add({ targets: echo, alpha: 0, x: record.x + Math.cos(record.angle) * 22, duration: 210, onComplete: () => echo.destroy() });
      for (const enemy of [...this.enemies]) if (distanceSq(record.x, record.y, enemy.x, enemy.y) < 78 ** 2 && angleDelta(Phaser.Math.Angle.Between(record.x, record.y, enemy.x, enemy.y), record.angle) < 1) this.damageEnemy(enemy, (BALANCE.hero.attackDamage[record.combo - 1] ?? 18) * power, record.angle);
    }));
  }

  private castLink(x: number, y: number): void {
    if (!this.canCast(BALANCE.sentence.linkCost, this.linkReadyAt)) return;
    const candidates = [...this.enemies].filter((enemy) => enemy.spawned && distanceSq(x, y, enemy.x, enemy.y) < 280 ** 2).sort((a, b) => distanceSq(x, y, a.x, a.y) - distanceSq(x, y, b.x, b.y));
    const enhancedPreview = this.empowered; const selected = candidates.slice(0, enhancedPreview ? 5 : 3); if (selected.length < 2) return;
    const enhanced = this.spendWord(BALANCE.sentence.linkCost); this.linkReadyAt = this.time.now + 8700; this.wordUses['잇는다'] += 1; this.markTutorial('link');
    this.services.audio.play('link'); this.hero.castPose(); this.showWordTypography('잇는다', x, y);
    this.linkedTargets.clear(); const expires = this.time.now + BALANCE.words.linkDuration + (enhanced ? 1300 : 0);
    this.linkShareRatio = enhanced ? BALANCE.words.empoweredLinkShare : BALANCE.words.linkShare;
    selected.forEach((enemy) => { enemy.linked = true; enemy.linkedUntil = expires; this.linkedTargets.add(enemy); });
    this.time.delayedCall(expires - this.time.now, () => {
      if (enhanced) for (const enemy of [...this.linkedTargets]) if (enemy.active) this.damageEnemy(enemy, 22, 0, false, true);
      this.linkedTargets.clear();
    });
  }

  private damageEnemy(enemy: Enemy, amount: number, sourceAngle: number, parried = false, propagated = false): void {
    if (!enemy.active || enemy.health <= 0) return;
    const activeLinks = [...this.linkedTargets].filter((target) => target.active && target.linked);
    const packets = distributeLinkedDamage(enemy.id, amount, activeLinks.map((target) => ({ id: target.id, alive: target.active && target.health > 0 })), this.linkShareRatio, propagated);
    for (const packet of packets) {
      const target = packet.targetId === enemy.id ? enemy : activeLinks.find((item) => item.id === packet.targetId);
      if (!target?.active) continue;
      const dealt = target.takeDamage(packet.amount, sourceAngle, parried && !packet.propagated);
      if (dealt > 0) this.damageNumber(target.x, target.y - 40, dealt, packet.propagated ? 0x5ac9b7 : 0xf1d7a8);
    }
  }

  private onEnemyDied(enemy: Enemy): void {
    this.enemies.delete(enemy); this.linkedTargets.delete(enemy);
    const scoreValue = enemy.kind === 'minion' ? 80 : BALANCE.enemies[enemy.kind].score; this.score += scoreValue;
    if (enemy.linked) {
      const stacks = this.upgrades.getStack('link-overload'); const radius = 76 + stacks * 24; const damage = 22 + stacks * 12;
      this.runeBurst(enemy.x, enemy.y, 8 + stacks * 3);
      for (const target of [...this.enemies]) if (distanceSq(enemy.x, enemy.y, target.x, target.y) < radius ** 2) this.damageEnemy(target, damage, Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y), false, true);
      if (this.upgrades.getStack('inscription-spread') > 0) {
        const nearest = this.nearestEnemy(enemy.x, enemy.y); if (nearest) { nearest.linked = true; nearest.linkedUntil = this.time.now + 2000; this.linkedTargets.add(nearest); }
      }
    }
    if (enemy === this.boss) { this.boss = undefined; this.finishRun(true); return; }
    this.time.delayedCall(240, () => { if (this.runState === 'combat' && this.enemies.size === 0 && this.pendingSpawns === 0) this.completeWave(); });
  }

  private completeWave(): void {
    if (this.runState !== 'combat') return; this.runState = 'upgrade'; this.physics.pause();
    this.showUpgradeChoices();
  }

  private showUpgradeChoices(): void {
    const choices = this.upgrades.choices(3);
    this.services.ui.showUpgradeChoice(choices, this.upgrades.rerollsLeft, (id) => {
      if (!this.upgrades.add(id)) { this.showUpgradeChoices(); return; }
      this.physics.resume(); this.waveIndex += 1;
      if (this.waveIndex < 3) this.spawnWave(this.waveIndex); else this.startBoss();
    }, () => { this.upgrades.reroll(); this.showUpgradeChoices(); });
  }

  private startBoss(): void {
    this.runState = 'boss'; this.firstHitAvailable = true;
    this.showWordTypography('기록 포식자', 480, 150, true);
    const callbacks: BossCallbacks = {
      ...this.enemyCallbacks(),
      phaseChanged: (phase) => this.bossPhaseChanged(phase),
      summon: (count) => this.summonMinions(count),
      inkZone: (x, y, radius, duration) => this.createInkZone(x, y, radius, duration),
    };
    this.boss = new Boss(this, 480, 125, callbacks); this.enemies.add(this.boss); this.boss.spawn();
  }

  private bossPhaseChanged(phase: number): void {
    this.services.audio.play('phase'); this.cameraKick(0.012, 260); this.cameras.main.zoomTo(1.12, 340); this.time.delayedCall(620, () => this.cameras.main.zoomTo(1, 520));
    this.showWordTypography(phase === 2 ? '제2형 · 먹물의 기억' : '제3형 · 이어진 굶주림', 480, 170, true);
  }

  private summonMinions(count: number): void {
    const positions = this.spawnPositions(count).slice(0, count); positions.forEach((position) => this.spawnEnemy('minion', position.x, position.y));
  }

  private createInkZone(x: number, y: number, radius: number, duration: number): void {
    const circle = this.add.circle(x, y, radius, 0x241825, 0.35).setStrokeStyle(2, 0xc7664e, 0.6).setDepth(6).setScale(0.15);
    this.tweens.add({ targets: circle, scale: 1, duration: 520 });
    this.inkZones.push({ circle, expiresAt: this.time.now + duration, nextDamageAt: this.time.now + 650, radius });
  }

  private updateInkZones(time: number): void {
    this.inkZones = this.inkZones.filter((zone) => {
      if (time >= zone.expiresAt) { zone.circle.destroy(); return false; }
      zone.circle.setAlpha(0.28 + Math.sin(time / 170) * 0.08);
      if (time >= zone.nextDamageAt && distanceSq(zone.circle.x, zone.circle.y, this.hero.x, this.hero.y) < zone.radius ** 2) { this.hitHero(10, zone.circle.x, zone.circle.y); zone.nextDamageAt = time + 900; }
      return true;
    });
  }

  private checkProjectileCollision(projectile: Projectile): void {
    if (!projectile.active) return;
    if (projectile.enemyOwned) {
      const distance = Phaser.Math.Distance.Between(projectile.x, projectile.y, this.hero.x, this.hero.y);
      if (distance < 25) {
        if (this.hero.isParrying) this.parrySuccess(undefined, projectile); else { this.hitHero(projectile.damage, projectile.x, projectile.y); projectile.destroy(); }
      } else if (distance < 42 && !projectile.getData('nearMiss')) { projectile.setData('nearMiss', true); this.gainSentence(BALANCE.sentence.nearMissGain); }
    } else {
      for (const enemy of [...this.enemies]) if (distanceSq(projectile.x, projectile.y, enemy.x, enemy.y) < (enemy.kind === 'boss' ? 45 : 31) ** 2) {
        this.damageEnemy(enemy, projectile.damage, projectile.rotation);
        if (projectile.reflected && this.upgrades.getStack('fragment-recovery') > 0) this.hero.heal(this.upgrades.getStack('fragment-recovery') * 4);
        projectile.destroy(); break;
      }
    }
  }

  private checkMeleeCollisions(time: number): void {
    for (const enemy of this.enemies) {
      if (enemy.attackActiveUntil <= time || !enemy.spawned) continue;
      const radius = enemy.kind === 'boss' ? 55 : enemy.kind === 'elite' ? 48 : 38;
      if (distanceSq(enemy.x, enemy.y, this.hero.x, this.hero.y) > radius ** 2) continue;
      enemy.attackActiveUntil = 0;
      if (this.hero.isParrying) this.parrySuccess(enemy); else this.hitHero(Number(enemy.getData('meleeDamage') ?? BALANCE.enemies[enemy.kind === 'minion' ? 'chaser' : enemy.kind].damage), enemy.x, enemy.y);
    }
  }

  private hitHero(baseDamage: number, sourceX: number, sourceY: number): void {
    if (this.qaMode) return;
    let damage = baseDamage;
    if (this.tutorialEnabled && this.tutorialIndex < TUTORIAL.length) damage *= 0.45;
    const cloak = this.upgrades.getStack('ink-cloak'); if (this.firstHitAvailable && cloak > 0) { damage *= Math.max(0.4, 1 - cloak * 0.35); this.firstHitAvailable = false; }
    const dealt = this.hero.takeDamage(damage, sourceX, sourceY); if (dealt <= 0) return;
    this.damageTaken += dealt; this.services.audio.play('hurt'); this.cameraKick(0.006, 110); this.cameras.main.flash(70, 105, 18, 14, true);
    if (this.hero.health <= 0) this.finishRun(false);
  }

  private recordState(time: number): void {
    if (this.hero.rewinding || this.runState === 'upgrade') return;
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    this.rewind.push({ time, x: this.hero.x, y: this.hero.y, health: this.hero.health, velocityX: body.velocity.x, velocityY: body.velocity.y, facing: this.hero.facing });
    this.attacks = this.attacks.filter((attack) => attack.time >= time - BALANCE.words.rewindDuration - 300);
  }

  private updateLinks(time: number): void {
    this.linkGraphics?.clear();
    const active = [...this.linkedTargets].filter((enemy) => enemy.active && enemy.linked && enemy.linkedUntil > time);
    this.linkedTargets = new Set(active); if (active.length < 2) return;
    this.linkGraphics?.lineStyle(3, 0x58c9b6, 0.64);
    for (let index = 0; index < active.length; index += 1) {
      const a = active[index]; const b = active[(index + 1) % active.length]; if (a && b) this.linkGraphics?.lineBetween(a.x, a.y - 10, b.x, b.y - 10);
    }
  }

  private gainSentence(amount: number): void { this.sentence = Math.min(this.sentenceMax, this.sentence + amount * (1 + this.upgrades.getStack('sealed-sentence') * 0.08)); }

  private nearestEnemy(x: number, y: number): Enemy | undefined {
    return [...this.enemies].filter((enemy) => enemy.active && enemy.spawned).sort((a, b) => distanceSq(x, y, a.x, a.y) - distanceSq(x, y, b.x, b.y))[0];
  }

  private damageNumber(x: number, y: number, amount: number, color: number): void {
    const text = this.add.text(x, y, `${Math.round(amount)}`, { fontFamily: 'Malgun Gothic, sans-serif', fontSize: amount >= 40 ? '18px' : '14px', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#071012', strokeThickness: 4 }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: text, y: y - 28, alpha: 0, duration: this.services.save.settings.reducedMotion ? 280 : 520, onComplete: () => text.destroy() });
  }

  private runeBurst(x: number, y: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count + Math.random() * 0.3;
      const pixel = this.add.image(x, y, 'rune-pixel').setTint(index % 2 ? 0xa6f5e6 : 0x4ebaa9).setDepth(25);
      this.tweens.add({ targets: pixel, x: x + Math.cos(angle) * Phaser.Math.Between(24, 64), y: y + Math.sin(angle) * Phaser.Math.Between(20, 58), alpha: 0, duration: 360, onComplete: () => pixel.destroy() });
    }
  }

  private showWordTypography(word: string, x: number, y: number, boss = false): void {
    const text = this.add.text(x, y, word, { fontFamily: 'Malgun Gothic, serif', fontSize: boss ? '34px' : '25px', color: boss ? '#e6c79d' : '#a9f5e6', stroke: '#071012', strokeThickness: 7 }).setOrigin(0.5).setDepth(40).setAlpha(0).setScale(0.75);
    this.tweens.add({ targets: text, alpha: 1, scale: 1, y: y - 14, duration: 190, hold: boss ? 720 : 350, yoyo: true, onComplete: () => text.destroy() });
  }

  private cameraKick(intensity: number, duration: number): void {
    const strength = this.services.save.settings.shake; if (strength <= 0 || this.services.save.settings.reducedMotion) return;
    this.cameras.main.shake(duration, intensity * strength);
  }

  private markTutorial(action: string): void {
    if (!this.tutorialEnabled) return;
    const current = TUTORIAL[this.tutorialIndex]; if (!current || current.action !== action) return;
    this.tutorialIndex += 1;
    if (action === 'parry' || action === 'stop' || action === 'rewind') this.sentence = this.sentenceMax;
    const next = TUTORIAL[this.tutorialIndex];
    if (next) this.services.ui.showTutorial(next.text);
    else { this.services.ui.hideTutorial(); this.services.save.tutorialSeen = true; this.services.persist(); }
  }

  private updateHud(time: number): void {
    const boss = this.boss;
    this.services.ui.updateHud({
      health: this.hero.health, maxHealth: this.hero.maxHealth, sentence: this.sentence, sentenceMax: this.sentenceMax,
      score: this.score, stage: this.runState === 'boss' ? '최종전투 · 기록 포식자' : WAVE_LABELS[this.waveIndex] ?? '잔향의 방',
      stopCooldown: Math.max(0, (this.stopReadyAt - time) / 1000), rewindCooldown: Math.max(0, (this.rewindReadyAt - time) / 1000), linkCooldown: Math.max(0, (this.linkReadyAt - time) / 1000), empowered: this.empowered,
      bossHealth: boss?.health, bossMaxHealth: boss?.maxHealth, bossPhase: boss?.phase,
    });
  }

  private togglePause(): void {
    if (this.runState === 'result' || this.runState === 'upgrade') return;
    if (this.paused) { this.paused = false; this.scene.resume(); return; }
    this.paused = true; this.scene.pause();
    this.services.ui.showPause(() => { this.paused = false; this.scene.resume(); }, () => { this.cleanup(); this.scene.stop(); this.scene.start('MenuScene'); });
  }

  private finishRun(victory: boolean): void {
    if (this.runState === 'result') return; this.runState = 'result'; this.physics.pause(); this.hero.controlsLocked = true;
    const elapsed = Math.max(1, (this.time.now - this.startTime) / 1000); if (victory) this.score += Math.max(0, 1200 - Math.floor(elapsed));
    const rank = rankFor(this.score, this.damageTaken, elapsed);
    if (this.score > this.services.save.bestScore) { this.services.save.bestScore = this.score; this.services.save.bestRank = rank; this.services.persist(); }
    this.services.audio.play(victory ? 'victory' : 'defeat');
    const stats: ResultStats = { victory, score: this.score, time: elapsed, damageTaken: this.damageTaken, parries: this.parries, wordUses: { ...this.wordUses }, upgrades: this.upgrades.summary(), rank };
    this.time.delayedCall(500, () => this.services.ui.showResult(stats, () => this.scene.restart(), () => { this.scene.stop(); this.scene.start('MenuScene'); }));
  }

  private createAtmosphere(): void {
    this.add.particles(0, 0, 'rune-pixel', { x: { min: 45, max: 915 }, y: { min: 70, max: 500 }, speed: { min: 1, max: 6 }, angle: { min: 210, max: 330 }, lifespan: 4800, alpha: { start: 0.12, end: 0 }, quantity: 1, frequency: 420 }).setDepth(5);
  }

  private qaAdvance(): void {
    if (this.runState === 'upgrade' || this.runState === 'result') return;
    if (this.boss?.active) {
      const targetHealth = this.boss.phase === 1 ? this.boss.maxHealth * 0.6 : this.boss.phase === 2 ? this.boss.maxHealth * 0.3 : 0;
      this.damageEnemy(this.boss, Math.max(1, this.boss.health - targetHealth), 0);
      return;
    }
    for (const enemy of [...this.enemies]) this.damageEnemy(enemy, enemy.health + 1, 0, true);
  }

  private cleanup(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerHandler);
    window.removeEventListener('keydown', this.escapeHandler);
    this.timeouts.forEach((handle) => window.clearTimeout(handle)); this.timeouts = [];
    const world = this.physics?.world;
    if (world) world.timeScale = 1;
    if (this.tweens) this.tweens.timeScale = 1;
    this.linkGraphics?.destroy(); this.inkZones.forEach((zone) => zone.circle.destroy());
  }
}
