# UNMAEK_COMBAT_MOTION_FRAME_RECOVERY_PILOT_v1

주인공과 ACT 1의 정적 포즈 재배치 결론을 폐기하고, 실제 신체 자세가 변하는 프레임과 재생 결과로 모션 가능성을 검증하는 파일럿이다.

## 판정 요약

- 주인공: `SOURCE_BLOCKED`. 실제 runtime/state 원본을 찾지 못해 proxy 없이 중단.
- ACT 1 생물: 실제 frame PNG 99장, sequence sheet 25장.
- 1× native preview 5개, 4× nearest preview 5개, animated review MP4 5개.
- ACT 1 recovery 맵 960×540 공격 합성 MP4 4개.
- 거미 thread marker·산양 phase3 overlay는 승인된 ACT 1 VFX 원본을 합성 재생에 사용.
- 편향관 박쥐·되감비늘 도마뱀의 기존 prep/attack/hit alias slot은 `UNIQUE_STATE_FRAME_CANDIDATE`로 별도 제공.
- 공식 manifest·AI·공격·판정·범위·timestamp·쿨다운·state machine은 수정하지 않았다.

## 사용 순서

1. `SOURCE_AUDIT_PLAYER_ACT1_v1.md`와 `PLAYER_SOURCE_BLOCKER_REPORT.md`를 읽는다.
2. 개별 frame PNG와 `sprite_sheets/` 후보를 staging에만 연결한다.
3. `MOTION_FRAME_MANIFEST_PILOT_v1.json`의 sequence와 기존 engine duration을 매핑한다.
4. `PER_FRAME_ANCHOR_OFFSET_PILOT_v1.json`은 VFX 위치 후보로만 쓰고 canonical gameplay anchor는 변경하지 않는다.
5. `previews/runtime_1x/`, `nearest_4x/`, `animated/`, `gameplay_960x540/`를 순서대로 검수한다.
6. alias 해제와 공식 반입은 엔진 debug overlay에서 Ground Point·Hurtbox·hit timestamp를 확인한 뒤 결정한다.

## 중요한 제한

- preview MP4의 frame duration은 검토 재생용이며 gameplay 수치가 아니다.
- 960×540 영상의 root 이동·Telegraph는 기존 역할을 보여 주는 합성 증거이며 새 공격 경로가 아니다.
- 주인공 PPT·스크린샷·기존 motion strip은 runtime 후보로 사용하지 않는다.
- 이 파일럿은 ACT 2·3 프레임을 만들지 않는다.
