# 아키텍처

`docs/PROMPT.md`의 명세를 구현하기 위한 설계 문서다. 명세가 바뀌면 이 문서도 같이 고친다.

## 1. 요구사항 요약

- 사용자가 고른 음악 파일과 키 모드·난이도로 **채보를 자동 생성**하고, 그 채보를 플레이하는 건반형 리듬게임.
- **곡 분석·채보 생성·난이도 산정은 로컬 Python 서버**가 맡는다. 브라우저 클라이언트는 플레이만 한다.
- **판정 범위는 DJMAX RESPECT V 기준**(NORMAL / HARD / MAX JUDGEMENT).
- **플레이 화면은 SOUND VOLTEX식 3D 원근 트랙**: 판정선 쪽 낮은 시점에서 트랙이 화면 위쪽 소실점으로 뻗어 나간다.
- 품질 우선순위: 싱크·판정 정확성 > 음악과 맞는 채보 > 믿을 수 있는 난이도 > 손맛.

## 2. 가정 (명세에서 정하지 않은 부분)

사용자가 확인 없이 진행하라고 했으므로, 아래 기본값으로 진행한다. 바꾸고 싶으면 알려 주면 된다.

| 항목 | 가정 |
|---|---|
| 실행 형태 | 같은 PC에서 Python 서버(`127.0.0.1:8765`)를 띄우고 브라우저로 접속. 빌드된 클라이언트는 서버가 같은 주소에서 함께 제공한다(명령 하나로 실행). 개발 중에는 Vite 개발 서버가 `/api`를 서버로 프록시한다. |
| 지원 브라우저 | 최신 Chrome / Edge. |
| 키 모드 | 4K · 4K+FX · 5K · 6K · 6K+FX · 7K+1S · 8K. FX는 양 끝에 DJMAX식 사이드 트랙 2개(L-Shift / R-Shift). 사이드 노트는 양 끝의 좁은 레인(기본)이나, DJMAX처럼 건반 레인의 왼쪽·오른쪽 절반을 덮는 막대(설정 `sideNotes: 'half'`, 반쪽 덮기)로 그린다. 그리는 법만 다르고 채보의 레인·키·판정·배치·점수·리플레이는 같다. |
| 판정 기본값 | NORMAL. 설정에서 HARD / MAX JUDGEMENT 선택. |
| 게이지 | 기본 NORMAL(중간 실패 없음, 끝날 때 80% 이상이면 CLEAR). ASSIST EASY · EASY · HARD · EX-HARD · HAZARD 선택. |
| 배속 정의 | 배속 1.0 = 노트가 트랙 끝에서 (LIFT 없는) 판정선까지 5000ms. 기본 배속 4.0(1250ms). 녹색 숫자 = SUDDEN+ 아래로 노트가 나타난 뒤 판정선까지의 시간. |
| 점수 규칙 | 판정 범위는 하나(DJMAX)로 두고, 판정을 묶는 방식·점수·콤보 규칙만 프리셋으로 바꾼다(정밀 % / 등급형 / EX-SCORE, 코드의 `ruleset`). 실제 EZ2ON·BMS 판정 폭을 흉내 내지 않는다. 기록은 그 규칙의 대표 숫자(RATE / 가중 점수 / EX-SCORE)로, 같은 판정 모드(NORMAL / HARD / MAX JUDGEMENT)의 플레이끼리 비교한다. |
| 표준 오디오 | 44.1kHz 스테레오 16bit FLAC. 분석과 재생이 같은 PCM을 쓴다. |
| 데이터 위치 | 저장소 루트의 `data/` (환경 변수 `GRG_DATA_DIR`로 변경 가능, git에서 제외). |
| 판정 범위 수치 | MAX 100%(±41.67ms)만 정설이고 나머지는 커뮤니티 실측 추정·보간값이다. `config/judgement.json`에 출처와 함께 둔다. |
| ML 백엔드 | 기본 분석(numpy·scipy)이 항상 동작한다. Demucs(스템)·beat_this(박·다운비트)·basic-pitch(음높이)·allin1(곡 구조)는 선택 설치형으로, 설치되어 있으면 단계마다 자동으로 쓰고 실패하면 그 단계만 기본 분석으로 대체한다. PyTorch 등 수 GB 의존성과 라이선스 때문에 기본 설치에 넣지 않는다. |
| 스템 | 드럼 · 베이스 · 보컬 · 그 외(other) 4개(Demucs와 같은 구성). ML이 없으면 기본 DSP 분리를 쓴다. 품질은 낮지만 온셋 악기 태깅과 키음에는 충분하다. |
| 생성 채보 키음 | DJMAX처럼 노트마다 그 노트가 따르는 스템(`src`)의 소리를 낸다. 소리 조각은 그 노트부터 같은 스템의 다음 노트까지(최대 4초)라 박 단위로 어색하게 끊기지 않고, 다 맞히면 원곡이 그대로 이어진다. 키음은 원곡의 그 스템보다 1.2배 크게 내서 친 소리가 조금 드러나고, 그 때문에 출력 한계를 넘는 순간은 출력 리미터가 받는다(4절). 놓치거나 BREAK면 그 조각만 빠진다. 빈 누름(고스트 노트)과 BREAK가 된 누름은 그 레인의 다음 노트(없으면 마지막 노트) 조각의 앞부분(최대 0.3초)을 곡 소리 위에 따로 내고, 곡의 조각은 끊지 않는다. 곡 시간·판정은 믹스 그대로다. |
| 난이도 기준 | 기본 5단계 외에 DJMAX RESPECT V(NM · HD · MX · SC, Lv.1–15, SC는 별도 척도)와 EZ2ON REBOOT : R(EZ · NM · HD · SHD, Lv.1–20)의 난이도 이름·레벨 척도를 고른다(기본값 DJMAX). 레벨별 밀도와 난이도별 경향은 공개 채보 목록의 집계 값(노트 수 ÷ 곡 길이 중앙값, 그루브 지표)으로 맞추고, 채보 내용은 쓰지 않는다. |
| 패턴 배치 | 노트를 하나씩 놓지 않고 악구마다 음악의 몸짓(상행·왕복·반복음·분산화음·페달·드럼)을 읽어 모양(계단·트릴·롤·앵커 …)과 동치 질감을 정한 뒤, 레인 빔 서치가 그 모양을 따르게 한다. 다른 게임의 채보 내용은 쓰지 않고, 공개 지표·공개 설명과 디자이너 원칙으로 만든다. 예전 방식(`patternEngine: "classic"`)은 비교용으로 남긴다. |
| 카메라 연출 | 채보에 들어 있는 `effects`(구간 · 노트 · 온셋에서 생성, `generator/effects.py`)로 트랙 기울기(카메라 roll), 줌 펄스와 유지되는 줌(`view`, 둘 다 FOV)만 바꾼다(`render/cameraFx.ts`). 노트 시간·판정선·레인 순서는 바뀌지 않는다. |
| BGA · 스킨 | BGA는 사용자가 곡마다 올리는 mp4·webm이나 유튜브 링크(소리 없이 곡 시간에 맞춰 재생). 유튜브는 내려받지 않고 유튜브의 공식 퍼가기 플레이어(IFrame Player API, 개인정보 보호 모드 youtube-nocookie.com)로 재생한다(유튜브 약관상 내려받기는 쓰지 않는다). 기본 4종 스킨은 색·모양 파라미터로만 만들고, 글래스·크리스털·메탈·젤 스킨은 이 저장소를 위해 생성한 그림(`assets-src/`, 출처 `assets-src/PROVENANCE.md`)을 텍스처로 쓴다. 사용자 스킨은 JSON이다. 다른 게임의 에셋은 쓰지 않는다. |
| 채보 에디터 | 노트만 편집한다(템포·박자·키음 목록은 원래 채보를 따른다). 같은 레인에서 노트가 겹치는 편집은 거부한다. 저장하면 원본은 두고 새 채보(`edited`)로 남기며, 생성 채보용 플레이어빌리티 린터 대신 구조 검사만 한다(사람이 일부러 만든 어려운 배치를 막지 않기 위해). |
| 가져오기 | osu!mania는 들어 있는 음원을 그대로 곡으로 쓴다. BMS·bmson은 키음을 섞은 음원을 만들어 곡으로 등록한다(분석·자동 생성도 되게). BMS #RANDOM은 파일 내용에서 정한 하나의 분기로 고정하고, DP·PMS·osu! SV는 지원하지 않는다. 키음은 플레이할 때 BGM만 깔고 노트를 칠 때 낸다. |
| 내보내기 | 음원은 넣지 않고 파일 이름만 적는다. BMS·bmson은 5K · 7K+1S만(BMS 플레이어에 다른 배치가 없음), osu!mania는 모든 모드. |
| 리플레이 | 키 입력 기록이 아니라 **판정 엔진에 들어간 호출 순서**(누름·뗌·변화가 있었던 프레임 갱신·FEVER)를 저장한다. 같은 순서로 다시 넣으면 프레임 속도와 무관하게 결과가 정확히 같다. |
| 게임패드 | 웹 게임패드 API는 이벤트가 없어 폴링해야 한다. 화면 프레임과 따로 짧은 간격으로 읽고, 판정 시각은 `Gamepad.timestamp`(브라우저가 패드 신호를 받은 시각)를 쓴다. 턴테이블은 멈춘 뒤 가장 멀리 간 곳보다 더 간 양이 8비트 축 한 칸 × 감도(`turntableSteps`, 1–4)가 되면 스크래치를 누르고, 반대로 그만큼(적어도 두 칸) 돌아오면 새로 누르고, 더 가지 않은 채 `turntableReleaseMs`가 지나면 뗀다(한 칸 앞뒤 떨림은 움직임이 아니다). 표준 배치가 아닌 패드(전용 컨트롤러)는 메뉴 키를 붙이지 않고 지정한 메뉴 버튼(`padMenu`, 없으면 레인에서 정함)만 보낸다. |
| 데스크톱 | Electron + PyInstaller로 묶은 서버. Tauri는 macOS·Linux에서 WebKit을 쓰는데, 싱크의 기준인 `getOutputTimestamp()`·`outputLatency`가 Chromium과 다르게 동작할 수 있어(품질 우선순위 1번) 테스트한 엔진과 같은 Chromium을 싣는 쪽을 골랐다. 대신 용량이 크다(압축 전 약 570MB). 게임 설정은 페이지의 localStorage에 있어 출처(포트)가 바뀌면 사라지므로, 첫 실행의 포트를 계속 쓴다(아래 8절의 `desktop/`). |

## 3. 전체 구조

```
┌──────────── 브라우저 클라이언트 (TypeScript) ────────────┐        ┌────────── 로컬 Python 서버 (FastAPI) ───────────┐
│ ui/       곡 선택 · 설정 · 결과 · HUD · 배경(BGA)        │  HTTP  │ api/        라우트, 라이브러리(SQLite+파일)     │
│ editor/   채보 에디터 (편집 규칙 · 캔버스)               │◀──────▶│ audio_io    디코딩 → 표준 FLAC, 태그·커버       │
│ render/   Three.js SDVX식 트랙 · 카메라 연출 · 스킨      │        │ analysis/   기본 분석 · 스템 분리 · 악기 태깅   │
│ engine/   판정 · 점수 · 게이지 · 오토 플레이 · 리플레이  │        │   backends/ ML 어댑터 (Demucs · beat_this 등)   │
│ input/    키보드·게임패드 → 레인, 타임스탬프 변환        │        │ generator/  채보 생성 · 린터 · 연출 신호        │
│ audio/    표준 오디오 재생, 오디오 클럭, 키음            │        │ difficulty/ 레벨 산정                           │
│ settings/ 설정 · 키·패드 배치 (localStorage)             │        │ formats/    osu!·BMS·bmson 가져오기/내보내기    │
└──────────────────────────────────────────────────────────┘        └─────────────────────────────────────────────────┘
              config/ (판정 · 키 모드 · 게이지 · 카메라 · 난이도 · 분석 · 악기 · 입력) 공용
              desktop/ Electron 창 + PyInstaller로 묶은 서버 (선택)
```

- 업로드 → 서버가 표준 FLAC 생성 → 분석(백그라운드 작업, 진행률) → `AnalysisResult` 캐시.
- 채보 요청(키 모드, 난이도, 시드) → 생성기 ⇄ 난이도 산정 루프 → `Chart` JSON 캐시 → 클라이언트. 선곡은 커서가 300ms 머문 곡의 고른 난이도는 채보 전체를, 다른 난이도는 `brief`(메타만, 디스크에 저장하지 않음)로 받아 모든 레벨을 바로 보인다. 같은 요청은 한 번만 하고, 요약 4000개와 채보 8개를 화면을 오가도 기억한다(`ui/chartCache.ts`).
- 클라이언트는 표준 FLAC을 받아 `decodeAudioData`로 디코딩해 재생한다. 채보의 `t`는 이 PCM의 첫 샘플이 0ms다.

## 4. 시간 모델

리듬게임에서 가장 중요한 부분이라 규칙을 명시한다.

- **곡 시간(song time)**: 표준 오디오의 재생 위치(ms). 스피커에서 *지금 들리는* 샘플 기준이다.
- **오디오 클럭이 유일한 기준**이다. `AudioContext.getOutputTimestamp()`가 주는 `(contextTime, performanceTime)` 쌍으로 `performance.now()` 시간축을 오디오 출력 시간으로 매핑한다. 쌍이 갱신될 때마다 오프셋을 지수 평균으로 다듬어 지터를 없애고, 50ms 이상 튀면(일시정지·장치 변경) 즉시 다시 맞춘다. API를 못 쓰면 `currentTime - outputLatency`로 대체한다.
- **판정 시간** = 입력 이벤트의 `event.timeStamp`를 곡 시간으로 바꾼 값 − (판정 오프셋 + 곡 오프셋). 렌더링 프레임과 무관하다. 키 입력은 이벤트 핸들러에서 즉시 판정한다.
- **표시 시간** = 지금(`performance.now()`)의 곡 시간 + (표시 오프셋 − 곡 오프셋). 노트 위치는 이 값으로 그린다.
- 오프셋 부호: 판정 오프셋 +20ms = "평균 20ms 늦게 치는 사람을 위한 보정", 표시 오프셋 +10ms = "노트를 10ms 앞당겨 그림". **곡 오프셋**(`settings.songOffsets`, 곡 ID마다 ±200ms)은 그 곡의 판정과 노트를 함께 같은 쪽으로 옮기고 채보·ID·기록은 그대로 둔다. 곡 시간이라 다른 재생 속도의 연습에서도 같은 ms만큼 옮긴다(실제 ms인 판정·표시 오프셋은 속도만큼 늘어난다). 플레이 중 오프셋을 바꾸면(− / =, 싱크 테스트의 키) 트랙·HUD를 다시 배치하지 않고 그에 딸린 값(첫 노트가 보이는 시각, 입력 오프셋)만 다시 계산하며, 판정 오프셋·곡 오프셋의 변화는 몇 번째 판정 뒤에 얼마인지(`PlayOutcome.offsets.shifts`)로 남겨 결과의 오프셋 추천이 그 전 판정을 바뀐 만큼 빼고 계산한다.
- **늦은 미스 판정**은 프레임 갱신에서 하되, 아직 처리되지 않은 입력 이벤트가 있을 수 있으므로 `missMarginMs`(50ms)만큼 늦게 확정한다. 입력이 들어오면 그 레인의 지난 노트를 먼저 정리한 뒤 판정한다.
- **리드인**: 첫 노트가 2초보다 빠르면 오디오 시작 전에 대기 시간을 넣는다. 이 동안 곡 시간은 음수다. 연습은 시작과 반복마다 첫 노트 3초 전과 그 노트가 SUDDEN+ 아래로 보이기 1초 전 중 이른 때부터 시작하고(`ui/practiceLead.ts`, 음악이 없으면 무음), 다른 재생 속도면 가장 느린 SPEED의 리드인만큼 앞 음원을 스트레치해 둔다. 첫 노트가 5초 넘게 남으면 Enter(또는 패드 FEVER 버튼)로 READY가 시작하는 곳(첫 노트 2.5초 전 이내)까지 건너뛴다. 첫 노트 전에는 판정할 것이 없어 결과가 같다.
- **창을 벗어나면 일시정지**(`pauseOnBlur`, 기본 켬): 내 플레이(오토·리플레이 아님)는 창이 포커스를 잃거나 가려지면 일시정지하고, 그런 상태에서 시작한(다시 한) 플레이는 일시정지로 시작한다.
- **STOP**(가져온 BMS·bmson): 박 시계가 멈추는 구간. 노트의 `t`는 STOP을 포함한 값이라 판정에는 영향이 없고, BPM 연동 스크롤에서만 그동안 노트가 멈춘다. 서버·클라이언트의 TempoMap이 같은 규칙(STOP 박에 있는 노트는 STOP이 시작할 때)을 쓴다.
- **게임패드 입력 시각**: 키보드의 `event.timeStamp` 대신 `Gamepad.timestamp`(브라우저가 패드 보고를 받은 시각, `performance.now()`와 같은 시간축)를 같은 변환에 넣는다. 값이 없거나 100ms보다 오래됐으면 읽은 시각을 쓴다.
- **가져온 키음**: BGM 채널을 렌더한 버퍼가 곡 시계의 기준이다(일반 곡의 `audio.flac` 자리). 노트 소리는 누른 순간(그 시각은 이미 지났으므로 곧바로), 오토 플레이는 `contextTimeForSong(t)`에 미리 예약해 노트 시각에 정확히 낸다. 노트 소리의 크기는 서버가 정한 게인(전체 믹스가 클리핑 없게)의 1.2배다(키음 버스, `AudioEngine.setKeysoundGain`).
- **생성 채보 키음**: 노트의 10% 이상이 따르는 스템이 키음 스템이 된다. 키음 스템마다 믹스와 길이가 같은 스템 버퍼를 믹스와 같은 `start(when)`에 위상을 뒤집어(게인 −1) 키음 구간에서만 더하므로, 반주 버퍼를 따로 만들지 않아도 배경 = 믹스 − 키음 스템이 된다. 노트를 치면 그 노트의 조각(같은 스템 버퍼의 [노트, 다음 노트) 구간, 30ms 안의 동치는 한 조각)을 곧바로 내고, 오토 플레이는 `contextTimeForSong(t)`에 예약한다. 조각은 3ms 일찍 시작해 앞 조각이나 배경과 크로스페이드하므로 제때 다 맞히면 원곡이 샘플 단위로 복원된다(OfflineAudioContext E2E에서 오차 < 1e-4). 플레이에서는 키음 버스가 조각을 1.2배(`KEYSOUND_BOOST`)로 내므로, 다 맞히면 키음 스템만 원곡보다 20% 큰 곡이 된다(크로스페이드 동안 1배에서 1.2배로 이어진다). 같은 스템의 새 조각은 이전 조각을 끊는다. 연습 모드는 믹스와 스템을 함께 스트레치한다. 곡 시간·판정은 믹스 소스 기준이다. 스템은 분석이 끝나면 서버가 백그라운드로 분리해 두므로(곡마다 약 100MB) 보통 플레이 전에 준비돼 있다.
- **출력 리미터**: 음악(키음 포함)과 타격음은 스피커로 가기 전에 소프트 리미터(`softLimiter`: WaveShaper, oversample none)를 지난다. 0.9까지는 그대로 두고, 그 위는 tanh 어깨로 눌러 1을 넘지 않는다(1 → 0.976, 1.2 → 0.9995). 샘플마다 곡선을 지날 뿐이라 지연이 없어 곡 시계·판정에 영향이 없다(DynamicsCompressor는 미리 보는 만큼 음악이 곡 시계보다 늦게 나서 쓰지 않는다). 음악 볼륨 기본 90%에서는 꽉 차게 녹음된 원곡도 0.9를 넘지 않아 손대지 않고, 1.2배 키음이 그런 곡 위에 겹친 순간만 누른다.

