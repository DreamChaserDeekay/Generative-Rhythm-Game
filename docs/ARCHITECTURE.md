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
| 키 모드 | 4K · 4K+FX · 5K · 6K · 6K+FX · 7K+1S · 8K. FX는 양 끝에 DJMAX식 사이드 트랙 2개(L-Shift / R-Shift). |
| 판정 기본값 | NORMAL. 설정에서 HARD / MAX JUDGEMENT 선택. |
| 게이지 | 기본 NORMAL(중간 실패 없음, 끝날 때 80% 이상이면 CLEAR). ASSIST EASY · EASY · HARD · EX-HARD · HAZARD 선택. |
| 배속 정의 | 배속 1.0 = 노트가 트랙 끝에서 (LIFT 없는) 판정선까지 5000ms. 기본 배속 4.0(1250ms). 녹색 숫자 = SUDDEN+ 아래로 노트가 나타난 뒤 판정선까지의 시간. |
| 룰셋 표기 | 판정 범위는 하나(DJMAX)로 두고, 표기·점수·콤보 규칙만 프리셋으로 바꾼다(정밀 % / 등급형 / EX-SCORE). 실제 EZ2ON·BMS 판정 폭을 흉내 내지 않는다. |
| 표준 오디오 | 44.1kHz 스테레오 16bit FLAC. 분석과 재생이 같은 PCM을 쓴다. |
| 데이터 위치 | 저장소 루트의 `data/` (환경 변수 `GRG_DATA_DIR`로 변경 가능, git에서 제외). |
| 판정 범위 수치 | MAX 100%(±41.67ms)만 정설이고 나머지는 커뮤니티 실측 추정·보간값이다. `config/judgement.json`에 출처와 함께 둔다. |
| ML 백엔드 | 기본 분석(numpy·scipy)이 항상 동작한다. Demucs(스템)·beat_this(박·다운비트)·basic-pitch(음높이)·allin1(곡 구조)는 선택 설치형으로, 설치되어 있으면 단계마다 자동으로 쓰고 실패하면 그 단계만 기본 분석으로 대체한다. PyTorch 등 수 GB 의존성과 라이선스 때문에 기본 설치에 넣지 않는다. |
| 스템 | 드럼 · 베이스 · 보컬 · 그 외(other) 4개(Demucs와 같은 구성). ML이 없으면 기본 DSP 분리를 쓴다. 품질은 낮지만 온셋 악기 태깅과 키음에는 충분하다. |
| 생성 채보 키음 | DJMAX처럼 노트마다 그 노트가 따르는 스템(`src`)의 소리를 낸다. 소리 조각은 그 노트부터 같은 스템의 다음 노트까지(최대 4초)라 박 단위로 어색하게 끊기지 않고, 다 맞히면 원곡과 같은 소리가 된다. 놓치거나 BREAK면 그 조각만 빠진다. 빈 누름(고스트 노트)과 BREAK가 된 누름은 그 레인의 다음 노트(없으면 마지막 노트) 조각의 앞부분(최대 0.3초)을 곡 소리 위에 따로 내고, 곡의 조각은 끊지 않는다. 곡 시간·판정은 믹스 그대로다. |
| 난이도 기준 | 기본 5단계 외에 DJMAX RESPECT V(NM · HD · MX · SC, Lv.1–15, SC는 별도 척도)와 EZ2ON REBOOT : R(EZ · NM · HD · SHD, Lv.1–20)의 난이도 이름·레벨 척도를 고른다(기본값 DJMAX). 레벨별 밀도와 난이도별 경향은 공개 채보 목록의 집계 값(노트 수 ÷ 곡 길이 중앙값, 그루브 지표)으로 맞추고, 채보 내용은 쓰지 않는다. |
| 패턴 배치 | 노트를 하나씩 놓지 않고 악구마다 음악의 몸짓(상행·왕복·반복음·분산화음·페달·드럼)을 읽어 모양(계단·트릴·롤·앵커 …)과 동치 질감을 정한 뒤, 레인 빔 서치가 그 모양을 따르게 한다. 다른 게임의 채보 내용은 쓰지 않고, 공개 지표·공개 설명과 디자이너 원칙으로 만든다. 예전 방식(`patternEngine: "classic"`)은 비교용으로 남긴다. |
| 카메라 연출 | 채보에 들어 있는 `effects`(구간 에너지에서 생성)로 트랙 기울기(카메라 roll)와 줌(FOV)만 바꾼다. 노트 시간·판정선·레인 순서는 바뀌지 않는다. |
| BGA · 스킨 | BGA는 사용자가 곡마다 올리는 mp4·webm이나 유튜브 링크(소리 없이 곡 시간에 맞춰 재생). 유튜브는 내려받지 않고 유튜브의 공식 퍼가기 플레이어(IFrame Player API, 개인정보 보호 모드 youtube-nocookie.com)로 재생한다(유튜브 약관상 내려받기는 쓰지 않는다). 기본 4종 스킨은 색·모양 파라미터로만 만들고, 글래스·크리스털·메탈·젤 스킨은 이 저장소를 위해 생성한 그림(`assets-src/`, 출처 `assets-src/PROVENANCE.md`)을 텍스처로 쓴다. 사용자 스킨은 JSON이다. 다른 게임의 에셋은 쓰지 않는다. |
| 채보 에디터 | 노트만 편집한다(템포·박자·키음 목록은 원래 채보를 따른다). 같은 레인에서 노트가 겹치는 편집은 거부한다. 저장하면 원본은 두고 새 채보(`edited`)로 남기며, 생성 채보용 플레이어빌리티 린터 대신 구조 검사만 한다(사람이 일부러 만든 어려운 배치를 막지 않기 위해). |
| 가져오기 | osu!mania는 들어 있는 음원을 그대로 곡으로 쓴다. BMS·bmson은 키음을 섞은 음원을 만들어 곡으로 등록한다(분석·자동 생성도 되게). BMS #RANDOM은 파일 내용에서 정한 하나의 분기로 고정하고, DP·PMS·osu! SV는 지원하지 않는다. 키음은 플레이할 때 BGM만 깔고 노트를 칠 때 낸다. |
| 내보내기 | 음원은 넣지 않고 파일 이름만 적는다. BMS·bmson은 5K · 7K+1S만(BMS 플레이어에 다른 배치가 없음), osu!mania는 모든 모드. |
| 리플레이 | 키 입력 기록이 아니라 **판정 엔진에 들어간 호출 순서**(누름·뗌·변화가 있었던 프레임 갱신·FEVER)를 저장한다. 같은 순서로 다시 넣으면 프레임 속도와 무관하게 결과가 정확히 같다. |
| 게임패드 | 웹 게임패드 API는 이벤트가 없어 폴링해야 한다. 화면 프레임과 따로 짧은 간격으로 읽고, 판정 시각은 `Gamepad.timestamp`(브라우저가 패드 신호를 받은 시각)를 쓴다. 턴테이블은 축의 움직임(방향 전환·멈춤)으로 스크래치를 만든다. |
| 데스크톱 | Electron + PyInstaller로 묶은 서버. Tauri는 macOS·Linux에서 WebKit을 쓰는데, 싱크의 기준인 `getOutputTimestamp()`·`outputLatency`가 Chromium과 다르게 동작할 수 있어(품질 우선순위 1번) 테스트한 엔진과 같은 Chromium을 싣는 쪽을 골랐다. 대신 용량이 크다(압축 전 약 570MB). |

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
- 채보 요청(키 모드, 난이도, 시드) → 생성기 ⇄ 난이도 산정 루프 → `Chart` JSON 캐시 → 클라이언트.
- 클라이언트는 표준 FLAC을 받아 `decodeAudioData`로 디코딩해 재생한다. 채보의 `t`는 이 PCM의 첫 샘플이 0ms다.

