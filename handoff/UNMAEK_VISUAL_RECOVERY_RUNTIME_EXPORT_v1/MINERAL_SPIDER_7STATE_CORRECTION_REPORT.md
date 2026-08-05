# MINERAL_SPIDER_7STATE_CORRECTION_REPORT

## 결론

기존 runtime 7상태와 대응 master 7상태 모두 다리 근위부·원위부가 잘린 상태였다. 정상 상태를 복제하지 않는 원칙에 따라 전수 검사 후 **crop 실패한 7상태만** corrected candidate로 출력했다.

교정은 새 생물·새 상태·새 포즈 생성이 아니다. 각 결과에서 기존 runtime의 불투명 몸통 픽셀을 최상단에 그대로 보존하고, 캔버스 밖으로 사라진 다리 연결부와 8개 다리 실루엣만 복구했다.

## 상태별 판정

| 상태 | before crop | 8다리 실루엣 | 방향 | spinneret crop | canvas / GP | corrected 파일 | 최종 |
|---|---|---|---|---|---|---|---|
| idle_front | FAIL | 보존 | front | 없음 | 104×88 / (52,72) | `act1_mineral_spider_idle_front_corrected_candidate_104x88.png` | PASS |
| move_side | FAIL | 보존 | side | 없음 | 104×88 / (52,72) | `act1_mineral_spider_move_side_corrected_candidate_104x88.png` | PASS |
| alert_front | FAIL | 보존 | front | 없음 | 104×88 / (52,72) | `act1_mineral_spider_alert_front_corrected_candidate_104x88.png` | PASS |
| deploy_side | FAIL | 보존 | side | 없음 | 104×88 / (52,72) | `act1_mineral_spider_deploy_side_corrected_candidate_104x88.png` | PASS |
| attack_side | FAIL | 보존 | side | 없음 | 104×88 / (52,72) | `act1_mineral_spider_attack_side_corrected_candidate_104x88.png` | PASS |
| stunned_front | FAIL | 보존 | front | 없음 | 104×88 / (52,72) | `act1_mineral_spider_stunned_front_corrected_candidate_104x88.png` | PASS |
| retreat_side | FAIL | 보존 | side | 없음 | 104×88 / (52,72) | `act1_mineral_spider_retreat_side_corrected_candidate_104x88.png` | PASS |

모든 corrected 파일은 `creatures/act1/mineral_spider/runtime_corrected/`에 있다.

## 파일 규격 검수

- 크기: 104×88 고정
- 색상: RGBA 8-bit
- 투명 모서리: 4개 모서리 alpha 0
- Ground Point: alpha 실루엣 하단이 y=72를 넘지 않음
- body / palette / pose: 기존 runtime 불투명 픽셀 최상단 보존
- 확대 검수: nearest-neighbor 4× contact sheet 사용

검토 시트: `creatures/act1/mineral_spider/mineral_spider_7state_before_after_contact_sheet.png`

## 직접 확인 범위

정적 PNG의 crop·방향·캔버스·Ground Point·투명도는 확인했다. 실제 게임 상태 전환 중 프레임 간 떨림, anchor 연결, 공격 VFX와의 접점은 저장소에 반입하지 않았으므로 실기 확인 대상이다.
