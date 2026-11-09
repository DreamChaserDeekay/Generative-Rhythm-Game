# Mapperatorinator 브랜치 (`claude/mapperatorinator`)

요청(PC의 PRIVATE ORCHESTRATOR가 전달, 2026-11-09): "generative rhythm에서 브랜치 따로 파서 이 mapperatorinator를 적용한 버전으로 새로 하나 빌드해줄래?"

사용자가 고른 방식은 다음과 같다.

- 생성기는 통째로 바꾼다.
- 모델은 앱 PC의 GPU에서 돌린다.
- 모든 키 모드를 Mapperatorinator로 만든다. 7K+1S는 8K로 만들어 맨 왼쪽 열을 스크래치로 쓴다.

이 브랜치는 `claude/zealous-davinci-0w3s3l`(40e7fba)에서 갈라졌고, 그 브랜치나 develop에는 합치지 않는다.

## 무엇이 바뀌었나

- **채보 생성**
  - 곡을 열면 그 채보를 Mapperatorinator(OliBomby/Mapperatorinator, 코드 MIT)가 만든다. 가중치는 `OliBomby/Mapperatorinator-v32`의 mania 전용 `gamemode=3`(MIT)이다.
  - 분석기는 그대로다. 구간 표시, 마디선, 키음 스템에 계속 쓰인다.
  - 기존 규칙 생성기의 설계 규칙(솔로, 드럼 박, 손 배치 등)은 Mapperatorinator 채보에 적용되지 않는다.
- **실행 환경**
  - ML판 설치 파일에는 CPU용 PyTorch만 들어간다. CUDA판은 2GB가 넘어 NSIS 설치 파일에 들어가지 않는다.
  - 그래서 앱이 처음 쓸 때 사용자 폴더(`%LOCALAPPDATA%\Generative Rhythm\mapper`)에 따로 Python 환경을 만든다. 들어가는 것은 다음과 같다.
    - uv(PyPI 휠, sha256 확인)
    - Python 3.11
    - PyTorch 2.10 + CUDA 12.6
    - Mapperatorinator의 추론 패키지(requirements.txt와 같은 버전)
    - 소스(설치 파일에 들어 있는 고정 커밋 5884d1b)
    - 가중치(Hugging Face, 약 0.9GB)
  - 모두 합쳐 약 4GB를 내려받는다.
  - **설정 → 고급 → AI 채보 (Mapperatorinator)**의 **설치** 버튼으로 시작하고, 진행률이 그 자리에 나온다.
- **채보를 만드는 방식** (`server/rhythm_server/mapper/`)
  1. 서버가 곡의 오디오(WAV)를 넘긴다.
  2. 앱 분석기의 BPM·박자·첫 박을 담은 타이밍만 있는 `.osu`도 함께 넘긴다(`in_context=[TIMING]`). 그래서 노트가 앱의 마디선에 맞고 생성도 빠르다.
  3. 별점, 키 수, 시드를 정해 따로 뜬 작업 프로세스(`worker.py`, 모델을 띄워 둔 채 한 번에 하나씩)에 요청한다.
  4. 돌아온 osu!mania 채보를 앱 채보로 바꾼다.
  5. 변환된 채보에 앱의 레벨 추정, 패턴 요약, 구간, 카메라 연출을 붙인다. 노트마다 가장 가까운 온셋의 스템을 달아 스템 키음 모드도 그대로 동작한다.
- **키 모드**

  | 앱 | Mapperatorinator | 비고 |
  |---|---|---|
  | 4K · 5K · 6K · 8K | 같은 키 수 | |
  | 7K+1S | 8K | 0번 열이 스크래치 |
  | 4K+FX · 6K+FX | 4K · 6K | FX 레인은 비어 있음 |

- **난이도**
  - 티어마다 레벨 범위의 가운데(목표 레벨을 고르면 그 레벨)를 osu! 별점으로 바꿔 요청한다.

    | 앱 레벨 | 1 | 4 | 7 | 10 | 13 | 15 | 17 | 20 |
    |---|---|---|---|---|---|---|---|---|
    | 별점 | 1.0 | 1.8 | 2.6 | 3.4 | 4.3 | 5.0 | 5.7 | 7.0 |

    중간 레벨은 직선으로 잇는다(`config/mapper.json` `starsForLevel`).
  - 화면에 보이는 레벨은 만들어진 노트를 앱이 직접 잰 값이다.
  - 이 대응은 아직 맞추지 않은 첫 값이다. 체감 회귀 세트로 재서 고칠 곳이다.
- **곡 선택 화면**
  - 채보는 열 때 만들어진다(GPU에서 곡당 1–3분 예상). 그 전에는 티어 칸에 목표 레벨과 "AI · 열면 만듦"이 나온다.
  - 한 번 만든 채보는 저장되어 다시 열면 바로 나온다. 다른 티어를 미리 만들어 두지는 않는다. GPU 하나로 다섯 티어를 미리 만들면 너무 오래 걸린다.
- **GPU가 없거나 실패할 때**
  - NVIDIA GPU가 없는 PC(회사 PC)에서는 설정 화면에 "NVIDIA GPU 없음"이 나오고, 채보는 기존 규칙 생성기로 만든다.
  - 설치하기 전에도 기존 생성기로 만든다.
  - 생성이 실패하면(메모리 부족 등) 그 채보는 기존 생성기로 만들고, 설정 화면에 마지막 실패를 보여 준다.
