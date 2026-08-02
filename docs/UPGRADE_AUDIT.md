# UPGRADE-04 카드 감사

정의의 `baseValues`가 설명 생성과 실제 전투 계산의 단일 수치 원본이다. `active=false` 카드는 과거 결과·저장 ID 호환을 위해 정의만 보존하며 선택 풀과 런타임 효과에서 제외한다.

## 활성 카드 18장

| ID | 이름 | 분류 / 태그 | 희귀도 | 최대 | 방식 | 실제 발동 코드 | 핵심 수치·조건 | 통계 |
|---|---|---|---|---:|---|---|---|---|
| dual-moon-echo | 쌍월의 잔향 | 잔향 / weapon, orbit | 희귀 | 1 | 고유 | GameScene 잔향 발동 | 칼날 2개, 합산 136% | 발동·피해 |
| wide-orbit | 넓은 궤도 | 잔향 / weapon, orbit | 일반 | 2 | 가산 | WeaponCombatSystem | 스택당 반경 +22%, 간격 +12% | 발동·피해 |
| cut-sentence | 절단 문장 | 절단 / cut, stop, link | 희귀 | 2 | 가산 | GameScene 절단 판정 | 상태 절단 파열 +9/스택 | 발동·피해 |
| backflow-blade | 역류 칼날 | 잔향 / projectile, stop | 전설 | 1 | 고유 | GameScene 잔향-탄환 판정 | 정지 탄환 피해 65% 역류 | 반사 수·피해 |
| returning-scar | 회귀의 칼자국 | 언령 / rewind, cut | 희귀 | 2 | 가산 | GameScene E 잔상 | 42% 검격 1~2회 | 발동·피해·생성 |
| isolation-chain | 고립의 사슬 | 언령 / link, isolation | 희귀 | 2 | 가산 | GameScene R·피해 해석 | 고립 피해 +10%, 폭발 +12/스택 | 발동·피해 |
| chain-breath | 연문의 숨 | 언령 / chain, resource | 희귀 | 2 | 가산 | GameScene 연계 성공 | 문장력 +12, Q/E/R -0.4초/스택 | 자원·쿨다운 |
| stop-resonance | 정지 공명 | 언령 / stop, pulse | 희귀 | 2 | 가산 | GameScene 정지 종료 | 피해 9/스택, 0.65초 감속 | 발동·피해·대상 |
| perfect-counter | 완벽한 반격 | 절단 / parry, counter | 희귀 | 1 | 고유 | GameScene 완벽 패링·J | J 즉시 준비, 범위 +28%, 파열 +16 | 발동·피해 |
| counter-inscription | 반격 비문 | 절단 / parry, mark | 희귀 | 2 | 가산 | GameScene 패링·직접 피해 | 4초 표식, 파열 +11/스택 | 발동·피해 |
| link-contagion | 연결 전염 | 언령 / link, spread | 전설 | 1 | 고유 | GameScene LINKED 사망 | 최대 2명, 2.4초, 1세대 | 발동·생성 |
| rewind-breath | 되감긴 숨 | 생존 / rewind, healing | 일반 | 2 | 가산 | GameScene E 회복 | 실제 회복량의 +28%/스택 | 발동·회복 |
| echo-harvest | 잔향 수확 | 잔향 / resource, stop, link | 일반 | 2 | 가산 | GameScene 잔향 적중 | 문장력 +1.5, 초당 상한 6/스택 | 자원 |
| ink-cloak | 먹빛 망토 | 생존 / first-hit | 일반 | 2 | 가산 | GameScene 플레이어 피해 | 첫 피격 -35%/스택, 최소 40% 피해 | 방지 피해 |
| sentence-overcharge | 문장 과충전 | 언령 / empower | 전설 | 1 | 고유 | GameScene F 강화 언령 | 핵심 피해 ×1.35, 지속 +0.5초 | 발동·피해 |
| rupture-step | 파열의 발걸음 | 절단 / dash, cut | 희귀 | 2 | 가산 | GameScene 대시 후 J | 1.8초 창, 파동 +10/스택, 범위 142 | 발동·피해 |
| sealed-sentence | 봉인된 문장 | 범용 / cooldown, resource | 일반 | 3 | 가산 | UpgradeSystem·GameScene | 쿨다운 -6%, 언령 문장력 +15%/스택 | 쿨다운·자원 |
| fragment-recovery | 파편 회수 | 생존 / projectile, healing | 희귀 | 2 | 가산 | GameScene 반사 탄환 적중 | 체력 +4/스택 | 발동·회복 |

