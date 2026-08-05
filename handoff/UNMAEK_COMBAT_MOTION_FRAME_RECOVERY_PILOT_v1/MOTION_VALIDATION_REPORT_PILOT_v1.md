# MOTION_VALIDATION_REPORT_PILOT_v1

자동·수동 검증: **PASS 881 / FAIL 0**

## 최종 판정

- ACT 1 생물 frame pilot: **PASS**
- 전체 작업: **CONDITIONAL PASS** — 주인공은 실제 source 부재로 `SOURCE_BLOCKED`; proxy 없이 중단.
- ACT 2·3 확대: 본 파일럿 승인과 엔진 staging 검증 후에만 가능.

## 핵심 수치

| 대상 | frame | 중복 | alpha | Ground Point | palette drift | 1× 판독 |
|---|---:|---:|---|---|---:|---|
| `pressure_swift` | 10 | 0 | 0/255 only | delta 0px | 0 | PASS |
| `deflect_bat` | 20 | 0 | 0/255 only | delta 0px | 0 | PASS |
| `rewind_lizard` | 20 | 0 | 0/255 only | delta 0px | 0 | PASS |
| `mineral_spider` | 26 | 0 | 0/255 only | delta 0px | 0 | PASS |
| `resonance_goral` | 23 | 0 | 0/255 only | delta 0px | 0 | PASS |

## 프레임 차이

- 완전 중복 PNG 0.
- translation-invariant crop 중복 0; 단순 x/y 이동만인 인접 프레임 0.
- 모든 인접 프레임의 실루엣 XOR/union 비율이 0.01 이상.
- hold frame 0; MP4는 같은 원본 프레임을 새 번호로 복제하지 않는다.

## Loop·접지

- 모든 frame alpha bottom은 canonical Ground Point y와 일치.
- idle/move loop의 시작·끝 Ground Point delta 0px.
- 도마뱀 idle은 자연스러운 폐합을 위해 staging에서 `1-2-3-4-3-2` ping-pong 순서를 권장한다. 새 PNG 복제는 없다.
- 1× boss MP4는 H.264 짝수 규격 때문에 하단에 1px 중성 padding(220×176)을 사용하며 sprite content는 220×175 native 그대로다.

## 작은 생물 판독

- 압각 칼새: 날개 상/중/하와 머리 방향 PASS.
- 편향관 박쥐: 날개·귀/머리 조준·공격 방향 PASS.
- 되감비늘 도마뱀: 낮은 prep·좌향 lunge PASS.
- gameplay 합성에는 원본 frame을 확대하지 않고 native 1×로 배치하고, 어두운 맵 가독성을 위한 1px review outline만 별도 presentation layer로 사용했다.

## Anchor·timing

- canonical gameplay anchor와 Hurtbox는 변경하지 않았다.
- per-frame visual offset은 VFX 연결 후보이며 공식 anchor 변경값이 아니다.
- preview frame duration은 검토용. 기존 engine duration과 hit timestamp 숫자는 노출되지 않아 새 값을 만들지 않았다.
- 960×540 영상의 `HIT @ EXISTING TIMESTAMP` 프레임은 기존 timestamp에 매핑할 접촉 포즈 후보다.
- 광물실거미는 승인 `mineral_spider_thread_spawn_marker.png`, 반향각 산양은 승인 `resonance_goral_phase3_overlay.png`를 실제 합성 재생에 사용했다.

## 남은 차단

- 주인공 runtime/state PNG·개별 과거 key pose·dagger-tip anchor source.
- 실제 엔진 staging에서 alias 해제 여부, original/flipX, Hurtbox debug, VFX origin 1px 이내, 실제 hit timestamp 동기화 검증.
