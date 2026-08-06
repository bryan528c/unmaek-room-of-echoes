# Player Native Detail Lock

## Canonical lock

- canvas: `128×128`
- pixel format: `RGBA 8-bit`
- runtime display scale: `1.0×`
- Ground Point: `(64,112)`
- standing visible body height: 방향별 `92–96px`
- shared palette: `48색`
- sampling: nearest-neighbor
- alpha: hard edge, 투명 또는 완전 불투명

Ground Point는 Gate 0에서 확정했으며 모든 방향·모든 frame에서 바꾸지 않았다. 기존 `64×64` 프레임은 sequence·동작 의도·비대칭·anchor 참고로만 사용했고, 확대·보간·덧칠한 픽셀은 새 프레임에 재사용하지 않았다.

## Gate 0 표본

- S idle: `player/s/idle/player_s_idle_f01.png`
- E idle: `player/e/idle/player_e_idle_f01.png`
- E move contact: `player/e/move/player_e_move_f03.png`
- S basic attack contact: `player/s/basic_attack/player_s_basic_attack_f03.png`
- ACT 1 화면 비교: `PLAYER_NATIVE_DETAIL_LOCK.png`

네 표본을 승인 ACT 1 일반맵의 실제 `960×540`, scale `1.0×`에서 확인한 뒤 전체 프레임을 제작했다.

## Detail priority lock

항상 읽히는 A 디테일:

- 헝클어진 머리와 얼굴 방향
- 청록색 스카프·끈
- 비대칭 망토와 찢어진 끝
- 오른손 단검
- 왼쪽 뒤 골반 가방
- 분리된 장화와 다리
- 앞·뒤 방향 차이

정지·공격·언령에서 읽히는 B 디테일:

- 가슴의 용 이빨 공명 지점
- 허리띠와 주요 스트랩
- 장갑과 팔 분리
- 단검 손잡이와 칼날 분리
- 망토 가장자리의 제한된 청록 디테일

작은 버클, 바느질, 가죽 주름은 실루엣을 방해하지 않는 범위에서 단순화했다. 상시 halo와 전신 순수 검정 외곽선은 사용하지 않았다. 어두운 망토 내부는 갈색·먹색 명도 단계로 배경과 분리했다.

## Consistency result

- 같은 15세 소년·같은 머리 크기·같은 신체 비율: PASS
- 오른손 단검: PASS
- 왼쪽 뒤 가방: PASS
- 망토 비대칭: PASS
- 방향별 전면·후면·3/4 차이: PASS
- palette drift / crop / blur / non-uniform scale: 0
- exact duplicate / translation-only frame: 0

검토 시트: `previews/clean_character/player_dagger_bag_cape_consistency.png`, `previews/before_after/concept_detail_before_after.png`.
