# Migration from 64px Pilot

## 대체 원칙

기존 `64×64` player pilot는 sequence 순서, 동작 의도, Ground Point 안정 방식, 오른손 단검, 왼쪽 뒤 가방, 비대칭 망토, anchor 이름과 gameplay event 연결 참고로만 유지한다. 기존 PNG를 확대·보간·덧칠해 새 runtime frame으로 사용하지 않는다.

| 항목 | 이전 pilot | 새 runtime 후보 |
|---|---|---|
| canonical canvas | 64×64 | 128×128 |
| runtime 표시 | 확대 필요 | 1.0× native |
| Ground Point | pilot reference `(32,57)` | 고정 `(64,112)` |
| 방향·동작 | pilot 구조 참고 | 8방향 7 sequence 모두 고유 PNG |
| frame source | 과거 pilot | 콘셉트·키포즈 기준 native 재제작 |
| VFX | 범용 원호·원형 중심 | 신체 anchor·언령·생태별 고유 sequence |

Ground Point와 anchor를 단순 2배 계산하지 않는다. 새 좌표는 `PLAYER_FULL8_ANCHORS.json`과 `(64,112)`를 그대로 사용한다.

## 교체 절차

1. 기존 64px player texture·sheet를 runtime binding에서 분리하되 보존한다.
2. `PLAYER_FULL8_MOTION_MANIFEST.json`의 256개 frame을 새 animation slot에 연결한다.
3. 방향 fallback을 제거하고 N/NE/E/SE/S/SW/W/NW의 실제 frame을 사용한다.
4. runtime transform scale을 `1.0×`로 고정하고 nearest sampling을 유지한다.
5. sprite root를 Ground Point `(64,112)`에 맞춘다. Hurtbox·collision root는 기존 gameplay 의미를 유지한다.
6. frame별 시각 anchor를 VFX attachment에만 연결한다.
7. player attack·parry·word 및 creature VFX를 기존 event에 연결한다. `BINDING_REQUIRED` 항목에 새 event를 만들지 않는다.
8. 승인 ACT 1 일반맵·보스맵, UI safe area와 telegraph 규칙은 그대로 둔다.

## 유지해야 하는 gameplay 값

- 이동 속도, dash 거리·판정
- 기본 공격 damage·range·hit timing
- 360도 parry 판정
- 언령 효과·조건
- Hurtbox·collision 의미
- 적 AI·공격 범위·속도·damage·cooldown
- 보스 3단계, map·hazard·spawn, 카드·공명·queue·time control

이 패키지의 gameplay 추가·변경 건수는 `0`이다.

## Staging acceptance

`previews/gameplay_960x540/act1_showcase_clean_30to60s.mp4`와 `VALIDATION_REPORT.md`를 확인하고, 정확한 기존 엔진 event ID를 매핑한 뒤 staging한다. 이벤트 연결 전에도 PNG·anchor·VFX 자산 자체는 PASS이며, 연결되지 않은 effect는 표시하지 않는다.
