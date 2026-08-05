# MOTION_SEQUENCE_MATRIX_PILOT_v1

| id | 대상 | 실제 sequence | frame | 재판정 | 기존 gameplay binding |
|---|---|---|---:|---|---|
| `player` | 주인공 | — | 0 | **SOURCE_BLOCKED** | runtime/key-pose 개별 원본 없음 |
| `pressure_swift` | 압각 칼새 | fly 6 / evade 4 | 10 | **INBETWEEN_CREATED** | background-cue; attack/hit 추가 0 |
| `deflect_bat` | 편향관 박쥐 | idle 4 / move 6 / prep 3 / attack 4 / hit-recover 3 | 20 | **INBETWEEN + UNIQUE CANDIDATE** | prep·attack·hit alias slot 보강 |
| `rewind_lizard` | 되감비늘 도마뱀 | idle 4 / move 6 / prep 3 / attack 4 / hit-recover 3 | 20 | **INBETWEEN + UNIQUE CANDIDATE** | prep·attack·hit alias slot 보강 |
| `mineral_spider` | 광물실거미 | idle 4 / move 6 / I→A 3 / A→D 3 / D→A 4 / A→R 3 / stunned-retreat 3 | 26 | **INBETWEEN_CREATED** | corrected 7상태 사이 연결 |
| `resonance_goral` | 반향각 산양 | idle 4 / warning 3 / prep 3 / charge 5 / hit-recover 4 / retreat 4 | 23 | **INBETWEEN_CREATED** | 3 phase·공격 종류 유지 |

## Timing 원칙

- MP4의 frame duration은 검토 재생용이며 gameplay 수치가 아니다.
- 실제 엔진 duration은 `USE_EXISTING_ENGINE_DURATION`.
- 접촉 포즈는 `MAP_TO_EXISTING_HIT_TIMESTAMP`; 숫자 timestamp를 새로 만들지 않았다.
- 신규 state machine·공격·AI·semantic state는 0개다.
