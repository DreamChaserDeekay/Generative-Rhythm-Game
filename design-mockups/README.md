# 디자인 시안: 한 줄

곡 선택 · 설정 · 플레이 세 화면의 수정 시안입니다. 게임 소스(`client/`, `server/`, `config/`)는 고치지 않았고, 시안과 그 자산은 모두 이 폴더 안에 있습니다.

- 무엇을 보았고 무엇을 왜 바꿨는지: 시안 안의 **설명** 쪽(`5`)과 같은 글인 [`src/notes.html`](src/notes.html)
- 자산의 출처와 라이선스: [`PROVENANCE.md`](PROVENANCE.md)

## 열어 보기

```bash
cd client && npm install          # 시안은 게임의 node_modules를 빌려 씁니다
cd ../design-mockups
ln -s ../client/node_modules node_modules
npx vite build                    # → dist/
python3 -m http.server 8900 --directory dist
# http://127.0.0.1:8900/
```

키보드로 조작합니다. 화면 아래 줄에 지금 쓸 수 있는 키가 늘 보이고, 위 가운데 `시안` 줄의 숫자 `1`–`5`로 다섯 쪽(곡 선택, 설정, 플레이, 소리 고르기, 설명)을 오갑니다.

## 무엇으로 만들었나

| 파일 | 하는 일 |
|---|---|
| `src/stage.ts` | 메뉴에서도 계속 도는 트랙. 게임의 `TrackRenderer`를 그대로 불러, 창 크기의 캔버스에 플레이와 같은 구도로 그리고 CSS `transform`으로만 옮기고 줄입니다. |
| `src/select.ts` | 곡 선택. 선 아래로 흐르는 목록, 분석이 읽은 곡, 선 위의 난이도, 플레이 옵션·곡 정보·도구·곡 추가. |
| `src/config.ts` · `src/rows.ts` · `src/inventory.ts` | 설정. 지금 게임의 탭·항목·값·도움말(`_src/settings-inventory.json`)을 그대로 읽어 새 틀로 그립니다. 트랙에 보이는 항목은 게임의 실제 `Settings`에 묶여 있습니다. |
| `src/play.ts` | 플레이. 게임의 `PlayController`가 그대로 돌고, 시안은 그 둘레(시작 이름표와 선 위의 키, 곡의 레일, 스템 램프, FEVER 막대, 일시정지, 끝 요약)를 그립니다. |
| `src/sound.ts` · `src/audio.ts` | 소리 고르기 판과 샘플 재생. |
| `src/styles.css` | 시안의 토큰과 스타일. 게임의 `styles.css`는 플레이 HUD에만 닿도록 `.game-scope` 안에 가둬 불러옵니다(`vite.config.ts`). |
| `tools/export_songs.py` | 샘플 곡을 게임 서버로 분석하고 채보를 만들어 `public/data`, `public/audio`로 내보냅니다. |
| `tools/build_sfx.py` | 녹음 샘플을 잘라 음량을 맞춰 `public/sfx`로 내보내고 측정값을 적습니다. |
| `tools/package.mjs` | 빌드 결과에서 아티팩트로 올릴 쪽과 파일 목록을 만듭니다. |

## 데이터를 다시 만들기

```bash
# 1) 분석 서버를 띄운 뒤 (저장소 README의 설치와 실행)
python3 design-mockups/tools/export_songs.py http://127.0.0.1:8765
# 2) 효과음 (_src/sfx/raw에 원본 샘플이 있어야 합니다: PROVENANCE.md의 주소에서 받습니다)
server/.venv/bin/python design-mockups/tools/build_sfx.py
```

원본 음원(`_src/music/`의 파일)과 원본 샘플(`_src/sfx/raw/`)은 저장소에 넣지 않았습니다. 받은 주소는 각 `manifest.json`과 `PROVENANCE.md`에 있습니다.
