# 에셋 출처 (PROVENANCE)

게임에 들어가는 그림과 영상은 모두 이 저장소를 위해 새로 만든 것입니다. 다른 게임의 에셋 · 로고 · 폰트 · UI는 쓰지 않았고, 생성 프롬프트에도 게임 · 회사 · 아티스트 이름을 넣지 않았습니다. 예외 둘: ① 컨셉 세트(메카 · 클럽 · 크리스털 · 네온 · 피아노)의 부위별 시트가 기준으로 삼은 스타일 프레임의 프롬프트에는 완성도 기준으로 상용 게임 이름을 적었습니다(맨 아래 [메카 세트](#메카-세트-stylesmecha-2026-11)부터). ② 스킨의 기어 하단 그림(2026-11-12 ~ 13, 맨 끝의 [스킨의 기어 하단 그림을 입체로 다시](#스킨의-기어-하단-그림을-입체로-다시-gearspanels-2026-11-12--13))은 사용자의 결정으로 이 원칙 밖에서 만들었습니다: 사용자가 올린 레퍼런스 그림(다른 리듬 게임의 화면으로 보이는 그림), 회사 로고, K/DA FIRESTARTER 공식 그림, 다른 사람의 그림 한 장을 기준 그림으로 이미지 모델에 보냈고, 로고 · 문장 · 그 그림은 게임에 들어간 그림 안에 있으며, 프롬프트 몇 곳에 이름이 있습니다(그림에 넣을 글자 FIRESTARTER · Gemini · Claude, 그리고 SpaceX · Starship · Doge; 권리자와 출처: `client/public/licenses/GEAR-PANELS.md`). 기어 양옆의 그림과 노트의 로고(`client/public/stage/`)는 이 저장소를 위해 만든 그림이 아니라 다른 이의 그림이어서 이 문서가 아니라 `client/public/licenses/STAGE-PICTURES.md`에 적혀 있습니다. 그 가운데 이미지 모델이 그린 부분이 있는 것(파이어스타터의 두 그림에서 배경을 빼며 이어 그린 곳, 2026-11-13)은 맨 끝의 [기어 양옆 그림에서 배경 빼기](#기어-양옆-그림에서-배경-빼기-stagefire-2026-11-13)에 적었습니다.

아래 P0 세트(ElevenLabs, 지움: 기록만 남김)의 기록이 먼저, 그다음 컨셉 세트와 세트에 속하지 않는 타격 효과, 맨 끝에 기어(모두 Gemini)의 기록입니다.

- 지움: 2026-11-06, 이 세트를 쓰던 트랙 스킨을 없앤 뒤로 쓰는 곳이 없어(사용자 요청 "남은 스킨 코드랑 예전 텍스처 그림도 지워줘") 원본(`notes/` · `gear/` · `effects/`의 24개), 게임용 파일(`client/public/media/skins/` · `fx/`의 32개)과 매니페스트 항목, 빌드 스크립트(`scripts/assets/build_p0.py`)와 그 값(`scripts/assets/p0_recipe.json`)을 저장소에서 지웠습니다. 아래는 기록만 남깁니다.
- 만든 곳(P0 세트): ElevenLabs(creative 도구). flow 주소는 작업 공간 전환 코드를 뺀 주소입니다.
- 플랜과 이용 조건: 작업 공간 한도(370,430크레딧)와 크레딧 추가 결제(2026-10-19)로 보아 유료 플랜입니다. ElevenLabs 약관상 유료 플랜의 생성물은 상업적으로 쓸 수 있고 권리는 사용자에게 있습니다(무료 플랜은 비상업 전용). 플랜 이름은 도구로 확인하지 못했습니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았고 ElevenLabs에 올리지 않았습니다.
- `assets-src/`에는 고른 결과를 내려받은 그대로 두었고(이름만 영어로 바꿈), 게임용 파일은 `scripts/assets/build_p0.py`가 `client/public/media/`에 다시 만들었습니다(값은 `scripts/assets/p0_recipe.json`).
- 노트 · 기어 · 이펙트는 모두 흑백으로 만들고, 색은 게임이 스킨 색표(`client/src/render/skins.ts`)로 입혔습니다.

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

### `notes/glass_tap.png` (지움)

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

### `notes/crystal_tap.png` (지움)

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

### `notes/metal_tap.png` (지움)

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

### `notes/gel_tap.png` (지움)

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

### `notes/glass_long_body.png` (지움)

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

### `notes/crystal_long_body.png` (지움)

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

### `notes/metal_long_body.png` (지움)

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

### `notes/gel_long_body.png` (지움)

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

### `gear/glass_judge_line.png` (지움)

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

### `gear/crystal_judge_line.png` (지움)

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

### `gear/metal_judge_line.png` (지움)

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

### `gear/gel_judge_line.png` (지움)

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

### `gear/glass_rail.png` (지움)

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

### `gear/crystal_rail.png` (지움)

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

### `gear/metal_rail.png` (지움)

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

### `gear/gel_rail.png` (지움)

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

### `gear/glass_track_floor.png` (지움)

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

### `gear/crystal_track_floor.png` (지움)

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

### `gear/metal_track_floor.png` (지움)

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

### `gear/gel_track_floor.png` (지움)

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

### `gear/key_beam.png` (지움)

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

### `effects/hit_burst_ring.mp4` (지움)

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

### `effects/hit_burst_glow.mp4` (지움)

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

### `effects/hit_hold_sparks.mp4` (지움)

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

### `styles/mecha/gear_gunmetal.jpg` (지움)

- 지움: 2026-11-04, 세트의 기어를 네 기어(아래 "기어")로 바꾸며 이 시트와 그 게임 그림(`keys.png`, `gear.png`)을 저장소에서 지웠습니다. 기록만 남깁니다.

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

### `styles/club/gear_black.jpg` (지움)

- 지움: 2026-11-04, 세트의 기어를 네 기어(아래 "기어")로 바꾸며 이 시트와 그 게임 그림(`keys.png`, `gear.png`)을 저장소에서 지웠습니다. 기록만 남깁니다.

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

## 크리스털 세트 (`styles/crystal`, 2026-11)

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

### `styles/crystal/gear_silver.jpg` (지움)

- 지움: 2026-11-04, 세트의 기어를 네 기어(아래 "기어")로 바꾸며 이 시트와 그 게임 그림(`keys.png`, `gear.png`)을 저장소에서 지웠습니다. 기록만 남깁니다.

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

### `styles/neon/gear_black.jpg` (지움)

- 지움: 2026-11-04, 세트의 기어를 네 기어(아래 "기어")로 바꾸며 이 시트와 그 게임 그림(`keys.png`, `gear.png`)을 저장소에서 지웠습니다. 기록만 남깁니다.

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

- 지금 게임에 남은 것(2026-11-05): 타격 효과 피아노 음표(`styles/piano/hit_burst.png` · `hit_hold.png`)뿐입니다. 피아노 노트 계열은 사용자의 요청으로 게임에서 뺐고(`styles/piano/notes.png` · `long.png` · `side.png`와 매니페스트 항목을 지움), 아래의 원본(`notes.jpg` · `long.jpg` · `side.jpg`)은 기록으로 남깁니다. `scripts/assets/build_styles.py`는 이 세트의 타격 효과만 만듭니다(`HIT_ONLY`).
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

### `styles/piano/gear_ebony.jpg` (지움)

- 지움: 2026-11-04, 세트의 기어를 네 기어(아래 "기어")로 바꾸며 이 시트와 그 게임 그림(`keys.png`, `gear.png`)을 저장소에서 지웠습니다. 기록만 남깁니다.

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

## 기어 (`gears/`, 2026-11)

(2026-11-13: 이 절의 기어 가운데 오락실 기체 · 빈티지 리시버 · 나전칠기 · 커스텀 키보드 · 레이싱 휠 · 우주선 계기판과 아래의 달을 사용자의 결정으로 게임에서 뺐습니다. 기록은 그대로 두었습니다: 맨 끝의 [없앤 기어](#없앤-기어-오락실-기체--빈티지-리시버--나전칠기--커스텀-키보드--레이싱-휠--우주선-계기판--달-2026-11-13).)

세트마다 있던 기어 다섯(아케이드 · 믹서 · 크리스털 · 네온 · 그랜드 피아노)을 지우고, 이름 붙일 수 있는 사물 하나씩으로 다시 만든 기어입니다: 기본(STANDARD), 오락실 기체(GRG-2000), 빈티지 리시버(SR-7), 나전칠기(자개함), 그리고 2026-11-05에 더한 커스텀 키보드(TKL-08) · 레이싱 휠 · 우주선 계기판(아래 "기어 셋 더")과 2026-11-06에 더한 피아노(아래 "피아노 기어") · 달(아래 "달 기어"). 판정선 아래 받침의 꾸밈, 트랙 양옆 테두리, 게이지 · 점수판 · 숫자 글꼴까지 기어가 정합니다(`client/src/render/deckArt.ts`, `styleArt.ts`, `gearHud.ts`, 그림이 없는 부위는 코드 그림). 처음에는 받침에 레인마다의 건반(패드 · 아크릴 버튼 · 스위치 · 자개 판)과 스크래치 모듈을 두었고, 2026-11-05에 레인마다의 건반을 빼고 사물의 꾸밈(조이스틱 · 버튼 여섯 · 동전 투입구, 노브 · 셀렉터 스위치, 학 뚜껑 둘 · 자물쇠 판 등)으로 바꾸며 부위 그림 2장(조이스틱 · 동전 투입구)을 더 만들고 3장(패드 · 턴테이블 · 자개 판)을 지웠습니다(기록은 아래에 남김). 같은 날 기어 일곱의 받침 전체를 게임 카메라의 원근으로 그린 그림 7장도 더했습니다(아래 "받침 그림": 부품이 받침에서 서 있게).

- 만든 곳: Google Cloud Vertex AI 의 Gemini 이미지 생성(`gemini-nano-banana-2.1`, 2K) · 사용자의 Google Cloud 프로젝트 · 장당 약 $0.06(토큰 사용량으로 계산한 추정치)
- 순서: ① 상용 리듬게임 기어 조사 → 원칙(기어는 사물 하나, 측면 · 받침 · 건반 · 스크래치 · 게이지 · 점수 창 · 숫자 글꼴을 함께 정함, 노트를 읽는 자리는 모든 기어에서 같음) → ② 컨셉 여섯 + 기본 기어의 스타일 프레임(게임 한 장면) → 사용자가 기본 · 오락실 기체 · 빈티지 리시버 · 나전칠기를 고름(나머지 셋은 2026-11-05에 더함) → ③ 고른 프레임을 기준 이미지로 부위 그림(마젠타 바탕에 위에서 본 사물 하나씩) → ④ 이 저장소의 `scripts/assets/build_gears.py` 가 잘라 `client/public/media/gears/<기어>/` 의 게임 그림으로(값은 스크립트 안에)
- 재질(오락실 기체의 엠보싱 ABS, 리시버의 헤어라인 은판 · 월넛, 기본 기어의 그래파이트, 커스텀 키보드의 비드 블라스트 알루미늄, 레이싱 휠의 트윌 카본, 우주선 계기판의 회색 도장)은 생성하지 않고 `build_gears.py` 가 시드를 정한 잡음으로 만듭니다(돌릴 때마다 같고, 주파수 공간에서 걸러 이음새 없이 반복). 기준 이미지 없이 재질만 그려 달라는 요청은 생성 모델이 거절했습니다(IMAGE_RECITATION).
- 저장 형식: 생성 결과는 PNG로 받아 두었고, `assets-src/gears/` 에는 저장소 크기를 줄이려 JPEG(품질 95, 색 정보 줄이지 않음)으로 다시 저장했습니다. PNG의 sha256 앞 16자리를 함께 적습니다.
- 비용: 부위 그림 12장(그중 3장은 지움), 거절되거나 그림 없이 끝난 시도 3번, 기준 스타일 프레임 4장을 합해 약 $1.05 입니다(그때 고르지 않은 세 컨셉의 스타일 프레임은 2026-11-05에 쓰면서 아래 "기어 셋 더"에 적음).
- 후처리 공통: 부위 그림은 마젠타 바탕을 빼고(키잉) 모양대로 자른 뒤, 생성이 사물의 테두리에 비춘 마젠타 바탕을 가장자리 12 px 안에서 걷어냅니다(despill: 빨강과 파랑을 초록이 허락하는 만큼으로, 안쪽의 빨간 공 · 분홍빛 자개는 그대로, 2026-11-05부터).
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 그림에 다른 게임의 에셋 · 로고 · 폰트 · UI는 들어가지 않았고, 프롬프트에 다른 게임 · 회사 · 아티스트 이름은 없습니다. 스타일 프레임의 기준 이미지는 이 게임의 실제 화면(기어를 지운 7K+1S)입니다.
- 숫자 · 판정 글꼴(DSEG7 Classic, Noto Serif KR 의 "흥" 한 글자, Silkscreen, Saira Stencil One)은 `client/src/assets/fonts/README.md` 에 적었습니다.

### 스타일 프레임 `standard-a1.png` (기본, 저장소에 넣지 않음, 부위 그림의 기준 이미지)

- 기준 이미지: 이 게임의 7K+1S 화면에서 기어를 지운 것(레인 · 판정선 · HUD 자리)
- 날짜: 2026-11-04 22:57 KST · 약 $0.057 · PNG 4,177,889바이트 · sha256 앞 16자리 `b930b2a41eba29b2`
- 프롬프트:

  > Image 1 is a screenshot of this game's play screen with its gear removed (the deck under the judge line is a flat grey placeholder and the two track edges are plain grey lines). Use it ONLY for: the camera (a low perspective looking up a long tilted track), the track's position and proportions in the middle of the frame, the lane layout (one wide scratch lane at the far left, then seven key lanes), the horizontal white judge line about 77 % down the image, the deck area under it, and where the HUD sits: the combo counter near the top of the track, the judgement text in the middle of the track, the score panel to the left of the track (SCORE, RATE, MAX COMBO, SPEED stacked), the clear gauge running up beside the right edge of the track with its percentage at its foot. Redraw the whole gear at the finish of a commercial console rhythm game.
  >
  > A 16:9 gameplay frame of a PC keyboard rhythm game, mid-song. The gear (everything that is not the lanes) is designed as ONE physical object, described below. The object decides the side frames' silhouette, the deck under the judge line, the key caps, the scratch housing, the gauge housing, the score panel's housing and the typography of every number.
  >
  > CONCEPT: STANDARD (the game's own default gear). The game's own default gear: a slim modern controller in matte graphite aluminium and smoked black glass, with one thin cyan accent line. It is the calmest and most readable of all gears, made to suit any notes.
  >
  > - Side frames: slim matte graphite aluminium rails, each about a fifth of a lane wide, running the whole length of the track, with one thin soft cyan light line along the inner edge and a fine bevel; no other ornament.
  > - Deck under the judge line: a smoked black glass panel set in a matte graphite frame. At the far left, in the scratch lane's column, a smoked glass jog disc with a thin cyan light ring. Then one flat rounded-square smoked glass key pad per key lane (exactly seven, in one row, each as wide as its lane), edge-lit; the two pressed pads light from beneath in their lane colour.
  > - Under the pads: a narrow strip of the panel with the small engraved micro-label "GENERATIVE RHYTHM" in thin capitals.
  > - Gauge: a slim smoked-glass tube along the right rail with fine cyan segments filled to 72 percent and a thin white mark where it clears; its percentage in white condensed digits.
  > - Score panel: a smoked glass plate fixed to the left rail; numbers in white condensed sans digits, labels in small cyan capitals.
  > - Combo: white condensed sans digits. Judgement "MAX 100%": "MAX" in white and "100%" in cyan, condensed sans, crisp.
  > - Mood: calm, precise, modern. Materials only: matte graphite aluminium, smoked black glass, one cyan accent, white type.
  >
  > Reading zone (the same in every gear, do not theme it): the lanes are near-black and matte (under 8 % brightness) with thin dim dividers; notes are simple crisp bars in the lane colours (white lanes white, blue lanes blue, the middle lane gold, the scratch lane red), a few single notes, one two-note chord and one long note being held in a blue lane; the judge line is a crisp white line across the track with a short soft glow. Two lanes are being pressed: their keys light up in the lane colour and a short faint light column rises from the judge line, fading within a fifth of the track. Nothing glows or moves inside the lanes except notes and those two columns.
  >
  > HUD text, exactly and cleanly legible, set in the gear's own type: the combo reads "128" with the small word "COMBO"; the judgement reads "MAX 100%"; the score panel reads "SCORE 812,345", "RATE 99.87%", "MAX COMBO 128", "SPEED 3.60"; the gauge reads "72%" with its label given above. No other text anywhere except the gear's few micro-labels given above. No logos of real brands, no characters, no watermarks.
  >
  > Finish: one key light from the top-left on every part; crisp edges with painted material detail; three value steps on every element (dark rim, mid body, bright highlight); visible construction (seams, screws, bevels) where the object has them; one accent colour on its neutral materials. No bloom haze, no lens flares, no motion blur, no gradients inside the lanes, no purple-blue-pink gradient wash, no glassmorphism, no neon outlines on everything. Outside the gear the screen is a plain very dark background.

### 스타일 프레임 `cabinet-a1.png` (오락실 기체, 저장소에 넣지 않음, 부위 그림의 기준 이미지)

- 기준 이미지: 이 게임의 7K+1S 화면에서 기어를 지운 것(레인 · 판정선 · HUD 자리)
- 날짜: 2026-11-04 22:37 KST · 약 $0.080 · PNG 5,576,951바이트 · sha256 앞 16자리 `a372d1e5012f0a63`
- 프롬프트:

  > Image 1 is a screenshot of this game's play screen with its gear removed (the deck under the judge line is a flat grey placeholder and the two track edges are plain grey lines). Use it ONLY for: the camera (a low perspective looking up a long tilted track), the track's position and proportions in the middle of the frame, the lane layout (one wide scratch lane at the far left, then seven key lanes), the horizontal white judge line about 77 % down the image, the deck area under it, and where the HUD sits: the combo counter near the top of the track, the judgement text in the middle of the track, the score panel to the left of the track (SCORE, RATE, MAX COMBO, SPEED stacked), the clear gauge running up beside the right edge of the track with its percentage at its foot. Redraw the whole gear at the finish of a commercial console rhythm game.
  >
  > A 16:9 gameplay frame of a PC keyboard rhythm game, mid-song. The gear (everything that is not the lanes) is designed as ONE physical object, described below. The object decides the side frames' silhouette, the deck under the judge line, the key caps, the scratch housing, the gauge housing, the score panel's housing and the typography of every number.
  >
  > CONCEPT: ARCADE CABINET. A fictional 2000s arcade rhythm-game cabinet, model GRG-2000, brought onto the screen: the gear is the cabinet's control deck and its two side panels.
  >
  > - Side frames: the cabinet's side panels in black textured ABS plastic, each about a third of a lane wide, running the whole length of the track, with a chrome trim strip along the inner edge and a vertical row of small round LED dots down the middle of each panel (groove lights: most dark amber, a few lit).
  > - Deck under the judge line: a wide black textured-ABS control panel with a chrome moulding along its top edge. At the far left, in the scratch lane's column, a real turntable: a black rubber mat on a silver platter with a ring of strobe dots and a thin red LED ring around it. Then one large round convex translucent acrylic push button per key lane, each in a chrome bezel: milky white in white lanes, pale blue in blue lanes, amber in the gold lane; the two pressed buttons glow from inside in their lane colour.
  > - Under the buttons: a narrow strip of the panel with two small smoked-acrylic windows showing red seven-segment digits, and the white silk-screened micro-label "GRG-2000".
  > - Gauge: a vertical bar of square LED segments (green, turning yellow then red at the top) in a chrome-edged slot cut into the right side panel, labelled "GROOVE" in white silk-screen; its percentage in red seven-segment digits.
  > - Score panel: a smoked-acrylic plate bolted onto the left side panel; numbers in red seven-segment digits, labels in small white silk-screened capitals.
  > - Combo: big red seven-segment digits on a faint dark backing. Judgement "MAX 100%" in heavy italic arcade lettering, white with a red outline.
  > - Mood: loud, glossy, nostalgic. Materials only: black textured plastic, chrome, translucent acrylic, red LEDs.
  >
  > Reading zone (the same in every gear, do not theme it): the lanes are near-black and matte (under 8 % brightness) with thin dim dividers; notes are simple crisp bars in the lane colours (white lanes white, blue lanes blue, the middle lane gold, the scratch lane red), a few single notes, one two-note chord and one long note being held in a blue lane; the judge line is a crisp white line across the track with a short soft glow. Two lanes are being pressed: their keys light up in the lane colour and a short faint light column rises from the judge line, fading within a fifth of the track. Nothing glows or moves inside the lanes except notes and those two columns.
  >
  > HUD text, exactly and cleanly legible, set in the gear's own type: the combo reads "128" with the small word "COMBO"; the judgement reads "MAX 100%"; the score panel reads "SCORE 812,345", "RATE 99.87%", "MAX COMBO 128", "SPEED 3.60"; the gauge reads "72%" with its label given above. No other text anywhere except the gear's few micro-labels given above. No logos of real brands, no characters, no watermarks.
  >
  > Finish: one key light from the top-left on every part; crisp edges with painted material detail; three value steps on every element (dark rim, mid body, bright highlight); visible construction (seams, screws, bevels) where the object has them; one accent colour on its neutral materials. No bloom haze, no lens flares, no motion blur, no gradients inside the lanes, no purple-blue-pink gradient wash, no glassmorphism, no neon outlines on everything. Outside the gear the screen is a plain very dark background.

### 스타일 프레임 `receiver-a1.png` (빈티지 리시버, 저장소에 넣지 않음, 부위 그림의 기준 이미지)

- 기준 이미지: 이 게임의 7K+1S 화면에서 기어를 지운 것(레인 · 판정선 · HUD 자리)
- 날짜: 2026-11-04 22:35 KST · 약 $0.076 · PNG 5,030,303바이트 · sha256 앞 16자리 `d499dc584f519b03`
- 프롬프트:

  > Image 1 is a screenshot of this game's play screen with its gear removed (the deck under the judge line is a flat grey placeholder and the two track edges are plain grey lines). Use it ONLY for: the camera (a low perspective looking up a long tilted track), the track's position and proportions in the middle of the frame, the lane layout (one wide scratch lane at the far left, then seven key lanes), the horizontal white judge line about 77 % down the image, the deck area under it, and where the HUD sits: the combo counter near the top of the track, the judgement text in the middle of the track, the score panel to the left of the track (SCORE, RATE, MAX COMBO, SPEED stacked), the clear gauge running up beside the right edge of the track with its percentage at its foot. Redraw the whole gear at the finish of a commercial console rhythm game.
  >
  > A 16:9 gameplay frame of a PC keyboard rhythm game, mid-song. The gear (everything that is not the lanes) is designed as ONE physical object, described below. The object decides the side frames' silhouette, the deck under the judge line, the key caps, the scratch housing, the gauge housing, the score panel's housing and the typography of every number.
  >
  > CONCEPT: VINTAGE RECEIVER. A 1970s stereo receiver: a brushed-aluminium faceplate in a walnut cabinet, with a glowing tuning dial and a needle meter.
  >
  > - Side frames: thick walnut wood cabinet sides with a satin finish and visible grain, each about a third of a lane wide, running the whole length of the track, with a thin brushed-aluminium trim along the inner edge.
  > - Deck under the judge line: a wide brushed silver-aluminium faceplate with fine horizontal hairlines. At the far left, in the scratch lane's column, a big knurled aluminium tuning knob with a flywheel ring. Then one silver piano-key style push switch per key lane, each with a small round lamp window above it; the two pressed switches are pushed in and their lamps glow in their lane colour.
  > - Under the switches: a long black-glass tuning dial window with a warm amber backlight, a fine scale of tick marks (no numbers) and a red dial pointer; the micro-label "STEREO RECEIVER SR-7" in small engraved capitals on the faceplate.
  > - Gauge: a rectangular analogue needle meter with an amber-backlit dial face, in a walnut-and-silver housing fixed to the right side frame, labelled "SIGNAL"; its needle points at 72 percent, and the percentage is also shown in amber digits under it.
  > - Score panel: a smaller amber-backlit black-glass window in a silver bezel fixed to the left side frame; numbers in warm amber vacuum-fluorescent style digits, labels in small engraved capitals.
  > - Combo: warm amber vacuum-fluorescent style digits. Judgement "MAX 100%" in an elegant condensed sans, warm white.
  > - Mood: warm, luxurious, analogue. Materials only: walnut, brushed silver aluminium, black glass, amber light.
  >
  > Reading zone (the same in every gear, do not theme it): the lanes are near-black and matte (under 8 % brightness) with thin dim dividers; notes are simple crisp bars in the lane colours (white lanes white, blue lanes blue, the middle lane gold, the scratch lane red), a few single notes, one two-note chord and one long note being held in a blue lane; the judge line is a crisp white line across the track with a short soft glow. Two lanes are being pressed: their keys light up in the lane colour and a short faint light column rises from the judge line, fading within a fifth of the track. Nothing glows or moves inside the lanes except notes and those two columns.
  >
  > HUD text, exactly and cleanly legible, set in the gear's own type: the combo reads "128" with the small word "COMBO"; the judgement reads "MAX 100%"; the score panel reads "SCORE 812,345", "RATE 99.87%", "MAX COMBO 128", "SPEED 3.60"; the gauge reads "72%" with its label given above. No other text anywhere except the gear's few micro-labels given above. No logos of real brands, no characters, no watermarks.
  >
  > Finish: one key light from the top-left on every part; crisp edges with painted material detail; three value steps on every element (dark rim, mid body, bright highlight); visible construction (seams, screws, bevels) where the object has them; one accent colour on its neutral materials. No bloom haze, no lens flares, no motion blur, no gradients inside the lanes, no purple-blue-pink gradient wash, no glassmorphism, no neon outlines on everything. Outside the gear the screen is a plain very dark background.

### 스타일 프레임 `najeon-a1.png` (나전칠기, 저장소에 넣지 않음, 부위 그림의 기준 이미지)

- 기준 이미지: 이 게임의 7K+1S 화면에서 기어를 지운 것(레인 · 판정선 · HUD 자리)
- 날짜: 2026-11-04 22:38 KST · 약 $0.078 · PNG 5,044,786바이트 · sha256 앞 16자리 `bdca4e7512237c16`
- 프롬프트:

  > Image 1 is a screenshot of this game's play screen with its gear removed (the deck under the judge line is a flat grey placeholder and the two track edges are plain grey lines). Use it ONLY for: the camera (a low perspective looking up a long tilted track), the track's position and proportions in the middle of the frame, the lane layout (one wide scratch lane at the far left, then seven key lanes), the horizontal white judge line about 77 % down the image, the deck area under it, and where the HUD sits: the combo counter near the top of the track, the judgement text in the middle of the track, the score panel to the left of the track (SCORE, RATE, MAX COMBO, SPEED stacked), the clear gauge running up beside the right edge of the track with its percentage at its foot. Redraw the whole gear at the finish of a commercial console rhythm game.
  >
  > A 16:9 gameplay frame of a PC keyboard rhythm game, mid-song. The gear (everything that is not the lanes) is designed as ONE physical object, described below. The object decides the side frames' silhouette, the deck under the judge line, the key caps, the scratch housing, the gauge housing, the score panel's housing and the typography of every number.
  >
  > CONCEPT: NAJEON LACQUERWARE. Korean najeon lacquerware: a black lacquer chest inlaid with mother-of-pearl, with brass fittings.
  >
  > - Side frames: polished black lacquer pillars, each about a third of a lane wide, running the whole length of the track, inlaid with a continuous band of mother-of-pearl scrollwork (arabesque vines) in iridescent white with soft pink, green and blue sheens, with small brass corner fittings at their ends.
  > - Deck under the judge line: a black lacquer chest front. In its middle, under the keys, a round brass lock plate of traditional shape. At the far left, in the scratch lane's column, a round lacquer lid with a mother-of-pearl crane in flight, edged in brass. Then one rounded-rectangle mother-of-pearl inlay tablet per key lane set into the lacquer; the two pressed tablets glow in their lane colour through the pearl.
  > - Gauge: a vertical column of small mother-of-pearl plum blossoms in a brass frame on the right pillar, the lower 72 percent of them lit warm white, labelled with the single Korean character "흥" in gold; its percentage in gold serif digits.
  > - Score panel: a black lacquer plaque with a thin gold border on the left pillar; numbers in gold, in an elegant serif.
  > - Combo: gold serif digits with a fine engraved look. Judgement "MAX 100%" in gold serif capitals.
  > - Mood: calm, elegant, precious. Materials only: black lacquer, iridescent mother-of-pearl, brass, one small touch of cinnabar red.
  >
  > Reading zone (the same in every gear, do not theme it): the lanes are near-black and matte (under 8 % brightness) with thin dim dividers; notes are simple crisp bars in the lane colours (white lanes white, blue lanes blue, the middle lane gold, the scratch lane red), a few single notes, one two-note chord and one long note being held in a blue lane; the judge line is a crisp white line across the track with a short soft glow. Two lanes are being pressed: their keys light up in the lane colour and a short faint light column rises from the judge line, fading within a fifth of the track. Nothing glows or moves inside the lanes except notes and those two columns.
  >
  > HUD text, exactly and cleanly legible, set in the gear's own type: the combo reads "128" with the small word "COMBO"; the judgement reads "MAX 100%"; the score panel reads "SCORE 812,345", "RATE 99.87%", "MAX COMBO 128", "SPEED 3.60"; the gauge reads "72%" with its label given above. No other text anywhere except the gear's few micro-labels given above. No logos of real brands, no characters, no watermarks.
  >
  > Finish: one key light from the top-left on every part; crisp edges with painted material detail; three value steps on every element (dark rim, mid body, bright highlight); visible construction (seams, screws, bevels) where the object has them; one accent colour on its neutral materials. No bloom haze, no lens flares, no motion blur, no gradients inside the lanes, no purple-blue-pink gradient wash, no glassmorphism, no neon outlines on everything. Outside the gear the screen is a plain very dark background.

### `gears/standard/pad.jpg` (지움, 2026-11-05)

- 용도: 기본의 패드(건반 하나) → `gears/standard/pad.png` 375×384 · 받침에서 레인마다의 건반을 빼며 원본과 게임 그림을 함께 지움
- 크기 · 기준 이미지: 1:1 · 2K · `standard-a1.png`
- 날짜: 2026-11-04 23:10 KST · 약 $0.059
- 생성 결과(PNG): 3,632,484바이트 · sha256 앞 16자리 `a540efb8ce6b675a` · 저장한 JPEG: 510,755바이트
- 후처리: 마젠타 바탕을 빼고(가장자리에 남은 마젠타도 걷어냄) 둥근 사각형(모서리는 짧은 변의 0.2)으로 잘라 높이 384 · 생성이 유리에 입힌 색조를 빼 무채색으로 · 게임은 레인마다 그 레인의 자리에 그리고, 누르면 그 위에 레인 색 빛을 얹음
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): one flat rounded-square key pad of smoked black glass, slightly taller than wide, with a fine polished bevel along its edges and a faint highlight on its top-left edge, unlit. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/standard/jog.jpg`

- 용도: 기본의 조그 원판(받침 왼쪽) → `gears/standard/jog.png` 512×512
- 크기 · 기준 이미지: 1:1 · 2K · `standard-a1.png`
- 날짜: 2026-11-04 23:11 KST · 약 $0.062
- 생성 결과(PNG): 4,550,007바이트 · sha256 앞 16자리 `800cfc3947390bb6` · 저장한 JPEG: 799,301바이트
- 후처리: 원으로 잘라 512 · 게임은 받침 왼쪽에 둥글게 보이도록(카메라가 납작하게 하는 만큼 길게) 그림
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): a round jog disc of smoked black glass with a fine radial brushed-metal centre cap and a thin dark rim. A perfect circle. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/cabinet/turntable.jpg` (지움, 2026-11-05)

- 용도: 오락실 기체의 턴테이블(스크래치) → `gears/cabinet/turntable.png` 512×512 · 스크래치 모듈을 조이스틱으로 바꾸며 원본과 게임 그림을 함께 지움
- 크기 · 기준 이미지: 1:1 · 2K · `cabinet-a1.png`
- 날짜: 2026-11-04 23:04 KST · 약 $0.064
- 생성 결과(PNG): 6,980,299바이트 · sha256 앞 16자리 `d5256a671c4694f5` · 저장한 JPEG: 1,789,301바이트
- 후처리: 원으로 잘라 512 · 둘레의 빨간 LED 고리는 코드가 그림
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): the turntable of an arcade rhythm-game cabinet: a round black rubber slip mat with fine concentric grooves on a polished silver platter, a ring of small strobe dots around the platter's edge, a small silver spindle in the centre, inside a thin black outer ring. No tonearm. A perfect circle. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/cabinet/joystick.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 오락실 기체 조종판의 조이스틱(받침 왼쪽) → `gears/cabinet/joystick.png` 512×512
- 크기 · 기준 이미지: 1:1 · 2K · `cabinet-a1.png`
- 날짜: 2026-11-05 00:58 KST · 약 $0.065
- 생성 결과(PNG): 5,683,459바이트 · sha256 앞 16자리 `3edecac24b1bc245` · 저장한 JPEG: 1,218,106바이트
- 후처리: 원으로 잘라 512 · 바깥 테에 비친 마젠타를 걷어냄(위 후처리 공통) · 게임은 받침 왼쪽에 둥글게 보이도록 그림
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): the joystick of an arcade cabinet's control panel: a glossy red ball top on a short black shaft, seen from straight above so that the ball hides the shaft, sitting in the middle of a round black plastic dust washer, a thin polished chrome ring around the washer's edge. A perfect circle overall. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/cabinet/coin.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 오락실 기체 조종판의 동전 투입구(받침 오른쪽) → `gears/cabinet/coin.png` 558×384
- 크기 · 기준 이미지: 1:1 · 2K · `cabinet-a1.png`
- 날짜: 2026-11-05 00:59 KST · 약 $0.064
- 생성 결과(PNG): 4,511,648바이트 · sha256 앞 16자리 `134cfb1e073bb2da` · 저장한 JPEG: 862,828바이트
- 후처리: 둥근 사각형(모서리는 짧은 변의 0.06)으로 잘라 높이 384 · 게임은 받침 오른쪽에 그림의 비율대로 그림(화폐 기호 · 글자 없음)
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): the coin entry of an arcade cabinet set into its control panel: a horizontal brushed stainless steel plate about 1.7 times as wide as it is tall, softly rounded corners, a small screw in each corner; on it two coin slots side by side, each a narrow vertical slot with a small square coin-return button glowing amber beside it. No currency symbols. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/cabinet/button.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 오락실 기체 조종판의 아크릴 버튼(여섯) → `gears/cabinet/button.png` 384×384
- 크기 · 기준 이미지: 1:1 · 2K · `cabinet-a1.png`
- 날짜: 2026-11-04 23:06 KST · 약 $0.060 (먼저 한 번 그림 없이 끝남, 약 $0.008)
- 생성 결과(PNG): 4,214,843바이트 · sha256 앞 16자리 `c1d1b739eaf360a9` · 저장한 JPEG: 713,902바이트
- 후처리: 원으로 잘라 384 · 게임은 두 줄 여섯 개로 놓고 넷의 돔에 빨강 · 호박색을 곱해 칠함(둘은 흰 그대로)
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): one large round convex arcade push button: a translucent milky-white acrylic dome, unlit, inside a polished chrome bezel ring. A perfect circle. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/receiver/knob.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 빈티지 리시버의 튜닝 노브와 볼륨 노브 → `gears/receiver/knob.png` 512×512
- 크기 · 기준 이미지: 1:1 · 2K · `receiver-a1.png`
- 날짜: 2026-11-04 23:07 KST · 약 $0.061
- 생성 결과(PNG): 5,434,664바이트 · sha256 앞 16자리 `d50cac4a7d722946` · 저장한 JPEG: 1,121,792바이트
- 후처리: 원으로 잘라 512
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): the big tuning knob of a 1970s stereo receiver: a knurled aluminium knob with a polished top face of fine concentric machining rings and a shallow finger dimple near its edge, around it a thin flywheel ring. A perfect circle. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/receiver/switch.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 빈티지 리시버의 피아노 키 셀렉터 스위치(다섯) → `gears/receiver/switch.png` 320×368
- 크기 · 기준 이미지: 1:1 · 2K · `receiver-a1.png`
- 날짜: 2026-11-04 23:07 KST · 약 $0.062
- 생성 결과(PNG): 4,488,980바이트 · sha256 앞 16자리 `37fc7eaf52e82811` · 저장한 JPEG: 819,221바이트
- 후처리: 둥근 사각형(모서리 0.1)으로 잘라 높이 512, 위아래 30 % 는 그대로 두고 가운데만 줄여 폭의 1.15 배 깊이로(판정선 아래 줄이 얕음) · 은색 몸체가 마젠타 바탕을 비춰 무채색으로 · 게임은 튜닝 다이얼 아래에 다섯을 그림의 비율대로 놓고 램프는 켜지 않음
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): one piano-key style push switch of a 1970s stereo receiver: a rectangular brushed silver aluminium key, two units wide and three units long (the long side runs up and down the image), softly rounded corners, a fine bevel along its edges; near its top end a small round lamp window of clear glass in a thin black bezel, unlit. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/najeon/band.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 나전칠기의 측면 기둥과 받침의 자개 당초문 → `gears/najeon/band.png` 128×2048
- 크기 · 기준 이미지: 9:16 · 2K · `najeon-a1.png`
- 날짜: 2026-11-04 23:08 KST · 약 $0.058
- 생성 결과(PNG): 5,982,567바이트 · sha256 앞 16자리 `7f66665441fc95f3` · 저장한 JPEG: 1,619,045바이트
- 후처리: 생성한 띠 세 줄 가운데 왼쪽 좁은 줄(덩굴 한 줄기, 가로 80–258 px)만 잘라 128×2048 로(가운데 넓은 줄은 30 px 폭 기둥에서 잿빛 얼룩으로 보여 쓰지 않음) · 게임은 흑칠 기둥 가운데 금선 두 줄 사이에 넣고 트랙을 따라 거울처럼 뒤집어 이어 붙임(이음새 없음) · 피버 때 자개만 밝게 한 번 더 그림 · 받침에는 눕혀 자물쇠 판 양옆의 자개 덩굴로 그림
- 프롬프트:

  > Image 1 is a play screen of a rhythm game whose gear is Korean najeon lacquerware. Paint ONLY the inlaid band of its side pillars as a flat, straight-on vertical strip that fills the whole image from the top edge to the bottom edge and from the left edge to the right edge: polished black lacquer inlaid with mother-of-pearl arabesque vine scrollwork (curling stems, small leaves and spiral tendrils) that runs continuously from top to bottom so the strip can repeat, the pearl iridescent white with soft pink, green and blue sheens, a thin gold line down the left edge and down the right edge. No perspective, no frame, no shadows, no text, no letters, no logos.

