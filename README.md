# Generative Rhythm Game

내 음악 파일을 넣고 키 모드와 난이도를 고르면, 로컬 분석 서버가 곡을 분석해 그 곡만의 채보를 만들어 주고, 그 채보를 **SOUND VOLTEX식 3D 원근 트랙** 위에서 **DJMAX RESPECT V 판정 기준**으로 플레이하는 건반형 리듬게임입니다.

- 개발 명세(프롬프트): [docs/PROMPT.md](docs/PROMPT.md)
- 설계: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · 분석·생성 알고리즘: [docs/GENERATION.md](docs/GENERATION.md) · 채보 포맷: [docs/CHART_FORMAT.md](docs/CHART_FORMAT.md)

## 진행 상황

- [x] **Phase 0** — 설계, DJMAX 판정 엔진, 오디오 클럭, SDVX식 3D 트랙, 싱크 테스트, 오프셋 캘리브레이션
- [x] **Phase 1** — Python 분석 서버(표준 오디오·분석·채보 생성·난이도 산정·기록), 곡 업로드부터 결과까지 전체 흐름 (키 모드 4K · 7K+1S, 난이도 5단계)
- [x] **Phase 2** — 5K·6K·8K·사이드(FX) 레인, 룰셋 표기 프리셋(정밀 % · 등급형 · EX-SCORE), FEVER, 게이지 6종·클리어 램프 8종, 배치 옵션, 레인 커버·녹색 숫자 유지·BPM 연동 스크롤, 연습 모드(구간 반복·음정 유지 배속), 결과 분석 그래프, 손별 난이도 산정, 생성 스타일·세부 옵션, 채보 미니맵, 접근성 옵션
- [x] **Phase 3** — 스템 분리(기본 DSP · 선택 설치형 Demucs)와 온셋 악기 태깅, 선택 설치형 ML 백엔드(beat_this 박·다운비트, basic-pitch 음높이, allin1 곡 구조), 악기별 레인 매핑, 반복 구간 패턴 일관성, 스템 키음 모드, SDVX식 카메라 연출(기울기·줌), 배경(흐린 앨범아트·비주얼라이저·BGA 영상·밝기), 스킨 시스템(기본 4종 + JSON 사용자 스킨)
- [x] **Phase 4** — 채보 에디터(생성 결과 수정 + 커서부터 테스트 플레이), BMS·bmson·osu!mania 가져오기/내보내기(BMS 키음·BGM 채널·BPM 변속·STOP), 리플레이, 게임패드·전용 컨트롤러(턴테이블 포함), 데스크톱 앱(Electron + 분석 서버 동봉)

## 준비물

- Python 3.11 이상
- Node.js 20 이상 (클라이언트 빌드용)
- 최신 Chrome 또는 Edge

## 설치와 실행

```bash
# 1) 분석 서버 설치
cd server
python -m venv .venv
.venv/bin/pip install -e ".[dev]"        # Windows: .venv\Scripts\pip install -e ".[dev]"

# 2) 클라이언트 빌드 (한 번만)
cd ../client
npm install
npm run build

# 3) 실행: 서버가 게임 화면과 API를 함께 제공합니다
cd ../server
.venv/bin/python -m rhythm_server        # → http://127.0.0.1:8765
```

### ML 분석 백엔드 (선택)

기본 분석(numpy·scipy)만으로 모든 기능이 동작합니다. 아래 라이브러리를 설치하면 서버가 자동으로 찾아 쓰고, 설정 화면의 **분석 백엔드**에서 상태를 볼 수 있습니다.

```bash
cd server
.venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu   # CPU용 PyTorch
.venv/bin/pip install -e ".[ml]"                                                        # demucs · beat-this (+ basic-pitch)
```

| 백엔드 | 하는 일 | 없을 때(기본 분석) | 라이선스 |
|---|---|---|---|
| Demucs (htdemucs) | 드럼·베이스·보컬·그 외 4스템 분리 | HPSS + 배음 마스크 분리 | 코드 MIT, 가중치는 라이선스 명시 없음 |
| beat_this | 박·다운비트 → 템포 힌트·박자 | 온셋 자기상관·다운비트 단서 | 코드·가중치 MIT |
| basic-pitch | 멜로디 음높이 | 온셋 배음 분석 | Apache-2.0. TensorFlow 2.15가 필요해 **Python 3.11에서만** 설치됩니다(3.12 이상에서는 자동으로 빠짐) |
| allin1 | 곡 구조 라벨(절·후렴) | 자기유사 행렬 구조 분석 | 코드 MIT, 의존성 madmom의 모델이 비상업 라이선스라 `[ml]`에 넣지 않았습니다. 직접 설치하면 쓰지만 실제 라이브러리로는 검증하지 않았습니다 |