활성 카드 18장 중 `behaviorChange=true`는 17장(94.4%)이다. 모든 활성 ID는 `UpgradeRuntime.ACTIVE_EFFECT_HANDLERS`에 명시적으로 등록되어 누락을 테스트한다.

## 변환·통합·비활성 카드 15장

| ID | 이름 | 처리 | 근거 |
|---|---|---|---|
| afterimage-slash | 잔상 베기 | 파열의 발걸음으로 통합 | 대시 후 공격 행동을 J 파동으로 명확화 |
| dragon-fang | 용의 이빨 | 비활성 | 제거된 3연격·치명타 중심 구조 |
| broken-sentence | 부서진 문장 | 절단 문장으로 통합 | STOPPED 절단 파열 중복 |
| regression-blade | 역행의 칼날 | 회귀의 칼자국으로 통합 | E 이후 공격 중복 |
| memory-echo | 기억의 잔상 | 회귀의 칼자국으로 통합 | 잔상 강화 중복 |
| link-overload | 연결 과부하 | 고립의 사슬로 통합 | R 폭발·단일 대상 강화 중복 |
| inscription-spread | 비문 전염 | 연결 전염으로 대체 | 전염 규칙을 1세대로 안전화 |
| perfect-breath | 완벽한 호흡 | 완벽한 반격으로 대체 | 판정 확대보다 행동 보상 우선 |
| pursuit-mark | 추격의 각인 | 비활성 | 제거된 자동 대상 고정을 전제 |
| backflow-shards | 역류 파편 | 시간 역조 공명으로 통합 | 역류 재귀 위험 축소 |
| regression-sword-shadow | 회귀 검영 | 회귀의 칼자국으로 통합 | E 잔상 재현 중복 |
| linked-counter | 이어진 반격 | 반격 비문으로 대체 | 패링 표식의 단일 처리 경로 |
| unbroken-context | 끊기지 않는 문맥 | 연문의 숨으로 통합 | 연계 자원·시간 보상 중복 |
| dragon-rhythm | 용의 박자 | 잔향 수확으로 대체 | 제거된 3타 자원 구조 |
| echo-amplifier | 잔향 증폭 | 문장 과충전으로 대체 | F 강화 언령 역할 중복 |

## 공명 4종

| 공명 | 필요 카드 | 행동 변화 | 재귀 방지 |
|---|---|---|---|
| 월환 공명 | 쌍월의 잔향 + 넓은 궤도 | 잔향 4회 적중마다 제한된 원형 파동 | 공명 피해는 잔향 적중 카운터를 재호출하지 않음 |
| 시간 역조 | 역류 칼날 + 정지 공명 | Q 종료 시 정지 탄환 최대 3개 자동 역류 | 반사 완료 표식과 stop token 검사 |
| 반격 절문 | 완벽한 반격 + 절단 문장 | 완벽 패링 후 상태 없는 J도 작은 파열 | 준비 상태 1회 소비 |
| 회귀 사슬 | 회귀의 칼자국 + 고립의 사슬 | E 잔상이 고립에 강해지고 다중 연결에 공유 | echo 피해를 회귀·연결 기록에 재등록하지 않음 |

## 개발 검증 진입점

- `F4` N: 잔향 빌드 + 월환 공명
- `F4` O: 절단·패링 빌드 + 반격 절문
- `F4` P: 언령 빌드 + 회귀 사슬
- `F4` Q: 시간 역조 공명
- `F4` S: 카드·공명 기여 통계만 초기화
- 개발 URL `?qa=1&upgrade=<카드 ID>&stacks=<1~3>`: 개별 카드 즉시 지급