## 5. 판정 모델 (DJMAX RESPECT V 기준)

- 판정 구간(±ms, NORMAL): MAX 100% 41.67 / 90% 60 / 80% 78 / 70~20% 보간 / 10% 160 / 1% 180. HARD는 ×1/2, MAX JUDGEMENT는 ×1/4.
- 입력 처리(레인별): 그 레인에서 아직 판정되지 않은 가장 이른 노트를 대상으로 한다.
  - |오차| ≤ 1% 구간 → 해당 등급.
  - 1% 구간보다 이르고 간접 미스 구간(1% + 40ms × 배율) 이내 → 노트를 소모하며 BREAK.
  - 그보다 이르면 무시(빈 입력).
- 롱노트: 시작은 타이밍 판정 → 누르는 동안 1/4박마다 콤보 틱 → 끝까지 누르고 있으면 끝 판정 MAX 100% → 끝 100ms 이전에 떼면 끝 판정 BREAK. 시작이 BREAK면 끝도 BREAK.
- 콤보: 판정 대상(일반 노트, 롱노트 시작, 롱노트 끝)과 틱마다 +1. BREAK에서만 0(EX-SCORE 룰셋은 BAD에서도 0).
- 정확도(Rate) = 판정 %의 평균. 점수 = Rate × 10,000 (1,000,000점 만점).
- 사이드 트랙(FX 레인)의 노트를 놓치면 BREAK가 아니라 MAX 1%다(콤보 유지, 게이지 변화 없음, DJMAX PC 규칙). `judgement.json`의 `sideMissPercent`.
- 게이지(`config/gauge.json`): 판정 %에 비례해 회복하고 MAX 1%는 변화 없음.
  - 회복형(ASSIST EASY · EASY · NORMAL): 20%에서 시작, 총 회복량 TOTAL = 160 + 0.16 × 판정 수(최대 320), BREAK −2.5 / −4 / −5%. 끝날 때 클리어 선(60 / 80 / 80%) 이상이면 클리어.
  - 생존형(HARD · EX-HARD · HAZARD): 100%에서 시작, 판정마다 고정 회복, BREAK −9 / −18 / −100%(HARD는 30% 미만에서 피해 절반). 0%가 되는 순간 실패하고 곡이 멈춘다(음악 페이드아웃 → FAILED). 끝까지 버티면 클리어.
- 클리어 램프(낮은 것부터): FAILED < ASSIST CLEAR < EASY CLEAR < CLEAR < HARD CLEAR < EX-HARD CLEAR < MAX COMBO(콤보 끊김 없음) < PERFECT PLAY(전부 MAX 100%). 서버도 같은 순서(`gauge.json`의 `lampOrder`)로 최고 램프를 고른다.
- 점수 규칙(`config/rulesets.json`)은 DJMAX 판정 %를 표기·점수로 바꾸는 층이다.
  - 정밀 %(RESPECT): MAX 100% ~ 1% / BREAK, 점수 = Rate × 10,000.
  - 등급형(GRADE, EZ2ON 참고): PERFECT ≥100% · GREAT ≥70% · GOOD ≥10% · BAD ≥1% / MISS, 가중치 1 / 0.75 / 0.4 / 0.1로 1,000,000점 환산.
  - EX-SCORE(BMS 참고): PERFECT 2점 · GREAT 1점 · GOOD · BAD 0점 / POOR, BAD와 POOR에서 콤보가 끊긴다. 등급 AAA(8/9) ~ F.
  - 기본 점수(정밀 % 점수)는 점수 규칙과 무관하게 항상 같이 저장하고, 등급형의 가중 점수와 EX-SCORE는 기록의 `detail`에 남긴다. 결과 화면은 점수 규칙의 대표 숫자로 같은 판정 모드의 최고(서버의 `byMode`)와 비교하고, 램프 갱신은 선곡에 보이는 채보 전체의 램프와 비교한다. 최소 BREAK는 끝까지 친 판만 센다(게이지로 중간에 끝난 판은 `detail.failedAtMs`).
  - 페이스메이커는 화면의 점수와 같은 단위(기본 점수 · 가중 점수 · 목표 비율의 EX-SCORE)로 비교한다. 내 최고 기록은 그 판의 리플레이를 지금 채보 배치와 그 판의 판정 설정으로 다시 판정해(`engine/replay.replayScores`) 판정마다 따라가고, 리플레이가 없으면 정밀 %에서만 기본 점수의 직선을 쓴다.
- FEVER(`config/fever.json`): 판정 %만큼 FEVER 게이지가 차고(46노트 MAX 100%면 가득), 가득 차면 자동(또는 수동: FEVER 키, 기본 Enter)으로 14.5초간 발동. BREAK 없이 이어 가면 다음 배율이 x2 → x5까지 오르고, 발동 중 BREAK가 나면 끝나며 배율이 x2로 돌아간다. 보너스는 기본 점수와 따로 표시한다.
- 연습 모드: 재생 속도 r(0.5~1.5)에서 곡 시간은 실제 시간의 r배로 흐른다. 판정 구간·롱노트 유예·미스 여유를 곡 시간으로 ×r 해서 **실제 시간 기준 판정 폭이 그대로** 유지되고, 결과의 오차(ms)도 실제 시간으로 되돌려 보여 준다. 게이지는 실패 없는 NORMAL, 기록은 저장하지 않는다. 에디터의 커서부터 테스트는 재생 속도 ×1·반복 없는 연습으로, 배치 없이 기본 게이지·FEVER로 돈다(`ui/playRules.playedSettings`, 화면 이름 "에디터 테스트").

## 6. 렌더링 모델 (SDVX식 3D 트랙)

