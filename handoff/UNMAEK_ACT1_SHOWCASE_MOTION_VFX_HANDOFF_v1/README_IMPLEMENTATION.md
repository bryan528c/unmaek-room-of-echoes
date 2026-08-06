# UNMAEK ACT 1 Showcase Motion + VFX Handoff v1

## 판정

`PASS — Codex staging 전달 가능`

이 패키지는 제출 영상용 ACT 1 주인공·생물·전투 VFX의 런타임 후보이다. 맵, collision, AI, damage, range, cooldown, hit timing, Hurtbox, 언령 조건, 보스 단계와 진행 구조는 변경하지 않았다. 새 gameplay event 또는 기능 추가는 0건이다.

## 런타임 잠금

- 주인공: `128×128`, RGBA 8-bit, Ground Point `(64,112)`, 표시 배율 `1.0×`
- 주인공 standing visible height: 방향별 `92–96px`
- 공용 주인공 palette: `48색`
- sampling: nearest-neighbor only
- 주인공 프레임: `256장` — 8방향 × 방향별 32장
- ACT 1 native creature correction 후보: `29장`
- VFX effect record: `33개`
- gameplay additions: `0`

## 런타임 후보와 검토 자료

| 구분 | 사용 위치 | 비고 |
|---|---|---|
| `player/<dir>/<sequence>/*.png` | 런타임 후보 | 128×128 개별 프레임 |
| `player/sprite_sheets/*.png` | 런타임 후보 | 패킹 후보, 원본 개별 PNG 우선 |
| `creatures/*/readability_corrected/*.png` | 런타임 후보 | 목표 native 표시 크기용 보정 후보 |
| `vfx/**/*.png` | 런타임 후보 | 캐릭터와 분리된 투명 PNG sequence |
| `previews/**` | 검토 전용 | 960×540 증거 영상·contact sheet·poster |
| `review/*.pptx` | 검토 전용 | PNG/MP4를 대체하지 않음 |

`creatures/*/readability_verified/`는 이전 파일럿의 상태·동작 의미를 보존한 비교 자료이다. 새 native 표시 후보는 `readability_corrected/`만 staging 대상으로 검토한다.

## 구현 순서

1. `PLAYER_FULL8_MOTION_MANIFEST.json`의 방향·sequence·프레임 순서를 로드한다.
2. 모든 주인공 프레임을 canvas `128×128`, Ground Point `(64,112)`, scale `1.0×`로 배치한다.
3. `PLAYER_FULL8_ANCHORS.json`의 frame별 `dagger_tip`, `parry_center`, `word_target`, `collarbone_resonance`를 시각 VFX 부착에 사용한다. Hurtbox와 collision에는 적용하지 않는다.
4. 생물은 `creatures/READABILITY_STATUS.json`의 canvas·Ground Point·표시 크기를 따른다. 공격 anchor는 `creatures/ACT1_CREATURE_NATIVE_ANCHORS.json`을 참조한다.
5. VFX는 `ACT1_VFX_MANIFEST.json`의 canvas, offset, duration 후보, layer, cleanup 조건을 적용한다.
6. `ACT1_VFX_EVENT_MAP.json`에서 각 effect를 기존 엔진 event에 연결한다.

## Event binding

제공된 저장소 metadata에서 정확한 엔진 event ID를 검증할 수 없으므로 33개 effect 모두 `BINDING_REQUIRED`로 기록했다. 이는 새 event 생성 지시가 아니다. 각 record의 `existingGameplaySequence`와 `sourceAnchor`를 확인해 이미 존재하는 공격·패링·언령·phase event에만 연결한다. timing을 새로 만들거나 VFX duration을 gameplay 판정에 역적용하지 않는다.

## 필수 960×540 증거 영상

- `previews/gameplay_960x540/player_full8_idle_move_960x540.mp4`
- `previews/gameplay_960x540/player_full8_all_actions_960x540.mp4`
- `previews/player_vfx/player_attack_parry_vfx_960x540.mp4`
- `previews/player_vfx/word_vfx_6types_960x540.mp4`
- `previews/creature_vfx/act1_creature_readability_960x540.mp4`
- `previews/creature_vfx/act1_creature_attack_identity_960x540.mp4`
- `previews/gameplay_960x540/act1_showcase_clean_30to60s.mp4` — 38초, debug overlay OFF
- `previews/before_after/old64_vs_new_native_before_after.mp4`

## 검증

`VALIDATION_REPORT.md`와 `reports/validation_results.json`을 기준으로 자동 검증 `PASS 2505 / FAIL 0`이다. 최종 ZIP의 파일 무결성은 `SHA256SUMS.txt`로 확인한다.
