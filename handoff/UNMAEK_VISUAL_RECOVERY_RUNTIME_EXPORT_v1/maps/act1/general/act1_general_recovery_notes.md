# ACT 1 GENERAL — RECOVERY NOTES

- 승인본: v1.1 유지, 추가 디자인 변경 없음
- walkable: 중앙 연속 공터와 세 spawn cue를 하나의 연결 영역으로 구성
- blocked / hazard: 외곽 절벽·낙하 경계만 0 / 255 hazard
- combat core: [300,150,970,620], 내부 hard blocker 0
- spawn: player (410,525), enemies (705,145), (623,401), (930,400)
- foreground fade: 외곽 64px 기준, 합성에서 캐릭터 높이 30% 초과 가림 없음
- runtime: background·collision·hazard만 후보. overlay·composite는 review 전용
