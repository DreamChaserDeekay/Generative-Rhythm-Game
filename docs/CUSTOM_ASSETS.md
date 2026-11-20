# 내 에셋: 플레이어가 만든 노트 · 기어 받침 · 타격 효과

사용자 요청(2026-11-20, 조정 세션 경유): "기어, 노트를 게임 플레이어가 직접 LLM을 통해 에셋을 만들어서 특정 폴더에 넣으면 해당 에셋으로 플레이 할 수 있도록 수정 가능해?" 바꿀 부위는 **노트(단노트 · 롱노트), 기어 받침, 타격 효과**이고, 그림은 **게임 밖의 이미지 모델**(ChatGPT, Gemini 등)로 만듭니다. 게임은 부위별 프롬프트를 복사해 주고, 폴더에 넣은 그림의 배경을 지우고 자르고 크기를 맞춥니다. API 키는 쓰지 않고, 아무것도 밖으로 보내지 않습니다.

예전에 있던 JSON 사용자 스킨(트랙 색)과는 다른 것입니다. 트랙은 지금처럼 한 가지이고, 이 팩은 고른 부위의 그림만 바꿉니다.

## 쓰는 법

1. 설정 → **기어** 또는 **노트** 탭의 아래 **내 에셋** 묶음에서 **에셋 폴더 열기**(데스크톱 앱. 브라우저에서는 "다시 읽기"의 도움말에 폴더 경로가 나옵니다).
2. 그 폴더에 팩마다 폴더를 하나 만듭니다. 예: `skins\네온 팩\`.
3. **프롬프트 복사**(한국어 · English)로 받은 프롬프트의 대괄호 안을 원하는 분위기로 바꿔 이미지 모델에 넣습니다. 기어 받침은 **받침 밑그림 저장**으로 받은 그림을 함께 첨부합니다.
4. 받은 그림을 아래 이름으로 팩 폴더에 저장하고 **에셋 다시 읽기**.
5. **노트** 줄(노트 탭), **기어** · **타격 효과** 줄(기어 탭)의 선택지 끝에 생긴 **내 에셋: <팩 이름>**을 고릅니다. 미리보기에 바로 나옵니다. 문제가 있는 그림은 묶음 아래 목록에 이유와 함께 나옵니다.

## 팩 폴더

위치: 게임 데이터 폴더의 `skins` (데스크톱 앱: `%APPDATA%\<앱>\library\skins`, 환경 변수 `GRG_DATA_DIR`이 있으면 그 아래 `skins`). 처음 읽을 때 폴더와 `읽어보기.txt`를 만듭니다.

| 파일 (png · webp · jpg/jpeg) | 무엇 | 배경 |
|---|---|---|
| `note` | 단노트 하나, 가로 막대(약 4:1) | 순수한 마젠타 `#FF00FF` 또는 투명 |
| `long` (선택) | 롱노트 몸통, 세로 레일(약 1:4). 없으면 단노트로 만듦 | 마젠타 또는 투명 |
| `panel` | 기어 받침, 밑그림과 같은 비율(약 21:9) | 그림 전체 |
| `hit` | 타격 효과의 가장 밝은 한 장면(1:1) | 순수한 검정 `#000000` |
| `hit_sheet` (고급, 선택) | 4×4 플립북 시트를 직접(16칸, 왼쪽 위부터 줄마다). 있으면 `hit`보다 먼저 씀 | 검정 |
| `hold` (선택) | 롱노트를 누르는 동안의 빛. 없으면 `hit`(또는 시트의 가장 밝은 칸)으로 만듦 | 검정 |
| `pack.json` (선택) | `{"name": "보일 이름", "author": "만든 이", "hitColor": "own" \| "lane"}` | |

- 팩에 일부 부위만 있어도 됩니다. 없는 부위는 그 팩을 고를 수 없고, 고른 다른 부위가 그대로 쓰입니다.
- 팩을 고른 부위는 그 그림이 대신하는 기본 부위로 그립니다: 노트는 '기본' 노트(두께 · 롱노트 끝 처리는 기본값), 받침은 '기본' 기어(건반 줄 · 테두리 · 조명은 기본 기어의 것), 타격 효과는 '플래시' 자리. 그림을 읽지 못하거나 팩이 없어지면 그 기본 부위의 그림이 나오고(오류 없이 플레이), 설정 줄에는 "내 에셋: <팩> (읽지 못함)"으로 남아 팩을 다시 넣으면 그대로 돌아옵니다. 다른 부위를 고르면 팩이 풀리고 고른 부위가 나옵니다.
- `hitColor`: 효과 그림의 색을 그대로 쓸지(`own`), 레인 색을 입힐지(`lane`). 없으면 그림에 색이 있으면 그대로, 흰빛이면 레인 색(기본 플래시처럼).

