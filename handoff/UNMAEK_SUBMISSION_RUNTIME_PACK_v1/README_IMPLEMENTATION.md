# UNMAEK SUBMISSION RUNTIME PACK v1

## 목적

DESIGN-SUBMIT-01E에서 잠근 《언맥》 제출판 디자인을 현재 게임 저장소에 바로 연결하기 위한 런타임 에셋·맵·메타데이터 패키지다.

## 잠금 범위

- 생물 11종, 보스 3종, ACT 3개, 맵 6장.
- 필수 상태 슬롯 58개 = 고유 PNG 41개 + state alias 17개.
- 신규 생물·보스·언령·카드·AI·상태머신·공격 패턴은 포함하지 않는다.

## 사용 규칙

- `manifest/creature_manifest_v1.json`: 캔버스, Ground Point, Hurtbox, attack anchor, 상태/alias, 보스 단계.
- `manifest/map_manifest_v1.json`: 1280×720 배경, collision/hazard mask, spawn, territory.
- `manifest/display_strings_v1.json`: 사용자 표시용 ACT·맵·생물·보스 단계 문자열.
- alias는 별도 PNG를 복제하지 않고 `sourceState`를 가리킨다. 구현에서 명시된 flip/scale/rotation/tint/shake/VFX만 적용한다.
- `directionMode`: `flipX` 7종, `front-side` 3종, `fixed` 1종. 존재하지 않는 back/8방향 원본은 주장하지 않는다.
- collision mask는 흰색=walkable, 검은색=blocked인 2색 PNG다. hazard mask는 흰색=hazard, 검은색=safe이며 ACT 1 두 맵에만 있다.
- 생물 그림자는 런타임 PNG에 굽지 않았고 `shadowAnchor`에서 절차 생성한다.

## Codex 통합 순서

`ACT 1 → ACT 2 → ACT 3`. 각 ACT의 테스트·빌드·브라우저 플레이 확인을 통과한 뒤 다음 ACT로 넘어간다. 자세한 지시는 `CODEX_SUBMISSION_ASSET_INTEGRATION_PROMPT.md`를 그대로 사용한다.

## 변경 금지

판정·이동 속도·공격 타이밍·기존 3단계 보스 흐름을 바꾸거나 실제 저장소 클래스명을 추측하지 않는다.

## 알려진 NON-BLOCKING 누락

추가 고유 피격/전환 프레임, 완성 8방향 애니메이션, 환경 입자, 별도 그림자 PNG는 제출 이후 교체 대상으로 남긴다.
