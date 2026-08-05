# ASSET_INVENTORY_VISUAL_RECOVERY_v1

## 맵 산출물

| 맵 | background | collision | hazard | review overlay | 960×540 composite | 판정 |
|---|---:|---:|---:|---:|---:|---|
| ACT 1 일반 | 1 | 1 | 1 | 1 | 1 | v1.1 유지 |
| ACT 1 보스 | 1 | 1 | 1 | 1 | 1 | v1.1 유지 |
| ACT 2 일반 | 1 | 1 | 0 | 1 | 1 | v1.1 유지 |
| ACT 2 보스 | 1 | 1 | 0 | 1 | 1 | mound 하단 미세조정 |
| ACT 3 일반 | 1 | 1 | 0 | 1 | 1 | 중앙 고주파 대비 미세조정 |
| ACT 3 보스 | 1 | 1 | 0 | 1 | 1 | v1.1 유지 |

## 생성·유지 판정

- 승인된 정상 v1.1 background는 재디자인하지 않았다.
- ACT 1 일반·보스, ACT 2 일반, ACT 3 보스 background는 승인본 픽셀을 그대로 후보명으로 내보냈다.
- ACT 2 보스는 허용 범위인 mound 하단 높이·명도만 보정했다.
- ACT 3 일반은 허용 범위인 중앙 수면·자갈 대비만 보정했다.
- collision·hazard는 v1.1 열린 전투장과 맞도록 새 recovery candidate로 작성했다. 내부 combat core blocker는 0이다.
- overlay와 composite는 review 전용이며 runtime asset이 아니다.

## 광물실거미

| 상태 | 기존 runtime | crop 판정 | corrected candidate |
|---|---|---|---|
| idle_front | 존재 | FAIL | 존재 |
| move_side | 존재 | FAIL | 존재 |
| alert_front | 존재 | FAIL | 존재 |
| deploy_side | 존재 | FAIL | 존재 |
| attack_side | 존재 | FAIL | 존재 |
| stunned_front | 존재 | FAIL | 존재 |
| retreat_side | 존재 | FAIL | 존재 |

세부 파일 경로와 상태별 판정은 `MINERAL_SPIDER_7STATE_CORRECTION_REPORT.md`에 기록했다.

## 문서·검증·검토본

- README, inventory, map spec, manifest patch proposal, spider report, validation report, checksums, usage notice
- 검증 스크립트 1개와 기계 판독 결과 JSON
- 배경·overlay·합성 contact sheet 3장과 거미 before/after contact sheet 1장
- 검토용 프레젠테이션 1개