## 4. 시간 모델

리듬게임에서 가장 중요한 부분이라 규칙을 명시한다.

- **곡 시간(song time)**: 표준 오디오의 재생 위치(ms). 스피커에서 *지금 들리는* 샘플 기준이다.
- **오디오 클럭이 유일한 기준**이다. `AudioContext.getOutputTimestamp()`가 주는 `(contextTime, performanceTime)` 쌍으로 `performance.now()` 시간축을 오디오 출력 시간으로 매핑한다. 쌍이 갱신될 때마다 오프셋을 지수 평균으로 다듬어 지터를 없애고, 50ms 이상 튀면(일시정지·장치 변경) 즉시 다시 맞춘다. API를 못 쓰면 `currentTime - outputLatency`로 대체한다.
- **판정 시간** = 입력 이벤트의 `event.timeStamp`를 곡 시간으로 바꾼 값 − 판정 오프셋. 렌더링 프레임과 무관하다. 키 입력은 이벤트 핸들러에서 즉시 판정한다.
- **표시 시간** = 지금(`performance.now()`)의 곡 시간 + 표시 오프셋. 노트 위치는 이 값으로 그린다.
- 오프셋 부호: 판정 오프셋 +20ms = "평균 20ms 늦게 치는 사람을 위한 보정", 표시 오프셋 +10ms = "노트를 10ms 앞당겨 그림".
- **늦은 미스 판정**은 프레임 갱신에서 하되, 아직 처리되지 않은 입력 이벤트가 있을 수 있으므로 `missMarginMs`(50ms)만큼 늦게 확정한다. 입력이 들어오면 그 레인의 지난 노트를 먼저 정리한 뒤 판정한다.
- **리드인**: 첫 노트가 2초보다 빠르면 오디오 시작 전에 대기 시간을 넣는다. 이 동안 곡 시간은 음수다.
- **STOP**(가져온 BMS·bmson): 박 시계가 멈추는 구간. 노트의 `t`는 STOP을 포함한 값이라 판정에는 영향이 없고, BPM 연동 스크롤에서만 그동안 노트가 멈춘다. 서버·클라이언트의 TempoMap이 같은 규칙(STOP 박에 있는 노트는 STOP이 시작할 때)을 쓴다.
- **게임패드 입력 시각**: 키보드의 `event.timeStamp` 대신 `Gamepad.timestamp`(브라우저가 패드 보고를 받은 시각, `performance.now()`와 같은 시간축)를 같은 변환에 넣는다. 값이 없거나 100ms보다 오래됐으면 읽은 시각을 쓴다.
- **가져온 키음**: BGM 채널을 렌더한 버퍼가 곡 시계의 기준이다(일반 곡의 `audio.flac` 자리). 노트 소리는 누른 순간(그 시각은 이미 지났으므로 곧바로), 오토 플레이는 `contextTimeForSong(t)`에 미리 예약해 노트 시각에 정확히 낸다.
- **생성 채보 키음**: 노트의 10% 이상이 따르는 스템이 키음 스템이 된다. 키음 스템마다 믹스와 길이가 같은 스템 버퍼를 믹스와 같은 `start(when)`에 위상을 뒤집어(게인 −1) 키음 구간에서만 더하므로, 반주 버퍼를 따로 만들지 않아도 배경 = 믹스 − 키음 스템이 된다. 노트를 치면 그 노트의 조각(같은 스템 버퍼의 [노트, 다음 노트) 구간, 30ms 안의 동치는 한 조각)을 곧바로 내고, 오토 플레이는 `contextTimeForSong(t)`에 예약한다. 조각은 3ms 일찍 시작해 앞 조각이나 배경과 크로스페이드하므로 제때 다 맞히면 원곡이 샘플 단위로 복원된다(OfflineAudioContext E2E에서 오차 < 1e-4). 같은 스템의 새 조각은 이전 조각을 끊는다. 연습 모드는 믹스와 스템을 함께 스트레치한다. 곡 시간·판정은 믹스 소스 기준이다. 스템은 분석이 끝나면 서버가 백그라운드로 분리해 두므로(곡마다 약 100MB) 보통 플레이 전에 준비돼 있다.

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
- 룰셋(`config/rulesets.json`)은 DJMAX 판정 %를 표기·점수로 바꾸는 층이다.
  - 정밀 %(RESPECT): MAX 100% ~ 1% / BREAK, 점수 = Rate × 10,000.
  - 등급형(GRADE, EZ2ON 참고): PERFECT ≥100% · GREAT ≥70% · GOOD ≥10% · BAD ≥1% / MISS, 가중치 1 / 0.75 / 0.4 / 0.1로 1,000,000점 환산.
  - EX-SCORE(BMS 참고): PERFECT 2점 · GREAT 1점 · GOOD · BAD 0점 / POOR, BAD와 POOR에서 콤보가 끊긴다. 등급 AAA(8/9) ~ F.
  - 기록 비교용 기본 점수(정밀 % 점수)는 룰셋과 무관하게 항상 같이 저장한다.