### `gears/najeon/tablet.jpg` (지움, 2026-11-05)

- 용도: 나전칠기의 자개 판(건반 하나) → `gears/najeon/tablet.png` 341×358 · 받침에서 레인마다의 건반을 빼며 원본과 게임 그림을 함께 지움
- 크기 · 기준 이미지: 1:1 · 2K · `najeon-a1.png`
- 날짜: 2026-11-04 23:08 KST · 약 $0.061
- 생성 결과(PNG): 4,157,505바이트 · sha256 앞 16자리 `2e35d7ad762cab8f` · 저장한 JPEG: 707,223바이트
- 후처리: 둥근 사각형(모서리 0.3)으로 잘라 높이 512, 가운데만 줄여 폭의 1.05 배 깊이로
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): one rounded-rectangle mother-of-pearl inlay tablet, a little taller than wide, cut from abalone shell with natural layered patterns, iridescent white with soft pink, green and blue sheens, polished, with a very thin brass rim. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/najeon/lid.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 나전칠기의 학 문양 칠기 뚜껑(받침 양쪽에 둘, 오른쪽은 뒤집어 학이 가운데를 향함) → `gears/najeon/lid.png` 512×512
- 크기 · 기준 이미지: 1:1 · 2K · `najeon-a1.png`
- 날짜: 2026-11-04 23:09 KST · 약 $0.062
- 생성 결과(PNG): 4,448,706바이트 · sha256 앞 16자리 `25fdbcaff57acdbb` · 저장한 JPEG: 788,175바이트
- 후처리: 원으로 잘라 512
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): a round black lacquer lid inlaid with a mother-of-pearl crane in flight among small clouds, edged with a thin polished brass ring. A perfect circle. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/najeon/lock.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 나전칠기의 황동 앞바탕(받침 가운데의 자물쇠 판) → `gears/najeon/lock.png` 512×512
- 크기 · 기준 이미지: 1:1 · 2K · `najeon-a1.png`
- 날짜: 2026-11-04 23:09 KST · 약 $0.060
- 생성 결과(PNG): 6,932,147바이트 · sha256 앞 16자리 `44e386ddb5e49000` · 저장한 JPEG: 1,765,073바이트
- 후처리: 원으로 잘라 512 · 게임은 받침 가운데에 그리고 양옆에 금선 두 줄 사이의 자개 덩굴
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): the front plate of a traditional Korean chest lock (an ornamental brass escutcheon): a round polished brass plate with an engraved floral pattern and a small vertical latch in its middle, seen straight on. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### 기어 셋 더: 커스텀 키보드 · 레이싱 휠 · 우주선 계기판 (2026-11-05)

처음에 고르지 않은 컨셉 셋을 레인마다의 버튼 없이 그 사물의 꾸밈으로 더했습니다. 스타일 프레임(2026-11-04, 아래)은 처음 컨셉대로 레인마다 키캡 · 버튼을 그렸지만, 부위 그림은 꾸밈에 쓸 사물만(노브, 키캡 하나, 황동 명판, 로터리, 고무 버튼, 셀렉터, 토글, 사각 버튼, 금박 텍스처) 따로 만들었습니다. 키캡 · 고무 버튼 · 사각 버튼은 무채색 그림 하나를 게임이 곱하기로 칠해 여러 색으로 씁니다. 재질 셋(키보드의 비드 블라스트 차콜 알루미늄, 레이싱 휠의 2×2 트윌 카본, 계기판의 밝은 회색 도장)은 `build_gears.py` 가 잡음으로 만들고, 계기판 테두리의 금박만 생성한 텍스처에서 잘라 씁니다. 판정 · 점수판 글꼴(Silkscreen, Saira Stencil One)은 `client/src/assets/fonts/README.md` 에 적었습니다.

- 비용: 부위 그림 9장 약 $0.56, 기준 스타일 프레임 3장 약 $0.23, 키보드 스타일 프레임의 다른 시도 2번(하나는 그림 없이 끝남, 하나는 고르지 않음) 약 $0.10, 합해 약 $0.88
- 만든 곳 · 저장 형식 · 후처리 공통은 위와 같습니다(마젠타 바탕을 빼고 모양대로 잘라 가장자리의 마젠타를 걷어냄).

### 스타일 프레임 `keyboard-a2.png` (커스텀 키보드, 저장소에 넣지 않음, 부위 그림의 기준 이미지)

- 기준 이미지: 이 게임의 7K+1S 화면에서 기어를 지운 것(레인 · 판정선 · HUD 자리)
- 날짜: 2026-11-04 22:39 KST · 약 $0.062 · PNG 4,346,628바이트 · sha256 앞 16자리 `7886febfbbb57e89`
- 프롬프트:

  > Image 1 is a screenshot of this game's play screen with its gear removed (the deck under the judge line is a flat grey placeholder and the two track edges are plain grey lines). Use it ONLY for: the camera (a low perspective looking up a long tilted track), the track's position and proportions in the middle of the frame, the lane layout (one wide scratch lane at the far left, then seven key lanes), the horizontal white judge line about 77 % down the image, the deck area under it, and where the HUD sits: the combo counter near the top of the track, the judgement text in the middle of the track, the score panel to the left of the track (SCORE, RATE, MAX COMBO, SPEED stacked), the clear gauge running up beside the right edge of the track with its percentage at its foot. Redraw the whole gear at the finish of a commercial console rhythm game.
  >
  > A 16:9 gameplay frame of a PC keyboard rhythm game, mid-song. The gear (everything that is not the lanes) is designed as ONE physical object, described below. The object decides the side frames' silhouette, the deck under the judge line, the key caps, the scratch housing, the gauge housing, the score panel's housing and the typography of every number.
  >
  > CONCEPT: CUSTOM KEYBOARD. A premium custom mechanical keyboard: the game is played on a keyboard, so the gear is one, a CNC-machined aluminium case with sculpted keycaps.
  >
  > - Side frames: the case's machined aluminium side walls, anodised dark charcoal, each about a third of a lane wide, running the whole length of the track, with a bright polished chamfer along the inner edge and small hex screws at even intervals.
  > - Deck under the judge line: the keyboard's top case in anodised charcoal aluminium with a thin black rubber gasket line. At the far left, in the scratch lane's column, a large knurled aluminium rotary knob with a thin light ring. Then a single row of exactly seven sculpted thick PBT keycaps, one under each key lane and as wide as its lane (one row only, never two rows, no extra keys): off-white in white lanes, light grey in blue lanes, a single orange keycap in the gold lane, each with a small engraved legend (a circle, triangle or diamond). The two pressed keycaps sit lower and their lane-coloured light spills from under them onto the aluminium.
  > - Under the keys: a small brass weight plate engraved "TKL-08" and a narrow black glass OLED window.
  > - Gauge: a slim vertical OLED bar (white pixels on black glass) set into the right side wall, labelled "CHARGE" in tiny pixel type; its percentage in the pixel font.
  > - Score panel: a black glass OLED panel fixed to the left side wall; all its numbers in a crisp monochrome white pixel font.
  > - Combo: large white pixel-font digits. Judgement "MAX 100%" in the same pixel font, white with a thin orange underline.
  > - Mood: precise, modern, quiet. Materials only: charcoal anodised aluminium, off-white and grey PBT keycaps, black glass, one orange accent, a little brass.
  >
  > Reading zone (the same in every gear, do not theme it): the lanes are near-black and matte (under 8 % brightness) with thin dim dividers; notes are simple crisp bars in the lane colours (white lanes white, blue lanes blue, the middle lane gold, the scratch lane red), a few single notes, one two-note chord and one long note being held in a blue lane; the judge line is a crisp white line across the track with a short soft glow. Two lanes are being pressed: their keys light up in the lane colour and a short faint light column rises from the judge line, fading within a fifth of the track. Nothing glows or moves inside the lanes except notes and those two columns.
  >
  > HUD text, exactly and cleanly legible, set in the gear's own type: the combo reads "128" with the small word "COMBO"; the judgement reads "MAX 100%"; the score panel reads "SCORE 812,345", "RATE 99.87%", "MAX COMBO 128", "SPEED 3.60"; the gauge reads "72%" with its label given above. No other text anywhere except the gear's few micro-labels given above. No logos of real brands, no characters, no watermarks.
  >
  > Finish: one key light from the top-left on every part; crisp edges with painted material detail; three value steps on every element (dark rim, mid body, bright highlight); visible construction (seams, screws, bevels) where the object has them; one accent colour on its neutral materials. No bloom haze, no lens flares, no motion blur, no gradients inside the lanes, no purple-blue-pink gradient wash, no glassmorphism, no neon outlines on everything. Outside the gear the screen is a plain very dark background.

### 스타일 프레임 `racing-a1.png` (레이싱 휠, 저장소에 넣지 않음, 부위 그림의 기준 이미지)

- 기준 이미지: 이 게임의 7K+1S 화면에서 기어를 지운 것(레인 · 판정선 · HUD 자리)
- 날짜: 2026-11-04 22:39 KST · 약 $0.085 · PNG 5,830,910바이트 · sha256 앞 16자리 `f4330178dc0476c3`
- 프롬프트:

  > Image 1 is a screenshot of this game's play screen with its gear removed (the deck under the judge line is a flat grey placeholder and the two track edges are plain grey lines). Use it ONLY for: the camera (a low perspective looking up a long tilted track), the track's position and proportions in the middle of the frame, the lane layout (one wide scratch lane at the far left, then seven key lanes), the horizontal white judge line about 77 % down the image, the deck area under it, and where the HUD sits: the combo counter near the top of the track, the judgement text in the middle of the track, the score panel to the left of the track (SCORE, RATE, MAX COMBO, SPEED stacked), the clear gauge running up beside the right edge of the track with its percentage at its foot. Redraw the whole gear at the finish of a commercial console rhythm game.
  >
  > A 16:9 gameplay frame of a PC keyboard rhythm game, mid-song. The gear (everything that is not the lanes) is designed as ONE physical object, described below. The object decides the side frames' silhouette, the deck under the judge line, the key caps, the scratch housing, the gauge housing, the score panel's housing and the typography of every number.
  >
  > CONCEPT: RACING WHEEL. A race car's steering wheel and dash: carbon fibre, suede grips, shift lights and rotary switches.
  >
  > - Side frames: carbon-fibre side pods, each about a third of a lane wide, running the whole length of the track, with a black suede strip and red stitching along the inner edge.
  > - Deck under the judge line: a carbon-fibre steering-wheel centre plate with a flat bottom. Along its top edge, separated from the judge line by a dark gap, a row of small round shift-light LEDs (green, then red, then blue at the ends) with the first third of them lit. At the far left, in the scratch lane's column, a large knurled rotary switch with numbered positions. Then one round rubber push button per key lane with a coloured ring (white, blue or gold, matching its lane); the two pressed buttons light up in their lane colour.
  > - Under the buttons: a small dash LCD reading "1:23.456" in white digits, and small white printed micro-labels "TC", "BB" and "PIT" beside the switches.
  > - Gauge: a vertical segmented bar in a carbon housing on the right side pod, its segments white with the lowest ones amber, labelled "FUEL"; its percentage in italic white digits.
  > - Score panel: a black dash display on the left side pod with italic white motorsport digits and small red labels.
  > - Combo: large italic white digits like a dashboard gear readout. Judgement "MAX 100%" in bold italic white with a red underline.
  > - Mood: fast and aggressive. Materials only: carbon fibre, black suede, red stitching, white markings, the shift lights.
  >
  > Reading zone (the same in every gear, do not theme it): the lanes are near-black and matte (under 8 % brightness) with thin dim dividers; notes are simple crisp bars in the lane colours (white lanes white, blue lanes blue, the middle lane gold, the scratch lane red), a few single notes, one two-note chord and one long note being held in a blue lane; the judge line is a crisp white line across the track with a short soft glow. Two lanes are being pressed: their keys light up in the lane colour and a short faint light column rises from the judge line, fading within a fifth of the track. Nothing glows or moves inside the lanes except notes and those two columns.
  >
  > HUD text, exactly and cleanly legible, set in the gear's own type: the combo reads "128" with the small word "COMBO"; the judgement reads "MAX 100%"; the score panel reads "SCORE 812,345", "RATE 99.87%", "MAX COMBO 128", "SPEED 3.60"; the gauge reads "72%" with its label given above. No other text anywhere except the gear's few micro-labels given above. No logos of real brands, no characters, no watermarks.
  >
  > Finish: one key light from the top-left on every part; crisp edges with painted material detail; three value steps on every element (dark rim, mid body, bright highlight); visible construction (seams, screws, bevels) where the object has them; one accent colour on its neutral materials. No bloom haze, no lens flares, no motion blur, no gradients inside the lanes, no purple-blue-pink gradient wash, no glassmorphism, no neon outlines on everything. Outside the gear the screen is a plain very dark background.

### 스타일 프레임 `orbital-a1.png` (우주선 계기판, 저장소에 넣지 않음, 부위 그림의 기준 이미지)

- 기준 이미지: 이 게임의 7K+1S 화면에서 기어를 지운 것(레인 · 판정선 · HUD 자리)
- 날짜: 2026-11-04 22:39 KST · 약 $0.085 · PNG 5,453,810바이트 · sha256 앞 16자리 `c88ef29374e85aff`
- 프롬프트:

  > Image 1 is a screenshot of this game's play screen with its gear removed (the deck under the judge line is a flat grey placeholder and the two track edges are plain grey lines). Use it ONLY for: the camera (a low perspective looking up a long tilted track), the track's position and proportions in the middle of the frame, the lane layout (one wide scratch lane at the far left, then seven key lanes), the horizontal white judge line about 77 % down the image, the deck area under it, and where the HUD sits: the combo counter near the top of the track, the judgement text in the middle of the track, the score panel to the left of the track (SCORE, RATE, MAX COMBO, SPEED stacked), the clear gauge running up beside the right edge of the track with its percentage at its foot. Redraw the whole gear at the finish of a commercial console rhythm game.
  >
  > A 16:9 gameplay frame of a PC keyboard rhythm game, mid-song. The gear (everything that is not the lanes) is designed as ONE physical object, described below. The object decides the side frames' silhouette, the deck under the judge line, the key caps, the scratch housing, the gauge housing, the score panel's housing and the typography of every number.
  >
  > CONCEPT: SPACECRAFT PANEL. A spacecraft cockpit's instrument panel: light-grey painted panels, square lighted pushbuttons, guarded switches and gold thermal blankets.
  >
  > - Side frames: struts wrapped in crinkled gold thermal-blanket foil, each about a third of a lane wide, running the whole length of the track, with a yellow handrail along their outer edge.
  > - Deck under the judge line: a slanted light-grey matte instrument panel with black silk-screened labels and screws at its corners. At the far left, in the scratch lane's column, a guarded rotary selector (a black knob with a pointer inside a metal guard). Then one square lighted pushbutton per key lane with a white translucent face; the two pressed buttons light up in their lane colour.
  > - Under the buttons: a narrow strip with a yellow-and-black caution stripe, an amber "MASTER ALARM" lamp (unlit) and black silk-screened micro-labels "CAUTION" and "O2 FLOW".
  > - Gauge: a vertical tape instrument in a grey bezel on the right strut (a scale with tick marks behind a fixed index line), labelled "O2"; its percentage in green seven-segment digits.
  > - Score panel: a grey bezel on the left strut with green seven-segment numerals and black silk-screened labels.
  > - Combo: green seven-segment digits. Judgement "MAX 100%" in white stencil capitals.
  > - Mood: cool, technical, credible. Materials only: light-grey painted metal, gold foil, safety yellow, black labels, green numerals.
  >
  > Reading zone (the same in every gear, do not theme it): the lanes are near-black and matte (under 8 % brightness) with thin dim dividers; notes are simple crisp bars in the lane colours (white lanes white, blue lanes blue, the middle lane gold, the scratch lane red), a few single notes, one two-note chord and one long note being held in a blue lane; the judge line is a crisp white line across the track with a short soft glow. Two lanes are being pressed: their keys light up in the lane colour and a short faint light column rises from the judge line, fading within a fifth of the track. Nothing glows or moves inside the lanes except notes and those two columns.
  >
  > HUD text, exactly and cleanly legible, set in the gear's own type: the combo reads "128" with the small word "COMBO"; the judgement reads "MAX 100%"; the score panel reads "SCORE 812,345", "RATE 99.87%", "MAX COMBO 128", "SPEED 3.60"; the gauge reads "72%" with its label given above. No other text anywhere except the gear's few micro-labels given above. No logos of real brands, no characters, no watermarks.
  >
  > Finish: one key light from the top-left on every part; crisp edges with painted material detail; three value steps on every element (dark rim, mid body, bright highlight); visible construction (seams, screws, bevels) where the object has them; one accent colour on its neutral materials. No bloom haze, no lens flares, no motion blur, no gradients inside the lanes, no purple-blue-pink gradient wash, no glassmorphism, no neon outlines on everything. Outside the gear the screen is a plain very dark background.

