# MISSING ASSET REPORT

## BLOCKING

- 없음. 11종 기본 상태, 6개 배경, 6개 collision mask, Ground Point, 보스 phaseMap, 58개 상태 슬롯이 모두 파일 또는 alias로 해결됐다.

## NON-BLOCKING

- 일반 생물의 추가 고유 피격·후퇴 프레임. 현재 hit 일부는 tint/shake alias다.
- 천산갑 warning/phase1/retreat, 수달어미 phase2/attack_or_surface/retreat의 전용 중간 포즈.
- 전체 8방향 애니메이션과 대각선 전환 프레임.
- 환경 입자(포자·낙엽·포말·갈대)와 보스 전환 보간 프레임.
- 별도 그림자 PNG. 현재는 metadata의 Ground Point에서 절차 생성한다.

위 항목은 제출판 구현을 막지 않으며 신규 AI·상태머신을 요구하지 않는다.
