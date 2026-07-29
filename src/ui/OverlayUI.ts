import type { UpgradeDefinition, UpgradeId } from '../game/data/upgrades';
import type { AudioSystem } from '../game/systems/AudioSystem';
import type { GameSave } from '../game/systems/SaveSystem';

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
  empowered: boolean;
  bossHealth?: number;
  bossMaxHealth?: number;
  bossPhase?: number;
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
}

export class OverlayUI {
  private persist = (): void => undefined;
  private screen?: HTMLElement;
  private hud?: HTMLElement;
  private tutorial?: HTMLElement;
  private damageHealth = 100;
  private damageTimer?: number;

  public constructor(private readonly root: HTMLElement, private readonly save: GameSave, private readonly audio: AudioSystem) {
    this.root.innerHTML = '<div class="screen boot-card"><div class="ink-seal">言</div><p>잔향을 불러오는 중…</p></div>';
  }

  public setPersistHandler(handler: () => void): void { this.persist = handler; }

  private clear(): void {
    this.root.innerHTML = '';
    this.screen = undefined;
    this.hud = undefined;
    this.tutorial = undefined;
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
        <div class="best-record"><span>최고 기록</span><strong>${this.save.bestScore.toLocaleString()} · ${this.save.bestRank} 랭크</strong></div>
      </div>
      <p class="footer-note">한 판 8–12분 · 헤드폰 권장</p>`;
    this.root.append(screen);
    this.screen = screen;
    const start = (): void => { this.audio.unlock(); onStart(); };
    screen.querySelector('[data-action="start"]')?.addEventListener('click', start, { once: true });
    screen.querySelector('[data-action="controls"]')?.addEventListener('click', () => this.showControls(() => this.showMenu(onStart)));
    screen.querySelector('[data-action="settings"]')?.addEventListener('click', () => this.showSettings(() => this.showMenu(onStart)));
    const enter = (event: KeyboardEvent): void => {
      if (event.code === 'Enter' && this.screen === screen) { window.removeEventListener('keydown', enter); start(); }
    };
    window.addEventListener('keydown', enter);
  }

  private showControls(back: () => void): void {
    this.clear();
    const screen = document.createElement('section');
    screen.className = 'screen parchment-panel';
    screen.innerHTML = `<div class="panel-content wide"><p class="eyebrow">살아남기 위한 문법</p><h2>조작법</h2>
      <div class="control-grid">
        <div><kbd>WASD</kbd><kbd>방향키</kbd><span>이동</span></div><div><kbd>마우스</kbd><span>조준</span></div>
        <div><kbd>좌클릭</kbd><kbd>J</kbd><span>단검 3연격</span></div><div><kbd>우클릭</kbd><kbd>K</kbd><span>패링</span></div>
        <div><kbd>Space</kbd><span>무적 대시</span></div><div><kbd>F</kbd><span>다음 언령 강화</span></div>
        <div class="word"><kbd>Q</kbd><span><b>멎는다</b> 적과 탄환 정지</span></div>
        <div class="word"><kbd>E</kbd><span><b>되돌린다</b> 2초 전 상태 복원</span></div>
        <div class="word"><kbd>R</kbd><span><b>잇는다</b> 피해 공유 연결</span></div>
        <div><kbd>Esc</kbd><span>일시정지</span></div>
      </div><button class="rune-button primary" data-action="back">돌아가기</button></div>`;
    this.root.append(screen); this.screen = screen;
    screen.querySelector('[data-action="back"]')?.addEventListener('click', back, { once: true });
  }

  private showSettings(back: () => void): void {
    this.clear();
    const current = this.save.settings;
    const screen = document.createElement('section');
    screen.className = 'screen parchment-panel';
    screen.innerHTML = `<div class="panel-content"><p class="eyebrow">기록실 환경</p><h2>설정</h2>
      <label class="setting-row"><span>전체 볼륨 <output>${Math.round(current.masterVolume * 100)}</output></span><input data-setting="masterVolume" type="range" min="0" max="1" step="0.05" value="${current.masterVolume}" /></label>
      <label class="setting-row"><span>효과음 볼륨 <output>${Math.round(current.effectsVolume * 100)}</output></span><input data-setting="effectsVolume" type="range" min="0" max="1" step="0.05" value="${current.effectsVolume}" /></label>
      <label class="setting-row"><span>화면 흔들림 <output>${Math.round(current.shake * 100)}</output></span><input data-setting="shake" type="range" min="0" max="1" step="0.05" value="${current.shake}" /></label>
      <label class="toggle-row"><input data-setting="reducedMotion" type="checkbox" ${current.reducedMotion ? 'checked' : ''} /><span>감소된 모션</span></label>
      <label class="toggle-row"><input data-setting="showTutorial" type="checkbox" ${current.showTutorial ? 'checked' : ''} /><span>튜토리얼 다시 보기</span></label>
      <div class="panel-buttons"><button class="rune-button" data-action="mute">${this.audio.isMuted ? '음소거 해제' : '즉시 음소거'}</button><button class="rune-button primary" data-action="back">저장하고 돌아가기</button></div></div>`;
    this.root.append(screen); this.screen = screen;
    screen.querySelectorAll<HTMLInputElement>('input[data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting;
        if (key === 'reducedMotion' || key === 'showTutorial') current[key] = input.checked;
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
    screen.querySelector('[data-action="back"]')?.addEventListener('click', () => { this.persist(); back(); }, { once: true });
  }

  public showHud(): void {
    this.clear();
    const hud = document.createElement('section');
    hud.className = 'hud';
    hud.innerHTML = `<div class="health-panel"><div class="hero-mini"><img src="./assets/hero-concept.png" alt="" /></div><div><div class="hud-label">생명 <span data-health-text>100 / 100</span></div><div class="health-track"><i data-health-ghost></i><b data-health></b></div></div></div>
      <div class="stage-panel"><span data-stage>제1전투</span><strong data-score>0</strong></div>
      <div class="boss-panel hidden" data-boss><div><span>기록 포식자</span><em data-boss-phase>제1형</em></div><div class="boss-track"><b data-boss-health></b></div></div>
      <div class="word-hud">
        <div class="word-slot" data-word="q"><kbd>Q</kbd><b>멎는다</b><span data-cooldown>25</span></div>
        <div class="word-slot" data-word="e"><kbd>E</kbd><b>되돌린다</b><span data-cooldown>30</span></div>
        <div class="word-slot" data-word="r"><kbd>R</kbd><b>잇는다</b><span data-cooldown>35</span></div>
        <div class="sentence"><div><span>문장력</span><b data-sentence-text>0 / 100</b></div><div class="sentence-track"><i data-sentence></i></div><button data-empower><kbd>F</kbd> 강화 용언</button></div>
      </div>
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
    if (healthBar) healthBar.style.width = `${healthPercent}%`;
    const currentGhost = this.damageHealth;
    if (state.health < currentGhost) {
      window.clearTimeout(this.damageTimer);
      this.damageTimer = window.setTimeout(() => { this.damageHealth = state.health; if (ghost) ghost.style.width = `${healthPercent}%`; }, 500);
    } else { this.damageHealth = state.health; if (ghost) ghost.style.width = `${healthPercent}%`; }
    const healthText = this.hud.querySelector('[data-health-text]'); if (healthText) healthText.textContent = `${Math.ceil(state.health)} / ${state.maxHealth}`;
    const sentence = this.hud.querySelector<HTMLElement>('[data-sentence]'); if (sentence) sentence.style.width = `${Math.min(100, state.sentence / state.sentenceMax * 100)}%`;
    const sentenceText = this.hud.querySelector('[data-sentence-text]'); if (sentenceText) sentenceText.textContent = `${Math.floor(state.sentence)} / ${state.sentenceMax}`;
    const stage = this.hud.querySelector('[data-stage]'); if (stage) stage.textContent = state.stage;
    const score = this.hud.querySelector('[data-score]'); if (score) score.textContent = state.score.toLocaleString();
    const cooldowns = [state.stopCooldown, state.rewindCooldown, state.linkCooldown];
    this.hud.querySelectorAll<HTMLElement>('.word-slot').forEach((slot, index) => {
      const value = cooldowns[index] ?? 0; slot.classList.toggle('unavailable', value > 0);
      const label = slot.querySelector('[data-cooldown]'); if (label) label.textContent = value > 0 ? `${value.toFixed(1)}s` : '준비';
    });
    const empower = this.hud.querySelector<HTMLElement>('[data-empower]');
    if (empower) { empower.classList.toggle('ready', state.sentence >= state.sentenceMax || state.empowered); empower.classList.toggle('armed', state.empowered); empower.innerHTML = state.empowered ? '<kbd>F</kbd> 다음 언령 강화됨' : '<kbd>F</kbd> 강화 용언'; }
    const boss = this.hud.querySelector<HTMLElement>('[data-boss]');
    if (boss && state.bossHealth !== undefined && state.bossMaxHealth !== undefined) {
      boss.classList.remove('hidden');
      const bar = boss.querySelector<HTMLElement>('[data-boss-health]'); if (bar) bar.style.width = `${Math.max(0, state.bossHealth / state.bossMaxHealth) * 100}%`;
      const phase = boss.querySelector('[data-boss-phase]'); if (phase) phase.textContent = `제${state.bossPhase ?? 1}형`;
    } else boss?.classList.add('hidden');
  }