- 좌표계: 트랙은 y=0 평면, 판정선은 z=0(LIFT가 있으면 z = −LIFT × trackLength), 트랙은 −z 방향으로 `trackLength`(40)만큼 뻗는다. 트랙 폭 `trackWidth`(8)를 레인 폭 비율로 나눈다(스크래치 1.6배, 사이드 트랙 0.75배). 사이드 노트를 반쪽 덮기로 그리면(`render/layout.computeTrackGeometry`의 `sideNotes: 'half'`) 사이드 레인은 폭을 차지하지 않아 건반 레인이 트랙 전체를 사이드 없는 모드(4K·6K)처럼 나누고, FXL·FXR(`sideL`·`sideR` 색으로 정함, 모드의 레인 순서와 무관)은 건반 레인의 왼쪽·오른쪽 절반을 덮는다. 레인 번호·키·판정은 그대로다.
- 카메라: `(0, height, distance)`에서 `(0, 0, −lookAhead)`를 바라보는 원근 카메라. 프리셋 FLAT / SDVX / LOW와 아래의 PLANE(`config/camera.json`, 기본 SDVX). 원근은 그대로 두고 화면만 위아래로 옮겨(뷰 오프셋) LIFT 없는 판정선을 화면 높이의 `judgeLineY`(77%)에 둔다. 그 아래는 기어 하단이다. 카메라의 near 평면은 거리에 따라(거리의 1/4) 두어 얇은 트랙 층의 깊이 순서를 지키고, far 평면은 트랙 끝을 덮는다. FLAT은 트랙 끝이 화면 위 약 4.6% 안쪽에 오게 맞췄다. PLANE(평면)은 같은 자리에서 평행 광선으로 보는 직교 카메라(`projection: "orthographic"`, `render/TrackRenderer.PlaneCamera`)라 레일이 화면에서 평행하고 노트가 화면 위에서 아래까지 같은 빠르기로 내려온다. 시야각 대신 `fov`의 원근 카메라가 lookAhead 지점에서 담는 높이만큼 화면에 담아, 같은 뷰 오프셋의 판정선 맞추기·줌·미리보기 맞춤이 원근 카메라와 같은 식으로 돈다. 판정선과 트랙 끝(화면 위 약 4.4%)의 높이가 정해져 있어 내려다보는 각도(약 15.2°)가 트랙 폭을 정한다(1280x720에서 판정선 폭 약 398px). 깊이 범위는 트랙과 그 위에 선 것만 덮어 고른 깊이 단계로도 층이 섞이지 않는다. 트랙이 화면에서 납작해지는 만큼 기어의 표시등 줄을 깊게 잡아(`keyRow`) 둥근 표시등이 원근 카메라에서처럼 둥글고 같은 크기다.
- **기어 하단**(`render/deckArt.ts`): 판정선 아래부터 화면 아래 끝까지 덮는 판 하나에 스킨의 `style.deck` 그림(스킨 색으로 칠한 패널)을 화면에 보이는 깊이에 맞춰 캔버스로 그리고(카메라·창 크기·LIFT가 바뀔 때만 다시 그림), 그 위 레인마다 표시등 사각형을 놓아 키가 눌린 동안 켠다(레인 색으로 칠하는 틴트 그림). 둥근 표시등은 카메라가 납작하게 보이는 만큼 트랙 방향으로 늘려 그려 화면에서 둥글게 보인다. 예전 스킨 JSON의 `style.cap`은 같은 스킨의 기어 하단으로 읽는다. 판 위쪽 가장자리는 1.5px의 어두운 선이고(모노는 판정선에 빛이 없어 그 선도 없다, 판정선 바로 아래에 밝은 선이 없다), 표시등이 네온의 육각형보다 큰 스킨(아케이드 버튼·팝 젤리·보석과 그 띠·클럽 노브 등)은 크기를 그대로 두고 그 줄을 더 아래에 놓아 어느 레인에서도 표시등이 네온의 육각형보다 판정선에 가깝지 않다(`deckArt.rowDrop`). 기본 스킨의 꺼진 표시등은 레인을 따라 내려가는 어두운 짧은 눈금이다. 반쪽 덮기의 사이드 레인은 표시등 줄에 자리가 없고, 줄 아래에 그 절반 폭의 막대(`deckRows`: `SIDE_ROW` 깊이, `SIDE_GAP` 간격, 트랙이 납작한 카메라에서는 줄처럼 깊게)로 켜진다. 켜지면 스킨마다 그 기어의 모양(`SIDE_PAINT`: LED 띠·악기색 고리·아케이드 긴 버튼·믹서 레벨 미터·스트리트 셰브런·네온관·크리스털 프리즘·캔디 젤리·보석 바게트·모노 윤곽선)이고, 꺼져 있으면 판정선 바로 아래의 사이드 노트로 읽히지 않게 양 끝만 보이거나 회색 버튼이다. 판의 아래쪽 그림은 막대 아래부터 그린다(`lowerTop`). 어느 스킨에서나 고르는 기어 4종도 같은 규칙을 따른다: 콘크리트 슬래브(레인마다 판에 파인 홈과 그 벽, 표시등은 홈 바닥), 에이비오닉스(스위치 우물과 캡, 쉴 때는 `idleColor` 호박색 눈금, 아래 판의 호박색 모서리 괄호), 카세트 데크(키 슬롯과 홈 파인 키, 누르면 키가 내려가고 슬롯에 빛, 아래에 릴 두 개가 보이는 카세트 창), 그랜드 피아노(건반, 쉴 때는 레인 색을 검게 섞은 흰·검은 건반, 아래에 펠트 띠와 금색 선). 이들의 표시등(홈·캡·키·건반)도 네온의 육각형보다 판정선에 가깝지 않고(`rowDrop`), 판정선 바로 아래에 밝은 선을 두지 않는다(카세트의 크롬 띠·에이비오닉스의 줄무늬 띠는 표시등 줄 아래).
- **판정선**: 기본 스킨은 모두 네온과 같은 판정선이다. 노트 그림이 놓이는 높이(바로 위)에 두께 6px 선과 그 위로 은은한 빛(`judgeGlow`, 스트리트는 노랑·아케이드는 주황, 모노는 빛 없음)을 그리고 두 번째 선은 없다. 그래서 판정 순간 탭 노트의 가운데가 판정선 가운데에 오고(모든 카메라), 판정선은 화면 높이의 `judgeLineY`(77%)에 있다. 판정선은 노트·커버 위, 타격 이펙트 아래에 그린다. 기어 하단은 판정선 가운데에서 6px 아래부터 시작한다(사용자 스킨의 굵은 선은 선 아래 3px, `under` 선은 그 아래 3px). 사용자 스킨의 `under`/`over` 선은 판정선에 붙여 그린다. 판정선을 지나간 노트는 기어 하단이 시작하는 곳에서 잘려 판에 가려진다.
- 노트 위치(`engine/scroll.ts`): `z = 판정선 z − 거리`. 모든 노트는 한 기준점을 쓴다(`render/layout.noteSpan`): 탭은 제 시각에 가운데가 오고, 롱노트는 시작 시각 탭의 가까운 끝부터 끝 시각 탭의 먼 끝까지라 어느 SPEED·노트 깊이에서도 같은 시각의 탭과 롱노트 머리가 한 줄로 맞는다. 시간 고정 스크롤은 `거리 = (노트 시간 − 표시 시간) × trackLength / 가시 시간`, BPM 연동 스크롤은 박 차이 × 주 BPM의 박 길이로 거리를 잡아 빠른 구간에서 노트도 빨라진다(주 BPM 구간에서는 두 방식이 같다). 배속은 월드 좌표의 속도로 정의되므로 원근과 무관하게 일정하다.
- 레인 커버: SUDDEN+(먼 쪽) · HIDDEN+(판정선 쪽)는 노트·롱노트·마디선 재질에 공유 클리핑 평면 두 개를 걸어 정확히 잘라내고, 그 위에 커버 판과 경계선을 그린다. LIFT는 판정선·키 빔·이펙트를 위로 옮기고 판정선 아래를 덮는다. 플레이 중 단축키로 바꾸면 클리핑 평면 상수만 움직인다(재컴파일 없음). "녹색 숫자 유지"를 켜면 커버·LIFT를 움직일 때 배속을 다시 계산해 녹색 숫자를 유지한다.
- FEVER 중에는 트랙에 배율별 색(x2 하늘 · x3 초록 · x4 노랑 · x5 분홍)을 일정하게 더하고(박과 무관한 깜빡임 없음, 끝나기 전 1/5 동안 흐려짐) 레일·판정선 빛을 같은 색으로 바꾼다(FEVER가 시작하고 끝날 때만 다시 칠함). "번쩍임 줄이기"는 맥동·타격 이펙트·키 빔을 약하게 한다. 색각 보정 팔레트(Okabe–Ito)는 레인·판정 색을 함께 바꾼다.
- 바닥만 트랙 길이의 `fogStart`(기본 0.55, PLANE 0.835)부터 끝까지 안개로 흐려지고, 노트·롱노트는 안개 없이 트랙 끝에서 잘려 보이는 시간 내내 또렷하다(트랙 끝 너머로 이어지는 롱노트는 끝 테두리 없이 열린 채 잘린다). 레인 구분선·마디선으로 원근 속에서도 박을 읽기 쉽게 한다.
- 마디선은 마디마다 트랙을 가로지르는 선이다(설정 "마디선", 기본 켬). 트랙 위 두께가 일정하면 멀리서는 사라지므로, 매 프레임 카메라 투영으로 두께를 다시 잡아 판정선부터 트랙 끝까지 화면에서 약 2.5px로 보이게 한다(`render/TrackRenderer.barLineDepth`). 색은 스킨의 `bar`, 불투명도 0.7이고 노트·롱노트 아래에 그린다.
- 롱노트는 몸통만 그린다. 가까운 끝이 누를 시각 탭의 가까운 끝, 먼 끝이 뗄 시각 탭의 먼 끝이고, 누르는 동안은 몸통이 판정선에서 시작한다. 양 끝에 노트 모양을 붙이면 단노트로 읽혀 붙이지 않는다. 끝은 몸통 자신의 끝 모양으로 닫는다(`LONG_PAINT`의 `end`): 기본은 밝은 테두리, 레일(메카 챔퍼 계열)은 45°로 깎은 모서리와 밝은 테, 캡슐(원형 계열)은 반원, 별빛(별 계열)은 한 갈래 별처럼 뾰족한 끝. 몸통은 탭 노트와 같은 레인 폭의 90%이고, 탭보다 조금 어둡고 차분하다.
- 노트·롱노트 몸통·마디선은 오브젝트 풀에서 꺼내 쓰고, 화면에 보이는 구간만 갱신한다.
- **반쪽 덮기의 사이드 노트**: 그 절반의 96% 폭 막대를 건반 롱노트·탭보다 먼저(`renderOrder` 2.2–2.3, 마디선 위) 반투명으로, 깊이를 쓰지 않고 그려 위에 오는 건반 노트가 늘 보인다. 탭은 제 시각에 가운데가 오고 같은 시각 건반 탭의 앞뒤 끝보다 0.18만큼 길어 그 절반을 다 덮는 화음 아래에서도 밝은 앞뒤 가장자리가 보이고, 롱노트는 그런 탭의 가까운 끝부터 먼 끝까지 머리·끝의 밝은 띠와 흐린 몸통이다(누르는 동안 밝게, 놓치면 회색). 색은 스킨의 사이드 레인 색(`sideL`·`sideR`, 색각 보정 팔레트 포함)이고 악기색(STEM)도 악기 색이 아니라 이 색이다. 사용자 스킨의 `side`·`longBody` 텍스처와 노트 모양은 쓰지 않는다. 사이드 노트 모양(`style.side`)이 `dots`면 탭·몸통·끝을 LED 점으로 그린다(`sideDotsTap`·`sideDotsBody`·`sideDotsEnd`: 건반 한 레인에 점 5개, 앞뒤 가장자리 줄은 밝게, 몸통 그림은 반쪽 폭만큼 깊어 점이 따라 흐른다). 별도 레인의 사이드 노트도 `dots`면 점 세 줄의 탭(가운데 줄이 그 시각)과 네 줄마다 밝은 몸통(`DOTS_LONG`)이다. SUDDEN+·HIDDEN+·LIFT·기어 판이 노트처럼 자른다. 타격은 그 절반 폭의 띠와 조금 올라오는 빛(건반 효과 아래, 누르는 동안은 낮고 일정), 키 빔은 그 절반을 건반 빔의 1/4 밝기로 덮는다.
- **타격 효과**: flash·stemflash는 트랙을 따라 올라가는 선 없이 기어 쪽 선만 남기고, hex·bomb·star는 판정선 위로 한 레인 안팎에서 더 빨리 사라진다. wave(퍼지는 고리)·spark(기어 쪽으로 튀는 불꽃)·grid(판정선에 가까운 줄부터 꺼지는 LED 칸)·shutter(양쪽에서 닫혀 만나면 흰 섬광, 그다음 아래로 떨어지는 날)는 플립북 칸에서 판정선이 맨 위에 있어 판정선 아래에만 그려진다. 모든 타격·롱노트 효과는 레일에서 잘린다. 설정 `hitEffectSize`(보통 / 작게 / 끄기)의 작게는 약 1.2레인 폭 이내(반쪽 덮기의 사이드 타격은 폭은 절반 그대로 낮게만), 끄기는 그리지 않는다.
- **HUD**(`ui/Hud.ts`): 판정·콤보 텍스트는 트랙 위 3D 지점을 화면 좌표로 투영해 DOM HUD로 그린다(`judgementOpacity` 1 / 0.7 / 0.4로 비치게, 판정이 커졌다 줄어드는 연출은 1.1배에서 시작). 기어 왼쪽 SPEED 위의 점수판(SCORE · 페이스메이커 · RATE · MAX COMBO, `judgeCounter`면 그 점수 규칙의 놓친 수와 FAST·SLOW 수)은 줄마다 그 자리의 화면에서 크기와 트랙 방향 늘임을 정해(`uprightAt`, 세로 성분만 재고 4배까지) 맨 위 줄도 라벨 12px 이상으로 읽히고, 모자라면 라벨을 숫자 위로 쌓고, 그래도 모자라면(높은 LIFT) 트랙을 떠나 화면 왼쪽 아래에 똑바로 선다. 기어 왼쪽의 얇은 진행 바(500단계)와 마지막 노트까지 남은 시간, 템포가 바뀌는 곡이나 BPM 연동 스크롤이면 SPEED 아래 들리는 BPM(`TempoMap.bpmChanges`), 게이지는 숫자·칸 모두 내림(`gaugeShown`, `gaugeCells`, 클리어 선 위 칸은 MAX 색). 왼쪽 위 곡 아래 줄에 AUTO · REPLAY · 연습 · 에디터 테스트와 NORMAL이 아닌 판정, 로딩 카드에 기본값이 아닌 규칙 칩. 플레이 중 바꾼 값은 판정선 아래 기어 위에 한 번만 토스트("SPEED 4.10", `ui/format.ts`의 `speedText`·`coverText`). READY는 첫 노트가 SUDDEN+ 아래로 보이기 1.5초 전부터(`ScrollModel.timeAt`), 다시 하기(F2·R)와 연습 반복마다 HUD를 처음 상태로(`Hud.reset`). 값은 바뀔 때만 DOM에 쓴다.
- 카메라 연출이 켜져 있으면 판정·콤보 글자를 매 프레임 현재 카메라(기울기·줌)로 다시 투영하고, 트랙이 기운 만큼 글자도 같이 돌린다. 왼쪽 위 곡 정보 판은 기어 왼쪽 가장자리 앞에서 끝난다(`Hud.fit`, 시작·창 크기·플레이 중 설정이 바뀔 때만): 채보의 카메라 연출이 트랙을 그쪽으로 가장 많이 기울이고 당기는 자세(`CameraFx.peak`)로 잰 자리라 연출 중에도 트랙을 가리지 않고(트랙 끝이 판정선만큼 넓은 PLANE의 4:3 화면 등), 그 자리가 난이도 칩보다 좁으면 판 전체를 줄인다.
- **카메라 연출**(`render/cameraFx.ts`): 채보의 tilt는 이전 기울기에서 새 값으로 smoothstep으로 옮겨 가 유지하고, zoom은 (1 − 진행률)²로 감쇠하는 펄스다. 매 프레임 기본 카메라 자세(쿼터니언·FOV)에 roll(최대 7°)과 FOV 축소(최대 7%)를 얹고, `frameCamera`가 바뀔 때마다 다시 맞춰 (들어 올린) 판정선 가운데가 제자리에 있고 기울기가 그 점을 중심으로 돈다(연출 없는 맞춤은 카메라·화면·LIFT가 바뀔 때까지 기억해 한 프레임에 투영 갱신 한 번). 판정 시각은 이와 무관하다. 직교 카메라(PLANE)는 눈이 없으므로 판정선 가운데를 지나는 시선 방향 축으로 카메라를 돌린다. 세기는 설정값(0–1, "번쩍임 줄이기"면 절반)을 곱한다. 수치는 `config/camera.json`의 `fx`.
- **스킨**(`render/skins.ts`): 노트 모양(상자·납작·캡슐), 레인 색 배치(키 모드 색·단색·무지개), 타격 이펙트(폭발·링·없음)와 트랙·레일·구분선·마디선·판정선·커버·안개 색. 코드로 그린 10종(기본·악기색·아케이드·클럽·스트리트·네온·크리스털·팝·보석·모노) + JSON 사용자 스킨(알 수 없는 값은 버리고 색은 `#rrggbb`만 받는다). 색각 보정 팔레트를 켜면 레인 색은 팔레트가 우선한다(노트 색이 기본일 때).
- **노트 모양**(`render/tintArt.ts`의 `NOTE_PAINT`): 기본·악기색 막대와 네 계열(메카 챔퍼 `chamfer`·원형 `round`·별 4각 `star4`·별 5각 `star5`), 계열마다 롱노트(`LONG_OF`: 레일·캡슐·별빛; 스킨에는 롱노트가 따로 없고 늘 노트의 계열). 노트 그림은 레인 종류(`NoteMark`: 흰·파란·금색 건반, 스크래치, 사이드)마다 따로 그려 메카 챔퍼·원형에는 표식(○△◇//)을, 별에는 파란·금색 건반에 꼭짓점을 더한다. 막대·판은 늘 같은 깊이(0.7)이고, 원형과 별은 판정선에서 제 모양(원형은 원)으로 보이도록 깊이를 카메라가 판정선에서 트랙을 누르는 비율에 맞춘다(`noteDepthOf`, 막대의 3배까지, 카메라·화면이 바뀌면 0.05 단위로 다시 맞추고 그림을 새로 그림, `TrackRenderer.fitNoteDepth`). 레인이 넓은 스크래치와 좁은 사이드 레인에서는 네 계열이 같은 비율을 지키도록 레인 폭만큼 깊거나 얕다(`laneDepthOf`, 기본·악기색 막대는 그대로). 예전 스킨 JSON의 노트 이름(gloss·thin·outline·chip·gem·pill·jewel 등)은 그 자리를 넘겨받은 계열로 읽고, 롱노트 이름은 읽지 않는다.
- **부위별 선택**(`render/skins.ts`의 `SkinParts`·`withParts`, 설정 `parts`): 노트·사이드 노트 모양·기어·타격 효과 모양을 스킨과 따로 고른다. 노트·기어·효과의 기본은 `skin`이고, 사이드 노트는 `bar`(노트와 같게)·`dots` 중 하나다(스킨마다 다른 사이드 모양이 없어 "스킨" 선택지는 없다; 예전에 저장한 `skin`은 `bar`로 읽는다). 롱노트는 고르지 않고 늘 노트의 계열이다. 모두 스킨의 것이면 스킨 그대로다. 플레이·설정 미리보기·표시 오프셋 맞추기가 `settings.skinOf`로 같은 스킨을 쓴다. 플레이 캔버스의 `data-style`에 그린 노트·롱노트·사이드·기어·효과가 적힌다(테스트용, 보이지 않음).
- **노트 색**(`render/noteColors.ts`, 설정 `noteColors`·`colorPresets`): 프리셋이 키 모드마다 레인별 색(`#rrggbb`)을 가진다. `skin`(기본)은 팔레트와 스킨의 색(`laneColorsFor`)이고, 게임에 든 프리셋(`BUILTIN_PRESETS`: 오로라·앰버는 레인 역할별 색, 좌우 손은 레인을 치는 손별 색)은 바뀌지 않는다. 그 색을 바꾸면 `lanesOf`로 모든 키 모드의 색을 복사한 내 프리셋(`user-N`, "내 색 N", 20개까지)에 저장한다. `settings.laneColorsOf`가 플레이·설정 미리보기·표시 오프셋 맞추기·에디터에 같은 색을 준다. 렌더러는 색을 받아(`laneColors`) 노트·롱노트·레인 표시등·키 빔·바닥 색을 칠하고, 돌아가는 중에도 바꿀 수 있다(`setLaneColors`: 바닥과 키 빔은 바로, 색별로 캐시한 재질은 새로 만들고 옛 재질은 다음 프레임 뒤에 버려 셰이더가 다시 컴파일되지 않는다). 설정의 노트 색 탭(`ui/NoteColorsPanel.tsx`)은 색 상자·색상 막대를 끄는 동안과 HEX를 입력하는 동안 아직 저장하지 않은 색을 미리보기에만 보낸다(`GearPreview`의 `laneColors`). 색상은 HSV 정수로 따로 들고 있어 단계가 쌓여도 어긋나지 않고 회색도 색상을 잃지 않는다. 모두 초기화는 내 프리셋을 남긴다. 플레이 캔버스·미리보기의 `data-lane-colors`에 레인 색이 적힌다(테스트용, 보이지 않음).
- **스킨 텍스처**(`render/skinArt.ts`): 스킨의 `textures`가 부분(노트·사이드·스크래치·롱노트 몸통·판정선·레일·바닥·키 빔·타격 이펙트·롱노트 불꽃)마다 `client/public/media/manifest.json`의 텍스처를 고른다. 플레이 화면이 음원과 함께 미리 불러오고, 매니페스트가 없거나 파일이 없거나 깨지면(크기가 매니페스트와 다르면) 그 부분만 코드로 그린다. 텍스처는 모두 흑백이고 색은 스킨 색표로 곱한다.
  - 노트: 위에서 본 그림을 노트 모양(상자·납작·캡슐) 위로 내려 투영하고 알파가 윤곽이다. 벽은 그림 가장자리에서 30% 안쪽 줄을 쓴다. 노트 크기(높이 0.2 · 깊이 0.7)는 그리는 노트와 같다. 그림 비율대로 깊이를 줄이면 8K 노트가 화면에서 그리는 노트의 60% 높이로 얇게 보였다. 사이드 레인은 키 레인보다 좁아 사이드 그림만 2:1이다.
  - 롱노트 몸통: 실제 꼬리 위치에 고정한 UV로 텍스처가 노트와 함께 흐른다(누르는 동안에도). 몸통 메시마다 UV를 갖는다.
  - 바닥: 트랙 색(가까운 쪽 → 먼 쪽)에 타일을 곱하고, 타일 평균을 1로 되돌리는 이득(sRGB `gain`, 선형으로 ^2.2)을 정점 색에 곱한다.
  - 레일(오른쪽은 좌우 반전 복사본)·판정선·키 빔·타격 이펙트·롱노트 불꽃은 순흑 바탕 빛이라 가산 합성한다. FEVER 색 바꾸기는 그대로다.
  - 타격 이펙트(`hitEffect: 'sprite'`)는 4×4 플립북을 스프라이트 풀에서 칸을 바꿔 한 번 재생하고 마지막 30%를 흐린다. 시트 복사본은 이미지를 공유하고 UV만 다르다. 롱노트 불꽃은 레인마다 다른 칸에서 반복하고 아래쪽이 판정선에 닿는다. "번쩍임 줄이기"는 밝기·크기를 매니페스트의 `effects` 비율로 줄인다.
  - 텍스처는 밉맵 한 단계만 읽는다(`LinearMipmapNearestFilter`). SwiftShader에서 3선형보다 읽기가 절반이라 8K 프레임 시간이 18.8–20.4 → 17.6–18.2ms로 줄었다(아래 "그 뒤").
- **배경**(`ui/PlayBackground.ts`): 트랙 캔버스 뒤 DOM 층. 흐린 앨범아트, 사용자 영상(BGA, 소리 없음, 곡 시간 − 오프셋에 맞춰 재생하고 0.12초 넘게 어긋나면 최대 0.5초에 한 번 다시 맞춤. 유튜브 링크는 `ui/youtubeBga.ts`가 유튜브 플레이어를 음소거로 띄워 같은 방식으로 맞추되, 플레이어의 시간 보고가 거칠어 0.25초 넘게 어긋나면 1.5초에 한 번까지만 다시 맞춤), `AnalyserNode` 스펙트럼(30fps, 로그 간격 48밴드 좌우 대칭), 밝기 조절용 어두운 막. 판정·클럭과는 무관하다.

## 7. 서버

### API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 서버 상태, 분석기·생성기 버전, 분석 백엔드 상태(설치·사용 여부·버전·라이선스), 스템 이름 |
| POST | `/api/shutdown` | 서버 끄기(202). 환경 변수 `GRG_SHUTDOWN_TOKEN`으로 띄운 서버에만 있고(데스크톱 앱), 헤더 `X-Shutdown-Token`이 맞지 않으면 403 |
| GET | `/api/songs` | 곡 목록. 곡마다 `analyzer`(분석에 쓴 백엔드), `outdated`(분석기 버전이나 쓸 수 있는 백엔드가 바뀌었으면 true), `hasBga`, `bgaYoutube`(유튜브 영상 ID 또는 null), `bgaOffsetMs`, `sections`(사용자가 고친 구간 또는 null), `coverAt`(커버를 바꾸거나 지운 시각: 클라이언트가 커버 주소에 붙여 새 그림을 바로 보임), 채보별 최고 기록 `records`(판정 모드별 `byMode`는 빼서 가볍게) |
| POST | `/api/songs` | 곡 업로드(multipart). 표준 FLAC 생성 후 분석 작업 시작 |
| POST | `/api/songs/demo` | 합성 데모 곡 추가(음악 파일 없이 체험) |
| GET | `/api/songs/{id}` | 곡 정보, 분석 진행률, 기록(`byMode` 포함) |
| PATCH | `/api/songs/{id}` | 제목·아티스트·BPM·첫 박 오프셋 보정 → 재분석(고친 구간은 지움), BGA 오프셋(`bgaOffsetMs`), 유튜브 BGA(`bgaYoutube`: 링크나 영상 ID, 빈 문자열이면 지움. 영상 파일을 대신하고, 영상 파일을 올리면 링크가 지워진다), 구간 고치기(`sections`: `{startBeat, label, group}` 목록, `[]`이면 분석값으로) |
| GET | `/api/songs/{id}/sections` | 채보를 만들 구간(고친 구간, 없으면 분석한 구간)과 분석한 구간, `edited`, `beatsPerBar` |
| POST | `/api/songs/{id}/reanalyze` | 다시 분석(새 백엔드·분석기 반영, 저장된 스템도 새로 만듦) |
| GET | `/api/songs/{id}/stems` | 스템 이름, 저장 여부, 분리 방법 |
| GET | `/api/songs/{id}/stems/{name}` | 스템 FLAC(drums · bass · vocals · other). 없으면 그때 분리해 저장(곡마다 잠금) |
| POST | `/api/songs/{id}/bga` | 배경 영상 업로드(mp4 · webm · m4v · mov · ogv, 최대 1GB) |
| GET / DELETE | `/api/songs/{id}/bga` | 배경 영상(Range 요청 지원) / 삭제(유튜브 링크도 지움) |
| DELETE | `/api/songs/{id}` | 곡 삭제 |
| GET | `/api/songs/{id}/audio` | 표준 FLAC |
| GET | `/api/songs/{id}/cover` | 앨범아트 |
| POST / DELETE | `/api/songs/{id}/cover` | 커버 그림 올리기(png · jpg · gif · bmp · webp를 첫 바이트로 판별, 최대 20MB; 태그·패키지 그림 대신) / 지우기(디스크 그림으로) |
| GET | `/api/songs/{id}/sketch` | 메뉴용 구간과 파형 봉우리(고친 구간이 있으면 그것) |
| GET | `/api/songs/{id}/analysis` | AnalysisResult |
| POST | `/api/songs/{id}/charts` | 채보 생성(키 모드, 난이도, 목표 레벨, 시드, `newSeed`, `params`: style · rhythmSource · density · longNoteRatio · maxChord · scratchRate · sideRate · instrumentMapping · repeatConsistency · patternEngine) — 같은 chartId면 캐시. 곡에 고친 구간이 있으면 그 구간으로 만든다. `brief: true`면 메타만 답하고 디스크에 저장하지 않는다(메모리에 마지막 12개 채보와 메타 1000개; 다음에 전체를 요청하면 다시 만들지 않고 그때 저장) |
| GET | `/api/charts/{chartId}` | 채보 |
| POST | `/api/scores` | 플레이 기록 저장(선택: `replay`, 그 `settings`에 녹화 때 `inputOffsetMs`·`songOffsetMs`) → 곡의 기록 |
| GET | `/api/songs/{id}/scores` | 채보별 최고 기록: 기본 점수가 가장 높은 판(`bestScoreId`, `hasReplay`, `score`, `rate`), 모든 판 중 가장 좋은 `lamp`·`maxCombo`, 끝까지 친 판의 최소 BREAK `minBreaks`(그런 판이 없으면 null), 그 점수 규칙으로 친 판의 최고 `exScore`·`weightedScore`(없으면 null), `plays`, `lastPlayedAt`, 생성 채보면 `generatorVersion`과 기본 패턴인지(`defaultSeed`), 가져온 채보면 파일의 레벨 `sourceLevel`, 판정 모드마다 같은 항목 `byMode` |
| GET | `/api/scores/{scoreId}/replay` | 리플레이 |
| GET | `/api/songs/{id}/charts` | 저장된(편집·가져온) 채보 목록. 가져온 채보는 `format`(bms · bmson · osu)과 파일이 매긴 레벨 `sourceLevel` |
| POST | `/api/songs/{id}/charts/custom` | 편집한 채보 저장(`baseChartId`, `notes`, `name`) — 구조 검사, 난이도 재계산, 내용으로 정한 chartId |
| DELETE | `/api/charts/{chartId}` | 채보 삭제(그 채보의 기록·리플레이도) |
| GET | `/api/charts/{chartId}/export?format=osu\|bms\|bmson&offsetMs=` | 내보내기 파일 |
| POST | `/api/import` | 채보 가져오기(multipart `files` + 폴더 안 경로 `paths`, 또는 .zip/.osz) → 곡·채보·알림. 커버가 없는 곡은 채보가 이름 붙인 그림(BMS #STAGEFILE → #BANNER, bmson eyecatch → banner, osu! 배경)을 이름의 대소문자·확장자와 상관없이 찾아 커버로 쓴다. 폴더는 채보가 이름 붙인 그림만 보내고, 압축 파일은 그 그림만 푼다 |
| GET | `/api/songs/{id}/keysounds.json` · `.flac` | 가져온 키음의 위치표와 묶음 파일 |

### 데이터 폴더

```
data/
  library.sqlite3          곡·채보·기록 메타데이터(곡의 `cover_at`, 채보의 `source_level`: BMS #PLAYLEVEL·bmson level 그대로)
  songs/<songId>/
    original.<ext>         업로드 원본
    audio.flac             표준 오디오
    cover.<ext>            앨범아트(있으면)
    analysis.json          AnalysisResult
    stems/<name>.flac      분리한 스템(16bit FLAC 4개, 합 = 표준 오디오) + stems.json(분리 방법)
    bga.<ext>              배경 영상(있으면)
    keysounds/sprite.flac  가져온 BMS·bmson의 키음을 이어 붙인 파일 + sprite.json(각 소리의 위치, 게인)
  charts/<chartId>.json    채보(생성·편집·가져옴; charts 테이블의 kind)
  replays/<scoreId>.json   기록마다 그 플레이의 리플레이
```

`songId`는 원본 파일의 SHA-256 앞 16자리다. 같은 파일을 다시 올리면 같은 곡으로 처리한다. 이전 버전의 `library.sqlite3`는 서버가 시작할 때 빠진 열을 추가해(`ALTER TABLE … ADD COLUMN`) 그대로 쓴다.

### 분석 백엔드 (`analysis/backends/`)

- 종류는 stems · beats · pitch · structure 네 가지이고, 어댑터마다 라이브러리를 **처음 쓸 때만** 불러온다. 설치 여부는 `importlib.util.find_spec`으로만 확인하므로 PyTorch가 설치되어 있어도 서버 시작이 느려지지 않는다.
- 옵션은 `config/analysis.json`의 `ml`(모델 이름·장치·shifts 등). `ml.enabled=false` 또는 `GRG_ML=0`이면 모두 끈다.
- 분석기는 단계마다 ML 결과가 있으면 쓰고, 예외가 나면 그 단계만 기본 분석으로 돌린 뒤 `analyzer.errors[단계]`에 남긴다. 실제로 쓴 백엔드는 `analyzer.backends`(예: `{"stems": "demucs-4.1.0", "beats": "beat_this-1.1.0", "pitch": "core", "structure": "core"}`)에 기록한다.
- ML 결과는 기본 분석의 입력으로 들어간다: beat_this 박 간격은 템포 추정의 BPM 힌트와 박자·첫 다운비트(그리드는 여전히 전곡 온셋 정렬로 정밀 맞춤), basic-pitch 노트는 가까운 온셋의 음높이, allin1 구간은 마디에 스냅해 구조로, Demucs 스템은 온셋 태깅·구간 주도 악기·키음 스템으로 쓴다.
- 곡 목록의 `outdated`는 저장된 분석의 분석기 버전이 다르거나, 지금 쓸 수 있는 백엔드가 분석 때 쓴 것과 다르면 true다. 클라이언트는 이때 "다시 분석" 버튼을 보인다.

## 8. 디렉터리 구조

```
client/          브라우저 클라이언트 (Vite + TypeScript + React + Three.js)
  src/api/       서버 API 클라이언트
  src/audio/     오디오 엔진(스템 키음 포함), 오디오 클럭, 버퍼 캐시, 클릭 트랙 합성, WSOLA 타임 스트레치(워커)
  src/engine/    판정·룰셋·게이지·FEVER·배치 옵션·스크롤·오토 플레이 (DOM 의존 없음, Vitest)
  src/input/     키보드·게임패드 입력, 키 바인딩(보조 키 포함), 플레이 중 기능 키(playKeys.ts)·패드 버튼(padPlay.ts), 메뉴용 패드 브리지
  src/render/    Three.js 트랙 렌더러, 카메라, 투영, 카메라 연출, 스킨
  src/ui/        화면(React), HUD, 플레이 배경(BGA·비주얼라이저), 채보 에디터 화면, 채보 저장소(chartCache.ts), 표기(format.ts), 2방향 화살표 이동(gridNav.ts), 화면 모드(displayMode.ts)
  src/editor/    에디터 문서(편집 규칙·되돌리기, DOM 없음)와 캔버스
  src/settings/  설정(localStorage `grg.settings.v1`, 읽을 때 모르는 값은 기본값으로). 키·패드: `bindings`·`secondBindings`·`padBindings`·`playKeys`·`padPlay`·`padMenu`·`turntableSteps`·`turntableReleaseMs`. 곡마다: `songOffsets`·`patterns`·`chartPicks`(즐겨찾기처럼 모두 초기화에도 남고, 곡을 지우면 함께 지움). 화면·플레이(일부): `cameraPreset`·`sideNotes`·`hitEffectSize`·`judgementOpacity`·`judgeCounter`·`pacemaker`·`pauseOnBlur`·`displayMode`
  e2e/           Playwright E2E
server/          로컬 분석 서버 (Python, FastAPI)
  rhythm_server/ analysis(+backends) · generator · difficulty · formats(osu!·BMS·bmson·키음) · api
  tests/         pytest (합성 음원 기반)
config/          서버·클라이언트 공용 튜닝 값
assets-src/      생성한 게임 그림의 원본(내려받은 그대로)과 출처 PROVENANCE.md
scripts/assets/  원본 → client/public/media(텍스처·플립북·manifest.json) 후처리(build_p0.py, 값은 p0_recipe.json)
desktop/         Electron 셸: main.js(서버를 첫 실행의 포트에 띄우고 창을 연다), windowState.js(창 크기·위치·최대화·전체 화면과 포트·종료 토큰을 사용자 데이터 폴더의 desktop-state.json에; node 테스트), preload.js(페이지에 grgDesktop: 전체 화면 켜기·끄기와 알림)
packaging/       PyInstaller 스펙, 서버 진입점, 데스크톱 빌드 스크립트, 설치 확인 스크립트(smoke_server.ps1 · smoke_desktop.cjs)
.github/workflows/desktop-windows.yml  Windows 설치 파일 빌드 → 서버 확인 → 무인 설치 → 설치된 앱 실행 확인 → Artifacts
docs/            PROMPT · ARCHITECTURE · GENERATION · PATTERN_DESIGN(패턴 생성 설계안) · CHART_FORMAT · TESTING(집에서 테스트하기) · screenshots
```

## 9. 작업 계획과 결과

Phase 0–4를 완료했다. 분석·생성 알고리즘의 세부와 측정값은 `docs/GENERATION.md`, 가져오기·내보내기 규칙은 `docs/CHART_FORMAT.md`에 있다.

### 그 뒤

| 항목 | 구현 | 검증 |
|---|---|---|
| 난이도 기준 | DJMAX RESPECT V · EZ2ON REBOOT : R · 기본 5단계(`config/difficulty.json`의 `systems`, API `system`). 키 모드별 레벨 표, 난이도별 레벨 범위·동시치기·롱노트·사이드·분할·손 제약·따르는 악기, 별칭(NORMAL → NM 등), 레벨이 난이도 밖이면 그 레벨을 맡는 난이도로. 곡 선택 화면의 "난이도 기준" 선택, 채보 정보·결과의 "DJMAX MX Lv.12" · "SC 8" 표기 | pytest 7개(별칭·척도, DJMAX 레벨별 밀도 ±30%, SC 척도, 사이드 노트 = 롱노트, NM 멜로디 비중 > MX, EZ2ON Lv.13, API·편집 채보) / 채보 96개 확인(GENERATION 8-4) / E2E: 기준 전환·배지·저장 |
| 노트별 키음 | 4절 "생성 채보 키음"·"출력 리미터"(키음 1.2배). 설정 기본값 켬, HUD에 "키음 드럼·보컬"처럼 키음 스템 표시. 생성기 0.4.1부터 동치의 노트가 그 소리의 악기를 나눠 맡는다 | Vitest 3개(키음 스템 고르기, 조각·동치·최대 길이, 없는 스템) + 5개(출력 리미터 곡선, 엔진 연결: 음악·키음·효과음이 리미터만 지나 출력, 키음 1.2배) / E2E: 오프라인 렌더로 다 맞히면 원곡과 오차 < 1e-4, 놓친 조각만 무음, 리미터 브라우저 렌더(0.9까지 오차 < 1e-5, 1.6배 소리도 1 이하), 플레이 중 키음 게인(생성 1.2, BMS 서버 게인 × 1.2) / pytest: 분석 뒤 스템 백그라운드 분리 |
| 롱노트 표시 | 누르기 전 몸통을 노트 색에서 35% 밝게, 불투명도 0.92, 가장자리가 밝은 텍스처 | 스크린샷 비교 |
| 생성 에셋 스킨(P0) | ElevenLabs로 만든 4세트(글래스·크리스털·메탈·젤)의 탭 노트·롱노트 몸통·판정선·레일·바닥, 공용 키 빔, 타격 이펙트 영상 3편(Veo 3.1 Fast → 4×4 플립북). 원본 24개 `assets-src/`(14MB), 게임용 32장 `client/public/media/`(1.1MB). 텍스처 메모리는 스킨 하나에 약 9.7MB(밉맵 포함, 그중 타격 이펙트 시트 5.6MB) | Vitest 13개(매니페스트 검증·실제 파일 크기·2의 거듭제곱·30MB 예산·스킨이 쓰는 이름, 불러오기 실패·크기 불일치 제외, 플립북 칸 위치, 사용자 스킨 `textures`, 설정 이전) / E2E: 글래스로 플레이, 노트 그림이 깨지면 노트만, 매니페스트가 없으면 전부 기본 모양(페이지 오류 없음) / 성능(SwiftShader, 8K MX 오토 플레이 12초, rAF 간격): 네온 16.7ms(p95 16.8), 텍스처 스킨 4종 17.6–18.2ms(p95 16.8–33.3, 프레임의 약 6–9%가 33ms) · 부분별로 하나씩 켜면 모두 16.7(3선형 읽기일 때는 바닥 18.0 · 이펙트 17.7) / 데스크톱: 설치 확인 스크립트가 묶인 서버와 설치한 앱에서 `/media/` 확인 |
| 패턴 엔진 | `generator/planner.py`(악구·몸짓·모양 고르기·역할·소리 자리)와 `generator/motifs.py`(모양 비용·손가락 모델), `config/patterns.json`. DJMAX NM–MX 패드 규칙, 단계값(레벨을 한 척도로), 패턴 성향 `meta.patterns`(`difficulty/patterns.py`), 생성 옵션의 "패턴 배치"(이전 방식과 비교) | pytest 19개(패드 규칙·단계값·내보내기 이름, 손으로 만든 몸짓 곡에서 계단·트릴·앵커·드럼 자리·레이저, 초급 도약, 손 분담과 좌우 교대, EZ2ON 드럼 자리, 키 모드 습관, DPC 가이드라인: 사이드 노트 간격·린터·동치 악기) / Vitest: 설정 / E2E: 패턴 줄, 이전 방식 요청 / 측정은 `docs/PATTERN_DESIGN.md` 11·12장 |
| 구간 엔진 | `analysis/structure.py`(분석기 1.2.1: 마디 자기유사 행렬로 경계·반복 묶음·라벨(프리코러스 포함)·루프 길이·신뢰도), `generator/sections.py`(루프 단위·재료 묶음·구간 설계도·재료마다 노트·합의 채우기·레인 복사), `difficulty/consistency.py`(일관성 지표 `meta.consistency`), `config/patterns.json`의 `sectioned`. 생성기 0.5.0의 기본 엔진, 이전 엔진은 "패턴 배치"에서 비교용으로 고름. 곡 설정의 "구간 편집"(`ui/SectionEditor.tsx`)으로 경계·라벨·묶음을 고치고, 미니맵은 구간을 묶음 색으로 칠함. 측정 스크립트 `server/scripts/measure_consistency.py`, 구조 합성 곡 `synth.make_structured_song`과 검출 잡음 `synth.detection_noise`. 커뮤니티 패턴 가이드(생성기 0.6.0): 기승전결(`sectioned.buildUp`), 억지 연타·축연타(`anchors`), 5K 피벗·재봉틀, 가이드 지표 `difficulty/guides.py`와 `server/scripts/measure_guides.py` | pytest 가이드 7개(후렴으로 시작하는 곡의 구간, 반복이 앞 노트를 지키며 늘기, 곡 앞 상한, 억지 연타·축연타, 피벗·재봉틀 기대 레인, 가이드 지표)와 구간 15개(구조 정답 대비 경계·묶음·라벨, 루프·반복 레인 일치와 이전 엔진 대비, 반복 후렴 = 첫 후렴/거울, 검출 잡음, 레벨 ±1·패드 규칙·소리 있는 곳에만 노트·결정성, 라벨별 밀도 대비, 단위, 레인 엔트로피, 고친 구간, 구간 API) / Vitest 3개(묶음 색·라벨·마디 검사)와 설정 이전(예전 기본 엔진 → 구간 엔진) / E2E: 구간 편집·저장·채보에 반영·되돌리기 / 측정은 `docs/PATTERN_DESIGN.md` 13장 |
| 설정 화면의 미리듣기 | `audio/songPreview.ts`의 `MenuMusic`이 곡 선택 화면 밖에서 미리듣기를 맡아, 곡 선택 → 설정 → 곡 선택을 오가도 같은 소리가 이어진다. 설정에서는 Web Audio 저역 통과 필터(800Hz)와 게인 0.7로 약 0.3초에 걸쳐 작고 먹먹해지고(처음 먹먹해질 때 미디어 요소를 앱의 AudioContext에 연결), 돌아오면 원래대로. 다른 화면으로 가면 멈추고, 음악 볼륨을 바꾸면 바로 따른다 | Vitest(같은 곡은 이어 재생·다른 곡은 새로·설정 중에 시작한 미리듣기도 먹먹하게) / E2E: 실제 Chromium에서 같은 오디오 요소가 설정 화면 뒤에서 계속 재생되며 필터 차단 주파수·게인이 바뀌었다 돌아오는지, 플레이를 시작하면 멈추는지 |
| 플레이 시작 대기 | 로딩 오버레이의 화면 전체 배경 흐림(`backdrop-filter`)을 뺐다. 스피너가 도는 동안 흐림을 매 프레임 다시 계산해서, GPU 없이 소프트웨어 렌더러(SwiftShader)로 그리는 환경에서는 GPU 프로세스가 쉬지 못했고 트랙의 WebGL 준비(컨텍스트·확장·셰이더)가 그 뒤에서 기다리느라 페이지가 10초 넘게 멈췄다. 일시정지 중에는 트랙과 비주얼라이저를 다시 그리지 않는다(배속·커버·창 크기가 바뀌면 한 번만): 일시정지 메뉴의 흐림을 매 프레임 다시 계산하지 않게(그 흐림은 이후 UI 리프레시에서 없앴다). 스템 분리와 분석의 HPSS 메디안 필터는 행마다 반사 패딩한 뒤 1-D 필터 한 번으로 계산하고(scipy 1.15+의 빠른 1-D 순위 필터), 역 STFT의 겹쳐 더하기는 벡터화했다. 결과는 이전과 바이트 단위로 같다. 스템 디코딩은 원래 작업 스레드에서 하고, 스템 버퍼를 소스에 넣을 때 복사도 없다 | Playwright 트레이스(4코어 클라우드, 데모 곡 → 4K NM → 에디터 → 커서부터 테스트): 첫 플레이 오버레이 19.7 → 3.9초, 스템이 있으면 14.2 → 0.6초, 메인 스레드 최장 정지 11.2 → 0.3초, 일시정지 화면 4 → 60fps / 4분 곡 스템 분리 21.9 → 9.1초, 기본 분석 10.6 → 7.6초(스템·분석 결과를 이전 코드와 바이트 단위로 비교) / E2E: 테스트 플레이 로딩 중 페이지 응답 3초 미만(이전 11초), 일시정지 20fps 초과(이전 6fps) |
| 롤 · 엇박 · 멜로디 · 롱노트 끝 | 플레이 피드백(생성기 0.7.0, 분석기 1.3.0, `docs/PATTERN_DESIGN.md` 15장). `analysis/stems.py`의 멜로디 존재도(온셋 `melody`: 보컬 스템의 어택이나 레가토 음높이 변화, 그 온셋의 보컬 비율로 거름). `generator/rolls.py`: 드럼 롤을 곡에서 한 번(모든 격자) 찾아 난이도 격자로, 노트 예산보다 먼저, 좌우 손 교대(`alternate`)로. 박자 위치 가중치의 단계값 지수(`difficulty.json`의 `metrical`), '멜로디'·'보컬' 리듬 기준과 스타일 '멜로디'가 존재도를 따름, 롱노트 끝을 곡의 격자에(`select.hold_end`), 멜로디 음의 지속은 다음 멜로디 음까지, 롱노트를 뗀 레인은 꼬리 간격만 쉼. 측정 스크립트 `server/scripts/measure_rhythm.py`, 그루브 합성 곡 `synth.make_groove_song`(빨라지는 스네어 빌드업 정답 `rolls`) | pytest 7개(멜로디 존재도 AUC ≥ 0.8·롤 밑 < 0.2, 빌드업 롤이 손을 번갈아(6K HD·4K MX·8K EZ2ON, NM·NORMAL은 8분, 작은 빌드업도), 필인은 그 마디에만, 그루브·하이햇·베이스·멜로디 줄은 롤이 아님, '멜로디' 기준·스타일이 리드를 따름, 어려운 채보의 엇박, 롱노트 끝이 격자·다른 노트에) / 측정은 `docs/PATTERN_DESIGN.md` 15장 |
| 템포 · 소리 없는 온셋 · 롱노트 | 두 번째 플레이 피드백과 BMS 자료 horieyuuka.github.io(생성기 0.8.0, 분석기 1.4.0, `docs/PATTERN_DESIGN.md` 16장). `analysis/tempo.py`: 박 단계 후보에 ¾·⅔배, 백비트(타악 200Hz 위 플럭스가 격자 네 칸 중 한 칸에 몰리면 반 템포), 셔플 위상(1/3박 옮긴 격자의 타악 플럭스). `analysis/pitch.py`: 지속음 흔들림(맥놀이·트레몰로) 온셋 제거 `held_swells`, 밑에 깔린 소리를 반쯤 빼고 재는 음 길이. `generator/select.holdable`(`config/difficulty.json`의 `holds`): 롱노트는 350ms 이상 울리는 멜로디 음이나 드럼이 아닌 음 있는 소리에만. 구간 엔진의 마지막 구간은 마지막 소리의 마디 끝까지. 합성 곡 `synth.make_pop_song`(노래·쉼·2절 가사·드럼 없는 인트로·브리지)과 `synth.make_drum_song`(장르 드럼 패턴 14종), 측정 스크립트 `server/scripts/measure_tempo.py` | pytest 8개(장르 패턴 4종의 템포·박 위치, 피아노 화음 흔들림, 롱노트를 둘 소리, 100 BPM 팝 곡의 구간·반복 일치·롱노트·소리 있는 노트) / 장르 패턴 87곡 템포 61 → 87곡 / 측정은 `docs/PATTERN_DESIGN.md` 16장 |
| 손 규칙 | BMS-Generator(horieyuuka.github.io)의 손 규칙을 DJMAX·EZ2ON에 맞게 고친 것(생성기 0.8.1, `docs/PATTERN_DESIGN.md` 16-6장, `config/patterns.json`의 `hands`). `generator/lanes.py`의 빔 서치 비용: 빠른 단타의 같은 손 3연속, 한 키의 세 슬롯 연속(연타 줄기, 단위 첫머리의 복사도 막음), 마디의 좌우 30–70% 균형(노트 10개부터). 계단·트릴·손 분담처럼 계획이 한 손에 둔 노트와 롱노트를 잡는 동안은 빼고, 계획한 연타·레이저는 그대로. `generator/motifs.py`: 한 손의 붙은 동치 짝 비용(손 분담 동치는 뺌). `difficulty/guides.py`: 지표 `handRuns`·`jackStreaks`·`offBars`·`adjacentChords` | pytest 2개(손 규칙 지표, 생성 채보의 같은 손 3연속·붙은 동치·연타 줄기·치우친 마디) / 측정은 `docs/PATTERN_DESIGN.md` 16-6장 |
| BMS 짝 비교 | BMS 곡의 키음으로 자동 플레이 소리를 만들어 분석하고, 사람 채보와 같은 곡·같은 밀도의 우리 채보를 비교(생성기 0.9.0, `docs/PATTERN_DESIGN.md` 17장). `generator/candidates.triplet_share`(`config/difficulty.json`의 `tripletFeel`): 곧은 곡은 셋잇단 분할을 쓰지 않음. `generator/motifs.py`(`config/patterns.json`의 `hands.systems`): 기준별 동치 모양 비용, 기본 기준은 손 분담 한 손 동치도 붙은 짝 비용. `generator/lanes.py`: 반복 구간에서 더한 노트가 바로 뒤 복사 노트의 레인을 비워 둠. `generator/motifs.py`: 롤이 손 경계를 넘는 이웃 키로 가면 차례에서 벗어난 비용을 다 냄 | 기존 pytest 전부(구간·롤 테스트 포함) / 측정은 `docs/PATTERN_DESIGN.md` 17장 |
| 템포 · 박 · 마디 첫 박 (BMS 정답) | BMS 곡의 채보 격자를 정답으로 분석기의 템포·박·마디 첫 박을 맞춤(분석기 1.5.0–1.5.1, `docs/PATTERN_DESIGN.md` 18장). `analysis/tempo.py`: 접기 범위 70–260 BPM, 200 BPM 위 단계는 절반 템포 격자의 반 박을 킥이나 스네어가 박만큼 칠 때만(`FAST_LEVEL_BPM`·`_drums_on_half_beats`), 반 박 옮긴 격자의 드럼 플럭스·중음역 온셋이 더 세면 위상을 옮김(`_half_phase`, 분석기가 넘기는 온셋의 중음역 비율 `mid_fraction`). `analysis/meter.py`: 4/4 마디 첫 박에 마디 평균 크로마의 이웃 마디 변화(`bar_changes`)를 더하고, 3/4는 세 박 마디의 화성 변화가 네 박 마디보다 클 때만(1.5.1). 합성 곡 `synth.DRUM_STYLES`의 `trance`(약한 킥 위 엇박 베이스), `server/scripts/measure_tempo.py`에 200 BPM 위 J-core·펑크와 엇박 베이스 곡 | pytest 5개(J-core 215 BPM, 엇박 베이스 150 BPM의 템포·박 위치, 마디 화성이 같은 세기의 1·3박 중 첫 박을 고름, 세 박 강세에서 마디 화성이 3/4·4/4를 정함) / BMS 385곡 셋 다 맞음 43 → 56%, 합성 곡 97곡 템포 94곡 / 측정은 `docs/PATTERN_DESIGN.md` 18장 |
| 3:2 템포 단계 (BMS 정답) | 분석기 1.6.1: `analysis/tempo.LEVEL_RATIOS`에 1.5배, 자기상관 단계의 1/3·2/3박을 온셋이 고르게 채울 때만(`_even_thirds`, `EVEN_THIRDS`, 셔플 제외). 합성 곡 `synth.DRUM_STYLES`의 `dotted`(점4분 킥·베이스), `server/scripts/measure_tempo.py`에 150–190 BPM | pytest 1개(`dotted` 170 BPM의 템포·박 위치) / BMS 948곡 템포 정답 70.9 → 81.1% / 측정은 `docs/PATTERN_DESIGN.md` 18-6 |
| 마디선 (BMS 정답) | 분석기 1.7.0(`docs/PATTERN_DESIGN.md` 48장). `analysis/tempo.py`: 구간별 템포 맵은 16박 창마다 박·반 박(±25ms)이 설명하는 온셋 몫이 하나의 격자보다 0.2 넘게 많은 창이 15%를 넘을 때만(`_windows_gained`, `PIECEWISE_GAIN`·`PIECEWISE_WINDOW_SHARE`). 반 박 판정은 200Hz 위·아래 드럼, 중음역 온셋, 박으로 들어갈 때의 화성 변화(분석기가 템포 추정 전에 넘기는 크로마) 로그 비의 로지스틱 모델(`HALF_SHIFT_WEIGHTS`)이고, 드럼 전체 로그 비가 ±0.4를 넘으면 드럼만(`HALF_SHIFT_DRUMS_LOG`). `analysis/meter.py`: 4/4 마디 첫 박을 킥·스네어 플럭스, 화성 변화, 마디 화성 변화, 바로 앞 박의 온셋을 네 위상 평균에 대한 로그 비로 더해 고름(`DOWNBEAT_WEIGHTS`, `BeatAccents`, `beat_peaks`·`beat_onsets`) | pytest 5개(쪼갠 템포 맵이 온셋을 더 설명하지 못하면 하나의 격자, 화성 변화와 뚜렷한 드럼이 엇박 위상을 박으로 옮김, 화음이 그대로면 킥·스네어로, four-on-the-floor는 화음 변화로 마디 첫 박) / BMS 973곡(고를 때 쓰지 않은 곡, BPM 하나) 마디선이 맞는 곡 59.3 → 74.1% / 측정은 `docs/PATTERN_DESIGN.md` 48장 |
| 템포 반·두 배 (BMS 정답) | 분석기 1.7.1(`docs/PATTERN_DESIGN.md` 49장). `analysis/tempo._choose_octave`: 템포 단계를 고르고 격자를 맞춘 뒤, 그 반·두 배에서 다시 맞춘 격자의 빗살 점수·사전분포(로그), 박 간격 자기상관, 백비트 비(로그)의 조건부 로짓 점수가 2.5점 넘게 나을 때만 옮김(`OCTAVE_WEIGHTS`·`OCTAVE_MARGIN`). BPM 보정·ML 힌트가 있으면 쓰지 않음 | pytest 1개(문턱을 넘을 때만 옮김, 2개 경우) / BMS 973곡(고를 때 쓰지 않은 곡) 마디선이 맞는 곡 74.1 → 75.5%, 합성 곡 102곡 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 49장 |
| 마디 첫 박의 세기 변화 (BMS 정답) | 분석기 1.7.2(`docs/PATTERN_DESIGN.md` 50장). `analysis/meter.energy_changes`: 위상마다 연속한 마디의 온셋 세기 변화(마디의 (평균 온셋, 곡 평균) 쌍의 1 − 코사인)를 `DOWNBEAT_WEIGHTS`의 `energyChange`로 더하고 모두 다시 맞춤. 로그 비에 바닥 `ENERGY_CHANGE_FLOOR`(0.005) | pytest 1개(드럼·화음이 고르고 세기만 마디마다 바뀌는 곡의 마디 첫 박) / BMS 973곡(고를 때 쓰지 않은 곡) 마디선이 맞는 곡 75.5 → 76.8%, 합성 곡 102곡 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 50장 |
| 반 박의 마디 화성 (BMS 정답) | 분석기 1.7.3(`docs/PATTERN_DESIGN.md` 51장). `analysis/tempo._half_phase`: 맞춘 격자와 반 박 옮긴 격자에서 `meter.bar_changes`의 가장 큰 값을 평균으로 나눈 값(마디 화성의 또렷함)의 로그 비를 `HALF_SHIFT_WEIGHTS`의 `barHarmony`로 더하고 다시 맞춤 | 기존 반 박 테스트 / BMS 973곡(고를 때 쓰지 않은 곡) 마디선이 맞는 곡 76.8 → 77.9%, 반 박 판정 93.5 → 95.0%(865곡), 합성 곡 102곡 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 51장 |
| 마디 첫 박의 음색 변화 (BMS 정답) | 분석기 1.7.4(`docs/PATTERN_DESIGN.md` 52장). `analysis/onsets.onset_spectra`(온셋 2프레임 뒤의 로그 멜 스펙트럼), `analysis/meter.beat_timbre`(박 구간 온셋들의 세기 가중 평균)·`timbre_changes`: 위상마다 연속한 마디의 평균 음색 변화와 박으로 들어갈 때의 음색 변화(처음·끝 8박 뺌, 곡 음색의 평균 제곱으로 나눔)를 `DOWNBEAT_WEIGHTS`의 `timbreBarChange`·`timbreNovelty`로 더하고 모두 다시 맞춤. 로그 비에 바닥 `TIMBRE_CHANGE_FLOOR`(0.01) | pytest 1개(드럼·온셋·화음이 고르고 온셋 음색만 마디마다 바뀌는 곡의 마디 첫 박) / BMS 4/4 곡(고를 때 쓰지 않은 526곡) 마디 첫 박 95.8 → 97.7%, 합성 곡 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 52장 |
| 3/4 판정 (BMS 정답) | 분석기 1.7.4(`docs/PATTERN_DESIGN.md` 52장). `analysis/meter.three_four_probability`: 박 단서 대비와 가장 큰 마디 화성 변화의 로그 비, 킥·스네어·온셋이 한 위상에 몰리는 정도(`phase_peak`, 3박 − 4박), 화성이 6·12박 뒤에 돌아오는 정도(`harmony_return`, 8·16박 뒤 대비)의 로지스틱 모델(`THREE_FOUR_WEIGHTS`). 확률 0.8(`THREE_FOUR_MIN_P`) 이상일 때만 3/4. 드럼 플럭스가 없으면 1.7.3 규칙 | pytest 2개(마디마다 킥과 화음이 바뀌는 3박·4박 마디) / 고를 때 쓰지 않은 BMS 곡의 3/4 채보 13 → 22/26곡, 4/4 곡을 3/4로 2 → 0곡. 음색과 함께 BMS 973곡 마디선이 맞는 곡 77.9 → 79.8% / 측정은 `docs/PATTERN_DESIGN.md` 52장 |
| 반 박의 마디 음색 (BMS 정답) | 분석기 1.7.5(`docs/PATTERN_DESIGN.md` 53장). `analysis/tempo._half_phase`: 맞춘 격자와 반 박 옮긴 격자에서 `meter.timbre_changes`(마디 음색 변화)의 가장 큰 값을 평균으로 나눈 값의 로그 비를 `HALF_SHIFT_WEIGHTS`의 `barTimbre`로 더하고 다시 맞춤. 분석기가 `estimate_tempo`에 온셋 스펙트럼(`onset_spectra`)을 넘김 | pytest 1개(박과 반 박의 온셋이 마디마다 소리를 바꿀 때 엇박 격자는 옮기고 박 격자는 그대로) / BMS 973곡(고를 때 쓰지 않은 곡) 마디선이 맞는 곡 79.8 → 80.4%, 반 박 어긋남 4.5 → 4.1%, 합성 곡 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 53장 |
| 템포 두 배: 반 박의 드럼 (BMS 정답) | 분석기 1.7.6(`docs/PATTERN_DESIGN.md` 54장). `analysis/tempo._choose_octave`: 문턱(`OCTAVE_MARGIN`)이 지금 템포를 지켰을 때, 그 격자의 반 박/박 킥·스네어 플럭스 로그 비(`_half_beat_drums`)와 두 배 후보의 점수 이득으로 된 로지스틱 모델(`DOUBLE_WEIGHTS`)이 0.5(`DOUBLE_MIN_P`) 이상이면 두 배로 | pytest 2개(반 박에도 드럼이 박만큼 오면 두 배, 박에만 오면 그대로) / BMS 973곡(고를 때 쓰지 않은 곡) 마디선이 맞는 곡 80.4 → 81.5%, 반 템포 3.7 → 2.2%, 두 배 3.9 → 4.2%, 합성 곡 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 54장 |
| 16분 어긋난 박 (BMS 정답) | 분석기 1.7.7(`docs/PATTERN_DESIGN.md` 55장). `analysis/tempo._quarter_phase`: 반 박 판정 뒤, 드럼 플럭스가 1/4박 옮긴 격자를 맞춘 격자의 1.2배(`QUARTER_SHIFT_RATIO`) 이상 세게 치면 그쪽으로 | pytest 3개(드럼이 16분 앞·뒤면 옮기고, 맞으면 그대로) / BMS 973곡(고를 때 쓰지 않은 곡) 마디선이 맞는 곡 81.5 → 81.8%, 박이 격자를 벗어남 1.4 → 1.0%, 합성 곡 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 55장 |
| 새 소리가 시작되는 자리 (BMS 키음) | 분석기 1.6.0: 온셋마다 새 소리가 시작되는 확신 `attack`(`analysis/onsets.attack_confidence`·`band_levels`). 그 온셋의 대역 세기 상승, 화성 상승, 드럼 비율, 앞 온셋과의 가까움·세기 비, 저음 여부의 로지스틱 모델이고 가중치는 BMS 키음에 맞췄다. 생성기 0.9.3: 후보 점수 × attack²(`generator/candidates._score`, `config/instruments.json`의 `rhythmSource.attack`). 1.6.0 전 분석은 1로 본다 | pytest 3개(새 소리와 늦게 오는 저음의 확신 순서, 합성 곡 실제 온셋의 확신, attack이 낮은 후보의 점수) / 측정은 `docs/PATTERN_DESIGN.md` 19장 |
| 같은 소리 같은 레인 · 롱노트 세기 · 쉬운 채보 박자 (BMS) | 생성기 0.9.4(`docs/PATTERN_DESIGN.md` 20장). `generator/lanes._costs`: 같은 소리(`select.sound_of`)가 `sameSoundWithinMs` 안에 다시 나오면 같은 레인 비용 없이 `sameSoundBonus`를 받고, 연타 줄기 한도(`jackFree`)에서 보너스가 끝난다. 줄기를 세는 간격의 하한은 `jackStreakMinMs`다(`config/patterns.json`의 `hands`, GRG만 켬). `select.holdable`: 온셋 세기 `holds.strengthAtLeast`(0.4) 미만은 롱노트가 되지 않는다. GRG 프리셋(`config/difficulty.json`)의 연타 최소 간격·EASY/NORMAL 분할·스크래치·EXPERT/MASTER 동치를 BMS 사람 채보에 맞췄다 | pytest: 약한 소리 롱노트 거부, 반복 음이 연타 줄기 한도를 넘지 않고 두 음 트릴은 트릴로 남음, GRG 연타 줄기가 사람 수준(합성 곡 HARD ≤ 10/1000)이고 DJMAX는 그대로(≤ 1), EASY 스크래치가 드물고 250ms 이상 떨어짐 / 측정은 `docs/PATTERN_DESIGN.md` 20장 |
| 느린 반복은 같은 레인에 (BMS) | 생성기 0.9.5(`docs/PATTERN_DESIGN.md` 21장). `generator/lanes._costs`: 앞 노트에서 `slowRepeatMs` 이상 떨어진 노트는 같은 소리면 `slowSameSoundBonus`, 다른 소리면 같은 레인 비용 × `slowJackScale`, 레인 고르게 쓰기 × `slowUsageScale`(`usageBalance`는 모든 노트). `motifs.motif_costs`: 느린 단타는 양손 나누기 비용 × `slowSplitScale`. `sameSoundBonus`·`slowSameSoundBonus`는 숫자나 [단계값, 값] 목록(`lanes._by_skill`). 모두 `config/patterns.json`의 `hands`, GRG만 켬 | pytest: 500ms 간격 반복음은 GRG 모든 난이도에서 같은 키, 250ms 간격은 EASY·NORMAL이 MASTER보다 자주 같은 키, DJMAX는 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 21장 |
| 바깥 키와 도약 (BMS, 7K) | 생성기 0.9.6(`docs/PATTERN_DESIGN.md` 22장). `motifs.motif_context`: 도약 비용 × `hands.leapScale`(숫자나 키 모드별 값, `motifs.by_key_mode`). `planner.windows`: `windows.systems`(기준별, `keyModes`로 키 모드별, 너비는 합침)와 퍼진 창(`spread`, `step`). `lanes._costs`: 키마다 늘 붙는 비용 `hands.keyBias` × `keyBiasScale`(단계값별), 빠른 두 노트를 다른 손으로 보내는 비용 × `alternateScale`(키 모드별). GRG 7K+1S만 켬 | pytest: 7K EASY·NORMAL·HARD가 1·7번 키에 8% 넘게 두고 한 키가 30%를 넘지 않으며, EASY의 3칸 이상 이동이 20% 넘음 / 측정은 `docs/PATTERN_DESIGN.md` 22장 |
| 악구별 키 묶음 · 쉬운 단계 동치와 셋잇단 (BMS) | 생성기 0.9.7(`docs/PATTERN_DESIGN.md` 23장). `planner.palettes`: 악구마다 `palettes.systems[기준][키 모드]`의 `sets`(사람 4마디 창의 키 묶음 비율)에서 `size`(단계값별) 키를 `shared`(앞 묶음과 겹치는 키 수 확률)를 곱해 시드로 뽑고, 같은 재료는 같은 묶음. `motifs._per_key_costs`: 묶음 밖 키 × `weights.palette`. `motifs.motif_context`: `hands.adjacentChord`를 단계값별로(`by_skill`). `planner.vocabulary`: 패턴의 `bySystem`(기준별 minSkill·complexity). GRG 프리셋 EASY·NORMAL: `handChordLimit` 2, 셋잇단 분할 3(5%·7%) | pytest: 7K EASY·NORMAL의 4마디 창이 노트 80%를 평균 4.2키 이하에 두고, 2개 동치의 3% 이상이 한 손 한 칸 띄움·3% 이하가 한 손 붙은 키, 셔플 곡의 EASY·NORMAL이 흔들리는 8분에 노트를 두고 곧은 곡은 두지 않음, 키 비율·연타 줄기·쏠린 마디는 시드 평균 / 측정은 `docs/PATTERN_DESIGN.md` 23장 |
| 드럼 자리 · 손 분담 동치 · 쉬운 채보 엇박 (BMS) | 생성기 0.9.8(`docs/PATTERN_DESIGN.md` 24장). `motifs.motif_context`: `roles.songHomes`의 기준은 드럼 자리 세기 `home_scale`이 곡 전체에서 `songHomeWeight`(기준별, `_song_home_weight`)이고, `roles.flipSystems`의 기준만 반복 묶음마다 손 좌우를 바꾼다. `motifs.motif_costs`: 리듬·선율이 한 손씩인 악구의 동치는 자리 비용 × `roles.chordRegion`(기준별). `candidates`: 멜로디 가중 `rhythmSource.melody.autoBySystem`(기준별). GRG 프리셋 EASY·NORMAL의 `highBandWeight` 0.7·0.8. 옵션(기본 끔): `planner.sound_homes`의 음높이 자리(`roles.tonalHomes`), `lanes._costs`의 키음 기억(`hands.soundMemory`), `select.hold_probability`(`holds.model`) | pytest: GRG MASTER의 손 분담이 반복 묶음마다 좌우를 바꾸지 않음(DJMAX는 바꾸고 EZ2ON은 그대로) / 측정은 `docs/PATTERN_DESIGN.md` 24장 |
| 노트 고르기 모델 (BMS) | 생성기 0.9.9(`docs/PATTERN_DESIGN.md` 25장). `candidates._score`: `_hand_scores`(손으로 만든 점수)에 `pick_probability`(`config/pick.json`의 로지스틱 모델, 단계값으로 `pick_model`이 고름, 특징은 `pick_features`)를 섞는다. 점수 = 손 점수 × (확률 / 기본 옵션의 손 점수)^`share`(단계값별). 기본 옵션은 리듬 기준 자동·스타일의 점수 가중(`SCORE_WEIGHTS`) 없음이라 옵션은 손 점수를 바꾼 만큼 곱해진다. `systems`의 기준(GRG)만 | pytest: DJMAX·EZ2ON은 손 점수 그대로, 확률이 설정의 로지스틱 모델과 같고 MASTER는 확률 그대로·EASY는 손 점수와 반씩, 드럼 리듬 기준이 손 점수를 바꾼 만큼 점수를 바꿈 / 측정은 `docs/PATTERN_DESIGN.md` 25장 |
| 재봉틀 · 축연타 (BMS) | 생성기 0.9.10(`docs/PATTERN_DESIGN.md` 26장). `planner._fit`: 몸짓별 모양 점수 `fit`에 기준별 `fitBySystem`을 덮어쓴다. `params.resolve_params`: 축연타 상한 `anchors.caps` 대신 기준별 `anchors.bySystem`. `planner._feasible`: 모양의 `maxIoiMs`(음 간격 중앙값 한도). GRG만 `styles.GRG.doubles` 1.5, 반복음·드럼 악구의 재봉틀 1.0·0.8(400ms 이하 악구), 축연타 3·6·8·10타 | pytest: GRG의 반복음·드럼 악구에서 재봉틀 점수가 `split`보다 높고 DJMAX는 낮음, GRG NORMAL 축연타 상한 6타·EASY 3타, DJMAX NM 3타 / 측정은 `docs/PATTERN_DESIGN.md` 26장 |
| 마디마다 셋잇단 격자 (BMS) | 생성기 0.9.12–0.9.25, 0.9.26의 마디별 스윙 판정으로 바뀜(`docs/PATTERN_DESIGN.md` 28장). `candidates.triplet_bars`: `_triplet_weights`(온셋마다 곧은 16분·셋잇단 자리의 세기)를 마디로 모아, 앞뒤 `tripletFeel.localBars`마디의 셋잇단 비율이 `localMinShare` 이상인 마디. `candidates.build_candidates(triplets_in)`: 그 밖의 마디의 온셋은 곧은 분할에만 스냅. `core`: 셋잇단 느낌의 곡이고 기준이 `localSystems`에 있으며 단계값이 `localFromSkill` 이상일 때만. GRG만, 앞뒤 1마디, 0.5, HARD(0.42)부터 | pytest: 앞 8마디 16분·뒤 8마디 셋잇단인 합성 분석에서 셋잇단 마디만 고르고, 곧은 마디의 어긋난 온셋이 곡 전체 격자에서는 셋잇단에, 마디별 격자에서는 셋잇단 아닌 자리에 붙음 / 측정은 `docs/PATTERN_DESIGN.md` 28장 |
| 마디별 스윙 판정 (BMS) | 생성기 0.9.26(`docs/PATTERN_DESIGN.md` 56장). `candidates.swing_bars`: 마디마다 박의 0·1/6·1/4·1/3·1/2·2/3·3/4·5/6 자리(0.05박 안) 온셋 세기를 모아, 마디와 앞뒤 한 마디의 셋잇단·곧은 16분 세기(log1p)와 곡의 셋잇단 비율·8분 몫으로 로지스틱 확률(`tripletFeel.swing`, 사람 채보 755곡의 마디 68,423개에 맞춤)을 내고 `minP`(0.25) 이상인 마디. `core`: `localSystems`(GRG)는 모든 단계에서 그 마디만 셋잇단 격자, 다른 기준은 곡 단위 `minShare`. `build_candidates(swing)`: 열린 마디의 셋잇단 후보에 `Candidate.grid`(`swing.roles`: 3 → 2, 6 → 4); `grid_of`가 박자 위치 가중치·스타일 분할 가중·노트 고르기 모델의 분할 특성·`select`/`sections`의 분할 상한에 쓰인다 | pytest: 앞 8마디 16분·뒤 8마디 셋잇단인 합성 분석에서 셋잇단 마디만 열고, 곧은 마디의 어긋난 온셋은 곧은 분할에, 열린 마디의 셋잇단은 `grid` 2; 합성 셔플 곡의 EASY·NORMAL 셋잇단 몫 15%·25% 이상(예전 상한 5%·7%), 곧은 곡 0 / 측정은 `docs/PATTERN_DESIGN.md` 56장 |
| 계단 되먹임 (BMS) | 생성기 0.9.27(`docs/PATTERN_DESIGN.md` 57장). `lanes._feedback_counts`: 빠른 단타 줄기(`RUN_MS` 400ms) 노트(`fb_run`)와 그 가운데 계단(한 칸씩 같은 방향 세 노트 이상)에 든 노트(`fb_stairs`)를 BMS 통계처럼 센다(세 노트째 3, 그 뒤 1씩, 꺾이는 노트는 두 계단에; `fb_stair`·`fb_step`). `lanes._costs`: 몫이 `hands.stairTarget`보다 모자라면 한 칸 이동 뒤 같은 방향 한 칸의 계획 없는 단타가 `stairFeedback` × (목표 − 몫)을 덜고 많으면 더 낸다. 기본 기준 7K+1S, 단계값 `stairMinSkill`(0.5)부터 | pytest: 1-2-3-4-5-4-3-3-5-6-7 줄기와 쉰 뒤 2-3에서 생성 중 셈이 BMS 통계의 셈(줄기 13, 계단 11)과 같음, 계단이 모자란 상태에서 이어가는 키만 비용이 줄고 다른 키·동치는 그대로, DJMAX는 0 / 측정은 `docs/PATTERN_DESIGN.md` 57장 |
| 같은 소리 묶음 · 키음 기억 (BMS) | 분석기 1.8.0 · 생성기 0.9.28(`docs/PATTERN_DESIGN.md` 58장). `analysis/sound_groups.py`: 분석기의 화성 스펙트럼에서 온셋마다 상승(2프레임 뒤 − 앞, 오른 만큼만)의 제곱근을 단위 길이로 만들어 곡마다 코사인 거리 평균 연결 묶음을 `GROUP_COSINE`(0.7)에서 자르고, 온셋에 `soundGroup`을 붙인다(거리는 256줄씩 행렬곱으로 압축 목록에, 온셋 `MAX_LINKED`(4,000)개를 넘으면 고르게 고른 만큼만 묶고 나머지는 가장 닮은 온셋의 묶음으로). `candidates`·`select`·`sections`: `sound_group`을 후보에서 슬롯으로. `lanes`: 키음 기억(`hands.soundMemory`, GRG 2.5)의 열쇠가 `select.home_of`(묶음, 없으면 기억 없음). 우리 소리가 앞 슬롯과 같은 노트와 롤 노트는 뺀다 | pytest: 두 소리가 번갈아 오르는 화성 스펙트럼에서 소리마다 한 묶음, 온셋이 많을 때 고른 만큼만 묶어도 같은 묶음, 분석 결과 온셋의 `soundGroup`, 네 묶음이 번갈아 나오는 슬롯에서 기억이 묶음마다 한 레인을 지킴(기억 없음·묶음 없음보다 0.2 이상) / 측정은 `docs/PATTERN_DESIGN.md` 58장 |
| 6키 EXPERT 플레이 소감 | 생성기 0.9.29(`docs/PATTERN_DESIGN.md` 60장, 기본 기준만). `planner.roll_shapes`: 롤마다 `rolls.shapes`의 모양과 키 번호를 채보 시드·타수·마디 안 자리로 뽑아 `SlotPlan.roll_shape`에(빌드업은 트릴 × `buildUpTrill`, 동치 연타는 연타 간격이 되는 롤만, 그 롤의 슬롯은 2노트). `motifs.alternate_key`: fan·inward·wave·shift·trill, `motifs.chord_jack_keys`. `candidates.pad_like`·`select.holdable(…, system)`·`select.hold_value(…, system)`·`candidates._score`의 `pickBoost`: 패드 롱노트(`holds.pad`). `select.mark_hold_pair` → `Slot.hold_pair` → `lanes.search`의 롱노트 레인 묶음(`Choice`의 셋째 값이 레인 튜플). `ending.finish`: 곡 끝 잔향 롱노트(`difficulty.ending`). `candidates._melody_splits`(`melody.split`), `candidates._mark_solos`·`Candidate.solo`(`melody.solo`). `lanes._costs`: 빠른 같은 소리 반복의 드럼 좌우 교대(`hands.fastDrumAlternate`)·같은 악기 줄기의 음높이 따라가기(`fastContourScale`), HARD부터. `core.generate_chart`: 레벨이 범위 안이면서 가운데보다 높게 매겨지고 솎아도 노트가 `STALL_SHARE`(2%) 넘게 줄지 않으면 난이도 맞춤을 멈춘다. `select.Slot.src`는 캐시된다. |
| RUNAWAY 플레이 소감 | 생성기 0.9.30 · 분석기 1.8.1(`docs/PATTERN_DESIGN.md` 61장, 기본 기준만). `planner.roll_shapes`(`CHORD_JACK_MAX_HITS`, 빌드업 · 16분 롤에 chordJack 없음), `motifs.alternate_key`(긴 트릴 16타마다 이동), `rolls.find_rolls`(빠른 롤의 놓친 타격 하나), `sections.layout`의 `fits(…, params.peak_nps)`(롤 자리). `select.hold_cap` · `hold_count` · `mark_hold_count` → `Slot.hold_count` → `lanes.search`의 롱노트 레인 묶음, `ending.finish`(마지막 화음 상한만큼). `candidates._mark_quiet`(구간 드럼 비율) · `_echoes` · `_quiet_tails`(후보에서 뺌), `select.lone_sound`(동치 없음). `sections._cap_below_highlight`(`sectioned.highlightCap`), `sections.blueprint(label, system)`(`labelsBySystem`). `analysis/structure.label_sections`(`LEAD_IN_MARGIN`, 앞잡이 묶음). |
| 빌드업 롤 · 덜 잘게 나눈 구간 | 생성기 0.9.32 · 분석기 1.10.0(`docs/PATTERN_DESIGN.md` 64장). `rolls.find_rolls`(모든 타격과 대역마다의 줄기 `_runs`, 격자 밖 다른 소리 건너뛰기, `_qualify`의 `melodyPitchScatter` · `scatterMaxHarmonic` · `scatterLandingBeats`(빌드업만), 마디선마다 뒷부분 다시 보기, 겹치면 가장 긴 롤), `core` → `effects.camera_effects(…, rolls)`(`view.buildUpRollBeats` · `buildUpLandingBeats`), `ending.finish`(방금 친 레인 건너뛰기). `analysis/structure.boundary_scores`(`BOUNDARY_EVIDENCE`), `label_sections`(`HIGHLIGHT_MIN_BARS`). |
| 하이라이트 · 반복 묶기 | 분석기 1.9.0(`docs/PATTERN_DESIGN.md` 62장, 생성기 그대로). `analysis/structure.section_intensity`(음량 + 박마다 온셋 세기, `HIT_CAP_PERCENTILE`) → `find_sections(…, beat_strength)`, `label_sections`(`HIGHLIGHT_MARGIN` · `HIGHLIGHT_MATE_MARGIN`, 앞잡이 묶음 제외), `_segment_similarity`(`GROUP_SHIFT_BARS`). |
| 2개 동치 모양 (BMS) | 생성기 0.9.13(`docs/PATTERN_DESIGN.md` 29장). `motifs.pair_shape`: 2개 동치를 대칭·가운데 키와 이웃·가운데 키·한 손 붙음·한 손 띄움·양손 비대칭으로 나눈다. `motifs.motif_context`: `hands.chordShapes`(키 모드 → 모양 → [단계값, 값])를 채보의 단계값에서 읽어 `MotifContext.pair_shapes`에. `motifs._shape_cost`: 2개 동치에 그 모양의 값을 더한다. GRG 7K+1S만, 레벨 2·6·10·14 채보의 단계값에서 사람 채보의 모양별 몫에 맞춘 값 | pytest: 모양 이름, GRG 7K의 모든 단계에서 3+4가 3+5보다 비싸고, NORMAL은 1+3이 2+5보다 싸고 MASTER는 비쌈, DJMAX·GRG 5K는 모양 비용 없음 / 측정은 `docs/PATTERN_DESIGN.md` 29장 |
| 레인 사용 기억 (BMS) | 생성기 0.9.14·0.9.17(`docs/PATTERN_DESIGN.md` 30·34장). `lanes._Weights.usage_decay`(`hands.usageDecay`): 빔 서치 상태의 레인별 사용량이 슬롯마다 남는 비율. 레인 고르게 쓰기 비용(`usageBalance`)은 그 기억의 평균보다 많이 쓴 레인에 붙는다. 0.97(노트 33개 남짓)이고, 0.9.15에서 기본값으로 올려 세 기준이 함께 쓴다(32장) | pytest: 세 기준 모두 0.97 / 측정은 `docs/PATTERN_DESIGN.md` 30·32장 |
| 쉬운 채보의 16분 당김음 (BMS) | 생성기 0.9.20(`docs/PATTERN_DESIGN.md` 39·40장). 박자 위치 가중치를 `config/difficulty.json`의 `metrical.weights`로 옮기고, `candidates._hand_scores`가 16분 자리 후보 가운데 16분 뒤 자리에 후보가 없거나 더 약한 것(당김음)에 `metrical.push`를 곱한다. 손 점수에만 걸려 노트 고르기 모델의 몫이 1인 단계(EXPERT·MASTER)에는 효과가 없다 | pytest 1개(당김음 16분이 뒤가 더 센 16분의 push배) / 측정: 시드 둘 평균으로 레벨 2·6의 16분 몫 0.020 → 0.036 · 0.083 → 0.117(사람 0.079 · 0.153), 박자 격자 +2.3%p, 키 +2.1%p, 시각 F1 0.680 → 0.679 |
| 손 모양 되먹임 (BMS) | 생성기 0.9.21(`docs/PATTERN_DESIGN.md` 43장). 레인 빔 서치의 상태가 길마다 빠른 단타 줄기의 노트와 한 손 세 번째 이상 노트(`handRuns`), 꽉 찬 마디와 쏠린 마디를 세고(`lanes._feedback_counts`), 그 몫과 레벨별 목표(`hands.runTarget`)의 차이만큼 한 손 세 번째 노트에 보너스·비용을 준다(`hands.runFeedback`, 기본 기준 7K+1S에만 16). 마디 쏠림 쪽(`barTarget`·`barFeedback`)은 코드만 있고 꺼져 있다 | pytest 1개(빔의 셈이 가이드 지표 handRuns와 같은지) / 측정: 시드 둘 평균으로 전체 통계 77.1 → 77.8%, 레인 패턴 74.8 → 75.9%, 한 손 3연속 레벨 10 0.077 → 0.107(사람 0.114), 시각 F1 그대로; DJMAX·EZ2ON·다른 키 모드는 채보가 같다 |
| 레인 이동 n-gram (BMS) | 생성기 0.9.22(`docs/PATTERN_DESIGN.md` 44장). 사람 7키 BMS 채보의 이동 빈도표(`config/lane_moves.json`: 이전 키·그 키로 들어온 이동·박 위상·밀도 띠마다 다음 키의 수, 맞추는 곡의 합계만)를 `lanes.lane_move_logp`가 다듬어 읽고, 레인 빔 서치가 단타 뒤의 단타에 `hands.laneMoves` × (−log P)를 더한다. 굼벨 잡음으로 확률대로 뽑고(`laneMovesDraw`), 패턴 계획이 모양을 정하지 않은 노트에만 건다(`laneMovesFree`). 빔 상태가 마지막 키 순간(키·들어온 이동·시각)을 들고 간다 | pytest 2개(이동 갈래·박 위상 셈, 비용을 켜면 생성 채보의 이동이 사람 표에서 더 그럴듯함) / 측정: 이동 2순위 안 적중 0.384 → 0.503(사람 0.538), 전체 통계 77.7 → 78.1%(시드 둘 평균), 시각 F1 그대로; DJMAX·EZ2ON·다른 키 모드는 채보가 같다 |
| 롤 지그재그 · 레벨 14 이동 세기 (BMS) | 생성기 0.9.23(`docs/PATTERN_DESIGN.md` 45-1). `motifs.alternate_key`: `rolls.waveShare`(기준별 [단계값, 몫], `MotifContext.roll_wave`)의 몫만큼의 롤 길이는 손이 바뀔 때마다 한 키씩 더 벌어졌다가 좁아진다(3-5-2-6-1-7-2-6-3-5). 어느 롤인지는 타수로 정해 같은 필인은 같은 모양이다. `hands.laneMoves`가 [단계값, 값] 목록을 받는다(기본 기준: 레벨 10까지 0.5, 14에서 1.0) | pytest 1개(MASTER 롤의 키 순서, NORMAL·DJMAX는 천천히 벌어짐) / 측정: 레벨 14 트릴 몫 0.096 → 0.057(사람 0.059), 레벨 10 0.136 → 0.122(사람 0.119), 롤 안 트릴 레벨 14 0.555 → 0.022(사람 0.158) |
| 채보마다 드럼 키 (BMS) | 생성기 0.9.23(`docs/PATTERN_DESIGN.md` 45-2). `planner.drum_places`: `roles.drawnHomes`의 기준은 단계값 `minSkill`(0.35)부터 킥·스네어·하이햇의 키를 채보 시드로 사람 7키 채보의 홈 키 퍼짐(맞추는 곡의 채보별 집계, [단계값, 키 일곱 개의 가중치])에서 서로 다르게 뽑고, `planner._own_keys`가 리듬 자리 안에서 겹치지 않게 놓는다. 다른 기준은 킥 0.15·스네어 0.5·하이햇 0.85 자리. 기본 기준의 `roles.songHomeWeight` 1 → 1.5 | pytest 1개(시드마다 같은 뽑기, 스네어 키가 퍼짐, 6키로 옮길 때 겹치지 않음, NORMAL·DJMAX는 고정 자리) + 고친 1개(킥 왼쪽·하이햇 오른쪽은 EZ2ON과 기본 기준 NORMAL에서, HARD는 드럼마다 제 키) / 측정: 레벨 6·10 스네어 홈이 4번 키인 채보 0.47·0.49 → 0.14·0.19(사람 0.11·0.17), 0.9.23 전체(롤 지그재그 포함) 전체 통계 80.8 → 81.6%(사람 채보 레벨로 묶음)·레인 패턴 +1.6%p·레벨 2 시각 F1 0.438 → 0.447(시드 둘); DJMAX·EZ2ON은 채보가 같다 |
| 가운데 키 되먹임 (BMS) | 생성기 0.9.24(`docs/PATTERN_DESIGN.md` 46장). `lanes._feedback_counts`가 길마다 단타 사이 `MID_MS`(260ms) 이하 이동과 그 가운데 가운데 키를 드나드는 이동을 세고(`fb_moves`·`fb_mid`), `lanes._costs`가 그 몫과 `hands.middleTarget`의 차이에 `middleFeedback`을 곱해 계획 없는 단타(`pull_rule`)가 가운데 키로 들어올 때 덜거나 더한다. 단계값 `middleMinSkill`부터 | pytest 2개(셈: 멈춤 뒤·같은 키는 가운데 키 이동이 아님, 되먹임을 켜면 합성 곡의 가운데 키 몫이 오름) / 측정: 레벨 6 가운데 키 몫 0.244 → 0.271(사람 0.285), 전체 통계 81.8 → 82.1%(사람 레벨로 묶음, 시드 둘), 시각 F1 그대로; DJMAX·EZ2ON은 채보가 같다 |
| 쏠린 마디 되먹임 (BMS) | 생성기 0.9.25(`docs/PATTERN_DESIGN.md` 47장). `lanes._costs`의 쏠린 마디 보너스(`hands.barTarget`·`barFeedback`, 43장에서 만들고 꺼 두었던 것)를 단타에만 건다: 길의 바쁜 마디 가운데 좌우 30–70% 밖 몫이 목표보다 적으면 마디가 기운 손의 단타가 덜고 반대 손 단타가 더 낸다. 단계값 `barMinSkill`(0.35)부터, 기본 기준의 7K+1S에만 8 | pytest 1개(비용: 기운 손 단타는 싸지고 반대 손은 비싸지며 동치는 그대로, EASY는 꺼짐) + 고친 3개(드럼 루프의 쏠린 마디 한도 0.2 → 0.3, 가운데 키 되먹임 테스트는 이 되먹임을 끄고 잼, 기본 기준 HARD 드럼 자리는 시드 넷 평균으로) / 측정: 쏠린 마디 레벨 6·10·14 0.112·0.057·0.037 → 0.141·0.086·0.043(사람 0.163·0.094·0.043), 전체 통계 82.4 → 82.9%(사람 레벨로 묶음, 시드 둘), 레인 패턴 +0.8%p, 시각 F1 그대로; DJMAX·EZ2ON은 채보가 같다 |
| 스템 블록 동시 분리 | 기본 스템 분리의 15초 블록을 CPU 수보다 하나 적게(최대 4개) 스레드로 동시에 나누고 곡 순서대로 더한다(한 블록씩 나눌 때와 비트 단위로 같다). 블록의 중간 배열을 일찍 놓고, 뒤 블록이 더 닿지 않는 구간부터 바로 float32 스템에 써서 곡 길이 float64 누적 배열을 두지 않는다 | 4코어 클라우드: 데모 곡(93초) 분리 5.8 → 2.6초, 4분 곡 16.4 → 6.6초, 최대 메모리(tracemalloc) 449 → 465MiB(한 블록씩이면 257MiB). 에디터 E2E의 첫 플레이 오버레이 6.1 → 3.1초(3회 중앙값) / pytest: 동시 분리 = 한 블록씩 분리(바이트 비교), 스템·분석 결과를 이전 코드와 바이트 단위로 비교 |
| 노트 기준점 · 평면 카메라 · 판정선 (숙련 플레이어 점검) | `render/layout.noteSpan`(탭은 제 시각에 가운데, 롱노트는 탭의 앞뒤 끝까지), 직교 카메라 PLANE(`PlaneCamera`), `frameCamera`로 줌·기울기 중에도 판정선 고정, 바닥만 안개(`fogStart`), 일정한 FEVER 색, 레일 안의 타격 효과와 `hitEffectSize`, 모든 기본 스킨에 네온의 판정선(노트 높이, 6px, 빛), 기어 가장자리 1.5px·`rowDrop`, 기어를 피하는 곡 정보 판(`Hud.fit`, `CameraFx.peak`) | Vitest: SPEED 2/4/8·노트 깊이 3가지에서 탭·롱노트 끝이 판정선을 지나는 시각, 줌·기울기·LIFT 중 판정선 가운데, 모든 카메라의 트랙 끝, 평면의 평행 레일·같은 빠르기(16:9·4:3·21:9), 안개 몫, 판정선 77%, 표시등이 네온보다 가깝지 않음, `infoRoom` / E2E: 평면·작게·끄기·카메라 연출 최대·LIFT 플레이 |
| 노트·기어·이펙트 개편 · 부위별 선택 | 비슷한 직사각형 노트 7종(글로스·얇은·외곽선·칩·보석 컷·필·주얼)을 지우고 메카 챔퍼·원형·별 4각·별 5각 계열과 계열마다 몸통만 있는 롱노트(레일·캡슐·별빛), 도트 매트릭스 사이드 노트, 기어 4종(콘크리트 슬래브·에이비오닉스·카세트 데크·그랜드 피아노), 타격 효과 4종(임팩트 웨이브·스파크·LED 그리드·셔터, 판정선 아래만), 설정 → 기어의 부위별 선택. 시안은 Gemini로 만들고 사용자가 고른 것만 코드로 다시 그림 | Vitest: 예전 노트·롱노트 이름 읽기, 기본 스킨의 노트·롱노트 계열, `withParts`(롱노트가 노트를 따름·나머지는 스킨 그대로·예전 사용자 스킨), `sanitizeParts`, 설정 `parts`와 `skinOf`, 기어 14종의 표시등이 네온보다 가깝지 않고 줄 안에 있음 / E2E: 설정에서 부위를 고르면 스킨 모양 이름이 줄에 나오고 저장되며 플레이 캔버스의 `data-style`이 고른 대로, 스킨 그대로로 되돌리면 스킨대로 / 스크린샷: 기어 4종 장면 4장과 부위별 선택 설정 |
| 노트 색 · 롱노트는 노트를 따름 | 설정 → 기어의 롱노트 줄을 지우고(롱노트는 늘 노트의 계열, 스킨 JSON의 롱노트도 읽지 않음) 사이드 노트 모양에서 "스킨 (노트와 같게)"를 지움. 설정 → 노트 색: 키 모드마다 레인별 색을 가진 프리셋(기본·오로라·앰버·좌우 손·내 프리셋), 색 상자·색상 막대·HEX·색상/채도/밝기 줄, 고르는 동안 미리보기에 바로(`setLaneColors`), 게임에 든 프리셋을 바꾸면 내 프리셋으로 복사, 이름·삭제(두 번 누름), 모두 초기화가 내 프리셋을 남김. 에디터 레인도 같은 색 | Vitest: 프리셋이 모든 키 모드의 레인에 색을 주고 팔레트·스킨의 레인 색과 겹치지 않음, 좌우 손의 손별 색, 기본은 스킨 색·없는 프리셋은 기본, 새 프리셋 번호·한 레인만 바뀜, 저장 형식 정리(빠진 레인은 기본 팔레트 색, 20개까지), HEX 읽기·HSV 왕복, 견본 글자색, 설정 `noteColors`·`colorPresets`·`laneColorsOf`·초기화, `sanitizeParts`(예전 롱노트·`side: skin`) / E2E: 프리셋을 고르면 미리보기가 그 색, 키 모드 바꾸기, ←→ 레인·↓ 색상 Shift+→로 내 색 1이 생기고 원래 프리셋은 그대로, HEX를 넣는 동안 미리보기에만 보이고 Enter로 저장, 색 상자를 끄는 동안 미리보기만 바뀌고 놓으면 저장, 이름 바꾸기, 플레이 캔버스의 레인 색, 새 프리셋으로 저장, 모두 초기화 뒤에도 남음, 두 번 눌러 삭제, 패드 d-pad로 레인을 옮기고 색상을 바꿈(RB가 기어 → 노트 색 → 연출·배경); 롱노트 줄이 없고 사이드 노트 모양이 노트와 같게·도트 매트릭스 둘뿐 / 스크린샷: 노트 색 탭 |
| HUD | 게이지 내림, 진행 바·남은 시간·BPM, 플레이 방식·판정 칩과 로딩 카드의 규칙 칩, FAST/SLOW 색·크기, 한 번만 쓰는 토스트, READY 시각과 Enter 건너뛰기, 점수 규칙 단위의 페이스메이커(내 최고 기록은 리플레이를 다시 판정), 줄마다 크기를 정하는 점수판(`uprightAt`), 판정·콤보 불투명도·판정 카운터, 곡 끝 1.5초 페이드아웃 | Vitest: 게이지 내림, SPEED·커버·남은 시간·ms 표기, 규칙 칩·페이스메이커 목표, 리플레이 다시 판정 점수, `timeAt`·`bpmChanges`, 똑바로 선 글자 / E2E: 싱크 테스트의 칩·카운터·페이스·토스트·일시정지 ↑↓·READY·F2, 4:3·8K·LOW·LIFT 0.3의 점수판 크기, 무음 인트로 건너뛰기 |
| 내 키 · 패드 버튼 · 곡 오프셋 | `input/playKeys.ts`(플레이 중 기능 키를 Ctrl·Alt·Shift와 지정, LIFT는 Alt+PageUp/PageDown, 키 반복 무시), 보조 키(`secondBindings`), `input/padPlay.ts`(Start·Select·FEVER), 턴테이블 감도·정지 판정, 비표준 패드의 메뉴 버튼(`padMenu`), 곡 오프셋(`songOffsets`, − / =), 창을 벗어나면 일시정지, 연습 리드인; 설정의 키 설정·게임패드 탭(차례로 지정, 겹침 표시, 고정 키 안내), 곡 정보·도구의 곡 오프셋 | Vitest: 플레이 키 매칭·반복·수정 키·Shift 레인과의 겹침, 패드 버튼, 8비트 턴테이블·감도·떨림, 축 방향, 비표준 패드 메뉴, 설정 정리, 리드인 / E2E: LIFT·곡 오프셋 키, 길게 누르기, blur·hidden 일시정지, 패드 버튼·비표준 패드, 차례로 지정·보조 키·겹침 표시 |
| 선곡 | 패널(Space·I)의 줄 이동·탭 줄·패드 버튼, 설정과 같은 규칙 줄(`RuleRow`), 숨긴 곡은 고르지 않음, 목록 키(F2·F3·F6·PageUp/Down·Home/End), 정렬 4가지와 풀콤 미달 폴더, 900px 이상의 채보 요약; 모든 난이도 레벨(`brief`, `ui/chartCache.ts`), F5 패턴 기억(`patterns`), 채보별 기록과 고르기, 모양으로 구별하는 램프(`ui/lamps.tsx`), 가져온 채보 항목(`chartPicks`, 원본 레벨), 커버, 분석 실패 이유, 연습 미니맵 키와 채보마다 연습 기억; 3초마다 다시 연결하는 오프라인 패널 | Vitest: 폴더·정렬·커서·랜덤·폴더 키·패널 줄 이동, 채보 저장소(같은 요청 한 번·실패 기억·보관 개수), 패턴 정리, 램프와 난이도 색의 거리(ΔE76 17 이상, 두 팔레트), 분석 실패 이유, 그림 이름 찾기 / pytest: brief, 기록의 새 항목, 커버, BMS·osu! 커버와 원본 레벨 / E2E: 패널·패드·검색·목록 키, 1080 요약, 계산 중, 패턴 기억, 기록에서 고르기, 가져온 채보 항목, 커버, 분석 실패, 오프라인 재연결 |
| 결과 | 점수 규칙의 대표 숫자와 판정 모드별 기록 비교(`byMode`), 끝까지 친 판의 최소 BREAK, 기록 태그·차이·램프 갱신·다음 등급, 그 판의 판정 창으로 그린 타이밍 그래프, 곡 흐름 띠의 게이지와 점수가 깎인 곳, 0.6초 입력 가드, 한 번만 적용하는 오프셋 제안(전체 / 이 곡에만, 되돌리기, 플레이 중 바꾼 오프셋 반영), 리플레이의 녹화 때 오프셋, R·F2 같은 배치·Shift+R 새 배치, NOTES 줄, 반복 연습의 LOOP 알림과 마지막 반복의 결과 | Vitest: 기록 비교·BREAK 차이·램프 비교·다음 등급·오프셋 제안·판정 창·점수가 깎인 곳 / pytest: `byMode`, 최소 BREAK(`failedAtMs`) / E2E: 입력 가드(키·패드), 같은·새 배치, 늦게 친 플레이의 오프셋 제안·되돌리기·F7, 리플레이 결과, 첫 기록 태그와 NOTES, LOOP 알림 |
| 싱크 도구 · 설정 · 데스크톱 · 에디터 | 캘리브레이션 2단계(판정 오프셋 측정 / 표시 오프셋 맞추기: 플레이 렌더러의 기어, `ui/visualSync.ts`), 직접 치는 싱크 테스트(`syncTestKeys`); 두 번 눌러 초기화와 10초 되돌리기(`resetSettings`), 2방향 화살표 이동(`ui/gridNav.ts`), 탭별 힌트, 화면 모드(`ui/displayMode.ts`); 데스크톱 창 상태와 첫 포트(`desktop/windowState.js`), `GRG_SHUTDOWN_TOKEN`·`POST /api/shutdown`, 게임 출처의 HTTP 캐시만 비움; 에디터 상단바·도구 한 줄·편집 메뉴·레인 머리·BPM 눈금, 에디터 테스트(`playedSettings`) | Vitest: 표시 단계 노트 배치·오프셋 한 걸음, 싱크 테스트 키, 화살표 이동, 화면 모드, 초기화가 남기는 것, 에디터 테스트 설정 / node --test: 창 상태 / pytest: 종료 경로(토큰이 맞을 때만) / E2E: 두 단계와 측정 중 Esc, 직접 치는 싱크 테스트(7K+1S는 [ ]), 초기화·되돌리기·화살표 이동·화면 모드, 에디터 메뉴·레인 머리 |
| 사이드 노트 반쪽 덮기 | 설정 `sideNotes`(`lanes` 기본 / `half`), `computeTrackGeometry`의 반쪽 덮기 레인, 반투명 막대(그리는 순서, 깊이를 쓰지 않음, 탭은 앞뒤로 0.18), 그 절반의 타격·키 빔, 기어의 사이드 막대(`deckRows`, `SIDE_PAINT`, `lowerTop`), 설정·선곡 미리보기와 측정 화면의 기어, 플레이 캔버스의 `data-side-notes` | Vitest: 반쪽 덮기 레인 자리(레인 순서를 뒤집어도), 사이드 막대가 줄 아래·화면 안, 설정 정리 / 별도 레인과 사이드 없는 모드의 TrackRenderer 프레임 154장이 이전과 픽셀 단위로 같음 / E2E: 설정·선곡의 행과 미리보기, 6K+FX 싱크 테스트의 FXL 막대 |

### Phase 4 결과

| 항목 | 구현 | 검증 |
|---|---|---|
| 채보 에디터 | 세로 타임라인 캔버스(마디 번호·파형), 스냅 1/4–1/64, 놓기·롱노트·옮기기·길이·범위 선택·복사/잘라내기/붙이기·미러·되돌리기, 재생(타격음·키음), 실시간 입력, 커서부터 테스트 플레이(연습 모드로 돌고 에디터로 복귀), 저장(새 `edited` 채보) | Vitest 6개(스냅, 겹침 거부, 원자적 이동, 되돌리기, 박 단위 붙이기, 미러) / pytest: 저장·재저장 같은 ID·구조 오류 422·삭제 / E2E: 놓기·지우기·되돌리기·저장·테스트 플레이 후 복귀 |
| 내보내기 | osu!mania v14(모든 모드, SpecialStyle·`grg-mode` 태그), BMS(.bme/.bms, 첫 박 앞 마디, #BPMxx·#STOPxx, LNTYPE 1, 마디마다 0.5ms 이내 최소 해상도), bmson 1.0.0(해상도 960) | pytest: 생성 채보를 내보내 다시 읽으면 노트가 같음 — osu! ≤ 0.5ms(정수 ms), BMS ≤ 0.01ms, bmson ≤ 0.5ms |
| 가져오기 | osu!(빨간 타이밍 포인트, 잘린 마디), BMS(BPM 03/08, STOP, 마디 길이, LNTYPE 1·LNOBJ, #RANDOM/#IF, DP·PMS 거부), bmson(슬라이스 `c`, 겹친 채널), Shift_JIS·EUC-KR·UTF-8 판별, zip 이름 인코딩, 겹친 노트 정리 | pytest 9개(타이밍·STOP·롱노트·#RANDOM 고정, 모드 배치, 인코딩, bmson 슬라이스, osu! 배치·마디, API 가져오기·재가져오기 같은 곡, .osz 음원 사용, 실패 보고) |
| 키음 플레이 | 서버: 키음 디코딩 → 전체 믹스(곡 음원, 클리핑 없게 게인) + 키음 묶음 파일. 클라이언트: BGM을 OfflineAudioContext로 렌더해 곡 버퍼로, 노트 소리는 누를 때(빈 누름은 그 레인 다음 노트, 다음 노트가 없으면 마지막 노트), 오토 플레이는 노트 시각에 예약, 같은 소리는 다시 날 때 이전 것을 끊음 | pytest: 렌더한 곡의 킥이 BMS 박 위치에(1900ms 무음, 2000ms 소리), 분석 BPM 120 / E2E: BMS 폴더 가져오기 → 키음 오토 플레이 PERFECT PLAY |
| 리플레이 | ReplayRecorder / ReplayPlayer, 기록과 함께 저장, 결과 화면·최고 기록·파일에서 보기 | Vitest: 지연된 입력·흔들리는 프레임으로 친 판을 다른 프레임 간격으로 재생해 결과 객체가 완전히 같음 / E2E: 키보드로 친 판의 리플레이가 같은 점수·정확도 / pytest: 저장·최고 기록 리플레이·잘못된 데이터 422·곡 삭제 시 정리 |
| 게임패드 | 2ms 간격 폴링(브라우저 하한 약 4ms), `Gamepad.timestamp` 판정, 버튼·축 방향·턴테이블, 레인별 지정, 메뉴 브리지, Start 일시정지 | Vitest 7개(타임스탬프 사용·오래된 값 대체, 축 방향, 턴테이블 누름·방향 전환·멈춤, 축 끝 넘김, 정지 시 떼기, 키보드와 함께 한 레인) / E2E: 가짜 패드로 레인 지정·B로 메뉴 나가기 |
| 데스크톱 | PyInstaller(기본 분석, 282MB) + Electron 44 셸, 빈 포트(지금은 첫 실행의 포트를 계속 씀, 위 "그 뒤")·사용자 데이터 폴더·종료 시 서버 정리, 빌드 스크립트 | Windows(GitHub Actions `windows-latest`): NSIS 설치 파일(180MB) 빌드 → 번들 서버 단독 실행(데모 곡 분석·채보 생성·MP3 업로드) → 무인 설치 → 설치된 앱을 Playwright Electron 드라이버로 실행해 데모 곡 분석·채보 미리보기·오토 플레이 확인. Linux: 같은 확인을 Xvfb에서. GPU 없는 환경에서 WebGL 컨텍스트를 못 만들던 문제를 여기서 찾아 소프트웨어 렌더러 허용으로 고침. macOS dmg는 미검증 |

### Phase 3 결과

모든 측정은 코드로 합성한 곡(드럼·베이스·리드 멜로디를 따로 만들어 섞은 것이라 스템 정답이 있음)에서 했다.

| 항목 | 구현 | 검증 |
|---|---|---|
| 스템 분리(기본 DSP) | HPSS + 배음 빗살 마스크(베이스는 배음 합 f0 추적, 보컬·멜로디는 지배 f0), 저역 타격 직후의 드럼 몸통 마스크, 스테레오 중앙 가중. 마스크 합이 1이고 other = 원음 − 나머지 | pytest: 4스템 합 = 원음(오차 < 1e-4), 정답 스템과 상관 드럼 0.89 · 보컬 0.95 · 베이스 0.47, SDR 드럼 5.6 · 보컬 9.2 · 베이스 0.8 · other −0.8 dB |
| ML 백엔드 | Demucs · beat_this · basic-pitch · allin1 어댑터, 단계별 대체, 버전·오류 기록, 설정 화면 상태표 | pytest: 가짜 라이브러리로 결과 변환·실패 대체 / 실제 라이브러리(Python 3.11, CPU): Demucs SDR 드럼 24.8 · 베이스 13.3 dB, beat_this 박 오차 중앙값 5ms·다운비트 일치, basic-pitch 노트가 온셋 음높이에 반영. 4분 곡 분석 242초(기본 18초). **allin1은 실제 라이브러리로 검증하지 않음** |
| 온셋 악기 태깅 | 스템별 로그 스펙트럴 플럭스를 각 스템의 p95로 정규화해 온셋마다 주 스템(`source`)과 비율(`sources`), 구간마다 주도 스템(`leader`) | pytest: 드럼만 친 온셋의 70% 이상이 drums, 리드 온셋의 60% 이상에서 보컬·other 비율 ≥ 0.25 |
| 악기별 레인 매핑 | 드럼·베이스가 뚜렷한 타격(지배도 0.4 → 0.7 사이 선형)에만 킥 왼쪽·하이햇 오른쪽·베이스 왼쪽 비용 항. 음높이 있는 소리는 기존 음높이 → 레인 매핑 | pytest: 세기 1에서 하이햇 평균 레인 − 킥 평균 레인 > 0.25(건반 폭 0–1 기준), 세기 0보다 0.2 이상 큼(측정: 세기 0 −0.03, 0.6 0.41, 1.0 0.43, 왼손 부담 0.54 → 0.58) |
| 반복 구간 일관성 | 같은 그룹 두 번째 이후 구간의 슬롯을 첫 구간의 같은 박 위치 슬롯에 대응시켜, 다듬기 패스에서 같은 레인을 고르면 보너스(`variant: mirror`면 반복마다 좌우 반전). 생성기 0.5.0의 구간 엔진은 대신 재료 단위로 노트를 정하고 레인을 복사한다(이 옵션이 복사의 세기) | pytest: 켜면 일관성 ≥ 0.9, 끈 채보보다 0.2 이상 높음(측정: 켜면 0.98–0.99, 끄면 0.35–0.69). 멜로디가 반복마다 다른 곡에서는 0.6–0.94 |
| 스템 키음 | (이후 노트별 키음으로 바뀜, 아래 "그 뒤") 키음 스템 = 노트의 `src`가 가장 많이 따르는 음높이 스템(15% 미만이면 드럼). 미스에 −14dB 덕, 맞히면 복귀 | E2E: 키음 HUD 표시, 키음 켠 채 오토 PERFECT PLAY |
| 카메라 연출 | 채보 `effects`: 에너지가 0.25 넘게 오르는 구간 시작에 줌, 에너지 0.7 이상 구간마다 좌우 교대 기울기 | Vitest: smoothstep 기울기·줌 감쇠·세기 0 / E2E 스크린샷 |
| 배경 | 흐린 앨범아트 · 스펙트럼 · BGA 동기 · 밝기 · 유튜브 BGA | E2E: 합성 VP8 영상이 곡 시간에 맞춰 재생(9초 시점 재생 위치 > 1초), 비주얼라이저 캔버스, 유튜브 링크(가짜 IFrame API로 영상 ID·개인정보 보호 호스트·음소거·재생·일시정지 확인), 트랙이 기울면 콤보·판정 글자도 기움 / Vitest: 유튜브 동기(시작·일시정지·어긋남), HUD 회전 / pytest: 유튜브 링크 형식, 영상 파일과 서로 대체 |
| 스킨 | 기본 4종 + JSON 사용자 스킨(검증 후 기본값으로 채움) | Vitest: 잘못된 값 거르기·팔레트 우선 / E2E: 사용자 스킨 적용 후 플레이 |

### Phase 2 결과

| 항목 | 구현 | 검증 |
|---|---|---|
| 5K · 6K · 8K · 사이드(FX) 레인 | 키 모드 7종. 사이드 노트는 서스테인 소리 위 롱노트 위주(60%) + 강한 타격 탭, 저역은 왼쪽·고역은 오른쪽 | pytest: 7모드 × 5난이도 린터 통과·레벨 단조, FX 롱노트 존재 / Vitest: 7모드 싱크 테스트 오토 PERFECT PLAY |
| 점수 규칙(룰셋) · FEVER | `engine/ruleset.ts`, `engine/fever.ts` | Vitest: EX-SCORE·등급형 환산, BAD 콤보 끊김, FEVER 자동·수동·배율 / E2E: EX-SCORE AAA, FEVER 보너스 |
| 게이지 6종 · 램프 8종 | 생존형은 0%에서 곡 중단 | Vitest: HAZARD 즉시 실패 후 판정 중지, HARD CLEAR / E2E: HAZARD FAILED |
| 배치 옵션 | MIRROR · RANDOM · R-RANDOM · S-RANDOM · H-RANDOM (시드 고정 PRNG, 스크래치 고정, 사이드 좌우 교환) | Vitest: 매핑·결정성·회전·플레이 가능성, H-RANDOM 연타 0 |
| 레인 커버 · 가시 시간 | SUDDEN+ · HIDDEN+ · LIFT, 녹색 숫자 유지, 시간/BPM 연동 스크롤, 플레이 중 단축키 | Vitest: 녹색 숫자 계산·유지, BPM 연동 속도 / E2E: 커버·LIFT 상태로 오토 PERFECT PLAY |
| 연습 모드 | A–B 구간(미니맵 드래그, 마디 단위), 0.5~1.5배 WSOLA(음정 유지, 웹 워커), 반복 | Vitest: 길이 1/r·주파수 유지·채널 정렬 / E2E: 0.75배 오토 100% |
| 결과 분석 | 게이지 그래프, 밀도 + BREAK 표시, 타이밍 산점도, 히스토그램 + 중앙값, 절사 평균 오프셋 추천 | E2E 스크린샷 |
| 난이도 산정 · 생성 옵션 | 손별 strain 항, 스킬 지표 개선(런·LN 커버리지·리듬 엔트로피), 스타일 7종과 개별 덮어쓰기 | pytest: 스타일별 스킬 지표 방향, 덮어쓰기 한계 |
| 미니맵 · 접근성 | 채보 전체 미니맵(구간 선택 겸용), 키 동시 입력 테스트, 판정 위치, 번쩍임 줄이기, 색각 보정, 페이스메이커 | E2E: 동시 입력 4/4, 팔레트 클래스 |

### Phase 0–1 결과

| 완료 조건 | 결과 |
|---|---|
| 오토 플레이(실제 입력 경로) 전 노트 MAX 100% | 싱크 테스트 4K·7K+1S, 생성 채보 모두 PERFECT PLAY (Playwright) |
| 캘리브레이션 평균·표준편차 표시, 오프셋 적용 | 캘리브레이션 화면(지금의 판정 오프셋 측정) + 결과 화면 오프셋 추천 |
| 고정 BPM 합성 음원 그리드 누적 오차 ≤ 10ms | 최대 1.4ms (97·128·140·174 BPM), 템포 변화 곡 1.3ms |
| 같은 입력·시드 → 같은 채보 | pytest로 검증, 기본 시드는 오디오 해시에서 파생 |
| 모든 난이도 채보가 린터 통과 | 4K·7K+1S × 5단계 × 2곡 |
| 난이도가 오를수록 노트 수·평균 NPS·레벨 단조 증가 | pytest로 검증 |
| 4분 곡 분석 30초·재생성 3초 이내 | Phase 3 기준(스템 활동량 포함, ML 없이) 분석 18.0초, 재생성 0.8~2.1초(7K+1S MASTER가 가장 느림). Phase 2는 분석 약 15초. 생성기 0.4.1(패턴 엔진) 재생성 0.9~2.7초(8K MASTER가 가장 느림, GENERATION 6장). 생성기 0.5.0(구간 엔진) 0.3~1.4초(6K+FX MASTER가 가장 느림) |

### Phase 0 — 설계와 기술 검증

1. 이 문서, 폴더 구조, 공용 설정(`config/`)
2. 클라이언트 엔진: DJMAX 판정표, 레인별 노트 처리, 롱노트, 콤보, 점수, 게이지, 오토 플레이 + 유닛 테스트
3. 오디오 클럭(출력 타임스탬프 매핑), 키보드 입력(`event.code`, `event.timeStamp`)
4. Three.js SDVX식 트랙: 판정선, 레인, 노트, 롱노트, 키 빔, 타격 이펙트, 마디선, HUD
5. 싱크 테스트(클릭 트랙 + 채보를 브라우저에서 합성)와 오프셋 캘리브레이션 화면(지금의 판정 오프셋 측정)
6. 검증: 오토 플레이가 실제 입력 경로를 거쳐 전 노트 MAX 100%(Playwright), 캘리브레이션이 평균·표준편차 표시

### Phase 1 — MVP

1. 서버: 업로드·표준 FLAC·태그/커버, SQLite 라이브러리, 백그라운드 분석 작업, API
2. 기본 분석: STFT·멜 스펙트럼, 멀티밴드 스펙트럴 플럭스 온셋, HPSS, 템포 추정과 고정 BPM 그리드 정밀 맞춤(드리프트 검사), 다운비트, 지속음, 구간·에너지·반복 묶기, 음높이 윤곽
3. 생성기: 양자화, 후보 점수화, 밀도 제어, 손가락 모델 기반 레인 배치(빔 서치), 롱노트, 스크래치, 린터, 레벨 산정 루프, 결정적 시드
4. 클라이언트: 곡 목록·업로드·분석 진행률, 키 모드·난이도 선택, 생성 미리보기(노트 수·레벨·NPS 그래프), 플레이, 결과(히스토그램·오프셋 추천), 설정, 기록 저장
5. 개발 도구: 분석 결과 시각화, 생성 CLI
6. 검증: pytest(그리드 오차 ≤ 10ms, 결정성, 린터, 난이도 단조성, 성능), Vitest, Playwright E2E(업로드 → 생성 → 오토 플레이 → 결과)

## 10. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 판정 범위 수치가 실제 DJMAX와 다를 수 있음 | 모든 값을 설정 파일로 분리하고 출처를 기록. 더 정확한 실측값이 나오면 설정만 교체 |
| 블루투스·OS 믹서 지연 | 오디오 출력 타임스탬프 매핑 + 판정 오프셋 측정·표시 오프셋 맞추기 + 결과 화면 오프셋 추천 + 곡 오프셋 |
| 비트 추적 지터로 채보가 흔들림 | 고정 BPM 가설을 전곡 온셋 정렬로 정밀 추정, 드리프트가 클 때만 가변 템포 |
| 원근 때문에 먼 노트 가독성 저하 | 카메라 프리셋, 트랙 끝 안개, 마디선, 배속 조절 |
| 헤드리스 테스트 환경에서 오디오 출력이 없음 | 오디오 클럭 대체 경로를 두고, E2E는 오토 플레이로 판정 경로만 검증 |
