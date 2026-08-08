# UNMAEK_SUBMISSION_FINAL_UI_WORD_POLISH_v1

## 적용 범위

《언맥》 제출판의 타이틀, 언령 선택·장착, 전투 HUD, ACT 진입, ACT 완료, 결과 화면을 하나의 UI 셸로 통일했다. 화면은 960×540 논리 해상도와 외곽 32px 안전영역을 기준으로 하며, 패널·버튼·카드는 React/CSS로 재현한다. `ui_review/` PNG는 구현 기준을 확인하기 위한 리뷰 이미지일 뿐 runtime 배경을 flatten한 에셋이 아니다.

핵심 언령은 `멎는다`, `되돌린다`, `잇는다`만 다룬다. `멎는다`는 기존 프레임의 낮은 대비만 보정했고, `잇는다`는 기존 프레임을 그대로 재사용했다. UI 아이콘처럼 판독되던 `되돌린다` 시퀀스만 동일한 팔레트·128×128 캔버스 안에서 교체했다. 현재 주인공 공명 cue는 이미 쇄골 주변에서 짧게 읽히므로 별도 프레임을 추가하지 않는다.

## 사용한 프로젝트 소스

- `플레이 영상 0808.mp4`: 지정 구간의 실제 설정·언령 선택, 일반전 HUD, Q/E/R·카드·공명, 보스 HUD, ACT 완료·보상·다음 지역 흐름
- `UNMAEK_FINAL_WORLD_STORY_v1.md`: 공식 채택 세계 규칙, 용언 제약, 주인공·누나, 지역 구성, 최종 주제와 금지선
- `UNMAEK_VISUAL_RECOVERY_HANDOFF_v1(1).pptx`: 05 UI 복구, 06 제출용 microcopy, FINAL HANDOFF SUMMARY
- Drive `UNMAEK_ACT1_VFX_FINAL_ART_PATCH_v1/word_core3/`: 기존 STOP 5, REWIND 5, LINK 6 프레임
- `hero_runtime_keyposes.png`, `주인공 컨셉 원본.png`: 주인공 실루엣과 공명 위치 확인용 보조 참고

`UNMAEK_RUNTIME_PACK_VISUAL_REVIEW_v1(4).pptx`는 필수 자료만으로 색감·맵·화면 재질이 확인되어 읽지 않았다.

## UI 구현 우선순위

1. `UI_SHELL_SPEC.json`의 색상, 4px spacing, 1px 기본 테두리와 2px 선택·focus 상태를 공통 token으로 만든다.
2. Panel, Button, Keycap, WordCard, EquipSlot, HUDSlot, ActOverlay를 재사용 component로 만든다.
3. 타이틀과 언령 선택을 먼저 적용해 960×540에서 글자 잘림과 keyboard focus를 확인한다.
4. 전투 HUD는 중앙 y=70–410을 비운 뒤 플레이어·보스·목표·Q/E/R·카드·공명만 현재 state에 연결한다.
5. ACT 진입과 완료는 같은 component를 쓰고 ACT 번호·지역명·본문만 교체한다.
6. 결과 화면은 현재 result state가 실제로 제공하는 통계와 행동만 렌더한다. 리뷰 이미지의 값은 배치 확인용이다.

## VFX anchor·loop·cleanup

| effectId | anchor | loop | cleanup |
|---|---|---|---|
| `player_word_collarbone_resonance` | 기존 쇄골 중앙 cue 유지 | 없음 | 현재 runtime 종료 규칙 유지 |
| `word_stop` | 128×128의 (64,64), 대상 중심 | 없음 | 기존 `word_stop` 종료·취소 시 즉시 제거 |
| `word_rewind` | 128×128의 (96,64), 현재 상태 수렴점 | 없음 | 기존 `word_rewind` 완료·취소 시 잔상 전부 제거 |
| `word_connect` | 192×64의 (8,32), 시작 node | F02–F04 active loop | 연결 해제·대상 소멸·기존 event 종료 시 node와 segment 동시 제거 |

`word_connect`는 endpoint cap을 고정하고 manifest의 `repeatSlice`만 회전·반복한다. Y축 비균일 확대와 전체 프레임 stretch는 금지한다. 모든 frame duration은 시각 후보값이며 gameplay timing, hit timing, range, damage, cooldown을 바꾸지 않는다.

## 변경 금지 항목

- 현재 버튼 기능, 통계 산출, 선택 행동, event ID, 공격 수치, physics, collider, AI
- 나머지 언령 3종, player slash·parry, bat sonic·spider web·goral stone
- 설정 화면, 보상 카드 구조, 도감·인벤토리·일시정지 메뉴
- 일반 마법진·룬·마나 구체·강한 네온 glow·순백색 중심 VFX·월드 공간 언령 글자
- `잔향의 방`, `기록고`, `기록 포식자`, `유산의 방` 및 생물을 정화·복원 대상으로 단정하는 문구

최종 시각 판정은 `NEEDS_USER_REVIEW`이며, 승인 뒤 Codex가 동일 token·좌표·문구를 현재 코드에 연결한다.
