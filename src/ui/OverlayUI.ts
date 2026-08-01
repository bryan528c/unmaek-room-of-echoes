import { upgradeById, upgradeDescription, type UpgradeDefinition, type UpgradeId } from '../game/data/upgrades';
import type { AudioSystem } from '../game/systems/AudioSystem';
import type { GameSave } from '../game/systems/SaveSystem';
import type { ControlMode } from '../game/systems/SaveSystem';
import type { WordId } from '../game/systems/WordChainSystem';
import type { CombatStatsSnapshot } from '../game/systems/CombatStats';
import type { UpgradeChoicePreview } from '../game/systems/UpgradeSystem';
import { isRewardSelectionKey } from '../game/systems/RewardInputPolicy';

export interface HudState {
  health: number;
  maxHealth: number;
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
  rewindPreviewHealth?: number;
  empowered: boolean;
  sentencePulse: boolean;
  controlMode: ControlMode;
  chainOpener?: WordId;
  chainRemaining?: number;
  chainProgress?: number;
  chainNext?: readonly WordId[];
  cutCooldown: number;
  echoBladeRange: number;
  echoBladeInterval: number;
  echoBladeOrbitCount: number;
  upgrades: readonly { name: string; stacks: number; effect: string }[];
  bossHealth?: number;
  bossMaxHealth?: number;
  bossPhase?: number;
  bossGuide?: string;
}

export interface ResultStats {
  victory: boolean;
  score: number;
  time: number;
  damageTaken: number;
  parries: number;
  wordUses: Record<'멎는다' | '되돌린다' | '잇는다', number>;
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
}

export interface RewardChoiceOptions {
  revealDelayMs: number;
  acceptsKey: (event: KeyboardEvent) => boolean;
  onReady: () => void;
  previewChoice?: (id: UpgradeId) => UpgradeChoicePreview | undefined;
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

  private progressLabel(stage: number): string {
    return ['기록 없음', '제1전투', '제2전투', '제3전투', '보스 제1형', '보스 제2형', '보스 제3형', '클리어'][Math.max(0, Math.min(7, stage))] ?? '기록 없음';
  }

  public showMenu(onStart: () => void): void {
    this.clear();
    const screen = document.createElement('section');
    screen.className = 'screen title-screen';
    screen.innerHTML = `
      <div class="title-mist"></div>
      <div class="title-content">
        <div class="portrait-crop" aria-label="주인공 초상화"><img src="./assets/hero-concept.png" alt="검은 망토를 입은 소년의 얼굴" /></div>
        <p class="eyebrow">잊힌 언어를 잇는 자</p>
        <h1><small>言脈</small> 언맥 <span>잔향의 방</span></h1>
        <p class="title-copy">멎고, 되돌리고, 이어라.<br />기록 포식자가 삼킨 마지막 문장을 되찾으라.</p>
        <div class="menu-actions">
          <button class="rune-button primary" data-action="start"><span>새 기록 시작</span><kbd>Enter</kbd></button>
          <button class="rune-button" data-action="controls">조작법</button>
          <button class="rune-button" data-action="settings">설정</button>
        </div>
        <div class="best-record"><span>최고 기록</span><strong>${this.save.bestScore.toLocaleString()} · ${this.save.bestRank} 랭크</strong><small>최고 진행 · ${this.progressLabel(this.save.bestStage)}</small></div>
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
    screen.className = 'screen parchment-panel';
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
    const screen = document.createElement('section');
    screen.className = 'screen parchment-panel';
    screen.innerHTML = `<div class="panel-content"><p class="eyebrow">기록실 환경</p><h2>설정</h2>
      <div class="control-setting"><span>조작 방식</span><div class="control-mode-options">
        <button data-control="keyboard" aria-pressed="${current.controlMode === 'keyboard'}"><b>키보드 전용</b><small>8방향 절단 + 언령</small></button>
        <button data-control="mouse" aria-pressed="${current.controlMode === 'mouse'}"><b>기존 마우스 조준</b><small>클릭 절단 + 포인터 방향</small></button>
      </div></div>
      <label class="setting-row"><span>전체 볼륨 <output>${Math.round(current.masterVolume * 100)}</output></span><input data-setting="masterVolume" type="range" min="0" max="1" step="0.05" value="${current.masterVolume}" /></label>
      <label class="setting-row"><span>효과음 볼륨 <output>${Math.round(current.effectsVolume * 100)}</output></span><input data-setting="effectsVolume" type="range" min="0" max="1" step="0.05" value="${current.effectsVolume}" /></label>
      <label class="setting-row"><span>화면 흔들림 <output>${Math.round(current.shake * 100)}</output></span><input data-setting="shake" type="range" min="0" max="1" step="0.05" value="${current.shake}" /></label>
      <label class="toggle-row"><input data-setting="reducedMotion" type="checkbox" ${current.reducedMotion ? 'checked' : ''} /><span>감소된 모션</span></label>
      <label class="toggle-row"><input data-setting="showTutorial" type="checkbox" ${current.showTutorial ? 'checked' : ''} /><span>튜토리얼 다시 보기</span></label>
      <label class="toggle-row"><input data-setting="holdCutRepeat" type="checkbox" ${current.holdCutRepeat ? 'checked' : ''} /><span>접근성: J 유지 시 절단 반복</span></label>
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
        if (key === 'reducedMotion' || key === 'showTutorial' || key === 'holdCutRepeat') current[key] = input.checked;
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
    screen.querySelector('[data-action="audio-test"]')?.addEventListener('click', () => { this.audio.unlock(); this.audio.play('parry'); window.setTimeout(() => this.audio.play('finisher'), 180); });
    screen.querySelector('[data-action="back"]')?.addEventListener('click', () => { this.persist(); back(); }, { once: true });
    this.bindKeyboardNavigation(screen, 'button', () => { this.persist(); back(); });
  }

