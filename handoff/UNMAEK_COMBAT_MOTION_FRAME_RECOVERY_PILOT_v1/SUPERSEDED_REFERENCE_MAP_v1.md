# SUPERSEDED_REFERENCE_MAP_v1

| 기존 v1 자료 | 상태 | 처리 |
|---|---|---|
| `ATTACK_ANCHOR_FLIP_REVIEW_v1.md` | **RETAIN_REFERENCE** | canvas·Ground Point·Hurtbox·canonical anchor·flip 수식을 재검증해 유지 |
| `COMBAT_MOTION_PRESENTATION_SPEC_v1.json` | **REVIEW_ONLY + SUPERSEDED** | AI·공격 종류·정규화 타이밍 원칙은 참조; 정적 tween 충분 결론은 폐기 |
| `FRAME_GAP_REPORT_v1.md` | **SUPERSEDED** | FRAME_REQUIRED 0과 9종 PROCEDURAL_OK 결론 폐기 |
| `README_COMBAT_MOTION_HANDOFF_v1.md` | **REVIEW_ONLY** | 이전 패키지 설명 기록; runtime 구현 근거로 사용 금지 |
| `STATE_USAGE_MATRIX_v1.md` | **RETAIN_REFERENCE + SUPERSEDED** | 실제 state/alias 인벤토리는 유지; PROCEDURAL_OK 판정은 폐기 |
| `UNMAEK_COMBAT_MOTION_PRESENTATION_HANDOFF_v1.pptx` | **REVIEW_ONLY** | 기존 실패 원인·인벤토리 확인용; PPT 수정만으로 완료 보고 금지 |
| `previews/composites/act1_boss_combat_motion_composite_960x540.png` | **DO_NOT_USE_RUNTIME** | 정적 합성 검토 이미지; 실제 재생 증거로 사용 금지 |
| `previews/composites/act1_general_combat_motion_composite_960x540.png` | **DO_NOT_USE_RUNTIME** | 정적 합성 검토 이미지; 실제 재생 증거로 사용 금지 |
| `previews/composites/act2_boss_combat_motion_composite_960x540.png` | **DO_NOT_USE_RUNTIME** | 정적 합성 검토 이미지; 실제 재생 증거로 사용 금지 |
| `previews/composites/act2_general_combat_motion_composite_960x540.png` | **DO_NOT_USE_RUNTIME** | 정적 합성 검토 이미지; 실제 재생 증거로 사용 금지 |
| `previews/composites/act3_boss_combat_motion_composite_960x540.png` | **DO_NOT_USE_RUNTIME** | 정적 합성 검토 이미지; 실제 재생 증거로 사용 금지 |
| `previews/composites/act3_general_combat_motion_composite_960x540.png` | **DO_NOT_USE_RUNTIME** | 정적 합성 검토 이미지; 실제 재생 증거로 사용 금지 |
| `previews/motion/channel_otter_mother_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/deflect_bat_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/diffraction_pangolin_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/flowjaw_crab_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/mineral_spider_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/player_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/pleated_frog_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/pressure_swift_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/pulsebarbel_catfish_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/resonance_civet_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/resonance_goral_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |
| `previews/motion/rewind_lizard_motion_reference_strip.png` | **DO_NOT_USE_RUNTIME** | 정적 PNG 재배치 strip; frame·sprite sheet·animated proof로 사용 금지 |

## 폐기한 핵심 판정

- 대부분의 생물이 `PROCEDURAL_OK`라는 결론
- 전체 `FRAME_REQUIRED 0`이라는 결론
- 주인공 review proxy를 실제 모션 근거로 본 판단
- 정적 motion strip만으로 구현 전달 가능하다는 판단

## 보존한 잠금

ACT 구성, 생물 정체성, AI 역할, 공격 종류·판정·범위, 기존 hit timestamp·쿨다운, 보스 3단계, Ground Point·Hurtbox·canonical attack anchor, 언령·카드·공명, 맵·collision·hazard·spawn은 변경하지 않았다.
