# Codex 즉시 통합 프롬프트 — 《언맥》 제출판 런타임 에셋

현재 저장소에 `UNMAEK_SUBMISSION_RUNTIME_PACK_v1` 패키지를 통합하라. 이 프롬프트는 디자인 탐색이 아니라 잠긴 제출판 에셋을 기존 게임 코드에 연결하는 작업이다.

## 절대 규칙

- 신규 AI, 신규 상태머신, 신규 공격 패턴, 신규 언령·카드·공명, 신규 생물·보스를 만들지 않는다.
- 기존 판정, 이동 속도, 공격 타이밍, 쿨다운, 승리/비살상 종료 조건을 유지한다.
- 패키지의 `aiArchetypeRole`은 역할 키일 뿐 실제 저장소 클래스명이 아니다. 저장소를 `rg`로 읽고 실제 식별자에 매핑한다.
- 에셋이 없는 상태는 manifest의 `stateAliases`를 그대로 사용한다. 없는 그림을 새로 생성하지 않는다.
- 한 ACT에서 테스트가 실패하면 원인을 해결하기 전 다음 ACT로 넘어가지 않는다.
- 기존 사용자 변경을 폐기하거나 강제로 되돌리지 않는다.

## 1. 먼저 읽을 파일

다음 패키지 파일을 전부 먼저 읽어라.

- `UNMAEK_SUBMISSION_RUNTIME_PACK_v1/README_IMPLEMENTATION.md`
- `UNMAEK_SUBMISSION_RUNTIME_PACK_v1/manifest/creature_manifest_v1.json`
- `UNMAEK_SUBMISSION_RUNTIME_PACK_v1/manifest/map_manifest_v1.json`
- `UNMAEK_SUBMISSION_RUNTIME_PACK_v1/manifest/display_strings_v1.json`
- `UNMAEK_SUBMISSION_RUNTIME_PACK_v1/reports/ASSET_VALIDATION_REPORT.md`
- `UNMAEK_SUBMISSION_RUNTIME_PACK_v1/reports/MISSING_ASSET_REPORT.md`
- `UNMAEK_SUBMISSION_RUNTIME_PACK_v1/reports/STATE_REUSE_REPORT.md`
- 각 `creatures/act*/<creature>/metadata.json`

manifest가 참조하는 `creatures/`, `maps/`, `vfx/` 파일 경로도 실제 존재 여부를 확인하라.

## 2. 변경 전 기준선

1. `git status --short --branch`로 현재 브랜치와 기존 변경을 기록한다.
2. 저장소 문서(`AGENTS.md`, MASTER_SPEC/UI_SPEC/DECISIONS/TASKS/HANDOFF/TECH_PROOF 등 실제 존재 파일)를 읽는다.
3. 현재 적·보스·맵 로더, 에셋 등록, collision, spawn, anchor, Telegraph 경로를 `rg`로 찾는다.
4. 저장소의 기존 테스트와 빌드 명령을 확인해 변경 전 실행한다. 실패가 이미 있으면 이번 변경과 구분해 기록한다.
5. 현재 앱을 실행해 브라우저에서 기존 전투가 로드되는지 확인하고 기준 화면을 남긴다.

## 3. 역할 키 매핑

저장소의 실제 클래스·컴포넌트·프리팹·씬을 찾아 다음 역할에만 연결한다.

- `background-cue`
- `chaser-melee`
- `projectile`
- `area-control`
- `defense-melee`
- `boss-3phase`

이 매핑을 먼저 짧은 표로 보고한 뒤 구현하되, 새 역할 계층을 만들지 않는다.

## 4. 통합 순서

### ACT 1

1. ACT 1 생물 5종 runtime PNG·metadata를 기존 역할에 연결한다.
2. 산양은 `warning/combat/retreat`와 `bossPhaseMap`을 사용하고 phase3는 지정 overlay만 더한다.
3. `act1_general`, `act1_boss` 배경·collision·hazard·spawn을 `map_manifest_v1.json`에서 읽는다.
4. Ground Point, Hurtbox, attack anchor, flipX 좌표를 manifest 그대로 사용한다. 산양 Hurtbox에는 뿔을 포함하지 않는다.
5. 테스트·빌드·브라우저 실제 플레이를 확인한다. 실패하면 중단하고 수정한다.

### ACT 2

ACT 1 통과 후 사향고양이·개구리·천산갑과 ACT 2 두 맵을 같은 방식으로 연결한다. 개구리는 `projectile`, 천산갑은 기존 `boss-3phase`만 사용한다. 반사 AI나 새 굴 AI를 만들지 않는다. 다시 테스트·빌드·브라우저 플레이를 확인한다.

### ACT 3

ACT 2 통과 후 게·메기·수달어미와 ACT 3 두 맵을 연결한다. 게는 `defense-melee`, 수달어미는 기존 원·직선 Telegraph와 기존 spawn-point 배열만 사용한다. 곡선 수류 AI나 새 잠수 경로 시스템을 만들지 않는다. 다시 테스트·빌드·브라우저 플레이를 확인한다.

## 5. placeholder 교체와 rollback

- 먼저 새 에셋 경로를 등록하고 참조를 전환한 뒤 기존 placeholder 참조가 남았는지 `rg`로 확인한다.
- 각 ACT를 독립적인 되돌리기 가능한 변경 단위로 유지한다. Git 추적 밖 삭제나 사용자 변경 덮어쓰기를 하지 않는다.
- 새 에셋이 정상 로드되고 해당 ACT 검증이 통과한 뒤에만 사용되지 않는 placeholder 참조를 제거한다.
- collision·spawn·anchor는 임의 좌표가 아니라 manifest 값을 읽는다.

## 6. 최종 검증과 보고

1. 저장소의 전체 테스트와 빌드를 실행한다.
2. 실제 브라우저에서 ACT 1 → ACT 2 → ACT 3 순서로 맵 로드, 적 표시, 보스 단계, flipX, collision, spawn, Hurtbox/attack anchor, alias tint/shake/VFX를 확인한다.
3. 직접 확인할 수 없었던 항목은 추측하지 말고 이유와 수동 확인 절차를 적는다.
4. 최종 보고에는 다음만 명확히 포함한다.
   - 실제 역할 키 → 저장소 클래스/컴포넌트 매핑
   - 변경한 파일 목록
   - ACT별 통합 결과
   - 실행한 테스트·빌드·브라우저 확인과 결과
   - 남은 실패/경고와 재현 절차
   - 실행 명령
   - rollback 기준

패키지 밖의 신규 디자인이나 장기 본편 범위는 제안·구현하지 말라.
