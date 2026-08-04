import Phaser from 'phaser';
import { BALANCE, COMBAT_BOUNDS, enemyGroundExtents, type EnemyKind } from '../balance';
import { DEPTH } from '../config';
import { Boss, type BossCallbacks } from '../entities/Boss';
import { Enemy, type EnemyCallbacks } from '../entities/Enemy';
import { Hero, type HeroAttack } from '../entities/Hero';
import { Projectile } from '../entities/Projectile';
import { resonanceById, upgradeById, upgradeDescription, type ResonanceId, type UpgradeId } from '../data/upgrades';
import { getServices, type AppServices } from '../services';
import { parrySentenceReward } from '../systems/CombatRules';
import { modifierDefinition, modifierDescription, modifierLabel, modifierLabelsForAct, ModifierIntroductionTracker } from '../systems/ActModifiers';
import { attackDisplayName, enemyDisplayName } from '../systems/CombatPresentation';
import { clampGroundPointToBounds, clampPointToBounds, groundFootprintInsideBounds } from '../systems/CombatBounds';
import { AttackHitRegistry, distanceToEllipse, sectorHitsEllipse, separateAttackerFromAnchoredHero, separationOffset, sweptCircleHitsEllipse } from '../systems/CombatGeometry';
import { attackTargetMultiplier } from '../systems/BasicAttackBalance';
import { FinisherChargeSystem, finisherProfile, finisherStatusFor, selectDefensiveSlashTarget, type FinisherChargeSource } from '../systems/CombatCoreSystem';
import { RisingEdgeInput } from '../systems/CombatInputGate';
import { RunOutcomeController, type EnemyDeathSource } from '../systems/CombatLifecycle';
import { CombatStats, empoweredWordEffectIsValid, type DamageSource, type EmpowerFailureReason } from '../systems/CombatStats';
import { DamageQueue, simulateDamageFreezeRegression, type DamageEventFlag } from '../systems/DamageQueue';
import { DamageHistory, type RecordedDamageKind } from '../systems/DamageHistory';
import { GameFlowController, type BaseGameFlowState } from '../systems/GameFlowController';
import { InputRouter, type InputContext } from '../systems/InputRouter';
import { distributeLinkedDamage } from '../systems/LinkDamage';
import { ParryResolver } from '../systems/ParrySystem';
import { RewindBuffer } from '../systems/RewindBuffer';
import { RunProgressController } from '../systems/RunProgressController';
import { activeModifiersForWave, RunActDirector, type ActPatternId, type EndlessModifierId } from '../systems/RunActDirector';
import { RunSessionController, type RunId } from '../systems/RunSessionController';
import { runStabilityStressSimulation } from '../systems/StabilityStressSimulation';
import { TimeControlService } from '../systems/TimeControlService';
import { mixedModifierProfile, ThreatBudget, type ThreatTier } from '../systems/ThreatBudget';
import { SoftTargetLock, TargetingSystem, type TargetCandidate, type TargetSelection } from '../systems/TargetingSystem';
import { sealedSentenceStats, UpgradeSystem } from '../systems/UpgradeSystem';
import { counterInscriptionProfile, deepMarkProfile, echoHarvestGain, gravityInscriptionProfile, headwindVeilProfile, linkContagionProfile, overchargedWordProfile, perfectCounterProfile, recoilRippleProfile, ResonanceRuntime, rewindBreathHealing, ruptureStepProfile, stopResonanceProfile } from '../systems/UpgradeRuntime';
import { WordChainSystem, type WordChainId, type WordId } from '../systems/WordChainSystem';
import { DEFAULT_WORD_LOADOUT, reactionDefinition, WordLoadoutState, WordStatusRuntime, wordDefinition, wordDisplayName, type WordSlot } from '../systems/WordSystem';
import { WaveDirector, type WaveEnemySnapshot } from '../systems/WaveDirector';
import { adjustLinkedIncomingDamage, linkShareRatio } from '../systems/WordCombatRules';
import { backflowBladeDamage, cutDamageMultiplier, cutHitsTarget, cutSentenceBonus, echoBladeProfile, echoBladeTargets, isolationChainProfile, quantizeEightDirection, returningScarProfile, selectEchoReplayTarget, WeaponCooldowns } from '../systems/WeaponCombatSystem';
import { angleDelta, distanceSq, rankFor } from '../utils/math';
import { createArchiveArena, createInkArchiveArena } from '../utils/arena';
import type { ResultStats } from '../../ui/OverlayUI';

interface InkZone { circle: Phaser.GameObjects.Arc; expiresAt: number; nextDamageAt: number; radius: number; damage: number; style: 'ink' | 'erasure'; patternName: string; modifier?: string }
interface RecordedAttack { time: number; x: number; y: number; angle: number; kind: 'guard' | 'finisher' | 'legacy' | 'echo-blade' | 'cut'; damage: number }
interface DamageDispatchContext {
  handler?: string;
  sourceEntityId?: string;
  baseSource?: 'echoBlade' | 'cut' | 'parry' | 'word' | 'other';
  skillId?: string;
  cardId?: string;
  resonanceId?: ResonanceId;
  modifierSourceIds?: readonly string[];
  damageKind?: string;
  flags?: readonly DamageEventFlag[];
  onApplied?: (amount: number) => void;
}
interface HeroDamageContext {
  attackerId: string;
  attackerDisplayName?: string;
  attackId: string;
  patternName: string;
  modifier?: string;
  parryable: boolean;
}
interface WordCastContext {
  enhanced: boolean;
  empoweredByF: boolean;
  overchargeMultiplier: number;
  overchargeDurationBonus: number;
}
type CombatAction = 'attack' | 'parry' | 'dash' | WordId;
type DebugWindow = Window & { __EONMAEK_DEBUG__?: () => unknown };

const modifierIdsForPause = (patterns: ReadonlySet<ActPatternId>, endless: readonly EndlessModifierId[]): string[] =>
  [...new Set<ActPatternId | EndlessModifierId>([
    ...[...patterns].filter((id) => id !== 'archive-baseline'),
    ...endless,
  ])].map((id) => `${modifierLabel(id)} — ${modifierDescription(id)}`);

const TUTORIAL = [
  { action: 'move', text: '<kbd>WASD</kbd> 또는 <kbd>방향키</kbd>로 움직여 공격선을 벗어나라' },
  { action: 'attack', text: '<kbd>J</kbd>로 마지막 이동 방향을 넓게 <b>절단</b>하라' },
  { action: 'dash', text: '<kbd>Space</kbd>로 위험을 관통해 대시하라' },
  { action: 'parry', text: '<kbd>K</kbd> 또는 <kbd>Shift</kbd>로 붉은 순간을 패링하라' },
  { action: 'stop', text: '<kbd>Q</kbd> <b>멎는다</b> — 자동 대상 주변 적과 탄환을 정지시킨다' },
  { action: 'rewind', text: '<kbd>E</kbd> <b>되돌린다</b> — 너의 위치와 체력만 2초 전으로' },
  { action: 'link', text: '<kbd>R</kbd> <b>잇는다</b> — 최대 3명의 피해를 서로 잇는다' },
] as const;
const WORD_TUTORIAL_TEXT = (slot: WordSlot, word: WordId): string => `<kbd>${slot}</kbd> <b>${wordDisplayName(word)}</b> — ${wordDefinition(word).shortDescription}`;

