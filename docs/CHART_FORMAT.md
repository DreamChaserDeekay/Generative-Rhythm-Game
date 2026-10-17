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
    "generator": {
      "version": "0.2.0",
      "analyzer": "core-1.0.0",
      "seed": 3735928559,
      "params": {
        "difficulty": "HARD", "targetLevel": null, "density": 1.0, "longNoteRatio": 0.15, "maxChord": 3,
        "scratchRate": 0.05, "sideRate": 0.06, "style": "balanced", "rhythmSource": "auto"
      }
    }
  },
  "timing": {
    "offsetMs": 536.0,
    "tempoMap": [{ "beat": 0, "bpm": 128.0 }],
    "meter": [{ "measure": 0, "beatsPerMeasure": 4 }]
  },
  "sections": [{ "startBeat": 0, "label": "verse", "energy": 0.66 }],
  "notes": [
    { "beat": 4.0, "t": 2411.0, "lane": 3, "type": "tap" },
    { "beat": 4.5, "t": 2645.375, "lane": 6, "type": "hold", "endBeat": 6.0, "endT": 3348.5 },
    { "beat": 6.0, "t": 3348.5, "lane": 0, "type": "tap" }
  ]
}
```

## 필드

### meta

| 필드 | 설명 |
|---|---|
| `chartId` | `c` + SHA-256 앞 20자. 오디오 해시, 분석기 버전·보정값, 키 모드, 공개 파라미터, 시드, 생성기 버전으로 만든다. 기록은 이 값에 묶인다. |
| `audioHash` | 업로드 원본의 `sha256:` 해시. |
| `songId` | 서버 라이브러리의 곡 ID(원본 해시 앞 16자). |
| `keyMode` / `lanes` | 키 모드와 레인 ID. `lane` 값은 이 배열의 인덱스다. 7K+1S에서 0번은 스크래치, FX 모드(4K+FX · 6K+FX)에서 처음(`FXL`)과 끝(`FXR`)은 사이드 트랙. 레인 종류는 `config/keymodes.json`의 `kind`. |
| `difficulty` / `level` / `rating` | 난이도 프리셋, 정수 레벨(1–15), 소수 세부 난이도. |
| `nps` | 평균·최대(1초 창) NPS와 2초 단위 NPS 그래프. |
| `effectiveNps` | 난이도 산정기의 유효 NPS(동치·연타·롱잡 부담이 반영된 값). |
| `densityLimited` | 곡에 들리는 소리가 부족해 목표 레벨까지 올리지 못했으면 `true`. |
| `skillset` | 0–1 스킬 프로필: stream, chord, jack, longNote, technical, stamina. |
| `handLoad` | 난이도 모델의 손 strain이 왼손(`L`)·오른손(`R`)에 나뉜 비율. |
| `generator` | 생성기·분석기 버전, 시드, 사용자 파라미터(스타일·리듬 기준·밀도·롱노트 비율·최대 동치·스크래치·사이드 비율). |

### timing

- `offsetMs`: 0박(첫 다운비트)의 시각.
- `tempoMap`: `{beat, bpm}` 구간별 고정 템포. 첫 항목은 반드시 `beat: 0`. 0박보다 앞선 박은 첫 구간의 템포를 거꾸로 적용한다.
- `meter`: `{measure, beatsPerMeasure}`. 마디선 계산에 쓴다.

### notes

| 필드 | 설명 |
|---|---|
| `beat` | 박 위치(그리드·편집·내보내기용). |
| `t` | **표준 오디오(서버의 `audio.flac`) 첫 샘플 기준 ms.** 플레이 판정은 이 값을 쓴다. |
| `lane` | `meta.lanes` 인덱스. |
| `type` | `tap` 또는 `hold`. |
| `endBeat` / `endT` | 롱노트 끝(`hold`만). |

노트는 `t`, `lane` 순으로 정렬되어 있다. 같은 레인·같은 시각 중복, 롱노트 겹침은 없다(린터가 보장).

## 플레이 규칙과의 관계

- 롱노트는 DJMAX 방식으로 판정한다: 시작 타이밍 판정 → 누르는 동안 1/4박마다 콤보 틱 → 끝까지 누르면 끝 판정 MAX 100%, 끝 100ms 전보다 일찍 떼면 BREAK.
- 사이드 트랙 노트를 놓치면 BREAK가 아니라 MAX 1%다.
- 배치 옵션(MIRROR·RANDOM 등)과 연습 구간은 클라이언트가 플레이 직전에 노트의 `lane`을 바꾸거나 일부만 골라 적용한다. 채보 파일과 `chartId`는 바뀌지 않는다.
- 판정 대상 수 = 노트 수 + 롱노트 수(롱노트는 시작과 끝 두 번 판정).
- 틱 위치는 `beat`/`endBeat`와 `tempoMap`에서 계산한다.
