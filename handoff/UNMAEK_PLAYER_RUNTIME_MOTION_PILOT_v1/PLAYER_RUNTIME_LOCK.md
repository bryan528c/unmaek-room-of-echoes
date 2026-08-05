# PLAYER RUNTIME LOCK

- canonical canvas: 64×64 logical pixels, RGBA 8-bit; runtime display 2× nearest
- Ground Point: (32, 57), 양발 최저 불투명 픽셀의 중앙 기준
- dagger: 모든 방향에서 소년의 오른손
- bag: 모든 방향에서 왼쪽 뒤 골반
- cape: 왼쪽 뒤로 무게가 남는 비대칭 실루엣
- mirror candidate: E↔W, NE↔NW, SE↔SW는 body blockout에만 사용 가능
- manual correction: 모든 mirror pair는 단검 손·가방·망토 비대칭을 수동 교정; 최종 frame은 단순 flip 미사용