  public showTutorial(text: string): void {
    if (!this.tutorial) return;
    this.tutorial.innerHTML = text; this.tutorial.classList.remove('hidden');
  }
  public hideTutorial(): void { this.tutorial?.classList.add('hidden'); }

  public showUpgradeChoice(choices: readonly UpgradeDefinition[], rerolls: number, select: (id: UpgradeId) => void, reroll: () => void): void {
    const modal = document.createElement('section');
    modal.className = 'modal upgrade-modal';
    modal.innerHTML = `<div class="modal-scrim"></div><div class="upgrade-box"><p class="eyebrow">새 문장이 새겨진다</p><h2>강화 선택</h2><div class="upgrade-grid">${choices.map((choice, index) => `<button class="upgrade-card rarity-${choice.rarity}" data-id="${choice.id}"><span>0${index + 1}</span><em>${choice.rarity} · ${choice.tag}</em><h3>${choice.name}</h3><p>${choice.description}</p><small>선택하려면 클릭</small></button>`).join('')}</div><button class="reroll" data-reroll ${rerolls <= 0 ? 'disabled' : ''}>↻ 다시 뽑기 · 남은 횟수 ${rerolls}</button></div>`;
    this.root.append(modal);
    modal.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((button) => button.addEventListener('click', () => {
      const id = button.dataset.id as UpgradeId; modal.remove(); this.audio.play('upgrade'); select(id);
    }, { once: true }));
    modal.querySelector('[data-reroll]')?.addEventListener('click', () => { modal.remove(); reroll(); }, { once: true });
  }