## 부위별 처리 (서버: `server/rhythm_server/skins.py`)

모든 그림은 먼저 크기를 검사합니다(파일 20 MB, 4천만 픽셀까지, PNG · WebP · JPEG만, 움직이는 그림은 첫 장). 결과는 게임의 원래 그림 크기를 넘지 않고, `<데이터>\cache\skins\<팩>\`에 둡니다. 원본 파일의 크기 · 수정 시각 · 처리 버전(`VERSION`)이 같으면 다시 만들지 않고, 바뀌었으면 "다시 읽기" 때 바로 다시 만듭니다. 팩 폴더를 지우면 다음에 읽을 때 그 팩의 캐시도 지웁니다.

**배경 지우기(노트 · 롱노트):** 그림이 이미 투명하면 그대로. 아니면 가장자리 띠가 한 가지 색이어야 하고(85% 이상이 같은 색) 그 색을 색 거리로 지웁니다. 반쯤 덮인 가장자리 픽셀에서는 배경색을 빼서(C = aF + (1 − a)K) 분홍 테두리가 남지 않게 합니다. 배경이 마젠타가 아니면 그 색을 지우고 알려 줍니다.

**단노트:** 내용물에 맞춰 자르고(가로가 세로의 2.5 ~ 10배여야 함, 폭 256 이상) 1024 × 224로 맞춘 뒤 1024 × 256 그림의 16 px 아래에 둡니다(`styleArt.ts`의 `ART_NOTE`와 같은 자리: 양끝 212 px와 가운데 332 ~ 692는 그린 대로, 그 사이만 레인 폭에 맞춰 늘림). 게임의 노트 그림은 **틴트 그림**(빨강 = 레인 색의 양, 초록 = 흰빛 쪽으로 올린 양)이어서 밝기만 씁니다: 중간 회색을 0.72(레인 색 그대로)로 맞추고 가장 밝은 곳은 흰빛 쪽으로(`build_long_notes.py`와 같은 값). 색이 있는 그림은 경고합니다.

**롱노트:** `long`이 있으면 배경을 지우고(누운 그림은 세움) 128 px 폭으로 줄여, 가운데 한 폭을 위아래 16 px씩 겹쳐 섞어 이음매 없이 반복되게 합니다(`seamless_rows`). 끝은 레일의 위 끝 44 px. 누르는 중은 더 밝게(흰빛 쪽으로) 같은 그림을 씁니다. 너무 짧으면(폭의 2배 미만) 단노트로 만들고 이유를 보여 줍니다. `long`이 없으면 단노트의 가운데 가로 단면을 몸통으로, 단노트의 위쪽 절반을 끝으로 씁니다. 512 × 256(`longs/solid`의 배치).

**기어 받침:** 건반 줄은 코드가 레인을 따라 그리고, 받침 그림은 그 **아래**에 기어 폭으로 깔립니다. 그래서 받침은 **키 모드와 상관없이 그림 한 장, 밑그림 한 장**입니다(4K든 8K든 같은 그림이 같은 폭으로 깔림). 비율이 밑그림(2048 : 876)과 1.6배 넘게 다르면 거절하고, 그 안이면 가운데를 잘라 맞춥니다(ChatGPT의 3:2 그림은 위아래를 잘라 씀). 2048 × 876 WebP. 기본 기어의 조명 띠(받침 아래쪽의 빛줄)는 내 받침 위에서는 켜지지 않습니다.

밑그림(`/api/skins/templates/panel.png`, 2048 × 876): 위 가장자리의 하늘색 줄 = 건반 줄과 맞닿는 곳, 주황 점선(위에서 45%) 위 = 기본 카메라(SDVX)에 보이는 부분, 희미한 가운데 세로선 = 트랙의 가운데. 글자는 넣지 않았습니다(모델이 따라 쓰지 않게). 노트 밑그림(`note.png`)은 노트의 비율과 늘어나는 구간(어두운 회색)을 보여 줍니다.

**타격 효과:** 이미지 모델은 16칸 애니메이션을 고르게 그리지 못하므로(`GEAR_NOTE_FX.md`: 16칸 중 8 ~ 12칸에만 그림) 그림 한 장에서 게임이 움직임을 만듭니다. 검정 배경을 확인하고(가장자리가 어두워야 함), 빛이 있는 곳을 정사각형으로 잘라 가장자리를 둥글게 흐린 뒤:

- 치는 순간(`hitBurst`): **10프레임, 33.3 fps(0.27초 뒤에 끝), 첫 프레임이 가장 밝고 온전함(peak 0)**. 그 뒤 크기 1.0 → 1.35배로 퍼지고 8° 돌며, 밝기는 (1 − t)^1.4로 줄고 어두운 부분부터 사라집니다. 4×4 시트 1536 px(칸 384). 매니페스트처럼 `tone`(첫 프레임 빛의 색, `flipbook_light.py`와 같은 계산), `plain`, `span` 1, `anchorY` 0.5.
- 누르는 동안(`hitHold`): 16프레임 24 fps 반복, 크기 ±7% · 회전 ±6° · 밝기를 사인으로 흔들어 끝 프레임이 첫 프레임으로 이어짐. 4×4 시트 1024 px, `cored`.
- 고급 `hit_sheet`: 칸마다 빛을 재서 마지막으로 빛이 있는 칸까지 쓰고, 가장 밝은 칸의 95% 이상인 첫 칸부터 틀며(`NEAR_PEAK`), 그 칸부터 0.27초에 끝나도록 fps를 정합니다(12 ~ 60).

## 게임 쪽 (`client/src/render/customPacks.ts`)

- 설정에는 부위별로 팩 이름이 남습니다(`parts.custom: { note?, deck?, hit? }`, `sanitizeParts`가 경로 · 숨김 이름을 거름). `withParts`는 팩을 고른 부위를 기본 부위(`CUSTOM_BASE`)로 그리게 합니다.
- `loadSkinArt`가 `/api/skins`를 읽어, 팩의 그림을 그 그림이 대신하는 매니페스트 id(`notes/flat` · `longs/solid` · `standard/panel` · `basic/hitBurst` · `basic/hitHold`) 자리에 같은 크기로 끼웁니다(`packOverrides`). 렌더러는 기본 부위를 그리듯 그리므로 **텍스처 수 · 크기 · draw call · 셰이더가 늘지 않고**, 그림은 다른 부위처럼 플레이 시작 때 그려 올립니다(곡 도중에 만들지 않음). 플레이 캔버스의 `data-custom`이 팩에서 그린 부위를 적습니다.
- 겉모습만 바뀝니다. 판정 · 기록 · 리플레이에는 아무 영향이 없습니다.

## 보안

- 팩 폴더 바로 아래의 정해진 이름의 파일만 읽습니다. 심볼릭 링크 · 하위 폴더 · 숨김 폴더는 읽지 않고, 팩 이름은 폴더 목록에 있는 것만 받습니다. 결과 파일은 정해진 다섯 이름만 내줍니다(경로를 받지 않음).
- 그림은 Pillow로 크기를 먼저 확인한 뒤 디코딩합니다(압축 폭탄 방지). SVG · HTML · 스크립트는 읽지 않고, 팩의 어떤 내용도 실행되지 않습니다. `pack.json`은 64 KB까지 이름 · 만든이 · `hitColor`만 읽습니다.
- 로컬 전용: 서버는 그림을 밖으로 보내지 않습니다.

## 프롬프트

앱의 "프롬프트 복사"와 같은 글입니다(`client/src/ui/assetPrompts.ts`; `assetPrompts.test.ts`가 이 문서와 같은지 확인). 저장소의 그림을 만들 때 잘 된 점을 가져왔습니다: 바로 위에서 본 평면, 게임이 정한 자리(노트의 판정 가장자리, 받침의 위 가장자리), 레인 색을 입히는 부위는 회색만, 지울 수 있는 단색 배경, 반복되는 몸통, 첫 순간이 가장 밝은 효과, 글자 없음.

### 단노트 (note.png)

한국어:

```text
리듬 게임의 단노트 하나를 바로 위에서 내려다본 그림: 가로가 세로의 약 4배인 넓고 납작한 가로 막대 하나, 가운데에 그림 폭의 약 90%로.
스타일: [원하는 분위기: 예) 반짝이는 크롬, 네온 사이버펑크, 수채화 종이].
색: 회색과 흰색만, 색조는 전혀 없이(게임이 레인마다 색을 입힙니다. 밝은 회색은 레인 색으로, 흰색에 가까운 곳은 빛나게 보입니다).
아래쪽 긴 가장자리는 완전히 곧고 선명하며 막대에서 가장 밝게. 장식은 양 끝과 가운데에만 두고, 그 사이 구간은 고르고 밋밋하게(게임이 레인 폭에 맞춰 늘립니다).
완전한 정사영, 원근 · 기울기 없음, 둘레에 그림자 없음.
배경: 가장자리까지 순수한 마젠타(#FF00FF) 한 색, 다른 것은 아무것도 없이. 노트 안에는 마젠타를 쓰지 말 것.
글자, 숫자, 로고, 워터마크 없음.
```

English:

```text
A single TAP NOTE for a rhythm game, seen straight from above: one wide, flat horizontal bar about 4 times wider than tall, centred, filling about 90% of the image width.
Style: [YOUR STYLE: e.g. polished chrome, neon cyberpunk, watercolour paper].
Colour: neutral greys and white ONLY, no hue at all (the game colours the note with each lane's colour; light grey shows the lane colour, near white glows).
Its lower long edge is perfectly straight, crisp and the brightest edge of the bar. Detail may sit at its two ends and in its middle; the stretches between them stay plain and even (the game stretches them to the lane's width).
Strictly orthographic, no perspective, no tilt, no shadow cast around it.
Background: one solid flat pure magenta (#FF00FF) from edge to edge, with nothing else on it and no magenta inside the note.
No text, letters, numbers, logos or watermarks.
```

### 롱노트 (long.png)

한국어:

```text
리듬 게임의 롱노트를 바로 위에서 내려다본 그림: 세로가 가로의 약 4배인 긴 세로 레일 하나, 가운데에 그림 위 끝 가까이부터 아래 끝 가까이까지.
스타일: [원하는 분위기: 예) 반짝이는 크롬, 네온 사이버펑크, 수채화 종이] (단노트와 같은 재질).
색: 회색과 흰색만, 색조는 전혀 없이(게임이 레인 색을 입힙니다).
레일은 길이 전체에서 똑같이 보여 어느 구간을 이어 붙여도 이음매가 없게: 위아래로 밝기가 변하지 않고, 한 번만 있는 장식 없이, 무늬는 같은 간격으로. 위 끝은 레일 자신의 끝으로 닫힘.
완전한 정사영, 원근 없음, 그림자 없음.
배경: 가장자리까지 순수한 마젠타(#FF00FF) 한 색, 다른 것 없이. 레일 안에는 마젠타를 쓰지 말 것.
글자, 숫자, 로고, 워터마크 없음.
```

English:

```text
The LONG NOTE of a rhythm game, seen straight from above: one long upright rail, about 4 times taller than wide, centred, standing from near the top to near the bottom of the image.
Style: [YOUR STYLE: e.g. polished chrome, neon cyberpunk, watercolour paper] (the same material as the tap note).
Colour: neutral greys and white ONLY, no hue at all (the game colours it with the lane's colour).
Along its whole length the rail looks exactly the same, so any stretch of it repeats seamlessly: no gradient from top to bottom, no one-off details; any mark down it evenly spaced. Its top end is closed by the rail's own end.
Strictly orthographic, no perspective, no shadow.
Background: one solid flat pure magenta (#FF00FF) from edge to edge, nothing else on it, no magenta in the rail.
No text, letters, numbers, logos or watermarks.
```

### 기어 받침 (panel.png)

한국어:

```text
첨부한 그림은 리듬 게임 기어의 아랫부분(건반 줄 아래의 받침)의 배치 밑그림입니다. 이 그림과 똑같은 구도와 비율(약 21:9, 2.34 : 1)로 새 그림을 그려 주세요: 같은 가로세로, 잘라 내거나 둘레에 덧붙이지 말 것.
밑그림에서: 위 가장자리의 하늘색 줄은 받침이 건반 줄과 맞닿는 곳(먼 쪽 가장자리)입니다. 주황 점선 위쪽이 대부분의 플레이어에게 보이는 부분이니 디자인의 중요한 것은 그곳, 희미한 가운데 선 둘레에 둡니다. 그 아래는 일부 카메라에서만 보입니다.
받침: [원하는 분위기: 예) 반짝이는 크롬, 네온 사이버펑크, 수채화 종이]. 게임 기기의 완성된 표면을 바로 위에서 내려다본 평면(원근 없음)으로, 그림 전체를 가장자리까지 채움.
가운데는 차분하게(노트와 효과가 바로 위에 그려집니다). 전체적으로 어두운 편이어서 노트가 잘 보이게.
밑그림의 안내선은 모두 지울 것: 하늘색 줄, 점선, 가운데 선, 회색 바탕이 남지 않게.
글자, 숫자, 로고, 워터마크 없음.
```

English:

```text
The attached image is a LAYOUT TEMPLATE for the lower panel of a rhythm game's gear (the slab under the row of keys). Draw a new picture with EXACTLY its framing and proportions (about 21:9, 2.34 : 1): the same width and height, nothing cropped, nothing added around it.
In the template: the cyan line along the top edge is where the panel meets the row of keys (the far edge); the area above the dashed amber line is what most players see, so the important parts of the design go there, around the faint middle line; the area below it is seen only with some cameras.
The panel: [YOUR STYLE: e.g. polished chrome, neon cyberpunk, watercolour paper]. A finished surface of a game console seen straight from above, flat (no perspective), filling the whole picture edge to edge.
Keep its middle calm (notes and effects are drawn just above it). Mostly darker tones, so the notes stand out.
Remove every guide of the template: no cyan line, no dashed line, no middle line, no grey placeholder left.
No text, letters, numbers, logos or watermarks.
```

### 타격 효과 (hit.png)

한국어:

```text
리듬 게임 타격 효과의 한 장면: 노트를 친 순간의 빛이 터지는 모습을 바로 위에서 본 것, 가장 밝고 가장 꽉 찬 순간.
스타일: [원하는 분위기: 예) 반짝이는 크롬, 네온 사이버펑크, 수채화 종이].
그림 한가운데에서 사방으로 고르게 퍼짐. 가운데는 하얗게 빛나는 심, 그 둘레는 효과의 색으로. 그림 가장자리 15%는 사방 모두 빈 검정.
배경: 빛 바깥은 모두 순수한 검정(#000000)(게임은 그림을 빛으로 화면에 더하므로 검정은 보이지 않습니다). 연기, 어두운 모양, 바닥, 그림자 없음.
정사각형(1:1). 글자, 숫자, 로고, 워터마크 없음.
```

English:

```text
One single frame of a rhythm game's HIT EFFECT: the instant a note is struck, a burst of light seen straight from above, at its very brightest and fullest.
Style: [YOUR STYLE: e.g. polished chrome, neon cyberpunk, watercolour paper].
Centred, radiating out evenly in every direction from the middle of the image; a white-hot core and light in the effect's colours around it. The outer 15% of the image on every side stays empty black.
Background: pure black (#000000) everywhere outside the light (the game adds the picture to the screen as light, so black is invisible). No smoke, no dark shapes, no ground, no shadow.
Square image (1:1). No text, letters, numbers, logos or watermarks.
```

## 시험 팩

`python scripts/assets/make_test_pack.py <skins 폴더>`가 코드로 그린 팩 셋을 만듭니다(유료 이미지 생성 없음): `시험 팩`(마젠타 배경의 노트 · 롱노트, 3:2 받침, 검정 배경의 주황 효과), `broken`(배경이 두 색인 노트, 정사각 받침, 회색 배경의 효과: 각각 이유가 나옴), `sheet-only`(셋째 칸이 가장 밝은 4×4 시트, 이미 투명한 노트).

## 남은 것

- 노트를 그림 색 그대로 그리기(지금은 밝기만 쓰고 레인 색으로 칠함): 노트 셰이더를 바꿔야 해서 하지 않았습니다.
- 받침을 기본 기어 말고 다른 기어의 건반 · 테두리 위에 깔기, 노트 두께 · 롱노트 끝 모양을 `pack.json`으로 고르기.
- 게임 안에서 이미지 모델을 불러 만들기(API 키): 이번 범위가 아님.
