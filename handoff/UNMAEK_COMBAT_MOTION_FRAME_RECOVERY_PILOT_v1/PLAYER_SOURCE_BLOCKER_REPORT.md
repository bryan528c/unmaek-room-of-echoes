# PLAYER_SOURCE_BLOCKER_REPORT

## 판정

`SOURCE_BLOCKED` — 현재 게임이 참조하는 주인공 방향별 runtime state 원본과 개별 과거 key-pose 원본 파일을 찾지 못했다. 지시에 따라 proxy 제작과 프레임 추출을 중단했다.

## 실제 발견 파일

| 파일 | 등급 | 확인 내용 | runtime 사용 |
|---|---|---|---|
| `project_sources/07-hero_runtime_keyposes.png` | DESIGN_SOURCE | 26개 포즈를 한 장에 배치한 Gate 1–3 검토 보드. 이미지 자체에 “최종 애니메이션 아님” 표기 | 금지 |
| `project_sources/08-png` | DESIGN_SOURCE | 주인공 외형·장비·실루엣 가이드 | 금지 |
| `deliverables/UNMAEK_COMBAT_MOTION_PRESENTATION_HANDOFF_v1/previews/motion/player_motion_reference_strip.png` | REVIEW_ONLY | 기존 review proxy를 7칸에 재배치한 strip | 금지 |
| `work_combat_motion/assets/player_proxy_*.png` | REVIEW_ONLY | 위 검토 자료에서 파생된 이전 작업용 crop | 금지 |
| ACT 1–3 플레이 영상 속 주인공 | REVIEW_ONLY | 화면 관찰 근거일 뿐 투명 원본 state가 아님 | 금지 |

## 찾지 못한 필수 파일

- idle / N·NE·E·SE·S·SW·W·NW
- move / N·NE·E·SE·S·SW·W·NW
- dash
- basic attack
- parry prep / success / fail
- hit / recover
- word skill
- card·resonance reaction
- combat end 또는 defeat
- 방향별 canvas·Ground Point·dagger hand·dagger-tip attack anchor를 연결하는 실제 manifest/state map
- 26개 key pose의 개별 투명 원본 PNG 또는 편집 원본

## 중단한 작업

- PPT·스크린샷·motion strip에서 주인공을 잘라 runtime 후보로 만드는 작업
- S/E idle·move·dash·attack·parry·word·hit 프레임 제작
- 8방향 mirror 및 단검 손 일관성 판정
- `player_motion_pilot_preview.mp4`와 `player_move_attack_pilot_960x540.mp4` 제작

## 재개 조건

게임이 실제로 import하는 주인공 state 파일 경로와 개별 PNG를 제공하고, 과거 26개 key pose의 개별 원본 또는 편집 원본을 함께 연결해야 한다. 두 집합을 확보하기 전에는 주인공 파일럿을 PASS로 확장하지 않는다.
