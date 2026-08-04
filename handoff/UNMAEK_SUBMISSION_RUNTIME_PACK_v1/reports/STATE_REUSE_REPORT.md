# STATE REUSE REPORT

필수 58개 상태 슬롯 중 실제 잠금 원본이 없는 17개는 가장 가까운 잠금 포즈를 한 단계 alias로 재사용한다. alias 체인과 복제 PNG는 없다.

| 생물 | 원본 상태 | alias 상태 | flip/scale/rotation/tint/VFX | 제출 이후 교체 권장 |
|---|---|---|---|---|
| 압각 칼새 | `fly` | `idle` | 없음 | 예 |
| 편향관 박쥐 | `idle` | `prep` | 없음 | 예 |
| 편향관 박쥐 | `move` | `attack` | 없음 | 예 |
| 편향관 박쥐 | `move` | `hit` | tint #B94A3E / shake | 예 |
| 되감비늘 도마뱀 | `idle` | `prep` | rotation -3° | 예 |
| 되감비늘 도마뱀 | `move` | `attack` | 없음 | 예 |
| 되감비늘 도마뱀 | `idle` | `hit` | tint #B94A3E / shake | 예 |
| 공명수염 사향고양이 | `move` | `hit` | tint #B94A3E / shake | 예 |
| 주름목 개구리 | `move` | `hit` | tint #B94A3E / shake | 예 |
| 회절비늘 천산갑 | `idle` | `warning` | overlay vfx/diffraction_pangolin_scale_highlight_overlay.png | 예 |
| 회절비늘 천산갑 | `idle` | `phase1` | 없음 | 예 |
| 회절비늘 천산갑 | `idle` | `retreat` | flipX / rotation 4° | 예 |
| 흐름턱 게 | `idle` | `move` | 없음 | 예 |
| 맥수염 메기 | `move` | `hit` | tint #B94A3E / shake | 예 |
| 유로맥 수달어미 | `warning` | `phase2` | scale 1.03 / overlay vfx/channel_otter_mother_water_membrane_overlay.png | 예 |
| 유로맥 수달어미 | `phase3_or_diveprep` | `attack_or_surface` | rotation -4° | 예 |
| 유로맥 수달어미 | `protect_idle` | `retreat` | flipX / rotation 3° | 예 |
