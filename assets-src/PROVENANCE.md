# 에셋 출처 (PROVENANCE)

게임에 들어가는 그림과 영상은 모두 이 저장소를 위해 새로 만든 것입니다. 다른 게임의 에셋 · 로고 · 폰트 · UI는 쓰지 않았고, 생성 프롬프트에도 게임 · 회사 · 아티스트 이름을 넣지 않았습니다. 예외 하나: 컨셉 세트(메카 · 클럽 · 크리스털 · 네온 · 피아노)의 부위별 시트가 기준으로 삼은 스타일 프레임의 프롬프트에는 완성도 기준으로 상용 게임 이름을 적었습니다(맨 아래 [메카 세트](#메카-세트-stylesmecha-2026-11)부터).

아래 P0 세트(ElevenLabs)의 기록이 먼저, 그다음 컨셉 세트와 세트에 속하지 않는 타격 효과(Gemini)의 기록입니다.

- 만든 곳(P0 세트): ElevenLabs(creative 도구). flow 주소는 작업 공간 전환 코드를 뺀 주소입니다.
- 플랜과 이용 조건: 작업 공간 한도(370,430크레딧)와 크레딧 추가 결제(2026-10-19)로 보아 유료 플랜입니다. ElevenLabs 약관상 유료 플랜의 생성물은 상업적으로 쓸 수 있고 권리는 사용자에게 있습니다(무료 플랜은 비상업 전용). 플랜 이름은 도구로 확인하지 못했습니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았고 ElevenLabs에 올리지 않았습니다.
- `assets-src/`에는 고른 결과를 내려받은 그대로 두고(이름만 영어로 바꿈), 게임용 파일은 `scripts/assets/build_p0.py`가 `client/public/media/`에 다시 만듭니다. 만드는 값은 `scripts/assets/p0_recipe.json`에 있습니다.
- 노트 · 기어 · 이펙트는 모두 흑백으로 만들고, 색은 게임이 스킨 색표(`client/src/render/skins.ts`)로 입힙니다.

## 세트

| 세트 | 스킨 id | 노트 모양 | 타격 이펙트 |
|---|---|---|---|
| 글래스(유리와 네온) | `glass` | 상자 | 링과 불꽃 |
| 크리스털(깎은 보석) | `crystal` | 상자 | 빛 번짐과 별빛 |
| 메탈(정밀 금속) | `metal` | 납작한 판 | 링과 불꽃 |
| 젤(말랑한 빛) | `gel` | 둥근 캡슐 | 빛 번짐과 별빛 |

키 빔과 롱노트 불꽃은 네 세트가 같이 씁니다. 롱노트 머리 · 꼬리 그림은 만들지 않았습니다(렌더러가 롱노트 몸통만 그림 — 끝 모양이 탭 노트로 읽혀서). 사이드 · 스크래치 노트는 따로 생성하지 않고 고른 탭 노트에서 만들었습니다(기준 이미지를 붙인 생성이 약 3.5배 비싸서).

## 파일

| 파일 | 세트 | 용도 | 생성 ID | 크레딧 |
|---|---|---|---|---|
| `notes/glass_tap.png` | 글래스 | 탭 노트 원본 → 탭 · 사이드 · 스크래치 노트 텍스처 | `iLuRyNWMtTs5jOREE8mm` | 115.5 |
| `notes/crystal_tap.png` | 크리스털 | 탭 노트 원본 → 탭 · 사이드 · 스크래치 노트 텍스처 | `jjgmnRKvbBtTRqPeN4pZ` | 115.5 |
| `notes/metal_tap.png` | 메탈 | 탭 노트 원본 → 탭 · 사이드 · 스크래치 노트 텍스처 | `5n2bc9v0u1yiFdDBSdWp` | 115.5 |
| `notes/gel_tap.png` | 젤 | 탭 노트 원본 → 탭 · 사이드 · 스크래치 노트 텍스처 | `JhtikD1xik0HvCVXwOXq` | 115.5 |
| `notes/glass_long_body.png` | 글래스 | 롱노트 몸통(세로 반복) | `eXeTiFiGgRu0ZDWGru1Z` | 157.8 |
| `notes/crystal_long_body.png` | 크리스털 | 롱노트 몸통(세로 반복) | `LlzlgJLro0eEhylgd1fe` | 157.8 |
| `notes/metal_long_body.png` | 메탈 | 롱노트 몸통(세로 반복) | `qLcxtRrREjlZEIElI4Az` | 157.8 |
| `notes/gel_long_body.png` | 젤 | 롱노트 몸통(세로 반복) | `a2itiveka4NnhHUro7oY` | 157.8 |
| `gear/glass_judge_line.png` | 글래스 | 판정선 | `sOGZ5opmjbAdhTLow608` | 115.5 |
| `gear/crystal_judge_line.png` | 크리스털 | 판정선 | `s4faF5YXH9m2cRZe5mZP` | 115.5 |
| `gear/metal_judge_line.png` | 메탈 | 판정선 | `IlyrXmX7hN6DcUP3eMHz` | 115.5 |
| `gear/gel_judge_line.png` | 젤 | 판정선 | `yIxUERCnm6hS0UtwNYrp` | 115.5 |
| `gear/glass_rail.png` | 글래스 | 트랙 양옆 레일(오른쪽은 좌우 반전) | `TyZ4iHnr3mpHxmcyhe62` | 115.5 |
| `gear/crystal_rail.png` | 크리스털 | 트랙 양옆 레일(오른쪽은 좌우 반전) | `qBS02DE02t8nxLWN2m0e` | 115.5 |
| `gear/metal_rail.png` | 메탈 | 트랙 양옆 레일(오른쪽은 좌우 반전) | `jAk2CV10smmmTqIqV9xc` | 115.5 |
| `gear/gel_rail.png` | 젤 | 트랙 양옆 레일(오른쪽은 좌우 반전) | `9zbstPcI0hbfOhysEtbV` | 115.5 |
| `gear/glass_track_floor.png` | 글래스 | 트랙 바닥 타일 | `DUmI0dtyhSonhLsTPLHI` | 98.0 |
| `gear/crystal_track_floor.png` | 크리스털 | 트랙 바닥 타일 | `1JxopJvI08Zf4UBstsVx` | 98.0 |
| `gear/metal_track_floor.png` | 메탈 | 트랙 바닥 타일 | `fkAYnKhcVi2vabnjqAyq` | 98.0 |
| `gear/gel_track_floor.png` | 젤 | 트랙 바닥 타일 | `xzQsv17IKBtha8wHbEEK` | 98.0 |
| `gear/key_beam.png` | 공용 | 키 빔(누르는 동안 레인에 서는 빛) | `J0ZwZCkGTfh4TVVob4FQ` | 115.5 |
| `effects/hit_burst_ring.mp4` | 글래스 · 메탈 | 타격 이펙트 '링과 불꽃' 플립북 | `j0gJn9xUCL3WBQccHhqg` | 2,423.8 |
| `effects/hit_burst_glow.mp4` | 크리스털 · 젤 | 타격 이펙트 '빛 번짐과 별빛' 플립북 | `VFVcpDWawtpedfyApwbh` | 2,423.8 |
| `effects/hit_hold_sparks.mp4` | 공용 | 롱노트를 누르는 동안의 불꽃 플립북(반복) | `Va3Hl6QGiQPXSkjckXZD` | 2,423.8 |

저장소에 넣은 24개의 생성 비용 합계는 약 9,796크레딧입니다. 고르지 않은 후보까지 합한 P0 전체 사용량은 약 16,779크레딧입니다.

## 파일별 기록

### `notes/glass_tap.png`

- 용도: 탭 노트 원본 → 탭 · 사이드 · 스크래치 노트 텍스처 (글래스)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1536×512 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 02:54 KST
- flow `B4zzcPrqVuW46UZUAdLI` (https://elevenlabs.io/app/flows/B4zzcPrqVuW46UZUAdLI) · node `Lj1smO6wIq01SmnSbE6X` · generation `iLuRyNWMtTs5jOREE8mm`
- 크레딧: 115.45
- 원본: 469,326바이트 · sha256 앞 16자리 `8909a58e78bce18b`
- 후처리: 막대만 잘라 흑백으로 · 모양 마스크를 알파로 · 탭 256×64 · 사이드 128×64 · 스크래치 256×64(사이드 레인이 키 레인보다 좁아 사이드만 2:1) · 셋 다 양 끝(높이 × 0.6)은 그대로 두고 가운데만 늘이거나 줄임(9-slice) · 스크래치에는 옅은 사선 세 줄
- 고른 이유: 테두리가 또렷해 레인 색을 곱해도 모양이 잘 보임(3번은 몸통이 어두움)
- 프롬프트:

  > original rhythm game asset, clean geometric neon style, glossy glass and soft light, high contrast, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Intended use: the texture of a falling tap note in a rhythm game, seen straight from above. One wide horizontal bar of glossy white glass, about four times wider than it is tall, with gently rounded corners and a thin bright outline along its edges. A soft bright highlight band runs horizontally through the middle of the bar. Neutral white and light grey only, with no color tint, because the color is added later in the game. The bar spans about 85 percent of the image width and is vertically centered, with plain pure black (#000000) everywhere around it.

### `notes/crystal_tap.png`

- 용도: 탭 노트 원본 → 탭 · 사이드 · 스크래치 노트 텍스처 (크리스털)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1536×512 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 02:54 KST
- flow `B4zzcPrqVuW46UZUAdLI` (https://elevenlabs.io/app/flows/B4zzcPrqVuW46UZUAdLI) · node `a7tZ3gbQmueSWrdcB005` · generation `jjgmnRKvbBtTRqPeN4pZ`
- 크레딧: 115.45
- 원본: 577,341바이트 · sha256 앞 16자리 `855b1439e42be833`
- 후처리: 막대만 잘라 흑백으로 · 모양 마스크를 알파로 · 탭 256×64 · 사이드 128×64 · 스크래치 256×64(사이드 레인이 키 레인보다 좁아 사이드만 2:1) · 셋 다 양 끝(높이 × 0.6)은 그대로 두고 가운데만 늘이거나 줄임(9-slice) · 스크래치에는 옅은 사선 세 줄 · 크리스털만 막대 안쪽 밝기를 0.45 까지 끌어올림(맑은 윗면이라 레인 색을 곱하면 비어 보여서)
- 고른 이유: 깎인 면이 또렷하고 가운데가 밝음(3 · 4번은 가운데가 어두워 비어 보임)
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: faceted cut crystal, crisp bevelled edges catching thin lines of light, high contrast. Intended use: the texture of a falling tap note in a rhythm game, seen straight from above. One wide horizontal bar cut like a gemstone: a flat, clear top face surrounded by chamfered facets that catch thin, sharp lines of light, about four times wider than it is tall. A few small sparkles sit on the facet corners. Neutral white and light grey only, with no color tint, because the color is added later in the game. The bar spans about 85 percent of the image width and is vertically centered, with plain pure black (#000000) everywhere around it.

### `notes/metal_tap.png`

- 용도: 탭 노트 원본 → 탭 · 사이드 · 스크래치 노트 텍스처 (메탈)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1536×512 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 02:54 KST
- flow `B4zzcPrqVuW46UZUAdLI` (https://elevenlabs.io/app/flows/B4zzcPrqVuW46UZUAdLI) · node `9iJ4tgDGcQbL5nCM4xCG` · generation `5n2bc9v0u1yiFdDBSdWp`
- 크레딧: 115.45
- 원본: 619,556바이트 · sha256 앞 16자리 `c4850e1d6f828e56`
- 후처리: 막대만 잘라 흑백으로 · 모양 마스크를 알파로 · 탭 256×64 · 사이드 128×64 · 스크래치 256×64(사이드 레인이 키 레인보다 좁아 사이드만 2:1) · 셋 다 양 끝(높이 × 0.6)은 그대로 두고 가운데만 늘이거나 줄임(9-slice) · 스크래치에는 옅은 사선 세 줄
- 고른 이유: 결이 고르고 전체가 밝음
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: precise machined metal, satin brushed finish with fine hairline grain, minimal reflections, high contrast. Intended use: the texture of a falling tap note in a rhythm game, seen straight from above. One wide horizontal plate of light silver metal, about four times wider than it is tall, with crisp straight edges, a thin chamfered rim that catches a fine line of light, and fine horizontal hairline grain across the face. A single soft reflection line runs along the middle. Light grey and white only, bright overall, with no color tint, because the color is added later in the game. The plate spans about 85 percent of the image width and is vertically centered, with plain pure black (#000000) everywhere around it.

### `notes/gel_tap.png`

- 용도: 탭 노트 원본 → 탭 · 사이드 · 스크래치 노트 텍스처 (젤)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1536×512 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 02:54 KST
- flow `B4zzcPrqVuW46UZUAdLI` (https://elevenlabs.io/app/flows/B4zzcPrqVuW46UZUAdLI) · node `Kbo07F6UknvBeMomlu6h` · generation `JhtikD1xik0HvCVXwOXq`
- 크레딧: 115.45
- 원본: 504,693바이트 · sha256 앞 16자리 `c8b38802191e3c7f`
- 후처리: 막대만 잘라 흑백으로 · 모양 마스크를 알파로 · 탭 256×64 · 사이드 128×64 · 스크래치 256×64(사이드 레인이 키 레인보다 좁아 사이드만 2:1) · 셋 다 양 끝(높이 × 0.6)은 그대로 두고 가운데만 늘이거나 줄임(9-slice) · 스크래치에는 옅은 사선 세 줄
- 고른 이유: 안쪽 빛이 고르고 위쪽 반사광이 또렷함
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: soft translucent gel, rounded shapes glowing gently from inside, smooth highlights, high contrast. Intended use: the texture of a falling tap note in a rhythm game, seen straight from above. One wide horizontal capsule of soft translucent gel with fully rounded ends, about four times wider than it is tall, glowing gently from inside with a brighter core, and one smooth rounded highlight along its upper edge. Neutral white and light grey only, with no color tint, because the color is added later in the game. The capsule spans about 85 percent of the image width and is vertically centered, with plain pure black (#000000) everywhere around it.

### `notes/glass_long_body.png`

- 용도: 롱노트 몸통(세로 반복) (글래스)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1024 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:16 KST
- flow `B4zzcPrqVuW46UZUAdLI` (https://elevenlabs.io/app/flows/B4zzcPrqVuW46UZUAdLI) · node `KuRHTGxuV5wAsjbVE7na` · generation `eXeTiFiGgRu0ZDWGru1Z`
- 크레딧: 157.81
- 원본: 283,155바이트 · sha256 앞 16자리 `00c2ffa1b6406e54`
- 후처리: 띠가 있는 열만 잘라 흑백으로 · 위아래 끝 128줄을 겹쳐 섞어 이음새 없앰 · 128×256 · 밝기 × 1.4 를 알파로(어두운 가운데는 트랙이 비침)
- 고른 이유: 이음새 0.6 · 고름 0.002 · 바깥 0.0 으로 가장 고름, 밝기 138.6
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: clean geometric neon style, glossy glass and soft light, high contrast. Intended use: the repeating body of a long hold note in a rhythm game, seen straight from above. Make one straight vertical strip that runs from the very top edge to the very bottom edge of the image with no ends or caps, about one third of the image width, centered. The strip looks the same along its whole length so it can repeat seamlessly: a soft bright line along each side edge and a faint, even glow in the middle. Neutral white and light grey only, with no color tint, because the color is added later in the game. Plain pure black (#000000) on both sides.

### `notes/crystal_long_body.png`

- 용도: 롱노트 몸통(세로 반복) (크리스털)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1024 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:16 KST
- flow `B4zzcPrqVuW46UZUAdLI` (https://elevenlabs.io/app/flows/B4zzcPrqVuW46UZUAdLI) · node `0t6Lzp2kBPnkSbSi722m` · generation `LlzlgJLro0eEhylgd1fe`
- 크레딧: 157.81
- 원본: 385,603바이트 · sha256 앞 16자리 `8457bf541e314af5`
- 후처리: 띠가 있는 열만 잘라 흑백으로 · 위아래 끝 128줄을 겹쳐 섞어 이음새 없앰 · 128×256 · 밝기 × 1.4 를 알파로(어두운 가운데는 트랙이 비침)
- 고른 이유: 가장 밝음(149.0) · 이음새 5.0 은 후처리로 섞음
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: faceted cut crystal, crisp bevelled edges catching thin lines of light, high contrast. Intended use: the repeating body of a long hold note in a rhythm game, seen straight from above. Make one straight vertical strip that runs from the very top edge to the very bottom edge of the image with no ends or caps, about one third of the image width, centered. The strip looks the same along its whole length so it can repeat seamlessly: thin bright facet lines along both side edges and a clear, faintly glowing middle. Neutral white and light grey only, with no color tint, because the color is added later in the game. Plain pure black (#000000) on both sides.

### `notes/metal_long_body.png`

- 용도: 롱노트 몸통(세로 반복) (메탈)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1024 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:16 KST
- flow `B4zzcPrqVuW46UZUAdLI` (https://elevenlabs.io/app/flows/B4zzcPrqVuW46UZUAdLI) · node `GOAiLz7dolwguzVgU8aP` · generation `qLcxtRrREjlZEIElI4Az`
- 크레딧: 157.81
- 원본: 377,617바이트 · sha256 앞 16자리 `0f47f8c816d52a16`
- 후처리: 띠가 있는 열만 잘라 흑백으로 · 위아래 끝 128줄을 겹쳐 섞어 이음새 없앰 · 128×256 · 밝기 × 1.4 를 알파로(어두운 가운데는 트랙이 비침)
- 고른 이유: 가장 고름(0.004) · 이음새 2.1
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: precise machined metal, satin brushed finish with fine hairline grain, minimal reflections, high contrast. Intended use: the repeating body of a long hold note in a rhythm game, seen straight from above. Make one straight vertical strip that runs from the very top edge to the very bottom edge of the image with no ends or caps, about one third of the image width, centered. The strip looks the same along its whole length so it can repeat seamlessly: fine vertical hairline grain, a thin bright rim along each side edge and an even satin middle. Neutral white and light grey only, with no color tint, because the color is added later in the game. Plain pure black (#000000) on both sides.

### `notes/gel_long_body.png`

- 용도: 롱노트 몸통(세로 반복) (젤)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1024 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:16 KST
- flow `B4zzcPrqVuW46UZUAdLI` (https://elevenlabs.io/app/flows/B4zzcPrqVuW46UZUAdLI) · node `0iA0Uvy08xIQuVUxkjOx` · generation `a2itiveka4NnhHUro7oY`
- 크레딧: 157.81
- 원본: 268,297바이트 · sha256 앞 16자리 `3b72df4f1845ddbd`
- 후처리: 띠가 있는 열만 잘라 흑백으로 · 위아래 끝 128줄을 겹쳐 섞어 이음새 없앰 · 128×256 · 밝기 × 1.4 를 알파로(어두운 가운데는 트랙이 비침)
- 고른 이유: 가장 밝음(218.0) · 이음새 0.6
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: soft translucent gel, rounded shapes glowing gently from inside, smooth highlights, high contrast. Intended use: the repeating body of a long hold note in a rhythm game, seen straight from above. Make one straight vertical strip that runs from the very top edge to the very bottom edge of the image with no ends or caps, about one third of the image width, centered. The strip looks the same along its whole length so it can repeat seamlessly: rounded, softly glowing edges and a brighter, even core, like a tube of glowing gel. Neutral white and light grey only, with no color tint, because the color is added later in the game. Plain pure black (#000000) on both sides.

### `gear/glass_judge_line.png`

- 용도: 판정선 (글래스)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1536×512 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `EH9daLm1cxsUiC9xWplQ` · generation `sOGZ5opmjbAdhTLow608`
- 크레딧: 115.45
- 원본: 309,156바이트 · sha256 앞 16자리 `5d81ddd1deae728b`
- 후처리: 선이 있는 줄만(빛 번짐 포함) 잘라 흑백으로 · 1024×64 · 가산 합성(바탕 순흑)
- 고른 이유: 가장 밝음(138.2) · 좌우 고름 0.006 · 바깥 0.0 (3번은 늦게 끝나 비교에서 뺌)
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: clean geometric neon style, glossy glass and soft light, high contrast. Intended use: the judgement line of a rhythm game track, where notes are hit. One perfectly straight, thin horizontal line across the full width of the image, vertically centered: a crisp bright glass line with a soft, even glow above and below it that fades out quickly. The line and its glow look the same from left to right. Neutral white only, with no color tint. Plain pure black (#000000) above and below.

### `gear/crystal_judge_line.png`

- 용도: 판정선 (크리스털)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1536×512 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `SX1sS2T71C1Y2RtVh3FB` · generation `s4faF5YXH9m2cRZe5mZP`
- 크레딧: 115.45
- 원본: 266,003바이트 · sha256 앞 16자리 `e48f73c6ec93e080`
- 후처리: 선이 있는 줄만(빛 번짐 포함) 잘라 흑백으로 · 1024×64 · 가산 합성(바탕 순흑)
- 고른 이유: 가장 밝음(165.5) · 바깥 0.0 (좌우 고름 0.159 는 반짝임 무늬 때문)
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: faceted cut crystal, crisp bevelled edges catching thin lines of light, high contrast. Intended use: the judgement line of a rhythm game track, where notes are hit. One perfectly straight, thin horizontal line across the full width of the image, vertically centered: a razor-thin bright line of cut crystal with tiny, evenly spaced glints along it and a short, crisp glow. The line and its glow look the same from left to right. Neutral white only, with no color tint. Plain pure black (#000000) above and below.

### `gear/metal_judge_line.png`

- 용도: 판정선 (메탈)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1536×512 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `sxijK2Rucl4xtpm7blkO` · generation `IlyrXmX7hN6DcUP3eMHz`
- 크레딧: 115.45
- 원본: 281,924바이트 · sha256 앞 16자리 `52f9eafcce85945d`
- 후처리: 선이 있는 줄만(빛 번짐 포함) 잘라 흑백으로 · 1024×64 · 가산 합성(바탕 순흑)
- 고른 이유: 가장 밝고(146.7) 선이 가장 두꺼움(0.027) · 좌우 고름 0.007
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: precise machined metal, satin brushed finish with fine hairline grain, minimal reflections, high contrast. Intended use: the judgement line of a rhythm game track, where notes are hit. One perfectly straight, thin horizontal line across the full width of the image, vertically centered: a thin polished metal bar with a bright, laser-like core and a narrow glow. The line and its glow look the same from left to right. Neutral white only, with no color tint. Plain pure black (#000000) above and below.

### `gear/gel_judge_line.png`

- 용도: 판정선 (젤)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1536×512 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `fLr5cUHVsNf2rLM2UlnO` · generation `yIxUERCnm6hS0UtwNYrp`
- 크레딧: 115.45
- 원본: 368,329바이트 · sha256 앞 16자리 `ade14cf784b15152`
- 후처리: 선이 있는 줄만(빛 번짐 포함) 잘라 흑백으로 · 1024×64 · 가산 합성(바탕 순흑)
- 고른 이유: 좌우 고름 0.003 · 선이 가장 두꺼움(0.109) · 바깥 0.0
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: soft translucent gel, rounded shapes glowing gently from inside, smooth highlights, high contrast. Intended use: the judgement line of a rhythm game track, where notes are hit. One perfectly straight, thin horizontal line across the full width of the image, vertically centered: a soft rounded tube of glowing gel with a wide, gentle glow. The line and its glow look the same from left to right. Neutral white only, with no color tint. Plain pure black (#000000) above and below.

### `gear/glass_rail.png`

- 용도: 트랙 양옆 레일(오른쪽은 좌우 반전) (글래스)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1536 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `Da66ZMakuF8OEYAxMFxN` · generation `TyZ4iHnr3mpHxmcyhe62`
- 크레딧: 115.45
- 원본: 319,002바이트 · sha256 앞 16자리 `d555ecbe0fe66178`
- 후처리: 레일이 있는 열만 잘라 흑백으로 · 위아래 끝 192줄을 겹쳐 섞어 이음새 없앰 · 64×1024 · 가산 합성
- 고른 이유: 위아래 고름 0.002(가장 고름) · 이음새 0.6
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: clean geometric neon style, glossy glass and soft light, high contrast. Intended use: the edge rail along one side of a rhythm game track. One perfectly straight vertical tube of glass light with a crisp bright core and a soft glow on both sides, running from the very top edge to the very bottom edge of the image, horizontally centered and about one eighth of the image width. It looks the same along its whole length so it can repeat seamlessly, with no ends. Neutral white only, with no color tint. Plain pure black (#000000) on both sides.

### `gear/crystal_rail.png`

- 용도: 트랙 양옆 레일(오른쪽은 좌우 반전) (크리스털)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1536 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `4O7YtH8VOte6jG6jVG1L` · generation `qBS02DE02t8nxLWN2m0e`
- 크레딧: 115.45
- 원본: 302,758바이트 · sha256 앞 16자리 `d23ffbb428b07e0b`
- 후처리: 레일이 있는 열만 잘라 흑백으로 · 위아래 끝 192줄을 겹쳐 섞어 이음새 없앰 · 64×1024 · 가산 합성
- 고른 이유: 이음새 0.9(가장 작음)
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: faceted cut crystal, crisp bevelled edges catching thin lines of light, high contrast. Intended use: the edge rail along one side of a rhythm game track. One perfectly straight vertical thin prism bar with bevelled faces catching sharp lines of light, running from the very top edge to the very bottom edge of the image, horizontally centered and about one eighth of the image width. It looks the same along its whole length so it can repeat seamlessly, with no ends. Neutral white only, with no color tint. Plain pure black (#000000) on both sides.

### `gear/metal_rail.png`

- 용도: 트랙 양옆 레일(오른쪽은 좌우 반전) (메탈)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1536 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:16 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `6uDlq6gKEWbW8xjRjHPD` · generation `jAk2CV10smmmTqIqV9xc`
- 크레딧: 115.45
- 원본: 410,223바이트 · sha256 앞 16자리 `8e809c6916272c8b`
- 후처리: 레일이 있는 열만 잘라 흑백으로 · 위아래 끝 192줄을 겹쳐 섞어 이음새 없앰 · 64×1024 · 가산 합성
- 고른 이유: 위아래 고름 0.008(가장 고름) · 메탈 레일은 3장만 생성
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: precise machined metal, satin brushed finish with fine hairline grain, minimal reflections, high contrast. Intended use: the edge rail along one side of a rhythm game track. One perfectly straight vertical polished metal rail with one bright reflection line and a narrow chamfer on each side, running from the very top edge to the very bottom edge of the image, horizontally centered and about one eighth of the image width. It looks the same along its whole length so it can repeat seamlessly, with no ends. Neutral white only, with no color tint. Plain pure black (#000000) on both sides.

### `gear/gel_rail.png`

- 용도: 트랙 양옆 레일(오른쪽은 좌우 반전) (젤)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1536 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `EuXcdANXI4y9SXTBS1Xe` · generation `9zbstPcI0hbfOhysEtbV`
- 크레딧: 115.45
- 원본: 325,142바이트 · sha256 앞 16자리 `d91ecadc7cd33d84`
- 후처리: 레일이 있는 열만 잘라 흑백으로 · 위아래 끝 192줄을 겹쳐 섞어 이음새 없앰 · 64×1024 · 가산 합성
- 고른 이유: 위아래 고름 0.006 · 이음새 0.7(둘 다 가장 좋음)
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: soft translucent gel, rounded shapes glowing gently from inside, smooth highlights, high contrast. Intended use: the edge rail along one side of a rhythm game track. One perfectly straight vertical soft rounded tube of glowing gel, running from the very top edge to the very bottom edge of the image, horizontally centered and about one eighth of the image width. It looks the same along its whole length so it can repeat seamlessly, with no ends. Neutral white only, with no color tint. Plain pure black (#000000) on both sides.

### `gear/glass_track_floor.png`

- 용도: 트랙 바닥 타일 (글래스)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1024×1024 · quality medium · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `iSXGp2hnW57jgtMU8Jl0` · generation `DUmI0dtyhSonhLsTPLHI`
- 크레딧: 98.04
- 원본: 1,002,434바이트 · sha256 앞 16자리 `cff61fd0aa7335b4`
- 후처리: 흑백 · 가로세로 끝 128줄을 겹쳐 섞어 이음새 없앰 · 512×512 · 무늬 세기를 0.5 로 줄이고 평균 밝기를 0.5 로 맞춤(게임에서 트랙 색을 곱하고 평균을 되돌림)
- 고른 이유: 이음새 0.7 · 1.7(가장 작음) · 가장 어두움(71.6)
- 프롬프트:

  > original rhythm game asset, flat orthographic view, no text, no letters, no logo, no watermark. Style: clean geometric neon style, glossy glass and soft light, high contrast. Intended use: a seamlessly tiling floor texture for a rhythm game track, kept dark and quiet so falling notes stay easy to read. A dark neutral grey surface with a faint, fine square grid of thin lighter lines and a subtle smooth glass sheen, evenly lit, with no bright spots, no vignette and no objects. Neutral grey only, with no color tint, because the color comes from the game's skin. The pattern repeats evenly so the left edge matches the right edge and the top edge matches the bottom edge.

### `gear/crystal_track_floor.png`

- 용도: 트랙 바닥 타일 (크리스털)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1024×1024 · quality medium · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `fhbcMrHJecnBZnrmqFjt` · generation `1JxopJvI08Zf4UBstsVx`
- 크레딧: 98.04
- 원본: 1,277,436바이트 · sha256 앞 16자리 `0d3874011ddb57d7`
- 후처리: 흑백 · 가로세로 끝 128줄을 겹쳐 섞어 이음새 없앰 · 512×512 · 무늬 세기를 0.5 로 줄이고 평균 밝기를 0.5 로 맞춤(게임에서 트랙 색을 곱하고 평균을 되돌림)
- 고른 이유: 이음새 1.6 · 1.6(가장 작음) · 4번은 늦게 끝나 비교에서 뺌
- 프롬프트:

  > original rhythm game asset, flat orthographic view, no text, no letters, no logo, no watermark. Style: faceted cut crystal, crisp bevelled edges catching thin lines of light, high contrast. Intended use: a seamlessly tiling floor texture for a rhythm game track, kept dark and quiet so falling notes stay easy to read. A dark neutral grey surface with a very faint diamond lattice of thin lines, like light seen through cut glass, evenly lit, with no bright spots, no vignette and no objects. Neutral grey only, with no color tint, because the color comes from the game's skin. The pattern repeats evenly so the left edge matches the right edge and the top edge matches the bottom edge.

### `gear/metal_track_floor.png`

- 용도: 트랙 바닥 타일 (메탈)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1024×1024 · quality medium · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `5GcxcY6lx8SRlfOOcrqK` · generation `fkAYnKhcVi2vabnjqAyq`
- 크레딧: 98.04
- 원본: 1,568,342바이트 · sha256 앞 16자리 `d16836976aabc4c9`
- 후처리: 흑백 · 가로세로 끝 128줄을 겹쳐 섞어 이음새 없앰 · 512×512 · 무늬 세기를 0.5 로 줄이고 평균 밝기를 0.5 로 맞춤(게임에서 트랙 색을 곱하고 평균을 되돌림)
- 고른 이유: 무늬가 옅음(9.4) · 어두운 편(83.8)
- 프롬프트:

  > original rhythm game asset, flat orthographic view, no text, no letters, no logo, no watermark. Style: precise machined metal, satin brushed finish with fine hairline grain, minimal reflections, high contrast. Intended use: a seamlessly tiling floor texture for a rhythm game track, kept dark and quiet so falling notes stay easy to read. A dark neutral grey surface with a fine brushed metal grain running in one direction and faint, evenly spaced panel seams, evenly lit, with no bright spots, no vignette and no objects. Neutral grey only, with no color tint, because the color comes from the game's skin. The pattern repeats evenly so the left edge matches the right edge and the top edge matches the bottom edge.

### `gear/gel_track_floor.png`

- 용도: 트랙 바닥 타일 (젤)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 1024×1024 · quality medium · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `aPs7Jtfzo8oOw1daWv3G` · generation `xzQsv17IKBtha8wHbEEK`
- 크레딧: 98.04
- 원본: 1,042,036바이트 · sha256 앞 16자리 `cd8b88ee239a6076`
- 후처리: 흑백 · 가로세로 끝 128줄을 겹쳐 섞어 이음새 없앰 · 512×512 · 무늬 세기를 0.5 로 줄이고 평균 밝기를 0.5 로 맞춤(게임에서 트랙 색을 곱하고 평균을 되돌림)
- 고른 이유: 이음새 1.1 · 1.1(가장 작음) · 무늬 옅음(3.6)
- 프롬프트:

  > original rhythm game asset, flat orthographic view, no text, no letters, no logo, no watermark. Style: soft translucent gel, rounded shapes glowing gently from inside, smooth highlights, high contrast. Intended use: a seamlessly tiling floor texture for a rhythm game track, kept dark and quiet so falling notes stay easy to read. A dark neutral grey surface with very faint, soft wavy lines, like gentle ripples seen under gel, evenly lit, with no bright spots, no vignette and no objects. Neutral grey only, with no color tint, because the color comes from the game's skin. The pattern repeats evenly so the left edge matches the right edge and the top edge matches the bottom edge.

### `gear/key_beam.png`

- 용도: 키 빔(누르는 동안 레인에 서는 빛) (공용)
- 모델: GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) · 512×1536 · quality high · 기준 이미지 없음
- 날짜: 2026-10-19 03:27 KST
- flow `vt0pAxh60z9JSDqWxub6` (https://elevenlabs.io/app/flows/vt0pAxh60z9JSDqWxub6) · node `so3bOHvGrCO1BM1vOY2m` · generation `J0ZwZCkGTfh4TVVob4FQ`
- 크레딧: 115.45
- 원본: 457,040바이트 · sha256 앞 16자리 `d7046618daf4714e`
- 후처리: 빛이 있는 열만 잘라 흑백으로 · 64×512 · 가산 합성
- 고른 이유: 아래/위 밝기 비가 가장 큼(143.6) · 위로 갈수록 고르게 어두워짐 · 바깥 순흑
- 프롬프트:

  > original rhythm game asset, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Style: clean soft light, high contrast. Intended use: the beam of light that rises in a lane while a key is held in a rhythm game. One vertical column of soft white light, centered and about one third of the image width, brightest and most solid at the very bottom edge and fading smoothly upward until it disappears completely well before the top edge. Soft vertical edges and a gently brighter core, with no sparks and no texture. Neutral white only, with no color tint. Plain pure black (#000000) around it.

### `effects/hit_burst_ring.mp4`

- 용도: 타격 이펙트 '링과 불꽃' 플립북 (글래스 · 메탈)
- 모델: Veo 3.1 Fast (`veo-3.1-fast-generate-001`) · 16:9 · 720p · 4초 · 소리 없음 · enhance_prompt 켬
- 날짜: 2026-10-19 02:54 KST
- flow `MfuOBU1Nwthlry7ExprM` (https://elevenlabs.io/app/flows/MfuOBU1Nwthlry7ExprM) · node `54PkjcDC9JtPpoS99XVe` · generation `j0gJn9xUCL3WBQccHhqg`
- 크레딧: 2,423.76
- 원본: 792,152바이트 · sha256 앞 16자리 `63a7b98b5f6fd4b1`
- 후처리: 가운데 720×720 · 흑백 · 1.55~3.25초를 16칸(4×4, 칸 256) · 밝기 16 아래 순흑 · 칸 가장자리를 둥글게 0(가산 합성에서 네모가 안 보이게)
- 고른 이유: 밝은 빛 뒤로 링이 퍼지고 불꽃이 튀어 타이밍이 또렷함
- negative_prompt: `camera movement, zoom, pan, smoke, fog, haze, dust, background scenery, objects, people, text, letters, logo, watermark, colored light`
- 프롬프트:

  > original rhythm game asset, clean geometric neon style, glossy glass and soft light, high contrast, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Locked-off static camera facing a completely black, empty space; the frame never moves. [00:00-00:01] The whole frame is black. [00:01-00:02] At the exact center of the frame, one single hit flash plays in slow motion: a bright white core flares, a thin glowing ring expands outward with a few short, sharp sparks, then everything fades smoothly away. The flash stays within the central square of the wide frame, and the left and right sides stay black. [00:02-00:04] The whole frame is black again. Pure white light only.

### `effects/hit_burst_glow.mp4`

- 용도: 타격 이펙트 '빛 번짐과 별빛' 플립북 (크리스털 · 젤)
- 모델: Veo 3.1 Fast (`veo-3.1-fast-generate-001`) · 16:9 · 720p · 4초 · 소리 없음 · enhance_prompt 켬
- 날짜: 2026-10-19 02:54 KST
- flow `MfuOBU1Nwthlry7ExprM` (https://elevenlabs.io/app/flows/MfuOBU1Nwthlry7ExprM) · node `mx36WRTZMuLAG4OGZwHN` · generation `VFVcpDWawtpedfyApwbh`
- 크레딧: 2,423.76
- 원본: 527,516바이트 · sha256 앞 16자리 `1224c78f656cf22e`
- 후처리: 가운데 720×720 · 흑백 · 영상이 커지기만 해서 3.3→1.95초를 거꾸로 16칸(크게 번쩍였다가 별빛으로 줄어듦, 칸 256) · 밝기 16 아래 순흑 · 칸 가장자리 둥글게 0
- 고른 이유: 부드러운 번짐과 별빛 — 거꾸로 돌리면 크게 번쩍였다가 줄어듦
- negative_prompt: `camera movement, zoom, pan, smoke, fog, haze, dust, background scenery, objects, people, text, letters, logo, watermark, colored light`
- 프롬프트:

  > original rhythm game asset, clean geometric neon style, glossy glass and soft light, high contrast, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Locked-off static camera facing a completely black, empty space; the frame never moves. [00:00-00:01] The whole frame is black. [00:01-00:02] At the exact center of the frame, one single soft hit flash plays in slow motion: a round bloom of white light swells quickly, a thin four-pointed star glint flashes across it, then the light shrinks and fades smoothly away. The flash stays within the central square of the wide frame, and the left and right sides stay black. [00:02-00:04] The whole frame is black again. Pure white light only.

### `effects/hit_hold_sparks.mp4`

- 용도: 롱노트를 누르는 동안의 불꽃 플립북(반복) (공용)
- 모델: Veo 3.1 Fast (`veo-3.1-fast-generate-001`) · 16:9 · 720p · 4초 · 소리 없음 · enhance_prompt 켬
- 날짜: 2026-10-19 02:54 KST
- flow `MfuOBU1Nwthlry7ExprM` (https://elevenlabs.io/app/flows/MfuOBU1Nwthlry7ExprM) · node `HWIoB8i9B17Dpwv67bPd` · generation `Va3Hl6QGiQPXSkjckXZD`
- 크레딧: 2,423.76
- 원본: 1,323,212바이트 · sha256 앞 16자리 `5c1d3bd17f95fcad`
- 후처리: 가운데 720×720 · 흑백 · 2.0초부터 연속 16프레임(칸 128) · 마지막 4칸을 시작 직전 4프레임과 섞어 이음새 없이 반복 · 밝기 16 아래 순흑 · 칸 가장자리 둥글게 0
- 고른 이유: 한 편만 생성(롱노트 불꽃은 세트 공용)
- negative_prompt: `camera movement, zoom, pan, smoke, fog, haze, dust, background scenery, objects, people, text, letters, logo, watermark, colored light`
- 프롬프트:

  > original rhythm game asset, clean geometric neon style, glossy glass and soft light, high contrast, centered, flat orthographic view, isolated on pure black background, no text, no letters, no logo, no watermark. Locked-off static camera facing a completely black, empty space; the frame never moves. For the whole four seconds, from a small bright point at the bottom of the central square of the frame, a steady stream of tiny white sparks and soft light rises and flickers upward, like energy pouring out of a button that is being held down. The intensity stays the same from start to finish, with no starting or ending burst. Everything stays within the central square of the wide frame, and the left and right sides stay black. Pure white light only.

## 고르지 않은 후보

후보는 모두 위 flow에 남아 있습니다. 탭 노트는 세트마다 4장, 롱노트 몸통은 3~4장, 판정선 · 레일 · 바닥은 세트마다 4장(메탈 레일 3장), 키 빔 4장, 이펙트 영상은 3편(고르지 않은 것 없음)을 만들었습니다. 글래스 판정선 3번과 크리스털 바닥 4번은 늦게 끝나 비교에서 뺐습니다.

## 메카 세트 (`styles/mecha`, 2026-11)

컨셉별 디자인 업그레이드의 첫 세트입니다. 노트 · 롱노트 · 사이드 노트 · 기어 · 타격 이펙트를 그림에서 그립니다(`client/src/render/styleArt.ts`, 그림이 없으면 코드 그림).

- 만든 곳: Google Cloud Vertex AI 의 Gemini 이미지 생성(`gemini-nano-banana-2.1`, 2K) · 사용자의 Google Cloud 프로젝트 · 장당 약 $0.06(토큰 사용량으로 계산한 추정치)
- 순서: ① 컨셉 문서 → ② 컨셉마다 스타일 프레임(게임 한 장면) 3안 → 사용자가 메카는 A안을 고름 → ③ A안을 기준 이미지로 부위별 시트 → ④ 이 저장소의 `scripts/assets/build_styles.py` 가 시트를 잘라 `client/public/media/styles/mecha/` 의 게임 그림으로(값은 스크립트 안에)
- 저장 형식: 생성 결과는 PNG로 받아 두었고, `assets-src/styles/mecha/` 에는 저장소 크기를 줄이려 JPEG(품질 95, 색 정보 줄이지 않음)으로 다시 저장했습니다. PNG의 sha256 앞 16자리를 함께 적습니다.
- 비용: 만든 시트 8장(저장소에 남은 5장과 기어 색을 없애며 지운 3장)과 기준 스타일 프레임, 쓰지 않은 첫 이펙트 시트를 합해 약 $0.63 입니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 그림에 다른 게임의 에셋 · 로고 · 폰트 · UI는 들어가지 않았습니다.
- 프롬프트에 든 다른 게임 이름: ②의 스타일 프레임 프롬프트(아래 `mecha-A.png`)에는 카메라 설명으로 SOUND VOLTEX, 완성도 기준으로 DJMAX RESPECT V · EZ2ON REBOOT : R · SOUND VOLTEX 를 적었습니다("디자인을 베끼지 말 것"이라고 함께 적음). 그 프레임의 기준 이미지는 이 게임의 실제 화면(아케이드 스킨)입니다. ③의 부위별 시트 프롬프트에는 게임 · 회사 · 아티스트 이름이 없습니다.

### 스타일 프레임 `mecha-A.png` (저장소에 넣지 않음, 부위별 시트의 기준 이미지)

- 기준 이미지: 이 게임의 아케이드 스킨 실제 화면(7K+1S)
- 날짜: 2026-11-03 17:01 KST · 약 $0.064
- 프롬프트:

  > Image 1 is a screenshot of the current game in this concept's old skin. Use it ONLY for the camera (a low 3D perspective looking up a tilted track, as in SOUND VOLTEX), the track proportions, the lane layout (one wide scratch lane at the left tinted red, then seven key lanes tinted white, blue, white, gold, white, blue, white), the horizontal judge line near the bottom (77 % down the image) and the gear panel under it. Redraw everything else at a much higher level of finish.
  >
  > A 16:9 gameplay frame of a commercial PC keyboard rhythm game, mid-song. On the track: a three-note chord in one row, single notes, one note in the scratch lane, a long note in a blue lane that is being held (its body is cut off exactly at the judge line and looks brighter), another long note in the gold lane still coming down, and a long scratch note further up the track. Two lanes are being pressed: their key lights in the gear glow in the lane colour, and a hit effect bursts at the judge line in those lanes, spreading mostly downward over the gear and never covering the notes coming down.
  >
  > CONCEPT: MECHA. Keywords: precision-machined, heavy, industrial equipment.
  > - Materials (only these three): horizontally brushed aluminium, black anodised metal, and an LED insert that glows in the lane colour.
  > - Shape grammar: no curves at all; only 45-degree chamfers and right angles; thickness to width 1:4; key-type marks engraved into the plate (a small circle on white keys, a triangle on blue keys, a diamond on the gold key, two slashes on the scratch).
  > - Light: one key light from the top-left: the upper chamfer faces are bright, the lower ones dark; a thin sharp specular line runs along the machined edges; ambient occlusion inside grooves and around bolts.
  > - Tap note: a chamfered aluminium plate with a horizontal LED slit across its middle, which marks the exact moment to hit (the judge point). The plate is neutral metal; only the LED slit and a faint edge tint take the lane colour.
  > - Long note: a machined rail: bevelled metal sides and an LED groove down its middle glowing in the lane colour; its ends are closed by 45-degree chamfered caps of the rail itself (not tap notes).
  > - Hit effect: mechanical: a 2-frame white flash on the judge line, 6 to 8 angular metal shards and straight spark lines thrown down over the gear, a short afterglow.
  > - Gear (below the judge line): a thick gunmetal panel, one recessed square push button per lane whose top lights up in the lane colour when pressed, hexagon bolts, bevelled panel edges; the scratch has a machined turntable disc. Rails: gunmetal beams with a bright machined edge.
  > - Unlike other concepts: hard flat machined faces and razor-thin specular lines, never round, never glassy.
  >
  > Variant: balanced. Follow the concept exactly as written, with a medium amount of detail.
  >
  > Rules: a long note is one continuous body only, with no tap note at its start or end; its ends are closed by the body's own end shape. Every note, long note and key light uses one design in all lanes; only its tint changes with the lane colour, and the key-type mark tells the lanes apart. The track floor is the same very dark, almost black surface in every lane (under 10 % brightness, matte, like the reference), with thin dim lane dividers: never paint a lane floor in a lane colour, in metal or in white, and never let the lanes alternate light and dark like piano keys; the concept's materials belong to the notes, the gear and the rails, not to the track floor; the wide scratch lane's floor is as dark as the others, only its notes are red. Only notes, long notes and key lights carry the lane colours. The two pressed lanes show just a short faint light column rising from the judge line, fading out within a quarter of the track. Keep the track where the reference has it, in the middle of the frame, with the scratch lane as its leftmost lane; the gear panel under the judge line is exactly as wide as the track. The judge line is a crisp white line with a short soft glow, the same as in the reference.
  >
  > Quality bar: the finish of a commercial console or arcade rhythm game such as DJMAX RESPECT V, EZ2ON REBOOT : R or SOUND VOLTEX, used only as a quality reference: do not copy their designs. Crisp edges with painted material detail; three value steps in every element (dark rim, mid body, bright highlight); one key light from the top-left on every part; ambient occlusion in grooves. Notes must read instantly even when small and fast.
  >
  > No text, letters, numbers, HUD, score, combo counter, logos or watermarks anywhere. No characters. No bloom haze, no lens flares, no motion blur, no purple-blue-pink gradient wash, no glassmorphism panels. The area outside the track is plain dark.

### `styles/mecha/notes.jpg`

- 용도: 탭 노트 4개(흰 ○ · 파랑 △ · 금색 ◇ · 스크래치 //) → `styles/mecha/notes.png`
- 크기 · 기준 이미지: 1:1 · 2K · `mecha-A.png`(아래)
- 날짜: 2026-11-03 17:09 KST · 약 $0.060
- 생성 결과(PNG): 3,742,380바이트 · sha256 앞 16자리 `30a7382636bae349` · 저장한 JPEG: 796,112바이트
- 후처리: 노트 4개를 각각 잘라(검은 바탕 → 알파) 1024×210 으로, 한 줄에 하나씩 1024×1024 에 · 밝기 ÷ 0.62 = 레인 색의 양(R), 0.66 넘는 밝기는 흰색 쪽으로(G, 최대 0.8) · 게임은 양 끝 캡과 가운데 표식은 화면에서 그림대로 보이게 두고 그 사이만 레인 폭에 맞게 늘임
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the tap notes, four rows stacked from top to bottom with equal black gaps; each note is about four times as wide as it is tall and fills 90 % of the image width. The note: a machined plate of brushed aluminium with 45-degree chamfered corners and bevelled edges, thickness to width 1:4, and a horizontal LED slit across its middle that marks the judge point. The four notes differ only by a small engraved mark at the centre: row 1 a small circle (white key), row 2 a small triangle (blue key), row 3 a small diamond (gold key), row 4 two short slashes (scratch).
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/mecha/long.jpg`

- 용도: 롱노트 레일(대기 · 누르는 중) → `styles/mecha/long.png`
- 크기 · 기준 이미지: 1:1 · 2K · `mecha-A.png`
- 날짜: 2026-11-03 17:11 KST · 약 $0.063
- 생성 결과(PNG): 3,123,083바이트 · sha256 앞 16자리 `0788044108e2a433` · 저장한 JPEG: 498,968바이트
- 후처리: 두 레일을 같은 폭으로 잘라 몸통(가운데 부분, 위아래를 겹쳐 섞어 이음새 없이 반복) 128×256 과 끝(모서리 깎인 위쪽) 128×48 · 대기는 밝기 ÷ 0.6, 누르는 중은 ÷ 0.55 에 흰색 쪽으로 더 올림 · 레일 밖으로 번진 빛은 버림
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: two long notes of this concept standing upright side by side, each about one fifth of the image wide and 90 % of its height: the left one idle, the right one held (brighter, its inner light flowing). A long note is one continuous body only, with no tap note at either end: a machined rail: bevelled brushed-metal sides and an LED groove down its middle; each end is closed by a 45-degree chamfered cap of the rail itself. Its width is the same as a tap note's.
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/mecha/side.jpg`

- 용도: 사이드 노트(별도 레인의 격자판 · 반쪽 덮기 막대) → `styles/mecha/side.png`
- 크기 · 기준 이미지: 16:9 · 2K · `mecha-A.png`
- 날짜: 2026-11-03 17:11 KST · 약 $0.062
- 생성 결과(PNG): 3,306,816바이트 · sha256 앞 16자리 `4119f347b081ca3f` · 저장한 JPEG: 599,295바이트
- 후처리: 막대는 1024 폭으로(양 끝 금속 블록과 빛나는 관은 불투명, 사이 격자는 알파 0.62 로 비침), 격자판은 512 폭으로 · 게임은 막대의 끝 블록과 격자판의 양 끝을 그대로 두고 막대는 가운데를 늘이고 격자판은 가운데 격자 한 칸을 되풀이
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the side note of this concept, which must not look like a key note: a wide brushed-metal grille plate with horizontal slots and chamfered corners. Top half: the side-lane note, about twice as wide as it is tall. Bottom half: the same side note as a very wide bar (about six times as wide as it is tall) that lies over half of the key lanes: its two long edges are bright and its middle is mostly see-through (drawn darker and fainter).
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/mecha/fx.jpg`

- 용도: 타격 이펙트 요소(섬광 · 파편 고리 · 파편과 불똥 조각 · 용접 불꽃) → `styles/mecha/hit_burst.png`, `hit_hold.png`
- 크기 · 기준 이미지: 1:1 · 2K · 먼저 만든 이펙트 시트(판정선 막대가 그림에 들어가 있어 쓰지 않음, 저장소에 넣지 않음)
- 날짜: 2026-11-03 17:56 KST · 약 $0.065
- 생성 결과(PNG): 4,207,378바이트 · sha256 앞 16자리 `99bcc7141220dfbd` · 저장한 JPEG: 703,928바이트
- 후처리: 칸 사이 옅은 선과 JPEG 잡음 지움 · 타격(16칸, 60fps): 섬광(처음 두 칸이 가장 밝음) + 파편 고리가 퍼지며 느려지고 여섯째 칸부터 흐려짐 + 불똥 줄기 여섯 개가 판정선 아래로 부채꼴로 + 잔광 · 판정선 위로는 짧게만 남김(내려오는 노트를 가리지 않게) · 판정선은 칸 위에서 30 % · 누르는 동안(16칸 반복, 24fps): 용접 불꽃은 그림에서, 아래로 튀는 불똥 72개는 코드로 다시 그려 끊김 없이 반복, 판정선은 위에서 27 %
- 프롬프트:

  > Image 1 is the approved hit effect sheet of the MECHA concept for a commercial PC keyboard rhythm game (machined metal, white-hot welding light, angular metal shards). Redraw its light elements as clean production sprites for compositing, in exactly the same style and level of finish.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO plate, NO frame, NO panel and NO other object anywhere. Only light and the flying metal shards themselves, each with plenty of black around it. Nothing touches the cell edges.
  >
  > Top-left cell: the hit flash at its peak, centred in the cell: a small white-hot core with a soft round glow and twelve to sixteen short, sharp straight rays of different lengths around it.
  > Top-right cell: the burst, centred in the cell: six to eight angular, faceted metal shards flying outward from the centre in a ring, each with a bright edge on its upper-left side, and thin straight spark lines between them; a faint round afterglow in the middle.
  > Bottom-left cell: separate sprites in a loose grid with black gaps between them: six angular metal shards of different sizes and shapes (top three rows), and six straight horizontal spark streaks with a bright head and a soft fading tail (bottom rows).
  > Bottom-right cell: a steady weld glow seen from straight above, centred: a flat, wide, white-hot elliptical spot about twice as wide as it is tall, with short straight sparks shooting outward and down from it.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks.

### `styles/mecha/gear_gunmetal.jpg`

- 용도: 기어 → `styles/mecha/keys.png`, `gear.png`
- 크기 · 기준 이미지: 21:9 · 2K · `mecha-A.png`
- 날짜: 2026-11-03 17:13 KST · 약 $0.067
- 생성 결과(PNG): 3,454,648바이트 · sha256 앞 16자리 `c6faf0b4f4a6ff65` · 저장한 JPEG: 720,181바이트
- 후처리: 건반 캡: 꺼진 □ 캡과 켜진 △ 캡에서 표식을 지워 빈 캡을 만들고 ○ △ ◇ 를 다시 그림(시트의 □ 은 게임 표식에 없어 쓰지 않음), 모서리를 둥글린 사각 알파, 꺼진 캡은 밝기 ÷ 0.7(레인 색을 어둡게), 켜진 캡은 ÷ 0.6 에 흰빛 · 판: 턴테이블 모듈(모서리 깎은 알파)과 건반 아래 띠(볼트 판 두 장과 통풍구)를 실제 색 그대로 · 판의 바탕색 · 테두리색은 시트에서 뽑아 코드가 칠함 · 시트의 빨간 원형 버튼은 레인이 아니어서 쓰지 않음
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the gear panel that sits under the judge line, seen strictly from straight above and flat. It is a wide, shallow panel about five times as wide as it is tall, centred in the image: at its left the scratch module, about 1.6 key modules wide, then seven key modules evenly spaced in one row across the whole rest of the width, each one centred under its own lane, and below the row only a narrow strip of the panel with its edges and hardware: a thick machined gunmetal panel: one recessed square push button per key lane with its engraved lane mark (circle, triangle, circle, diamond, circle, triangle, circle from left to right), a machined turntable disc for the scratch, hexagon bolts, a vent grille, bevelled panel edges. The key modules of the 2nd and 4th key lanes are lit: their light areas glow pure white (the game tints them in the lane colour); the other modules are unlit, dark and neutral. Colourway: dark gunmetal grey anodised metal with bright machined edges (the default).
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

## 클럽 세트 (`styles/club`, 2026-11)

메카 세트와 같은 방법으로 만든 세트입니다. 레코드 노트 · 아크릴 캡슐 롱노트 · 사이드 노트 · DJ 믹서 기어 · 링 타격 이펙트을 그림에서 그립니다(`client/src/render/styleArt.ts`, 그림이 없으면 코드 그림).

- 만든 곳 · 순서 · 저장 형식: 메카 세트와 같습니다(②에서 사용자가 클럽은 C안을 고름).
- 비용: 만든 시트 8장(저장소에 남은 5장과 기어 색을 없애며 지운 3장)과 기준 스타일 프레임, 쓰지 않은 첫 이펙트 시트를 합해 약 $0.62 입니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 그림에 다른 게임의 에셋 · 로고 · 폰트 · UI는 들어가지 않았습니다.
- 프롬프트에 든 다른 게임 이름: ②의 스타일 프레임 프롬프트(아래 `club-C.png`)에만 메카와 같이 카메라 설명으로 SOUND VOLTEX, 완성도 기준으로 DJMAX RESPECT V · EZ2ON REBOOT : R · SOUND VOLTEX 를 적었습니다("디자인을 베끼지 말 것"이라고 함께 적음). 그 프레임의 기준 이미지는 이 게임의 실제 화면(옛 club 스킨)입니다. ③의 부위별 시트 프롬프트에는 게임 · 회사 · 아티스트 이름이 없습니다.

### 스타일 프레임 `club-C.png` (저장소에 넣지 않음, 부위별 시트의 기준 이미지)

- 기준 이미지: 이 게임의 옛 스킨 실제 화면(7K+1S)
- 날짜: 2026-11-03 16:51 KST · 약 $0.066
- 프롬프트:

  > Image 1 is a screenshot of the current game in this concept's old skin. Use it ONLY for the camera (a low 3D perspective looking up a tilted track, as in SOUND VOLTEX), the track proportions, the lane layout (one wide scratch lane at the left tinted red, then seven key lanes tinted white, blue, white, gold, white, blue, white), the horizontal judge line near the bottom (77 % down the image) and the gear panel under it. Redraw everything else at a much higher level of finish.
  >
  > A 16:9 gameplay frame of a commercial PC keyboard rhythm game, mid-song. On the track: a three-note chord in one row, single notes, one note in the scratch lane, a long note in a blue lane that is being held (its body is cut off exactly at the judge line and looks brighter), another long note in the gold lane still coming down, and a long scratch note further up the track. Two lanes are being pressed: their key lights in the gear glow in the lane colour, and a hit effect bursts at the judge line in those lanes, spreading mostly downward over the gear and never covering the notes coming down.
  >
  > CONCEPT: CLUB. Keywords: analogue DJ gear, chrome and rubber, stage lights.
  > - Materials (only these three): matte black rubber, polished chrome, translucent acrylic that glows in the lane colour.
  > - Shape grammar: perfect circles and concentric grooves like a vinyl record; thick chrome rims (12 % of the diameter); everything round, no sharp corners.
  > - Light: one key light from the top-left: a wide soft highlight arc on the upper chrome rim, light diffusing inside the acrylic, no shine on rubber.
  > - Tap note: a translucent acrylic disc in the lane colour inside a chrome rim, with fine concentric grooves and a horizontal reflection band across its middle that marks the judge point.
  > - Long note: an acrylic tube (capsule) in the lane colour with a band of light flowing inside it; its ends are closed by chrome ring ends of the tube itself (not tap notes).
  > - Hit effect: a round shockwave of two or three concentric rings like record grooves spreading over the gear and fading softly.
  > - Gear (below the judge line): a DJ mixer: rubber pads, chrome knobs, fader slots, one round acrylic button per lane lighting up in the lane colour when pressed; the scratch is a vinyl platter with a chrome spindle. Rails: black rubber with a thin chrome strip.
  > - Unlike other concepts: everything is round and concentric, reflections are wide and soft, never faceted, never sharp-edged.
  >
  > Variant: sleek. Slimmer notes, cleaner surfaces with fewer details, sharper value contrast and a minimal gear panel; premium and fast-looking.
  >
  > Rules: a long note is one continuous body only, with no tap note at its start or end; its ends are closed by the body's own end shape. Every note, long note and key light uses one design in all lanes; only its tint changes with the lane colour, and the key-type mark tells the lanes apart. The track floor is the same very dark, almost black surface in every lane (under 10 % brightness, matte, like the reference), with thin dim lane dividers: never paint a lane floor in a lane colour, in metal or in white, and never let the lanes alternate light and dark like piano keys; the concept's materials belong to the notes, the gear and the rails, not to the track floor; the wide scratch lane's floor is as dark as the others, only its notes are red. Only notes, long notes and key lights carry the lane colours. The two pressed lanes show just a short faint light column rising from the judge line, fading out within a quarter of the track. Keep the track where the reference has it, in the middle of the frame, with the scratch lane as its leftmost lane; the gear panel under the judge line is exactly as wide as the track. The judge line is a crisp white line with a short soft glow, the same as in the reference.
  >
  > Quality bar: the finish of a commercial console or arcade rhythm game such as DJMAX RESPECT V, EZ2ON REBOOT : R or SOUND VOLTEX, used only as a quality reference: do not copy their designs. Crisp edges with painted material detail; three value steps in every element (dark rim, mid body, bright highlight); one key light from the top-left on every part; ambient occlusion in grooves. Notes must read instantly even when small and fast.
  >
  > No text, letters, numbers, HUD, score, combo counter, logos or watermarks anywhere. No characters. No bloom haze, no lens flares, no motion blur, no purple-blue-pink gradient wash, no glassmorphism panels. The area outside the track is plain dark.

### `styles/club/notes.jpg`

- 용도: 탭 노트 4개(레이블에 흰 ○ · 파랑 △ · 금색 ◇ · 스크래치 // 가 찍힌 레코드) → `styles/club/notes.png`
- 크기 · 기준 이미지: 1:1 · 2K · `club-C.png`
- 날짜: 2026-11-03 17:15 KST · 약 $0.056
- 생성 결과(PNG): 5,397,181바이트 · sha256 앞 16자리 `6079ac82b7e44a5d` · 저장한 JPEG: 1,170,570바이트
- 후처리: 레코드 4장을 각각 잘라(검은 바탕 → 알파) 왼쪽 위 테두리에 번진 빛은 빼고(오른쪽 아래 절반의 윤곽으로 원을 맞춰 원 밖은 버림) 500×500 으로, 2×2 칸에 · 밝기 ÷ 0.6 = 레인 색의 양(R), 0.7 넘는 밝기는 흰색 쪽으로(G, 최대 0.8) · 게임은 레코드를 판정선에서 둥글게 보이는 깊이로 그림
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the tap notes, a 2 x 2 grid of round notes with equal black gaps, each a perfect circle filling 80 % of its cell. The note: a translucent acrylic disc inside a thick polished chrome rim (12 % of the diameter), with fine concentric grooves like a vinyl record and a horizontal reflection band across its middle that marks the judge point. The four notes differ only by a small engraved mark at the centre: top-left a small circle (white key), top-right a small triangle (blue key), bottom-left a small diamond (gold key), bottom-right two short slashes (scratch).
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/club/long.jpg`

- 용도: 롱노트 캡슐(대기 · 누르는 중) → `styles/club/long.png`
- 크기 · 기준 이미지: 1:1 · 2K · `club-C.png`
- 날짜: 2026-11-03 17:16 KST · 약 $0.059
- 생성 결과(PNG): 3,241,066바이트 · sha256 앞 16자리 `a4d72a8a2a9fc847` · 저장한 JPEG: 476,988바이트
- 후처리: 두 캡슐을 같은 폭으로 잘라 몸통(가운데 부분, 위아래를 겹쳐 섞어 이음새 없이 반복) 128×256 과 끝(둥근 위쪽) 128×78 · 대기는 밝기 ÷ 0.8, 누르는 중은 ÷ 0.62 에 흰색 쪽으로 더 올림
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: two long notes of this concept standing upright side by side, each about one fifth of the image wide and 90 % of its height: the left one idle, the right one held (brighter, its inner light flowing). A long note is one continuous body only, with no tap note at either end: an acrylic tube (capsule) with a band of light flowing inside it; each end is closed by a rounded chrome ring end of the tube itself. Its width is the same as a tap note's.
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/club/side.jpg`

- 용도: 사이드 노트(별도 레인의 짧은 캡슐 · 반쪽 덮기 막대) → `styles/club/side.png`
- 크기 · 기준 이미지: 16:9 · 2K · `club-C.png`
- 날짜: 2026-11-03 17:18 KST · 약 $0.064
- 생성 결과(PNG): 3,051,912바이트 · sha256 앞 16자리 `bcc13d6bcc7428db` · 저장한 JPEG: 561,311바이트
- 후처리: 막대는 1024 폭으로(둥근 양 끝은 불투명, 그 사이 어두운 곳은 알파 0.62 로 비침), 별도 레인 노트는 512 폭으로 · 게임은 둥근 양 끝을 그대로 두고 가운데만 늘임
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the side note of this concept, which must not look like a key note: a wide translucent acrylic bar with rounded ends and a thin chrome edge. Top half: the side-lane note, about twice as wide as it is tall. Bottom half: the same side note as a very wide bar (about six times as wide as it is tall) that lies over half of the key lanes: its two long edges are bright and its middle is mostly see-through (drawn darker and fainter).
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/club/fx.jpg`

- 용도: 타격 이펙트 요소(섬광 · 동심 고리 · 빛 조각 · 빛나는 고리) → `styles/club/hit_burst.png`, `hit_hold.png`
- 크기 · 기준 이미지: 1:1 · 2K · 먼저 만든 이펙트 시트(판정선 막대가 그림에 들어가 있어 쓰지 않음, 저장소에 넣지 않음)
- 날짜: 2026-11-04 08:41 KST · 약 $0.066
- 생성 결과(PNG): 4,188,753바이트 · sha256 앞 16자리 `ba8b08f6c290e635` · 저장한 JPEG: 707,400바이트
- 후처리: 칸 사이 옅은 선과 JPEG 잡음 지움 · 타격(16칸, 60fps): 섬광 + 고리가 퍼지며 느려지고 흐려짐 + 조각 여덟 개가 판정선 아래로 + 잔광 · 판정선 위로는 짧게만 남김 · 판정선은 칸 위에서 30 % · 누르는 동안(16칸 반복, 24fps): 빛나는 고리가 숨 쉬듯 조금씩 커졌다 작아지고 반짝이 조각이 제 박자로 반짝임
- 프롬프트:

  > Image 1 is the approved hit effect sheet of the CLUB concept for a commercial PC keyboard rhythm game (polished chrome, clear acrylic, vinyl record grooves, soft round light). Redraw its light elements as clean production sprites for compositing, in exactly the same style and level of finish.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO horizontal line across a cell, NO plate, NO frame, NO panel and NO other object anywhere. Only light and the elements themselves, each with plenty of black around it. Nothing touches the cell edges, and nothing is cut off by a straight line.
  >
  > Top-left cell: the hit flash at its peak, centred: a soft round white glow with a small bright core and a few soft, short rays.
  > Top-right cell: three or four thin concentric rings of light like the grooves of a record, complete circles centred in the cell, the outer ones fainter.
  > Bottom-left cell: separate sprites in a loose grid with black gaps between them: small round light droplets with a glossy highlight, soft glowing dots of a few sizes, and tiny four-ray glints.
  > Bottom-right cell: a steady soft glowing ring seen from straight above, centred, a little thicker than the top-right rings, with a faint glow inside and outside it.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks.

### `styles/club/gear_black.jpg`

- 용도: 기어 → `styles/club/keys.png`, `gear.png`
- 크기 · 기준 이미지: 21:9 · 2K · `club-C.png`
- 날짜: 2026-11-03 17:19 KST · 약 $0.057
- 생성 결과(PNG): 4,297,947바이트 · sha256 앞 16자리 `f98c25db39a81c6c` · 저장한 JPEG: 776,832바이트
- 후처리: 키 조명: 꺼진 버튼과 켜진 버튼을 각각 좌우 · 위아래가 대칭이 되는 중심에서 원 알파로 잘라 · 판: 턴테이블(원 알파)과 채널 페이더 하나를 실제 색 그대로 · 판의 면 · 테두리 색은 시트에서 뽑아 코드가 칠함(레인마다 채널 띠와 그 사이 홈, 줄 아래에 페이더)
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the gear panel that sits under the judge line, seen strictly from straight above and flat. It is a wide, shallow panel about five times as wide as it is tall, centred in the image: at its left the scratch module, about 1.6 key modules wide, then seven key modules evenly spaced in one row across the whole rest of the width, each one centred under its own lane, and below the row only a narrow strip of the panel with its edges and hardware: a DJ mixer panel of matte black rubber and brushed metal: one round acrylic button per key lane with a small chrome knob above it and a fader slot below it, a vinyl turntable platter with a chrome spindle for the scratch, rubber pads. The key modules of the 2nd and 4th key lanes are lit: their light areas glow pure white (the game tints them in the lane colour); the other modules are unlit, dark and neutral. Colourway: matte black rubber and dark brushed metal with chrome details (the default).
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

## 크리스털 세트 (`styles/crystal`, 매니페스트 이름 `gem`, 2026-11)

메카 세트와 같은 방법으로 만든 세트입니다. 길쭉한 보석 노트 · 프리즘 롱노트 · 사이드 노트 · 크리스털 기어 · 파편 타격 이펙트을 그림에서 그립니다(`client/src/render/styleArt.ts`, 그림이 없으면 코드 그림).

- 만든 곳 · 순서 · 저장 형식: 메카 세트와 같습니다(②에서 사용자가 크리스털은 C안을 고름).
- 비용: 만든 시트 8장(저장소에 남은 5장과 기어 색을 없애며 지운 3장)과 기준 스타일 프레임, 쓰지 않은 첫 이펙트 시트를 합해 약 $0.60 입니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 그림에 다른 게임의 에셋 · 로고 · 폰트 · UI는 들어가지 않았습니다.
- 프롬프트에 든 다른 게임 이름: ②의 스타일 프레임 프롬프트(아래 `crystal-C.png`)에만 메카와 같이 카메라 설명으로 SOUND VOLTEX, 완성도 기준으로 DJMAX RESPECT V · EZ2ON REBOOT : R · SOUND VOLTEX 를 적었습니다("디자인을 베끼지 말 것"이라고 함께 적음). 그 프레임의 기준 이미지는 이 게임의 실제 화면(옛 crystal 스킨)입니다. ③의 부위별 시트 프롬프트에는 게임 · 회사 · 아티스트 이름이 없습니다.

### 스타일 프레임 `crystal-C.png` (저장소에 넣지 않음, 부위별 시트의 기준 이미지)

- 기준 이미지: 이 게임의 옛 스킨 실제 화면(7K+1S)
- 날짜: 2026-11-03 16:53 KST · 약 $0.065
- 프롬프트:

  > Image 1 is a screenshot of the current game in this concept's old skin. Use it ONLY for the camera (a low 3D perspective looking up a tilted track, as in SOUND VOLTEX), the track proportions, the lane layout (one wide scratch lane at the left tinted red, then seven key lanes tinted white, blue, white, gold, white, blue, white), the horizontal judge line near the bottom (77 % down the image) and the gear panel under it. Redraw everything else at a much higher level of finish.
  >
  > A 16:9 gameplay frame of a commercial PC keyboard rhythm game, mid-song. On the track: a three-note chord in one row, single notes, one note in the scratch lane, a long note in a blue lane that is being held (its body is cut off exactly at the judge line and looks brighter), another long note in the gold lane still coming down, and a long scratch note further up the track. Two lanes are being pressed: their key lights in the gear glow in the lane colour, and a hit effect bursts at the judge line in those lanes, spreading mostly downward over the gear and never covering the notes coming down.
  >
  > CONCEPT: CRYSTAL. Keywords: jewellery cut, refraction, cold light.
  > - Materials (only these three): clear cut crystal tinted in the lane colour, a thin silver setting, fine refraction lines inside the crystal.
  > - Shape grammar: symmetrical brilliant cuts; the tap note is a wide four-pointed star (long points to left and right, short points up and down) cut into sharp facets, in a thin silver setting.
  > - Light: one key light from the top-left: neighbouring facets alternate between bright and dark values; refraction glints along the edges; one or two tiny star-shaped sparkles per note, no more.
  > - Tap note: the faceted four-pointed crystal; its central horizontal table facet is the brightest face and marks the judge point.
  > - Long note: a long crystal prism with facets running along it and a beam of light inside; its ends narrow to sharp crystal tips of the prism itself (not tap notes).
  > - Hit effect: the crystal shatters: small facet shards fly down over the gear with four-pointed sparkles and a cold afterglow.
  > - Gear (below the judge line): a sheet of glass over fine silver circuitry, one diamond-shaped crystal light per lane glowing in the lane colour when pressed, frosted glass edges; the scratch is a cut crystal disc. Rails: clear glass edges with a silver line.
  > - Unlike other concepts: transparency and refraction: strong value contrast between facets and pin-point sparkles, never metal-heavy, never neon-glowing.
  >
  > Variant: sleek. Slimmer notes, cleaner surfaces with fewer details, sharper value contrast and a minimal gear panel; premium and fast-looking.
  >
  > Rules: a long note is one continuous body only, with no tap note at its start or end; its ends are closed by the body's own end shape. Every note, long note and key light uses one design in all lanes; only its tint changes with the lane colour, and the key-type mark tells the lanes apart. The track floor is the same very dark, almost black surface in every lane (under 10 % brightness, matte, like the reference), with thin dim lane dividers: never paint a lane floor in a lane colour, in metal or in white, and never let the lanes alternate light and dark like piano keys; the concept's materials belong to the notes, the gear and the rails, not to the track floor; the wide scratch lane's floor is as dark as the others, only its notes are red. Only notes, long notes and key lights carry the lane colours. The two pressed lanes show just a short faint light column rising from the judge line, fading out within a quarter of the track. Keep the track where the reference has it, in the middle of the frame, with the scratch lane as its leftmost lane; the gear panel under the judge line is exactly as wide as the track. The judge line is a crisp white line with a short soft glow, the same as in the reference.
  >
  > Quality bar: the finish of a commercial console or arcade rhythm game such as DJMAX RESPECT V, EZ2ON REBOOT : R or SOUND VOLTEX, used only as a quality reference: do not copy their designs. Crisp edges with painted material detail; three value steps in every element (dark rim, mid body, bright highlight); one key light from the top-left on every part; ambient occlusion in grooves. Notes must read instantly even when small and fast.
  >
  > No text, letters, numbers, HUD, score, combo counter, logos or watermarks anywhere. No characters. No bloom haze, no lens flares, no motion blur, no purple-blue-pink gradient wash, no glassmorphism panels. The area outside the track is plain dark.

### `styles/crystal/notes.jpg`

- 용도: 탭 노트 4개(길쭉하게 깎은 보석, 시트에는 표식이 없어 게임이 가운데에 ○ △ ◇ // 를 새김) → `styles/crystal/notes.png`
- 크기 · 기준 이미지: 1:1 · 2K · `crystal-C.png`
- 날짜: 2026-11-03 17:23 KST · 약 $0.062
- 생성 결과(PNG): 3,713,700바이트 · sha256 앞 16자리 `bd418905a3f0c048` · 저장한 JPEG: 774,103바이트
- 후처리: 보석 4개를 각각 잘라(검은 바탕 → 알파) 1024×253 으로, 한 줄에 하나씩 · 밝기 ÷ 0.7 = 레인 색의 양(R), 0.74 넘는 밝기는 흰색 쪽으로(G, 최대 0.85) · 게임은 보석을 막대 노트 깊이 안에 그림보다 1.75배 두툼하게 그림
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the tap notes, four rows stacked from top to bottom with equal black gaps; each note is about three times as wide as it is tall and fills 80 % of the image width. The note: a clear cut crystal shaped as a wide four-pointed star (long points to the left and right, short points up and down), cut into sharp facets that alternate bright and dark, in a thin silver setting; its central horizontal table facet is the brightest face and marks the judge point; one or two tiny star sparkles. All four are the same note (the game tells the lanes apart by colour and extra points); draw it four times identically.
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/crystal/long.jpg`

- 용도: 롱노트 프리즘(대기 · 누르는 중) → `styles/crystal/long.png`
- 크기 · 기준 이미지: 1:1 · 2K · `crystal-C.png`
- 날짜: 2026-11-03 17:24 KST · 약 $0.056
- 생성 결과(PNG): 3,010,587바이트 · sha256 앞 16자리 `89a2478ab80170a0` · 저장한 JPEG: 437,997바이트
- 후처리: 두 프리즘을 같은 폭으로 잘라 몸통 128×256(이음새 없이 반복)과 끝(뾰족한 위쪽) 128×70 · 대기는 밝기 ÷ 0.7, 누르는 중은 ÷ 0.6 에 흰색 쪽으로 더 올림
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: two long notes of this concept standing upright side by side, each about one fifth of the image wide and 90 % of its height: the left one idle, the right one held (brighter, its inner light flowing). A long note is one continuous body only, with no tap note at either end: a long faceted crystal prism with a beam of light inside; each end narrows to a sharp crystal tip of the prism itself. Its width is the same as a tap note's.
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/crystal/side.jpg`

- 용도: 사이드 노트(별도 레인의 짧은 크리스털 판 · 반쪽 덮기 막대) → `styles/crystal/side.png`
- 크기 · 기준 이미지: 16:9 · 2K · `crystal-C.png`
- 날짜: 2026-11-03 17:24 KST · 약 $0.058
- 생성 결과(PNG): 3,449,642바이트 · sha256 앞 16자리 `53184ab6c7848399` · 저장한 JPEG: 621,981바이트
- 후처리: 막대는 1024 폭으로(양 끝은 불투명, 그 사이 어두운 곳은 알파 0.62 로 비침), 별도 레인 노트는 512 폭으로 · 게임은 양 끝을 그대로 두고 가운데만 늘임
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the side note of this concept, which must not look like a key note: a thin pane of cut glass whose facet edges alone are bright. Top half: the side-lane note, about twice as wide as it is tall. Bottom half: the same side note as a very wide bar (about six times as wide as it is tall) that lies over half of the key lanes: its two long edges are bright and its middle is mostly see-through (drawn darker and fainter).
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/crystal/fx.jpg`

- 용도: 타격 이펙트 요소(섬광 · 파편 고리 · 파편과 반짝이 조각 · 반짝이는 빛) → `styles/crystal/hit_burst.png`, `hit_hold.png`
- 크기 · 기준 이미지: 1:1 · 2K · 먼저 만든 이펙트 시트(판정선 막대가 그림에 들어가 있어 쓰지 않음, 저장소에 넣지 않음)
- 날짜: 2026-11-04 08:42 KST · 약 $0.057
- 생성 결과(PNG): 5,015,814바이트 · sha256 앞 16자리 `aabb32bbb5897116` · 저장한 JPEG: 974,316바이트
- 후처리: 칸 사이 옅은 선과 JPEG 잡음 지움 · 타격(16칸, 60fps): 섬광 + 위로 날아가게 그려진 파편 고리를 뒤집어 기어 쪽으로 + 조각 여덟 개가 판정선 아래로 + 잔광 · 판정선 위로는 짧게만 남김 · 판정선은 칸 위에서 30 % · 누르는 동안(16칸 반복, 24fps): 반짝이는 빛 위에 반짝이 조각이 제 박자로 반짝임
- 프롬프트:

  > Image 1 is the approved hit effect sheet of the CRYSTAL concept for a commercial PC keyboard rhythm game (clear cut crystal, sharp facets, silver, cold sparkling light). Redraw its light elements as clean production sprites for compositing, in exactly the same style and level of finish.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO horizontal line across a cell, NO plate, NO frame, NO panel and NO other object anywhere. Only light and the elements themselves, each with plenty of black around it. Nothing touches the cell edges, and nothing is cut off by a straight line.
  >
  > Top-left cell: the hit flash at its peak, centred: a cold white starburst with a sharp four-pointed star at its core and a few short rays.
  > Top-right cell: the crystal shattering, centred: small faceted crystal shards flying outward in all directions from the centre, with tiny four-pointed sparkles between them and a faint cold glow in the middle.
  > Bottom-left cell: separate sprites in a loose grid with black gaps between them: faceted crystal shards of different sizes and shapes, and four-pointed sparkles of several sizes.
  > Bottom-right cell: a steady cold shimmer seen from straight above, centred: a soft round glow with many tiny sparkles and twinkling four-pointed stars scattered around it.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks.

### `styles/crystal/gear_silver.jpg`

- 용도: 기어 → `styles/crystal/keys.png`, `gear.png`
- 크기 · 기준 이미지: 21:9 · 2K · `crystal-C.png`
- 날짜: 2026-11-03 17:27 KST · 약 $0.057
- 생성 결과(PNG): 3,495,531바이트 · sha256 앞 16자리 `229097b6215fe7f3` · 저장한 JPEG: 759,841바이트
- 후처리: 키 조명: 꺼진 마름모와 켜진 마름모를 각각 대칭이 되는 중심에서 마름모 알파로 잘라(켜진 빛 번짐이 잘리지 않게 칸을 넉넉히) · 판: 보석 원판(원 알파)과 아래쪽 회로 띠를 실제 색 그대로 · 유리 · 바탕 · 테두리 색은 시트에서 뽑아 코드가 칠함(줄 뒤 유리에 빛 줄기, 그 아래 회로 띠)
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the gear panel that sits under the judge line, seen strictly from straight above and flat. It is a wide, shallow panel about five times as wide as it is tall, centred in the image: at its left the scratch module, about 1.6 key modules wide, then seven key modules evenly spaced in one row across the whole rest of the width, each one centred under its own lane, and below the row only a narrow strip of the panel with its edges and hardware: a sheet of thick glass over fine silver circuitry, one diamond-shaped crystal light per key lane, a cut crystal disc for the scratch, frosted glass edges and thin silver frames. The key modules of the 2nd and 4th key lanes are lit: their light areas glow pure white (the game tints them in the lane colour); the other modules are unlit, dark and neutral. Colourway: clear glass over silver circuitry with frosted silver edges (the default).
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

## 네온 세트 (`styles/neon`, 2026-11)

메카 세트와 같은 방법으로 만든 세트입니다. 네온관 별 노트 · 네온관 롱노트 · 사이드 노트 · 네온 기어 · 전기 아크 타격 이펙트을 그림에서 그립니다(`client/src/render/styleArt.ts`, 그림이 없으면 코드 그림).

- 만든 곳 · 순서 · 저장 형식: 메카 세트와 같습니다(②에서 사용자가 네온은 A안을 고름).
- 비용: 만든 시트 8장(저장소에 남은 5장과 기어 색을 없애며 지운 3장)과 기준 스타일 프레임, 쓰지 않은 첫 이펙트 시트를 합해 약 $0.62 입니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 그림에 다른 게임의 에셋 · 로고 · 폰트 · UI는 들어가지 않았습니다.
- 프롬프트에 든 다른 게임 이름: ②의 스타일 프레임 프롬프트(아래 `neon-A.png`)에만 메카와 같이 카메라 설명으로 SOUND VOLTEX, 완성도 기준으로 DJMAX RESPECT V · EZ2ON REBOOT : R · SOUND VOLTEX 를 적었습니다("디자인을 베끼지 말 것"이라고 함께 적음). 그 프레임의 기준 이미지는 이 게임의 실제 화면(옛 neon 스킨)입니다. ③의 부위별 시트 프롬프트에는 게임 · 회사 · 아티스트 이름이 없습니다.

### 스타일 프레임 `neon-A.png` (저장소에 넣지 않음, 부위별 시트의 기준 이미지)

- 기준 이미지: 이 게임의 옛 스킨 실제 화면(7K+1S)
- 날짜: 2026-11-03 16:54 KST · 약 $0.073
- 프롬프트:

  > Image 1 is a screenshot of the current game in this concept's old skin. Use it ONLY for the camera (a low 3D perspective looking up a tilted track, as in SOUND VOLTEX), the track proportions, the lane layout (one wide scratch lane at the left tinted red, then seven key lanes tinted white, blue, white, gold, white, blue, white), the horizontal judge line near the bottom (77 % down the image) and the gear panel under it. Redraw everything else at a much higher level of finish.
  >
  > A 16:9 gameplay frame of a commercial PC keyboard rhythm game, mid-song. On the track: a three-note chord in one row, single notes, one note in the scratch lane, a long note in a blue lane that is being held (its body is cut off exactly at the judge line and looks brighter), another long note in the gold lane still coming down, and a long scratch note further up the track. Two lanes are being pressed: their key lights in the gear glow in the lane colour, and a hit effect bursts at the judge line in those lanes, spreading mostly downward over the gear and never covering the notes coming down.
  >
  > CONCEPT: NEON. Keywords: cyber neon, glowing tubes, city at night.
  > - Materials (only these three): bent neon glass tubes glowing in the lane colour, black glass, printed circuit patterns.
  > - Shape grammar: outlines made of tubes of one constant thickness with rounded ends; the tap note is a five-pointed star drawn as a neon tube outline with a horizontal tube bar across its middle; hexagon patterns.
  > - Light: the core of each tube is the brightest (near white), its sides in the lane colour, with a short glow just outside the tube; the inside of the outline is dark glass.
  > - Tap note: the neon star outline; its horizontal tube bar marks the judge point.
  > - Long note: two parallel neon tubes with a dotted pulse of light running between them; its ends are closed by the rounded tube ends themselves (not tap notes).
  > - Hit effect: an electric arc and a hexagonal pulse expanding over the gear, flickering twice.
  > - Gear (below the judge line): a black glass panel over a hexagonal circuit board, one hexagon tube light per lane glowing in the lane colour when pressed; the scratch is a ring of neon tube. Rails: neon tubes along the track edges.
  > - Unlike other concepts: self-lit lines and hollow outlines (the others are solid objects), dark glass between the lines.
  >
  > Variant: balanced. Follow the concept exactly as written, with a medium amount of detail.
  >
  > Rules: a long note is one continuous body only, with no tap note at its start or end; its ends are closed by the body's own end shape. Every note, long note and key light uses one design in all lanes; only its tint changes with the lane colour, and the key-type mark tells the lanes apart. The track floor is the same very dark, almost black surface in every lane (under 10 % brightness, matte, like the reference), with thin dim lane dividers: never paint a lane floor in a lane colour, in metal or in white, and never let the lanes alternate light and dark like piano keys; the concept's materials belong to the notes, the gear and the rails, not to the track floor; the wide scratch lane's floor is as dark as the others, only its notes are red. Only notes, long notes and key lights carry the lane colours. The two pressed lanes show just a short faint light column rising from the judge line, fading out within a quarter of the track. Keep the track where the reference has it, in the middle of the frame, with the scratch lane as its leftmost lane; the gear panel under the judge line is exactly as wide as the track. The judge line is a crisp white line with a short soft glow, the same as in the reference.
  >
  > Quality bar: the finish of a commercial console or arcade rhythm game such as DJMAX RESPECT V, EZ2ON REBOOT : R or SOUND VOLTEX, used only as a quality reference: do not copy their designs. Crisp edges with painted material detail; three value steps in every element (dark rim, mid body, bright highlight); one key light from the top-left on every part; ambient occlusion in grooves. Notes must read instantly even when small and fast.
  >
  > No text, letters, numbers, HUD, score, combo counter, logos or watermarks anywhere. No characters. No bloom haze, no lens flares, no motion blur, no purple-blue-pink gradient wash, no glassmorphism panels. The area outside the track is plain dark.

### `styles/neon/notes.jpg`

- 용도: 탭 노트 4개(가운데를 관이 가로지르는 네온관 별, 시트에는 표식이 없어 게임이 관 아래에 빛나는 ○ △ ◇ // 를 그림) → `styles/neon/notes.png`
- 크기 · 기준 이미지: 1:1 · 2K · `neon-A.png`
- 날짜: 2026-11-03 17:31 KST · 약 $0.064
- 생성 결과(PNG): 4,167,051바이트 · sha256 앞 16자리 `fb8926b5bbda40c6` · 저장한 JPEG: 828,429바이트
- 후처리: 별 4개를 각각 잘라(검은 바탕 → 알파) 500×488 로, 2×2 칸에 · 밝기 ÷ 0.7 = 레인 색의 양(R), 0.72 넘는 밝기는 흰색 쪽으로(G, 최대 0.85) · 게임은 별을 판정선에서 그림 비율대로 보이는 깊이로 그림
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the tap notes, a 2 x 2 grid of notes with equal black gaps, each filling 80 % of its cell. The note: a five-pointed star drawn as a bent neon glass tube outline of one constant thickness with rounded ends, dark glass inside the outline, and a horizontal tube bar across its middle that marks the judge point; the tube core is near white with a short glow just outside it. All four are the same note (the game tells the lanes apart by colour and extra points); draw it four times identically.
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/neon/long.jpg`

- 용도: 롱노트 네온관(대기 · 누르는 중) → `styles/neon/long.png`
- 크기 · 기준 이미지: 1:1 · 2K · `neon-A.png`
- 날짜: 2026-11-03 17:32 KST · 약 $0.057
- 생성 결과(PNG): 3,311,546바이트 · sha256 앞 16자리 `7206b538946264a2` · 저장한 JPEG: 553,508바이트
- 후처리: 두 관을 같은 폭으로 잘라 몸통 128×256(이음새 없이 반복)과 끝(둥근 위쪽) 128×59 · 관 사이 어두운 유리는 알파 0.55 로 비침 · 대기는 밝기 ÷ 0.72, 누르는 중은 ÷ 0.62 에 흰색 쪽으로 더 올림
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: two long notes of this concept standing upright side by side, each about one fifth of the image wide and 90 % of its height: the left one idle, the right one held (brighter, its inner light flowing). A long note is one continuous body only, with no tap note at either end: two parallel neon tubes with a dotted pulse of light running between them; each end is closed by the rounded tube ends themselves. Its width is the same as a tap note's.
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/neon/side.jpg`

- 용도: 사이드 노트(별도 레인의 짧은 네온관 · 반쪽 덮기 막대) → `styles/neon/side.png`
- 크기 · 기준 이미지: 16:9 · 2K · `neon-A.png`
- 날짜: 2026-11-03 17:32 KST · 약 $0.062
- 생성 결과(PNG): 3,264,946바이트 · sha256 앞 16자리 `b71fbc4e05870f67` · 저장한 JPEG: 608,611바이트
- 후처리: 막대는 1024 폭으로(양 끝은 불투명, 그 사이 어두운 곳은 알파 0.62 로 비침), 별도 레인 노트는 512 폭으로 · 게임은 양 끝을 그대로 두고 가운데만 늘임
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the side note of this concept, which must not look like a key note: two parallel neon tubes forming a wide bar. Top half: the side-lane note, about twice as wide as it is tall. Bottom half: the same side note as a very wide bar (about six times as wide as it is tall) that lies over half of the key lanes: its two long edges are bright and its middle is mostly see-through (drawn darker and fainter).
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/neon/fx.jpg`

- 용도: 타격 이펙트 요소(섬광 · 육각 고리 · 불꽃 조각 · 전기 아크) → `styles/neon/hit_burst.png`, `hit_hold.png`
- 크기 · 기준 이미지: 1:1 · 2K · 먼저 만든 이펙트 시트(판정선 막대가 그림에 들어가 있어 쓰지 않음, 저장소에 넣지 않음)
- 날짜: 2026-11-04 08:42 KST · 약 $0.055
- 생성 결과(PNG): 4,332,614바이트 · sha256 앞 16자리 `03d2eba5b3b0f56a` · 저장한 JPEG: 746,393바이트
- 후처리: 칸 사이 옅은 선과 JPEG 잡음 지움 · 타격(16칸, 60fps): 섬광 + 고리가 퍼지며 흐려짐 + 조각 여덟 개가 판정선 아래로 + 잔광, 네온처럼 깜빡임 · 판정선 위로는 짧게만 남김 · 판정선은 칸 위에서 30 % · 누르는 동안(16칸 반복, 24fps): 전기 아크를 칸마다 좌우로 뒤집고 조금씩 옮기며 깜빡이게
- 프롬프트:

  > Image 1 is the approved hit effect sheet of the NEON concept for a commercial PC keyboard rhythm game (bent neon glass tubes, electric arcs, hexagons, dark glass). Redraw its light elements as clean production sprites for compositing, in exactly the same style and level of finish.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO horizontal line across a cell, NO plate, NO frame, NO panel and NO other object anywhere. Only light and the elements themselves, each with plenty of black around it. Nothing touches the cell edges, and nothing is cut off by a straight line.
  >
  > Top-left cell: the hit flash at its peak, centred: a bright white core with a small hexagon outline of neon light around it and short sparks.
  > Top-right cell: an expanding hexagonal pulse, centred: one large hexagon outline drawn as a neon tube of light of one constant thickness, complete on all six sides, with short jagged electric arcs crackling along it.
  > Bottom-left cell: separate sprites in a loose grid with black gaps between them: short jagged electric arc segments of a few lengths, small hexagon sparks, and small bright dots.
  > Bottom-right cell: a steady crackling electric glow seen from straight above, centred: a short horizontal band of jagged electric arcs, about three times as wide as it is tall, with a bright core in its middle.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks.

### `styles/neon/gear_black.jpg`

- 용도: 기어 → `styles/neon/keys.png`, `gear.png`
- 크기 · 기준 이미지: 21:9 · 2K · `neon-A.png`
- 날짜: 2026-11-03 17:33 KST · 약 $0.065
- 생성 결과(PNG): 3,960,488바이트 · sha256 앞 16자리 `2a017d72fd539e24` · 저장한 JPEG: 830,680바이트
- 후처리: 키 조명: 꺼진 육각과 켜진 육각을 각각 대칭이 되는 중심에서 꼭짓점이 위아래인 육각 알파로 잘라 · 판: 링 모듈(판 윤곽대로 깎은 육각 알파, 판의 자리를 재어 자름)과 아래쪽 회로 띠를 실제 색 그대로 · 회로판 · 테두리 색은 시트에서 뽑아 코드가 칠함
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the gear panel that sits under the judge line, seen strictly from straight above and flat. It is a wide, shallow panel about five times as wide as it is tall, centred in the image: at its left the scratch module, about 1.6 key modules wide, then seven key modules evenly spaced in one row across the whole rest of the width, each one centred under its own lane, and below the row only a narrow strip of the panel with its edges and hardware: a black glass panel over a hexagonal printed circuit board, one hexagon-shaped neon tube light per key lane, a ring of neon tube for the scratch, thin metal frames. The key modules of the 2nd and 4th key lanes are lit: their light areas glow pure white (the game tints them in the lane colour); the other modules are unlit, dark and neutral. Colourway: black glass over a dark circuit board with dark chrome frames (the default).
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

## 피아노 세트 (`styles/piano`, 2026-11)

그랜드 피아노 기어를 그림으로 다시 그리고, 피아노 노트 계열(건반 앞판 노트 · 래커 건반 롱노트 · 사이드 노트)과 음표가 터지는 타격 효과를 더한 세트입니다. 노트 피아노 · 기어 그랜드 피아노 · 타격 효과 피아노 음표를 고르면 한 벌로 그립니다(`client/src/render/styleArt.ts`, 그림이 없으면 코드 그림).

- 만든 곳 · 순서 · 저장 형식: 메카 세트와 같습니다. 다만 ②의 스타일 프레임 3안(정석 · 화려하게 · 날렵하게) 중 A안(정석)은 사용자가 아니라 작업자가 골랐습니다(노트의 황동 상감선과 표식이 가장 또렷해서).
- 비용: 만든 9장(저장소에 남은 시트 5장과 기어 색을 없애며 지운 시트 3장 · 마호가니 결)과 기준 스타일 프레임을 합해 약 $0.62, 고르지 않은 스타일 프레임 2장이 약 $0.13 입니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 그림에 다른 게임의 에셋 · 로고 · 폰트 · UI는 들어가지 않았습니다.
- 프롬프트에 든 다른 게임 이름: ②의 스타일 프레임 프롬프트(아래 `piano-A.png`)에만 메카와 같이 카메라 설명으로 SOUND VOLTEX, 완성도 기준으로 DJMAX RESPECT V · EZ2ON REBOOT : R · SOUND VOLTEX 를 적었습니다("디자인을 베끼지 말 것"이라고 함께 적음). 그 프레임의 기준 이미지는 이 게임의 실제 화면(코드로 그린 그랜드 피아노 기어)입니다. ③의 시트와 나무결 프롬프트에는 게임 · 회사 · 아티스트 이름이 없습니다.

### 스타일 프레임 `piano-A.png` (저장소에 넣지 않음, 부위별 시트의 기준 이미지)

- 기준 이미지: 이 게임의 기본 스킨에 코드로 그린 그랜드 피아노 기어 화면(7K+1S)
- 날짜: 2026-11-04 11:39 KST · 약 $0.071
- 프롬프트:

  > Image 1 is a screenshot of the current game in this concept's old skin. Use it ONLY for the camera (a low 3D perspective looking up a tilted track, as in SOUND VOLTEX), the track proportions, the lane layout (one wide scratch lane at the left tinted red, then seven key lanes tinted white, blue, white, gold, white, blue, white), the horizontal judge line near the bottom (77 % down the image) and the gear panel under it. Redraw everything else at a much higher level of finish.
  >
  > A 16:9 gameplay frame of a commercial PC keyboard rhythm game, mid-song. On the track: a three-note chord in one row, single notes, one note in the scratch lane, a long note in a blue lane that is being held (its body is cut off exactly at the judge line and looks brighter), another long note in the gold lane still coming down, and a long scratch note further up the track. Two lanes are being pressed: their key lights in the gear glow in the lane colour, and a hit effect bursts at the judge line in those lanes, spreading mostly downward over the gear and never covering the notes coming down.
  >
  > CONCEPT: PIANO. Keywords: concert grand piano, mirror-polished lacquer, ivory and brass, elegant and warm.
  > - Materials (only these three): mirror-polished black piano lacquer, warm ivory enamel and polished brass; a thin strip of deep red felt is the only accent, in the gear only.
  > - Shape grammar: the proportions of piano keys: long flat slabs with softly rounded front edges (corner radius about 10 % of their height) and a fine bevel; thin brass inlay lines and pinstripes; long clean horizontal lines; no chamfers and no circles, except brass knobs and the scratch dial.
  > - Light: one key light from the top-left: a long crisp mirror reflection band across the lacquer, a soft satin sheen on the ivory, small bright glints on the brass.
  > - Tap note: a wide slab like the front of a piano key: enamel in the lane colour with a softly rounded front edge and a fine bevel, a thin brass inlay line across its middle that marks the judge point, and the key-type mark inlaid in brass at its centre (a small circle on white keys, a triangle on blue keys, a diamond on the gold key, two slashes on the scratch).
  > - Long note: a long lacquered key body in the lane colour with a brass inlay line down its middle; its ends are closed by rounded key-front caps of the body itself (not tap notes); while held, light runs along the inlay.
  > - Hit effect: a short soft white flash on the judge line and a few glints, like light catching a lacquered lid.
  > - Gear (below the judge line): a concert grand keybed: a mirror-polished black lacquer key slip with a thin brass pinstripe along its top edge, one large ivory key front per lane set into the lacquer, which lights up in the lane colour when pressed; a thin strip of deep red felt under the row of keys; the scratch is a polished brass rotary dial with fine knurling in a round lacquered housing. Rails: polished black lacquer with a thin brass edge.
  > - Unlike other concepts: warm and classical: deep mirror lacquer reflections, ivory and fine brass inlay, softly rounded key edges (not machined, not round discs, not faceted crystal, not neon tubes).
  >
  > Variant: balanced. Follow the concept exactly as written, with a medium amount of detail.
  >
  > Rules: a long note is one continuous body only, with no tap note at its start or end; its ends are closed by the body's own end shape. Every note, long note and key light uses one design in all lanes; only its tint changes with the lane colour, and the key-type mark tells the lanes apart. The track floor is the same very dark, almost black surface in every lane (under 10 % brightness, matte, like the reference), with thin dim lane dividers: never paint a lane floor in a lane colour, in metal or in white, and never let the lanes alternate light and dark like piano keys; the concept's materials belong to the notes, the gear and the rails, not to the track floor; the wide scratch lane's floor is as dark as the others, only its notes are red. Only notes, long notes and key lights carry the lane colours. The two pressed lanes show just a short faint light column rising from the judge line, fading out within a quarter of the track. Keep the track where the reference has it, in the middle of the frame, with the scratch lane as its leftmost lane; the gear panel under the judge line is exactly as wide as the track. The judge line is a crisp white line with a short soft glow, the same as in the reference.
  >
  > Quality bar: the finish of a commercial console or arcade rhythm game such as DJMAX RESPECT V, EZ2ON REBOOT : R or SOUND VOLTEX, used only as a quality reference: do not copy their designs. Crisp edges with painted material detail; three value steps in every element (dark rim, mid body, bright highlight); one key light from the top-left on every part; ambient occlusion in grooves. Notes must read instantly even when small and fast.
  >
  > No text, letters, numbers, HUD, score, combo counter, logos or watermarks anywhere. No characters. No bloom haze, no lens flares, no motion blur, no purple-blue-pink gradient wash, no glassmorphism panels. The area outside the track is plain dark.

### `styles/piano/notes.jpg`

- 용도: 탭 노트 4개(건반 앞판에 황동 상감선, 가운데 황동 표식 ○ △ ◇ //) → `styles/piano/notes.png`
- 크기 · 기준 이미지: 1:1 · 2K · `piano-A.png`
- 날짜: 2026-11-04 11:42 KST · 약 $0.065
- 생성 결과(PNG): 3,539,302바이트 · sha256 앞 16자리 `226601dfb4b982be` · 저장한 JPEG: 625,247바이트
- 후처리: 앞판 4개를 각각 잘라(검은 바탕 → 알파) 1024×200 으로, 한 줄에 하나씩 · 밝기 ÷ 0.72 = 레인 색의 양(R), 0.86 넘는 밝기는 흰색 쪽으로(G, 최대 0.85) · 황동(그림에서 유일하게 따뜻한 색: 빨강 − 파랑으로 찾음)은 레인 색에서 흰색 쪽으로 0.8 올려 밝은 상감으로 · 게임은 둥근 양 끝과 가운데 표식을 그대로 두고 그 사이 상감선만 늘임
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the tap notes, four rows stacked from top to bottom with equal black gaps; each note is about four times as wide as it is tall and fills 90 % of the image width. The note: a wide slab like the front of a piano key: smooth glossy enamel with softly rounded corners and a fine bevel, a thin polished brass inlay line running across its whole width through its middle, which marks the judge point, and the key-type mark inlaid in brass at its centre. The four notes differ only by a small engraved mark at the centre: row 1 a small circle (white key), row 2 a small triangle (blue key), row 3 a small diamond (gold key), row 4 two short slashes (scratch).
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/piano/long.jpg`

- 용도: 롱노트(대기 · 누르는 중) → `styles/piano/long.png`
- 크기 · 기준 이미지: 1:1 · 2K · `piano-A.png`
- 날짜: 2026-11-04 11:42 KST · 약 $0.061
- 생성 결과(PNG): 2,950,718바이트 · sha256 앞 16자리 `c9743495010a13b1` · 저장한 JPEG: 458,254바이트
- 후처리: 두 몸통을 같은 폭으로 잘라 몸통 128×256(이음새 없이 반복)과 끝(둥근 위쪽) 128×57 · 대기는 밝기 ÷ 0.75, 누르는 중은 ÷ 0.62 · 황동 상감선은 노트처럼 밝게
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: two long notes of this concept standing upright side by side, each about one fifth of the image wide and 90 % of its height: the left one idle, the right one held (brighter, light running along its inlay). A long note is one continuous body only, with no tap note at either end: a long lacquered key body with softly rounded edges and a thin polished brass inlay line down its middle; each end is closed by a softly rounded key-front cap of the body itself. Its width is the same as a tap note's.
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/piano/side.jpg`

- 용도: 사이드 노트(별도 레인의 짧은 금속 막대 · 반쪽 덮기 막대) → `styles/piano/side.png`
- 크기 · 기준 이미지: 16:9 · 2K · `piano-A.png`
- 날짜: 2026-11-04 11:43 KST · 약 $0.063
- 생성 결과(PNG): 2,951,920바이트 · sha256 앞 16자리 `63ce32776cc54583` · 저장한 JPEG: 470,868바이트
- 후처리: 막대는 1024 폭으로(둥근 양 끝은 불투명, 그 사이 어두운 곳은 알파 0.62 로 비침), 별도 레인 노트는 512 폭으로 · 게임은 양 끝을 그대로 두고 가운데만 늘임
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the side note of this concept, which must not look like a key note: a polished brass pedal bar with softly rounded ends, a fine bevel and a thin engraved line along its length. Top half: the side-lane note, about twice as wide as it is tall. Bottom half: the same side note as a very wide bar (about six times as wide as it is tall) that lies over half of the key lanes: its two long edges are bright and its middle is mostly see-through (drawn darker and fainter).
  >
  > Colour: draw it for a lane whose colour is neutral white. Every surface that would take a lane colour is drawn in neutral greys and white instead, with no hue at all, so the game can tint it with any lane colour later; glowing parts are near white.
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

### `styles/piano/fx.jpg`

- 용도: 타격 이펙트 요소(섬광 · 음파 고리 · 음표 조각 · 음표가 떠 있는 빛) → `styles/piano/hit_burst.png`, `hit_hold.png`
- 크기 · 기준 이미지: 1:1 · 2K · `piano-A.png`
- 날짜: 2026-11-04 11:45 KST · 약 $0.060
- 생성 결과(PNG): 3,595,807바이트 · sha256 앞 16자리 `d40be8edafe45de3` · 저장한 JPEG: 562,820바이트
- 후처리: 칸 사이 옅은 선과 JPEG 잡음 지움 · 타격(16칸, 60fps): 섬광 + 음파 고리가 퍼지며 흐려짐 + 음표 여덟 개가 바로 선 채로 판정선 아래로 튀어 나감 + 잔광 · 판정선 위로는 짧게만 남김 · 판정선은 칸 위에서 30 % · 누르는 동안(16칸 반복, 24fps): 빛과 그 둘레의 음표가 숨 쉬듯, 음표 조각이 제 박자로 반짝임
- 프롬프트:

  > Image 1 is the approved style frame of the PIANO concept for a commercial PC keyboard rhythm game (mirror-polished black lacquer, ivory and polished brass, warm and elegant). Draw the light elements of its hit effect as clean production sprites for compositing, in the same level of finish: when a note is hit, glowing musical notes burst out of the hit.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO horizontal line across a cell, NO staff lines, NO plate, NO frame, NO panel and NO other object anywhere. Only light and the elements themselves, each with plenty of black around it. Nothing touches the cell edges, and nothing is cut off by a straight line.
  >
  > Top-left cell: the hit flash at its peak, centred: a soft round white glow with a small bright core and a few fine sparkling rays.
  > Top-right cell: a soft round sound-wave ring of light, a complete circle centred in the cell, with two fainter echo rings just outside it.
  > Bottom-left cell: separate sprites in a loose grid with black gaps between them: glowing musical note symbols drawn as bright filled silhouettes with a soft glow (single eighth notes, beamed pairs of eighth notes, quarter notes and a few sixteenth notes), in a few sizes, all upright, plus a few tiny four-ray glints.
  > Bottom-right cell: a steady soft glow seen from straight above, centred, a little wider than it is tall, with a few small glowing musical note symbols floating around it.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks (musical note symbols are fine).

### `styles/piano/gear_ebony.jpg`

- 용도: 기어 → `styles/piano/keys.png`, `gear.png`
- 크기 · 기준 이미지: 21:9 · 2K · `piano-A.png`
- 날짜: 2026-11-04 11:43 KST · 약 $0.067
- 생성 결과(PNG): 3,967,346바이트 · sha256 앞 16자리 `b84e4c88540f8706` · 저장한 JPEG: 778,466바이트
- 후처리: 건반: 쉬는 건반과 켜진 건반을 각각 잘라 모서리를 둥글린 사각 알파로, 길쭉한 가운데만 줄여 게임의 건반 칸 비율로(둥근 위아래 끝은 그대로) · 쉬는 건반은 아이보리 음영 그대로(게임이 아이보리색으로 칠함), 켜진 건반은 레인 색에 가장 밝은 가운데만 흰빛 · 판: 황동 다이얼(조금 세로로 길게 그려져 잘라낸 뒤 원으로)을 실제 색 그대로 · 래커 · 황동 핀스트라이프 · 펠트 색은 시트에서 뽑아 코드가 칠함(래커의 반사, 판정선 아래와 건반 위 황동 줄, 건반 밑 어두운 바닥과 앞쪽 펠트) · 시트의 건반은 10개라 하나씩만 씀
- 프롬프트:

  > Image 1 is the approved style frame of this concept for a commercial PC keyboard rhythm game. Match its design language exactly: the same shapes, materials, bevels, light and level of finish. Now draw production art of one part of it, as a game asset sheet.
  >
  > ASSET: the gear panel that sits under the judge line, seen strictly from straight above and flat. It is a wide, shallow panel about five times as wide as it is tall, centred in the image: at its left the scratch module, about 1.6 key modules wide, then seven key modules evenly spaced in one row across the whole rest of the width, each one centred under its own lane, and below the row only a narrow strip of the panel with its edges and hardware: a concert grand piano keybed: a mirror-polished lacquer panel with thin brass pinstripes along its top and bottom edges; one large ivory key front per key lane set into the lacquer, each with softly rounded corners and a fine bevel, neighbouring key fronts separated by a thin dark gap; for the scratch a polished brass rotary dial with fine knurling in a round lacquered housing; a thin strip of deep red felt under the row of keys. The key modules of the 2nd and 4th key lanes are lit: their key fronts glow pure white (the game tints them in the lane colour); the other keys are unlit ivory. Colourway: mirror-polished black piano lacquer (ebony) with ivory keys and polished brass (the default).
  >
  > View and output: strictly orthographic and straight top-down, with no perspective at all, every object flat and facing the viewer. Pure black background (#000000), no shadow cast onto it. Objects centred with even margins. Crisp clean edges with painted material detail at high resolution; one key light from the top-left on every object; three value steps in every element (dark rim, mid body, bright highlight). No text, letters, numbers, labels, logos or watermarks.

## 없앤 기어 색 (2026-11-04)

기어 색 설정을 없애며(기어마다 한 가지 모습, 기본 색) 기본 색이 아닌 기어 시트와 나무결을 `assets-src/` 에서 지웠습니다. 기록만 남깁니다(만든 곳 · 방법은 각 세트와 같음, 모두 기본 색 시트를 기준 이미지로 색만 바꾸게 한 생성이고 나무결 둘은 기준 이미지 없음). 지운 17장은 합해 약 $1.01 이고, 이 비용은 위 세트별 합계에 들어 있습니다.

| 지운 파일 | 색 | 날짜 | 비용 | 생성 PNG sha256 앞 16자리 |
|---|---|---|---|---|
| `styles/mecha/gear_white.jpg` | 화이트 세라믹 | 2026-11-03 17:13 KST | 약 $0.065 | `e3cb8ac0e14b62e4` |
| `styles/mecha/gear_red.jpg` | 레드 아노다이징 | 2026-11-03 17:14 KST | 약 $0.060 | `88bba203c56d5292` |
| `styles/mecha/gear_blue.jpg` | 코발트 블루 | 2026-11-03 17:15 KST | 약 $0.058 | `1396c8a43571f128` |
| `styles/club/gear_white.jpg` | 화이트 | 2026-11-03 17:20 KST | 약 $0.059 | `fefdc3edd5cfab99` |
| `styles/club/gear_silver.jpg` | 실버 브러시드 | 2026-11-03 17:21 KST | 약 $0.064 | `81390b9bd145e08d` |
| `styles/club/gear_walnut.jpg` | 월넛 우드 | 2026-11-03 17:22 KST | 약 $0.061 | `fbb972c2dac8a062` |
| `styles/club/walnut_veneer.jpg` | 월넛 결 | 2026-11-04 11:42 KST | 약 $0.056 | `b04db82d957a6ec6` |
| `styles/crystal/gear_rosegold.jpg` | 로즈 골드 | 2026-11-03 17:28 KST | 약 $0.058 | `783e4a73fb76cbca` |
| `styles/crystal/gear_gold.jpg` | 골드 | 2026-11-03 17:28 KST | 약 $0.059 | `cbd0446a08e83f67` |
| `styles/crystal/gear_smoke.jpg` | 스모크 블랙 | 2026-11-03 17:29 KST | 약 $0.061 | `fb7dfcf817ab1ec5` |
| `styles/neon/gear_carbon.jpg` | 카본 | 2026-11-03 17:34 KST | 약 $0.063 | `4c883986256294f2` |
| `styles/neon/gear_navy.jpg` | 딥 네이비 | 2026-11-03 17:35 KST | 약 $0.061 | `5fdc3b525a364a69` |
| `styles/neon/gear_burgundy.jpg` | 버건디 골드 | 2026-11-03 17:36 KST | 약 $0.057 | `aef0bd34983c86ea` |
| `styles/piano/gear_white.jpg` | 화이트 래커 | 2026-11-04 11:44 KST | 약 $0.063 | `2fb077cfd5da7a4c` |
| `styles/piano/gear_mahogany.jpg` | 마호가니 | 2026-11-04 11:44 KST | 약 $0.057 | `38ecbe15a27626d6` |
| `styles/piano/gear_emerald.jpg` | 에메랄드 그린 | 2026-11-04 11:45 KST | 약 $0.060 | `65dbe80ce9536e97` |
| `styles/piano/mahogany_veneer.jpg` | 마호가니 결 | 2026-11-04 11:47 KST | 약 $0.052 | `4f42c4dd26d057a6` |

## 타격 효과 (`styles/hits`, 2026-11)

어느 세트에도 속하지 않는 타격 효과 넷(플래시 · 플레어 · 거품 · LED 그리드)을 코드 그림 대신 그림으로 그린 것입니다. 세트의 효과처럼 시트 한 장(섬광 | 고리 | 조각 | 누르는 동안의 빛)을 `scripts/assets/build_styles.py` 가 플립북 두 장(치는 순간 · 누르는 동안)으로 만듭니다(`client/public/media/styles/hits/`, 그림이 없으면 코드 그림).

- 만든 곳: Google Cloud Vertex AI의 Gemini 이미지 모델(메카 세트와 같음) · 1:1 · 2K · 기준 이미지 없이.
- 순서: 효과마다 두 장을 만들어 작업자가 하나씩 골랐습니다(플래시는 1안 — 2안은 섬광 둘레에 딱딱한 원판이 보여서, 플레어는 2안 — 별빛과 누르는 동안의 빛이 더 고르게 빛나서, 거품은 1안 — 2안은 터지는 고리가 점선처럼 보여서, LED 그리드는 1안 — LED 낱알이 서로 떨어져 있어 격자로 놓기 좋아서).
- 비용: 저장소에 넣은 4장이 약 $0.25, 고르지 않은 4장이 약 $0.24 입니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 프롬프트에 게임 · 회사 · 아티스트 이름은 없습니다.

### `styles/hits/flash.jpg`

- 용도: 타격 효과 플래시 → `styles/hits/flash_burst.png`(치는 순간), `flash_hold.png`(롱노트를 누르는 동안)
- 크기 · 기준 이미지: 1:1 · 2K · 없음 (1안)
- 날짜: 2026-11-04 14:02 KST · 약 $0.062
- 생성 결과(PNG): 3,483,877바이트 · sha256 앞 16자리 `7777995129c2edb6` · 저장한 JPEG: 497,971바이트
- 후처리: 칸 사이 옅은 선과 JPEG 잡음 지움 · 타격(16칸, 60fps): 빛줄기 섬광이 판정선에서 퍼지며 흐려짐 + 충격파 고리가 기어 위로 퍼짐 + 반짝임 여덟 개가 판정선 아래로 튐 + 잔광 · 판정선 위로는 짧게만 남김 · 누르는 동안(16칸 반복, 24fps): 타원 빛이 숨 쉬듯, 그 위에 반짝임이 제 박자로
- 프롬프트:

  > A hit effect for a commercial PC keyboard rhythm game: the track is seen from above, and when a note reaches the judge line and is hit, this effect plays at that spot, lying flat on the track. Draw the light elements of the effect as clean production sprites for compositing, at the finish level of the effects of a top commercial rhythm game: crisp, refined and luminous, never cartoonish or blurry.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, with no colour at all, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO plate, NO frame, NO panel, NO cell borders or dividing lines and NO other object anywhere. Only light and the elements themselves, each with plenty of black around it. Nothing touches the cell edges, and nothing is cut off by a straight line.
  >
  > THE EFFECT: FLASH, a clean and punchy burst of pure light.
  >
  > Top-left cell: the flash at its peak, centred: a hot white core inside a soft round bloom a little wider than it is tall, with many short, fine, soft rays radiating evenly all around it like a starburst glow, fading smoothly into black. Its glow fills about half of the cell.
  > Top-right cell: a shockwave: one thin, crisp, bright ring of light, a complete circle centred in the cell with a diameter of about 70 % of the cell, sharp on its outer edge and fading softly toward its inside; the middle of the ring is black.
  > Bottom-left cell: separate small sprites in a loose grid with black gaps between them: tiny sparkling glints (four-ray stars with long, thin, sharp rays), small soft round dots of light and a few short tapered streaks of light like sparks, in a few sizes.
  > Bottom-right cell: a steady glow seen from straight above, centred: a soft bright oval of light a little wider than it is tall, with a hot core and a gentle bloom, no rays.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks.

### `styles/hits/flare.jpg`

- 용도: 타격 효과 플레어 → `styles/hits/flare_burst.png`(치는 순간), `flare_hold.png`(롱노트를 누르는 동안)
- 크기 · 기준 이미지: 1:1 · 2K · 없음 (2안)
- 날짜: 2026-11-04 14:04 KST · 약 $0.061
- 생성 결과(PNG): 3,069,478바이트 · sha256 앞 16자리 `127dd566ba23d0c0` · 저장한 JPEG: 399,675바이트
- 후처리: 타격: 4방향 별빛이 판정선에서 번쩍 + 가로 렌즈 줄기가 레인을 가로질러 늘어나며 흐려짐 + 별빛 조각이 줄기를 따라 양옆 아래로 튐 + 잔광 · 시트의 렌즈 고스트(고리 · 원판)는 기어 위에 엉뚱한 원으로 보여 쓰지 않음 · 누르는 동안: 별빛이 옅은 줄기 위에서 반짝이며 조금씩 흔들림
- 프롬프트:

  > A hit effect for a commercial PC keyboard rhythm game: the track is seen from above, and when a note reaches the judge line and is hit, this effect plays at that spot, lying flat on the track. Draw the light elements of the effect as clean production sprites for compositing, at the finish level of the effects of a top commercial rhythm game: crisp, refined and luminous, never cartoonish or blurry.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, with no colour at all, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO plate, NO frame, NO panel, NO cell borders or dividing lines and NO other object anywhere. Only light and the elements themselves, each with plenty of black around it. Nothing touches the cell edges, and nothing is cut off by a straight line.
  >
  > THE EFFECT: FLARE, an anamorphic lens flare struck by the hit.
  >
  > Top-left cell: the flare at its peak, centred: a brilliant four-point star with thin, sharp rays (the horizontal pair much longer than the vertical pair) around a hot white core, and through its centre a long, very thin horizontal lens streak that reaches almost to the left and right edges of the cell without touching them, brightest in the middle and fading toward its ends.
  > Top-right cell: a long horizontal lens streak alone, through the centre of the cell: a thin bright line of light, brightest in the middle, tapering and fading smoothly toward both ends, with a faint soft haze just above and below it; it reaches almost to the left and right edges without touching them.
  > Bottom-left cell: separate sprites in a loose grid with black gaps between them: small four-point and six-point star glints with fine sharp rays, and a few soft lens ghosts (small round discs, hollow rings and hexagons of faint light), in a few sizes.
  > Bottom-right cell: a steady small four-point star seen from straight above, centred, with a short horizontal streak through it and a soft round glow around it.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks.

### `styles/hits/bubbles.jpg`

- 용도: 타격 효과 거품 → `styles/hits/bubbles_burst.png`(치는 순간), `bubbles_hold.png`(롱노트를 누르는 동안)
- 크기 · 기준 이미지: 1:1 · 2K · 없음 (1안)
- 날짜: 2026-11-04 14:02 KST · 약 $0.060
- 생성 결과(PNG): 4,078,978바이트 · sha256 앞 16자리 `6188ca2f12d15f56` · 저장한 JPEG: 734,707바이트
- 후처리: 타격: 물보라 고리가 판정선에서 퍼짐 + 거품 여덟 개가 기어 위로 튀어 부풀었다가 하나씩 물보라를 남기고 터짐 + 물방울 + 잔광 · 누르는 동안: 거품이 든 빛 위로 거품이 기어 쪽에서 판정선 쪽으로 떠오르며 사라짐
- 프롬프트:

  > A hit effect for a commercial PC keyboard rhythm game: the track is seen from above, and when a note reaches the judge line and is hit, this effect plays at that spot, lying flat on the track. Draw the light elements of the effect as clean production sprites for compositing, at the finish level of the effects of a top commercial rhythm game: crisp, refined and luminous, never cartoonish or blurry.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, with no colour at all, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO plate, NO frame, NO panel, NO cell borders or dividing lines and NO other object anywhere. Only light and the elements themselves, each with plenty of black around it. Nothing touches the cell edges, and nothing is cut off by a straight line.
  >
  > THE EFFECT: BUBBLES, glossy soap bubbles bursting out of the hit.
  >
  > Top-left cell: a bubble popping, centred: a ring of tiny droplets and fine spray flying outward from the pop, with a faint broken film of the bubble, all light.
  > Top-right cell: one large perfect soap bubble, centred, its diameter about 60 % of the cell: a transparent sphere drawn only as light: a thin bright rim, brighter at its edges, a faint inner glow, a bright curved highlight near its upper left and a smaller one at its lower right; its inside is almost black.
  > Bottom-left cell: separate sprites in a loose grid with black gaps between them: many transparent bubbles in a few sizes, each drawn like the large one (bright thin rim, curved highlight, dark inside), plus a few tiny droplets and small round glints.
  > Bottom-right cell: a steady soft glow seen from straight above, centred, a little wider than it is tall, with a cluster of small bubbles floating around it.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks.

### `styles/hits/grid.jpg`

- 용도: 타격 효과 LED 그리드 → `styles/hits/grid_burst.png`(치는 순간), `grid_hold.png`(롱노트를 누르는 동안)
- 크기 · 기준 이미지: 1:1 · 2K · 없음 (1안)
- 날짜: 2026-11-04 14:03 KST · 약 $0.065
- 생성 결과(PNG): 3,515,203바이트 · sha256 앞 16자리 `3fd4d33c76837180` · 저장한 JPEG: 572,344바이트
- 후처리: 시트의 LED 낱알 중 가장 크고 밝은 하나를 판정선 아래 격자(11 × 8, 한 레인에 약 5칸)에 놓음 · 타격: 친 자리의 LED가 켜지고 사각 물결이 기어 위로 퍼지며 뒤에 LED가 드문드문 깜빡임 · 판정선 위에는 그리지 않음 · 누르는 동안: 건반 밑 5 × 4 LED가 레벨 미터처럼 오르내림(맨 위 칸은 흰빛)
- 프롬프트:

  > A hit effect for a commercial PC keyboard rhythm game: the track is seen from above, and when a note reaches the judge line and is hit, this effect plays at that spot, lying flat on the track. Draw the light elements of the effect as clean production sprites for compositing, at the finish level of the effects of a top commercial rhythm game: crisp, refined and luminous, never cartoonish or blurry.
  >
  > ASSET: a 2 x 2 grid of four equal square cells on pure black (#000000), every element white and grey light only, with no colour at all, because the game adds them onto the screen and colours them itself.
  >
  > Very important: draw NO judge line, NO bar, NO plate, NO frame, NO panel, NO cell borders or dividing lines and NO other object anywhere. Only light and the elements themselves, each with plenty of black around it. Nothing touches the cell edges, and nothing is cut off by a straight line.
  >
  > THE EFFECT: LED GRID, the pixels of an LED dot-matrix panel lighting up where the note was hit.
  >
  > Top-left cell: a square block of 7 x 7 LED pixels, centred, seen from straight above: every LED a small rounded square of light with a hot white centre and a soft glow, with even black gaps between them, all of them lit, the middle ones the brightest and the ones at the block's edges a little dimmer.
  > Top-right cell: a hollow square ring made of a single row of lit LED pixels, centred, about 70 % of the cell across, every pixel like those of the block, with even black gaps between them; the middle of the ring is black.
  > Bottom-left cell: separate single LED pixels in a loose grid with black gaps between them: each a small rounded square of light with a hot white centre and a soft glow, in three sizes and three brightnesses, plus a few tiny plus-shaped sparks of light.
  > Bottom-right cell: a steady soft glow seen from straight above, centred, a little wider than it is tall, with a few single LED pixels lit around it.
  >
  > View: strictly top-down and flat, no perspective. Crisp, high-resolution light; no text, letters, numbers, labels, logos or watermarks.
