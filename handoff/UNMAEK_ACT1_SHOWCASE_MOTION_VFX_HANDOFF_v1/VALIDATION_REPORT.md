# Validation Report

## Overall

- automated validation: `PASS 2505 / FAIL 0`
- final verdict: `PASS — Codex staging 전달 가능`
- gameplay additions: `0`
- engine event binding: `33 / 33 BINDING_REQUIRED`

`BINDING_REQUIRED`는 제공된 metadata에서 정확한 엔진 event ID를 검증하지 못했다는 뜻이다. 새 event나 timing을 만들지 않고 기존 event에 연결해야 한다.

## Player

| 판정 항목 | 결과 |
|---|---|
| Native player resolution | PASS — 128×128, scale 1.0× |
| Concept detail preservation | PASS |
| Full-8 idle | PASS — 4f × 8 |
| Full-8 move | PASS — 6f × 8 |
| Full-8 dash | PASS — 4f × 8 |
| Full-8 basic attack | PASS — 5f × 8 |
| Full-8 parry | PASS — 5f × 8 |
| Full-8 word skill | PASS — 5f × 8 |
| Full-8 hit/recover | PASS — 3f × 8 |
| Ground Point | PASS — 모든 frame bottom y=112 |
| Exact duplicate groups | 0 |
| Translation-only groups | 0 |
| Crop / soft alpha / blur / non-uniform scale | 0 |
| Shared player palette | 48색 |

총 `256`개 player frame이며, 모든 frame에 `dagger_tip`, `parry_center`, `word_target`, `collarbone_resonance` 좌표가 있다. standing visible height는 방향별 `92–96px`이다.

## Creature readability

| 개체 | native 보정 후보 | 실제 visible size | 판정 |
|---|---:|---:|---|
| 압각 칼새 | 4 | 38px | PASS |
| 편향관 박쥐 | 6 | 56px | PASS |
| 되감비늘 도마뱀 | 6 | 60px | PASS |
| 광물실거미 | 7 | 69–80px | PASS |
| 반향각 산양 | 6 | 178px | PASS |

이전 motion pilot의 99개 frame은 `readability_verified` 아래 보존했고 덮어쓰지 않았다. 새 native 보정 후보는 29개다. 광물실거미 7개 승인 후보는 최종 검사에서 반투명 fringe가 검출되어, scale·자세·Ground Point를 바꾸지 않고 공용 32색·이진 alpha로 정리했으며 상단 1px crop을 제거했다.

## VFX

- player basic attack: 8방향 × 5 frame short metallic cut
- player parry: attempt / active / success / failure
- common collarbone resonance
- words: 멎는다 / 되돌린다 / 잇는다 / 밀어낸다 / 붙든다 / 흐르게 한다
- pressure swift: evade pressure cue only
- deflect bat: prep / projectile / impact
- rewind lizard: prep / lunge / contact
- mineral spider: approved spawn marker / prep / projectile / impact
- resonance goral: projectile / charge / approved phase-3 overlay

총 33 effect record이다. generic magenta projectile, 거대한 옥색 반원, 전신 마법진, 상시 halo는 최종 후보에 없다. 생물 공격·주인공 VFX 모두 실제 시각 anchor에서 시작하며 damage·range·speed·cooldown·timing 변경은 0이다.

## 960×540 playback

8개 필수 MP4는 모두 `960×540`, `24fps`, H.264 `yuv420p`로 정상 probe됐다. 실제 ACT 1 맵, native scale, nearest sampling, UI safe area를 사용했다. clean showcase는 `38.0초`이고 debug overlay가 없다.

- full-8 idle/move: 10.0초
- full-8 all actions: 14.0초
- player attack/parry VFX: 9.0초
- six word VFX: 12.0초
- creature readability: 10.0초
- creature attack identity: 15.0초
- clean showcase: 38.0초
- old64/new native before-after: 8.0초

실제 크기에서 머리·얼굴·청록 장식·단검·가방·망토·장화, 방향과 행동이 판독된다. 주인공 body cue가 VFX보다 먼저 읽히며 박쥐·도마뱀·거미·산양 공격 표현이 서로 구분된다.

## Corrected or rejected during production

- Gate 0에서 128px 내부 픽셀 군집·명도·실루엣을 조정한 뒤 통과
- W/NW 방향의 handedness·가방·망토 비대칭 교정
- 고정 격자 crop 후보를 폐기하고 connected-component 추출로 재구축
- 생성 atlas의 누락 행을 재생성
- 중복 수량용 extra parry 후보를 제외
- 칼날보다 큰 초기 VFX 후보를 폐기하고 짧은 dagger-tip cut으로 교체
- 광물실거미 7장의 soft alpha와 상단 crop 교정
- PPT 공유 media 관계를 독립 media로 교정

최종 패키지에 남은 실패 frame 또는 보정 대기 VFX는 없다.

## Review deck

- slide count: 15
- empty placeholder: 0
- overflow: 0
- template fidelity issue: 0
- 독립 LibreOffice render: PASS

최종 각 항목 판정은 모두 PASS이다: native resolution, concept detail, full-8의 7개 sequence, player combat VFX, six word VFX, creature readability, creature attack identity, full ACT 1 showcase handoff.
