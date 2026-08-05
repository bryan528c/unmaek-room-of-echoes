# SOURCE_AUDIT_PLAYER_ACT1_v1

## 감사 결론

- 주인공: 실제 runtime source 미확인. `SOURCE_BLOCKED`; proxy 금지 적용.
- ACT 1: 5종 metadata와 runtime PNG 17개 확인. 거미 corrected 7상태 확인.
- master 원본: 광물실거미 7상태만 실제 bytes 확인. 나머지 4종은 metadata에 경로가 선언되어 있으나 현재 자료 집합에는 bytes가 없음.
- 기존 공격 duration과 hit timestamp의 숫자값은 제공 자료에 노출되지 않음. 새 값을 만들지 않고 `USE_EXISTING_ENGINE_DURATION` / `MAP_TO_EXISTING_HIT_TIMESTAMP`로 바인딩한다.

## 주인공

세부 차단 내용은 `PLAYER_SOURCE_BLOCKER_REPORT.md` 참조.

| 항목 | 결과 |
|---|---|
| idle / move 8방향 | SOURCE_BLOCKED |
| dash / basic attack / parry / hit / word / combat end | SOURCE_BLOCKED |
| canvas / 발 기준 / 단검 손 / attack anchor | SOURCE_BLOCKED |
| `hero_runtime_keyposes.png` | DESIGN_SOURCE, runtime 아님 |
| 주인공 콘셉트 원본 | DESIGN_SOURCE |
| 기존 player motion strip | REVIEW_ONLY / DO_NOT_USE_RUNTIME |

## ACT 1 실제 파일

### 압각 칼새 (`pressure_swift`)

- metadata: `source_cache/runtime_pack_full/creatures/act1/pressure_swift/metadata.json`
- master: `fly`: SOURCE_NOT_FOUND (`creatures/act1/pressure_swift/master/act1_pressure_swift_fly_side_master.png` declared); `evade`: SOURCE_NOT_FOUND (`creatures/act1/pressure_swift/master/act1_pressure_swift_evade_side_master.png` declared)
- runtime: 2개 — `source_cache/runtime_pack_full/creatures/act1/pressure_swift/runtime/act1_pressure_swift_fly_side_01.png`, `source_cache/runtime_pack_full/creatures/act1/pressure_swift/runtime/act1_pressure_swift_evade_side_01.png`
- unique state: fly, evade
- alias: idle←fly
- canvas: 36×24 / runtimeScale 1.0
- Ground Point: (18, 20)
- Hurtbox: 없음
- attack anchor: 없음
- direction: flipX
- VFX: 없음
- 실제 게임 표시 크기: metadata `runtimeScale 1.0`, 본 파일럿은 native canvas 1×로 재생

### 편향관 박쥐 (`deflect_bat`)

- metadata: `source_cache/runtime_pack_full/creatures/act1/deflect_bat/metadata.json`
- master: `idle`: SOURCE_NOT_FOUND (`creatures/act1/deflect_bat/master/act1_deflect_bat_idle_side_master.png` declared); `move`: SOURCE_NOT_FOUND (`creatures/act1/deflect_bat/master/act1_deflect_bat_move_side_master.png` declared)
- runtime: 2개 — `source_cache/runtime_pack_full/creatures/act1/deflect_bat/runtime/act1_deflect_bat_idle_side_01.png`, `source_cache/runtime_pack_full/creatures/act1/deflect_bat/runtime/act1_deflect_bat_move_side_01.png`
- unique state: idle, move
- alias: prep←idle; attack←move; hit←move
- canvas: 52×36 / runtimeScale 1.0
- Ground Point: (26, 29)
- Hurtbox: {'x': 12, 'y': 9, 'width': 28, 'height': 20}
- attack anchor: mouth-organ (26, 14)
- direction: flipX
- VFX: 없음
- 실제 게임 표시 크기: metadata `runtimeScale 1.0`, 본 파일럿은 native canvas 1×로 재생

### 되감비늘 도마뱀 (`rewind_lizard`)

- metadata: `source_cache/runtime_pack_full/creatures/act1/rewind_lizard/metadata.json`
- master: `idle`: SOURCE_NOT_FOUND (`creatures/act1/rewind_lizard/master/act1_rewind_lizard_idle_side_master.png` declared); `move`: SOURCE_NOT_FOUND (`creatures/act1/rewind_lizard/master/act1_rewind_lizard_move_side_master.png` declared)
- runtime: 2개 — `source_cache/runtime_pack_full/creatures/act1/rewind_lizard/runtime/act1_rewind_lizard_idle_side_01.png`, `source_cache/runtime_pack_full/creatures/act1/rewind_lizard/runtime/act1_rewind_lizard_move_side_01.png`
- unique state: idle, move
- alias: prep←idle; attack←move; hit←idle
- canvas: 72×40 / runtimeScale 1.0
- Ground Point: (33, 34)
- Hurtbox: {'x': 9, 'y': 12, 'width': 48, 'height': 22}
- attack anchor: snout (9, 22)
- direction: flipX
- VFX: 없음
- 실제 게임 표시 크기: metadata `runtimeScale 1.0`, 본 파일럿은 native canvas 1×로 재생

