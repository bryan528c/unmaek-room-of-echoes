# Motion Staging R2 Engine Report

This review-only report records the `motionPilot=1` R2 engine checks performed at 960×540 logical resolution and 100% browser zoom. It is not part of the runtime preload allowlist.

## Player damage routes

| route | QA | pilot | result |
|---|---:|---:|---|
| `/` | no | no | natural melee damage reduced health from 100 to 40 |
| `/?motionPilot=1` | no | yes | natural melee damage reduced health from 100 to 40; physics owner stayed active with body enabled |
| `/?qa=1&skipLoadout=1` | yes | no | natural melee damage reduced health from 100 to 70 |
| `/?motionPilot=1&qa=1&skipLoadout=1` | yes | yes | deterministic projectile applied 8 and melee applied 15; immediate repeats were rejected as `HIT_INVULNERABILITY` |
| `/?motionPilot=1&qa=1&skipLoadout=1&godMode=1` | yes | yes | health remained 100 and the exact rejection reason was `GOD_MODE`; HUD showed `DEV GOD MODE` |

The old QA-wide early return was the regression. QA now enables diagnostics only; invulnerability requires the explicit DEV-only `godMode=1` query. A natural goral encounter recorded boss charge damage 24, later charge damage 22, projectile damage 30 total, and reached natural death at health 0. Hit-recover starts only after positive actual damage.

## Resonance goral staging facing

The handoff supplies one canonical left-facing 23-frame set and official metadata remains `fixed`. R2 therefore uses a presentation-only staging mirror with a six-logical-pixel hysteresis:

- target left: gameplay flip false, visual flip false;
- target right: gameplay flip false, visual flip true;
- gameplay Hurtbox, movement, damage, range, and official attack anchor remain unchanged;
- pilot per-frame visual anchor, outline, and phase 3 overlay use the visual flip;
- phase 3 verified one overlay with `flipX=true`, without duplicate companion creation.

This does not remove the need for an approved authored right-facing frame and anchor set before an official direction-complete promotion.

## Phase 3 summon projection

The legacy raw positions were old 960×540 arena constants and were outside both the approved ACT 1 boss territory and current walkable mask:

| raw game point | source-map point | raw walkable | raw territory |
|---|---|---:|---:|
| (858,118) | (1144,157.33) | false | false |
| (102,112) | (136,149.33) | false | false |
| (105,458) | (140,610.67) | false | false |

The final clean phase-3 pass projected the latest three to `(603.48,154.08)`, `(294.65,233.86)`, and `(303.54,310.54)`. All reported `finalWalkable=true` and `finalInsideTerritory=true`. Existing active minions are included in the separation predicate, so the second three-minion summon cannot reuse the first group's points. In the six-minion movement snapshot every minion moved away from its recorded initial point within the observed interval; no corner pin remained.

The projection uses the existing movement radius plus five logical pixels, a bounded deterministic search, and no retry timer or pathfinding. Summon count, kind, phase timing, AI, health, damage, reward, and statistics were not changed.

## Unsupported player directions

`N / NE / SE / SW / W / NW` retain their own authored direction-lock PNG. While moving, the staging presentation applies only the declared four-step cadence: `y = 0,-1,0,+1` and lean `0,-1.5°,0,+1.5°`, with rounded pixels. No S/E animation frame, flip, or rotation-derived direction is used. Browser snapshots confirmed all six frame paths and the `PROCEDURAL_STANDING_FALLBACK` source.

This remains `PLAYER_FULL_8_DIRECTION_ASSET_BLOCKER`; it is not an authored walking animation.

## Minimal readability changes

Only with motion pilot active, the current cut arc uses thinner, shorter, lower-alpha rendering. Its gameplay origin, sector, range, hit timestamp, damage, and cooldown are unchanged. Pilot hit tint is short and only follows positive actual damage. Flag OFF keeps legacy VFX parameters.

## Engine evidence

- `player_damage_routes.jpg`: pilot normal route after real damage.
- `goral_mirror_anchor_debug.jpg`: right-facing staging mirror with F2 presentation evidence.
- `phase3_minion_spawn_debug.jpg`: phase-3 raw/corrected spawn debug overlay.
- `player_fallback_6dir.jpg`: unsupported-direction procedural fallback with F2 data.

A fresh final browser tab completed general and boss smoke checks with zero captured console warnings/errors, one live canvas, and no broken DOM image. The browser harness does not expose an HTTP-status network panel, so a direct status-code audit is not claimed; no missing-texture or 404 console message appeared and no black screen was observed.

## MP4 status and manual recording

MP4 capture is unavailable in the current in-app browser harness. Record at browser zoom 100% using these sequences:

1. Damage routes (20–25 s): open each of the five routes above, avoid dash/parry/word input, and capture one projectile, melee, and boss charge plus the health delta and F2 rejection reason.
2. Goral facing (20 s): boss QA, click `GORAL-LEFT`, then `GORAL-RIGHT`; capture phase 1 charge, advance twice with `PHASE-NEXT`, and capture the mirrored phase-3 overlay.
3. Summons (10 s): remain in phase 3 with F2 on; capture red raw points, green corrected points, and all minions pursuing for at least three seconds.
4. Fallback (15 s): click `MOVE-N`, `MOVE-NE`, `MOVE-SE`, `MOVE-SW`, `MOVE-W`, and `MOVE-NW`; capture the source label and direction-lock file for each.
5. ACT transition (20 s): finish phase 3 with `QA-ADVANCE`, select one boss reward, and capture ACT 2 with no ACT 1 creature motion controller.
