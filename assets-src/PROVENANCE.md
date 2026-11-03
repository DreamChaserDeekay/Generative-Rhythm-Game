# 에셋 출처 (PROVENANCE)

게임에 들어가는 그림과 영상은 모두 이 저장소를 위해 새로 만든 것입니다. 다른 게임의 에셋 · 로고 · 폰트 · UI는 쓰지 않았고, 생성 프롬프트에도 게임 · 회사 · 아티스트 이름을 넣지 않았습니다. 예외 하나: 메카 세트의 부위별 시트가 기준으로 삼은 스타일 프레임의 프롬프트에는 완성도 기준으로 상용 게임 이름을 적었습니다(맨 아래 [메카 세트](#메카-세트-stylesmecha-2026-11)).

아래 P0 세트(ElevenLabs)의 기록이 먼저, 그다음 컨셉 세트(Gemini)의 기록입니다.

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

컨셉별 디자인 업그레이드의 첫 세트입니다. 노트 · 롱노트 · 사이드 노트 · 기어(색 4가지) · 타격 이펙트를 그림에서 그립니다(`client/src/render/styleArt.ts`, 그림이 없으면 코드 그림).

- 만든 곳: Google Cloud Vertex AI 의 Gemini 이미지 생성(`gemini-nano-banana-2.1`, 2K) · 사용자의 Google Cloud 프로젝트 · 장당 약 $0.06(토큰 사용량으로 계산한 추정치)
- 순서: ① 컨셉 문서 → ② 컨셉마다 스타일 프레임(게임 한 장면) 3안 → 사용자가 메카는 A안을 고름 → ③ A안을 기준 이미지로 부위별 시트 → ④ 이 저장소의 `scripts/assets/build_styles.py` 가 시트를 잘라 `client/public/media/styles/mecha/` 의 게임 그림으로(값은 스크립트 안에)
- 저장 형식: 생성 결과는 PNG로 받아 두었고, `assets-src/styles/mecha/` 에는 저장소 크기를 줄이려 JPEG(품질 95, 색 정보 줄이지 않음)으로 다시 저장했습니다. PNG의 sha256 앞 16자리를 함께 적습니다.
- 비용: 저장소에 넣은 8장과 기준 스타일 프레임, 쓰지 않은 첫 이펙트 시트를 합해 약 $0.63 입니다.
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

- 용도: 기어(건메탈, 기본) → `styles/mecha/keys.png`, `gear_gunmetal.png`
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

### `styles/mecha/gear_white.jpg`

- 용도: 기어(화이트 세라믹) → `styles/mecha/gear_white.png`
- 크기 · 기준 이미지: 21:9 · 2K · 건메탈 기어 시트
- 날짜: 2026-11-03 17:13 KST · 약 $0.065
- 생성 결과(PNG): 4,101,746바이트 · sha256 앞 16자리 `e3cb8ac0e14b62e4` · 저장한 JPEG: 784,590바이트
- 후처리: 건메탈과 같은 자리에서 턴테이블 모듈과 띠를 잘라냄
- 프롬프트:

  > Image 1 is the gear panel of a rhythm game, seen from straight above. Redraw exactly the same panel: the same layout, shapes, modules, details, lighting, lit keys and black background, in the same flat top-down view. Change only its colourway to: white ceramic-coated panels with black anodised trim and silver machined edges. Keep the lit key areas glowing pure white. No text, letters, numbers, logos or watermarks.

### `styles/mecha/gear_red.jpg`

- 용도: 기어(레드 아노다이징) → `styles/mecha/gear_red.png`
- 크기 · 기준 이미지: 21:9 · 2K · 건메탈 기어 시트
- 날짜: 2026-11-03 17:14 KST · 약 $0.060
- 생성 결과(PNG): 3,917,052바이트 · sha256 앞 16자리 `88bba203c56d5292` · 저장한 JPEG: 830,186바이트
- 후처리: 건메탈과 같은 자리에서 턴테이블 모듈과 띠를 잘라냄
- 프롬프트:

  > Image 1 is the gear panel of a rhythm game, seen from straight above. Redraw exactly the same panel: the same layout, shapes, modules, details, lighting, lit keys and black background, in the same flat top-down view. Change only its colourway to: deep red anodised aluminium with black trim and silver machined edges. Keep the lit key areas glowing pure white. No text, letters, numbers, logos or watermarks.

### `styles/mecha/gear_blue.jpg`

- 용도: 기어(코발트 블루) → `styles/mecha/gear_blue.png`
- 크기 · 기준 이미지: 21:9 · 2K · 건메탈 기어 시트
- 날짜: 2026-11-03 17:15 KST · 약 $0.058
- 생성 결과(PNG): 4,064,475바이트 · sha256 앞 16자리 `1396c8a43571f128` · 저장한 JPEG: 816,768바이트
- 후처리: 건메탈과 같은 자리에서 턴테이블 모듈과 띠를 잘라냄
- 프롬프트:

  > Image 1 is the gear panel of a rhythm game, seen from straight above. Redraw exactly the same panel: the same layout, shapes, modules, details, lighting, lit keys and black background, in the same flat top-down view. Change only its colourway to: cobalt blue anodised aluminium with black trim and silver machined edges. Keep the lit key areas glowing pure white. No text, letters, numbers, logos or watermarks.