### `gears/keyboard/knob.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 커스텀 키보드의 볼륨 노브(받침 왼쪽) → `gears/keyboard/knob.png` 512×512
- 크기 · 기준 이미지: 1:1 · 2K · `keyboard-a2.png`
- 날짜: 2026-11-05 14:59 KST · 약 $0.065
- 생성 결과(PNG): 5,541,399바이트 · sha256 앞 16자리 `5c4bd42061d13043` · 저장한 JPEG: 1,175,784바이트
- 후처리: 원으로 잘라(노브 둘레의 빛 링은 빼고 금속 노브만, 반지름의 0.895) 512 · 마젠타를 비춘 금속의 색을 뺌(무채색) · 게임은 받침에 둥글게 묻고 둘레의 주황 빛 링을 코드로 그림
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): the volume knob of a premium custom mechanical keyboard: a knurled, bead-blasted dark charcoal aluminium rotary knob whose polished top face shows fine concentric machining rings, set in a thin ring of soft warm orange light around its base. A perfect circle. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/keyboard/keycap.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 커스텀 키보드의 방향키 캡(역T자로 넷) → `gears/keyboard/keycap.png` 384×384
- 크기 · 기준 이미지: 1:1 · 2K · `keyboard-a2.png`
- 날짜: 2026-11-05 15:00 KST · 약 $0.058
- 생성 결과(PNG): 4,733,766바이트 · sha256 앞 16자리 `1f1da6f3bb74289c` · 저장한 JPEG: 822,921바이트
- 후처리: 둥근 사각형(모서리는 짧은 변의 0.16)으로 잘라 높이 384 · 무채색으로 · 게임은 캡마다 곱하기로 색을 입히고(크림색 셋, 위 키만 주황) 화살표를 코드로 그림
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): one sculpted thick PBT keycap of a custom mechanical keyboard, warm off-white ivory, square, with a gently concave dished top, softly rounded corners, crisp edges and a fine matte texture; blank, with no legend. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/keyboard/brass.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 커스텀 키보드의 황동 명판(OLED 창 아래, 'TKL-08'은 코드로 새김) → `gears/keyboard/brass.png` 912×192
- 크기 · 기준 이미지: 16:9 · 2K · `keyboard-a2.png`
- 날짜: 2026-11-05 15:00 KST · 약 $0.062
- 생성 결과(PNG): 4,416,486바이트 · sha256 앞 16자리 `3c29f9a567726d59` · 저장한 JPEG: 762,335바이트
- 후처리: 바탕이 분홍으로 비친 옆면과 그림자를 빼고 황동 앞면만(초록이 파랑보다 낮지 않은 픽셀) 둥근 사각형(0.06)으로 잘라 높이 192 · 가장자리 10 px를 판 가운데의 황동 색으로(밝기는 그대로)
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): a small rectangular weight plate of a custom keyboard case: brushed polished brass, about four and a half times as wide as it is tall, with a fine bevel along its edges and one tiny hex screw near each end; blank, with no engraving. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/racing/rotary.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 레이싱 휠의 로터리(받침 왼쪽의 큰 것과 오른쪽의 작은 것) → `gears/racing/rotary.png` 512×512
- 크기 · 기준 이미지: 1:1 · 2K · `racing-a1.png`
- 날짜: 2026-11-05 15:01 KST · 약 $0.065
- 생성 결과(PNG): 7,090,698바이트 · sha256 앞 16자리 `eee2aad53d77eb4f` · 저장한 JPEG: 1,601,752바이트
- 후처리: 원으로 잘라 512 · 무채색으로
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): the big rotary selector of a racing car's steering wheel: a knurled black anodised aluminium knob with one white pointer line on its top face, inside a ring of evenly spaced small white tick marks on a black carbon-fibre disc. A perfect circle. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/racing/button.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 레이싱 휠의 고무 버튼(넷) → `gears/racing/button.png` 384×384
- 크기 · 기준 이미지: 1:1 · 2K · `racing-a1.png`
- 날짜: 2026-11-05 15:01 KST · 약 $0.066
- 생성 결과(PNG): 7,544,469바이트 · sha256 앞 16자리 `318de6abbc290f01` · 저장한 JPEG: 1,724,619바이트
- 후처리: 원으로 잘라 384 · 무채색으로 · 게임은 곱하기로 흰 링에 노랑 · 파랑 · 흰색 · 초록을 입힘
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): one round push button of a racing car's steering wheel: a matte black soft-touch rubber cap, slightly domed, inside a thin glossy white plastic ring, in a black bezel. A perfect circle. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/orbital/selector.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 우주선 계기판의 보호 덮개 셀렉터(받침 왼쪽) → `gears/orbital/selector.png` 512×512
- 크기 · 기준 이미지: 1:1 · 2K · `orbital-a1.png`
- 날짜: 2026-11-05 15:02 KST · 약 $0.063
- 생성 결과(PNG): 4,855,930바이트 · sha256 앞 16자리 `6e66393d2e754526` · 저장한 JPEG: 895,085바이트
- 후처리: 원으로 잘라 512 · 크롬 손잡이에 비친 마젠타를 없애려 전체를 무채색으로
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): a guarded rotary selector switch of a spacecraft instrument panel: a black fluted knob with a white pointer line, between two short U-shaped polished steel guard bars that stand on its left and right, on a small round light-grey base plate with four tiny screws. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/orbital/toggle.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 우주선 계기판의 보호 덮개 토글(PWR · COMM · NAV 셋) → `gears/orbital/toggle.png` 495×512
- 크기 · 기준 이미지: 1:1 · 2K · `orbital-a1.png`
- 날짜: 2026-11-05 15:02 KST · 약 $0.059
- 생성 결과(PNG): 5,231,547바이트 · sha256 앞 16자리 `a49e978ff7acec5f` · 저장한 JPEG: 1,081,623바이트
- 후처리: 둥근 사각형(0.05)으로 잘라 높이 512 · 무채색으로
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): a guarded toggle switch of a spacecraft instrument panel: a short chrome bat-handle toggle lever on a round black base, between two polished steel guard rails on its left and right, the rails joined by a small bar at the bottom. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/orbital/button.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 우주선 계기판의 사각 버튼(ARM · ABORT) → `gears/orbital/button.png` 384×384
- 크기 · 기준 이미지: 1:1 · 2K · `orbital-a1.png`
- 날짜: 2026-11-05 15:03 KST · 약 $0.061
- 생성 결과(PNG): 4,857,574바이트 · sha256 앞 16자리 `c759745a58a2e9cc` · 저장한 JPEG: 856,703바이트
- 후처리: 둥근 사각형(0.1)으로 잘라 높이 384 · 무채색으로 · 게임은 ARM의 렌즈에 곱하기로 초록을 입히고 빛을 더함
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials and the finish of its gear. Draw ONE object seen exactly from straight above (top-down, orthographic, no perspective, no tilt): one square lighted pushbutton of a spacecraft instrument panel: a white translucent square face, unlit, inside a black square bezel with slightly rounded corners and a thin metal edge. It is centred in the image and fills about 82 % of its width, on a flat, pure magenta (#FF00FF) background that has nothing else on it. One soft key light from the top-left; crisp edges; fine material detail. No text, no letters, no numbers, no logos, no shadow cast on the background, no glow spilling onto the background.

### `gears/orbital/foil.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 우주선 계기판 테두리의 금박 단열재 → `gears/orbital/foil.png` 128×768
- 크기 · 기준 이미지: 1:1 · 2K · `orbital-a1.png`
- 날짜: 2026-11-05 15:03 KST · 약 $0.057
- 생성 결과(PNG): 9,538,794바이트 · sha256 앞 16자리 `cd7214f23f855bbb` · 저장한 JPEG: 3,690,518바이트
- 후처리: 왼쪽에서 높이의 1/6 폭 띠(1:6, 테두리의 금박 20 px × 타일 120 px와 같은 비율이라 늘이지 않음)를 잘라 128×768 · 게임은 타일마다 거울 반복이라 이음매가 없음
- 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials of its gear. Paint ONLY a flat, evenly lit, seamless tileable texture, seen exactly straight on with no perspective, filling the whole image from edge to edge: crinkled gold thermal-blanket foil of a spacecraft (multi-layer insulation): a warm gold metallic film full of small creases and facets catching the light, bright highlights and darker brown-gold folds, evenly spread over the whole image. It must tile without a visible seam. No objects, no text, no letters, no logos, no vignette, no frame or border.

### 받침 그림: 게임 카메라로 그린 받침 일곱 (2026-11-05)

부위 그림(위에서 본 사물 하나씩)을 받침에 눕혀 그리면 노브 · 스위치 · 조이스틱처럼 서 있는 부품도 납작해 보여서, 기어마다 받침 전체를 게임 카메라의 원근으로 다시 그렸습니다. 기준 이미지는 그 기어를 얹은 이 게임의 실제 화면(7K+1S, SDVX 카메라, 1920×1080, 지금의 코드 받침과 부위 그림, 노트는 판정선에서 멀리, 타격 효과 없음)의 아래쪽(x 320–1600, y 360–1080 → 1280×720)이고, 생성은 그 화면에서 받침 자리만 다시 칠합니다. 그래서 부품이 받침에서 서 있고 그 그림자가 게임과 같은 원근으로 떨어집니다.

- 만든 곳 · 저장 형식: 위와 같습니다(`gemini-nano-banana-2.1`, 16:9 · 2K → 2752×1536 PNG, `assets-src/gears/<기어>/deck.jpg` 는 JPEG 품질 95, 색 정보 줄이지 않음).
- 맞추기: 생성은 화면의 틀을 거의 지키지만 조금 커지거나 옮겨지므로, 받침 위쪽(레인 · 판정선 · 벽)을 기준 화면에 맞춰(OpenCV ECC, 아핀, 아래 "맞춤 상관") 받침 평면(트랙 가운데에서 가로, 판정선에서 아래로, 트랙 한 칸 73.65 px) → 생성 그림 px의 사영 변환을 구해 `assets-src/gears/<기어>/deck.json` 에 적었습니다(이 변환을 구한 OpenCV는 저장소의 의존성이 아닙니다; 빌드는 적어 둔 변환만 씀). 맞춘 결과는 받침의 가장자리 · 벽 발치에 격자를 그려 일곱 장 모두 눈으로 확인했습니다.
- 눕히기: `scripts/assets/build_gears.py` 가 `deck.json` 대로 받침 평면의 텍셀마다 생성 그림을 읽어(쌍선형) 받침을 위에서 본 판으로 폅니다: 가로는 받침 폭 589.2 px(양 벽 발치에서 1.5 px 안쪽)를 2048 텍셀, 세로는 받침 위 끝(판정선 아래 51 px)부터 SDVX 16:9 화면의 아래 끝까지 155.55 px를 541 텍셀 → `client/public/media/gears/<기어>/deck.webp`(WebP 품질 90). 서 있는 부품은 펴진 판에서 트랙 방향으로 길쭉하지만, 게임이 같은 카메라로 다시 눕히면 그린 대로 섭니다.
- 게임에서: 받침을 트랙 방향으로 2배까지 납작하게 보는 카메라(SDVX · LOW · FLAT, 미리보기)는 이 그림을 받침에 깔고(그린 카메라보다 납작하게 보는 만큼 트랙 방향으로 늘여), 화면이 받침을 더 보여 주는 곳(4:3 화면 등)은 그림의 마지막 줄을 늘여 잇습니다. 평면 카메라(PLANE)는 그린 각도와 너무 달라 받침을 코드와 부위 그림으로 그립니다(그림을 읽지 못했을 때도). FEVER에서도 받침 그림은 그대로입니다.
- 빛 마스크(생성하지 않음): 기어 불빛이 부품 안에서만 비치도록 `build_gears.py`가 펴진 받침 그림에서 만든 `gears/<기어>/glow.png` 3장(커스텀 키보드: 방향키 홈의 어두운 틈 · 바닥과 그 안쪽 키캡 테두리, 키캡 윤곽 안쪽은 뺌; 기본: 스피커 구멍; 나전칠기: 학 · 구름 · 덩굴의 옅고 밝은 자개, 뚜껑 테두리와 옻칠 광택은 뺌).
- 비용: 쓴 7장 약 $0.40, 다시 그린 것과 쓰지 않은 시도(아래 "쓰지 않은 시도": 첫 배치 7장, 기본 1장, 오락실 기체 4장, 리시버 시안 2장) 약 $0.84, 합해 약 $1.25
- 프롬프트(일곱 장이 같은 틀, `{deck}` 과 `{parts}` 만 기어마다 아래와 같음):

  > Image 1 is the lower part of a frame of this rhythm game's play screen. Keep its framing exactly: the same camera, the same zoom, the same crop, every line where it is (the lanes, the red judge line, the side walls, the deck's edges); do not zoom in, crop, widen or recompose. Repaint ONLY the gear's deck: the area under the red judge line and its narrow dark gap, between the inner edges of the two side walls, down to the bottom edge of the image. Keep every other pixel exactly as it is: the lanes, the notes, the red judge line, the side walls, the dark background.
  >
  > The deck is {deck}, lying flat like a console between the walls and seen exactly from this camera: the same perspective and the same vanishing lines as the track, the camera looking down at it from above and behind at about 50 degrees, its left and right edges running along the walls' inner edges, its top edge a bevelled lip toward the judge line catching the light. Keep every part where image 1 has it and give each one its real depth: {parts} Each raised part throws a soft shadow down and to the right; windows and dials are sunk into the plate with inner shadows under their top edges; one soft key light from the top-left; crisp edges and fine material detail, the finish of a commercial console game.
  >
  > No other text, letters or logos than the ones already on image 1's deck. Do not draw any key or button per lane, and nothing over the lanes.

### `gears/standard/deck.jpg`

- 용도: 기본 기어의 받침 전체 → `gears/standard/deck.webp` 2048×541(40,596바이트)
- 크기 · 기준 이미지: 16:9 · 2K · 기본 기어를 얹은 실제 화면의 아래쪽(위)
- 날짜: 2026-11-05 17:51 KST · 약 $0.055 (두 번째 생성 `standard-c1`: 첫 생성은 'GENERATIVE RHYTHM' 글자에 그림자를 겹쳐 그려 게임에서 두 겹으로 흐려 보여 다시 그림, 아래 "쓰지 않은 시도")
- 생성 결과(PNG): 4,330,774바이트 · sha256 앞 16자리 `88dbe52b27c24043` · 저장한 JPEG: 712,523바이트
- 맞춤 상관(ECC): 0.948
- `{deck}`:

  > the game's own controller: a smoked black glass panel in a slim matte graphite frame with one thin cyan light line along its top

- `{parts}`:

  > the round smoked-glass jog disc at the left stands a little proud of the glass inside its thin cyan light ring, its rim and edge visible from this angle; the 'GENERATIVE RHYTHM' lettering is printed flat on the glass in one single line of thin light-grey letters, with no shadow, no outline, no second copy and no raised edge, so it reads cleanly; the cyan light strip under it is set into the glass; the speaker grille at the right is sunk into the panel, its holes showing depth.

### `gears/cabinet/deck.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 오락실 기체의 받침 전체 → `gears/cabinet/deck.webp` 2048×541(115,892바이트)
- 크기 · 기준 이미지: 16:9 · 2K · 오락실 기체를 얹은 실제 화면의 아래쪽(위)
- 날짜: 2026-11-05 17:51 KST · 약 $0.060 (두 번째 생성 `cabinet-c1`)
- 생성 결과(PNG): 4,829,239바이트 · sha256 앞 16자리 `74933f15702f38f2` · 손본 그림(PNG): 4,923,103바이트 · sha256 앞 16자리 `348b886c0cafd3b8` · 저장한 JPEG(손본 그림): 855,044바이트
- 맞춤 상관(ECC): 0.925
- 후처리(이 그림만): 조이스틱의 빨간 공이 받침 위 끝(크롬 몰딩)을 넘어 그려져 받침을 펴면 공 윗부분이 잘려서, 공을 색(채도 높은 빨강)으로 오려 내고 그 자리를 같은 줄 200 px 오른쪽의 판으로 채운 뒤(둘레의 밝기에 맞춤) 공을 0.92배로 46 px 아래(제 손잡이 위)에 다시 얹음. 네 번 생성하고 한 번 고쳐 달라고 해도 공이 늘 위 끝을 넘어서(아래 "쓰지 않은 시도") 손으로 고침
- `{deck}`:

  > the control panel of an arcade rhythm cabinet (model GRG-2000): embossed black ABS plastic under a chrome moulding along its top

- `{parts}`:

  > the joystick at the left stands up from the middle of the round mark image 1 has there, on a short black shaft with its dust washer; it is short enough that its whole red ball top stays inside the deck, below the chrome moulding, with dark panel showing between the ball and the deck's top edge; the six convex acrylic push buttons (red, amber and milky white) stand up from the panel in chrome bezels; the two amber start buttons stand up a little; the two small smoked credit windows with dim red seven-segment digits are sunk into the panel; the silk-screened 'GRG-2000' stays flat; the metal coin entry plate at the right is fixed on the panel with its two coin slots sunk into it.

### `gears/receiver/deck.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 빈티지 리시버의 받침 전체 → `gears/receiver/deck.webp` 2048×541(66,180바이트)
- 크기 · 기준 이미지: 16:9 · 2K · 빈티지 리시버를 얹은 실제 화면의 아래쪽(위)
- 날짜: 2026-11-05 17:39 KST · 약 $0.057
- 생성 결과(PNG): 4,453,062바이트 · sha256 앞 16자리 `76a736bba62299b3` · 저장한 JPEG: 800,781바이트
- 맞춤 상관(ECC): 0.965
- `{deck}`:

  > the front panel of a 1970s stereo receiver: a thick brushed silver aluminium faceplate with fine hairlines running across the track

- `{parts}`:

  > the large knurled aluminium tuning knob at the left stands up out of the plate, its top face and the knurled side that faces the camera both visible; the long black-glass tuning dial window with its warm amber backlight, fine tick marks and thin red pointer is sunk into the plate; the five silver piano-key selector switches under it stand up from the plate, their tops and the faces toward the camera visible; the two small VU meters with amber faces are sunk behind glass; the small aluminium volume knob near the right end stands up; the engraved label 'STEREO RECEIVER SR-7' stays flat.

### `gears/najeon/deck.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 나전칠기의 받침 전체 → `gears/najeon/deck.webp` 2048×541(68,698바이트)
- 크기 · 기준 이미지: 16:9 · 2K · 나전칠기를 얹은 실제 화면의 아래쪽(위)
- 날짜: 2026-11-05 17:40 KST · 약 $0.056 (한 번 요청 한도(429)에 걸려 다시 보냄)
- 생성 결과(PNG): 4,892,150바이트 · sha256 앞 16자리 `e86e7d82964cc6c6` · 저장한 JPEG: 907,134바이트
- 맞춤 상관(ECC): 0.932
- `{deck}`:

  > the front of a Korean najeon lacquerware chest: deep black polished lacquer with a thin gold line along its top

- `{parts}`:

  > the brass corner fittings at the top corners stand slightly proud with their pins; the two round lacquer lids with the mother-of-pearl crane are slightly domed and stand a little out of the lacquer, their brass rims catching the light; the round brass lock plate in the middle stands out with its small vertical latch; the iridescent mother-of-pearl vines between thin gold lines stay inlaid flush in the lacquer.

### `gears/keyboard/deck.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 커스텀 키보드의 받침 전체 → `gears/keyboard/deck.webp` 2048×541(235,678바이트)
- 크기 · 기준 이미지: 16:9 · 2K · 커스텀 키보드를 얹은 실제 화면의 아래쪽(위)
- 날짜: 2026-11-05 17:41 KST · 약 $0.058 (한 번 요청 한도(429)에 걸려 다시 보냄)
- 생성 결과(PNG): 5,224,828바이트 · sha256 앞 16자리 `a4b04e825c9f12a5` · 저장한 JPEG: 990,685바이트
- 맞춤 상관(ECC): 0.813
- `{deck}`:

  > the top case of a premium custom mechanical keyboard (TKL-08): bead-blasted charcoal aluminium with a black gasket line and a polished chamfer along its top edge

- `{parts}`:

  > the knurled volume knob at the left stands up inside its orange light ring, its knurled side visible from this angle; the black OLED window with its white bar graph is sunk into the case; the small brass name plate 'TKL-08' is fixed on the case, standing a hair proud; the three tiny lock lights are set into the case; the four arrow-key keycaps (an inverted T, the up key orange, the others ivory) stand tall with their sculpted sides and the small arrow legends on their tops.

### `gears/racing/deck.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 레이싱 휠의 받침 전체 → `gears/racing/deck.webp` 2048×541(89,808바이트)
- 크기 · 기준 이미지: 16:9 · 2K · 레이싱 휠을 얹은 실제 화면의 아래쪽(위)
- 날짜: 2026-11-05 17:42 KST · 약 $0.061 (한 번 요청 한도(429)에 걸려 다시 보냄)
- 생성 결과(PNG): 4,817,499바이트 · sha256 앞 16자리 `621a1700fc1225be` · 저장한 JPEG: 915,465바이트
- 맞춤 상관(ECC): 0.895
- `{deck}`:

  > the button box of a sim-racing wheel: twill carbon fibre under a glossy clear coat with a thin red line along its top

- `{parts}`:

  > the row of small round shift lights across the top (the five green ones lit, then red, then blue) sits in small bezels; the big rotary switch at the left and the small one at the right stand up, their knurled sides and tick rings visible; the four rubber push buttons with yellow, blue, white and green rings stand up from the carbon; the black dash LCD in the middle, showing an idle lap timer, is sunk into the panel.

### `gears/orbital/deck.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 우주선 계기판의 받침 전체 → `gears/orbital/deck.webp` 2048×541(87,992바이트)
- 크기 · 기준 이미지: 16:9 · 2K · 우주선 계기판을 얹은 실제 화면의 아래쪽(위)
- 날짜: 2026-11-05 17:43 KST · 약 $0.057
- 생성 결과(PNG): 5,236,262바이트 · sha256 앞 16자리 `aef74abaee1c919f` · 저장한 JPEG: 1,031,887바이트
- 맞춤 상관(ECC): 0.912
- `{deck}`:

  > a spacecraft instrument panel: light grey painted metal with black silk-screened labels and small screws

- `{parts}`:

  > the guarded rotary selector at the left: its black fluted knob and its two polished steel guard bars stand up from a round base; the three guarded toggle switches (PWR, COMM, NAV) have chrome bat levers standing up between steel guard rails; the amber MASTER ALARM lamp (unlit) sits in a black bezel; the yellow and black CAUTION stripe is painted flat; the ARM (lit green) and ABORT square push buttons stand up in their bezels.

### 쓰지 않은 시도