- 모델 가중치는 처음 쓸 때 한 번 내려받습니다(Demucs 약 84MB, beat_this 약 81MB). 음원은 PC 밖으로 나가지 않습니다.
- **느립니다**: 4코어 CPU에서 Demucs · beat_this · basic-pitch를 모두 쓰면 4분 곡 분석이 약 4분(242초) 걸립니다(기본 분석은 18초). 분석은 백그라운드 작업이라 진행률을 보며 다른 곡을 플레이할 수 있습니다. 단계별로 끄려면 `config/analysis.json`에서 그 단계의 `backend`를 `null`로 바꾸세요.
- GPU를 쓰려면 pytorch.org 안내대로 CUDA용 PyTorch를 설치하고 `config/analysis.json`의 `ml.device`를 `"cuda"`로 바꾸세요.
- `ml.enabled`를 `false`로 두거나 `GRG_ML=0`으로 서버를 띄우면 ML을 쓰지 않습니다. ML 백엔드가 실패하면 그 단계만 기본 분석으로 대체하고 분석 결과의 `analyzer.errors`에 남깁니다.
- 백엔드를 설치·제거하거나 분석기가 바뀌면, 이미 분석한 곡의 곡 정보에 **다시 분석** 버튼이 나타납니다.

### 데스크톱 앱 (선택)

브라우저 대신 창 하나로 실행하는 앱을 만들 수 있습니다. 분석 서버를 PyInstaller로 묶어 Electron 앱에 넣고, 앱이 켜질 때 빈 로컬 포트에 서버를 띄웁니다. 라이브러리는 사용자 앱 데이터 폴더(`Generative Rhythm/library`)에 저장됩니다.

```bash
packaging/build_desktop.sh          # → desktop/dist (Windows: NSIS 설치 파일, macOS: dmg, Linux: AppImage)
packaging/build_desktop.sh --dir    # 설치 파일 없이 실행 폴더만 (desktop/dist/<OS>-unpacked)
cd desktop && npm install && npm start   # 개발용: 저장소의 Python 서버로 실행 (client/dist 빌드 필요)
```

- 빌드하는 OS용 앱만 만들어집니다(Windows 앱은 Windows에서). Linux에서 실행 폴더 빌드와 실행까지 확인했고, Windows·macOS 설치 파일은 만들어 보지 못했습니다. Windows에서는 Git Bash에서 같은 스크립트를 돌리도록 만들었지만 확인하지는 못했습니다.
- 데스크톱 앱에는 기본 분석만 들어갑니다(ML 백엔드는 용량 문제로 빼었습니다). 크기는 압축 전 약 570MB입니다.

### 플레이

브라우저에서 `http://127.0.0.1:8765`를 열고 **곡 추가**(또는 파일을 끌어다 놓기)로 mp3 · ogg · wav · flac · m4a를 올리세요. 분석이 끝나면 키 모드와 난이도를 고르고 **채보 생성 & 플레이**를 누르면 됩니다. 음악 파일이 없으면 **데모 곡**으로 합성 곡을 만들어 볼 수 있습니다.

