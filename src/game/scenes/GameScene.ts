import Phaser from 'phaser';
import { BALANCE, type EnemyKind } from '../balance';
import { Boss, type BossCallbacks } from '../entities/Boss';
import { Enemy, type EnemyCallbacks } from '../entities/Enemy';
import { Hero, type HeroAttack } from '../entities/Hero';
import { Projectile } from '../entities/Projectile';
import { getServices, type AppServices } from '../services';
import { parrySentenceReward } from '../systems/CombatRules';
import { AttackHitRegistry, circlesOverlap, sectorHitsCircle, separationOffset } from '../systems/CombatGeometry';
import { CombatStats, type DamageSource } from '../systems/CombatStats';
import { DamageHistory, type RecordedDamageKind } from '../systems/DamageHistory';
import { distributeLinkedDamage } from '../systems/LinkDamage';
import { RewindBuffer } from '../systems/RewindBuffer';
import { TargetingSystem } from '../systems/TargetingSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { WordChainSystem, type WordChainId, type WordId } from '../systems/WordChainSystem';
import { angleDelta, distanceSq, rankFor } from '../utils/math';
import { createArchiveArena } from '../utils/arena';
import type { ResultStats } from '../../ui/OverlayUI';
import { UPGRADES, upgradeById, type UpgradeId } from '../data/upgrades';

interface InkZone { circle: Phaser.GameObjects.Arc; expiresAt: number; nextDamageAt: number; radius: number }
interface RecordedAttack { time: number; x: number; y: number; angle: number; combo: number }
type RunState = 'combat' | 'upgrade' | 'boss' | 'result';
type CombatAction = 'attack' | 'parry' | 'dash' | 'stop' | 'rewind' | 'link';

const WAVE_LABELS = ['제1전투 · 잿빛 추적자', '제2전투 · 먹빛 사선', '제3전투 · 봉합된 문장'] as const;
const TUTORIAL = [
  { action: 'move', text: '<kbd>WASD</kbd> 또는 <kbd>방향키</kbd>로 움직여 공격선을 벗어나라' },
  { action: 'attack', text: '<kbd>J</kbd>로 자동 조준된 적에게 단검 3연격을 이어라' },
  { action: 'dash', text: '<kbd>Space</kbd>로 위험을 관통해 대시하라' },
  { action: 'parry', text: '<kbd>K</kbd> 또는 <kbd>Shift</kbd>로 붉은 순간을 패링하라' },
  { action: 'stop', text: '<kbd>Q</kbd> <b>멎는다</b> — 자동 대상 주변 적과 탄환을 정지시킨다' },
  { action: 'rewind', text: '<kbd>E</kbd> <b>되돌린다</b> — 너의 위치와 체력만 2초 전으로' },
  { action: 'link', text: '<kbd>R</kbd> <b>잇는다</b> — 최대 3명의 피해를 서로 잇는다' },
] as const;

export class GameScene extends Phaser.Scene {
  private services!: AppServices;
  private hero!: Hero;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'w' | 'a' | 's' | 'd' | 'j' | 'k' | 'shift' | 'space' | 'q' | 'e' | 'r' | 'f' | 'p' | 'l' | 'tab' | 'f2' | 'f3' | 'f4', Phaser.Input.Keyboard.Key>;
  private enemies = new Set<Enemy>();
  private projectiles = new Set<Projectile>();
  private inkZones: InkZone[] = [];
  private linkedTargets = new Set<Enemy>();
  private linkShareRatio: number = BALANCE.words.linkShare;
  private linkGraphics?: Phaser.GameObjects.Graphics;
  private rewindGraphics?: Phaser.GameObjects.Graphics;
  private heroRune?: Phaser.GameObjects.Arc;
  private targetMarker?: Phaser.GameObjects.Graphics;
  private currentTarget?: Enemy;
  private linkMarkers = new Map<Enemy, Phaser.GameObjects.Text>();
  private linkGeneration = 0;
  private boss?: Boss;
  private upgrades = new UpgradeSystem();
  private rewind = new RewindBuffer(BALANCE.words.rewindDuration);
  private targeting = new TargetingSystem(BALANCE.targeting);
  private wordChain = new WordChainSystem(BALANCE.chain.window);
  private damageHistory = new DamageHistory(BALANCE.chain.damageHistoryRetention);
  private combatStats = new CombatStats();
  private attackRegistry = new AttackHitRegistry();
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
  private parryCounterUntil = 0;
  private parryAimUntil = 0;
  private parryStartedAt = 0;
  private sentencePulseUntil = 0;
  private bossTransitionUntil = 0;
  private bufferedAction?: { action: CombatAction; expiresAt: number; x: number; y: number };
  private timeouts: number[] = [];
  private lastTargetId?: string;
  private attackTargetLockUntil = 0;
  private keyboardCursorHidden = true;
  private debugHitboxes = false;
  private debugStatsVisible = false;
  private debugGraphics?: Phaser.GameObjects.Graphics;
  private debugStatsText?: Phaser.GameObjects.Text;
  private activeDaggerDebug?: { x: number; y: number; angle: number; range: number; until: number };
  private echoAmplifyUntil = 0;
  private counterShareTargetId?: string;
  private counterShareUntil = 0;
  private bossPhaseStartedAt = 0;
  private debugInvulnerable = false;
  private qaMode = false;
  private pointerHandler!: (pointer: Phaser.Input.Pointer) => void;
  private pointerMoveHandler!: () => void;
  private escapeHandler!: (event: KeyboardEvent) => void;

  public constructor() { super('GameScene'); }

  public create(): void {
    this.resetRunState();
    this.services = getServices();
    this.qaMode = import.meta.env.DEV && new URLSearchParams(window.location.search).has('qa');
    createArchiveArena(this);
    this.createAtmosphere();
    this.heroShadow = this.add.ellipse(480, 304, 48, 17, 0x020506, 0.55).setDepth(399);
    this.hero = new Hero(this, 480, 300);
    this.linkGraphics = this.add.graphics().setDepth(740);
    this.rewindGraphics = this.add.graphics().setDepth(92);
    this.heroRune = this.add.circle(this.hero.x, this.hero.y - 7, 27, 0x5bd2bd, 0).setStrokeStyle(2, 0x8ff3df, 0).setDepth(710);
    this.targetMarker = this.add.graphics().setDepth(735).setAlpha(0);
    if (import.meta.env.DEV) this.debugGraphics = this.add.graphics().setDepth(900).setVisible(false);
    this.setupInput();
    this.services.ui.showHud();
    this.startTime = this.time.now;
    this.tutorialEnabled = this.services.save.settings.showTutorial;
    if (this.tutorialEnabled) this.services.ui.showTutorial(TUTORIAL[0].text);
    this.spawnWave(0);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private resetRunState(): void {
    this.enemies = new Set(); this.projectiles = new Set(); this.inkZones = []; this.linkedTargets = new Set(); this.linkMarkers = new Map(); this.linkShareRatio = BALANCE.words.linkShare; this.linkGeneration = 0;
    this.upgrades = new UpgradeSystem(); this.rewind = new RewindBuffer(BALANCE.words.rewindDuration); this.targeting = new TargetingSystem(BALANCE.targeting); this.wordChain = new WordChainSystem(BALANCE.chain.window, BALANCE.chain.secondWordCostDiscount); this.damageHistory = new DamageHistory(BALANCE.chain.damageHistoryRetention); this.combatStats = new CombatStats(); this.attackRegistry = new AttackHitRegistry(); this.attacks = [];
    this.waveIndex = 0; this.pendingSpawns = 0; this.runState = 'combat'; this.paused = false; this.score = 0;
    this.sentence = 0; this.empowered = false; this.stopReadyAt = 0; this.rewindReadyAt = 0; this.linkReadyAt = 0;
    this.damageTaken = 0; this.parries = 0; this.wordUses = { '멎는다': 0, '되돌린다': 0, '잇는다': 0 };
    this.tutorialIndex = 0; this.firstHitAvailable = true; this.lastPursuitId = ''; this.pursuitCount = 0; this.regressionCharged = false; this.parryCounterUntil = 0; this.parryAimUntil = 0; this.parryStartedAt = 0; this.sentencePulseUntil = 0; this.bossTransitionUntil = 0; this.bufferedAction = undefined; this.currentTarget = undefined; this.lastTargetId = undefined; this.timeouts = [];
    this.keyboardCursorHidden = true; this.attackTargetLockUntil = 0; this.debugHitboxes = false; this.debugStatsVisible = false; this.activeDaggerDebug = undefined; this.echoAmplifyUntil = 0; this.counterShareTargetId = undefined; this.counterShareUntil = 0; this.bossPhaseStartedAt = 0; this.debugInvulnerable = false;
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D', j: 'J', k: 'K', shift: 'SHIFT', space: 'SPACE', q: 'Q', e: 'E', r: 'R', f: 'F', p: 'P', l: 'L', tab: 'TAB', f2: 'F2', f3: 'F3', f4: 'F4' }) as typeof this.keys;
    this.pointerHandler = (pointer: Phaser.Input.Pointer): void => {
      if (this.services.save.settings.controlMode === 'keyboard' || this.paused || this.runState === 'upgrade' || this.runState === 'result') return;
      if (pointer.leftButtonDown()) this.requestCombatAction('attack', 0, 0);
      if (pointer.rightButtonDown()) this.requestCombatAction('parry', 0, 0);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerHandler);
    this.pointerMoveHandler = (): void => { this.keyboardCursorHidden = false; };
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler);
    this.escapeHandler = (event: KeyboardEvent): void => {
      if (!this.scene.isActive() && !this.scene.isPaused()) return;
      if (event.code === 'Tab') event.preventDefault();
      if (!event.repeat) this.keyboardCursorHidden = true;
      if (event.code === 'Escape') { event.preventDefault(); if (this.empowered) this.cancelEmpower(); else this.togglePause(); }
    };
    window.addEventListener('keydown', this.escapeHandler);
  }

