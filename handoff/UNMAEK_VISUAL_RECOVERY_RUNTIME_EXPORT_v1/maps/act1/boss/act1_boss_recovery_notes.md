# ACT 1 BOSS — RECOVERY NOTES

- 승인본: v1.1 유지, stump·절벽 구성 추가 변경 없음
- walkable: 원형 보스 arena 내부 단일 연결 영역
- blocked / hazard: 외곽 절벽·낙하 경계만 0 / 255 hazard
- combat core: [360,190,920,570], 내부 hard blocker 0
- spawn: player (350,530), boss (640,265)
- boss territory: circle center (640,350), radius 280
- Telegraph: territory 안에서 원형 표시가 잘리지 않음
- runtime: background·collision·hazard만 후보. overlay·composite는 review 전용
