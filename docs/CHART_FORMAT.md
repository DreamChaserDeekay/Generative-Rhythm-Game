# 채보 포맷 (Chart JSON, formatVersion 1)

생성기가 만드는 채보이자 클라이언트가 플레이하는 데이터다. 서버는 `data/charts/<chartId>.json`에 저장하고 `GET /api/charts/{chartId}`로 돌려준다.

## 예시

```json
{
  "formatVersion": 1,
  "meta": {
    "chartId": "c1a2b3c4d5e6f7a8b9c0d",
    "audioHash": "sha256:…",
    "songId": "a1b2c3d4e5f60718",
    "title": "Song Title",
    "artist": "Artist",
    "keyMode": "7K+1S",
    "lanes": ["SC", "1", "2", "3", "4", "5", "6", "7"],
    "difficulty": "HARD",
    "level": 9,
    "rating": 9.02,
    "durationMs": 215000.0,
    "noteCount": 476,
    "nps": { "avg": 6.37, "peak": 11, "graph": [0, 3.5, 6.0], "binMs": 2000 },
    "effectiveNps": 9.52,
    "densityLimited": false,
    "skillset": { "stream": 0.3, "chord": 0.49, "jack": 0.18, "longNote": 0.37, "technical": 0.23, "stamina": 0.63 },
    "handLoad": { "L": 0.54, "R": 0.46 },
    "keysound": { "stem": "vocals", "share": 0.36, "shares": { "drums": 0.41, "bass": 0.08, "vocals": 0.36, "other": 0.15 } },
    "repeatConsistency": 0.97,
    "consistency": { "loopRhythm": 0.93, "loopLane": 0.97, "repeatSelect": 0.95, "repeatLane": 0.99, "repeatLaneMirror": 0.99, "barVariety": 0.6, "laneEntropy": 0.7 },
    "generator": {
      "version": "0.9.19",
      "analyzer": "core-1.7.3",
      "seed": 3735928559,
      "params": {
        "difficulty": "HARD", "targetLevel": null, "density": 1.0, "longNoteRatio": 0.15, "maxChord": 3,
        "scratchRate": 0.06, "sideRate": 0.06, "style": "balanced", "rhythmSource": "auto",
        "instrumentMapping": 0.6, "repeatConsistency": 1.0
      }
    }
  },
  "timing": {
    "offsetMs": 536.0,
    "tempoMap": [{ "beat": 0, "bpm": 128.0 }],
    "meter": [{ "measure": 0, "beatsPerMeasure": 4 }]
  },
  "sections": [
    { "startBeat": -1, "endBeat": 16, "label": "intro", "group": "A", "energy": 0.0, "loopBars": 1, "confidence": 0.81 },
    { "startBeat": 16, "endBeat": 48, "label": "verse", "group": "B", "energy": 0.66, "loopBars": 4, "confidence": 0.64 }
  ],
  "effects": [
    { "beat": 64.0, "t": 30536.0, "type": "zoom", "value": 0.62, "durationBeats": 2 },
    { "beat": 64.0, "t": 30536.0, "type": "tilt", "value": 0.86, "durationBeats": 2 }
  ],
  "notes": [
    { "beat": 4.0, "t": 2411.0, "lane": 3, "type": "tap", "src": "drums" },
    { "beat": 4.5, "t": 2645.375, "lane": 6, "type": "hold", "src": "vocals", "endBeat": 6.0, "endT": 3348.5 },
    { "beat": 6.0, "t": 3348.5, "lane": 0, "type": "tap", "src": "bass" }
  ]
}
```

## 필드

### meta