### 광물실거미 (`mineral_spider`)

- metadata: `source_cache/runtime_pack_full/creatures/act1/mineral_spider/metadata.json`
- master: `idle`: `drive_runtime_pack/creatures/act1/mineral_spider/master/act1_mineral_spider_idle_front_master.png`; `move`: `drive_runtime_pack/creatures/act1/mineral_spider/master/act1_mineral_spider_move_side_master.png`; `alert`: `drive_runtime_pack/creatures/act1/mineral_spider/master/act1_mineral_spider_alert_front_master.png`; `deploy`: `drive_runtime_pack/creatures/act1/mineral_spider/master/act1_mineral_spider_deploy_side_master.png`; `attack`: `drive_runtime_pack/creatures/act1/mineral_spider/master/act1_mineral_spider_attack_side_master.png`; `stunned`: `drive_runtime_pack/creatures/act1/mineral_spider/master/act1_mineral_spider_stunned_front_master.png`; `retreat`: `drive_runtime_pack/creatures/act1/mineral_spider/master/act1_mineral_spider_retreat_side_master.png`
- runtime: 7개 — `deliverables/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_alert_front_corrected_candidate_104x88.png`, `deliverables/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_attack_side_corrected_candidate_104x88.png`, `deliverables/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_deploy_side_corrected_candidate_104x88.png`, `deliverables/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_idle_front_corrected_candidate_104x88.png`, `deliverables/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_move_side_corrected_candidate_104x88.png`, `deliverables/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_retreat_side_corrected_candidate_104x88.png`, `deliverables/UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1/creatures/act1/mineral_spider/runtime_corrected/act1_mineral_spider_stunned_front_corrected_candidate_104x88.png`
- unique state: idle, move, alert, deploy, attack, stunned, retreat
- alias: 없음
- canvas: 104×88 / runtimeScale 1.0
- Ground Point: (52, 72)
- Hurtbox: {'x': 17, 'y': 22, 'width': 70, 'height': 50}
- attack anchor: thread-spawn-a (37, 35); thread-spawn-b (52, 35); thread-spawn-c (67, 35)
- direction: front-side
- VFX: vfx/mineral_spider_thread_spawn_marker.png
- 실제 게임 표시 크기: metadata `runtimeScale 1.0`, 본 파일럿은 native canvas 1×로 재생

### 반향각 산양 (`resonance_goral`)

- metadata: `source_cache/runtime_pack_full/creatures/act1/resonance_goral/metadata.json`
- master: `idle`: SOURCE_NOT_FOUND (`creatures/act1/resonance_goral/master/act1_resonance_goral_idle_fixed_master.png` declared); `warning`: SOURCE_NOT_FOUND (`creatures/act1/resonance_goral/master/act1_resonance_goral_warning_fixed_master.png` declared); `combat`: SOURCE_NOT_FOUND (`creatures/act1/resonance_goral/master/act1_resonance_goral_combat_fixed_master.png` declared); `retreat`: SOURCE_NOT_FOUND (`creatures/act1/resonance_goral/master/act1_resonance_goral_retreat_fixed_master.png` declared)
- runtime: 4개 — `source_cache/runtime_pack_full/creatures/act1/resonance_goral/runtime/act1_resonance_goral_idle_fixed_01.png`, `source_cache/runtime_pack_full/creatures/act1/resonance_goral/runtime/act1_resonance_goral_warning_fixed_01.png`, `source_cache/runtime_pack_full/creatures/act1/resonance_goral/runtime/act1_resonance_goral_combat_fixed_01.png`, `source_cache/runtime_pack_full/creatures/act1/resonance_goral/runtime/act1_resonance_goral_retreat_fixed_01.png`
- unique state: idle, warning, combat, retreat
- alias: 없음
- canvas: 220×175 / runtimeScale 1.0
- Ground Point: (110, 154)
- Hurtbox: {'x': 51, 'y': 68, 'width': 118, 'height': 86}
- attack anchor: horn-root (110, 49); forehoof-left (92, 138); forehoof-right (128, 138)
- direction: fixed
- VFX: vfx/resonance_goral_phase3_overlay.png
- 실제 게임 표시 크기: metadata `runtimeScale 1.0`, 본 파일럿은 native canvas 1×로 재생

## 플레이 영상 감사

- `project_sources/02-ACT1-08-04.mp4`: 일반 전투에서 적 본체는 좌표 이동 대비 실루엣 변화가 거의 없고, 공격선·원형 Telegraph가 몸보다 먼저 읽힌다.
- 같은 영상의 보스 구간에서 warning/combat 정지 포즈 교체는 보이지만 굽 접지·어깨 하강·접촉 후 복귀 연결이 없다.
- ACT 2·3 영상은 확대 범위 판단용으로 확인했으며 이번 산출물은 ACT 1에만 프레임을 만든다.
