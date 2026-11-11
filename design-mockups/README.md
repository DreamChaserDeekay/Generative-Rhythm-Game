# 디자인 시안 2

곡 선택 · 설정 · 플레이 세 화면의 수정 시안입니다. 게임 소스(`client/`, `server/`, `config/`)는 고치지 않았고, 시안과 그 자산은 모두 이 폴더 안에 있습니다.

첫 시안("한 줄")에 받은 피드백으로 다시 만든 두 번째 시안입니다: 화면의 정보를 덜어 내고, 커버를 중심으로 한 새 디자인으로 바꿨습니다.

- 피드백이 어디에 어떻게 들어갔는지, 정해야 할 것, 구현할 때 만나는 것: 시안 안의 **시안 설명**(`F1`)과 같은 글인 [`src/notes.html`](src/notes.html)
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

키보드로 조작합니다. 화면 아래 줄에 지금 쓸 수 있는 키가 늘 보입니다. 시안 전용 키는 `F1`(시안 설명), `F7`(배경 후보), `F8`(목록 후보)입니다.

## 무엇으로 만들었나

| 파일 | 하는 일 |
|---|---|
| `src/select.ts` | 곡 선택: 커버와 곡, 난이도 판, 제자리에서 여는 플레이 옵션, 필터 줄과 휠 목록, 커버 · 배경 영상 · 곡 추가 · 메뉴 시트. |
| `src/songinfo.ts` | 곡 정보·도구: 채보(곡 구성 · 채보 · 악기별 정보와 미리보기) · 기록 · 도구 · 곡 설정. |
| `src/config.ts` · `src/rows.ts` · `src/inventory.ts` | 설정. 지금 게임의 탭 · 항목 · 값 · 도움말(`_src/settings-inventory.json`)을 그대로 읽어 새 틀로 그립니다. 트랙에 보이는 항목은 게임의 실제 `Settings`에 묶여 있습니다. AI 채보 탭은 `claude/mapperatorinator` 브랜치의 항목을 옮긴 것입니다. |
| `src/play.ts` | 플레이. 게임의 `PlayController`와 배경 층이 그대로 돌고, 시안은 시작 카드 · 곡 이름 · 일시정지 · 끝 요약만 그립니다. |
| `src/stage.ts` | 메뉴 안의 미리보기 트랙. 게임의 `TrackRenderer`를 그대로 불러 씁니다. |
| `src/art.ts` | 시안의 아이콘 · 램프 · 커버(없으면 디스크). |
| `src/css/` | 시안의 토큰(`base.css`)과 화면별 스타일. 게임의 `styles.css`는 플레이 HUD에만 닿도록 `.game-scope` 안에 가둬 불러옵니다(`vite.config.ts`). |
| `src/audio.ts` · `src/sound.ts` | 미리듣기 재생. 효과음과 소리 고르기 판은 꺼 두었습니다(`SFX_ON`): 소리는 다음에 다시 고릅니다. |
| `tools/export_songs.py` | 샘플 곡을 게임 서버로 분석하고 채보를 만들어 `public/data`, `public/audio`로 내보냅니다. |
| `tools/make_covers.py` | 표본 커버를 이미지 생성 모델로 만들고 프롬프트와 사용량을 적습니다(`_src/covers/record.json`). |
| `tools/build_sfx.py` | (꺼 둠) 녹음 샘플을 잘라 음량을 맞추고 측정값을 적습니다. |
| `tools/provenance.py` | 위의 기록들에서 `PROVENANCE.md`를 만듭니다. |
| `tools/package.mjs` | 빌드 결과에서 아티팩트로 올릴 쪽과 파일 목록을 만듭니다. |

## 데이터를 다시 만들기

```bash
# 1) 분석 서버를 띄운 뒤 (저장소 README의 설치와 실행)
python3 design-mockups/tools/export_songs.py http://127.0.0.1:8765
# 2) 표본 커버 (키는 환경 변수로만 넘깁니다)
GOOGLE_API_KEY=... python3 design-mockups/tools/make_covers.py
# 3) 출처 문서
python3 design-mockups/tools/provenance.py
```

원본 음원(`_src/music/`의 파일)과 효과음의 원본 샘플(`_src/sfx/raw/`)은 저장소에 넣지 않았습니다. 받은 주소는 각 `manifest.json`과 `PROVENANCE.md`에 있습니다.