- **플레이 옵션**: 판정 표기(정밀 % / 등급형 / EX-SCORE), 게이지(ASSIST EASY ~ HAZARD), FEVER(자동·수동·끔), 배치(미러·랜덤·R-랜덤·S-랜덤·H-랜덤), 페이스메이커.
- **생성 옵션**: 스타일(균형·스트림·동치·연타·롱노트·테크니컬·멜로디), 리듬 기준, 밀도·롱노트 비율·최대 동시 노트·스크래치/사이드 비율. 바꾸면 채보를 새로 만듭니다.
- **연습 모드**: 채보를 만든 뒤 "연습 모드"를 켜고 미니맵을 드래그해 구간을 고르면, 0.5~1.5배속(음정 유지)으로 구간을 반복합니다. 연습 결과는 기록되지 않습니다.
- **악기별 레인 · 반복 구간**(생성 옵션): 드럼 킥은 왼쪽·하이햇은 오른쪽, 베이스는 왼쪽으로 모으고(세기 0–100%), 같은 후렴·절이 다시 나오면 같은 패턴을 씁니다. 리듬 기준(드럼·베이스·멜로디·보컬)은 분리한 스템의 소리를 우선합니다.
- **스템 키음**(설정): 채보가 주로 따르는 악기(채보 미리보기의 스템 비율 막대에 강조 표시)를, 그 악기의 노트를 놓치면 잠깐 줄였다가 맞히면 바로 되돌립니다. 스템은 분석할 때 함께 저장하고, 이전 버전에서 분석한 곡은 **다시 분석**해야 키음을 쓸 수 있습니다.
- **배경**: 흐린 앨범아트 위에 음악에 반응하는 스펙트럼을 그립니다. 곡 정보에서 mp4·webm 영상을 **배경 영상(BGA)**으로 등록하면 곡 시간에 맞춰 재생하고, 영상 오프셋을 ±ms로 맞출 수 있습니다. 배경 밝기·비주얼라이저·BGA는 설정에서 켜고 끕니다.
- **카메라 연출**: 에너지가 크게 오르는 곳(드롭·후렴 시작)에서 줌 펄스, 에너지가 높은 구간마다 트랙이 좌우로 번갈아 기울어집니다. 설정에서 세기를 0–100%로 조절하거나 끌 수 있고, "번쩍임 줄이기"를 켜면 절반으로 줄어듭니다. 판정·노트 시간에는 영향이 없습니다.
- **스킨**(설정): 네온·클래식·모노·선셋 기본 스킨(노트 모양 상자·납작·캡슐, 레인 색 배치, 타격 이펙트, 트랙 색)과 JSON으로 붙여 넣는 사용자 스킨. 색각 보정 팔레트를 켜면 레인 색은 팔레트가 우선합니다.

사용자 스킨은 설정 → 스킨의 입력란에 JSON을 붙여 넣고 **사용자 스킨 적용**을 누르면 됩니다. 빠지거나 잘못된 값은 기본 스킨(네온) 값으로 채우고, 색은 `#rrggbb`만 받습니다.

```json
{
  "label": "내 스킨",
  "noteShape": "round",
  "laneLayout": "rainbow",
  "hitEffect": "ring",
  "colors": {
    "trackNear": "#16224a", "trackFar": "#060a1a", "fog": "#060a1a",
    "railLeft": "#37e2ff", "railRight": "#ff4fd8", "divider": "#3a4c86", "bar": "#9fb4ff",
    "judgeLine": "#ffffff", "judgeGlow": "#5fe7ff", "cover": "#0a1030", "coverEdge": "#5fe7ff",
    "lanes": { "white": "#e8f0ff", "blue": "#4fa3ff", "gold": "#ffcf4a", "scratch": "#ff5470", "sideL": "#7cffb2", "sideR": "#7cffb2" }
  }
}
```

`noteShape`는 `box`(상자) · `flat`(납작) · `round`(캡슐), `laneLayout`은 `mode`(키 모드별 흰·파랑·금색) · `uniform`(모든 건반 레인을 `lanes.white` 색으로) · `rainbow`(무지개), `hitEffect`는 `burst` · `ring` · `none`입니다.

### 채보 에디터

채보 미리보기의 **채보 편집**으로 엽니다. 시간은 아래에서 위로 흐르고, 빨간 선이 커서입니다.

- 클릭으로 노트, 위로 드래그로 롱노트, 우클릭으로 삭제, 노트를 드래그해 옮기기, 롱노트 끝을 드래그해 길이 조절, Shift+드래그로 범위 선택.
- 박자 스냅 1/4 ~ 1/64(숫자 키 1–8), 휠 이동·Ctrl+휠 확대, Ctrl+C/X/V(커서 위치에 붙이기), Ctrl+Z/Y, M 미러, ↑↓ 커서, Alt+↑↓·←→ 선택 이동.
- Space·P 재생(타격음 또는 키음). **실시간 입력**을 켜고 재생하면 레인 키를 누른 자리에 노트가 놓입니다(이때 Space가 레인 키면 P로 멈춥니다).
- **T**(커서부터 테스트)는 커서 위치부터 연습 모드로 플레이하고, 끝나면 에디터로 돌아옵니다.
- **저장**(Ctrl+S)하면 원본은 그대로 두고 새 채보로 저장하고 난이도를 다시 계산합니다. 같은 레인에서 노트가 겹치는 편집은 처음부터 막습니다. 템포·박자는 원래 채보를 따릅니다.