- FEVER(`config/fever.json`): 판정 %만큼 FEVER 게이지가 차고(46노트 MAX 100%면 가득), 가득 차면 자동(또는 수동: Enter)으로 14.5초간 발동. BREAK 없이 이어 가면 다음 배율이 x2 → x5까지 오르고, 발동 중 BREAK가 나면 끝나며 배율이 x2로 돌아간다. 보너스는 기본 점수와 따로 표시한다.
- 연습 모드: 재생 속도 r(0.5~1.5)에서 곡 시간은 실제 시간의 r배로 흐른다. 판정 구간·롱노트 유예·미스 여유를 곡 시간으로 ×r 해서 **실제 시간 기준 판정 폭이 그대로** 유지되고, 결과의 오차(ms)도 실제 시간으로 되돌려 보여 준다. 게이지는 실패 없는 NORMAL, 기록은 저장하지 않는다.

## 6. 렌더링 모델 (SDVX식 3D 트랙)

- 좌표계: 트랙은 y=0 평면, 판정선은 z=0(LIFT가 있으면 z = −LIFT × trackLength), 트랙은 −z 방향으로 `trackLength`(40)만큼 뻗는다. 트랙 폭 `trackWidth`(8)를 레인 폭 비율로 나눈다(스크래치 1.6배, 사이드 트랙 0.75배).
- 카메라: `(0, height, distance)`에서 `(0, 0, −lookAhead)`를 바라보는 원근 카메라. 프리셋 FLAT / SDVX / LOW(`config/camera.json`).
- 노트 위치(`engine/scroll.ts`): `z = 판정선 z − 거리`. 시간 고정 스크롤은 `거리 = (노트 시간 − 표시 시간) × trackLength / 가시 시간`, BPM 연동 스크롤은 박 차이 × 주 BPM의 박 길이로 거리를 잡아 빠른 구간에서 노트도 빨라진다(주 BPM 구간에서는 두 방식이 같다). 배속은 월드 좌표의 속도로 정의되므로 원근과 무관하게 일정하다.
- 레인 커버: SUDDEN+(먼 쪽) · HIDDEN+(판정선 쪽)는 노트·롱노트·마디선 재질에 공유 클리핑 평면 두 개를 걸어 정확히 잘라내고, 그 위에 커버 판과 경계선을 그린다. LIFT는 판정선·키 빔·이펙트를 위로 옮기고 판정선 아래를 덮는다. 플레이 중 단축키로 바꾸면 클리핑 평면 상수만 움직인다(재컴파일 없음). "녹색 숫자 유지"를 켜면 커버·LIFT를 움직일 때 배속을 다시 계산해 녹색 숫자를 유지한다.
- FEVER 중에는 트랙에 배율별 색(x2 하늘 · x3 초록 · x4 노랑 · x5 분홍)을 더하고 레일·판정선 빛을 같은 색으로 바꾼다. "번쩍임 줄이기"는 맥동·타격 이펙트·키 빔을 약하게 한다. 색각 보정 팔레트(Okabe–Ito)는 레인·판정 색을 함께 바꾼다.
- 트랙 끝은 안개(fog)로 자연스럽게 사라지고, 레인 구분선·마디선으로 원근 속에서도 박을 읽기 쉽게 한다.
- 마디선은 마디마다 트랙을 가로지르는 선이다(설정 "마디선", 기본 켬). 트랙 위 두께가 일정하면 멀리서는 사라지므로, 매 프레임 카메라 투영으로 두께를 다시 잡아 판정선부터 트랙 끝까지 화면에서 약 2.5px로 보이게 한다(`render/TrackRenderer.barLineDepth`). 색은 스킨의 `bar`, 불투명도 0.7이고 노트·롱노트 아래에 그린다.
- 롱노트는 몸통만 그린다. 가까운 끝이 누를 시각, 먼 끝이 뗄 시각이고, 누르는 동안은 몸통이 판정선에서 시작한다. 양 끝에 노트 모양을 붙이면 단노트로 읽혀 붙이지 않는다.
- 노트·롱노트 몸통·마디선은 오브젝트 풀에서 꺼내 쓰고, 화면에 보이는 구간만 갱신한다.
- 판정·콤보 텍스트는 트랙 위 3D 지점을 화면 좌표로 투영해 DOM HUD로 그린다. 카메라 연출이 켜져 있으면 매 프레임 현재 카메라(기울기·줌)로 다시 투영하고, 트랙이 기운 만큼 글자도 같이 돌린다.
- **카메라 연출**(`render/cameraFx.ts`): 채보의 tilt는 이전 기울기에서 새 값으로 smoothstep으로 옮겨 가 유지하고, zoom은 (1 − 진행률)²로 감쇠하는 펄스다. 매 프레임 기본 카메라 자세(쿼터니언·FOV)에 roll(최대 7°)과 FOV 축소(최대 7%)를 얹는다. 세기는 설정값(0–1, "번쩍임 줄이기"면 절반)을 곱한다. 수치는 `config/camera.json`의 `fx`.
- **스킨**(`render/skins.ts`): 노트 모양(상자·납작·캡슐), 레인 색 배치(키 모드 색·단색·무지개), 타격 이펙트(폭발·링·없음)와 트랙·레일·구분선·마디선·판정선·커버·안개 색. 기본 4종 + 텍스처 스킨 4종 + JSON 사용자 스킨(알 수 없는 값은 버리고 색은 `#rrggbb`만 받는다). 색각 보정 팔레트를 켜면 레인 색은 팔레트가 우선한다.
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
| GET | `/api/songs` | 곡 목록. 곡마다 `analyzer`(분석에 쓴 백엔드), `outdated`(분석기 버전이나 쓸 수 있는 백엔드가 바뀌었으면 true), `hasBga`, `bgaYoutube`(유튜브 영상 ID 또는 null), `bgaOffsetMs`, `sections`(사용자가 고친 구간 또는 null) |
| POST | `/api/songs` | 곡 업로드(multipart). 표준 FLAC 생성 후 분석 작업 시작 |
| POST | `/api/songs/demo` | 합성 데모 곡 추가(음악 파일 없이 체험) |
| GET | `/api/songs/{id}` | 곡 정보, 분석 진행률, 기록 |
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
| GET | `/api/songs/{id}/analysis` | AnalysisResult |
| POST | `/api/songs/{id}/charts` | 채보 생성(키 모드, 난이도, 목표 레벨, 시드, `newSeed`, `params`: style · rhythmSource · density · longNoteRatio · maxChord · scratchRate · sideRate · instrumentMapping · repeatConsistency · patternEngine) — 같은 chartId면 캐시. 곡에 고친 구간이 있으면 그 구간으로 만든다 |
| GET | `/api/charts/{chartId}` | 채보 |
| POST | `/api/scores` | 플레이 기록 저장(선택: `replay`) |
| GET | `/api/songs/{id}/scores` | 채보별 최고 기록(최고 기록의 `bestScoreId`, `hasReplay`) |
| GET | `/api/scores/{scoreId}/replay` | 리플레이 |
| GET | `/api/songs/{id}/charts` | 저장된(편집·가져온) 채보 목록 |
| POST | `/api/songs/{id}/charts/custom` | 편집한 채보 저장(`baseChartId`, `notes`, `name`) — 구조 검사, 난이도 재계산, 내용으로 정한 chartId |
| DELETE | `/api/charts/{chartId}` | 채보 삭제(그 채보의 기록·리플레이도) |
| GET | `/api/charts/{chartId}/export?format=osu\|bms\|bmson&offsetMs=` | 내보내기 파일 |
| POST | `/api/import` | 채보 가져오기(multipart `files` + 폴더 안 경로 `paths`, 또는 .zip/.osz) → 곡·채보·알림 |
| GET | `/api/songs/{id}/keysounds.json` · `.flac` | 가져온 키음의 위치표와 묶음 파일 |

