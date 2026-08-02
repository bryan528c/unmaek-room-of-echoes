# 《언맥: 잔향의 방》

Phaser 3와 TypeScript로 만든 키보드 중심 2D 액션 로그라이트입니다.

## 실행

PowerShell에서는 프로젝트 폴더에서 다음을 실행합니다.

```powershell
npm.cmd install
npm.cmd run dev
```

테스트는 `npm.cmd run test`, 프로덕션 빌드는 `npm.cmd run build`입니다. 카드 제시 500 Run 검증은 `npm.cmd run simulate:upgrades`, 세 빌드 60초 고정 입력 비교는 `npm.cmd run simulate:builds`로 실행합니다.

## 조작

- `WASD` / 방향키: 이동 및 메뉴 선택
- `잔향 칼날`: 주인공 주변 360도에서 약하게 자동 발동하는 기본 무기
- `J`: 마지막 이동 방향으로 한 번의 넓은 `절단` (자동 추적·전진 없음)
- `K` / `Shift`: 패링
- `Space`: 대시
- `Q / E / R`: 멎는다 / 되돌린다 / 잇는다 (문장력 비용 없이 독립 쿨다운)
- `F`: 다음 언령 강화
- `1 / 2 / 3`: 강화 카드 즉시 선택
- `A / D` 또는 `← / →` + `Enter`: 강화 카드 포커스와 확정 (`R`: 다시 뽑기)
- `Enter / J`: 메뉴 확정
- `Esc`: 뒤로 또는 일시정지

절단은 STOPPED, LINKED, ECHO, 보스 취약 상태를 처리할 때 강해집니다. 문장력은 `F` 강화 용언에만 사용됩니다.

## 개발 모드

- `F2`: Ground Point, Movement Collider, Hurtbox, Hitbox, Telegraph, 탄환, combatBounds 표시
- `F3`: 흐름 상태, 정지 토큰, 각 timeScale, heartbeat, 개체·타이머와 전투 통계
- `F4`: 전투 기반 시나리오 + 8방향 패링, 안정성 시뮬레이션, 잔향/절단/언령 고정 빌드, 공명 4종, 오디오 버스 진단, 카드 기여 통계 초기화
- `?qa=1`: 피해 없이 진행하며 `P`로 웨이브/보스 단계를 넘기는 검증 모드
- `?qa=1&upgrade=<카드 ID>&stacks=<1~3>`: 개발 모드에서 원하는 카드와 중첩을 즉시 지급
- `?legacyCombo=1`: 개발 환경에서만 이전 3연격 구조 비교
- `?defensiveSlash=1`: 개발 환경에서만 이전 자동 호신 베기 비교