  public override update(time: number): void {
    if (this.runState === 'result' || this.runState === 'upgrade' || this.paused) return;
    const pointer = this.input.activePointer;
    const x = (this.keys.d.isDown || this.cursors.right.isDown ? 1 : 0) - (this.keys.a.isDown || this.cursors.left.isDown ? 1 : 0);
    const y = (this.keys.s.isDown || this.cursors.down.isDown ? 1 : 0) - (this.keys.w.isDown || this.cursors.up.isDown ? 1 : 0);
    const keyboardMode = this.services.save.settings.controlMode === 'keyboard';
    this.game.canvas.style.cursor = keyboardMode && this.keyboardCursorHidden ? 'none' : '';
    this.targeting.updateDirection(x, y);
    this.currentTarget = keyboardMode ? this.selectKeyboardTarget() : undefined;
    if (keyboardMode && (Phaser.Input.Keyboard.JustDown(this.keys.tab) || Phaser.Input.Keyboard.JustDown(this.keys.l))) this.cycleKeyboardTarget();
    const direction = this.targeting.lastDirection;
    let aimX = keyboardMode ? this.currentTarget?.x ?? this.hero.x + direction.x * 120 : pointer.worldX;
    let aimY = keyboardMode ? this.currentTarget?.y ?? this.hero.y + direction.y * 120 : pointer.worldY;
    if (keyboardMode && time < this.parryAimUntil) { aimX = this.hero.x + Math.cos(this.hero.facing) * 120; aimY = this.hero.y + Math.sin(this.hero.facing) * 120; }
    this.hero.updateMovement(time, x, y, aimX, aimY);
    this.hero.constrainToArena();
    this.preventBossOverlap();
    this.updateTargetMarker(time);
    this.heroShadow.setPosition(this.hero.x, this.hero.y + 9).setDepth(99 + Math.floor(this.hero.y)).setScale(this.hero.isDashing ? 1.5 : 1);
    this.heroRune?.setPosition(this.hero.x, this.hero.y - 7).setAlpha(this.empowered ? 0.48 + Math.sin(time / 95) * 0.2 : 0).setScale(1 + Math.sin(time / 130) * 0.08);
    if (x !== 0 || y !== 0) this.markTutorial('move');
    if (Phaser.Input.Keyboard.JustDown(this.keys.j) || (this.keys.j.isDown && time - this.hero.lastAttackAt >= BALANCE.hero.attackCooldown)) this.requestCombatAction('attack', x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.k) || Phaser.Input.Keyboard.JustDown(this.keys.shift)) this.requestCombatAction('parry', x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) this.requestCombatAction('dash', x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.f)) this.armEmpower();
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.requestCombatAction('stop', x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) this.requestCombatAction('rewind', x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) this.requestCombatAction('link', x, y);
    this.processBufferedAction();
    if (this.qaMode && Phaser.Input.Keyboard.JustDown(this.keys.p)) this.qaAdvance();
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f2)) this.toggleHitboxDebug();
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f3)) this.toggleStatsDebug();
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f4)) this.showDebugScenarioMenu();
    this.recordState(time);
    for (const enemy of [...this.enemies]) enemy.updateAI(time, this.hero);
    this.resolveEntitySeparation();
    this.preventBossOverlap();
    for (const projectile of [...this.projectiles]) {
      if (!projectile.active) { this.projectiles.delete(projectile); continue; }
      projectile.update(time); this.checkProjectileCollision(projectile);
    }
    this.checkMeleeCollisions(time);
    this.updateInkZones(time);
    this.updateRewindPreview(time);
    this.updateLinks(time);
    this.updateHud(time);
    this.drawCombatDebug(time);
  }

  private requestCombatAction(action: CombatAction, x: number, y: number): void {
    if (this.runState !== 'combat' && this.runState !== 'boss') return;
    if (this.hero.canCancelAttack(this.time.now) && this.executeCombatAction(action, x, y)) { this.bufferedAction = undefined; return; }
    this.bufferedAction = { action, expiresAt: this.time.now + BALANCE.hero.inputBuffer, x, y };
  }

  private processBufferedAction(): void {
    const buffered = this.bufferedAction; if (!buffered) return;
    if (this.time.now > buffered.expiresAt) { this.bufferedAction = undefined; return; }
    if (!this.hero.canCancelAttack(this.time.now)) return;
    if (this.executeCombatAction(buffered.action, buffered.x, buffered.y)) this.bufferedAction = undefined;
  }

  private executeCombatAction(action: CombatAction, x: number, y: number): boolean {
    const pointer = this.input.activePointer; const keyboardMode = this.services.save.settings.controlMode === 'keyboard';
    const direction = this.targeting.lastDirection;
    const aim = keyboardMode
      ? { x: this.currentTarget?.x ?? this.hero.x + direction.x * 120, y: this.currentTarget?.y ?? this.hero.y + direction.y * 120 }
      : { x: pointer.worldX, y: pointer.worldY };
    switch (action) {
      case 'attack': return this.attack(aim.x, aim.y);
      case 'parry': return this.parry();
      case 'dash': return this.dash(x, y);
      case 'stop': {
        const target = keyboardMode ? this.keyboardStopTarget() : aim;
        return this.castStop(target.x, target.y);
      }
      case 'rewind': return this.castRewind();
      case 'link': return this.castLink(aim.x, aim.y, keyboardMode ? this.currentTarget : undefined);
    }
  }

  private selectKeyboardTarget(): Enemy | undefined {
    const candidate = this.targeting.select({ x: this.hero.x, y: this.hero.y }, this.targetCandidates(), this.time.now, this.hero.isAttacking || this.time.now < this.attackTargetLockUntil);
    const selected = candidate ? [...this.enemies].find((enemy) => enemy.id === candidate.id) : undefined;
    if (selected?.id !== this.lastTargetId) {
      const hadTarget = this.lastTargetId !== undefined; this.targetMarker?.setAlpha(0);
      if (selected) { this.combatStats.targetChanged(false); if (hadTarget) this.services.audio.play('target'); }
      this.lastTargetId = selected?.id;
    }
    return selected;
  }

  private targetCandidates(): Array<{ id: string; x: number; y: number; alive: boolean; visible: boolean; threat: number; priority: number }> {
    return [...this.enemies].map((enemy) => ({
      id: enemy.id, x: enemy.x, y: enemy.y, alive: enemy.active && enemy.health > 0 && enemy.spawned,
      visible: enemy.x >= 38 && enemy.x <= 922 && enemy.y >= 58 && enemy.y <= 482,
      threat: enemy.attackActiveUntil > this.time.now || Boolean(enemy.activeTelegraph) ? 1 : enemy.kind === 'chaser' || enemy.kind === 'minion' ? .45 : .2,
      priority: enemy.kind === 'boss' ? 1 : enemy.kind === 'elite' ? .62 : 0,
    }));
  }

  private cycleKeyboardTarget(): void {
    const candidate = this.targeting.cycle({ x: this.hero.x, y: this.hero.y }, this.targetCandidates(), 1, this.time.now);
    this.currentTarget = candidate ? [...this.enemies].find((enemy) => enemy.id === candidate.id) : undefined;
    if (this.currentTarget) { this.lastTargetId = this.currentTarget.id; this.combatStats.targetChanged(true); this.services.audio.play('target'); }
  }

  private updateTargetMarker(time: number): void {
    const marker = this.targetMarker; const target = this.currentTarget;
    if (!marker || !target?.active || this.services.save.settings.controlMode !== 'keyboard') { marker?.setAlpha(0); return; }
    if (marker.alpha <= 0.01) marker.setPosition(target.x, target.y);
    else marker.setPosition(Phaser.Math.Linear(marker.x, target.x, BALANCE.targeting.markerLerp), Phaser.Math.Linear(marker.y, target.y, BALANCE.targeting.markerLerp));
    const ringRadius = target.kind === 'boss' ? 29 : target.kind === 'elite' ? 23 : 18;
    const headY = target.kind === 'boss' ? -72 : -43;
    marker.clear().lineStyle(1.5, 0x70cabb, 0.78).strokeEllipse(0, 7, ringRadius * 2, Math.max(9, ringRadius * .62));
    marker.lineStyle(1, 0xa1eadb, 0.7).lineBetween(-5, headY, 0, headY + 5).lineBetween(0, headY + 5, 5, headY);
    marker.fillStyle(0x86ddcc, 0.55).fillCircle(0, headY - 3, 2);
    marker.setAlpha(0.38 + Math.sin(time / 170) * 0.1);
  }

  private keyboardStopTarget(): { x: number; y: number } {
    const direction = this.targeting.lastDirection;
    let x = this.currentTarget?.x ?? this.hero.x + direction.x * BALANCE.words.stopFallbackDistance;
    let y = this.currentTarget?.y ?? this.hero.y + direction.y * BALANCE.words.stopFallbackDistance;
    const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, x, y);
    if (distance > BALANCE.words.stopMaximumDistance) {
      const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, x, y);
      x = this.hero.x + Math.cos(angle) * BALANCE.words.stopMaximumDistance; y = this.hero.y + Math.sin(angle) * BALANCE.words.stopMaximumDistance;
    }
    return { x: Phaser.Math.Clamp(x, 45, 915), y: Phaser.Math.Clamp(y, 80, 490) };
  }

  private spawnWave(index: number): void {
    this.runState = 'combat'; this.firstHitAvailable = true;
    const list = BALANCE.waveSpawns[index]; if (!list) return;
    const positions = this.spawnPositions(list.length);
    list.forEach((kind, itemIndex) => {
      this.pendingSpawns += 1;
      this.time.delayedCall(itemIndex * BALANCE.pacing.waveSpawnInterval, () => {
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
      shoot: (source, x, y, angle, speed, damage, texture) => this.spawnProjectile(source, x, y, angle, speed, damage, texture),
      melee: (enemy, damage) => this.hitHero(damage, enemy.x, enemy.y, enemy.kind === 'boss' ? 'boss' : 'melee'),
      died: (enemy) => this.onEnemyDied(enemy),
      cue: (cue) => this.services.audio.play(cue === 'warning' ? 'warning' : 'parryOpen'),
    };
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const enemy = new Enemy(this, x, y, kind, this.enemyCallbacks());
    this.enemies.add(enemy); enemy.spawn(); return enemy;
  }

  private spawnProjectile(source: Enemy, x: number, y: number, angle: number, speed: number, damage: number, texture?: string): void {
    const projectile = new Projectile(this, x, y, angle, speed, damage, texture, source.id);
    this.projectiles.add(projectile);
  }

  private attack(targetX: number, targetY: number): boolean {
    const started = this.hero.tryAttack(targetX, targetY, (attack) => this.resolveAttack(attack));
    if (started) {
      this.attackTargetLockUntil = this.time.now + (this.hero.comboStep === 3 ? BALANCE.hero.attackRecovery : BALANCE.hero.comboReset);
      this.combatStats.attackAttempt(); this.services.audio.play('slash');
    }
    return started;
  }

  private resolveAttack(attack: HeroAttack): void {
    this.markTutorial('attack');
    const index = attack.combo - 1;
    const baseDamage = BALANCE.hero.attackDamage[index] ?? 18;
    const range = BALANCE.hero.attackRange[index] ?? 60;
    this.activeDaggerDebug = { x: attack.x, y: attack.y, angle: attack.angle, range, until: this.time.now + 90 };
    const slash = this.add.graphics().setDepth(710);
    slash.lineStyle(attack.combo === 3 ? 9 : 6, attack.combo === 3 ? 0xb9fff1 : 0xd9c49e, 0.85);
    slash.beginPath().arc(attack.x, attack.y, range, attack.angle - 0.72, attack.angle + 0.72).strokePath();
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.18, scaleY: 1.18, duration: 130, onComplete: () => slash.destroy() });
    this.attacks.push({ time: this.time.now, x: attack.x, y: attack.y, angle: attack.angle, combo: attack.combo });
    let hits = 0;
    const parryCounter = this.time.now <= this.parryCounterUntil;
    for (const enemy of [...this.enemies]) {
      if (!enemy.spawned || !sectorHitsCircle({ x: attack.x, y: attack.y, angle: attack.angle, range, halfAngle: BALANCE.collision.daggerHalfAngle }, enemy.hurtCircle)) continue;
      if (!this.attackRegistry.claim(attack.attackId, enemy.id)) continue;
      let damage = baseDamage;
      const fang = this.upgrades.getStack('dragon-fang');
      if (attack.combo === 3 && Math.random() < fang * this.effect('dragon-fang', 'chance')) damage *= this.effect('dragon-fang', 'multiplier');
      if (this.regressionCharged) { damage *= 1 + this.upgrades.getStack('regression-blade') * this.effect('regression-blade', 'bonus'); this.regressionCharged = false; }
      const pursuit = this.upgrades.getStack('pursuit-mark');
      if (enemy.id === this.lastPursuitId) this.pursuitCount = Math.min(this.effect('pursuit-mark', 'maxHits'), this.pursuitCount + 1); else { this.lastPursuitId = enemy.id; this.pursuitCount = 0; }
      damage *= 1 + pursuit * this.pursuitCount * this.effect('pursuit-mark', 'perHit');
      if (enemy.frozenUntil > this.time.now) damage += this.upgrades.getStack('broken-sentence') * this.effect('broken-sentence', 'damage');
      if (parryCounter) damage *= BALANCE.hero.parryCounterBonus;
      this.damageEnemy(enemy, damage, attack.angle, false, false, 'attack'); hits += 1;
      if (enemy.id === this.counterShareTargetId && this.time.now <= this.counterShareUntil) this.applyLinkedCounter(enemy, damage, attack.angle);
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
    if (hits > 0) {
      this.combatStats.attackHit(hits);
      if (parryCounter) { this.parryCounterUntil = 0; this.runeBurst(attack.x + Math.cos(attack.angle) * 28, attack.y + Math.sin(attack.angle) * 28, 6); }
      this.gainSentence(BALANCE.sentence.hitGain * hits); this.services.audio.play('hit');
      if (attack.combo === 3) { this.combatStats.comboFinish(); this.applyDragonRhythm(); this.cameraKick(0.0026, 60); }
    }
  }

  private effect(id: UpgradeId, key: string): number { return upgradeById(id)?.effect[key] ?? 0; }

  private dash(x: number, y: number): boolean {
    if (!this.hero.dash(x, y, (trailX, trailY) => this.resolveDashTrail(trailX, trailY))) return false;
    this.combatStats.dash(); this.markTutorial('dash'); this.services.audio.play('dash');
    return true;
  }

  private resolveDashTrail(x: number, y: number): void {
    const stacks = this.upgrades.getStack('afterimage-slash'); if (stacks <= 0) return;
    const rune = this.add.rectangle(x, y, 96, 8, 0x61cfbd, 0.5).setRotation(this.hero.facing).setDepth(710);
    this.time.delayedCall(190, () => {
      for (const enemy of [...this.enemies]) if (distanceSq(x, y, enemy.x, enemy.y) < 86 * 86) this.damageEnemy(enemy, 18 * (this.effect('afterimage-slash', 'damageRatio') + this.effect('afterimage-slash', 'perStack') * (stacks - 1)), this.hero.facing);
      this.tweens.add({ targets: rune, alpha: 0, duration: 130, onComplete: () => rune.destroy() });
    });
  }

  private parry(): boolean {
    if (this.services.save.settings.controlMode === 'keyboard') this.autoCorrectParryFacing();
    const extra = this.upgrades.getStack('perfect-breath') * this.effect('perfect-breath', 'window');
    if (!this.hero.startParry(extra)) return false;
    this.parryStartedAt = this.time.now; this.combatStats.parryAttempt();
    this.parryAimUntil = this.hero.parryUntil;
    this.markTutorial('parry');
    const ring = this.add.circle(this.hero.x, this.hero.y, 20, 0x72d7c5, 0.12).setStrokeStyle(3, 0x9affeb, 0.8).setDepth(730);
    this.tweens.add({ targets: ring, radius: 43, alpha: 0, duration: 190, onComplete: () => ring.destroy() });
    return true;
  }

  private autoCorrectParryFacing(): void {
    const threats: Array<{ x: number; y: number; danger: number }> = [];
    for (const projectile of this.projectiles) {
      if (!projectile.active || !projectile.enemyOwned) continue;
      const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, projectile.x, projectile.y); if (distance > BALANCE.hero.parryAssistRadius) continue;
      const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, projectile.x, projectile.y);
      if (angleDelta(angle, this.hero.facing) > BALANCE.hero.parryAssistMaxAngle) continue;
      const body = projectile.body as Phaser.Physics.Arcade.Body;
      const towardHero = body.velocity.x * (this.hero.x - projectile.x) + body.velocity.y * (this.hero.y - projectile.y);
      if (towardHero <= 0) continue;
      threats.push({ x: projectile.x, y: projectile.y, danger: distance / Math.max(1, body.speed) });
    }
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.attackActiveUntil <= this.time.now) continue;
      const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, enemy.x, enemy.y); if (distance > BALANCE.hero.parryAssistRadius) continue;
      const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y);
      if (angleDelta(angle, this.hero.facing) <= BALANCE.hero.parryAssistMaxAngle) threats.push({ x: enemy.x, y: enemy.y, danger: distance / 500 });
    }
    const threat = threats.sort((a, b) => a.danger - b.danger)[0];
    if (threat) this.hero.setFacing(Phaser.Math.Angle.Between(this.hero.x, this.hero.y, threat.x, threat.y));
  }

  private isInsideParryArc(x: number, y: number): boolean {
    return angleDelta(Phaser.Math.Angle.Between(this.hero.x, this.hero.y, x, y), this.hero.facing) <= BALANCE.hero.parryArc;
  }

  private parrySuccess(enemy?: Enemy, projectile?: Projectile): void {
    const perfectBreath = this.upgrades.getStack('perfect-breath');
    const perfect = this.time.now - this.parryStartedAt <= BALANCE.hero.perfectParryWindow;
    this.combatStats.parrySuccess(perfect);
    this.parries += 1; this.gainSentence(parrySentenceReward(BALANCE.sentence.parryGain, perfectBreath));
    this.parryCounterUntil = this.time.now + BALANCE.hero.parryCounterWindow;
    this.services.audio.play(perfect ? 'perfectParry' : 'parry'); this.cameraKick(0.008, 95);
    const flash = this.add.circle(this.hero.x, this.hero.y - 8, 24, 0xb4ffef, 0.2).setStrokeStyle(5, 0x8ff3df, 0.95).setDepth(780);
    this.tweens.add({ targets: flash, radius: 72, alpha: 0, duration: this.services.save.settings.reducedMotion ? 95 : 170, onComplete: () => flash.destroy() });
    this.runeBurst(this.hero.x, this.hero.y - 10, 8);
    if (enemy) {
      enemy.vulnerableUntil = this.time.now + BALANCE.hero.parryVulnerability; enemy.attackActiveUntil = 0; enemy.setVelocity(0); this.damageEnemy(enemy, 12, this.hero.facing, true);
      if (perfect && this.upgrades.getStack('linked-counter') > 0) enemy.setData('counterMarkedUntil', this.time.now + this.effect('linked-counter', 'duration'));
    }
    if (perfect && this.upgrades.getStack('unbroken-context') > 0) this.wordChain.extendOnce(this.time.now, this.effect('unbroken-context', 'extension'));
    if (projectile) { const target = this.nearestEnemy(projectile.x, projectile.y); if (target) projectile.reflect(target.x, target.y); else projectile.destroy(); }
    this.physics.world.timeScale = 0.28; this.tweens.timeScale = 0.35;
    const handle = window.setTimeout(() => { if (this.sys.isActive()) { this.physics.world.timeScale = 1; this.tweens.timeScale = 1; } }, this.services.save.settings.reducedMotion ? 35 : BALANCE.hero.parryHitstop);
    this.timeouts.push(handle);
  }

  private armEmpower(): void {
    if (this.empowered) { this.cancelEmpower(); return; }
    if (this.sentence < this.sentenceMax) return;
    this.empowered = true; this.services.audio.play('empowerReady'); this.services.ui.showNotice('F 강화 용언 대기 · Esc/F 취소', 900); this.hero.setTint(0x86ead8);
    this.runeBurst(this.hero.x, this.hero.y - 12, 12);
    this.time.delayedCall(220, () => { if (this.hero.active) this.hero.clearTint(); });
  }

  private cancelEmpower(): void { this.empowered = false; if (this.hero?.active) this.hero.clearTint(); this.services.ui.showNotice('강화 대기 취소', 550); }

  private wordCost(base: number, chainDiscount = 0): number { return Math.ceil(base * Math.max(0.64, 1 - this.upgrades.getStack('sealed-sentence') * this.effect('sealed-sentence', 'costReduction')) * (1 - chainDiscount)); }
  private canCast(baseCost: number, readyAt: number, chainDiscount = 0): boolean { return this.runState !== 'upgrade' && this.runState !== 'result' && this.time.now >= readyAt && (this.empowered || this.sentence >= this.wordCost(baseCost, chainDiscount)) && this.wordInputAt !== this.game.loop.frame; }
  private spendWord(baseCost: number, chainDiscount = 0): boolean {
    const enhanced = this.empowered;
    if (enhanced) { this.sentence = BALANCE.chain.empoweredFollowupSentence; this.combatStats.empower(); }
    else this.sentence -= this.wordCost(baseCost, chainDiscount);
    this.empowered = false; this.wordInputAt = this.game.loop.frame; return enhanced;
  }

  private castStop(x: number, y: number): boolean {
    const directlyAffected = [...this.enemies].some((enemy) => enemy.active && enemy.spawned && distanceSq(x, y, enemy.x, enemy.y) <= BALANCE.words.stopRadius ** 2)
      || [...this.projectiles].some((projectile) => projectile.active && projectile.enemyOwned && distanceSq(x, y, projectile.x, projectile.y) <= BALANCE.words.stopRadius ** 2);
    const activeLinked = [...this.linkedTargets].filter((enemy) => enemy.active && enemy.linked);
    const chainPreview = this.wordChain.preview('stop', this.time.now, { hasLinkedTargets: activeLinked.length > 0 });
    const discount = chainPreview ? BALANCE.chain.secondWordCostDiscount : 0;
    if (!this.canCast(BALANCE.sentence.stopCost, this.stopReadyAt, discount)) { if (chainPreview) this.services.ui.showNotice('문장력 부족 · 연쇄 할인 적용 불가', 700); return false; }
    const echoBonus = this.consumeEchoAmplifier();
    const enhanced = this.spendWord(BALANCE.sentence.stopCost, discount); this.stopReadyAt = this.time.now + 5100; this.wordUses['멎는다'] += 1; this.combatStats.word('stop'); this.markTutorial('stop');
    const chain = this.registerWordUse('stop', { successful: directlyAffected || activeLinked.length > 0, hasLinkedTargets: activeLinked.length > 0 });
    this.hero.castPose(); this.services.audio.play('stop'); this.showWordTypography('멎는다', x, y);
    const circle = this.add.circle(x, y, BALANCE.words.stopRadius, 0x55c4b1, 0.08).setStrokeStyle(3, 0x76d8c7, 0.74).setDepth(80).setScale(0.2);
    this.tweens.add({ targets: circle, scale: 1, duration: 180 });
    this.time.delayedCall(180, () => {
      const until = this.time.now + BALANCE.words.stopDuration * (1 + echoBonus);
      for (const enemy of this.enemies) if (enhanced || distanceSq(x, y, enemy.x, enemy.y) <= BALANCE.words.stopRadius ** 2) enemy.freeze(until + (enhanced ? 500 : 0), enemy.kind === 'boss');
      let projectileIndex = 0;
      for (const projectile of this.projectiles) {
        if (enhanced || distanceSq(x, y, projectile.x, projectile.y) <= BALANCE.words.stopRadius ** 2) {
          projectile.freeze(until + (enhanced ? 500 : 0));
          if (enhanced && projectileIndex++ % 3 === 0) this.time.delayedCall(280, () => this.explodeStoppedProjectile(projectile));
        }
      }
      if (chain === 'chain-stop') this.applyChainStop(activeLinked);
      this.tweens.add({ targets: circle, alpha: 0, duration: 220, onComplete: () => circle.destroy() });
    });
    return true;
  }

  private explodeStoppedProjectile(projectile: Projectile): void {
    if (!projectile.active) return; const x = projectile.x; const y = projectile.y; projectile.destroy(); this.projectiles.delete(projectile);
    this.runeBurst(x, y, 10); for (const enemy of [...this.enemies]) if (distanceSq(x, y, enemy.x, enemy.y) < 90 ** 2) this.damageEnemy(enemy, 22, Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y), false, false, 'word');
  }

  private castRewind(): boolean {
    const records = this.rewind.getRange(this.time.now, BALANCE.words.rewindDuration); if (records.length === 0) return false;
    const frozenProjectiles = [...this.projectiles].filter((projectile) => projectile.active && projectile.enemyOwned && !projectile.reflected && projectile.frozenUntil > this.time.now);
    const activeLinked = [...this.linkedTargets].filter((enemy) => enemy.active && enemy.linked);
    const hasRecordedDamage = this.damageHistory.hasRecentDamage(activeLinked.map((enemy) => enemy.id), this.time.now, BALANCE.chain.damageHistoryDuration);
    const chainPreview = this.wordChain.preview('rewind', this.time.now, { hasFrozenProjectiles: frozenProjectiles.length > 0, hasLinkedTargets: activeLinked.length > 0, hasRecordedDamage });
    const discount = chainPreview ? BALANCE.chain.secondWordCostDiscount : 0;
    if (!this.canCast(BALANCE.sentence.rewindCost, this.rewindReadyAt, discount)) { if (chainPreview) this.services.ui.showNotice('문장력 부족 · 연쇄 할인 적용 불가', 700); return false; }
    const echoBonus = this.consumeEchoAmplifier();
    const enhanced = this.spendWord(BALANCE.sentence.rewindCost, discount); this.rewindReadyAt = this.time.now + 7200; this.wordUses['되돌린다'] += 1; this.combatStats.word('rewind'); this.markTutorial('rewind');
    const chain = this.registerWordUse('rewind', { successful: true, hasFrozenProjectiles: frozenProjectiles.length > 0, hasLinkedTargets: activeLinked.length > 0, hasRecordedDamage });
    if (chain === 'backflow') this.applyBackflow(frozenProjectiles);
    if (chain === 'damage-regression') this.applyDamageRegression(activeLinked);
    const before = { x: this.hero.x, y: this.hero.y, health: this.hero.health };
    const targetState = records[0];
    this.hero.cancelAttackRecovery();
    this.services.audio.play('rewind'); this.showWordTypography('되돌린다', this.hero.x, this.hero.y - 48); this.hero.rewinding = true; this.hero.invulnerableUntil = this.time.now + 900;
    if (targetState) {
      const marker = this.add.circle(targetState.x, targetState.y - 5, 12, 0x3d9fc2, 0.1).setStrokeStyle(2, 0x7edcf2, 0.9).setDepth(705);
      this.tweens.add({ targets: marker, radius: 30, alpha: 0, duration: 520, onComplete: () => marker.destroy() });
    }
    const reverse = [...records].reverse(); const echoTrail: Phaser.GameObjects.Image[] = [];
    this.tweens.addCounter({ from: 0, to: reverse.length - 1, duration: 470, ease: 'Sine.InOut', onUpdate: (tween) => {
      const state = reverse[Math.floor(tween.getValue() ?? 0)]; if (!state) return;
      this.hero.setPosition(state.x, state.y).setFlipX(Math.cos(state.facing) < 0).restoreHealth(state.health);
      if (echoTrail.length < 8 && Math.random() < 0.28) {
        const echo = this.add.image(state.x, state.y, 'hero-move').setOrigin(0.5, 1).setScale(Math.abs(this.hero.scaleX), Math.abs(this.hero.scaleY)).setFlipX(this.hero.flipX).setTint(0x43add0).setAlpha(0.24).setDepth(98 + Math.floor(state.y));
        echoTrail.push(echo); this.tweens.add({ targets: echo, alpha: 0, duration: 320, onComplete: () => echo.destroy() });
      }
    }, onComplete: () => {
      this.hero.rewinding = false; const oldest = reverse.at(-1); if (oldest) { this.hero.setVelocity(oldest.velocityX, oldest.velocityY); this.hero.restoreHealth(oldest.health); }
      if (oldest) {
        const recovered = Math.max(0, oldest.health - before.health);
        const moved = Phaser.Math.Distance.Between(before.x, before.y, oldest.x, oldest.y);
        if (recovered > 0.5) this.damageNumber(this.hero.x, this.hero.y - 62, recovered, 0x75e6f3, false, '+');
        if (this.boss?.active && this.boss.phase === 2 && (recovered > 0.5 || moved > 72)) {
          this.makeBossVulnerable('기록 균열');
        }
      }
      if (enhanced || this.upgrades.getStack('memory-echo') > 0 || echoBonus > 0) this.replayAttackEcho(records[0]?.time ?? this.time.now - 2000, enhanced, echoBonus);
      this.replayRegressionSwordShadow();
      if (this.upgrades.getStack('regression-blade') > 0) this.regressionCharged = true;
    }});
    return true;
  }

  private replayAttackEcho(fromTime: number, enhanced: boolean, echoBonus = 0): void {
    const recent = this.attacks.filter((attack) => attack.time >= fromTime).slice(-6);
    const power = 0.48 + this.upgrades.getStack('memory-echo') * this.effect('memory-echo', 'power') + (enhanced ? 0.2 : 0) + echoBonus;
    recent.forEach((record, index) => this.time.delayedCall(index * 115, () => {
      const echo = this.add.image(record.x, record.y, 'hero-attack').setOrigin(0.5, 1).setScale(0.63).setFlipX(Math.cos(record.angle) < 0).setTint(0x43add0).setAlpha(0.55).setDepth(98 + Math.floor(record.y));
      this.tweens.add({ targets: echo, alpha: 0, x: record.x + Math.cos(record.angle) * 22, duration: 210, onComplete: () => echo.destroy() });
      for (const enemy of [...this.enemies]) if (distanceSq(record.x, record.y, enemy.x, enemy.y) < 78 ** 2 && angleDelta(Phaser.Math.Angle.Between(record.x, record.y, enemy.x, enemy.y), record.angle) < 1) this.damageEnemy(enemy, (BALANCE.hero.attackDamage[record.combo - 1] ?? 18) * power, record.angle);
    }));
  }

  private replayRegressionSwordShadow(): void {
    const stacks = this.upgrades.getStack('regression-sword-shadow'); if (stacks <= 0) return;
    const record = [...this.attacks].reverse().find((attack) => attack.combo === 3); if (!record) return;
    const ratio = this.effect('regression-sword-shadow', 'baseRatio') + this.effect('regression-sword-shadow', 'perStack') * (stacks - 1);
    this.time.delayedCall(130, () => {
      const echo = this.add.image(record.x, record.y, 'hero-attack').setOrigin(.5, 1).setScale(.63).setFlipX(Math.cos(record.angle) < 0).setTint(0x55b9d5).setAlpha(.52).setDepth(708);
      this.tweens.add({ targets: echo, x: record.x + Math.cos(record.angle) * 25, alpha: 0, duration: 230, onComplete: () => echo.destroy() });
      const comboRange = BALANCE.hero.attackRange[2] ?? 78; const comboDamage = BALANCE.hero.attackDamage[2] ?? 34;
      for (const enemy of this.enemies) if (enemy.active && sectorHitsCircle({ x: record.x, y: record.y, angle: record.angle, range: comboRange, halfAngle: BALANCE.collision.daggerHalfAngle }, enemy.hurtCircle)) {
        this.damageEnemy(enemy, comboDamage * ratio, record.angle, false, true); this.combatText(enemy.x, enemy.y - 48, '검영', 0x71cae0);
      }
    });
  }

  private applyLinkedCounter(marked: Enemy, damage: number, angle: number): void {
    const stacks = this.upgrades.getStack('linked-counter'); if (stacks <= 0) return;
    const shared = damage * this.effect('linked-counter', 'share') * stacks;
    for (const target of this.linkedTargets) {
      if (!target.active || target === marked) continue;
      const dealt = target.takeDamage(shared, angle); if (dealt > 0) { this.damageNumber(target.x, target.y - 42, dealt, 0x9ae7d7, true, '반격 '); this.linkPulse(marked, target, 0xf0d49a); }
    }
    this.counterShareTargetId = undefined; this.counterShareUntil = 0;
  }

  private applyDragonRhythm(): void {
    const stacks = this.upgrades.getStack('dragon-rhythm'); if (stacks <= 0) return;
    this.gainSentence(this.effect('dragon-rhythm', 'sentence') * stacks);
    const entries: Array<{ key: 'stop' | 'rewind' | 'link'; readyAt: number }> = [
      { key: 'stop', readyAt: this.stopReadyAt }, { key: 'rewind', readyAt: this.rewindReadyAt }, { key: 'link', readyAt: this.linkReadyAt },
    ];
    const target = entries.filter((entry) => entry.readyAt > this.time.now).sort((a, b) => a.readyAt - b.readyAt)[0];
    if (!target) return; const reduction = this.effect('dragon-rhythm', 'cooldown') * stacks;
    if (target.key === 'stop') this.stopReadyAt = Math.max(this.time.now, this.stopReadyAt - reduction);
    else if (target.key === 'rewind') this.rewindReadyAt = Math.max(this.time.now, this.rewindReadyAt - reduction);
    else this.linkReadyAt = Math.max(this.time.now, this.linkReadyAt - reduction);
  }

  private castLink(x: number, y: number, primary?: Enemy): boolean {
    if (!this.canCast(BALANCE.sentence.linkCost, this.linkReadyAt)) return false;
    let candidates: Enemy[];
    if (primary?.active && primary.spawned) {
      const nearby = [...this.enemies].filter((enemy) => enemy !== primary && enemy.active && enemy.spawned && distanceSq(primary.x, primary.y, enemy.x, enemy.y) < BALANCE.words.linkSelectionRadius ** 2).sort((a, b) => distanceSq(primary.x, primary.y, a.x, a.y) - distanceSq(primary.x, primary.y, b.x, b.y));
      candidates = [primary, ...nearby];
    } else candidates = [...this.enemies].filter((enemy) => enemy.spawned && distanceSq(x, y, enemy.x, enemy.y) < 280 ** 2).sort((a, b) => distanceSq(x, y, a.x, a.y) - distanceSq(x, y, b.x, b.y));
    if (this.boss?.active && this.boss.phase === 3 && distanceSq(x, y, this.boss.x, this.boss.y) < 330 ** 2) {
      const phaseTargets = [...this.enemies].filter((enemy) => enemy.spawned && (enemy === this.boss || enemy.kind === 'minion'));
      candidates = primary ? [primary, ...new Set([...phaseTargets.filter((enemy) => enemy !== primary), ...candidates.filter((enemy) => enemy !== primary)])] : [...new Set([...phaseTargets, ...candidates])];
    }
    const enhancedPreview = this.empowered; const selected = candidates.slice(0, enhancedPreview ? 5 : 3); if (selected.length < 1) return false;
    const echoBonus = this.consumeEchoAmplifier();
    const enhanced = this.spendWord(BALANCE.sentence.linkCost); this.linkReadyAt = this.time.now + 8700; this.wordUses['잇는다'] += 1; this.combatStats.word('link'); this.markTutorial('link');
    this.services.audio.play('link'); this.hero.castPose(); this.showWordTypography('잇는다', x, y);
    this.clearLinks(); const expires = this.time.now + (BALANCE.words.linkDuration + (enhanced ? 1300 : 0)) * (1 + echoBonus);
    const generation = ++this.linkGeneration;
    this.linkShareRatio = (enhanced ? BALANCE.words.empoweredLinkShare : BALANCE.words.linkShare) * (1 + echoBonus * .7);
    selected.forEach((enemy) => {
      enemy.linked = true; enemy.linkedUntil = expires; this.linkedTargets.add(enemy);
      const marker = this.add.text(enemy.x, enemy.y - (enemy.kind === 'boss' ? 78 : 48), '連', { fontFamily: 'Malgun Gothic, serif', fontSize: enemy.kind === 'boss' ? '19px' : '15px', color: '#a1f3df', stroke: '#09201d', strokeThickness: 4 }).setOrigin(0.5).setDepth(750);
      this.linkMarkers.set(enemy, marker);
      const preview = this.add.circle(enemy.x, enemy.y - 8, enemy.kind === 'boss' ? 34 : 23, 0x58c9b6, 0.04).setStrokeStyle(2, 0xa3f5e4, 0.72).setDepth(745).setScale(0.72);
      this.tweens.add({ targets: preview, scale: 1.18, alpha: 0, duration: 190, onComplete: () => preview.destroy() });
    });
    const counterMarked = selected.find((enemy) => Number(enemy.getData('counterMarkedUntil') ?? 0) >= this.time.now);
    if (counterMarked && this.upgrades.getStack('linked-counter') > 0) { this.counterShareTargetId = counterMarked.id; this.counterShareUntil = expires; }
    this.registerWordUse('link', { successful: true, hasLinkedTargets: selected.length > 0 });
    this.time.delayedCall(expires - this.time.now, () => {
      if (generation !== this.linkGeneration) return;
      if (enhanced) for (const enemy of [...this.linkedTargets]) if (enemy.active) this.damageEnemy(enemy, 22, 0, false, true);
      this.clearLinks();
    });
    return true;
  }

  private registerWordUse(word: WordId, context: Parameters<WordChainSystem['use']>[2]): WordChainId | undefined {
    const result = this.wordChain.use(word, this.time.now, context);
    if (result.chain) {
      const name: Record<WordChainId, string> = { 'chain-stop': '연쇄 정지', backflow: '역류', 'damage-regression': '피해 회귀' };
      this.combatStats.chain(result.chain);
      const breath = this.upgrades.getStack('chain-breath');
      if (breath > 0) { this.gainSentence(this.effect('chain-breath', 'sentence') * breath); this.reduceAllWordCooldowns(this.effect('chain-breath', 'cooldown') * breath); }
      if (this.upgrades.getStack('echo-amplifier') > 0) this.echoAmplifyUntil = this.time.now + this.effect('echo-amplifier', 'window');
      this.services.audio.play(result.chain === 'chain-stop' ? 'chainStop' : result.chain === 'backflow' ? 'chainBackflow' : 'chainRegression'); this.services.ui.showChainTrigger(name[result.chain], BALANCE.chain.labelDuration);
    }
    return result.chain;
  }

  private consumeEchoAmplifier(): number {
    const stacks = this.upgrades.getStack('echo-amplifier');
    if (stacks <= 0 || this.time.now > this.echoAmplifyUntil) return 0;
    this.echoAmplifyUntil = 0; return this.effect('echo-amplifier', 'bonus') * stacks;
  }

  private reduceAllWordCooldowns(milliseconds: number): void {
    this.stopReadyAt = Math.max(this.time.now, this.stopReadyAt - milliseconds);
    this.rewindReadyAt = Math.max(this.time.now, this.rewindReadyAt - milliseconds);
    this.linkReadyAt = Math.max(this.time.now, this.linkReadyAt - milliseconds);
  }

  private applyChainStop(linked: readonly Enemy[]): void {
    const active = linked.filter((enemy) => enemy.active && enemy.linked); if (active.length === 0) return;
    const until = this.time.now + BALANCE.chain.linkStopDuration;
    for (const enemy of active) enemy.freeze(until, enemy.kind === 'boss');
    const sourceIds = new Set(active.map((enemy) => enemy.id));
    for (const projectile of this.projectiles) if (projectile.active && projectile.enemyOwned && projectile.sourceId && sourceIds.has(projectile.sourceId)) projectile.freeze(until);
    const anchor = active[0]; if (!anchor) return;
    for (const enemy of active.slice(1)) this.linkPulse(anchor, enemy, 0x9ef5e5);
    this.runeBurst(anchor.x, anchor.y - 10, 8);
    const resonance = this.upgrades.getStack('stop-resonance');
    if (resonance > 0) {
      const damaged = new Set<string>();
      for (const source of active) {
        const wave = this.add.circle(source.x, source.y - 8, 14, 0x69d2bd, .06).setStrokeStyle(2, 0xa5f4e4, .76).setDepth(745);
        this.tweens.add({ targets: wave, radius: 72, alpha: 0, duration: 280, onComplete: () => wave.destroy() });
        for (const enemy of this.enemies) {
          if (!enemy.active || enemy === source || damaged.has(enemy.id) || distanceSq(source.x, source.y, enemy.x, enemy.y) > 78 ** 2) continue;
          damaged.add(enemy.id); enemy.slow(this.time.now + this.effect('stop-resonance', 'slowDuration'));
          const damage = this.effect('stop-resonance', 'damage') * resonance;
          this.damageEnemy(enemy, damage, Phaser.Math.Angle.Between(source.x, source.y, enemy.x, enemy.y), false, true);
          this.combatStats.addChainDamage('chain-stop', damage);
        }
      }
    }
  }

  private applyBackflow(projectiles: readonly Projectile[]): void {
    for (const projectile of projectiles) {
      if (!projectile.active || !projectile.enemyOwned || projectile.reflected) continue;
      const original = [...this.enemies].find((enemy) => enemy.id === projectile.sourceId && enemy.active) ?? this.nearestEnemy(projectile.x, projectile.y);
      if (!original) continue;
      const echo = this.add.circle(projectile.x, projectile.y, 8, 0x58bfe0, 0.12).setStrokeStyle(2, 0x8ee9f4, 0.85).setDepth(745);
      this.tweens.add({ targets: echo, radius: 22, alpha: 0, duration: 230, onComplete: () => echo.destroy() });
      projectile.reflect(original.x, original.y, projectile.originalDamage * BALANCE.chain.backflowDamageRatio, true);
    }
  }

  private applyDamageRegression(linked: readonly Enemy[]): void {
    const active = linked.filter((enemy) => enemy.active && enemy.linked);
    const anchor = active[0];
    active.forEach((enemy, index) => {
      const recorded = this.damageHistory.recentDamage(enemy.id, this.time.now, BALANCE.chain.damageHistoryDuration);
      const amount = recorded * BALANCE.chain.damageRegressionRatio; if (amount <= 0) return;
      this.time.delayedCall(index * 70, () => {
        if (!enemy.active) return;
        const dealt = enemy.takeDamage(amount, Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y));
        if (dealt > 0) { this.combatStats.addChainDamage('damage-regression', dealt); this.damageNumber(enemy.x, enemy.y - 42, dealt, 0x70c6ea, true, '회귀 '); this.runeBurst(enemy.x, enemy.y - 6, 5); }
        if (anchor && anchor !== enemy && anchor.active) this.linkPulse(enemy, anchor, 0x64bfe1);
      });
    });
  }

  private damageEnemy(enemy: Enemy, amount: number, sourceAngle: number, parried = false, propagated = false, historyKind?: RecordedDamageKind): void {
    if (!enemy.active || enemy.health <= 0) return;
    const activeLinks = [...this.linkedTargets].filter((target) => target.active && target.linked);
    const packets = distributeLinkedDamage(enemy.id, amount, activeLinks.map((target) => ({ id: target.id, alive: target.active && target.health > 0 })), this.linkShareRatio, propagated);
    for (const packet of packets) {
      const target = packet.targetId === enemy.id ? enemy : activeLinks.find((item) => item.id === packet.targetId);
      if (!target?.active) continue;
      const dealt = target.takeDamage(packet.amount, sourceAngle, parried && !packet.propagated);
      if (dealt > 0) {
        if (!packet.propagated && historyKind) this.damageHistory.record(this.time.now, target.id, dealt, historyKind);
        this.damageNumber(target.x, target.y - 40, dealt, packet.propagated ? 0x72e1cd : 0xf1d7a8, packet.propagated, packet.propagated ? '공유 ' : '');
        if (packet.propagated) this.linkPulse(enemy, target);
      }
    }
  }

  private onEnemyDied(enemy: Enemy): void {
    if (enemy.kind === 'minion' && enemy.linked && this.boss?.active && this.boss.phase === 3 && this.boss.linked) this.makeBossVulnerable('연결 핵 노출');
    this.enemies.delete(enemy); this.linkedTargets.delete(enemy); this.linkMarkers.get(enemy)?.destroy(); this.linkMarkers.delete(enemy);
    const scoreValue = enemy.kind === 'minion' ? 80 : BALANCE.enemies[enemy.kind].score; this.score += scoreValue;
    if (enemy.linked) {
      const stacks = this.upgrades.getStack('link-overload'); const radius = this.effect('link-overload', 'baseRadius') + stacks * this.effect('link-overload', 'radiusPerStack'); const damage = this.effect('link-overload', 'baseDamage') + stacks * this.effect('link-overload', 'damagePerStack');
      const burst = this.add.circle(enemy.x, enemy.y, 18, 0x55c8b1, 0.16).setStrokeStyle(4, 0x9af3df, 0.88).setDepth(745);
      this.tweens.add({ targets: burst, radius, alpha: 0, duration: 260, onComplete: () => burst.destroy() });
      this.runeBurst(enemy.x, enemy.y, 8 + stacks * 3);
      for (const target of [...this.enemies]) if (distanceSq(enemy.x, enemy.y, target.x, target.y) < radius ** 2) this.damageEnemy(target, damage, Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y), false, true);
      if (this.upgrades.getStack('inscription-spread') > 0) {
        const nearest = this.nearestEnemy(enemy.x, enemy.y); if (nearest) { nearest.linked = true; nearest.linkedUntil = this.time.now + this.effect('inscription-spread', 'duration'); this.linkedTargets.add(nearest); }
      }
    }
    if (enemy === this.boss) { this.combatStats.setBossPhaseTime(3, (this.time.now - this.bossPhaseStartedAt) / 1000); this.boss = undefined; this.finishRun(true); return; }
    this.time.delayedCall(BALANCE.pacing.waveCompleteDelay, () => { if (this.runState === 'combat' && this.enemies.size === 0 && this.pendingSpawns === 0) this.completeWave(); });
  }

  private completeWave(): void {
    if (this.runState !== 'combat') return; this.runState = 'upgrade'; this.bufferedAction = undefined; this.wordChain.reset(); this.physics.pause();
    this.showUpgradeChoices();
  }

  private showUpgradeChoices(): void {
    const choices = this.upgrades.choices(3);
    this.services.ui.showUpgradeChoice(choices, this.upgrades.rerollsLeft, (id) => {
      if (!this.upgrades.add(id)) { this.showUpgradeChoices(); return; }
      this.physics.resume(); this.waveIndex += 1;
      if (this.waveIndex < 3) this.spawnWave(this.waveIndex); else this.startBoss();
    }, () => { this.upgrades.reroll(); this.showUpgradeChoices(); }, (id) => this.upgrades.getStack(id));
  }

  private startBoss(): void {
    this.runState = 'boss'; this.firstHitAvailable = true;
    if (this.hero.health < BALANCE.boss.entryMinimumHealth) {
      const restored = BALANCE.boss.entryMinimumHealth - this.hero.health;
      this.hero.heal(restored); this.damageNumber(this.hero.x, this.hero.y - 58, restored, 0x8de5d3, false, '+');
    }
    this.showWordTypography('기록 포식자', 480, 150, true);
    const callbacks: BossCallbacks = {
      ...this.enemyCallbacks(),
      phaseChanged: (phase) => this.bossPhaseChanged(phase),
      summon: (count) => this.summonMinions(count),
      inkZone: (x, y, radius, duration) => this.createInkZone(x, y, radius, duration),
    };
    this.boss = new Boss(this, 480, 125, callbacks); this.enemies.add(this.boss); this.boss.spawn();
    this.bossPhaseStartedAt = this.time.now; this.stopReadyAt = this.time.now; this.sentence = Math.max(this.sentence, BALANCE.boss.phaseSentenceMinimum); this.services.ui.showNotice('제1형 · Q 멎는다 준비', 1000);
    this.bossTransitionUntil = this.time.now + 1000; this.hero.invulnerableUntil = Math.max(this.hero.invulnerableUntil, this.bossTransitionUntil);
    this.boss.cancelAttackIntent(this.bossTransitionUntil); this.separateHeroFromBoss();
  }

  private bossPhaseChanged(phase: number): void {
    const previousPhase = Math.max(1, phase - 1) as 1 | 2 | 3;
    if (this.bossPhaseStartedAt > 0) this.combatStats.setBossPhaseTime(previousPhase, (this.time.now - this.bossPhaseStartedAt) / 1000);
    this.bossPhaseStartedAt = this.time.now;
    this.bossTransitionUntil = this.time.now + BALANCE.boss.phaseTransition;
    this.hero.invulnerableUntil = Math.max(this.hero.invulnerableUntil, this.bossTransitionUntil + 100);
    this.bufferedAction = undefined; this.wordChain.reset();
    for (const projectile of this.projectiles) projectile.destroy(); this.projectiles.clear();
    this.inkZones.forEach((zone) => zone.circle.destroy()); this.inkZones = [];
    for (const enemy of this.enemies) enemy.cancelAttackIntent(this.bossTransitionUntil);
    this.separateHeroFromBoss();
    this.services.audio.play('phase'); this.cameraKick(0.012, 260);
    if (!this.services.save.settings.reducedMotion) { this.cameras.main.zoomTo(1.08, 280); this.time.delayedCall(520, () => this.cameras.main.zoomTo(1, 420)); }
    this.runeBurst(480, 155, 14);
    this.showWordTypography(phase === 2 ? '제2형 · 먹물의 기억' : '제3형 · 이어진 굶주림', 480, 170, true);
    this.sentence = Math.max(this.sentence, BALANCE.boss.phaseSentenceMinimum);
    if (phase === 2) { this.rewindReadyAt = this.time.now; this.services.ui.showNotice('제2형 · E 되돌린다 준비', 1000); }
    else { this.linkReadyAt = this.time.now; this.services.ui.showNotice('제3형 · R 잇는다 준비', 1000); }
  }

  private summonMinions(count: number): void {
    const positions = this.spawnPositions(count).slice(0, count); positions.forEach((position) => this.spawnEnemy('minion', position.x, position.y));
  }

  private createInkZone(x: number, y: number, radius: number, duration: number): void {
    const circle = this.add.circle(x, y, radius, 0x241825, 0.35).setStrokeStyle(2, 0xc7664e, 0.6).setDepth(80).setScale(0.15);
    this.tweens.add({ targets: circle, scale: 1, duration: 520 });
    this.inkZones.push({ circle, expiresAt: this.time.now + duration, nextDamageAt: this.time.now + 650, radius });
  }

  private updateInkZones(time: number): void {
    this.inkZones = this.inkZones.filter((zone) => {
      if (time >= zone.expiresAt) { zone.circle.destroy(); return false; }
      zone.circle.setAlpha(0.28 + Math.sin(time / 170) * 0.08);
      if (time >= zone.nextDamageAt && distanceSq(zone.circle.x, zone.circle.y, this.hero.x, this.hero.y) < zone.radius ** 2) { this.hitHero(10, zone.circle.x, zone.circle.y, 'ink'); zone.nextDamageAt = time + 900; }
      return true;
    });
  }

  private checkProjectileCollision(projectile: Projectile): void {
    if (!projectile.active) return;
    if (projectile.enemyOwned) {
      const distance = Phaser.Math.Distance.Between(projectile.x, projectile.y, this.hero.hurtCircle.x, this.hero.hurtCircle.y);
      if (circlesOverlap(projectile.collisionCircle, this.hero.hurtCircle)) {
        if (this.hero.isParrying && this.isInsideParryArc(projectile.x, projectile.y)) this.parrySuccess(undefined, projectile); else { this.hitHero(projectile.damage, projectile.x, projectile.y, 'projectile'); projectile.destroy(); }
      } else if (distance < 42 && !projectile.getData('nearMiss')) { projectile.setData('nearMiss', true); this.gainSentence(BALANCE.sentence.nearMissGain); }
    } else {
      for (const enemy of [...this.enemies]) if (circlesOverlap(projectile.collisionCircle, enemy.hurtCircle)) {
        const reflectedStopBonus = enemy === this.boss && this.boss.phase === 1 && projectile.reflected ? BALANCE.boss.reflectedPhaseOneMultiplier : 1;
        this.damageEnemy(enemy, projectile.damage * reflectedStopBonus, projectile.rotation);
        if (enemy === this.boss && this.boss.phase === 1 && projectile.reflected) this.makeBossVulnerable('반사 핵 노출');
        if (projectile.getData('chainBackflow')) {
          const dealt = projectile.damage * reflectedStopBonus; this.combatStats.addChainDamage('backflow', dealt); this.combatText(enemy.x, enemy.y - 58, '역류', 0x78d8ef);
          if (this.upgrades.getStack('backflow-shards') > 0 && !projectile.getData('backflowShard')) this.spawnBackflowShards(projectile, enemy);
        }
        if (projectile.reflected && this.upgrades.getStack('fragment-recovery') > 0) this.hero.heal(this.upgrades.getStack('fragment-recovery') * this.effect('fragment-recovery', 'heal'));
        projectile.destroy(); break;
      }
    }
  }

  private checkMeleeCollisions(time: number): void {
    for (const enemy of this.enemies) {
      if (enemy.attackActiveUntil <= time || !enemy.spawned) continue;
      const radius = (enemy.kind === 'boss' ? 55 : enemy.kind === 'elite' ? 48 : 38) - BALANCE.collision.heroHurtRadius;
      if (!circlesOverlap({ x: enemy.x, y: enemy.y - 8, radius }, this.hero.hurtCircle)) continue;
      enemy.attackActiveUntil = 0;
      if (this.hero.isParrying && this.isInsideParryArc(enemy.x, enemy.y)) this.parrySuccess(enemy); else this.hitHero(Number(enemy.getData('meleeDamage') ?? BALANCE.enemies[enemy.kind === 'minion' ? 'chaser' : enemy.kind].damage), enemy.x, enemy.y, enemy.kind === 'boss' ? 'boss' : 'melee');
    }
  }

  private meleeHitboxRadius(enemy: Enemy): number { return (enemy.kind === 'boss' ? 55 : enemy.kind === 'elite' ? 48 : 38) - BALANCE.collision.heroHurtRadius; }

  private hitHero(baseDamage: number, sourceX: number, sourceY: number, source: DamageSource = 'other'): void {
    if (this.qaMode || this.debugInvulnerable || this.time.now < this.bossTransitionUntil) return;
    let damage = baseDamage;
    if (this.tutorialEnabled && this.tutorialIndex < TUTORIAL.length) damage *= 0.45;
    const cloak = this.upgrades.getStack('ink-cloak'); if (this.firstHitAvailable && cloak > 0) { damage *= Math.max(this.effect('ink-cloak', 'minimumMultiplier'), 1 - cloak * this.effect('ink-cloak', 'reduction')); this.firstHitAvailable = false; }
    const dealt = this.hero.takeDamage(damage, sourceX, sourceY); if (dealt <= 0) return;
    this.damageTaken += dealt; this.combatStats.damageTaken(source, dealt); this.services.audio.play('hurt'); this.cameraKick(0.006, 110); this.showDamageVignette(dealt);
    if (this.hero.health > 0 && this.hero.health <= this.hero.maxHealth * 0.22) this.services.audio.play('critical');
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
    for (const enemy of active) if (!this.linkMarkers.has(enemy)) {
      const marker = this.add.text(enemy.x, enemy.y - (enemy.kind === 'boss' ? 78 : 48), '連', { fontFamily: 'Malgun Gothic, serif', fontSize: enemy.kind === 'boss' ? '19px' : '15px', color: '#a1f3df', stroke: '#09201d', strokeThickness: 4 }).setOrigin(0.5).setDepth(750);
      this.linkMarkers.set(enemy, marker);
    }
    for (const [enemy, marker] of this.linkMarkers) {
      if (!active.includes(enemy)) { marker.destroy(); this.linkMarkers.delete(enemy); continue; }
      marker.setPosition(enemy.x, enemy.y - (enemy.kind === 'boss' ? 78 : 48)).setAlpha(0.72 + Math.sin(time / 120 + enemy.x) * 0.22).setScale(1 + Math.sin(time / 150 + enemy.y) * 0.08);
    }
    this.linkedTargets = new Set(active); if (active.length < 2) return;
    for (let index = 0; index < active.length; index += 1) {
      const a = active[index]; const b = active[(index + 1) % active.length];
      if (!a || !b) continue;
      const ax = a.x; const ay = a.y + 5; const bx = b.x; const by = b.y + 5;
      const length = Math.max(1, Phaser.Math.Distance.Between(ax, ay, bx, by));
      const normalX = -(by - ay) / length; const normalY = (bx - ax) / length;
      const drawWave = (offset: number, width: number, color: number, alpha: number): void => {
        this.linkGraphics?.lineStyle(width, color, alpha).beginPath();
        for (let step = 0; step <= 12; step += 1) {
          const ratio = step / 12;
          const wave = offset + Math.sin(ratio * Math.PI * 4 + time / 135 + index) * 2.2;
          const pointX = Phaser.Math.Linear(ax, bx, ratio) + normalX * wave;
          const pointY = Phaser.Math.Linear(ay, by, ratio) + normalY * wave;
          if (step === 0) this.linkGraphics?.moveTo(pointX, pointY); else this.linkGraphics?.lineTo(pointX, pointY);
        }
        this.linkGraphics?.strokePath();
      };
      drawWave(0, 5, 0x102f2d, 0.92);
      drawWave(3.4, 1.5, 0x89ead7, 0.92);
      drawWave(-3.4, 1, 0x4dbfac, 0.82);
      const travel = (time / 720 + index * 0.31) % 1;
      const gx = Phaser.Math.Linear(ax, bx, travel); const gy = Phaser.Math.Linear(ay, by, travel);
      this.linkGraphics?.fillStyle(0xc0ffef, 0.95).fillCircle(gx, gy, 4);
      const echoTravel = (travel + 0.5) % 1;
      const echoX = Phaser.Math.Linear(ax, bx, echoTravel); const echoY = Phaser.Math.Linear(ay, by, echoTravel);
      this.linkGraphics?.fillStyle(0x5fd0bc, 0.8).fillTriangle(echoX, echoY - 4, echoX + 4, echoY, echoX, echoY + 4).fillTriangle(echoX, echoY - 4, echoX - 4, echoY, echoX, echoY + 4);
    }
  }

  private updateRewindPreview(time: number): void {
    this.rewindGraphics?.clear();
    if (this.runState === 'upgrade' || this.hero.rewinding) return;
    const records = this.rewind.getRange(time, BALANCE.words.rewindDuration);
    if (records.length < 2) return;
    this.rewindGraphics?.lineStyle(2, 0x3aa8c8, 0.14).beginPath();
    records.forEach((state, index) => {
      if (index === 0) this.rewindGraphics?.moveTo(state.x, state.y - 5);
      else if (index % 3 === 0 || index === records.length - 1) this.rewindGraphics?.lineTo(state.x, state.y - 5);
    });
    this.rewindGraphics?.strokePath();
    const target = records[0];
    if (target) {
      const alpha = this.time.now >= this.rewindReadyAt ? 0.44 + Math.sin(time / 180) * 0.1 : 0.18;
      this.rewindGraphics?.lineStyle(2, 0x77d8eb, alpha).strokeCircle(target.x, target.y - 5, 8);
      this.rewindGraphics?.fillStyle(0x77d8eb, alpha * 0.65).fillCircle(target.x, target.y - 5, 2.5);
    }
  }

  private clearLinks(): void {
    this.linkGeneration += 1;
    for (const enemy of this.linkedTargets) enemy.linked = false;
    this.linkedTargets.clear();
    for (const marker of this.linkMarkers.values()) marker.destroy();
    this.linkMarkers.clear();
    this.linkGraphics?.clear();
  }

  private linkPulse(from: Enemy, to: Enemy, color = 0xb5ffef): void {
    if (!from.active || !to.active) return;
    const pulse = this.add.circle(from.x, from.y - 10, 5, color, 0.9).setDepth(755);
    this.tweens.add({ targets: pulse, x: to.x, y: to.y - 10, alpha: 0.1, duration: this.services.save.settings.reducedMotion ? 90 : 180, onComplete: () => pulse.destroy() });
  }

  private gainSentence(amount: number): void {
    const wasFull = this.sentence >= this.sentenceMax;
    this.sentence = Math.min(this.sentenceMax, this.sentence + amount * (1 + this.upgrades.getStack('sealed-sentence') * this.effect('sealed-sentence', 'gainBonus')));
    if (!wasFull && this.sentence >= this.sentenceMax) { this.services.audio.play('sentenceFull'); this.services.ui.showNotice('F 강화 용언 준비', 900); this.sentencePulseUntil = this.time.now + 1200; }
  }

  private nearestEnemy(x: number, y: number): Enemy | undefined {
    return [...this.enemies].filter((enemy) => enemy.active && enemy.spawned).sort((a, b) => distanceSq(x, y, a.x, a.y) - distanceSq(x, y, b.x, b.y))[0];
  }

  private spawnBackflowShards(source: Projectile, struck: Enemy): void {
    const count = this.effect('backflow-shards', 'count'); const ratio = this.effect('backflow-shards', 'ratio');
    const targets = [...this.enemies].filter((enemy) => enemy.active && enemy !== struck).sort((a, b) => distanceSq(source.x, source.y, a.x, a.y) - distanceSq(source.x, source.y, b.x, b.y));
    for (let index = 0; index < count; index += 1) {
      const target = targets[index % Math.max(1, targets.length)]; if (!target) break;
      const shard = new Projectile(this, source.x, source.y, 0, 0, source.damage * ratio, 'projectile-rune');
      shard.reflect(target.x, target.y, source.damage * ratio, true); shard.setData('backflowShard', true); this.projectiles.add(shard);
    }
  }

  private makeBossVulnerable(label: string): void {
    const boss = this.boss; if (!boss?.active) return;
    boss.vulnerableUntil = Math.max(boss.vulnerableUntil, this.time.now + BALANCE.boss.vulnerabilityDuration);
    this.services.audio.play('bossVulnerable'); this.combatText(boss.x, boss.y - 72, label, 0x9cf0dc);
  }

  private combatText(x: number, y: number, label: string, color: number): void {
    const item = this.add.text(x, y, label, { fontFamily: 'Malgun Gothic, sans-serif', fontSize: '12px', fontStyle: 'bold', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#071012', strokeThickness: 4 }).setOrigin(.5).setDepth(805);
    this.tweens.add({ targets: item, y: y - 18, alpha: 0, duration: 520, onComplete: () => item.destroy() });
  }

  private damageNumber(x: number, y: number, amount: number, color: number, shared = false, prefix = ''): void {
    const text = this.add.text(x, y, `${prefix}${Math.round(amount)}`, { fontFamily: 'Malgun Gothic, sans-serif', fontSize: amount >= 40 ? '18px' : shared ? '12px' : '14px', fontStyle: shared ? 'italic' : 'normal', color: `#${color.toString(16).padStart(6, '0')}`, stroke: shared ? '#123631' : '#071012', strokeThickness: 4 }).setOrigin(0.5).setDepth(805);
    this.tweens.add({ targets: text, y: y - 28, alpha: 0, duration: this.services.save.settings.reducedMotion ? 280 : 520, onComplete: () => text.destroy() });
  }

  private showDamageVignette(damage: number): void {
    const reduced = this.services.save.settings.reducedMotion;
    const alpha = Math.min(reduced ? 0.1 : 0.2, 0.06 + damage / 180);
    const graphics = this.add.graphics().setDepth(850);
    graphics.lineStyle(28, 0x7a201c, alpha).strokeRect(8, 8, 944, 524);
    this.tweens.add({ targets: graphics, alpha: 0, duration: reduced ? 80 : 145, onComplete: () => graphics.destroy() });
  }

  private runeBurst(x: number, y: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count + Math.random() * 0.3;
      const pixel = this.add.image(x, y, 'rune-pixel').setTint(index % 2 ? 0xa6f5e6 : 0x4ebaa9).setDepth(760);
      this.tweens.add({ targets: pixel, x: x + Math.cos(angle) * Phaser.Math.Between(24, 64), y: y + Math.sin(angle) * Phaser.Math.Between(20, 58), alpha: 0, duration: 360, onComplete: () => pixel.destroy() });
    }
  }

  private showWordTypography(word: string, x: number, y: number, boss = false): void {
    const text = this.add.text(x, y, word, { fontFamily: 'Malgun Gothic, serif', fontSize: boss ? '34px' : '25px', color: boss ? '#e6c79d' : '#a9f5e6', stroke: '#071012', strokeThickness: 7 }).setOrigin(0.5).setDepth(820).setAlpha(0).setScale(0.75);
    this.tweens.add({ targets: text, alpha: 1, scale: 1, y: y - 14, duration: 190, hold: boss ? 720 : 350, yoyo: true, onComplete: () => text.destroy() });
  }

  private cameraKick(intensity: number, duration: number): void {
    const strength = this.services.save.settings.shake; if (strength <= 0 || this.services.save.settings.reducedMotion) return;
    this.cameras.main.shake(duration, intensity * strength);
  }

  private resolveEntitySeparation(): void {
    const active = [...this.enemies].filter((enemy) => enemy.active && enemy.spawned);
    for (const enemy of active) {
      const offset = separationOffset(this.hero.movementCircle, enemy.movementCircle, BALANCE.collision.heroSeparationStrength);
      if (offset.x !== 0 || offset.y !== 0) { this.hero.x += offset.x; this.hero.y += offset.y; this.hero.constrainToArena(); }
    }
    for (let first = 0; first < active.length; first += 1) for (let second = first + 1; second < active.length; second += 1) {
      const a = active[first]; const b = active[second]; if (!a || !b) continue;
      const offset = separationOffset(a.movementCircle, b.movementCircle, BALANCE.collision.enemySeparationStrength);
      a.x += offset.x * .5; a.y += offset.y * .5; b.x -= offset.x * .5; b.y -= offset.y * .5;
    }
  }

  private toggleHitboxDebug(): void { this.debugHitboxes = !this.debugHitboxes; this.debugGraphics?.setVisible(this.debugHitboxes); if (!this.debugHitboxes) this.debugGraphics?.clear(); }

  private toggleStatsDebug(): void {
    this.debugStatsVisible = !this.debugStatsVisible;
    if (!this.debugStatsVisible) { this.debugStatsText?.destroy(); this.debugStatsText = undefined; return; }
    this.debugStatsText ??= this.add.text(712, 92, '', { fontFamily: 'Consolas, monospace', fontSize: '10px', color: '#d7eee8', backgroundColor: '#051012dd', padding: { x: 8, y: 7 }, lineSpacing: 2 }).setDepth(910);
  }

  private drawCombatDebug(time: number): void {
    const graphics = this.debugGraphics;
    if (graphics && this.debugHitboxes) {
      graphics.clear();
      const circle = (item: Readonly<{ x: number; y: number; radius: number }>, color: number): void => { graphics.lineStyle(1.5, color, .9).strokeCircle(item.x, item.y, item.radius); };
      circle(this.hero.movementCircle, 0x68e59a); circle(this.hero.hurtCircle, 0x55ccea);
      if (this.hero.isParrying) graphics.lineStyle(2, 0x8ffff0, .9).beginPath().arc(this.hero.x, this.hero.y, BALANCE.hero.parryAssistRadius, this.hero.facing - BALANCE.hero.parryArc, this.hero.facing + BALANCE.hero.parryArc).strokePath();
      for (const enemy of this.enemies) {
        circle(enemy.movementCircle, 0xe7c769); circle(enemy.hurtCircle, 0xff8a67);
        if (enemy.attackActiveUntil > time) circle({ x: enemy.x, y: enemy.y - 8, radius: this.meleeHitboxRadius(enemy) }, 0xff3030);
        const telegraph = enemy.activeTelegraph;
        if (telegraph && telegraph.until > time) graphics.lineStyle(Math.max(2, telegraph.halfWidth * 2), 0xff6a43, .18).lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(telegraph.angle) * telegraph.length, enemy.y + Math.sin(telegraph.angle) * telegraph.length);
      }
      for (const projectile of this.projectiles) if (projectile.active) circle(projectile.collisionCircle, projectile.enemyOwned ? 0xff6257 : 0x68e7d2);
      if (this.activeDaggerDebug && this.activeDaggerDebug.until > time) graphics.lineStyle(3, 0xfff08a, .9).beginPath().arc(this.activeDaggerDebug.x, this.activeDaggerDebug.y, this.activeDaggerDebug.range, this.activeDaggerDebug.angle - BALANCE.collision.daggerHalfAngle, this.activeDaggerDebug.angle + BALANCE.collision.daggerHalfAngle).strokePath();
      if (this.currentTarget?.active) circle(this.currentTarget.hurtCircle, 0x7fffd9);
      if (time < this.hero.invulnerableUntil) graphics.fillStyle(0x66cfff, .18).fillCircle(this.hero.hurtCircle.x, this.hero.hurtCircle.y, this.hero.hurtCircle.radius);
    }
    if (this.debugStatsText && this.debugStatsVisible) {
      const stats = this.combatStats.snapshot();
      this.debugStatsText.setText([
        'F3 COMBAT STATS', `공격 ${stats.attackHits}/${stats.attackAttempts} · 3타 ${stats.comboFinishes}`,
        `패링 ${stats.parrySuccesses}/${stats.parryAttempts} · 완벽 ${stats.perfectParries}`, `대시 ${stats.dashes} · F ${stats.empowerUses}`,
        `Q/E/R ${stats.wordUses.stop}/${stats.wordUses.rewind}/${stats.wordUses.link}`, `연쇄 ${Object.values(stats.chainCounts).reduce((sum, value) => sum + value, 0)}`,
        `타깃 자동 ${stats.autoTargetChanges} · 수동 ${stats.manualTargetChanges}`,
      ]).setVisible(true);
    }
  }

  private preventBossOverlap(): void {
    const boss = this.boss; if (!boss?.active || !boss.spawned) return;
    const dx = this.hero.x - boss.x; const dy = this.hero.y - boss.y; const distance = Math.hypot(dx, dy);
    if (distance >= BALANCE.boss.separationRadius) return;
    const angle = distance > 0.01 ? Math.atan2(dy, dx) : Math.PI / 2;
    const correction = (BALANCE.boss.separationRadius - distance) * 0.58;
    this.hero.x += Math.cos(angle) * correction; this.hero.y += Math.sin(angle) * correction; this.hero.constrainToArena();
  }

  private separateHeroFromBoss(): void {
    const boss = this.boss; if (!boss?.active) return;
    const angle = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, boss.x, boss.y) > 1 ? Phaser.Math.Angle.Between(boss.x, boss.y, this.hero.x, this.hero.y) : Math.PI / 2;
    this.hero.setPosition(boss.x + Math.cos(angle) * (BALANCE.boss.separationRadius + 18), boss.y + Math.sin(angle) * (BALANCE.boss.separationRadius + 18)); this.hero.constrainToArena();
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
    const chain = this.wordChain.snapshot(time);
    const rewindRecords = this.rewind.getRange(time, BALANCE.words.rewindDuration);
    const rewindTarget = rewindRecords[0];
    const activeLinked = [...this.linkedTargets].filter((enemy) => enemy.active && enemy.linked);
    const frozenProjectiles = [...this.projectiles].filter((projectile) => projectile.active && projectile.enemyOwned && !projectile.reflected && projectile.frozenUntil > time);
    const hasRecordedDamage = this.damageHistory.hasRecentDamage(activeLinked.map((enemy) => enemy.id), time, BALANCE.chain.damageHistoryDuration);
    const stopDiscount = this.wordChain.preview('stop', time, { hasLinkedTargets: activeLinked.length > 0 }) ? BALANCE.chain.secondWordCostDiscount : 0;
    const rewindDiscount = this.wordChain.preview('rewind', time, { hasFrozenProjectiles: frozenProjectiles.length > 0, hasLinkedTargets: activeLinked.length > 0, hasRecordedDamage }) ? BALANCE.chain.secondWordCostDiscount : 0;
    const stopCost = this.wordCost(BALANCE.sentence.stopCost, stopDiscount); const rewindCost = this.wordCost(BALANCE.sentence.rewindCost, rewindDiscount); const linkCost = this.wordCost(BALANCE.sentence.linkCost);
    this.services.ui.updateHud({
      health: this.hero.health, maxHealth: this.hero.maxHealth, sentence: this.sentence, sentenceMax: this.sentenceMax,
      score: this.score, stage: this.runState === 'boss' ? '최종전투 · 기록 포식자' : WAVE_LABELS[this.waveIndex] ?? '잔향의 방',
      stopCooldown: Math.max(0, (this.stopReadyAt - time) / 1000), rewindCooldown: Math.max(0, (this.rewindReadyAt - time) / 1000), linkCooldown: Math.max(0, (this.linkReadyAt - time) / 1000), empowered: this.empowered,
      stopCost, rewindCost, linkCost,
      canStop: time >= this.stopReadyAt && (this.empowered || this.sentence >= stopCost),
      canRewind: rewindRecords.length > 0 && time >= this.rewindReadyAt && (this.empowered || this.sentence >= rewindCost),
      canLink: time >= this.linkReadyAt && (this.empowered || this.sentence >= linkCost) && (this.services.save.settings.controlMode === 'mouse' || Boolean(this.currentTarget)),
      rewindPreviewHealth: rewindTarget?.health,
      sentencePulse: time < this.sentencePulseUntil,
      controlMode: this.services.save.settings.controlMode,
      chainOpener: chain?.opener, chainRemaining: chain ? Math.max(0, (chain.expiresAt - time) / 1000) : undefined,
      chainNext: chain?.nextWords,
      bossHealth: boss?.health, bossMaxHealth: boss?.maxHealth, bossPhase: boss?.phase,
      bossGuide: boss ? ['','멎는다 · 탄환을 멈춰 되받아쳐라','되돌린다 · 지연 공격을 역행하라','잇는다 · 소환체와 포식자를 이어라'][boss.phase] : undefined,
    });
  }

  private togglePause(): void {
    if (this.runState === 'result' || this.runState === 'upgrade') return;
    if (this.paused) { this.paused = false; this.bufferedAction = undefined; this.hero.clearBufferedInput(); this.services.ui.hidePause(); this.scene.resume(); return; }
    this.paused = true; this.bufferedAction = undefined; this.hero.clearBufferedInput(); this.scene.pause();
    this.services.ui.showPause(() => { this.paused = false; this.bufferedAction = undefined; this.hero.clearBufferedInput(); this.scene.resume(); }, () => { this.cleanup(); this.scene.stop(); this.scene.start('MenuScene'); });
  }

  private finishRun(victory: boolean): void {
    if (this.runState === 'result') return; this.runState = 'result'; this.physics.pause(); this.hero.controlsLocked = true;
    const elapsed = Math.max(1, (this.time.now - this.startTime) / 1000); if (victory) this.score += Math.max(0, 1200 - Math.floor(elapsed));
    const progressStage = victory ? 7 : this.boss?.active ? 3 + this.boss.phase : Math.min(3, this.waveIndex + 1);
    const rank = rankFor(this.score, this.damageTaken, elapsed, progressStage, victory);
    const previousBest = this.services.save.bestScore; const previousStage = this.services.save.bestStage;
    const newBest = this.score > previousBest; const milestones: string[] = [];
    if (newBest) { this.services.save.bestScore = this.score; this.services.save.bestRank = rank; milestones.push('최고 점수 갱신'); }
    if (progressStage > previousStage) { this.services.save.bestStage = progressStage; milestones.push('최고 진행 단계 갱신'); }
    if (progressStage >= 4 && !this.services.save.bossReached) { this.services.save.bossReached = true; milestones.push('첫 보스 도달'); }
    if (victory && !this.services.save.cleared) { this.services.save.cleared = true; milestones.push('첫 클리어'); }
    this.services.persist();
    this.services.audio.play(victory ? 'victory' : 'defeat');
    const progressLabel = ['기록 없음', '제1전투', '제2전투', '제3전투', '보스 제1형', '보스 제2형', '보스 제3형', '클리어'][progressStage] ?? '잔향의 방';
    this.combatStats.setUpgrades(this.upgrades.entries());
    const details = this.combatStats.snapshot();
    const chainSuccesses = Object.values(details.chainCounts).reduce((sum, value) => sum + value, 0);
    const stats: ResultStats = { victory, score: this.score, time: elapsed, damageTaken: this.damageTaken, parries: this.parries, wordUses: { ...this.wordUses }, upgrades: this.upgrades.summary(), rank, progressStage, progressLabel, previousBest, scoreDelta: this.score - previousBest, newBest, milestones, empowerUses: details.empowerUses, chainSuccesses, details };
    this.time.delayedCall(500, () => this.services.ui.showResult(stats, () => this.scene.restart(), () => { this.scene.stop(); this.scene.start('MenuScene'); }));
  }

  private createAtmosphere(): void {
    this.add.particles(0, 0, 'rune-pixel', { x: { min: 45, max: 915 }, y: { min: 70, max: 500 }, speed: { min: 1, max: 6 }, angle: { min: 210, max: 330 }, lifespan: 4800, alpha: { start: 0.12, end: 0 }, quantity: 1, frequency: 420 }).setDepth(5);
  }

  private showDebugScenarioMenu(): void {
    if (!import.meta.env.DEV || this.runState === 'result' || this.runState === 'upgrade') return;
    this.paused = true; this.physics.pause(); this.bufferedAction = undefined; this.hero.clearBufferedInput();
    const items = ['자동 조준 다수 대상', '근접 적 Hitbox', '탄환 패링', '멎는다 → 되돌린다', '잇는다 → 멎는다', '잇는다 → 되돌린다', '보스 제1형', '보스 제2형', '보스 제3형', '원하는 강화 지급', '문장력 100 충전', `플레이어 무적 ${this.debugInvulnerable ? '해제' : '설정'}`, '모든 적 제거'];
    const resume = (): void => { this.paused = false; this.physics.resume(); this.hero.clearBufferedInput(); };
    this.services.ui.showDebugScenarios(items, (index) => { this.runDebugScenario(index); if (index !== 9) resume(); }, resume);
  }

  private runDebugScenario(index: number): void {
    if (!import.meta.env.DEV) return;
    if (index === 0) { this.debugClearEnemies(); ['chaser', 'archer', 'ink', 'elite'].forEach((kind, item) => this.spawnEnemy(kind as EnemyKind, 320 + item * 105, 225 + (item % 2) * 105)); }
    else if (index === 1) { this.debugClearEnemies(); this.spawnEnemy('chaser', this.hero.x + 120, this.hero.y); }
    else if (index === 2) { this.debugClearEnemies(); this.spawnEnemy('archer', this.hero.x + 230, this.hero.y); this.qaReadyWords(); }
    else if (index === 3) { this.debugClearEnemies(); const source = this.spawnEnemy('archer', this.hero.x + 230, this.hero.y); this.spawnProjectile(source, source.x, source.y, Math.PI, 90, 10); this.qaReadyWords(); }
    else if (index === 4 || index === 5) {
      this.debugClearEnemies(); const spawned = [this.spawnEnemy('chaser', 560, 235), this.spawnEnemy('archer', 640, 310), this.spawnEnemy('ink', 535, 390)]; this.qaReadyWords();
      if (index === 5) spawned.forEach((enemy) => this.damageHistory.record(this.time.now, enemy.id, 40, 'attack'));
    } else if (index >= 6 && index <= 8) this.debugBossPhase((index - 5) as 1 | 2 | 3);
    else if (index === 9) this.showDebugUpgradeMenu();
    else if (index === 10) { this.sentence = this.sentenceMax; this.sentencePulseUntil = this.time.now + 1200; }
    else if (index === 11) { this.debugInvulnerable = !this.debugInvulnerable; this.services.ui.showNotice(`개발 무적 ${this.debugInvulnerable ? 'ON' : 'OFF'}`, 800); }
    else if (index === 12) this.debugClearEnemies();
  }

  private showDebugUpgradeMenu(): void {
    const available = UPGRADES.filter((upgrade) => this.upgrades.canAdd(upgrade.id));
    this.paused = true; this.physics.pause();
    this.services.ui.showDebugScenarios(available.map((upgrade) => `${upgrade.name} ${this.upgrades.getStack(upgrade.id)}/${upgrade.maxStacks}`), (index) => {
      const selected = available[index]; if (selected) this.upgrades.add(selected.id); this.paused = false; this.physics.resume();
    }, () => { this.paused = false; this.physics.resume(); });
  }

  private debugClearEnemies(): void {
    for (const projectile of this.projectiles) projectile.destroy(); this.projectiles.clear();
    for (const enemy of this.enemies) enemy.destroy(); this.enemies.clear(); this.boss = undefined; this.clearLinks();
  }

  private debugBossPhase(phase: 1 | 2 | 3): void {
    this.debugClearEnemies(); this.startBoss();
    if (phase > 1) this.time.delayedCall(650, () => this.boss?.debugSetPhase(phase)); this.qaReadyWords();
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

  private qaReadyWords(): void {
    this.sentence = this.sentenceMax; this.stopReadyAt = 0; this.rewindReadyAt = 0; this.linkReadyAt = 0; this.empowered = false; this.wordChain.reset();
  }

  private cleanup(): void {
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerHandler);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler);
    window.removeEventListener('keydown', this.escapeHandler);
    this.timeouts.forEach((handle) => window.clearTimeout(handle)); this.timeouts = [];
    const world = this.physics?.world;
    if (world) world.timeScale = 1;
    if (this.tweens) this.tweens.timeScale = 1;
    this.game.canvas.style.cursor = ''; this.wordChain.reset(); this.damageHistory.reset(); this.targeting.clear(); this.attackRegistry.reset();
    this.clearLinks(); this.linkGraphics?.destroy(); this.rewindGraphics?.destroy(); this.heroRune?.destroy(); this.targetMarker?.destroy(); this.debugGraphics?.destroy(); this.debugStatsText?.destroy(); this.inkZones.forEach((zone) => zone.circle.destroy());
  }
}
