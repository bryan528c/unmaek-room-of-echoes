import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { resolveWordLoadoutEnterAction } from '../ui/OverlayUI';

describe('ACT 1 final loadout Enter policy', () => {
  it('submits a complete loadout once and ignores key repeat', () => {
    const start = vi.fn();
    if (resolveWordLoadoutEnterAction('Enter', false, 3) === 'CONFIRM') start();
    if (resolveWordLoadoutEnterAction('Enter', true, 3) === 'CONFIRM') start();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not mutate an incomplete focused-card selection', () => {
    const selected = ['stop', 'rewind'];
    const before = [...selected];
    expect(resolveWordLoadoutEnterAction('Enter', false, selected.length)).toBe('SHOW_VALIDATION');
    expect(selected).toEqual(before);
    expect(resolveWordLoadoutEnterAction('Space', false, selected.length)).toBe('IGNORE');
  });

  it('captures Enter before native card activation while leaving Space clicks intact', () => {
    const source = readFileSync('src/ui/OverlayUI.ts', 'utf8');
    expect(source).toContain("screen.addEventListener('keydown'");
    expect(source).toContain("if (event.code !== 'Enter') return;");
    expect(source).toContain('event.preventDefault();');
    expect(source).toContain('event.stopPropagation();');
    expect(source).toContain("screen.querySelector<HTMLButtonElement>('[data-confirm]')?.addEventListener('click', submit");
  });
});

describe('ACT 1 final helper and lifecycle ownership', () => {
  it('keeps the 560 ms spawn activation but replaces only the final-mode marker', () => {
    const enemy = readFileSync('src/game/entities/Enemy.ts', 'utf8');
    expect(enemy).toContain('public spawn(minimalPresentation = false)');
    expect(enemy).toContain('duration: minimalPresentation ? 160 : 560');
    expect(enemy).toContain('this.scene.time.delayedCall(560');
  });

  it('suppresses the legacy bat line and bounds the final mouth cue', () => {
    const enemy = readFileSync('src/game/entities/Enemy.ts', 'utf8');
    const finalVfx = readFileSync('src/game/final/Act1FinalVfx.ts', 'utf8');
    expect(enemy).toContain("act1FinalEnabled() && this.creatureId === 'deflect_bat'");
    expect(finalVfx).toContain('ACT1_FINAL_PROJECTILE_READABILITY.batCueLength');
    expect(finalVfx).toContain("this.removeTelegraphCorridor(enemy, 'CUE_TTL')");
  });

  it('records owner cleanup and clears final presentation on phase/ACT boundaries', () => {
    const finalVfx = readFileSync('src/game/final/Act1FinalVfx.ts', 'utf8');
    const scene = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    expect(finalVfx).toContain('recentCleanup');
    expect(finalVfx).toContain("this.releaseProjectile(projectile, 'ACT_OR_PHASE_CLEANUP')");
    expect(finalVfx).toContain("this.remove(item, 'ACT_OR_PHASE_CLEANUP')");
    expect(scene).toContain('this.showcaseVfx.clearAttackPresentations()');
  });
});