- `cabinet-abs`(오락실 기체의 엠보싱 ABS 재질, 기준 이미지 없음): 2번 모두 그림 없이 끝남(IMAGE_RECITATION), 약 $0.011 · 재질은 코드로 만듦(위). 프롬프트:

  > A flat, evenly lit, seamless tileable texture, seen exactly straight on with no perspective, filling the whole image from edge to edge: black textured ABS plastic of an arcade cabinet, a fine leather-grain emboss, matte, very dark charcoal (about #17181b), with a faint even sheen. It must tile without a visible seam. No objects, no text, no letters, no logos, no vignette, no shadows, no frame or border.

- `keyboard-a1`, `keyboard-a3`(커스텀 키보드의 스타일 프레임, 2026-11-04, `keyboard-a2.png` 와 같은 프롬프트): 첫 시도는 그림 없이 끝남(MAX_TOKENS), 약 $0.042 · 세 번째는 고르지 않음, 약 $0.054
- `receiver-panel-a1`(빈티지 리시버의 받침 시안 1, 2026-11-05 17:23 KST, 21:9 · 2K, 기준 이미지 `receiver-a1.png`, 약 $0.065): 리시버 앞판을 앞에서 조금 위로 본 그림 한 장(PNG 4,529,622바이트) · 받침에 세워 붙이면 판의 기울기가 기어의 원근과 맞지 않아(사용자 의견) 받침 그림을 게임 카메라로 그리기로 함. 프롬프트:

  > Image 1 is a play screen of a rhythm game, given only for the materials, colours and finish of its gear (a 1970s stereo receiver). Draw ONE object: the long front control panel of that stereo receiver, as the console the player sits in front of, seen from the front and a little above (about 25 degrees down onto it, no strong perspective, both ends the same size). It is about five times as wide as it is tall and fills the width of the image, centred, on a flat, pure magenta (#FF00FF) background that has nothing else on it.
  >
  > The panel: a brushed silver aluminium faceplate with fine horizontal hairlines, between two solid walnut end cheeks with a satin finish and visible grain, one at each end. On the faceplate, from left to right: a large knurled aluminium tuning knob with a flywheel ring; a long black-glass tuning dial window with a warm amber backlight, a fine scale of tick marks (no numbers) and a thin red pointer; under the dial window a row of five small silver piano-key selector switches; two small rectangular analogue VU meters with amber-backlit faces and black needles resting low; a small aluminium volume knob near the right end; the small engraved label "STEREO RECEIVER SR-7" under the meters.
  >
  > Real depth everywhere: the faceplate is a thick plate with a bevelled top edge that catches the light and a darker lip along its bottom; the knobs stand out, their tops and knurled sides visible, each throwing a soft shadow down and to the right; the dial window and the meters are recessed behind glass, with inner shadows under their top edges and a faint reflection on the glass; the selector switches are raised keys whose top and front faces both show. One soft key light from the top-left; crisp edges; fine material detail; three value steps on every part.
  >
  > No other text, letters or numbers, no logos, no people, no lanes, notes or judge line, no shadow cast on the background, no glow spilling onto the background.

- `receiver-inscene-a1`(빈티지 리시버의 받침 시안 2, 17:28 KST, 16:9 · 2K, 기준 이미지: 리시버를 얹은 실제 화면 전체(HUD 포함), 약 $0.056, PNG 4,398,720바이트): 화면의 받침 자리만 다시 칠한 첫 시도 · 이 방식으로 일곱 기어를 그리기로 함(그림은 쓰지 않음). 프롬프트:

  > Image 1 is a frame of this rhythm game's play screen. Repaint ONLY the gear's deck: the area under the red judge line and its narrow dark gap, between the inner edges of the two walnut side walls, down to the bottom edge of the image. Keep every other pixel as it is: the lanes, the notes, the red judge line, the walnut walls, the HUD.
  >
  > The deck becomes the front panel of a 1970s stereo receiver built into the gear, lying flat like a console between the walls and seen exactly from this camera: the same perspective and the same vanishing lines as the track, the camera looking down at it from above and behind at about 50 degrees, its left and right edges running along the walls' inner edges. A thick brushed silver aluminium faceplate with fine hairlines running across the track, a bevelled lip along its top edge (the edge toward the judge line) catching the light. On it, from left to right: a large knurled aluminium tuning knob standing up out of the plate, its top face and the knurled side that faces the camera both visible in this perspective; a long black-glass tuning dial window sunk into the plate, with a warm amber backlight, fine tick marks and a thin red pointer; under the dial, five silver piano-key selector switches standing up from the plate, their tops and the faces toward the camera visible; two small VU meters with amber faces sunk behind glass; a small aluminium volume knob standing up near the right end; the small engraved label "STEREO RECEIVER SR-7". Each raised part throws a soft shadow down and to the right; one soft key light from the top-left; crisp edges and fine material detail, the finish of a commercial console game.
  >
  > No other text or logos. Do not draw any key or button per lane.

- 받침 그림 첫 배치 `<기어>-a1`(일곱 장, 17:34–17:37 KST, 기준 이미지: 기어를 얹은 실제 화면 전체 1920×1080, 합해 약 $0.423, 레이싱 휠은 한 번 요청 한도(429)에 걸려 다시 보냄): 생성이 화면의 틀을 다시 잡아(확대 · 이동) 받침을 맞추기 어려워, 화면 아래쪽만 자른 기준 이미지와 틀을 그대로 두라는 문장을 더해 다시 그림(위). 프롬프트는 위의 틀에서 첫 두 문장 대신 "Image 1 is a frame of this rhythm game's play screen."이고 `{deck}` · `{parts}` 는 기어마다 그다음 생성(`<기어>-b1`: 위에 적은 다섯 장, 아래의 `standard-b1` · `cabinet-b1`)과 같음(PNG: 기본 4,211,133 · 오락실 기체 5,159,277 · 리시버 4,616,269 · 나전칠기 4,444,946 · 키보드 4,366,560 · 레이싱 휠 4,461,621 · 계기판 4,935,802바이트).
- `standard-b1`(기본의 받침 첫 생성, 17:38 KST, 약 $0.061, PNG 4,278,731바이트 · `459322b82953799d`): 'GENERATIVE RHYTHM' 글자를 그림자와 함께 두 겹으로 새겨 게임에서 흐려 보임 · `{parts}` 의 글자 부분이 "the engraved 'GENERATIVE RHYTHM' and the cyan light strip under it are set into the glass;"
- 오락실 기체의 받침에서 조이스틱의 빨간 공이 받침 위 끝을 넘은 시도 넷(모두 `{parts}` 의 조이스틱 부분만 다름):
  - `cabinet-b1`(17:39 KST, 약 $0.059, PNG 4,814,222바이트 · `0f29c4ea383db3e1`): "the joystick at the left stands tall, its red ball top, its black shaft and its dust washer visible from this angle;"
  - `cabinet-c2`(17:52 KST, 약 $0.061, PNG 5,274,546바이트): "the joystick at the left is a low arcade stick standing up from the middle of the round mark image 1 has there: a stubby black shaft and a red ball top that, seen from this camera, covers the upper part of its round dust washer; the top of the ball is about level with the tops of the upper row of push buttons, far below the chrome moulding, with plenty of dark panel between the ball and the deck's top edge;"
  - `cabinet-c3`(17:53 KST, 약 $0.063, PNG 5,428,247바이트): "the joystick at the left: its round black dust washer sits low on the panel, lower than the round mark image 1 has there, its bottom edge close to the bottom of the image; from its middle a short black shaft rises to a red ball top; seen from this camera the whole ball stays well below the chrome moulding along the deck's top edge, with dark panel between the ball and the moulding;"
  - `cabinet-e1`(17:55 KST, 기준 이미지 `cabinet-c1`, 약 $0.054, PNG 4,866,802바이트): 조이스틱만 짧게 고쳐 달라는 요청 · 공이 오히려 조금 올라감. 프롬프트:

    > Image 1 is a frame of a rhythm game's play screen. Edit only the joystick at the left of the arcade control panel at the bottom: make it shorter, so that its red ball top sits lower and stays completely below the thin chrome moulding along the panel's top edge, with dark panel visible between the top of the ball and the moulding. Keep its round chrome-ringed dust washer where it is, its black shaft rising from the washer's middle, and its soft shadow down and to the right.
    >
    > Keep every other pixel exactly as it is: the same framing, camera, zoom and crop; the lanes, the red judge line, the side walls, the chrome moulding, the push buttons, the start buttons, the credit windows, 'GRG-2000' and the coin plate. Do not add anything.

## 타격 효과를 판정선 중심으로 온전히 (2026-11-06)

사용자 피드백("이펙트가 위쪽으로 잘리지 않고 온전히 모두 보여야 함")으로 타격 효과 18장(세트 다섯과 플래시 · 플레어 · 거품 · LED 그리드의 `hit_burst` · `hit_hold`)을 같은 원본에서 다시 만들었습니다(새로 생성한 그림은 없음, `scripts/assets/build_styles.py`). 위 항목들의 "판정선 위로는 짧게만 남김 · 판정선은 칸 위에서 30 %(27 %)"는 이제 아래와 같습니다.

- 판정선 위를 지우던 마스크(`above_line`)를 없앴고, 판정선이 칸 가운데를 지납니다(매니페스트 `anchorY` 0.5).
- 효과의 크기는 그대로 두고 칸을 넉넉하게: 효과를 256 px 기준의 숫자로 352 px 칸에 그려(가장자리 12 px는 흐리게) 256 px로 줄입니다. 매니페스트의 `span` 1.375가 렌더러에 칸이 효과보다 그만큼 크다고 알려 화면의 크기는 전과 같습니다.
- 아래로만 던지던 것을 사방으로: 메카 섬광의 불똥 줄기 열 개, 세트와 플래시 · 거품의 조각 여덟 개(45°마다 조금씩 어긋나게), 거품의 물보라 일곱, 플레어의 별빛은 줄기를 따라 위아래로 조금씩. 메카의 용접 불꽃 72개도 사방으로(떨어지는 휨 없이), 크리스털 파편 고리는 그대로 뒤집어 주로 기어 쪽으로.
- 누르는 동안의 반짝임은 빛의 둘레 위아래에, 거품은 판정선 아래에서 위로 지나 올라가고, LED 그리드는 판정선을 가운데로 위아래 13줄의 물결과 위아래로 대칭인 레벨 미터.

## 별 4각 노트를 네 갈래 별로 (2026-11-06)

사용자 피드백("사각별은 가로 길이를 레인에 맞추고, 세로 뾰족한 부분을 늘리는 방향으로 가시성을 키워줘")으로 크리스털 세트의 `notes.png`를 같은 원본(`assets-src/styles/crystal/notes.jpg`)에서 다시 만들었습니다(새로 생성한 그림은 없음). 길게 깎은 보석 넷(건반마다)을 각각 화면 비율의 네 갈래 별로 폈습니다(`build_styles.py`의 `gem_star`): 보석의 열마다 가운데에 가까울수록 더 깊게 늘려, 팔은 보석 깊이의 2.6배, 가운데 열은 칸 전체 깊이까지(늘림이 반폭 u에 대해 (1 − u/0.2)^3으로 줄어듦), 3차 보간에 알파 가중으로 거른 뒤 435 × 500 칸에 담아 2 × 2 칸(512)으로 배치합니다(원형·별 5각과 같은 배치, 예전의 1024 × 256 줄 배치는 없앰). 가로 꼭짓점은 칸의 양 끝, 세로 꼭짓점은 칸의 위아래 끝에 닿습니다.


## 피아노 기어 (`gears/piano`, 2026-11-06)

사용자가 고른 시안(아래 "시안": 건반 위에 'GENERATIVE RHYTHM' 이름판이 있던 그림)에서 이름판을 뺀 여덟째 기어입니다. 받침의 코드 그림(`deckArt.ts`의 `pianoPlate`: 래커 턱과 황동 상감선, 레인마다 흰 건반, 옥타브의 검은 건반, 스크래치 레인의 치크 블록과 메달)을 얹은 실제 화면을 기준 이미지로, 다른 기어의 받침 그림과 같은 방법(위 "받침 그림")으로 받침 자리만 다시 칠했습니다. 생성 모델 · 저장 형식 · 눕히기도 위와 같습니다(`gemini-nano-banana-2.1`, 16:9 · 2K → 2752×1536 PNG, JPEG 품질 95, 색 정보 줄이지 않음; `build_gears.py`가 `deck.json`대로 2048×541 판으로 폄). 래커 · 상아 · 테두리는 코드로 칠하고, 판정 · 콤보 · 점수판 글꼴은 OFL 글꼴 Bodoni Moda입니다(`client/src/assets/fonts/README.md`).

### `gears/piano/deck.jpg`

- 용도: 피아노의 받침 전체 → `gears/piano/deck.webp` 2048×541(40,282바이트). 건반이 레인을 따르므로 게임은 이 그림을 7K+1S 줄(스크래치 + 흰 건반 일곱)에서만 깔고, 다른 키 모드와 반쪽 덮기에서는 코드로 레인 수만큼 건반을 그립니다(`deckFromPicture`).
- 크기 · 기준 이미지: 16:9 · 2K · 피아노 기어(코드 받침)를 얹은 실제 화면(7K+1S, SDVX, 1920×1080, 타격 효과 없음)의 아래쪽(x 320–1600, y 360–1080 → 1280×720)
- 날짜: 2026-11-06 13:42 KST · 약 $0.066 (네 번째 생성 `piano-e2`: 앞의 셋은 화면의 틀을 다시 잡아 아래 "쓰지 않은 시도")
- 생성 결과(PNG): 4,431,387바이트 · sha256 앞 16자리 `70f7c9e31551e33b` · 저장한 JPEG: 818,920바이트
- 맞추기: 생성이 양옆 벽을 금색으로 다시 칠해서(게임은 벽을 코드로 그리므로 쓰지 않음), 벽을 빼고 두 벽 사이 레인 바닥(판정선 위)만으로 맞춤(OpenCV ECC, 아핀) · 맞춤 상관(ECC): 0.995 · 펴진 판에서 흰 건반 사이 틈은 레인 경계와 4 px(2048 기준) 안, 검은 건반은 레인 경계 위
- 프롬프트:

  > Image 1 is the lower part of a frame of this rhythm game's play screen. Keep its framing exactly: the same camera, the same zoom, the same crop, every line where it is (the lanes, the red judge line, the side walls, the deck's edges); do not zoom in, crop, widen or recompose. Repaint ONLY the gear's deck: the area under the red judge line and its narrow dark gap, between the inner edges of the two side walls, down to the bottom edge of the image. Keep every other pixel exactly as it is: the lanes, the notes, the red judge line, the side walls, the dark background.
  >
  > The framing stays exactly as image 1 has it: the red judge line crosses the image at 64% of its height and stays exactly there, the lanes above it keep their length and every note stays where it is, and the deck fills only the band from just under the judge line to the image's bottom edge (about the bottom third of the image). The keyboard is seen from exactly as far as image 1 shows it: each white key exactly as wide as the lane above it, every key as large as image 1 draws it. Do not move the camera closer, do not enlarge the keyboard, do not show the keys' front ends.
  >
  > The deck is the keyboard end of a concert grand piano in high-gloss polished ebony lacquer, lying flat like a console between the walls and seen exactly from this camera: the same perspective and the same vanishing lines as the track, the camera looking down at it from above and behind at about 50 degrees, its left and right edges running along the walls' inner edges. Keep every part where image 1 has it and give each one its real depth:
  > - its top edge, right under the judge line's gap, is a narrow bevelled lip of polished black lacquer catching the light, with a thin brass inlay line along its foot; the keys start right under it. There is no fallboard and no name board: nothing between the lip and the keys;
  > - the keyboard: one white key under each of the seven narrow lanes, real piano keys of warm ivory with a satin finish, separated by fine dark gaps, running toward the viewer exactly as image 1 draws them, cut by the image's bottom edge;
  > - the five black keys between the white keys in an octave's pattern, exactly where image 1 has them: raised glossy ebony keys with tapered sides and a sloped front end catching the light, clearly standing above the white keys and throwing soft shadows on them;
  > - the block under the wide left lane is the piano's cheek block: polished black lacquer standing slightly proud of the keys, a round brass medallion engraved with a treble clef in its middle, standing a hair proud.
  >
  > Each raised part throws a soft shadow down and to the right; one soft key light from the top-left; crisp edges and fine material detail, the finish of a commercial console game. No text, letters, numbers or logos anywhere. Nothing over the lanes.

### `gears/piano/medallion.png` (생성하지 않음)

- 용도: 코드로 그리는 받침(평면 카메라, 7K+1S가 아닌 줄은 메달이 없음)의 스크래치 레인 치크 블록에 세우는 높은음자리표 황동 메달 → 256×265(112,981바이트)
- 만든 곳: `build_gears.py`가 펴진 피아노 받침에서 메달의 상자(x 72–296, y 109–387, 받침 그림 px)를 잘라 받침 그림의 트랙 방향 늘임(1.2)만큼 세로를 줄이고, 상자에 맞는 타원으로 오림(`cut_flat`)

### 시안 (저장소에 넣지 않음)

- `piano-a1`, `piano-a2`(2026-11-06 09:29 KST, 16:9 · 2K, 기준 이미지: 기본 기어를 얹은 실제 화면 전체 1920×1080 위에 피아노 배치(이름판 띠 · 흰 건반 · 검은 건반 · 치크 블록과 메달)를 원근대로 그린 것, 각각 약 $0.066 · $0.065, PNG 4,342,608 · 4,087,516바이트): 받침 · 벽을 모두 다시 칠한 시안 · 사용자가 `piano-a2`를 고르고 건반 위의 이름판('GENERATIVE RHYTHM')을 빼 달라고 함. 프롬프트:

  > Image 1 is a frame of this rhythm game's play screen with a rough layout drawn on its gear. Keep its framing exactly: the same camera, the same zoom, the same crop, every line where it is (the lanes, the notes, the red judge line, the side walls, the deck's edges); do not zoom in, crop, widen or recompose. Repaint ONLY the gear: the deck under the red judge line and its narrow dark gap, between the inner edges of the two side walls, down to the bottom edge of the image, and the two side walls themselves along their whole length. Keep every other pixel exactly as it is: the lanes, the notes, the red judge line, the dark background.
  >
  > The gear is a concert grand piano. Its chassis is high-gloss polished ebony lacquer: deep black with mirror-like reflections, long soft highlights and a fine polished brass trim.
  >
  > The deck is the keyboard end of the piano, lying flat like a console between the walls and seen exactly from this camera: the same perspective and the same vanishing lines as the track, the camera looking down at it from above and behind at about 50 degrees, its left and right edges running along the walls' inner edges, its top edge a bevelled lacquer lip toward the judge line catching the light. Keep every part where image 1 has it and give each one its real depth:
  > - the band under the judge line is the piano's fallboard: polished black lacquer with a thin brass inlay line along its lower edge, the words GENERATIVE RHYTHM in small gold serif capitals in its middle;
  > - the keyboard: one white key under each of the seven narrow lanes, real piano keys of warm ivory with a satin finish, separated by fine dark gaps, running toward the viewer exactly as image 1 draws them, cut by the image's bottom edge;
  > - the five black keys sit between the white keys in an octave's pattern exactly where image 1 has them: raised glossy ebony keys with tapered sides catching the light, clearly standing above the white keys and throwing soft shadows on them;
  > - the block under the wide left lane is the piano's cheek block: polished black lacquer with a round brass medallion engraved with a treble clef, standing slightly proud.
  >
  > The two side walls are the piano's rim: polished black lacquer with a thin bright brass line along their inner top edge, the reflections running along them toward the far end of the track.
  >
  > Each raised part throws a soft shadow down and to the right; one soft key light from the top-left; crisp edges and fine material detail, the finish of a commercial console game. No other text, letters or logos than the words above. Nothing over the lanes.

### 쓰지 않은 시도

- `piano-d1`, `piano-d2`(13:40 KST, 각각 약 $0.062 · $0.060, PNG 4,422,839 · 4,362,261바이트): 판정선을 위로 올리고 건반을 크게 그려 화면의 틀을 다시 잡음(맞출 수 없음) · 프롬프트는 위의 것에서 틀을 지키라는 둘째 문단이 없던 것
- `piano-e1`(13:42 KST, 약 $0.064, PNG 4,405,872바이트): 위 프롬프트 그대로 · 역시 틀을 다시 잡음
- 비용: 쓴 1장 약 $0.066, 시안 2장 약 $0.130, 쓰지 않은 시도 3장 약 $0.186, 합해 약 $0.382

## 달 기어 (`gears/rawglass`, 2026-11-06; 2026-11-13에 지움, 기록만 남김)

사용자가 참고로 준 다른 게임 노트의 컨셉(사방을 비스듬히 깎은 은빛 거울 유리)에서 시작해, 사용자와 시안을 주고받으며 새로 디자인한 아홉째 기어입니다(그 게임의 그림이나 이름은 쓰지 않음). 크롬 판에 검은 거울 셋을 박은 첫 시안(`mirror-*`)에는 "SG-701 이랑 너무 다른데, 유리질감의 은색 기어 컨셉으로 만들어줘", 은색 판에 은도금 유리 막대 셋을 박은 둘째 시안(`silver-a*`)에는 "기어 하단에 네모 들은 넣지 마. 기어 디자인을 처음부터 하고, 첨부 이미지처럼 유리 '결정' 질감이 느껴지도록"(청록색 유리 덩어리 사진을 함께 줌), 그 사진처럼 청록색으로 칠한 셋째 시안(`rawglass-*`)에는 "SG-701 색깔로 바꿔줘", 은빛으로 칠한 넷째 시안(`silver-s3a`)에는 "이 시안을 기반으로 유리 결정 질감을 리얼하게 표현해줘"라고 했고, 그렇게 다시 칠한 그림(`flat-r*`)을 보고는 넷째 시안의 후보 넷 가운데 마지막(`silver-s2b`)을 골라 "곡선들만 안보이도록 처리하고 입체감만 좀더", 이어서 "곡선만 지워주고 선명하게 하는건 빼줘"라고 해, `silver-s2b`에서 곡선만 지운 그림을 실었습니다. 이름은 사용자가 "기어 명칭은 '달'로 해주고"라고 해 달로 정했습니다(코드의 id는 재료를 따라 `rawglass`).

받침에는 아무것도 박지 않은, 깨뜨린 은빛 크리스털 유리 덩어리 한 장입니다(곧은 결정 면 사이로 유리 속의 결과 기포가 비침). 테두리 · HUD는 코드이고, 글꼴은 이미 넣은 Orbitron입니다. 평면 카메라의 받침은 같은 결정 면을 코드로 그립니다(`deckArt.ts`의 `rawGlassPlate`). 같은 날 더한 질감 노트 여섯(크롬 베벨 · 헤어라인 · 유리 · 에나멜 · 펄 · 카본)은 생성한 그림 없이 코드로 그립니다(`tintArt.ts`).

### `gears/rawglass/deck.jpg` (2026-11-13에 지움, 기록만 남김)

- 용도: 달의 받침 전체 → `gears/rawglass/deck.webp` 2048×541(93,160바이트)
- 만든 방법: 아래 `silver-s2b`를 받침 평면으로 펼친 그림(2048×541)에서 곡선이 있던 자리(그 그림이 다시 칠한 코드 받침의 조개껍데기 모양 단면 셋, 테두리와 그 안의 물결선: 같은 코드로 다시 그린 마스크를 7px 굵게)만, 곡선을 빼고 다시 칠한 `edit-2`를 펼친 그림 위에 되맞춘 것(ECC, 아핀, 상관 0.74)의 같은 자리로 바꿔 경계에서 색을 맞춰 이음(OpenCV `seamlessClone`, Poisson). 기준 화면에서 누르고 있던 롱노트의 빛이 위 끝(x 600–900, 위에서 12px까지)에 남긴 하늘색 번짐은 줄마다 양옆 색을 곧게 이어 지움. 나머지 픽셀은 `silver-s2b` 그대로이고, 선명하게 하거나 대비를 바꾸지 않음
- 저장: 펼친 2048×541 그대로 JPEG(품질 95, 색 정보 줄이지 않음) 305,224바이트. `deck.json`은 받침 평면을 이 그림에 그대로 대는 매핑이라 `build_gears.py`가 다른 기어와 같은 방법으로 폄

### 쓴 생성 `silver-s2b`

- 기준 이미지: ① 달(은색으로 칠한 코드 받침, 조개껍데기 모양 단면 셋이 있던 때)을 얹은 실제 화면(7K+1S, SDVX, 1920×1080, 타격 효과 없음)의 아래쪽(x 320–1600, y 360–1080 → 1280×720) ② 재질 견본: 사용자가 보낸 청록색 유리 덩어리 사진의 유리 부분을 512×512로 잘라 SG-701의 흰색~은회색으로 다시 칠한 것(사진과 견본은 저장소에 넣지 않음)
- 날짜: 2026-11-06 17:02 KST · 약 $0.065 (두 장 중 둘째 `silver-s2b`), 16:9 · 2K → 2752×1536 PNG 4,687,224바이트 · sha256 앞 16자리 `d0d5ec190c882f66`
- 맞추기: 두 벽 사이 레인 바닥(판정선 위)으로 맞춤(OpenCV ECC, 아핀) · 맞춤 상관 0.9984
- 프롬프트:

  > Image 1 is the lower part of a frame of this rhythm game's play screen. Keep its framing exactly: the same camera, the same zoom, the same crop, every line where it is (the lanes, the red judge line, the side walls, the deck's edges); do not zoom in, crop, widen or recompose. Repaint ONLY the gear's deck: the area under the red judge line and its narrow dark gap, between the inner edges of the two side walls, down to the bottom edge of the image. Keep every other pixel exactly as it is: the lanes, the notes, the red judge line, the side walls, the dark background.
  >
  > The framing stays exactly as image 1 has it: the red judge line crosses the image at 64% of its height and stays exactly there, the lanes above it keep their length and every note stays where it is, and the deck fills only the band from just under the judge line to the image's bottom edge (about the bottom third of the image). Do not move the camera closer and do not enlarge anything on the deck.
  >
  > Image 2 is only a small swatch of the material, a close-up of raw glass shown in silver tones: use nothing from it but the look of its glass (its sharp conchoidal fractures with curved ripple marks, its depth, the light caught inside it, its knife-sharp glinting edges). It says nothing about the framing, the scale or the composition: those come from image 1 alone.
  >
  > The deck is one thick slab of raw, colourless crystal glass in the silvers of a bevelled mirror, like a huge chunk of rough glass rock, lying flat between the walls and seen exactly from this camera: the same perspective and the same vanishing lines as the track, the camera looking down at it from above and behind at about 50 degrees, its left and right edges running along the walls' inner edges.
  > - Its colours are only white, bright silver and cool silver grey, as polished silver and clear glass are: brilliant white where the light catches it, light silver where the light passes through it, cool grey where it is thick; no green, no aqua, no blue, no tint at all.
  > - Its top is not polished: it is broken into sharp crystalline planes and conchoidal, shell-shaped fractures with fine curved ripple lines, as freshly broken glass is, roughly where image 1 has its breaks; each facet catches the light from the top-left differently, knife-sharp ridges glinting white with a few tiny sparkles, the light caught inside the glass in bright refractions.
  > - Its top edge, right under the judge line's gap, is a straight ground edge of the same glass, a thin pale silver line, never a bright band.
  > - Nothing is set into the slab and nothing lies on it: no panels, no rectangles, no frames, no buttons, no metal plates, no objects. The glass itself is the whole design.
  >
  > The whole deck reads as a crystal of silver-white glass: transparent, faceted, glinting. One soft key light from the top-left; crisp edges and fine material detail, the finish of a commercial console game. No text, letters, numbers or logos anywhere. Nothing over the lanes.
  >
  > Again: image 1 is the canvas. Outside the deck the result lines up with image 1 pixel for pixel (the judge line at 64% of the height, the walls, the lanes and the notes where they are), and the deck keeps exactly its place and size in image 1.

### 쓴 생성 `edit-2` (곡선 자리만)

- 기준 이미지: 위 `silver-s2b`를 펼친 그림을 2048×878 캔버스 가운데(168–709행)에 둔 것, 21:9 · 2K → 3168×1344 PNG
- 날짜: 2026-11-06 17:38 KST · 약 $0.057 (세 장 중 둘째 `edit-2`), PNG 5,565,962바이트 · `de7f65e426ba280c`
- 곡선을 지우면서 면의 대비도 키웠으나, 사용자가 "선명하게 하는건 빼줘"라고 해 곡선이 있던 자리만 가져다 씀
- 프롬프트:

  > Image 1 is a flat texture: the top of a slab of silver crystal glass, seen straight from above, lying across the middle of the image between two dark margins. Edit it, changing only these two things:
  >
  > 1. Remove every curved line: the curved, shell-shaped breaks and the concentric ripple arcs inside them must disappear completely. Fill each of them in with the glass around it (its facets, its silver and grey, its texture), so that no curve, arc or ring remains anywhere. Keep the straight lines where facets meet.
  >
  > 2. Give the slab more three-dimensional depth: make each flat facet read clearly as a tilted plane of a cut crystal, in relief: brighter where it faces the light from the top-left, a deeper cool grey where it turns away from it, a crisp bright highlight along each ridge where two facets meet and a soft shadow in each valley, so the broken surface looks carved and faceted in 3D, like a real crystal.
  >
  > Keep everything else exactly as image 1 has it: the band's place, size and edges in the image, the dark margins above and below it, the straight facet edges where they are, the white, silver and cool grey colours, the glassy texture inside the facets, the thin pale line along the band's top edge. Photographic, crisp and sharp. No colour tint (no green, aqua, blue or rainbow). No text, letters, numbers or logos.

### 쓰지 않은 시도

- `edit-1`(17:37 KST, 약 $0.055, PNG 4,866,936바이트 · `bab9aecef9f2ddfe`): `edit-2`와 같은 프롬프트 · 곡선은 지웠지만 면의 모서리마다 깎은 각을 넣어 선명해짐(잠시 받침으로 깔았다가 사용자의 말에 따라 뺌); `edit-3`(17:38, 약 $0.058, 4,723,224바이트 · `ec6252ff681e7720`): 결정 면을 통째로 새로 깎아 무늬가 바뀜
- `flat-r1`(17:27, 약 $0.059, 5,509,745바이트 · `9b7c1b70a3c04a7a`) · `flat-r2`(17:27, 약 $0.054, 5,955,310바이트 · `4f3209effdbb6790`) · `flat-r3`(17:28, 약 $0.061, 6,360,959바이트 · `41901dfc1d76f481`): 넷째 시안(`silver-s3a`)을 펼친 그림을 위에서 본 평면 그대로 사진처럼 다시 칠한 것 · 배치는 지켰고 r1을 잠시 받침으로 깔았지만, 사용자가 `silver-s2b`를 골라 쓰지 않음
- `real-a1`(17:23, 약 $0.061, 5,069,459바이트 · `812c643f4634f662`) · `real-a2`(17:23, 약 $0.066, 4,688,326바이트 · `5fc3395b69a52f22`) · `real-b1`(17:24, 약 $0.066, 5,063,951바이트 · `ef2d4d76904c1ffd`) · `real-b2`(17:25, 약 $0.060, 4,668,726바이트 · `b534c3aeadd4e855`): 넷째 시안을 깐 실제 화면을 원근 그대로 사실적으로 다시 칠하라는 프롬프트(b는 은색 견본을 더함) · a1 · a2 · b1은 카메라를 당기거나 받침을 겹쳐 그려 틀이 맞지 않고, b2는 견본의 흐릿한 무늬가 면 안에 덧붙어 탁해짐
- `silver-s3a`(17:04, 약 $0.056, 4,482,196바이트 · `f4455edd2a55c53c`): 넷째 시안으로 보여 드리고 잠시 받침으로 깔았던 그림(`silver-s2b`와 같은 기준 화면, 견본 없이 은빛 결정 유리를 칠하라는 프롬프트에 틀을 지키라는 문단을 더함) · 사용자가 다른 후보를 골라 쓰지 않음; `silver-s3b`(17:05, 약 $0.062, 4,679,291바이트 · `4a0760ebb65807ff`): 먼지 같은 반짝이는 점이 많음; `silver-s3c`(17:05, 약 $0.062, 4,596,359바이트 · `95204f767df3bdc4`): 틀이 맞지 않음
- `silver-s1a`(17:01, 약 $0.059, 5,206,047바이트 · `d6af03fb1c462bb8`) · `silver-s1b`(17:02, 약 $0.058, 4,984,028바이트 · `e9365a33609d258e`): 견본 없이 은빛 결정 유리를 칠하라는 프롬프트 · 둘 다 카메라를 당겨 틀이 맞지 않음; `silver-s2a`(17:02, 약 $0.058, 4,748,630바이트 · `cf23e5a21a91f641`): `silver-s2b`와 같은 프롬프트 · 틀이 맞지 않음
- `rawglass-a1`(16:47, 약 $0.062, 4,586,763바이트 · `e541226affdeae19`) · `rawglass-a2`(16:47, 약 $0.062, 4,555,670바이트 · `c3aa8b1e1b186511`) · `rawglass-b1`(16:49, 약 $0.059, 5,502,489바이트 · `21a4223764bb360e`) · `rawglass-b2`(16:50, 약 $0.064, 5,065,964바이트 · `073cb396aeadffcf`) · `rawglass-c1`(16:52, 약 $0.063, 4,729,078바이트 · `774485428a19c9e2`) · `rawglass-c2`(16:52, 약 $0.063, 5,168,877바이트 · `1375496b57ca7e7b`): 청록색 유리 덩어리로 칠한 셋째 시안(b는 사용자의 사진, c는 그 유리 부분만 자른 견본을 재질 참고로 더함) · 사용자가 SG-701 색으로 바꾸라 해 쓰지 않음(b1 · b2 · c2는 틀도 맞지 않음, a1은 받침이 유리 상자처럼 네모로 보임)
- `silver-a1`(16:31, 약 $0.059, 4,319,618바이트 · `3eb339183d1db7a5`) · `silver-a2`(16:31, 약 $0.067, 4,384,502바이트 · `72e0cba1b75d351f`): 둘째 시안 실버 글라스(은색 위 두꺼운 유리판에 베벨로 깎은 은도금 유리 막대 셋) · 받침의 네모를 빼고 처음부터 다시 디자인하라 해서 쓰지 않음(a2는 틀도 맞지 않음)
- `mirror-a1`(16:05, 약 $0.058, 4,297,684바이트 · `d96b073f85483e86`) · `mirror-a2`(16:06, 약 $0.057, 4,344,918바이트 · `39018505bff38b41`): 첫 시안 베벨 미러(크롬 판에 베벨로 깎은 검은 거울 셋) · SG-701과 너무 다르다 해서 쓰지 않음(a2는 그 전에도 판정선 바로 아래 밝은 크롬 띠가 두 번째 판정선처럼 보여 빼 둠)
- 비용: 쓴 2장 약 $0.122, 쓰지 않은 25장 약 $1.510, 합해 약 $1.632