- **체감 회귀 세트**
  - `feel_report.py run --library <데이터 폴더> --saved mapperatorinator --out ai.json`은 앱이 만들어 저장한 Mapperatorinator 채보를 같은 지표로 잰다.
  - 먼저 앱에서 6K HARD·ELITE, 7K+1S EXPERT·MASTER를 열어 만들어 두어야 한다.
  - `compare old.json ai.json`으로 기존 생성기와 견줄 수 있다.

## 빌드 결과물 받기

이 브랜치에 올릴 때마다 GitHub Actions의 **Desktop app (Windows)**가 설치 파일을 만든다. 실행 기록의 Artifacts에 30일간 남는다.

- `GenerativeRhythm-Windows-Setup`(기본판)과 `GenerativeRhythm-Windows-ML-Setup`(ML판) 모두 Mapperatorinator를 쓴다. 실행 환경은 앱 밖에 따로 설치되므로 판과 상관없다.
- 다른 판을 이미 설치했다면 같은 앱이라 덮어쓴다. 라이브러리(곡·기록)는 그대로다.
- 기본판 빌드 작업은 러너의 CPU로 작은 모델(v32-mini)을 써서 실행 환경 설치와 20초짜리 합성 곡 채보 하나를 끝까지 돌려 본다. 이 단계는 실패해도 빌드는 계속된다. 기록은 `windows-smoke-test-core` 아티팩트의 `setup.log` · `worker.log`에 남는다.

## 알려진 한계

- **이 클라우드 세션에서는 Mapperatorinator를 한 번도 실제로 돌리지 못했다.**
  - 외부 코드를 내려받아 실행하는 것이 이 세션의 안전 장치에 막혔다. GPU도 없다.
  - 코드를 읽어 연결했다. 서버 흐름은 가짜 작업 프로세스로 시험했다(`server/tests/test_mapper.py`, 9개).
  - 실제 실행은 위 Windows 빌드의 CPU 단계와 집 PC에서 처음 확인된다.
- **RTX 2060**
  - bf16을 지원하지 않아 fp32로 돈다(Mapperatorinator 자체 판단).
  - 6GB판이면 긴 곡에서 메모리가 빠듯할 수 있다. 실패하면 기존 생성기로 넘어간다.
  - 속도는 아직 재지 않았다.
- **NVIDIA 드라이버**
  - CUDA 12.6용 PyTorch라 드라이버 560 이상이 필요하다.
  - 설치 마지막의 확인 단계에서 GPU를 못 쓰면 "드라이버를 최신으로" 안내와 함께 실패한다.
- **학습 데이터**
  - 학습 데이터는 osu!mania 랭크 맵이다. 4K·7K가 많고 5K·6K·8K는 적어 품질이 떨어질 수 있다.
  - 7K+1S의 스크래치는 모델이 8K의 한 열로 배치한 것이라 BMS식 스크래치와 다를 수 있다.
- **앱 규칙이 적용되지 않는 부분**
  - 앱의 플레이 규칙 검사(최소 연타 간격, 동시 노트 수 등)를 적용하지 않는다. 구조 검사(겹침, 길이 0 롱노트)만 한다.
  - 레벨이 티어 범위를 벗어날 수 있다.
- **처음 쓸 때**
  - 설치에 인터넷과 시간이 든다(약 4GB). 받는 곳은 PyPI, download.pytorch.org, GitHub(Python), Hugging Face다.
  - 실행 환경을 지우려면 앱을 끈 뒤 `%LOCALAPPDATA%\Generative Rhythm\mapper` 폴더를 지운다.
- **라이선스**
  - Mapperatorinator의 코드와 가중치는 MIT다. 함께 받는 slider(OliBomby 포크)는 원 저장소의 라이선스를 따른다.
  - Mapperatorinator README는 "AI 사용을 밝힐 것"을 당부한다.

## 관련 파일

| 파일 | 내용 |
|---|---|
| `config/mapper.json` | 모델, 별점 대응, 고정 버전·커밋, 받는 주소 |
| `server/rhythm_server/mapper/runtime.py` | 실행 환경 설치·상태(NVIDIA GPU 찾기: DXGI) |
| `server/rhythm_server/mapper/worker.py` | Mapperatorinator 쪽 Python에서 도는 작업 프로세스 |
| `server/rhythm_server/mapper/service.py` | 작업 프로세스 관리(하나씩, 시간 제한) |
| `server/rhythm_server/mapper/charts.py` | 요청·타이밍 `.osu`·변환·차트 ID |
| `server/rhythm_server/api/app.py` | 채보 요청을 Mapperatorinator로(`/api/mapper`, `/api/mapper/install`) |
| `client/src/ui/SettingsScreen.tsx` | 설정 화면 "AI 채보" |
| `client/src/ui/SongSelectScreen.tsx` | 티어 칸의 "AI · 열면 만듦" |
| `server/scripts/feel_report.py` | `--saved` |
| `packaging/rhythm-server.spec`, `.github/workflows/desktop-windows.yml` | 소스 동봉과 CPU 시험 단계 |

명령줄에서 쓸 수 있는 것은 다음과 같다(개발용).

```bash
python -m rhythm_server mapper status      # 상태
python -m rhythm_server mapper setup       # 설치 (설정 화면의 버튼과 같음)
python -m rhythm_server mapper generate    # 합성 곡 30초로 채보 하나
```
