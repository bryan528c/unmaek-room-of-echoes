# UNMAEK_VISUAL_RECOVERY_RUNTIME_EXPORT_v1

승인된 《언맥》 시각 복구 v1.1을 실제 개발 반입 검토가 가능한 **별도 recovery runtime candidate**로 내보낸 패키지다. 공식 저장소와 공식 manifest는 수정하지 않았다.

## 결과 요약

- 맵 background 후보: 6장, 1280×720 RGB 8-bit
- collision 후보: 6장, 1280×720 grayscale 8-bit, 0/255 전용
- ACT 1 hazard 후보: 2장, 1280×720 grayscale 8-bit, 0/255 전용
- spawn/territory review overlay: 6장, runtime 로드 금지
- 실제 960×540 gameplay composite: 6장
- 광물실거미 corrected candidate: 7상태, 104×88 RGBA 8-bit
- 자동 검증: `tools/validate_visual_recovery_export.py`

## 반입 순서

1. `MAP_MANIFEST_PATCH_PROPOSAL_v1.json`의 후보 경로·좌표만 검토한다.
2. background와 collision을 동일 맵 단위로 staging 환경에 연결한다.
3. ACT 1 두 맵에서만 hazard를 연결한다.
4. overlay·composite·`previews/`는 검토 자료로만 사용한다.
5. 거미 corrected candidate는 상태별로 교체하되 Ground Point (52,72)와 uniform scale을 유지한다.
6. 자동 검증을 다시 실행하고 실제 960×540 플레이에서 layer order·fade·anchor를 확인한다.

## 중요 판정

- ACT 2 보스: fungal mound 하단만 128px(17.78%)로 줄이고 하단 명도를 소폭 낮췄다. 천산갑 spawn은 mound와 분리된 (640,320) 후보 좌표다.
- ACT 3 일반: 중앙 수면·자갈의 고주파 대비만 낮췄다. 내부 shoal은 collision blocker가 아니다.
- ACT 3 보스: 수류선은 실제 합성에서 Telegraph와 분리되어 원본 명도를 유지했다.
- 광물실거미: 7상태 모두 원본 runtime/master에서 다리 crop이 확인되어 7개 상태만 corrected candidate로 출력했다.

## 비포함

게임 코드, 공식 runtime 파일 덮어쓰기, 공식 manifest 수정, 새 생물·상태·AI·공격·언령·카드·전투 시스템은 포함하지 않는다.

## 검증 실행

```bash
python tools/validate_visual_recovery_export.py --root . --no-write
```

ZIP 검증은 `--zip`에 ZIP 파일을 추가한다.