  public showHud(): void {
    this.clear();
    const hud = document.createElement('section');
    hud.className = 'hud';
    hud.innerHTML = `<div class="health-panel"><div class="hero-mini"><img src="./assets/hero-concept.png" alt="" /></div><div><div class="hud-label">생명 <span data-health-text>100 / 100</span></div><div class="health-track"><i data-health-ghost></i><em data-health-rewind></em><b data-health></b></div></div></div>
      <div class="stage-panel"><span data-stage>제1전투</span><strong data-score>0</strong></div>
      <div class="boss-panel hidden" data-boss><div><span>기록 포식자</span><em data-boss-phase>제1형</em></div><small data-boss-guide></small><div class="boss-track"><b data-boss-health></b></div></div>
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
      if (echo) echo.textContent = `잔향 ${state.echoBladeOrbitCount}날 · ${Math.round(state.echoBladeRange)}범위 · ${state.echoBladeInterval.toFixed(1)}s`;
    }
    const stage = this.hud.querySelector('[data-stage]'); if (stage) stage.textContent = state.stage;
    const score = this.hud.querySelector('[data-score]'); if (score) score.textContent = state.score.toLocaleString();
    const cooldowns = [state.stopCooldown, state.rewindCooldown, state.linkCooldown];
      const canUse = [state.canStop, state.canRewind, state.canLink];
    this.hud.querySelectorAll<HTMLElement>('.word-slot').forEach((slot, index) => {
      const value = cooldowns[index] ?? 0; const usable = canUse[index] ?? false;
      slot.classList.toggle('unavailable', !usable); slot.classList.toggle('cooling', value > 0); slot.classList.toggle('ready', usable); slot.classList.toggle('empowered', state.empowered && value <= 0);
      const label = slot.querySelector('[data-cooldown]');
        if (label) label.textContent = value > 0 ? `재사용 ${value.toFixed(1)}s` : state.empowered ? '강화 준비' : usable ? '준비 완료' : '대상 없음';
    });
    const chainStatus = this.hud.querySelector<HTMLElement>('[data-chain-status]');
    const wordNames: Record<WordId, string> = { stop: '멎는다', rewind: '되돌린다', link: '잇는다' };
    const wordKeys: Record<WordId, string> = { stop: 'Q', rewind: 'E', link: 'R' };
    const chainNext = state.chainNext ?? [];
    this.hud.querySelectorAll<HTMLElement>('.word-slot').forEach((slot) => {
      const slotWord: Record<string, WordId> = { q: 'stop', e: 'rewind', r: 'link' };
      const word = slotWord[slot.dataset.word ?? ''];
      slot.classList.toggle('chain-next', word !== undefined && chainNext.includes(word));
    });
    if (chainStatus && state.chainOpener && (state.chainRemaining ?? 0) > 0) {
      chainStatus.classList.remove('hidden');
      chainStatus.style.setProperty('--chain-progress', `${Math.max(0, Math.min(1, state.chainProgress ?? 0)) * 360}deg`);
      const chainNames: Record<string, string> = { 'link-stop': '연쇄 정지', 'stop-rewind': '역류', 'link-rewind': '피해 회귀' };
      chainStatus.innerHTML = `<span>${wordNames[state.chainOpener]} 이후</span><b>${chainNext.map((word) => `${wordKeys[word]} ${wordNames[word]} · ${chainNames[`${state.chainOpener}-${word}`] ?? ''}`).join(' / ')}</b><i>${(state.chainRemaining ?? 0).toFixed(1)}s</i>`;
    } else chainStatus?.classList.add('hidden');
    const empower = this.hud.querySelector<HTMLElement>('[data-empower]');
    if (empower) { empower.classList.toggle('ready', state.sentence >= state.sentenceMax || state.empowered); empower.classList.toggle('armed', state.empowered); empower.innerHTML = state.empowered ? '<kbd>F</kbd> 다음 언령 강화됨' : '<kbd>F</kbd> 강화 용언'; }
    const boss = this.hud.querySelector<HTMLElement>('[data-boss]');
    if (boss && state.bossHealth !== undefined && state.bossMaxHealth !== undefined) {
      boss.classList.remove('hidden');
      const bar = boss.querySelector<HTMLElement>('[data-boss-health]'); if (bar) bar.style.width = `${Math.max(0, state.bossHealth / state.bossMaxHealth) * 100}%`;
      const phase = boss.querySelector('[data-boss-phase]'); if (phase) phase.textContent = `제${state.bossPhase ?? 1}형`;
      const guide = boss.querySelector('[data-boss-guide]'); if (guide) guide.textContent = state.bossGuide ?? '';
    } else boss?.classList.add('hidden');
    const owned = this.hud.querySelector<HTMLElement>('[data-owned-upgrades]');
    if (owned) {
      owned.classList.toggle('hidden', state.upgrades.length === 0);
      owned.innerHTML = state.upgrades.map((upgrade) => `<span title="${upgrade.effect}">${upgrade.name}<b>×${upgrade.stacks}</b></span>`).join('');
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
    window.clearTimeout(this.rewardTimer);
    const modal = document.createElement('section');
    modal.className = 'modal upgrade-modal revealing';
    modal.innerHTML = `<div class="modal-scrim"></div><div class="upgrade-box"><p class="eyebrow">새 문장이 새겨진다</p><h2>강화 선택</h2><div class="upgrade-grid">${choices.map((choice, index) => {
      const preview = options?.previewChoice?.(choice.id); const stackMode = choice.stackMode === 'additive' ? '가산 중첩' : '고유 효과';
      return `<button class="upgrade-card rarity-${choice.rarity}" data-id="${choice.id}"><span>0${index + 1}</span><em>${choice.rarity} · ${choice.tag}</em><h3>${choice.name} ${preview ? `${preview.currentStacks}/${choice.maxStacks}` : ''}</h3><p>${preview ? `<b>현재</b> ${preview.currentDescription}<br><b>선택 후</b> ${preview.nextDescription}` : choice.description}</p><small>${stackMode} · ${choice.relatedKey} · ${index + 1} 또는 방향키 + Enter</small></button>`;
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

  public showPause(resume: () => void, title: () => void, upgrades: readonly string[] = []): void {
    const modal = document.createElement('section'); modal.className = 'modal pause-modal';
    modal.innerHTML = `<div class="modal-scrim"></div><div class="panel-content"><p class="eyebrow">기록이 잠시 멎었다</p><h2>일시정지</h2>${upgrades.length ? `<div class="pause-upgrades"><b>보유 강화</b>${upgrades.map((upgrade) => `<span>${upgrade}</span>`).join('')}</div>` : ''}<button class="rune-button primary" data-resume>계속하기</button><button class="rune-button" data-settings>설정</button><button class="rune-button danger" data-title>타이틀로</button></div>`;
    this.root.append(modal);
    const close = (): void => {
      modal.remove();
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = undefined;
    };
    modal.querySelector('[data-resume]')?.addEventListener('click', () => { close(); resume(); }, { once: true });
    modal.querySelector('[data-settings]')?.addEventListener('click', () => { close(); this.showSettings(() => { this.showHud(); resume(); }); }, { once: true });
    modal.querySelector('[data-title]')?.addEventListener('click', () => { close(); title(); }, { once: true });
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
    const upgradeDetails = stats.details?.upgrades.map(({ id, stacks }) => {
      const definition = upgradeById(id); const contribution = stats.details?.upgradeContributions[id];
      const contributionText = contribution ? ` · 발동 ${contribution.triggers}회 · 추가 피해 ${Math.round(contribution.damage)} · 문장력 ${Math.round(contribution.sentence)} · 쿨다운 ${(contribution.cooldownMs / 1000).toFixed(1)}초` : ' · 발동 0회';
      return definition ? `${definition.name} ×${stacks}: ${upgradeDescription(definition, stacks)}${contributionText}` : `${id} ×${stacks}`;
    }).join('<br>') ?? '';
    screen.innerHTML = `<div class="result-sigil">${stats.rank}</div><div class="result-content"><p class="eyebrow">${stats.victory ? '마지막 문장이 이어졌다' : '기록이 먹빛에 잠겼다'}</p><h2>${stats.victory ? '기록 회수 완료' : '계승 실패'}</h2><div class="score-big">${stats.score.toLocaleString()}${stats.newBest ? '<em>NEW BEST</em>' : ''}</div><div class="result-progress"><b>${stats.progressLabel}</b><span>${comparison}</span></div>
      <div class="result-stats"><span>플레이 시간<b>${minutes}:${seconds}</b></span><span>받은 피해<b>${Math.round(stats.damageTaken)}</b></span><span>패링 성공<b>${stats.parries}</b></span><span>전체 언령<b>${Object.values(stats.wordUses).reduce((sum, value) => sum + value, 0)}</b></span><span>언령 연쇄<b>${stats.chainSuccesses ?? 0}</b></span><span>강화 용언 F<b>${stats.empowerUses ?? 0}</b></span></div>
      ${stats.milestones.length ? `<div class="milestones">${stats.milestones.map((item) => `<span>${item}</span>`).join('')}</div>` : ''}
      <div class="upgrade-summary"><span>새겨진 강화</span><p>${stats.upgrades.length ? stats.upgrades.join(' · ') : '없음'}</p></div>
      ${stats.details ? `<details class="result-details"><summary>개발 상세 통계</summary><p>잔향 칼날 ${stats.details.echoBlade.hits}/${stats.details.echoBlade.activations} · ${Math.round(stats.details.echoBlade.damage)} 피해 · 역류 탄환 ${stats.details.echoBlade.projectilesReflected}</p><p>J 절단 ${stats.details.cut.hits}/${stats.details.cut.uses} · ${Math.round(stats.details.cut.damage)} 피해 · 상태 절단 ${stats.details.cut.stopped + stats.details.cut.linked + stats.details.cut.echo + stats.details.cut.exposed} · 탄환 절단 ${stats.details.cut.projectilesCut}</p><p>완벽 패링 ${stats.details.perfectParries} · 유효하지 않은 언령 ${Object.values(stats.details.invalidWordUses).reduce((sum, value) => sum + value, 0)}</p><p>E 회복 ${Math.round(stats.details.rewindContribution.healthRecovered)} · 잔상 피해 ${Math.round(stats.details.rewindContribution.echoDamage)} · R 공유/고립/폭발 ${Math.round(stats.details.linkContribution.sharedDamage)}/${Math.round(stats.details.linkContribution.isolatedBonusDamage)}/${Math.round(stats.details.linkContribution.explosionDamage)}</p><p>경계 이탈 ${stats.details.enemiesOutsideBounds} · 예고 밖 피격 ${stats.details.telegraphOutsideHits}</p>${upgradeDetails ? `<p>${upgradeDetails}</p>` : ''}</details>` : ''}
      <div class="panel-buttons"><button class="rune-button primary" data-restart>다시 시작 <kbd>Enter</kbd></button><button class="rune-button" data-title>타이틀로</button></div></div>`;
    this.root.append(screen);
    const doRestart = (): void => restart();
    screen.querySelector('[data-restart]')?.addEventListener('click', doRestart, { once: true });
    screen.querySelector('[data-title]')?.addEventListener('click', title, { once: true });
    this.bindKeyboardNavigation(screen, '.panel-buttons button');
  }
}
