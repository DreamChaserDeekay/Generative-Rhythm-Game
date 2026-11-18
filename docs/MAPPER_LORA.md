# Mapperatorinator 5 · 6 · 8키 채보: LoRA 학습 준비 (2026-11-18, `claude/mapper-lora`)

요청: 백로그의 "mapperatorinator 5, 6, 8키 채보 학습". 이 문서는 학습 **전까지**의 준비다: 지금 무엇이 나쁜지의 숫자, 학습 없이 되는지, 데이터, 학습 절차와 Windows에서 되는지의 증명, 앱 연결, 사용자가 돌릴 것. 긴 학습은 돌리지 않았다(클라우드 세션과 GitHub 러너에는 GPU가 없다).

- 클라우드 세션에서는 Mapperatorinator를 설치하거나 실행하지 않았다. 소스는 고정 커밋 `5884d1b`를 읽기만 했고, 실행은 GitHub Actions 러너에서만 했다.
- 음원 · 채보 · 데이터셋 조각 · 어댑터는 저장소에 없다. 아래는 집계 숫자, 스크립트, 설정뿐이다.

## 요약

- **숫자로 나쁜 것은 8K 하나다.** 8열 채보 18개 중 12개에서 한 열이 거의 비고(8번 열 평균 5.8%, 고르면 12.5%), 4K · 5K · 6K는 그런 채보가 없다. 5K · 6K는 이 문서의 지표로는 4K와도, 사람 채보와도 같은 수준이다.
- **8K의 빈 열은 학습 데이터 그대로다.** 데이터셋의 사람 8K 채보 285개 중 `SpecialStyle`(7키 + 스크래치)이 166개(58%), 한 열이 거의 빈 채보가 120개(42%)다. 그래서 8K LoRA를 "8K 전부"로 학습하면 빈 열이 더 굳는다. 열이 고른 채보만 골라야 하고(`make_dataset.py --min-column-share`), 그런 채보는 165개(절반 기준) 또는 52개(3/4 기준)다.
- **조건만으로는 안 된다.** `style/N+1`을 피할 태그로 주고 CFG를 2 · 4로 올려도, 열 temperature를 올려도 8K의 빈 열은 남는다(4개 채보 중 3–4개).
- **학습 → 어댑터 → 앱의 채보 생성은 Windows에서 끝까지 통한다.** 러너(CPU)에서 LoRA 3스텝을 학습해 어댑터를 실행 환경 폴더에 놓고, 앱의 워커가 그 어댑터로 8K 채보를 만들었다. flash-attention · bf16 · `torch.compile` 없이 됐다. 6GB에서 메모리가 되는지와 걸리는 시간은 GPU가 없어 재지 못했고, `train.py --test`(10스텝)가 PC에서 잰다.
- **앱은 준비됐다.** 어댑터 폴더를 실행 환경의 `lora/<N>K`에 두면 그 키 수의 채보가 그것으로 만들어지고, 채보 ID와 `generator.lora`에 어댑터의 태그가 들어간다. 어댑터가 없으면 지금과 한 글자도 다르지 않다.
- **사용자가 정할 것**: 5K · 6K에서 무엇을 고치고 싶은지(숫자로는 목표가 없다), 8K를 학습으로 할지, 어디서 학습할지, 데이터셋의 이용 조건을 받아들일지. 아래 "고를 것".

## 1. 지금 무엇이 나쁜가 (학습 전 기준)