### 데이터 폴더

```
data/
  library.sqlite3          곡·채보·기록 메타데이터
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
  src/input/     키보드·게임패드 입력, 키 바인딩, 메뉴용 패드 브리지
  src/render/    Three.js 트랙 렌더러, 카메라, 투영, 카메라 연출, 스킨
  src/ui/        화면(React), HUD, 플레이 배경(BGA·비주얼라이저), 채보 에디터 화면
  src/editor/    에디터 문서(편집 규칙·되돌리기, DOM 없음)와 캔버스
  src/settings/  설정(localStorage)
  e2e/           Playwright E2E
server/          로컬 분석 서버 (Python, FastAPI)
  rhythm_server/ analysis(+backends) · generator · difficulty · formats(osu!·BMS·bmson·키음) · api
  tests/         pytest (합성 음원 기반)
config/          서버·클라이언트 공용 튜닝 값
assets-src/      생성한 게임 그림의 원본(내려받은 그대로)과 출처 PROVENANCE.md
scripts/assets/  원본 → client/public/media(텍스처·플립북·manifest.json) 후처리(build_p0.py, 값은 p0_recipe.json)
desktop/         Electron 셸(main.js): 서버를 빈 포트에 띄우고 창을 연다
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
| 노트별 키음 | 4절 "생성 채보 키음". 설정 기본값 켬, HUD에 "키음 드럼·보컬"처럼 키음 스템 표시. 생성기 0.4.1부터 동치의 노트가 그 소리의 악기를 나눠 맡는다 | Vitest 3개(키음 스템 고르기, 조각·동치·최대 길이, 없는 스템) / E2E: 오프라인 렌더로 다 맞히면 원곡과 오차 < 1e-4, 놓친 조각만 무음 / pytest: 분석 뒤 스템 백그라운드 분리 |
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
| 새 소리가 시작되는 자리 (BMS 키음) | 분석기 1.6.0: 온셋마다 새 소리가 시작되는 확신 `attack`(`analysis/onsets.attack_confidence`·`band_levels`). 그 온셋의 대역 세기 상승, 화성 상승, 드럼 비율, 앞 온셋과의 가까움·세기 비, 저음 여부의 로지스틱 모델이고 가중치는 BMS 키음에 맞췄다. 생성기 0.9.3: 후보 점수 × attack²(`generator/candidates._score`, `config/instruments.json`의 `rhythmSource.attack`). 1.6.0 전 분석은 1로 본다 | pytest 3개(새 소리와 늦게 오는 저음의 확신 순서, 합성 곡 실제 온셋의 확신, attack이 낮은 후보의 점수) / 측정은 `docs/PATTERN_DESIGN.md` 19장 |
| 같은 소리 같은 레인 · 롱노트 세기 · 쉬운 채보 박자 (BMS) | 생성기 0.9.4(`docs/PATTERN_DESIGN.md` 20장). `generator/lanes._costs`: 같은 소리(`select.sound_of`)가 `sameSoundWithinMs` 안에 다시 나오면 같은 레인 비용 없이 `sameSoundBonus`를 받고, 연타 줄기 한도(`jackFree`)에서 보너스가 끝난다. 줄기를 세는 간격의 하한은 `jackStreakMinMs`다(`config/patterns.json`의 `hands`, GRG만 켬). `select.holdable`: 온셋 세기 `holds.strengthAtLeast`(0.4) 미만은 롱노트가 되지 않는다. GRG 프리셋(`config/difficulty.json`)의 연타 최소 간격·EASY/NORMAL 분할·스크래치·EXPERT/MASTER 동치를 BMS 사람 채보에 맞췄다 | pytest: 약한 소리 롱노트 거부, 반복 음이 연타 줄기 한도를 넘지 않고 두 음 트릴은 트릴로 남음, GRG 연타 줄기가 사람 수준(합성 곡 HARD ≤ 10/1000)이고 DJMAX는 그대로(≤ 1), EASY 스크래치가 드물고 250ms 이상 떨어짐 / 측정은 `docs/PATTERN_DESIGN.md` 20장 |
| 느린 반복은 같은 레인에 (BMS) | 생성기 0.9.5(`docs/PATTERN_DESIGN.md` 21장). `generator/lanes._costs`: 앞 노트에서 `slowRepeatMs` 이상 떨어진 노트는 같은 소리면 `slowSameSoundBonus`, 다른 소리면 같은 레인 비용 × `slowJackScale`, 레인 고르게 쓰기 × `slowUsageScale`(`usageBalance`는 모든 노트). `motifs.motif_costs`: 느린 단타는 양손 나누기 비용 × `slowSplitScale`. `sameSoundBonus`·`slowSameSoundBonus`는 숫자나 [단계값, 값] 목록(`lanes._by_skill`). 모두 `config/patterns.json`의 `hands`, GRG만 켬 | pytest: 500ms 간격 반복음은 GRG 모든 난이도에서 같은 키, 250ms 간격은 EASY·NORMAL이 MASTER보다 자주 같은 키, DJMAX는 그대로 / 측정은 `docs/PATTERN_DESIGN.md` 21장 |
| 바깥 키와 도약 (BMS, 7K) | 생성기 0.9.6(`docs/PATTERN_DESIGN.md` 22장). `motifs.motif_context`: 도약 비용 × `hands.leapScale`(숫자나 키 모드별 값, `motifs.by_key_mode`). `planner.windows`: `windows.systems`(기준별, `keyModes`로 키 모드별, 너비는 합침)와 퍼진 창(`spread`, `step`). `lanes._costs`: 키마다 늘 붙는 비용 `hands.keyBias` × `keyBiasScale`(단계값별), 빠른 두 노트를 다른 손으로 보내는 비용 × `alternateScale`(키 모드별). GRG 7K+1S만 켬 | pytest: 7K EASY·NORMAL·HARD가 1·7번 키에 8% 넘게 두고 한 키가 30%를 넘지 않으며, EASY의 3칸 이상 이동이 20% 넘음 / 측정은 `docs/PATTERN_DESIGN.md` 22장 |
| 악구별 키 묶음 · 쉬운 단계 동치와 셋잇단 (BMS) | 생성기 0.9.7(`docs/PATTERN_DESIGN.md` 23장). `planner.palettes`: 악구마다 `palettes.systems[기준][키 모드]`의 `sets`(사람 4마디 창의 키 묶음 비율)에서 `size`(단계값별) 키를 `shared`(앞 묶음과 겹치는 키 수 확률)를 곱해 시드로 뽑고, 같은 재료는 같은 묶음. `motifs._per_key_costs`: 묶음 밖 키 × `weights.palette`. `motifs.motif_context`: `hands.adjacentChord`를 단계값별로(`by_skill`). `planner.vocabulary`: 패턴의 `bySystem`(기준별 minSkill·complexity). GRG 프리셋 EASY·NORMAL: `handChordLimit` 2, 셋잇단 분할 3(5%·7%) | pytest: 7K EASY·NORMAL의 4마디 창이 노트 80%를 평균 4.2키 이하에 두고, 2개 동치의 3% 이상이 한 손 한 칸 띄움·3% 이하가 한 손 붙은 키, 셔플 곡의 EASY·NORMAL이 흔들리는 8분에 노트를 두고 곧은 곡은 두지 않음, 키 비율·연타 줄기·쏠린 마디는 시드 평균 / 측정은 `docs/PATTERN_DESIGN.md` 23장 |
| 드럼 자리 · 손 분담 동치 · 쉬운 채보 엇박 (BMS) | 생성기 0.9.8(`docs/PATTERN_DESIGN.md` 24장). `motifs.motif_context`: `roles.songHomes`의 기준은 드럼 자리 세기 `home_scale`이 곡 전체에서 `songHomeWeight`(기준별, `_song_home_weight`)이고, `roles.flipSystems`의 기준만 반복 묶음마다 손 좌우를 바꾼다. `motifs.motif_costs`: 리듬·선율이 한 손씩인 악구의 동치는 자리 비용 × `roles.chordRegion`(기준별). `candidates`: 멜로디 가중 `rhythmSource.melody.autoBySystem`(기준별). GRG 프리셋 EASY·NORMAL의 `highBandWeight` 0.7·0.8. 옵션(기본 끔): `planner.sound_homes`의 음높이 자리(`roles.tonalHomes`), `lanes._costs`의 키음 기억(`hands.soundMemory`), `select.hold_probability`(`holds.model`) | pytest: GRG MASTER의 손 분담이 반복 묶음마다 좌우를 바꾸지 않음(DJMAX는 바꾸고 EZ2ON은 그대로) / 측정은 `docs/PATTERN_DESIGN.md` 24장 |
| 노트 고르기 모델 (BMS) | 생성기 0.9.9(`docs/PATTERN_DESIGN.md` 25장). `candidates._score`: `_hand_scores`(손으로 만든 점수)에 `pick_probability`(`config/pick.json`의 로지스틱 모델, 단계값으로 `pick_model`이 고름, 특징은 `pick_features`)를 섞는다. 점수 = 손 점수 × (확률 / 기본 옵션의 손 점수)^`share`(단계값별). 기본 옵션은 리듬 기준 자동·스타일의 점수 가중(`SCORE_WEIGHTS`) 없음이라 옵션은 손 점수를 바꾼 만큼 곱해진다. `systems`의 기준(GRG)만 | pytest: DJMAX·EZ2ON은 손 점수 그대로, 확률이 설정의 로지스틱 모델과 같고 MASTER는 확률 그대로·EASY는 손 점수와 반씩, 드럼 리듬 기준이 손 점수를 바꾼 만큼 점수를 바꿈 / 측정은 `docs/PATTERN_DESIGN.md` 25장 |
| 재봉틀 · 축연타 (BMS) | 생성기 0.9.10(`docs/PATTERN_DESIGN.md` 26장). `planner._fit`: 몸짓별 모양 점수 `fit`에 기준별 `fitBySystem`을 덮어쓴다. `params.resolve_params`: 축연타 상한 `anchors.caps` 대신 기준별 `anchors.bySystem`. `planner._feasible`: 모양의 `maxIoiMs`(음 간격 중앙값 한도). GRG만 `styles.GRG.doubles` 1.5, 반복음·드럼 악구의 재봉틀 1.0·0.8(400ms 이하 악구), 축연타 3·6·8·10타 | pytest: GRG의 반복음·드럼 악구에서 재봉틀 점수가 `split`보다 높고 DJMAX는 낮음, GRG NORMAL 축연타 상한 6타·EASY 3타, DJMAX NM 3타 / 측정은 `docs/PATTERN_DESIGN.md` 26장 |
| 마디마다 셋잇단 격자 (BMS) | 생성기 0.9.12(`docs/PATTERN_DESIGN.md` 28장). `candidates.triplet_bars`: `_triplet_weights`(온셋마다 곧은 16분·셋잇단 자리의 세기)를 마디로 모아, 앞뒤 `tripletFeel.localBars`마디의 셋잇단 비율이 `localMinShare` 이상인 마디. `candidates.build_candidates(triplets_in)`: 그 밖의 마디의 온셋은 곧은 분할에만 스냅. `core`: 셋잇단 느낌의 곡이고 기준이 `localSystems`에 있으며 단계값이 `localFromSkill` 이상일 때만. GRG만, 앞뒤 1마디, 0.5, HARD(0.42)부터 | pytest: 앞 8마디 16분·뒤 8마디 셋잇단인 합성 분석에서 셋잇단 마디만 고르고, 곧은 마디의 어긋난 온셋이 곡 전체 격자에서는 셋잇단에, 마디별 격자에서는 셋잇단 아닌 자리에 붙음 / 측정은 `docs/PATTERN_DESIGN.md` 28장 |
| 2개 동치 모양 (BMS) | 생성기 0.9.13(`docs/PATTERN_DESIGN.md` 29장). `motifs.pair_shape`: 2개 동치를 대칭·가운데 키와 이웃·가운데 키·한 손 붙음·한 손 띄움·양손 비대칭으로 나눈다. `motifs.motif_context`: `hands.chordShapes`(키 모드 → 모양 → [단계값, 값])를 채보의 단계값에서 읽어 `MotifContext.pair_shapes`에. `motifs._shape_cost`: 2개 동치에 그 모양의 값을 더한다. GRG 7K+1S만, 레벨 2·6·10·14 채보의 단계값에서 사람 채보의 모양별 몫에 맞춘 값 | pytest: 모양 이름, GRG 7K의 모든 단계에서 3+4가 3+5보다 비싸고, NORMAL은 1+3이 2+5보다 싸고 MASTER는 비쌈, DJMAX·GRG 5K는 모양 비용 없음 / 측정은 `docs/PATTERN_DESIGN.md` 29장 |
| 레인 사용 기억 (BMS) | 생성기 0.9.14·0.9.17(`docs/PATTERN_DESIGN.md` 30·34장). `lanes._Weights.usage_decay`(`hands.usageDecay`): 빔 서치 상태의 레인별 사용량이 슬롯마다 남는 비율. 레인 고르게 쓰기 비용(`usageBalance`)은 그 기억의 평균보다 많이 쓴 레인에 붙는다. 0.97(노트 33개 남짓)이고, 0.9.15에서 기본값으로 올려 세 기준이 함께 쓴다(32장) | pytest: 세 기준 모두 0.97 / 측정은 `docs/PATTERN_DESIGN.md` 30·32장 |
| 쉬운 채보의 16분 당김음 (BMS) | 생성기 0.9.20(`docs/PATTERN_DESIGN.md` 39·40장). 박자 위치 가중치를 `config/difficulty.json`의 `metrical.weights`로 옮기고, `candidates._hand_scores`가 16분 자리 후보 가운데 16분 뒤 자리에 후보가 없거나 더 약한 것(당김음)에 `metrical.push`를 곱한다. 손 점수에만 걸려 노트 고르기 모델의 몫이 1인 단계(EXPERT·MASTER)에는 효과가 없다 | pytest 1개(당김음 16분이 뒤가 더 센 16분의 push배) / 측정: 시드 둘 평균으로 레벨 2·6의 16분 몫 0.020 → 0.036 · 0.083 → 0.117(사람 0.079 · 0.153), 박자 격자 +2.3%p, 키 +2.1%p, 시각 F1 0.680 → 0.679 |
| 손 모양 되먹임 (BMS) | 생성기 0.9.21(`docs/PATTERN_DESIGN.md` 43장). 레인 빔 서치의 상태가 길마다 빠른 단타 줄기의 노트와 한 손 세 번째 이상 노트(`handRuns`), 꽉 찬 마디와 쏠린 마디를 세고(`lanes._feedback_counts`), 그 몫과 레벨별 목표(`hands.runTarget`)의 차이만큼 한 손 세 번째 노트에 보너스·비용을 준다(`hands.runFeedback`, 기본 기준 7K+1S에만 16). 마디 쏠림 쪽(`barTarget`·`barFeedback`)은 코드만 있고 꺼져 있다 | pytest 1개(빔의 셈이 가이드 지표 handRuns와 같은지) / 측정: 시드 둘 평균으로 전체 통계 77.1 → 77.8%, 레인 패턴 74.8 → 75.9%, 한 손 3연속 레벨 10 0.077 → 0.107(사람 0.114), 시각 F1 그대로; DJMAX·EZ2ON·다른 키 모드는 채보가 같다 |
| 스템 블록 동시 분리 | 기본 스템 분리의 15초 블록을 CPU 수보다 하나 적게(최대 4개) 스레드로 동시에 나누고 곡 순서대로 더한다(한 블록씩 나눌 때와 비트 단위로 같다). 블록의 중간 배열을 일찍 놓고, 뒤 블록이 더 닿지 않는 구간부터 바로 float32 스템에 써서 곡 길이 float64 누적 배열을 두지 않는다 | 4코어 클라우드: 데모 곡(93초) 분리 5.8 → 2.6초, 4분 곡 16.4 → 6.6초, 최대 메모리(tracemalloc) 449 → 465MiB(한 블록씩이면 257MiB). 에디터 E2E의 첫 플레이 오버레이 6.1 → 3.1초(3회 중앙값) / pytest: 동시 분리 = 한 블록씩 분리(바이트 비교), 스템·분석 결과를 이전 코드와 바이트 단위로 비교 |

### Phase 4 결과

| 항목 | 구현 | 검증 |
|---|---|---|
| 채보 에디터 | 세로 타임라인 캔버스(마디 번호·파형), 스냅 1/4–1/64, 놓기·롱노트·옮기기·길이·범위 선택·복사/잘라내기/붙이기·미러·되돌리기, 재생(타격음·키음), 실시간 입력, 커서부터 테스트 플레이(연습 모드로 돌고 에디터로 복귀), 저장(새 `edited` 채보) | Vitest 6개(스냅, 겹침 거부, 원자적 이동, 되돌리기, 박 단위 붙이기, 미러) / pytest: 저장·재저장 같은 ID·구조 오류 422·삭제 / E2E: 놓기·지우기·되돌리기·저장·테스트 플레이 후 복귀 |
| 내보내기 | osu!mania v14(모든 모드, SpecialStyle·`grg-mode` 태그), BMS(.bme/.bms, 첫 박 앞 마디, #BPMxx·#STOPxx, LNTYPE 1, 마디마다 0.5ms 이내 최소 해상도), bmson 1.0.0(해상도 960) | pytest: 생성 채보를 내보내 다시 읽으면 노트가 같음 — osu! ≤ 0.5ms(정수 ms), BMS ≤ 0.01ms, bmson ≤ 0.5ms |
| 가져오기 | osu!(빨간 타이밍 포인트, 잘린 마디), BMS(BPM 03/08, STOP, 마디 길이, LNTYPE 1·LNOBJ, #RANDOM/#IF, DP·PMS 거부), bmson(슬라이스 `c`, 겹친 채널), Shift_JIS·EUC-KR·UTF-8 판별, zip 이름 인코딩, 겹친 노트 정리 | pytest 9개(타이밍·STOP·롱노트·#RANDOM 고정, 모드 배치, 인코딩, bmson 슬라이스, osu! 배치·마디, API 가져오기·재가져오기 같은 곡, .osz 음원 사용, 실패 보고) |
| 키음 플레이 | 서버: 키음 디코딩 → 전체 믹스(곡 음원, 클리핑 없게 게인) + 키음 묶음 파일. 클라이언트: BGM을 OfflineAudioContext로 렌더해 곡 버퍼로, 노트 소리는 누를 때(빈 누름은 그 레인 다음 노트, 다음 노트가 없으면 마지막 노트), 오토 플레이는 노트 시각에 예약, 같은 소리는 다시 날 때 이전 것을 끊음 | pytest: 렌더한 곡의 킥이 BMS 박 위치에(1900ms 무음, 2000ms 소리), 분석 BPM 120 / E2E: BMS 폴더 가져오기 → 키음 오토 플레이 PERFECT PLAY |
| 리플레이 | ReplayRecorder / ReplayPlayer, 기록과 함께 저장, 결과 화면·최고 기록·파일에서 보기 | Vitest: 지연된 입력·흔들리는 프레임으로 친 판을 다른 프레임 간격으로 재생해 결과 객체가 완전히 같음 / E2E: 키보드로 친 판의 리플레이가 같은 점수·정확도 / pytest: 저장·최고 기록 리플레이·잘못된 데이터 422·곡 삭제 시 정리 |
| 게임패드 | 2ms 간격 폴링(브라우저 하한 약 4ms), `Gamepad.timestamp` 판정, 버튼·축 방향·턴테이블, 레인별 지정, 메뉴 브리지, Start 일시정지 | Vitest 7개(타임스탬프 사용·오래된 값 대체, 축 방향, 턴테이블 누름·방향 전환·멈춤, 축 끝 넘김, 정지 시 떼기, 키보드와 함께 한 레인) / E2E: 가짜 패드로 레인 지정·B로 메뉴 나가기 |
| 데스크톱 | PyInstaller(기본 분석, 282MB) + Electron 44 셸, 빈 포트·사용자 데이터 폴더·종료 시 서버 정리, 빌드 스크립트 | Windows(GitHub Actions `windows-latest`): NSIS 설치 파일(180MB) 빌드 → 번들 서버 단독 실행(데모 곡 분석·채보 생성·MP3 업로드) → 무인 설치 → 설치된 앱을 Playwright Electron 드라이버로 실행해 데모 곡 분석·채보 미리보기·오토 플레이 확인. Linux: 같은 확인을 Xvfb에서. GPU 없는 환경에서 WebGL 컨텍스트를 못 만들던 문제를 여기서 찾아 소프트웨어 렌더러 허용으로 고침. macOS dmg는 미검증 |

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
| 룰셋 표기 · FEVER | `engine/ruleset.ts`, `engine/fever.ts` | Vitest: EX-SCORE·등급형 환산, BAD 콤보 끊김, FEVER 자동·수동·배율 / E2E: EX-SCORE AAA, FEVER 보너스 |
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
| 캘리브레이션 평균·표준편차 표시, 오프셋 적용 | 캘리브레이션 화면 + 결과 화면 오프셋 추천 |
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
5. 싱크 테스트(클릭 트랙 + 채보를 브라우저에서 합성)와 오프셋 캘리브레이션 화면
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
| 블루투스·OS 믹서 지연 | 오디오 출력 타임스탬프 매핑 + 캘리브레이션 + 결과 화면 오프셋 추천 |
| 비트 추적 지터로 채보가 흔들림 | 고정 BPM 가설을 전곡 온셋 정렬로 정밀 추정, 드리프트가 클 때만 가변 템포 |
| 원근 때문에 먼 노트 가독성 저하 | 카메라 프리셋, 트랙 끝 안개, 마디선, 배속 조절 |
| 헤드리스 테스트 환경에서 오디오 출력이 없음 | 오디오 클럭 대체 경로를 두고, E2E는 오토 플레이로 판정 경로만 검증 |