  public showPause(resume: () => void, title: () => void): void {
    const modal = document.createElement('section'); modal.className = 'modal pause-modal';
    modal.innerHTML = `<div class="modal-scrim"></div><div class="panel-content"><p class="eyebrow">기록이 잠시 멎었다</p><h2>일시정지</h2><button class="rune-button primary" data-resume>계속하기</button><button class="rune-button" data-settings>설정</button><button class="rune-button danger" data-title>타이틀로</button></div>`;
    this.root.append(modal);
    const close = (): void => modal.remove();
    modal.querySelector('[data-resume]')?.addEventListener('click', () => { close(); resume(); }, { once: true });
    modal.querySelector('[data-settings]')?.addEventListener('click', () => { close(); this.showSettings(() => { this.showHud(); resume(); }); }, { once: true });
    modal.querySelector('[data-title]')?.addEventListener('click', () => { close(); title(); }, { once: true });
  }

  public showResult(stats: ResultStats, restart: () => void, title: () => void): void {
    this.clear();
    const screen = document.createElement('section'); screen.className = `screen result-screen ${stats.victory ? 'victory' : 'defeat'}`;
    const minutes = Math.floor(stats.time / 60); const seconds = Math.floor(stats.time % 60).toString().padStart(2, '0');
    screen.innerHTML = `<div class="result-sigil">${stats.rank}</div><div class="result-content"><p class="eyebrow">${stats.victory ? '마지막 문장이 이어졌다' : '기록이 먹빛에 잠겼다'}</p><h2>${stats.victory ? '기록 회수 완료' : '계승 실패'}</h2><div class="score-big">${stats.score.toLocaleString()}</div>
      <div class="result-stats"><span>플레이 시간<b>${minutes}:${seconds}</b></span><span>받은 피해<b>${Math.round(stats.damageTaken)}</b></span><span>패링 성공<b>${stats.parries}</b></span><span>멎는다<b>${stats.wordUses['멎는다']}</b></span><span>되돌린다<b>${stats.wordUses['되돌린다']}</b></span><span>잇는다<b>${stats.wordUses['잇는다']}</b></span></div>
      <div class="upgrade-summary"><span>새겨진 강화</span><p>${stats.upgrades.length ? stats.upgrades.join(' · ') : '없음'}</p></div>
      <div class="panel-buttons"><button class="rune-button primary" data-restart>다시 시작 <kbd>Enter</kbd></button><button class="rune-button" data-title>타이틀로</button></div></div>`;
    this.root.append(screen); this.screen = screen;
    const doRestart = (): void => restart();
    screen.querySelector('[data-restart]')?.addEventListener('click', doRestart, { once: true });
    screen.querySelector('[data-title]')?.addEventListener('click', title, { once: true });
    const enter = (event: KeyboardEvent): void => { if (event.code === 'Enter' && this.screen === screen) { window.removeEventListener('keydown', enter); doRestart(); } };
    window.addEventListener('keydown', enter);
  }
}
