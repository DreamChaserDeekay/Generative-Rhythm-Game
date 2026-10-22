# 채보 전사·자동 생성 논문 조사

상태: **조사·분석**(2026-10, 별도 세션에서 `claude/chart-paper-survey` 브랜치로 작성). 반영 상태와 계획은 10장(생성기 0.9.20 기준으로 세우고 0.9.22에서 상태를 갱신). 조사 당시 생성기 코드와 `config/`는 바꾸지 않았다. 기준은 생성기 0.9.13 · 분석기 1.6.1이다. 사람 BMS 채보와의 통계 근접도는 76.8%, 시각 F1은 0.6806이다. 레벨 2·6·10·14의 시각 F1은 0.445 · 0.610 · 0.721 · 0.771이다(레벨 2·6은 25장, 10·14는 28장 측정. 29장은 노트 시각을 바꾸지 않았다).

건반형 리듬게임의 채보 전사와 자동 생성에 관한 논문을 모으고, 우리 파이프라인에 적용할 수 있는지 따졌다. 건반형은 BMS/IIDX 7K+1S, DJMAX, EZ2ON, osu!mania, O2Jam처럼 노트가 세로로 떨어지는 여러 레인의 게임이다. 다른 장르(DDR·태고·러브라이브·Beat Saber)는 노트 고르기, 레인 배치, 난이도 아이디어가 옮겨 올 만한 것만 다뤘다.

## 0. 요약

1. **우리 문제와 정확히 같은 논문은 거의 없다.**
   - 키음 BMS를 다룬 학술 논문은 둘이다. GenerationMania(AIIDE 2019)와 후쿠나가 외(2019, 일본어)다.
   - 둘 다 "어느 키음을 노트로 둘까"(우리 3–4단계)만 풀었다. 레인 배치는 휴리스틱이거나 다루지 않았다.
   - "같은 키음은 같은 레인", "롱노트를 둘 소리 고르기", "BMS 레벨 예측"을 다룬 논문은 찾지 못했다(4장).
2. **쉬운 채보가 사람과 덜 맞는 것은 모든 연구에서 같다.**
   - DDC의 Fraxtil F_c는 Beginner 0.389, 최상위 0.844였다. ITGPT의 Beginner F1은 0.555다. GenerationMania도 쉬운 채보에서 F1의 흩어짐이 크다.
   - 원인으로는 셋이 꼽힌다. 표본이 성기다. 작가마다 고르는 소리가 다르다(후쿠나가: 쉬운 채보의 선택이 어려운 채보의 부분집합이 아니다). 쉬운 채보는 큰 소리보다 주기적인 박을 따른다(GenéLive!).
   - 그래서 우리 레벨 2의 F1 0.445가 얼마나 낮은지는 **사람 대 사람 F1 상한**을 먼저 재야 알 수 있다(우선순위 1).
3. **가장 옮겨 올 만한 아이디어는 다섯이다.**
   - (a) 키음 정답으로 "같은 소리 묶기" 분석을 채점하고 개선한다(소리 자리, 드럼 몰림).
   - (b) 레벨별 손 모양 통계를 목표로 따라가는 비용을 빔 서치에 둔다(Udo 2023의 이동 비용 제어, 쏠린 마디·한 손 3연속).
   - (c) 소리의 되풀이·리프 특징을 노트 고르기 모델에 넣는다(香川 2015, Rossignol 2015, 쉬운 채보의 엇박).
   - (d) 어려운 채보에서 쉬운 채보를 끌어내는 방식을 쓴다(DDG 2018, Gold & Olivier 2010). (a)와 사람 채보의 포함률을 재고 나서 정한다.
   - (e) 짧은 레인 모양 n-gram을 빔 점수에 넣는다(DDC 스텝 선택, TCP 2025).
4. **큰 신경망 생성기는 지금 조건에 맞지 않는다.** Mapperatorinator는 219M이고 GPU를 쓴다. MuG Diffusion은 가중치가 비상업이다. YourMT3는 GPL-3다. 사용자 PC CPU에서 오프라인으로 돌아야 하고, 기존 고전 파이프라인과 측정 체계를 지켜야 한다. 쓸 만한 것은 작은 모델(basic-pitch, beat_this small), 고전 신호처리(HPSS, NMF), 논문의 **설계 아이디어와 평가 방법**이다.

## 1. 범위와 방법

- **조사한 곳**
  - 학회·저널: arXiv, ISMIR(본회의·LBD), AAAI(IAAI·AIIDE), ICML, FDG, ICEC, IEEE/ACM TASLP, EUSIPCO, AHFE.
  - 국내외 자료: 情報処理学会(IPSJ) 논문지·연구보고, 芸術科学会論文誌, 한국컴퓨터게임학회논문지, KAIST 학위논문, 홋카이도대 박사논문.
  - 공개 저장소: README와 LICENSE 파일.
- **지킨 것**
  - 논문 PDF·초록과 저장소 README·LICENSE만 읽었다.
  - 게임 채보·음원·에셋·모델 가중치·유튜브 영상은 내려받지 않았다.
  - ez2pattern.kr과 DPC 자료는 쓰지 않았다.
- **확실성 표시**
  - **[확인]**: 원문(초록·본문·README)에서 직접 확인했다.
  - **[미확인]**: 검색 결과 요약이나 다른 논문의 인용으로만 봤다.
  - **[추측]**: 우리 판단이다.
  - 라이선스는 저장소 루트의 LICENSE 파일 기준이다. "LICENSE 없음"은 파일을 찾지 못했다는 뜻이고, 그때는 모든 권리가 유보된 것으로 본다.
- 2026년 프리프린트(An 외, ChartGenEval, ITGPT)는 arXiv 초록 페이지에서 제목·저자·날짜를 다시 확인했다. 아직 동료 심사 전이다.

## 2. 우리 파이프라인과 남은 과제

| 단계 | 우리 구현(0.9.13) | 문서 |
|---|---|---|
| ① 후보 | SuperFlux식 3대역 온셋, attack 확신, 스템·멜로디 존재도 | GENERATION 2장 |
| ② 양자화 | 고정 BPM 격자, 마디별 셋잇단 격자 | GENERATION 3장 2단계, PATTERN 28장 |
| ③ 점수 | 손 점수 × (로지스틱 고르기 확률 / h₀)^몫(특징 21개, 밀도 구간 3개) | PATTERN 25장 |
| ④ 밀도 | 목표 NPS, 피크, 분할 비율, 롤 | GENERATION 3장 4단계 |
| ⑤ 동치·롱노트 | 겹친 대역, 350ms 이상 울리는 음, 멜로디 우선 | GENERATION 3장 5단계 |
| ⑥ 레인 빔 서치 | 손가락 모델, 악구 키 묶음, 드럼 자리, 동치 모양, 재봉틀·축연타 | PATTERN 20–29장 |
| ⑦ 난이도 | osu!mania식 strain → 유효 NPS → 레벨 | GENERATION 4장 |

이 문서에서 쓰는 과제 번호는 다음과 같다(각 장의 "남은 것"에서 뽑았다).

| 번호 | 과제 | 지금 값(사람) |
|---|---|---|
| T1 | 쉬운 채보의 정박 쏠림과 낮은 시각 F1 | 레벨 2 정박 77.1%(57.8%), F1 0.445 |
| T2 | 쏠린 마디·한 손 3연속·연타 줄기 부족 | 레벨 10 쏠린 마디 3.6%(15.3%), 한 손 3연속은 모든 레벨에서 사람의 절반 |
| T3 | 같은 키음을 같은 레인에(소리 자리) | 레벨 6 0.52(0.73). 우리 "같은 소리" 기준은 한 키음의 34%만 한 갈래에 모음(무작위 29%) |
| T4 | 드럼 종류가 키 하나에 몰림 | 스네어는 3번 키에 42–55%(사람은 어느 키도 23% 미만) |
| T5 | 롱노트를 둘 소리 고르기 | 긴 소리 위 롱노트 0.69–0.83(0.91–0.98). 사람 롱노트 머리 AUC 0.59 |
| T6 | 셋잇단 남은 차이 | 셋잇단 느낌 곡에서 사람의 1.4–1.5배, 곧은 곡 0%(사람 1.3–3.8%) |
| T7 | 평가 방법 자체 | 시각 F1은 정답 하나와의 재현만 잰다 |

## 3. 논문별 요약과 적용 분석

각 항목의 "적용"은 다음 다섯을 적는다.

- **단계**: 우리 파이프라인의 어느 단계인가.
- **과제**: 풀 수 있는 과제.
- **쓰는 법**: 그대로 쓸지, 아이디어만 빌릴지.
- **비용**: 필요한 데이터와 계산량.
- **시험**: 우리 측정으로 시험하는 방법.

### 3-A. 키음 BMS(우리와 가장 가까운 것)

#### A1. GenerationMania: Learning to Semantically Choreograph [확인]