**잰 것.** 러너의 DPC 실행 [43689401864](https://github.com/DreamChaserDeekay/Generative-Rhythm-Game/actions/runs/43689401864)의 원본 `.osu` 72개(v32, CPU fp32, CC BY 6곡 × 4K · 5K · 6K · 8K × HARD · EXPERT · MASTER, 2026-12-15까지 보관)를 앱이 하는 대로 채보로 바꿔(`charts.notes_from_osu`) `scripts/mapper_keymode_report.py`로 쟀다. 패턴 몫은 앱의 `difficulty/patterns.pattern_profile`, 레벨은 `difficulty/estimator.estimate`다. 같은 스크립트를 조건을 바꾼 채보나 어댑터로 만든 채보에 돌리면 전후 비교가 된다.

```bash
pip install -e ./server
python scripts/mapper_keymode_report.py <.osu와 <곡>.<모드>.json이 있는 폴더> [--json out.json]
python scripts/mapper_keymode_report.py <make_dataset.py가 만든 폴더> --mmrs     # 사람 채보
```

**열의 쏠림** (가장 적은 · 많은 열의 몫 × 키 수. 고르면 1.00. 값은 HARD · EXPERT · MASTER 순, 각 6개 채보 평균)

| 키 | 가장 적은 열 | 가장 많은 열 | 쏠림(0–1) | 한 열이 거의 빈 채보(고른 몫의 절반 미만) | 왼손 : 오른손 |
|---|---|---|---|---|---|
| 4K | 0.93 · 0.95 · 0.94 | 1.07 · 1.05 · 1.05 | 0.037 · 0.024 · 0.028 | 18개 중 0 | 0.499 : 0.501 |
| 5K | 0.91 · 0.91 · 0.92 | 1.12 · 1.09 · 1.07 | 0.044 · 0.038 · 0.027 | 0 | 0.395 : 0.399 (가운데 0.207) |
| 6K | 0.86 · 0.89 · 0.91 | 1.12 · 1.09 · 1.09 | 0.048 · 0.036 · 0.030 | 0 | 0.499 : 0.501 |
| 8K | **0.30 · 0.37 · 0.58** | 1.36 · 1.50 · 1.20 | **0.121 · 0.136 · 0.083** | 18개 중 **12** (HARD 5 · EXPERT 5 · MASTER 2) | 0.519 : 0.481 |

열별 몫(%, 키 모드의 18개 채보 평균)과 채보마다 가장 적게 쓴 열:

- 4K (고르면 25.0): 24.3 · 25.6 · 26.0 · 24.1 / 가장 적은 열: 1번 7개, 2번 3개, 4번 8개
- 5K (20.0): 19.0 · 20.5 · 20.7 · 20.7 · 19.1 / 1번 7개, 3번 3개, 4번 1개, 5번 7개
- 6K (16.7): 15.6 · 16.6 · 17.7 · 17.6 · 16.6 · 15.9 / 1번 11개, 5번 3개, 6번 4개
- 8K (12.5): 12.6 · 12.0 · 14.0 · 13.3 · 15.6 · 12.8 · 13.9 · **5.8** / 1번 2개, 2번 1개, 7번 1개, **8번 14개**

**동시치기** (치는 순간 가운데 몫, HARD · EXPERT · MASTER)

| 키 | 1개 | 2개 | 3개 | 4개 이상 | 한 손만 쓴 동시치기 |
|---|---|---|---|---|---|
| 4K | 0.711 · 0.610 · 0.487 | 0.288 · 0.344 · 0.329 | 0.000 · 0.045 · 0.177 | 0.000 · 0.001 · 0.007 | 0.383 · 0.352 · 0.202 |
| 5K | 0.647 · 0.598 · 0.466 | 0.343 · 0.347 · 0.310 | 0.010 · 0.055 · 0.210 | 0.000 · 0.000 · 0.013 | 0.178 · 0.190 · 0.099 |
| 6K | 0.726 · 0.517 · 0.448 | 0.269 · 0.352 · 0.240 | 0.005 · 0.123 · 0.232 | 0.000 · 0.009 · 0.080 | 0.380 · 0.229 · 0.161 |
| 8K | 0.601 · 0.473 · 0.343 | 0.339 · 0.312 · 0.216 | 0.054 · 0.176 · 0.208 | 0.007 · 0.038 · **0.233** | 0.248 · 0.184 · 0.118 |

**패턴** (건반 노트 가운데 몫. 계단 · 트릴은 단노트 줄기에서, 도약 · 손 교대는 빠른 이동에서 센다)

| 키 | 계단 | 트릴 | 잭 | 150ms 안 잭 (1000개당) | 롱노트 아래 노트 | 도약(3열 이상) | 손 교대 | 롱노트 몫 |
|---|---|---|---|---|---|---|---|---|
| 4K | 0.160 · 0.059 · 0.029 | 0.010 · 0.012 · 0.004 | 0.035 · 0.054 · 0.208 | 2.6 · 13.7 · 171.2 | 0.081 · 0.121 · 0.131 | 0.098 · 0.114 · 0.077 | 0.667 · 0.714 · 0.607 | 0.105 · 0.180 · 0.290 |
| 5K | 0.100 · 0.056 · 0.023 | 0.012 · 0.018 · 0.003 | 0.024 · 0.041 · 0.099 | 0.2 · 2.5 · 62.5 | 0.104 · 0.122 · 0.135 | 0.163 · 0.170 · 0.156 | 0.759 · 0.827 · 0.711 | 0.086 · 0.094 · 0.152 |
| 6K | 0.042 · 0.036 · 0.021 | 0.005 · 0.004 · 0.003 | 0.020 · 0.040 · 0.083 | 0.0 · 12.4 · 39.3 | 0.108 · 0.100 · 0.177 | 0.335 · 0.205 · 0.197 | 0.668 · 0.503 · 0.565 | 0.107 · 0.098 · 0.161 |
| 8K | 0.029 · 0.016 · 0.006 | 0.009 · 0.010 · 0.004 | 0.050 · 0.057 · 0.086 | 0.4 · 2.1 · 32.6 | 0.022 · 0.046 · 0.057 | 0.382 · 0.285 · 0.217 | 0.551 · 0.590 · 0.358 | **0.024 · 0.020 · 0.023** |

**밀도와 레벨** (목표 6 · 10 · 18)

| 키 | 초당 노트 | 앱이 잰 레벨 | 목표와의 차이 |
|---|---|---|---|
| 4K | 6.03 · 8.31 · 10.53 | 9.5 · 13.7 · 18.2 | +3.5 · +3.7 · +0.2 |
| 5K | 5.57 · 8.33 · 11.73 | 7.7 · 14.0 · 17.3 | +1.7 · +4.0 · −0.7 |
| 6K | 5.06 · 8.76 · 13.18 | 6.3 · 13.7 · 18.5 | +0.3 · +3.7 · +0.5 |
| 8K | 5.55 · 8.50 · 15.26 | 7.3 · 12.3 · 18.5 | +1.3 · +2.3 · +0.5 |

### 읽은 것: 4K를 기준으로 어디서 떨어지나

- **8K만 열이 쏠린다.** 가장 적은 열이 고른 몫의 0.30 · 0.37 · 0.58배이고, 18개 중 14개 채보에서 그 열이 8번이다. 채보마다 보면 대부분 8번 열이 0.6–7%이고, MASTER 몇 개만 8–12%로 고르다.
- **8K는 롱노트가 거의 없다**(2%). 4K는 10–29%, 5K · 6K는 9–16%다. 사람 8K도 4.3 · 3.1 · 2.5%라(3절) 모델이 데이터를 따른 것이다.
- **8K MASTER는 4개 이상 동시치기가 23%다**(4K 0.7%, 6K 8%). 사람 8K MASTER는 15%다.
- **5K · 6K는 4K와 다른 점이 키 수에서 오는 것뿐이다.** 열 쏠림 0.03–0.05로 4K와 같고, 키가 늘수록 계단이 줄고 도약이 는다(계단 4K 0.083 → 5K 0.060 → 6K 0.033 → 8K 0.017, 도약 0.097 → 0.163 → 0.245 → 0.295). 사람 채보도 같은 방향이다(3절의 표: 계단 0.098 → 0.078 → 0.059 → 0.041, 도약 0.118 → 0.199 → 0.254 → 0.289).
- **레벨은 모든 키에서 EXPERT가 목표보다 2–4 높다.** 사람 채보를 같은 별점으로 재면 더 높게 나온다(EXPERT +4.0 – +7.2). 별점 대응(`starsForLevel`)과 레벨 측정의 문제이고 학습이 고칠 것이 아니다.

**"학습이 고쳐야 할 것"의 목록** (학습 뒤 같은 스크립트로 다시 잰다)

| 키 | 고칠 것 | 지금 | 목표 |
|---|---|---|---|
| 8K | 한 열이 거의 빈 채보 | 18개 중 12 | 0 |
| 8K | 가장 적은 열의 몫 × 8 | 0.30 · 0.37 · 0.58 | 6K 수준(0.86–0.91) |
| 8K | (바란다면) 롱노트 몫 | 2% | 정하지 않음. 설정의 "롱노트 비율"로도 바뀐다 |
| 5K · 6K | 숫자로 잡힌 것이 없다 | — | 사용자가 느낀 불만이 무엇인지에 달렸다 |

## 2. 학습 없이 되는지: 모델의 조건

앱은 모델에 별점 · 키 수 · 롱노트 비율만 넘겼고, 스타일 태그(`descriptors`) · 피할 태그(`negative_descriptors`) · `cfg_scale` · `mania_column_temperature` · `mapper_id` · `year`는 넘기지 않았다. 워커가 이것들을 받게 하고(`config/mapper.json`의 `conditions`, 키 수별, 기본은 비어 있다) 8K에 돌렸다.

**돌린 것.** `.github/workflows/mapper-conditions.yml`, 실행 [44322511185](https://github.com/DreamChaserDeekay/Generative-Rhythm-Game/actions/runs/44322511185)(8개 작업 모두 성공): v32, 러너 CPU fp32, chibi_ninja · newer_wave × 8K HARD · EXPERT, 기준과 같은 시드. 기준은 1절의 같은 4개 채보다.

| 조건 | 가장 적은 열 × 8 | 8번 열 평균 | 한 열이 거의 빈 채보 | 생성 시간(기준 대비) |
|---|---|---|---|---|
| 기준 | 0.23 | 2.9% | 4개 중 4 | 1 |
| `descriptors: [style/N+1]` | 0.37 | 6.2% | 4 | 0.9–1.2 |
| `negativeDescriptors: [style/N+1]`, `cfgScale: 2.0` | 0.45 | 5.9% | 3 | 1.4–2.2 |
| `negativeDescriptors: [style/N+1]`, `cfgScale: 4.0` | 0.19 | 4.9% | 4 (하나는 1번 열이 2.8%) | 1.4–1.9 |
| `columnTemperature: 1.0` | 0.23 | 2.9% | 4 | 0.9–1.3 |

- **어느 조건도 빈 열을 고치지 못한다.** 피할 태그 + CFG 2.0에서 채보 하나(chibi_ninja HARD, 8번 열 9.7%)만 기준을 넘었다.
- **`style/N+1` 태그는 이 현상을 쥐고 있지 않다.** 태그를 줘도 더 비지 않는다. v32의 토크나이저(`gamemode=3/tokenizer.json`)에서 이 태그가 붙은 학습 채보는 19개뿐이다(태그가 붙은 채보는 모두 24,975개). 사람 8K 285개 가운데 이 태그에 한 표라도 받은 채보는 84개지만 v32의 문턱(두 표)을 넘는 것은 17개다.
- **열 temperature는 채보를 거의 바꾸지 않았다**(네 채보 모두 열 몫이 1%p 안에서 같고 노트 수도 같거나 하나 다르다).
- 표본이 조건당 4개라 "조금 나아짐"의 크기는 믿을 수 없다. "고쳐지지 않음"만 읽는다.
- CFG는 디코더를 토큰마다 두 번 돌려 생성이 1.4–2.2배 걸린다.

조건으로 남은 것은 `mapper_id`(8열을 고르게 쓰는 매퍼를 고르기)와 `year`다. 돌리지 않았다: 어떤 매퍼가 그런지는 채보 내용을 봐야 알고, 그 정도면 그 채보들로 학습하는 것과 같은 일이다.

## 3. 데이터

### 데이터셋 `project-riz/osu-beatmaps`

**라이선스 문구 (그대로 옮김. 해석은 사용자 몫이다)**

카드의 앞머리:

```
license: other
license_name: osu-terms
license_link: https://osu.ppy.sh/legal/terms
```

카드 본문의 "License" 절 전체:

> This dataset contains user-generated content from osu! and is subject to the [osu! Terms of Service](https://osu.ppy.sh/legal/terms). The beatmap charts are created by community mappers and the audio tracks are copyrighted by their respective owners.
>
> This dataset is provided for research purposes only.

함께 쓰는 태그 데이터셋 `project-riz/osu-beatmap-tags`의 "License" 절: "Data sourced from the [osu! API](https://osu.ppy.sh/api/v2). Usage is subject to [osu!'s terms of service](https://osu.ppy.sh/legal/en/Terms)."

Mapperatorinator의 가중치(`OliBomby/Mapperatorinator-v32`)는 카드에 `license: mit`이고 `datasets:`에 위 둘을 적고 있다. 사용자가 수익화를 생각한 적이 있으므로 덧붙인다: 지금 앱이 쓰는 v32 자체가 이 데이터로 학습된 것이고, LoRA를 학습하면 사용자가 직접 이 데이터를 받아 쓰게 된다는 점이 달라진다.

**형태** (Hugging Face API와 카드에서 확인)

- gated가 아니다. 파일은 tar 조각뿐이고 채보 목록(메타데이터) 파일이 없다: `compressed/` 74개 79.0GB(조각당 약 1.07GB, opus 음원), `original/` 205개 220.2GB.
- 표본 하나가 곡(음원) 하나이고, 그 곡의 모든 채보가 JSON 안에 `.osu` 본문(`content`)과 함께 들어 있다. 조각은 음원 해시 순이라 키 수와 무관하게 섞여 있다. **5K · 6K · 8K만 담긴 조각은 없고, 원하는 채보를 모으려면 74개를 모두 읽어야 한다.**
- 그래서 `scripts/lora/make_dataset.py`는 조각을 받으면서 읽고(디스크에 조각을 남기지 않는다) 원하는 키 수의 곡만 남긴다. 러너에서 74개를 읽는 데 4분 30초–13분이 걸렸다(GitHub 러너의 회선. 집에서는 회선 속도에 달렸다: 100Mbps면 79GB에 약 1시간 50분). 키 수 하나에 한 번씩 읽는다.

**사람 채보의 수** (`.github/workflows/mapper-dataset-stats.yml`, 실행 [44331823881](https://github.com/DreamChaserDeekay/Generative-Rhythm-Game/actions/runs/44331823881): 74개 조각을 모두 읽어 센 값. 음원은 받지 않았고 집계만 남겼다. 노트 50개 미만 채보는 뺐다)

| | 4K | 5K | 6K | 8K |
|---|---|---|---|---|
| 채보 | 19,394 | 671 | 914 | 285 |
| 곡 | 5,999 | 219 | 278 | 93 |
| 별점 중앙값 | 3.12 | 2.60 | 3.29 | 2.83 |
| ranked · loved | 16,981 · 2,413 | 627 · 44 | 690 · 224 | 259 · 26 |
| 2024년까지의 ranked(v32 학습 설정 `v32.yaml`의 조건) | 13,681 | 555 | 517 | 218 |
| 그 밖(loved, 2025년) | 5,713 | 116 | 397 | 67 |
| `SpecialStyle` (.osu의 표시) | 116 (0.6%) | 12 (1.8%) | 49 (5.4%) | **166 (58.2%)** |
| 가장 적은 열이 고른 몫의 1/4 미만 | 0 | 3 | 3 | 39 (13.7%) |
| 〃 절반 미만 | 2 | 7 (1.0%) | 13 (1.4%) | **120 (42.1%)** |
| 〃 3/4 미만 | 34 | 42 (6.3%) | 71 (7.8%) | 233 (81.8%) |

- 전에 센 값(4K 18,971 · 6K 896 · 5K 664 · 8K 289)은 74개 중 72개 조각의 것이었고 위와 맞는다.
- 별점 분포(1점 구간, 0점대부터): 5K 25 · 208 · 170 · 138 · 88 · 27 · 11 · 4 / 6K 19 · 190 · 191 · 183 · 135 · 102 · 49 · 30 · 12 · 3 / 8K 11 · 87 · 50 · 55 · 44 · 24 · 10 · 3 · 0 · 0 · 1.
- 승인 연도: 5K는 2022–2025년이 421개(63%), 6K는 2021–2025년이 740개(81%), 8K는 2015–2018년이 143개(50%)이고 2019–2020년은 없다.
- **모델이 이미 본 것과 아닌 것.** `v32.yaml`은 `max_year: 2024`이고 `ranked_statuses`는 기본값 `[1, 2]`(loved 제외)다. 그 설정대로 학습됐다면 5K의 17%, 6K의 43%, 8K의 24%는 모델이 보지 않은 채보다(72/74 조각 나눔은 별개). 공개된 가중치가 정확히 이 설정으로 학습됐는지는 확인하지 못했다.

**사람 채보의 모양** (같은 측정. 각 채보는 앱이 요청하는 별점이 가장 가까운 티어에 넣었다. 값은 HARD · EXPERT · MASTER, 괄호는 1절의 모델 값. 4K는 고르게 뽑은 4,846개)

| | 4K | 5K | 6K | 8K |
|---|---|---|---|---|
| 채보 수(HARD · EXPERT · MASTER) | 1,265 · 1,304 · 398 | 194 · 164 · 27 | 210 · 211 · 147 | 75 · 60 · 28 |
| 가장 적은 열 × 키 수 | 0.95 · 0.96 · 0.97 (0.93 · 0.95 · 0.94) | 0.90 · 0.91 · 0.94 (0.91 · 0.91 · 0.92) | 0.86 · 0.89 · 0.93 (0.86 · 0.89 · 0.91) | 전체 평균에서 1번 열 7.7% (모델: 8번 열 5.8%) |
| 계단 | 0.102 · 0.079 · 0.084 (0.160 · 0.059 · 0.029) | 0.079 · 0.064 · 0.058 (0.100 · 0.056 · 0.023) | 0.060 · 0.056 · 0.053 (0.042 · 0.036 · 0.021) | 0.044 · 0.044 · 0.022 (0.029 · 0.016 · 0.006) |
| 150ms 안 잭, 1000개당 | 12.9 · 75.0 · 482.9 (2.6 · 13.7 · 171.2) | 9.2 · 34.6 · 265.8 (0.2 · 2.5 · 62.5) | 7.8 · 31.0 · 246.2 (0.0 · 12.4 · 39.3) | 1.6 · 10.5 · 58.3 (0.4 · 2.1 · 32.6) |
| 도약 | 0.123 · 0.107 · 0.123 (0.098 · 0.114 · 0.077) | 0.209 · 0.205 · 0.189 (0.163 · 0.170 · 0.156) | 0.301 · 0.241 · 0.219 (0.335 · 0.205 · 0.197) | 0.353 · 0.269 · 0.260 (0.382 · 0.285 · 0.217) |
| 손 교대 | 0.659 · 0.638 · 0.619 (0.667 · 0.714 · 0.607) | 0.772 · 0.777 · 0.743 (0.759 · 0.827 · 0.711) | 0.585 · 0.536 · 0.525 (0.668 · 0.503 · 0.565) | 0.537 · 0.483 · 0.476 (0.551 · 0.590 · 0.358) |
| 3개 동시치기 | 0.014 · 0.083 · 0.122 (0.000 · 0.045 · 0.177) | 0.031 · 0.109 · 0.181 (0.010 · 0.055 · 0.210) | 0.048 · 0.140 · 0.182 (0.005 · 0.123 · 0.232) | — · 0.129 · 0.186 (0.054 · 0.176 · 0.208) |
| 롱노트 몫 | 0.182 · 0.199 · 0.156 (0.105 · 0.180 · 0.290) | 0.178 · 0.158 · 0.236 (0.086 · 0.094 · 0.152) | 0.155 · 0.183 · 0.205 (0.107 · 0.098 · 0.161) | 0.043 · 0.031 · 0.025 (0.024 · 0.020 · 0.023) |
| 초당 노트 | 6.39 · 9.67 · 18.28 (6.03 · 8.31 · 10.53) | 6.25 · 9.63 · 16.77 (5.57 · 8.33 · 11.73) | 6.31 · 9.84 · 19.20 (5.06 · 8.76 · 13.18) | 5.76 · 9.67 · 17.69 (5.55 · 8.50 · 15.26) |
| 잰 레벨 − 목표 | +4.1 · +7.2 · +2.0 (+3.5 · +3.7 · +0.2) | +3.2 · +6.5 · +2.0 (+1.7 · +4.0 · −0.7) | +2.5 · +5.8 · +2.0 (+0.3 · +3.7 · +0.5) | +0.7 · +4.0 · +2.0 (+1.3 · +2.3 · +0.5) |

- **5K · 6K에서 모델이 사람 채보와 다른 점은 세 가지다**: 높은 티어에서 계단이 절반 아래, 롱노트가 절반쯤(HARD · EXPERT), 빠른 잭이 훨씬 적다. 4K에서도 같은 차이가 난다(계단 MASTER 0.029 대 0.084, 잭 171 대 483). 5K · 6K만의 결함이 아니라 모델의 버릇이다.
- 사람 MASTER 채보는 별점이 높은 쪽으로 열려 있어(6점 이상이 모두 MASTER에 들어간다) 초당 노트가 모델보다 많다. MASTER 열의 차이는 그만큼 덜어 읽는다.
- **8K의 방향이 뒤집혀 있다.** 사람 8K는 가장 적은 열이 1번인 채보가 285개 중 198개인데 모델은 8번을 비운다. 업스트림의 학습 설정에 좌우 뒤집기(`flip_horizontal_prob: 0.5`)가 있고 mania 열에도 적용되는 것은 코드에서 확인했지만(`osu_parser._flip_pos`), 그렇다면 반반이어야 한다. 원인은 확인하지 못했고 더 파지 않았다(전에도 본 것이다: `docs/MAPPERATORINATOR.md` "8열 채보는 맨 오른쪽 열이 비어 있다").
- 앱의 측정이 끝나지 않는 채보가 있었다: 6K 1개(beatmap 2571106), 4K 2개(3774040, 4223690)는 10초 안에 측정이 끝나지 않았고(처음 세 번의 실행은 이 때문에 러너가 종료됐다), 4K 1개(1537498)는 0으로 나누기가 났다. 어느 함수인지는 채보를 보지 않아 모른다. 모델이 만든 채보에서는 본 적이 없다. 사용자가 그런 `.osu`를 가져오기로 열면 같은 일이 날 수 있다.

### 그 밖의 5 · 6 · 8키 사람 채보 (조사한 것. 판단 없이)

| 출처 | 무엇 | 5K · 6K · 8K의 양 | 스스로 밝힌 이용 조건 |
|---|---|---|---|
| osu! 사이트 · API v2 (ranked · loved · graveyard) | 원 출처. graveyard가 훨씬 많다 | ranked · loved는 위와 같음. graveyard는 세지 못함 | osu! 약관: "User may not copy, reproduce, distribute, or create derivative works from this Content" / API 문서: 분당 60회, "Harvesting mass score/user/beatmap data"를 남용으로 들고 대량 자료는 data.ppy.sh로 안내 (요약 도구로 읽은 조각이다) |
| data.ppy.sh 월간 덤프 | ranked `.osu` 전부(음원 없음) | 위와 같은 ranked | `LICENCE.txt`: "All data provided here is done so with the intention of it being used for statistical analysis and testing osu! subsystems. Permission is NOT implicitly granted to deploy this in production use of any kind. Should you wish to publicly use/expose the data provided here, please contact me first at contact@ppy.sh." |
| osu! 포럼 "6k Resource Hub"(2023-08-31) | 커뮤니티가 모은 6K 팩 | "over 4000 beatmaps across ranked/loved/packs+graveyard"라고 적혀 있다 | 조건을 밝히지 않음 |
| Etterna · StepMania 팩 | 대부분 4K. 6K("solo") 팩이 수십 개 | 5K · 8K 키보드 팩은 찾지 못함 | 팩마다 다르고 공통 조건 없음(확인 못 함) |
| Quaver | 4K · 7K만 있다 | 없음 | 클라이언트는 MPL 2.0. 사용자 채보의 조건은 찾지 못함 |
| BMS (BOF 등 이벤트) | 5KEYS, 7KEYS+스크래치(8레인), 10 · 14KEYS | 많지만 세지 못함 | 공통 라이선스 없음. 작품마다 readme |
| GenerationMania "BOF2011" (AIIDE 2019) | BOF2011에서 만든 학술 데이터, 7+1 채보 1,454개 | 5K · 6K 없음 | 저장소에 LICENSE 파일 없음 |
| Malody | 커뮤니티 채보 | 세지 못함 | 조건을 찾지 못함 |

- CC 라이선스로 공개된 5 · 6 · 8키 채보 모음은 찾지 못했다.
- DJMAX 등 상용 게임의 채보는 쓰지도 뽑지도 않는다.
- 사용자가 가진 `.osu` 폴더(osu! Songs 폴더 등)는 `make_dataset.py --local`로 같은 형식이 된다.

### 이미 본 데이터로 LoRA를 하면 무엇을 기대할 수 있나

- README(고정 커밋)의 권고: "At least 10 beatmaps", "All songs fully mapped, no unfinished sections", "A consistent mapping style or theme across the whole dataset", "Varied song genres and difficulty ratings".
- 저자(OliBomby)의 말, 이슈 #85: "70 beatmaps should be enough for a LoRA.", "I dont think overfitting should be a big problem in LoRA training." (요약 도구로 읽은 조각이다)
- 공개된 Mapperatorinator LoRA 20개는 모두 osu!standard(`gamemode=0`)다. **mania · 키 수 LoRA는 하나도 찾지 못했다.** 예: 한 매퍼의 채보 전부(Kroytz), 고른 채보 10세트 · 1000스텝(Voxell: "will generally create many high-SV sliders and interesting slider shapes"), 2025년 1월의 450세트(v30-LoRA-2025, 모델이 보지 않은 데이터), 40개 + 시험 5개 · 7000스텝(aim-control: 시험 정확도 99% 이상이라고 적음).
- 저자가 "이미 본 데이터로 하는 LoRA"나 5–8키 품질에 대해 한 말은 찾지 못했다.
- 그러니 근거가 있는 기대는 이것뿐이다: **LoRA는 고른 채보들의 일관된 스타일 쪽으로 모델을 민다.** 8K에서 "열이 고른 채보"만 고르면 바로 그 성질이 스타일이 된다. 5K · 6K 전체로 학습하면 미는 방향이 "5K · 6K의 평균"이고, 모델은 이미 그 평균을 낸다(위 표). 무엇이 달라질지 예측할 근거가 없다.
- 러너의 3스텝 시험(4절)에서 본 것 하나: 기준 채보 2개로 3스텝만 학습했는데도 열 분포가 바뀌었다(8번 열만 비던 것이 1번 · 8번 열이 5.7%씩). 학습 설정이 좌우 뒤집기를 켜 두기 때문으로 보인다. 표본 하나라 방향만 읽는다: 열 분포는 LoRA로 빨리 움직인다.

## 4. 학습 절차와 Windows에서 되는지

### 업스트림의 LoRA 학습 (고정 커밋 `5884d1b`의 코드를 읽은 것)

- 명령은 `python osuT5/train.py -cn lora_v32 …`(Hydra)이고 설정은 `configs/train/lora_v32.yaml`이다. 그 파일은 **osu!standard용**으로 적혀 있다: `pretrained_gamemode: 0`, `data.gamemodes: [0]`, `lora_metadata.ckpt_subfolders: ["gamemode=0"]`. mania는 세 곳을 3 · `[3]` · `["gamemode=3"]`으로 바꿔야 한다. 마지막 것을 안 바꾸면 추론이 어댑터를 말없이 건너뛴다(`resolve_compatible_lora_path`가 한 줄만 찍는다).
- LoRA 설정: r 64, alpha 128, 대상은 어텐션의 `Wq · Wkv · Wqkv · Wo`, dropout 0.05, 초기화 `pissa`. 옵티마이저 muon, lr 4e-4, cosine, 1000스텝. 한 스텝은 `batch_size` 32개 시퀀스이고 GPU에는 `batch_size / grad_acc` = 2개씩 올린다. 시퀀스 하나는 오디오 16.4초(2048프레임)와 토큰 최대 2560개다.
- 학습되는 매개변수는 11,206,656개(전체 227,600,640개의 4.9%)다(러너의 학습 기록).
- 데이터는 "mmrs" 형식이다: 폴더의 `metadata.parquet`(채보마다 한 줄: `BeatmapSetId` · `Id` · `BeatmapSetFolder` · `BeatmapFile` · `AudioFile` · `ModeInt` · `StarRating`(배속 0.5–2.0의 별점 7개) · `Ranked` · `RankedDate` · `SubmittedDate` · `UserId`)과 `data/<세트>/`의 음원 · `.osu`. 저자는 이것을 자기 도구(Mapperator 콘솔 앱)로 만든다. 우리는 `scripts/lora/make_dataset.py`가 같은 열을 직접 쓴다(별점은 Mapperatorinator가 쓰는 것과 같은 `rosu-pp-py`로 잰다).
- 학습 중 증강: 배속(30%, 1–1.2배), **좌우 뒤집기 50%**(mania의 열도 뒤집힌다), 스냅 흔들기. 뒤집기는 `data.flip_horizontal_prob=0`으로 끌 수 있다.
- 학습이 남기는 것: `checkpoints/checkpoint_N/`에 accelerate의 상태(모델 전체 `pytorch_model.bin`, 옵티마이저, 토크나이저 `custom_checkpoint_0.pkl`, 난수 상태)와 그 안의 `lora/` 폴더. **어댑터는 `lora/` 폴더뿐이다**: `adapter_config.json`, `adapter_model.safetensors`, `mapperatorinator_lora_metadata.json`.
- 추론은 `lora_path`가 있으면 `PeftModel.from_pretrained` 뒤 `merge_and_unload`로 가중치에 합친다. 합친 뒤에는 기본 모델과 속도 · 메모리가 같다. 박자 패스는 게임 모드 구분이 없는 기본 모델로 돌고 어댑터가 붙지 않는다(저자의 이슈 #113 답과 코드가 같다).

**파일을 무엇으로 읽나 (pickle을 여는 곳)**

| 무엇 | 읽는 방법 | 우리 경로에서 |
|---|---|---|
| 기본 모델 `model.safetensors`, `tokenizer.json` | safetensors · JSON (`from_pretrained`) | 쓴다. pickle 없음 |
| 어댑터 `adapter_model.safetensors`, 두 JSON | safetensors · JSON (PEFT) | 쓴다. 워커와 `lora.py`가 **safetensors가 없는 폴더를 거절**한다(PEFT는 `adapter_model.bin`만 있으면 그것을 `torch.load`로 읽는다) |
| 로컬 accelerate 체크포인트의 `custom_checkpoint_0.pkl` | `torch.load(weights_only=False)` | 안 쓴다(학습을 이어 할 때만. 자기 PC에서 만든 파일이다) |
| 같은 곳의 `pytorch_model.bin` | `torch.load(weights_only=True)` | 안 쓴다 |
| 위치 생성용 확산 모델 `tokenizer.pkl` · `model_ema.pkl` | `torch.load(weights_only=False)` | 안 쓴다(mania에는 `generate_positions`를 끈다) |

남이 만든 어댑터를 받아 쓸 때도 safetensors만 읽게 된다. 남이 만든 **체크포인트 폴더 전체**를 `checkpoint_path`로 이어 학습하는 것은 pickle을 열게 되니 하지 않는다.

**PiSSA에 대해 확인하지 못한 것 하나.** `init_lora_weights: pissa`는 학습을 시작할 때 기본 가중치의 주성분을 어댑터로 옮기고 기본 가중치를 그만큼 바꾼다. 어댑터를 읽을 때 PEFT가 같은 분해를 다시 해서 맞춰야 원래 모델 + 학습분이 된다. 러너에서 어댑터로 만든 채보가 말이 되는 채보였으므로(아래) 읽는 길은 동작한다고 보지만, 학습한 기기(CPU fp32)와 쓰는 기기(GPU fp16)가 다를 때 수치가 얼마나 어긋나는지는 재지 못했다. 집 PC에서 어댑터를 처음 쓸 때 채보가 이상하면 여기를 의심한다.

### Windows · 6GB에서 바꿀 것 (`scripts/lora/train.py`가 넘기는 값)

| 설정 | lora_v32 | 바꾼 값 | 왜 |
|---|---|---|---|
| `pretrained_gamemode` · `data.gamemodes` · `lora_metadata.ckpt_subfolders` | 0 · [0] · ["gamemode=0"] | 3 · [3] · ["gamemode=3"] | mania 모델 |
| `attn_implementation` | flash_attention_2 (v32에서 물려받음) | sdpa | flash-attn은 Windows 빌드가 없다. 모델 코드에 sdpa 경로가 있고 러너에서 학습이 됐다 |
| `compile` | true | false | `torch.compile`은 Windows에서 C 컴파일러가 필요하다 |
| `mixed_precision` | bf16 | `--precision fp16`(기본) · `bf16` · `no` | RTX 20xx · T4는 bf16을 지원하지 않는다 |
| `optim.batch_size` / `grad_acc` | 32 / 16 (2개씩) | 32 / 32 (`--minibatch 1`, 1개씩) | 6GB. 한 스텝의 양은 그대로다 |
| `dataloader.num_workers` | 1 | 0 | Windows의 프로세스 방식에서 데이터 읽기를 학습 프로세스 안에 둔다 |
| `logging.mode` | online (Weights & Biases) | disabled | 아무것도 올리지 않는다 |
| `data.test_dataset_end` | 0 | 0 | 평가 없음(업스트림도 그렇다) |
| `lora.r` · `lora_alpha` | 64 · 128 | `--rank`(기본 64), alpha는 그 두 배 | 메모리가 모자라면 32 |

설정으로 줄일 수 **없는** 것: 시퀀스 길이(`src_seq_len` 2048 · `tgt_seq_len` 2560은 모델이 학습된 값이다), gradient checkpointing(모델 클래스는 지원한다고 표시하지만 학습 스크립트에 켜는 설정이 없다. 켜려면 업스트림 코드를 고쳐야 한다).

**fp16의 위험.** 추론에서 fp16은 인코더 앞단이 큰 소리 구간에서 넘쳐 박자가 깨진 적이 있다(`docs/MAPPERATORINATOR.md` "fp16"). 학습의 `mixed_precision=fp16`은 가중치는 fp32로 두고 계산만 fp16으로 하지만 같은 앞단을 지난다. `--test`에서 loss가 `nan`이면 `--precision no`(fp32)로 돌린다. 느려지고 메모리를 더 쓴다. 러너에서는 fp32만 돌렸다.

### 러너에서 끝까지 돌려 본 것

`.github/workflows/mapper-lora-smoke.yml`, 실행 [44323762849](https://github.com/DreamChaserDeekay/Generative-Rhythm-Game/actions/runs/44323762849)(Windows 러너, CPU). 이 실행은 실패로 표시되어 있는데, 마지막 채보까지 만든 뒤 보고서를 찍다가 Windows 콘솔의 코드 페이지(cp1252)에서 난 오류다(고쳤다). 고친 뒤의 실행은 {{SMOKE2}}.

| 단계 | 결과 |
|---|---|
| 실행 환경 설치(v32, CPU) | 46초 |
| 기준 8K 채보 2개(chibi_ninja 123초, HARD · EXPERT) | 노트 681 · 1,225개, 593초 · 597초 |
| `uv pip install peft==0.18.1 soundfile` | 됨 |
| `make_dataset.py --local`(그 곡과 채보 2개를 데이터로) | 채보 2개, 곡 1개 |
| `train.py --steps 3 --batch 2 --device cpu --precision no` | 됨. 모델을 올리는 것부터 저장까지 208.6초 |
| 어댑터 | `…/checkpoints/checkpoint_0/lora` → `<실행 환경>/lora/8K`로 복사. r 64, `ckpt_subfolders: ["gamemode=3"]`, 태그 `c1c23d5dd86a`{{SIZES}} |
| 앱이 어댑터를 찾아(`lora/8K`) 만든 8K HARD(같은 시드) | 워커 기록 "Loaded LoRA weights from …\lora\8K", 노트 508개, 522.7초 |

- **증명된 것**: Windows에서 flash-attention · bf16 · `torch.compile` 없이 mania LoRA가 학습되고, 그 어댑터를 앱의 워커가 읽어 채보를 만든다. 우리 `metadata.parquet`을 업스트림 로더가 읽는다.
- **증명되지 않은 것**: 품질(3스텝은 아무것도 가르치지 않는다. 데이터도 모델 자신의 채보다), GPU에서의 메모리와 속도, fp16 학습, 실제 데이터셋에서 받은 음원(opus)을 `soundfile`로 푸는 것(러너의 통계 작업은 음원 없이 돌았다).
- 어댑터로 만든 채보는 말이 되는 채보였다: 초당 4.1개(기준 5.5), 잰 레벨 5(기준 7), 열 몫 5.7 · 12.4 · 13.4 · 17.5 · 17.7 · 15.6 · 12.0 · 5.7%(기준 16.9 · 10.7 · 14.8 · 12.0 · 16.7 · 12.9 · 13.2 · 2.6%). 3스텝에 이만큼 달라진 것은 학습률이 처음에 가장 높기 때문이다.

## 5. 앱 연결

(커밋 `8aada07`. 테스트 `server/tests/test_mapper.py`의 두 개가 새로 들어갔다.)

- **어댑터를 놓는 곳**: 실행 환경 폴더의 `lora/<N>K/`(`%LOCALAPPDATA%\Generative Rhythm\mapper\lora\8K\`). 그 폴더에 `adapter_config.json`과 `adapter_model.safetensors`가 있으면 그 키 수의 채보가 그 어댑터로 만들어진다. 4K+FX · 6K+FX는 4K · 6K로 만들므로 4K · 6K의 어댑터를 쓴다.
- **설정**(`config/mapper.json`의 `lora`): `enabled`(false면 모든 키 수가 기본 모델), `adapters`(`{"8K": "8K-v2"}`처럼 키 수에 다른 폴더를 지정. `lora/` 아래의 이름이거나 절대 경로). 설정 화면에는 넣지 않았다.
- **채보에 남는 것**: `meta.generator.lora = {"tag", "r"}`. `tag`는 가중치 파일(`adapter_model.safetensors`) sha256의 앞 12자리다. 워커가 실제로 합쳤다고 답한 채보에만 붙는다.
- **채보 ID**: 어댑터가 있는 키 수의 채보는 ID 계산에 `lora: <tag>`가 더 들어간다. 그래서
  - 어댑터로 만든 채보와 기본 모델의 채보가 다른 채보다(둘 다 저장된 채 남는다).
  - 어댑터를 다시 학습해 파일이 바뀌면 또 다른 채보다.
  - **어댑터가 없으면 ID는 지금과 같다.** 이미 만든 채보는 그대로 열린다. `MAPPER_VERSION`은 올리지 않았다.
  - 곡 선택 화면이 미리 받아 둔 티어 정보를 버리는 표식(`/api/health`의 `generator`)도 어댑터의 태그가 바뀌면 바뀐다.
- **경로 이름이 아니라 내용의 태그를 넣은 이유**: 같은 `lora/8K` 폴더에 다른 어댑터를 덮어쓰면 경로는 같고 채보는 달라진다. 반대로 폴더를 옮겨도 같은 어댑터면 같은 채보여야 한다.
- **PEFT**: 어댑터를 합치는 패키지(`peft==0.18.1`, `mapper.json`의 `runtime.lora`)는 어댑터가 있는 키 수의 채보를 처음 만들 때 실행 환경에 한 번 설치된다(`Runtime.ensure_lora`, `state.json`에 기록). 이미 설치한 실행 환경을 다시 깔지 않는다. 설치에 실패하면 그 채보는 이유와 함께 실패한다.
- **워커가 거절하는 것**: 어댑터 폴더가 아닌 경로, safetensors가 없는 폴더, 이 모델의 것이 아닌 어댑터(`mapperatorinator_lora_metadata.json`이 다른 게임 모드를 말하는 것: 업스트림은 말없이 건너뛰어 기본 모델의 채보가 어댑터 이름으로 나온다).
- **모델 조건**(`config/mapper.json`의 `conditions`, 키 수별): `descriptors` · `negativeDescriptors` · `cfgScale` · `columnTemperature` · `mapperId` · `year`. 기본은 비어 있고, 값을 넣은 키 수의 채보만 ID가 달라진다.
- 워커는 키 수가 바뀌어 다른 어댑터가 필요하면 앞의 모델을 내리고 새로 올린다(어댑터가 합쳐진 모델은 따로 한 벌이다). 키 모드를 오가며 만들면 그때마다 모델을 다시 올리는 몇 초가 든다.

## 6. 사용자가 돌릴 것

### (a) PC에서 (Windows, RTX 2060 6GB)

앱의 AI 채보가 설치되어 있어야 한다(설정 → 고급 → AI 채보 → 설치). 학습은 그 실행 환경의 Python으로 돈다. 스크립트 둘은 저장소의 `scripts/lora/`에 있고 따로 받아 아무 폴더에나 두면 된다(다른 파일이 필요 없다). 아래는 PowerShell이고 8K의 예다.

```powershell
$rt = "$env:LOCALAPPDATA\Generative Rhythm\mapper"
$py = "$rt\venv\Scripts\python.exe"

# 0. 학습에 더 필요한 두 패키지를 실행 환경에 넣는다 (한 번)
& "$rt\uv\uv.exe" pip install --python $py peft==0.18.1 soundfile

# 1. 데이터: 74개 조각을 읽어 가며 8키 채보의 곡만 남긴다. 중간에 끊겨도 같은 명령으로 이어진다.
#    --min-column-share 0.5: 한 열이 거의 빈(7키 + 스크래치) 채보를 뺀다. 0.75면 더 엄격하다.
& $py make_dataset.py --keys 8 --out D:\grg-lora\8K --min-column-share 0.5

# 2. 메모리 시험: 10스텝. 끝에 GPU 메모리 최고값과 1000스텝에 걸릴 시간을 찍는다. 앱은 꺼 둔다.
& $py train.py --data D:\grg-lora\8K --keys 8 --test

# 3. 학습. 끝나면 어댑터가 실행 환경의 lora\8K 에 놓인다(있던 것은 다른 이름으로 남긴다).
& $py train.py --data D:\grg-lora\8K --keys 8 --steps 1000

# 4. 앱을 켜고 8K 채보를 새로 만든다(이미 만든 8K 채보는 그대로 남고, 새 ID로 따로 만들어진다).
#    되돌리기: lora\8K 폴더를 지우거나 다른 곳으로 옮긴다.
```

- 메모리 시험이 메모리 부족으로 죽으면: `--rank 32`, 그래도 안 되면 6GB로는 안 되는 것이고 (b)로 간다. loss가 `nan`이면 `--precision no`.
- 스크립트가 하는 일은 파일 맨 위의 설명에 있다. 다른 것은 건드리지 않는다: `make_dataset.py`는 `--out` 폴더에만 쓰고, `train.py`는 작업 폴더(`<데이터>\run\<시각>`)와 실행 환경의 `lora\<N>K`에만 쓴다.

**걸리는 시간과 용량 (재지 못한 것이 많다. 근거와 함께)**

| 무엇 | 예상 | 근거 |
|---|---|---|
| 데이터 받기 | 회선에 달림. 100Mbps면 약 1시간 50분, 키 수마다 한 번 | 79.0GB를 모두 읽는다(확인). 러너에서는 4분 30초–13분 |
| 데이터 용량 | 8K 약 1–2GB, 5K 약 3GB, 6K 약 4GB | 곡 수 93 · 219 · 278(확인) × 곡당 2.5분쯤(가정) × 모노 16비트 WAV 5.3MB/분 |
| 학습 시간 | **모른다.** 1000스텝은 시퀀스 32,000개다. 러너 CPU는 6개에 (모델 올리기 포함) 209초였다 | GPU에서 초당 1개면 약 9시간, 초당 3개면 약 3시간. `--test`가 PC의 값을 찍는다 |
| GPU 메모리 | **모른다** | `--test`가 최고값을 찍는다 |
| 작업 폴더 | 체크포인트 하나에 {{CKPT}}, 마지막 둘을 남긴다 | 러너의 값. 학습이 끝나면 `run` 폴더는 지워도 된다(어댑터는 복사되어 있다) |
| 어댑터 | {{ADAPTER}} | 러너의 값(r 64) |

### (b) 무료 · 유료 GPU

- **Kaggle**(무료): P100 16GB 하나 또는 T4 16GB 둘, 주에 약 30시간(계정 설정 화면의 값이 기준이다), 세션은 12시간까지. 인터넷을 켤 수 있어 노트북 안에서 데이터를 받을 수 있다. **Colab**(무료)은 T4지만 세션 길이와 할당이 보장되지 않는다.
- 노트북의 뼈대: `scripts/lora/cloud_notebook.py`(셀마다 `# %%`). 업스트림 소스를 고정 커밋으로 받고, 같은 두 스크립트로 데이터 → 10스텝 시험 → 학습 → 어댑터 zip까지 간다. **돌려 보지 않았다.** 받은 zip을 PC에서 풀어 `train.py --keys 8 --install <폴더>`로 놓는다.
- T4도 bf16이 없어 fp16이나 fp32다. 16GB라 `--minibatch 2`(업스트림과 같다)로 시작한다.
- **유료**: RTX 3090 · 4090(24GB, bf16 지원)이 시간당 약 0.2–0.7달러다(2026년 중반의 여러 글에서 본 값: RunPod 3090 0.22–0.39, 4090 0.34–0.69, Vast.ai 4090 0.27–0.50. 실시간 가격은 각 사이트에서 확인). 키 수 하나에 몇 시간이면 몇 달러다. 학습 시간을 모르므로 범위로만 적는다.

### 권고

1. **PC에서 `--test` 10스텝부터.** 메모리가 되는지와 스텝당 시간이 나오면 나머지가 정해진다. 몇 분이면 끝나고 잃을 것이 없다.
2. 6GB에서 되고 1000스텝이 하룻밤 안이면 PC에서 한다. 데이터가 PC에 있고 어댑터가 바로 앱에 놓인다.
3. 안 되면 Kaggle이다(무료, 16GB). 유료는 Kaggle이 번거로울 때.
4. **8K부터, `--min-column-share 0.5`(165개)로.** 고칠 것이 숫자로 있는 유일한 키 수이고, 학습 뒤 `mapper_keymode_report.py`로 "한 열이 거의 빈 채보"가 줄었는지 바로 잴 수 있다. 0.75(52개)는 저자가 말한 70개에 못 미친다.
5. 5K · 6K는 무엇을 고칠지 정해진 뒤에.

## 고를 것

| 정할 것 | 선택지 | 권고 |
|---|---|---|
| 8K를 어떻게 | (가) 열이 고른 사람 채보로 LoRA (나) 앱에서 열을 다시 나누는 후처리(만들지 않았다) (다) 그대로 | (가). 다만 효과는 학습해 봐야 안다. (나)는 학습 없이 확실하지만 레인 배치를 앱이 다시 짜는 일이라 따로 정할 일이다 |
| 8K 데이터의 기준 | 절반 이상 165개 / 3/4 이상 52개 | 165개 |
| 5K · 6K | 학습한다 / 하지 않는다 | **무엇이 마음에 안 드는지부터.** 숫자로는 사람 채보와 같은 수준이고, 다른 점(계단 · 롱노트 · 잭이 적다)은 4K에도 있는 모델의 버릇이다 |
| 어디서 학습 | PC / Kaggle / 유료 GPU | PC에서 `--test`부터 |
| 데이터 | Hugging Face 데이터셋 / 사용자가 고른 `.osu` 폴더(`--local`) | 데이터셋. 카드의 "provided for research purposes only"를 받아들일지는 사용자가 정한다 |
| 어댑터를 나눠 줄지 | 사용자 PC에만 / 앱과 함께 배포 | 정하지 않았다. 배포는 위 조건과 얽힌다 |
| 좌우 뒤집기 | 켠 채(업스트림 기본) / 끔 | 켠 채. 열이 고른 채보만 쓰면 뒤집어도 고르다 |

## 확인한 것과 확인하지 못한 것

**확인한 것 (1차 출처)**

- 1절의 숫자: 러너가 만든 `.osu` 72개를 저장소의 코드로 잼.
- 2절: 조건 시험 실행 44322511185의 `.osu` 16개.
- 3절의 채보 수 · 별점 · `SpecialStyle` · 열 몫: 데이터셋의 74개 조각을 러너에서 모두 읽음(실행 44331823881). 라이선스 문구: Hugging Face의 카드 원문.
- 4절의 설정 · 형식 · pickle을 여는 곳: 고정 커밋의 소스. 학습 → 어댑터 → 채보: 러너의 실행 44323762849.
- 5절: 테스트 31개 통과, Windows 빌드 {{BUILD}}.
- v32의 태그 122개와 `style/N+1` 19개: 모델의 `tokenizer.json`.

**확인하지 못한 것**

- 집 PC(GPU, fp16)의 채보와 학습: 메모리, 시간, fp16 학습에서 loss가 온전한지, CPU에서 만든 어댑터를 GPU fp16으로 읽을 때의 차이(PiSSA).
- LoRA가 실제로 8K의 열을 고르게 하는지. 긴 학습을 돌리지 않았다.
- 데이터셋의 opus 음원을 `soundfile`로 푸는 것(러너는 음원 없이 돌았다).
- 공개된 v32 가중치가 `v32.yaml` 그대로(2024년까지, ranked만, 좌우 뒤집기 50%) 학습됐는지.
- 모델이 8번 열을, 사람 채보는 1번 열을 비우는 까닭.
- 앱의 측정이 끝나지 않은 4개 채보의 원인.
- 클라우드 노트북 뼈대(돌려 보지 않음), Kaggle의 지금 할당량, GPU 대여의 지금 가격.
- osu! 약관 · API 문서 · GitHub 이슈의 인용은 요약 도구가 돌려준 조각이다(전문을 직접 읽지 못했다). 데이터셋 카드와 `data.ppy.sh`의 `LICENCE.txt`는 원문이다.

## 관련 파일

| 파일 | 내용 |
|---|---|
| `scripts/mapper_keymode_report.py` | 키 수별 지표(열 · 손 · 동시치기 · 패턴 · 레벨). `.osu` 폴더나 사람 채보 데이터셋(`--mmrs`) |
| `scripts/mapper_probe.py` | 곡 하나를 한 키 모드로 티어마다 만들어 원본 `.osu`를 남김. 조건(`--conditions`)이나 어댑터(`--lora`)와 함께 |
| `scripts/lora/make_dataset.py` | 한 키 수의 사람 채보를 학습 형식(mmrs)으로: Hugging Face 데이터셋에서, 또는 osu! Songs 같은 폴더에서 |
| `scripts/lora/train.py` | Mapperatorinator의 LoRA 학습을 mania · Windows용 설정으로 시작하고 어댑터를 앱 자리에 놓음. `--test`는 10스텝 |
| `scripts/lora/cloud_notebook.py` | 무료 클라우드 GPU(Kaggle · Colab) 노트북의 뼈대 |
| `server/rhythm_server/mapper/lora.py` | 키 수별 어댑터 찾기와 그 태그 |
| `server/rhythm_server/mapper/worker.py` | 요청의 `lora`와 조건(`descriptors` · `negativeDescriptors` · `cfgScale` · `columnTemperature` · `mapperId` · `year`)을 모델에 넘김 |
| `config/mapper.json` | `lora`(켬 · 끔, 키 수별 폴더), `conditions`(키 수별 조건), `runtime.lora`(PEFT 버전) |
| `.github/workflows/mapper-conditions.yml` | 조건을 바꿔 8K를 만들어 보는 실험 |
| `.github/workflows/mapper-lora-smoke.yml` | Windows 러너에서 학습 3스텝 → 어댑터 → 앱 워커로 채보 |
| `.github/workflows/mapper-dataset-stats.yml` | 데이터셋의 사람 채보를 키 수별로 재기(집계만 남김) |