| 필드 | 설명 |
|---|---|
| `chartId` | `c` + SHA-256 앞 20자. 생성 채보는 오디오 해시, 분석기 버전·보정값, 키 모드, 공개 파라미터, 시드, 생성기 버전으로, 편집·가져온 채보는 오디오 해시·키 모드·타이밍·노트·키음으로(같은 내용이면 같은 ID) 만든다. 기록은 이 값에 묶인다. |
| `audioHash` | 업로드 원본의 `sha256:` 해시. |
| `songId` | 서버 라이브러리의 곡 ID(원본 해시 앞 16자). |
| `keyMode` / `lanes` | 키 모드와 레인 ID. `lane` 값은 이 배열의 인덱스다. 7K+1S에서 0번은 스크래치, FX 모드(4K+FX · 6K+FX)에서 처음(`FXL`)과 끝(`FXR`)은 사이드 트랙. 레인 종류는 `config/keymodes.json`의 `kind`. |
| `difficulty` / `level` / `rating` | 난이도(기본 기준은 EASY … MASTER, DJMAX는 NM · HD · MX · SC, EZ2ON은 EZ · NM · HD · SHD), 정수 레벨(1–15, EZ2ON은 1–20), 소수 세부 난이도. |
| `difficultySystem` | 난이도 기준: `DJMAX`(DJMAX RESPECT V) 또는 `EZ2ON`(EZ2ON REBOOT : R). 레벨은 그 기준의 키 모드별 레벨 표로 매긴다. 기본(5단계) 기준이면 없다. |
| `levelScale` | 레벨이 그 기준의 일반 척도와 따로 매겨질 때의 척도 이름. 지금은 DJMAX SC의 `SC`(SC 1–15)뿐이다. 없으면 일반 척도. |
| `nps` | 평균·최대(1초 창) NPS와 2초 단위 NPS 그래프. |
| `effectiveNps` | 난이도 산정기의 유효 NPS(동치·연타·롱잡 부담이 반영된 값). |
| `densityLimited` | 곡에 들리는 소리가 부족해 목표 레벨까지 올리지 못했으면 `true`. |
| `skillset` | 0–1 스킬 프로필: stream, chord, jack, longNote, technical, stamina. |
| `handLoad` | 난이도 모델의 손 strain이 왼손(`L`)·오른손(`R`)에 나뉜 비율. |
| `patterns` | 패턴 성향: 키 노트 중 계단(`stairs`, 400ms 안으로 이어지는 단타가 한 칸씩 3개 이상)·트릴(`trills`, 같은 단타 줄기에서 두 레인을 4번 이상 번갈아)·동치(`chords`)·연타(`jacks`, 같은 레인을 260ms 안에 다시)·롱잡(`holdTaps`, 다른 레인의 롱노트를 잡은 채 치는 노트)의 비율과, 빠른 단타(260ms 이하 간격) 이동 중 세 칸 이상 건너뛰는 비율(`leaps`). 생성·편집·가져온 채보 모두 있다(`difficulty/patterns.py`). |
| `keysound` | 채보 정보에 보이는 주 키음 스템(`stem`: drums · bass · vocals · other)과 그 스템을 따르는 노트 비율(`share`), 스템별 노트 비율(`shares`). 실제 키음은 클라이언트가 노트의 `src`로 노트마다 만든다(노트의 10% 이상이 따르는 스템). 분석에 스템 정보가 없으면 `null`(키음을 켜도 원곡 그대로 재생). |
| `repeatConsistency` | 반복 구간에서 첫 등장과 같은 레인을 고른 슬롯 비율(0–1). 구간 엔진(0.5.0)에서는 복사한 노트 중 레인을 그대로 지킨 비율. 반복 구간이 없거나 옵션을 껐으면 `null`. |
| `consistency` | 구간 일관성(생성기 0.5.0, `difficulty/consistency.py`, 0–1): 구간 안 한 루프 뒤 마디와의 노트 시각 겹침(`loopRhythm`)과 그중 같은 레인 비율(`loopLane`), 반복 구간과 첫 등장의 시각 겹침(`repeatSelect`)과 같은 레인 비율(`repeatLane`, 좌우 반전도 같다고 보면 `repeatLaneMirror`), 구간의 서로 다른 마디 비율(`barVariety`, 낮을수록 루프를 되풀이), 단타 레인 이동의 예측 불가능성(`laneEntropy`). 채보를 만든 구간 기준이다. 잴 수 없으면 항목이 `null`. |
| `generator` | 생성기·분석기 버전, 시드, 사용자 파라미터(스타일·리듬 기준·밀도·롱노트 비율·최대 동치·스크래치·사이드 비율·악기별 레인 세기·반복 구간 일관성, 기본 기준이 아니면 `system`, 기본 구간 엔진이 아니면 `patternEngine: "designer"`(악구·패턴) 또는 `"classic"`(이전 배치)). 생성 채보에만 있다. |
| `source` | 편집·가져온 채보의 출처: `{"kind": "edited", "from": 원본 chartId}` 또는 `{"kind": "imported", "format": "osu"\|"bms"\|"bmson", "file": 파일 이름}`. 없으면 생성 채보. |
| `chartName` | 편집·가져온 채보의 이름(osu! Version, BMS #SUBTITLE, 없으면 #DIFFICULTY의 이름(HYPER 등), 그것도 없으면 "Lv.#PLAYLEVEL", 에디터에서 정한 이름). 파일이 매긴 레벨(BMS #PLAYLEVEL, bmson `level`)은 이름에 넣지 않고 라이브러리(`charts.source_level`)에 그대로 남겨, 저장된 채보 목록과 기록이 `sourceLevel`로 우리 레벨 옆에 보인다. `difficulty`는 우리 레벨 산정으로 정한 프리셋 이름(Lv.1–3 EASY … 13–15 MASTER)이다. |
| `keysoundGain` | 가져온 키음 채보: 키음을 모두 섞어도 클리핑하지 않게 하는 게인. BGM과 노트 소리에 같이 곱한다. |

### sections

곡 구조. 생성 채보에만 있다(가져온 채보는 빈 목록).

- `startBeat`·`endBeat`: 구간의 시작·끝 박(0 = 첫 다운비트). 첫 구간은 0보다 앞(못갖춘마디)에서 시작할 수 있다.
- `label`: `intro` · `verse` · `pre-chorus` · `chorus` · `bridge` · `drop` · `outro`.
- `group`: 반복 묶음(`A`, `B` …). 같은 글자는 같은 음악이고, 구간 엔진은 같은 패턴을 놓는다.
- `energy`: 구간 음량(곡 안에서 0–1).
- `loopBars`: 구간의 마디가 몇 마디 뒤에 되풀이되는지(1·2·4, 루프가 없으면 구간 길이).
- `confidence`: 분석한 경계와 묶음이 얼마나 뚜렷한지(0–1, 사용자가 고친 구간은 1).

0.4.1 이하 채보의 `sections`에는 `startBeat`·`label`·`energy`만 있다.

### timing

- `offsetMs`: 0박(첫 다운비트)의 시각.
- `tempoMap`: `{beat, bpm}` 구간별 고정 템포. 첫 항목은 반드시 `beat: 0`. 0박보다 앞선 박은 첫 구간의 템포를 거꾸로 적용한다.
- `meter`: `{measure, beatsPerMeasure}`. 마디선 계산에 쓴다. 가져온 채보는 `beatsPerMeasure`가 소수일 수 있다(BMS 채널 02, osu! 타이밍 포인트 앞의 잘린 마디).
- `stops`(선택): `{beat, durationMs}`. 그 박에서 박 시계가 `durationMs` 동안 멈춘다(BMS #STOP, bmson stop_events). 그 박에 있는 노트는 STOP이 시작할 때, 이후 노트는 그만큼 늦게 온다. `t`는 이미 STOP을 포함한 값이다.

### effects

SDVX식 카메라 연출 신호. 생성기가 구간 에너지에서 만들며, 판정·노트 시간과는 무관한 연출 데이터다(없어도 되고, 클라이언트는 설정에서 끌 수 있다).

| 필드 | 설명 |
|---|---|
| `beat` / `t` | 시작 박과 시각(ms). |
| `type` | `tilt`(트랙 기울기) 또는 `zoom`(줌 펄스). |
| `value` | `tilt`: −1–1, 이전 기울기에서 이 값으로 `durationBeats` 동안 부드럽게 옮겨 가 다음 `tilt`까지 유지(0이면 수평). `zoom`: 0–1, 시작에 가장 세고 `durationBeats` 동안 사라진다. |
| `durationBeats` | 전환·펄스 길이(박). |

클라이언트의 최대 기울기(±1일 때 7°)와 줌 깊이(1일 때 시야각 7% 축소)는 `config/camera.json`의 `fx`이고, 설정의 카메라 연출 세기(0–1)를 곱한다.

### notes

| 필드 | 설명 |
|---|---|
| `beat` | 박 위치(그리드·편집·내보내기용). |
| `t` | **표준 오디오(서버의 `audio.flac`) 첫 샘플 기준 ms.** 플레이 판정은 이 값을 쓴다. |
| `lane` | `meta.lanes` 인덱스. |
| `type` | `tap` 또는 `hold`. |
| `endBeat` / `endT` | 롱노트 끝(`hold`만). |
| `src` | 그 노트가 맡은 소리의 스템(drums · bass · vocals · other). 단타는 그 소리의 주 스템이고, 한 소리에 악기가 여럿 울리면 동치의 노트가 악기를 하나씩 나눠 맡는다(생성기 0.4.1부터). 분석에 스템 정보가 있을 때만 있다. 키음을 켜면 그 노트를 칠 때 이 스템의 [이 노트, 같은 스템의 다음 노트) 구간(최대 4초) 소리가 나고, 놓치면 그 구간 소리가 빠진다. |
| `snd` | 가져온 키음 채보: 누르면 나는 소리(`sounds`의 인덱스). |
| `so` | 소리를 시작할 위치(ms). bmson에서 이전 노트의 소리를 이어 받는 노트(`c: true`, 잘린 스템)는 0보다 크다. |
| `sl` | 소리를 끊는 길이(ms). 같은 소리가 다시 시작하는 시각까지(BMS의 같은 #WAV, bmson의 같은 채널). |

### sounds · bgm (가져온 키음 채보)

- `sounds`: 키음 파일 이름 목록. 실제 소리는 서버가 곡마다 하나로 이어 붙인 파일(`/api/songs/{id}/keysounds.flac`)과 위치표(`keysounds.json`)로 준다.
- `bgm`: 플레이어와 상관없이 나는 소리 `{beat, t, snd, so?, sl?}`(BMS 채널 01, bmson x=0). 클라이언트는 이것을 한 버퍼로 렌더해 곡 오디오로 쓴다.

노트는 `t`, `lane` 순으로 정렬되어 있다. 같은 레인·같은 시각 중복, 롱노트 겹침은 없다(린터가 보장).

## 플레이 규칙과의 관계

- 롱노트는 DJMAX 방식으로 판정한다: 시작 타이밍 판정 → 누르는 동안 1/4박마다 콤보 틱 → 끝까지 누르면 끝 판정 MAX 100%, 끝 100ms 전보다 일찍 떼면 BREAK.
- 사이드 트랙 노트를 놓치면 BREAK가 아니라 MAX 1%다.
- 배치 옵션(MIRROR·RANDOM 등)과 연습 구간은 클라이언트가 플레이 직전에 노트의 `lane`을 바꾸거나 일부만 골라 적용한다. 채보 파일과 `chartId`는 바뀌지 않는다.
- `src`·`effects`·`keysound`·`repeatConsistency`는 생성기 0.3.0에서 추가됐다. 없는 채보(0.2.0 이하)도 그대로 플레이된다.
- `patterns`와 패턴 엔진(악구·패턴 배치, `docs/PATTERN_DESIGN.md`)은 생성기 0.4.0에서 추가됐다. 생성기 버전이 채보 ID에 들어가므로 0.4.0부터 같은 곡·설정의 채보도 새 ID(새 기록)가 된다.
- 생성기 0.4.1: 동치의 노트가 그 소리의 악기를 나눠 맡고(`src`), 사이드 노트 머리 앞뒤로 같은 손 노트를 연타 간격만큼 비운다(DPC 가이드라인, `docs/PATTERN_DESIGN.md` 12장). 채보 ID가 다시 바뀐다.
- 생성기 0.9.19: 기본 기준의 레벨 6·10에서 리듬·선율의 겹치는 3분의 2 영역을 없앴다(`roles.melodySkill` GRG 0.7). 그 영역이 선율을 키 1·2에서 떼어 놓아 바깥 키를 사람보다 덜 썼다. 동치 모양은 영역을 켠 채 맞춘 값이라 기본 기준의 표를 다시 맞췄다(`hands.systems.GRG.chordShapes`). 키 1 0.144 → 0.160, 키 7 0.093 → 0.106(사람 0.185·0.126), 가운데 키 쏠림 54.0 → 49.3%(사람 44.7%), 전체 통계는 78.6 → 78.0%(`docs/PATTERN_DESIGN.md` 37·38장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다(DJMAX·EZ2ON은 그대로).
- 생성기 0.9.18: DJMAX·EZ2ON의 7K+1S 스크래치 몫을 기본 기준이 사람 BMS 채보에 맞춘 값으로 옮겼다(두 게임에는 스크래치 레인이 없어 지킬 고유값이 없다). 레벨 2 채보의 스크래치 몫이 사람의 21–28%에서 90–93%로 오고, 전체 통계 DJMAX 54.6 → 55.0%, EZ2ON 55.7 → 55.9%(`docs/PATTERN_DESIGN.md` 36장). 형식은 그대로이고 DJMAX·EZ2ON의 7K+1S 채보 ID가 바뀐다.
- 생성기 0.9.17: 기본 기준의 레인 고르게 쓰기 세기를 1.0 → 0.7로 낮췄다(`hands.systems.GRG.usageBalance`). 1.0은 빠른 줄기를 거의 늘 양손으로 갈라 연타 줄기·축연타·연타·트릴이 사람 BMS 채보보다 적었다. 전체 통계 77.1 → 78.4%, 레인 패턴 75.4 → 78.2%. 단계값별 램프는 이득의 절반만 가져오고, 키 선호 재적합은 키 비율을 모두 사람 쪽으로 옮기면서도 3.1%p를 잃어 받아들이지 않았다(`docs/PATTERN_DESIGN.md` 34장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.16: 기준마다 레벨별로 실제 열리는 분할을 뽑아 보니 EZ2ON의 EZ 티어만 16분을 아예 놓을 수 없었다(`[1, 2]`). EZ에 16분 5%, EZ2ON·DJMAX의 NM에 셋잇단 5%를 주었다(스윙 곡에서만 열린다). DJMAX 리듬 격자 67.7 → 75.2%, EZ2ON 60.9 → 69.6%(`docs/PATTERN_DESIGN.md` 33장). 형식은 그대로이고 DJMAX·EZ2ON 채보 ID가 바뀐다.
- 생성기 0.9.15: 0.9.1–0.9.14에서 기본 기준에만 넣었던 개선 가운데 음악·건반에서 온 것(노트 고르기 모델, 느린 반복, 레인 사용 기억, 도약·키 선호, 2개 동치 모양, 악구 키 묶음)을 DJMAX·EZ2ON도 함께 쓴다(전체 통계 48.4 → 55.4%, 49.6 → 56.6%). 게임의 성격에서 온 손 규칙과 빠른 같은 소리 보너스는 기준마다 그대로다. 기본 기준은 계획한 반복(연타·레이저·재봉틀)에서 같은 소리 보너스가 한 레인에 4연타를 붙이던 것을 고쳤다(`docs/PATTERN_DESIGN.md` 32장). 형식은 그대로이고 세 기준 모두 채보 ID가 바뀐다.
- 생성기 0.9.14: 기본 기준(GRG)이 레인 사용을 더 오래 기억해(노트 10개 → 33개 남짓) 연타 줄기·재봉틀·트릴·한쪽에 쏠린 마디를 사람 BMS 채보만큼 더 쓰고, MASTER의 2개 동치 모양을 다시 맞췄다(`docs/PATTERN_DESIGN.md` 30장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.13: 기본 기준(GRG) 7K+1S의 2개 동치가 사람 BMS 채보처럼 가운데 키와 그 이웃(3+4, 4+5)을 거의 쓰지 않고, 레벨마다 한 손 붙음·한 손 띄움·양손 비대칭을 사람 채보만큼 쓴다(`docs/PATTERN_DESIGN.md` 29장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.12: 기본 기준(GRG)의 HARD 이상이 셋잇단 느낌의 곡에서도 셋잇단을 치는 마디에만 셋잇단 자리를 쓴다(레벨 14에서 노트의 7.5 → 5.4%, 사람 5.6%, `docs/PATTERN_DESIGN.md` 28장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.11: 기본 기준(GRG)의 스크래치가 사람 BMS 채보만큼 늘었다(레벨 2에서 노트의 4.7 → 8.7%, `docs/PATTERN_DESIGN.md` 27장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.10: 기본 기준(GRG)이 반복음·드럼 악구에 재봉틀을 더 자주 쓰고, NORMAL부터 축연타를 더 길게(6–10타) 둔다(`docs/PATTERN_DESIGN.md` 26장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.9: 기본 기준(GRG)이 노트를 둘 소리를 고를 때 사람 BMS 채보에 맞춘 노트 고르기 모델(`config/pick.json`)을 섞는다(`docs/PATTERN_DESIGN.md` 25장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.8: 기본 기준(GRG)이 드럼 소리를 곡 전체에서 같은 키에 두고 반복 구간마다 손 좌우를 바꾸지 않는다. MASTER의 손 분담 악구에서 동치가 양손에 퍼지고, EASY·NORMAL은 엇박 후보를 사람 채보 쪽으로 고른다(`docs/PATTERN_DESIGN.md` 24장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.7: 기본 기준(GRG)의 7K+1S 악구가 사람 채보처럼 몇 개의 키 묶음에 머물고, EASY·NORMAL이 한 손 2개 동치와 (셋잇단 곡에서) 8분 셋잇단을 쓴다. 재봉틀은 모든 단계에서 쓰고 마디 균형 비용이 낮아졌다(`docs/PATTERN_DESIGN.md` 23장). 형식은 그대로이고 기본 기준 채보 ID가 바뀐다.
- 생성기 0.9.6: 기본 기준(GRG)의 7K+1S가 바깥 키(1·7번)를 쓰고 가운데 키에 덜 몰린다. 도약 비용과 쉬운 채보의 악구 창을 끄고, 키마다 늘 붙는 비용으로 키 비율을 BMS 사람 채보 쪽으로 맞췄다(`docs/PATTERN_DESIGN.md` 22장). 형식은 그대로이고 7K+1S 채보 ID가 바뀐다.
- 생성기 0.9.5: 기본 기준(GRG)이 느린 반복(앞 노트에서 260ms 이상)을 같은 레인에 더 자주 둔다. 같은 소리의 느린 반복은 보너스가 크고, 다른 소리라도 같은 레인 비용이 없으며, 양손 나누기와 레인 고르게 쓰기에 덜 묶인다. 빠른 같은 소리 보너스는 쉬운 단계일수록 크다(`docs/PATTERN_DESIGN.md` 21장). 형식은 그대로이고 채보 ID가 바뀐다.
- 생성기 0.9.4: 기본 기준(GRG)의 레인 배치와 프리셋을 BMS 사람 채보에 맞췄다(`docs/PATTERN_DESIGN.md` 20장). 1초 안에 다시 나오는 같은 소리는 같은 레인에 두고(연타 줄기 3까지), 연타 최소 간격을 낮췄다. EASY·NORMAL도 8분·16분을 쓰고, 스크래치는 EASY부터 나오며, 동치는 HARD를 뺀 난이도에서 더 많다(MASTER 0.32 → 0.47). 롱노트는 온셋 세기 0.4 이상의 소리에만 둔다(모든 기준). 형식은 그대로이고 채보 ID가 바뀐다.
- 분석기 1.7.3(생성기 0.9.25 그대로): 반 박 판정에서 맞춘 격자와 반 박 옮긴 격자 중 마디 화성 변화가 또렷한 쪽을 더 믿는다(`docs/PATTERN_DESIGN.md` 51장). 고를 때 쓰지 않은 BMS 973곡에서 마디선이 맞는 곡이 76.8 → 77.9%가 되었다. 형식은 그대로이고 다시 분석한 곡의 채보 ID가 바뀐다.
- 분석기 1.7.2(생성기 0.9.25 그대로): 4/4 마디 첫 박을 고를 때 마디마다 바뀌는 온셋 세기도 본다(`docs/PATTERN_DESIGN.md` 50장). 고를 때 쓰지 않은 BMS 973곡에서 마디선이 맞는 곡이 75.5 → 76.8%가 되었다. 형식은 그대로이고 다시 분석한 곡의 채보 ID가 바뀐다.
- 분석기 1.7.1(생성기 0.9.25 그대로): 템포를 반이나 두 배로 잡는 곡을 줄였다. 템포 단계를 고른 뒤 그 반·두 배가 BMS 채보에 맞춘 모델 점수로 확실히 나을 때만 옮긴다(`docs/PATTERN_DESIGN.md` 49장). 고를 때 쓰지 않은 BMS 973곡에서 마디선이 맞는 곡이 74.1 → 75.5%가 되었다. 형식은 그대로이고 다시 분석한 곡의 채보 ID가 바뀐다.
- 분석기 1.7.0(생성기 0.9.25 그대로): 마디선이 음악의 마디에 오도록 템포·박·마디 첫 박을 고쳤다(`docs/PATTERN_DESIGN.md` 48장). BPM이 하나인 곡을 구간별 템포로 쓸데없이 쪼개지 않고, 반 박 판정과 4/4 마디 첫 박을 BMS 채보에 맞춘 모델로 고른다. 고를 때 쓰지 않은 BMS 973곡에서 마디선이 맞는 곡이 59.3 → 74.1%가 되었다. 형식은 그대로이고 다시 분석한 곡의 채보 ID가 바뀐다.
- 분석기 1.6.1(생성기 0.9.3 그대로): 템포 단계 후보에 1.5배를 더했다. 3+3+2 강세가 있는 빠른 곡을 2/3나 반 템포로 잡지 않는다(BMS 948곡 템포 정답 70.9 → 81.1%, `docs/PATTERN_DESIGN.md` 18-6). 형식은 그대로이고 다시 분석한 곡의 채보 ID가 바뀐다.
- 생성기 0.9.3 · 분석기 1.6.0: 분석 결과의 온셋마다 새 소리가 시작되는 확신 `attack`(0–1)을 두고, 생성기는 후보 점수에 그 제곱을 곱한다(`docs/PATTERN_DESIGN.md` 19장). 울리는 음의 늦은 저음·부풀음, 같은 소리를 두 번 잡은 온셋에 노트가 덜 간다. 1.6.0 전 분석은 attack이 없어 채보가 그대로다. 형식은 그대로이고 채보 ID가 바뀐다.
- 생성기 0.9.2: 구간 설계도의 동치 배율을 구간마다 같게 하고 밀도는 조용한 구간만 낮췄다(BMS 사람 채보, `docs/PATTERN_DESIGN.md` 17-8). 후렴에 동치가 몰리지 않는다. 형식은 그대로이고 채보 ID가 바뀐다.
- 분석기 1.5.1(생성기 0.9.1 그대로): 3/4 판정에도 마디마다 바뀌는 화성을 쓴다(4/4 곡을 3/4로 잡지 않게, `docs/PATTERN_DESIGN.md` 18장). 형식은 그대로이고 다시 분석한 곡의 채보 ID가 바뀐다.
- 분석기 1.5.0(생성기 0.9.1 그대로): 템포·박·마디 첫 박을 BMS 채보의 정답에 맞췄다(`docs/PATTERN_DESIGN.md` 18장). 200–260 BPM 곡을 반으로 접지 않고(드럼이 그 템포로 칠 때), 엇박 베이스가 끈 반 박 어긋남을 바로잡고, 4/4 마디 첫 박을 마디마다 바뀌는 화성으로 고른다. 형식은 그대로이고 다시 분석한 곡의 채보 ID가 바뀐다.
- 생성기 0.9.1: 기본 기준의 손 규칙을 BMS 사람 채보 쪽으로 풀었다(같은 손 연속 비용 없음, 연타 줄기는 다섯 번째부터, 마디 좌우 균형과 손 번갈이 비용을 줄임, `docs/PATTERN_DESIGN.md` 17-7). DJMAX·EZ2ON 기준은 그대로다. 형식은 그대로이고 채보 ID가 바뀐다.
- 생성기 0.9.0: BMS 사람 채보와 음악의 짝 비교(`docs/PATTERN_DESIGN.md` 17장)를 반영했다. 곧은 곡은 셋잇단 자리를 쓰지 않고, 기본 기준의 2노트 동치는 한 손의 붙은 키보다 한 칸 띄운 모양(1+3)과 양손을 쓰며, 반복 구간에서 더한 노트가 복사할 노트의 레인을 막지 않는다. 형식은 그대로이고 채보 ID가 바뀐다.
- 생성기 0.8.1: BMS-Generator의 손 규칙(같은 손 연속, 연타 줄기, 마디의 좌우 균형, 한 손의 붙은 동치)을 DJMAX·EZ2ON에 맞게 고쳐 레인 배치 비용으로 넣었다(`docs/PATTERN_DESIGN.md` 16-6장). 계단·한 손 트릴·손 분담처럼 패턴이 일부러 한 손에 둔 노트는 그대로다. 형식은 그대로이고 채보 ID가 바뀐다.
- 생성기 0.8.0: 두 번째 플레이 피드백과 BMS 자료(`docs/PATTERN_DESIGN.md` 16장)를 반영했다. 롱노트는 실제로 끄는 소리(350ms 이상, 멜로디의 음이나 드럼이 아닌 음 있는 소리)에만 두고, 곡의 마지막 마디도 노트를 받는다. 분석기 1.4.0은 느린 곡의 템포를 두 배로 잡지 않고(백비트), 셔플의 박 위치를 바로잡고, 지속음의 흔들림을 온셋에서 지운다. 형식은 그대로이고 채보 ID가 바뀐다.
- 생성기 0.7.0: 플레이 피드백(`docs/PATTERN_DESIGN.md` 15장)을 반영했다. 빌드업·필인의 드럼 롤을 좌우 손이 번갈아 치고, 어려운 채보일수록 곡의 엇박을 따르고, 리듬 기준·스타일 '멜로디'가 주선율의 음을 따르고, 롱노트를 정박·반박에서 뗀다(`endBeat`가 곡의 격자 위). 분석기 1.3.0은 온셋마다 멜로디 존재도(`melody`)를 둔다. 형식은 그대로이고 채보 ID가 바뀐다.
- 생성기 0.6.0: 커뮤니티 패턴 가이드(`docs/PATTERN_DESIGN.md` 14장)를 반영했다. 반복 구간이 뒤로 갈수록 노트를 더하고(기승전결), 억지 연타와 긴 축연타를 피하고, 5K 피벗 동치와 재봉틀을 쓴다. 분석기 1.2.1은 필인 뒤 후렴의 시작을 바로 잡는다. 형식은 그대로이고 채보 ID가 바뀐다.
- 생성기 0.5.1: DJMAX · EZ2ON 기준 채보의 동치·롱노트 비율이 키 모드마다 조금씩 다르다(`GENERATION.md` 8-5). 채보 ID가 바뀐다.
- 생성기 0.5.0: 구간 엔진(`docs/PATTERN_DESIGN.md` 13장)이 기본이 되고, `sections`에 `endBeat`·`group`·`loopBars`·`confidence`가, `meta`에 `consistency`가 더해졌다. 채보 ID가 다시 바뀐다. 사용자가 구간을 고쳐 만든 채보는 그 구간이 ID에 들어간다.
- `stops`·`sounds`·`bgm`·`snd`·`so`·`sl`·`source`·`chartName`·`keysoundGain`은 Phase 4(편집·가져오기)에서 추가됐다. 모두 선택 필드다.
- `difficultySystem`·`levelScale`은 난이도 기준(DJMAX · EZ2ON)과 함께 추가됐다. 없으면 기본 기준이다. 생성기 파라미터의 `system`도 기본 기준이 아닐 때만 있어서, 기본 기준 채보의 `chartId`는 그대로다.

## 다른 포맷과의 대응

내보낼 때 음원은 넣지 않고 파일 이름만 적는다(생성 채보는 업로드한 원본 이름, 데모 곡은 `audio.flac`). 가져오고 내보낼 때 레인은 아래처럼 맞춘다.

| 우리 키 모드 | osu!mania | BMS 채널 | bmson x |
|---|---|---|---|
| 4K · 5K · 6K · 8K | 열 0…n−1 | — (5K만: 11–15) | — (5K만: 1–5, `beat-5k`) |
| 4K+FX · 6K+FX | 열 0…n−1(양 끝이 사이드), `Tags`에 `grg-mode:6K+FX` | — | — |
| 7K+1S | 8열, `SpecialStyle: 1`(0열 = 스크래치) | 스크래치 16, 1–5번 11–15, 6–7번 18–19 (롱노트 5x) | 스크래치 8, 1–7번 1–7 (`beat-7k`) |

- **시간**: 우리 `t`와 osu!·BMS·bmson의 시간 0은 모두 음원 파일의 처음이다. osu!는 시각을 정수 ms로 쓴다. 첫 박(`offsetMs`)이 0보다 늦으면 BMS는 그 길이의 첫 마디(채널 02)를, bmson은 그만큼의 펄스를 앞에 넣어 이후 마디가 우리 마디선과 맞게 한다. 디코더에 따라 MP3 앞부분 지연이 다를 수 있어 내보내기에 `offsetMs`(±5000ms) 보정을 둔다.
- **템포**: BMS는 #BPMxx(채널 08), bmson은 `bpm_events`, osu!는 빨간 타이밍 포인트. osu!는 STOP이 없어 STOP 끝에 타이밍 포인트를 다시 둔다(시각은 정확, 스크롤만 다름). BMS #STOP 값은 4/4 마디의 1/192 단위다.
- **롱노트**: BMS는 LNTYPE 1(채널 5x의 시작·끝 쌍)으로 쓰고, 읽을 때는 #LNOBJ도 받는다. bmson은 `l`(펄스 길이), osu!는 타입 128.
- **BMS 위치 해상도**: 마디·채널마다 모든 오브젝트가 0.5ms 안에 들어가는 가장 작은 분할(1 … 3840)을 고른다.
- **난이도 이름**: osu! `Version`은 "5K HARD Lv.9" · "5K DJMAX MX Lv.12" · "5K DJMAX SC 8", bmson `chart_name`은 "HARD" · "DJMAX MX", BMS `#DIFFICULTY`는 5단계 EASY 1 … MASTER 5, DJMAX NM 2 · HD 3 · MX 4 · SC 5, EZ2ON EZ 1 · NM 2 · HD 3 · SHD 4(`config/difficulty.json`의 `bmsDifficulty`). 편집·가져온 채보는 `chartName`을 쓴다.
- **가져올 때 정리**: 같은 레인·같은 시각이나 롱노트 안에 겹친 노트는 하나만 남기고 알림에 개수를 적는다. 레벨·NPS·스킬 지표는 우리 난이도 모델로 다시 계산한다(파일의 레벨은 `sourceLevel`로 따로).
- **커버**: 곡에 커버가 없으면 채보가 이름 붙인 그림 중 패키지에 있는 첫 그림을 커버로 쓴다. BMS #STAGEFILE → #BANNER, bmson `eyecatch_image` → `banner_image`, osu! [Events]의 배경. 이름은 대소문자·확장자와 상관없이 맞추고(BMS가 .bmp로 적은 그림이 .png로 들어 있는 경우), 형식은 파일의 첫 바이트로 판별한다.

## 리플레이 (`replays/<scoreId>.json`)

```json
{
  "version": 1,
  "chartId": "c1a2b3c4d5e6f7a8b9c0d",
  "songId": "a1b2c3d4e5f60718",
  "recordedAt": 1792236358000,
  "settings": { "judgementMode": "NORMAL", "ruleset": "RESPECT", "gaugeType": "NORMAL", "fever": "AUTO", "placement": "RANDOM", "placementSeed": 123456, "hiSpeed": 4.0 },
  "log": [1, 2, 2411.8, 0, 2, 2452.1, 2, 0, 2700.0],
  "result": { "score": 987654, "rate": 98.77, "maxCombo": 476, "lamp": "MAX COMBO" }
}
```

`settings`에는 녹화 때(플레이가 끝날 때)의 판정 오프셋 `inputOffsetMs`와 곡 오프셋 `songOffsetMs`도 있을 수 있다(없으면 예전 리플레이). 결과 화면은 리플레이에 오프셋 추천 대신 이 값을 "녹화 때 판정 오프셋"으로 보여 준다.

`log`은 `[동작, 레인, 판정 시각(ms)]`을 이어 붙인 것이다. 동작은 0 뗌 · 1 누름 · 2 갱신(무언가 바뀐 프레임 갱신: 늦은 미스, 롱노트 틱·끝, FEVER 끝) · 3 FEVER 발동이고, 판정 엔진에 들어간 순서 그대로다. 판정 시각은 이미 입력 오프셋을 뺀 값이라 보는 사람의 오프셋과 무관하다. 같은 채보(`chartId`)·같은 `settings`로 이 순서를 다시 넣으면 결과가 정확히 같다.
- 판정 대상 수 = 노트 수 + 롱노트 수(롱노트는 시작과 끝 두 번 판정).
- 틱 위치는 `beat`/`endBeat`와 `tempoMap`에서 계산한다.
