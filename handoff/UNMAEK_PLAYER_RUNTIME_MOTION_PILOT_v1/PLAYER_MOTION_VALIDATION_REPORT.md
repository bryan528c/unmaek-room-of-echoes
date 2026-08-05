# PLAYER MOTION VALIDATION REPORT

## 판정

**PASS** — 8방향 standing lock과 S/E 파일럿 전 sequence가 요구 범위에서 통과했다. 기존 collision, Hurtbox, 공격 timing, state machine, AI, 언령 기능은 변경하지 않았다.

## 산출물 검사

- canonical frame: 64×64 RGBA 8-bit, 투명 모서리, 이진 alpha
- frame PNG: 76장 = 방향 lock 8장 + S 34장 + E 34장
- sprite-sheet candidate: 15장
- MP4: 5개, H.264 30fps; 손상 0
- shared palette: 30색; sequence 간 palette drift 0
- 완전 중복 frame: 0
- translation-only 인접 frame: 0
- frame crop: 0
- blur/soft anti-aliasing: 0
- 비균일 scale: 0
- idle/move loop Ground Point delta: 0px
- per-frame anchor: 76/76, 64×64 좌표 범위 안; gameplay 판정 변경 0

## 수동 시각 게이트

- 8방향 모두 같은 소년·머리 크기·신체 비율로 판독됨
- 오른손 단검, 왼쪽 뒤 가방, 비대칭 망토 유지
- S와 E는 회전·flip 복제가 아니라 서로 다른 자세와 실루엣
- idle의 발 고정·미세 호흡과 move의 발 디딤이 분리됨
- move, dash, basic attack, parry의 무게 중심과 진행 방향이 서로 구분됨
- word skill은 몸의 대상 지정이 공명보다 먼저 보이며 상시 발광 없음
- hit/recover에서 단검·가방·망토가 유지되고 과장된 비행 없음
- 1× logical에서 방향·발 디딤·공격/패링/지정 동작 판독 PASS
- 960×540, 2× nearest, standing body 약 92px에서 방향·단검·행동 판독 PASS
- 현재 live single-PNG 이동 대비 발 디딤, 몸 회전, 장비 후행 개선이 즉시 판독됨

## 수정 이력

- diagonal direction 1차 후보에서 중복 방향과 단검 실루엣 오류를 발견해 8방향 lock 전에 재제작
- S hit/recover 1차 후보에서 단검 소실을 발견해 해당 3 frame 재제작
- raised-blade·공명 frame의 `dagger_tip` 자동 검출 오차를 시각 검수 후 수동 보정
- 배경 key에서 남은 짙은 자홍색 외곽 1색을 공용 shadow brown으로 정리하고 sheet·MP4 재출력

## 확대 판정

동일한 64×64 canvas, Ground Point, 팔레트, 장비 비대칭, anchor 기록 방식을 유지하면 나머지 N/NE/SE/SW/W/NW 6방향으로 확대 가능하다. 확대 전 개발 staging에서 S/E 타이밍과 VFX attachment를 한 차례 확인한다.
