import { RESONANCES, resonanceById, upgradeById, upgradeDescription, type UpgradeDefinition, type UpgradeId } from '../game/data/upgrades';
import type { AudioDiagnosticsSnapshot, AudioSystem } from '../game/systems/AudioSystem';
import type { GameSave } from '../game/systems/SaveSystem';
import type { ControlMode } from '../game/systems/SaveSystem';
import type { WordId } from '../game/systems/WordChainSystem';
import { availableReactionCount, DEFAULT_WORD_LOADOUT, reactionFor, validWordLoadout, WORD_DEFINITIONS, WORD_IDS, WORD_REACTIONS, wordStatusDisplayName, type WordSlot } from '../game/systems/WordSystem';
import type { CombatStatsSnapshot } from '../game/systems/CombatStats';
import type { UpgradeChoicePreview, UpgradeRuntimeSnapshot } from '../game/systems/UpgradeSystem';
import { isRewardSelectionKey } from '../game/systems/RewardInputPolicy';
import type { ModifierPresentation } from '../game/systems/ActModifiers';

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  'echo-blade': '잔향 칼날', 'cut-parry': '절단·패링', word: '언령', survival: '생존', generic: '범용',
};
const TAG_LABELS: Readonly<Record<string, string>> = {
  weapon: '무기', 'echo-blade': '잔향', orbit: '궤도', projectile: '탄환', cut: '절단', parry: '패링', mark: '표식',
  word: '언령', chain: '연계', resource: '자원', stop: '멎는다', pulse: '공명파', rewind: '되돌림', link: '연결',
  isolation: '고립', spread: '전염', survival: '생존', empower: '강화', dash: '대시', recovery: '회복', generic: '범용',
  wave: '파동', counter: '반격', healing: '회복', 'first-hit': '첫 피격', cooldown: '재사용', blade: '칼날', target: '표적',
};
const CHAIN_DETAILS: Readonly<Record<string, { name: string; effect: string }>> = {
  'link-stop': { name: '연쇄 정지', effect: '연결 대상 정지 · 추가 파동 피해' },
  'stop-rewind': { name: '역류', effect: '탄환 역행 · 없으면 정지 대상 최소 피해' },
  'link-rewind': { name: '피해 회귀', effect: '최근 직접 피해 재적용 · 최소 회귀 보장' },
};
const EMPOWER_FAILURE_LABELS: Readonly<Record<string, string>> = {
  'no-target': '유효 대상 없음',
  'no-stop-effect': '정지 대상·탄환 없음',
  'no-rewind-effect': '복구·잔상 효과 없음',
  'no-link-target': '연결 대상 없음',
  'stale-scope': '종료된 전투 효과',
};

type ContributionLike = Readonly<Record<string, unknown>>;
const metric = (source: unknown, ...keys: readonly string[]): number => {
  if (!source || typeof source !== 'object') return 0;
  const record = source as ContributionLike;
  for (const key of keys) if (typeof record[key] === 'number' && Number.isFinite(record[key])) return Math.max(0, record[key] as number);
  return 0;
};
const contributionSummary = (source: unknown): string => {
  const activation = metric(source, 'activationCount', 'activations', 'triggers');
  const damage = metric(source, 'damageContribution', 'damage');
  const healing = metric(source, 'healingContribution', 'healing');
  const resource = metric(source, 'resourceContribution', 'resource', 'sentence');
  const cooldown = metric(source, 'cooldownReductionContribution', 'cooldownMs');
  const reflected = metric(source, 'reflectedProjectileCount', 'reflectedProjectiles');
  const affected = metric(source, 'affectedTargetCount', 'affectedTargets');
  const prevented = metric(source, 'preventedDamage');
  const failed = metric(source, 'failedConditionCount', 'failedConditions');
  const generated = metric(source, 'generated', 'extraAttackCount');
  return [`발동 ${activation}회`, damage > 0 ? `피해 ${Math.round(damage)}` : '', healing > 0 ? `회복 ${Math.round(healing)}` : '', prevented > 0 ? `방어 ${Math.round(prevented)}` : '', resource > 0 ? `문장력 ${Math.round(resource)}` : '', cooldown > 0 ? `쿨다운 ${(cooldown / 1000).toFixed(1)}초` : '', reflected > 0 ? `반사 ${reflected}` : '', affected > 0 ? `대상 ${affected}` : '', generated > 0 ? `생성 ${generated}` : '', failed > 0 ? `조건 실패 ${failed}` : ''].filter(Boolean).join(' · ');
};