## 하늘 스킨의 받침 그림과 깃털 (`gears/sky`, 2026-11-11)

'하늘' 스킨(기어 · 노트 · 타격 효과 · 글자)은 코드로 그리지만, 받침의 하늘 · 구름과 점수 왼쪽의 깃털은 그림입니다. 사용자의 물음("에셋을 gemini로 뽑아서 그걸 적용시킬수는 없는거야?")과 요청("깃털도 gemini 그림으로 바꾸고, 기어 하단에 구름도 시안처럼 더 뭉게뭉게하게 바꿔줘")에 따라 넣었습니다. 그림을 읽지 못하면 받침은 코드로 그립니다(`deckArt.ts`의 `skyDrawn`, `feather`). 키 표시선 · 수치 자리 · 레일 · 레인의 그림 · 노트 · 타격 효과 · 글자는 모두 코드입니다.

- 만든 곳: Google Cloud Vertex AI 의 Gemini 이미지 생성(`gemini-nano-banana-2.1`) · 사용자의 Google Cloud 프로젝트 · 2K 한 장 약 $0.06, 1K 한 장 약 $0.04(토큰 사용량으로 계산한 추정치)
- 보낸 그림: 받침 그림에는 이 스킨의 시안(`design-mockups/gear-concepts/r2-skin-sky-c3.jpg`, 같은 모델로 글만으로 만든 그림)에서 구름 두 군데만 잘라 이어 붙인 견본 한 장(924×196, 수치 · 깃털 · 레일은 들어가지 않게 자름: `make_sky_pictures.py`의 `swatch`)을 "구름을 이렇게 그려 달라"는 견본으로 함께 보냈습니다. 깃털은 글로만 설명했습니다. 사용자가 참고로 준 다른 게임의 스킨 그림은 어디에도 보내지 않았고, 프롬프트에 게임 · 회사 · 아티스트 이름이 없습니다.
- 만드는 도구: `scripts/assets/make_sky_pictures.py plate feather` (받은 그대로는 `assets-src/gears/sky/_tries/`에 두고 저장소에는 넣지 않음)
- 비용: 쓴 2장 약 $0.10, 쓰지 않은 2장 약 $0.12, 합해 약 $0.22

### `gears/sky/plate.jpg`

