# ASSET VALIDATION REPORT

검증 일시: 2026-08-04 (Asia/Seoul)  
패키지: `UNMAEK_SUBMISSION_RUNTIME_PACK_v1`

| 검사 항목 | 결과 | 근거 |
|---|---|---|
| creature manifest 엔트리 11개 | PASS | 자동 검증 11 |
| boss subset 3개 | PASS | `role=boss` 3 |
| map manifest 엔트리 6개 | PASS | 자동 검증 6 |
| 필수 상태 슬롯 58개 해결 | PASS | unique 41 + alias 17 |
| 상태별 파일 또는 1-hop alias 존재 | PASS | alias chain/cycle 없음 |
| JSON 문법 | PASS | manifest 3종 parse 성공 |
| manifest 참조 파일 | PASS | 상대경로 전수 존재 |
| 모든 런타임 생물 PNG alpha | PASS | RGBA + 투명 모서리 전수 확인 |
| 종이 배경·라벨·보드 테두리·바닥 얼룩 | PASS | master/runtime 분리 후 contact sheet 수동 확인 |
| 같은 생물 상태 공통 캔버스 | PASS | 11종 전수 exact size |
| Ground Point 범위 | PASS | 정규화 0–1 |
| Hurtbox 캔버스 범위 | PASS | 10종 전수, 칼새 null 허용 |
| flipX 좌표 계산 | PASS | `1-x`, `W-x-width` 전수 확인 |
| 맵 배경 1280×720 | PASS | 6장 exact size |
| Collision mask 2색 | PASS | 0/255 only, antialias 없음 |
| Hazard mask 2색 | PASS | ACT 1 두 맵 0/255 only |
| Spawn이 bounds·walkable·safe 안 | PASS | 모든 player/enemy/boss 좌표 픽셀 검사 |
| 보스 phaseMap | PASS | 3보스 모두 존재·해결 상태 참조 |
| 표시 문자열에 내부 아키타입명 없음 | PASS | 금지 문자열 검색 0건 |
| 산양 4상태 외곽선 차 | PASS | 접힘/부분전개/최대전개/후퇴 4 unique |
| 천산갑 방어 돔·완전 몸말기 | PASS | 01F 최소 보정 4 unique, 비늘 수 추가 없음 |
| 수달어미 유연 수류막·새끼 판독 | PASS | 01F 최소 보정 4 unique, 칼날형 등판 제거 |
| 보스 3종 흑백 실루엣 구분 | PASS | 수직 쐐기/방어 돔/수평 S자 contact sheet 확인 |
| 지도·생물 가장자리 matte/이웃 상태 누출 | PASS | 01F 보정 후 6맵·41 master/runtime 접촉판 재검수 |
| 숨김·임시·중복 바이너리 | PASS | 숨김 0, 임시 0, SHA-256 중복 그룹 0 |
| 완성 8방향·추가 전환/피격 프레임 | WARN | 제출 이후 NON-BLOCKING |

## 최종 판정

**PASS — FAIL 0건, WARN 1개(NON-BLOCKING).**  
이 패키지는 Blocking 누락 없이 Codex 통합 단계로 넘길 수 있다.
