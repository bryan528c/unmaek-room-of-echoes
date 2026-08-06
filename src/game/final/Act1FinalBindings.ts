export interface Act1FinalVfxBinding {
  effectId: string;
  existingEvent: string;
  codeLocation: string;
  anchor: string;
  status: 'BOUND' | 'UNRESOLVED' | 'NOT_APPLICABLE';
  fallback: 'PROCEDURAL' | 'LEGACY';
}

const binding = (effectId: string, existingEvent: string, codeLocation: string, anchor: string, fallback: 'PROCEDURAL' | 'LEGACY' = 'PROCEDURAL'): Act1FinalVfxBinding =>
  ({ effectId, existingEvent, codeLocation, anchor, status: 'BOUND', fallback });

export const ACT1_FINAL_VFX_BINDINGS: readonly Act1FinalVfxBinding[] = [
  ...(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const).map((direction) => binding(
    `player_basic_attack_cut_${direction}`, 'Hero cut contact callback', 'GameScene.resolveCut', 'dagger_tip',
  )),
  binding('player_parry_attempt', 'accepted parry input', 'GameScene.parry', 'parry_center'),
  binding('player_parry_active', 'existing parry window start', 'GameScene.parry', 'parry_center'),
  binding('player_parry_success', 'actual successful parry', 'GameScene.parrySuccess', 'parry_center'),
  binding('player_parry_failure', 'existing parry window expiry without success', 'GameScene.parry', 'parry_center'),
  binding('player_word_collarbone_resonance', 'successful Word cast', 'GameScene.castStop/castRewind/castLink/castPush/castPull/castMark', 'collarbone_resonance'),
  binding('word_stop', 'successful stop cast', 'GameScene.castStop', 'word_target'),
  binding('word_rewind', 'successful rewind cast', 'GameScene.castRewind', 'word_target'),
  binding('word_connect', 'successful link cast', 'GameScene.castLink', 'word_target'),
  binding('word_push', 'successful push cast', 'GameScene.castPush', 'word_target'),
  binding('word_hold', 'successful pull cast', 'GameScene.castPull', 'word_target'),
  binding('word_flow', 'successful mark cast', 'GameScene.castMark', 'word_target'),
  binding('pressure_swift_evade_pressure', 'existing evade sequence transition', 'Act1FinalVfx.update', 'body_canvas_root'),
  binding('deflect_bat_prep', 'existing prep sequence transition', 'Act1FinalVfx.update', 'mouth_resonance_organ'),
  binding('deflect_bat_projectile', 'existing projectile spawn callback', 'GameScene.spawnProjectile', 'mouth_resonance_organ'),
  binding('deflect_bat_impact', 'existing projectile collision/destruction', 'GameScene.checkProjectileCollision', 'projectile_contact'),
  binding('rewind_lizard_prep', 'existing prep sequence transition', 'Act1FinalVfx.update', 'snout'),
  binding('rewind_lizard_lunge', 'existing attack sequence transition', 'Act1FinalVfx.update', 'snout'),
  binding('rewind_lizard_contact', 'existing melee contact callback', 'GameScene.checkMeleeCollisions', 'snout'),
  binding('mineral_spider_thread_spawn_marker_approved', 'existing deploy-to-attack transition', 'Act1FinalVfx.update', 'thread_spawn_a|b|c'),
  binding('mineral_spider_prep', 'existing deploy-to-attack transition', 'Act1FinalVfx.update', 'thread_spawn_a|b|c'),
  binding('mineral_spider_projectile', 'existing projectile spawn callback', 'GameScene.spawnProjectile', 'thread_spawn_a|b|c'),
  binding('mineral_spider_impact', 'existing projectile collision/destruction', 'GameScene.checkProjectileCollision', 'projectile_contact'),
  binding('resonance_goral_projectile', 'existing boss projectile spawn callback', 'GameScene.spawnProjectile', 'forehoof_contact'),
  binding('resonance_goral_charge', 'existing charge sequence transition', 'Act1FinalVfx.update', 'forehoof_contact'),
  binding('resonance_goral_phase3_overlay_approved', 'existing Boss phase 3 state', 'CreaturePresentation.applyBossPhase', 'body_canvas_root', 'LEGACY'),
] as const;