### 채보 가져오기 · 내보내기

- **가져오기**: 곡 목록 위 **채보 가져오기**에서 osu!mania(.osz · .osu + 음원), BMS(.bms · .bme · .bml), bmson 파일이나 압축 파일(.zip)을 고르거나, **폴더**로 키음이 든 BMS·bmson 폴더를 통째로 고릅니다(파일을 화면에 끌어다 놓아도 됩니다). 가져온 채보는 곡 정보의 **저장된 채보**에 생깁니다.
  - osu!mania: 들어 있는 음원이 곡이 됩니다. 4·5·6·8키는 같은 키 모드로, 7키는 7K+1S의 1–7번 레인으로(스크래치 없음), SpecialStyle 8키는 7K+1S로 가져옵니다. 속도 변화(SV)는 쓰지 않습니다.
  - BMS·bmson: 키음(#WAV)을 디코딩해 BGM 채널과 노트 소리를 합친 음원을 서버가 만들어 곡으로 등록하고(분석·자동 생성도 가능), 플레이할 때는 BGM을 깔고 **노트를 칠 때만 그 키음이 납니다**(BMS처럼 빈 칸을 누르면 그 레인의 다음 노트 소리). BPM 변속·STOP·마디 길이 변경·롱노트(LNTYPE 1·LNOBJ)·#RANDOM(파일마다 고정된 하나의 분기)·bmson의 이어지는 소리(슬라이스)를 지원합니다. 5키+스크래치는 7K+1S에, DP·PMS(9키)는 지원하지 않습니다. Shift_JIS · EUC-KR · UTF-8 파일 이름과 내용을 자동으로 구분합니다.
- **내보내기**: 채보 미리보기나 결과 화면의 osu!mania · BMS · bmson 버튼. osu!mania는 모든 키 모드, BMS·bmson은 5K · 7K+1S만(그 밖의 모드는 BMS 플레이어에 대응하는 배치가 없습니다). **음원은 넣지 않고 파일 이름만 적으므로**, 내보낸 파일을 원래 음원 파일 옆에 두세요. 첫 박이 0ms보다 늦으면 BMS·bmson에는 그 길이만큼의 짧은 첫 마디를 넣어 마디가 맞게 합니다. BMS 파일은 UTF-8로 쓰므로, Shift_JIS만 읽는 플레이어에서는 제목이 깨질 수 있습니다(bmson 권장).

### 리플레이 · 게임패드

- 기록이 저장되는 플레이(오토·연습·싱크 테스트 제외)는 입력이 함께 저장됩니다. 결과 화면의 **리플레이 보기**·**리플레이 파일 저장**, 채보 미리보기의 **최고 기록 리플레이**, 상단의 **리플레이 열기**(저장한 파일)로 다시 볼 수 있습니다. 판정 엔진에 들어간 입력을 순서 그대로 다시 넣으므로 점수·판정이 정확히 같게 재현됩니다. 볼 때는 보는 사람의 배속·스킨 설정을 씁니다.
- 게임패드·전용 컨트롤러(IIDX·SDVX식 컨트롤러 포함)는 설정의 **게임패드 · 전용 컨트롤러**에서 레인마다 버튼·스틱 방향·턴테이블(축)을 지정합니다. 키보드 키와 함께 쓸 수 있습니다. 메뉴는 십자키·왼쪽 스틱(방향), A·Start(Enter), B(Esc), Y(Tab)로 조작하고, 플레이 중에는 Start로 일시정지합니다.

분석기 1.1.0 · 생성기 0.3.0으로 올라가 Phase 2에서 만든 채보와는 채보 ID가 달라집니다. 이전 기록은 남아 있지만 새 채보의 기록과는 따로 쌓입니다. 예전에 분석한 곡도 그대로 플레이할 수 있고, **다시 분석**하면 악기 정보(악기별 레인·키음·스템 비율)가 생깁니다.

업로드한 음원과 분석 결과·채보·기록은 저장소의 `data/` 폴더(또는 `--data` 경로)에만 저장되고, 서버는 `127.0.0.1`에서만 접속을 받습니다.

### 개발 모드

```bash
cd server && .venv/bin/python -m rhythm_server   # 터미널 1: API (8765)
cd client && npm run dev                         # 터미널 2: http://127.0.0.1:5173 (/api는 8765로 프록시)
```

### 터미널 도구

```bash
cd server
.venv/bin/python -m rhythm_server synth -o demo.wav --bpm 140 --bars 32       # 테스트용 합성 곡
.venv/bin/python -m rhythm_server analyze song.mp3 -o analysis.json            # 분석 결과 JSON
.venv/bin/python -m rhythm_server generate song.mp3 --mode 7K+1S --difficulty HARD -o chart.json
```

## 조작

| 키 모드 | 기본 키 |
|---|---|
| 4K | D F J K |
| 4K+FX | L-Shift(왼쪽 사이드) D F J K R-Shift(오른쪽 사이드) |
| 5K | D F Space J K |
| 6K | S D F K L ; |
| 6K+FX | L-Shift S D F K L ; R-Shift |
| 7K+1S | L-Shift(스크래치) S D F Space J K L — 설정에서 BMS식 Z S X D C F V 배치로 바꿀 수 있음 |
| 8K | A S D F J K L ; |

- 곡 선택: ↑↓ 곡, ←→ 난이도, Tab 키 모드, Enter 플레이
- 플레이 중: Esc 일시정지, F2 즉시 재시작, ↑/↓ 배속 ±0.1(Shift ±0.5), PageUp/PageDown SUDDEN+, Shift+PageUp/PageDown LIFT, Home 커버 켜기/끄기, Enter FEVER(수동 모드). 바꾼 배속·커버는 다음 플레이에도 유지됩니다.
- 키는 물리 키 기준이라 한글 입력 상태와 상관없이 동작합니다. 설정에서 모든 키를 바꿀 수 있고, **동시 입력 테스트**로 키보드가 여러 키를 한꺼번에 인식하는지 확인할 수 있습니다.
- 게임패드: 레인 지정은 설정에서. 패드는 화면 프레임과 따로 짧은 간격으로 읽고, 브라우저가 패드 신호를 받은 시각으로 판정합니다(`config/input.json`).

## 판정 (DJMAX RESPECT V 기준)

| 판정 | NORMAL | HARD | MAX |
|---|---|---|---|
| MAX 100% | ±41.67ms | ±20.83ms | ±10.42ms |
| MAX 90% / 80% | ±60 / ±78ms | ×1/2 | ×1/4 |
| MAX 70% ~ 10% | ±78 ~ ±160ms 보간 | ×1/2 | ×1/4 |
| MAX 1% | ±180ms | ±90ms | ±45ms |

MAX 1%까지는 콤보가 이어지고 게이지도 줄지 않으며, BREAK에서만 콤보가 끊깁니다. 사이드 트랙 노트는 놓쳐도 BREAK가 아니라 MAX 1%입니다. 롱노트는 누르는 동안 콤보가 오르고 끝까지 누르면 MAX 100%입니다. MAX 100%만 커뮤니티 정설 값이고 나머지는 실측 추정·보간값이라 `config/judgement.json`에서 출처와 함께 조정할 수 있습니다.

판정 표기를 등급형(EZ2ON 참고)이나 EX-SCORE(BMS 참고)로 바꿔도 **판정 범위는 위 DJMAX 표 그대로**이고, 표기·점수·콤보 규칙만 바뀝니다(`config/rulesets.json`). EX-SCORE에서는 BAD에서도 콤보가 끊깁니다.

| 게이지 | 시작 | 클리어 | BREAK | 실패 |
|---|---|---|---|---|
| ASSIST EASY / EASY / NORMAL | 20% | 끝날 때 60 / 80 / 80% 이상 | −2.5 / −4 / −5% | 끝날 때 판정 |
| HARD / EX-HARD / HAZARD | 100% | 끝까지 버티기 | −9 / −18 / −100% | 0%가 되는 순간 곡이 멈춤 |

## 싱크 맞추기

1. **싱크 테스트**: 클릭 트랙과 함께 오토 플레이가 돌아갑니다. 모든 노트가 MAX 100%면 판정 경로가 정상입니다.
2. **캘리브레이션**: 메트로놈에 맞춰 키를 누르면 평균 오차로 판정 오프셋을 맞춥니다.
3. 플레이 결과 화면의 타이밍 분포에서도 오프셋 추천을 바로 적용할 수 있습니다.
4. 노트가 소리보다 늦게 보이면 설정의 **표시 오프셋**을 올리세요.

## 테스트

```bash
cd server && .venv/bin/python -m pytest          # 분석 정확도, 스템 분리·악기 태깅, ML 백엔드 대체 경로, 생성기 결정성·린터·난이도 단조성, 악기별 레인·반복 일관성·카메라 연출·키음, 7개 키 모드, 스타일, API(스템·BGA 포함), 채보 포맷 왕복·BMS/bmson/osu! 가져오기·편집 채보·리플레이 저장, 성능 (66개 + ML 4개 건너뜀)
cd client && npm test                            # 판정·롱노트·룰셋·게이지·FEVER·배치 옵션·스크롤(STOP 포함)·타임 스트레치·설정·오디오 클럭·입력·카메라 투영·카메라 연출·스킨·에디터·리플레이 재현·게임패드 (84개)
cd client && npx playwright test                 # 서버+브라우저 E2E: 싱크 테스트, 업로드→분석→생성→오토 플레이, FX·EX-SCORE·커버, 연습 모드, HAZARD 실패, 키음·BGA·카메라 연출·스킨, 사용자 스킨, 에디터, BMS 폴더 가져오기·키음 플레이, 리플레이 재현, 게임패드 (12개)
```

E2E는 `server/.venv`의 Python을 쓰며, 다른 Python을 쓰려면 `GRG_PYTHON` 환경 변수로 지정하세요. `tests/test_ml_integration.py`(4개)는 ML 라이브러리를 설치한 환경에서만 실제 Demucs·beat_this·basic-pitch로 돌고, 없으면 건너뜁니다.

## 구조

```
client/     브라우저 게임 (TypeScript · Vite · React · Three.js)
server/     로컬 분석 서버 (Python · FastAPI · numpy · scipy)
desktop/    데스크톱 앱 (Electron)
packaging/  분석 서버 묶기(PyInstaller)와 데스크톱 빌드 스크립트
config/     판정 범위 · 룰셋 · 키 모드 · 게이지 · FEVER · 카메라·연출 · 난이도 프리셋·생성 스타일 · 분석 백엔드 · 악기 매핑·키음 · 게임패드 (서버·클라이언트 공용)
docs/       명세 · 설계 · 알고리즘 · 채보 포맷
```

## 라이선스 주의

수록곡과 다른 게임의 에셋은 포함하지 않습니다. 테스트 음원은 코드로 합성합니다. 기본 설치 의존성은 FastAPI(MIT), numpy·scipy(BSD), PyAV(BSD, FFmpeg LGPL), soundfile(BSD), React(MIT), Three.js(MIT)로 모두 허용적 라이선스입니다. 선택 설치형 ML 백엔드는 PyTorch(BSD 계열), Demucs(코드 MIT, 사전학습 가중치는 라이선스 명시 없음 — 재배포 전 확인 필요), beat_this(MIT), basic-pitch(Apache-2.0)입니다. AGPL/GPL·비상업 라이선스(essentia, aubio, madmom 모델 등)는 쓰지 않으며, madmom 모델에 기대는 allin1은 기본 설치에서 뺐습니다. 라이선스 메모는 `config/analysis.json`의 `licenses`에도 있습니다.

BGA 영상과 사용자 스킨은 사용자가 직접 넣는 파일이며 저장소에 포함하지 않습니다. 테스트용 영상도 코드로 합성합니다. 가져오기 테스트의 BMS·osu! 채보와 키음도 코드로 만듭니다. 가져온 채보와 키음은 사용자의 PC(`data/`)에만 저장됩니다.

데스크톱 앱 빌드 도구는 Electron(MIT, Chromium 라이선스 파일 동봉), electron-builder(MIT), PyInstaller(GPL-2.0 + 부트로더 예외 — 묶은 프로그램의 배포 라이선스에는 제약이 없음)입니다.