- 용도: 하늘 기어 받침의 하늘과 구름 → `gears/sky/plate.webp` 2048×886(58,934바이트)
- 날짜: 2026-11-11 08:22 UTC · 두 장 중 첫째 `plate-2` · 21:9 · 2K → 3168×1344 PNG 4,319,306바이트 · sha256 앞 16자리 `337a3a20e77a6801`
- 저장: 받은 그림 그대로 JPEG(품질 95, 색 정보 줄이지 않음) 708,319바이트
- 게임용으로: `scripts/assets/build_gears.py`가 위에 빈 하늘을 그림 높이의 2%만큼 덧대고(맨 윗줄을 이어서: 구름이 시안만큼 받침 아래쪽에 서도록) 2048×886으로 줄여 WebP(품질 90)로 저장합니다.
- 게임에서: 키 표시선 띠 아래에 받침 폭 그대로, 카메라가 받침을 납작하게 보는 만큼 트랙 방향으로 늘여 깔아 그린 그대로 보이게 합니다(`deckArt.ts`의 `skyPainting`). 기본 카메라에서는 그림의 위쪽 절반 남짓(하늘과 양끝 뭉게구름의 윗부분, 가운데는 점수 자리로 비어 있음)이 보이고, 받침이 더 깊이 보이는 화면(평면 카메라, 설정의 미리보기)에서는 그 아래 구름 바다까지 보입니다. 그림보다 더 깊이 보이는 곳은 마지막 줄을 이어 그늘로 가라앉힙니다.
- 프롬프트(견본이 image 1):

  > Image 1 is a small swatch that shows the look wanted: soft, fluffy, billowing cumulus clouds painted as an anime film's background art paints them, and the blue of the sky behind them. Take nothing from it but that look: how the clouds are painted (their soft volume, the many small round billows piled on one another, their feathered edges, their pale blue shading) and the sky's blue. Its framing and its composition do not matter.
  >
  > Paint a wide background painting of a clear daytime sky with white cumulus clouds in that same manner. The clouds have real volume: each is built of many soft, rounded billows heaped on one another, big ones and small ones, their sunlit tops a clean bright white, their folds and undersides shaded softly in pale blue and blue-grey, their edges soft and feathered, with small wisps drifting off them. Soft brushwork, as in a hand-painted anime film background. They are not flat shapes: no outlines, no hard-edged cel shading, no vector look, no cartoon clouds.
  >
  > It is used as a flat texture inside a game's interface, so it must be a straight-on, undistorted picture: no horizon line, no ground, no sea, no sun, no lens flare, no rays of light, no stars, no birds, no aircraft, no text.
  >
  > Composition, exactly:
  > - The top fifth of the picture is plain clear sky, a deep clear blue (#2f7fd6), nothing in it.
  > - Going down, the sky's blue eases lighter: a mid blue (#4a98e2) across the middle of the picture, a pale sky blue (#86c6f2) by two thirds of the way down.
  > - A large cumulus rises from the lower-left corner. It fills the left 30% of the width; its highest billow, at the far left edge, reaches up to about 20% of the way down from the top; from there it comes down toward the middle of the picture in big soft steps and ends by a third of the width.
  > - A second cumulus, a little lower, rises from the lower-right corner. It fills the right quarter of the width; its highest billow, at the far right edge, reaches up to about 30% of the way down from the top; it comes down toward the middle in the same way.
  > - The middle 40% of the width is completely clear sky from the top of the picture down to 60% of its height: no cloud, no wisp, nothing there at all (the game writes white text there).
  > - One or two small soft tufts of cloud sit low beside the two big ones, below the half-way line, never in the middle.
  > - Two or three very thin, faint white wind trails cross the whole width in long, gentle arcs, hairline thin, behind the clouds.
  > - The bottom third of the picture is a continuous sea of the same soft cumulus seen from the side, its top edge billowing and joining the two big clouds; below its top edge it falls evenly into soft pale-blue shade toward the bottom edge of the picture.
  >
  > Colours: only these blues and white, the shading pale blue and blue-grey; no yellow, no orange, no pink, no purple, no dark storm cloud. Calm, even daylight from the upper left. No vignette, no frame, no border, no watermark, no text, no letters, no numbers.

### `gears/sky/feather.jpg`

- 용도: 점수 왼쪽의 깃털 → `gears/sky/feather.png` 256×256(29,719바이트, 투명 배경)
- 날짜: 2026-11-11 08:22 UTC · 한 장을 받아 그대로 씀(`feather-1`) · 1:1 · 1K → 1024×1024 PNG 846,575바이트 · sha256 앞 16자리 `8b154558e8add95d`
- 저장: 받은 그림 그대로 JPEG(품질 95, 색 정보 줄이지 않음) 132,139바이트
- 게임용으로: `build_gears.py`의 `cut_white`가 자홍 바탕에서 깃털을 따냅니다. 흰 물체라 다른 부품의 방식(바탕색이 비친 붉은 · 파란 기운을 초록에 맞춰 깎음)을 쓰면 흰색이 초록빛으로 물들어서, 바탕에 없는 초록 채널만으로 색을 다시 만듭니다(초록이 가득한 곳은 흰색, 그늘진 곳은 옅은 하늘색 `#bcd7f3`).
- 게임에서: SCORE 글자 왼쪽, 같은 줄에 점수 줄보다 조금 크게 놓습니다(`deckArt.ts`의 `skyPlate`; 시안에서는 점수 위였으나 사용자 요청 "기어 하단에 깃털 위치만 score 왼쪽으로 옮겨줘"로 옮김). 그림이 없으면 코드로 그린 깃털이 나옵니다.
- 프롬프트:

  > One single white bird's feather, seen flat from directly above, centred, on a perfectly flat, uniform, pure magenta (#ff00ff) background.
  >
  > The feather leans to the right, about 30 degrees from upright, its tip at the upper right. Its vane is full and softly curved, widest a little above its middle, tapering to a soft point at the tip; one clear split opens in its right edge about two thirds of the way up, and a smaller one lower on its left edge. A fine quill runs up through the vane as a thin pale-blue line and comes out below it as a short, bare, slightly curved shaft pointing to the lower left.
  >
  > A clean, elegant illustration, as a game's interface icon is drawn: the feather a clean white, with only the faintest pale-blue (#cfe6fb) shading along the quill and toward the vane's lower edge; smooth, crisp edges.
  >
  > No outline round it, no shadow on the background, no glow, no gradient or texture in the background, nothing else in the picture: no second feather, no down, no text, no letters, no frame. The feather, shaft and all, fills about 70% of the picture's height; the flat magenta shows all round it.

### 쓰지 않은 시도

- `plate-1`(07:50 UTC, 약 $0.06, PNG 3,988,599바이트 · `4f0ab4df783e515c`): 견본 없이 글만으로, "평평한 셀 셰이딩"으로 그리라는 프롬프트 · 구도는 맞았고 잠시 받침으로 깔았으나(커밋 271431c ~ c6baae2) 구름이 납작한 만화 구름이라, 사용자가 시안처럼 더 뭉게뭉게하게 바꿔 달라고 해 바꿈. 프롬프트는 그 커밋들의 이 파일과 `make_sky_pictures.py`에 있습니다.
- `plate-3`(08:22 UTC, 약 $0.06, PNG 4,279,980바이트 · `e82155c5b853fe71`): `plate-2`와 같은 프롬프트와 견본 · 오른쪽 구름이 그림 맨 위까지 닿아, 받침에 깔면 키 표시선 띠 바로 아래부터 구름이 됨

## 스킨의 타격 효과: 프레임 애니메이션 시트 (`styles/skinfx`, 2026-11-11)

스킨 15종(기본 · 크리스털 · 하늘 · 파이어스타터 · GPT · Gemini · Grok · Claude · 아쿠아 · 스틸 · 무지개 · 레드라인 · 크림슨 · 화이트 라인 · 별밤)의 타격 효과를 코드 그림에서 그림으로 바꾼 것입니다. 사용자의 요청(2026-11-11): "이펙트에 단순 도형 (원, 선)으로 이루어진 티가 너무 나고, 애니메이션도 너무 밋밋", "이펙트의 지속시간은 길면 안 돼. 0.4초 이하가 이상적", "GEMINI API 우선으로 이미지 생성 방식으로 다시 작성해줘", "후보에 없는 스킨들도 이펙트를 코드로 작성했다면 이미지로 다시 만들어서 진행해줘", Grok은 "트위터 X 표시가 반짝이면서 터지는 느낌으로".

- 만든 곳: Google Cloud Vertex AI 의 Gemini 이미지 생성(`gemini-nano-banana-2.1`, 1:1 · 2K → 2048×2048 PNG) · 사용자의 Google Cloud 프로젝트 · 한 장 약 $0.06(토큰 사용량으로 계산한 추정치)
- 방식: 효과마다 한 장에 **16프레임(4×4, 검은 바탕)의 프레임별 애니메이션**을 그리게 했습니다. 치는 순간(`<효과>_burst`)과 롱노트를 누르는 동안(`<효과>_hold`, 반복) 두 장씩입니다. 예전 세트의 효과(`styles/hits`)처럼 낱장 조각을 코드로 움직인 것이 아니라, 프레임마다 다른 그림입니다.
- 보낸 그림: 없음(글로만). 다른 게임의 화면, 사용자가 올린 레퍼런스 그림, 로고는 보내지 않았습니다. 회사 스킨은 색과 분위기만 글로 적었고, Grok은 "굵은 획과 가는 획이 엇갈린 X"라고 적었습니다.
- 만드는 도구: `scripts/assets/make_skin_fx.py make <효과> burst|hold` (받은 그대로는 `assets-src/styles/skinfx/_tries/`에 두고 저장소에는 넣지 않음) → `pick`이 고른 것을 1536×1536 JPEG(품질 92, 색 정보 줄이지 않음)으로 저장
- 게임용으로: `scripts/assets/build_skin_fx.py`가 검정을 검정으로 만들고(모델의 검정과 JPEG 잡음 제거), 프레임마다 칸 가장자리로 흐려지게 하고, 빛이 사라진 뒤의 프레임과 거의 빈 첫 프레임을 뺀 다음 `client/public/media/fx/<효과>_burst.webp`(1536×1536, 프레임 384px)와 `_hold.webp`(1024×1024, 프레임 256px)로 만듭니다. 치는 순간은 프레임 수와 상관없이 **0.32초**에 끝나고(프레임 수 ÷ 0.32 = fps), 누르는 동안은 24fps 반복입니다. 기본 스킨의 플래시(`basic`)만 흰빛으로 만들어 게임이 레인 색을 입히고, 나머지는 제 색 그대로 더합니다(매니페스트의 `plain`).
- 고르기: 효과마다 한 장씩 받아 모두 그대로 썼습니다(파이어스타터의 치는 순간은 방식을 시험한 첫 장). 누르는 동안 5장(파이어스타터 · 아쿠아 · 스틸 · 무지개 · 레드라인)은 분당 한도(HTTP 429)로 실패해 다시 요청했습니다(실패한 요청은 그림이 없고 비용도 없음).
- 비용: 30장 약 $1.80
- 2026-11-13: 무지개와 크림슨 스킨을 없애며 그 두 스킨의 효과 4장(`rainbow_burst.jpg` · `rainbow_hold.jpg` · `magenta_burst.jpg` · `magenta_hold.jpg`)과 게임용 파일을 지웠습니다([없앤 스킨](#없앤-스킨-무지개--크림슨-2026-11-13)). 아래의 두 스킨 기록과 위의 장수 · 비용은 만든 때 그대로 둡니다. 게임에 남은 것은 13종 26장입니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 프롬프트에 게임 · 아티스트 이름은 없습니다.

### 공통 프롬프트

치는 순간(`burst`)의 머리말과 꼬리말(사이에 효과별 `THE EFFECT` · `THE ANIMATION`이 들어감):

  > A sprite sheet for a game VFX artist: the frame-by-frame animation of ONE hit impact effect for a commercial PC rhythm game, at the finish level of a top commercial action game's hand-painted VFX flipbooks.
  >
  > LAYOUT: exactly 16 frames in a 4 x 4 grid of equal square cells, read left to right, top to bottom (frame 1 top-left, frame 16 bottom-right). Pure black background (#000000) everywhere. NO grid lines, NO borders, NO frame numbers, NO text. The effect is centred on the same point in every cell and stays inside its cell with black space around it; nothing touches a cell edge.
  >
  > (THE EFFECT … / THE ANIMATION, one continuous motion across the 16 frames: …)
  > Every frame is a different drawing of the same event a moment later: shapes change, break up and travel outward, they are not one picture scaled up. Painterly, energetic, asymmetric, with sharp bright edges and soft glow. It is light only, on black, to be added onto the screen. No ground, no objects, no characters, no logos, no letters, no numbers.

누르는 동안(`hold`)의 머리말과 꼬리말:

  > A sprite sheet for a game VFX artist: the frame-by-frame animation of ONE small looping effect for a commercial PC rhythm game, at the finish level of a top commercial action game's hand-painted VFX flipbooks: the light that burns steadily at the spot where a long note is being held down.
  >
  > LAYOUT: exactly 16 frames in a 4 x 4 grid of equal square cells, read left to right, top to bottom. Pure black background (#000000) everywhere. NO grid lines, NO borders, NO frame numbers, NO text. The effect is centred on the same point in every cell, about the same size and the same brightness in every frame (it fills about half of the cell's width), and stays inside its cell with plenty of black space around it; nothing touches a cell edge.
  >
  > (THE EFFECT … / THE ANIMATION: in every frame …, while ….)
  > It is a seamless loop: there is no start and no end, no frame is empty and none is much bigger or brighter than the others; frame 16 flows back into frame 1. Every frame is a different drawing of the same steady effect a moment later: the flickering parts change shape and place from frame to frame, they are not one picture turned or scaled. Painterly, energetic, with sharp bright edges and soft glow. It is light only, on black, to be added onto the screen. No ground, no objects, no characters, no logos, no letters, no numbers.


### `styles/skinfx/basic_burst.jpg` · `basic_hold.jpg` (기본(플래시))

- 치는 순간: 2026-11-11 14:09 UTC · PNG 3,783,289바이트 · sha256 앞 16자리 `bd3da103f10eceb4` · 저장한 JPEG 287,410바이트 → `fx/basic_burst.webp` 1536×1536(110,090바이트), 9프레임 · 28.1fps
- 누르는 동안: 2026-11-11 14:12 UTC · PNG 3,725,456바이트 · sha256 앞 16자리 `ab451112d3a6c06e` · 저장한 JPEG 254,098바이트 → `fx/basic_hold.webp` 1024×1024(47,022바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a clean, punchy burst of pure light with a crackle of electric energy. Every element is white and grey light only, with no colour at all, because the game colours it itself.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white point snaps open into a blinding star-shaped flash with long sharp rays;
  > - frames 3-5: the flash blows outward into a bright shockwave ring with short crackling arcs of energy on it and sharp glints shooting out in all directions;
  > - frames 6-10: the ring keeps expanding and breaks into separate thin arcs, the glints fly further and stretch into fine streaks, small four-ray sparkles twinkle;
  > - frames 11-14: only a few thin arcs and tiny fading sparkles are left, getting smaller and dimmer;
  > - frames 15-16: almost nothing, the last one or two faint sparkles; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a steady crackle of pure energy. Every element is white and grey light only, with no colour at all, because the game colours it itself.
  >
  > THE ANIMATION: in every frame a small white-hot round core with a soft bloom stays in the centre, while short crackling electric arcs dance around the core, jumping to new places every frame, and tiny sharp sparks and four-ray glints pop off it in all directions.

### `styles/skinfx/prism_burst.jpg` · `prism_hold.jpg` (크리스털)

- 치는 순간: 2026-11-11 14:09 UTC · PNG 3,762,746바이트 · sha256 앞 16자리 `574de33947ae5a20` · 저장한 JPEG 318,583바이트 → `fx/prism_burst.webp` 1536×1536(113,136바이트), 11프레임 · 34.4fps
- 누르는 동안: 2026-11-11 14:13 UTC · PNG 3,717,017바이트 · sha256 앞 16자리 `143a926d3efe9690` · 저장한 JPEG 314,906바이트 → `fx/prism_hold.webp` 1024×1024(64,736바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a burst of cut crystal and prismatic light: ice-white and pale-blue shards of clear faceted glass, with thin rainbow dispersion (a fine spectrum of red, yellow, green, blue, violet) along their cut edges.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white glint snaps open into a blinding diamond-shaped flash with a thin rainbow halo;
  > - frames 3-5: a crystal shatters outward from the centre: many sharp, faceted, translucent shards of different sizes shoot out in all directions, each facet catching white light, thin spectral streaks between them;
  > - frames 6-10: the shards fly further, tumble and turn so that different facets flash, tiny rainbow glints sparkle among them, the centre is only a pale blue glow;
  > - frames 11-14: only a few small shards and tiny prismatic sparkles are left, getting smaller and dimmer;
  > - frames 15-16: almost nothing, the last one or two faint glints; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small point of prismatic light in ice white and pale blue with thin rainbow dispersion (red, yellow, green, blue, violet).
  >
  > THE ANIMATION: in every frame a small bright diamond-shaped white core with a pale blue glow stays in the centre, while thin rainbow glints and tiny faceted shards of crystal light flick out from the core at different angles every frame, and small spectral sparkles twinkle around it.

### `styles/skinfx/sky_burst.jpg` · `sky_hold.jpg` (하늘)

- 치는 순간: 2026-11-11 14:09 UTC · PNG 3,928,577바이트 · sha256 앞 16자리 `3cf8c1d5dd5933b2` · 저장한 JPEG 365,702바이트 → `fx/sky_burst.webp` 1536×1536(137,228바이트), 12프레임 · 37.5fps
- 누르는 동안: 2026-11-11 14:12 UTC · PNG 4,203,941바이트 · sha256 앞 16자리 `417aa52b73090a84` · 저장한 JPEG 359,087바이트 → `fx/sky_hold.webp` 1024×1024(76,790바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a soft, bright burst of white cloud, sunlight and white feathers in a clear sky-blue glow: white, pale cyan and sky blue.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white point snaps open into a bright sunburst with soft rays;
  > - frames 3-5: a puff of white cloud bursts open into a ring of billowing cloud wisps, and several white feathers are thrown out from the centre in different directions, with a few sparkling glints;
  > - frames 6-10: the cloud ring spreads and thins into separate drifting wisps, the feathers whirl outward, turning and curling as they fly, small sparkles twinkle;
  > - frames 11-14: only two or three small feathers and thin wisps are left, drifting and fading into pale blue;
  > - frames 15-16: almost nothing, the last faint wisp; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small ball of warm sunlight in white, pale cyan and sky blue.
  >
  > THE ANIMATION: in every frame a soft, bright, round white core with a sky-blue glow stays in the centre, while small wisps of white cloud curl and drift around the core, short soft sun rays turn slowly, and one or two tiny white feathers and sparkles float up and away in every frame.

### `styles/skinfx/fire_burst.jpg` · `fire_hold.jpg` (파이어스타터)

- 치는 순간: 2026-11-11 15:56 UTC · PNG 4,030,333바이트 · sha256 앞 16자리 `aaa00b658bbb8bc4` · 저장한 JPEG 487,615바이트 → `fx/fire_burst.webp` 1536×1536(210,256바이트), 11프레임 · 34.4fps
- 누르는 동안: 2026-11-11 15:56 UTC · PNG 5,159,266바이트 · sha256 앞 16자리 `d860f482dd0fa855` · 저장한 JPEG 725,038바이트 → `fx/fire_hold.webp` 1024×1024(185,972바이트), 16프레임 · 24fps 반복
- 두 번째 그림입니다. 처음 것(치는 순간 2026-11-11 14:06 UTC · sha256 앞 16자리 `4889d098a6893898`, 누르는 동안 14:17 UTC · `02e9dc3be826a192`)은 "a fiery impact burst, white-hot at its core, molten orange and deep red toward its edges"와 "a small roaring flame"으로 뽑은 녹은 주황색 불덩이와 불길이었고, 사용자가 "Firestarter는 불꽃놀이 느낌이 나야하는데 용암같다"고 해서 버렸습니다. 불꽃놀이로 프롬프트를 다시 써서 치는 순간 2장 · 누르는 동안 2장을 뽑았고, 치는 순간은 둘째 장(시작에 흰 섬광이 있고 반짝이가 네 갈래 별 모양), 누르는 동안은 첫째 장(불티가 가늘고 많아 스파클러에 더 가까움)을 골랐습니다.
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a FIREWORK shell bursting in a black night sky, as a firework looks in a short-exposure photograph: it is made ONLY of thin straight streaks of light and tiny points of light. Crimson red and hot magenta-pink streaks with brilliant white-gold heads, and gold glitter. There is NO flame, NO fire tongue, NO fireball, NO blob, NO cloud, NO smoke and NO lava anywhere: every element is a fine line or a small sparkling dot, bright and crisp enough to read when the picture is shown small.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white-gold point snaps open into a small blinding star with a first circle of very short thin streaks around it;
  > - frames 3-5: the shell bursts: sixty or more thin straight streaks shoot out radially in every direction and fill a round chrysanthemum, each streak with a brilliant white-gold bead at its head and a fine tapering crimson or hot-pink tail behind it, streaks of different lengths; the white core shrinks to a small glint;
  > - frames 6-10: the streaks reach their full length and their tails fade from the centre outward, so the middle of the burst is empty and black and the firework is a hollow sphere of bright heads; the heads slow down, begin to droop very slightly, and start to crackle, each breaking into a cluster of tiny twinkling gold and white glitter sparks;
  > - frames 11-14: only the crackling glitter is left, in a broken ring: tiny gold and white four-ray twinkles and pin-point sparks that blink on and off at different places in every frame, fewer and dimmer in each frame, a few of them falling a little;
  > - frames 15-16: almost nothing, the last two or three faint twinkles; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: the burning tip of a hand-held SPARKLER firework seen up close: a spray of thin sparks, made ONLY of fine straight lines and tiny points of light, white-gold at the centre and crimson red and hot magenta-pink toward the ends. There is NO flame, NO fire tongue, NO fireball, NO blob, NO smoke and NO lava anywhere.
  >
  > THE ANIMATION: in every frame a small brilliant white-gold core stays in the centre, while dozens of hair-thin straight sparks spray out from it in all directions, many of them forking at their ends into two or three tiny branches as a sparkler's sparks do, with different directions and lengths in every frame, and tiny gold glitter points twinkle on and off around it.

### `styles/skinfx/gpt_burst.jpg` · `gpt_hold.jpg` (GPT)

- 치는 순간: 2026-11-11 14:09 UTC · PNG 3,755,139바이트 · sha256 앞 16자리 `389cbb1b5cd5e503` · 저장한 JPEG 336,084바이트 → `fx/gpt_burst.webp` 1536×1536(119,006바이트), 11프레임 · 34.4fps
- 누르는 동안: 2026-11-11 14:12 UTC · PNG 4,968,930바이트 · sha256 앞 16자리 `8be1fb97d40c76f2` · 저장한 JPEG 585,012바이트 → `fx/gpt_hold.webp` 1024×1024(136,022바이트), 13프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a burst of liquid light in emerald-teal green (#10a37f) and white, like a drop hitting still water: white at its core, bright teal green around it.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white point snaps open into a bright round bloom of white and teal light;
  > - frames 3-5: a crown-shaped splash of glowing teal liquid light leaps up and outward from the centre with round droplets flying off its tips, and a bright ripple ring opens around it;
  > - frames 6-10: the splash collapses and tears into separate ribbons and beads of light, the round droplets fly further and stretch into short streaks, a second, thinner ripple ring follows the first;
  > - frames 11-14: only thin broken ripple arcs and a few small round droplets are left, getting smaller and darker green;
  > - frames 15-16: almost nothing, the last one or two faint droplets; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a bead of liquid light in emerald-teal green (#10a37f) and white, seen from above.
  >
  > THE ANIMATION: in every frame a bright round white bead with a teal glow stays in the centre, while thin ripple rings pulse outward from the bead one after another, and small round droplets of teal light hop around it at different places in every frame.

### `styles/skinfx/gemini_burst.jpg` · `gemini_hold.jpg` (Gemini)

- 치는 순간: 2026-11-11 14:09 UTC · PNG 3,367,793바이트 · sha256 앞 16자리 `31442c68eeef5065` · 저장한 JPEG 262,516바이트 → `fx/gemini_burst.webp` 1536×1536(83,488바이트), 10프레임 · 31.2fps
- 누르는 동안: 2026-11-11 14:12 UTC · PNG 3,858,287바이트 · sha256 앞 16자리 `a7cdb1870051e66c` · 저장한 JPEG 355,550바이트 → `fx/gemini_hold.webp` 1024×1024(72,170바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a burst of four-pointed sparkle stars (each with four long, thin, tapering points and concave sides) in a smooth gradient of blue, violet and pink with white-hot cores.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white point snaps open into one large four-pointed sparkle star with long thin points, white with a blue-to-pink gradient glow;
  > - frames 3-5: the large star flares to its biggest, turns a little and throws off many smaller four-pointed sparkles in blue, violet and pink that shoot outward in all directions, each leaving a short soft trail;
  > - frames 6-10: the large star shrinks to a thin cross of light and fades while the small sparkles fly further, each one twinkling (growing and shrinking) at a different moment, with tiny dots of light among them;
  > - frames 11-14: only a few small sparkles are left, twinkling out one by one;
  > - frames 15-16: almost nothing, the last one faint sparkle; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a four-pointed sparkle star (four long thin tapering points, concave sides) with a white core and a smooth blue, violet and pink gradient glow.
  >
  > THE ANIMATION: in every frame the sparkle star stays in the centre, while its four points lengthen and shorten so that it twinkles, a faint second star turned 45 degrees pulses behind it, and tiny four-pointed sparkles in blue, violet and pink appear and vanish around it.

### `styles/skinfx/grok_burst.jpg` · `grok_hold.jpg` (Grok)

- 치는 순간: 2026-11-11 14:10 UTC · PNG 3,790,062바이트 · sha256 앞 16자리 `fcb6bad18c637895` · 저장한 JPEG 308,027바이트 → `fx/grok_burst.webp` 1536×1536(112,912바이트), 11프레임 · 34.4fps
- 누르는 동안: 2026-11-11 14:13 UTC · PNG 3,800,277바이트 · sha256 앞 16자리 `4a9e3ee072fa74e1` · 저장한 JPEG 285,329바이트 → `fx/grok_hold.webp` 1024×1024(57,094바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a bold X mark made of two crossing diagonal strokes, one thick and one thin, in pure white and silver light, monochrome with no colour at all, that flashes, glints and bursts apart.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: two fast diagonal slashes of white light cross each other with motion streaks and form a bold, sharp X, one stroke thick and one thin;
  > - frames 3-5: the X flares blinding white, a bright star-shaped glint flashes at its crossing point and smaller glints sparkle along its edges and at its four tips;
  > - frames 6-10: the X cracks and bursts apart: its strokes break into angular shards and splinters that shoot outward along the four diagonal directions, with sharp sparks and four-ray sparkles between them;
  > - frames 11-14: only a few small shards and twinkling sparkles are left, flying outward, getting smaller and dimmer grey;
  > - frames 15-16: almost nothing, the last one or two faint sparkles; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small bold X-shaped spark made of two crossing diagonal strokes, one thick and one thin, in pure white and silver light, monochrome with no colour at all.
  >
  > THE ANIMATION: in every frame the X stays in the centre, while its strokes flicker in length and brightness, a sharp star-shaped glint flashes at its crossing point, and tiny angular shards and four-ray sparkles jump off its four tips at different places in every frame.

### `styles/skinfx/claude_burst.jpg` · `claude_hold.jpg` (Claude)

- 치는 순간: 2026-11-11 14:10 UTC · PNG 3,460,798바이트 · sha256 앞 16자리 `0620f60916cfea5c` · 저장한 JPEG 309,356바이트 → `fx/claude_burst.webp` 1536×1536(113,434바이트), 9프레임 · 28.1fps
- 누르는 동안: 2026-11-11 14:13 UTC · PNG 4,044,550바이트 · sha256 앞 16자리 `d7d515c538db853c` · 저장한 JPEG 432,263바이트 → `fx/claude_hold.webp` 1024×1024(98,098바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a hand-painted starburst in warm terracotta orange (#d97757) and cream, like a sunburst made of uneven tapered brush strokes with a dry-brush texture: cream-white at the centre, terracotta at the tips.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a small cream-white dab of paint snaps open into a bright asterisk-like burst of short tapered brush strokes;
  > - frames 3-5: the strokes shoot outward as a full sunburst of a dozen uneven, tapered, textured brush strokes of different lengths, with small flecks and droplets of paint thrown out between them;
  > - frames 6-10: the strokes detach from the centre and fly outward, thinning into dry-brush streaks, the flecks and droplets scatter further, the centre is only a warm glow;
  > - frames 11-14: only a few thin streaks and small flecks are left, getting smaller and darker terracotta;
  > - frames 15-16: almost nothing, the last one or two faint flecks; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small hand-painted starburst in warm terracotta orange (#d97757) and cream, made of uneven tapered brush strokes with a dry-brush texture.
  >
  > THE ANIMATION: in every frame a cream-white dab stays in the centre, while about ten short brush strokes radiate from it and pulse in and out unevenly, each a different length in every frame, with small flecks of paint hopping between them.

### `styles/skinfx/aqua_burst.jpg` · `aqua_hold.jpg` (아쿠아)

- 치는 순간: 2026-11-11 14:10 UTC · PNG 3,548,974바이트 · sha256 앞 16자리 `46120db6f7e8f094` · 저장한 JPEG 333,348바이트 → `fx/aqua_burst.webp` 1536×1536(117,716바이트), 9프레임 · 28.1fps
- 누르는 동안: 2026-11-11 14:17 UTC · PNG 3,991,646바이트 · sha256 앞 16자리 `4b5112d791fffbb9` · 저장한 JPEG 391,404바이트 → `fx/aqua_hold.webp` 1024×1024(85,392바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a holographic energy burst in aqua cyan (#22e0e6) with hot pink (#ff3f93) accents and a white core, the feel of a mecha's targeting display.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white point snaps open into a bright cyan plasma flash inside a thin hexagonal ring of light;
  > - frames 3-5: the hexagonal ring snaps wide and breaks at its corners while the plasma flash blows outward into jagged cyan energy tongues, and sharp pink shards and small hexagonal fragments shoot out in all directions;
  > - frames 6-10: the energy tongues tear into separate cyan wisps and arcs, the pink shards fly further and stretch into thin streaks, small hexagon fragments tumble and flicker like a hologram breaking up;
  > - frames 11-14: only a few thin cyan arcs, small fragments and pink streaks are left, getting smaller and dimmer;
  > - frames 15-16: almost nothing, the last one or two faint fragments; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small holographic core of energy in aqua cyan (#22e0e6) with hot pink (#ff3f93) accents.
  >
  > THE ANIMATION: in every frame a bright white-cyan plasma core stays in the centre inside a thin hexagonal ring of light, while the hexagonal ring turns step by step and flickers like a hologram, jagged little cyan energy tongues flare off the core, and short pink sparks shoot off at different angles in every frame.

### `styles/skinfx/steel_burst.jpg` · `steel_hold.jpg` (스틸)

- 치는 순간: 2026-11-11 14:10 UTC · PNG 3,608,490바이트 · sha256 앞 16자리 `f18bcdb3a562d504` · 저장한 JPEG 318,372바이트 → `fx/steel_burst.webp` 1536×1536(114,336바이트), 9프레임 · 28.1fps
- 누르는 동안: 2026-11-11 14:17 UTC · PNG 4,241,345바이트 · sha256 앞 16자리 `d76a251f8a179b43` · 저장한 JPEG 416,353바이트 → `fx/steel_hold.webp` 1024×1024(102,042바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a cold, hard burst of white-hot welding light and metal sparks in steel blue: a cross-shaped flare with four long rays, white at the core, icy steel blue (#58aaf0) around it.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white point snaps open into a blinding cross-shaped flare with four long thin rays and a hot round core;
  > - frames 3-5: the cross flare is at its biggest and a shower of white-hot metal sparks sprays out from the centre in all directions as long thin streaks, with a thin, sharp shockwave ring opening around it;
  > - frames 6-10: the flare shrinks to a small hot core, the sparks fly further on slightly curved paths, some split into two, cooling from white to steel blue, the ring thins and breaks into arcs;
  > - frames 11-14: only a few fading sparks and thin broken arcs are left, getting shorter and darker blue;
  > - frames 15-16: almost nothing, the last one or two dying sparks; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a white-hot welding point in icy steel blue (#58aaf0).
  >
  > THE ANIMATION: in every frame a small blinding white core with a cross-shaped flare of four thin rays stays in the centre, while the rays flicker in length, and a steady spray of small white and steel-blue metal sparks flies off in all directions as thin streaks, different in every frame.

### `styles/skinfx/rainbow_burst.jpg` · `rainbow_hold.jpg` (무지개; 2026-11-13에 지움, 기록만 남김)

- 치는 순간: 2026-11-11 14:10 UTC · PNG 3,860,364바이트 · sha256 앞 16자리 `23ae83b01c97da79` · 저장한 JPEG 435,897바이트 → `fx/rainbow_burst.webp` 1536×1536(171,686바이트), 12프레임 · 37.5fps
- 누르는 동안: 2026-11-11 14:18 UTC · PNG 4,192,909바이트 · sha256 앞 16자리 `439158ad2e9f74e7` · 저장한 JPEG 519,722바이트 → `fx/rainbow_hold.webp` 1024×1024(126,708바이트), 15프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a joyful candy-coloured confetti pop: glossy confetti pieces, curled streamers, small stars and round dots in bright red, orange, yellow, green, sky blue, purple and pink, around a white pop flash.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white point snaps open into a bright white pop flash with short rays, a few coloured dots at its edge;
  > - frames 3-5: confetti bursts out of the flash in all directions: glossy rectangular pieces, curled streamers, small five-pointed stars and round dots in every colour, the flash already shrinking;
  > - frames 6-10: the pieces fly further, tumbling and turning so they show different sides, the streamers uncurl, small sparkles twinkle between them, the flash is gone;
  > - frames 11-14: only a few small pieces, one streamer and a star are left, drifting outward and fading;
  > - frames 15-16: almost nothing, the last one or two small pieces; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small fizzing sparkle of candy colours: bright red, orange, yellow, green, sky blue, purple and pink around white.
  >
  > THE ANIMATION: in every frame a bright white sparkling core stays in the centre, while tiny confetti pieces, round dots and small five-pointed stars in every colour pop out around it and tumble, at different places in every frame.

### `styles/skinfx/noir_burst.jpg` · `noir_hold.jpg` (레드라인)

- 치는 순간: 2026-11-11 14:10 UTC · PNG 1,217,944바이트 · sha256 앞 16자리 `f24094be8b63ae15` · 저장한 JPEG 263,896바이트 → `fx/noir_burst.webp` 1536×1536(78,972바이트), 10프레임 · 31.2fps
- 누르는 동안: 2026-11-11 14:17 UTC · PNG 3,122,125바이트 · sha256 앞 16자리 `3e292c07e3eb2fd7` · 저장한 JPEG 303,640바이트 → `fx/noir_hold.webp` 1024×1024(34,408바이트), 13프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a digital glitch burst in pure red (#ff1a2b) and white on black: horizontal slices, blocky pixels and torn scanlines, like a corrupted video signal. Only red, white and black.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a thin white horizontal bar of light snaps open at the centre with a red ghost of itself shifted to one side;
  > - frames 3-5: the bar tears into several horizontal slices that jump left and right out of line, and blocks of red and white pixels of different sizes burst outward from the centre with torn scanline fragments;
  > - frames 6-10: the slices break up further into small rectangles, the pixel blocks fly outward and split into smaller pixels, some flicker as hollow outlines, with thin red scanlines between them;
  > - frames 11-14: only a few small pixels and short red dashes are left, scattered wide, getting smaller and dimmer;
  > - frames 15-16: almost nothing, the last one or two pixels; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small digital glitch in pure red (#ff1a2b) and white on black, like a corrupted video signal. Only red, white and black.
  >
  > THE ANIMATION: in every frame a short bright white horizontal bar stays in the centre, while red and white horizontal slices jitter left and right above and below it, different in every frame, and small red pixel blocks flicker on and off around it.

### `styles/skinfx/magenta_burst.jpg` · `magenta_hold.jpg` (크림슨; 2026-11-13에 지움, 기록만 남김)

- 치는 순간: 2026-11-11 14:10 UTC · PNG 3,650,690바이트 · sha256 앞 16자리 `9e08ead26fdd1ef2` · 저장한 JPEG 350,673바이트 → `fx/magenta_burst.webp` 1536×1536(122,912바이트), 10프레임 · 31.2fps
- 누르는 동안: 2026-11-11 14:15 UTC · PNG 4,124,655바이트 · sha256 앞 16자리 `cbe916c1997a1a58` · 저장한 JPEG 482,974바이트 → `fx/magenta_hold.webp` 1024×1024(110,140바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a razor-sharp burst of blade-like light in crimson (#f0145a) and hot pink with a white core: angular shards and splinters, the feel of a sword slash.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: two thin white slashes of light cross at the centre as a sharp X-shaped flash with a crimson glow;
  > - frames 3-5: the flash blows outward into long, angular, blade-like shards of crimson and pink light pointing away from the centre in all directions, with triangular splinters and a few white sparks between them;
  > - frames 6-10: the shards detach and fly outward, spinning and narrowing, the splinters scatter further, thin curved pink slash arcs sweep around the centre, the core dims to crimson;
  > - frames 11-14: only a few thin shards, small splinters and fading arcs are left, getting smaller and darker crimson;
  > - frames 15-16: almost nothing, the last one or two faint splinters; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small core of blade-like light in crimson (#f0145a) and hot pink with a white centre.
  >
  > THE ANIMATION: in every frame a white-hot core with a crimson glow stays in the centre, while sharp, thin, blade-like spikes of crimson and pink light stab outward from it at different angles and lengths in every frame, with tiny triangular splinters flying off.

### `styles/skinfx/wire_burst.jpg` · `wire_hold.jpg` (화이트 라인)

- 치는 순간: 2026-11-11 14:10 UTC · PNG 3,713,098바이트 · sha256 앞 16자리 `e261fb1c8e61f8b6` · 저장한 JPEG 312,217바이트 → `fx/wire_burst.webp` 1536×1536(126,340바이트), 11프레임 · 34.4fps
- 누르는 동안: 2026-11-11 14:15 UTC · PNG 4,247,035바이트 · sha256 앞 16자리 `c24014ee0f603834` · 저장한 JPEG 398,292바이트 → `fx/wire_hold.webp` 1024×1024(102,042바이트), 16프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: an elegant firework sketched in fine luminous white lines on black, as if drawn with a thin glowing pen: line art only, no filled shapes, pure white with a faint soft glow, monochrome.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny line-drawn star of a few short pen strokes snaps open at the centre;
  > - frames 3-5: it bursts into a ring of many fine radiating pen strokes of uneven length, like a dandelion or a firework, with a hand-drawn circle around it and tiny line-drawn four-point twinkles at some stroke ends;
  > - frames 6-10: the strokes fly outward and curve a little like falling firework trails, the circle widens and breaks into short dashes, a second ring of finer strokes opens inside, small twinkles drift;
  > - frames 11-14: only a few short fading strokes, dashes and tiny twinkles are left, scattered wide;
  > - frames 15-16: almost nothing, the last one or two faint twinkles; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small star sketched in fine luminous white lines on black, as if drawn with a thin glowing pen: line art only, no filled shapes, pure white, monochrome.
  >
  > THE ANIMATION: in every frame a small line-drawn star stays in the centre, while its pen strokes are redrawn at slightly different lengths and angles in every frame so that it shimmers, a thin hand-drawn circle wobbles around it, and tiny line-drawn four-point twinkles appear and vanish near it.

### `styles/skinfx/astral_burst.jpg` · `astral_hold.jpg` (별밤)

- 치는 순간: 2026-11-11 14:11 UTC · PNG 3,876,347바이트 · sha256 앞 16자리 `627fedf8e78dc66c` · 저장한 JPEG 350,014바이트 → `fx/astral_burst.webp` 1536×1536(146,444바이트), 10프레임 · 31.2fps
- 누르는 동안: 2026-11-11 14:16 UTC · PNG 5,902,337바이트 · sha256 앞 16자리 `4fdd3837010a18ec` · 저장한 JPEG 785,023바이트 → `fx/astral_hold.webp` 1024×1024(208,396바이트), 15프레임 · 24fps 반복
- 치는 순간의 효과와 움직임:

  > THE EFFECT: a burst of golden starlight and glittering stardust over a soft moon-blue glow: warm gold (#f2c14e) and white stars, pale blue haze, the feel of a night sky.
  >
  > THE ANIMATION, one continuous motion across the 16 frames:
  > - frames 1-2: a tiny white point snaps open into one bright golden star with long thin rays;
  > - frames 3-5: the star flares and throws out a spray of glittering gold stardust and many small four- and five-pointed stars in all directions, each with a short sparkling trail, inside a faint ring of moon-blue haze;
  > - frames 6-10: the central star shrinks to a soft glow while the small stars fly further, twinkling at different moments, the stardust spreads into drifting swirls of glitter, the blue haze thins;
  > - frames 11-14: only a few small twinkling stars and specks of glitter are left, drifting outward and fading;
  > - frames 15-16: almost nothing, the last one or two faint twinkles; frame 16 is black.

- 누르는 동안의 효과와 움직임:

  > THE EFFECT: a small golden star over a soft moon-blue glow: warm gold (#f2c14e) and white, pale blue haze.
  >
  > THE ANIMATION: in every frame a bright golden star with four long thin rays stays in the centre, while its rays lengthen and shorten so that it twinkles, glittering gold stardust swirls slowly around it, and tiny stars appear and vanish at different places in every frame.

## 스킨의 기어 하단 그림 (`gears/panels`, 2026-11-11)

> 2026-11-13: 이 절의 그림 15장은 게임에서 빠졌습니다. 13장은 맨 끝 절([스킨의 기어 하단 그림을 입체로 다시](#스킨의-기어-하단-그림을-입체로-다시-gearspanels-2026-11-12--13))의 그림으로 바뀌었고(`assets-src/gears/panels/<gear>.jpg`와 `client/public/media/panels/<gear>.webp`를 같은 이름으로 덮어씀), 무지개와 크림슨의 2장은 스킨째 지웠습니다([없앤 스킨](#없앤-스킨-무지개--크림슨-2026-11-13)). 이 그림들을 만들던 `scripts/assets/make_skin_panels.py`도 지웠습니다(고른 그림을 같은 자리에 저장하는 도구라 새 그림을 덮어쓸 수 있어서; git 기록에 있음). `build_skin_panels.py`는 이제 표시창 자리를 재지 않습니다. 아래는 만든 때 그대로의 기록입니다.

스킨 15종의 기어 하단(키 줄 아래)을 코드 그림에서 그림 한 장씩으로 바꾼 것입니다. 사용자의 요청(2026-11-11): 판정선을 올려 기어 하단을 넓힌 뒤 "확장된 기어 하단에 맞게 스킨마다 하단 영역 이미지를 새로 생성해서 적용해줘", "RATE는 … 판정 아래에 작게 표시하도록 위치를 변경해. 그러면 하단 영역이 여유가 있어지니까 컨셉에 맞는 디자인, 꾸밈 요소를 더 넣을 수 있겠지?".

- 만든 곳: Google Cloud Vertex AI 의 Gemini 이미지 생성(`gemini-nano-banana-2.1`, 21:9 · 2K → 3168×1344 PNG) · 사용자의 Google Cloud 프로젝트 · 한 장 약 $0.06(토큰 사용량으로 계산한 추정치)
- 구성: 위에서 똑바로 내려다본 평면 그림. 위쪽 가운데에 넓고 어두운 **표시창**(게임이 SCORE와 SPEED를 그 위에 씀), 양옆에 컨셉 장식을 담은 **날개**, 표시창 바로 아래에 큰 **문장**, 그 아래는 차분한 몸통.
- 보낸 그림(둘 다 이 프로젝트의 것): ① 그 스킨의 받침을 게임 코드가 그린 그대로 평면으로 뽑은 그림(`flat-<gear>.png`: `deckArt.ts`의 `paintDeck`을 stretch 1, 7K+1S, 단위당 3px로) — 색 · 재질 · 무늬만 참고하라고 적음, ② 배치 안내 그림(`make_skin_panels.py`의 `guide()`가 그림: 표시창 자리는 검정, 날개는 빗금, 문장은 흰 원, 나머지는 회색). 다른 게임의 화면, 사용자가 올린 레퍼런스 그림, 로고는 보내지 않았습니다.
- 만드는 도구: `scripts/assets/make_skin_panels.py make <평면 그림 폴더> <gear>` (받은 그대로는 `assets-src/gears/panels/_tries/`에 두고 저장소에는 넣지 않음) → `pick`이 고른 것을 2048×869 JPEG(품질 93, 색 정보 줄이지 않음)으로 저장
- 게임용으로: `scripts/assets/build_skin_panels.py`가 `client/public/media/panels/<gear>.webp`(2048×869, 품질 90)로 만들고, 그림마다 표시창 유리의 자리(가로 · 세로 비율)를 재서 `client/src/render/deckPanels.json`에 적습니다(위쪽 가운데의 어둡고 고른 직사각형을 한 줄씩 넓혀 가며 찾음; 기본 스킨은 유리 위쪽에 반사광이 그려져 손으로 잰 값을 씀).
- 게임에서: 키 줄은 레인을 따라야 하므로 코드로 그리고, 그 아래에 이 그림을 받침 폭 그대로 깝니다(`deckArt.ts`의 `panelPainting`; 카메라가 받침을 납작하게 보는 만큼 트랙 방향으로 늘여 그린 그대로 보이게). SCORE와 SPEED는 표시창 유리 위 두 줄(`deckReadouts`). 기본 카메라는 그림의 위쪽 45%쯤(표시창 · 날개 · 문장의 윗부분)을 보여 주고, 받침이 더 깊이 보이는 카메라(약한 원근 · 평면)는 문장과 몸통까지 보여 줍니다. 그림을 못 읽으면 예전 코드 그림이 나옵니다.
- 고르기: 처음 시험 5장(기본 2 · 아쿠아 2 · 별밤 1: 배치 안내 그림 없이, 그리고 표시창을 40% 깊이로)은 쓰지 않았고, 안내 그림을 넣고 표시창을 35% 깊이로 한 15장을 그대로 썼습니다.
- 비용: 쓴 15장 약 $0.90, 쓰지 않은 5장 약 $0.30
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다. 프롬프트에 게임 · 아티스트 이름은 없습니다.

### 공통 프롬프트

머리말:

  > Image 1 is the current, plain version of one part of our own PC rhythm game's interface: the 'gear deck', the wide control panel that lies under the note lanes, drawn flat from straight above. Use image 1 ONLY for its colour palette, materials and motifs. Ignore its layout: the row of key caps along its top edge and its display windows are NOT part of the new picture.
  >
  > Paint a new, far richer and more detailed version of this panel's surface as production game art, at the finish level of the interface art of a top commercial rhythm game. It is used as a flat texture, so it must be a strictly top-down, orthographic, undistorted picture that fills the whole 21:9 frame edge to edge: no perspective, no horizon, no camera angle, no vignette, no frame or border round the picture, no background behind the panel. Mirror-symmetrical about the vertical centre line.
  >
  > Image 2 is a LAYOUT GUIDE only (never copy its greys or its hatching): its black rectangle is where the DISPLAY BAY goes, its two hatched areas are the WINGS, its white disc is where the EMBLEM goes, and the plain grey area is the LOWER BODY. Your picture has the same proportions as image 2 and follows its layout exactly.

배치(`{bay}`에는 스킨별 표시창의 유리, `{wings}`와 `{body}`에는 스킨별 날개 · 몸통 설명이 들어감)와 꼬리말:

  > COMPOSITION, exactly (the game depends on it):
  > - The TOP EDGE of the picture is where the panel meets the row of keys; players see the upper half of the picture most, so the finest design is there.
  > - DISPLAY BAY (the black rectangle of image 2): in the top centre, one wide display set into the panel, exactly as wide as the black rectangle (from 24 % to 76 % of the picture's width, a little over half of it) and reaching from the top edge down to 35 % of the height, no deeper. {bay} The game writes its score and speed on it, so its inside must stay completely empty and even: no text, no digits, no icons, no ornament, no reflections, no gradients, only a thin frame round it.
  > - WINGS (the hatched areas of image 2): left and right of the display bay, from the top edge down to about 41 % of the height, the two wings (each about a fifth of the width) carry the richest decoration: {wings}
  > - EMBLEM (the white disc of image 2): one large emblem centred directly under the display bay, its top almost touching the bay's lower frame, about 40 % of the picture's height across.
  > - LOWER BODY (the plain grey area of image 2): the rest of the lower part of the picture is the same panel continuing toward the player, with larger and calmer forms: {body} It grows gradually darker and plainer toward the bottom edge, and the bottom tenth is almost plain.
  > - Keep ornaments out of the outer 3 % at the left and right edges (the game's rails cover them).
  > No text, no letters, no numbers, no labels, no logos, no brand marks, no watermark, no people, no characters. Crisp, clean, high-resolution; even, soft lighting from the top edge; no strong cast shadows.

### `gears/panels/standard.jpg` (기본)

- 2026-11-11 14:32 UTC · PNG 4,885,575바이트 · sha256 앞 16자리 `5fb576d86f70bb2c` · 저장한 JPEG 384,842바이트 → `panels/standard.webp` 2048×869(132,000바이트) · 표시창 유리: 가로 26.5~73.5%, 세로 3.9~30.6%
- 스킨별 문구:

  > CONCEPT: a modern professional DJ controller in dark graphite: anodised anthracite metal (#111216 to #2c2e35) with fine machined lines, crisp bevels and chamfers, satin and brushed finishes, thin cyan (#37e2ff) light lines as the only colour, restrained and precise.
  >
  > DISPLAY BAY: It is a pane of dark smoked glass, near black (#0b0c10).
  >
  > WINGS: rows of fine machined grooves, a small perforated speaker grille, two knurled metal knobs with a cyan index line, tiny hex screws, a thin cyan light guide tracing the wing's edge.
  >
  > LOWER BODY: a large jog-wheel ring machined into the metal in the centre under the display bay with a thin cyan light ring, long vent slots to both sides, chamfered panel seams.

### `gears/panels/prism.jpg` (크리스털)

- 2026-11-11 14:32 UTC · PNG 5,368,373바이트 · sha256 앞 16자리 `e824e39800f7d11f` · 저장한 JPEG 541,516바이트 → `panels/prism.webp` 2048×869(246,662바이트) · 표시창 유리: 가로 27.3~72.8%, 세로 4.8~36.6%
- 스킨별 문구:

  > CONCEPT: cut crystal and light: faceted clear crystal planes in ice white, pale lavender and pale blue, deep sapphire-blue gem insets with silver bezels, thin silver edges, fine rainbow dispersion (a hairline spectrum) where facets meet, the feel of jewellery.
  >
  > DISPLAY BAY: It is a plate of deep sapphire-blue glass (#16245a), dark and even.
  >
  > WINGS: fans of long crystal facets radiating from the bay, a brilliant-cut sapphire gem in a silver ring on each wing, small hexagonal crystal studs, hairline light guides with rainbow glints.
  >
  > LOWER BODY: a large brilliant-cut crystal medallion in the centre under the display bay, wide facet planes spreading from it like a chandelier, a few small gem studs.

### `gears/panels/sky.jpg` (하늘)

- 2026-11-11 14:37 UTC · PNG 4,850,436바이트 · sha256 앞 16자리 `0192b6d38edaccb1` · 저장한 JPEG 438,496바이트 → `panels/sky.webp` 2048×869(165,560바이트) · 표시창 유리: 가로 27.6~72.4%, 세로 5.8~37.6%
- 스킨별 문구:

  > CONCEPT: a clear daytime sky as an anime film's background art paints it: deep clear blue at the top easing to pale sky blue, soft, fluffy, billowing white cumulus clouds with real volume, thin white wind trails, white feathers; only blues and white.
  >
  > DISPLAY BAY: It is a pane of clear dark-blue glass (#123a6e) through which a darker, calm sky shows, even in tone.
  >
  > WINGS: a tall, billowing cumulus cloud rising on each wing with soft pale-blue shading, one or two white feathers drifting beside it, tiny sparkles of sunlight, hairline white wind trails crossing in long gentle arcs.
  >
  > LOWER BODY: a continuous sea of soft cumulus seen from the side, its top edge billowing up into the two clouds of the wings, with a few feathers floating over it; below its top edge it falls evenly into soft pale blue.

### `gears/panels/fire.jpg` (파이어스타터)

- 2026-11-11 14:35 UTC · PNG 5,137,740바이트 · sha256 앞 16자리 `ef2005819a4e8413` · 저장한 JPEG 464,240바이트 → `panels/fire.webp` 2048×869(180,702바이트) · 표시창 유리: 가로 32.3~67.7%, 세로 6.2~34.8%
- 스킨별 문구:

  > CONCEPT: a rock tour's stage gear: glossy deep-red lacquer (#c8102e) with black angular inlays, mirror chrome trim, the attitude of a muscle car and a tour poster; red, black, chrome and a little white-hot orange.
  >
  > DISPLAY BAY: It is a pane of black glass (#0b0b0d) in a chrome frame.
  >
  > WINGS: sharp black inlays cut like blades into the red lacquer, chrome edge trim with rivets, a chrome-ringed speaker cone with a black grille on each wing, short hazard stripes, thin orange heat lines.
  >
  > LOWER BODY: a large chrome emblem shaped like a stylised flame in a black shield in the centre under the display bay, long black vents raked back like exhausts to both sides, reflections sliding across the red lacquer.

### `gears/panels/gpt.jpg` (GPT)

- 2026-11-11 14:33 UTC · PNG 4,151,688바이트 · sha256 앞 16자리 `c1c601e3d6f97411` · 저장한 JPEG 278,789바이트 → `panels/gpt.webp` 2048×869(74,152바이트) · 표시창 유리: 가로 26.9~73.1%, 세로 5.3~37.6%
- 스킨별 문구:

  > CONCEPT: a calm, friendly chat assistant's interface made physical: a flat surface in emerald-teal green (#10a37f) with soft rounded white shapes, generous spacing, tiny minimal line icons; flat design with gentle depth, no gloss.
  >
  > DISPLAY BAY: It is a flat plate of dark green-black (#0d1f1a), even and matt.
  >
  > WINGS: soft rounded white pill and bubble shapes of different lengths stacked like lines of a conversation, rows of three small round dots, thin white outline rings, a few tiny abstract line icons (a plus, an arrow, a spark).
  >
  > LOWER BODY: one large ornament of interlaced rounded loops (an abstract knot of six soft petals, drawn in thin white lines) in the centre under the display bay, wide soft rounded bands to both sides in slightly darker and lighter teal.

### `gears/panels/gemini.jpg` (Gemini)

- 2026-11-11 14:33 UTC · PNG 5,576,698바이트 · sha256 앞 16자리 `4d2b66c25a9c2fa1` · 저장한 JPEG 444,088바이트 → `panels/gemini.webp` 2048×869(171,850바이트) · 표시창 유리: 가로 26.9~73.1%, 세로 4.8~37.6%
- 스킨별 문구:

  > CONCEPT: a deep night-dark surface (#131314) lit by a soft aurora of blue (#4285f4), violet (#9b72cb) and pink (#d96570): smooth gradients, four-pointed sparkle stars (four long thin points, concave sides), fine starfield, elegant and airy.
  >
  > DISPLAY BAY: It is a pane of black glass (#0b0b0c), even and matt.
  >
  > WINGS: ribbons of blue-violet-pink gradient light sweeping up each wing, several four-pointed sparkle stars of different sizes, hairline arcs, a fine dust of tiny stars.
  >
  > LOWER BODY: one large four-pointed sparkle star with a soft gradient glow in the centre under the display bay, wide aurora ribbons flowing out to both sides, sparse tiny stars.

### `gears/panels/grok.jpg` (Grok)

- 2026-11-11 14:34 UTC · PNG 4,458,870바이트 · sha256 앞 16자리 `77d9245202c93690` · 저장한 JPEG 333,368바이트 → `panels/grok.webp` 2048×869(139,198바이트) · 표시창 유리: 가로 26.7~73.3%, 세로 3.9~33.4%
- 스킨별 문구:

  > CONCEPT: deep space in pure black and white: a black void with a fine starfield, thin white technical lines, orbits and trajectories, the feel of an observatory's chart; monochrome, no colour at all.
  >
  > DISPLAY BAY: It is pure black (#000000), even and matt.
  >
  > WINGS: thin white orbit ellipses and trajectory lines crossing each wing, small bracket marks, tick scales, a few bright stars with fine cross flares, dotted constellation lines.
  >
  > LOWER BODY: a large black-hole motif in the centre under the display bay: a black disc with a thin bright ring and a fine accretion ring drawn in white lines, long diagonal slash lines and sparse stars to both sides.

### `gears/panels/claude.jpg` (Claude)

- 2026-11-11 14:36 UTC · PNG 5,193,159바이트 · sha256 앞 16자리 `d94487d4f79f8141` · 저장한 JPEG 470,378바이트 → `panels/claude.webp` 2048×869(190,366바이트) · 표시창 유리: 가로 25.1~74.9%, 세로 4.4~34.3%
- 스킨별 문구:

  > CONCEPT: warm cream paper (#f4efe6) with hand-drawn ink in terracotta (#d97757): the feel of a thoughtful notebook: soft paper grain, loose pen doodles, gentle and literary; cream, terracotta and a little warm brown.
  >
  > DISPLAY BAY: It is a sheet of dark warm-brown ink-coloured paper (#2a211c), even and matt.
  >
  > WINGS: hand-drawn terracotta doodles on each wing: a sunburst of uneven pen strokes, a loose spiral scribble with a trailing line, small stars and dashes, a pressed-paper stamp ring, faint ruled lines.
  >
  > LOWER BODY: one large hand-drawn sunburst of a dozen uneven tapered brush strokes in terracotta in the centre under the display bay, long loose pen flourishes to both sides, a few scattered ink dots, the paper's grain showing.

### `gears/panels/aqua.jpg` (아쿠아)

- 2026-11-11 14:38 UTC · PNG 4,360,011바이트 · sha256 앞 16자리 `43044bc084d77319` · 저장한 JPEG 341,620바이트 → `panels/aqua.webp` 2048×869(101,370바이트) · 표시창 유리: 가로 26.5~73.5%, 세로 4.4~33.0%
- 스킨별 문구:

  > CONCEPT: a white mecha's console: glossy white armour panels with 45-degree cut corners over dark teal glass (#06262b), aqua-cyan (#22e0e6) light lines, small hot-pink (#ff3f93) accents; clean science-fiction hardware.
  >
  > DISPLAY BAY: It is a pane of very dark teal glass (#04191d), even and matt.
  >
  > WINGS: white armour plates with cut corners and panel seams on each wing, a row of slanted aqua vent slits, small pink hazard chevrons, hex bolts, thin aqua light guides.
  >
  > LOWER BODY: a large circular reactor emblem in the centre under the display bay: a white ring cut by three arrow-like notches around an aqua glowing core, white shoulder plates to both sides over dark teal glass, a few pink accent lines.

### `gears/panels/steel.jpg` (스틸)

- 2026-11-11 14:39 UTC · PNG 5,839,194바이트 · sha256 앞 16자리 `92c7832f075a1185` · 저장한 JPEG 406,427바이트 → `panels/steel.webp` 2048×869(148,886바이트) · 표시창 유리: 가로 26.3~73.7%, 세로 3.0~31.1%
- 스킨별 문구:

  > CONCEPT: professional studio hardware in dark slate and gunmetal: brushed and bead-blasted metal panels, countersunk screws, embossed plus and cross marks, a cool steel-blue (#58aaf0) light glowing from recessed slots; calm, heavy, industrial.
  >
  > DISPLAY BAY: It is a pane of near-black glass (#0c0f13), even and matt.
  >
  > WINGS: a milled panel on each wing with a recessed slot glowing steel blue, two knurled knobs, a small grid of embossed plus marks, countersunk screws, fine brushed grain.
  >
  > LOWER BODY: a wide recessed plate in the centre under the display bay with a large embossed cross mark and a thin blue light slot, long ventilation louvres to both sides, heavy chamfered edges.

### `gears/panels/rainbow.jpg` (무지개; 2026-11-13에 지움, 기록만 남김)

- 2026-11-11 14:37 UTC · PNG 4,173,597바이트 · sha256 앞 16자리 `fb2b74d8d5bed939` · 저장한 JPEG 296,001바이트 → `panels/rainbow.webp` 2048×869(88,034바이트) · 표시창 유리: 가로 26.3~73.7%, 세로 6.2~33.0%
- 스킨별 문구:

  > CONCEPT: a cheerful toy console of glossy white plastic and cut paper with candy colours: red, orange, yellow, green, sky blue, purple and pink capsules, sprinkles and round buttons, soft pastel shadows; bright, sweet, playful.
  >
  > DISPLAY BAY: It is a plate of deep navy blue (#15155c), even and matt.
  >
  > WINGS: candy-coloured capsule shapes lying at playful angles on each wing, round glossy buttons in different colours, tiny sprinkle dots and small five-pointed stars, soft paper-cut layers.
  >
  > LOWER BODY: a navy-blue half dome with a rainbow capsule inside it in the centre under the display bay, big soft rounded white shapes and long pastel candy stripes to both sides, a scatter of sprinkles.

### `gears/panels/noir.jpg` (레드라인)

- 2026-11-11 14:44 UTC · PNG 3,906,833바이트 · sha256 앞 16자리 `0b28b444f529a849` · 저장한 JPEG 418,895바이트 → `panels/noir.webp` 2048×869(140,840바이트) · 표시창 유리: 가로 30.0~70.0%, 세로 5.8~30.6%
- 스킨별 문구:

  > CONCEPT: flat graphic design in black and pure red (#ff1a2b) with a little white: bold diagonal red bands, halftone dot clusters, glitch blocks and thin technical lines, the feel of a cyberpunk poster. Only black, red and white, completely flat.
  >
  > DISPLAY BAY: It is pure black (#000000), even and matt.
  >
  > WINGS: bold diagonal red bands cutting across each wing, clusters of halftone dots, small glitch blocks of red and white rectangles, rows of chevron arrows, thin white corner brackets.
  >
  > LOWER BODY: wide dark-red diagonal bands and a long thin red curve sweeping through the lower body, one large glitch-block ornament in the centre under the display bay, sparse dot clusters and thin lines.

### `gears/panels/magenta.jpg` (크림슨; 2026-11-13에 지움, 기록만 남김)

- 2026-11-11 14:41 UTC · PNG 5,129,510바이트 · sha256 앞 16자리 `0eb1726a335d1912` · 저장한 JPEG 474,795바이트 → `panels/magenta.webp` 2048×869(182,626바이트) · 표시창 유리: 가로 27.6~72.4%, 세로 5.3~34.3%
- 스킨별 문구:

  > CONCEPT: a black war machine with crimson light: matt black angular armour, razor-thin crimson (#f0145a) and hot-pink light lines, polished silver bars, pointed hexagonal panels; aggressive and sharp.
  >
  > DISPLAY BAY: It is a pane of black glass (#08080a), even and matt.
  >
  > WINGS: pointed hexagonal armour panels outlined in crimson light on each wing, slanted crimson hazard bars, a small crimson lamp, silver bars, sharp chamfers.
  >
  > LOWER BODY: a large pointed emblem like a blade's guard in silver and crimson in the centre under the display bay, long angular armour plates swept back to both sides with thin crimson light seams.

### `gears/panels/wire.jpg` (화이트 라인)

- 2026-11-11 14:40 UTC · PNG 4,391,237바이트 · sha256 앞 16자리 `a123fb2448e74659` · 저장한 JPEG 269,331바이트 → `panels/wire.webp` 2048×869(89,148바이트) · 표시창 유리: 가로 28.8~71.2%, 세로 3.9~33.4%
- 스킨별 문구:

  > CONCEPT: line art in thin white lines on near-black (#0b0b0d): a draughtsman's technical drawing: orbits, circles, tray outlines, dotted grids and tick scales, with one soft white glow; monochrome, elegant, airy.
  >
  > DISPLAY BAY: It is near-black (#070708), even and matt, outlined by one thin white line.
  >
  > WINGS: thin white line drawings on each wing: concentric arcs and an orbit ellipse, a small dotted grid, tick scales, tiny line-drawn four-point stars, short dashed lines.
  >
  > LOWER BODY: a large open ring with two small dots drawn in thin white lines in the centre under the display bay over a soft white glow, long orbit ellipses sweeping out to both sides, a sparse dotted grid.

### `gears/panels/astral.jpg` (별밤)

- 2026-11-11 14:42 UTC · PNG 4,807,497바이트 · sha256 앞 16자리 `115704d729a55adc` · 저장한 JPEG 511,106바이트 → `panels/astral.webp` 2048×869(203,702바이트) · 표시창 유리: 가로 27.3~72.8%, 세로 4.8~38.9%
- 스킨별 문구:

  > CONCEPT: a night sky as an old star atlas: deep navy (#0a1230 to #16245a) with gold (#f2c14e) filigree lines, constellations, moon phases and small sparkling stars; rich, calm and precious.
  >
  > DISPLAY BAY: It is a pane of very dark navy (#070d24), even and matt.
  >
  > WINGS: gold constellation lines with star points on each wing, a small row of moon phases, a gold compass-like ring with tick marks, tiny sparkling stars, fine gold filigree corners.
  >
  > LOWER BODY: a large winged four-pointed star emblem in gold and white in the centre under the display bay, wide thin gold orbit arcs of a star chart sweeping to both sides, a dusting of small stars.

## 없앤 스킨: 무지개 · 크림슨 (2026-11-13)

기어 하단을 입체 그림으로 바꾸려고 스킨마다 시안을 보던 중 사용자가 두 스킨을 없애기로 했습니다(무지개: 시안 둘을 본 뒤 "이 스킨은 아예 없애자"; 크림슨: "이 스킨도 건너뛸게", 이어서 "크림슨도 삭제해"). 게임에서 두 스킨의 기어 · 노트 · 타격 효과 · 글자 · 설정 항목을 뺐고 아래 파일을 지웠습니다. 생성 기록은 위의 두 절([스킨의 타격 효과](#스킨의-타격-효과-프레임-애니메이션-시트-stylesskinfx-2026-11-11), [스킨의 기어 하단 그림](#스킨의-기어-하단-그림-gearspanels-2026-11-11))에 그대로 있고, 거기 적힌 비용 합계도 만든 때 그대로입니다.

| 지운 파일 | 무엇 |
|---|---|
| `assets-src/styles/skinfx/rainbow_burst.jpg` · `rainbow_hold.jpg` · `magenta_burst.jpg` · `magenta_hold.jpg` | 두 스킨의 타격 효과 시트(고른 원본) |
| `client/public/media/fx/rainbow_burst.webp` · `rainbow_hold.webp` · `magenta_burst.webp` · `magenta_hold.webp` | 그 게임용 파일. 매니페스트의 `rainbow/hitBurst` · `rainbow/hitHold` · `magenta/hitBurst` · `magenta/hitHold`도 뺌 |
| `assets-src/gears/panels/rainbow.jpg` · `magenta.jpg` | 두 스킨의 기어 하단 그림(2026-11-11의 평면 그림) |
| `client/public/media/panels/rainbow.webp` · `magenta.webp` | 그 게임용 파일. 매니페스트의 `rainbow/panel` · `magenta/panel`도 뺌 |
| `client/src/assets/fonts/Fredoka-Bold.woff2` · `client/public/licenses/fonts/OFL-Fredoka.txt` | 무지개 스킨만 쓰던 글꼴(Fredoka Bold, OFL 1.1)과 그 라이선스 문서 |
| `docs/screenshots/65-rainbow-7k.png` · `67-magenta-7k.png` | 두 스킨의 스크린샷 |

- 무지개 스킨의 입체 하단 시안으로 2026-11-13에 4회 생성했고 쓰지 않았습니다(아래 절의 생성 횟수에 들어 있음). 크림슨의 입체 시안은 만들지 않았습니다.
- 생성 도구(`make_skin_fx.py`)와 빌드 도구(`build_skin_fx.py`, `build_skin_panels.py`)의 목록에서 두 스킨을 뺐습니다. 두 스킨의 프롬프트는 위 두 절에 남아 있습니다.

## 스킨의 기어 하단 그림을 입체로 다시 (`gears/panels`, 2026-11-12 ~ 13)

스킨 13종의 기어 하단 그림을 모두 다시 만들었습니다. 앞의 절([스킨의 기어 하단 그림](#스킨의-기어-하단-그림-gearspanels-2026-11-11))의 그림을 대신합니다. 그 그림들과 그것을 만들던 `scripts/assets/make_skin_panels.py`는 지웠고, 그 절은 기록으로 남깁니다. 무지개와 크림슨 두 스킨은 하단 시안을 보던 중에 사용자가 스킨째 없애기로 했습니다("이 스킨은 아예 없애자", "크림슨도 삭제해").

달라진 점은 둘입니다. 하나, 그림이 위에서 내려다본 평면도가 아니라 **게임 카메라가 보는 그대로의 입체 렌더**입니다. 둘, 표시창이 없습니다. SCORE · MAX COMBO · SPEED는 게임이 기어 옆에 따로 쓰고, 하단은 통째로 그림입니다.

- 사용자의 요청과 결정: 하단을 스킨마다 하나씩 시안으로 보고 고름("스킨 하나 새로 만들때마다 검수요청해줘"). 스킨 1 · 2 · 5 ~ 11은 사용자가 올린 레퍼런스 그림을 따름("1, 2, 5, 6, 7, 8, 9, 10, 11는 레퍼런스랑 최대한 비슷한 컨셉이면 좋겠어", 그림을 모델에 보내는 것도 허락: "사진 보내도 되도록 허용해"). 파이어스타터와 AI 회사 스킨 넷은 사용자가 직접 디렉션을 줌("ai 부터는 내가 디렉션을 줄테니까 미리 진행하지 말고..", "firestarter도 내가 디렉션을 줄게", "난 이 리듬게임을 상업용으로 배포하지 않고 혼자만 즐길거니까 firestarter 관련 이미지를 가져와서 꾸며도 돼"). 고른 것을 게임에 넣은 것은 사용자가 "진행해줘"라고 한 2026-11-13입니다.
- 만든 곳: Google Cloud Vertex AI 의 Gemini 이미지 생성(`gemini-nano-banana-2.1`, 16:9 · 2K → 2752×1536 PNG; Gemini 하단의 금속 바탕과 Claude 하단의 손글씨 두 장만 21:9) · 사용자의 Google Cloud 프로젝트
- 만드는 순서(도구는 `scripts/assets/deck_panels/`, 그 폴더의 README에 명령이 있음):
  1. 하단의 **평면 배치도**를 코드로 그립니다(스킨마다 `layout_<gear>.py`: 무엇이 어디에 얼마나 크게 놓이는지). 먼저 만든 크리스털과 하늘은 배치도 없이 평평한 자리표시 그림을 넣었습니다.
  2. 그 배치도를 하단 그림으로 넣은 채 게임을 띄워 **화면 한 장**을 찍습니다(판정선을 화면의 43%로 올려 하단이 다 보이게). 같은 자리에서 보정용 점 격자도 한 장 찍습니다.
  3. 점 격자로 평면 그림과 화면 사이의 변환(호모그래피)을 구합니다(221점; 오차를 기록해 둔 다섯 스킨, 곧 스틸 · 레드라인 · 화이트 라인 · 별밤 · 기본은 평균 0.23 ~ 0.24px).
  4. 이미지 모델에 그 화면을 주고 **하단만** 입체 렌더로 다시 그리게 합니다(`prompt_<gear>.py`, 호출은 `generate.py`). 판정선 · 키 줄 · 레일은 그대로 두라고 적습니다. 화면 틀이 어긋난 결과(배율이 0.99 ~ 1.01 밖이거나 틀의 맞음새가 낮은 것)는 버립니다.
  5. 결과를 변환을 거꾸로 써서 평면 그림(2048px 폭)으로 폅니다.
  6. 필요한 스킨은 평면 그림에서 생성 없이 손봅니다(위치 옮기기, 인쇄물 다시 얹기, 가장자리 정리, 밝기 맞추기). 스킨별 기록에 적었습니다.
- 모델에 보낸 그림: ① 이 게임의 화면(위 2의 것), ② 스킨에 따라 기준 그림. 기준 그림은 스킨별 기록에 적었고, 사용자의 레퍼런스 그림 · 회사 로고 · 공식 그림 · 다른 사람의 그림이 있습니다(권리자와 출처: `client/public/licenses/GEAR-PANELS.md`). 기준 그림과 내려받은 원본은 저장소에 넣지 않았습니다.
- 프롬프트: 스킨마다 한 쪽 안팎이라 여기에 옮기지 않고, 그림 옆의 기록 `assets-src/gears/panels/<gear>.json`의 `generations[].prompt`에 전문을 두었습니다(보낸 그림 목록, 만든 시각, sha256, 토큰 사용량, 뒤처리 순서도 같은 파일에 있음).
- 저장: 고른 평면 그림을 JPEG(품질 93, 색 정보 줄이지 않음)으로 `assets-src/gears/panels/<gear>.jpg`에 둡니다. 크기는 2048×876이고, 먼저 만든 크리스털(2048×869)과 하늘(2048×977)만 다릅니다.
- 게임용으로: `scripts/assets/build_skin_panels.py`가 `client/public/media/panels/<gear>.webp`(품질 90)로 만들고 크기를 `client/src/render/deckPanels.json`에 적습니다. 표시창이 없으므로 유리 자리는 재지 않습니다.
- 게임에서: 키 줄 아래부터 화면 맨 아래까지 그림 전체가 보이도록 깝니다(`deckArt.ts`의 `panelSpan` · `panelPainting`). 받침을 덜 보여 주는 카메라에서는 그림이 그만큼 눌립니다. 기어 조명이 비추는 자리(문장, 조명 창, 점 무리 등)는 `deckArt.ts`의 `PANEL_MARKS`에 스킨별로 적었습니다.
- 입체로 그린 물건은 기본 카메라(SDVX) 시점으로 그려진 것이라, 다른 카메라에서는 조금 기울어져 보입니다.
- 생성 횟수: 기록이 남은 생성은 모두 115회(2026-11-12 01:49 ~ 11-13 02:23 UTC, 토큰 합계 약 71만)이고, 그중 게임에 들어간 그림을 이룬 것이 17회입니다. 나머지는 사용자가 고르지 않은 시안, 같은 시안의 다른 장, 화면 틀이 어긋나 버린 것입니다(무지개 4회 포함). 비용은 따로 계산하지 않았습니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다.

### 스킨별 기록

#### `gears/panels/standard.jpg` (기본)

- 그림: 무광 그래파이트 판, 앞쪽 가장자리 가까이에 시안 조명 띠 한 줄
- 사용자가 고른 것: 시안 2("시안 2로 진행할게")
- 게임 화면과 함께 보낸 그림: 없음(게임 화면만)
- 생성: 2026-11-13 02:23 UTC · 16:9 · PNG 4,848,426바이트 · sha256 앞 16자리 `14f184fd3746b779`
- 뒤처리: 편 그림에서 금속의 평균 밝기를 97에서 62로 낮췄습니다(기어의 그래파이트에 맞춤; 시안 조명과 그 번짐은 그대로, 생성 없음).
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `9bb8b5c2fd7af727`) → 저장한 JPEG 209,401바이트 → `panels/standard.webp` 2048×876(40,778바이트)
- 이 스킨은 레퍼런스 그림이 없습니다. 조명 띠가 어느 카메라에서나 화면 맨 아래 가장자리 가까이에 놓인다고 사용자에게 알렸습니다.

#### `gears/panels/prism.jpg` (크리스털)

- 그림: 통째로 깎은 수정 덩어리
- 사용자가 고른 것: 크리스털 시안 중 후보 1
- 게임 화면과 함께 보낸 그림: 사용자의 레퍼런스 1(통째로)
- 생성: 2026-11-12 01:49 UTC · 16:9 · PNG 4,581,804바이트 · sha256 앞 16자리 `9cdedc9455e4ec90`
- 편 그림 2048×869(PNG의 sha256 앞 16자리 `33c09d74b8289971`) → 저장한 JPEG 259,830바이트 → `panels/prism.webp` 2048×869(73,744바이트)
- 입체 하단의 첫 시도여서 배치도 없이 평평한 자리표시 판을 넣은 화면을 보냈습니다. 그림 깊이 869px는 앞 절의 그림과 같은 크기입니다.

#### `gears/panels/sky.jpg` (하늘)

- 그림: 유리 너머의 뭉게구름과 흰 바람 궤적
- 사용자가 고른 것: 하늘 시안 중 후보 3
- 게임 화면과 함께 보낸 그림: 사용자의 레퍼런스 2(통째로)
- 생성: 2026-11-12 02:20 UTC · 16:9 · PNG 4,677,000바이트 · sha256 앞 16자리 `ef010f95ec045e06`
- 편 그림 2048×977(PNG의 sha256 앞 16자리 `fd1d7cb38431f2d1`) → 저장한 JPEG 336,244바이트 → `panels/sky.webp` 2048×977(106,168바이트)
- 하늘 스킨은 키 줄(대시 띠)이 다른 스킨의 3분의 1 깊이라서, 그만큼 하단이 깊습니다(977px).

#### `gears/panels/fire.jpg` (파이어스타터)

- 그림: 분홍 조명의 무대, 네 멤버의 실루엣, 맨 앞의 FIRESTARTER 글자
- 사용자가 고른 것: 시안 6-2(멤버들의 실루엣을 가운데에, 더 큰 FIRESTARTER 글자를 맨 앞에)
- 게임 화면과 함께 보낸 그림: K/DA FIRESTARTER 공식 그림 두 장(콘서트 장면, 표지)
- 생성: 2026-11-12 04:42 UTC · 16:9 · PNG 5,331,217바이트 · sha256 앞 16자리 `b3ba8600f9d3e4f7`
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `63117581d3ceb924`) → 저장한 JPEG 405,483바이트 → `panels/fire.webp` 2048×876(149,298바이트)
- 키캡의 문장은 아래 "키캡의 문장"에 따로 적었습니다.

#### `gears/panels/gpt.jpg` (GPT)

- 그림: 유백색 판, 가운데의 검은 입체 로고, 오른쪽 아래의 RESET 버튼과 링 게이지
- 사용자가 고른 것: 시안 9
- 게임 화면과 함께 보낸 그림: OpenAI 로고 그림 두 장(엠블럼, 아이콘)
- 생성: 2026-11-12 06:14 UTC · 16:9 · PNG 4,374,739바이트 · sha256 앞 16자리 `576f82876e33d235`
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `c9bdd4e4ef4f0991`) → 저장한 JPEG 209,928바이트 → `panels/gpt.webp` 2048×876(60,474바이트)
- 양옆의 스티커를 끈 화면을 보냈습니다. 이 기어의 판정선 · 게이지 · 타격 효과 색은 사용자의 결정으로 청록 그대로입니다("GPT 기어의 판정선 게이지 타격효과는 청록으로 유지해줘").

#### `gears/panels/gemini.jpg` (Gemini)

- 그림: 옅은 파스텔 금속판, 스파크와 왕관을 쓴 입체 워드마크, 오른쪽 아래의 바나나
- 사용자가 고른 것: 시안 6("이대로 확정")
- 게임 화면과 함께 보낸 그림: (첫 생성) 앞선 시안 3-A의 렌더와 바뀐 배치도를 넣은 게임 화면, (둘째 생성) 코드로 그린 바탕 한 장
- 생성 1: 2026-11-12 07:46 UTC · 16:9 · PNG 4,387,733바이트 · sha256 앞 16자리 `d4579ba7d67d157f`
- 생성 2: 2026-11-12 08:10 UTC · 21:9 · PNG 5,778,144바이트 · sha256 앞 16자리 `f389e9be5533ffc6`
- 뒤처리: 생성 두 번을 합쳤습니다. ① 시안 3-A의 렌더를 이미지 모델이 고쳐 그림(구슬 넷을 없애고 색을 옅게, 오른쪽 아래에 바나나): 여기서 스파크 · 왕관 · 워드마크 · 바나나를 떼어 씁니다. ② 바탕(옅은 하늘색 → 라벤더 → 분홍, 비스듬한 빛 띠)을 코드로 그리고, 그것을 이미지 모델이 반광 금속판으로 다시 칠함(21:9, 평면 질감, 위에 아무것도 없음). ③ 떼어 낸 것들을 금속판 위에 얹음: 로고는 시안 4-A의 자리에서 왼쪽으로 300px(워드마크의 가운데가 판의 가운데에서 오른쪽 70px) · 위로 45px, 바나나는 제자리, 각각 금속에 옅게 비침.
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `a9fe124fff668018`) → 저장한 JPEG 283,029바이트 → `panels/gemini.webp` 2048×876(75,494바이트)
- 색은 사용자가 올린 파스텔 Gemini 로고 그림을 따랐고, 사용자의 말에 따라 두 번 더 옅게 했습니다. 시안 3-A의 렌더(①의 입력)도 같은 모델로 만든 것입니다.

#### `gears/panels/grok.jpg` (Grok)

- 그림: 무광 검정 판, 왼쪽 아래의 Grok Bot, 오른쪽 위의 화성색 마크, 은색 X 앞을 나는 로켓과 시바견
- 사용자가 고른 것: 시안 5-A, X 로고 90%("5-A로 하고, X 로고 크기를 90%로 줄여서 확정해줘")
- 게임 화면과 함께 보낸 그림: (첫 생성) 시안 2의 로켓 그림과 SpaceX 로고, (둘째 생성) 시안 4의 완성 그림을 넣은 게임 화면 두 장(로고를 로켓 아래에 평면으로 그린 것 포함)과 X 로고
- 생성 1: 2026-11-12 09:15 UTC · 16:9 · PNG 5,036,111바이트 · sha256 앞 16자리 `6c8a2f3525be0162`
- 생성 2: 2026-11-13 00:06 UTC · 16:9 · PNG 4,570,702바이트 · sha256 앞 16자리 `34fa75a55378aa70`
- 뒤처리: 생성 두 번을 합쳤습니다. ① Grok Bot(사용자가 올린 X 프로필 그림에서 치수를 재어 다시 그림) · 화성색 마크 · 자리표시 로켓을 그린 배치도로 로켓과 탄 것을 생성. ② 편 뒤 로켓 무리를 판의 가운데 깊이로 옮기고(왼쪽 60px, 위 214px) Bot과 마크는 그린 인쇄물을 다시 얹고 맨 금속을 어둡게 함(시안 4). ③ 그 그림 위에 이미지 모델이 로켓 뒤의 은색 X 로고를 더 그림. ④ 편 뒤 인쇄물을 다시 얹음.
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `5f5f981bc1fdb2f3`) → 저장한 JPEG 286,261바이트 → `panels/grok.webp` 2048×876(87,024바이트)

#### `gears/panels/claude.jpg` (Claude)

- 그림: 아이보리 종이, 왼쪽 위 모서리의 해, 검정 손글씨, 자전거를 탄 펠리컨, Clawd
- 사용자가 고른 것: 시안 5("이대로 확정")
- 게임 화면과 함께 보낸 그림: (첫 생성) Claude 스파크와 Clawd 그림, (둘째 생성) 시안 2-B의 렌더와 바뀐 배치도를 넣은 게임 화면, 스파크 그림, (셋째 생성) 없음
- 생성 1: 2026-11-12 06:47 UTC · 16:9 · PNG 4,683,908바이트 · sha256 앞 16자리 `9ea16bd19ab669db`
- 생성 2: 2026-11-12 06:56 UTC · 16:9 · PNG 4,710,279바이트 · sha256 앞 16자리 `f2ed0f4f2546e774`
- 생성 3: 2026-11-12 07:01 UTC · 21:9 · PNG 4,655,825바이트 · sha256 앞 16자리 `0c9d99d0dc9305a3`
- 뒤처리: 생성 세 번과 인쇄 두 번을 합쳤습니다. ① 시안 2-B의 렌더. ② 그것을 이미지 모델이 고쳐 그림(해를 왼쪽 위 모서리에 크게, 4분의 1만 종이 위에; 붓 자국은 그 둘레에만; 검은 속도선은 없앰) → 편 것이 종이. ③ "Claude" 손글씨를 따로 생성(21:9)해 맨 종이에 인쇄. ④ 펠리컨 그림을 그 위에 인쇄(종이의 빛을 글씨를 얹기 전에 읽어 맞춤).
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `f051ec106d484681`) → 저장한 JPEG 439,858바이트 → `panels/claude.webp` 2048×876(155,980바이트)
- 펠리컨은 Simon Willison's Weblog의 2026-11-09 글 "llm-anthropic 0.31"에 실린 SVG에서 배경을 떼고 1.25배 깊게 옮긴 것입니다. 손글씨는 새로 쓴 것이고 공식 손글씨 워드마크가 아닙니다(찾지 못함).

#### `gears/panels/aqua.jpg` (아쿠아)

- 그림: 청록 수면 위의 흰 마크(서로 쫓는 화살 셋)와 물결, 모서리의 흰 장갑판과 분홍 표식
- 사용자가 고른 것: 시안 3("시안 3으로 진행할게"): 유리를 물로 바꾼 것
- 게임 화면과 함께 보낸 그림: 사용자의 레퍼런스 5의 아랫부분(확대)
- 생성: 2026-11-13 00:15 UTC · 16:9 · PNG 4,658,322바이트 · sha256 앞 16자리 `8cbedcc3b9b42def`
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `c361f27fca772a4e`) → 저장한 JPEG 390,501바이트 → `panels/aqua.webp` 2048×876(130,652바이트)
- 레퍼런스의 MAX COMBO · SCORE 숫자 칸은 뺐습니다. 가운데 마크가 레퍼런스(작은 화살촉 셋이 달린 온전한 고리)와 달리 서로 쫓는 화살 셋으로 나왔고, 사용자에게 알린 뒤 그대로 골랐습니다. 이 기어는 분홍이 있어 보정 점을 초록으로 찍었습니다.

#### `gears/panels/steel.jpg` (스틸)

- 그림: 청회색 헤어라인 금속 2단, 파란 조명 창, LED 레벨 미터 둘
- 사용자가 고른 것: 시안 3("시안 3으로 진행할게"): 캡슐 둘을 레벨 미터로, 글자는 비움("글자는 비워두고")
- 게임 화면과 함께 보낸 그림: 사용자의 레퍼런스 6의 아랫부분(확대, 노트와 왼쪽 레일은 뺌)
- 생성: 2026-11-13 00:34 UTC · 16:9 · PNG 4,224,491바이트 · sha256 앞 16자리 `cbcf6b821df6f5c9`
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `4e253d685d39d0ed`) → 저장한 JPEG 252,903바이트 → `panels/steel.webp` 2048×876(61,958바이트)
- 레퍼런스의 글자와 숫자 표시 둘은 뺐습니다. 파란 조명이 레퍼런스보다 밝게 나왔고, 레벨 미터는 움직이지 않는 그림이라고 사용자에게 알렸습니다.

#### `gears/panels/noir.jpg` (레드라인)

- 그림: LED 도트 전광판(128×55 도트)에 켜진 검정 · 빨강 그래픽, 가운데는 비움
- 사용자가 고른 것: 시안 3("시안 3로 진행할게"), 가운데는 비움(사용자가 고른 1안: "가운데 숫자 자리는 1로 진행해줘")
- 게임 화면과 함께 보낸 그림: 사용자의 레퍼런스 8의 아랫부분(확대; 색과 분위기의 기준)
- 생성: 2026-11-13 01:04 UTC · 16:9 · PNG 5,069,687바이트 · sha256 앞 16자리 `053e418d201ed20a`
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `50ccf0340d6f5023`) → 저장한 JPEG 634,772바이트 → `panels/noir.webp` 2048×876(308,464바이트)
- 배치도는 도트 격자 위의 픽셀 그림으로 그렸습니다. 레퍼런스의 SCORE · COMBO 글자와 숫자는 뺐습니다. 기어가 좁게 보이는 카메라에서는 도트가 뭉쳐 선처럼 보이고, 전광판은 움직이지 않는 그림이라고 사용자에게 알렸습니다.

#### `gears/panels/wire.jpg` (화이트 라인)

- 그림: 검은 투영판 위에 뜬 흰 홀로그램 마크와 궤도선, 아래에서 올라오는 투영 빛
- 사용자가 고른 것: 시안 2("시안 2로 진행할게")
- 게임 화면과 함께 보낸 그림: 사용자의 레퍼런스 10의 아랫부분(확대하고 밝게 함)
- 생성: 2026-11-13 01:43 UTC · 16:9 · PNG 5,446,964바이트 · sha256 앞 16자리 `14f476cfdc9072b7`
- 뒤처리: 편 그림의 왼쪽 가장자리(96px보다 왼쪽, 470px보다 위)에 렌더가 칠한 옅은 띠를 옆의 어두운 바탕으로 덮었습니다(생성 없음).
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `7e046cb187a463c8`) → 저장한 JPEG 338,530바이트 → `panels/wire.webp` 2048×876(116,446바이트)
- 레퍼런스의 마크 좌우 작은 글자와 숫자는 뺐습니다. 홀로그램이 판에서 떠 있는 높이는 기본 카메라 시점으로 그려진 것이라 평면 카메라에서는 마크와 비친 상이 어긋나 보일 수 있다고 사용자에게 알렸습니다.

#### `gears/panels/astral.jpg` (별밤)

- 그림: 밤 호수의 수면 위에 뜬 흰 별과 깃털 날개, 달의 위상, 물에 뜬 꽃
- 사용자가 고른 것: 시안 3("3번으로 할게")
- 게임 화면과 함께 보낸 그림: 사용자의 레퍼런스 11의 아랫부분(확대)
- 생성: 2026-11-13 02:03 UTC · 16:9 · PNG 4,651,440바이트 · sha256 앞 16자리 `7314093e8be1568d`
- 편 그림 2048×876(PNG의 sha256 앞 16자리 `0ff53e658e855f75`) → 저장한 JPEG 331,787바이트 → `panels/astral.webp` 2048×876(111,252바이트)
- 레퍼런스의 SCORE · COMBO 글자와 숫자는 뺐습니다. 레퍼런스에서 트랙 바깥에 있던 꽃과 리본은 하단의 양 끝 안쪽에 놓았습니다.

### 키캡의 문장 (`gears/fire/crests.png`, 파이어스타터)

- 파이어스타터 시안을 보던 중 사용자의 제안("KDA 로고를 기어 하단 정 중앙에 3D 로 배치하고, 그 위 키 영역에 각 캐릭터 로고를 순서대로 넣는건 어때?")에서 나온 것으로, 하단이 시안 6-2로 바뀐 뒤에도 키캡의 문장은 남겼습니다.
- 생성한 그림이 아닙니다. League of Legends의 K/DA FIRESTARTER 공식 문장 그림(Riot Games, League of Legends 위키에서 받음)에서 네 멤버의 문장을 잘라, 크롬 키캡 위에서 읽히도록 검은 크롬에 원래의 분홍 테두리로 다시 칠해 256×256 네 칸짜리 띠(1024×256, 투명 바탕)로 만들었습니다(`scripts/assets/deck_panels/crests_fire.py`; 원본 `assets-src/gears/fire/crests.png` 187,118바이트 → `build_gears.py`가 `client/public/media/gears/fire/crests.png`로).
- 게임은 키캡마다 왼쪽부터 차례로 하나씩 그립니다(`deckArt.ts`의 `firePlate`). 권리자와 고지: `client/public/licenses/GEAR-PANELS.md`.

## 기어 양옆 그림에서 배경 빼기 (`stage/fire`, 2026-11-13)

파이어스타터 스킨의 기어 양옆 그림 두 장(`client/public/stage/fire/1-left.webp` · `2-right.webp`)은 Riot Games의 K/DA FIRESTARTER 일러스트 조각입니다(권리자와 출처: `client/public/licenses/STAGE-PICTURES.md`). 사용자가 "KDA 스킨에서 기어 왼쪽 오른쪽에 캐릭터들만 남기고 배경은 삭제해줘. 아리는 귀랑 꼬리는 남아야하고, 카이사도 어깨 위 장치는 살아있어야 해"라고 해서(2026-11-13) 인물만 남긴 판으로 바꿨습니다. 그림의 크기와 인물이 서는 자리는 그 전 판과 같습니다(867×1126, 891×1126).

- 방법: 조각마다 일러스트의 그 자리를 그림의 2배 크기 캔버스에 놓고(일러스트의 위 가장자리 너머는 초록), 이미지 모델에 "두 사람만 그대로 두고 나머지를 순수한 초록으로 바꾸고, 위 가장자리에 잘린 부분만 이어 그리라"고 요청했습니다. 돌려준 그림을 캔버스에 맞추고(인물 안쪽 패치들의 대응으로 구한 아핀 변환, 어긋남 중앙값 약 0.3 px) 초록을 빼서 인물의 모양을 얻은 뒤, **색은 일러스트의 화소를 그대로** 썼습니다. 모델의 화소는 일러스트에 화소가 없는 곳(위 가장자리 너머), 모델이 인물 위에 걸친 불꽃 · 빛 번짐을 뺀 곳(둘의 차이가 큰 곳)에만 들어갑니다. 윤곽선은 인물 안쪽 색을 밖으로 늘여 칠했습니다(원래 배경이나 초록이 섞인 화소라서). 그림의 바깥쪽 가장자리 5 %는 흐리게 사라집니다(넓은 화면 · 평면 카메라에서 그 가장자리가 화면 안에 들어올 때를 위해).
- 모델: Vertex AI `gemini-nano-banana-2.1`, 4:5 · 2K. 보낸 그림은 일러스트의 조각(Riot Games의 그림)과, 보정 요청 때는 그 조각으로 만든 누끼 한 장입니다. 프롬프트에는 게임 · 회사 · 인물의 이름을 넣지 않았습니다(생김새로만 가리킴).
- 생성 9회(2026-11-13, 토큰 합계 약 4.4만), 그 가운데 그림을 이룬 것이 5회입니다. 비용은 따로 계산하지 않았습니다.
  - 왼쪽(아리 · 이블린): 1차는 버림. 요청문이 그림에 없는 뿔과 채찍을 적어 놓아서 모델이 그것을 그렸고, 인물에 비친 불빛(은색 상의의 주황빛 등)도 걷어 냈습니다. 2차(그림에 있는 것만 적고, 덧붙이지 말 것과 조명을 그대로 둘 것을 적음)를 썼습니다. 아리의 귀 끝과 꼬리 윗부분은 모델이 이어 그린 것입니다. 이 그림의 인물 화소 가운데 일러스트 그대로인 것이 약 85 %, 위 가장자리 너머가 약 12.5 %입니다.
  - 왼쪽의 불꽃 둘: 그림을 본 사용자가 "아리 어깨랑 손가락하트 위에 있는 불꽃은 살려줘"라고 해서 되살렸습니다. 2차 요청문에 그 두 불꽃을 남길 것으로 더한 3차를 받아, 그 누끼에서 **불꽃의 자리와 모양만** 썼습니다(캔버스의 두 구역 x 640 ~ 890 · y 1020 ~ 1220, x 1150 ~ 1360 · y 1080 ~ 1330 안에서, 빨강이 초록보다 약하지 않은 화소만: 초록 바탕에서는 불꽃의 빛 번짐이 연두색으로 돌아오기 때문). 불꽃의 색은 일러스트의 화소 그대로이고, 인물 뒤에는 불꽃 자신의 색을 넓게(캔버스 14 px) 흐려 주황 쪽으로 데운 빛을 깔았습니다(일러스트의 불꽃은 밝은 벽 앞에서 옅은 주황 번짐에 싸여 있는데, 벽을 빼면 그 번짐도 사라지기 때문). 불꽃 둘만 검은 바탕에 따로 그리게 한 1회는 모델이 어깨 위 불꽃을 다른 모양으로 크게 새로 그려서 버렸습니다.
  - 오른쪽(카이사 · 아칼리): 1차를 썼습니다(위쪽 장치의 윗부분은 모델이 이어 그린 것). 가려진 곳까지 그리라고 한 2차는 그림 전체를 새로 구성해서(인물과 장치가 옮겨지고 다시 그려짐), 덧붙이지 말 것 · 조명 유지를 적은 3차는 머리색이 달라지고 위쪽 장치의 수정 빛이 사라져서 버렸습니다. 1차는 이블린의 어깨가 있던 자리(카이사의 허리 아래)를 초록으로 비워 두어, 만든 누끼를 다시 주고 그 자리만 이어 그리게 한 보정 1회를 캔버스의 그 구역(x 200 ~ 840, y 1480 ~ 2252)에만 썼습니다. 요청문은 손을 그리지 말라고 했으나 모델이 소매 끝을 손으로 맺었고, 그대로 두었습니다. 이 그림의 인물 화소 가운데 일러스트 그대로인 것이 약 66 %, 보정으로 그린 것(허리 아래와 장치의 덮개)이 약 25 %입니다.
  - 오른쪽의 장치 윗부분: 1차는 일러스트의 위 가장자리에 잘린 위쪽 장치를 길게 솟은 발톱 모양으로 이어 그렸고, 그림을 본 사용자가 "카이사 어깨 장치가 너무 크게 그려졌는데, 카이사 어깨 장치 다른 이미지들 확인해보고 다시 그려줘"라고 했습니다. 장치가 온전히 보이는 그림을 찾아보니(같은 일러스트에서 머리 옆에 있는 다른 장치, League of Legends 위키의 인게임 모델 그림 `Kai'Sa KDAFIRESTARTER (Base).png`, 콘셉트 아트 `KDA FIRESTARTER Group Concept 01 ~ 05`) 장치는 수정을 감싼 낮고 둥근 껍데기에 작은 볏이 하나 있는 모양이었습니다(일러스트의 다른 판 `Loading` · `Centered`도 같은 자리에서 잘려 있음). 그래서 발톱을 일러스트의 위 가장자리에서 잘라 내고, 장치 둘레만 자른 누끼(800×800)에 앞의 두 그림을 참고로 붙여 "낮고 둥근 덮개로 닫으라"고 한 1회를 받아 캔버스의 그 구역(x 300 ~ 820, y 530 ~ 680)에만 썼습니다. 참고로 보낸 것은 Riot Games의 그림 둘(일러스트의 조각, 인게임 모델 그림)입니다.
- 그림별 기록(생성마다 프롬프트 전문, 보낸 그림과 결과의 sha256, 토큰, 합성에 쓴 값): `assets-src/stage/fire/1-left.json` · `2-right.json`. 스크립트: `scripts/assets/stage_cutout/`(순서는 그 폴더의 README). 옮긴 스크립트로 같은 입력에서 게임의 두 그림이 그대로 다시 나오는 것을 확인했습니다(PNG의 sha256 일치; 불꽃을 더한 왼쪽 그림은 옮긴 스크립트로 만들었습니다). 일러스트 원본과 모델이 돌려준 그림은 저장소에 없습니다.
- 사용자의 곡 · 채보는 생성에 쓰지 않았습니다.

## 없앤 기어: 오락실 기체 · 빈티지 리시버 · 나전칠기 · 커스텀 키보드 · 레이싱 휠 · 우주선 계기판 · 달 (2026-11-13)

사용자가 "예전 기존 스킨 중 피아노만 빼고 나머지는 삭제해줘."라고 해서(2026-11-13), 스킨의 기어가 아닌 예전 기어 여덟 가운데 피아노만 남기고 일곱을 게임에서 뺐습니다(받침 · 키캡 · 레일 · 판정선 · 조명 · HUD의 글자와 차림 · 설정 항목까지). 예전 노트(크롬 베벨 등)와 예전 타격 효과(플레어 · 메카 섬광 등)는 사용자의 결정으로 그대로 둡니다("예전 노트랑 타격효과는 유지해줘."). 생성 기록은 위의 [기어](#기어-gears-2026-11) 절(그 안의 "기어 셋 더" · "받침 그림")과 [달 기어](#달-기어-gearsrawglass-2026-11-06-2026-11-13에-지움-기록만-남김) 절에 그대로 있고(지운 그림의 제목에 "2026-11-13에 지움, 기록만 남김"이라고 적음), 거기 적힌 장수와 비용 합계도 만든 때 그대로입니다.

| 지운 파일 | 무엇 |
|---|---|
| `assets-src/gears/cabinet/` (`button.jpg` · `coin.jpg` · `joystick.jpg` · `deck.jpg` · `deck.json`) | 오락실 기체의 부위 그림 셋, 받침 그림과 그 맞춤 값 |
| `assets-src/gears/receiver/` (`knob.jpg` · `switch.jpg` · `deck.jpg` · `deck.json`) | 빈티지 리시버의 부위 그림 둘, 받침 그림과 그 맞춤 값 |
| `assets-src/gears/najeon/` (`band.jpg` · `lid.jpg` · `lock.jpg` · `deck.jpg` · `deck.json`) | 나전칠기의 부위 그림 셋, 받침 그림과 그 맞춤 값 |
| `assets-src/gears/keyboard/` (`knob.jpg` · `keycap.jpg` · `brass.jpg` · `deck.jpg` · `deck.json`) | 커스텀 키보드의 부위 그림 셋, 받침 그림과 그 맞춤 값 |
| `assets-src/gears/racing/` (`rotary.jpg` · `button.jpg` · `deck.jpg` · `deck.json`) | 레이싱 휠의 부위 그림 둘, 받침 그림과 그 맞춤 값 |
| `assets-src/gears/orbital/` (`selector.jpg` · `toggle.jpg` · `button.jpg` · `foil.jpg` · `deck.jpg` · `deck.json`) | 우주선 계기판의 부위 그림 넷, 받침 그림과 그 맞춤 값 |
| `assets-src/gears/rawglass/` (`deck.jpg` · `deck.json`) | 달 기어의 받침 그림과 그 맞춤 값 |
| `client/public/media/gears/cabinet/` · `receiver/` · `najeon/` · `keyboard/` · `racing/` · `orbital/` · `rawglass/` | 그 게임용 파일 32개: 부위 그림(PNG), 받침 그림(`deck.webp`), 빛 마스크(`glow.png`: 커스텀 키보드 · 나전칠기), `build_gears.py`가 잡음으로 만들던 재질(`abs` · `silver` · `walnut` · `alu` · `carbon` · `paint`). 매니페스트의 해당 항목도 뺌 |
| `client/src/assets/fonts/DSEG7Classic-Bold.woff2` · `Silkscreen-Regular.woff2` · `SairaStencilOne-Regular.woff2` · `NotoSerifKR-Bold-subset.woff2`, `client/public/licenses/fonts/OFL-DSEG.txt` · `OFL-Silkscreen.txt` · `OFL-SairaStencilOne.txt` · `OFL-NotoSerifKR.txt` | 지운 기어만 쓰던 글꼴 넷(7세그 숫자, 픽셀 글꼴, 스텐실, 나전칠기 게이지의 "흥" 한 글자)과 그 라이선스 문서. 남은 기어도 쓰는 글꼴(Exo 2 · Chakra Petch · Orbitron · Cinzel · Barlow Condensed)은 그대로 |
| `docs/screenshots/34-gear-cabinet.png` · `35-gear-receiver.png` · `36-gear-najeon.png` · `37-gear-keyboard.png` · `38-gear-racing.png` · `39-gear-orbital.png` · `41-gear-rawglass.png` | 일곱 기어의 스크린샷 |

- `scripts/assets/build_gears.py`에서 일곱 기어의 빌드 단계와 그 기어들만 쓰던 코드(잡음으로 만들던 재질: 엠보싱 ABS · 비드 블라스트 알루미늄 · 트윌 카본 · 회색 도장 · 월넛, 부위 그림을 모양대로 자르는 단계, 나전칠기 · 커스텀 키보드의 빛 마스크)를 뺐습니다. 고친 스크립트를 저장소 밖 사본에서 돌려 남은 기어의 파일 9개와 매니페스트가 저장소의 것과 똑같이 나오는 것을 확인했습니다.
- 게임 쪽에서는 그 기어들만 쓰던 것도 함께 뺐습니다: 받침의 OLED 화면과 빛 마스크, 바늘 미터(빈티지 리시버의 게이지), 콤보만 다른 글꼴로 쓰는 기능.
- 저장된 설정이 지운 기어를 가리키면 기본 기어로 열립니다.

## 곡 종료 연출의 글자 · 도장 · 효과 (`end/`, 2026-11-13)

사용자: "관련 텍스트, 이펙트 등은 퀄리티 좋게 gemini api로 만들어줘"(곡 시작 · 종료 연출을 두고, 2026-11-13). 곡이 끝날 때 화면 가운데에 나오는 등급 글자와 클리어 도장, 도장이 찍힐 때의 충격파, HARD 계열 도장이 맞물릴 때의 불꽃, 중간 FAIL 때 레인에 가는 금입니다. 그 전에는 모두 코드와 CSS로 그렸고, 그 그림은 이 그림을 읽지 못할 때의 대체로 남아 있습니다.

- 모델: Vertex AI `gemini-nano-banana-2.1`(사용자의 `GOOGLE_API_KEY`), 2K, 글자는 21:9 · 도장과 시트는 1:1 · 금은 9:16
- 만드는 도구: `scripts/assets/make_end_fx.py make <이름>`(받은 그대로는 `assets-src/end/_tries/`에 두고 저장소에는 넣지 않음) → `pick <이름> <번호>`가 고른 것을 긴 변 2048 JPEG(품질 92, 색 정보 줄이지 않음)으로 `assets-src/end/`에 저장하고 `picks.json`에 그 생성의 프롬프트 전문 · 사용량 · 받은 파일의 SHA-256을 적음
- 게임 그림: `scripts/assets/build_end_fx.py` → `client/public/end/*.webp`와 `index.json`. 하는 일은 검정을 검정으로 만든 뒤 밝기만큼 불투명하게 바꾸는 것뿐입니다(검정 위에서는 원본과 똑같이 보임). 글자와 도장은 그려진 부분만 잘라 크기를 맞추고, 시트는 프레임을 한 줄로 늘어놓으며 효과가 사라진 뒤의 프레임은 버립니다(충격파 12프레임, 불꽃 10프레임). 충격파는 흰색으로 두고 게임이 등급 색을 입힙니다.
- 프롬프트에 그림은 하나도 보내지 않았습니다. 다른 게임의 화면, 사용자의 레퍼런스, 로고 모두 없이 말로만 묘사했습니다(프롬프트는 `make_end_fx.py`에 그대로 있습니다).
- 생성 18회, 합계 55,255토큰. 처음 12회(11종 + 다시 뽑기 1회, 38,441토큰). 쓰지 않은 것: `seal-assist` 1번(도장 바깥이 흰색으로 나와, "그림의 네 모서리까지 검정"이라는 문장을 넣고 다시 뽑음). 같은 날 더한 6회(3종을 2번씩, 16,814토큰): 등급 없는 플레이의 글자 둘(AUTO PLAY · PRACTICE END)과 시작에 레인이 켜질 때의 빛. 쓰지 않은 것: `words-autoplay` 1번(2번이 베벨이 또렷함), `words-practice` 2번(1번이 다른 글자와 입체감이 맞음), `lane-light` 1번(양옆이 어두워 레인 폭을 다 채우지 못함). 넷 다 철자는 맞았습니다.

| 파일 | 무엇 | 고른 것 / 시도 | 요청 → 저장 | 토큰 | 받은 파일 SHA-256 |
|---|---|---|---|---|---|
| `end/words-perfect.jpg` | PERFECT PLAY 글자 | 1 / 1 | 21:9 · 2K → 2048×869 | 2933 | `55b889b1d811377f…` |
| `end/words-maxcombo.jpg` | MAX COMBO 글자 | 1 / 1 | 21:9 · 2K → 2048×869 | 2926 | `5938d4b5e3bae2b1…` |
| `end/words-failed.jpg` | FAILED 글자 | 1 / 1 | 21:9 · 2K → 2048×869 | 2995 | `704f0aa843b6aa0b…` |
| `end/seal-clear.jpg` | CLEAR 도장 | 1 / 1 | 1:1 · 2K → 2048×2048 | 2784 | `3b93e2dca95941d1…` |
| `end/seal-easy.jpg` | EASY CLEAR 도장 | 1 / 1 | 1:1 · 2K → 2048×2048 | 3346 | `aac54ce8b47f9f53…` |
| `end/seal-assist.jpg` | ASSIST CLEAR 도장 | 2 / 2 | 1:1 · 2K → 2048×2048 | 2973 | `54503f29017b4520…` |
| `end/seal-hard.jpg` | HARD CLEAR 도장 | 1 / 1 | 1:1 · 2K → 2048×2048 | 3087 | `790e63d61ecfd1b9…` |
| `end/seal-exhard.jpg` | EX-HARD CLEAR 도장 | 1 / 1 | 1:1 · 2K → 2048×2048 | 3342 | `0abaf2e0276ed970…` |
| `end/ring.jpg` | 도장이 찍힐 때의 충격파(16프레임 시트) | 1 / 1 | 1:1 · 2K → 2048×2048 | 4576 | `9128937b57ca8eed…` |
| `end/sparks.jpg` | HARD 계열의 반쪽이 맞물릴 때의 불꽃(16프레임 시트) | 1 / 1 | 1:1 · 2K → 2048×2048 | 3434 | `140d52c870cac54a…` |
| `end/cracks.jpg` | 중간 FAIL 때 레인의 금 | 1 / 1 | 9:16 · 2K → 1143×2048 | 2737 | `fd668f81b05fb097…` |
| `end/words-autoplay.jpg` | AUTO PLAY 글자(자동 플레이의 끝) | 2 / 2 | 21:9 · 2K → 2048×869 | 2302 | `37c06ac6f721e649…` |
| `end/words-practice.jpg` | PRACTICE END 글자(연습의 끝) | 1 / 2 | 21:9 · 2K → 2048×869 | 3223 | `e518a64ecebae505…` |
| `end/lane-light.jpg` | 시작에 레인이 켜질 때 판정선에서 솟는 빛(흰 빛, 게임이 레인 색을 입힘) | 2 / 2 | 9:16 · 2K → 1143×2048 | 2999 | `77b0a49a909e08ae…` |

도장의 가운데 모양은 게임이 등급마다 쓰는 표식 그대로입니다(CLEAR 원, EASY 오른쪽 반이 찬 원, ASSIST 오른쪽 위 1/4이 찬 원, HARD 사각형, EX-HARD 테 안의 작은 사각형). 도장에는 글자가 없습니다(사용자: "READY, CLEAR 텍스트는 없애주고").
