import { describe, expect, it } from 'vitest';
import { FinisherChargeSystem, finisherProfile, finisherStatusFor, repeatedAttackTtk, selectDefensiveSlashTarget } from '../game/systems/CombatCoreSystem';
import { BALANCE } from '../game/balance';
import { WordChainSystem } from '../game/systems/WordChainSystem';

const candidate = (id: string, x: number, overrides: Partial<Parameters<typeof selectDefensiveSlashTarget>[1][number]> = {}) => ({
  id,
  hurtbox: { x, y: 0, radiusX: 5, radiusY: 8 },
  alive: true,
  visible: true,
  attackable: true,
  insideCombatBounds: true,
  ...overrides,
});

describe('CombatCoreSystem', () => {
  it('호신 베기는 실제 Hurtbox가 범위 안인 가장 가까운 한 대상만 고른다', () => {
    const selected = selectDefensiveSlashTarget({ x: 0, y: 0 }, [candidate('far', 48), candidate('near', 31)], 50);
    expect(selected?.id).toBe('near');
  });

  it('화면 밖, 사망, 공격 불가 대상은 호신 베기에서 제외한다', () => {
    const selected = selectDefensiveSlashTarget({ x: 0, y: 0 }, [
      candidate('hidden', 12, { visible: false }),
      candidate('dead', 13, { alive: false }),
      candidate('outside', 14, { insideCombatBounds: false }),
      candidate('valid', 30),
    ], 50);
    expect(selected?.id).toBe('valid');
  });

  it('결문 충전은 최대치를 넘지 않고 소비와 초기화가 안전하다', () => {
    const charges = new FinisherChargeSystem(3);
    expect(charges.gain(5)).toBe(3);
    expect(charges.charges).toBe(3);
    expect(charges.spend()).toBe(true);
    expect(charges.charges).toBe(2);
    charges.reset();
    expect(charges.spend()).toBe(false);
  });

  it('라운드 시작 결문은 최소 1개만 보장하고 보유 충전을 덮어쓰지 않는다', () => {
    const charges = new FinisherChargeSystem(3);
    expect(charges.ensureMinimum(1)).toBe(1);
    expect(charges.ensureMinimum(1)).toBe(0);
    charges.gain(1);
    expect(charges.ensureMinimum(1)).toBe(0);
    expect(charges.charges).toBe(2);
  });

  it('상태 우선순위와 결문 반응 프로필이 일치한다', () => {
    const multipliers = { stopped: 1.25, linked: 1.08, echo: 1.2 };
    expect(finisherStatusFor({ stopped: true, linked: true, echo: true })).toBe('stopped');
    expect(finisherProfile('stopped', multipliers)).toMatchObject({ damageMultiplier: 1.25, burstsStoppedArea: true });
    expect(finisherProfile('linked', multipliers)).toMatchObject({ damageMultiplier: 1.08, reactsThroughLinks: true });
    expect(finisherProfile('echo', multipliers)).toMatchObject({ damageMultiplier: 1.2, replaysEcho: true });
  });

  it('자동 호신 베기만으로 일반 적을 지우는 데 최소 6초가 걸린다', () => {
    for (const kind of ['chaser', 'archer', 'ink'] as const) {
      expect(repeatedAttackTtk(BALANCE.enemies[kind].hp, BALANCE.hero.defensiveSlash.damage, BALANCE.hero.defensiveSlash.interval)).toBeGreaterThanOrEqual(6);
    }
    expect(repeatedAttackTtk(BALANCE.enemies.elite.hp, BALANCE.hero.defensiveSlash.damage, BALANCE.hero.defensiveSlash.interval)).toBeGreaterThan(20);
  });

  it('상태 없는 결문 베기는 일반 원거리 적을 즉시 삭제하지 않고 보스도 여러 번 필요하다', () => {
    expect(Math.ceil(BALANCE.enemies.archer.hp / BALANCE.hero.finisher.damage)).toBeGreaterThanOrEqual(2);
    expect(Math.ceil(BALANCE.enemies.boss.hp / BALANCE.hero.finisher.damage)).toBeGreaterThan(20);
  });

  it('기본 3연격은 결문 없이도 성립하고 일반 적은 2콤보, 엘리트는 6콤보가 필요하다', () => {
    const combo = BALANCE.hero.attackDamage.reduce((sum, value) => sum + value, 0);
    expect(combo).toBe(35);
    expect(Math.ceil(BALANCE.enemies.chaser.hp / combo)).toBe(2);
    expect(Math.ceil(BALANCE.enemies.archer.hp / combo)).toBe(2);
    expect(Math.ceil(BALANCE.enemies.ink.hp / combo)).toBe(2);
    expect(Math.ceil(BALANCE.enemies.elite.hp / combo)).toBe(6);
    expect(BALANCE.hero.defensiveSlash.enabledByDefault).toBe(false);
  });

  it('Q/E/R은 독립 쿨다운만 사용하고 전투 시작 비용은 0으로 운용된다', () => {
    expect(BALANCE.words.stopCooldown).toBeGreaterThanOrEqual(5500);
    expect(BALANCE.words.rewindCooldown).toBeGreaterThanOrEqual(7000);
    expect(BALANCE.words.linkCooldown).toBeGreaterThanOrEqual(8000);
    expect(new WordChainSystem(BALANCE.chain.window).use('stop', 0, { successful: true }).costDiscount).toBe(0);
  });

  it('첫 라운드 회복은 60 미만을 최소 60으로 복구할 수 있다', () => {
    const before = 25;
    const recovery = Math.max(100 * BALANCE.pacing.roundHealRatio, BALANCE.pacing.firstRoundMinimumHealth - before);
    expect(Math.min(100, before + recovery)).toBe(60);
  });
});