export const formatDamageRatio = (value: number, total: number): string => {
  if (value <= 0 || total <= 0) return '0%';
  const percent = value / total * 100;
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`;
};

export const describeBackflowOpportunity = (frozenProjectiles: number, stoppedTargets: number): string => (
  frozenProjectiles > 0
    ? `E 되돌린다 · 역류 가능 · 탄환 ${frozenProjectiles}개`
    : `E 되돌린다 · 최소 역류 파동 · 정지 적 ${stoppedTargets}명`
);

export type WordLoadoutEnterAction = 'IGNORE' | 'SHOW_VALIDATION' | 'CONFIRM';

/**
 * Enter belongs to the loadout form, not to the currently focused card.
 * Keeping the decision pure makes key-repeat and incomplete-selection behavior
 * testable without coupling gameplay startup to browser-native button clicks.
 */
export const resolveWordLoadoutEnterAction = (
  code: string,
  repeat: boolean,
  selectionCount: number,
): WordLoadoutEnterAction => {
  if (code !== 'Enter' || repeat) return 'IGNORE';
  return selectionCount === 3 ? 'CONFIRM' : 'SHOW_VALIDATION';
};

export interface HudState {
  health: number;
  maxHealth: number;
  godMode?: boolean;
  sentence: number;
  sentenceMax: number;
  score: number;
  stage: string;
  stopCooldown: number;
  rewindCooldown: number;
  linkCooldown: number;
  canStop: boolean;
  canRewind: boolean;
  canLink: boolean;
  wordSlots?: readonly { slot: WordSlot; wordId: WordId; name: string; cooldown: number; canUse: boolean }[];
  rewindPreviewHealth?: number;
  empowered: boolean;
  sentencePulse: boolean;
  controlMode: ControlMode;
  chainOpener?: WordId;
  chainRemaining?: number;
  chainProgress?: number;
  chainNext?: readonly WordId[];
  chainFrozenProjectiles?: number;
  chainStoppedTargets?: number;
  chainContextLabel?: string;
  cutCooldown: number;
  echoBladeRange: number;
  echoBladeInterval: number;
  echoBladeOrbitCount: number;
  upgrades: readonly { id: UpgradeId; name: string; stacks: number; effect: string; icon: string; color: string; active: boolean }[];
  resonances: readonly { name: string; icon: string; effect: string; active?: boolean }[];
  bossHealth?: number;
  bossMaxHealth?: number;
  bossPhase?: number;
  bossGuide?: string;
  bossName?: string;
  bossPhaseName?: string;
  actIndex: number;
  actName: string;
  waveLabel: string;
  bossesDefeated: number;
  modifiers: readonly { name: string; icon: string }[];
}

export interface ResultStats {
  victory: boolean;
  score: number;
  time: number;
  damageTaken: number;
  parries: number;
  wordUses: Record<string, number>;
  upgrades: string[];
  rank: string;
  progressStage: number;
  progressLabel: string;
  previousBest: number;
  scoreDelta: number;
  newBest: boolean;
  milestones: string[];
  empowerUses?: number;
  chainSuccesses?: number;
  details?: CombatStatsSnapshot;
  upgradeRuntime?: UpgradeRuntimeSnapshot;
  reachedAct?: number;
  completedActs?: number;
  bossesDefeated?: number;
  actResults?: readonly { actIndex: number; actName: string; durationSeconds: number; damageTaken: number }[];
}

export interface RewardChoiceOptions {
  revealDelayMs: number;
  acceptsKey: (event: KeyboardEvent) => boolean;
  onReady: () => void;
  previewChoice?: (id: UpgradeId) => UpgradeChoicePreview | undefined;
  eyebrow?: string;
  title?: string;
  kind?: 'wave' | 'boss';
}

export class OverlayUI {
  private persist = (): void => undefined;
  private hud?: HTMLElement;
  private tutorial?: HTMLElement;
  private damageHealth = 100;
  private damageTimer?: number;
  private chainTimer?: number;
  private rewardTimer?: number;
  private keyHandler?: (event: KeyboardEvent) => void;

  public constructor(private readonly root: HTMLElement, private readonly save: GameSave, private readonly audio: AudioSystem) {
    this.root.innerHTML = '<div class="screen boot-card"><div class="ink-seal">言</div><p>잔향을 불러오는 중…</p></div>';
  }

  public setPersistHandler(handler: () => void): void { this.persist = handler; }

  private clear(): void {
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler); this.keyHandler = undefined; }
    window.clearTimeout(this.damageTimer); this.damageTimer = undefined;
    window.clearTimeout(this.chainTimer); this.chainTimer = undefined;
    window.clearTimeout(this.rewardTimer); this.rewardTimer = undefined;
    this.root.innerHTML = '';
    this.hud = undefined;
    this.tutorial = undefined;
  }

  private bindKeyboardNavigation(
    container: HTMLElement,
    selector = 'button:not([disabled])',
    onEscape?: () => void,
    directKeys: Readonly<Record<string, () => void>> = {},
  ): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    const items = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>(selector)].filter((item) => !item.hasAttribute('disabled'));
    let index = Math.max(0, items().findIndex((item) => item.classList.contains('primary') || item.getAttribute('aria-pressed') === 'true'));
    const focus = (): void => { const current = items(); index = Math.min(index, Math.max(0, current.length - 1)); current[index]?.focus({ preventScroll: true }); };
    focus();
    const handler = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const direct = directKeys[event.code];
      if (direct) { event.preventDefault(); direct(); return; }
      const current = items(); if (current.length === 0) return;
      const previous = event.code === 'ArrowUp' || event.code === 'ArrowLeft' || event.code === 'KeyW' || event.code === 'KeyA';
      const next = event.code === 'ArrowDown' || event.code === 'ArrowRight' || event.code === 'KeyS' || event.code === 'KeyD';
      if (previous || next) { event.preventDefault(); index = (index + (previous ? -1 : 1) + current.length) % current.length; focus(); return; }
      if (event.code === 'Enter' || event.code === 'KeyJ') { event.preventDefault(); (current[index] as HTMLButtonElement | undefined)?.click(); return; }
      if (event.code === 'Escape' && onEscape) { event.preventDefault(); onEscape(); }
    };
    this.keyHandler = handler; window.addEventListener('keydown', handler);
  }

  public showMenu(onStart: () => void): void {
    this.clear();
    const screen = document.createElement('section');
    screen.className = 'screen title-screen';
    screen.innerHTML = `
      <div class="title-mist"></div>
      <div class="title-content">
        <div class="portrait-crop" aria-label="주인공 초상화"><img src="./assets/hero-concept.png" alt="검은 망토를 입은 소년의 얼굴" /></div>
        <img class="title-lockup" src="./assets/title-ui-lockup.png" alt="" aria-hidden="true" />
        <p class="eyebrow">잊힌 언어를 잇는 자</p>
        <h1><small>言脈</small> 언맥 <span>용흔 구역</span></h1>
        <p class="title-copy">용의 마지막 말이 생명 속에 남은 땅,<br />누나의 흔적을 따라 미지의 함몰지로 내려간다.</p>
        <div class="menu-actions">
          <button class="rune-button primary" data-action="start"><span class="menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18"/><circle cx="12" cy="12" r="4"/></svg></span><span class="menu-label">탐사 시작</span><kbd>Enter</kbd></button>
          <button class="rune-button" data-action="controls"><span class="menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5.5c3.1-.8 5.7-.2 8 1.7v12c-2.3-1.9-4.9-2.5-8-1.7zM20 5.5c-3.1-.8-5.7-.2-8 1.7v12c2.3-1.9 4.9-2.5 8-1.7z"/></svg></span><span class="menu-label">조작법</span></button>
          <button class="rune-button" data-action="settings"><span class="menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/></svg></span><span class="menu-label">설정</span></button>
        </div>
        <div class="title-record-row"><span class="menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19V12h3v7zM10.5 19V5h3v14zM16 19V9h3v10z"/></svg></span><span class="menu-label">최고 기록</span></div>
        <div class="best-record"><span>최고 기록</span><strong>${this.save.bestScore.toLocaleString()} · ${this.save.bestRank} 랭크</strong><small>Act ${this.save.highestAct} · 보스 ${this.save.mostBossesDefeated} · 최장 ${Math.floor(this.save.longestSurvivalSeconds / 60)}:${Math.floor(this.save.longestSurvivalSeconds % 60).toString().padStart(2, '0')}</small></div>
      </div>
      <p class="footer-note">한 판 4–6분 · 헤드폰 권장</p>`;
    this.root.append(screen);
    const start = (): void => { if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler); this.keyHandler = undefined; this.audio.unlock(); onStart(); };
    screen.querySelector('[data-action="start"]')?.addEventListener('click', start, { once: true });
    screen.querySelector('[data-action="controls"]')?.addEventListener('click', () => this.showControls(() => this.showMenu(onStart)));
    screen.querySelector('[data-action="settings"]')?.addEventListener('click', () => this.showSettings(() => this.showMenu(onStart)));
    this.bindKeyboardNavigation(screen, '.menu-actions button');
  }

  private showControls(back: () => void): void {
    this.clear();
    const screen = document.createElement('section');
    screen.className = 'screen parchment-panel controls-screen';
    screen.innerHTML = `<div class="panel-content wide"><p class="eyebrow">살아남기 위한 문법</p><h2>조작법</h2>
      <div class="control-grid">
        <div><kbd>WASD</kbd><kbd>방향키</kbd><span>이동 · 메뉴 선택</span></div><div><kbd>J</kbd><span>마지막 이동 방향으로 한 번 절단</span></div>
        <div><kbd>K</kbd><kbd>Shift</kbd><span>패링</span></div><div><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><span>강화 즉시 선택</span></div>
        <div><kbd>Space</kbd><span>무적 대시</span></div><div><kbd>F</kbd><span>다음 언령 강화</span></div>
        <div class="word"><kbd>Q</kbd><span><b>멎는다</b> 적과 탄환 정지</span></div>
        <div class="word"><kbd>E</kbd><span><b>되돌린다</b> 2초 전 상태 복원</span></div>
        <div class="word"><kbd>R</kbd><span><b>잇는다</b> 피해 공유 연결</span></div>
        <div><kbd>Enter</kbd><kbd>J</kbd><span>메뉴 결정</span></div><div><kbd>Esc</kbd><span>일시정지 · 뒤로</span></div>
        <div class="control-note"><b>키보드 전용이 기본입니다.</b><span>설정에서 기존 마우스 조준 방식으로 전환할 수 있습니다.</span></div>
      </div><button class="rune-button primary" data-action="back">돌아가기</button></div>`;
    this.root.append(screen);
    screen.querySelector('[data-action="back"]')?.addEventListener('click', back, { once: true });
    this.bindKeyboardNavigation(screen, 'button', back);
  }

  private showSettings(back: () => void): void {
    this.clear();
    const current = this.save.settings;
    const diagnostics = this.audio.diagnostics();
    const screen = document.createElement('section');
    screen.className = 'screen parchment-panel';
    screen.innerHTML = `<div class="panel-content"><p class="eyebrow">탐사 환경</p><h2>설정</h2>
      <div class="control-setting"><span>조작 방식</span><div class="control-mode-options">
        <button data-control="keyboard" aria-pressed="${current.controlMode === 'keyboard'}"><b>키보드 전용</b><small>8방향 절단 + 언령</small></button>
        <button data-control="mouse" aria-pressed="${current.controlMode === 'mouse'}"><b>기존 마우스 조준</b><small>클릭 절단 + 포인터 방향</small></button>
      </div></div>
      <label class="setting-row"><span>전체 볼륨 <output>${Math.round(current.masterVolume * 100)}</output></span><input data-setting="masterVolume" type="range" min="0" max="1" step="0.05" value="${current.masterVolume}" /></label>
      <label class="setting-row"><span>효과음 볼륨 <output>${Math.round(current.effectsVolume * 100)}</output></span><input data-setting="effectsVolume" type="range" min="0" max="1" step="0.05" value="${current.effectsVolume}" /></label>
      <label class="setting-row"><span>화면 흔들림 <output>${Math.round(current.shake * 100)}</output></span><input data-setting="shake" type="range" min="0" max="1" step="0.05" value="${current.shake}" /></label>
      <label class="toggle-row"><input data-setting="reducedMotion" type="checkbox" ${current.reducedMotion ? 'checked' : ''} /><span>감소된 모션</span></label>
      <label class="toggle-row"><input data-setting="showTutorial" type="checkbox" ${current.showTutorial && !this.save.tutorialSeen ? 'checked' : ''} /><span>튜토리얼 다시 보기</span></label>
      <label class="toggle-row"><input data-setting="holdCutRepeat" type="checkbox" ${current.holdCutRepeat ? 'checked' : ''} /><span>접근성: J 유지 시 절단 반복</span></label>
      ${import.meta.env.DEV ? `<div class="audio-diagnostics"><b>오디오 진단</b><output data-audio-diagnostics>${this.audioDiagnosticText(diagnostics)}</output><div><button data-audio-bus="ui">UI</button><button data-audio-bus="combat">전투</button><button data-audio-bus="music">음악</button><button data-audio-bus="ambience">환경</button><button data-audio-sound="cut">J 절단</button><button data-audio-sound="parry">패링</button><button data-audio-sound="perfectParry">완벽 패링</button><button data-audio-sound="stop">Q</button><button data-audio-sound="rewind">E</button><button data-audio-sound="link">R</button><button data-audio-sound="sentenceFull">F 준비</button><button data-audio-sound="upgrade">카드</button><button data-audio-sound="damageRegression">공명</button><button data-audio-sound="phase">보스 단계</button></div></div>` : ''}
      <div class="panel-buttons"><button class="rune-button" data-action="audio-test">전투 음량 시험</button><button class="rune-button" data-action="mute">${this.audio.isMuted ? '음소거 해제' : '즉시 음소거'}</button><button class="rune-button primary" data-action="back">저장하고 돌아가기</button></div></div>`;
    this.root.append(screen);
    screen.querySelectorAll<HTMLButtonElement>('[data-control]').forEach((button) => {
      button.addEventListener('click', () => {
        current.controlMode = button.dataset.control === 'mouse' ? 'mouse' : 'keyboard';
        screen.querySelectorAll<HTMLButtonElement>('[data-control]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
        this.persist();
      });
    });
    screen.querySelectorAll<HTMLInputElement>('input[data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting;
        if (key === 'reducedMotion' || key === 'showTutorial' || key === 'holdCutRepeat') {
          current[key] = input.checked;
          if (key === 'showTutorial' && input.checked) {
            this.save.tutorialSeen = false;
            this.save.modifierTutorialsSeen = [];
          }
        }
        else if (key === 'masterVolume' || key === 'effectsVolume' || key === 'shake') {
          current[key] = Number(input.value);
          const output = input.parentElement?.querySelector('output'); if (output) output.textContent = `${Math.round(Number(input.value) * 100)}`;
        }
        this.audio.updateSettings(current); this.persist();
      });
    });
    screen.querySelector('[data-action="mute"]')?.addEventListener('click', (event) => {
      const muted = this.audio.toggleMute(); (event.currentTarget as HTMLButtonElement).textContent = muted ? '음소거 해제' : '즉시 음소거';
    });
    const refreshAudioDiagnostics = (): void => {
      const output = screen.querySelector<HTMLOutputElement>('[data-audio-diagnostics]'); if (!output) return;
      const state = this.audio.diagnostics();
      output.textContent = this.audioDiagnosticText(state);
    };
    screen.querySelectorAll<HTMLButtonElement>('[data-audio-bus]').forEach((button) => button.addEventListener('click', () => { this.audio.playDiagnostic(button.dataset.audioBus as 'ui' | 'combat' | 'music' | 'ambience'); refreshAudioDiagnostics(); }));
    screen.querySelectorAll<HTMLButtonElement>('[data-audio-sound]').forEach((button) => button.addEventListener('click', () => { this.audio.playDiagnostic(button.dataset.audioSound as Parameters<AudioSystem['playDiagnostic']>[0]); refreshAudioDiagnostics(); }));
    screen.querySelector('[data-action="audio-test"]')?.addEventListener('click', () => { this.audio.unlock(); this.audio.play('parry'); window.setTimeout(() => { this.audio.play('finisher'); refreshAudioDiagnostics(); }, 180); });
    screen.querySelector('[data-action="back"]')?.addEventListener('click', () => { this.persist(); back(); }, { once: true });
    this.bindKeyboardNavigation(screen, 'button', () => { this.persist(); back(); });
  }

  public showHud(): void {
    this.clear();
    const hud = document.createElement('section');
    hud.className = 'hud';
    hud.innerHTML = `<div class="health-panel"><div class="hero-mini"><img src="./assets/hero-concept.png" alt="" /></div><div><div class="hud-label">생명 <span data-health-text>100 / 100</span></div><div class="health-track"><i data-health-ghost></i><em data-health-rewind></em><b data-health></b></div></div></div>
      <div class="stage-panel"><span data-stage>서벽 절벽지대</span><small data-run-context>Act 1 · 서벽 절벽지대 · 보스 0</small><em data-modifiers></em><em class="hidden" data-god-mode>DEV GOD MODE</em><strong data-score>0</strong></div>
      <div class="boss-panel hidden" data-boss><div><span data-boss-name>반향각 산양</span><em data-boss-phase>영역 경고</em></div><small data-boss-guide></small><div class="boss-track"><b data-boss-health></b></div></div>
      <div class="word-hud">
        <div class="finisher-slot ready" data-cut><kbd>J</kbd><b data-cut-label>절단</b><small data-cut-status>준비 완료</small><span data-echo-status>잔향 칼날</span></div>
        <div class="word-slot" data-word="q"><kbd>Q</kbd><b>멎는다</b><span data-cooldown>비용 25</span></div>
        <div class="word-slot" data-word="e"><kbd>E</kbd><b>되돌린다</b><span data-cooldown>비용 30</span></div>
        <div class="word-slot" data-word="r"><kbd>R</kbd><b>잇는다</b><span data-cooldown>비용 35</span></div>
        <div class="sentence"><div><span>문장력</span><b data-sentence-text>0 / 100</b></div><div class="sentence-track"><i data-sentence></i></div><button data-empower><kbd>F</kbd> 강화 용언</button></div>
      </div>
      <div class="chain-status hidden" data-chain-status></div>
      <div class="chain-toast hidden" data-chain-toast></div>
      <div class="owned-upgrades hidden" data-owned-upgrades></div>
      <button class="hud-mute" data-mute aria-label="음소거">${this.audio.isMuted ? '×' : '♪'}</button>
      <div class="tutorial-banner hidden" data-tutorial></div>`;
    this.root.append(hud); this.hud = hud;
    this.tutorial = hud.querySelector<HTMLElement>('[data-tutorial]') ?? undefined;
    hud.querySelector('[data-mute]')?.addEventListener('click', (event) => {
      const muted = this.audio.toggleMute(); (event.currentTarget as HTMLButtonElement).textContent = muted ? '×' : '♪';
    });
  }

  public updateHud(state: HudState): void {
    if (!this.hud) return;
    const healthPercent = Math.max(0, state.health / state.maxHealth) * 100;
    const healthBar = this.hud.querySelector<HTMLElement>('[data-health]');
    const ghost = this.hud.querySelector<HTMLElement>('[data-health-ghost]');
    const rewindPreview = this.hud.querySelector<HTMLElement>('[data-health-rewind]');
    if (healthBar) healthBar.style.width = `${healthPercent}%`;
    const currentGhost = this.damageHealth;
    if (state.health < currentGhost) {
      window.clearTimeout(this.damageTimer);
      this.damageTimer = window.setTimeout(() => { this.damageHealth = state.health; if (ghost) ghost.style.width = `${healthPercent}%`; }, 500);
    } else { this.damageHealth = state.health; if (ghost) ghost.style.width = `${healthPercent}%`; }
    if (rewindPreview) {
      const previewPercent = Math.max(0, Math.min(100, (state.rewindPreviewHealth ?? state.health) / state.maxHealth * 100));
      rewindPreview.style.width = `${previewPercent}%`;
      rewindPreview.classList.toggle('visible', previewPercent > healthPercent + 0.5);
    }
    const healthText = this.hud.querySelector('[data-health-text]'); if (healthText) healthText.textContent = `${Math.ceil(state.health)} / ${state.maxHealth}`;
    const sentence = this.hud.querySelector<HTMLElement>('[data-sentence]'); if (sentence) sentence.style.width = `${Math.min(100, state.sentence / state.sentenceMax * 100)}%`;
    const sentenceText = this.hud.querySelector('[data-sentence-text]'); if (sentenceText) sentenceText.textContent = `${Math.floor(state.sentence)} / ${state.sentenceMax}`;
    const sentencePanel = this.hud.querySelector<HTMLElement>('.sentence'); sentencePanel?.classList.toggle('max-pulse', state.sentencePulse);
    const cut = this.hud.querySelector<HTMLElement>('[data-cut]');
    if (cut) {
      cut.classList.toggle('ready', state.cutCooldown <= 0);
      cut.classList.toggle('empty', state.cutCooldown > 0);
      const status = cut.querySelector<HTMLElement>('[data-cut-status]');
      if (status) status.textContent = state.cutCooldown > 0 ? `${state.cutCooldown.toFixed(1)}s` : '준비 완료';
      const echo = cut.querySelector<HTMLElement>('[data-echo-status]');
      if (echo) echo.textContent = `잔향 ${state.echoBladeOrbitCount} · 범위 ${Math.round(state.echoBladeRange)} · ${state.echoBladeInterval.toFixed(1)}s`;
    }
    const stage = this.hud.querySelector('[data-stage]'); if (stage) stage.textContent = state.stage;
    const runContext = this.hud.querySelector('[data-run-context]'); if (runContext) runContext.textContent = `Act ${state.actIndex} · ${state.actName} · 보스 ${state.bossesDefeated}`;
    const modifier = this.hud.querySelector('[data-modifiers]'); if (modifier) modifier.textContent = state.modifiers.length ? state.modifiers.map((item) => `${item.icon} ${item.name}`).join(' · ') : '';
    const godMode = this.hud.querySelector<HTMLElement>('[data-god-mode]'); godMode?.classList.toggle('hidden', !state.godMode);
    const score = this.hud.querySelector('[data-score]'); if (score) score.textContent = state.score.toLocaleString();
    const fallbackSlots: HudState['wordSlots'] = [
      { slot: 'Q', wordId: 'stop', name: '멎는다', cooldown: state.stopCooldown, canUse: state.canStop },
      { slot: 'E', wordId: 'rewind', name: '되돌린다', cooldown: state.rewindCooldown, canUse: state.canRewind },
      { slot: 'R', wordId: 'link', name: '잇는다', cooldown: state.linkCooldown, canUse: state.canLink },
    ];
    const equippedSlots = state.wordSlots ?? fallbackSlots;
    this.hud.querySelectorAll<HTMLElement>('.word-slot').forEach((slot, index) => {
      const equipped = equippedSlots[index]; const value = equipped?.cooldown ?? 0; const usable = equipped?.canUse ?? false;
      if (equipped) { slot.dataset.word = equipped.wordId; const key = slot.querySelector('kbd'); if (key) key.textContent = equipped.slot; const name = slot.querySelector('b'); if (name) name.textContent = equipped.name; }
      slot.classList.toggle('unavailable', !usable); slot.classList.toggle('cooling', value > 0); slot.classList.toggle('ready', usable); slot.classList.toggle('empowered', state.empowered && value <= 0);
      const label = slot.querySelector('[data-cooldown]');
        if (label) label.textContent = value > 0 ? `재사용 ${value.toFixed(1)}s` : state.empowered ? '강화 준비' : usable ? '준비 완료' : '대상 없음';
    });
    const chainStatus = this.hud.querySelector<HTMLElement>('[data-chain-status]');
    const wordNames: Record<WordId, string> = Object.fromEntries(Object.values(WORD_DEFINITIONS).map((definition) => [definition.id, definition.displayName])) as Record<WordId, string>;
    const wordKeys = Object.fromEntries(equippedSlots.map((slot) => [slot.wordId, slot.slot])) as Partial<Record<WordId, string>>;
    const chainNext = state.chainNext ?? [];
    this.hud.querySelectorAll<HTMLElement>('.word-slot').forEach((slot) => {
      const word = slot.dataset.word as WordId | undefined;
      slot.classList.toggle('chain-next', word !== undefined && chainNext.includes(word));
    });
    if (chainStatus && state.chainOpener && (state.chainRemaining ?? 0) > 0) {
      chainStatus.classList.remove('hidden');
      chainStatus.style.setProperty('--chain-progress', `${Math.max(0, Math.min(1, state.chainProgress ?? 0)) * 360}deg`);
      const nextDescriptions = chainNext.map((word) => { const generic = reactionFor(state.chainOpener!, word); return { word, detail: CHAIN_DETAILS[`${state.chainOpener}-${word}`] ?? (generic ? { name: generic.displayName, effect: generic.resultEffect } : undefined) }; });
      const opportunity = state.chainOpener === 'stop' && chainNext.includes('rewind')
        ? describeBackflowOpportunity(state.chainFrozenProjectiles ?? 0, state.chainStoppedTargets ?? 0)
        : nextDescriptions.map(({ word, detail }) => `${wordKeys[word] ?? 'Q/E/R'} ${wordNames[word]} · ${detail?.name ?? ''}`).join(' / ');
      chainStatus.innerHTML = `<span>${wordNames[state.chainOpener]} 이후</span><b>${opportunity}</b><i>${(state.chainRemaining ?? 0).toFixed(1)}s</i><small>${state.chainContextLabel ? `${state.chainContextLabel} · ` : ''}${nextDescriptions.map(({ detail }) => detail?.effect ?? '').filter(Boolean).join(' / ')}</small>`;
    } else chainStatus?.classList.add('hidden');
    const empower = this.hud.querySelector<HTMLElement>('[data-empower]');
    if (empower) { empower.classList.toggle('ready', state.sentence >= state.sentenceMax || state.empowered); empower.classList.toggle('armed', state.empowered); empower.innerHTML = state.empowered ? '<kbd>F</kbd> 다음 언령 강화됨' : '<kbd>F</kbd> 강화 용언'; }
    const boss = this.hud.querySelector<HTMLElement>('[data-boss]');
    if (boss && state.bossHealth !== undefined && state.bossMaxHealth !== undefined) {
      boss.classList.remove('hidden');
      const name = boss.querySelector('[data-boss-name]'); if (name) name.textContent = state.bossName ?? '반향각 산양';
      const bar = boss.querySelector<HTMLElement>('[data-boss-health]'); if (bar) bar.style.width = `${Math.max(0, state.bossHealth / state.bossMaxHealth) * 100}%`;
      const phase = boss.querySelector('[data-boss-phase]'); if (phase) phase.textContent = state.bossPhaseName ?? `제${state.bossPhase ?? 1}형`;
      const guide = boss.querySelector('[data-boss-guide]'); if (guide) guide.textContent = state.bossGuide ?? '';
    } else boss?.classList.add('hidden');
    const owned = this.hud.querySelector<HTMLElement>('[data-owned-upgrades]');
    if (owned) {
      owned.classList.toggle('hidden', state.upgrades.length === 0 && state.resonances.length === 0);
      const visibleUpgrades = state.upgrades.slice(0, 5); const hiddenCount = Math.max(0, state.upgrades.length - visibleUpgrades.length);
      owned.innerHTML = `${visibleUpgrades.map((upgrade) => `<span class="${upgrade.active ? 'proc' : ''}" title="${upgrade.effect}" style="--upgrade-color:${upgrade.color}"><i>${upgrade.icon}</i>${upgrade.name}<b>×${upgrade.stacks}</b></span>`).join('')}${hiddenCount > 0 ? `<span class="upgrade-more">+${hiddenCount}</span>` : ''}${state.resonances.map((resonance) => `<span class="resonance ${resonance.active ? 'proc' : ''}" title="${resonance.effect}"><i>${resonance.icon}</i>${resonance.name}</span>`).join('')}`;
    }
  }

  public showChainTrigger(name: string, duration: number): void {
    const toast = this.hud?.querySelector<HTMLElement>('[data-chain-toast]');
    if (!toast) return;
    window.clearTimeout(this.chainTimer);
    toast.textContent = name;
    toast.classList.remove('hidden');
    toast.classList.remove('triggered');
    void toast.offsetWidth;
    toast.style.animationDuration = `${duration}ms`;
    toast.classList.add('triggered');
    this.chainTimer = window.setTimeout(() => toast.classList.add('hidden'), duration);
  }

  public showTutorial(text: string): void {
    if (!this.tutorial) return;
    this.tutorial.innerHTML = text; this.tutorial.classList.remove('hidden');
  }
  public hideTutorial(): void { this.tutorial?.classList.add('hidden'); }

  public showUpgradeChoice(choices: readonly UpgradeDefinition[], rerolls: number, select: (id: UpgradeId) => void, reroll: () => void, options?: RewardChoiceOptions): void {
    this.root.querySelector('.upgrade-modal')?.remove();
    if (options?.kind === 'boss') this.root.querySelector('.act-clear-screen')?.remove();
    window.clearTimeout(this.rewardTimer);
    const modal = document.createElement('section');
    modal.className = `modal upgrade-modal revealing ${options?.kind === 'boss' ? 'boss-reward-modal' : 'wave-reward-modal'}`;
    modal.innerHTML = `<div class="modal-scrim"></div><div class="upgrade-box"><p class="eyebrow">${options?.eyebrow ?? '새 문장이 새겨진다'}</p><h2>${options?.title ?? '강화 선택'}</h2><div class="upgrade-grid">${choices.map((choice, index) => {
      const preview = options?.previewChoice?.(choice.id); const stackMode = choice.stackMode === 'additive' ? '가산 중첩' : '고유 효과';
      const resonance = preview?.completesResonance.length
        ? `<strong class="resonance-preview"><b>공명 완성</b><span>${preview.completesResonance.join(' / ')}</span></strong>`
        : preview?.synergyPreview.length ? `<mark class="resonance-preview"><b>공명 가능</b><span>${preview.synergyPreview.join(' / ')}</span></mark>` : '';
      const tags = (preview?.tags ?? choice.tags).slice(0, 4).map((tag) => `<i>${TAG_LABELS[tag] ?? tag}</i>`).join('');
      return `<button class="upgrade-card rarity-${choice.rarity}" data-id="${choice.id}" style="--upgrade-color:${choice.icon.color}"><span>0${index + 1}</span><i class="upgrade-glyph">${choice.icon.glyph}</i><em>${choice.rarity} · ${CATEGORY_LABELS[choice.category] ?? choice.category}</em><div class="upgrade-tags">${tags}</div><h3>${choice.name}${preview ? `<b>${preview.currentStacks}/${choice.maxStacks}</b>` : ''}</h3><div class="effect-comparison">${preview ? `<p class="current-effect"><b>현재</b><span>${preview.currentDescription}</span></p><p class="next-effect"><b>선택 후</b><span>${preview.nextDescription}</span></p>` : `<p class="next-effect"><span>${choice.description}</span></p>`}</div>${resonance}<small>${stackMode} · ${choice.relatedKey} · ${index + 1} 또는 방향키 + Enter</small></button>`;
    }).join('')}</div><button class="reroll" data-reroll ${rerolls <= 0 ? 'disabled' : ''}><kbd>R</kbd> 다시 뽑기 · 남은 횟수 ${rerolls}</button><p class="reward-lock" data-reward-lock>기록을 펼치는 중…</p></div>`;
    this.root.append(modal);
    let ready = options === undefined;
    let chosen = false;
    let focusIndex = 0;
    const cards = [...modal.querySelectorAll<HTMLButtonElement>('[data-id]')];
    const focus = (): void => {
      cards.forEach((card, index) => card.classList.toggle('keyboard-focus', index === focusIndex));
      if (ready) cards[focusIndex]?.focus({ preventScroll: true });
    };
    const close = (): void => {
      window.clearTimeout(this.rewardTimer); this.rewardTimer = undefined;
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined; modal.remove();
    };
    const choose = (button: HTMLButtonElement): void => {
      if (!ready || chosen) return;
      chosen = true; const id = button.dataset.id as UpgradeId; close(); this.audio.play('upgrade'); select(id);
    };
    cards.forEach((button) => button.addEventListener('click', () => choose(button), { once: true }));
    modal.querySelector('[data-reroll]')?.addEventListener('click', () => {
      if (!ready || chosen) return;
      chosen = true; close(); reroll();
    }, { once: true });
    const handler = (event: KeyboardEvent): void => {
      const rewardKey = isRewardSelectionKey(event.code);
      if (!rewardKey) return;
      event.preventDefault();
      if (!ready || event.repeat || (options && !options.acceptsKey(event))) return;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') { focusIndex = (focusIndex + cards.length - 1) % cards.length; focus(); return; }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') { focusIndex = (focusIndex + 1) % cards.length; focus(); return; }
      if (event.code === 'Enter') { const card = cards[focusIndex]; if (card) choose(card); return; }
      if (event.code === 'KeyR') { modal.querySelector<HTMLButtonElement>('[data-reroll]:not([disabled])')?.click(); return; }
      const direct = Number(event.code.slice(-1)) - 1; const card = cards[direct]; if (card) choose(card);
    };
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = handler; window.addEventListener('keydown', handler);
    if (options) {
      this.rewardTimer = window.setTimeout(() => {
        if (!modal.isConnected || chosen) return;
        ready = true; modal.classList.remove('revealing'); modal.classList.add('ready');
        const lock = modal.querySelector<HTMLElement>('[data-reward-lock]'); if (lock) lock.textContent = '1 / 2 / 3 또는 방향키 + Enter';
        options.onReady(); focus();
      }, options.revealDelayMs);
    } else { modal.classList.remove('revealing'); modal.classList.add('ready'); focus(); }
  }

  public showWordLoadout(initial: readonly unknown[], confirm: (words: [WordId, WordId, WordId]) => void): void {
    this.clear();
    const initialLoadout: [WordId, WordId, WordId] = validWordLoadout(initial) ? [...initial] : [...DEFAULT_WORD_LOADOUT];
    let selected: WordId[] = [...initialLoadout];
    let confirmed = false;
    const screen = document.createElement('div'); screen.className = 'screen loadout-screen';
    const submit = (): void => {
      if (confirmed) return;
      if (selected.length !== 3) {
        const validation = screen.querySelector<HTMLElement>('[data-loadout-validation]');
        if (validation) validation.textContent = '언령 세 개를 장착해야 합니다.';
        return;
      }
      confirmed = true;
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
      confirm([...selected] as [WordId, WordId, WordId]);
    };
    const render = (): void => {
      const reactionCount = availableReactionCount(selected);
      const reactionNames = WORD_REACTIONS.filter((reaction) => selected.includes(reaction.firstWordId) && selected.includes(reaction.secondWordId)).map((reaction) => reaction.displayName);
      screen.innerHTML = `<div class="loadout-panel"><p class="eyebrow">Run 시작 준비</p><h2>언령 장착</h2><p>선택 순서대로 Q / E / R에 장착됩니다.</p><div class="loadout-slots">${(['Q','E','R'] as const).map((slot, index) => `<span><kbd>${slot}</kbd><b>${selected[index] ? WORD_DEFINITIONS[selected[index]!].displayName : '비어 있음'}</b></span>`).join('')}</div><div class="loadout-presets"><button data-preset="1"><kbd>1</kbd> 시간 조작</button><button data-preset="2"><kbd>2</kbd> 군중 제어</button><button data-preset="3"><kbd>3</kbd> 반응 공격</button></div><div class="loadout-grid">${WORD_IDS.map((id) => { const definition = WORD_DEFINITIONS[id]; const order = selected.indexOf(id); return `<button class="word-loadout-card${order >= 0 ? ' selected' : ''}" data-word="${id}" aria-pressed="${order >= 0}"><i>${order >= 0 ? ['Q','E','R'][order] : '言'}</i><b>${definition.displayName}</b><small>${definition.roles.join(' · ')}</small><p>${definition.shortDescription}</p><em>${definition.empoweredEffect}</em></button>`; }).join('')}</div><div class="loadout-reactions"><b>가능한 반응 ${reactionCount}개</b><span>${reactionCount < 2 ? '사용 가능한 연계가 적습니다.' : reactionNames.join(' · ')}</span></div><p data-loadout-validation aria-live="polite"></p><button class="rune-button primary" data-confirm ${selected.length === 3 ? '' : 'disabled'}>이 구성으로 시작 <kbd>Enter</kbd></button></div>`;
      screen.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((button) => button.addEventListener('click', () => {
        selected = button.dataset.preset === '2' ? ['pull', 'link', 'push'] : button.dataset.preset === '3' ? ['mark', 'stop', 'rewind'] : [...DEFAULT_WORD_LOADOUT];
        render();
      }));
      screen.querySelectorAll<HTMLButtonElement>('[data-word]').forEach((button) => button.addEventListener('click', () => {
        const id = button.dataset.word as WordId; const index = selected.indexOf(id);
        if (index >= 0) selected.splice(index, 1); else if (selected.length < 3) selected.push(id);
        render();
      }));
      screen.querySelector<HTMLButtonElement>('[data-confirm]')?.addEventListener('click', submit, { once: true });
      this.bindKeyboardNavigation(screen, 'button:not([disabled])', () => confirm([...initialLoadout]), {
        KeyK: () => confirm([...initialLoadout]),
        Digit1: () => { selected = [...DEFAULT_WORD_LOADOUT]; render(); },
        Digit2: () => { selected = ['pull', 'link', 'push']; render(); },
        Digit3: () => { selected = ['mark', 'stop', 'rewind']; render(); },
      });
    };
    // Capture Enter before a focused native <button> can synthesize a click.
    // Space remains a normal accessible card activation key.
    screen.addEventListener('keydown', (event) => {
      if (event.code !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      const action = resolveWordLoadoutEnterAction(event.code, event.repeat, selected.length);
      if (action !== 'IGNORE') submit();
    }, true);
    this.root.append(screen); render();
  }

  public showActClear(
    summary: { index: number; name: string; recovery: number; bossesDefeated: number; upgrades: readonly string[]; resonances: readonly string[] },
    continueRun: () => void,
  ): void {
    this.clear();
    const screen = document.createElement('section'); screen.className = 'screen act-clear-screen';
    screen.innerHTML = `<div class="panel-content act-clear-card"><p class="eyebrow">전진로가 확보됐다</p><h2>Act ${summary.index} · ${summary.name} 완료</h2><div class="act-clear-recovery"><span>생명 회복</span><b>+${Math.round(summary.recovery)}</b></div><div class="act-clear-details"><span>영역 개체 후퇴 <b>${summary.bossesDefeated}</b></span><span>유지 강화 <b>${summary.upgrades.length}</b></span><span>활성 공명 <b>${summary.resonances.length ? summary.resonances.join(' · ') : '없음'}</b></span></div><small>다음 조사 구역으로 전진합니다</small></div>`;
    this.root.append(screen);
    this.rewardTimer = window.setTimeout(continueRun, 1450);
  }

  public showModifierIntro(modifier: ModifierPresentation, continueRun: () => void): void {
    this.clear();
    const screen = document.createElement('section'); screen.className = `screen modifier-intro-screen ${modifier.detailed ? 'detailed' : 'compact'}`;
    screen.innerHTML = `<div class="modifier-intro-card"><i>${modifier.icon}</i><div><p>${modifier.detailed ? '전투 변칙 규칙' : '기록 변칙'}</p><h2>${modifier.name}</h2>${modifier.detailed ? `<span>${modifier.description}</span>` : ''}</div></div>`;
    this.root.append(screen);
    this.rewardTimer = window.setTimeout(continueRun, modifier.durationMs);
  }

  public showActTransition(
    act: { index: number; name: string; summary: string; modifiers: readonly string[]; upgrades: readonly string[]; resonances: readonly string[] },
    continueRun: () => void,
  ): void {
    this.clear();
    const screen = document.createElement('section'); screen.className = 'screen act-transition-screen';
    screen.innerHTML = `<div class="act-transition-ink"></div><div class="panel-content act-transition-card"><p class="eyebrow">탐사가 다음 구역으로 이어진다</p><h2>Act ${act.index} · ${act.name}</h2><p class="act-summary">${act.summary}</p><div class="act-transition-details"><span>활성 Modifier<b>${act.modifiers.length ? act.modifiers.join(' · ') : '없음'}</b></span><span>유지 강화<b>${act.upgrades.length ? act.upgrades.join(' · ') : '없음'}</b></span><span>활성 공명<b>${act.resonances.length ? act.resonances.join(' · ') : '없음'}</b></span></div><button class="rune-button primary" data-continue>다음 구역 진입 <kbd>Enter / J</kbd></button><small>3초 후 자동 진입</small></div>`;
    this.root.append(screen);
    let ready = false; let done = false;
    const finish = (): void => {
      if (!ready || done) return; done = true; window.clearTimeout(this.rewardTimer);
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler); this.keyHandler = undefined; continueRun();
    };
    screen.querySelector('[data-continue]')?.addEventListener('click', finish);
    this.keyHandler = (event: KeyboardEvent): void => { if (!ready || event.repeat || (event.code !== 'Enter' && event.code !== 'KeyJ')) return; event.preventDefault(); finish(); };
    window.addEventListener('keydown', this.keyHandler);
    window.setTimeout(() => { ready = true; screen.classList.add('ready'); }, 650);
    this.rewardTimer = window.setTimeout(() => { ready = true; finish(); }, 3000);
  }

  public showPause(resume: () => void, abandon: () => void, upgrades: readonly string[] = []): void {
    const modal = document.createElement('section'); modal.className = 'modal pause-modal';
    modal.innerHTML = `<div class="modal-scrim"></div><div class="panel-content"><p class="eyebrow">기록이 잠시 멎었다</p><h2>일시정지</h2>${upgrades.length ? `<div class="pause-upgrades"><b>보유 강화</b>${upgrades.map((upgrade) => `<span>${upgrade}</span>`).join('')}</div>` : ''}<button class="rune-button primary" data-resume>계속하기</button><button class="rune-button" data-settings>설정</button><button class="rune-button danger" data-abandon>Run 포기 · 결과 보기</button></div>`;
    this.root.append(modal);
    const close = (): void => {
      modal.remove();
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    };
    modal.querySelector('[data-resume]')?.addEventListener('click', () => { close(); resume(); }, { once: true });
    modal.querySelector('[data-settings]')?.addEventListener('click', () => { close(); this.showSettings(() => { this.showHud(); resume(); }); }, { once: true });
    modal.querySelector('[data-abandon]')?.addEventListener('click', () => { close(); abandon(); }, { once: true });
    this.bindKeyboardNavigation(modal);
  }

  public hidePause(): void {
    this.root.querySelector('.pause-modal')?.remove();
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = undefined;
  }

  public showResult(stats: ResultStats, restart: () => void, title: () => void): void {
    this.clear();
    const screen = document.createElement('section'); screen.className = `screen result-screen ${stats.victory ? 'victory' : 'defeat'}`;
    const minutes = Math.floor(stats.time / 60); const seconds = Math.floor(stats.time % 60).toString().padStart(2, '0');
    const comparison = stats.previousBest > 0 ? `${stats.scoreDelta >= 0 ? '+' : ''}${stats.scoreDelta.toLocaleString()} 이전 최고 대비` : '첫 기록';
    const details = stats.details;
    const runtime = stats.upgradeRuntime;
    const owned = runtime?.owned ?? details?.upgrades ?? [];
    const ownedIds = new Set(owned.map(({ id }) => id));
    const activeResonanceIds = runtime?.resonances ?? RESONANCES.filter((resonance) => resonance.requiredUpgradeIds.every((id) => ownedIds.has(id))).map((resonance) => resonance.id);
    const upgradeContribution = (id: UpgradeId): unknown => runtime?.contributions[id] ?? details?.upgradeContributions[id];
    const resonanceContribution = (id: string): unknown => (runtime?.resonanceContributions as Partial<Record<string, unknown>> | undefined)?.[id]
      ?? (details?.resonanceContributions as Partial<Record<string, unknown>> | undefined)?.[id];
    const upgradeDetails = owned.map(({ id, stacks }) => {
      const definition = upgradeById(id);
      return `<span><b>${definition?.icon.glyph ?? '言'} ${definition?.name ?? id} ×${stacks}</b><small>${definition ? upgradeDescription(definition, stacks) : ''}</small><em>${contributionSummary(upgradeContribution(id))}</em></span>`;
    }).join('');
    const resonanceDetails = activeResonanceIds.map((id) => {
      const definition = resonanceById(id);
      return `<span class="resonance-row"><b>${definition?.icon.glyph ?? '鳴'} ${definition?.name ?? id}</b><small>${definition?.description ?? ''}</small><em>${contributionSummary(resonanceContribution(id))}</em></span>`;
    }).join('');
    const ranked = [
      ...owned.map(({ id }) => ({ id, name: upgradeById(id)?.name ?? id, type: 'card' as const, item: upgradeContribution(id) })),
      ...activeResonanceIds.map((id) => ({ id, name: resonanceById(id)?.name ?? id, type: 'resonance' as const, item: resonanceContribution(id) })),
    ].map((entry) => ({ ...entry, score: metric(entry.item, 'damageContribution', 'damage') + metric(entry.item, 'healingContribution', 'healing') + metric(entry.item, 'preventedDamage') + metric(entry.item, 'resourceContribution', 'resource', 'sentence') * 2 + metric(entry.item, 'cooldownReductionContribution', 'cooldownMs') / 100 }))
      .sort((a, b) => b.score - a.score).slice(0, 3);
    const extended = details as (CombatStatsSnapshot & { damageAttribution?: ContributionLike; empoweredWordUses?: Partial<Record<WordId, number>> }) | undefined;
    const explicitAttribution = extended?.damageAttribution;
    const cardResonanceDamage = [...owned.map(({ id }) => upgradeContribution(id)), ...activeResonanceIds.map((id) => resonanceContribution(id))].reduce<number>((sum, item) => sum + metric(item, 'damageContribution', 'damage'), 0);
    const attribution = {
      echo: explicitAttribution ? metric(explicitAttribution, 'echoBlade', 'automatic') : details?.agency.damage.automatic ?? 0,
      cut: explicitAttribution ? metric(explicitAttribution, 'cut', 'manual') : (details?.agency.damage.basicJ ?? 0) + (details?.agency.damage.enhancedJ ?? 0),
      parry: explicitAttribution ? metric(explicitAttribution, 'parry') : details?.parryBreakdown.damage ?? 0,
      word: explicitAttribution ? metric(explicitAttribution, 'word', 'words') : WORD_IDS.reduce((sum, id) => sum + (details?.agency.damage[id] ?? 0), details?.agency.damage.chain ?? 0),
      other: explicitAttribution ? metric(explicitAttribution, 'other') : 0,
    };
    const totalAttribution = attribution.echo + attribution.cut + attribution.parry + attribution.word + attribution.other;
    const totalActualDamage = totalAttribution + cardResonanceDamage;
    const ratio = (value: number): string => formatDamageRatio(value, totalAttribution);
    const contributionRatio = formatDamageRatio(cardResonanceDamage, totalActualDamage);
    const chainCounts = details?.chainCounts;
    const chainSummary = WORD_REACTIONS.map((reaction) => `${reaction.displayName} ${chainCounts?.[reaction.id] ?? 0}`).filter((label) => !label.endsWith(' 0')).join(' · ') || '없음';
    const empowerByWord = extended?.empoweredWordUses;
    const equippedWords = details?.equippedWords ?? [...DEFAULT_WORD_LOADOUT];
    const empowerSummary = equippedWords.map((word, index) => `${(['Q','E','R'] as const)[index]} ${WORD_DEFINITIONS[word].displayName} ${empowerByWord?.[word] ?? 0}`).join(' · ');
    const empowerFailureSummary = details
      ? (Object.entries(details.empoweredWordFailures) as [WordId, Record<string, number>][])
          .flatMap(([word, reasons]) => Object.entries(reasons).filter(([, count]) => count > 0).map(([reason, count]) => `${WORD_DEFINITIONS[word].displayName} ${EMPOWER_FAILURE_LABELS[reason] ?? '조건 불충족'} ${count}`))
          .join(' · ')
      : '';
    const topThree = ranked.length ? ranked.map((entry, index) => `<span><i>${index + 1}</i><b>${entry.type === 'resonance' ? '공명 · ' : ''}${entry.name}</b><small>${contributionSummary(entry.item)}</small></span>`).join('') : '<span><b>기여 기록 없음</b></span>';
    const recentDamage = details?.recentPlayerDamage ?? [];
    const lastDamage = recentDamage.at(-1);
    const deathCause = !stats.victory && lastDamage
      ? `<div class="result-death-cause"><span>마지막 피해</span><b>${lastDamage.patternName} · ${Math.round(lastDamage.amount)} 피해</b><small>${lastDamage.attackerDisplayName ?? '알 수 없는 공격자'} · Act ${lastDamage.act} ${lastDamage.wave}${lastDamage.modifier ? ` · ${lastDamage.modifier}` : ''} · ${lastDamage.parryable ? '패링 가능' : '패링 불가'}</small><ol>${recentDamage.slice().reverse().map((hit) => `<li>${hit.patternName} · ${Math.round(hit.amount)}</li>`).join('')}</ol></div>`
      : '';
    screen.innerHTML = `<div class="result-sigil">${stats.rank}</div><div class="result-content"><p class="eyebrow">${stats.victory ? '천갱의 진동이 잠잠해졌다' : '탐사가 중단됐다'}</p><h2>${stats.victory ? '탐사 완료' : '탐사 중단'}</h2><div class="score-big">${stats.score.toLocaleString()}${stats.newBest ? '<em>NEW BEST</em>' : ''}</div><div class="result-progress"><b>${stats.progressLabel}</b><span>${comparison}</span></div>
      <div class="result-stats"><span>플레이 시간<b>${minutes}:${seconds}</b></span><span>도달 Act<b>${stats.reachedAct ?? 1}</b></span><span>완료 Act<b>${stats.completedActs ?? 0}</b></span><span>영역 개체<b>${stats.bossesDefeated ?? 0}</b></span><span>받은 피해<b>${Math.round(stats.damageTaken)}</b></span><span>패링 성공<b>${stats.parries}</b></span><span>전체 언령<b>${Object.values(stats.wordUses).reduce((sum, value) => sum + value, 0)}</b></span><span>언령 연쇄<b>${stats.chainSuccesses ?? 0}</b></span><span>강화 용언 F<b>${stats.empowerUses ?? 0}</b></span></div>
      ${deathCause}
      ${stats.milestones.length ? `<div class="milestones">${stats.milestones.map((item) => `<span>${item}</span>`).join('')}</div>` : ''}
      <div class="result-build-summary"><div><span>활성 공명</span><b>${activeResonanceIds.length ? activeResonanceIds.map((id) => resonanceById(id)?.name ?? id).join(' · ') : '없음'}</b></div><div><span>기본 피해 원천</span><b>잔향 ${ratio(attribution.echo)} · J 절단 ${ratio(attribution.cut)} · 패링 ${ratio(attribution.parry)} · 언령 ${ratio(attribution.word)} · 기타 ${ratio(attribution.other)}</b></div><div><span>카드·공명 추가 기여</span><b>${Math.round(cardResonanceDamage)} 피해 · 전체의 ${contributionRatio}</b></div><div><span>언령 연계</span><b>${chainSummary}</b></div><div><span>F 강화 언령</span><b>${empowerSummary}</b></div></div>
      <div class="result-top"><span>전투 기여 상위 3</span>${topThree}</div>
      <div class="upgrade-summary"><span>새겨진 강화</span><p>${stats.upgrades.length ? stats.upgrades.join(' · ') : '없음'}</p></div>
      ${stats.actResults?.length ? `<div class="upgrade-summary"><span>Act별 기록</span><p>${stats.actResults.map((act) => `Act ${act.actIndex} ${act.actName} · ${Math.round(act.durationSeconds)}초 · 피해 ${Math.round(act.damageTaken)}`).join('<br />')}</p></div>` : ''}
      ${details ? `<details class="result-details"><summary>강화·전투 상세</summary><p>장착 언령 ${equippedWords.map((word) => WORD_DEFINITIONS[word].displayName).join(' · ')}</p><p>잔향 칼날 ${details.echoBlade.hits}/${details.echoBlade.activations} · ${Math.round(details.echoBlade.damage)} 피해 · 역류 탄환 ${details.echoBlade.projectilesReflected}</p><p>J 절단 ${details.cut.hits}/${details.cut.uses} · ${Math.round(details.cut.damage)} 피해 · 상태 절단 ${details.cut.stopped + details.cut.linked + details.cut.echo + details.cut.exposed} · 반응 피해 ${Math.round(Object.values(details.reactionDamage).reduce((sum, value) => sum + value, 0))} · 탄환 절단 ${details.cut.projectilesCut}</p><p>상태 적용 ${Object.entries(details.statusApplications).filter(([, count]) => count > 0).map(([id, count]) => `${wordStatusDisplayName(id as keyof typeof details.statusApplications)} ${count}`).join(' · ') || '없음'}</p><p>패링 시도 ${details.parryAttempts} · 일반 ${details.parryBreakdown.normalParries} · 완벽 ${details.perfectParries} · 탄환 반사 ${details.parryBreakdown.projectileReflections} · 근접 반격 ${details.parryBreakdown.meleeCounters} · 피해 ${Math.round(details.parryBreakdown.damage)}</p><p>E 회복/잔상 ${Math.round(details.rewindContribution.healthRecovered)}/${Math.round(details.rewindContribution.echoDamage)} · R 공유/고립/폭발 ${Math.round(details.linkContribution.sharedDamage)}/${Math.round(details.linkContribution.isolatedBonusDamage)}/${Math.round(details.linkContribution.explosionDamage)}</p><p>F 조건 실패 ${empowerFailureSummary || '없음'}</p><div class="result-contributions">${resonanceDetails}${upgradeDetails || '<span><b>보유 강화 없음</b></span>'}</div></details>` : ''}
      <div class="panel-buttons"><button class="rune-button primary" data-restart>다시 시작 <kbd>Enter</kbd></button><button class="rune-button" data-title>타이틀로</button></div></div>`;
    this.root.append(screen);
    const doRestart = (): void => restart();
    screen.querySelector('[data-restart]')?.addEventListener('click', doRestart, { once: true });
    screen.querySelector('[data-title]')?.addEventListener('click', title, { once: true });
    this.bindKeyboardNavigation(screen, '.panel-buttons button');
  }

  private audioDiagnosticText(state: AudioDiagnosticsSnapshot): string {
    const peaks = state.peakMeters;
    return `${state.contextState} · M ${Math.round(state.master * 100)} · SFX ${Math.round(state.effects * 100)} · UI ${Math.round(state.ui * 100)} · 전투 ${Math.round(state.combat * 100)} · 음악 ${Math.round(state.music * 100)} · 환경 ${Math.round(state.ambience * 100)} · Peak U/C/M/A ${Math.round(peaks.ui * 100)}/${Math.round(peaks.combat * 100)}/${Math.round(peaks.music * 100)}/${Math.round(peaks.ambience * 100)} · Limiter ${state.limiterActive ? 'ON' : '대기'} · 음성 ${state.activeVoices}`;
  }
}