- Zhiyu Lin, Kyle Xiao, Mark Riedl. AIIDE-19(Proc. AAAI AIIDE 15(1)), pp. 52–58, 2019.
- 링크: [arXiv:1806.11170](https://arxiv.org/abs/1806.11170) · [AAAI PDF](https://ojs.aaai.org/index.php/AIIDE/article/download/5224/5080) · 코드 [xxbidiao/GenerationMania](https://github.com/xxbidiao/GenerationMania)(LICENSE 없음)
- **문제**: BMS 7K+스크래치에서 키음 이벤트(샘플 + 시각)마다 노트(playable)로 둘지 배경음으로 남길지 고르고, 노트를 8개 입력에 놓는다. 입력이 섞인 오디오가 아니라 **키음 목록**이다.
- **데이터**: BOF2011. 366곡, 채보 1,454개, 이벤트 432만 개 중 28.7%가 노트, 고유 샘플 171,808개다.
- **방법**
  1. 키음 분류: 파일 이름(drum…, piano…)을 사전으로 27개 악기 갈래 라벨로 바꾸고, MFCC 2층 CNN으로 분류한다(BOFU 60,714개, 정확도 84%).
  2. 채보 지식 특징
     - 박 위상: 4분음표당 16칸.
     - 도전 모델: osu!mania strain, 400ms 최대 풀링.
     - **관계 요약**: 악기 갈래마다 지난 2·4·8·16·32박에서 노트가 된 비율.
  3. 고르기: 64-32-16-2 순방향 신경망.
  4. 배치: 8칸 softmax. 겹치면 좌우 대칭 레인으로, 그것도 차 있으면 오른쪽으로 옮긴다.
- **평가·결과**
  - 시험 채보 145개(곡 단위 분할)에서 고르기 F1 0.700 ± 0.158이다. LSTM 최고는 0.564, 모두 노트로 두면 0.472, 무작위는 0.291이다.
  - 도전 모델을 넣으면 F1이 7.9% 오른다.
  - 쉬운 채보에서 F1의 흩어짐이 크다. 저자는 작가마다 고르는 소리가 달라서라고 본다.
  - 밀도·음높이·마디 계층 특징은 도움이 되지 않았다.
  - 배치는 정량 평가하지 않았고 "기여가 아니다"라고 적었다.
- **적용**
  - 단계: ③ 노트 고르기(그리고 ⑥ 배치의 반면교사).
  - 과제: T1, T3, T4.
  - **관계 요약을 아이디어로 빌릴 수 있다.** "이 소리 갈래가 최근 몇 박 동안 노트를 받았는가"를 고르기 모델의 특징으로 넣는 것이다. 사람은 악구 단위로 따라갈 소리를 정한다는 25-6의 추측과 같은 방향이다.
  - 다만 우리는 키음을 모르고 섞인 오디오에서 시작한다. 지금의 "같은 소리" 기준(스템 + 음높이/대역)은 한 키음을 34%만 한 갈래에 모은다. 이 특징은 **소리 묶기(T3, 우선순위 2)가 먼저 좋아져야** 힘을 쓴다.
  - 25-2에서 16박마다 사람이 따른 스템을 정답에서 가져와도 상위 K 정밀도가 0.015만 올랐다. 스템 단위로는 효과가 작다는 뜻이다. 더 잘게 묶은 소리 갈래에서는 다를 수 있다[추측].
  - 파일 이름으로 악기 라벨을 만드는 요령은 우리 BMS 측정에도 쓸 수 있다(키음 종류를 킥·스네어·하이햇보다 잘게 나누기).
  - 코드는 LICENSE가 없어 쓰지 않는다. 아이디어만 빌린다.
  - 비용: 순방향 신경망이나 로지스틱 회귀로 충분하다. CPU로 바로 된다.
  - 시험: 25-2와 같은 틀로 한다. 학습 1,044곡, 검증 220곡에서 특징을 더한 고르기 모델의 AUC·상위 K 정밀도를 재고, 생성기에 넣어 레벨별 시각 F1과 정박 몫을 잰다.

#### A2. 후쿠나가·오치·오부치, 리듬 액션 게임에서 키음의 자동 추정 (リズムアクションゲームにおけるキー音の自動推定) [확인]

- 福永大輝, 越智景子, 大淵康成(도쿄공과대). 芸術科学会論文誌 18(1), pp. 10–18, 2019.
- 링크: [PDF](https://www.art-science.org/journal/v18n1/v18n1pp10/artsci-v18n1pp10.pdf)
- **문제**: BMS 오브젝트마다 키음(노트)인지 BGM인지 가른다. 레인 배치는 "따로 필요하다"며 남겼다.
- **데이터**: "GENOSIDE -BMS StarterPackage-" 85곡의 가장 쉬운 채보와 가장 어려운 채보. 소리 파일은 49,688개다.
- **방법**
  - openSMILE 특징 60개: 로그 에너지·HNR·F0·스펙트럴 플럭스·분산·왜도의 6개 저수준 특징 × 10개 함수.
  - 앞선 10개 오브젝트의 같은 특징, 시간 차, 앞 오브젝트의 라벨을 더해 680차원이다.
  - 분류기는 SVM(Weka SMO)이다.
- **결과**

  | 설정 | 매크로 재현율 | 매크로 정밀도 |
  |---|---|---|
  | 곡 안 10겹 교차검증, 가장 쉬운 채보 | 87.4% | 89.0% |
  | 곡 안 10겹 교차검증, 가장 어려운 채보 | 92.0% | 92.0% |
  | 곡을 섞어서, 가장 쉬운 채보 | 56.1% | 68.0% |
  | 곡을 섞어서, 가장 어려운 채보 | 74.5% | 74.5% |

  - 곡을 섞은 쉬운 채보에서는 키음 재현율이 15%다.
  - 앞 오브젝트 라벨을 빼면 2–7점 떨어진다.
  - **같은 소리 파일이 한 곳에서는 키음, 다른 곳에서는 BGM이다. 쉬운 채보의 선택은 어려운 채보 선택의 부분집합이 아니다.**
- **적용**
  - 단계: ③. 과제: T1.
  - "쉬운 채보 선택은 곡을 넘어 일반화하기 어렵다"는 것을 BMS에서 보인 유일한 자료다. 우리 레벨 2 F1이 낮은 것과 맞는다.
  - 앞 오브젝트 라벨이 도움이 된다. 고르기에 **순서(앞에서 무엇을 골랐나)**를 넣으라는 근거다. 우리 고르기는 온셋마다 따로 점수를 매기고 밀도 단계에서 점수 순으로 채운다.
  - 쓰는 법: 아이디어만 빌린다. 코드는 없다.
  - 비용: SVM이라 CPU로 된다.
  - 시험: 우리 사람 채보에서 곡별로 "쉬운 채보 노트 중 같은 곡 어려운 채보에도 있는 몫"(포함률)을 재면 이 결론이 BMS 전체에서도 맞는지 바로 확인된다(우선순위 1).

#### A3. 香川·手塚·稲葉, 음악의 중요한 구성 요소의 추출 제안: 음악 게임용 채보 자동 생성을 위해 (音楽の重要な構成要素の抽出の提案 —音楽ゲーム用譜面自動生成のために—) [미확인]

- 香川俊宗, 手塚宏史, 稲葉真理. EC2015(엔터테인먼트 컴퓨팅 심포지엄), pp. 326–333, 2015. A2의 참고문헌에서만 봤고 원문은 읽지 못했다.
- **내용(인용한 쪽의 설명)**: FBCKE(Frequency-Based Key Component Extraction). MIDI에서 같은 음열(시각·채널·음높이·길이)이 몇 번 나오는지 세고, 문턱을 넘는 것을 "중요한 소리" = 키음 후보로 뽑는다.
- **적용**: ③, T1. 25-6이 바란 새 분석값("그 소리가 곡 안에서 몇 번 되풀이되는지, 리프의 일부인지")과 같은 생각이다. 우리는 MIDI가 없으므로 같은 소리 묶기(우선순위 2)의 갈래 번호로 "되풀이 횟수"와 "같은 마디 위치에서의 반복"을 센다[추측].

#### A4. 기타 키음·국내 자료

- **野呂, 南山大 졸업연구(2021)** [미확인, PDF 404]: 키음 게임의 프레이즈 추출 → 키음 추정 → 배치 3단계 구성.
- **Kyle Xiao, Georgia Tech 학위논문** [미확인, 403]: GenerationMania와 공동 창작 도구.
- **심한뫼·유길상·박상용·이원형, "음악특징 추출을 이용한 리듬게임 자동 맵 디자인"**, 한국컴퓨터게임학회논문지 24(1):193–199, 2011 [확인, 초록]: FFT 음높이로 beatmania식 노트를 둔다. 정량 평가가 보이지 않는다. 적용할 것은 없다.
- 국내 학술지에서 딥러닝 채보 생성 논문은 찾지 못했다(KAIST 학위논문 B7 제외).

### 3-B. osu!mania(세로 레인)

#### B1. Time-based Chart Partitioning (TCP) [확인]

- Jonah Hanzen, Emily Halina, Matthew Guzdial. AIIDE 2025(Proc. AAAI AIIDE 21(1)), pp. 43–51.
- 링크: [doi:10.1609/aiide.v21i1.36808](https://ojs.aaai.org/index.php/AIIDE/article/view/36808). 코드는 찾지 못했다.
- **문제**: osu!mania 4K. 온셋이 주어지면 레인과 롱노트를 정한다.
- **데이터**: AutoOsu 데이터 1,126채보(400곡, ★4 이하). 시험은 2024–25년 채보 100개다.
- **방법**
  1. AutoOsu의 온셋을 마디의 k/d 격자에 붙인다(d ∈ {2,3,4,6,8,12,16,24,32}).
  2. 채보를 무작위 지점에서 b마디 이하 구간으로 반복해서 나눈다(b = 0.25가 최고).
  3. 각 구간의 리듬과 허용오차 안에서 맞는 창을 **사람 채보 데이터베이스**에서 찾는다.
  4. 맞는 창의 레인과 롱노트 길이를 그대로 베낀다. 맞는 것이 없으면 더 잘게 나눈다.
- **지표**: 온셋 F1, 온셋 + 레인 F1, 0.25·0.5·1·2마디 국소 패턴 재현율, 2–8-gram 레인 열 겹침.
- **결과**

  | 지표 | TCP | AutoOsu |
  |---|---|---|
  | 온셋 F1 | 0.765 | 0.742 |
  | 온셋 + 레인 F1 | 0.134 | 0.136 |
  | 1마디 패턴 재현율 | 0.313 | 0.256 |

  - 온셋 + 레인 F1이 둘 다 0.13대다. **레인은 정답 하나로 재기 어렵다는 증거**다.
  - 2–4-gram은 TCP가 낫다. 저자들은 "학계에 기호적·패턴 기반 채보 생성기는 없다"고 적었다.
- **적용**
  - 단계: ⑥. 과제: T2, T5(롱노트 모양).
  - 사람 채보 조각을 그대로 베끼는 방식은 쓰지 않는다. 사람 채보 데이터베이스를 앱에 넣어야 하고, 우리는 채보를 저장소에 두지 않는다(PATTERN 17장).
  - 아이디어는 빌린다. **리듬 골격(박 위치 열)에 조건을 건 짧은 레인 모양 빈도**를 집계 통계로만 저장하고 빔 점수로 쓴다(우선순위 5).
    - 23장의 키 묶음 확률(`sets`)도 이미 사람 채보에서 집계한 통계다. 같은 방식이다.
    - 모양을 "손·손가락 이동 갈래"(같은 손 3연속, 계단, 트릴 …)로 추상화하면 개별 채보를 복원할 수 없다.
  - 비용: 집계만 하면 되고 CPU로 된다. 빔 점수에 조회 한 번이 더해진다.
  - 시험: 26장처럼 레벨별 같은 손 3연속·쏠린 마디·트릴·계단 몫과 근접도의 레인 모양 항목을 잰다. TCP의 국소 패턴 재현율과 n-gram 겹침을 새 진단 지표로 더할 수 있다.

#### B2. Beat-Aligned Spectrogram-to-Sequence Generation of Rhythm-Game Charts [확인]

- Jayeon Yi, Sungho Lee, Kyogu Lee(서울대). ISMIR 2023 LBD.
- 링크: [arXiv:2311.13687](https://arxiv.org/abs/2311.13687) · 코드 [stet-stet/goct_ismir2023](https://github.com/stet-stet/goct_ismir2023)(MIT)
- **문제·방법**
  - 입력: 박에 맞춘 로그 멜(1/48박 홉, 4박씩).
  - 모델: 3층(d = 256) 인코더-디코더 트랜스포머. 출력은 시간 토큰과 행동 토큰(누름·롱노트 시작·끝 조합 80개)이다.
  - 난이도는 48차원 임베딩으로 조건을 건다.
- **데이터**: osu!mania 4K 6,781채보·2,004곡. StepMania Fraxtil·ITG로 미세조정한다.
- **결과(onset F1)**
  - osu! 84.6(C-LSTM 83.9).
  - Fraxtil은 osu!로 사전학습하면 78.9(C-LSTM 75.6).
  - 박 정렬이 드문 분할을 살린다. 12분 F1이 정렬 없이 9.2%, 정렬하면 59.2%다.
  - **아주 쉬운 Fraxtil·ITG 채보에서는 크게 실패했다.** osu! 데이터에 성긴 채보가 드물기 때문이다.
- **적용**
  - 단계: ②–③. 과제: T1, T6.
  - 우리는 이미 박 격자 위에서 고른다(박 정렬은 해결됨).
  - 교훈은 "쉬운 채보의 질은 성긴 채보 데이터가 얼마나 있는가에 달렸다"는 것이다. 우리 고르기 모델의 0–4 NPS 구간이 사람 채보를 충분히 받았는지 확인할 가치가 있다[추측].
  - 비용: 모델은 작지만 GPU 학습이 필요하다. 우리 고전 파이프라인에는 아이디어만.

#### B3. AutoOsu: Audio-Aware Action Generation for Rhythm Games [확인, 초록]

- Sihun Lee, Dasaem Jeong(서강대). ISMIR 2023 LBD.
- 링크: [LBD 페이지](https://ismir2023program.ismir.net/lbd_319.html) · [프로젝트](https://issyun.github.io/autoosu/) · 코드 issyun/AutoOsu(LICENSE·README 없음)
- **방법**: 온셋 머리와 행동(레인) 머리가 둘 다 오디오를 받아 함께 학습하는 CRNN이다. ★ 조건을 건다.
- **한계**: 4/4·고정 템포만 다룬다. TCP의 재평가에서 1/1000마디 허용이면 온셋 F1이 0.208로 격자 정밀도가 낮다.
- **적용**: 레인을 고를 때도 오디오를 보는 것이 낫다는 주장이다. 우리 빔 서치는 이미 음높이·스템·대역을 본다. 새로 가져올 것은 없다.

#### B4. Transfer Learning for Rhythm Game Chart Generation from Music Transcription and Across Games [확인, 초록·본문 일부]

- Sojeong An, Nathan Pruyne, Chris Donahue, Dasaem Jeong. [arXiv:2610.14955](https://arxiv.org/abs/2610.14955), 2026-10-10, 프리프린트.
- **방법**
  - 사전학습 오디오 인코더(MuScriptor·YourMT3+·MERT)를 얼려 두고 선형 투영만 학습한다.
  - 디코더 전용 트랜스포머다(mania 8층, d = 768).
  - ★을 MLP로 토큰 임베딩에 더한다. 구간 경계를 넘는 롱노트는 "잡힌 레인" 토큰으로 넘긴다.
- **데이터**: osu! ranked. mania 4K 1,955곡·6,268채보.
- **결과(mania, MuScriptor)**
  - onset F1 0.728, event F1 0.492.
  - 세 모드를 함께 학습하면 event F1 0.506, Clone Hero를 더하면 0.482.
  - 전사(transcription) 인코더가 처음부터 학습한 인코더와 MERT보다 사람 채보에 잘 맞는다(초록).
- **적용**
  - 단계: ①–③. 과제: T1, T5.
  - **"음악 전사의 표현이 채보 고르기에 도움이 된다"**는 가장 최근 근거다.
  - 우리 조건에서는 큰 인코더 대신 이미 선택 설치형인 basic-pitch(Apache-2.0, 매개변수 약 1.7만 개)의 onset·note 사후확률을 고르기 모델 특징으로 넣는 것이 같은 방향의 싼 실험이다(우선순위 6).
  - 비용: 논문 모델은 수억 매개변수라 GPU가 필요하다[추측]. 코드·라이선스는 밝히지 않았다.

#### B5. Procedural Content Generation of Rhythm Games Using Deep Learning Methods [확인, 초록·일부]

- Yubin Liang, Wanxiang Li, Kokolo Ikeda(JAIST). ICEC-JCSG 2019, LNCS 11863, pp. 134–145.
- 링크: [HAL](https://hal.science/hal-03652042)
- **방법**
  - osu!mania 4K. C-BLSTM 온셋 모델이다. "롱노트 시작은 긴 멜로디의 시작"이라서 뒤 맥락이 필요하다는 이유로 양방향을 쓴다.
  - 퍼지 라벨: 정답 주변을 가우시안으로 번진다.
  - 행동은 DDC식 LSTM(4레인 × 없음·누름·롱노트 시작·끝)이다.
- **데이터**: 1,655채보·473곡.
- **결과**
  - 시각 F 0.816 → 0.843.
  - 행동 정확도 0.437이다. **같은 곡의 사람 채보 둘도 행동의 절반가량이 다르다**고 적었다.
  - 10명 사용자 평가: 손 채보 4.52, 제안 3.72, 이전 방법 3.30.
- **적용**
  - 과제: T5, T7.
  - 롱노트 후보를 정할 때 다음 음까지의 뒤 맥락을 본다는 점은 우리 `hold_end`(다음 멜로디 음에서 끝냄)와 같다.
  - "사람 둘도 절반이 다르다"는 사람 대 사람 상한을 재야 한다는 근거다(우선순위 1).
  - 퍼지 라벨은 고르기 모델 학습(±40ms 안의 사람 노트 = 정답)에 근접 가중을 주는 형태로 시험할 수 있지만 효과는 작을 것이다[추측].

#### B6. Mania Archetype: Chart Generation for Rhythm Action Games with Human Factors [확인]

- Jiale Wang, Wei Huang, Xiu Li. AHFE 2024, Vol. 137, pp. 175–185. [doi:10.54941/ahfe1005000](https://doi.org/10.54941/ahfe1005000)
- **방법**
  - 4K. 온셋은 주어지고 레인만 고른다.
  - 레인마다 2비트(없음·누름·롱노트)를 시그모이드로 내서 동치를 낸다.
  - 입력에 **앞 3노트의 레인·종류**를 넣는다. 채보 작가 인터뷰에서 고른 특징이다.
- **데이터**: 120채보(BPM 150–170, ★3–6).
- **결과**
  - DDC보다 패턴 유사도 51.0 → 64.3%, 롱노트 유사도 42.6 → 58.1%.
  - 8명 설문(예측 가능성·기억성 등)에서 0.5–1점 높다.
  - 같은 레인에서 탭과 롱노트가 겹치는 것을 막지 못했다고 적었다.
- **적용**: ⑥. 작가들이 "앞 3노트"를 본다는 것은 우리 빔 서치(앞 노트 맥락 비용)와 같다. 설문 항목은 나중에 플레이 평가 문항으로 쓸 수 있다.

#### B7. 딥러닝 기반 음악 게임 액션 생성(KAIST 석사논문) [미확인, 초록만]

- Carolina Carusi(지도 남주한). KAIST 문화기술대학원, 2024-02. [dspace](https://dspace.kaist.ac.kr/handle/10203/321397)
- C-LSTM에 FiLM으로 난이도 조건을 걸고, 스템 분리 오디오를 입력으로 쓴다(초록). 대상 게임·수치는 확인하지 못했다.
- 스템을 입력으로 쓴다는 점은 우리와 같다.

### 3-C. 다른 장르(아이디어가 옮겨 올 만한 것)

#### C1. Dance Dance Convolution (DDC) [확인]

- Chris Donahue, Zachary C. Lipton, Julian McAuley. ICML 2017(PMLR 70:1039–1048).
- 링크: [arXiv:1703.06891](https://arxiv.org/abs/1703.06891) · 코드 [chrisdonahue/ddc](https://github.com/chrisdonahue/ddc)(MIT) · [ddc_onset](https://github.com/chrisdonahue/ddc_onset)(MIT, PyTorch, CPU 추론)
- **문제**: 스텝 배치(언제)와 스텝 선택(어느 화살표)을 나눈다. 우리 ③–④와 ⑥의 구분과 같다.
- **방법**
  - 배치: 3개 창의 80밴드 로그 멜과 C-LSTM. 난이도 원-핫을 넣고, **난이도마다 다른 피크 문턱**으로 고른다.
  - 선택: 화살표 256토큰의 조건부 LSTM 언어모델. Δ박·박 위상을 같이 넣는다.
- **데이터**: Fraxtil 90곡(450채보), ITG 133곡(652채보). 좌우·상하 대칭으로 4배 늘린다.
- **결과**
  - Fraxtil F_c 0.681, ITG 0.689.
  - **난이도별 Fraxtil F_c는 Beginner 0.389, 최상위 0.844**다. 저자는 쉬운 채보의 클래스 불균형을 원인으로 든다.
  - 선택 혼잡도 3.01(5-gram 3.68). 오디오·작가 조건은 과적합했다.
  - ddc_onset README는 "난이도 조건은 잘 동작하지 않았다"고 적었다.
- **적용**
  - 단계: ④, ⑥. 과제: T1, T2.
  - 난이도별 문턱은 우리 밀도 단계와 같다.
  - **Δ박·박 위상을 넣은 짧은 레인 언어모델**이 n-gram보다 낫다. 우리 빔 점수에 "레인 n-gram 점수"를 넣을 때 박 위상을 조건으로 쓰라는 근거다(우선순위 5).
  - 비용: 언어모델 대신 n-gram 빈도표면 CPU로 된다.
  - 시험: B1과 같다.

#### C2. GenéLive! Generating Rhythm Actions in Love Live! [확인]

- Atsushi Takada 외(KLab, 규슈대). AAAI-23, 37(4):5266–5275.
- 링크: [arXiv:2202.12823](https://arxiv.org/abs/2202.12823) · 코드 [KLab/AAAI-23.6040](https://github.com/KLab/AAAI-23.6040)(MIT, StepMania로 학습한 모델 포함)
- **방법**
  - 온셋 모델이다. 멜 229밴드와 다중 스케일 합성곱(32·512·2048·4096ms 최대 풀링), BiLSTM을 쓴다.
  - **박 안내 입력**: 프레임마다 2 = 마디 첫 박, 1 = 박, 0 = 없음. 박을 무작위로 지우는 증강(p = 0.123)을 쓴다.
  - 난이도는 스칼라 하나로 넣고 **모든 난이도를 한 모델로** 학습한다.
- **데이터**: 러브라이브! 올스타즈 163곡(난이도 4), 우타프리 140곡(난이도 5), StepMania.
- **결과(F1_m, 러브라이브!, GenéLive! / DDC)**: Beginner 0.866 / 0.784, Expert 0.796 / 0.760.
  - 박 안내를 빼면 쉬운 채보가 무너진다(우타프리 Beginner 0.686 → 0.452).
  - KLab 채보는 쉬운 채보 노트의 97% 이상이 어려운 채보에도 있다(포함률). 그래서 함께 학습하는 것이 이긴다. StepMania는 포함률이 낮고 함께 학습해도 이기지 않았다.
  - 2020년 7월 이후 110곡에 썼다. 곡당 작업이 약 40시간에서 20시간으로 줄었다.
- **적용**
  - 단계: ③. 과제: T1.
  - 박 안내 입력은 우리 고르기 모델의 박자 위치 특징(마디 첫 박·정박·8분·16분·셋잇단·32분)으로 이미 들어 있다. 다중 스케일 맥락은 25-2에서 효과가 없었다(AUC +0.003 미만).
  - 새로 가져올 것은 **포함률과 공동 학습의 관계**다.
    - 우리 BMS 사람 채보의 레벨 간 포함률을 재서, 높으면 쉬운 채보를 어려운 채보의 부분집합으로 고르는 방식(C3·C4)을 시험한다.
    - 낮으면(후쿠나가 A2처럼) 쉬운 채보에 맞는 따로 된 고르기가 맞다.
  - 쉬운 채보가 큰 소리보다 주기적인 박을 따른다는 관찰은 KLab·DDR 자료의 이야기다. BMS 사람 레벨 2는 정박이 57.8%로 우리(77.1%)보다 오히려 **적다**. 장르 사전을 그대로 들여오면 안 된다.

#### C3. Dance Dance Gradation과 저널판(難易度間関係モデル) [확인]

- 辻野雄大, 山西良典. ICEC 2018, LNCS 11112, pp. 175–187. [HAL](https://hal.science/hal-02128628)(CC BY 4.0).
- 저널판: 辻野雄大, 山西良典, 西原陽子, 福本淳一, "時系列深層学習に基づく難易度間関係モデルを用いたダンスゲーム譜面難易度の自動調整", 情報処理学会論文誌 59(11):1953–1964, 2018. [IPSJ](https://ipsj.ixsq.nii.ac.jp/records/192346)
- **문제**: 가장 어려운(Challenge) 채보에서 쉬운 채보를 만든다. 오디오가 아니라 채보가 입력이다.
- **방법**
  - 시각마다 화살표 수, 박 층(4·8·12·16·24·32분), 마디 안 위치를 LSTM에 넣는다.
  - 쉬운 채보 스텝 확률을 낸다. 학습 정답을 섞어(Beginner 100% + Medium 50% …) 중간 난이도를 만든다.
- **데이터**: ITG 133곡.
  - DDR Beginner 스텝의 95% 이상이 4분 자리이고, **74%가 마디 첫 박**이다(Challenge 11%).
- **결과**
  - 쉬운 채보 배치 F 0.693으로 DDC의 약 1.8배다.
  - 사람 최저 난이도 채보와 화살표 2-gram 빈도의 상관은 0.972다.
- **적용**
  - 단계: ③–④. 과제: T1.
  - "같은 곡의 어려운 채보(우리가 만든 MASTER/EXPERT) → 쉬운 채보"를 학습한다. 특징은 "어려운 채보에서 고른 노트인가, 어떤 박 층인가, 마디 안 어디인가"다. 우리 고르기 모델에 **'상위 난이도 채보가 이 후보를 골랐는가'**라는 특징을 더하는 형태로 시험할 수 있다(우선순위 4).
  - 우리 생성기는 난이도마다 따로 만들므로, 높은 난이도를 먼저 만들고 그 결과를 넘기는 순서가 필요하다. 결정성(같은 시드 = 같은 채보)은 지킬 수 있다.
  - 효과는 BMS의 포함률에 달렸다. A2에 따르면 낮을 수 있다.
  - 비용: 로지스틱 특징 하나를 더하고 높은 난이도를 한 번 더 생성한다. CPU로 된다.
  - 시험: 25-3과 같은 표를 쓴다. 근접도, 레벨 2·6 시각 F1, 정박 몫을 잰다.

#### C4. Using Machine Translation to Convert Between Difficulties in Rhythm Games [확인, 초록]

- Kevin Gold, Alex Olivier. AIIDE 2010, 6(1):27–32. [doi:10.1609/aiide.v6i1.12396](https://doi.org/10.1609/aiide.v6i1.12396)
- **방법**: 기타 히어로 I/II의 Expert/Hard/Medium/Easy를 "언어"로 보고, 바이그램 언어모델과 번역 모델로 어려운 채보를 쉬운 채보로 옮긴다. 학습은 한 번 훑기이고 복호는 길이의 제곱이다.
- **결과**: 손 채보 맞추기에서 RNN을 이겼다(수치는 초록에 없음).
- **적용**: C3와 같은 생각의 고전판이다. 신경망 없이 CPU로 된다. 우리에게는 C3식 특징 하나가 더 싸다.

#### C4-1. TaikoNation: Patterning-focused Chart Generation [확인]

- Emily Halina, Matthew Guzdial. FDG 2021. [arXiv:2107.12506](https://arxiv.org/abs/2107.12506) · 코드 TaikoNationV1(LICENSE 없음)
- **방법**
  - osu!taiko 온셋과 노트 종류를 함께 예측한다.
  - 앞 노트를 오디오 특징에 곱해 LSTM에 넣는다.
  - 4단계를 한꺼번에 예측하고, 겹친 예측을 평균한 뒤 argmax 대신 **표본을 뽑는다**(드문 종류와 긴 패턴을 살린다).
  - 쉬운 채보는 "희소해서 PCGML이 약하다"며 뺐다.
- **지표**: 8프레임 이진 창의 "패턴 공간"과 "사람 패턴과 겹치는 몫".
- **결과**: 사람 패턴과 겹치는 몫 92.5–94.1%(DDC 78.7–83.2%).
- **적용**: T2, T7. 우리는 빔 서치의 결정적 선택(시드 잡음은 작음)이라 드문 모양(한 손 3연속, 쏠린 마디)이 비용 경쟁에서 진다. "평균 비용이 가장 낮은 것"보다 "목표 빈도를 따라가는" 장치가 필요하다는 근거다(C6, 우선순위 3). 패턴 공간 지표는 레인 모양 근접도의 보조 지표로 쓸 수 있다.

#### C5. ITGPT와 Dance Dance ConvLSTM [확인, 초록·본문]

- Miguel O'Malley, "ITGPT: A Transformer Based Architecture for the Generation of Dance Dance Revolution and In the Groove Charts", [arXiv:2607.14148](https://arxiv.org/abs/2607.14148), 2026-07, 프리프린트.
- 같은 저자, "Dance Dance ConvLSTM", [arXiv:2507.01644](https://arxiv.org/abs/2507.01644), 2025.
- **배치 방법**
  - 박 단위로 오디오를 샘플링한다. 박·마디·4·8·16마디 계층 트랜스포머다.
  - **생성된 배치에서 난이도·BPM을 맞히는 진단 신경망의 손실**을 더해(λ = 0.005) 요청한 난이도를 지키게 한다.
- **선택 방법**: 자기회귀 트랜스포머다. 최근 20스텝 안에서 길이 4–8 n-gram이 되풀이되면 1.07^(l−3)의 반복 벌점을 준다.
- **결과**
  - 배치 F1: ITGPT 0.802, DDC 0.732.
  - 난이도별 F1: Beginner 0.555(DDC 0.238), Challenge 0.788.
  - 롱노트(hold) 정확도: DDCL 0.412, ITGPT 0.378, DDC 0.189. 저자는 ConvLSTM이 지속음을 잘 잡는다고 본다.
- **적용**
  - ⑦과 ⑥. 과제: T2, T5.
  - 진단 신경망 손실은 우리 난이도 루프(⑦)와 같은 생각이다. 우리 루프는 밀도만 조절한다. **레벨별 손 모양 통계에도 같은 되먹임**을 걸 수 있다(우선순위 3).
  - n-gram 반복 벌점은 연타 줄기·재봉틀 같은 의도된 반복과 부딪치므로 그대로 쓰지 않는다.
  - 코드 주소는 확인하지 못했다.

#### C6. Automatic generation of stage data for music games with an appropriate difficulty control method (有働 2023, 박사논문) [확인]

- 有働篤人, 홋카이도대 박사논문, 2023(CC BY 4.0). [hdl:2115/89461](https://hdl.handle.net/2115/89461) · [PDF](https://eprints.lib.hokudai.ac.jp/repo/huscap/all/89478/Atsuhito_Udo.pdf)
- **문제**: DDR/StepMania에서 생성 채보의 신체 부담을 사람 채보의 같은 레벨 수준으로 맞춘다.
- **방법**
  - **이동 비용(MC)**: 발 이동을 최적으로 흉내 내 초당 비용을 잰다. 사람 채보 1,178개에서 레벨별 MC를 잰다.
  - DDC로 만든 채보는 같은 레벨 사람 채보보다 MC가 높다.
  - 생성 중에 누적 MC가 목표의 ±15% 안에 머물도록 스텝 방향을 그때그때 바꾼다.
- **적용**
  - 단계: ⑥. 과제: T2.
  - 26·29장에서 마디 균형 비용을 없애도 쏠린 마디와 한 손 3연속이 "거의 그대로"였다. 고정 비용으로는 빈도가 움직이지 않는다.
  - Udo식으로 **레벨별 목표 빈도(사람 채보의 같은 손 3연속 11%, 쏠린 마디 등)를 두고, 빔 서치 중 누적 빈도가 목표에서 벗어난 만큼 비용을 바꾸는 되먹임**을 걸 수 있다(우선순위 3).
  - 결정적이고 CPU 비용이 거의 없다.
  - 위험: 다른 레인 모양 통계(키 묶음·동치 모양)를 밀어낼 수 있다. 29장처럼 반응을 보며 맞춘다.
  - 시험: 레벨 2·6·10·14의 한 손 3연속·쏠린 마디·연타 줄기 몫, 근접도(레인 모양·키 쓰임), 시각 F1(레인만 바뀌므로 그대로여야 함).

#### C7. Event-Based Token Sequences for Audio-Conditioned Music-Game Level Modeling [확인, 본문]

- Zhang, Hsueh, Ikeda(JAIST). ICMR '26. [arXiv:2607.09095](https://arxiv.org/abs/2607.09095)
- **방법**: maimai. Whisper·MERT 인코더와 12층 디코더로 박 이동 토큰과 사건 토큰(탭·홀드 시작/끝·슬라이드·브레이크)을 낸다.
- **데이터**: 1,018곡, 4,187채보.
- **결과**
  - 사건 F1이 Beginner 0.651, Remaster 0.457이다. **종류까지 맞히면 어려운 채보가 더 어렵다**(온셋만 보면 반대).
  - **오디오 기여 점수(ACS)** = (정답 오디오 점수 − 섞은 오디오 점수) / (강제 정답 − 섞은 오디오) = 0.58.
- **적용**
  - T1, T7. ACS의 "오디오를 섞으면 얼마나 떨어지나"는 우리에게 바로 쓸 수 있는 진단이다.
  - 다른 곡의 분석값(같은 BPM 격자)을 넣고 레벨 2 채보를 만들어 사람 채보와의 F1을 재면, 레벨 2 고르기가 박 사전 확률 이상으로 소리를 쓰는지 알 수 있다(우선순위 1에 포함).

#### C8. Beat Saber와 VR 생성기 [확인, README·보도]

| 이름 | 방법 | 라이선스 | 우리에게 |
|---|---|---|---|
| Beat Sage (Donahue·Agarwal 2020) | 타이밍 신경망 + 블록 종류 신경망. 논문·모델 비공개 | — | 없음 |
| [DeepSaber](https://github.com/oxai/deepsaber) (OxAI 2019) | 배치(WaveNet/DDC) + 블록 선택을 빔 서치(폭 17)로 | GPL-3.0 | 선택을 빔 서치로 한다는 점이 우리와 같음 |
| [InfernoSaber](https://github.com/fred-brenner/InfernoSaber---BeatSaber-Automapper) | 오디오 오토인코더 + TCN 박 + DNN 노트 | MIT | 없음 |
| Rizhko 2022 (Ragnarock, [arXiv:2304.06809](https://arxiv.org/abs/2304.06809)) | 학습한 온셋 대신 PLP(국소 주기 펄스)로 후보 | — | 쉬운 채보 후보에 PLP를 쓸 수 있음[추측] |

블록 방향·손 모양은 건반 레인과 구조가 달라 옮겨 올 것이 거의 없다.

### 3-D. 공개 생성기(osu! 커뮤니티)

| 이름 | 방법 | mania | 라이선스 | 계산 | 우리에게 |
|---|---|---|---|---|---|
| [Mapperatorinator](https://github.com/OliBomby/Mapperatorinator) | Whisper 변형(약 219M). ★·작가·연도·서술자 조건, CFG | 지원(`keycount`, `hold_note_ratio`) | MIT | 개발에 약 5,700 GPU시간, 추론에 GPU | 조건 토큰을 무작위로 지우는 학습. 롱노트 비율 손잡이(우리도 있음) |
| [osuT5](https://github.com/gyataro/osuT5) | MT3식 T5. BPM·오프셋 입력 | 불명 | MIT | GPU | 없음 |
| [osu-diffusion](https://github.com/OliBomby/osu-diffusion) | DiT, osu! standard 좌표만 | 없음 | LICENSE 없음 | GPU | 없음 |
| [MuG Diffusion](https://github.com/Keytoyze/Mug-Diffusion) | 잠재 확산, 4K VSRG | 4K만 | 코드 MIT, **가중치 비상업**, 채보 CC0(비상업 표기 요청) | RTX 3050 Ti로 3분 곡 4채보 약 30초 | **Etterna MSD 기술 갈래(stream·jumpstream·handstream·chordjack·stamina·technical)를 조건과 지표로 씀** |
| [BeatLearning](https://github.com/sedthh/BeatLearning) | BERT식 마스크 인코더, 약 20만 매개변수 | 계획 | Apache-2.0 | GPU 권장 | 없음 |
| [osumapper](https://github.com/kotritrona/osumapper) | TF2 리듬 모델 + GAN 흐름, mania Colab | 있음 | Apache-2.0 | TF | 없음 |

- MSD 기술 갈래 점수(Etterna의 MinaCalc)는 4K용이다. 7K+1S에 그대로 맞지 않고, MinaCalc의 라이선스는 확인하지 못했다.
- 같은 생각(채보를 기술 갈래 점수로 요약)을 우리 스킬 지표(stream·chord·jack·technical·stamina, GENERATION 4장)에 7K 손 모양을 더해 넓히는 정도가 현실적이다[추측].

### 3-E. 난이도 추정

#### E1. Ordinal Regression for Difficulty Estimation of StepMania Levels [확인]

- Billy Joe Franks, Benjamin Dinkelmann, Sophie Fellenz, Marius Kloft. [arXiv:2301.09485](https://arxiv.org/abs/2301.09485), 2023. 게재처는 확인하지 못했다.
- **방법**
  - 노트마다 19차원 열(BPM, 진행, Δt, 패널별 탭·홀드)을 넣는다. 3층(d = 64) 트랜스포머 인코더다.
  - 순서 회귀 머리(NNRank, RED-SVM, Laplace, Binomial)를 분류·회귀와 비교했다.
- **데이터**: ITG·fraxtil·Gpop·Gulls·Speirmix, 합해서 약 1,270곡·6,000채보.
- **결과**
  - 가중 절대 오차 0.262–0.444. 쌍별 순위 일치 0.992–0.997.
  - 사용자 쌍 비교에서 모델이 원래 작가 레벨보다 플레이어와 더 잘 맞았다(5개 중 4개 데이터).
- **적용**
  - 단계: ⑦. 과제: 난이도 신뢰도.
  - 우리 산정기는 strain → 유효 NPS → 레벨 표다. 사람 BMS 채보의 ★·発狂 표 레벨(공개된 집계값)에 **쌍별 순위 학습**으로 표를 맞추는 방법을 빌릴 수 있다.
  - 트랜스포머 대신 우리 strain 특징 몇 개의 순서 로지스틱으로 충분할 것이다[추측].
  - 비용: 작고 CPU로 된다.
  - 시험: 검증 곡 사람 채보의 레벨 순위 일치율(같은 곡 안, 곡 사이)과 GENERATION 8장의 레벨 표 맞춤 오차.

#### E2. 그 밖의 난이도 자료

- **今野·西野, 個人的難易度評価モデル(jubeat)**, IPSJ SIG-GI 2018-GI-39 No. 9 [확인, 일부]: 동시 누름률·연타율·밀도 등 손으로 만든 특징, 쌍 비교 라벨, C5.0 결정나무. 4×4 판이라 레인은 아니다.
- **"Classifying Rhythm Game Chart Difficulty Level Using Hidden Markov Models"** (Springer, doi:10.1007/978-3-031-47457-6_16, 2023) [미확인]: HMM 3단 분류, 정확도 70.37%(요약에서만 봄).
- **osu!mania star rating**(ppy/osu `Difficulty`): 레인별 strain과 전체 strain. 우리 산정기와 GenerationMania의 도전 모델이 이것을 따른다. 검증 논문은 찾지 못했다.
- **IIDX CPI**(cpi.makecir.com): 클리어 램프 통계로 ☆12 난이도를 추정한다. 방법은 논문으로 나오지 않았다.

### 3-F. 평가 방법

#### F1. ChartGenEval: Corruption-Tested Multi-Dimensional Feedback for Rhythm-Game Chart Generation [확인, 초록]

- Jhen-Ke Lin. [arXiv:2607.12857](https://arxiv.org/abs/2607.12857), 2026-07, 프리프린트. 코드 JacobLinCool/ChartGenEval(MIT, 2차 보고).
- **주장**: 정답 채보 하나와의 일치는 "재구성"을 잴 뿐이다. 그럴듯한 다른 채보도 오류처럼 감점된다.
- **방법**
  - 공식 채보의 **타이밍 지도만** 쓰고 노트는 정답으로 쓰지 않는다.
  - 역할별 신호를 따로 낸다: 격자 위상, 타이밍 정확도, 전이 친숙도, 반복률, 노트 속도 전형성, 밀도 급등.
  - 같은 난이도 사람 채보의 10–90 백분위 띠로 점수를 매긴다.
  - 각 지표를 **일부러 망가뜨린 채보**(15·30·60ms 밀기, 흔한 패턴으로 바꾸기, 루프 붕괴)로 시험해서 감도와 불변성을 확인한다.
- **결과**: 흔한 패턴으로 바꾸면 언어모델 혼잡도가 37% 떨어진다. 루프 붕괴는 자기유사도를 62% 올린다. 이런 지표는 잘못된 행동에 상을 줄 수 있다.
- **적용**
  - 과제: T7. 우리 근접도는 "통계마다 1 − |우리 − 사람| / 사람의 평균"이다(23장).
  - 두 가지를 빌린다.
    - (a) 평균값 하나 대신 같은 레벨 사람 채보의 **백분위 띠** 안에 드는 채보의 몫을 보조 지표로 낸다.
    - (b) 근접도와 시각 F1을 **망가뜨린 채보**로 시험한다. 모든 노트를 정박으로 옮기기, 드럼을 한 키에 몰기, 동치를 대칭으로만 바꾸기 등을 해서 지표가 실제로 떨어지는지 본다.
  - 비용: 측정 스크립트만 바뀌고 생성기는 그대로다.

#### F2. 다른 논문에서 나온 평가 요령

- **사람 대 사람 상한**: Liang 외(B5)는 같은 곡 사람 채보 둘이 행동의 절반가량 다르다고 했다. TCP(B1)는 온셋 + 레인 F1이 0.13이다. 우리 검증 곡에서 **같은 곡·비슷한 밀도의 서로 다른 사람 채보 짝의 시각 F1**을 재면, 레벨 2의 0.445가 사람 상한의 몇 %인지 알 수 있다.
- **패턴 재현율·n-gram 겹침**(B1, C4-1): 레인 모양 근접도의 보조 지표로 쓴다.
- **Top-2 정확도**(C5): 레인 선택은 정답이 하나가 아니므로, 사람 레인이 우리 빔의 상위 2개 안에 드는지를 잰다.

### 3-G. 음악 분석: 같은 소리 묶기·드럼 전사·롱노트·쉬운 채보

#### G1. 같은 소리 묶기(T3·T4)

| 논문 | 방법 | 결과 | 라이선스·비용 | 우리에게 |
|---|---|---|---|---|
| Rossignol, Lagrange, Lafay, Benetos, "Alternate Level Clustering for Drum Transcription", EUSIPCO 2015 [확인, 초록] ([HAL](https://hal.archives-ouvertes.fr/hal-01122006)) | 비지도. 여러 층에서 군집과 분할을 번갈아 하고, **되풀이되는 사건**이 군집을 이끈다 | 초록에는 수치 없음 | 코드 미상. 고전, CPU | 학습 없이 "같은 소리" 갈래를 만드는 가장 직접적인 방법 |
| Antich, Paterna, Marxer, Purwins, MML 2016 [확인] ([PDF](https://vbn.aau.dk/files/241244354/Antich_etal_MML2016Unsupervised.pdf)) | 온셋 + 음색 특징, 박 격자 위 응집 군집, HDP-HMM으로 갈래 수 자동 결정 | 디스코 루프 2개만, ARI 56% | 고전 | 갈래 수를 정하는 방법 |
| Dittmar, Müller, "Reverse Engineering the Amen Break", IEEE/ACM TASLP 24(9), 2016 [확인] ([페이지](https://audiolabs-erlangen.com/resources/MIR/2016-IEEE-TASLP-DrumSeparation)) | NMFD: 드럼 소리마다 시간-주파수 템플릿과 활성도 | PEASS/BSS 수치 미확인 | NMF라 CPU로 됨 | **템플릿 하나 = 키음 하나**. 활성도가 같은 템플릿인 온셋 = 같은 소리 |
| Wang, Salamon, Cartwright, Bryan, Bello, "Few-Shot Drum Transcription in Polyphonic Music", ISMIR 2020 [확인] ([arXiv:2008.02791](https://arxiv.org/abs/2008.02791)) | 원형(prototypical) 신경망, Slakh 합성 데이터 | 몇 개 예시로 지도학습 CRNN과 비슷하거나 낫고, 열린 어휘도 됨 | 코드 미상 | 곡 안에서 처음 본 소리를 "예시"로 두고 비슷한 온셋을 찾는 거리 함수 |
| Kim & Nam, AES 149th, 2020, 후속 [arXiv:2211.07951](https://arxiv.org/abs/2211.07951) [확인, 초록] | 섞인 오디오와 단일 샘플을 같은 공간에 넣는 트리플릿 임베딩 | 미확인 | 미확인 | 반주가 섞여도 같은 샘플끼리 모이는 임베딩 |
| Riou, Serrà, Mitsufuji, "Automatic Music Sample Identification with Multi-Track Contrastive Learning", ICASSP 2026 [확인] ([arXiv:2510.11507](https://arxiv.org/abs/2510.11507)) | 다중트랙 대조학습 | Sample100 mAP 0.603 | 가중치 미공개, 학습 GPU 약 75GB | 곡 단위 샘플 탐지라 온셋 단위가 아니다. 무겁다 |
| Kong 외, PANNs, IEEE/ACM TASLP 28, 2020 [확인] ([코드](https://github.com/qiuqiangkong/audioset_tagging_cnn)) | AudioSet 사전학습 CNN | AudioSet mAP 0.431–0.439 | 코드 MIT, 가중치 라이선스는 README에 없음. MobileNet 변형은 CPU로 됨 | 범주 수준 임베딩이라 스네어 샘플 둘을 못 가를 수 있다[추측] |

- **G1에서 얻은 결론**: 온셋 단위로 "같은 샘플"을 묶어 레인에 연결한 논문은 찾지 못했다. 쓸 만한 조합은 다음과 같다[추측].
  1. 온셋을 그 소리가 가장 큰 스템에서 잘라 낸다(200–400ms). 로그 멜 포락선과 MFCC 평균·기울기, HPSS 화성 비율을 특징으로 쓴다.
  2. 되풀이를 사전으로 쓰는 응집 군집(Rossignol·Antich)이나 NMFD 템플릿(Dittmar)으로 갈래를 만든다.
  3. 갈래마다 레인 자리를 먼저 정하고 레인 모양을 그 자리에 맞춘다. 24-5에서 바란 순서다.
- **우리만 가진 장점**: BMS 측정 곡은 **키음 번호가 곧 정답 군집**이다. 분석기가 만든 갈래의 순도·ARI와 "한 키음 온셋 중 가장 큰 갈래의 몫"(지금 34%, 무작위 29%)을 생성기에 넣기 전에 오프라인으로 잴 수 있다.

#### G2. 자동 드럼 전사(T4)

| 논문·도구 | 갈래 | 결과(온셋 F1) | 라이선스 | 계산 |
|---|---|---|---|---|
| Wu 외, "A Review of Automatic Drum Transcription", IEEE/ACM TASLP 26(9), 2018 [확인] | 분류 체계 | NMF·RNN 공통 비교 | 논문 | NMF는 CPU로 싸다 |
| [ADTOF](https://github.com/MZehren/ADTOF) (Zehren 외, ISMIR 2021; Signals 2023; ISMIR 2024) [확인] | 킥·스네어·탐·하이햇·심벌 | MDB 0.87, ENST 0.84, RBMA 0.65(다른 논문의 재평가). 리듬게임 드럼 채보 359시간으로 학습 | 저장소 **CC BY-NC-SA 4.0**(비상업·동일조건) | 작은 CRNN[추측] |
| Vogl, Widmer, Knees, DAFx-18 ([arXiv:1806.06676](https://arxiv.org/abs/1806.06676)) [확인] | 다갈래(18갈래로 기억함[미확인]) | — | madmom 모델 파일 CC BY-NC-SA[미확인] | 작음 |
| Southall 외, ISMIR 2017 [확인] | 킥·스네어·하이햇 | — | 코드 미상 | 작음 |
| [arXiv:2509.24853](https://arxiv.org/abs/2509.24853) (2025) [확인] | Demucs 드럼 → ADTOF → DrumSep 6스템으로 7갈래 + 세기 | 5갈래 MDB 0.89·ENST 0.85, 8갈래 0.84·0.76 | 미상 | 분리를 여러 번 해서 CPU에 무겁다 |
| [LarsNet](https://github.com/polimi-ispl/larsnet) (Mezza 외, Pattern Recognition Letters 2024) [확인] | 드럼 믹스 → 킥·스네어·탐·하이햇·심벌 5스템 | "실시간보다 빠름" | 데이터 CC BY 4.0, **가중치 CC BY-NC 4.0** | U-Net 5개 |
| N2N (Yeung 외, Sony, [arXiv:2509.21739](https://arxiv.org/abs/2509.21739)) [확인] | 7갈래, 확산 | MDB 87.9(ADTOF 86.9) | 미상 | 약 50M + MERT 330M |
| [YourMT3+](https://github.com/mimbres/YourMT3) (Chang 외, MLSP 2024) [확인] | 다악기 + 드럼 | ENST 드럼 85.9 | 코드 **GPL-3.0** | 30–46M, 자기회귀 |
| [Omnizart](https://github.com/Music-and-Culture-Technology-Lab/omnizart) (Wu 외, JOSS 2021) [확인] | 드럼·음·화음·박 | 미확인 | MIT | TF 의존 |
| STRUM (Opria, [arXiv:2605.12135](https://arxiv.org/abs/2605.12135)) [확인, 2차] | Clone Hero 드럼 | 갈래별 정확도: 킥 0.61, 스네어 0.44, 하이햇 0.49 | LICENSE 없음 | — |

**적용 판단(T4)**

- 29-6에 따르면 사람은 드럼 **종류**별로 키를 정하지 않는다. 키음 **하나하나**가 자기 레인을 지키고, 종류로 보면 모든 키에 퍼진다.
- 그래서 드럼 전사로 킥·스네어·하이햇을 더 정확히 가르는 것(갈래 3 → 5)은 T4를 직접 풀지 않는다. 오히려 "스네어 = 3번 키"를 더 굳힐 수 있다[추측].
- T4는 G1의 **같은 샘플 묶기**와 함께 푸는 것이 맞다. 같은 스네어라도 샘플이 다르면 다른 갈래, 다른 레인이다.
- 드럼 전사는 묶기의 입력(먼저 갈래로 나눈 뒤 그 안에서 샘플을 묶기)으로만 쓸 만하다. 성능이 좋은 것(ADTOF, LarsNet)은 비상업 라이선스이고, 고전 NMF는 깨끗하다.

#### G3. 롱노트를 둘 소리(T5)

| 논문·도구 | 내용 | 라이선스·비용 | 우리에게 |
|---|---|---|---|
| Bittner 외, basic-pitch(NMP), ICASSP 2022 ([arXiv:2203.09893](https://arxiv.org/abs/2203.09893), [코드](https://github.com/spotify/basic-pitch)) [확인] | onset·note·pitch 사후확률(약 11ms). note 사후확률을 따라가 음 끝을 정한다. 매개변수 16,782개 | Apache-2.0. 7분 45초 곡을 2017년 노트북 CPU에서 24초 | 이미 선택 설치형 백엔드다. **note 사후확률의 평균과 길이**를 롱노트 특징으로 쓴다 |
| Hawthorne 외, Onsets and Frames, ISMIR 2018 ([arXiv:1710.11153](https://arxiv.org/abs/1710.11153)) [확인] | 온셋 머리가 프레임 머리를 문턱으로 막는 구조. 음 끝까지 맞힌 F1이 크게 오름 | Apache-2.0(Magenta)[미확인], 피아노·드럼 | 지속을 정할 때 "새 온셋이 있었나"로 문턱을 거는 원리 |
| Driedger, Müller, Disch, "Extending Harmonic-Percussive Separation", ISMIR 2014 [확인] | HPSS에 잔차(소음) 성분과 여유(margin)를 더한다 | librosa(ISC)에 구현, CPU로 매우 쌈 | 온셋마다 화성 비율 H/(H+P+R)과 **어택 뒤 화성 포락선의 감쇠 시간** |
| Liang 외(B5), DDCL(C5) | 롱노트는 긴 멜로디의 시작. ConvLSTM이 지속음을 잘 잡는다 | — | 뒤 맥락의 필요성 |

**적용 판단(T5)**

- 17-6에서 분석기 음 길이와 키음 길이의 로그 상관은 0.04였다. 24장의 긴 소리 확률 모델은 정밀도는 높지만 롱노트 수를 줄였다. 롱노트를 고르는 단계를 따로 두자는 결론이었다.
- 같은 소리 묶기(G1)가 되면 **"그 갈래의 소리들이 평균적으로 얼마나 울리는가"**를 갈래 단위로 잴 수 있다. 온셋 하나의 길이보다 덜 흔들린다[추측].
- 측정은 BMS 키음의 실제 길이가 정답이다(17장). 특징(HPSS 감쇠, basic-pitch note 길이, 갈래 평균 길이)마다 "350ms 넘게 울리는가"의 AUC를 잰 뒤 생성기에 넣는다.
- 롱노트를 다룬 채보 논문(B2·B4·B6·C5)은 롱노트를 "시작·끝 토큰"으로만 다룬다. "어느 소리를 롱노트로"를 정면으로 다룬 논문은 찾지 못했다.

#### G4. 쉬운 채보의 소리 고르기(T1)

| 논문 | 내용 | 우리에게 |
|---|---|---|
| Nakamura, Yoshii, "Statistical Piano Reduction Controlling Performance Difficulty", APSIPA Trans. SIP 7:e13, 2018 ([arXiv:1808.05006](https://arxiv.org/abs/1808.05006)) [확인] | 원곡 충실도와 템포에 따른 수치 난이도를 맞바꾸는 HMM 축약. 주관 난이도·충실도가 난이도 매개변수를 따라 단조롭게 오름 | "충실도 최대화 + 난이도 제약"은 우리 고르기 + 밀도와 같은 틀이다. 충실도를 **노트 사이의 관계(선율 윤곽 유지)**로 잰다는 점이 다르다 |
| Suzuki, "Piano score rearrangement into multiple difficulty levels via notation-to-notation approach", EURASIP JASMP 2023 ([doi:10.1186/s13636-023-00321-7](https://doi.org/10.1186/s13636-023-00321-7)) [확인] | 0.3M 매개변수 MEGA, 난이도 조건, 상용 피아노 악보 4레벨 | 같은 곡 여러 난이도 짝 데이터의 가치. BMS는 이런 짝이 많다 |
| Thul, Toussaint, "Rhythm complexity measures", ISMIR 2008 ([학위논문](https://escholarship.mcgill.ca/downloads/rn301491t)) [확인] | WNBD·Longuet-Higgins & Lee 싱코페이션 등 수십 개 척도와 사람 지각의 상관 | 쉬운 채보에 **마디 단위 싱코페이션 상한**을 두는 대신, 사람 레벨 2의 싱코페이션 분포에 맞추는 지표로 쓴다 |
| Bittner 외, Deep Salience, ISMIR 2017 ([코드](https://github.com/rabitt/ismir2017-deepsalience), MIT) [확인] | 선율·베이스·다중 F0 두드러짐 | 우리 멜로디 존재도와 같은 역할. 24장에 따르면 사람은 노래보다 리드·피아노를 고르므로 선율 두드러짐만으로는 부족하다 |
| Ariga, Fukayama, Goto, "Song2Guitar", ISMIR 2017 [확인, 초록] | 기타 난이도 요인 분석 | 직접 쓸 것 없음 |

#### G5. CPU에서 도는 박·분리 백엔드

| 도구 | 성능 | 라이선스 | CPU | 우리 상태 |
|---|---|---|---|---|
| beat_this (Foscarin, Schlüter, Widmer, ISMIR 2024, [arXiv:2407.21658](https://arxiv.org/abs/2407.21658)) | GTZAN 박 F1 89.1, 다운비트 78.3. small(약 2M)은 88.8·77.2 | 코드·가중치 MIT(학습 데이터 일부는 제한) | 실행 시간 비율은 공개되지 않음 | 선택 설치형으로 씀(`final0`). **small 모델을 시험할 가치**가 있다(17-3의 BPM·마디 오류 대상) |
| Demucs v4 htdemucs (Rouard 외, ICASSP 2023) | MUSDB 9.0 dB | MIT. 저장소는 2025-01 보관(archived) | README 기준 곡 길이의 약 1.5배 | 선택 설치형으로 씀. 유지보수는 adefossez 포크 |
| BS-RoFormer (Lu 외, [arXiv:2309.02612](https://arxiv.org/abs/2309.02612)) | MUSDB18HQ 9.80 dB | 공식 가중치 없음. 커뮤니티 가중치는 라이선스가 섞이거나 불명 | Demucs보다 무겁다[추측] | 권하지 않음 |
| Open-Unmix | 드럼 SDR 6.04(HQ)·7.15(UMXL) | 코드 MIT, UMXL 가중치 CC BY-NC-SA | Demucs보다 빠르다[추측] | 필요 없음 |
| Spleeter | Demucs보다 낮음 | 코드 MIT | 빠름 | 필요 없음(TF) |
| allin1 (Kim, Nam, WASPAA 2023) | 박·다운비트·구간 라벨 | 코드 MIT, 가중치 미상 | CPU 가능. 윈도우는 NATTEN 빌드가 무겁다 | 선택 설치형으로 씀 |

## 4. 찾지 못한 것

- DJMAX·O2Jam·EZ2ON·Malody·Quaver의 채보 생성·난이도 학술 논문(영·한·일).
- BMS ★/発狂 표 레벨이나 IIDX ☆ 레벨을 기계학습으로 예측한 논문(커뮤니티 도구 CPI만 있음).
- "같은 키음 → 같은 레인"을 다룬 방법. GenerationMania는 배치를 기여로 보지 않았고, 후쿠나가는 배치를 미해결로 남겼다.
- 키음 게임에서 롱노트를 둘 소리를 고르는 방법.
- osu!mania 레인용 확산 모델 논문(MuG Diffusion은 논문이 없고, osu-diffusion은 standard 좌표용).
- 2023–2026년에 범용 텍스트 LLM으로 채보를 만든 동료 심사 논문. "Beat-It", "MuseChart", "Gen-Chart", "Dance Dance Generation"이라는 이름의 채보 논문은 찾지 못했다.
- 7K 손 모양(한 손 3연속·쏠린 마디)을 기술 갈래로 분류한 연구(4K MSD 외).
- 원문을 읽지 못한 것: 香川 EC2015, 南山大 졸업연구, KAIST 석사논문 본문, Liang 2019 전문, HMM 난이도 논문, AutoOsu 코드의 라이선스.

## 5. 과제별 정리

| 과제 | 가장 관련 있는 논문 | 핵심 아이디어 |
|---|---|---|
| T1 쉬운 채보 | GenéLive!(C2), DDG(C3), Gold & Olivier(C4), 후쿠나가(A2), GenerationMania(A1), 香川(A3), ACS(C7), Nakamura(G4) | 사람 대 사람 상한과 포함률을 먼저 잰다 → 되풀이·리프 특징 → 어려운 채보를 특징으로 → 오디오 섞기 진단 |
| T2 손 모양 | Udo(C6), ITGPT(C5), TCP(B1), DDC 선택(C1), TaikoNation(C4-1) | 목표 빈도를 따라가는 되먹임 비용, 박 위상 조건 레인 n-gram |
| T3 소리 자리 | Rossignol·Antich·Dittmar·Wang(G1), GenerationMania(A1) | 키음 정답으로 채점하는 같은 소리 묶기 → 갈래 자리를 먼저 정함 |
| T4 드럼 몰림 | G1(주), G2(보조) | 드럼 종류가 아니라 샘플 단위로 자리를 정함 |
| T5 롱노트 | basic-pitch·HPSS(G3), Liang(B5), DDCL(C5) | 갈래 단위 울림 길이, HPSS 감쇠, note 사후확률. 키음 길이로 AUC 채점 |
| T6 셋잇단 | GOCT(B2) | 박 정렬은 이미 있다. 새로 가져올 것은 없다 |
| T7 평가 | ChartGenEval(F1), Liang(B5), TCP(B1), ACS(C7) | 백분위 띠, 망가뜨린 채보 시험, 사람 대 사람 상한, Top-2 |

## 6. 우리 측정으로 시험하는 방법

모든 시험은 지금 체계를 그대로 쓴다. 검증 곡 220곡(곡 키의 crc32가 홀수), 7K+1S 사람 채보 855개, 레벨 2·6·10·14 짝(PATTERN 17·25장)이다. 학습이 필요한 것은 25-2처럼 검증 곡과 겹치지 않는 1,044곡(crc32 짝수)에서 맞춘다. 사람 채보는 17장 방식(곡마다 풀어 재고 바로 지움)으로만 다루고, 저장소에는 집계 숫자와 모델 계수만 남긴다.

1. **분석만 바꾸는 것**(G1 소리 묶기, G3 롱노트 특징)
   - 생성기에 넣기 전에 키음 정답으로 오프라인 채점한다.
   - 소리 묶기: 갈래 순도·ARI·"한 키음 온셋 중 가장 큰 갈래의 몫"(지금 0.34)을 드럼·음 있는 키음으로 나눠 잰다.
   - 롱노트: "350ms 넘게 울리는 키음인가"의 AUC와 상위 5% 정밀도(24장의 0.80과 비교).
2. **고르기를 바꾸는 것**(A1 관계 요약, A3 되풀이 특징, C3 상위 난이도 특징, B4 전사 특징)
   - 25-2의 표(밀도 구간 3개의 AUC, 상위 K 정밀도)를 먼저 낸다.
   - 그다음 생성기에 넣고 25-3의 표(근접도, 박자 격자, 레벨 2 정박, 레벨별 시각 F1, 전체 시각 F1)를 낸다.
3. **레인을 바꾸는 것**(C6 되먹임, C1·B1 n-gram)
   - 26·29장의 표(레벨별 한 손 3연속·쏠린 마디·연타 줄기·트릴·재봉틀·동치 모양, 근접도의 레인 모양·키 쓰임)를 쓴다.
   - 시각 F1은 그대로여야 한다(노트 시각이 바뀌지 않으므로).
4. **평가를 바꾸는 것**(F1, F2, C7)
   - 생성기는 그대로 두고 측정 스크립트(`server/scripts/compare_bms.py` 등)에 지표를 더한다.
   - 지금 0.9.13의 값을 기준선으로 남긴다.
5. **DJMAX·EZ2ON 채보**는 지금처럼 노트 해시로 바뀌지 않았음을 확인한다(6곡 × 8개 난이도).

## 7. 적용 우선순위

효과·비용·위험은 상·중·하로 매겼다. 효과는 남은 과제에 대한 기대이고 모두 [추측]이다.

| 순위 | 할 일 | 근거 논문 | 과제 | 효과 | 비용 | 위험 | 비고 |
|---|---|---|---|---|---|---|---|
| 1 | **사람 대 사람 시각 F1 상한, 레벨 간 포함률, 오디오 섞기(ACS) 진단** | B5, B1, C2, A2, C7, F1 | T1, T7 | 상(무엇을 고칠지 정함) | 하 | 하 | 생성기는 그대로. 레벨 2의 0.445가 상한에 가까우면 T1의 우선순위를 낮춘다 |
| 2 | **같은 소리 묶기**(스템별 음색 특징 + 되풀이 사전 군집, NMFD 비교)를 키음 정답으로 채점 | G1, A1 | T3, T4, T5, T1 | 상 | 중 | 중(분석 시간 증가) | 3·4·6·7번의 바탕. 신경망 가중치 없이 CPU로 됨 |
| 3 | **레벨별 손 모양 목표를 따라가는 되먹임 비용**(한 손 3연속, 쏠린 마디, 연타 줄기) | C6, C5, C4-1 | T2 | 중–상 | 하–중 | 중(다른 레인 통계와 경쟁) | 29장처럼 반응을 보며 값을 맞춤 |
| 4 | **고르기 모델에 새 특징**: 소리 갈래의 되풀이 횟수·리프 소속(A3), 관계 요약(A1), 상위 난이도가 고른 후보인가(C3, 1번 포함률이 높을 때) | A1, A3, C3, C4 | T1 | 중 | 중 | 하–중 | 25-6이 바란 새 분석값 |
| 5 | **박 위상을 조건으로 건 짧은 레인 모양 n-gram 점수**(손·손가락 이동 갈래로 추상화한 집계 통계) | C1, B1, C4-1 | T2 | 중 | 중 | 중(사람 채보에서 뽑은 통계의 범위를 사용자가 정해야 함) | 23장 키 묶음 확률과 같은 집계 방식 |
| 6 | **basic-pitch 사후확률과 HPSS 감쇠를 고르기·롱노트 특징으로**, 갈래 단위 울림 길이 | B4, G3 | T1, T5 | 중 | 하–중 | 하 | basic-pitch는 Apache-2.0, 이미 선택 설치형(Python 3.11 한정) |
| 7 | **평가 보강**: 백분위 띠 지표, 망가뜨린 채보 시험, Top-2 레인 일치, 패턴 재현율 | F1, C5, B1 | T7 | 중 | 하 | 하 | 1번과 함께 하면 쌈 |
| 8 | **난이도 표를 쌍별 순위로 맞춤**(strain 특징의 순서 로지스틱) | E1, E2 | ⑦ | 중 | 중 | 중(BMS 레벨 체계와 우리 15단계의 대응) | 공개 집계 레벨만 씀 |
| 9 | beat_this small 시험 | G5 | ② | 하–중 | 하 | 하 | MIT |
| 10 | 자동 드럼 전사(ADTOF·LarsNet) | G2 | T4(보조) | 하 | 중 | 상(비상업 라이선스) | 2번이 안 될 때만. 고전 NMF는 라이선스 문제가 없음 |
| — | 큰 신경망 생성기(Mapperatorinator, MuG Diffusion, 트랜스포머 채보 모델) | D, B4, C5 | — | 불명 | 상(GPU, 수 GB) | 상(라이선스, 결정성, 측정 체계와 단절) | 권하지 않음 |

**순서 제안**: 1과 7은 측정만 바꾸니 먼저 한다. 2는 분석 시험으로 시작한다. 2의 갈래가 쓸 만하면(키음 몫이 0.34에서 뚜렷이 오르면) 4·6과 24장의 "소리 자리 먼저"로 넘어간다. 3은 2와 독립이라 함께 진행할 수 있다.

## 8. 라이선스 정리(코드·가중치를 쓰자는 제안에 해당하는 것)

| 대상 | 라이선스 | 쓸 수 있는가 |
|---|---|---|
| basic-pitch | Apache-2.0 | 예(이미 선택 설치형) |
| beat_this | 코드·가중치 MIT | 예(이미 선택 설치형) |
| Demucs | MIT(저장소 보관됨) | 예(이미 선택 설치형) |
| librosa HPSS·NMF | ISC | 예(우리는 numpy·scipy로 직접 구현해도 됨) |
| Deep Salience | MIT | 예 |
| DDC·ddc_onset·GenéLive!·GOCT·Mapperatorinator·osuT5 | MIT | 코드 참고는 가능. 학습 데이터(채보)는 별개 |
| ADTOF | CC BY-NC-SA 4.0 | 비상업·동일조건. 배포 앱의 기본 구성에는 넣지 않는 것이 맞다 |
| LarsNet 가중치 | CC BY-NC 4.0 | 비상업 |
| MuG Diffusion 가중치 | 비상업 | 비상업 |
| YourMT3+ | 코드 GPL-3.0 | 별도 프로세스·선택 설치가 아니면 배포 앱과 섞기 어렵다 |
| PANNs·MT3·Omnizart·allin1 가중치 | README에 밝히지 않음 | 확인 전에는 쓰지 않는다 |
| GenerationMania·TaikoNation·osu-diffusion·AutoOsu·STRUM | LICENSE 없음 | 쓰지 않는다(아이디어만) |

이 표는 각 저장소의 README·LICENSE를 2026-10에 본 것이다. 넣기 전에 다시 확인한다.

## 9. 참고문헌

- An, Pruyne, Donahue, Jeong. Transfer Learning for Rhythm Game Chart Generation from Music Transcription and Across Games. arXiv:2610.14955, 2026.
- Antich, Paterna, Marxer, Purwins. Unsupervised Learning of Structural Representation of Percussive Audio. MML 2016.
- Bittner et al. A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation. ICASSP 2022. arXiv:2203.09893.
- Bittner, McFee, Salamon, Li, Bello. Deep Salience Representations for F0 Estimation in Polyphonic Music. ISMIR 2017.
- Chang, Benetos, Kirchhoff, Dixon. YourMT3+. arXiv:2407.04822, 2024.
- Dittmar, Müller. Reverse Engineering the Amen Break. IEEE/ACM TASLP 24(9):1531–1543, 2016.
- Donahue, Lipton, McAuley. Dance Dance Convolution. ICML 2017. arXiv:1703.06891.
- Driedger, Müller, Disch. Extending Harmonic-Percussive Separation of Audio Signals. ISMIR 2014.
- Foscarin, Schlüter, Widmer. Beat This! Accurate Beat Tracking Without DBN Postprocessing. ISMIR 2024. arXiv:2407.21658.
- Franks, Dinkelmann, Fellenz, Kloft. Ordinal Regression for Difficulty Estimation of StepMania Levels. arXiv:2301.09485, 2023.
- 福永大輝, 越智景子, 大淵康成. リズムアクションゲームにおけるキー音の自動推定. 芸術科学会論文誌 18(1):10–18, 2019.
- Gold, Olivier. Using Machine Translation to Convert Between Difficulties in Rhythm Games. AIIDE 2010.
- Halina, Guzdial. TaikoNation: Patterning-focused Chart Generation for Rhythm Action Games. FDG 2021. arXiv:2107.12506.
- Hanzen, Halina, Guzdial. Time-based Chart Partitioning: Improving Local Coherency in Rhythm Game Chart Generation. AIIDE 2025.
- Hawthorne et al. Onsets and Frames: Dual-Objective Piano Transcription. ISMIR 2018. arXiv:1710.11153.
- 香川俊宗, 手塚宏史, 稲葉真理. 音楽の重要な構成要素の抽出の提案 —音楽ゲーム用譜面自動生成のために—. EC2015, pp. 326–333 [미확인].
- Kim, Nam. All-In-One Metrical and Functional Structure Analysis with Neighborhood Attentions on Demixed Audio. WASPAA 2023.
- Kong et al. PANNs: Large-Scale Pretrained Audio Neural Networks for Audio Pattern Recognition. IEEE/ACM TASLP 28, 2020.
- 今野, 西野. 個人的難易度評価モデル. IPSJ SIG-GI 2018-GI-39(9).
- Lee, Jeong. AutoOsu: Audio-Aware Action Generation for Rhythm Games. ISMIR 2023 LBD.
- Liang, Li, Ikeda. Procedural Content Generation of Rhythm Games Using Deep Learning Methods. ICEC-JCSG 2019, LNCS 11863.
- Lin, Xiao, Riedl. GenerationMania: Learning to Semantically Choreograph. AIIDE 2019. arXiv:1806.11170.
- Lin. ChartGenEval: Corruption-Tested Multi-Dimensional Feedback for Rhythm-Game Chart Generation. arXiv:2607.12857, 2026.
- Lu, Wang, Kong, Hung. Music Source Separation with Band-Split RoPE Transformer. arXiv:2309.02612, 2023.
- Mezza, Giampiccolo, Bernardini, Sarti. Toward Deep Drum Source Separation. Pattern Recognition Letters 183:86–91, 2024.
- Nakamura, Yoshii. Statistical Piano Reduction Controlling Performance Difficulty. APSIPA Trans. SIP 7:e13, 2018.
- O'Malley. Dance Dance ConvLSTM. arXiv:2507.01644, 2025.
- O'Malley. ITGPT: A Transformer Based Architecture for the Generation of Dance Dance Revolution and In the Groove Charts. arXiv:2607.14148, 2026.
- Riou, Serrà, Mitsufuji. Automatic Music Sample Identification with Multi-Track Contrastive Learning. ICASSP 2026. arXiv:2510.11507.
- Rossignol, Lagrange, Lafay, Benetos. Alternate Level Clustering for Drum Transcription. EUSIPCO 2015.
- Rouard, Massa, Défossez. Hybrid Transformers for Music Source Separation. ICASSP 2023.
- 심한뫼, 유길상, 박상용, 이원형. 음악특징 추출을 이용한 리듬게임 자동 맵 디자인. 한국컴퓨터게임학회논문지 24(1):193–199, 2011.
- Southall, Stables, Hockman. Automatic Drum Transcription for Polyphonic Recordings Using Soft Attention Mechanisms and Convolutional Neural Networks. ISMIR 2017.
- Suzuki. Piano score rearrangement into multiple difficulty levels via notation-to-notation approach. EURASIP JASMP 2023.
- Takada et al. GenéLive! Generating Rhythm Actions in Love Live!. AAAI 2023. arXiv:2202.12823.
- Thul, Toussaint. Rhythm Complexity Measures: A Comparison of Mathematical Models of Human Perception and Performance. ISMIR 2008.
- 辻野雄大, 山西良典. Dance Dance Gradation. ICEC 2018, LNCS 11112. 저널판: 情報処理学会論文誌 59(11):1953–1964, 2018.
- 有働篤人(Atsuhito Udo). Automatic generation of stage data for music games with an appropriate difficulty control method. 北海道大学 博士論文, 2023. hdl:2115/89461.
- Vogl, Widmer, Knees. Towards Multi-Instrument Drum Transcription. DAFx-18. arXiv:1806.06676.
- Wang, Huang, Li. Mania Archetype: Chart Generation for Rhythm Action Games with Human Factors. AHFE 2024.
- Wang, Salamon, Cartwright, Bryan, Bello. Few-Shot Drum Transcription in Polyphonic Music. ISMIR 2020. arXiv:2008.02791.
- Wu et al. A Review of Automatic Drum Transcription. IEEE/ACM TASLP 26(9):1457–1483, 2018.
- Yeung et al. Noise-to-Notes: Diffusion-based Generation and Refinement for Automatic Drum Transcription. arXiv:2509.21739.
- Yi, Lee, Lee. Beat-Aligned Spectrogram-to-Sequence Generation of Rhythm-Game Charts. ISMIR 2023 LBD. arXiv:2311.13687.
- Zehren, Alunno, Bientinesi. ADTOF: A Large Dataset of Non-Synthetic Music for Automatic Drum Transcription. ISMIR 2021. 후속: Signals 4(4), 2023; ISMIR 2024.
- Zhang, Hsueh, Ikeda. Event-Based Token Sequences for Audio-Conditioned Music-Game Level Modeling. ICMR 2026. arXiv:2607.09095.

## 10. 반영 상태와 계획 (생성기 0.9.20 기준, 상태는 0.9.22)

이 조사는 생성기 0.9.13 때 썼다. 그 뒤 0.9.14–0.9.20과 `docs/PATTERN_DESIGN.md` 30–40장에서 일부를 했고, 조사 때 몰랐던 두 가지가 나와 순서를 다시 정한다.

- **측정이 시드만으로 흔들린다**(PATTERN 39-7). 같은 코드에 시드만 바꿔도 전체 통계가 ±0.65%p, 레인 패턴이 ±1.3%p 움직인다. 지금까지 0.5%p 안팎으로 내린 결정은 우연과 가려지지 않았다. 그래서 7번(평가 보강)을 맨 앞으로 당긴다.
- **온셋 하나하나의 분석값은 거의 다 썼다**(PATTERN 39-4). 노트 고르기 모델을 비선형으로 바꿔도 상위 K 정밀도가 0.005–0.01만 오른다. 고르기를 더 올리려면 새 정보가 먼저다. 4번은 2번(같은 소리 묶기) 뒤로 간다.

### 10-1. 권고별 상태

| 순위 | 할 일 | 상태 | 남은 것 |
|---|---|---|---|
| 1 | 사람 대 사람 상한, 레벨 간 포함률, 오디오 섞기(ACS) 진단 | 완료. 상한·포함률(PATTERN 31장), 시각 F1을 정밀도·재현율·후보·점수·간격으로 나눠 잼(39장), ACS(41-3): 사람끼리 상한까지 남은 길 가운데 소리로 가는 몫이 레벨 2 / 6 / 10 / 14에서 0.34 / 0.49 / 0.75 / 0.47 | — |
| 2 | 같은 소리 묶기를 키음 정답으로 채점 | 완료, 관문을 넘지 못함(PATTERN 42장). 온셋 순간의 상승과 스템 창 음색(가장 큰 스템에서 300ms)을 견줬다. 같은 키음 쌍을 가리는 AUC는 온셋 상승이 가장 높고(드럼 0.78, 음 있는 소리 0.66) 스템 창은 0.56–0.68. 묶기의 가장 큰 갈래 몫은 0.31 → 0.34(순도 0.46 → 0.47)로 관문(0.5 안팎)에 못 미쳐 C를 하지 않는다 | 진짜 음원 분리(Demucs)가 있을 때 다시 |
| 3 | 레벨별 손 모양 목표를 따라가는 되먹임 비용 | 한 손 3연속 되먹임 채택(생성기 0.9.21, PATTERN 43장): 레벨 2 / 6 / 10 0.025 / 0.086 / 0.077 → 0.044 / 0.125 / 0.107(사람 0.082 / 0.141 / 0.114), 전체 통계 +0.7%p. 마디 쏠림 되먹임은 쏠린 마디를 사람 값까지 올리지만 한 손 붙은 동치를 늘려 보류 | 마디 쏠림을 단타에만 거는 판, 줄어든 가운데 키 몫 |
| 4 | 고르기 모델에 새 특징 | 39장에서 비선형 모델만 시험. 16분 당김음(0.9.20, 40장)은 이 줄기의 손 점수 쪽 수정 | 2번의 갈래가 관문을 넘지 못해(42장) 되풀이·리프 특징은 미룬다 |
| 5 | 박 위상 조건 레인 모양 n-gram 점수 | 채택(생성기 0.9.22, PATTERN 44장; 집계 통계만 `config/lane_moves.json`). 검증 곡에서 다음 키를 1순위 0.360, 2순위 안 0.549로 맞힌다(균등 0.156 · 0.273). 우리 채보의 이동은 이 모델로 무작위보다도 덜 그럴듯했다(사람은 직전 이동을 따라 계단을 잇고 연타를 줄기로 치는데 우리는 왔다 갔다 했다). 계획 밖 단타에 확률대로 뽑는 비용(세기 0.5)으로 2순위 안 적중 0.384 → 0.503(사람 0.538), 전체 통계 +0.45%p | 레벨 14 트릴이 늘었다; 세기·맥락 더 맞추기 |
| 6 | basic-pitch 사후확률·HPSS 감쇠를 고르기·롱노트 특징으로 | 하지 않음 | HPSS 감쇠를 먼저(기본 분석에서 늘 계산 가능) |
| 7 | 평가 보강(백분위 띠, 망가뜨린 채보, Top-2, 패턴 재현율) | 시드 평균(39-7), 백분위 띠·망가뜨린 채보·ACS(41장), Top-2 대신 사람 n-gram의 맞히기와 우리 채보의 이동 우도(44장) | 패턴 재현율 |
| 8 | 난이도 표를 쌍별 순위로 | 하지 않음 | 뒤로 |
| 9 | beat_this small | 하지 않음 | 뒤로 |
| 10 | 자동 드럼 전사 | 하지 않음(비상업 라이선스) | 2번이 안 될 때만 고전 NMF로 |

### 10-2. 지금 남은 과제의 값

기본 기준 0.9.20, 검증 곡 220곡·사람 7K+1S 채보 868개(괄호는 사람).

| 과제 | 값 |
|---|---|
| T1 쉬운 채보 | 레벨 2 정박 몫 0.781(0.586), 16분 몫 0.036(0.079). 시각 F1 레벨 2 0.43(사람끼리 0.651) |
| T2 손 모양 | 레벨 10 쏠린 마디 0.046(0.160), 레벨 6·10 축연타 0.59·0.48(2.11·1.58, 1,000노트당), 한 손 3연속 레벨 2·6·10 0.025·0.085·0.077(0.082·0.141·0.114; 0.9.21에서 0.044·0.125·0.107), 레벨 10 레인 쓰임의 치우침(1 − 엔트로피) 0.010(0.046) |
| T3 소리 자리 | 한 키음이 가장 많이 쓴 레인에 오는 몫 레벨 6·10 0.49·0.44(0.73·0.69) |
| T5 롱노트 | 긴 소리 위 롱노트 레벨 6·10 0.73·0.70(0.95·0.92) |
| T8 (새로) 키음 없는 자리의 노트 | 레벨 10·14 노트의 10–12%가 키음이 시작되지 않는 온셋(긴 키음 안쪽 어택·울림)에 놓인다. 사람 노트와 1–2%만 맞는다(PATTERN 39-3) |

### 10-3. 계획

**A. 평가 다지기**(7번 + 1번의 ACS). 측정 스크립트만 바꾸고 생성기는 그대로다.

1. 실험마다 시드 2–3개를 돌려 평균과 흔들림을 함께 낸다(근접도·묶음·시각 F1).
2. 백분위 띠: 레벨별 사람 채보의 10–90% 범위 안에 드는 우리 채보의 몫을 근접도 옆에 낸다.
3. 망가뜨린 채보 시험: 모든 노트를 정박으로, 드럼을 한 키로, 동치를 대칭으로만, 레인을 무작위로 바꾼 채보에서 근접도와 시각 F1이 정말 떨어지는지 본다. 거의 안 움직이는 통계와 드문 사건이라 크게 흔들리는 통계(레벨 2 한 손 붙은 동치 등)는 따로 표시한다.
4. ACS: 같은 BPM대 다른 곡의 분석값으로 만든 채보와 사람 채보의 시각 F1. 레벨 2 고르기가 박 위치 말고 소리를 얼마나 쓰는지 본다.
5. Top-2 레인 일치: 사람 레인이 우리 빔의 상위 두 후보 안에 드는 몫.

**B. 같은 소리 묶기 시험**(2번). 분석만 시험하고 생성기에는 아직 넣지 않는다.

1. 특징: 온셋을 그 소리가 가장 큰 스템에서 200–400ms 잘라 로그 멜 포락선, MFCC 평균·기울기, HPSS 화성 비율.
2. 묶기: 되풀이를 이끈 응집 군집(Rossignol·Antich)과 NMFD 템플릿(Dittmar)을 견준다.
3. 채점: BMS 키음 번호를 정답으로 순도, ARI, 한 키음 온셋 중 가장 큰 갈래의 몫(지금 0.34, 무작위 0.29). 드럼과 음 있는 키음을 나눠 잰다.
4. 자료: 캐시에는 온셋 순간의 섞인 멜 스펙트럼뿐이라 새 특징을 다시 뽑아야 한다. 미러가 아직 1,262곡을 받는 중이므로, 분석 단계에 새 특징 기록을 넣어 앞으로 받는 곡에서 함께 쌓는다. 모자라면 검증 곡 일부만 다시 렌더링한다.
5. 넘어갈 기준: 가장 큰 갈래 몫이 0.5 안팎으로 뚜렷이 오르고 순도가 떨어지지 않을 때 C로 간다. 안 되면 결과를 기록하고 C를 접는다.

**C. 갈래를 쓰는 생성기 변경**(B를 넘었을 때).

1. 소리 자리 먼저: 갈래마다 레인 자리를 정하고 모양을 그 자리에 맞춘다(T3·T4, 24-5에서 바란 순서).
2. 롱노트: 갈래 평균 울림 길이와 HPSS 감쇠로 롱노트 둘 소리를 고른다(T5, 6번). 키음 길이로 AUC를 먼저 잰다.
3. 고르기: 갈래의 되풀이 횟수·리프 소속을 노트 고르기 모델 특징으로 넣는다(T1, 4번).
4. 키음 없는 자리의 노트: 갈래·감쇠 특징으로 "새 소리인가" 판단을 보강한다(T8).

**D. 손 모양 되먹임**(3번). B와 상관없어 함께 진행할 수 있다.

1. 빔 서치 상태에 누적 빈도(한 손 3연속, 쏠린 마디, 축연타, 레인 쓰임의 치우침)를 두고, 레벨별 목표(사람 집계)에서 벗어난 만큼 비용을 바꾼다(Udo 2023).
2. 29장처럼 반응을 보며 값을 맞추되, A의 시드 평균으로 판단한다.
3. 노트 시각은 바뀌지 않으므로 시각 F1은 그대로여야 한다.

**E. 레인 모양 n-gram 점수**(5번). **결정이 필요하다.** 사람 BMS 채보에서 뽑은 짧은 이동 모양(손·손가락 이동 갈래 × 박 위상)의 빈도표를 레벨별 집계 통계로만 `config/`에 둔다. 23장의 키 묶음 확률과 같은 종류이고, 곡별 자료는 남기지 않는다. 이 범위가 괜찮은지 정해 주셔야 시작한다.

**뒤로 미루는 것**: 8번(난이도 순위 학습), 9번(beat_this small), 10번(드럼 전사).

### 10-4. 순서와 DJMAX·EZ2ON

- 추천 순서: **A → B와 D 함께 → (B를 넘으면) C → (결정되면) E**. A가 먼저인 까닭은 B·C·D의 효과가 시드 흔들림과 같은 크기일 수 있어서다.
- 각 단계는 세 기준을 모두 잰다. 32장의 원칙대로 곡에서 온 값(A의 측정, B·C의 갈래·롱노트·고르기)은 세 기준에 같이 쓴다. 게임 스타일에 속하는 값(D·E의 손 모양 목표)은 사람 BMS 채보가 기준이라 기본 기준에만 맞추고, DJMAX·EZ2ON은 패드 규칙과 고유 색깔을 지킨다.