export class GameScene extends Phaser.Scene {
  private services!: AppServices;
  private hero!: Hero;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'w' | 'a' | 's' | 'd' | 'j' | 'k' | 'shift' | 'space' | 'q' | 'e' | 'r' | 'f' | 'p' | 'l' | 'f2' | 'f3' | 'f4', Phaser.Input.Keyboard.Key>;
  private enemies = new Set<Enemy>();
  private projectiles = new Set<Projectile>();
  private inkZones: InkZone[] = [];
  private linkedTargets = new Set<Enemy>();
  private linkShareRatio: number = BALANCE.words.linkShare;
  private linkGraphics?: Phaser.GameObjects.Graphics;
  private rewindGraphics?: Phaser.GameObjects.Graphics;
  private rewindPreviewGhosts: Phaser.GameObjects.Image[] = [];
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
  private wordLoadout = new WordLoadoutState();
  private wordStatuses = new WordStatusRuntime();
  private wordReadyAt: Record<WordId, number> = { stop: 0, rewind: 0, link: 0, pull: 0, mark: 0, push: 0 };
  private damageHistory = new DamageHistory(BALANCE.chain.damageHistoryRetention);
  private damageQueue = new DamageQueue();
  private damageFrameId = 0;
  private combatStats = new CombatStats();
  private attackRegistry = new AttackHitRegistry();
  private attackInput = new RisingEdgeInput();
  private comboLock = new SoftTargetLock();
  private flow = new GameFlowController();
  private waveDirector = new WaveDirector(BALANCE.pacing.roundClearStability, BALANCE.pacing.staleEnemyRecovery);
  private threatBudget = new ThreatBudget();
  private runOutcome = new RunOutcomeController();
  private readonly runSession = new RunSessionController();
  private readonly runProgress = new RunProgressController();
  private readonly runAct = new RunActDirector();
  private modifierIntroductions = new ModifierIntroductionTracker();
  private runId: RunId = 0;
  private arenaContainer?: Phaser.GameObjects.Container;
  private atmosphere?: Phaser.GameObjects.Particles.ParticleEmitter;
  private modifierEnvironment?: Phaser.GameObjects.Graphics;
  private activeActPatterns = new Set<ActPatternId>();
  private activeEndlessModifiers: readonly EndlessModifierId[] = [];
  private actPatternGeneration = 0;
  private echoProjectileSequence = 0;
  private stitchedPairs = new Map<string, string>();
  private inputRouter = new InputRouter();
  private parryResolver = new ParryResolver();
  private finisherCharges = new FinisherChargeSystem(BALANCE.hero.finisher.maximumCharges);
  private weaponCooldowns = new WeaponCooldowns();
  private resonanceRuntime = new ResonanceRuntime();
  private timeControl!: TimeControlService;
  private readonly timeOwner = 'GameScene';
  private attacks: RecordedAttack[] = [];
  private waveIndex = 0;
  private waveSpawnGeneration = 0;
  private enemySpawnTimes = new Map<string, { kind: EnemyKind; at: number }>();
  private enemyFirstDamageAt = new Map<string, number>();
  private currentComboDamage = 0;
  private nextDefensiveSlashAt = 0;
  private defensiveSlashEnabled = false;
  private nextHeldComboAt = 0;
  private firstWaveSpawnOrdinal = 0;
  private defensiveSlashSequence = 100000;
  private echoBladeSequence = 200000;
  private lastDirectTargetId?: string;
  private echoFinisherUntil = 0;
  private echoAmplifierUntil = 0;
  private bossMechanicRewardUntil = 0;
  private encounterStartedAt = 0;
  private bossPhaseStartedAt = 0;
  private currentWaveBatches: readonly (readonly EnemyKind[])[] = [];
  private nextBatchIndex = 0;
  private activeBatchPendingSpawns = 0;
  private miniWaveReadyAt = 0;
  private legacyCombatMode = false;
  private parryAnchorUntil = 0;
  private lastWaveDiagnosticAt = 0;
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
  private deathSequenceStarted = false;
  private parries = 0;
  private wordUses: ResultStats['wordUses'] = { '멎는다': 0, '되돌린다': 0, '잇는다': 0, '당긴다': 0, '새긴다': 0, '밀어낸다': 0 };
  private tutorialIndex = 0;
  private tutorialSteps: Array<{ action: string; text: string }> = TUTORIAL.map((step) => ({ ...step }));
  private tutorialEnabled = false;
  private tutorialHideAt = 0;
  private firstHitAvailable = true;
  private lastPursuitId = '';
  private pursuitCount = 0;
  private regressionCharged = false;
  private parryCounterUntil = 0;
  private parryAimUntil = 0;
  private parryStartedAt = 0;
  private sentencePulseUntil = 0;
  private sentenceFullAt = 0;
  private sentenceReminderShown = false;
  private perfectCounterUntil = 0;
  private headwindGuardUntil = 0;
  private cutPerfectCounterActive = false;
  private lastDashAt = Number.NEGATIVE_INFINITY;
  private echoHarvestWindowStartedAt = 0;
  private echoHarvestWindowGain = 0;
  private lastUpgradeToastAt = new Map<UpgradeId, number>();
  private lastActivatedUpgrade?: UpgradeId;
  private lastActivatedUpgradeUntil = 0;
  private lastActivatedResonance?: ResonanceId;
  private lastActivatedResonanceUntil = 0;
  private readonly transientCombatObjects = new Set<Phaser.GameObjects.GameObject>();
  private bossTransitionUntil = 0;
  private bossSignatureExecutions = new Set<string>();
  private bossDeathEvents = 0;
  private actTransitionStartedAt = 0;
  private lastActTransitionDuration = 0;
  private bufferedAction?: { action: CombatAction; expiresAt: number; x: number; y: number };
  private timeouts: number[] = [];
  private qaMode = false;
  private comboTarget?: Enemy;
  private heldAttackTarget?: Enemy;
  private targetMarkerUntil = 0;
  private targetDistance = 0;
  private activeDaggerDebug?: { x: number; y: number; angle: number; range: number; until: number };
  private debugHitboxes = false;
  private debugStatsVisible = false;
  private debugGraphics?: Phaser.GameObjects.Graphics;
  private debugStatsText?: Phaser.GameObjects.Text;
  private debugScenarioText?: Phaser.GameObjects.Text;
  private debugScenarioIndex = 0;
  private debugInvulnerable = false;
  private pointerHandler!: (pointer: Phaser.Input.Pointer) => void;
  private escapeHandler!: (event: KeyboardEvent) => void;
  private attackKeyDownHandler!: (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => void;
  private attackKeyUpHandler!: () => void;
  private keyUpRouterHandler!: (event: KeyboardEvent) => void;
  private visibilityHandler!: () => void;
  private blurHandler!: () => void;
  private focusHandler!: () => void;
  private watchdogHandle?: number;
  private lastHeartbeatAt = 0;
  private lastWatchdogReportAt = 0;
  private watchdogMessage = 'normal';
  private watchdogStalled = false;
  private lastAttackAt = 0;
  private lastHitAt = 0;
  private lastDebugPublishAt = 0;
  private frameDelta = 1000 / 60;
  private combatHeartbeats = { scene: 0, physics: 0, damageQueue: 0, timeControl: 0, audio: 0, bossAi: 0 };

  public constructor() { super('GameScene'); }

  public create(): void {
    this.services = getServices();
    // startNewRun rebuilds Run-scoped systems from persisted settings (recent
    // word loadout, modifier tutorials, upgrade state).  On the first scene
    // entry the service field has not been populated yet, so initialize it
    // before touching any of those systems. Scene restarts used to hide this
    // ordering bug because the reused Scene instance retained the old field.
    this.startNewRun();
    this.modifierIntroductions = new ModifierIntroductionTracker(this.services.save.modifierTutorialsSeen);
    // Phaser reuses Scene plugins for scene.restart(). A previous RESULT or
    // reward token can therefore leave their scales paused unless we restore
    // the scene clocks before constructing the next run's controller.
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.anims.globalTimeScale = 1;
    this.physics.world.timeScale = 1;
    this.physics.world.resume();
    this.timeControl = new TimeControlService({
      setPhysicsPaused: (paused) => { if (paused) this.physics.world.pause(); else this.physics.world.resume(); },
      setGameTimeScale: (scale) => { this.time.timeScale = scale; },
      setPhysicsScale: (scale) => { this.physics.world.timeScale = scale > 0 ? 1 / scale : 1; },
      setTweenScale: (scale) => { this.tweens.timeScale = scale; },
      setAnimationScale: (scale) => { this.anims.globalTimeScale = scale; },
    });
    this.inputRouter.setContext('COMBAT');
    this.lastHeartbeatAt = performance.now();
    const developmentParams = new URLSearchParams(window.location.search);
    this.qaMode = import.meta.env.DEV && developmentParams.has('qa');
    this.legacyCombatMode = import.meta.env.DEV && developmentParams.has('legacyCombo');
    this.defensiveSlashEnabled = BALANCE.hero.defensiveSlash.enabledByDefault || (import.meta.env.DEV && developmentParams.has('defensiveSlash'));
    if (import.meta.env.DEV) {
      const upgradeId = developmentParams.get('upgrade'); const stacks = Math.max(0, Math.min(3, Number(developmentParams.get('stacks') ?? 1)));
      if (upgradeId) for (let index = 0; index < stacks; index += 1) this.upgrades.add(upgradeId as Parameters<UpgradeSystem['add']>[0]);
    }
    if (this.qaMode) {
      const requestedAct = Phaser.Math.Clamp(Math.floor(Number(developmentParams.get('act') ?? 1)), 1, 20);
      while (this.runAct.current.index < requestedAct) this.runAct.advanceAct(0, 0);
      const act = this.runAct.current;
      if (act.index > 1) this.runProgress.beginAct(this.runId, { actNumber: act.index, actId: act.id, actName: act.name, themeId: act.theme, enemySetId: act.enemySetId, bossId: act.bossId, modifiers: act.modifiers });
    }
    const initialAct = this.runAct.current;
    this.arenaContainer = initialAct.theme === 'echo-room' || initialAct.theme === 'endless-echo'
      ? createArchiveArena(this)
      : createInkArchiveArena(this, initialAct.index >= 3 ? initialAct.index : 0);
    this.createAtmosphere();
    this.heroShadow = this.add.ellipse(480, 304, 38, 12, 0x020506, 0.55).setDepth(DEPTH.shadow);
    this.hero = new Hero(this, 480, 300);
    this.linkGraphics = this.add.graphics().setDepth(DEPTH.word);
    this.rewindGraphics = this.add.graphics().setDepth(DEPTH.rewind);
    this.rewindPreviewGhosts = Array.from({ length: 3 }, () => this.add.image(this.hero.x, this.hero.y, 'hero-move')
      .setOrigin(0.5, 1).setScale(0.4).setTint(0x43add0).setAlpha(0).setVisible(false).setDepth(DEPTH.rewind));
    this.heroRune = this.add.circle(this.hero.x, this.hero.y - 7, 22, 0x5bd2bd, 0).setStrokeStyle(2, 0x8ff3df, 0).setDepth(DEPTH.word);
    this.targetMarker = this.add.graphics().setDepth(DEPTH.target).setAlpha(0);
    if (import.meta.env.DEV) this.debugGraphics = this.add.graphics().setDepth(DEPTH.debug).setVisible(false);
    this.setupInput();
    this.setupVisibilityHandling();
    this.startWatchdog();
    if (import.meta.env.DEV) (window as DebugWindow).__EONMAEK_DEBUG__ = () => ({
      state: this.flow.state,
      run: this.runSession.snapshot(),
      progress: this.runProgress.snapshot(),
      act: this.runAct.snapshot(),
      time: this.timeControl.snapshot(),
      input: this.inputRouter.snapshot(),
      hero: { x: this.hero.x, y: this.hero.y, comboActive: this.hero.isComboActive, comboStep: this.hero.comboStep, direction: this.hero.attackDirection, health: this.hero.health, finisherCharges: this.finisherCharges.charges },
      targetId: this.comboLock.targetId ?? this.heldAttackTarget?.id ?? this.currentTarget?.id,
      targetDistance: this.targetDistance,
      enemies: [...this.enemies].filter((enemy) => enemy.active).map((enemy) => ({ id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y, health: enemy.health, insideBounds: groundFootprintInsideBounds(enemy.groundPoint, enemyGroundExtents(enemy.kind), COMBAT_BOUNDS) })),
      wave: this.waveDirector.snapshot(),
      runActFlow: {
        currentBossDefinition: this.boss?.definition.bossId,
        bossPhase: this.boss?.phaseSnapshot,
        signaturePatternsExecuted: [...this.bossSignatureExecutions],
        skippedBossPhases: this.boss?.phaseSnapshot.skippedPhaseCount ?? 0,
        bossDeathEvents: this.bossDeathEvents,
        actTransitionDurationMs: this.lastActTransitionDuration,
        modifiers: modifierIdsForPause(this.activeActPatterns, this.runAct.current.modifiers),
        sentenceFullDurationMs: this.sentence >= this.sentenceMax && this.sentenceFullAt > 0 ? Math.max(0, this.time.now - this.sentenceFullAt) : 0,
      },
      outcome: this.runOutcome.snapshot(),
      damageQueue: this.damageQueue.snapshot(),
      threatBudget: this.threatBudget.snapshot(this.time.now),
      heartbeats: { ...this.combatHeartbeats },
      stats: this.combatStats.snapshot(),
      bounds: COMBAT_BOUNDS,
    });
    // Arcade Physics applies Body movement to Game Objects in its own
    // POST_UPDATE listener. Manual separation must run afterwards; doing it in
    // Scene.update overwrites the movement calculated for the same frame and
    // can pin the hero inside an enemy.
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.handlePostPhysicsUpdate, this);
    const requestedWords = developmentParams.get('words')?.split(',') ?? this.services.save.recentWordLoadout;
    if (this.qaMode || developmentParams.has('skipLoadout')) this.beginEquippedRun(requestedWords, developmentParams.has('boss'));
    else {
      this.timeControl.acquire('SCENE_TRANSITION', this.timeOwner); this.hero.controlsLocked = true; this.inputRouter.setContext('NONE'); this.clearCombatInput();
      this.services.ui.showWordLoadout(requestedWords, (words) => this.beginEquippedRun(words, false));
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private beginEquippedRun(words: readonly unknown[], startAtBoss: boolean): void {
    this.wordLoadout = new WordLoadoutState(words);
    const equipped = this.wordLoadout.finalize();
    this.services.save.recentWordLoadout = [...equipped]; this.services.persist(); this.combatStats.setEquippedWords(equipped);
    this.tutorialSteps = [...TUTORIAL.slice(0, 4).map((step) => ({ ...step })), ...(['Q', 'E', 'R'] as WordSlot[]).map((slot) => { const word = this.wordLoadout.wordForSlot(slot); return { action: word, text: WORD_TUTORIAL_TEXT(slot, word) }; })];
    this.timeControl.release('SCENE_TRANSITION', this.timeOwner); this.hero.controlsLocked = false;
    if (this.flow.baseState === 'RUN_START') this.transitionFlow('WAVE_COMBAT');
    this.services.ui.showHud(); this.startTime = this.time.now;
    this.tutorialEnabled = this.services.save.settings.showTutorial && !this.services.save.tutorialSeen;
    if (this.tutorialEnabled) { const first = this.tutorialSteps[0]; if (first) this.services.ui.showTutorial(first.text); this.tutorialHideAt = this.time.now + 5000; }
    if (startAtBoss) { this.debugInvulnerable = true; this.startBoss(); } else this.spawnWave(0);
  }

  private startNewRun(): void {
    this.runId = this.runSession.beginRun();
    this.runProgress.beginRun(this.runId);
    this.runAct.beginRun(this.runId, 0, 0);
    this.damageFrameId = 0;
    this.damageQueue = new DamageQueue(undefined, (runId, actId) => this.runSession.isCurrent(runId) && this.runAct.current.id === actId, (trace) => {
      this.watchdogMessage = `damage blocked · ${trace.blockedReason ?? 'unknown'} · ${trace.rootEventId}`;
      if (import.meta.env.DEV) console.warn('[RUN-ACT-05R2 DamageQueue guard]', trace);
    });
    // Phaser reuses the Scene instance for restart/start. Object fields are not
    // cleared automatically even though display-list children are destroyed.
    this.boss = undefined;
    this.enemies = new Set(); this.projectiles = new Set(); this.inkZones = []; this.linkedTargets = new Set(); this.linkMarkers = new Map(); this.linkShareRatio = BALANCE.words.linkShare; this.linkGeneration = 0;
    this.upgrades = this.runProgress.upgrades; this.rewind = new RewindBuffer(BALANCE.words.rewindDuration); this.targeting = new TargetingSystem(BALANCE.targeting); this.wordChain = new WordChainSystem(BALANCE.chain.window); this.wordLoadout = new WordLoadoutState(DEFAULT_WORD_LOADOUT); this.wordStatuses = new WordStatusRuntime(); this.wordReadyAt = { stop: 0, rewind: 0, link: 0, pull: 0, mark: 0, push: 0 }; this.damageHistory = new DamageHistory(BALANCE.chain.damageHistoryRetention); this.combatStats = this.runProgress.combatStats; this.attackRegistry = new AttackHitRegistry(); this.attackInput = new RisingEdgeInput(); this.comboLock = new SoftTargetLock(); this.flow = new GameFlowController('RUN_START', import.meta.env.DEV ? (message) => console.warn(`[GameFlow] ${message}`) : undefined, performance.now()); this.inputRouter = new InputRouter(); this.parryResolver = new ParryResolver(); this.finisherCharges = new FinisherChargeSystem(BALANCE.hero.finisher.maximumCharges); this.weaponCooldowns = new WeaponCooldowns(); this.weaponCooldowns.reset(0); this.resonanceRuntime = new ResonanceRuntime(); this.waveDirector = new WaveDirector(BALANCE.pacing.roundClearStability, BALANCE.pacing.staleEnemyRecovery); this.threatBudget = new ThreatBudget(); this.runOutcome = new RunOutcomeController(); this.attacks = [];
    this.waveIndex = 0; this.waveSpawnGeneration = 0; this.enemySpawnTimes = new Map(); this.enemyFirstDamageAt = new Map(); this.currentComboDamage = 0; this.nextDefensiveSlashAt = 0; this.defensiveSlashEnabled = false; this.nextHeldComboAt = 0; this.firstWaveSpawnOrdinal = 0; this.defensiveSlashSequence = 100000; this.echoBladeSequence = 200000; this.lastDirectTargetId = undefined; this.echoFinisherUntil = 0; this.echoAmplifierUntil = 0; this.bossMechanicRewardUntil = 0; this.encounterStartedAt = 0; this.bossPhaseStartedAt = 0; this.currentWaveBatches = []; this.nextBatchIndex = 0; this.activeBatchPendingSpawns = 0; this.miniWaveReadyAt = 0; this.parryAnchorUntil = 0; this.lastWaveDiagnosticAt = 0; this.score = 0; this.activeActPatterns = new Set(); this.activeEndlessModifiers = []; this.actPatternGeneration = 0; this.echoProjectileSequence = 0; this.stitchedPairs = new Map(); this.arenaContainer = undefined; this.modifierEnvironment = undefined; this.modifierIntroductions = new ModifierIntroductionTracker(this.services.save.modifierTutorialsSeen);
    this.sentence = 0; this.empowered = false; this.stopReadyAt = 0; this.rewindReadyAt = 0; this.linkReadyAt = 0;
    this.damageTaken = 0; this.deathSequenceStarted = false; this.parries = 0; this.wordUses = { '멎는다': 0, '되돌린다': 0, '잇는다': 0, '당긴다': 0, '새긴다': 0, '밀어낸다': 0 };
    this.tutorialIndex = 0; this.tutorialSteps = TUTORIAL.map((step) => ({ ...step })); this.tutorialHideAt = 0; this.firstHitAvailable = true; this.lastPursuitId = ''; this.pursuitCount = 0; this.regressionCharged = false; this.parryCounterUntil = 0; this.parryAimUntil = 0; this.parryStartedAt = 0; this.sentencePulseUntil = 0; this.sentenceFullAt = 0; this.sentenceReminderShown = false; this.perfectCounterUntil = 0; this.headwindGuardUntil = 0; this.cutPerfectCounterActive = false; this.lastDashAt = Number.NEGATIVE_INFINITY; this.echoHarvestWindowStartedAt = 0; this.echoHarvestWindowGain = 0; this.lastUpgradeToastAt = new Map(); this.lastActivatedUpgrade = undefined; this.lastActivatedUpgradeUntil = 0; this.lastActivatedResonance = undefined; this.lastActivatedResonanceUntil = 0; this.transientCombatObjects.clear(); this.bossTransitionUntil = 0; this.bossSignatureExecutions = new Set(); this.bossDeathEvents = 0; this.actTransitionStartedAt = 0; this.lastActTransitionDuration = 0; this.bufferedAction = undefined; this.currentTarget = undefined; this.comboTarget = undefined; this.heldAttackTarget = undefined; this.targetMarkerUntil = 0; this.targetDistance = 0; this.timeouts = []; this.rewindPreviewGhosts = [];
    this.activeDaggerDebug = undefined; this.debugHitboxes = false; this.debugStatsVisible = false; this.debugScenarioIndex = 0; this.debugInvulnerable = false; this.watchdogHandle = undefined; this.lastHeartbeatAt = performance.now(); this.lastWatchdogReportAt = 0; this.watchdogMessage = 'normal'; this.watchdogStalled = false; this.lastAttackAt = 0; this.lastHitAt = 0; this.lastDebugPublishAt = 0; this.frameDelta = 1000 / 60; this.combatHeartbeats = { scene: 0, physics: 0, damageQueue: 0, timeControl: 0, audio: 0, bossAi: 0 };
  }

  private runDelayedCall(delay: number, callback: () => void): Phaser.Time.TimerEvent {
    const runId = this.runId;
    const scope = this.runProgress.captureScope();
    const actScope = this.runAct.captureScope();
    return this.time.delayedCall(delay, () => { this.runSession.invoke(runId, () => { this.runProgress.invoke(scope, () => { this.runAct.invoke(actScope, callback); }); }); });
  }

  private runTimeout(delay: number, callback: () => void): number {
    const runId = this.runId;
    const scope = this.runProgress.captureScope();
    const actScope = this.runAct.captureScope();
    const handle = window.setTimeout(() => { this.runSession.invoke(runId, () => { this.runProgress.invoke(scope, () => { this.runAct.invoke(actScope, callback); }); }); }, delay);
    this.timeouts.push(handle);
    return handle;
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D', j: 'J', k: 'K', shift: 'SHIFT', space: 'SPACE', q: 'Q', e: 'E', r: 'R', f: 'F', p: 'P', l: 'L', f2: 'F2', f3: 'F3', f4: 'F4' }) as typeof this.keys;
    this.attackKeyDownHandler = (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent): void => {
      if (!this.flow.allowsCombatInput || !this.inputRouter.accepts('COMBAT', event.code, event.repeat)) return;
      this.attackInput.keyDown(event.repeat);
    };
    this.attackKeyUpHandler = (): void => {
      this.attackInput.keyUp();
    };
    this.keys.j.on(Phaser.Input.Keyboard.Events.DOWN, this.attackKeyDownHandler);
    this.keys.j.on(Phaser.Input.Keyboard.Events.UP, this.attackKeyUpHandler);
    this.pointerHandler = (pointer: Phaser.Input.Pointer): void => {
      if (this.services.save.settings.controlMode === 'keyboard' || !this.flow.allowsCombatInput) return;
      if (pointer.leftButtonDown()) this.requestCombatAction('attack', 0, 0);
      if (pointer.rightButtonDown()) this.requestCombatAction('parry', 0, 0);
    };
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerHandler);
    this.escapeHandler = (event: KeyboardEvent): void => {
      this.inputRouter.noteKeyDown(event.code, event.repeat);
      if (!this.scene.isActive()) return;
      if (this.debugScenarioText?.visible) {
        const count = this.debugScenarioItems().length;
        if (event.code === 'ArrowUp' || event.code === 'KeyW') { event.preventDefault(); this.debugScenarioIndex = (this.debugScenarioIndex + count - 1) % count; this.renderDebugScenarioMenu(); return; }
        if (event.code === 'ArrowDown' || event.code === 'KeyS') { event.preventDefault(); this.debugScenarioIndex = (this.debugScenarioIndex + 1) % count; this.renderDebugScenarioMenu(); return; }
        if (event.code === 'Enter') { event.preventDefault(); this.runFoundationScenario(this.debugScenarioIndex); this.closeDebugScenarioMenu(); return; }
        if (event.code === 'Escape' || event.code === 'KeyK' || event.code === 'F4') { event.preventDefault(); this.closeDebugScenarioMenu(); return; }
      }
      if (event.code === 'Escape') this.togglePause();
    };
    this.keyUpRouterHandler = (event: KeyboardEvent): void => { this.inputRouter.noteKeyUp(event.code); };
    window.addEventListener('keydown', this.escapeHandler);
    window.addEventListener('keyup', this.keyUpRouterHandler);
  }

  private setupVisibilityHandling(): void {
    const hide = (): void => {
      if (this.flow.isTabHidden) return;
      this.flow.setTabHidden(true, performance.now());
      this.timeControl.acquire('TAB_HIDDEN', 'visibility');
      this.clearCombatInput(); this.inputRouter.setContext('NONE'); this.inputRouter.blockHeldKeys();
      this.services.audio.suspend();
    };
    const show = (): void => {
      if (document.hidden || !this.flow.isTabHidden) return;
      this.flow.setTabHidden(false, performance.now());
      this.timeControl.release('TAB_HIDDEN', 'visibility');
      this.syncInputContext(); this.inputRouter.blockHeldKeys(); this.attackInput.suppressUntilRelease(true);
      this.timeControl.clearStaleHitstop(); this.services.audio.resume();
    };
    this.visibilityHandler = (): void => { if (document.hidden) hide(); else show(); };
    this.blurHandler = hide;
    this.focusHandler = show;
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('blur', this.blurHandler);
    window.addEventListener('focus', this.focusHandler);
  }

  private transitionFlow(next: BaseGameFlowState): boolean {
    const changed = this.flow.transition(next, performance.now());
    if (!changed) return false;
    this.clearCombatInput(); this.syncInputContext();
    return true;
  }

  private syncInputContext(): void {
    let context: InputContext = 'NONE';
    if (this.debugScenarioText?.visible) context = 'DEVELOPMENT';
    else if (this.flow.state === 'USER_PAUSED') context = 'PAUSE';
    else if (this.flow.state === 'COMBAT' || this.flow.state === 'WAVE_COMBAT' || this.flow.state === 'BOSS_COMBAT') context = 'COMBAT';
    else if (this.flow.state === 'REWARD_SELECT' || this.flow.state === 'BOSS_REWARD_SELECT') context = 'REWARD';
    else if (this.flow.state === 'RESULT' || this.flow.state === 'RUN_OVER') context = 'RESULT';
    this.inputRouter.setContext(context);
  }

  private clearCombatInput(): void {
    this.bufferedAction = undefined;
    this.attackInput.suppressUntilRelease(this.keys?.j?.isDown ?? true);
    this.heldAttackTarget = undefined;
    this.comboLock.clear();
    this.input.keyboard?.resetKeys();
    this.inputRouter.blockHeldKeys();
  }

  public override update(time: number, delta: number): void {
    const realtimeNow = performance.now();
    this.damageQueue.beginFrame(this.damageFrameId += 1);
    this.combatHeartbeats.damageQueue = realtimeNow;
    this.combatHeartbeats.timeControl = realtimeNow;
    this.frameDelta = Number.isFinite(delta) && delta > 0 ? delta : 1000 / 60;
    this.lastHeartbeatAt = realtimeNow;
    this.combatHeartbeats.scene = realtimeNow;
    if (this.tutorialEnabled && this.tutorialHideAt > 0 && time >= this.tutorialHideAt) { this.services.ui.hideTutorial(); this.tutorialHideAt = 0; }
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f2)) this.toggleHitboxDebug();
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f3)) this.toggleStatsDebug();
    if (import.meta.env.DEV && Phaser.Input.Keyboard.JustDown(this.keys.f4)) this.showDebugScenarioMenu();
    if (!this.flow.allowsCombatSimulation || this.timeControl.isHardPaused) {
      this.drawCombatDebug(time); this.updateHud(time); this.publishDebugState(); return;
    }
    const pointer = this.input.activePointer;
    const x = (this.keys.d.isDown || this.cursors.right.isDown ? 1 : 0) - (this.keys.a.isDown || this.cursors.left.isDown ? 1 : 0);
    const y = (this.keys.s.isDown || this.cursors.down.isDown ? 1 : 0) - (this.keys.w.isDown || this.cursors.up.isDown ? 1 : 0);
    const keyboardMode = this.services.save.settings.controlMode === 'keyboard';
    this.game.canvas.style.cursor = keyboardMode ? 'none' : '';
    this.targeting.updateDirection(x, y);
    const direction = this.targeting.lastDirection;
    let aimX = keyboardMode ? this.hero.x + direction.x * 120 : pointer.worldX;
    let aimY = keyboardMode ? this.hero.y + direction.y * 120 : pointer.worldY;
    if (keyboardMode && time < this.parryAimUntil) { aimX = this.hero.x + Math.cos(this.hero.facing) * 120; aimY = this.hero.y + Math.sin(this.hero.facing) * 120; }
    this.hero.updateMovement(time, x, y, aimX, aimY);
    this.hero.constrainToArena();
    this.updateTargetMarker(time);
    this.heroShadow.setPosition(this.hero.x, this.hero.y + 9).setScale(this.hero.isDashing ? 1.5 : 1);
    const sentenceReady = this.sentence >= this.sentenceMax;
    const runeAlpha = this.empowered
      ? 0.48 + Math.sin(time / 95) * 0.2
      : sentenceReady ? 0.18 + Math.sin(time / 160) * 0.08 : 0;
    this.heroRune?.setPosition(this.hero.x, this.hero.y - 7).setAlpha(runeAlpha).setScale(1 + Math.sin(time / 130) * 0.08);
    if (sentenceReady && !this.empowered && !this.sentenceReminderShown && this.sentenceFullAt > 0 && time - this.sentenceFullAt >= 6000) {
      this.sentenceReminderShown = true;
      this.services.ui.showChainTrigger('F 강화 용언 준비', 900);
    }
    if (x !== 0 || y !== 0) this.markTutorial('move');
    const attackEdge = this.attackInput.consume();
    const heldRepeat = this.services.save.settings.holdCutRepeat && this.attackInput.isHeld && !this.hero.isComboActive && !this.bufferedAction && time >= this.nextHeldComboAt;
    if ((attackEdge || heldRepeat) && this.inputRouter.accepts('COMBAT', 'KeyJ')) { this.combatStats.jInput(); this.requestCombatAction('attack', x, y); }
    if ((Phaser.Input.Keyboard.JustDown(this.keys.k) && this.inputRouter.accepts('COMBAT', 'KeyK')) || (Phaser.Input.Keyboard.JustDown(this.keys.shift) && this.inputRouter.accepts('COMBAT', 'ShiftLeft'))) this.requestCombatAction('parry', x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.space) && this.inputRouter.accepts('COMBAT', 'Space')) this.requestCombatAction('dash', x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.f) && this.inputRouter.accepts('COMBAT', 'KeyF')) this.armEmpower();
    if (Phaser.Input.Keyboard.JustDown(this.keys.q) && this.inputRouter.accepts('COMBAT', 'KeyQ')) this.requestCombatAction(this.wordLoadout.wordForSlot('Q'), x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.e) && this.inputRouter.accepts('COMBAT', 'KeyE')) this.requestCombatAction(this.wordLoadout.wordForSlot('E'), x, y);
    if (Phaser.Input.Keyboard.JustDown(this.keys.r) && this.inputRouter.accepts('COMBAT', 'KeyR')) this.requestCombatAction(this.wordLoadout.wordForSlot('R'), x, y);
    this.processBufferedAction();
    if (this.legacyCombatMode) this.updateDefensiveSlash(time);
    else this.updateEchoBlade(time);
    // Keep accepting/buffering player intent during the short hitstop, but do
    // not run AI or manual position correction while Arcade Physics is paused.
    if (this.timeControl.hasReason('HITSTOP')) {
      this.drawCombatDebug(time); this.updateHud(time); this.publishDebugState(); return;
    }
    if (this.qaMode && Phaser.Input.Keyboard.JustDown(this.keys.p)) this.qaAdvance();
    if (this.qaMode && Phaser.Input.Keyboard.JustDown(this.keys.l)) this.qaReadyWords();
    this.recordState(time);
    for (const enemy of [...this.enemies]) {
      if (!enemy.active) continue;
      const beforeAiCorrection = enemy.constrainToCombatBounds();
      if (beforeAiCorrection.corrected) {
        enemy.cancelAttackIntent(time + 420);
        this.combatStats.boundaryCorrection(beforeAiCorrection.correctedTop);
      }
      enemy.updateAI(time, this.hero);
      if (enemy.kind === 'boss') this.combatHeartbeats.bossAi = realtimeNow;
      const correction = enemy.constrainToCombatBounds();
      if (correction.corrected) this.combatStats.boundaryCorrection(correction.correctedTop);
      // A clamped transient near an edge is expected. Count only entities that
      // remain outside after the common bounds repair has run.
      if (!groundFootprintInsideBounds(enemy.groundPoint, enemyGroundExtents(enemy.kind), COMBAT_BOUNDS)) this.combatStats.enemyOutsideBounds();
    }
    for (const projectile of [...this.projectiles]) {
      if (!projectile.active) { this.projectiles.delete(projectile); continue; }
      projectile.update(time); this.checkProjectileCollision(projectile); if (projectile.active) projectile.commitPosition();
    }
    this.checkMeleeCollisions(time);
    for (const enemy of this.enemies) if (enemy.active) enemy.commitGroundPosition();
    this.combatHeartbeats.physics = performance.now();
    this.updateInkZones(time);
    this.updateRewindPreview(time);
    this.updateLinks(time);
    this.updateWaveLifecycle();
    this.drawCombatDebug(time);
    this.updateHud(time);
    this.publishDebugState();
  }

  private publishDebugState(): void {
    if (!import.meta.env.DEV) return;
    const now = performance.now(); if (now - this.lastDebugPublishAt < 100) return; this.lastDebugPublishAt = now;
    this.game.canvas.dataset.eonmaekDebug = JSON.stringify({
      flow: this.flow.state,
      run: this.runSession.snapshot(),
      hero: { x: this.hero.x, y: this.hero.y, health: this.hero.health, parrying: this.hero.isParrying, finisherCharges: this.finisherCharges.charges, finisherMax: this.finisherCharges.maxCharges, comboActive: this.hero.isComboActive, comboStep: this.hero.comboStep, direction: this.hero.attackDirection },
      targetId: this.comboLock.targetId ?? this.heldAttackTarget?.id ?? this.currentTarget?.id,
      targetDistance: this.targetDistance,
      wave: this.waveDirector.snapshot(),
      act: this.runAct.snapshot(),
      runActFlow: {
        currentBossDefinition: this.boss?.definition.bossId,
        bossPhase: this.boss?.phaseSnapshot,
        signaturePatternsExecuted: [...this.bossSignatureExecutions],
        skippedBossPhases: this.boss?.phaseSnapshot.skippedPhaseCount ?? 0,
        bossDeathEvents: this.bossDeathEvents,
        actTransitionDurationMs: this.lastActTransitionDuration,
        modifiers: modifierIdsForPause(this.activeActPatterns, this.runAct.current.modifiers),
      },
      outcome: this.runOutcome.snapshot(),
      damageQueue: this.damageQueue.snapshot(),
      threatBudget: this.threatBudget.snapshot(this.time.now),
      heartbeats: { ...this.combatHeartbeats },
      stats: this.combatStats.snapshot(),
      enemies: [...this.enemies].filter((enemy) => enemy.active).map((enemy) => ({ id: enemy.id, kind: enemy.kind, health: enemy.health, x: enemy.x, y: enemy.y, removing: enemy.removing, stopped: enemy.isStopped, linked: enemy.linked, echo: enemy.isEchoMarked })),
      upgrades: this.upgrades.entries().map(({ id, stacks }) => ({ id, stacks, preview: this.upgrades.preview(id) })),
      upgradeRuntime: this.upgrades.runtimeSnapshot(),
      time: this.timeControl.snapshot(),
    });
  }

  private requestCombatAction(action: CombatAction, x: number, y: number): void {
    if (!this.flow.allowsCombatInput) return;
    if (this.hero.canCancelAttack(this.time.now) && this.executeCombatAction(action, x, y)) {
      if (action !== 'attack') this.attackInput.suppressUntilRelease(this.keys.j.isDown);
      this.bufferedAction = undefined; return;
    }
    this.bufferedAction = { action, expiresAt: this.time.now + BALANCE.hero.inputBuffer, x, y };
  }

  private processBufferedAction(): void {
    const buffered = this.bufferedAction; if (!buffered) return;
    if (this.time.now > buffered.expiresAt) { this.bufferedAction = undefined; return; }
    if (!this.hero.canCancelAttack(this.time.now)) return;
    if (this.executeCombatAction(buffered.action, buffered.x, buffered.y)) {
      if (buffered.action !== 'attack') this.attackInput.suppressUntilRelease(this.keys.j.isDown);
      this.bufferedAction = undefined;
    }
  }

  private executeCombatAction(action: CombatAction, x: number, y: number): boolean {
    const pointer = this.input.activePointer; const keyboardMode = this.services.save.settings.controlMode === 'keyboard';
    const direction = this.targeting.lastDirection;
    const aim = keyboardMode ? { x: this.hero.x + direction.x * 120, y: this.hero.y + direction.y * 120 } : { x: pointer.worldX, y: pointer.worldY };
    switch (action) {
      case 'attack': {
        if (this.legacyCombatMode) return keyboardMode ? this.attackWithSoftTarget() : this.attackDirection(Phaser.Math.Angle.Between(this.hero.x, this.hero.y, aim.x, aim.y));
        const cutDirection = keyboardMode
          ? quantizeEightDirection(this.targeting.lastDirection, this.hero.facing)
          : quantizeEightDirection({ x: aim.x - this.hero.x, y: aim.y - this.hero.y }, this.hero.facing);
        return this.useCut(cutDirection.angle);
      }
      case 'parry': return this.parry();
      case 'dash': return this.dash(x, y);
      case 'stop': {
        const target = keyboardMode ? this.keyboardStopTarget(this.acquireSoftTarget(BALANCE.words.stopMaximumDistance, BALANCE.words.stopMaximumDistance)) : aim;
        return this.castStop(target.x, target.y);
      }
      case 'rewind': return this.castRewind();
      case 'link': {
        const target = keyboardMode ? this.acquireSoftTarget(BALANCE.words.linkSelectionRadius, BALANCE.words.linkSelectionRadius) : undefined;
        return this.castLink(target?.candidate.x ?? aim.x, target?.candidate.y ?? aim.y, keyboardMode ? this.enemyForSelection(target) : undefined);
      }
      case 'pull': return this.castPull(aim.x, aim.y);
      case 'mark': return this.castMark();
      case 'push': return this.castPush(direction.x, direction.y);
    }
  }

  private updateTargetMarker(time: number): void {
    const marker = this.targetMarker; const target = this.currentTarget;
    const attackOwnedMarker = target !== undefined && (target === this.heldAttackTarget || target === this.comboTarget);
    const markerActive = attackOwnedMarker ? (this.attackInput.isHeld || this.hero.isComboActive) : time <= this.targetMarkerUntil;
    if (!marker || !target?.active || target.removing || !markerActive || this.services.save.settings.controlMode !== 'keyboard') {
      marker?.clear().setAlpha(0); if (!this.hero.isComboActive) this.currentTarget = undefined; return;
    }
    if (marker.alpha <= 0.01) marker.setPosition(target.x, target.y);
    else marker.setPosition(Phaser.Math.Linear(marker.x, target.x, BALANCE.targeting.markerLerp), Phaser.Math.Linear(marker.y, target.y, BALANCE.targeting.markerLerp));
    marker.clear();
    marker.lineStyle(2, 0x70cabb, 0.66).beginPath().arc(0, 5, target.kind === 'boss' ? 28 : 18, 0.12, Math.PI - 0.12).strokePath();
    marker.fillStyle(0x9cebdd, 0.74).fillCircle(0, target.kind === 'boss' ? -78 : -48, 2.5);
    marker.lineStyle(1, 0x70cabb, 0.45).lineBetween(-4, target.kind === 'boss' ? -72 : -42, 0, target.kind === 'boss' ? -78 : -48).lineBetween(0, target.kind === 'boss' ? -78 : -48, 4, target.kind === 'boss' ? -72 : -42);
    marker.setAlpha(0.46 + Math.sin(time / 170) * 0.08);
  }

  private targetingCandidates(): TargetCandidate[] {
    return [...this.enemies].map((enemy) => this.targetCandidate(enemy));
  }

  private targetCandidate(enemy: Enemy): TargetCandidate {
    return {
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
      hurtbox: enemy.hurtbox,
      alive: enemy.active && enemy.health > 0 && enemy.spawned,
      visible: enemy.x >= 0 && enemy.x <= 960 && enemy.y >= 0 && enemy.y <= 540,
      attackable: !enemy.removing,
      insideCombatBounds: groundFootprintInsideBounds(enemy.groundPoint, enemyGroundExtents(enemy.kind), COMBAT_BOUNDS),
      removing: enemy.removing,
      threat: enemy.attackActiveUntil > this.time.now ? 1 : 0,
      priority: enemy.kind === 'boss' ? 0.35 : enemy.kind === 'elite' ? 0.18 : 0,
    };
  }

  private acquireSoftTarget(range: number, assistRange: number, attackOriginOffset = 0): TargetSelection | undefined {
    const selection = this.targeting.selectSoft(this.hero.groundPoint, this.targetingCandidates(), { range, assistRange, attackOriginOffset });
    if (!selection) { this.currentTarget = undefined; this.targetMarkerUntil = 0; this.combatStats.noTarget(); return undefined; }
    if (selection.hurtboxDistance > assistRange) { this.combatStats.outOfRangeTarget(); return undefined; }
    const enemy = this.enemyForSelection(selection);
    if (!enemy) return undefined;
    this.currentTarget = enemy; this.targetDistance = selection.hurtboxDistance;
    this.targetMarkerUntil = this.time.now + BALANCE.targeting.markerDuration;
    return selection;
  }

  private enemyForSelection(selection?: TargetSelection): Enemy | undefined {
    return selection ? [...this.enemies].find((enemy) => enemy.id === selection.candidate.id && enemy.active && !enemy.removing) : undefined;
  }

  private keyboardStopTarget(selection?: TargetSelection): { x: number; y: number } {
    const direction = this.targeting.lastDirection;
    const nearest = selection ? undefined : this.nearestEnemy(this.hero.x, this.hero.y);
    let x = selection?.candidate.x ?? nearest?.x ?? this.hero.x + direction.x * BALANCE.words.stopFallbackDistance;
    let y = selection?.candidate.y ?? nearest?.y ?? this.hero.y + direction.y * BALANCE.words.stopFallbackDistance;
    const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, x, y);
    if (distance > BALANCE.words.stopMaximumDistance) {
      const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, x, y);
      x = this.hero.x + Math.cos(angle) * BALANCE.words.stopMaximumDistance; y = this.hero.y + Math.sin(angle) * BALANCE.words.stopMaximumDistance;
    }
    return clampPointToBounds(x, y, COMBAT_BOUNDS, 10);
  }

  private enterWave(index: number): void {
    const wave = this.runAct.current.waves[index];
    if (!wave) return;
    const presentation = this.modifierIntroductions.presentationFor(wave.patterns, activeModifiersForWave(this.runAct.current, index));
    if (!presentation) {
      if (this.flow.baseState !== 'WAVE_COMBAT' && !this.transitionFlow('WAVE_COMBAT')) return;
      this.spawnWave(index);
      return;
    }
    if (!this.transitionFlow('MODIFIER_INTRO')) return;
    if (presentation.detailed) {
      this.services.save.modifierTutorialsSeen = this.modifierIntroductions.seenIds();
      this.services.persist();
    }
    this.timeControl.acquire('SCENE_TRANSITION', this.timeOwner);
    this.hero.controlsLocked = true;
    this.clearCombatInput();
    this.services.ui.showModifierIntro(presentation, () => {
      if (!this.sys.isActive() || this.flow.baseState !== 'MODIFIER_INTRO') return;
      this.timeControl.release('SCENE_TRANSITION', this.timeOwner);
      this.hero.controlsLocked = false;
      this.clearCombatInput();
      if (!this.transitionFlow('WAVE_COMBAT')) return;
      this.services.ui.showHud();
      this.spawnWave(index);
    });
  }

  private spawnWave(index: number): void {
    this.threatBudget.reset();
    this.runProgress.setWave(this.runId, this.runProgress.act.generation, index);
    if (!this.runAct.beginWave(index)) return;
    this.firstHitAvailable = true;
    this.stopReadyAt = this.time.now; this.rewindReadyAt = this.time.now; this.linkReadyAt = this.time.now;
    for (const id of Object.keys(this.wordReadyAt) as WordId[]) this.setReadyAtForWord(id, this.time.now);
    if (index === 0) this.firstWaveSpawnOrdinal = 0;
    const wave = this.runAct.current.waves[index]; if (!wave) return;
    const batches = wave.batches;
    this.activeActPatterns = new Set(wave.patterns);
    this.activeEndlessModifiers = activeModifiersForWave(this.runAct.current, index);
    const patternGeneration = ++this.actPatternGeneration;
    const generation = ++this.waveSpawnGeneration;
    this.currentWaveBatches = batches;
    this.nextBatchIndex = 0;
    this.activeBatchPendingSpawns = 0;
    this.miniWaveReadyAt = 0;
    this.encounterStartedAt = this.time.now;
    const total = batches.reduce((count, batch) => count + batch.length, 0);
    this.waveDirector.startWave(total, performance.now());
    this.spawnNextMiniWave(generation);
    this.scheduleActPatterns(patternGeneration);
  }

  private spawnNextMiniWave(generation: number): void {
    if (generation !== this.waveSpawnGeneration) return;
    const batch = this.currentWaveBatches[this.nextBatchIndex];
    if (!batch) return;
    this.nextBatchIndex += 1;
    this.activeBatchPendingSpawns = batch.length;
    this.miniWaveReadyAt = 0;
    const positions = this.spawnPositions(batch.length);
    batch.forEach((kind, itemIndex) => {
      this.runDelayedCall(itemIndex * BALANCE.pacing.waveSpawnInterval, () => {
        if (generation !== this.waveSpawnGeneration) return;
        this.activeBatchPendingSpawns = Math.max(0, this.activeBatchPendingSpawns - 1);
        const position = positions[itemIndex] ?? { x: 120, y: 130 };
        const enemy = this.spawnEnemy(kind, position.x, position.y, true);
        const actThreeGrace = this.runAct.current.index >= 3 ? 1250 : 0;
        if (this.waveIndex === 0 || actThreeGrace > 0) enemy.delayAttackUntil(this.encounterStartedAt + Math.max(BALANCE.pacing.firstWaveAttackGrace, actThreeGrace) + this.firstWaveSpawnOrdinal++ * BALANCE.pacing.firstWaveAttackStagger);
        this.waveDirector.registerSpawn(enemy.id, performance.now());
      });
    });
  }

  private spawnPositions(count: number): { x: number; y: number }[] {
    if (this.runAct.current.index <= 2 && this.waveIndex === 0 && this.nextBatchIndex === 1) {
      const teachingSlots = [{ x: this.hero.x + 86, y: this.hero.y + 12 }, { x: this.hero.x - 86, y: this.hero.y - 12 }];
      return teachingSlots.slice(0, count).map((slot) => clampPointToBounds(slot.x, slot.y, COMBAT_BOUNDS, 28));
    }
    const slots = [{ x: 102, y: 112 }, { x: 858, y: 118 }, { x: 105, y: 458 }, { x: 855, y: 455 }, { x: 480, y: 94 }, { x: 480, y: 478 }, { x: 244, y: 102 }, { x: 716, y: 466 }];
    const minimumDistance = this.runAct.current.index >= 3 ? 220 : 170;
    return slots.filter((slot) => Phaser.Math.Distance.Between(slot.x, slot.y, this.hero.x, this.hero.y) >= minimumDistance).slice(0, count).sort(() => Math.random() - 0.5);
  }

  private enemyCallbacks(): EnemyCallbacks {
    const runId = this.runId;
    return {
      shoot: (source, x, y, angle, speed, damage, texture) => { this.runSession.invoke(runId, () => this.spawnProjectile(source, x, y, angle, speed, damage, texture)); },
      melee: (enemy, damage) => { this.runSession.invoke(runId, () => this.hitHero(damage * Number(enemy.getData('damageMultiplier') ?? 1), enemy.x, enemy.y, enemy.kind === 'boss' ? 'boss' : 'melee', { attackerId: enemy.id, attackerDisplayName: enemy.kind === 'boss' ? this.boss?.definition.displayName ?? '보스' : enemyDisplayName(enemy.kind), attackId: enemy.meleeAttackId, patternName: enemy.kind === 'boss' ? `${this.boss?.definition.displayName ?? '보스'} 근접 공격` : `${enemyDisplayName(enemy.kind)} · ${attackDisplayName(enemy.meleeAttackId, '근접 공격')}`, parryable: enemy.meleeParryable })); },
      died: (enemy, source) => { this.runSession.invoke(runId, () => this.onEnemyDied(enemy, source)); },
      cue: (cue) => { this.runSession.invoke(runId, () => this.services.audio.play(cue === 'warning' ? 'warning' : 'parryOpen')); },
      requestAttack: (enemy) => {
        if (!this.runSession.isCurrent(runId)) return false;
        const tier: ThreatTier = enemy.kind === 'chaser' && this.runAct.current.index >= 3 ? 'tracking' : enemy.kind === 'elite' || enemy.kind === 'boss' ? 'high' : enemy.kind === 'ink' ? 'large-telegraph' : enemy.kind === 'archer' ? 'medium' : 'low';
        const durationMs = enemy.kind === 'ink' ? 780 : enemy.kind === 'elite' || enemy.kind === 'boss' ? 720 : 580;
        return this.threatBudget.request({ id: `enemy:${enemy.id}`, tier, now: this.time.now, durationMs, dangerousLimit: this.runAct.current.index >= 4 ? 2 : 1, minimumTierGapMs: tier === 'tracking' ? 720 : undefined });
      },
    };
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, waveTracked = false): Enemy {
    const safe = clampGroundPointToBounds(x, y, enemyGroundExtents(kind), COMBAT_BOUNDS);
    const enemy = new Enemy(this, safe.x, safe.y, kind, this.enemyCallbacks(), this.runAct.current.healthMultiplier);
    enemy.setData('waveTracked', waveTracked);
    enemy.setData('runId', this.runId);
    enemy.setData('actId', this.runAct.current.id);
    enemy.setData('damageMultiplier', this.runAct.current.damageMultiplier);
    this.enemySpawnTimes.set(enemy.id, { kind, at: performance.now() });
    this.enemies.add(enemy); enemy.spawn(); return enemy;
  }

  private spawnProjectile(source: Enemy, x: number, y: number, angle: number, speed: number, damage: number, texture?: string, echoGeneration = 0): void {
    const scaledDamage = damage * Number(source.getData('damageMultiplier') ?? 1);
    const projectile = new Projectile(this, x, y, angle, speed, scaledDamage, texture, source.id);
    projectile.setData('actId', this.runAct.current.id);
    projectile.setData('echoGeneration', echoGeneration);
    this.projectiles.add(projectile);
    const echoEnabled = this.activeActPatterns.has('ink-echo-projectile') || this.activeEndlessModifiers.includes('projectile-echo');
    if (echoEnabled && echoGeneration === 0 && this.echoProjectileSequence++ % 3 === 0) {
      const marker = this.add.circle(x, y, 10, 0x6f4a82, .08).setStrokeStyle(2, 0xa578ae, .62).setDepth(DEPTH.telegraph);
      this.transientCombatObjects.add(marker);
      this.tweens.add({ targets: marker, scale: 1.8, alpha: 0, duration: 720, onComplete: () => { marker.destroy(); this.transientCombatObjects.delete(marker); } });
      this.runDelayedCall(720, () => {
        if (!source.active || source.removing || this.flow.baseState !== 'WAVE_COMBAT' && this.flow.baseState !== 'BOSS_COMBAT') return;
        this.spawnProjectile(source, x, y, angle, speed * .82, damage * .65, texture, 1);
      });
    }
  }

  private scheduleActPatterns(generation: number): void {
    const has = (pattern: ActPatternId): boolean => this.activeActPatterns.has(pattern) || this.activeActPatterns.has('mixed-archive');
    if (has('stitch-pair') || this.activeEndlessModifiers.includes('stitched-armor')) this.runDelayedCall(1350, () => {
      if (generation !== this.actPatternGeneration || !this.flow.allowsCombatInput) return;
      const candidates = [...this.enemies].filter((enemy) => enemy.active && enemy.spawned && !enemy.removing && enemy.kind !== 'boss').slice(0, 4);
      for (let index = 0; index + 1 < candidates.length; index += 2) {
        const first = candidates[index]; const second = candidates[index + 1]; if (!first || !second) continue;
        first.setData('stitchedPartnerId', second.id); second.setData('stitchedPartnerId', first.id);
        this.stitchedPairs.set(first.id, second.id); this.stitchedPairs.set(second.id, first.id);
        this.showCombatLabel((first.x + second.x) / 2, (first.y + second.y) / 2 - 30, '봉합 쌍', 0xc1849d);
      }
    });
    if (has('past-position') || this.activeEndlessModifiers.includes('time-rift')) {
      const mixedProfile = mixedModifierProfile(this.activeActPatterns.has('mixed-archive') || this.runAct.current.index === 3 && this.waveIndex === 1);
      const schedulePastStrike = (): void => {
        if (generation !== this.actPatternGeneration || !this.flow.allowsCombatInput) return;
        if (!this.threatBudget.request({ id: 'modifier:past-position', tier: 'modifier', now: this.time.now, durationMs: 1250 })) {
          this.runDelayedCall(320, schedulePastStrike); return;
        }
        const record = this.rewind.getRange(this.time.now, 1500)[0];
        const sourceX = record?.x ?? this.hero.x; const sourceY = record?.y ?? this.hero.y;
        const safe = clampPointToBounds(sourceX, sourceY, COMBAT_BOUNDS, 56); const x = safe.x; const y = safe.y;
        const telegraph = this.add.circle(x, y - 6, 52, 0x76284f, .16).setStrokeStyle(4, 0xf08a75, .92).setDepth(DEPTH.telegraph);
        const glyph = this.add.text(x, y - 8, '削\n0.9', { align: 'center', fontFamily: 'serif', fontSize: '18px', color: '#f2b0c5', stroke: '#32111e', strokeThickness: 5 }).setOrigin(.5).setDepth(DEPTH.telegraph);
        this.transientCombatObjects.add(telegraph); this.transientCombatObjects.add(glyph);
        this.tweens.add({ targets: [telegraph, glyph], scaleX: 1.18, scaleY: 1.18, duration: 850 });
        this.runDelayedCall(300, () => { if (glyph.active) glyph.setText('削\n0.6'); });
        this.runDelayedCall(600, () => { if (glyph.active) glyph.setText('削\n0.3'); telegraph.setAlpha(.28); });
        this.runDelayedCall(900, () => {
          telegraph.destroy(); glyph.destroy(); this.transientCombatObjects.delete(telegraph); this.transientCombatObjects.delete(glyph);
          this.createInkZone(x, y, 52, 1500, 'erasure', 10 * mixedProfile.damageMultiplier, '과거 교정', '과거 교정');
          this.runDelayedCall(3600 / mixedProfile.frequencyMultiplier, schedulePastStrike);
        });
      };
      this.runDelayedCall(mixedProfile.openingGraceMs, schedulePastStrike);
    }
    if (this.activeEndlessModifiers.includes('ink-floor')) this.runDelayedCall(1800, () => {
      if (generation !== this.actPatternGeneration || !this.flow.allowsCombatInput) return;
      this.createInkZone(Phaser.Math.Between(180, 780), Phaser.Math.Between(145, 430), 48, 2200);
    });
  }

  private weaponCandidates() {
    return [...this.enemies].map((enemy) => ({
      id: enemy.id,
      hurtbox: enemy.hurtbox,
      alive: enemy.active && enemy.spawned && enemy.health > 0,
      visible: enemy.visible && enemy.x >= 0 && enemy.x <= 960 && enemy.y >= 0 && enemy.y <= 540,
      attackable: !enemy.removing,
      insideCombatBounds: groundFootprintInsideBounds(enemy.groundPoint, enemyGroundExtents(enemy.kind), COMBAT_BOUNDS),
    }));
  }

  private currentEchoBladeProfile() {
    return echoBladeProfile(BALANCE.hero.echoBlade, this.upgrades.getStack('dual-moon-echo'), this.upgrades.getStack('wide-orbit'));
  }

  private updateEchoBlade(time: number): void {
    if (this.legacyCombatMode || !this.weaponCooldowns.canEcho(time) || this.hero.controlsLocked || this.hero.rewinding || this.timeControl.hasReason('HITSTOP')) return;
    const profile = this.currentEchoBladeProfile();
    const selected = echoBladeTargets(this.hero.hurtbox, this.weaponCandidates(), profile);
    if (selected.length === 0) return;
    this.weaponCooldowns.commitEcho(time, profile.interval);
    this.combatStats.echoBladeActivation();
    if (this.upgrades.getStack('dual-moon-echo') > 0) this.recordUpgradeContribution('dual-moon-echo', { activationCount: 1, generated: 1 });
    if (this.upgrades.getStack('wide-orbit') > 0) this.recordUpgradeContribution('wide-orbit', { activationCount: 1, generated: 1 });
    const attackId = this.echoBladeSequence += 1;
    const phase = time / 380;
    const slash = this.add.graphics().setDepth(DEPTH.melee);
    for (let orbit = 0; orbit < profile.orbitCount; orbit += 1) {
      const start = phase + orbit * Math.PI;
      slash.lineStyle(orbit === 0 ? 4 : 3, orbit === 0 ? 0x7ddcca : 0xa7efe1, 0.76)
        .beginPath().arc(this.hero.hurtbox.x, this.hero.hurtbox.y, profile.range * 0.78, start, start + 1.18).strokePath();
    }
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.08, scaleY: 1.08, duration: 135, onComplete: () => slash.destroy() });
    let totalDamage = 0;
    for (const item of selected) {
      const enemy = [...this.enemies].find((candidate) => candidate.id === item.id && candidate.active && !candidate.removing);
      if (!enemy || !this.attackRegistry.claim(attackId, enemy.id)) continue;
      // DamageQueue callbacks may synchronously finish and destroy this target
      // before the next statement. Capture the pre-hit state while the entity
      // still owns a Scene rather than dereferencing a destroyed GameObject.
      const harvestedState = enemy.isStopped || enemy.linked;
      const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y);
      const dealt = this.damageEnemy(enemy, profile.damage, angle, false, false, 'attack', 'attack');
      if (dealt <= 0) continue;
      totalDamage += dealt; this.combatStats.echoBladeHit(dealt); this.damageNumber(enemy.x, enemy.y - 38, dealt, 0x8bd8ca, true, '잔향 ');
      if (harvestedState) this.applyEchoHarvest(time);
      if (this.resonanceRuntime.registerMoonRingHit(this.upgrades.hasResonance('moon-ring'))) this.triggerMoonRingResonance();
    }
    if (totalDamage > 0) {
      this.attacks.push({ time, x: this.hero.x, y: this.hero.y, angle: phase, kind: 'echo-blade', damage: totalDamage });
      this.combatStats.agencyDamage('automatic', totalDamage); this.gainSentence(BALANCE.hero.echoBlade.sentenceGain); this.services.audio.play('echoBlade');
    }
    if (this.upgrades.getStack('backflow-blade') > 0) {
      for (const projectile of [...this.projectiles]) {
        if (!projectile.active || !projectile.enemyOwned || projectile.frozenUntil <= time) continue;
        if (Phaser.Math.Distance.Between(this.hero.hurtbox.x, this.hero.hurtbox.y, projectile.x, projectile.y) > profile.range + projectile.collisionCircle.radius) continue;
        const target = this.nearestEnemy(projectile.x, projectile.y); if (!target) continue;
        projectile.damage = backflowBladeDamage(projectile.damage, this.upgrades.getStack('backflow-blade')); projectile.setData('echoBladeBackflow', true); projectile.reflect(target.x, target.y);
        this.combatStats.echoBladeProjectile(); this.recordUpgradeContribution('backflow-blade', { activationCount: 1, generated: 1, reflectedProjectiles: 1 }, true); this.showCombatLabel(projectile.x, projectile.y - 16, '역류 칼날', 0x7ee8db);
      }
    }
  }

  private applyEchoHarvest(time: number): void {
    const stacks = this.upgrades.getStack('echo-harvest'); if (stacks <= 0) return;
    if (time - this.echoHarvestWindowStartedAt >= 1000) { this.echoHarvestWindowStartedAt = time; this.echoHarvestWindowGain = 0; }
    const gained = echoHarvestGain(stacks, this.echoHarvestWindowGain); if (gained <= 0) return;
    this.echoHarvestWindowGain += gained; this.gainSentence(gained);
    this.recordUpgradeContribution('echo-harvest', { activationCount: 1, sentence: gained }, true);
  }

  private triggerMoonRingResonance(): void {
    const radius = this.currentEchoBladeProfile().range + 18;
    const ring = this.add.circle(this.hero.hurtbox.x, this.hero.hurtbox.y, 18, 0x6fd8c5, 0.05).setStrokeStyle(3, 0xa5f1df, 0.72).setDepth(DEPTH.word);
    this.tweens.add({ targets: ring, radius, alpha: 0, duration: 230, onComplete: () => ring.destroy() });
    let damage = 0; let targets = 0;
    for (const enemy of [...this.enemies].filter((item) => item.active && !item.removing && distanceToEllipse(this.hero.hurtbox, item.hurtbox) <= radius).slice(0, 3)) {
      const dealt = this.damageEnemy(enemy, 7, Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y), false, true, undefined, 'attack');
      if (dealt > 0) { damage += dealt; targets += 1; }
    }
    this.recordResonanceContribution('moon-ring', { activationCount: 1, damage, affectedTargets: targets, hits: targets, exclusiveDamage: true });
    this.services.ui.showChainTrigger('공명 · 월환 공명', 650);
  }

  private useCut(angle: number): boolean {
    if (!this.weaponCooldowns.canCut(this.time.now)) return false;
    this.comboTarget = undefined; this.currentTarget = undefined; this.heldAttackTarget = undefined; this.targetMarkerUntil = 0;
    const started = this.startAttackCombo(Math.cos(angle), Math.sin(angle), 1, 0, 'cut');
    if (!started) return false;
    this.cutPerfectCounterActive = this.time.now <= this.perfectCounterUntil;
    if (this.cutPerfectCounterActive) this.perfectCounterUntil = 0;
    this.weaponCooldowns.commitCut(this.time.now, BALANCE.hero.cut.cooldown);
    this.combatStats.cutUse(); this.services.audio.play('cut');
    return true;
  }

  private resolveCut(attack: HeroAttack): void {
    this.combatStats.attackAttempt(); this.lastAttackAt = performance.now();
    const perfectCounter = perfectCounterProfile(this.upgrades.getStack('perfect-counter'));
    const counterActive = this.cutPerfectCounterActive;
    const profile = { ...BALANCE.hero.cut, range: BALANCE.hero.cut.range * (counterActive ? perfectCounter.rangeMultiplier : 1) };
    const slash = this.add.graphics().setDepth(DEPTH.melee);
    slash.lineStyle(12, 0x143d37, 0.68).beginPath().arc(attack.originX, attack.originY, profile.range, attack.angle - profile.halfAngle, attack.angle + profile.halfAngle).strokePath();
    slash.lineStyle(6, 0xb5f6e8, 0.96).beginPath().arc(attack.originX, attack.originY, profile.range, attack.angle - profile.halfAngle, attack.angle + profile.halfAngle).strokePath();
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.12, scaleY: 1.12, duration: 175, onComplete: () => slash.destroy() });
    this.activeDaggerDebug = { x: attack.originX, y: attack.originY, angle: attack.angle, range: profile.range, until: this.time.now + 105 };
    const candidates = [...this.enemies].filter((enemy) => enemy.active && enemy.spawned && !enemy.removing
      && cutHitsTarget({ x: attack.originX, y: attack.originY }, attack.angle, profile, enemy.hurtbox))
      .sort((first, second) => distanceToEllipse({ x: attack.originX, y: attack.originY }, first.hurtbox) - distanceToEllipse({ x: attack.originX, y: attack.originY }, second.hurtbox))
      .slice(0, profile.maximumTargets);
    let totalDamage = 0;
    let directCutDamage = 0;
    let hitCount = 0;
    let counterCutActivated = false;
    for (const enemy of candidates) {
      if (!this.attackRegistry.claim(attack.attackId, enemy.id)) continue;
      const compressed = this.wordStatuses.has(enemy.id, 'COMPRESSED', this.time.now) || this.wordStatuses.has(enemy.id, 'PULLED', this.time.now);
      const marked = this.wordStatuses.has(enemy.id, 'MARKED', this.time.now);
      const displaced = this.wordStatuses.has(enemy.id, 'DISPLACED', this.time.now);
      const states = { stopped: enemy.isStopped, linked: enemy.linked, echo: enemy.isEchoMarked, exposed: enemy.vulnerableUntil > this.time.now, compressed, marked, displaced };
      let damage = profile.damage * cutDamageMultiplier(states, profile);
      if (compressed) damage += profile.damage * .42;
      if (marked) damage += profile.damage * .24;
      if (displaced) damage += profile.damage * .16;
      if (counterActive && (states.stopped || states.linked)) damage += perfectCounter.ruptureBonus;
      if (counterActive && this.upgrades.hasResonance('counter-cut') && !states.stopped && !states.linked) damage += 10;
      const fang = this.upgrades.getStack('dragon-fang'); if (fang > 0 && Math.random() < Math.min(0.55, fang * 0.22)) damage *= 1.75;
      if (this.regressionCharged) { damage *= 1 + this.upgrades.getStack('regression-blade') * 0.55; this.regressionCharged = false; }
      const pursuit = this.upgrades.getStack('pursuit-mark');
      if (enemy.id === this.lastPursuitId) this.pursuitCount = Math.min(5, this.pursuitCount + 1); else { this.lastPursuitId = enemy.id; this.pursuitCount = 0; }
      damage *= 1 + pursuit * this.pursuitCount * 0.08;
      const dealt = this.damageEnemy(enemy, damage, attack.angle, false, false, 'attack', 'attack', 'cut');
      if (dealt <= 0) continue;
      const hasReactionState = states.stopped || states.linked || states.echo || states.exposed || compressed || marked || displaced;
      const directPart = hasReactionState ? Math.min(dealt, profile.damage) : dealt;
      const reactionPart = Math.max(0, dealt - directPart);
      directCutDamage += directPart;
      if (reactionPart > 0) this.combatStats.reactionDamage(states.stopped ? 'cut-stopped' : states.linked ? 'cut-linked' : marked ? 'cut-marked' : 'cut-displaced', reactionPart);
      const cutLabel = states.stopped ? '절단 파열 ' : states.linked ? '연결 절단 ' : compressed ? '압축 절단 ' : marked ? '각인 절단 ' : displaced ? '충돌 절단 ' : '절단 ';
      totalDamage += dealt; hitCount += 1; this.combatStats.cutHit(dealt, states); this.damageNumber(enemy.x, enemy.y - 52, dealt, hasReactionState ? 0x9cf1df : 0xf1d7a8, false, cutLabel);
      const body = enemy.body as Phaser.Physics.Arcade.Body; body.velocity.add(new Phaser.Math.Vector2(Math.cos(attack.angle), Math.sin(attack.angle)).scale(profile.knockback));
      if (states.stopped) this.resolveCutStopped(enemy, attack.angle);
      if (states.linked) this.resolveCutLinked(enemy, attack.angle);
      if (states.echo) this.resolveCutEcho(enemy, attack.angle, dealt);
      if (compressed) this.resolveCutCompressed(enemy, attack.angle);
      if (states.exposed) this.showCombatLabel(enemy.x, enemy.y - 68, '반격 절단', 0xb9f5e9);
      if (counterActive) this.recordUpgradeContribution('perfect-counter', { activationCount: 0, damage: Math.min(dealt, perfectCounter.ruptureBonus), hits: 1 }, true);
      if (counterActive && this.upgrades.hasResonance('counter-cut')) {
        this.recordResonanceContribution('counter-cut', {
          activationCount: counterCutActivated ? 0 : 1,
          damage: Math.min(dealt, states.stopped || states.linked ? perfectCounter.ruptureBonus : 10),
          affectedTargets: 1,
          hits: 1,
        });
        counterCutActivated = true;
      }
      const cutSentence = this.upgrades.getStack('cut-sentence');
      if ((states.stopped || states.linked) && cutSentence > 0 && enemy.active) {
        const bonus = this.damageEnemy(enemy, cutSentenceBonus(states.stopped, states.linked, cutSentence), attack.angle, false, true, undefined, 'attack');
        if (bonus > 0) { totalDamage += bonus; this.combatStats.reactionDamage(states.stopped ? 'cut-stopped' : 'cut-linked', bonus); this.recordUpgradeContribution('cut-sentence', { activationCount: 1, damage: bonus, affectedTargets: 1, hits: 1 }, true); this.showCombatLabel(enemy.x, enemy.y - 76, '절단 문장', 0x8ff1df); }
      }
      const brokenSentence = this.upgrades.getStack('broken-sentence');
      if (states.stopped && brokenSentence > 0 && enemy.active) {
        const bonus = this.damageEnemy(enemy, 12 * brokenSentence, attack.angle, false, true, undefined, 'stop');
        if (bonus > 0) { totalDamage += bonus; this.combatStats.reactionDamage('cut-stopped', bonus); this.recordUpgradeContribution('broken-sentence', { damage: bonus }); }
      }
      const rhythm = this.upgrades.getStack('dragon-rhythm');
      if ((states.stopped || states.linked || states.echo || states.exposed) && rhythm > 0) {
        this.gainSentence(4 * rhythm); this.reduceShortestWordCooldown(500 * rhythm); this.recordUpgradeContribution('dragon-rhythm', { activationCount: 1, sentence: 4 * rhythm, cooldownMs: 500 * rhythm });
      }
    }
    const dashWaveDamage = this.resolveRuptureStep(attack);
    totalDamage += dashWaveDamage;
    for (const projectile of [...this.projectiles]) {
      if (!projectile.active || !projectile.enemyOwned || projectile.frozenUntil <= this.time.now) continue;
      const circle = projectile.collisionCircle;
      if (!cutHitsTarget({ x: attack.originX, y: attack.originY }, attack.angle, profile, { x: circle.x, y: circle.y, radiusX: circle.radius, radiusY: circle.radius })) continue;
      const target = this.nearestEnemy(projectile.x, projectile.y); if (!target) continue;
      projectile.setData('cutReflected', true); projectile.reflect(target.x, target.y); this.combatStats.cutProjectile(); this.showCombatLabel(projectile.x, projectile.y - 16, '탄환 절단', 0xa3f6e7);
    }
    this.attacks.push({ time: this.time.now, x: attack.originX, y: attack.originY, angle: attack.angle, kind: 'cut', damage: totalDamage });
    if (totalDamage > 0) {
      this.combatStats.attackHit(hitCount); this.combatStats.agencyMilestone('manualHit', this.elapsedSeconds()); this.combatStats.agencyDamage('basicJ', directCutDamage);
      this.gainSentence(profile.sentenceGain); this.services.audio.play('cutHit'); this.timeControl.requestHitstop(this.timeOwner, this.services.save.settings.reducedMotion ? 24 : profile.hitstop); this.cameraKick(0.0018, 55);
    }
    this.cutPerfectCounterActive = false;
    this.markTutorial('attack');
  }

  private resolveRuptureStep(attack: HeroAttack): number {
    const stacks = this.upgrades.getStack('rupture-step');
    const profile = ruptureStepProfile(stacks, this.time.now - this.lastDashAt);
    if (!profile.active) return 0;
    this.lastDashAt = Number.NEGATIVE_INFINITY;
    const endX = attack.originX + Math.cos(attack.angle) * profile.range;
    const endY = attack.originY + Math.sin(attack.angle) * profile.range;
    const wave = this.add.rectangle(attack.originX, attack.originY, profile.range, 13, 0x77d8c4, 0.42).setOrigin(0, .5).setRotation(attack.angle).setDepth(DEPTH.melee);
    this.tweens.add({ targets: wave, x: endX, y: endY, alpha: 0, duration: 190, onComplete: () => wave.destroy() });
    let damage = 0; let affectedTargets = 0;
    for (const enemy of [...this.enemies].filter((item) => item.active && !item.removing)) {
      if (!sectorHitsEllipse({ x: attack.originX, y: attack.originY, angle: attack.angle, range: profile.range, halfAngle: .38 }, enemy.hurtbox)) continue;
      const dealt = this.damageEnemy(enemy, profile.damage, attack.angle, false, true, undefined, 'attack');
      if (dealt > 0) { damage += dealt; affectedTargets += 1; }
    }
    if (damage > 0) this.recordUpgradeContribution('rupture-step', { activationCount: 1, damage, affectedTargets, hits: affectedTargets }, true);
    return damage;
  }

  private resolveCutStopped(primary: Enemy, angle: number): void {
    primary.consumeStopped(this.time.now);
    const burst = this.add.circle(primary.x, primary.y - 12, 12, 0x72d8c5, 0.14).setStrokeStyle(4, 0xa2f5e5, 0.86).setDepth(DEPTH.word);
    this.tweens.add({ targets: burst, radius: BALANCE.hero.cut.stoppedBurstRadius, alpha: 0, duration: 230, onComplete: () => burst.destroy() });
    for (const enemy of [...this.enemies]) {
      if (enemy === primary || !enemy.active || enemy.removing || distanceSq(primary.x, primary.y, enemy.x, enemy.y) > BALANCE.hero.cut.stoppedBurstRadius ** 2) continue;
      this.damageEnemy(enemy, BALANCE.hero.cut.stoppedBurstDamage, angle, false, true, undefined, 'stop');
    }
  }

  private resolveCutLinked(primary: Enemy, angle: number): void {
    const targets = [...this.linkedTargets].filter((enemy) => enemy !== primary && enemy.active && enemy.linked);
    const counterStacks = this.time.now <= Number(primary.getData('counterMarkedUntil') ?? 0) ? this.upgrades.getStack('linked-counter') : 0;
    for (const target of targets) {
      this.linkPulse(primary, target, 0xa8f5e5);
      const dealt = this.damageEnemy(target, BALANCE.hero.cut.linkedReactionDamage * (1 + counterStacks * 0.18), angle, false, true, undefined, 'link');
      if (counterStacks > 0 && dealt > 0) this.recordUpgradeContribution('linked-counter', { damage: dealt });
    }
  }

  private resolveCutEcho(primary: Enemy, angle: number, damage: number): void {
    const x = primary.x; const y = primary.y;
    this.runDelayedCall(90, () => {
      const slash = this.add.graphics().setDepth(DEPTH.word).lineStyle(4, 0x67cbea, 0.76)
        .beginPath().arc(x, y - 10, 58, angle - 0.9, angle + 0.9).strokePath();
      this.tweens.add({ targets: slash, alpha: 0, duration: 150, onComplete: () => slash.destroy() });
      if (primary.active && !primary.removing) this.damageEnemy(primary, damage * BALANCE.hero.cut.echoReplayRatio, angle, false, true, undefined, 'rewind');
    });
  }

  private resolveCutCompressed(primary: Enemy, angle: number): void {
    this.wordStatuses.consume(primary.id, 'PULLED'); this.wordStatuses.consume(primary.id, 'COMPRESSED');
    for (const enemy of [...this.enemies]) {
      if (enemy === primary || !enemy.active || enemy.removing || distanceSq(primary.x, primary.y, enemy.x, enemy.y) > 62 ** 2) continue;
      this.damageEnemy(enemy, 8, angle, false, true, undefined, 'word', 'none', { handler: `cut-compressed:${primary.id}:${enemy.id}`, baseSource: 'cut', skillId: 'cut-compressed', damageKind: 'reaction', flags: ['echoDerived', 'cannotTriggerShare', 'cannotTriggerCard', 'cannotTriggerResonance'], onApplied: (dealt) => this.combatStats.reactionDamage('cut-displaced', dealt) });
    }
  }

  private updateDefensiveSlash(time: number): void {
    if (!this.defensiveSlashEnabled || time < this.nextDefensiveSlashAt || this.hero.controlsLocked || this.hero.rewinding || this.hero.isDashing || this.hero.isComboActive || this.hero.isParrying) return;
    const selected = selectDefensiveSlashTarget(this.hero.hurtbox, [...this.enemies].map((enemy) => ({
      id: enemy.id,
      hurtbox: enemy.hurtbox,
      alive: enemy.active && enemy.spawned && enemy.health > 0 && !enemy.removing,
      visible: enemy.x >= 0 && enemy.x <= 960 && enemy.y >= 0 && enemy.y <= 540,
      attackable: !enemy.removing,
      insideCombatBounds: groundFootprintInsideBounds(enemy.groundPoint, enemyGroundExtents(enemy.kind), COMBAT_BOUNDS),
    })), BALANCE.hero.defensiveSlash.range);
    if (!selected) return;
    const target = [...this.enemies].find((enemy) => enemy.id === selected.id && enemy.active && !enemy.removing); if (!target) return;
    this.nextDefensiveSlashAt = time + BALANCE.hero.defensiveSlash.interval;
    this.combatStats.defensiveSlashAttempt();
    const angle = Phaser.Math.Angle.Between(this.hero.hurtbox.x, this.hero.hurtbox.y, target.hurtbox.x, target.hurtbox.y);
    const originX = this.hero.x + Math.cos(angle) * 11; const originY = this.hero.y + Math.sin(angle) * 11;
    const attackId = this.defensiveSlashSequence += 1;
    if (!this.attackRegistry.claim(attackId, target.id)) return;
    const slash = this.add.graphics().setDepth(DEPTH.melee);
    slash.lineStyle(3, 0xc9e3d8, 0.62).beginPath().arc(originX, originY, BALANCE.hero.defensiveSlash.range, angle - BALANCE.hero.defensiveSlash.halfAngle, angle + BALANCE.hero.defensiveSlash.halfAngle).strokePath();
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.07, scaleY: 1.07, duration: 95, onComplete: () => slash.destroy() });
    const dealt = this.damageEnemy(target, BALANCE.hero.defensiveSlash.damage, angle, false, false, 'attack', 'attack');
    this.attacks.push({ time, x: originX, y: originY, angle, kind: 'guard', damage: dealt });
    if (dealt <= 0) return;
    this.lastDirectTargetId = target.id;
    this.combatStats.defensiveSlashHit(dealt); this.combatStats.agencyDamage('automatic', dealt); this.gainSentence(BALANCE.hero.defensiveSlash.sentenceGain); this.services.audio.play('guardSlash'); this.markTutorial('attack');
    const body = target.body as Phaser.Physics.Arcade.Body; body.velocity.add(new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle)).scale(BALANCE.hero.defensiveSlash.knockback));
  }

  private resolveFinisher(attack: HeroAttack): void {
    this.combatStats.attackAttempt(); this.lastAttackAt = performance.now();
    const slash = this.add.graphics().setDepth(DEPTH.melee);
    const range = BALANCE.hero.finisher.range;
    slash.lineStyle(13, 0x123d38, 0.72).beginPath().arc(attack.originX, attack.originY, range, attack.angle - BALANCE.hero.finisher.halfAngle, attack.angle + BALANCE.hero.finisher.halfAngle).strokePath();
    slash.lineStyle(7, 0xaaffed, 0.96).beginPath().arc(attack.originX, attack.originY, range, attack.angle - BALANCE.hero.finisher.halfAngle, attack.angle + BALANCE.hero.finisher.halfAngle).strokePath();
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.16, scaleY: 1.16, duration: 175, onComplete: () => slash.destroy() });
    this.activeDaggerDebug = { x: attack.originX, y: attack.originY, angle: attack.angle, range, until: this.time.now + 110 };
    const candidates = [...this.enemies].filter((enemy) => enemy.active && enemy.spawned && !enemy.removing
      && sectorHitsEllipse({ x: attack.originX, y: attack.originY, angle: attack.angle, range, halfAngle: BALANCE.hero.finisher.halfAngle }, enemy.hurtbox));
    candidates.sort((first, second) => {
      if (first === this.comboTarget) return -1; if (second === this.comboTarget) return 1;
      return distanceSq(attack.originX, attack.originY, first.hurtbox.x, first.hurtbox.y) - distanceSq(attack.originX, attack.originY, second.hurtbox.x, second.hurtbox.y);
    });
    const enemy = candidates[0];
    if (!enemy || !this.attackRegistry.claim(attack.attackId, enemy.id)) return;
    const status = finisherStatusFor({ stopped: enemy.isStopped, linked: enemy.linked, echo: enemy.isEchoMarked || this.time.now < this.echoFinisherUntil });
    const profile = finisherProfile(status, { stopped: BALANCE.hero.finisher.stoppedMultiplier, linked: BALANCE.hero.finisher.linkedMultiplier, echo: BALANCE.hero.finisher.echoMultiplier });
    let damage = BALANCE.hero.finisher.damage * profile.damageMultiplier;
    const fang = this.upgrades.getStack('dragon-fang'); if (fang > 0 && Math.random() < Math.min(0.55, fang * 0.22)) damage *= 1.75;
    if (this.regressionCharged) { damage *= 1 + this.upgrades.getStack('regression-blade') * 0.55; this.regressionCharged = false; }
    const pursuit = this.upgrades.getStack('pursuit-mark');
    if (enemy.id === this.lastPursuitId) this.pursuitCount = Math.min(5, this.pursuitCount + 1); else { this.lastPursuitId = enemy.id; this.pursuitCount = 0; }
    damage *= 1 + pursuit * this.pursuitCount * 0.08;
    if (status === 'stopped') damage += this.upgrades.getStack('broken-sentence') * 12;
    if (this.time.now <= this.parryCounterUntil) { damage *= BALANCE.hero.parryCounterBonus; this.parryCounterUntil = 0; }
    const dealt = this.damageEnemy(enemy, damage, attack.angle, false, false, 'attack', 'attack');
    this.attacks.push({ time: this.time.now, x: attack.originX, y: attack.originY, angle: attack.angle, kind: 'finisher', damage: dealt });
    this.lastDirectTargetId = enemy.id;
    if (dealt <= 0) return;
    this.combatStats.attackHit(); this.combatStats.finisherHit(dealt, status); this.runeBurst(enemy.x, enemy.y - 16, 12); this.damageNumber(enemy.x, enemy.y - 62, dealt, 0xaaffed, false, '결문 ');
    const body = enemy.body as Phaser.Physics.Arcade.Body; body.velocity.add(new Phaser.Math.Vector2(Math.cos(attack.angle), Math.sin(attack.angle)).scale(BALANCE.hero.finisher.knockback));
    if (profile.burstsStoppedArea) this.resolveStoppedFinisher(enemy, attack.angle);
    if (profile.reactsThroughLinks) this.resolveLinkedFinisher(enemy, attack.angle);
    if (profile.replaysEcho) this.resolveEchoFinisher(enemy, attack.angle, dealt);
    const rhythm = this.upgrades.getStack('dragon-rhythm');
    if (rhythm > 0) { this.gainSentence(4 * rhythm); this.reduceShortestWordCooldown(500 * rhythm); this.recordUpgradeContribution('dragon-rhythm', { sentence: 4 * rhythm, cooldownMs: 500 * rhythm }); }
    this.services.audio.play('hit'); this.cameraKick(0.004, 85);
    this.timeControl.requestHitstop(this.timeOwner, this.services.save.settings.reducedMotion ? 30 : BALANCE.hero.finisher.hitstop);
  }

  private resolveStoppedFinisher(target: Enemy, angle: number): void {
    target.consumeStopped(this.time.now); this.showWordTypography('정지 파열', target.x, target.y - 56); this.runeBurst(target.x, target.y - 8, 16);
    for (const enemy of [...this.enemies]) {
      if (enemy === target || !enemy.active || enemy.removing || distanceSq(target.x, target.y, enemy.x, enemy.y) > BALANCE.hero.finisher.stoppedBurstRadius ** 2) continue;
      this.damageEnemy(enemy, BALANCE.hero.finisher.stoppedBurstDamage, angle, false, true, undefined, 'stop');
    }
    for (const projectile of [...this.projectiles]) {
      if (!projectile.active || !projectile.enemyOwned || projectile.frozenUntil <= this.time.now || distanceSq(target.x, target.y, projectile.x, projectile.y) > BALANCE.hero.finisher.stoppedBurstRadius ** 2) continue;
      const enemy = this.nearestEnemy(projectile.x, projectile.y); if (enemy) projectile.reflect(enemy.x, enemy.y, 22); else projectile.destroy();
    }
  }

  private resolveLinkedFinisher(target: Enemy, angle: number): void {
    this.showWordTypography('연결 폭발', target.x, target.y - 56);
    const counterStacks = this.time.now <= Number(target.getData('counterMarkedUntil') ?? 0) ? this.upgrades.getStack('linked-counter') : 0;
    const amount = BALANCE.hero.finisher.damage * (BALANCE.hero.finisher.linkedReactionRatio + counterStacks * 0.18);
    for (const linked of [...this.linkedTargets]) {
      if (linked === target || !linked.active || !linked.linked) continue;
      this.linkPulse(target, linked, 0xa8ffec); this.damageEnemy(linked, amount, angle, false, true, undefined, 'link');
    }
  }

  private resolveEchoFinisher(target: Enemy, angle: number, dealt: number): void {
    this.echoFinisherUntil = 0; target.echoUntil = 0; this.showWordTypography('잔향 재현', target.x, target.y - 56);
    this.runDelayedCall(150, () => {
      if (!target.active || target.removing) return;
      const echo = this.add.image(target.x - Math.cos(angle) * 34, target.y, 'hero-attack').setOrigin(0.5, 1).setScale(0.4).setFlipX(Math.cos(angle) < 0).setTint(0x55c7e6).setAlpha(0.52).setDepth(DEPTH.rewind);
      this.tweens.add({ targets: echo, x: target.x, alpha: 0, duration: 210, onComplete: () => echo.destroy() });
      this.damageEnemy(target, dealt * BALANCE.hero.finisher.echoReplayRatio, angle, false, true, undefined, 'rewind');
    });
  }

  private gainFinisherCharge(source: FinisherChargeSource, amount = 1): number {
    const gained = this.finisherCharges.gain(amount); if (gained <= 0) return 0;
    this.combatStats.finisherCharge(source, gained); this.services.audio.play('sealGain');
    this.runeBurst(this.hero.x, this.hero.y - 18, 6 + gained * 2); return gained;
  }

  private reduceShortestWordCooldown(milliseconds: number): void {
    const now = this.time.now;
    const cooldowns = [this.stopReadyAt, this.rewindReadyAt, this.linkReadyAt];
    let index = -1; let remaining = Number.POSITIVE_INFINITY;
    cooldowns.forEach((readyAt, itemIndex) => { const value = Math.max(0, readyAt - now); if (value > 0 && value < remaining) { remaining = value; index = itemIndex; } });
    if (index === 0) this.stopReadyAt = Math.max(now, this.stopReadyAt - milliseconds);
    if (index === 1) this.rewindReadyAt = Math.max(now, this.rewindReadyAt - milliseconds);
    if (index === 2) this.linkReadyAt = Math.max(now, this.linkReadyAt - milliseconds);
  }

  private attackWithSoftTarget(): boolean {
    const facing = this.targeting.lastDirection;
    const maximumRange = Math.max(...BALANCE.hero.attackRange) + 8;
    const selection = this.targeting.selectHeld(this.hero.groundPoint, this.targetingCandidates(), this.heldAttackTarget?.id, {
      range: maximumRange,
      assistRange: maximumRange,
      emergencyDistance: BALANCE.targeting.emergencyDistance,
      attackOriginOffset: BALANCE.hero.attackOriginOffset,
    });
    const target = this.enemyForSelection(selection);
    if (selection && target) this.targetDistance = selection.hurtboxDistance;
    let direction = facing;
    if (target) {
      direction = selection?.direction ?? facing;
      this.heldAttackTarget = target; this.comboTarget = target; this.currentTarget = target; this.targetMarkerUntil = Number.POSITIVE_INFINITY;
    } else {
      this.heldAttackTarget = undefined; this.comboTarget = undefined; this.combatStats.noTarget();
    }
    return this.startAttackCombo(direction.x, direction.y, 3, 0);
  }

  private attackDirection(angle: number): boolean {
    this.comboTarget = undefined;
    return this.startAttackCombo(Math.cos(angle), Math.sin(angle), 3, 0);
  }

  private startAttackCombo(directionX: number, directionY: number, strikes: 1 | 3, lungeDistance: number, style: HeroAttack['style'] = 'legacy'): boolean {
    const lockedTarget = this.comboTarget;
    if (strikes === 3) this.currentComboDamage = 0;
    const started = this.hero.startCombo(directionX, directionY, strikes, (attack) => style === 'finisher' ? this.resolveFinisher(attack) : style === 'cut' ? this.resolveCut(attack) : this.resolveAttack(attack), (cancelled) => {
      if (!cancelled && strikes === 3) { this.combatStats.comboFinish(); this.combatStats.comboDamage(this.currentComboDamage); }
      if (this.comboTarget && this.comboLock.targetId && this.comboTarget.id !== this.comboLock.targetId) this.combatStats.comboTargetChanged();
      this.comboTarget = undefined;
      this.comboLock.clear();
      this.nextHeldComboAt = style === 'cut'
        ? Math.max(this.time.now, this.hero.lastAttackAt + BALANCE.hero.cut.cooldown)
        : this.time.now + BALANCE.hero.basicAttack.holdRepeatDelay;
      if (this.attackInput.isHeld && this.heldAttackTarget?.active && !this.heldAttackTarget.removing) {
        this.currentTarget = this.heldAttackTarget; this.targetMarkerUntil = Number.POSITIVE_INFINITY;
      } else { this.currentTarget = undefined; this.targetMarkerUntil = 0; }
    }, lungeDistance, style);
    if (started) {
      this.comboLock.begin(lockedTarget?.id, { x: directionX, y: directionY });
      if (strikes === 3) this.combatStats.comboStarted();
      this.markTutorial(style === 'finisher' ? 'finisher' : 'attack');
    }
    return started;
  }

  private resolveAttack(attack: HeroAttack): void {
    this.combatStats.attackAttempt(); this.lastAttackAt = performance.now();
    const index = attack.combo - 1;
    const chargedThird = attack.combo === 3 && this.finisherCharges.ready;
    const baseDamage = chargedThird ? BALANCE.hero.finisher.damage : BALANCE.hero.attackDamage[index] ?? 9;
    const range = chargedThird ? BALANCE.hero.finisher.range : BALANCE.hero.attackRange[index] ?? 60;
    const halfAngle = chargedThird ? BALANCE.hero.finisher.halfAngle : BALANCE.collision.daggerHalfAngle;
    this.services.audio.play(chargedThird ? 'finisher' : attack.combo === 1 ? 'slash1' : attack.combo === 2 ? 'slash2' : 'slash3');
    if (chargedThird) this.combatStats.finisherInput();
    const slash = this.add.graphics().setDepth(DEPTH.melee);
    if (chargedThird) slash.lineStyle(13, 0x123d38, 0.7).beginPath().arc(attack.originX, attack.originY, range, attack.angle - halfAngle, attack.angle + halfAngle).strokePath();
    slash.lineStyle(chargedThird ? 7 : attack.combo === 3 ? 9 : 6, chargedThird ? 0xaaffed : attack.combo === 3 ? 0xb9fff1 : 0xd9c49e, chargedThird ? 0.98 : 0.85);
    if (attack.combo === 2 && !chargedThird) slash.beginPath().arc(attack.originX, attack.originY, range, attack.angle + halfAngle, attack.angle - halfAngle, true).strokePath();
    else slash.beginPath().arc(attack.originX, attack.originY, range, attack.angle - halfAngle, attack.angle + halfAngle).strokePath();
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.18, scaleY: 1.18, duration: 130, onComplete: () => slash.destroy() });
    this.activeDaggerDebug = { x: attack.originX, y: attack.originY, angle: attack.angle, range, until: this.time.now + 90 };
    this.attacks.push({ time: this.time.now, x: attack.originX, y: attack.originY, angle: attack.angle, kind: chargedThird ? 'finisher' : 'legacy', damage: baseDamage });
    let hits = 0;
    let totalAttackDamage = 0;
    let chargedHit = false;
    let chargedPrimary: Enemy | undefined;
    let chargedPrimaryDamage = 0;
    const parryCounter = this.time.now <= this.parryCounterUntil;
    const hitCandidates = [...this.enemies].filter((enemy) => enemy.spawned && !enemy.removing
      && sectorHitsEllipse({ x: attack.originX, y: attack.originY, angle: attack.angle, range, halfAngle }, enemy.hurtbox));
    hitCandidates.sort((first, second) => {
      if (first === this.comboTarget) return -1; if (second === this.comboTarget) return 1;
      return distanceSq(attack.originX, attack.originY, first.hurtbox.x, first.hurtbox.y) - distanceSq(attack.originX, attack.originY, second.hurtbox.x, second.hurtbox.y);
    });
    const maximumTargets = 1 + BALANCE.hero.maximumSecondaryTargets;
    for (const [targetIndex, enemy] of hitCandidates.slice(0, maximumTargets).entries()) {
      if (!this.attackRegistry.claim(attack.attackId, enemy.id)) continue;
      let damage = baseDamage * attackTargetMultiplier(targetIndex, BALANCE.hero.secondaryTargetDamageMultiplier, BALANCE.hero.maximumSecondaryTargets);
      const status = chargedThird ? finisherStatusFor({ stopped: enemy.isStopped, linked: enemy.linked, echo: enemy.isEchoMarked || this.time.now < this.echoFinisherUntil }) : 'normal';
      if (chargedThird && targetIndex === 0) damage *= finisherProfile(status, { stopped: BALANCE.hero.finisher.stoppedMultiplier, linked: BALANCE.hero.finisher.linkedMultiplier, echo: BALANCE.hero.finisher.echoMultiplier }).damageMultiplier;
      const fang = this.upgrades.getStack('dragon-fang');
      if (attack.combo === 3 && Math.random() < fang * 0.22) damage *= 1.75;
      if (this.regressionCharged) { damage *= 1 + this.upgrades.getStack('regression-blade') * 0.55; this.regressionCharged = false; }
      const pursuit = this.upgrades.getStack('pursuit-mark');
      if (enemy.id === this.lastPursuitId) this.pursuitCount = Math.min(5, this.pursuitCount + 1); else { this.lastPursuitId = enemy.id; this.pursuitCount = 0; }
      damage *= 1 + pursuit * this.pursuitCount * 0.08;
      if (enemy.frozenUntil > this.time.now) damage += this.upgrades.getStack('broken-sentence') * 12;
      if (parryCounter) damage *= BALANCE.hero.parryCounterBonus;
      const dealt = this.damageEnemy(enemy, damage, attack.angle, false, false, 'attack', 'attack');
      this.currentComboDamage += dealt; totalAttackDamage += dealt; hits += dealt > 0 ? 1 : 0;
      if (chargedThird && targetIndex === 0 && dealt > 0) { chargedHit = true; chargedPrimary = enemy; chargedPrimaryDamage = dealt; }
      if (attack.combo === 3) {
        const body = enemy.body as Phaser.Physics.Arcade.Body; body.velocity.add(new Phaser.Math.Vector2(Math.cos(attack.angle), Math.sin(attack.angle)).scale(120));
      }
    }
    for (const projectile of [...this.projectiles]) {
      if (!projectile.enemyOwned || projectile.frozenUntil <= this.time.now) continue;
      const circle = projectile.collisionCircle;
      if (sectorHitsEllipse({ x: attack.originX, y: attack.originY, angle: attack.angle, range, halfAngle }, { x: circle.x, y: circle.y, radiusX: circle.radius, radiusY: circle.radius })) {
        const target = this.nearestEnemy(projectile.x, projectile.y); if (target) projectile.reflect(target.x, target.y);
      }
    }
    if (hits > 0) {
      this.combatStats.agencyMilestone('manualHit', this.elapsedSeconds());
      this.combatStats.agencyDamage(chargedThird ? 'enhancedJ' : 'basicJ', totalAttackDamage);
      this.combatStats.attackHit(hits);
      this.combatStats.attackStepHit(attack.combo as 1 | 2 | 3, hits);
      if (parryCounter) { this.parryCounterUntil = 0; this.runeBurst(attack.originX + Math.cos(attack.angle) * 28, attack.originY + Math.sin(attack.angle) * 28, 6); }
      this.gainSentence(BALANCE.sentence.hitGain * hits + (attack.combo === 3 ? BALANCE.sentence.thirdHitGain : 0)); this.services.audio.play(chargedHit ? 'finisher' : 'hit');
      if (chargedHit && chargedPrimary && this.finisherCharges.spend()) {
        this.combatStats.agencyMilestone('enhancedThird', this.elapsedSeconds());
        this.combatStats.finisherUse();
        const status = finisherStatusFor({ stopped: chargedPrimary.isStopped, linked: chargedPrimary.linked, echo: chargedPrimary.isEchoMarked || this.time.now < this.echoFinisherUntil });
        this.combatStats.finisherHit(chargedPrimaryDamage, status); this.showCombatLabel(chargedPrimary.x, chargedPrimary.y - 68, '결문 베기', 0xaaffed); this.runeBurst(chargedPrimary.x, chargedPrimary.y - 16, 12); this.markTutorial('finisher');
        if (status === 'stopped') this.resolveStoppedFinisher(chargedPrimary, attack.angle);
        if (status === 'linked') this.resolveLinkedFinisher(chargedPrimary, attack.angle);
        if (status === 'echo') this.resolveEchoFinisher(chargedPrimary, attack.angle, chargedPrimaryDamage);
        const rhythm = this.upgrades.getStack('dragon-rhythm'); if (rhythm > 0) { this.gainSentence(4 * rhythm); this.reduceShortestWordCooldown(500 * rhythm); this.recordUpgradeContribution('dragon-rhythm', { sentence: 4 * rhythm, cooldownMs: 500 * rhythm }); }
        this.timeControl.requestHitstop(this.timeOwner, this.services.save.settings.reducedMotion ? 30 : BALANCE.hero.finisher.hitstop);
      }
      if (attack.combo === 3) this.cameraKick(0.0026, 60);
    } else {
      if (chargedThird) this.combatStats.finisherMiss();
      if (this.comboTarget?.active) {
      const distance = this.targeting.distanceToCandidate({ x: attack.originX, y: attack.originY }, this.targetCandidate(this.comboTarget));
      if (distance <= range + 4) this.combatStats.nearbyMiss();
      }
    }
  }

  private dash(x: number, y: number): boolean {
    if (!this.hero.dash(x, y, (trailX, trailY) => this.resolveDashTrail(trailX, trailY))) return false;
    this.lastDashAt = this.time.now;
    this.combatStats.dash(); this.markTutorial('dash'); this.services.audio.play('dash');
    return true;
  }

  private resolveDashTrail(x: number, y: number): void {
    const stacks = this.upgrades.getStack('afterimage-slash'); if (stacks <= 0) return;
    const rune = this.add.rectangle(x, y, 96, 8, 0x61cfbd, 0.5).setRotation(this.hero.facing).setDepth(DEPTH.floor);
    this.runDelayedCall(190, () => {
      let damage = 0;
      for (const enemy of [...this.enemies]) if (distanceSq(x, y, enemy.x, enemy.y) < 86 * 86) damage += this.damageEnemy(enemy, 18 * (0.45 + (stacks - 1) * 0.18), this.hero.facing, false, false, undefined, 'attack');
      if (damage > 0) { this.recordUpgradeContribution('afterimage-slash', { activationCount: 1, damage }); this.showCombatLabel(x, y - 30, '잔상 베기', 0x7ddcca); }
      this.tweens.add({ targets: rune, alpha: 0, duration: 130, onComplete: () => rune.destroy() });
    });
  }

  private parry(): boolean {
    const extra = this.upgrades.getStack('perfect-breath') * 22;
    if (!this.hero.startParry(extra)) return false;
    this.combatStats.parryAttempt(); this.parryStartedAt = this.time.now;
    this.parryAnchorUntil = Math.max(this.parryAnchorUntil, this.time.now + Math.max(BALANCE.hero.parryWindow + extra, BALANCE.hero.parryPositionLock));
    this.markTutorial('parry');
    const hurtbox = this.hero.hurtbox;
    const ring = this.add.ellipse(hurtbox.x, hurtbox.y, (hurtbox.radiusX + BALANCE.hero.parryEnvelopePadding) * 2, (hurtbox.radiusY + BALANCE.hero.parryEnvelopePadding) * 2, 0x72d7c5, 0.12).setStrokeStyle(3, 0x9affeb, 0.8).setDepth(DEPTH.melee);
    this.tweens.add({ targets: ring, scaleX: 1.45, scaleY: 1.45, alpha: 0, duration: 190, onComplete: () => ring.destroy() });
    return true;
  }

  private parrySuccess(enemy?: Enemy, projectile?: Projectile): void {
    const heroBefore = { x: this.hero.x, y: this.hero.y };
    const perfectBreath = this.upgrades.getStack('perfect-breath');
    const perfect = this.time.now - this.parryStartedAt <= BALANCE.hero.perfectParryWindow;
    this.combatStats.parrySuccess(perfect, projectile ? 'projectile' : 'melee');
    this.parries += 1; this.gainSentence(parrySentenceReward(BALANCE.sentence.parryGain, perfectBreath) + (perfect ? BALANCE.sentence.perfectParryBonus : 0));
    this.parryCounterUntil = this.time.now + BALANCE.hero.parryCounterWindow;
    this.services.audio.play(perfect ? 'perfectParry' : 'parry');
    if (perfect) {
      if (this.upgrades.getStack('unbroken-context') > 0) this.wordChain.extendOnce(this.time.now, BALANCE.chain.perfectParryExtension);
      const counter = perfectCounterProfile(this.upgrades.getStack('perfect-counter'));
      if (counter.cutReady) {
        this.weaponCooldowns.readyCut(this.time.now); this.perfectCounterUntil = this.time.now + counter.duration;
        this.recordUpgradeContribution('perfect-counter', { activationCount: 1, generated: 1 }, true);
        this.showCombatLabel(this.hero.x, this.hero.y - 58, this.upgrades.hasResonance('counter-cut') ? '반격 절문 준비' : '다음 절단 강화', 0xb6f5df);
      }
    }
    const flash = this.add.circle(this.hero.x, this.hero.y - 8, 24, 0xb4ffef, 0.2).setStrokeStyle(5, 0x8ff3df, 0.95).setDepth(DEPTH.word);
    this.tweens.add({ targets: flash, radius: 72, alpha: 0, duration: this.services.save.settings.reducedMotion ? 95 : 170, onComplete: () => flash.destroy() });
    this.runeBurst(this.hero.x, this.hero.y - 10, 8);
    if (enemy) {
      const inscription = counterInscriptionProfile(this.upgrades.getStack('counter-inscription'));
      if (inscription.duration > 0) { enemy.setData('counterInscriptionUntil', this.time.now + inscription.duration); this.recordUpgradeContribution('counter-inscription', { activationCount: 1, generated: 1, affectedTargets: 1 }, true); }
      if (perfect) enemy.setData('counterMarkedUntil', this.time.now + 4000);
      enemy.vulnerableUntil = this.time.now + BALANCE.hero.parryVulnerability;
      enemy.cancelAttackIntent(this.time.now + BALANCE.hero.parryAttackerStagger);
      const separated = separateAttackerFromAnchoredHero(this.hero.movementCircle, enemy.movementCircle, 3, BALANCE.hero.parryAttackerCorrectionMaximum);
      enemy.setGroundPosition(separated.x, separated.y); enemy.constrainToCombatBounds();
      const away = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y);
      this.damageEnemy(enemy, 12, away, true, false, undefined, 'parry');
      this.parryAnchorUntil = Math.max(this.parryAnchorUntil, this.time.now + BALANCE.hero.parryPositionLock);
    }
    if (projectile) {
      const target = [...this.enemies].find((candidate) => candidate.id === projectile.sourceId && candidate.active) ?? this.nearestEnemy(projectile.x, projectile.y);
      const inscription = counterInscriptionProfile(this.upgrades.getStack('counter-inscription'));
      if (target && inscription.duration > 0) { target.setData('counterInscriptionUntil', this.time.now + inscription.duration); this.recordUpgradeContribution('counter-inscription', { activationCount: 1, generated: 1, affectedTargets: 1 }, true); }
      if (target) projectile.reflect(target.x, target.y); else projectile.destroy();
    }
    // parrySuccess never relocates the hero. Re-applying an unchanged position
    // here used to interfere with Arcade Physics' pending postUpdate delta.
    this.hero.constrainToArena();
    this.combatStats.parryPosition(heroBefore.x, heroBefore.y, this.hero.x, this.hero.y);
    this.lastHitAt = performance.now();
    this.timeControl.requestHitstop(this.timeOwner, this.services.save.settings.reducedMotion ? 35 : BALANCE.hero.parryHitstop);
  }

  private armEmpower(): void {
    if (this.empowered || this.sentence < this.sentenceMax) return;
    // Sentence is committed only after the empowered word produces a real
    // combat effect. Keeping it here makes failed target checks fully refundable.
    this.empowered = true; this.combatStats.empower(); this.services.audio.play('upgrade'); this.hero.setTint(0x86ead8);
    this.sentenceReminderShown = true;
    this.services.ui.showChainTrigger('다음 Q / E / R 강화', 850);
    this.runeBurst(this.hero.x, this.hero.y - 12, 12);
    this.runDelayedCall(220, () => { if (this.hero.active) this.hero.clearTint(); });
  }

  private canCast(readyAt: number): boolean { return this.flow.allowsCombatInput && this.time.now >= readyAt && this.wordInputAt !== this.game.loop.frame; }
  private readyAtForWord(word: WordId): number { return word === 'stop' ? this.stopReadyAt : word === 'rewind' ? this.rewindReadyAt : word === 'link' ? this.linkReadyAt : this.wordReadyAt[word]; }
  private setReadyAtForWord(word: WordId, readyAt: number): void { this.wordReadyAt[word] = readyAt; if (word === 'stop') this.stopReadyAt = readyAt; else if (word === 'rewind') this.rewindReadyAt = readyAt; else if (word === 'link') this.linkReadyAt = readyAt; }
  private applyWordStatus(enemy: Enemy, id: Parameters<WordStatusRuntime['apply']>[1]['id'], sourceWordId: WordId, duration: number, stacks = 1): void {
    this.wordStatuses.apply(enemy.id, { id, sourceWordId, duration, now: this.time.now, stacks, sourceEntityId: 'hero', runId: this.runId, actId: this.runAct.current.id, visualKey: `status-${id.toLowerCase()}`, consumedBy: ['cut', 'reaction'], canSpread: id === 'MARKED' || id === 'LINKED', canTriggerReaction: true });
    this.combatStats.statusApplied(id);
  }
  private wordCooldown(base: number): number {
    const sealed = sealedSentenceStats(this.upgrades.getStack('sealed-sentence'));
    const cooldown = base * (1 - sealed.cooldownReduction);
    const reduction = Math.max(0, base - cooldown);
    if (reduction > 0) this.recordUpgradeContribution('sealed-sentence', { activationCount: 1, cooldownMs: reduction });
    return cooldown;
  }
  private beginWordCast(): WordCastContext {
    const amplifierEnhanced = this.upgrades.getStack('echo-amplifier') > 0 && this.time.now <= this.echoAmplifierUntil;
    const empoweredByF = this.empowered;
    const enhanced = empoweredByF || amplifierEnhanced;
    const overcharge = overchargedWordProfile(this.upgrades.getStack('sentence-overcharge'), empoweredByF);
    if (amplifierEnhanced) this.echoAmplifierUntil = 0;
    this.empowered = false; this.wordInputAt = this.game.loop.frame;
    return { enhanced, empoweredByF, overchargeMultiplier: overcharge.multiplier, overchargeDurationBonus: overcharge.durationBonus };
  }

  private completeEmpoweredWord(
    word: WordId,
    cast: WordCastContext,
    success: boolean,
    values: { damage?: number; healing?: number; affectedTargets?: number } = {},
    failureReason: EmpowerFailureReason,
  ): void {
    if (!cast.empoweredByF) return;
    if (!success) {
      this.empowered = true;
      this.sentence = this.sentenceMax;
      this.combatStats.empoweredWordFailure(word, failureReason);
      if (this.upgrades.getStack('sentence-overcharge') > 0) {
        this.recordUpgradeContribution('sentence-overcharge', { failedConditions: 1 });
      }
      this.showCombatLabel(this.hero.x, this.hero.y - 56, '강화 유지 · 유효 효과 없음', 0xb8c8c2);
      return;
    }
    this.sentence = 0;
    this.sentenceFullAt = 0;
    this.sentenceReminderShown = false;
    this.combatStats.empoweredWord(word);
    if (this.upgrades.getStack('sentence-overcharge') > 0) {
      this.recordUpgradeContribution('sentence-overcharge', {
        activationCount: 1,
        damage: values.damage ?? 0,
        healing: values.healing ?? 0,
        affectedTargets: values.affectedTargets ?? 0,
      }, true);
      this.showCombatLabel(this.hero.x, this.hero.y - 56, '문장 과충전', 0xb7f1d9);
    }
  }

  private noteEmpoweredWordFailure(word: WordId, reason: EmpowerFailureReason): void {
    if (!this.empowered) return;
    this.combatStats.empoweredWordFailure(word, reason);
    if (this.upgrades.getStack('sentence-overcharge') > 0) {
      this.recordUpgradeContribution('sentence-overcharge', { failedConditions: 1 });
    }
    this.showCombatLabel(this.hero.x, this.hero.y - 56, '강화 유지 · 유효 효과 없음', 0xb8c8c2);
  }

  private skillAreaHitsEnemy(x: number, y: number, radius: number, enemy: Enemy): boolean {
    return distanceToEllipse({ x, y }, enemy.hurtbox) <= radius;
  }

  private skillAreaHitsProjectile(x: number, y: number, radius: number, projectile: Projectile): boolean {
    return distanceToEllipse({ x, y }, { x: projectile.x, y: projectile.y, radiusX: projectile.collisionCircle.radius, radiusY: projectile.collisionCircle.radius }) <= radius;
  }

  private castStop(x: number, y: number): boolean {
    const activeLinked = [...this.linkedTargets].filter((enemy) => enemy.active && enemy.linked);
    if (!this.canCast(this.stopReadyAt)) return false;
    const cast = this.beginWordCast();
    const { enhanced, overchargeMultiplier, overchargeDurationBonus } = cast;
    this.stopReadyAt = this.time.now + this.wordCooldown(BALANCE.words.stopCooldown);
    this.wordUses['멎는다'] = (this.wordUses['멎는다'] ?? 0) + 1; this.markTutorial('stop');
    this.hero.castPose(); this.services.audio.play('stop'); this.showWordTypography('멎는다', x, y);
    const circle = this.add.circle(x, y, BALANCE.words.stopRadius, 0x55c4b1, 0.08).setStrokeStyle(3, 0x76d8c7, 0.74).setDepth(DEPTH.telegraph).setScale(0.2);
    this.tweens.add({ targets: circle, scale: 1, duration: 180 });
    this.runDelayedCall(180, () => {
      const until = this.time.now + BALANCE.words.stopDuration + overchargeDurationBonus;
      let damaged = 0;
      const stoppedEnemyIds: string[] = [];
      for (const enemy of [...this.enemies]) if (enemy.active && (enhanced || this.skillAreaHitsEnemy(x, y, BALANCE.words.stopRadius, enemy))) {
        enemy.freeze(until + (enhanced ? 500 : 0), enemy.kind === 'boss');
        this.applyWordStatus(enemy, 'STOPPED', 'stop', until - this.time.now + (enhanced ? 500 : 0));
        stoppedEnemyIds.push(enemy.id);
        damaged += this.damageEnemy(enemy, BALANCE.words.stopDamage * (enhanced ? 1.35 : 1) * overchargeMultiplier, Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y), false, false, 'word', 'stop', 'word');
      }
      if (damaged > 0) {
        this.combatStats.agencyDamage('stop', damaged); this.gainWordHitSentence(BALANCE.sentence.wordHitGain);
        if (overchargeMultiplier > 1) this.recordUpgradeContribution('sentence-overcharge', { activationCount: 1, damage: damaged * (1 - 1 / overchargeMultiplier), affectedTargets: stoppedEnemyIds.length }, true);
      }
      let projectileIndex = 0; let stoppedProjectiles = 0;
      for (const projectile of this.projectiles) {
        if (enhanced || this.skillAreaHitsProjectile(x, y, BALANCE.words.stopRadius, projectile)) {
          projectile.freeze(until + (enhanced ? 500 : 0));
          projectile.setData('stopWordToken', until);
          stoppedProjectiles += 1;
          if (enhanced && projectileIndex++ % 3 === 0) this.runDelayedCall(280, () => this.explodeStoppedProjectile(projectile));
        }
      }
      const successful = empoweredWordEffectIsValid({ damage: damaged, statusApplications: stoppedEnemyIds.length + stoppedProjectiles });
      const chain = successful ? this.registerWordUse('stop', { successful: true, hasLinkedTargets: activeLinked.length > 0 }) : undefined;
      if (!successful) {
        this.stopReadyAt = this.time.now;
        this.combatStats.invalidWord('stop');
      }
      this.completeEmpoweredWord('stop', cast, successful, {
        damage: damaged * Math.max(0, 1 - 1 / overchargeMultiplier),
        affectedTargets: stoppedEnemyIds.length + stoppedProjectiles,
      }, 'no-stop-effect');
      if (this.upgrades.getStack('stop-resonance') > 0 || this.upgrades.hasResonance('time-undertow')) this.runDelayedCall(until - this.time.now + 10, () => this.applyStopEndEffects(stoppedEnemyIds, until));
      if (chain === 'chain-stop') this.applyChainStop(activeLinked);
      else if (chain) this.applyWordReaction(chain, stoppedEnemyIds.map((id) => [...this.enemies].find((enemy) => enemy.id === id)).filter((enemy): enemy is Enemy => enemy !== undefined));
      this.tweens.add({ targets: circle, alpha: 0, duration: 220, onComplete: () => circle.destroy() });
    });
    return true;
  }

  private explodeStoppedProjectile(projectile: Projectile): void {
    if (!projectile.active) return; const x = projectile.x; const y = projectile.y; projectile.destroy(); this.projectiles.delete(projectile);
    this.runeBurst(x, y, 10); for (const enemy of [...this.enemies]) if (distanceSq(x, y, enemy.x, enemy.y) < 90 ** 2) this.damageEnemy(enemy, 22, Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y), false, false, 'word', 'stop');
  }

  private castRewind(): boolean {
    const records = this.rewind.getRange(this.time.now, BALANCE.words.rewindDuration);
    const frozenProjectiles = [...this.projectiles].filter((projectile) => projectile.active && projectile.enemyOwned && !projectile.reflected && projectile.frozenUntil > this.time.now);
    const stoppedTargets = [...this.enemies].filter((enemy) => enemy.active && enemy.isStopped);
    const activeLinked = [...this.linkedTargets].filter((enemy) => enemy.active && enemy.linked);
    const hasRecordedDamage = this.damageHistory.hasRecentDamage(activeLinked.map((enemy) => enemy.id), this.time.now, BALANCE.chain.damageHistoryDuration);
    const chainContext = { hasFrozenProjectiles: frozenProjectiles.length > 0, hasStoppedTargets: stoppedTargets.length > 0, hasLinkedTargets: activeLinked.length > 0, hasRecordedDamage };
    if (!this.canCast(this.rewindReadyAt)) return false;
    const cast = this.beginWordCast(); const { enhanced, overchargeMultiplier } = cast;
    this.rewindReadyAt = this.time.now + this.wordCooldown(BALANCE.words.rewindCooldown); this.wordUses['되돌린다'] = (this.wordUses['되돌린다'] ?? 0) + 1; this.markTutorial('rewind');
    const chain = this.registerWordUse('rewind', { successful: true, ...chainContext });
    if (chain === 'backflow') this.applyBackflow(frozenProjectiles, stoppedTargets);
    if (chain === 'damage-regression') this.applyDamageRegression(activeLinked);
    if (chain && chain !== 'backflow' && chain !== 'damage-regression') this.applyWordReaction(chain, [...this.enemies].filter((enemy) => enemy.active && !enemy.removing));
    const before = { x: this.hero.x, y: this.hero.y, health: this.hero.health };
    const targetState = records[0];
    this.hero.cancelAttackRecovery();
    this.services.audio.play('rewind'); this.showWordTypography('되돌린다', this.hero.x, this.hero.y - 48); this.hero.rewinding = true; this.hero.invulnerableUntil = this.time.now + 900;
    if (targetState) {
      const marker = this.add.image(targetState.x, targetState.y, 'hero-idle').setOrigin(0.5, 1).setScale(0.4).setFlipX(Math.cos(targetState.facing) < 0).setTint(0x68cbe5).setAlpha(0.42).setDepth(DEPTH.rewind);
      this.tweens.add({ targets: marker, alpha: 0, scaleX: 0.44, scaleY: 0.44, duration: 520, onComplete: () => marker.destroy() });
    }
    const echoDamage = this.rewindEchoBurst(before.x, before.y, enhanced, overchargeMultiplier);
    if (echoDamage > 0) this.showCombatLabel(before.x, before.y - 58, `잔상 피해 ${Math.round(echoDamage)}`, 0x72cfe8);
    if (records.length === 0) {
      this.runDelayedCall(160, () => { this.hero.rewinding = false; this.echoFinisherUntil = this.time.now + BALANCE.hero.finisher.echoDuration; });
      const successful = empoweredWordEffectIsValid({ damage: echoDamage, statusApplications: chain ? 1 : 0 });
      if (!successful) this.rewindReadyAt = this.time.now;
      this.completeEmpoweredWord('rewind', cast, successful, {
        damage: echoDamage * Math.max(0, 1 - 1 / overchargeMultiplier),
        affectedTargets: echoDamage > 0 ? 1 : 0,
      }, 'no-rewind-effect');
      return true;
    }
    const reverse = [...records].reverse(); const echoTrail: Phaser.GameObjects.Image[] = [];
    this.tweens.addCounter({ from: 0, to: reverse.length - 1, duration: 470, ease: 'Sine.InOut', onUpdate: (tween) => {
      const state = reverse[Math.floor(tween.getValue() ?? 0)]; if (!state) return;
      this.hero.setGroundPosition(state.x, state.y).setFlipX(Math.cos(state.facing) < 0).restoreHealth(state.health);
      if (echoTrail.length < 8 && Math.random() < 0.28) {
        const echo = this.add.image(state.x, state.y, 'hero-move').setOrigin(0.5, 1).setScale(Math.abs(this.hero.scaleX), Math.abs(this.hero.scaleY)).setFlipX(this.hero.flipX).setTint(0x43add0).setAlpha(0.24).setDepth(DEPTH.rewind);
        echoTrail.push(echo); this.tweens.add({ targets: echo, alpha: 0, duration: 320, onComplete: () => echo.destroy() });
      }
    }, onComplete: () => {
      this.hero.rewinding = false; const oldest = reverse.at(-1); if (oldest) { this.hero.setVelocity(oldest.velocityX, oldest.velocityY); this.hero.restoreHealth(oldest.health); }
      let recoveredForEmpower = 0; let movedForEmpower = 0;
      if (oldest) {
        let recovered = Math.max(0, oldest.health - before.health);
        const breath = rewindBreathHealing(recovered, this.upgrades.getStack('rewind-breath'));
        if (breath > 0) {
          const beforeBonus = this.hero.health; this.hero.heal(breath); const actualBonus = Math.max(0, this.hero.health - beforeBonus);
          recovered += actualBonus; this.recordUpgradeContribution('rewind-breath', { activationCount: 1, healing: actualBonus }, true);
        }
        const moved = Phaser.Math.Distance.Between(before.x, before.y, oldest.x, oldest.y);
        recoveredForEmpower = recovered; movedForEmpower = moved;
        if (recovered > 0.5) { this.damageNumber(this.hero.x, this.hero.y - 62, recovered, 0x75e6f3, false, '체력 +'); this.combatStats.rewindRecovered(recovered); }
        if (moved > 12) this.showCombatLabel(this.hero.x, this.hero.y - 45, '위치 복구', 0x79cfe3);
        if (this.boss?.active && this.boss.phase === 2 && (recovered > 0.5 || moved > 72)) {
          this.rewardBossMechanic('기록 균열');
        }
      }
      this.replayAttackEcho(records[0]?.time ?? this.time.now - BALANCE.words.rewindDuration, enhanced);
      this.echoFinisherUntil = this.time.now + BALANCE.hero.finisher.echoDuration;
      const echoTarget = [...this.enemies].find((enemy) => enemy.id === this.lastDirectTargetId && enemy.active && !enemy.removing) ?? this.nearestEnemy(this.hero.x, this.hero.y);
      echoTarget?.markEcho(this.echoFinisherUntil);
      if (echoTarget) this.applyWordStatus(echoTarget, 'REWOUND', 'rewind', BALANCE.hero.finisher.echoDuration);
      if (this.upgrades.getStack('regression-blade') > 0) this.regressionCharged = true;
      const successful = empoweredWordEffectIsValid({ damage: echoDamage, healing: recoveredForEmpower, movedDistance: movedForEmpower, statusApplications: chain ? 1 : 0 });
      if (!successful) this.rewindReadyAt = this.time.now;
      this.completeEmpoweredWord('rewind', cast, successful, {
        damage: echoDamage * Math.max(0, 1 - 1 / overchargeMultiplier),
        affectedTargets: echoDamage > 0 ? 1 : 0,
      }, 'no-rewind-effect');
    }});
    return true;
  }

  private rewindEchoBurst(x: number, y: number, enhanced: boolean, overchargeMultiplier = 1): number {
    const radius = BALANCE.words.rewindDamageRadius * (enhanced ? 1.18 : 1);
    const angle = this.hero.facing;
    const rangeRing = this.add.circle(x, y - 8, radius, 0x3c9ec2, 0.04).setStrokeStyle(2, 0x75dff0, 0.42).setDepth(DEPTH.word).setScale(0.55);
    this.tweens.add({ targets: rangeRing, scale: 1.05, alpha: 0, duration: 280, onComplete: () => rangeRing.destroy() });
    const slash = this.add.graphics().setDepth(DEPTH.word).lineStyle(7, 0x75dff0, 0.82);
    slash.beginPath().arc(x, y - 10, radius, angle - 0.88, angle + 0.88).strokePath();
    this.tweens.add({ targets: slash, alpha: 0, scaleX: 1.12, scaleY: 1.12, duration: 280, onComplete: () => slash.destroy() });
    let damage = 0;
    for (const enemy of [...this.enemies]) if (enemy.active && distanceToEllipse({ x, y }, enemy.hurtbox) <= radius) damage += this.damageEnemy(enemy, BALANCE.words.rewindDamage * (enhanced ? 1.35 : 1) * overchargeMultiplier, Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y), false, false, 'word', 'rewind', 'word');
    if (damage > 0) {
      this.combatStats.agencyDamage('rewind', damage); this.combatStats.rewindEchoDamage(damage); this.gainWordHitSentence(BALANCE.sentence.wordHitGain);
    }
    return damage;
  }

  private replayAttackEcho(fromTime: number, enhanced: boolean): void {
    const shadowStacks = this.upgrades.getStack('regression-sword-shadow');
    const returningStacks = this.upgrades.getStack('returning-scar');
    const returning = returningScarProfile(returningStacks);
    const replayCount = Math.max(shadowStacks > 0 ? Math.min(3, 1 + shadowStacks) : 0, returning.replayCount, enhanced ? 1 : 0);
    if (replayCount <= 0) return;
    const recent = this.attacks.filter((attack) => attack.time >= fromTime && (attack.kind === 'cut' || attack.kind === 'echo-blade' || this.legacyCombatMode)).slice(-replayCount);
    const basePower = returningStacks > 0 ? returning.damageRatio : shadowStacks > 0 ? 0.45 + (shadowStacks - 1) * 0.18 : BALANCE.hero.finisher.echoReplayRatio;
    const power = basePower + this.upgrades.getStack('memory-echo') * 0.22 + (enhanced ? 0.16 : 0);
    if (shadowStacks > 0 && recent.length > 0) { this.showCombatLabel(this.hero.x, this.hero.y - 58, '회귀 검영', 0x79cfe8); this.recordUpgradeContribution('regression-sword-shadow', { activationCount: 1, generated: recent.length }); }
    if (returningStacks > 0) this.recordUpgradeContribution('returning-scar', {
      activationCount: recent.length > 0 ? 1 : 0,
      generated: recent.length,
      failedConditions: recent.length > 0 ? 0 : 1,
    }, recent.length > 0);
    if (returningStacks > 0 && recent.length > 0) this.showCombatLabel(this.hero.x, this.hero.y - 72, '회귀의 칼자국', 0x79cfe8);
    let regressionActivated = false;
    const resonanceReady = this.upgrades.hasResonance('regression-chain');
    const linkedInReplaySpace = resonanceReady && recent.some((record) => [...this.linkedTargets].some((enemy) => enemy.active && enemy.linked && !enemy.removing
      && distanceToEllipse({ x: record.x, y: record.y }, enemy.hurtbox) <= 96
      && angleDelta(Phaser.Math.Angle.Between(record.x, record.y, enemy.x, enemy.y), record.angle) <= 1.18));
    if (resonanceReady && !linkedInReplaySpace) this.recordResonanceContribution('regression-chain', { activationCount: 0, failedConditions: 1 });
    recent.forEach((record, index) => this.runDelayedCall(index * 135, () => {
      const echo = this.add.image(record.x, record.y, 'hero-attack').setOrigin(0.5, 1).setScale(0.4).setFlipX(Math.cos(record.angle) < 0).setTint(0x43add0).setAlpha(0.55).setDepth(DEPTH.rewind);
      this.tweens.add({ targets: echo, alpha: 0, x: record.x + Math.cos(record.angle) * 22, duration: 210, onComplete: () => echo.destroy() });
      const range = record.kind === 'finisher' ? BALANCE.hero.finisher.range : 96;
      const slash = this.add.graphics().setDepth(DEPTH.word);
      slash.lineStyle(7, 0x72cfe8, .42).beginPath().arc(record.x, record.y - 8, range * .78, record.angle - .82, record.angle + .82).strokePath();
      slash.lineStyle(2, 0xb8f4ef, .68).beginPath().arc(record.x, record.y - 8, range * .62, record.angle - .68, record.angle + .68).strokePath();
      this.tweens.add({ targets: slash, alpha: 0, x: Math.cos(record.angle) * 8, y: Math.sin(record.angle) * 8, duration: 240, onComplete: () => slash.destroy() });
      const selected = selectEchoReplayTarget({ x: record.x, y: record.y }, record.angle, range, [...this.enemies].map((enemy) => ({ id: enemy.id, hurtbox: enemy.hurtbox, alive: enemy.active && !enemy.removing, linked: enemy.linked })));
      const target = selected ? [...this.enemies].find((enemy) => enemy.id === selected.id) : undefined;
      if (target) {
        const activeLinks = [...this.linkedTargets].filter((enemy) => enemy.active && enemy.linked);
        const regressionResonance = resonanceReady && target.linked;
        const resonanceMultiplier = regressionResonance && activeLinks.length === 1 ? 1.35 : 1;
        const baseDamage = Math.max(1, record.damage) * power;
        const dealt = this.damageEnemy(target, baseDamage * resonanceMultiplier, record.angle, false, regressionResonance, undefined, 'rewind');
        const embeddedResonanceDamage = regressionResonance && activeLinks.length === 1
          ? Math.max(0, dealt - Math.min(dealt, baseDamage))
          : 0;
        if (shadowStacks > 0 && dealt > 0) this.recordUpgradeContribution('regression-sword-shadow', { activationCount: 0, damage: dealt, hits: 1 });
        if (returningStacks > 0 && dealt > 0) this.recordUpgradeContribution('returning-scar', {
          activationCount: 0,
          damage: Math.max(0, dealt - embeddedResonanceDamage),
          hits: 1,
          exclusiveDamage: true,
        });
        if (regressionResonance && dealt > 0) {
          let resonanceDamage = embeddedResonanceDamage; let affectedTargets = 1;
          if (activeLinks.length > 1) for (const linked of activeLinks) {
            if (linked === target || !linked.active || linked.removing) continue;
            const shared = this.damageEnemy(linked, baseDamage * .22, record.angle, false, true, undefined, 'rewind');
            if (shared > 0) { resonanceDamage += shared; affectedTargets += 1; this.linkPulse(target, linked, 0x64bfe1); }
          }
          this.recordResonanceContribution('regression-chain', { activationCount: regressionActivated ? 0 : 1, damage: resonanceDamage, affectedTargets, hits: affectedTargets, exclusiveDamage: true });
          regressionActivated = true;
        }
      } else if (returningStacks > 0) this.recordUpgradeContribution('returning-scar', { activationCount: 0, misses: 1 });
    }));
  }

  private castLink(x: number, y: number, primary?: Enemy): boolean {
    let candidates: Enemy[];
    if (primary?.active && primary.spawned) {
      const nearby = [...this.enemies].filter((enemy) => enemy !== primary && enemy.active && enemy.spawned && distanceToEllipse(primary.groundPoint, enemy.hurtbox) < BALANCE.words.linkSelectionRadius).sort((a, b) => distanceToEllipse(primary.groundPoint, a.hurtbox) - distanceToEllipse(primary.groundPoint, b.hurtbox));
      candidates = [primary, ...nearby];
    } else candidates = [...this.enemies].filter((enemy) => enemy.active && enemy.spawned && !enemy.removing && distanceToEllipse({ x, y }, enemy.hurtbox) < BALANCE.words.linkSelectionRadius).sort((a, b) => distanceToEllipse({ x, y }, a.hurtbox) - distanceToEllipse({ x, y }, b.hurtbox));
    if (candidates.length === 0) { const nearest = this.nearestEnemy(this.hero.x, this.hero.y); if (nearest) candidates = [nearest, ...[...this.enemies].filter((enemy) => enemy !== nearest && enemy.active && enemy.spawned && !enemy.removing).sort((a, b) => distanceSq(nearest.x, nearest.y, a.x, a.y) - distanceSq(nearest.x, nearest.y, b.x, b.y))]; }
    if (this.boss?.active && this.boss.phase === 3 && distanceSq(x, y, this.boss.x, this.boss.y) < 330 ** 2) {
      const phaseTargets = [...this.enemies].filter((enemy) => enemy.spawned && (enemy === this.boss || enemy.kind === 'minion'));
      candidates = primary ? [primary, ...new Set([...phaseTargets.filter((enemy) => enemy !== primary), ...candidates.filter((enemy) => enemy !== primary)])] : [...new Set([...phaseTargets, ...candidates])];
    }
    const enhancedPreview = this.empowered;
    const selected = candidates.slice(0, enhancedPreview ? BALANCE.words.empoweredLinkTargets : BALANCE.words.baseLinkTargets);
    if (selected.length < 1) { this.combatStats.invalidWord('link'); this.noteEmpoweredWordFailure('link', 'no-link-target'); return true; }
    if (!this.canCast(this.linkReadyAt)) return false;
    const cast = this.beginWordCast(); const { enhanced, overchargeMultiplier, overchargeDurationBonus } = cast;
    this.linkReadyAt = this.time.now + this.wordCooldown(BALANCE.words.linkCooldown); this.wordUses['잇는다'] = (this.wordUses['잇는다'] ?? 0) + 1; this.markTutorial('link');
    this.services.audio.play('link'); this.hero.castPose(); this.showWordTypography('잇는다', x, y);
    this.showLinkPreview(selected);
    this.clearLinks();
    let directDamage = 0;
    selected.forEach((enemy) => { directDamage += this.damageEnemy(enemy, BALANCE.words.linkDamage * (selected.length === 1 ? BALANCE.words.singleLinkDamageMultiplier : 1) * (enhanced ? 1.35 : 1) * overchargeMultiplier, Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y), false, false, 'word', 'link', 'word'); });
    if (directDamage > 0) {
      this.combatStats.agencyDamage('link', directDamage); this.gainWordHitSentence(BALANCE.sentence.wordHitGain);
    }
    const expires = this.time.now + BALANCE.words.linkDuration + (enhanced ? 1300 : 0) + overchargeDurationBonus;
    const generation = ++this.linkGeneration;
    this.linkShareRatio = linkShareRatio(enhanced);
    if (selected.length === 1 && this.upgrades.getStack('isolation-chain') > 0) this.recordUpgradeContribution('isolation-chain', { activationCount: 1, affectedTargets: 1 }, true);
    selected.forEach((enemy) => {
      enemy.linked = true; enemy.linkedUntil = expires; enemy.setData('linkContagionGeneration', 0); this.linkedTargets.add(enemy);
      this.applyWordStatus(enemy, selected.length === 1 ? 'ISOLATED' : 'LINKED', 'link', expires - this.time.now);
      const marker = this.add.text(enemy.x, enemy.y - (enemy.kind === 'boss' ? 78 : 48), selected.length === 1 ? '孤' : '連', { fontFamily: 'Malgun Gothic, serif', fontSize: enemy.kind === 'boss' ? '19px' : '15px', color: '#a1f3df', stroke: '#09201d', strokeThickness: 4 }).setOrigin(0.5).setDepth(DEPTH.word);
      this.linkMarkers.set(enemy, marker);
      const preview = this.add.circle(enemy.x, enemy.y - 8, enemy.kind === 'boss' ? 34 : 23, 0x58c9b6, 0.04).setStrokeStyle(2, 0xa3f5e4, 0.72).setDepth(DEPTH.word).setScale(0.72);
      this.tweens.add({ targets: preview, scale: 1.18, alpha: 0, duration: 190, onComplete: () => preview.destroy() });
    });
    this.showCombatLabel(selected[0]?.x ?? this.hero.x, (selected[0]?.y ?? this.hero.y) - 62, selected.length === 1 ? '고립 연결 1/3 · 피해 +18%' : `연결 ${selected.length}/${enhanced ? BALANCE.words.empoweredLinkTargets : BALANCE.words.baseLinkTargets}`, 0x9fe9dc);
    const linkReaction = this.registerWordUse('link', { successful: true, hasLinkedTargets: selected.length > 0, relevantTargetCount: selected.length });
    if (linkReaction && linkReaction !== 'chain-stop' && linkReaction !== 'damage-regression') this.applyWordReaction(linkReaction, selected);
    this.completeEmpoweredWord('link', cast, empoweredWordEffectIsValid({ damage: directDamage, statusApplications: selected.length, durationApplications: selected.length }), {
      damage: directDamage * Math.max(0, 1 - 1 / overchargeMultiplier),
      affectedTargets: selected.length,
    }, 'no-link-target');
    this.runDelayedCall(expires - this.time.now, () => {
      if (generation !== this.linkGeneration) return;
      if (enhanced) for (const enemy of [...this.linkedTargets]) if (enemy.active) this.damageEnemy(enemy, 22, 0, false, true, undefined, 'link');
      this.clearLinks();
    });
    return true;
  }

  private castPull(x: number, y: number): boolean {
    const definition = wordDefinition('pull'); if (!this.canCast(this.readyAtForWord('pull'))) return false;
    const cast = this.beginWordCast(); const gravity = gravityInscriptionProfile(this.upgrades.getStack('gravity-inscription')); const radius = (cast.enhanced ? 190 : 155) * gravity.rangeMultiplier;
    const center = clampPointToBounds(x, y, COMBAT_BOUNDS, radius * .25);
    const targets = [...this.enemies].filter((enemy) => enemy.active && !enemy.removing && this.skillAreaHitsEnemy(center.x, center.y, radius, enemy));
    const projectiles = [...this.projectiles].filter((projectile) => projectile.active && projectile.enemyOwned && this.skillAreaHitsProjectile(center.x, center.y, radius, projectile));
    if (targets.length === 0 && projectiles.length === 0) { this.combatStats.invalidWord('pull'); this.setReadyAtForWord('pull', this.time.now); this.completeEmpoweredWord('pull', cast, false, {}, 'no-target'); return true; }
    this.setReadyAtForWord('pull', this.time.now + this.wordCooldown(definition.cooldown)); this.wordUses['당긴다'] = (this.wordUses['당긴다'] ?? 0) + 1; this.markTutorial('pull'); this.hero.castPose(); this.services.audio.play('link'); this.showWordTypography('당긴다', center.x, center.y);
    const spiral = this.add.circle(center.x, center.y, radius, 0x4aa897, .05).setStrokeStyle(4, 0x8be5d4, .72).setDepth(DEPTH.word).setScale(1.15); this.tweens.add({ targets: spiral, scale: .2, alpha: 0, duration: 430, onComplete: () => spiral.destroy() });
    let damage = 0;
    for (const enemy of targets) { const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, center.x, center.y); const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, center.x, center.y); const moved = Math.min(cast.enhanced ? 70 : 46, Math.max(0, distance - 34)); enemy.setGroundPosition(enemy.x + Math.cos(angle) * moved, enemy.y + Math.sin(angle) * moved); enemy.constrainToCombatBounds(); damage += this.damageEnemy(enemy, definition.baseDamage * cast.overchargeMultiplier, angle, false, false, 'word', 'word', 'word', { handler: `word:pull:${enemy.id}`, baseSource: 'word', skillId: 'pull' }); this.applyWordStatus(enemy, 'PULLED', 'pull', 3000); if (distance < 105) this.applyWordStatus(enemy, 'COMPRESSED', 'pull', 3000); }
    const captureCount = Math.min(projectiles.length, cast.enhanced ? projectiles.length : this.upgrades.getStack('captured-projectile') > 0 ? 4 : 0);
    for (const projectile of projectiles) { projectile.freeze(this.time.now + (cast.enhanced ? 850 : 260 + gravity.durationBonus)); projectile.setData('capturedByPull', true); }
    if (gravity.damage > 0 || this.upgrades.hasResonance('compression-seal')) this.runDelayedCall(420 + gravity.durationBonus, () => {
      let bonusDamage = 0; let affected = 0;
      for (const enemy of targets) {
        if (!enemy.active || enemy.removing) continue;
        if (gravity.damage > 0) bonusDamage += this.damageEnemy(enemy, gravity.damage, Phaser.Math.Angle.Between(center.x, center.y, enemy.x, enemy.y), false, true, undefined, 'word', 'none', { handler: `gravity-inscription:${enemy.id}`, baseSource: 'word', skillId: 'gravity-inscription', cardId: 'gravity-inscription', damageKind: 'card-derived', flags: ['cardDerived', 'cannotTriggerCard', 'cannotTriggerShare', 'cannotTriggerResonance'] });
        if (this.upgrades.hasResonance('compression-seal')) { enemy.freeze(this.time.now + 700, enemy.kind === 'boss'); this.applyWordStatus(enemy, 'STOPPED', 'stop', 700); affected += 1; }
      }
      if (gravity.damage > 0) this.recordUpgradeContribution('gravity-inscription', { activationCount: 1, damage: bonusDamage, affectedTargets: targets.length, hits: targets.length }, bonusDamage > 0);
      if (this.upgrades.hasResonance('compression-seal')) this.recordResonanceContribution('compression-seal', { activationCount: affected > 0 ? 1 : 0, damage: 0, affectedTargets: affected, failedConditions: affected > 0 ? 0 : 1 });
    });
    if (captureCount > 0) this.runDelayedCall(480, () => {
      let reflected = 0;
      for (const projectile of projectiles.slice(0, captureCount)) { if (!projectile.active || projectile.reflected) continue; const target = this.nearestEnemy(projectile.x, projectile.y); if (!target) continue; projectile.reflect(target.x, target.y, projectile.originalDamage * .7, true); reflected += 1; }
      this.recordUpgradeContribution('captured-projectile', { activationCount: reflected > 0 ? 1 : 0, reflectedProjectiles: reflected, affectedTargets: reflected, failedConditions: reflected > 0 ? 0 : 1 }, reflected > 0);
    });
    this.combatStats.agencyDamage('pull', damage); this.gainWordHitSentence(BALANCE.sentence.wordHitGain); const chain = this.registerWordUse('pull', { successful: true, relevantTargetCount: targets.length }); if (chain) this.applyWordReaction(chain, targets); this.completeEmpoweredWord('pull', cast, true, { damage, affectedTargets: targets.length + projectiles.length }, 'no-target'); return true;
  }

  private castMark(): boolean {
    const definition = wordDefinition('mark'); if (!this.canCast(this.readyAtForWord('mark'))) return false;
    const targets = [...this.enemies].filter((enemy) => enemy.active && !enemy.removing).sort((a, b) => distanceSq(this.hero.x, this.hero.y, a.x, a.y) - distanceSq(this.hero.x, this.hero.y, b.x, b.y));
    if (targets.length === 0) { this.combatStats.invalidWord('mark'); this.noteEmpoweredWordFailure('mark', 'no-target'); return true; }
    const cast = this.beginWordCast(); const selected = targets.slice(0, cast.enhanced ? 3 : 1); this.setReadyAtForWord('mark', this.time.now + this.wordCooldown(definition.cooldown)); this.wordUses['새긴다'] = (this.wordUses['새긴다'] ?? 0) + 1; this.markTutorial('mark'); this.hero.castPose(); this.services.audio.play('stop');
    let damage = 0; for (const enemy of selected) { damage += this.damageEnemy(enemy, definition.baseDamage * cast.overchargeMultiplier, Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y), false, false, 'word', 'word', 'word', { handler: `word:mark:${enemy.id}`, baseSource: 'word', skillId: 'mark' }); this.applyWordStatus(enemy, 'MARKED', 'mark', cast.enhanced ? 7500 : 6000); const seal = this.add.text(enemy.x, enemy.y - 56, '刻', { fontFamily: 'serif', fontSize: '22px', color: '#a8f4df', stroke: '#32152d', strokeThickness: 5 }).setOrigin(.5).setDepth(DEPTH.word); this.tweens.add({ targets: seal, scale: 1.35, alpha: .5, duration: 320, yoyo: true, onComplete: () => this.runDelayedCall(700, () => seal.destroy()) }); }
    this.showWordTypography('새긴다', selected[0]!.x, selected[0]!.y - 70); this.combatStats.agencyDamage('mark', damage); this.gainWordHitSentence(BALANCE.sentence.wordHitGain); const chain = this.registerWordUse('mark', { successful: true, relevantTargetCount: selected.length }); if (chain) this.applyWordReaction(chain, selected); this.completeEmpoweredWord('mark', cast, true, { damage, affectedTargets: selected.length }, 'no-target'); return true;
  }

  private castPush(directionX: number, directionY: number): boolean {
    const definition = wordDefinition('push'); if (!this.canCast(this.readyAtForWord('push'))) return false;
    const cast = this.beginWordCast(); const angle = Math.atan2(directionY || Math.sin(this.hero.facing), directionX || Math.cos(this.hero.facing)); const range = cast.enhanced ? 190 : 145; const halfAngle = cast.enhanced ? Math.PI : 1.35;
    const targets = [...this.enemies].filter((enemy) => enemy.active && !enemy.removing && sectorHitsEllipse({ x: this.hero.x, y: this.hero.y, angle, range, halfAngle }, enemy.hurtbox));
    const projectiles = [...this.projectiles].filter((projectile) => projectile.active && projectile.enemyOwned && Phaser.Math.Distance.Between(this.hero.x, this.hero.y, projectile.x, projectile.y) <= range);
    if (targets.length === 0 && projectiles.length === 0) { this.combatStats.invalidWord('push'); this.completeEmpoweredWord('push', cast, false, {}, 'no-target'); return true; }
    this.setReadyAtForWord('push', this.time.now + this.wordCooldown(definition.cooldown)); this.wordUses['밀어낸다'] = (this.wordUses['밀어낸다'] ?? 0) + 1; this.markTutorial('push'); this.hero.castPose(); this.services.audio.play('parry'); this.showWordTypography('밀어낸다', this.hero.x + Math.cos(angle) * 54, this.hero.y + Math.sin(angle) * 54);
    const fan = this.add.graphics().setDepth(DEPTH.word).lineStyle(8, 0x9ae8d4, .78).beginPath().arc(this.hero.x, this.hero.y, range, angle - halfAngle, angle + halfAngle).strokePath(); this.tweens.add({ targets: fan, alpha: 0, scaleX: 1.1, scaleY: 1.1, duration: 240, onComplete: () => fan.destroy() });
    const ripple = recoilRippleProfile(this.upgrades.getStack('recoil-ripple'));
    let damage = 0; let rippleDamage = 0; let collisions = 0; for (const enemy of targets) { const away = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y); damage += this.damageEnemy(enemy, definition.baseDamage * cast.overchargeMultiplier, away, false, false, 'word', 'word', 'word', { handler: `word:push:${enemy.id}`, baseSource: 'word', skillId: 'push' }); if (enemy.kind !== 'boss') { const beforeX = enemy.x; const beforeY = enemy.y; const distance = cast.enhanced ? 64 : 42; enemy.setGroundPosition(enemy.x + Math.cos(away) * distance, enemy.y + Math.sin(away) * distance); enemy.constrainToCombatBounds(); const collided = Phaser.Math.Distance.Between(beforeX, beforeY, enemy.x, enemy.y) < distance * .8 || targets.some((other) => other !== enemy && other.active && distanceSq(enemy.x, enemy.y, other.x, other.y) <= 42 ** 2); if (collided && ripple.damage > 0) { collisions += 1; for (const other of [...this.enemies]) if (other.active && !other.removing && distanceSq(enemy.x, enemy.y, other.x, other.y) <= ripple.radius ** 2) rippleDamage += this.damageEnemy(other, ripple.damage, away, false, true, undefined, 'word', 'none', { handler: `recoil-ripple:${enemy.id}:${other.id}`, baseSource: 'word', skillId: 'recoil-ripple', cardId: 'recoil-ripple', damageKind: 'card-derived', flags: ['cardDerived', 'cannotTriggerCard', 'cannotTriggerShare', 'cannotTriggerResonance'] }); } } else enemy.vulnerableUntil = Math.max(enemy.vulnerableUntil, this.time.now + 800); this.applyWordStatus(enemy, 'DISPLACED', 'push', 2800); }
    if (ripple.damage > 0) this.recordUpgradeContribution('recoil-ripple', { activationCount: collisions, damage: rippleDamage, affectedTargets: collisions, hits: collisions, failedConditions: collisions > 0 ? 0 : 1 }, rippleDamage > 0);
    const veil = headwindVeilProfile(this.upgrades.getStack('headwind-veil')); if (veil.duration > 0) { this.headwindGuardUntil = this.time.now + veil.duration; this.recordUpgradeContribution('headwind-veil', { activationCount: 1 }, true); }
    for (const projectile of projectiles) { const target = this.nearestEnemy(projectile.x, projectile.y); if (target) projectile.reflect(target.x, target.y); }
    this.combatStats.agencyDamage('push', damage); this.gainWordHitSentence(BALANCE.sentence.wordHitGain); const chain = this.registerWordUse('push', { successful: true, hasStoppedTargets: targets.some((enemy) => enemy.isStopped), relevantTargetCount: targets.length }); if (chain) {
      this.applyWordReaction(chain, targets);
      if (chain === 'compressed-burst' && this.upgrades.hasResonance('reversal-burst')) {
        let resonanceDamage = 0;
        for (const enemy of targets) resonanceDamage += this.damageEnemy(enemy, 8, angle, false, true, undefined, 'word', 'none', {
          handler: `resonance:reversal-burst:${enemy.id}`, baseSource: 'word', skillId: 'compressed-burst', resonanceId: 'reversal-burst', damageKind: 'resonance-derived', flags: ['resonanceDerived', 'cannotTriggerResonance', 'cannotTriggerShare', 'cannotTriggerCard'],
        });
        this.recordResonanceContribution('reversal-burst', { activationCount: 1, damage: resonanceDamage, reflectedProjectiles: projectiles.length, affectedTargets: targets.length, hits: targets.length, exclusiveDamage: true });
        this.showCombatLabel(this.hero.x, this.hero.y - 66, '공명 · 반전 폭발', 0xa6e9df);
      }
    } this.completeEmpoweredWord('push', cast, true, { damage, affectedTargets: targets.length + projectiles.length }, 'no-target'); return true;
  }

  private applyWordReaction(reaction: WordChainId, preferred: readonly Enemy[]): void {
    const definition = reactionDefinition(reaction);
    const targets = preferred.filter((enemy) => enemy.active && !enemy.removing).slice(0, 4);
    const fallback = targets.length === 0 ? [...this.enemies].filter((enemy) => enemy.active && !enemy.removing).slice(0, 1) : targets;
    let damage = 0;
    for (const enemy of fallback) {
      const amount = reaction === 'compressed-burst' ? 24 : reaction === 'sealed-inscription' || reaction === 'mark-regression' ? 20 : 14;
      damage += this.damageEnemy(enemy, amount, Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y), false, true, undefined, 'word', 'none', { handler: `reaction:${reaction}:${enemy.id}`, baseSource: 'word', skillId: reaction, damageKind: 'reaction', flags: ['echoDerived', 'cannotTriggerShare', 'cannotTriggerCard', 'cannotTriggerResonance'] });
      if (reaction === 'compressed-stop' || reaction === 'sealed-inscription') { enemy.freeze(this.time.now + 900, enemy.kind === 'boss'); this.applyWordStatus(enemy, 'STOPPED', 'stop', 900); }
      if (reaction === 'binding' || reaction === 'recoil-chain') { enemy.linked = true; enemy.linkedUntil = this.time.now + 3200; this.linkedTargets.add(enemy); this.applyWordStatus(enemy, 'LINKED', 'link', 3200); }
      if (reaction === 'mark-spread') this.applyWordStatus(enemy, 'MARKED', 'mark', 4200);
      if (reaction === 'compressed-burst' && enemy.kind !== 'boss') { const away = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y); enemy.setGroundPosition(enemy.x + Math.cos(away) * 34, enemy.y + Math.sin(away) * 34); enemy.constrainToCombatBounds(); }
      for (const status of definition?.stateConsumption ?? []) this.wordStatuses.consume(enemy.id, status);
    }
    if (reaction === 'stopped-shatter') for (const projectile of [...this.projectiles]) { if (!projectile.active || !projectile.enemyOwned || projectile.frozenUntil <= this.time.now) continue; const target = this.nearestEnemy(projectile.x, projectile.y); if (target) projectile.reflect(target.x, target.y, projectile.originalDamage * .72, true); }
    if (damage > 0) { this.combatStats.addChainDamage(reaction, damage); this.combatStats.reactionDamage(reaction, damage); }
    const reactionName = definition?.displayName ?? reaction;
    this.showWordTypography(reactionName, this.hero.x, this.hero.y - 70, true);
  }

  private applyStopEndEffects(stoppedEnemyIds: readonly string[], token: number): void {
    const profile = stopResonanceProfile(this.upgrades.getStack('stop-resonance'));
    let damage = 0; let affected = 0; let pulses = 0;
    if (profile.damage > 0) for (const sourceId of stoppedEnemyIds) {
      const source = [...this.enemies].find((enemy) => enemy.id === sourceId && enemy.active && !enemy.removing); if (!source) continue;
      pulses += 1;
      const outer = this.add.circle(source.x, source.y - 8, 12, 0x6dcab8, .03).setStrokeStyle(3, 0x9cebdc, .72).setDepth(DEPTH.word);
      const inner = this.add.circle(source.x, source.y - 8, 8, 0x0, 0).setStrokeStyle(1, 0x9cebdc, .92).setDepth(DEPTH.word);
      const glyph = this.add.text(source.x, source.y - 10, '止', { fontFamily: 'serif', fontSize: '15px', color: '#b7f5e8', stroke: '#0a2823', strokeThickness: 3 }).setOrigin(.5).setDepth(DEPTH.word);
      this.tweens.add({ targets: outer, radius: profile.radius, alpha: 0, duration: 250, onComplete: () => outer.destroy() });
      this.tweens.add({ targets: inner, radius: profile.radius * .72, alpha: 0, duration: 190, delay: 35, onComplete: () => inner.destroy() });
      this.tweens.add({ targets: glyph, y: glyph.y - 12, alpha: 0, duration: 280, onComplete: () => glyph.destroy() });
      for (const target of [...this.enemies]) {
        if (!target.active || target.removing || target === source || distanceSq(source.x, source.y, target.x, target.y) > profile.radius ** 2) continue;
        const dealt = this.damageEnemy(target, profile.damage, Phaser.Math.Angle.Between(source.x, source.y, target.x, target.y), false, true, undefined, 'stop');
        if (dealt > 0) { damage += dealt; affected += 1; target.freeze(this.time.now + profile.slowDuration, target.kind === 'boss'); }
      }
    }
    if (profile.damage > 0) this.recordUpgradeContribution('stop-resonance', {
      activationCount: pulses > 0 ? 1 : 0,
      damage,
      generated: pulses,
      affectedTargets: affected,
      failedConditions: pulses > 0 ? 0 : 1,
      hits: affected,
      exclusiveDamage: true,
    }, damage > 0);

    if (!this.upgrades.hasResonance('time-undertow')) return;
    let reflected = 0;
    for (const projectile of [...this.projectiles]) {
      if (reflected >= 3 || !projectile.active || !projectile.enemyOwned || projectile.reflected || projectile.getData('timeUndertowReflected') === true || Number(projectile.getData('stopWordToken')) !== token) continue;
      const target = [...this.enemies].find((enemy) => enemy.id === projectile.sourceId && enemy.active) ?? this.nearestEnemy(projectile.x, projectile.y); if (!target) continue;
      projectile.setData('timeUndertow', true); projectile.setData('timeUndertowReflected', true); projectile.reflect(target.x, target.y, projectile.originalDamage * .55, true); reflected += 1;
      this.showCombatLabel(projectile.x, projectile.y - 14, '시간 역조', 0x77d8e8);
    }
    this.recordResonanceContribution('time-undertow', {
      activationCount: reflected > 0 ? 1 : 0,
      reflectedProjectiles: reflected,
      affectedTargets: reflected,
      failedConditions: reflected > 0 ? 0 : 1,
    });
  }

  private showLinkPreview(selected: readonly Enemy[]): void {
    if (selected.length === 0) return;
    const preview = this.add.graphics().setDepth(DEPTH.word);
    preview.lineStyle(1, 0x8ee6d5, 0.56);
    for (let index = 0; index < selected.length - 1; index += 1) {
      const from = selected[index]; const to = selected[index + 1]; if (!from || !to) continue;
      const distance = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y); const steps = Math.max(1, Math.floor(distance / 12));
      for (let step = 0; step < steps; step += 2) {
        const start = step / steps; const end = Math.min(1, (step + 1) / steps);
        preview.lineBetween(Phaser.Math.Linear(from.x, to.x, start), Phaser.Math.Linear(from.y - 10, to.y - 10, start), Phaser.Math.Linear(from.x, to.x, end), Phaser.Math.Linear(from.y - 10, to.y - 10, end));
      }
    }
    this.tweens.add({ targets: preview, alpha: 0, duration: 210, onComplete: () => preview.destroy() });
  }

  private registerWordUse(word: WordId, context: Parameters<WordChainSystem['use']>[2]): WordChainId | undefined {
    this.combatStats.word(word);
    if (word === 'stop' || word === 'rewind' || word === 'link') this.combatStats.agencyMilestone(word, this.elapsedSeconds());
    const result = this.wordChain.use(word, this.time.now, context);
    if (result.attemptedChain) this.combatStats.chainAttempt(result.attemptedChain, result.usedFallback);
    if (result.chain) {
      this.combatStats.chain(result.chain);
      this.combatStats.agencyMilestone('chain', this.elapsedSeconds());
      this.gainSentence(BALANCE.sentence.chainGain);
      const chainBreath = this.upgrades.getStack('chain-breath');
      if (chainBreath > 0) {
        this.gainSentence(12 * chainBreath);
        this.reduceAllWordCooldowns(400 * chainBreath);
        this.recordUpgradeContribution('chain-breath', { activationCount: 1, sentence: 12 * chainBreath, cooldownMs: 400 * chainBreath }, true);
        this.showCombatLabel(this.hero.x, this.hero.y - 52, '연문의 숨', 0x91e7d5);
      }
      const amplifier = this.upgrades.getStack('echo-amplifier');
      if (amplifier > 0) this.echoAmplifierUntil = this.time.now + 5000 * amplifier;
      const name = result.reactionName ?? result.chain;
      this.services.audio.play(result.chain === 'chain-stop' ? 'chainStop' : result.chain === 'backflow' ? 'backflow' : result.chain === 'damage-regression' ? 'damageRegression' : 'chainStop'); this.services.ui.showChainTrigger(name, BALANCE.chain.labelDuration);
    }
    return result.chain;
  }

  private reduceAllWordCooldowns(milliseconds: number): void {
    if (milliseconds <= 0) return;
    this.stopReadyAt = Math.max(this.time.now, this.stopReadyAt - milliseconds);
    this.rewindReadyAt = Math.max(this.time.now, this.rewindReadyAt - milliseconds);
    this.linkReadyAt = Math.max(this.time.now, this.linkReadyAt - milliseconds);
    for (const id of ['pull', 'mark', 'push'] as WordId[]) this.wordReadyAt[id] = Math.max(this.time.now, this.wordReadyAt[id] - milliseconds);
  }

  private rewardBossMechanic(label: string): void {
    if (!this.boss?.active || this.time.now < this.bossMechanicRewardUntil) return;
    this.bossMechanicRewardUntil = this.time.now + BALANCE.boss.vulnerabilityDuration;
    this.boss.vulnerableUntil = this.bossMechanicRewardUntil;
    this.services.audio.play('bossVulnerable');
    this.showWordTypography(label, this.boss.x, this.boss.y - 72);
    this.runeBurst(this.boss.x, this.boss.y - 34, 12);
  }

  private applyChainStop(linked: readonly Enemy[]): void {
    const linkedActive = linked.filter((enemy) => enemy.active && enemy.linked);
    const fallback = this.nearestEnemy(this.hero.x, this.hero.y);
    const active = linkedActive.length > 0 ? linkedActive : fallback ? [fallback] : [];
    if (active.length === 0) return;
    const until = this.time.now + BALANCE.chain.linkStopDuration;
    for (const enemy of active) {
      enemy.freeze(until, enemy.kind === 'boss');
      const dealt = this.damageEnemy(enemy, BALANCE.chain.chainStopDamage, Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y), false, true, undefined, 'stop');
      this.combatStats.addChainDamage('chain-stop', dealt);
    }
    const sourceIds = new Set(active.map((enemy) => enemy.id));
    for (const projectile of this.projectiles) if (projectile.active && projectile.enemyOwned && projectile.sourceId && sourceIds.has(projectile.sourceId)) projectile.freeze(until);
    const anchor = active[0]; if (!anchor) return;
    for (const enemy of active.slice(1)) this.linkPulse(anchor, enemy, 0x9ef5e5);
    this.runeBurst(anchor.x, anchor.y - 10, 8);
  }

  private applyBackflow(projectiles: readonly Projectile[], stoppedTargets: readonly Enemy[]): void {
    let reflected = 0;
    for (const projectile of projectiles) {
      if (!projectile.active || !projectile.enemyOwned || projectile.reflected) continue;
      const original = [...this.enemies].find((enemy) => enemy.id === projectile.sourceId && enemy.active) ?? this.nearestEnemy(projectile.x, projectile.y);
      if (!original) continue;
      const echo = this.add.circle(projectile.x, projectile.y, 8, 0x58bfe0, 0.12).setStrokeStyle(2, 0x8ee9f4, 0.85).setDepth(DEPTH.word);
      this.tweens.add({ targets: echo, radius: 22, alpha: 0, duration: 230, onComplete: () => echo.destroy() });
      projectile.reflect(original.x, original.y, projectile.originalDamage * BALANCE.chain.backflowDamageRatio, true);
      reflected += 1;
    }
    const fallbackTargets = stoppedTargets.length > 0 ? stoppedTargets : this.nearestEnemy(this.hero.x, this.hero.y) ? [this.nearestEnemy(this.hero.x, this.hero.y)!] : [];
    if (reflected === 0) for (const enemy of fallbackTargets) {
      if (!enemy.active) continue;
      const dealt = this.damageEnemy(enemy, BALANCE.chain.minimumBackflowDamage, Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y), false, true, undefined, 'rewind');
      this.combatStats.addChainDamage('backflow', dealt); this.damageNumber(enemy.x, enemy.y - 48, dealt, 0x7edcf2, true, '역류 ');
    }
  }

  private applyDamageRegression(linked: readonly Enemy[]): void {
    const linkedActive = linked.filter((enemy) => enemy.active && enemy.linked);
    const fallback = this.nearestEnemy(this.hero.x, this.hero.y);
    const active = linkedActive.length > 0 ? linkedActive : fallback ? [fallback] : [];
    const anchor = active[0];
    active.forEach((enemy, index) => {
      const recorded = this.damageHistory.recentDamage(enemy.id, this.time.now, BALANCE.chain.damageHistoryDuration);
      const amount = Math.max(BALANCE.chain.minimumRegressionDamage, recorded * BALANCE.chain.damageRegressionRatio);
      this.runDelayedCall(index * 70, () => {
        if (!enemy.active) return;
        this.damageEnemy(enemy, amount, Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.x, enemy.y), false, true, undefined, 'regression', 'none', {
          handler: 'chain:damage-regression', baseSource: 'word', skillId: 'damage-regression', damageKind: 'regression',
          flags: ['echoDerived', 'cannotTriggerShare', 'cannotTriggerCard', 'cannotTriggerResonance'],
          onApplied: (dealt) => { if (dealt > 0) { this.combatStats.addChainDamage('damage-regression', dealt); this.damageNumber(enemy.x, enemy.y - 42, dealt, 0x70c6ea, true, '회귀 '); this.runeBurst(enemy.x, enemy.y - 6, 5); } },
        });
        if (anchor && anchor !== enemy && anchor.active) this.linkPulse(enemy, anchor, 0x64bfe1);
      });
    });
  }

  private damageEnemy(enemy: Enemy, amount: number, sourceAngle: number, parried = false, propagated = false, historyKind?: RecordedDamageKind, deathSource?: EnemyDeathSource, upgradeTrigger: 'cut' | 'word' | 'none' = 'none', context: DamageDispatchContext = {}): number {
    if (!enemy.active || enemy.health <= 0) return 0;
    const baseSource = context.baseSource ?? (parried || deathSource === 'parry' || deathSource === 'projectile-reflect' ? 'parry' : historyKind === 'word' ? 'word' : historyKind === 'attack' || upgradeTrigger === 'cut' ? 'cut' : 'other');
    const damageKind = context.damageKind ?? (propagated ? 'derived' : 'direct');
    const handler = context.handler ?? `${context.cardId ?? context.resonanceId ?? context.skillId ?? deathSource ?? historyKind ?? upgradeTrigger}:${damageKind}`;
    return this.damageQueue.submit({
      runId: this.runId,
      actId: this.runAct.current.id,
      frameId: this.damageFrameId,
      sourceEntityId: context.sourceEntityId ?? 'hero',
      targetEntityId: enemy.id,
      baseSource,
      skillId: context.skillId ?? (upgradeTrigger === 'cut' ? 'cut' : historyKind),
      cardId: context.cardId,
      resonanceId: context.resonanceId,
      modifierSourceIds: context.modifierSourceIds,
      damageKind,
      handler,
      flags: context.flags ?? (propagated ? ['shared', 'cannotTriggerShare'] : ['direct']),
    }, amount, () => this.applyDamageEnemyNow(enemy, amount, sourceAngle, parried, propagated, historyKind, deathSource, upgradeTrigger, context), context.onApplied);
  }

  private applyDamageEnemyNow(enemy: Enemy, amount: number, sourceAngle: number, parried: boolean, propagated: boolean, historyKind: RecordedDamageKind | undefined, deathSource: EnemyDeathSource | undefined, upgradeTrigger: 'cut' | 'word' | 'none', context: DamageDispatchContext): number {
    if (!enemy.active || enemy.health <= 0) return 0;
    let resolvedAmount = amount;
    const stitchPartnerId = this.stitchedPairs.get(enemy.id);
    const stitchPartner = stitchPartnerId ? [...this.enemies].find((candidate) => candidate.id === stitchPartnerId && candidate.active && !candidate.removing) : undefined;
    if (!propagated && stitchPartner) {
      if (upgradeTrigger === 'cut' || deathSource === 'link') {
        this.stitchedPairs.delete(enemy.id); this.stitchedPairs.delete(stitchPartner.id);
        enemy.setData('stitchedPartnerId', undefined); stitchPartner.setData('stitchedPartnerId', undefined);
        resolvedAmount *= 1.18; this.showCombatLabel((enemy.x + stitchPartner.x) / 2, (enemy.y + stitchPartner.y) / 2 - 34, '봉합 절단', 0xd68aa5);
      } else {
        const shared = Math.min(stitchPartner.health, Math.max(0, resolvedAmount * .2));
        if (shared > 0) {
          this.damageEnemy(stitchPartner, shared, sourceAngle, false, true, undefined, deathSource ?? 'other', 'none', {
            handler: `stitch-share:${enemy.id}`,
            sourceEntityId: enemy.id,
            baseSource: context.baseSource,
            skillId: context.skillId,
            modifierSourceIds: ['stitch-pair'],
            damageKind: 'shared',
            flags: ['shared', 'cannotTriggerShare', 'cannotTriggerCard', 'cannotTriggerResonance'],
            onApplied: (dealt) => { if (dealt > 0) this.damageNumber(stitchPartner.x, stitchPartner.y - 42, dealt, 0xcf8ba1, true, '봉합 '); },
          });
          resolvedAmount *= .8;
        }
      }
    }
    const inscription = counterInscriptionProfile(this.upgrades.getStack('counter-inscription'));
    if (!propagated && upgradeTrigger !== 'none' && inscription.damage > 0 && this.time.now <= Number(enemy.getData('counterInscriptionUntil') ?? 0)) {
      enemy.setData('counterInscriptionUntil', 0); resolvedAmount += inscription.damage;
      this.recordUpgradeContribution('counter-inscription', { activationCount: 0, damage: inscription.damage, hits: 1 }, true);
      this.showCombatLabel(enemy.x, enemy.y - 64, `반격 비문 +${inscription.damage}`, 0xa9f0da);
    }
    let totalDealt = 0;
    const activeLinks = [...this.linkedTargets].filter((target) => target.active && target.linked);
    const isolationStacks = this.upgrades.getStack('isolation-chain');
    const isolation = isolationChainProfile(isolationStacks);
    const adjustment = adjustLinkedIncomingDamage(resolvedAmount, enemy.linked, activeLinks.length, propagated, isolation.isolatedMultiplier);
    const isolated = adjustment.isolatedBonus > 0;
    const adjustedAmount = adjustment.adjustedAmount;
    const packets = distributeLinkedDamage(enemy.id, adjustedAmount, activeLinks.map((target) => ({ id: target.id, alive: target.active && target.health > 0 })), this.linkShareRatio, propagated);
    for (const packet of packets) {
      const target = packet.targetId === enemy.id ? enemy : activeLinks.find((item) => item.id === packet.targetId);
      if (!target?.active) continue;
      const resolvedSource: EnemyDeathSource = packet.propagated ? 'link' : deathSource ?? (parried ? 'parry' : historyKind === 'attack' ? 'attack' : historyKind === 'word' ? 'word' : 'other');
      const dealt = target.takeDamage(packet.amount, sourceAngle, parried && !packet.propagated, resolvedSource);
      if (dealt > 0) {
        if (!this.enemyFirstDamageAt.has(target.id)) this.enemyFirstDamageAt.set(target.id, performance.now());
        totalDealt += dealt;
        if (!packet.propagated && historyKind) this.damageHistory.record(this.time.now, target.id, dealt, historyKind);
        this.damageNumber(target.x, target.y - 40, dealt, packet.propagated ? 0x72e1cd : 0xf1d7a8, packet.propagated, packet.propagated ? '공유 ' : '');
        if (packet.propagated) { this.linkPulse(enemy, target); this.combatStats.linkSharedDamage(dealt); }
        if (isolated && target === enemy) {
          const bonus = dealt * adjustment.isolatedBonus / Math.max(0.001, adjustment.adjustedAmount);
          this.combatStats.linkIsolatedBonus(bonus);
          if (bonus >= 1) this.damageNumber(target.x + 15, target.y - 52, bonus, 0x91ead7, true, '고립 +');
          if (isolationStacks > 0) this.recordUpgradeContribution('isolation-chain', { activationCount: 0, damage: Math.min(bonus, resolvedAmount * isolationStacks * 0.1), hits: 1 });
        }
      }
    }
    if (!propagated && totalDealt > 0 && enemy.active && context.skillId !== 'mark-explosion') this.advanceMark(enemy, sourceAngle);
    return totalDealt;
  }

  private advanceMark(enemy: Enemy, sourceAngle: number): void {
    const marked = this.wordStatuses.get(enemy.id, 'MARKED', this.time.now); if (!marked) return;
    const profile = deepMarkProfile(this.upgrades.getStack('deep-mark'));
    const nextStacks = marked.stacks + 1;
    if (nextStacks < profile.maximumStacks) { this.applyWordStatus(enemy, 'MARKED', 'mark', Math.max(400, marked.expiresAt - this.time.now)); return; }
    this.wordStatuses.consume(enemy.id, 'MARKED');
    const baseDamage = profile.explosionDamage;
    this.damageEnemy(enemy, baseDamage, sourceAngle, false, true, undefined, 'word', 'none', {
      handler: `mark-explosion:${enemy.id}`, baseSource: 'word', skillId: 'mark-explosion', cardId: this.upgrades.getStack('deep-mark') > 0 ? 'deep-mark' : undefined, damageKind: 'reaction', flags: ['cardDerived', 'cannotTriggerCard', 'cannotTriggerShare', 'cannotTriggerResonance'],
      onApplied: (dealt) => { if (dealt <= 0) return; this.combatStats.reactionDamage('cut-marked', dealt); if (this.upgrades.getStack('deep-mark') > 0) this.recordUpgradeContribution('deep-mark', { activationCount: 1, damage: Math.min(dealt, profile.explosionDamage - 24), affectedTargets: 1, hits: 1 }, true); this.damageNumber(enemy.x, enemy.y - 58, dealt, 0xa7ecd1, true, '각인 폭발 '); },
    });
    if (this.upgrades.hasResonance('mark-chain') && enemy.linked) {
      const linked = [...this.linkedTargets].filter((target) => target !== enemy && target.active && !target.removing).slice(0, 2);
      for (const target of linked) this.applyWordStatus(target, 'MARKED', 'mark', 2600, 1);
      this.recordResonanceContribution('mark-chain', { activationCount: linked.length > 0 ? 1 : 0, affectedTargets: linked.length, failedConditions: linked.length > 0 ? 0 : 1 });
    }
  }

  private onEnemyDied(enemy: Enemy, source: EnemyDeathSource): void {
    if (Number(enemy.getData('runId')) !== this.runId) return;
    const wasMarked = this.wordStatuses.has(enemy.id, 'MARKED', this.time.now);
    const wasIsolated = enemy.linked && [...this.linkedTargets].filter((target) => target.active && target.linked).length === 1;
    const completedPhaseThreeLink = enemy.kind === 'minion' && enemy.linked && this.boss?.active === true && this.boss.phase === 3 && this.boss.linked;
    this.enemies.delete(enemy); this.linkedTargets.delete(enemy); this.linkMarkers.get(enemy)?.destroy(); this.linkMarkers.delete(enemy); this.wordStatuses.removeEntity(enemy.id);
    if (enemy.getData('waveTracked') === true) this.waveDirector.registerDeath(enemy.id, source, performance.now());
    const spawned = this.enemySpawnTimes.get(enemy.id);
    if (spawned) {
      const engagedAt = this.enemyFirstDamageAt.get(enemy.id) ?? spawned.at;
      this.combatStats.enemyTtk(spawned.kind, (performance.now() - engagedAt) / 1000);
      this.enemySpawnTimes.delete(enemy.id); this.enemyFirstDamageAt.delete(enemy.id);
    }
    if (this.currentTarget === enemy) { this.currentTarget = undefined; this.targetMarkerUntil = 0; }
    if (this.heldAttackTarget === enemy) this.heldAttackTarget = undefined;
    const scoreValue = enemy.kind === 'minion' ? 80 : BALANCE.enemies[enemy.kind].score; this.score += scoreValue;
    this.gainSentence(BALANCE.sentence.killGain);
    if (enemy.linked) {
      const stacks = this.upgrades.getStack('link-overload'); const isolationStacks = wasIsolated ? this.upgrades.getStack('isolation-chain') : 0;
      const isolation = isolationChainProfile(isolationStacks);
      const radius = 76 + stacks * 24; const baseDamage = 22 + stacks * 12;
      const burst = this.add.circle(enemy.x, enemy.y, 18, 0x55c8b1, 0.16).setStrokeStyle(4, 0x9af3df, 0.88).setDepth(DEPTH.word);
      this.tweens.add({ targets: burst, radius, alpha: 0, duration: 260, onComplete: () => burst.destroy() });
      this.runeBurst(enemy.x, enemy.y, 8 + stacks * 3);
      let queuedExplosionPackets = 0;
      for (const target of [...this.enemies]) {
        if (distanceSq(enemy.x, enemy.y, target.x, target.y) >= radius ** 2) continue;
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
        queuedExplosionPackets += 1;
        this.damageEnemy(target, baseDamage, angle, false, true, undefined, 'link', 'none', {
          handler: `link-death-explosion:${enemy.id}`,
          sourceEntityId: enemy.id,
          baseSource: 'word',
          skillId: 'link-death-explosion',
          damageKind: 'shared',
          flags: ['shared', 'cannotTriggerShare', 'cannotTriggerCard', 'cannotTriggerResonance'],
          onApplied: (dealt) => {
            if (dealt <= 0) return;
            this.combatStats.linkExplosionDamage(dealt); this.combatStats.agencyDamage('link', dealt);
            this.damageNumber(target.x, target.y - 48, dealt, 0x8ee6d5, true, '연결 폭발 ');
          },
        });
        if (isolation.explosionBonus <= 0 || !target.active || target.removing) continue;
        this.damageEnemy(target, isolation.explosionBonus, angle, false, true, undefined, 'link', 'none', {
          handler: `isolation-death-explosion:${enemy.id}`,
          sourceEntityId: enemy.id,
          baseSource: 'word',
          skillId: 'isolation-chain',
          cardId: 'isolation-chain',
          damageKind: 'card-derived',
          flags: ['cardDerived', 'cannotTriggerShare', 'cannotTriggerCard', 'cannotTriggerResonance'],
          onApplied: (dealt) => {
            if (dealt <= 0) return;
            this.combatStats.linkExplosionDamage(dealt);
            this.recordUpgradeContribution('isolation-chain', { activationCount: 0, damage: dealt, affectedTargets: 1, hits: 1, exclusiveDamage: true });
          },
        });
      }
      if (isolationStacks > 0) this.recordUpgradeContribution('isolation-chain', {
        activationCount: 1,
        generated: 1,
        failedConditions: queuedExplosionPackets > 0 ? 0 : 1,
      }, true);
      if (queuedExplosionPackets > 0) this.showCombatLabel(enemy.x, enemy.y - 40, '연결 폭발', 0x8ee6d5);
      if (this.upgrades.getStack('inscription-spread') > 0) {
        const nearest = this.nearestEnemy(enemy.x, enemy.y); if (nearest) { nearest.linked = true; nearest.linkedUntil = this.time.now + 2000; this.linkedTargets.add(nearest); }
      }
      this.spreadLinkContagion(enemy);
    }
    if (wasMarked) this.spreadContagiousMark(enemy);
    if (completedPhaseThreeLink) this.rewardBossMechanic('이어진 핵 노출');
    if (enemy === this.boss) { this.runSession.clearBoss(this.runId, true); this.boss = undefined; this.beginBossDefeated(enemy); }
  }

  private spreadContagiousMark(source: Enemy): void {
    if (this.upgrades.getStack('contagious-mark') <= 0) return;
    const targets = [...this.enemies].filter((enemy) => enemy.active && !enemy.removing && distanceSq(source.x, source.y, enemy.x, enemy.y) <= 190 ** 2)
      .sort((a, b) => distanceSq(source.x, source.y, a.x, a.y) - distanceSq(source.x, source.y, b.x, b.y)).slice(0, 2);
    for (const target of targets) this.applyWordStatus(target, 'MARKED', 'mark', 3200);
    this.recordUpgradeContribution('contagious-mark', { activationCount: targets.length > 0 ? 1 : 0, generated: targets.length, affectedTargets: targets.length, failedConditions: targets.length > 0 ? 0 : 1 }, targets.length > 0);
  }

  private spreadLinkContagion(source: Enemy): void {
    const profile = linkContagionProfile(this.upgrades.getStack('link-contagion'));
    const generation = Number(source.getData('linkContagionGeneration') ?? 0);
    if (profile.targets <= 0 || generation >= profile.maximumGeneration) return;
    const targets = [...this.enemies].filter((enemy) => enemy.active && !enemy.removing && !enemy.linked)
      .sort((first, second) => distanceSq(source.x, source.y, first.x, first.y) - distanceSq(source.x, source.y, second.x, second.y))
      .filter((enemy) => distanceSq(source.x, source.y, enemy.x, enemy.y) <= 190 ** 2).slice(0, profile.targets);
    for (const target of targets) {
      target.linked = true; target.linkedUntil = this.time.now + profile.duration; target.setData('linkContagionGeneration', generation + 1); this.linkedTargets.add(target);
      const marker = this.add.text(target.x, target.y - (target.kind === 'boss' ? 78 : 48), '傳', { fontFamily: 'Malgun Gothic, serif', fontSize: '15px', color: '#8ee9d3', stroke: '#09201d', strokeThickness: 4 }).setOrigin(.5).setDepth(DEPTH.word);
      this.linkMarkers.set(target, marker); this.linkPulse(source, target, 0x72d7bd);
    }
    if (targets.length > 0) { this.recordUpgradeContribution('link-contagion', { activationCount: 1, generated: targets.length, affectedTargets: targets.length }, true); this.showCombatLabel(source.x, source.y - 54, `연결 전염 ${targets.length}`, 0x80e3c8); }
  }

  private updateWaveLifecycle(): void {
    if (this.flow.baseState !== 'WAVE_COMBAT' || this.boss?.active) return;
    if (this.waveDirector.snapshot().waveState === 'IDLE') return;
    const directorBefore = this.waveDirector.snapshot();
    if (this.activeBatchPendingSpawns === 0 && directorBefore.livingEnemyIds.length === 0 && directorBefore.pendingSpawnCount > 0 && this.nextBatchIndex < this.currentWaveBatches.length) {
      this.miniWaveReadyAt ||= this.time.now + BALANCE.pacing.miniWaveIntermission;
      if (this.time.now >= this.miniWaveReadyAt) this.spawnNextMiniWave(this.waveSpawnGeneration);
      return;
    }
    const actual: WaveEnemySnapshot[] = [...this.enemies].map((enemy) => ({
      id: enemy.id,
      active: enemy.active,
      visible: enemy.visible,
      alive: enemy.health > 0 && !enemy.removing,
      destroyed: !enemy.active,
      tracked: enemy.getData('waveTracked') === true,
      x: enemy.x,
      y: enemy.y,
      insideBounds: groundFootprintInsideBounds(enemy.groundPoint, enemyGroundExtents(enemy.kind), COMBAT_BOUNDS),
    }));
    const evaluation = this.waveDirector.evaluate(performance.now(), actual);
    for (const id of evaluation.outsideBounds) {
      const enemy = [...this.enemies].find((candidate) => candidate.id === id);
      if (enemy?.active) enemy.constrainToCombatBounds();
    }
    for (const id of evaluation.staleRemoved) {
      const enemy = [...this.enemies].find((candidate) => candidate.id === id);
      if (enemy && !enemy.active) this.enemies.delete(enemy);
    }
    if (import.meta.env.DEV && (evaluation.staleRemoved.length > 0 || evaluation.unregisteredAdded.length > 0 || evaluation.outsideBounds.length > 0)) {
      const now = performance.now();
      if (now - this.lastWaveDiagnosticAt >= 250) {
        this.lastWaveDiagnosticAt = now;
        console.warn('[STABILITY-01R wave reconciliation]', { evaluation, director: this.waveDirector.snapshot(), actual, flow: this.flow.state, tokens: this.timeControl.snapshot().activeReasons });
      }
    }
    if (evaluation.shouldTransition) this.completeWave();
  }

  private completeWave(): void {
    if (this.flow.baseState !== 'WAVE_COMBAT' || this.boss?.active) return;
    if (!this.transitionFlow('WAVE_CLEAR')) return;
    this.clearTransientCombatObjects();
    const encounter = (['wave-1', 'wave-2', 'wave-3'] as const)[this.waveIndex];
    if (encounter) this.combatStats.setEncounterTime(encounter, Math.max(0, (this.time.now - this.encounterStartedAt) / 1000));
    const healthBefore = this.hero.health;
    let recovery = this.hero.maxHealth * BALANCE.pacing.roundHealRatio;
    if (this.waveIndex === 0) recovery = Math.max(recovery, BALANCE.pacing.firstRoundMinimumHealth - healthBefore);
    const restored = Math.max(0, Math.min(this.hero.maxHealth - healthBefore, recovery));
    if (restored > 0) { this.hero.heal(restored); this.damageNumber(this.hero.x, this.hero.y - 58, restored, 0x8de5d3, false, '+회복 '); }
    if (this.waveIndex === 0) this.combatStats.firstRound(Math.max(0, (this.time.now - this.encounterStartedAt) / 1000), healthBefore, this.hero.health);
    this.wordChain.reset();
    for (const projectile of this.projectiles) projectile.destroy(); this.projectiles.clear();
    this.inkZones.forEach((zone) => zone.circle.destroy()); this.inkZones = [];
    for (const enemy of this.enemies) enemy.cancelAttackIntent(this.time.now + 1000);
    this.runTimeout(BALANCE.pacing.waveCompleteDelay, () => {
      if (!this.sys.isActive() || this.flow.baseState !== 'WAVE_CLEAR') return;
      const completedWave = this.runAct.current.waves[this.waveIndex];
      if (completedWave && !completedWave.reward) {
        this.waveIndex += 1;
        if (this.waveIndex < this.runAct.current.waves.length) this.enterWave(this.waveIndex);
        else this.startBoss();
        return;
      }
      this.timeControl.acquire('REWARD_SCREEN', this.timeOwner);
      if (this.transitionFlow('REWARD_REVEAL')) this.showUpgradeChoices();
    });
  }

  private showUpgradeChoices(forcedChoices?: ReturnType<UpgradeSystem['choices']>, bossReward = false): void {
    const revealState: BaseGameFlowState = bossReward ? 'BOSS_REWARD_REVEAL' : 'REWARD_REVEAL';
    const selectState: BaseGameFlowState = bossReward ? 'BOSS_REWARD_SELECT' : 'REWARD_SELECT';
    const snapshot = this.combatStats.snapshot();
    const selectionContext = {
      parryUses: snapshot.parryAttempts,
      wordUses: Object.values(snapshot.wordUses).reduce((sum, count) => sum + count, 0),
      echoDamage: snapshot.echoBlade.damage,
      cutUses: snapshot.cut.uses,
      healthRatio: this.hero.health / Math.max(1, this.hero.maxHealth),
      equippedWordIds: this.wordLoadout.finalize(),
    };
    const choices = forcedChoices ?? (bossReward ? this.upgrades.bossChoices(Math.random, selectionContext) : this.waveIndex === 0 && this.runAct.current.index === 1 ? this.upgrades.firstChoices(Math.random, selectionContext) : this.upgrades.choices(3, Math.random, selectionContext));
    this.services.ui.showUpgradeChoice(choices, this.upgrades.rerollsLeft, (id) => {
      if (!this.flow.allowsRewardInput) return;
      const resonancesBefore = new Set(this.upgrades.activeResonances());
      if (!this.upgrades.add(id)) { this.transitionFlow(revealState); this.showUpgradeChoices(undefined, bossReward); return; }
      this.upgrades.recordSelection(id);
      const chosen = choices.find((choice) => choice.id === id); if (chosen) {
        const stacks = this.upgrades.getStack(id);
        this.services.ui.showChainTrigger(`${chosen.name} ×${stacks} · ${upgradeDescription(chosen, stacks)}`, 1100);
      }
      const completed = this.upgrades.activeResonances().filter((resonance) => !resonancesBefore.has(resonance));
      if (completed.length > 0) this.runTimeout(480, () => {
        const resonance = resonanceById(completed[0] ?? ''); if (resonance) this.services.ui.showChainTrigger(`공명 완성 · ${resonance.name}`, 1200);
      });
      if (bossReward) {
        this.timeControl.release('REWARD_SCREEN', this.timeOwner);
        this.beginNextAct();
        return;
      }
      this.waveIndex += 1;
      if (this.waveIndex < this.runAct.current.waves.length) {
        this.timeControl.release('REWARD_SCREEN', this.timeOwner); this.services.ui.showHud(); this.enterWave(this.waveIndex);
      } else {
        this.startBoss(); this.timeControl.release('REWARD_SCREEN', this.timeOwner);
      }
    }, () => {
      if (!this.flow.allowsRewardInput || this.upgrades.rerollsLeft <= 0) return;
      const rerolled = this.upgrades.reroll(Math.random, selectionContext); if (!rerolled) return;
      this.transitionFlow(revealState); this.showUpgradeChoices(rerolled, bossReward);
    }, {
      revealDelayMs: BALANCE.pacing.rewardRevealDelay,
      acceptsKey: (event) => this.inputRouter.accepts('REWARD', event.code, event.repeat),
      onReady: () => { if (this.flow.baseState === revealState) this.transitionFlow(selectState); },
      previewChoice: (id) => this.upgrades.preview(id),
      eyebrow: bossReward ? '보스의 문장이 풀려난다' : undefined,
      title: bossReward ? '보스 기록 계승' : undefined,
      kind: bossReward ? 'boss' : 'wave',
    });
  }

  private startBoss(): void {
    if (this.flow.baseState !== 'BOSS_INTRO' && !this.transitionFlow('BOSS_INTRO')) return;
    this.waveDirector.reset();
    this.encounterStartedAt = this.time.now;
    this.bossPhaseStartedAt = this.time.now;
    this.bossSignatureExecutions.clear();
    this.stopReadyAt = this.time.now;
    this.rewindReadyAt = this.time.now; this.linkReadyAt = this.time.now;
    this.sentence = Math.max(this.sentence, BALANCE.boss.phaseSentenceMinimum);
    this.timeControl.acquire('BOSS_TRANSITION', this.timeOwner); this.firstHitAvailable = true;
    if (this.hero.health < BALANCE.boss.entryMinimumHealth) {
      const restored = BALANCE.boss.entryMinimumHealth - this.hero.health;
      this.hero.heal(restored); this.damageNumber(this.hero.x, this.hero.y - 58, restored, 0x8de5d3, false, '+');
    }
    this.showWordTypography(this.runAct.current.bossName, 480, 150, true);
    const bossRunId = this.runId;
    const callbacks: BossCallbacks = {
      ...this.enemyCallbacks(),
      phaseChanged: (phase) => { this.runSession.invoke(bossRunId, () => this.bossPhaseChanged(phase)); },
      signatureExecuted: (phase, signaturePattern) => {
        this.runSession.invoke(bossRunId, () => {
          if (String(this.boss?.getData('actId')) !== this.runAct.current.id) return;
          this.bossSignatureExecutions.add(this.runAct.current.bossId + ':' + phase + ':' + signaturePattern);
        });
      },
      summon: (count) => { this.runSession.invoke(bossRunId, () => this.summonMinions(count)); },
      inkZone: (x, y, radius, duration, style = 'ink') => { this.runSession.invoke(bossRunId, () => this.createInkZone(x, y, radius, duration, style)); },
    };
    this.boss = new Boss(this, 480, 125, callbacks, this.runAct.current.bossId, this.runAct.current.healthMultiplier); this.boss.setData('runId', this.runId); this.boss.setData('actId', this.runAct.current.id); this.boss.setData('damageMultiplier', this.runAct.current.damageMultiplier); this.enemies.add(this.boss); this.boss.spawn();
    this.runSession.activateBoss(this.runId, this.boss.id, this.boss.phaseHealth, this.boss.phaseMaxHealth);
    this.bossTransitionUntil = this.time.now + 1000; this.hero.invulnerableUntil = Math.max(this.hero.invulnerableUntil, this.bossTransitionUntil + 100);
    this.boss.cancelAttackIntent(this.bossTransitionUntil); this.separateHeroFromBoss();
    this.runDelayedCall(1000, () => {
      if (!this.sys.isActive() || this.flow.baseState !== 'BOSS_INTRO') return;
      this.bossPhaseStartedAt = this.time.now;
      this.timeControl.release('BOSS_TRANSITION', this.timeOwner); this.transitionFlow('BOSS_COMBAT');
    });
  }

  private bossPhaseChanged(phase: number): void {
    if (!this.boss?.active || Number(this.boss.getData('runId')) !== this.runId) return;
    this.runSession.updateBoss(this.runId, { phase: phase as 1 | 2 | 3, health: this.boss.phaseHealth, maxHealth: this.boss.phaseMaxHealth });
    if (!this.transitionFlow('BOSS_TRANSITION')) return;
    const previousPhase = Math.max(1, phase - 1) as 1 | 2;
    this.combatStats.setBossPhaseTime(previousPhase, Math.max(0, (this.time.now - this.bossPhaseStartedAt) / 1000));
    this.timeControl.acquire('BOSS_TRANSITION', this.timeOwner);
    this.bossTransitionUntil = this.time.now + BALANCE.boss.phaseTransition;
    this.hero.invulnerableUntil = Math.max(this.hero.invulnerableUntil, this.bossTransitionUntil + 100);
    this.bufferedAction = undefined; this.wordChain.reset();
    this.sentence = Math.max(this.sentence, BALANCE.boss.phaseSentenceMinimum);
    if (phase === 2) this.rewindReadyAt = this.time.now;
    if (phase === 3) this.linkReadyAt = this.time.now;
    for (const projectile of this.projectiles) projectile.destroy(); this.projectiles.clear();
    this.inkZones.forEach((zone) => zone.circle.destroy()); this.inkZones = [];
    for (const enemy of this.enemies) enemy.cancelAttackIntent(this.bossTransitionUntil);
    this.separateHeroFromBoss();
    this.services.audio.play('phase'); this.cameraKick(0.012, 260);
    if (!this.services.save.settings.reducedMotion) { this.cameras.main.zoomTo(1.08, 280); this.runDelayedCall(520, () => this.cameras.main.zoomTo(1, 420)); }
    this.runeBurst(480, 155, 14);
    const phaseDefinition = this.boss.definition.phaseDefinitions[phase - 1];
    this.showWordTypography(phaseDefinition?.displayName ?? ('제' + phase + '형'), 480, 170, true);
    this.runDelayedCall(BALANCE.boss.phaseTransition, () => {
      if (!this.sys.isActive() || this.flow.baseState !== 'BOSS_TRANSITION') return;
      this.bossPhaseStartedAt = this.time.now;
      this.timeControl.release('BOSS_TRANSITION', this.timeOwner); this.transitionFlow('BOSS_COMBAT');
    });
  }

  private summonMinions(count: number): void {
    const positions = this.spawnPositions(count).slice(0, count); positions.forEach((position) => this.spawnEnemy('minion', position.x, position.y));
  }

  private createInkZone(x: number, y: number, radius: number, duration: number, style: 'ink' | 'erasure' = 'ink', damage = 10, patternName = style === 'erasure' ? '과거 교정' : '먹물 장판', modifier?: string): void {
    const safe = clampPointToBounds(x, y, COMBAT_BOUNDS, radius + 4); x = safe.x; y = safe.y;
    const fill = style === 'erasure' ? 0x45152f : 0x2f1517;
    const stroke = style === 'erasure' ? 0xd05d8c : 0xef914f;
    const circle = this.add.circle(x, y, radius, fill, 0.34).setStrokeStyle(4, stroke, 0.82).setDepth(DEPTH.floor).setScale(0.15).setData('unparryable', true);
    this.tweens.add({ targets: circle, scale: 1, duration: 520 });
    this.inkZones.push({ circle, expiresAt: this.time.now + duration, nextDamageAt: this.time.now + 650, radius, damage, style, patternName, modifier });
  }

  private updateInkZones(time: number): void {
    this.inkZones = this.inkZones.filter((zone) => {
      if (time >= zone.expiresAt) { zone.circle.destroy(); return false; }
      const remaining = zone.expiresAt - time;
      const pulse = remaining < 520 ? Math.sin(time / 45) * 0.14 : Math.sin(time / 170) * 0.08;
      zone.circle.setAlpha(0.28 + pulse).setScale(remaining < 520 ? 0.92 + Math.sin(time / 55) * 0.05 : 1);
      if (time >= zone.nextDamageAt && distanceSq(zone.circle.x, zone.circle.y, this.hero.hurtbox.x, this.hero.hurtbox.y) < zone.radius ** 2) {
        this.hitHero(zone.damage, zone.circle.x, zone.circle.y, 'ink', { attackerId: 'environment', attackId: `zone:${zone.patternName}`, patternName: zone.patternName, modifier: zone.modifier, parryable: false }); zone.nextDamageAt = time + 900;
      }
      return true;
    });
  }

  private checkProjectileCollision(projectile: Projectile): void {
    if (!projectile.active) return;
    if (projectile.enemyOwned) {
      const hit = sweptCircleHitsEllipse(projectile.previousPosition, projectile, projectile.collisionCircle.radius, this.hero.hurtbox);
      const distance = Phaser.Math.Distance.Between(projectile.x, projectile.y, this.hero.hurtbox.x, this.hero.hurtbox.y);
      if (hit) {
        const parry = this.parryResolver.resolve(this.hero.isParrying, { attackId: projectile.attackId, parryable: projectile.parryable, overlapsHurtbox: true });
        if (parry.cancelDamage) { if (parry.grantReward) this.parrySuccess(undefined, projectile); }
        else { const sourceEnemy = [...this.enemies].find((enemy) => enemy.id === projectile.sourceId); this.hitHero(projectile.damage, projectile.x, projectile.y, 'projectile', { attackerId: projectile.sourceId ?? 'unknown-projectile', attackerDisplayName: sourceEnemy ? enemyDisplayName(sourceEnemy.kind) : '기록 탄환', attackId: projectile.attackId, patternName: projectile.texture.key === 'projectile-ink' ? '먹물 탄환' : '기록 탄환', modifier: this.activeActPatterns.has('ink-echo-projectile') ? '먹물 잔향탄' : undefined, parryable: projectile.parryable }); projectile.destroy(); }
      } else if (distance < 39 && !projectile.getData('nearMiss')) { projectile.setData('nearMiss', true); this.gainSentence(BALANCE.sentence.nearMissGain); }
    } else {
      for (const enemy of [...this.enemies]) if (enemy.active && !enemy.removing && sweptCircleHitsEllipse(projectile.previousPosition, projectile, projectile.collisionCircle.radius, enemy.hurtbox)) {
        const reflectedStopBonus = enemy === this.boss && this.boss.phase === 1 && projectile.reflected ? BALANCE.boss.reflectedPhaseOneMultiplier : 1;
        const projectileDamage = this.damageEnemy(enemy, projectile.damage * reflectedStopBonus, projectile.rotation, false, false, undefined, 'projectile-reflect');
        const echoBladeBackflow = Boolean(projectile.getData('echoBladeBackflow'));
        const timeUndertow = Boolean(projectile.getData('timeUndertow'));
        const chainBackflow = Boolean(projectile.getData('chainBackflow'));
        if (echoBladeBackflow && projectileDamage > 0) this.recordUpgradeContribution('backflow-blade', { activationCount: 0, damage: projectileDamage, affectedTargets: 1, hits: 1, exclusiveDamage: true });
        if (timeUndertow && projectileDamage > 0) this.recordResonanceContribution('time-undertow', { activationCount: 0, damage: projectileDamage, affectedTargets: 1, hits: 1, exclusiveDamage: true });
        if (chainBackflow) this.combatStats.addChainDamage('backflow', projectileDamage);
        if (projectile.reflected && !echoBladeBackflow && !timeUndertow && !chainBackflow) this.combatStats.parryDamage(projectileDamage);
        if (enemy === this.boss && this.boss.phase === 1 && projectile.reflected) this.rewardBossMechanic('역류 핵 노출');
        if (projectile.getData('chainBackflow') && this.upgrades.getStack('backflow-shards') > 0) this.applyBackflowShards(enemy, projectile.damage, projectile.rotation);
        if (projectile.reflected && this.upgrades.getStack('fragment-recovery') > 0) {
          const before = this.hero.health; this.hero.heal(this.upgrades.getStack('fragment-recovery') * 4); const healing = this.hero.health - before;
          if (healing > 0) this.recordUpgradeContribution('fragment-recovery', { activationCount: 1, healing }, true);
        }
        projectile.destroy(); break;
      }
    }
  }

  private checkMeleeCollisions(time: number): void {
    for (const enemy of this.enemies) {
      if (enemy.attackActiveUntil <= time || !enemy.spawned) continue;
      if (!sweptCircleHitsEllipse(enemy.previousGroundPoint, enemy.groundPoint, enemy.meleeHitRadius, this.hero.hurtbox)) continue;
      const parry = this.parryResolver.resolve(this.hero.isParrying, { attackId: enemy.meleeAttackId, parryable: enemy.meleeParryable, overlapsHurtbox: true });
      // A resolved melee contact ends the dash. Leaving its velocity active for
      // the remaining attack timer lets the attacker travel through the hero
      // and creates a deep overlap that can pin movement on following frames.
      enemy.cancelAttackIntent(time + 120);
      if (parry.cancelDamage) { if (parry.grantReward) this.parrySuccess(enemy); }
      else this.hitHero(Number(enemy.getData('meleeDamage') ?? BALANCE.enemies[enemy.kind === 'minion' ? 'chaser' : enemy.kind].damage), enemy.x, enemy.y, enemy.kind === 'boss' ? 'boss' : 'melee', { attackerId: enemy.id, attackerDisplayName: enemy.kind === 'boss' ? this.boss?.definition.displayName ?? '보스' : enemyDisplayName(enemy.kind), attackId: enemy.meleeAttackId, patternName: enemy.kind === 'boss' ? `${this.boss?.definition.displayName ?? '보스'} 돌진` : `${enemyDisplayName(enemy.kind)} · 돌진`, parryable: enemy.meleeParryable });
    }
  }

  private applyBackflowShards(primary: Enemy, sourceDamage: number, angle: number): void {
    const shards = [...this.enemies]
      .filter((enemy) => enemy !== primary && enemy.active && !enemy.removing && distanceSq(primary.x, primary.y, enemy.x, enemy.y) <= 150 ** 2)
      .sort((first, second) => distanceSq(primary.x, primary.y, first.x, first.y) - distanceSq(primary.x, primary.y, second.x, second.y))
      .slice(0, 2);
    for (const [index, target] of shards.entries()) this.runDelayedCall(index * 45, () => {
      if (!target.active || target.removing) return;
      const shardAngle = Phaser.Math.Angle.Between(primary.x, primary.y, target.x, target.y);
      const glyph = this.add.rectangle(primary.x, primary.y - 10, 13, 3, 0x7fe7f2, 0.9).setRotation(shardAngle).setDepth(DEPTH.projectile);
      this.tweens.add({ targets: glyph, x: target.x, y: target.y - 18, alpha: 0, duration: 150, onComplete: () => glyph.destroy() });
      const dealt = this.damageEnemy(target, sourceDamage * 0.4, angle, false, true, undefined, 'projectile-reflect');
      this.combatStats.addChainDamage('backflow', dealt);
      if (dealt > 0) this.recordUpgradeContribution('backflow-shards', { damage: dealt, generated: 1 });
    });
  }

  private hitHero(baseDamage: number, sourceX: number, sourceY: number, source: DamageSource = 'other', context: HeroDamageContext = { attackerId: 'unknown', attackId: 'unknown', patternName: '알 수 없는 피해', parryable: false }): void {
    if (this.flow.baseState === 'ACT_CLEAR' || this.flow.baseState === 'BOSS_REWARD' || this.flow.baseState === 'ACT_TRANSITION' || this.flow.baseState === 'RUN_OVER' || this.flow.baseState === 'RESULT') return;
    if (this.qaMode || this.debugInvulnerable || this.time.now < this.bossTransitionUntil) return;
    let damage = baseDamage;
    if (this.tutorialEnabled && this.tutorialIndex < this.tutorialSteps.length) damage *= 0.45;
    if (this.time.now < this.headwindGuardUntil) {
      const veil = headwindVeilProfile(this.upgrades.getStack('headwind-veil'));
      const beforeVeil = damage; damage *= Math.max(.45, 1 - veil.reduction);
      this.recordUpgradeContribution('headwind-veil', { preventedDamage: beforeVeil - damage }, beforeVeil > damage);
    }
    const cloak = this.upgrades.getStack('ink-cloak');
    if (this.firstHitAvailable && cloak > 0) {
      const beforeCloak = damage; damage *= Math.max(0.4, 1 - cloak * 0.35); this.firstHitAvailable = false;
      this.recordUpgradeContribution('ink-cloak', { activationCount: 1, preventedDamage: beforeCloak - damage }, true);
      const shield = this.add.ellipse(this.hero.hurtbox.x, this.hero.hurtbox.y, 56, 72, 0x253b39, .18).setStrokeStyle(3, 0x819d96, .78).setDepth(DEPTH.melee);
      this.tweens.add({ targets: shield, scaleX: 1.25, scaleY: 1.25, alpha: 0, duration: 260, onComplete: () => shield.destroy() });
    }
    const dealt = this.hero.takeDamage(damage, sourceX, sourceY); if (dealt <= 0) return;
    this.lastHitAt = performance.now();
    this.damageTaken += dealt; this.combatStats.damageTaken(source, dealt);
    this.combatStats.playerDamage({ time: this.time.now, attackerId: context.attackerId, attackerDisplayName: context.attackerDisplayName ?? (context.attackerId === 'environment' ? '환경' : '알 수 없는 공격자'), attackId: context.attackId, patternName: context.patternName, modifier: context.modifier, amount: dealt, act: this.runAct.current.index, wave: this.boss?.active ? `Boss P${this.boss.phase}` : this.runAct.current.waves[this.waveIndex]?.label ?? `Wave ${this.waveIndex + 1}`, x: this.hero.x, y: this.hero.y, parryable: context.parryable });
    this.services.audio.play('hurt'); this.cameraKick(0.006, 110); this.showDamageVignette(dealt);
    if (this.hero.health > 0 && this.hero.health <= this.hero.maxHealth * 0.22) this.services.audio.play('critical');
    if (this.hero.health <= 0) this.beginDeathSequence();
  }

  private beginDeathSequence(): void {
    if (this.deathSequenceStarted) return;
    this.deathSequenceStarted = true; this.hero.controlsLocked = true; this.clearCombatInput();
    const last = this.combatStats.snapshot().recentPlayerDamage.at(-1);
    if (last) this.showCombatLabel(this.hero.x, this.hero.y - 72, `마지막 피해 · ${last.patternName} ${Math.round(last.amount)}`, 0xf09a78);
    this.timeControl.acquire('DEATH_SLOWMO', this.timeOwner);
    this.runTimeout(720, () => { this.timeControl.release('DEATH_SLOWMO', this.timeOwner); this.finishRun(false); });
  }

  private recordState(time: number): void {
    if (this.hero.rewinding || !this.flow.allowsCombatSimulation) return;
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    this.rewind.push({ time, x: this.hero.x, y: this.hero.y, health: this.hero.health, velocityX: body.velocity.x, velocityY: body.velocity.y, facing: this.hero.facing });
    this.attacks = this.attacks.filter((attack) => attack.time >= time - BALANCE.words.rewindDuration - 300);
  }

  private updateLinks(time: number): void {
    this.linkGraphics?.clear();
    const active = [...this.linkedTargets].filter((enemy) => enemy.active && enemy.linked && enemy.linkedUntil > time);
    for (const enemy of active) if (!this.linkMarkers.has(enemy)) {
      const marker = this.add.text(enemy.x, enemy.y - (enemy.kind === 'boss' ? 78 : 48), '連', { fontFamily: 'Malgun Gothic, serif', fontSize: enemy.kind === 'boss' ? '19px' : '15px', color: '#a1f3df', stroke: '#09201d', strokeThickness: 4 }).setOrigin(0.5).setDepth(DEPTH.word);
      this.linkMarkers.set(enemy, marker);
    }
    for (const [enemy, marker] of this.linkMarkers) {
      if (!active.includes(enemy)) { marker.destroy(); this.linkMarkers.delete(enemy); continue; }
      marker.setText(`${active.length === 1 ? '孤' : '連'}\n${Math.max(0, (enemy.linkedUntil - time) / 1000).toFixed(1)}`)
        .setPosition(enemy.x, enemy.y - (enemy.kind === 'boss' ? 78 : 48)).setAlpha(0.72 + Math.sin(time / 120 + enemy.x) * 0.22).setScale(1 + Math.sin(time / 150 + enemy.y) * 0.08);
    }
    const drawnStitches = new Set<string>();
    for (const [firstId, secondId] of this.stitchedPairs) {
      const key = [firstId, secondId].sort().join(':'); if (drawnStitches.has(key)) continue; drawnStitches.add(key);
      const first = [...this.enemies].find((enemy) => enemy.id === firstId && enemy.active && !enemy.removing);
      const second = [...this.enemies].find((enemy) => enemy.id === secondId && enemy.active && !enemy.removing);
      if (!first || !second) { this.stitchedPairs.delete(firstId); this.stitchedPairs.delete(secondId); continue; }
      this.linkGraphics?.lineStyle(4, 0x301923, .88).beginPath().moveTo(first.x, first.y - 14).lineTo(second.x, second.y - 14).strokePath();
      this.linkGraphics?.lineStyle(1, 0xc06f8d, .82).beginPath();
      for (let step = 0; step <= 10; step += 1) {
        const ratio = step / 10; const x = Phaser.Math.Linear(first.x, second.x, ratio); const y = Phaser.Math.Linear(first.y - 14, second.y - 14, ratio) + (step % 2 ? 4 : -4);
        if (step === 0) this.linkGraphics?.moveTo(x, y); else this.linkGraphics?.lineTo(x, y);
      }
      this.linkGraphics?.strokePath();
    }
    this.linkedTargets = new Set(active); if (active.length < 2) return;
    for (let index = 0; index < active.length; index += 1) {
      const a = active[index]; const b = active[(index + 1) % active.length];
      if (!a || !b) continue;
      const ax = a.x; const ay = a.y - 10; const bx = b.x; const by = b.y - 10;
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
    this.rewindPreviewGhosts.forEach((ghost) => ghost.setVisible(false).setAlpha(0));
    if (!this.flow.allowsCombatSimulation || this.hero.rewinding) return;
    const records = this.rewind.getRange(time, BALANCE.words.rewindDuration);
    if (records.length < 2) return;
    const indexes = [0, Math.floor((records.length - 1) / 2), records.length - 1];
    indexes.forEach((recordIndex, ghostIndex) => {
      const state = records[recordIndex]; const ghost = this.rewindPreviewGhosts[ghostIndex]; if (!state || !ghost) return;
      const ready = this.time.now >= this.rewindReadyAt;
      ghost.setPosition(state.x, state.y).setFlipX(Math.cos(state.facing) < 0).setVisible(true)
        .setAlpha((ghostIndex === 0 ? 0.2 : 0.09) * (ready ? 1 : 0.55));
    });
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
    const pulse = this.add.circle(from.x, from.y - 10, 5, color, 0.9).setDepth(DEPTH.word);
    this.tweens.add({ targets: pulse, x: to.x, y: to.y - 10, alpha: 0.1, duration: this.services.save.settings.reducedMotion ? 90 : 180, onComplete: () => pulse.destroy() });
  }

  private gainSentence(amount: number): void {
    const wasFull = this.sentence >= this.sentenceMax;
    this.sentence = Math.min(this.sentenceMax, this.sentence + amount);
    if (!wasFull && this.sentence >= this.sentenceMax) {
      this.combatStats.agencyMilestone('empowerReady', this.elapsedSeconds());
      this.services.audio.play('sentenceFull');
      this.sentencePulseUntil = this.time.now + 1800;
      this.sentenceFullAt = this.time.now;
      this.sentenceReminderShown = false;
      this.services.ui.showChainTrigger('F 강화 용언 준비', 1000);
    }
  }

  private gainWordHitSentence(amount: number): void {
    const bonus = sealedSentenceStats(this.upgrades.getStack('sealed-sentence')).wordHitSentenceBonus;
    const bonusGain = amount * bonus;
    this.gainSentence(amount + bonusGain);
    if (bonusGain > 0) this.recordUpgradeContribution('sealed-sentence', { activationCount: 0, sentence: bonusGain });
  }

  private elapsedSeconds(): number { return Math.max(0, (this.time.now - this.startTime) / 1000); }

  private nearestEnemy(x: number, y: number): Enemy | undefined {
    return [...this.enemies].filter((enemy) => enemy.active && enemy.spawned && !enemy.removing
      && groundFootprintInsideBounds(enemy.groundPoint, enemyGroundExtents(enemy.kind), COMBAT_BOUNDS))
      .sort((a, b) => distanceSq(x, y, a.x, a.y) - distanceSq(x, y, b.x, b.y))[0];
  }

  private hasWordTarget(range: number): boolean {
    return this.targetingCandidates().some((candidate) => candidate.alive && candidate.visible && candidate.insideCombatBounds !== false
      && this.targeting.distanceToCandidate(this.hero.groundPoint, candidate) <= range);
  }

  private damageNumber(x: number, y: number, amount: number, color: number, shared = false, prefix = ''): void {
    const text = this.add.text(x, y, `${prefix}${Math.round(amount)}`, { fontFamily: 'Malgun Gothic, sans-serif', fontSize: amount >= 40 ? '18px' : shared ? '12px' : '14px', fontStyle: shared ? 'italic' : 'normal', color: `#${color.toString(16).padStart(6, '0')}`, stroke: shared ? '#123631' : '#071012', strokeThickness: 4 }).setOrigin(0.5).setDepth(DEPTH.combatText);
    this.transientCombatObjects.add(text);
    this.tweens.add({ targets: text, y: y - 28, alpha: 0, duration: this.services.save.settings.reducedMotion ? 280 : 520, onComplete: () => { this.transientCombatObjects.delete(text); text.destroy(); } });
  }

  private showDamageVignette(damage: number): void {
    const reduced = this.services.save.settings.reducedMotion;
    const alpha = Math.min(reduced ? 0.1 : 0.2, 0.06 + damage / 180);
    const graphics = this.add.graphics().setDepth(DEPTH.screenEffect);
    graphics.lineStyle(28, 0x7a201c, alpha).strokeRect(8, 8, 944, 524);
    this.tweens.add({ targets: graphics, alpha: 0, duration: reduced ? 80 : 145, onComplete: () => graphics.destroy() });
  }

  private runeBurst(x: number, y: number, count: number): void {
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count + Math.random() * 0.3;
      const pixel = this.add.image(x, y, 'rune-pixel').setTint(index % 2 ? 0xa6f5e6 : 0x4ebaa9).setDepth(DEPTH.word);
      this.tweens.add({ targets: pixel, x: x + Math.cos(angle) * Phaser.Math.Between(24, 64), y: y + Math.sin(angle) * Phaser.Math.Between(20, 58), alpha: 0, duration: 360, onComplete: () => pixel.destroy() });
    }
  }

  private showWordTypography(word: string, x: number, y: number, boss = false): void {
    const text = this.add.text(x, y, word, { fontFamily: 'Malgun Gothic, serif', fontSize: boss ? '34px' : '25px', color: boss ? '#e6c79d' : '#a9f5e6', stroke: '#071012', strokeThickness: 7 }).setOrigin(0.5).setDepth(DEPTH.combatText).setAlpha(0).setScale(0.75);
    this.transientCombatObjects.add(text);
    this.tweens.add({ targets: text, alpha: 1, scale: 1, y: y - 14, duration: 190, hold: boss ? 720 : 350, yoyo: true, onComplete: () => { this.transientCombatObjects.delete(text); text.destroy(); } });
  }

  private cameraKick(intensity: number, duration: number): void {
    const strength = this.services.save.settings.shake; if (strength <= 0 || this.services.save.settings.reducedMotion) return;
    this.cameras.main.shake(duration, intensity * strength);
  }

  private showCombatLabel(x: number, y: number, label: string, color = 0x9fe9dc): void {
    const text = this.add.text(x, y, label, { fontFamily: 'Malgun Gothic, sans-serif', fontSize: '12px', fontStyle: 'bold', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#061012', strokeThickness: 4 }).setOrigin(0.5).setDepth(DEPTH.combatText);
    this.transientCombatObjects.add(text);
    this.tweens.add({ targets: text, y: y - 18, alpha: 0, duration: this.services.save.settings.reducedMotion ? 260 : 460, onComplete: () => { this.transientCombatObjects.delete(text); text.destroy(); } });
  }

  private clearTransientCombatObjects(): void {
    for (const object of this.transientCombatObjects) {
      this.tweens.killTweensOf(object);
      if (object.active) object.destroy();
    }
    this.transientCombatObjects.clear();
  }

  private recordUpgradeContribution(id: UpgradeId, values: Partial<{
    activationCount: number; damage: number; healing: number; sentence: number; cooldownMs: number; generated: number;
    reflectedProjectiles: number; affectedTargets: number; preventedDamage: number; failedConditions: number; hits: number; misses: number; exclusiveDamage: boolean;
  }> = {}, showName = false): void {
    const contribution = {
      activationCount: values.activationCount ?? 0,
      damageContribution: values.damage,
      healingContribution: values.healing,
      resourceContribution: values.sentence,
      cooldownReductionContribution: values.cooldownMs,
      reflectedProjectileCount: values.reflectedProjectiles,
      affectedTargetCount: values.affectedTargets,
      preventedDamage: values.preventedDamage,
      failedConditionCount: values.failedConditions,
      generatedCount: values.generated,
      hitCount: values.hits,
      missCount: values.misses,
    };
    this.upgrades.record(id, contribution);
    this.combatStats.upgradeContribution(id, contribution);
    if (values.exclusiveDamage && (values.damage ?? 0) > 0) this.combatStats.attributedUpgradeDamage(values.damage ?? 0);
    this.lastActivatedUpgrade = id; this.lastActivatedUpgradeUntil = this.time.now + 1500;
    if (!showName) return;
    const last = this.lastUpgradeToastAt.get(id) ?? Number.NEGATIVE_INFINITY;
    if (this.time.now - last < 900) return;
    this.lastUpgradeToastAt.set(id, this.time.now);
    const definition = upgradeById(id); if (definition) this.showCombatLabel(this.hero.x, this.hero.y - 70, `${definition.icon.glyph} ${definition.name}`, Number.parseInt(definition.icon.color.slice(1), 16));
  }

  private recordResonanceContribution(id: ResonanceId, values: Partial<{
    activationCount: number; damage: number; healing: number; sentence: number; cooldownMs: number; reflectedProjectiles: number;
    affectedTargets: number; preventedDamage: number; failedConditions: number; generated: number; hits: number; misses: number; exclusiveDamage: boolean;
  }> = {}): void {
    const contribution = {
      activationCount: values.activationCount ?? 0,
      damageContribution: values.damage,
      healingContribution: values.healing,
      resourceContribution: values.sentence,
      cooldownReductionContribution: values.cooldownMs,
      reflectedProjectileCount: values.reflectedProjectiles,
      affectedTargetCount: values.affectedTargets,
      preventedDamage: values.preventedDamage,
      failedConditionCount: values.failedConditions,
      generatedCount: values.generated,
      hitCount: values.hits,
      missCount: values.misses,
    };
    this.upgrades.recordResonance(id, contribution);
    this.combatStats.resonanceContribution(id, contribution);
    if (values.exclusiveDamage && (values.damage ?? 0) > 0) this.combatStats.attributedUpgradeDamage(values.damage ?? 0);
    if ((values.activationCount ?? 0) <= 0) return;
    this.lastActivatedResonance = id; this.lastActivatedResonanceUntil = this.time.now + 1800;
    const resonance = resonanceById(id);
    if (resonance) this.services.ui.showChainTrigger(`공명 · ${resonance.name}`, 720);
  }

  private startWatchdog(): void {
    if (!import.meta.env.DEV) return;
    this.watchdogHandle = window.setInterval(() => {
      const now = performance.now();
      if (!this.flow.isCombatBaseState || document.hidden || this.timeControl.isHardPaused) return;
      const gap = now - this.lastHeartbeatAt;
      if (gap < 1500) { if (this.watchdogStalled) { this.watchdogStalled = false; this.watchdogMessage = 'recovered'; } return; }
      if (this.watchdogStalled || now - this.lastWatchdogReportAt < 1500) return;
      const staleHitstopReleased = this.timeControl.clearStaleHitstop(now);
      this.lastWatchdogReportAt = now; this.watchdogStalled = true;
      this.watchdogMessage = `heartbeat ${Math.round(gap)}ms${staleHitstopReleased ? ' · stale HITSTOP released' : ''}`;
      console.warn('[STABILITY-01 watchdog]', this.diagnosticSnapshot());
    }, 500);
  }

  private diagnosticSnapshot(): object {
    const time = this.timeControl.snapshot();
    const clock = this.time as unknown as { _active?: readonly unknown[]; _pendingInsertion?: readonly unknown[] };
    return {
      flow: this.flow.state,
      baseFlow: this.flow.baseState,
      sceneActive: this.scene.isActive(),
      scenePaused: this.scene.isPaused(),
      phaserTimeScale: this.time.timeScale,
      physicsPaused: time.physicsPaused,
      physicsTimeScale: this.physics.world.timeScale,
      tweenTimeScale: this.tweens.timeScale,
      animationTimeScale: this.anims.globalTimeScale,
      activePauseTokens: time.activeReasons,
      lastTransition: this.flow.lastTransition,
      lastHitstopStartedAt: time.lastHitstopStartedAt,
      lastHitstopEndedAt: time.lastHitstopEndedAt,
      lastAttackAt: this.lastAttackAt,
      lastHitAt: this.lastHitAt,
      enemies: [...this.enemies].filter((enemy) => enemy.active).length,
      projectiles: [...this.projectiles].filter((projectile) => projectile.active).length,
      particles: this.children.list.filter((child) => child.type === 'ParticleEmitter').length,
      timers: (clock._active?.length ?? 0) + (clock._pendingInsertion?.length ?? 0) + this.timeouts.length,
      input: this.inputRouter.snapshot(),
      watchdog: this.watchdogMessage,
      damageQueue: this.damageQueue.snapshot(),
      threatBudget: this.threatBudget.snapshot(this.time.now),
      heartbeats: { ...this.combatHeartbeats },
      wave: this.waveDirector.snapshot(),
      outcome: this.runOutcome.snapshot(),
      run: this.runSession.snapshot(),
    };
  }

  private toggleHitboxDebug(): void {
    if (!import.meta.env.DEV) return;
    this.debugHitboxes = !this.debugHitboxes;
    this.debugGraphics?.setVisible(this.debugHitboxes);
    if (!this.debugHitboxes) this.debugGraphics?.clear();
  }

  private toggleStatsDebug(): void {
    if (!import.meta.env.DEV) return;
    this.debugStatsVisible = !this.debugStatsVisible;
    if (!this.debugStatsVisible) { this.debugStatsText?.destroy(); this.debugStatsText = undefined; return; }
    this.debugStatsText ??= this.add.text(690, 82, '', { fontFamily: 'Consolas, monospace', fontSize: '10px', color: '#d7eee8', backgroundColor: '#051012dd', padding: { x: 8, y: 7 }, lineSpacing: 2 }).setDepth(DEPTH.debug);
  }

  private drawCombatDebug(time: number): void {
    if (!import.meta.env.DEV) return;
    const graphics = this.debugGraphics;
    if (graphics && this.debugHitboxes) {
      graphics.clear();
      graphics.lineStyle(2, 0xffffff, 0.72).strokeRect(COMBAT_BOUNDS.left, COMBAT_BOUNDS.top, COMBAT_BOUNDS.right - COMBAT_BOUNDS.left, COMBAT_BOUNDS.bottom - COMBAT_BOUNDS.top);
      const circle = (item: Readonly<{ x: number; y: number; radius: number }>, color: number): void => { graphics.lineStyle(1.5, color, 0.9).strokeCircle(item.x, item.y, item.radius); };
      const ellipse = (item: Readonly<{ x: number; y: number; radiusX: number; radiusY: number }>, color: number): void => { graphics.lineStyle(1.5, color, 0.9).strokeEllipse(item.x, item.y, item.radiusX * 2, item.radiusY * 2); };
      graphics.fillStyle(0xffffff, 0.95).fillCircle(this.hero.x, this.hero.y, 2.5);
      circle(this.hero.movementCircle, 0x68e59a); ellipse(this.hero.hurtbox, 0x55ccea);
      const attackDirection = this.hero.attackDirection;
      graphics.lineStyle(2, 0xffef87, 0.9).lineBetween(this.hero.x, this.hero.y, this.hero.x + attackDirection.x * 72, this.hero.y + attackDirection.y * 72);
      if (this.hero.isParrying) {
        const hurtbox = this.hero.hurtbox;
        graphics.lineStyle(2, 0x8ffff0, 0.9).strokeEllipse(hurtbox.x, hurtbox.y, (hurtbox.radiusX + BALANCE.hero.parryEnvelopePadding) * 2, (hurtbox.radiusY + BALANCE.hero.parryEnvelopePadding) * 2);
      }
      for (const enemy of this.enemies) {
        graphics.fillStyle(0xffffff, 0.9).fillCircle(enemy.x, enemy.y, 2);
        circle(enemy.movementCircle, 0xe7c769); ellipse(enemy.hurtbox, 0xff8a67);
        const telegraph = enemy.activeTelegraph;
        if (telegraph && telegraph.until > time) {
          graphics.lineStyle(2, 0xff563e, 0.86).lineBetween(enemy.x, enemy.y, enemy.x + Math.cos(telegraph.angle) * telegraph.length, enemy.y + Math.sin(telegraph.angle) * telegraph.length);
          graphics.lineStyle(1, 0xff9470, 0.55).strokeCircle(enemy.x, enemy.y, telegraph.halfWidth);
        }
        if (enemy.attackActiveUntil > time) circle({ x: enemy.x, y: enemy.y, radius: enemy.meleeHitRadius }, 0xff3030);
      }
      for (const candidate of this.targetingCandidates()) ellipse(candidate.hurtbox ?? { x: candidate.x, y: candidate.y, radiusX: 2, radiusY: 2 }, 0xb6a64f);
      for (const projectile of this.projectiles) if (projectile.active) {
        circle(projectile.collisionCircle, projectile.enemyOwned ? 0xff6257 : 0x68e7d2);
        graphics.lineStyle(1, 0xff9c8d, 0.45).lineBetween(projectile.previousPosition.x, projectile.previousPosition.y, projectile.x, projectile.y);
      }
      if (this.activeDaggerDebug && this.activeDaggerDebug.until > time) graphics.lineStyle(3, 0xfff08a, 0.9).beginPath().arc(this.activeDaggerDebug.x, this.activeDaggerDebug.y, this.activeDaggerDebug.range, this.activeDaggerDebug.angle - BALANCE.collision.daggerHalfAngle, this.activeDaggerDebug.angle + BALANCE.collision.daggerHalfAngle).strokePath();
      if (this.currentTarget?.active) ellipse(this.currentTarget.hurtbox, 0x6dffd2);
      if (time < this.hero.invulnerableUntil) graphics.fillStyle(0x66cfff, 0.14).fillEllipse(this.hero.hurtbox.x, this.hero.hurtbox.y, this.hero.hurtbox.radiusX * 2, this.hero.hurtbox.radiusY * 2);
    }
    if (this.debugStatsText && this.debugStatsVisible) {
      const stats = this.combatStats.snapshot();
      const audio = this.services.audio.diagnostics();
      const progress = this.runProgress.snapshot();
      const actRun = this.runAct.snapshot();
      const bossPhase = this.boss?.phaseSnapshot;
      const damageQueue = this.damageQueue.snapshot();
      const threatBudget = this.threatBudget.snapshot(this.time.now);
      const diagnostic = this.diagnosticSnapshot() as {
        flow: string; sceneActive: boolean; scenePaused: boolean; phaserTimeScale: number; physicsPaused: boolean;
        physicsTimeScale: number; tweenTimeScale: number; animationTimeScale: number; activePauseTokens: readonly string[];
        enemies: number; projectiles: number; particles: number; timers: number; watchdog: string;
        lastTransition: { from: string; to: string; at: number }; lastHitstopStartedAt?: number; lastHitstopEndedAt?: number;
        lastAttackAt: number; lastHitAt: number;
        wave: ReturnType<WaveDirector['snapshot']>; outcome: ReturnType<RunOutcomeController['snapshot']>; run: ReturnType<RunSessionController['snapshot']>;
      };
      const ttk = Object.entries(stats.ttkByKind).map(([kind, value]) => `${kind}:${value?.average.toFixed(1)}s`).join(' ');
      this.debugStatsText.setText([
        `F3 STABILITY · ${diagnostic.flow}`, `Scene ${diagnostic.sceneActive ? 'ACTIVE' : 'OFF'}/${diagnostic.scenePaused ? 'PAUSED' : 'RUN'} · Physics ${diagnostic.physicsPaused ? 'PAUSED' : 'RUN'}`,
        `Scale T ${diagnostic.phaserTimeScale.toFixed(2)} · P ${diagnostic.physicsTimeScale.toFixed(2)} · W ${diagnostic.tweenTimeScale.toFixed(2)} · A ${diagnostic.animationTimeScale.toFixed(2)}`,
        `Tokens ${diagnostic.activePauseTokens.join(', ') || 'none'} · ${diagnostic.watchdog}`,
        `Flow ${diagnostic.lastTransition.from} → ${diagnostic.lastTransition.to} · Hitstop ${Math.round(diagnostic.lastHitstopStartedAt ?? 0)}/${Math.round(diagnostic.lastHitstopEndedAt ?? 0)}`,
        `Last attack/hit ${Math.round(diagnostic.lastAttackAt)}/${Math.round(diagnostic.lastHitAt)}`,
        `DamageQueue ${damageQueue.queueLength} · frame ${damageQueue.processedThisFrame}/256 · depth ${damageQueue.maximumDepthSeen}/6 · blocked ${damageQueue.blockedEvents}`,
        `DamageRoot ${damageQueue.lastRootEventId ?? '-'} · lineage ${damageQueue.lastRootLineage.length} · recursion ${damageQueue.blockedByReason['duplicate-handler'] + damageQueue.blockedByReason['maximum-depth']}`,
        `Threat ${threatBudget.active.map((entry) => entry.tier).join(',') || 'none'} · denied ${threatBudget.denied}`,
        `적 ${diagnostic.enemies} · 탄환 ${diagnostic.projectiles} · 파티클 ${diagnostic.particles} · 타이머 ${diagnostic.timers}`,
        `Wave ${diagnostic.wave.waveState} · spawn ${diagnostic.wave.spawnSequenceComplete ? 'DONE' : 'WAIT'} · pending ${diagnostic.wave.pendingSpawnCount}`,
        `Run ${diagnostic.run.runId} · Boss ${diagnostic.run.boss.active ? `${diagnostic.run.boss.id} P${diagnostic.run.boss.phase}` : 'none'} · stale callbacks ${diagnostic.run.staleCallbacksBlocked}`,
        `Act ${progress.act.actNumber} · Wave ${progress.act.waveIndex + 1} · generation ${progress.act.generation} · stale act callbacks ${progress.staleScopeCallbacksBlocked}`,
        `RunAct ${actRun.current.id} · boss ${actRun.bossesDefeated} · modifiers ${actRun.current.modifiers.join(',') || 'none'} · blocked ${actRun.staleActCallbacksBlocked}`,
        `BossDef ${this.boss?.definition.bossId ?? '-'} · P${bossPhase?.phaseId ?? '-'} ${Math.round(bossPhase?.phaseHealth ?? 0)}/${Math.round(bossPhase?.phaseMaxHealth ?? 0)} · signature ${bossPhase?.signaturePatternExecuted ? 'YES' : 'NO'} · skip ${bossPhase?.skippedPhaseCount ?? 0}`,
        `Act 전환 ${Math.round(this.lastActTransitionDuration)}ms · 보스 사망 event ${this.bossDeathEvents} · Modifier ${modifierIdsForPause(this.activeActPatterns, this.runAct.current.modifiers).join(' / ') || '없음'}`,
        `Audio ${audio.contextState} · M/SFX/UI/C ${audio.master.toFixed(2)}/${audio.effects.toFixed(2)}/${audio.ui.toFixed(2)}/${audio.combat.toFixed(2)} · limiter ${audio.limiterActive ? 'ON' : 'OFF'} · voices ${audio.activeVoices}`,
        `Living ${diagnostic.wave.livingEnemyIds.length} [${diagnostic.wave.livingEnemyIds.join(', ')}]`,
        `Round ${diagnostic.wave.lastRoundEvaluation} · 전환 ${diagnostic.wave.transitionCount}`,
        `마지막 사망 ${diagnostic.wave.lastDeathEvent?.source ?? '-'} · 결과 ${diagnostic.outcome.outcome ?? '-'} x${diagnostic.outcome.resultTransitions}`,
        `잔향 칼날 ${stats.echoBlade.hits}/${stats.echoBlade.activations} ${stats.echoBlade.damage.toFixed(0)}dmg · 역류 ${stats.echoBlade.projectilesReflected}`,
        `J 절단 ${stats.cut.hits}/${stats.cut.uses} ${stats.cut.damage.toFixed(0)}dmg · 상태 S/L/E/X ${stats.cut.stopped}/${stats.cut.linked}/${stats.cut.echo}/${stats.cut.exposed}`,
        `절단 탄환 ${stats.cut.projectilesCut} · TTK ${ttk || '-'}`,
        `타격 ${stats.attackHits}/${stats.attackAttempts} · 근접 빗나감 ${stats.nearbyMisses}`,
        `패링 ${stats.parrySuccesses}/${stats.parryAttempts} · 대시 ${stats.dashes}`,
        `패링 분리 일반/완벽/탄환/근접/피해 ${stats.parryBreakdown.normalParries}/${stats.perfectParries}/${stats.parryBreakdown.projectileReflections}/${stats.parryBreakdown.meleeCounters}/${stats.parryBreakdown.damage.toFixed(0)}`,
        `패링 위치 Δ ${stats.lastParryPosition?.extraDistance.toFixed(3) ?? '0.000'} · max ${stats.maximumParryExtraDistance.toFixed(3)}`,
        `타깃 없음 ${stats.noTargetSelections} · 거리 밖 ${stats.outOfRangeSelections}`,
        `콤보 타깃 변경 ${stats.comboTargetChanges} · 상단 보정 ${stats.upperBoundaryCorrections}`,
        `경계 이탈 ${stats.enemiesOutsideBounds} · 예고 밖 피격 ${stats.telegraphOutsideHits}`,
        `Q/E/R ${stats.wordUses.stop}/${stats.wordUses.rewind}/${stats.wordUses.link} · 연쇄 성공/시도 ${Object.values(stats.chainCounts).reduce((sum, value) => sum + value, 0)}/${Object.values(stats.chainAttempts).reduce((sum, value) => sum + value, 0)} · fallback ${Object.values(stats.chainFallbacks).reduce((sum, value) => sum + value, 0)} · F ${stats.empowerUses}`,
        `피해 원천 잔향/J/패링/언령/기타 ${stats.damageAttribution.echoBlade.toFixed(0)}/${stats.damageAttribution.cut.toFixed(0)}/${stats.damageAttribution.parry.toFixed(0)}/${stats.damageAttribution.word.toFixed(0)}/${stats.damageAttribution.other.toFixed(0)} · events ${stats.damageEventCount} · stale ${stats.staleDamageEventsRejected}`,
        `F 실패 Q/E/R ${Object.values(stats.empoweredWordFailures.stop).reduce((sum, value) => sum + (value ?? 0), 0)}/${Object.values(stats.empoweredWordFailures.rewind).reduce((sum, value) => sum + (value ?? 0), 0)}/${Object.values(stats.empoweredWordFailures.link).reduce((sum, value) => sum + (value ?? 0), 0)}`,
        `E 회복/잔상 ${stats.rewindContribution.healthRecovered.toFixed(0)}/${stats.rewindContribution.echoDamage.toFixed(0)} · R 공유/고립/폭발 ${stats.linkContribution.sharedDamage.toFixed(0)}/${stats.linkContribution.isolatedBonusDamage.toFixed(0)}/${stats.linkContribution.explosionDamage.toFixed(0)}`,
        `첫 J/Q/E/R ${stats.agency.firstAt.manualHit?.toFixed(1) ?? '-'}/${stats.agency.firstAt.stop?.toFixed(1) ?? '-'}/${stats.agency.firstAt.rewind?.toFixed(1) ?? '-'}/${stats.agency.firstAt.link?.toFixed(1) ?? '-'}s`,
        `첫 연쇄/강화3타/F준비 ${stats.agency.firstAt.chain?.toFixed(1) ?? '-'}/${stats.agency.firstAt.enhancedThird?.toFixed(1) ?? '-'}/${stats.agency.firstAt.empowerReady?.toFixed(1) ?? '-'}s`,
        `피해 J ${stats.agency.damage.basicJ.toFixed(0)}+${stats.agency.damage.enhancedJ.toFixed(0)} · Q/E/R ${stats.agency.damage.stop.toFixed(0)}/${stats.agency.damage.rewind.toFixed(0)}/${stats.agency.damage.link.toFixed(0)} · 자동 ${stats.agency.damage.automatic.toFixed(0)}`,
        `자동 타깃 없음 · 절단 방향 ${this.hero.attackDirection.x.toFixed(2)},${this.hero.attackDirection.y.toFixed(2)} · 쿨다운 ${(this.weaponCooldowns.cutRemaining(time) / 1000).toFixed(2)}s`,
        `봉인된 문장 ${this.upgrades.getStack('sealed-sentence')}/3 · CD -${(sealedSentenceStats(this.upgrades.getStack('sealed-sentence')).cooldownReduction * 100).toFixed(0)}% · 언령 문장 +${(sealedSentenceStats(this.upgrades.getStack('sealed-sentence')).wordHitSentenceBonus * 100).toFixed(0)}%`,
        `공명 ${this.upgrades.activeResonances().map((id) => resonanceById(id)?.name ?? id).join(', ') || '없음'}`,
        `카드 ${this.upgrades.entries().map(({ id, stacks }) => `${upgradeById(id)?.name ?? id}×${stacks}:${this.upgrades.runtimeSnapshot().contributions[id]?.activationCount ?? 0}`).join(' · ') || '없음'}`,
      ]).setVisible(true);
    }
  }

  private showDebugScenarioMenu(): void {
    if (!import.meta.env.DEV || this.debugScenarioText?.visible || !this.flow.isCombatBaseState) return;
    this.timeControl.acquire('SCENE_TRANSITION', 'debug-menu'); this.clearCombatInput(); this.inputRouter.setContext('DEVELOPMENT');
    this.debugScenarioText = this.add.text(480, 270, '', { fontFamily: 'Malgun Gothic, Consolas, monospace', fontSize: '13px', color: '#dcebe7', backgroundColor: '#041012f2', padding: { x: 22, y: 14 }, lineSpacing: 4, align: 'left' }).setOrigin(0.5).setDepth(DEPTH.debug);
    this.renderDebugScenarioMenu();
  }

  private renderDebugScenarioMenu(): void {
    const items = this.debugScenarioItems();
    this.debugScenarioText?.setText(['F4 STABILITY / UPGRADE LAB', '', ...items.map((item, index) => `${index === this.debugScenarioIndex ? '▶' : ' '} ${item}`), '', 'W/S 또는 ↑/↓ · Enter 실행 · Esc/K 닫기']);
  }

  private debugScenarioItems(): readonly string[] {
    return [
      'A · 8방향 공격', 'B · 가까운 적 우선', 'C · 콤보 대상 고정', 'D · J 누르고 있기',
      'E · 상단 경계 적', 'F · 보스 겹침', 'G · Telegraph', 'H · 8방향 패링 탄환',
      'I · 위/아래 근접 패링', 'J · 패링 불가 장판', 'K · 10분/20회 안정성 시뮬레이션',
      'L · stale enemy 소프트락 복구', 'M · J 절단 표적',
      'N · 잔향 빌드 + 월환 공명', 'O · 절단·패링 빌드 + 반격 절문',
      'P · 언령 빌드 + 회귀 사슬', 'Q · 시간 역조 공명', 'R · 오디오 버스 진단', 'S · 카드 기여 통계 초기화', 'T · Endless Run 사망 결과',
      'U · Act1 Boss Phase3 Freeze Regression', 'V · 기존 언령 프리셋', 'W · 당긴다/잇는다/밀어낸다', 'X · 새긴다/멎는다/되돌린다', 'Y · 신규 언령 3종',
    ];
  }

  private closeDebugScenarioMenu(): void {
    this.debugScenarioText?.destroy(); this.debugScenarioText = undefined; this.timeControl.release('SCENE_TRANSITION', 'debug-menu'); this.clearCombatInput(); this.syncInputContext();
  }

  private runFoundationScenario(index: number): void {
    if (!import.meta.env.DEV) return;
    this.debugClearEnemies(); this.hero.setPosition(480, 300); this.hero.constrainToArena();
    if (index === 0) {
      for (let direction = 0; direction < 8; direction += 1) { const angle = direction * Math.PI / 4; this.spawnEnemy('chaser', this.hero.x + Math.cos(angle) * 92, this.hero.y + Math.sin(angle) * 92); }
    } else if (index === 1) {
      this.targeting.updateDirection(1, 0); this.spawnEnemy('chaser', this.hero.x - 62, this.hero.y); this.spawnEnemy('archer', this.hero.x + 100, this.hero.y);
    } else if (index === 2) {
      this.spawnEnemy('elite', this.hero.x + 82, this.hero.y); this.spawnEnemy('chaser', this.hero.x + 92, this.hero.y + 46);
    } else if (index === 3) this.spawnEnemy('elite', this.hero.x + 82, this.hero.y);
    else if (index === 4) { this.hero.setPosition(480, 180); this.spawnEnemy('archer', 480, COMBAT_BOUNDS.top + BALANCE.collision.movementRadius.archer); }
    else if (index === 5) this.debugBossPhase(1);
    else if (index === 6) this.spawnEnemy('chaser', this.hero.x + 150, this.hero.y);
    else if (index === 7) {
      for (let direction = 0; direction < 8; direction += 1) {
        const angle = direction * Math.PI / 4; const x = this.hero.hurtbox.x + Math.cos(angle) * 120; const y = this.hero.hurtbox.y + Math.sin(angle) * 120;
        const projectile = new Projectile(this, x, y, angle + Math.PI, 115, 8, 'projectile-ink', `debug-${direction}`); this.projectiles.add(projectile);
      }
    } else if (index === 8) {
      this.spawnEnemy('chaser', this.hero.x, this.hero.y - 95); this.spawnEnemy('chaser', this.hero.x, this.hero.y + 95);
    } else if (index === 9) this.createInkZone(this.hero.x, this.hero.y, 48, 4200);
    else if (index === 10) {
      const report = runStabilityStressSimulation(); console.info('[STABILITY-01 stress]', report);
      this.showWordTypography(report.unexpectedPauseStates === 0 && report.staleTokens === 0 ? '안정성 검사 통과' : '안정성 검사 실패', 480, 170, true);
    } else if (index === 11) {
      this.waveDirector.startWave(1, performance.now());
      const stale = this.spawnEnemy('chaser', this.hero.x + 120, this.hero.y, true);
      this.waveDirector.registerSpawn(stale.id, performance.now()); stale.destroy();
      console.warn('[STABILITY-01R intentional stale enemy]', { id: stale.id, director: this.waveDirector.snapshot() });
    } else if (index === 12) {
      this.spawnEnemy('chaser', this.hero.x + 72, this.hero.y); this.gainFinisherCharge('qa', this.finisherCharges.maxCharges);
    } else if (index === 13) {
      this.debugResetUpgradeBuild();
      this.debugGrantUpgrades([['dual-moon-echo', 1], ['wide-orbit', 2], ['backflow-blade', 1]]);
      this.spawnEnemy('chaser', this.hero.x + 70, this.hero.y); this.spawnEnemy('archer', this.hero.x - 82, this.hero.y + 18); this.spawnEnemy('ink', this.hero.x, this.hero.y - 78);
      this.showWordTypography('잔향 빌드 · 월환 공명', 480, 154, true);
    } else if (index === 14) {
      this.debugResetUpgradeBuild();
      this.debugGrantUpgrades([['cut-sentence', 2], ['perfect-counter', 1], ['counter-inscription', 2]]);
      const target = this.spawnEnemy('elite', this.hero.x + 78, this.hero.y); target.freeze(this.time.now + 60000, false);
      this.runDelayedCall(750, () => { if (!target.active) return; const projectile = new Projectile(this, this.hero.x + 122, this.hero.y, Math.PI, 95, 8, 'projectile-ink', target.id); this.projectiles.add(projectile); });
      this.showWordTypography('절단·패링 · 반격 절문', 480, 154, true);
    } else if (index === 15) {
      this.debugResetUpgradeBuild();
      this.debugGrantUpgrades([['returning-scar', 2], ['isolation-chain', 2], ['chain-breath', 2], ['rewind-breath', 1]]);
      const isolated = this.spawnEnemy('elite', this.hero.x + 84, this.hero.y); isolated.linked = true; isolated.linkedUntil = this.time.now + 60000; isolated.setData('linkContagionGeneration', 0); this.linkedTargets.add(isolated);
      this.spawnEnemy('chaser', this.hero.x - 92, this.hero.y + 24);
      this.showWordTypography('언령 빌드 · 회귀 사슬', 480, 154, true);
    } else if (index === 16) {
      this.debugResetUpgradeBuild();
      this.debugGrantUpgrades([['backflow-blade', 1], ['stop-resonance', 2]]);
      // Short laboratory stop keeps projectiles inside their 5.5s lifetime and
      // lets the resonance, rather than expiry, own the transition.
      const token = this.time.now + 1800;
      const stopped = this.spawnEnemy('archer', this.hero.x + 160, this.hero.y); stopped.freeze(token, false);
      for (let direction = 0; direction < 4; direction += 1) {
        const angle = direction * Math.PI / 2; const projectile = new Projectile(this, this.hero.x + Math.cos(angle) * 130, this.hero.y + Math.sin(angle) * 130, angle + Math.PI, 0, 8, 'projectile-ink', stopped.id);
        projectile.setData('stopWordToken', token); projectile.freeze(token); this.projectiles.add(projectile);
      }
      this.runDelayedCall(1810, () => this.applyStopEndEffects([stopped.id], token));
      this.showWordTypography('시간 역조 공명', 480, 154, true);
    } else if (index === 17) {
      this.services.audio.playDiagnostic('ui');
      this.runTimeout(180, () => this.services.audio.playDiagnostic('combat'));
      this.runTimeout(380, () => this.services.audio.playDiagnostic('damageRegression'));
      const audio = this.services.audio.diagnostics();
      this.showWordTypography(`오디오 M${Math.round(audio.master * 100)} SFX${Math.round(audio.effects * 100)} C${Math.round(audio.combat * 100)}`, 480, 154, true);
    } else if (index === 18) {
      this.upgrades.resetRuntimeMetrics(); this.combatStats.resetUpgradeContributions(); this.resonanceRuntime.reset();
      this.showWordTypography('카드 기여 통계 초기화', 480, 154, true);
    } else if (index === 19) {
      this.finishRun(false);
    } else if (index === 20) {
      this.debugResetUpgradeBuild(); this.debugInvulnerable = true;
      this.debugGrantUpgrades([['fragment-recovery', 2], ['rewind-breath', 2], ['counter-inscription', 2], ['isolation-chain', 2], ['link-overload', 2]]);
      this.debugBossPhase(3);
      const pureReport = simulateDamageFreezeRegression(1000);
      console.info('[RUN-ACT-05R2 pure freeze regression]', pureReport);
      this.runTimeout(4100, () => {
        if (!this.boss?.active) return;
        const victims: Enemy[] = [];
        for (let slot = 0; slot < 6; slot += 1) {
          const angle = slot * Math.PI / 3;
          const minion = this.spawnEnemy('minion', this.boss.x + Math.cos(angle) * 66, this.boss.y + Math.sin(angle) * 54);
          minion.health = 5000; minion.linked = true; minion.linkedUntil = this.time.now + 60_000; this.linkedTargets.add(minion); victims.push(minion);
        }
        this.boss.linked = true; this.boss.linkedUntil = this.time.now + 60_000; this.linkedTargets.add(this.boss);
        for (let direction = 0; direction < 8; direction += 1) {
          const angle = direction * Math.PI / 4;
          const projectile = new Projectile(this, this.hero.x + Math.cos(angle) * 125, this.hero.y + Math.sin(angle) * 125, angle + Math.PI, 0, 8, 'projectile-ink', this.boss.id);
          projectile.freeze(this.time.now + 60_000); this.projectiles.add(projectile);
        }
        let roots = 0;
        const drive = (): void => {
          for (let packet = 0; packet < 40 && roots < 1000; packet += 1, roots += 1) {
            const target = victims[roots % victims.length]; if (!target?.active) continue;
            this.damageEnemy(target, .5, roots * .17, false, false, 'attack', 'attack', 'cut', { handler: `freeze-root-${roots}`, skillId: 'freeze-regression-cut', baseSource: 'cut' });
          }
          this.timeControl.requestHitstop(this.timeOwner, 48);
          if (roots < 1000) { this.runTimeout(16, drive); return; }
          victims.forEach((enemy) => { if (enemy.active) enemy.health = 1; });
          const first = victims.find((enemy) => enemy.active);
          if (first) this.damageEnemy(first, 8, 0, false, false, 'attack', 'attack', 'cut', { handler: 'freeze-death-root', skillId: 'freeze-regression-cut', baseSource: 'cut' });
          this.runTimeout(180, () => {
            const snapshot = this.damageQueue.snapshot();
            console.info('[RUN-ACT-05R2 live freeze regression]', snapshot);
            this.showWordTypography(snapshot.queueLength === 0 && !this.timeControl.hasReason('HITSTOP') ? 'P0 회귀 통과' : 'P0 진단 확인', 480, 154, true);
          });
        };
        drive();
      });
      this.showWordTypography('Act1 Boss Phase3 Freeze Regression', 480, 154, true);
    } else if (index === 21) {
      this.debugEquipWords(['stop', 'rewind', 'link']); this.spawnEnemy('elite', this.hero.x + 110, this.hero.y); this.qaReadyWords();
    } else if (index === 22) {
      this.debugEquipWords(['pull', 'link', 'push']); this.debugGrantUpgrades([['gravity-inscription', 2], ['captured-projectile', 1], ['recoil-ripple', 2]]); for (let i = 0; i < 3; i += 1) this.spawnEnemy(i === 2 ? 'archer' : 'chaser', this.hero.x + 86 + i * 28, this.hero.y - 44 + i * 42); this.qaReadyWords();
    } else if (index === 23) {
      this.debugEquipWords(['mark', 'stop', 'rewind']); this.debugGrantUpgrades([['deep-mark', 2], ['contagious-mark', 1], ['stop-resonance', 2]]); this.spawnEnemy('elite', this.hero.x + 110, this.hero.y); this.qaReadyWords();
    } else if (index === 24) {
      this.debugEquipWords(['pull', 'mark', 'push']); this.debugGrantUpgrades([['gravity-inscription', 1], ['captured-projectile', 1], ['deep-mark', 1], ['recoil-ripple', 1]]); for (let i = 0; i < 3; i += 1) this.spawnEnemy(i === 0 ? 'elite' : 'chaser', this.hero.x + 82 + i * 35, this.hero.y - 52 + i * 50); this.qaReadyWords();
    }
  }

  private debugEquipWords(words: [WordId, WordId, WordId]): void {
    this.wordLoadout.replace(words); this.combatStats.setEquippedWords(words); this.wordChain.reset();
    this.showWordTypography(words.map(wordDisplayName).join(' · '), 480, 154, true);
  }

  private debugGrantUpgrades(entries: ReadonlyArray<readonly [UpgradeId, number]>): void {
    for (const [id, targetStacks] of entries) while (this.upgrades.getStack(id) < targetStacks && this.upgrades.add(id)) { /* stack to target */ }
  }

  private debugResetUpgradeBuild(): void {
    this.upgrades = new UpgradeSystem();
    this.resonanceRuntime.reset();
    this.combatStats.resetUpgradeContributions();
    this.lastUpgradeToastAt.clear();
    this.lastActivatedUpgrade = undefined;
    this.lastActivatedUpgradeUntil = 0;
  }

  private debugClearEnemies(): void {
    this.waveSpawnGeneration += 1; this.waveDirector.reset();
    for (const projectile of this.projectiles) projectile.destroy(); this.projectiles.clear();
    for (const enemy of this.enemies) enemy.destroy(); this.enemies.clear(); this.boss = undefined; this.clearLinks();
    this.enemySpawnTimes.clear(); this.enemyFirstDamageAt.clear();
    this.currentTarget = undefined; this.comboTarget = undefined; this.heldAttackTarget = undefined; this.targetMarkerUntil = 0;
  }

  private debugBossPhase(phase: 1 | 2 | 3): void {
    this.startBoss();
    // BOSS_INTRO owns the first second. QA phase jumps must wait for it and
    // for the previous transition lock, otherwise the flow controller quite
    // correctly rejects BOSS_INTRO -> BOSS_TRANSITION.
    if (phase >= 2) this.runDelayedCall(1250, () => this.boss?.debugSetPhase(2));
    if (phase >= 3) this.runDelayedCall(2700, () => this.boss?.debugSetPhase(3));
    this.qaReadyWords();
  }

  private resolveEntitySeparation(delta: number): void {
    const active = [...this.enemies].filter((enemy) => enemy.active && enemy.spawned && !enemy.removing);
    const frameRatio = Phaser.Math.Clamp(delta / (1000 / 60), 0, 2);
    const maximumCorrection = BALANCE.collision.maximumSeparationStep * frameRatio;
    const correctionPerIteration = maximumCorrection / BALANCE.collision.separationIterations;
    const heroBody = this.hero.body as Phaser.Physics.Arcade.Body;
    const heroDeltaX = heroBody.deltaX(); const heroDeltaY = heroBody.deltaY();
    const fallbackDirection = Math.hypot(heroDeltaX, heroDeltaY) > 0.001
      ? { x: -heroDeltaX, y: -heroDeltaY }
      : { x: -this.hero.attackDirection.x, y: -this.hero.attackDirection.y };
    for (let iteration = 0; iteration < BALANCE.collision.separationIterations; iteration += 1) {
      for (const enemy of active) {
        const strength = enemy.kind === 'boss' ? 0.82 : BALANCE.collision.heroSeparationStrength;
        const offset = separationOffset(this.hero.movementCircle, enemy.movementCircle, strength, correctionPerIteration, fallbackDirection);
        if (offset.x === 0 && offset.y === 0) continue;
        const heroShare = this.hero.isParrying || this.time.now < this.parryAnchorUntil
          ? 0
          : enemy.kind === 'boss'
            ? BALANCE.collision.bossHeroSeparationShare
            : BALANCE.collision.heroSeparationShare;
        if (heroShare > 0) this.hero.setGroundPosition(this.hero.x + offset.x * heroShare, this.hero.y + offset.y * heroShare);
        enemy.setGroundPosition(enemy.x - offset.x * (1 - heroShare), enemy.y - offset.y * (1 - heroShare));
        this.hero.constrainToArena(); enemy.constrainToCombatBounds();
      }
      for (let first = 0; first < active.length; first += 1) for (let second = first + 1; second < active.length; second += 1) {
        const a = active[first]; const b = active[second]; if (!a || !b) continue;
        const fallback = { x: a.id < b.id ? -1 : 1, y: 0 };
        const offset = separationOffset(a.movementCircle, b.movementCircle, BALANCE.collision.enemySeparationStrength, correctionPerIteration, fallback);
        if (offset.x === 0 && offset.y === 0) continue;
        a.setGroundPosition(a.x + offset.x * 0.5, a.y + offset.y * 0.5);
        b.setGroundPosition(b.x - offset.x * 0.5, b.y - offset.y * 0.5);
        a.constrainToCombatBounds(); b.constrainToCombatBounds();
      }
    }
  }

  private handlePostPhysicsUpdate(): void {
    if (!this.flow?.allowsCombatSimulation || this.timeControl?.isHardPaused || this.timeControl?.hasReason('HITSTOP')) return;
    this.resolveEntitySeparation(this.frameDelta);
    this.heroShadow?.setPosition(this.hero.x, this.hero.y + 9).setScale(this.hero.isDashing ? 1.5 : 1);
    this.heroRune?.setPosition(this.hero.x, this.hero.y - 7);
  }

  private separateHeroFromBoss(): void {
    const boss = this.boss; if (!boss?.active) return;
    const angle = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, boss.x, boss.y) > 1 ? Phaser.Math.Angle.Between(boss.x, boss.y, this.hero.x, this.hero.y) : Math.PI / 2;
    this.hero.setGroundPosition(boss.x + Math.cos(angle) * (BALANCE.boss.separationRadius + 18), boss.y + Math.sin(angle) * (BALANCE.boss.separationRadius + 18)); this.hero.constrainToArena();
  }

  private markTutorial(action: string): void {
    if (!this.tutorialEnabled) return;
    const current = this.tutorialSteps[this.tutorialIndex]; if (!current || current.action !== action) return;
    this.tutorialIndex += 1;
    if (action === 'parry' || action === 'stop' || action === 'rewind') this.sentence = this.sentenceMax;
    const next = this.tutorialSteps[this.tutorialIndex];
    if (next) { this.services.ui.showTutorial(next.text); this.tutorialHideAt = this.time.now + 5000; }
    else { this.services.ui.hideTutorial(); this.services.save.tutorialSeen = true; this.services.persist(); }
  }

  private updateHud(time: number): void {
    this.combatHeartbeats.audio = performance.now();
    const liveBoss = this.boss?.active && !this.boss.removing && Number(this.boss.getData('runId')) === this.runId ? this.boss : undefined;
    if (liveBoss) this.runSession.updateBoss(this.runId, { health: liveBoss.phaseHealth, maxHealth: liveBoss.phaseMaxHealth, phase: liveBoss.phase as 1 | 2 | 3 });
    const boss = this.runSession.shouldShowBossHud(this.runId, this.flow.baseState, liveBoss?.id) ? liveBoss : undefined;
    const chain = this.wordChain.snapshot(time);
    const chainFrozenProjectiles = chain?.opener === 'stop'
      ? [...this.projectiles].filter((projectile) => projectile.active && projectile.enemyOwned && !projectile.reflected && projectile.frozenUntil > time).length
      : 0;
    const chainStoppedTargets = chain?.opener === 'stop'
      ? [...this.enemies].filter((enemy) => enemy.active && !enemy.removing && enemy.isStopped).length
      : 0;
    const chainContextLabel = chain?.opener === 'stop' ? `정지 탄환 ${chainFrozenProjectiles} · 정지 적 ${chainStoppedTargets}`
      : chain?.opener === 'link' ? `연결 대상 ${this.wordStatuses.count('LINKED', time) + this.wordStatuses.count('ISOLATED', time)}`
        : chain?.opener === 'pull' ? `압축 대상 ${this.wordStatuses.count('COMPRESSED', time)}`
          : chain?.opener === 'mark' ? `각인 대상 ${this.wordStatuses.count('MARKED', time)}`
            : chain?.opener === 'push' ? `밀려난 대상 ${this.wordStatuses.count('DISPLACED', time)}` : undefined;
    const rewindRecords = this.rewind.getRange(time, BALANCE.words.rewindDuration);
    const rewindTarget = rewindRecords[0];
    const actSnapshot = this.runAct.snapshot();
    const waveLabel = liveBoss ? 'Boss' : this.runAct.current.waves[this.waveIndex]?.label ?? '전환';
    const modifierIds = [...new Set([
      ...[...this.activeActPatterns].filter((id) => id !== 'archive-baseline'),
      ...this.activeEndlessModifiers,
    ])];
    const modifierItems = modifierIds.map((id) => { const definition = modifierDefinition(id); return { name: definition?.displayName ?? modifierLabel(id), icon: definition?.icon ?? '異' }; });
    this.services.ui.updateHud({
      health: this.hero.health, maxHealth: this.hero.maxHealth, sentence: this.sentence, sentenceMax: this.sentenceMax,
      score: this.score, stage: waveLabel,
      actIndex: this.runAct.current.index, actName: this.runAct.current.name, waveLabel, bossesDefeated: actSnapshot.bossesDefeated, modifiers: modifierItems,
      stopCooldown: Math.max(0, (this.stopReadyAt - time) / 1000), rewindCooldown: Math.max(0, (this.rewindReadyAt - time) / 1000), linkCooldown: Math.max(0, (this.linkReadyAt - time) / 1000), empowered: this.empowered,
      canStop: time >= this.stopReadyAt,
      canRewind: time >= this.rewindReadyAt,
      canLink: time >= this.linkReadyAt && (this.services.save.settings.controlMode === 'mouse' || this.hasWordTarget(Number.POSITIVE_INFINITY)),
      wordSlots: (['Q', 'E', 'R'] as WordSlot[]).map((slot) => { const wordId = this.wordLoadout.wordForSlot(slot); const readyAt = this.readyAtForWord(wordId); return { slot, wordId, name: wordDisplayName(wordId), cooldown: Math.max(0, (readyAt - time) / 1000), canUse: time >= readyAt && (wordId !== 'link' && wordId !== 'mark' || this.hasWordTarget(Number.POSITIVE_INFINITY)) }; }),
      rewindPreviewHealth: rewindTarget?.health,
      sentencePulse: time < this.sentencePulseUntil,
      controlMode: this.services.save.settings.controlMode,
      chainOpener: chain?.opener, chainRemaining: chain ? Math.max(0, (chain.expiresAt - time) / 1000) : undefined,
      chainProgress: chain ? Math.max(0, (chain.expiresAt - time) / BALANCE.chain.window) : undefined,
      chainNext: chain?.nextWords,
      chainFrozenProjectiles,
      chainStoppedTargets,
      chainContextLabel,
      cutCooldown: this.weaponCooldowns.cutRemaining(time) / 1000,
      echoBladeRange: this.currentEchoBladeProfile().range,
      echoBladeInterval: this.currentEchoBladeProfile().interval / 1000,
      echoBladeOrbitCount: this.currentEchoBladeProfile().orbitCount,
      upgrades: this.upgrades.entries().map(({ id, stacks }) => {
        const definition = upgradeById(id); return { id, name: definition?.name ?? id, stacks, effect: definition ? upgradeDescription(definition, stacks) : '', icon: definition?.icon.glyph ?? '言', color: definition?.icon.color ?? '#89d8c8', active: this.lastActivatedUpgrade === id && time <= this.lastActivatedUpgradeUntil };
      }),
      resonances: this.upgrades.activeResonances().map((id) => { const resonance = resonanceById(id); return { name: resonance?.name ?? id, icon: resonance?.icon.glyph ?? '鳴', effect: resonance?.description ?? '', active: this.lastActivatedResonance === id && time <= this.lastActivatedResonanceUntil }; }),
      bossHealth: boss?.phaseHealth, bossMaxHealth: boss?.phaseMaxHealth, bossPhase: boss?.phase,
      bossGuide: boss?.definition.phaseDefinitions[boss.phase - 1]?.guide,
      bossName: boss ? boss.definition.displayName : undefined,
    });
  }

  private togglePause(): void {
    if (this.flow.baseState === 'RUN_START' || this.flow.baseState === 'RESULT' || this.flow.baseState === 'RUN_OVER' || this.flow.baseState === 'ACT_CLEAR' || this.flow.baseState === 'BOSS_REWARD' || this.flow.baseState === 'BOSS_REWARD_REVEAL' || this.flow.baseState === 'BOSS_REWARD_SELECT' || this.flow.baseState === 'ACT_TRANSITION' || this.flow.baseState === 'ACT_INTRO' || this.flow.baseState === 'MODIFIER_INTRO' || this.flow.baseState === 'WAVE_CLEAR' || this.flow.baseState === 'BOSS_DEFEATED' || this.flow.baseState === 'ROUND_CLEAR' || this.flow.baseState === 'REWARD_REVEAL' || this.flow.baseState === 'REWARD_SELECT') return;
    if (this.flow.isUserPaused) {
      this.flow.setUserPaused(false, performance.now()); this.timeControl.release('USER_PAUSE', this.timeOwner);
      this.services.ui.hidePause(); this.clearCombatInput(); this.syncInputContext(); return;
    }
    this.flow.setUserPaused(true, performance.now()); this.timeControl.acquire('USER_PAUSE', this.timeOwner); this.clearCombatInput(); this.syncInputContext();
    this.services.ui.showPause(() => {
      this.flow.setUserPaused(false, performance.now()); this.timeControl.release('USER_PAUSE', this.timeOwner); this.clearCombatInput(); this.syncInputContext();
    }, () => {
      this.flow.setUserPaused(false, performance.now()); this.timeControl.release('USER_PAUSE', this.timeOwner);
      this.clearCombatInput(); this.finishRun(false);
    }, [
      `Act ${this.runAct.current.index} · ${this.runAct.current.name}`,
      `Modifier · ${modifierIdsForPause(this.activeActPatterns, this.runAct.current.modifiers).join(' · ') || '없음'}`,
      ...this.upgrades.entries().map(({ id, stacks }) => {
        const definition = upgradeById(id); const contribution = this.upgrades.runtimeSnapshot().contributions[id];
        return definition ? `${definition.icon.glyph} ${definition.name} ×${stacks} — ${upgradeDescription(definition, stacks)} · 발동 ${contribution?.activationCount ?? 0} · 기여 피해 ${Math.round(contribution?.damageContribution ?? 0)} · 회복 ${Math.round(contribution?.healingContribution ?? 0)}` : id;
      }),
      ...this.upgrades.activeResonances().map((id) => { const resonance = resonanceById(id); return `공명 ${resonance?.icon.glyph ?? '鳴'} ${resonance?.name ?? id} — ${resonance?.description ?? ''}`; }),
    ]);
  }

  private beginBossDefeated(defeatedBoss: Enemy): void {
    if (this.flow.baseState === 'BOSS_DEFEATED' || this.flow.baseState === 'ACT_CLEAR' || this.flow.baseState === 'BOSS_REWARD_REVEAL' || this.flow.baseState === 'BOSS_REWARD_SELECT' || this.flow.baseState === 'ACT_TRANSITION') return;
    if (!this.transitionFlow('BOSS_DEFEATED')) return;
    this.bossDeathEvents += 1;
    this.clearTransientCombatObjects();
    this.combatStats.setBossPhaseTime(3, Math.max(0, (this.time.now - this.bossPhaseStartedAt) / 1000));
    this.combatStats.setEncounterTime('boss', Math.max(0, (this.time.now - this.encounterStartedAt) / 1000));
    this.timeControl.acquire('BOSS_DEFEATED', this.timeOwner);
    this.hero.controlsLocked = true; this.clearCombatInput(); this.wordChain.reset();
    for (const projectile of this.projectiles) projectile.destroy(); this.projectiles.clear();
    this.inkZones.forEach((zone) => zone.circle.destroy()); this.inkZones = [];
    for (const enemy of [...this.enemies]) { enemy.cancelAttackIntent(this.time.now + BALANCE.pacing.bossDefeatDuration); enemy.destroy(); this.enemies.delete(enemy); }
    this.clearLinks(); this.currentTarget = undefined; this.comboTarget = undefined; this.heldAttackTarget = undefined; this.targetMarkerUntil = 0;
    this.services.audio.play('phase'); this.cameraKick(0.006, 180);
    this.runeBurst(defeatedBoss.x, defeatedBoss.y - 35, 24);
    this.showWordTypography('기록이 풀려난다', 480, 165, true);
    if (!this.services.save.settings.reducedMotion) this.cameras.main.zoomTo(1.055, 420);
    this.runDelayedCall(BALANCE.pacing.bossDefeatDuration, () => {
      if (!this.sys.isActive() || this.flow.baseState !== 'BOSS_DEFEATED') return;
      if (!this.services.save.settings.reducedMotion) this.cameras.main.zoomTo(1, 260);
      this.runAct.completeBoss(this.time.now, this.damageTaken);
      this.score += 2600 + this.runAct.current.index * 350;
      const minimumHealth = this.hero.maxHealth * .45;
      const recovery = Math.max(this.hero.maxHealth * .25, minimumHealth - this.hero.health);
      const restored = Math.max(0, Math.min(this.hero.maxHealth - this.hero.health, recovery));
      if (restored > 0) { this.hero.heal(restored); this.damageNumber(this.hero.x, this.hero.y - 58, restored, 0x8de5d3, false, '+보스 회복 '); }
      this.timeControl.release('BOSS_DEFEATED', this.timeOwner);
      this.timeControl.acquire('REWARD_SCREEN', this.timeOwner);
      if (!this.transitionFlow('ACT_CLEAR')) return;
      const act = this.runAct.current;
      const resonances = this.upgrades.activeResonances().map((id) => resonanceById(id)?.name ?? id);
      this.services.ui.showActClear({
        index: act.index,
        name: act.name,
        recovery: restored,
        bossesDefeated: this.runAct.snapshot().bossesDefeated,
        upgrades: this.upgrades.summary(),
        resonances,
      }, () => {
        if (!this.sys.isActive() || this.flow.baseState !== 'ACT_CLEAR') return;
        if (!this.transitionFlow('BOSS_REWARD_REVEAL')) return;
        this.showUpgradeChoices(undefined, true);
      });
    });
  }

  private beginNextAct(): void {
    if (!this.transitionFlow('ACT_TRANSITION')) return;
    this.actTransitionStartedAt = performance.now();
    this.timeControl.acquire('SCENE_TRANSITION', this.timeOwner);
    this.clearCombatInput(); this.hero.controlsLocked = true; this.wordChain.reset(); this.clearLinks(); this.clearTransientCombatObjects();
    this.actPatternGeneration += 1; this.waveSpawnGeneration += 1; this.waveDirector.reset();
    for (const projectile of this.projectiles) projectile.destroy(); this.projectiles.clear();
    for (const enemy of [...this.enemies]) { enemy.destroy(); this.enemies.delete(enemy); }
    this.inkZones.forEach((zone) => zone.circle.destroy()); this.inkZones = []; this.stitchedPairs.clear();
    this.currentTarget = undefined; this.comboTarget = undefined; this.heldAttackTarget = undefined; this.targetMarkerUntil = 0; this.boss = undefined;
    this.runSession.clearBoss(this.runId, true);
    const next = this.runAct.advanceAct(this.time.now, this.damageTaken);
    this.runProgress.beginAct(this.runId, { actNumber: next.index, actId: next.id, actName: next.name, themeId: next.theme, enemySetId: next.enemySetId, bossId: next.bossId, modifiers: next.modifiers });
    this.waveIndex = 0; this.firstWaveSpawnOrdinal = 0; this.stopReadyAt = this.time.now; this.rewindReadyAt = this.time.now; this.linkReadyAt = this.time.now;
    this.hero.setGroundPosition(480, 300); this.hero.setVelocity(0); this.hero.health = Math.min(this.hero.health, this.hero.maxHealth);
    this.arenaContainer?.destroy(true); this.atmosphere?.destroy();
    this.arenaContainer = next.theme === 'echo-room' || next.theme === 'endless-echo' ? createArchiveArena(this) : createInkArchiveArena(this, next.index >= 3 ? next.index : 0);
    this.createAtmosphere();
    const resonanceNames = this.upgrades.activeResonances().map((id) => resonanceById(id)?.name ?? id);
    if (!this.transitionFlow('ACT_INTRO')) return;
    const actModifierLabels = modifierLabelsForAct(next.waves.flatMap((wave) => wave.patterns), next.modifiers);
    this.services.ui.showActTransition({ index: next.index, name: next.name, summary: next.summary, modifiers: actModifierLabels, upgrades: this.upgrades.summary(), resonances: resonanceNames }, () => {
      if (!this.sys.isActive() || this.flow.baseState !== 'ACT_INTRO') return;
      this.lastActTransitionDuration = Math.max(0, performance.now() - this.actTransitionStartedAt);
      this.services.ui.showHud(); this.timeControl.release('SCENE_TRANSITION', this.timeOwner);
      this.hero.controlsLocked = false; this.clearCombatInput(); this.enterWave(0);
    });
  }

  private finishRun(victory: boolean): void {
    const outcome = victory ? 'VICTORY' : 'DEFEAT';
    if (!this.runOutcome.claim(outcome)) return;
    if (this.flow.baseState === 'RESULT' || this.flow.baseState === 'RUN_OVER') return;
    if (!this.transitionFlow('RUN_OVER')) return;
    if (!this.runOutcome.consumeResultTransition(outcome)) return;
    this.clearTransientCombatObjects();
    this.runSession.clearBoss(this.runId, victory);
    this.combatStats.resultTransition();
    this.timeControl.acquire('RESULT', this.timeOwner); this.hero.controlsLocked = true;
    this.debugGraphics?.setVisible(false); this.debugStatsText?.setVisible(false); this.debugScenarioText?.setVisible(false);
    const elapsed = Math.max(1, (this.time.now - this.startTime) / 1000); if (victory) this.score += Math.max(0, 1200 - Math.floor(elapsed));
    const actSnapshot = this.runAct.snapshot();
    const progressStage = Math.min(7, this.boss?.active ? 3 + this.boss.phase : Math.min(3, this.waveIndex + 1));
    const rank = rankFor(this.score, this.damageTaken, elapsed, progressStage, victory);
    const previousBest = this.services.save.bestScore; const previousStage = this.services.save.bestStage;
    const newBest = this.score > previousBest; const milestones: string[] = [];
    if (newBest) { this.services.save.bestScore = this.score; this.services.save.bestRank = rank; milestones.push('최고 점수 갱신'); }
    if (progressStage > previousStage) { this.services.save.bestStage = progressStage; milestones.push('최고 진행 단계 갱신'); }
    if (progressStage >= 4 && !this.services.save.bossReached) { this.services.save.bossReached = true; milestones.push('첫 보스 도달'); }
    if (victory && !this.services.save.cleared) { this.services.save.cleared = true; milestones.push('첫 클리어'); }
    if (actSnapshot.highestAct > this.services.save.highestAct) { this.services.save.highestAct = actSnapshot.highestAct; milestones.push(`최고 Act ${actSnapshot.highestAct}`); }
    if (actSnapshot.bossesDefeated > this.services.save.mostBossesDefeated) { this.services.save.mostBossesDefeated = actSnapshot.bossesDefeated; milestones.push('최다 보스 처치 갱신'); }
    if (elapsed > this.services.save.longestSurvivalSeconds) { this.services.save.longestSurvivalSeconds = elapsed; milestones.push('최장 생존 기록 갱신'); }
    this.services.persist();
    this.services.audio.play(victory ? 'victory' : 'defeat');
    const progressLabel = `Act ${actSnapshot.highestAct} · ${actSnapshot.current.name}`;
    this.combatStats.setUpgrades(this.upgrades.entries());
    const details = this.combatStats.snapshot(); const chainSuccesses = Object.values(details.chainCounts).reduce((sum, value) => sum + value, 0);
    const stats: ResultStats = { victory, score: this.score, time: elapsed, damageTaken: this.damageTaken, parries: this.parries, wordUses: { ...this.wordUses }, upgrades: this.upgrades.summary(), rank, progressStage, progressLabel, previousBest, scoreDelta: this.score - previousBest, newBest, milestones, empowerUses: details.empowerUses, chainSuccesses, details, upgradeRuntime: this.upgrades.runtimeSnapshot(), reachedAct: actSnapshot.highestAct, completedActs: actSnapshot.completedActs, bossesDefeated: actSnapshot.bossesDefeated, actResults: actSnapshot.results };
    this.runTimeout(500, () => {
      if (!this.sys.isActive() || this.flow.baseState !== 'RUN_OVER') return;
      this.services.ui.showResult(stats, () => {
        this.timeControl.releaseOwner(this.timeOwner);
        this.scene.restart();
      }, () => {
        this.timeControl.releaseOwner(this.timeOwner);
        this.scene.stop(); this.scene.start('MenuScene');
      });
    });
  }

  private createAtmosphere(): void {
    this.atmosphere?.destroy();
    this.modifierEnvironment?.destroy(); this.modifierEnvironment = undefined;
    const inkTheme = this.runAct.current.theme === 'ink-archive' || this.runAct.current.theme === 'endless-ink';
    this.atmosphere = this.add.particles(0, 0, 'rune-pixel', { x: { min: 45, max: 915 }, y: { min: 70, max: 500 }, speed: { min: 1, max: inkTheme ? 9 : 6 }, angle: inkTheme ? { min: 250, max: 290 } : { min: 210, max: 330 }, lifespan: 4800, tint: inkTheme ? 0x8d659a : 0x79cbb9, alpha: { start: inkTheme ? 0.16 : 0.12, end: 0 }, quantity: 1, frequency: inkTheme ? 310 : 420 }).setDepth(DEPTH.floor);
    if (this.runAct.current.index >= 3) {
      const graphics = this.add.graphics().setDepth(DEPTH.floor + .1); this.modifierEnvironment = graphics;
      if (this.runAct.current.modifiers.includes('time-rift')) {
        graphics.lineStyle(2, 0x65527c, .22);
        for (let index = 0; index < 7; index += 1) { const x = 90 + index * 130; graphics.beginPath().moveTo(x, 85).lineTo(x + 34, 180).lineTo(x - 8, 285).lineTo(x + 48, 430).strokePath(); }
      }
      if (this.runAct.current.modifiers.includes('stitched-armor')) {
        graphics.lineStyle(3, 0x8a526f, .2);
        for (let x = 58; x < 910; x += 72) { graphics.lineBetween(x, 64, x + 24, 78); graphics.lineBetween(x + 12, 57, x + 9, 86); graphics.lineBetween(x, 474, x + 24, 460); }
      }
    }
  }

  private qaAdvance(): void {
    if (!this.flow.allowsCombatInput) return;
    if (this.boss?.active) {
      this.damageEnemy(this.boss, this.boss.phaseHealth + 1, 0, false, false, undefined, 'qa');
      return;
    }
    for (const enemy of [...this.enemies]) this.damageEnemy(enemy, enemy.health + 1, 0, true, false, undefined, 'qa');
  }

  private qaReadyWords(): void {
    this.sentence = this.sentenceMax; this.stopReadyAt = 0; this.rewindReadyAt = 0; this.linkReadyAt = 0; this.empowered = false; this.wordChain.reset();
    for (const id of ['pull', 'mark', 'push'] as WordId[]) this.wordReadyAt[id] = 0;
    this.gainFinisherCharge('qa', this.finisherCharges.maxCharges);
  }

  private cleanup(): void {
    this.clearTransientCombatObjects();
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.handlePostPhysicsUpdate, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerHandler);
    this.keys.j.off(Phaser.Input.Keyboard.Events.DOWN, this.attackKeyDownHandler);
    this.keys.j.off(Phaser.Input.Keyboard.Events.UP, this.attackKeyUpHandler);
    window.removeEventListener('keydown', this.escapeHandler);
    window.removeEventListener('keyup', this.keyUpRouterHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('blur', this.blurHandler);
    window.removeEventListener('focus', this.focusHandler);
    if (import.meta.env.DEV) delete (window as DebugWindow).__EONMAEK_DEBUG__;
    delete this.game.canvas.dataset.eonmaekDebug;
    this.timeouts.forEach((handle) => window.clearTimeout(handle)); this.timeouts = [];
    if (this.watchdogHandle !== undefined) window.clearInterval(this.watchdogHandle); this.watchdogHandle = undefined;
    this.timeControl?.dispose(false); this.damageQueue.reset(); this.inputRouter.clear(); this.parryResolver.reset();
    this.game.canvas.style.cursor = ''; this.wordChain.reset(); this.damageHistory.reset(); this.targeting.clear(); this.attackRegistry.reset(); this.attackInput.reset();
    this.clearLinks(); this.linkGraphics?.destroy(); this.rewindGraphics?.destroy(); this.rewindPreviewGhosts.forEach((ghost) => ghost.destroy()); this.rewindPreviewGhosts = []; this.heroRune?.destroy(); this.targetMarker?.destroy(); this.debugGraphics?.destroy(); this.debugStatsText?.destroy(); this.debugScenarioText?.destroy(); this.inkZones.forEach((zone) => zone.circle.destroy()); this.atmosphere?.destroy(); this.modifierEnvironment?.destroy(); this.arenaContainer?.destroy(true); this.stitchedPairs.clear();
  }
}
