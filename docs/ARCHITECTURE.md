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
| ML 백엔드 | Phase 1은 numpy·scipy 기본 분석만 쓴다. beat_this·Demucs 등은 Phase 3에서 선택 설치형으로 붙인다. |

## 3. 전체 구조

```
┌──────────── 브라우저 클라이언트 (TypeScript) ────────────┐        ┌──────── 로컬 Python 서버 (FastAPI) ────────┐
│ ui/      곡 선택 · 설정 · 결과 · HUD (React, DOM)        │  HTTP  │ api/        라우트, 라이브러리(SQLite+파일) │
│ render/  Three.js SDVX식 트랙                            │◀──────▶│ audio_io    디코딩 → 표준 FLAC, 태그·커버   │
│ engine/  판정 · 롱노트 · 점수 · 게이지 · 오토 플레이      │        │ analysis/   기본 분석 (+ML 백엔드 어댑터)   │
│ input/   키보드 → 레인, 타임스탬프 변환                   │        │ generator/  채보 생성 · 린터               │
│ audio/   표준 오디오 재생, 오디오 클럭                    │        │ difficulty/ 레벨 산정                      │
└──────────────────────────────────────────────────────────┘        └────────────────────────────────────────────┘
                         config/ (판정 · 키 모드 · 게이지 · 카메라 · 난이도) 공용
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
- 노트·롱노트 몸통·마디선은 오브젝트 풀에서 꺼내 쓰고, 화면에 보이는 구간만 갱신한다.
- 판정·콤보 텍스트는 트랙 위 3D 지점을 화면 좌표로 투영해 DOM HUD로 그린다.

## 7. 서버

### API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 서버 상태, 분석기 버전 |
| GET | `/api/songs` | 곡 목록 |
| POST | `/api/songs` | 곡 업로드(multipart). 표준 FLAC 생성 후 분석 작업 시작 |
| POST | `/api/songs/demo` | 합성 데모 곡 추가(음악 파일 없이 체험) |
| GET | `/api/songs/{id}` | 곡 정보, 분석 진행률, 기록 |
| PATCH | `/api/songs/{id}` | 제목·아티스트·BPM·첫 박 오프셋 보정 → 재분석 |
| DELETE | `/api/songs/{id}` | 곡 삭제 |
| GET | `/api/songs/{id}/audio` | 표준 FLAC |
| GET | `/api/songs/{id}/cover` | 앨범아트 |
| GET | `/api/songs/{id}/analysis` | AnalysisResult |
| POST | `/api/songs/{id}/charts` | 채보 생성(키 모드, 난이도, 목표 레벨, 시드, `newSeed`, `params`: style · rhythmSource · density · longNoteRatio · maxChord · scratchRate · sideRate) — 같은 chartId면 캐시 |
| GET | `/api/charts/{chartId}` | 채보 |
| POST | `/api/scores` | 플레이 기록 저장 |
| GET | `/api/songs/{id}/scores` | 채보별 최고 기록 |

### 데이터 폴더

```
data/
  library.sqlite3          곡·채보·기록 메타데이터
  songs/<songId>/
    original.<ext>         업로드 원본
    audio.flac             표준 오디오
    cover.<ext>            앨범아트(있으면)
    analysis.json          AnalysisResult
  charts/<chartId>.json    생성된 채보
```

`songId`는 원본 파일의 SHA-256 앞 16자리다. 같은 파일을 다시 올리면 같은 곡으로 처리한다.

## 8. 디렉터리 구조

```
client/          브라우저 클라이언트 (Vite + TypeScript + React + Three.js)
  src/api/       서버 API 클라이언트
  src/audio/     오디오 엔진, 오디오 클럭, 클릭 트랙 합성, WSOLA 타임 스트레치(워커)
  src/engine/    판정·룰셋·게이지·FEVER·배치 옵션·스크롤·오토 플레이 (DOM 의존 없음, Vitest)
  src/input/     키보드 입력, 키 바인딩
  src/render/    Three.js 트랙 렌더러, 카메라, 투영
  src/ui/        화면(React)과 HUD
  src/settings/  설정(localStorage)
  e2e/           Playwright E2E
server/          로컬 분석 서버 (Python, FastAPI)
  rhythm_server/ analysis · generator · difficulty · formats · api
  tests/         pytest (합성 음원 기반)
config/          서버·클라이언트 공용 튜닝 값
docs/            PROMPT · ARCHITECTURE · CHART_FORMAT
```

## 9. 작업 계획과 결과

Phase 0–2를 완료했다. 분석·생성 알고리즘의 세부와 측정값은 `docs/GENERATION.md`에 있다.

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
| 4분 곡 분석 30초·재생성 3초 이내 | 분석 약 15초, 재생성 0.6~2.2초(Phase 2 기준, 7K+1S MASTER가 가장 느림) |

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
