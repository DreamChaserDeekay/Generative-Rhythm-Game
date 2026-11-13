# 기어 아랫부분 그림(패널)을 만든 스크립트

게임의 13개 기어(prism · sky · fire · gpt · claude · gemini · grok · aqua · steel · noir · wire · astral · standard)의 아랫부분 그림(패널, 폭 2048 px)을 만들 때 실제로 돌린 스크립트입니다. 작업 폴더에 흩어져 있던 것을 이름을 정리하고 **경로만 고쳐** 옮겼습니다. 프롬프트 · 숫자 · 색 · 알고리즘은 그대로이고, 주석도 경로와 스크립트 이름만 고쳤습니다.

- 이 폴더에는 스크립트와 이 문서만 있습니다. 그림 · SVG · 참고 그림 · 내려받은 파일 · 생성 결과는 넣지 않았습니다.
- 그림마다의 기록(모델, 프롬프트 전문, 준 그림, sha256, 만든 순서)은 `assets-src/gears/panels/<gear>.json`에 있습니다. 그 기록의 `steps`와 `pictures`는 작업 폴더 때의 이름(`p6/layout-steel.py`, `p4/tools.py`, `p4/gen25.py`, `p4/steel-a3/tmpl-crop.png` …)으로 적혀 있습니다. 아래 [옛 이름 → 여기 파일](#옛-이름--여기-파일) 표가 그 이름과 이 폴더의 파일을 잇습니다.
- 채택하지 않은 시안의 스크립트는 옮기지 않았습니다. 다만 한 파일에 여러 시안의 프롬프트 · 그림이 함께 들어 있는 것은 파일째 그대로 두었습니다(예: `prompt_aqua.py`의 `aqua-a1`).

## 만드는 순서

1. **배치 그림**: 패널에 무엇이 어디에 얼마나 크게 놓이는지를 납작하게 그립니다. `layout_<gear>.py` → `<폴더>/layout.png`
2. **틀 사진**: 그 그림을 기어의 패널로 넣고 게임을 띄워 화면을 찍습니다(판정선을 화면 43 %로 올려 패널 전체가 보이게). 보정 점(격자)을 넣은 화면도 한 장 찍습니다. `template.sh` · `template_plain.sh`(안에서 `tools.py dots` · `place`, `frame_shots.cjs`)
3. **보정과 자르기**: `tools.py calib` — 점들에서 패널 그림 ↔ 화면의 호모그래피(`calib.json`). `tools.py crop` — 틀 사진을 자름(`tmpl-crop.png`).
4. **생성**: 이미지 모델이 틀 사진에서 패널만 다시 그립니다. `prompt_<gear>.py`가 프롬프트를 담고 있고, 호출은 `generate.py`의 `generate`입니다. → `try-<n>.png`, `try-<n>.json`
5. **되펴기**: `tools.py flat` — 결과를 납작한 패널 그림으로 되폅니다. → `flat-<n>.png`
6. **합성**(몇 기어만, 생성 없음): `dim_edge.py`, `tone_standard.py`, `reground_gemini.py`, `shift_parts.py`, `reprint_grok.py`, `letter_on_paper.py`, `print_on_paper.py`

찍어 보기: `shoot.sh` · `shoot_each.sh`(네 카메라), `sheet_cameras.py` · `sheet_panels.py`(한 장으로 모음).

## 준비

| 무엇 | 내용 |
|---|---|
| `PANEL_WORK` | 작업 폴더. 모든 스크립트가 이 환경 변수에서 읽고, 없으면 그 말을 하고 멈춥니다(`paths.py`, `paths.sh`). 저장소 위치는 스크립트 자신의 위치에서 셉니다(세 단계 위). |
| 작업 폴더의 모양 | `$PANEL_WORK/<gear>-<시안>/`(시안 폴더: `layout.png`, `tmpl-0.png`, `tmpl-crop.png`, `calib.json`, `try-<n>.png`, `flat-<n>.png`), `$PANEL_WORK/refs/`(이미지 모델에 준 참고 그림), `$PANEL_WORK/inputs/`(그 밖의 모든 것) |
| 옛 경로와의 대응 | 옛 작업 폴더의 `p4/<x>` → `$PANEL_WORK/<x>`. 그 밖의 `<path>` → `$PANEL_WORK/inputs/<path>`(예: `claude/png/…` → `inputs/claude/png/…`, `ref-user/ref-01.png` → `inputs/ref-user/ref-01.png`). 서버 로그(`inputs/api.log`, `inputs/vite.log`)와 처음 두 기어의 작업 파일(`inputs/p2`, `inputs/p3`)도 이 규칙대로 `inputs/` 아래입니다. |
| Python | Python 3, Pillow, numpy. `tools.py calib` · `flat`, `prism_calib.py`, `prism_flat.py`, `reground_gemini.py`, `shift_parts.py`, `reprint_grok.py`, `dim_edge.py`는 scipy도 필요합니다. 만들 때는 scipy가 없는 스크립트를 `python3 -I`로, scipy가 필요한 것을 `PYTHONPATH=<scipy가 있는 곳> python3`로 돌렸습니다. |
| node | `frame_shots.cjs`, `render_svg.cjs`는 `playwright` 모듈을 씁니다. 만들 때는 기기에 전역으로 깔린 것이 잡혔습니다. 안 잡히면 `NODE_PATH=<저장소>/client/node_modules`를 줍니다. |
| 서버 | `with_servers.sh <명령…>`이 API 서버(포트 8798, `server/.venv`, 자료 `$PANEL_WORK/inputs/data2`)와 dev 서버(포트 5198, vite)를 띄우고, 명령이 끝나면 자기가 띄운 것만 내립니다. `with_api.sh`는 API 서버만 띄웁니다(dev 서버가 이미 떠 있을 때). |
| API 키 | `GOOGLE_API_KEY`(환경 변수). 모델 id는 `generate.py`의 `MODEL`입니다. |
| 글꼴 | 모음 그림의 캡션: `/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc`. GPT 배치 그림의 글자: 저장소의 `client/src/assets/fonts/PretendardVariable.woff2`. |
| 경로 | 셸 스크립트가 경로를 따옴표 없이 쓰므로 `PANEL_WORK`와 저장소 경로에 공백이 없어야 합니다. |

**저장소 파일을 바꾸는 스크립트**: 틀 사진 · 촬영 스크립트는 게임이 읽는 파일을 그 자리에서 바꿉니다. `tools.py dots` · `place`가 `client/public/media/panels/<gear>.webp`, `client/src/render/deckPanels.json`, `client/public/media/manifest.json`을, `set_line.sh`가 `config/camera.json`의 판정선 높이를(0.43으로 올렸다가 0.72로 되돌림), `stickers.sh`가 `client/public/stage/index.json`을(끄고 다시 켬), `placeholder_prism.py` · `prism_dots.py` · `prism_shoot.sh`가 `panels/prism.webp`를 바꿉니다. 만들 때는 찍고 나서 `git checkout -- client config`로 되돌렸습니다.

## 한 기어를 처음부터 끝까지 (aqua)

저장소 맨 위에서 돌립니다. `refs/aqua-console.png`(사용자의 참고 그림 아랫부분)와 `inputs/data2`가 작업 폴더에 있어야 합니다.

```sh
export PANEL_WORK=/path/to/work            # 공백 없는 경로
D=scripts/assets/deck_panels

python3 -I $D/layout_aqua.py                                        # 1. aqua-a1/, aqua-a2/ 의 layout.png, parts.json
$D/with_servers.sh $D/template_plain.sh aqua 876 aqua-a1 aqua-a2    # 2. 보정 점 화면(aqua-a1/calib-0.png)과 두 폴더의 틀 사진(tmpl-0.png)
DOTS=green $D/with_servers.sh $D/calib_only.sh aqua 876 aqua-a1     #    이 기어에는 분홍이 있어 점을 초록으로 다시 찍음
DOTS=green PANEL_H=876 python3 $D/tools.py calib aqua-a1            # 3. aqua-a1/calib.json  (scipy)
cp $PANEL_WORK/aqua-a1/calib.json $PANEL_WORK/aqua-a2/
python3 $D/tools.py crop aqua-a2                                    #    aqua-a2/tmpl-crop.png
GOOGLE_API_KEY=… python3 -I $D/prompt_aqua.py aqua-a2 1             # 4. aqua-a2/try-1.png, try-1.json
python3 $D/tools.py flat aqua-a2 1                                  # 5. aqua-a2/flat-1.png  = 채택한 그림
$D/with_servers.sh $D/shoot_each.sh aqua-a2:1                       #    네 카메라로 찍어 보기
python3 -I $D/sheet_cameras.py aqua-a2 1 "아쿠아 시안 3 (수면)"
git checkout -- client config                                       #    게임 파일을 되돌림
```

## 옛 이름 → 여기 파일

기록(`assets-src/gears/panels/<gear>.json`)의 `steps`에 나오는 이름은 모두 이 표에 있습니다. 표에 없는 `p4/…` · `p6/…` 이름이 주석에 남아 있으면(`p6/layout-gpt3.py`, `p6/window-standard.py`, `shots2`) 옮기지 않은, 채택하지 않은 시안이나 그 전 판의 스크립트입니다.

인자가 바뀐 것: 옛 스크립트가 받던 폴더 인자(`<p4 dir>`, `<scratchpad>`, `<claude dir>`, `<ai dir>`, `<gemini dir>`, `<downloads dir 2>`)는 없어지고 `PANEL_WORK`에서 정해집니다. 나머지 인자는 그대로입니다(파일을 직접 받는 인자는 지금도 경로를 그대로 받습니다).

### 공용

| 옛 이름 | 여기 파일 | 하는 일 |
|---|---|---|
| (새 파일) | `paths.py`, `paths.sh` | `PANEL_WORK`(작업 폴더)와 저장소 위치. 옛 스크립트의 절대 경로 상수를 대신함 |
| `p2/gen2d.py` | `generate.py` | 이미지 모델 호출(`generate`, `MODEL`). 처음의 납작한 크리스털 시험(`prism2d-1`)도 이 파일 |
| `p4/tools.py` | `tools.py` | `dots` · `place` · `calib` · `crop` · `flat` |
| `shots6.cjs` | `frame_shots.cjs` | 게임을 띄워 화면을 찍음(Playwright) |
| `ai/tools/render-svg.cjs` | `render_svg.cjs` | 내려받은 SVG(로고, 펠리컨)를 PNG로 |
| `p6/synth.py` | `synth.py` | 게임을 띄우지 않고, 먼저 찍은 틀 사진의 패널 자리에 새 배치 그림을 넣어 틀 사진을 만듦 |
| `p6/tmpl.sh` | `template.sh` | 틀 사진과 보정 점 화면(구석 스티커가 있는 기어: 스티커를 끄고) |
| `p6/tmpl-plain.sh` | `template_plain.sh` | 같은 일, 구석 스티커가 없는 기어 |
| `p6/calib-only.sh` | `calib_only.sh` | 보정 점 화면만 |
| `p4/tmpl.sh` | `template_fire.sh` | fire의 틀 사진(추적으로 찾음) |
| `p4/frame.sh` | `frame.sh` | 판정선을 올려 한 장(sky의 보정 · 틀 사진; 추적으로 찾음) |
| `p4/with-servers.sh` | `with_servers.sh` | API 서버와 dev 서버를 띄우고 명령을 돌림 |
| `p4/with-api.sh` | `with_api.sh` | API 서버만(fire; 추적으로 찾음) |
| `p4/setline.sh` | `set_line.sh` | `config/camera.json`의 판정선 높이를 바꾸고 dev 서버가 그 값을 낼 때까지 기다림 |
| `p4/served.sh` | `served_line.sh` | dev 서버가 내는 판정선 높이 |
| `p4/stickers.sh` | `stickers.sh` | 기어의 구석 스티커를 끄고 켬 |
| `p4/shoot.sh` | `shoot.sh` | 되편 그림을 패널로 넣고 네 카메라로 찍음 |
| `p6/shoot2.sh` | `shoot_each.sh` | 여러 `<폴더>:<번호>`를 차례로 `shoot.sh` |
| `p4/sheet.py` | `sheet_cameras.py` | 네 카메라를 한 장으로 |
| `p6/panels.py` | `sheet_panels.py` | 여러 시안의 되편 그림을 한 장으로 |

### 기어별

| 기어 | 옛 이름 | 여기 파일 | 하는 일 |
|---|---|---|---|
| prism | (명령줄에서 실행) | `placeholder_prism.py` | 자리 표시 판(납작한 시험 그림 `prism2d-1`의 31~80 % 행) |
| prism | `p3/make_calib.py` | `prism_dots.py` | 보정 점 그림(2048 × 869) |
| prism | `p3/calib2.py` | `prism_calib.py` | 호모그래피(`tools.py calib`의 앞선 판) |
| prism | `p3/gen3dref.py` | `prompt_prism.py` | 프롬프트 |
| prism | `p3/unproject3.py` | `prism_flat.py` | 되펴기(`tools.py flat`의 앞선 판) |
| prism | `p3/shoot.sh`, `p3/sheet.py` | `prism_shoot.sh`, `prism_sheet.py` | 네 카메라, 한 장으로 |
| sky | (명령줄에서 실행) | `placeholder_sky.py` | 자리 표시 그림(흐린 하늘) |
| sky | `p4/gen.py`(그때의 판) | `prompt_sky.py` | 프롬프트 |
| fire | `p4/refs.py` | `refs_fire.py` | 이미지 모델에 준 참고 그림(`refs/concert.jpg`, `refs/cover.jpg` …)을 공식 그림에서 |
| fire | `p5/layout8.py` | `layout_fire.py` | 배치 그림(`fire-c1` · `c2` · `c3`; 채택은 `fire-c2`) |
| fire | `p4/gen3.py` | `prompt_fire_draft5.py` | 앞 시안의 프롬프트. `prompt_fire.py`가 여기서 `HEAD` · `KEEP` · `RENDER` · `CLOTH`를 가져옴 |
| fire | `p4/gen4.py` | `prompt_fire.py` | 프롬프트(`fire-c2`) |
| fire | `p5/crests.py` | `crests_fire.py` | 키캡의 네 문장 띠(`fire-crests.png`)를 공식 문장 그림에서 |
| gpt | `p6/gptparts.py` | `gpt_parts.py` | 배치 그림의 부품(판, 엠블럼, 버튼, 링 게이지) |
| gpt | `p6/layout-gpt4.py` | `layout_gpt.py` | 배치 그림(`gpt-f1`) |
| gpt | `p4/gen7.py` | `prompt_gpt_draft8.py` | 앞 시안의 프롬프트. `prompt_gpt.py`가 여기서 `HEAD` · `EMBLEM` · `DOME` · `END`를 가져옴 |
| gpt | `p4/gen8.py` | `prompt_gpt.py` | 프롬프트(`gpt-f1`) |
| claude | `claude/tools/cutout.py` | `cutout_pelican.py` | 펠리컨 SVG에서 배경을 뺌 |
| claude | `p6/layout-claude2.py` | `layout_claude_base.py` | 배치 그림(`claude-b1`), 마스코트 참고 그림(`refs/claude-clawd.jpg`) |
| claude | `p4/gen10.py` | `prompt_claude_base.py` | 프롬프트(`claude-b1`: 기록의 `generation-base`) |
| claude | `p6/layout-claude3.py` | `layout_claude.py` | 고친 배치 그림(`claude-c1`) |
| claude | `p4/gen11.py` | `prompt_claude.py` | 프롬프트(`claude-c1`: 앞 렌더를 고침) |
| claude | `p4/gen12.py` | `prompt_claude_lettering.py` | 손글씨 프롬프트 |
| claude | `p6/letter.py` | `letter_on_paper.py` | 손글씨를 종이의 빈 곳에만 찍음 |
| claude | `p6/print.py` | `print_on_paper.py` | 펠리컨을 종이에 찍음 |
| gemini | `p6/layout-gemini4.py` | `layout_gemini_base.py` | 배치 그림(`gemini-d1`), 로고 참고 그림(`refs/gemini-logo.png`) |
| gemini | `p4/gen15.py` | `prompt_gemini_base.py` | 프롬프트(`gemini-d1`) |
| gemini | `p6/layout-gemini5.py` | `layout_gemini_things.py` | 고친 배치 그림(`gemini-e1`) |
| gemini | `p4/gen16.py` | `prompt_gemini_things.py` | 프롬프트(`gemini-e1`: 기록의 `things-generation`) |
| gemini | `p6/reground.py` | `reground_gemini.py` | 물건은 그대로 두고 바탕을 새로(그린 바탕, 또는 `ground=`로 준 그림) |
| gemini | `p4/gen18.py` | `prompt_gemini_metal.py` | 바탕(금속) 프롬프트(기록의 `metal-generation`) |
| grok | `p6/layout-grok2.py` | `layout_grok.py` | 배치 그림(`grok-e1`)과 두 인쇄의 층(`bot.png`, `icon.png`) |
| grok | `p4/gen21.py` | `prompt_grok_rocket.py` | 프롬프트(`grok-e1`: 기록의 `rocket-generation`) |
| grok | `p6/shiftparts.py` | `shift_parts.py` | 되편 그림의 물건을 옮김 |
| grok | `p6/reprint-grok.py` | `reprint_grok.py` | 그린 인쇄를 다시 올리고 바탕을 어둡게 |
| grok | `p6/layout-grok-x.py` | `layout_grok_x.py` | X 로고 자리(`grok-j1`, `grok-j1-g`) |
| grok | `p4/gen22.py` | `prompt_grok_x.py` | 프롬프트(`grok-j1`: 기록의 `generation`) |
| aqua | `p6/layout-aqua.py`, `p4/gen24.py` | `layout_aqua.py`, `prompt_aqua.py` | 배치 그림, 프롬프트(`aqua-a2`) |
| steel | `p6/layout-steel.py`, `p4/gen25.py` | `layout_steel.py`, `prompt_steel.py` | 배치 그림, 프롬프트(`steel-a3`) |
| noir | `p6/layout-noir.py`, `p4/gen27.py` | `layout_noir.py`, `prompt_noir.py` | 배치 그림, 프롬프트(`noir-a3`) |
| wire | `p6/layout-wire.py`, `p4/gen28.py` | `layout_wire.py`, `prompt_wire.py` | 배치 그림, 프롬프트(`wire-a2`) |
| wire | `p6/dim-edge.py` | `dim_edge.py` | 왼쪽 가장자리의 밝은 띠를 지움 |
| astral | `p6/layout-astral.py`, `p4/gen29.py` | `layout_astral.py`, `prompt_astral.py` | 배치 그림, 프롬프트(`astral-a3`) |
| standard | `p6/layout-standard.py`, `p4/gen30.py` | `layout_standard.py`, `prompt_standard.py` | 배치 그림, 프롬프트(`standard-a2`) |
| standard | `p6/tone-standard.py` | `tone_standard.py` | 금속의 밝기를 기어의 그래파이트에 맞춤 |

## 기어별 순서

`$D`는 이 폴더, 폴더 이름은 `$PANEL_WORK` 아래입니다. 틀 사진 · 촬영은 `with_servers.sh` 안에서 돌립니다. 기록에 `steps`가 있는 아홉 기어는 그 기록대로이고, prism · sky · fire · gpt는 기록의 프롬프트 · 폴더 이름과 그때의 명령 기록을 따라 찾았습니다.

- **prism**(`inputs/p2`, `inputs/p3`; `tools.py`가 생기기 전): `generate.py prism2d-1` → `prism_dots.py <저장소>/client/public/media/panels/prism.webp` 뒤 화면 한 장(`inputs/p3/calib-0.png`) → `prism_calib.py …/calib-0.png …/calib.json` → `placeholder_prism.py` 뒤 화면 한 장(`tmpl-0.png`)과 자르기(`tmpl-crop.png`, 상자 160, 180, 1760, 1080) → `prompt_prism.py c3d-1` → `prism_flat.py …/c3d-1.png …/flat-1.png`(채택) → `prism_shoot.sh 1`, `prism_sheet.py 1 "…"`. 화면 두 장과 자르기는 그때 명령줄에서 직접 했습니다(같은 일을 하는 스크립트가 `frame.sh`, `tools.py crop`).
- **sky**(폴더 `sky`, 높이 977): `tools.py dots sky 977` · `frame.sh sky …/sky/calib` · `tools.py calib sky` → `placeholder_sky.py` · `tools.py place sky …/sky/placeholder.png` · `frame.sh sky …/sky/tmpl` · `tools.py crop sky` → `prompt_sky.py sky 3` → `tools.py flat sky 3`(채택) → `shoot.sh sky 3`, `sheet_cameras.py sky 3 "…"`
- **fire**(채택 `fire-c2`): `refs_fire.py` → `layout_fire.py`(폴더 `fire-c1` · `fire-c2` · `fire-c3`을 먼저 만들어 둠) → 보정은 `fire-a5` 때의 것(초록 점: `DOTS=green calib_only.sh fire 876 fire-a5`와 같은 일을 그때는 명령줄에서 함, `DOTS=green tools.py calib fire-a5`)을 복사 → `with_api.sh template_fire.sh fire-c1 fire-c2 fire-c3` · `tools.py crop fire-c2` → `prompt_fire.py fire-c2 2` → `tools.py flat fire-c2 2`(채택) → `shoot.sh fire-c2 2`. 키캡 문장: `crests_fire.py …/inputs/kda/dl2/KDA_FIRESTARTER_Crest_icon.png …/inputs/p5/crests-dark.png`
- **gpt**(채택 `gpt-f1`): `render_svg.cjs …/inputs/ai/png 1100 "#000000" …/inputs/ai/dl/commons-OpenAI_logo_2025_(symbol).svg` → `layout_gpt.py` → `template.sh gpt 876 gpt-f1`(보정은 `gpt-d1` 때의 것: `template.sh gpt 876 gpt-d1 …`, `tools.py calib gpt-d1`을 복사) · `tools.py crop gpt-f1` → `prompt_gpt.py gpt-f1 1` → `tools.py flat gpt-f1 1`(채택)
- **claude**: `cutout_pelican.py …/inputs/claude/dl/pelican-4.svg …/inputs/claude/png/pelican-paper.svg` · `render_svg.cjs …/inputs/claude/png 1080 - …/pelican-paper.svg` · `render_svg.cjs …/inputs/claude/png 1000 - …/inputs/ai/dl/lobe-claude-color.svg` → `layout_claude_base.py` · `template.sh claude 876 claude-b1`(보정은 `claude-a1` 때의 것) · `tools.py crop claude-b1` · `prompt_claude_base.py claude-b1 1` → `layout_claude.py` · `synth.py claude-c1 …/claude-b1/tmpl-0.png` · `prompt_claude.py claude-c1 1` · `tools.py flat claude-c1 1`(종이) → `prompt_claude_lettering.py 1` → `claude-e1`에 종이(`flat-1-paper.png`)와 `parts.json`을 두고 `letter_on_paper.py claude-e1 1 …/inputs/claude/letter/try-1.png 1024 438 1107 0.92 1.25 1a1816` · `print_on_paper.py claude-e1 1 …/inputs/claude/png/pelican-paper.png`(채택 `claude-e1/flat-1.png`)
- **gemini**: `render_svg.cjs …/inputs/gemini 1000 - …/commons-Google_Gemini_icon_2025.svg` · `render_svg.cjs …/inputs/gemini 400 - …/commons-Google_Gemini_logo_2025.svg` → `layout_gemini_base.py` · `synth.py gemini-d1 …/gemini-a1/tmpl-0.png`(틀 사진과 보정은 첫 시안 `gemini-a1`의 것) · `prompt_gemini_base.py gemini-d1 1` → `layout_gemini_things.py gemini-e1 0` · `synth.py gemini-e1 …/gemini-a1/tmpl-0.png` · `prompt_gemini_things.py gemini-e1 3` · `tools.py flat gemini-e1 3` → `reground_gemini.py gemini-e1:3 gemini-h1 70 45`(그린 바탕 `ground-1.png`) · `prompt_gemini_metal.py gemini-h1 2 gloss`(`metal-2.png`) · `reground_gemini.py gemini-e1:3 gemini-h4 70 45 ground=$PANEL_WORK/gemini-h1/metal-2.png mirror=0.3`(채택 `gemini-h4/flat-1.png`)
- **grok**: `render_svg.cjs`로 `inputs/grok/png`의 세 PNG(`lobe-grok.svg` 1200 `"#ffffff"`, `commons-SpaceX-Logo.svg` 200, `commons-X_logo_2023.svg` 1200) → `layout_grok.py grok-e1` · `synth.py grok-e1 …/grok-a1/tmpl-0.png`(틀 사진과 보정은 첫 시안 `grok-a1`의 것) · `prompt_grok_rocket.py grok-e1 3` · `tools.py flat grok-e1 3` → `layout_grok.py grok-f1`(두 인쇄의 층) · `shift_parts.py grok-e1:3 grok-g0 1130,620:-60,-214 still=grok-f1/bot.png,grok-f1/icon.png` · (`grok-f1`의 `bot.png` · `icon.png`를 `grok-g1`에 복사) `reprint_grok.py grok-g0 1 grok-g1 rim=0 dark=0.62` → `layout_grok_x.py grok-g1 grok-j1 1075 594` · `synth.py grok-j1 …` · `synth.py grok-j1-g …` · `prompt_grok_x.py grok-j1 a silver` · `tools.py flat grok-j1 a` · (두 층을 `grok-j1`에 복사) `reprint_grok.py grok-j1 a grok-k1 rim=0 dark=1.0`(채택 `grok-k1/flat-1.png`)
- **aqua**: 위의 예.
- **steel**: `layout_steel.py` → `template_plain.sh steel 876 steel-a3 steel-a4` · `PANEL_H=876 tools.py calib steel-a3` · `tools.py crop steel-a3` → `prompt_steel.py steel-a3 1` → `tools.py flat steel-a3 1`(채택)
- **noir**: `layout_noir.py` → `template_plain.sh noir 876 noir-a2 noir-a3` · `PANEL_H=876 tools.py calib noir-a2`(→ `noir-a3`에 복사) · `tools.py crop noir-a3` → `prompt_noir.py noir-a3 2` → `tools.py flat noir-a3 2`(채택)
- **wire**: `layout_wire.py` → `template_plain.sh wire 876 wire-a1` · `PANEL_H=876 tools.py calib wire-a1` · `tools.py crop wire-a1`(→ `wire-a2`에 `calib.json` · `tmpl-0.png` · `tmpl-crop.png` 복사: 두 폴더의 배치 그림이 같음) → `prompt_wire.py wire-a2 1` → `tools.py flat wire-a2 1` → `dim_edge.py wire-a2:1 wire-b2 96 470`(채택 `wire-b2/flat-1.png`)
- **astral**: `layout_astral.py` → `template_plain.sh astral 876 astral-a1 astral-a4` · `PANEL_H=876 tools.py calib astral-a1` · `tools.py crop astral-a1`(→ `astral-a3`에 복사: `a1`과 배치 그림이 같음) → `prompt_astral.py astral-a3 1` → `tools.py flat astral-a3 1`(채택)
- **standard**: `layout_standard.py` → `NOTE=flat HIT=flash template_plain.sh standard 876 standard-a1 standard-a2` · `PANEL_H=876 tools.py calib standard-a1`(→ `standard-a2`에 복사) · `tools.py crop standard-a2` → `prompt_standard.py standard-a2 2` → `tools.py flat standard-a2 2` → `tone_standard.py standard-a2:2 standard-b2 mean=62`(채택 `standard-b2/flat-1.png`)

## 필요한 입력 (저장소에 넣지 않은 것)

사용자의 참고 그림, 로고, 공식 그림, 내려받은 파일은 일부러 저장소에 넣지 않았습니다. 무엇을 썼는지는 기록(`assets-src/gears/panels/<gear>.json`)의 `sources`와 `generations[].pictures`에 적혀 있습니다(그 이름을 위의 경로 대응으로 옮기면 아래 자리입니다).

| 기어 | 작업 폴더의 자리 | 무엇 |
|---|---|---|
| 모두 | `inputs/data2/` | API 서버의 자료 폴더(화면을 찍을 때의 곡과 채보) |
| prism | `inputs/ref-user/ref-01.png` | 사용자의 참고 그림 1 |
| sky | `inputs/ref-user/ref-02.png` | 사용자의 참고 그림 2 |
| fire | `inputs/kda/dl2/` 의 `KDA_FIRESTARTER_Promo_01.jpg`, `KDA_FIRESTARTER_Cover_1.jpg`, `KDA_Logo_2.png`, `KDA_FIRESTARTER_Crest_icon.png`, `KDA_FIRESTARTER_Cover_Alternative_Version.jpg` | 공식 그림(내려받음). `refs_fire.py`, `layout_fire.py`, `crests_fire.py`가 읽음 |
| fire | `fire/flat-a1.png` | 앞 시안(새틴)의 되편 그림. `layout_fire.py`가 `fire-c3`(채택 안 함)을 그릴 때만 읽지만, 없으면 스크립트가 거기서 멈춤(`fire-c1` · `c2`는 이미 그린 뒤) |
| gpt | `inputs/ai/dl/commons-OpenAI_logo_2025_(symbol).svg` → `inputs/ai/png/…-000000.png`(`render_svg.cjs`) | 엠블럼(내려받음) |
| gpt | `refs/gpt-emblem.jpg`, `refs/gpt-icon.jpg` | 엠블럼을 흰 바탕에 올린 것, 공식 앱 아이콘. 첫 시안의 배치 스크립트가 쓴 것(옮기지 않음) |
| claude | `inputs/claude/dl/pelican-4.svg` | 펠리컨 SVG(내려받음; 출처는 기록) |
| claude | `inputs/ai/dl/lobe-claude-color.svg` → `inputs/claude/png/lobe-claude-color.png` | 스파크(내려받음) |
| claude | `refs/claude-spark.jpg` | 스파크를 아이보리 바탕에 올린 것. 첫 시안의 배치 스크립트가 쓴 것(옮기지 않음) |
| gemini | `inputs/ai/dl/commons-Google_Gemini_icon_2025.svg`, `…_logo_2025.svg` → `inputs/gemini/*.png` | 스파크와 워드마크(내려받음) |
| gemini | `refs/gemini-spark.jpg` | 스파크 참고 그림. 첫 시안의 배치 스크립트가 쓴 것(옮기지 않음) |
| gemini | `gemini-a1/tmpl-0.png`, `gemini-a1/calib.json` | 첫 시안 때 찍은 틀 사진과 보정(`template.sh gemini 876 gemini-a1`, `tools.py calib gemini-a1`) |
| grok | `inputs/grok/ref/bot-avatar.png`, `bot-avatar.json` | 사용자가 준 그림과, 거기서 잰 값(공의 원, 두 눈, 음영; 명령줄에서 한 번 잼) |
| grok | `inputs/ai/dl/lobe-grok.svg`, `inputs/grok/dl/commons-SpaceX-Logo.svg`, `commons-X_logo_2023.svg` → `inputs/grok/png/*.png` | 마크와 두 로고(내려받음) |
| grok | `refs/grok-doge-ship-2.png`, `refs/spacex-logo.png`, `refs/x-logo.png` | 앞 시안 렌더(`grok-c2/try-3.png`)의 로켓 부분을 자른 것, 로고를 바탕에 올린 것(명령줄에서 만듦) |
| grok | `grok-a1/tmpl-0.png`, `grok-a1/calib.json` | 첫 시안 때 찍은 틀 사진과 보정 |
| aqua · steel · noir · wire · astral | `refs/<gear>-console.png` | 사용자의 참고 그림의 아랫부분을 잘라 5~6배 키운 것(wire는 밝게도 함; 명령줄에서 만듦) |
| standard | 없음 | 게임 자신의 화면만. `layout_standard.py`가 저장소의 `panels/standard.webp`와 `deckPanels.json`을 읽음(아래 알아둘 점) |

## 알아둘 점

- **돌린 그대로입니다.** 작업하면서 쓴 스크립트를 경로만 고쳐 옮긴 것이라, 다듬은 도구가 아닙니다. 채택하지 않은 시안의 그림 · 프롬프트가 같은 파일에 남아 있고, 주석은 그때의 판단을 적은 그대로입니다.
- **틀 사진은 그때의 게임 화면입니다.** 찍을 때 작업 중이던 게임 코드가 반영되어 있어, 지금 다시 찍으면 같은 사진이 나오지 않습니다. 틀 사진을 받아서 하는 일(자르기, 보정, 되펴기, 합성)은 그대로 다시 나옵니다(아래 검증).
- **`layout_standard.py`**는 그때의 `client/public/media/panels/standard.webp`와 `deckPanels.json`의 `standard.glass`를 읽습니다. 새 패널을 게임에 넣은 뒤의 저장소에는 `glass`가 없어서 `standard-a1`을 그리다 멈추고, 채택한 `standard-a2`까지 가지 못합니다. 시안을 그리던 때의 트리(커밋 `6557ed8`)에서 돌려야 합니다.
- **`layout_grok.py`**: 이미지 모델에 준 `grok-e1/layout.png`은 마지막 한 줄을 고치기 전의 판으로 그렸습니다(엠블럼의 무늬가 더 진함: `lit = np.clip(lit * (0.82 + 0.3 * marks), 0, 1)`; 지금은 `0.9 + 0.16 * marks`). 패널에 찍힌 두 인쇄(`grok-f1`의 `bot.png` · `icon.png`)는 지금 판의 것입니다.
- **`reground_gemini.py`**: 그린 바탕을 만든 실행(`gemini-h1`)의 부산물 `gemini-h1/flat-1.png`은 그 뒤 스크립트가 바뀌어(물건의 비친 그림이 화면 밖으로 나가면 사라지게) 지금은 다르게 나옵니다. 그 실행에서 쓰는 것은 `ground-1.png`뿐이고, 채택한 그림을 만든 실행(`gemini-h4`)은 지금 판입니다.
- **`prompt_sky.py`, `placeholder_sky.py`, `placeholder_prism.py`**는 작업 폴더에 파일로 남아 있지 않았습니다. `prompt_sky.py`는 하늘을 만든 뒤 같은 파일(`p4/gen.py`)을 다른 시안용으로 덮어썼고, 두 자리 표시 그림은 명령줄에서 바로 그렸습니다. 셋 다 그때의 명령 기록에서 그대로 되살렸고, 결과가 기록 · 원본과 같은지 확인했습니다(아래).
- **`tools.py calib`**는 `PANEL_H`를 주지 않으면 패널 높이를 저장소의 `deckPanels.json`에서 읽습니다(`dots`가 방금 써 둔 값). 트리를 되돌린 뒤에 돌릴 때는 `PANEL_H`를 줍니다.
- `generate.py`의 호출 주소에는 프로젝트 번호가 들어 있습니다(`scripts/assets/make_skin_fx.py`와 같은 주소). 키는 환경 변수에서만 읽습니다.

## 검증

2026-11-13. 서버를 띄우지 않고 이미지 모델도 부르지 않는 단계를 새 작업 폴더에서 다시 돌려, 옛 작업 폴더에 남아 있는 원본과 sha256으로 비교했습니다. 입력은 원본을 복사해 넣었고, 스크립트는 저장소 맨 위에서 돌렸습니다. 저장소의 파일을 읽거나 쓰는 두 스크립트(`layout_standard.py`, `placeholder_prism.py`)는 이 폴더의 사본과 커밋 `6557ed8`의 해당 파일을 둔 다른 폴더에서 돌렸습니다.

| 단계 | 비교한 것 | 결과 |
|---|---|---|
| 문법 | `python3 -m py_compile`(57개), `bash -n`(14개), `node --check`(2개) | 모두 통과 |
| `PANEL_WORK`가 없을 때 | `layout_aqua.py`, `shoot_each.sh` | 그 말을 하고 멈춤 |
| 배치 그림: `layout_aqua` · `steel` · `noir` · `wire` · `astral` | 폴더마다 `layout.png` · `parts.json`, 모음 그림(11개 폴더) | 같음 |
| `layout_standard.py` | `standard-a1` · `a2`의 `layout.png` · `parts.json`, `original.png` | 커밋 `6557ed8`의 `standard.webp` · `deckPanels.json`으로: 같음. 지금 작업 트리에서는 멈춤(위 알아둘 점) |
| `layout_fire.py`, `refs_fire.py`, `crests_fire.py` | `fire-c1` · `c2` · `c3/layout.png`, `refs/*.jpg` 5개, `crests-dark.png`(= `fire-crests.png`) | 같음 |
| `layout_gpt.py`, `cutout_pelican.py`, `layout_claude_base.py`, `layout_claude.py`, `layout_gemini_base.py`, `layout_gemini_things.py` | `layout.png` · `parts.json` · `preview.jpg`, `pelican-paper.svg`, `refs/claude-clawd.jpg`, `refs/gemini-logo.png` | 같음 |
| `layout_grok.py grok-f1` | `bot.png` · `icon.png` · `layout.png` · `prints.png` · `parts.json` | 같음 |
| `layout_grok.py grok-e1` | `layout.png` · `prints.png` | **다름**: 그 실행 뒤에 한 줄이 바뀜(위 알아둘 점). 그 한 줄을 그때대로 두고 돌리면 `layout.png` · `prints.png`과 `synth.py`의 틀 사진까지 같음(확인함). `bot.png` · `parts.json`은 지금 판으로도 같음 |
| `layout_grok_x.py grok-g1 grok-j1 1075 594` | `grok-j1` · `grok-j1-g`의 `layout.png`, `x.png`, `parts.json` | 같음 |
| `placeholder_sky.py`, `placeholder_prism.py` | `sky/placeholder.png`, `p3/placeholder.png` | 같음 |
| `prompt_sky.py`(되살린 것) | 프롬프트 | 기록(`sky.json`)의 프롬프트와 글자 하나까지 같음 |
| `tools.py crop` | sky, fire-c2, gpt-f1, claude-b1, aqua-a2, steel-a3, noir-a3, wire-a1, astral-a1, standard-a2의 `tmpl-crop.png` | 같음 |
| `tools.py calib` | sky, fire-a5, gpt-d1, claude-a1, gemini-a1, grok-a1, aqua-a1, steel-a3, noir-a2, wire-a1, astral-a1, standard-a1의 `calib.json` | 같음 |
| `tools.py flat` | sky 3, fire-c2 2, gpt-f1 1, claude-b1 1, claude-c1 1, gemini-d1 1, gemini-e1 3, grok-e1 3, grok-j1 a, aqua-a2 1, steel-a3 1, noir-a3 2, wire-a2 1, astral-a3 1, standard-a2 2 | 같음(sky · fire · gpt · aqua · steel · noir · astral은 채택한 그림 그 자체) |
| `prism_calib.py`, `prism_flat.py` | `p3/calib.json`, `prism.png` | 같음 |
| `synth.py` | claude-c1, gemini-d1, gemini-e1, grok-j1, grok-j1-g의 `tmpl-0.png` · `tmpl-crop.png` | 같음(grok-e1은 위의 배치 그림이 달라 다름) |
| wire: `dim_edge.py` | `wire.png` | 같음 |
| standard: `tone_standard.py` | `standard.png` | 같음 |
| gemini: `reground_gemini.py` 두 번 | `gemini-drawn-ground.png`, `gemini-ground.png`, `gemini.png` | 같음(부산물 `gemini-h1/flat-1.png`만 다름: 위 알아둘 점) |
| grok: `shift_parts.py`, `reprint_grok.py` 두 번 | `grok-g0/flat-1.png`, `grok-g1/flat-1.png`, `grok.png` | 같음 |
| claude: `letter_on_paper.py`, `print_on_paper.py` | `claude-paper.png`, 글씨를 찍은 종이, `claude.png` | 같음 |
| `sheet_cameras.py`, `sheet_panels.py`, `prism_sheet.py` | 모음 그림 한 장씩 | 같음 |
| 프롬프트 스크립트 18개(호출만 바꿔치기해 돌림) | 보낼 프롬프트, 보낼 그림(sha256, 순서), 쓰는 기록 | 채택한 생성의 기록과 같음(기록의 그림 이름만 새 경로 이름) |

확인하지 못한 것: 셸 스크립트(틀 사진 · 촬영 · 서버)와 `frame_shots.cjs` · `render_svg.cjs`는 문법만 보았고 돌리지 않았습니다. 이미지 모델 호출도 하지 않았습니다. `tools.py dots` · `place`, `prism_dots.py`는 비교할 원본이 남아 있지 않습니다.
