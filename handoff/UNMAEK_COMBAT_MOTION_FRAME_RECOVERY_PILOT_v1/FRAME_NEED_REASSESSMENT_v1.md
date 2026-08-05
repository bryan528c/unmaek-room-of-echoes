# FRAME_NEED_REASSESSMENT_v1

기존 `FRAME_REQUIRED 0`을 폐기하고 실제 프레임 생성·재생 뒤 재판정했다.

## 주인공

- 모든 sequence: **SOURCE_BLOCKED**
- proxy·PPT crop·기존 strip 재사용 0

## 압각 칼새

- `fly`: **INBETWEEN_CREATED**
- `evade`: **INBETWEEN_CREATED**

## 편향관 박쥐

- `idle`: **INBETWEEN_CREATED**
- `move`: **INBETWEEN_CREATED**
- `prep`: **UNIQUE_STATE_FRAME_CANDIDATE**
- `attack`: **UNIQUE_STATE_FRAME_CANDIDATE**
- `hit_recover`: **UNIQUE_STATE_FRAME_CANDIDATE**

## 되감비늘 도마뱀

- `idle`: **INBETWEEN_CREATED**
- `move`: **INBETWEEN_CREATED**
- `prep`: **UNIQUE_STATE_FRAME_CANDIDATE**
- `attack`: **UNIQUE_STATE_FRAME_CANDIDATE**
- `hit_recover`: **UNIQUE_STATE_FRAME_CANDIDATE**

## 광물실거미

- `idle`: **INBETWEEN_CREATED**
- `move`: **INBETWEEN_CREATED**
- `idle_to_alert`: **INBETWEEN_CREATED**
- `alert_to_deploy`: **INBETWEEN_CREATED**
- `deploy_to_attack`: **INBETWEEN_CREATED**
- `attack_to_recover`: **INBETWEEN_CREATED**
- `stunned_or_retreat`: **INBETWEEN_CREATED**

## 반향각 산양

- `idle`: **INBETWEEN_CREATED**
- `warning`: **INBETWEEN_CREATED**
- `combat_prep`: **INBETWEEN_CREATED**
- `charge_attack`: **INBETWEEN_CREATED**
- `hit_recover`: **INBETWEEN_CREATED**
- `retreat`: **INBETWEEN_CREATED**

## alias slot용 unique candidate

- 편향관 박쥐: prep 3, attack 4, hit/recover 3
- 되감비늘 도마뱀: prep 3, attack 4, hit/recover 3
- 공식 manifest alias는 수정하지 않았다. alias 해제 여부는 엔진 적용 검증에서 결정한다.

## STILL_INSUFFICIENT

- ACT 1 생물 sequence: 없음. 파일럿 재생·판독 기준은 충족.
- 주인공은 부족 판정이 아니라 `SOURCE_BLOCKED`로 별도 유지.
