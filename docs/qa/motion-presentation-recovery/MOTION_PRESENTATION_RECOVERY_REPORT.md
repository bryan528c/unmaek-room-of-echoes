# PLAYER-ACT1-MOTION-PRESENTATION-RECOVERY-01R

## Scope

- Branch: `feat/player-act1-motion-staging`
- Base HEAD: `7b22bb199265f7afa368ef526c88bf9164b9e982`
- Master flag: `?motionPilot=1` (default OFF, not persisted)
- Gameplay timing, damage, range, cooldown, collision, DamageQueue, TimeControl, ACT flow, and result statistics were not redesigned.

## Safety backup

The pre-01R tracked binary diff and untracked motion source files were copied outside the repository to:

`C:\Users\bryan\AppData\Local\Temp\unmaek-motion-staging-01r-backup-20260806`

## Geometry result

The pilot texture is rendered by a separate non-physics `Image`. The legacy `Hero` Physics Sprite remains the gameplay owner and keeps its original texture, origin, scale/tweens, body, map query point, movement circle, Hurtbox, and controls.

| Measurement | flag OFF | ON before 01R | ON after 01R |
|---|---:|---:|---:|
| Spawn ground Y | 393.75 | 393.75 | 393.75 |
| Bottom reachable ground Y | 505 | blocked above the legacy limit in the supplied reproduction | 505 |
| Movement radius | 15 | coupled to pilot sprite transform | 15 |
| Hurtbox radii | 13 × 20 | coupled visual/physics owner | 13 × 20 |
| Map query | Hero ground point | texture-dependent owner | Hero ground point |
| Visible Ground Point delta | n/a | visibly separated | 0.50–0.56 logical px in browser samples |

## Pixel presentation

All pilot textures use NEAREST filtering, uniform scale, rounded world positions, Phaser pixel-art/round-pixels configuration, and the existing pixelated canvas CSS.

| Target | Source alpha bounds observed | Selected scale | Engine alpha bounds observed | Result |
|---|---:|---:|---:|---|
| Player S/E | roughly 24–32 × 45–47 | 1.5× | roughly 36–48 × 67.5–70.5 | crisp; equipment remains readable without 2× oversizing |
| pressure_swift | roughly 11–13 × 11–17 per sampled frame | 1.5× | 16.5–25.5 long side | background cue only; outline disabled |
| deflect_bat | up to roughly 33 × 27 | 1.5× | 37.5–43.5 × 31.5–39 sampled | crisp; outline disabled to preserve ear/wing pixels |
| rewind_lizard | up to roughly 58 × 29 | 1× | 44–46 × 18–22 sampled | crisp; low body and head direction retained |
| mineral_spider | roughly 60–76 × 42–58 | 1× | same logical density | eight-leg pilot silhouette retained; corrected official state remains fallback source |
| resonance_goral | up to roughly 186 × 125 | 1× | warning 114 × 118; idle about 104 × 124 | boss scale readable; neutral 1 px outline |

## Event mapping

| Target | Gameplay event | Visual sequence | Existing contact | Recovery/cancel |
|---|---|---|---|---|
| Player | locomotion/action hooks | S/E authored sequence; six other directions standing lock | existing Hero timestamps | owner/action/scene cleanup |
| pressure_swift | background cue fly/evade | fly 6 / evade 4 | none | cue lifecycle cleanup |
| deflect_bat | projectile prepare | prep 3 + attack 4 | projectile remains at 540 ms | hit_recover 3 from existing 620 ms callback |
| rewind_lizard | melee telegraph/dash | prep 3 + attack 4 | existing warning/contact and melee overlap | hit_recover 3 on resolved overlap or existing miss callback |
| mineral_spider | area-control action | four authored transition sequences | zone/projectiles remain at 650 ms | authored attack_to_recover within the existing 780 ms window |
| resonance_goral | boss warning/charge/phase | warning, combat_prep, charge_attack, hit_recover, retreat | existing charge/contact callback | contact recovery, phase/retreat cleanup |

## Browser evidence

- Player ON reached ground Y 505. Ground Point delta remained below 1 logical pixel.
- Player S/E idle, move, basic attack, word, and hit/recover were observed through the QA harness. Actions used existing gameplay counters/timestamps.
- N/NE/SE/SW/W/NW used their exact direction-lock PNGs with `STANDING_LOCK_FALLBACK`; no S/E frame synthesis, rotation, or E-to-W visual flip was used.
- Lizard natural AI showed `move → prep+attack → hit_recover`; the recovered contact path was observed after the resolved melee overlap.
- Bat natural AI showed `move → prep+attack → hit_recover`, NEAREST filtering, 1.5× uniform scale, and pilot muzzle cue attachment while projectile gameplay origin stayed unchanged.
- Swift fly/evade ran as background-cue presentation and remained outside hostile enemy accounting.
- Goral natural combat showed idle, combat prep/charge, and hit recovery. Phase 1→2 showed warning frames 1→2→3 without the prior immediate base-state overwrite. It remained fixed-facing (`flipX=false`) as required by both handoff and official metadata.
- Direct ACT 2 QA entry showed zero ACT 1 creature motion controllers. Flag OFF showed no pilot review panel, no Hero pilot object, and zero creature pilot controllers.

## Known limitations

- The browser control surface dropped repeated action-button events within one continuous run. Goral phase 2→3, phase 3 overlay, retreat, victory, and a natural ACT 1→2 transition were therefore not claimed as directly verified in this recovery pass.
- The same limitation prevented direct engine capture of the complete spider transition chain. Its 26 source frames, eight-leg silhouette, loader path, central scale, anchor mapping, and cleanup are covered by static inspection/tests, not a complete browser sequence capture.
- Both original and flipped bat/lizard sequences were not captured in the same run. Flip formulas and anchors are covered by automated tests; browser samples captured one facing per subject.
- No MP4 recorder was available. Browser console/network panels were not exposed by the automation surface, so zero console errors/404s are not claimed. No missing texture, black screen, or visible load failure occurred in the scenes that were opened.
- The goral pilot and official metadata expose fixed direction only. No approved opposite-facing frame or authorized `flipX` exists. This remains `ASSET_DIRECTION_BLOCKER_RESONANCE_GORAL` for full official promotion.

## Manual recording checklist

1. Open `?motionPilot=1` at 100% browser zoom and select any three of the six words manually.
2. Record 45 seconds of ACT 1 with S/E movement, dash, J attack, successful/failed parry, Q/E/R, and actual damage recovery.
3. In `?qa=1&skipLoadout=1&motionPilot=1`, record bat, lizard, spider, and swift states with F2 both ON and OFF; capture both horizontal facings.
4. In `?qa=1&skipLoadout=1&boss=1&motionPilot=1`, record all three goral phases, overlay, contact recovery, retreat, and ACT 1→2 cleanup.
5. Repeat the same run without `motionPilot=1` and confirm legacy appearance, identical bottom movement, and no pilot controllers.

## Automated result

- Vitest: 47 files, 298 tests passed.
- Production build: passed; existing >500 kB chunk warning only.
- Upgrade simulation: 500 runs / 1,500 reward screens; 24 cards; zero immediate unselected repeats and zero stack leaks.
- Build simulation: all three presets completed.
- `git diff --check`: passed.
