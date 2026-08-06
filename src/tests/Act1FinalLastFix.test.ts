import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOTION_PILOT_PRESENTATION_PROFILES } from '../game/motion/MotionPilotConfig';
import { VisualSequencePlayer } from '../game/motion/VisualSequencePlayer';

const creatureAnchors = JSON.parse(readFileSync(
  'handoff/UNMAEK_ACT1_SHOWCASE_MOTION_VFX_HANDOFF_v1/creatures/ACT1_CREATURE_NATIVE_ANCHORS.json',
  'utf8',
)) as { frames: Record<string, Record<string, { x: number; y: number }>> };

describe('ACT 1 final lizard facing correction', () => {
  it('limits the inverted authored-facing policy to rewind_lizard', () => {
    expect(MOTION_PILOT_PRESENTATION_PROFILES.rewind_lizard.directionPolicy).toBe('INVERTED_FLIP_X');
    expect(MOTION_PILOT_PRESENTATION_PROFILES.deflect_bat.directionPolicy).toBe('FLIP_X');
    expect(MOTION_PILOT_PRESENTATION_PROFILES.pressure_swift.directionPolicy).toBe('FLIP_X');
  });

  it('keeps every corrected snout anchor on the authored left-facing head', () => {
    const lizard = Object.entries(creatureAnchors.frames)
      .filter(([file]) => file.includes('creatures/rewind_lizard/readability_corrected/'));
    expect(lizard).toHaveLength(6);
    expect(lizard.every(([, anchors]) => (anchors.snout?.x ?? 999) < 64)).toBe(true);
  });

  it('changes only presentation flip while gameplay anchors keep effectiveFlipX', () => {
    const source = readFileSync('src/game/runtime/CreaturePresentation.ts', 'utf8');
    expect(source).toContain("policy === 'MIRRORED_STAGING' || policy === 'INVERTED_FLIP_X'");
    expect(source).toContain("this.motion?.directionPolicy === 'INVERTED_FLIP_X'");
    expect(source).toContain('this.pilotVisualFlipX = !this.effectiveFlipX');
    expect(source).toContain('resolveWorldHurtbox(this.creatureId, groundPoint, this.effectiveFlipX)');
    expect(source).toContain('resolveWorldAttackAnchor(this.creatureId, groundPoint, this.effectiveFlipX');
    expect(source).toContain('this.motion?.visualAnchor(groundPoint, this.presentationFlipX');
  });
});

describe('ACT 1 goral full-stop clock', () => {
  it('holds a visual frame and resumes from its remaining sequence window once', () => {
    const player = new VisualSequencePlayer();
    player.play({
      id: 'goral:warning', loop: false,
      frames: [
        { file: 'warning-1.png', durationMs: 100 },
        { file: 'warning-2.png', durationMs: 100 },
        { file: 'warning-3.png', durationMs: 100 },
      ],
    }, { startAt: 0, durationMs: 300, contactAt: 200 });
    expect(player.update(120)?.file).toBe('warning-2.png');
    player.shiftWindow(1_000);
    expect(player.update(1_120)?.file).toBe('warning-2.png');
    expect(player.update(1_200)?.file).toBe('warning-3.png');
    expect(player.snapshot()).toMatchObject({ completionCount: 0, playCount: 1 });
    player.update(1_300);
    expect(player.snapshot()).toMatchObject({ completionCount: 1, playCount: 1 });
  });

  it('pauses all existing boss attack callbacks and rejects transition-window stop', () => {
    const enemy = readFileSync('src/game/entities/Enemy.ts', 'utf8');
    const boss = readFileSync('src/game/entities/Boss.ts', 'utf8');
    const scene = readFileSync('src/game/scenes/GameScene.ts', 'utf8');
    expect(enemy).toContain("this.creatureId === 'resonance_goral'");
    expect(enemy).toContain('if (fullBossStop && !this.canAcceptFullStop(now)) return false');
    expect(enemy).toContain('for (const timer of this.attackTimers) timer.paused = true');
    expect(enemy).toContain('body.moves = false');
    expect(enemy).toContain('body.immovable = true');
    expect(enemy).toContain('body.moves = this.pausedBodyMoves ?? body.moves');
    expect(enemy).toContain('body.immovable = this.pausedBodyImmovable ?? body.immovable');
    expect(enemy).toContain('if (this.active && this.pausedVelocity) this.setVelocity');
    expect(boss).not.toContain('this.scene.time.delayedCall');
    expect(boss).toContain('this.scheduleAttackCallback');
    expect(boss).toContain('return now >= this.phaseTransitionUntil');
    expect(scene).toContain('const applied = enemy.freeze');
    expect(scene).toContain('if (!applied) continue');
    expect(scene).toContain('if (successful) this.showcaseVfx?.wordStop');
    expect(scene).toContain('if (enemy.isStopPositionLocked)');
    expect(scene).toContain('const aShare = a.isStopPositionLocked ? 0 : b.isStopPositionLocked ? 1 : 0.5');
  });

  it('shifts each gameplay deadline once instead of replaying expired callbacks', () => {
    const enemy = readFileSync('src/game/entities/Enemy.ts', 'utf8');
    for (const deadline of ['actionLockedUntil', 'nextActionAt', 'attackActiveUntil']) {
      expect(enemy).toContain(`if (this.${deadline} > pausedAt) this.${deadline} += pausedDuration`);
    }
    expect(enemy).toContain('this.telegraphState.until += pausedDuration');
    expect(enemy).toContain('this.pausedAttackGeneration === this.attackIntentGeneration');
  });
});
