# 전수 조사: 화면, 항목, 설정 행

`client/audit/inventory.audit.ts`가 실행 중인 게임에서 읽은 것입니다. 원본: `data/inventory.json`.

## 화면과 상태

| 상태 | 이름 | 항목 수 | 힌트(키보드) | 힌트(패드) | 화면의 키 표시 |
|---|---|---|---|---|---|
| select | 선곡 | 33 | ↑ ↓ 곡 · PgUp PgDn 페이지 · ← → 난이도 · Tab 키 모드 · Shift 폴더 · Space 플레이 옵션 · I 곡 정보·도구 · F2 랜덤 · F3 즐겨찾기 · Shift+Enter 오토 플레이 · Enter 플레이 | ↑ ↓ 곡 · LB RB 페이지 · ← → 난이도 · Y 키 모드 · X 플레이 옵션 · LT 곡 정보·도구 · RT 설정 · RS 오토 플레이 · A 플레이 | + F10 F4 Shift+Enter F3 I Tab F5 Enter |
| select+options:rules | 선곡 › 플레이 옵션 › 플레이 규칙 | 41 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Space 플레이 옵션 닫기 · I 곡 정보·도구 · Esc 닫기 · Shift+Enter 오토 플레이 · Enter 플레이 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · X 플레이 옵션 닫기 · LT 곡 정보·도구 · B 닫기 · RS 오토 플레이 · A 플레이 | + F10 F4 Esc Tab F5 Enter |
| select+options:rules+practice | 선곡 › 플레이 옵션 › 플레이 규칙 (연습 모드 켬) | 46 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Space 플레이 옵션 닫기 · I 곡 정보·도구 · Esc 닫기 · Shift+Enter 오토 플레이 · Enter 플레이 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · X 플레이 옵션 닫기 · LT 곡 정보·도구 · B 닫기 · RS 오토 플레이 · A 플레이 | + F10 F4 Esc Tab F5 Enter |
| select+options:gear | 선곡 › 플레이 옵션 › 속도·기어 | 38 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Space 플레이 옵션 닫기 · I 곡 정보·도구 · Esc 닫기 · Shift+Enter 오토 플레이 · Enter 플레이 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · X 플레이 옵션 닫기 · LT 곡 정보·도구 · B 닫기 · RS 오토 플레이 · A 플레이 | + F10 F4 Esc Tab F5 Enter |
| select+options:generation | 선곡 › 플레이 옵션 › 생성 옵션 | 53 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Space 플레이 옵션 닫기 · I 곡 정보·도구 · Esc 닫기 · Shift+Enter 오토 플레이 · Enter 플레이 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · X 플레이 옵션 닫기 · LT 곡 정보·도구 · B 닫기 · RS 오토 플레이 · A 플레이 | + F10 F4 Esc Tab F5 Enter |
| select+info | 선곡 › 곡 정보·도구 | 52 | ↑ ↓ 항목 · ← → 값 · Space 플레이 옵션 · I 곡 정보·도구 닫기 · Esc 닫기 · Shift+Enter 오토 플레이 · Enter 플레이 | ↑ ↓ 항목 · ← → 값 · X 플레이 옵션 · LT 곡 정보·도구 닫기 · B 닫기 · RS 오토 플레이 · A 플레이 | + F10 F4 Esc Tab F5 Enter |
| select+info+sections | 선곡 › 곡 정보·도구 › 구간 편집 | 61 | ↑ ↓ 항목 · ← → 값 · Space 플레이 옵션 · I 곡 정보·도구 닫기 · Esc 닫기 · Enter 누르기 | ↑ ↓ 항목 · ← → 값 · X 플레이 옵션 · LT 곡 정보·도구 닫기 · B 닫기 · A 누르기 | + F10 F4 Esc Tab F5 Enter |
| select+add | 선곡 › 곡 추가 메뉴 | 39 | ↑ ↓ 곡 · PgUp PgDn 페이지 · ← → 난이도 · Tab 키 모드 · Shift 폴더 · Space 플레이 옵션 · I 곡 정보·도구 · F2 랜덤 · F3 즐겨찾기 · Esc 닫기 · Enter 고르기 | ↑ ↓ 곡 · LB RB 페이지 · ← → 난이도 · Y 키 모드 · X 플레이 옵션 · LT 곡 정보·도구 · RT 설정 · B 닫기 · A 고르기 | + F10 F4 Shift+Enter F3 I Tab F5 Enter |
| select+search | 선곡 › 검색 | 33 | ↑ ↓ 곡 · PgUp PgDn 페이지 · ← → 난이도 · Tab 키 모드 · Shift 폴더 · Space 플레이 옵션 · I 곡 정보·도구 · F2 랜덤 · F3 즐겨찾기 · Shift+Enter 오토 플레이 · Enter 플레이 | ↑ ↓ 곡 · LB RB 페이지 · ← → 난이도 · Y 키 모드 · X 플레이 옵션 · LT 곡 정보·도구 · RT 설정 · RS 오토 플레이 · A 플레이 | + F10 F4 Shift+Enter F3 I Tab F5 Enter |
| select+emptyfolder | 선곡 › 빈 폴더(즐겨찾기 0곡) | 12 | Shift 폴더 · Tab 키 모드 · Space 플레이 옵션 · I 곡 정보·도구 | Y 키 모드 · X 플레이 옵션 · LT 곡 정보·도구 · RT 설정 | + F10 F4 |
| select+first | 선곡 · 첫 실행(곡 없음) | 15 | ↑ ↓ 버튼 · + 곡 추가 · Tab 키 모드 · Space 플레이 옵션 · I 곡 정보·도구 · Enter 누르기 | ↑ ↓ 버튼 · Y 키 모드 · X 플레이 옵션 · LT 곡 정보·도구 · RT 설정 · A 누르기 | + F10 F4 D F J K |
| select+offline | 선곡 · 서버 없음 | 10 | ← → 버튼 · Enter 누르기 | ← → 버튼 · RT 설정 · A 누르기 | + F10 F4 |
| select@500 | 선곡 · 곡 500개 | 530 | ↑ ↓ 곡 · PgUp PgDn 페이지 · ← → 난이도 · Tab 키 모드 · Shift 폴더 · Space 플레이 옵션 · I 곡 정보·도구 · F2 랜덤 · F3 즐겨찾기 · Shift+Enter 오토 플레이 · Enter 플레이 | ↑ ↓ 곡 · LB RB 페이지 · ← → 난이도 · Y 키 모드 · X 플레이 옵션 · LT 곡 정보·도구 · RT 설정 · RS 오토 플레이 · A 플레이 | + F10 F4 F3 I Tab F5 Enter |
| settings:play | 설정 › 플레이 | 18 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · B 완료 | Esc Q E |
| settings:judge | 설정 › 판정·싱크 | 21 | ↑ ↓ 항목 · ← → 값 · Enter 열기 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · A 열기 · LB RB 탭 · B 완료 | Esc Q E |
| settings:speed | 설정 › 속도·커버 | 18 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · B 완료 | Esc Q E |
| settings:gear | 설정 › 기어 | 20 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · B 완료 | Esc Q E |
| settings:notes | 설정 › 노트 | 24 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · B 완료 | Esc Q E |
| settings:fx | 설정 › 연출·배경 | 16 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · B 완료 | Esc Q E |
| settings:sound | 설정 › 소리 | 15 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · B 완료 | Esc Q E |
| settings:keys | 설정 › 키 설정 | 140 | ↑ ↓ 모드 · ← → 레인 · Enter 바꾸기 · Q E 탭 · Esc 완료 | ↑ ↓ 모드 · ← → 레인 · A 바꾸기 · LB RB 탭 · B 완료 | Esc Q E L-Shift R-Shift Shift+↓ Shift+↑ Shift+- Shift+= |
| settings:pad | 설정 › 게임패드 | 92 | ↑ ↓ 모드 · ← → 레인 · Enter 지정 · Q E 탭 · Esc 완료 | ↑ ↓ 모드 · ← → 레인 · A 지정 · LB RB 탭 · B 완료 | Esc Q E |
| settings:advanced | 설정 › 고급 | 13 | ↑ ↓ 항목 · ← → 값 · Enter 누르기 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · A 누르기 · LB RB 탭 · B 완료 | Esc Q E |
| settings:notes@20presets | 설정 › 노트 · 내 색 프리셋 20개 | 26 | ↑ ↓ 항목 · ← → 값 · Q E 탭 · Esc 완료 | ↑ ↓ 항목 · ← → 값 · LB RB 탭 · B 완료 | Esc Q E |
| settings:keys+ghost | 설정 › 키 설정 › 동시 입력 테스트 | 0 |  |  |  |
| calibration:input | 캘리브레이션 › 판정 오프셋 측정 | 5 | Enter 시작 · Q E 단계 · Esc 돌아가기 | A 시작 · LB RB 단계 · B 돌아가기 | Esc |
| calibration:visual | 캘리브레이션 › 표시 오프셋 맞추기 | 4 | ← → 1ms · Shift ← → 5ms · Q E 단계 · Enter 저장 · Esc 돌아가기 | ← → 1ms · LB RB 단계 · A 저장 · B 돌아가기 | ← → Shift Enter Esc |
| play:loading | 로딩 | 1 |  |  | Esc D F J K |
| play:paused | 일시정지 메뉴 | 3 |  |  | ← → Shift Enter Esc R Q |
| result | 결과 | 4 | R 다시 하기 · Space 상세 · Enter 선곡으로 | X 다시 하기 · A 선곡으로 | Enter R Space |
| result:details | 결과 › 상세 | 4 | R 다시 하기 · Space 상세 닫기 · Esc 상세 닫기 · Enter 선곡으로 | X 다시 하기 · B 상세 닫기 · A 선곡으로 | Enter R Space |
| editor | 채보 에디터 | 11 | Space 재생 · T 커서부터 테스트 · ↑ ↓ 커서 · 1–8 스냅 · Ctrl Z 되돌리기 · M 미러 · Ctrl S 저장 · Esc 나가기 | Space 재생 · T 커서부터 테스트 · ↑ ↓ 커서 · 1–8 스냅 · Ctrl Z 되돌리기 · M 미러 · Ctrl S 저장 · Esc 나가기 | Esc Ctrl+S Space T D F J K 클릭 드래그 우클릭 Delete Shift Ctrl A 휠 ↑↓ Alt ← → C X V P |
| editor+menu | 채보 에디터 › 편집 메뉴 | 12 | Space 재생 · T 커서부터 테스트 · ↑ ↓ 커서 · 1–8 스냅 · Ctrl Z 되돌리기 · M 미러 · Ctrl S 저장 · Esc 메뉴 닫기 | Space 재생 · T 커서부터 테스트 · ↑ ↓ 커서 · 1–8 스냅 · Ctrl Z 되돌리기 · M 미러 · Ctrl S 저장 · Esc 메뉴 닫기 | Esc Ctrl+S Space Ctrl+Z Ctrl+Y M T D F J K 클릭 드래그 우클릭 Delete Shift Ctrl A 휠 ↑↓ Alt ← → C X V P |

## 설정과 플레이 옵션의 행

기본값은 저장된 설정이 없을 때의 값, 값 범위는 →를 눌러 가며 읽은 것, 저장은 그 행이 바꾸는 `grg.settings.v1`의 키입니다 (비어 있으면 저장되지 않는 값).

### 선곡 › 플레이 옵션 › 플레이 규칙

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 배치 | rule-placement | choice | 정배치 | 6가지: 정배치 / 미러 / 랜덤 / R-랜덤 / S-랜덤 / H-랜덤 | placement | 34 | 다음 플레이에 적용됩니다. 설정의 플레이 탭과 같은 값입니다. |
| 게이지 | rule-gauge | choice | NORMAL | 6가지: NORMAL / HARD / EX-HARD / HAZARD / ASSIST EASY / EASY | gaugeType | 85 | ASSIST EASY는 60%, EASY·NORMAL은 80%를 넘겨 끝나면 클리어. HARD·EX-HARD·HAZARD는 0%가 되는 순간 실패합니다. |
| FEVER | rule-fever | choice | 자동 | 3가지: 자동 / 수동 (Enter) / 끔 | fever | 71 | 높은 판정으로 FEVER 게이지를 채우면 점수 배율이 붙습니다. 수동이면 게이지가 찼을 때 FEVER 키(Enter)로 켭니다. |
| 페이스메이커 | rule-pacemaker | choice | 끔 | 7가지: 끔 / 내 최고 기록 / 90% / 95% / 98% / 99% / 100% | pacemaker | 42 | 플레이 중 점수판에 화면의 점수와 같은 단위로 목표와의 차이를 보여 줍니다. |
| 판정 | rule-judgement | choice | NORMAL | 3가지: NORMAL / HARD JUDGEMENT / MAX JUDGEMENT | judgementMode | 69 | HARD JUDGEMENT는 판정 범위가 절반, MAX JUDGEMENT는 4분의 1입니다. 기록에도 판정이 함께 남습니다. |
| 점수 규칙 | rule-ruleset | choice | 정밀 % | 3가지: 정밀 % / 등급형 / EX-SCORE | ruleset | 48 | 판정을 묶고 점수를 세는 방식입니다. EX-SCORE에서는 BAD에도 콤보가 끊깁니다. |
| 오토 플레이 | autoplay-toggle | switch | 끔 | 2가지: 끔 / 켬 |  | 26 | 노트를 자동으로 칩니다. 기록은 남지 않습니다. |
| 목표 레벨 | target-level | choice | 자동 | 12가지: 자동 / Lv.5 / Lv.6 / Lv.7 / Lv.8 / Lv.9 / Lv.10 / Lv.11 / Lv.12 / Lv.13 / Lv.14 / Lv.15 |  | 49 | 이 레벨에 맞춰 이 곡의 이 난이도 채보를 만듭니다. 자동이면 난이도에 맞는 레벨입니다. |
| 연습 모드 | practice-toggle | switch | 끔 | 2가지: 끔 / 켬 |  | 34 | 구간을 골라 느리게, 반복해서 칩니다. 기록은 남지 않습니다. |

### 선곡 › 플레이 옵션 › 플레이 규칙 (연습 모드 켬)

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 배치 | rule-placement | choice | 정배치 | 6가지: 정배치 / 미러 / 랜덤 / R-랜덤 / S-랜덤 / H-랜덤 | placement | 44 | 노트를 레인에 놓는 방식: 미러는 좌우를 뒤집고, 랜덤 계열은 레인을 섞습니다. |
| 게이지 | rule-gauge | choice | NORMAL | 6가지: NORMAL / HARD / EX-HARD / HAZARD / ASSIST EASY / EASY | gaugeType | 85 | ASSIST EASY는 60%, EASY·NORMAL은 80%를 넘겨 끝나면 클리어. HARD·EX-HARD·HAZARD는 0%가 되는 순간 실패합니다. |
| FEVER | rule-fever | choice | 자동 | 3가지: 자동 / 수동 (Enter) / 끔 | fever | 71 | 높은 판정으로 FEVER 게이지를 채우면 점수 배율이 붙습니다. 수동이면 게이지가 찼을 때 FEVER 키(Enter)로 켭니다. |
| 페이스메이커 | rule-pacemaker | choice | 끔 | 7가지: 끔 / 내 최고 기록 / 90% / 95% / 98% / 99% / 100% | pacemaker | 42 | 플레이 중 점수판에 화면의 점수와 같은 단위로 목표와의 차이를 보여 줍니다. |
| 판정 | rule-judgement | choice | NORMAL | 3가지: NORMAL / HARD JUDGEMENT / MAX JUDGEMENT | judgementMode | 69 | HARD JUDGEMENT는 판정 범위가 절반, MAX JUDGEMENT는 4분의 1입니다. 기록에도 판정이 함께 남습니다. |
| 점수 규칙 | rule-ruleset | choice | 정밀 % | 3가지: 정밀 % / 등급형 / EX-SCORE | ruleset | 48 | 판정을 묶고 점수를 세는 방식입니다. EX-SCORE에서는 BAD에도 콤보가 끊깁니다. |
| 오토 플레이 | autoplay-toggle | switch | 끔 | 2가지: 끔 / 켬 |  | 26 | 노트를 자동으로 칩니다. 기록은 남지 않습니다. |
| 목표 레벨 | target-level | choice | 자동 | 12가지: 자동 / Lv.5 / Lv.6 / Lv.7 / Lv.8 / Lv.9 / Lv.10 / Lv.11 / Lv.12 / Lv.13 / Lv.14 / Lv.15 |  | 49 | 이 레벨에 맞춰 이 곡의 이 난이도 채보를 만듭니다. 자동이면 난이도에 맞는 레벨입니다. |
| 연습 모드 | practice-toggle | switch | 켬 | 2가지: 켬 / 끔 |  | 34 | 구간을 골라 느리게, 반복해서 칩니다. 기록은 남지 않습니다. |
| 재생 속도 | practice-rate | number | ×1.00 | 0.5 … 1.5 (걸음 0.05, Shift 0.25) |  | 21 | 음정은 그대로 두고 빠르기만 바꿉니다. |
| 구간 반복 | practice-loop | switch | 켬 | 2가지: 켬 / 끔 |  | 82 | 구간이 끝나면 처음부터 다시 칩니다. 반복마다 RATE와 FAST·SLOW가 잠깐 나오고, Esc → 나가기로 끝내면 마지막 반복의 결과를 봅니다. |

### 선곡 › 플레이 옵션 › 속도·기어

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 노트 속도 | quick-speed | number | 4.00 | 0.5 … 10 (걸음 0.1, Shift 0.5) | hiSpeed | 12 | 노트가 내려오는 빠르기 |
| 노트 등장 위치 | quick-sudden | number | 0.0% | 0 … 0.85 (걸음 0.01, Shift 0.05) | sudden | 34 | 트랙 위쪽을 가려 노트가 나타나는 곳을 내림 (SUDDEN+) |
| 노트 사라짐 위치 | quick-hidden | number | 0.0% | 0 … 0.85 (걸음 0.01, Shift 0.05) | hidden | 37 | 판정선 바로 위를 가려 노트가 사라지는 곳을 올림 (HIDDEN+) |
| 판정선 위치 | quick-lift | number | 0% | -0.2 … 0.5 (걸음 0.01, Shift 0.05) | judgeLinePosition | 39 | 판정선을 올리거나(+) 내림(−), −20%면 기어에 붙음 (LIFT) |
| 카메라 | quick-camera | choice | SDVX | 4가지: SDVX / 강한 원근 / 평면 / 약한 원근 | cameraPreset | 16 | 트랙을 내려다보는 높이와 각도 |
| 키 빔 길이 | quick-key-beam | number | 100% | 0 … 2 (걸음 0.1, Shift 0.5) | keyBeamLength | 18 | 키를 누를 때 올라오는 빛의 길이 |

### 설정 › 플레이

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 난이도 기준 | opt-system | choice | 기본 | 3가지: 기본 / DJMAX / EZ2ON | difficultySystem, lastDifficulty | 30 | 이 게임의 5단계 (Lv.1–15)로 채보를 만듭니다. |
| 점수 규칙 | opt-ruleset | choice | 정밀 % | 3가지: 정밀 % / 등급형 / EX-SCORE | ruleset | 130 | 판정을 묶고 점수를 세는 방식입니다. EX-SCORE에서는 BAD에도 콤보가 끊깁니다. 정밀 %는 DJMAX RESPECT V, 등급형은 EZ2ON REBOOT : R, EX-SCORE는 BMS(beatoraja · LR2)식입니다. |
| 게이지 | opt-gauge | choice | NORMAL | 6가지: NORMAL / HARD / EX-HARD / HAZARD / ASSIST EASY / EASY | gaugeType | 85 | ASSIST EASY는 60%, EASY·NORMAL은 80%를 넘겨 끝나면 클리어. HARD·EX-HARD·HAZARD는 0%가 되는 순간 실패합니다. |
| FEVER | opt-fever | choice | 자동 | 3가지: 자동 / 수동 (Enter) / 끔 | fever | 111 | 높은 판정으로 FEVER 게이지를 채우면 점수 배율이 붙습니다. 수동이면 게이지가 찼을 때 FEVER 키(Enter)로 켭니다. 배율은 기본 점수와 따로 붙고, FEVER 키는 키 설정에서 바꿉니다. |
| 배치 | opt-placement | choice | 정배치 | 6가지: 정배치 / 미러 / 랜덤 / R-랜덤 / S-랜덤 / H-랜덤 | placement | 44 | 노트를 레인에 놓는 방식: 미러는 좌우를 뒤집고, 랜덤 계열은 레인을 섞습니다. |
| 페이스메이커 | opt-pacemaker | choice | 끔 | 7가지: 끔 / 내 최고 기록 / 90% / 95% / 98% / 99% / 100% | pacemaker | 151 | 플레이 중 점수판에 화면의 점수와 같은 단위로 목표와의 차이를 보여 줍니다. EX-SCORE의 목표는 A·AA·AAA·MAX입니다. 내 최고 기록은 그 판의 리플레이를 노트마다 따라가고, 리플레이가 없으면 정밀 %에서만 고르게 비교하며 다른 점수 규칙… |
| 창을 벗어나면 일시정지 | opt-pause-on-blur | switch | 켬 | 2가지: 켬 / 끔 | pauseOnBlur | 89 | 다른 창으로 옮기거나 창이 가려지면 플레이를 일시정지합니다 (오토·리플레이는 그대로 흐릅니다). 알림이나 실수로 누른 Windows 키에 판이 깨지지 않습니다. |

### 설정 › 판정·싱크

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 판정 | opt-judgement | choice | NORMAL | 3가지: NORMAL / HARD JUDGEMENT / MAX JUDGEMENT | judgementMode | 69 | HARD JUDGEMENT는 판정 범위가 절반, MAX JUDGEMENT는 4분의 1입니다. 기록에도 판정이 함께 남습니다. |
| 판정 오프셋 | opt-input-offset | number | 0ms | -200 … 200 (걸음 1, Shift 5) | inputOffsetMs | 81 | +면 늦게 치는 만큼 판정을 늦춥니다. ←→ 1ms, Shift ±5ms. 결과 화면의 제안이나 아래 '판정 오프셋 측정'으로 맞출 수 있습니다. |
| 판정 오프셋 측정 | open-calibration-settings | action | 열기 |  |  | 44 | 메트로놈 소리에 맞춰 눌러 평균 오차를 재고, 그 값을 판정 오프셋으로 씁니다. |
| 표시 오프셋 | opt-visual-offset | number | 0ms | -200 … 200 (걸음 1, Shift 5) | visualOffsetMs | 83 | +면 노트를 그만큼 일찍 그립니다 (화면 지연 보정). ←→ 1ms, Shift ±5ms. 아래 '표시 오프셋 맞추기'에서 눈으로 맞출 수 있습니다. |
| 표시 오프셋 맞추기 | open-visual-calibration-settings | action | 열기 |  |  | 58 | 메트로놈에 맞춰 내려오는 노트가 클릭 소리와 함께 판정선에 닿도록 ←→로 옮기고 Enter로 저장합니다. |
| 싱크 테스트 · 오토 | settings-sync-auto | action | 보기 |  |  | 66 | 클릭 트랙에 맞춰 노트를 오토로 칩니다. 보면서 ←→로 표시 오프셋을 옮길 수 있습니다. 끝나면 이 탭으로 돌아옵니다. |
| 싱크 테스트 · 직접 치기 | settings-sync-play | action | 시작 |  |  | 92 | 클릭 트랙에 맞춰 4K로 직접 칩니다. ←→로 표시 오프셋, Shift+←→로 판정 오프셋을 옮기고 두 값은 화면 왼쪽 위에 보입니다. 끝나면 이 탭으로 돌아옵니다. |
| 판정 ms 오차 표시 | opt-error-ms | switch | 켬 | 2가지: 켬 / 끔 | showErrorMs | 29 | 판정 아래에 몇 ms 빠르거나 늦었는지 보여 줍니다. |
| 판정 오차 막대 | opt-error-bar | switch | 끔 | 2가지: 끔 / 켬 | errorBar | 86 | 판정 아래 막대에 최근 20번 친 타이밍을 보여 줍니다. 왼쪽이 FAST, 오른쪽이 SLOW이고, 가운데 옅은 칸이 최고 판정 범위, 긴 선이 평균입니다. |
| 판정 카운터 | opt-judge-counter | switch | 끔 | 2가지: 끔 / 켬 | judgeCounter | 43 | 점수판 아래에 지금까지의 BREAK 수와 FAST·SLOW 수를 보여 줍니다. |

### 설정 › 속도·커버

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 노트 속도 | opt-hi-speed | number | 4.00 | 0.5 … 10 (걸음 0.1, Shift 0.5) | hiSpeed | 153 | 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 숫자)은 노트가 나타나서 판정선에 닿기까지의 시간으로, 이 값이 같으면 노트 속도와 커버를 바꿔도 같은 빠르기로 느껴집니다. 플레이 중 ↓ / ↑, 0.5씩은 Shift… |
| 노트 등장 위치 | opt-sudden | number | 0.0% | 0 … 0.85 (걸음 0.01, Shift 0.05) | sudden | 76 | 트랙 위쪽을 가려 노트가 나타나는 곳을 내립니다(SUDDEN+). 0%면 노트가 트랙 끝에서 나옵니다. 플레이 중 PgUp / PgDn. |
| 노트 사라짐 위치 | opt-hidden | number | 0.0% | 0 … 0.85 (걸음 0.01, Shift 0.05) | hidden | 77 | 판정선 바로 위를 가려 노트가 사라지는 곳을 올립니다(HIDDEN+). 0%면 노트가 판정선까지 보입니다. 보이는 시간은 바뀌지 않습니다. |
| 판정선 위치 | opt-lift | number | 0% | -0.2 … 0.5 (걸음 0.01, Shift 0.05) | judgeLinePosition | 105 | 판정선을 올리거나(+) 내립니다(−, LIFT). −20%면 판정선이 기어에 붙고, 올리면 기어는 제자리에 있고 그 사이를 커버가 덮습니다. 플레이 중 Alt+PgUp / Alt+PgDn. |
| 커버 사용 | opt-covers-on | switch | 켬 | 2가지: 켬 / 끔 | coversOn | 63 | 노트 등장 위치와 노트 사라짐 위치의 커버를 씁니다(판정선 위치는 그대로). 플레이 중 켜고 끄는 키: Home. |
| 보이는 시간 유지 | opt-keep-green | switch | 끔 | 2가지: 끔 / 켬 | keepVisibleTime | 67 | 노트 등장 위치나 판정선 위치를 움직여도 노트가 보이는 시간(녹색 숫자)을 그대로 둡니다 (노트 속도가 함께 바뀝니다). |
| 스크롤 | opt-scroll | choice | 시간 고정 | 2가지: 시간 고정 / BPM 연동 | scrollMode | 33 | BPM 연동은 빠른 구간에서 노트도 빨라집니다 (변속 곡). |

### 설정 › 기어

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 기어 | opt-deck-style | choice | 기본 | 9가지: 기본 / 오락실 기체 / 빈티지 리시버 / 나전칠기 / 커스텀 키보드 / 레이싱 휠 / 우주선 계기판 / 피아노 / 달 | parts.deck | 637 | 트랙을 담는 기어입니다. 판정선 아래 받침의 꾸밈, 트랙 양옆 테두리, 게이지·점수판의 모양과 숫자 글꼴이 함께 바뀝니다. 기본은 그래파이트 테에 스모크 유리와 조그 원판, 오락실 기체는 검은 플라스틱·크롬에 조이스틱·아크릴 버튼·동전 투입구, 빈티지… |
| 판정·콤보 글꼴 | opt-hud-type | choice | 기어 | 2가지: 기어 / 기본 | hudType | 310 | 판정과 콤보를 쓰는 글꼴과 색입니다. 기어를 따르면 기본은 흰 장체(MAX는 흰색, 퍼센트는 하늘색), 오락실 기체는 빨간 7세그 콤보와 굵은 이탤릭 판정, 빈티지 리시버는 호박색 7세그 콤보와 가는 장체 판정, 나전칠기는 금색 세리프, 커스텀 키보드… |
| 타격 효과 | opt-hit-style | choice | 플래시 | 9가지: 플래시 / 플레어 / 거품 / LED 그리드 / 메카 섬광 / 클럽 링 / 크리스털 파편 / 네온 아크 / 피아노 음표 | parts.hit | 184 | 노트를 치거나 롱노트를 누르고 있을 때의 효과 모양입니다. 플래시·플레어·거품·LED 그리드와 세트마다 하나(메카 섬광·클럽 링·크리스털 파편·네온 아크·피아노 음표)가 있고, 모두 판정선 위로는 짧게만 남아 내려오는 노트를 가리지 않습니다(LED 그… |
| 카메라 | opt-camera | choice | SDVX | 4가지: SDVX / 강한 원근 / 평면 / 약한 원근 | cameraPreset | 71 | 트랙을 내려다보는 높이와 각도입니다. 평면은 원근이 없어 레일이 나란하고 노트가 화면 위에서 아래까지 같은 빠르기로 내려옵니다. |
| 레인 폭 | opt-lane-width | number | 100% | 0.8 … 1.4 (걸음 0.05, Shift 0.1) | laneWidthScale | 9 | 트랙의 폭입니다. |
| 키 빔 길이 | opt-key-beam | number | 100% | 0 … 2 (걸음 0.1, Shift 0.5) | keyBeamLength | 56 | 키를 누르는 동안 판정선에서 올라오는 빛의 길이입니다. 100%가 기본이고, 0이면 켜지지 않습니다. |
| 판정 표시 위치 | opt-judge-position | choice | 보통 | 3가지: 보통 / 높게 / 낮게 | judgePosition | 29 | 판정과 콤보가 트랙 위 어느 높이에 놓일지 정합니다. |
| 판정·콤보 불투명도 | opt-judge-opacity | choice | 100% | 3가지: 100% / 70% / 40% | judgementOpacity | 58 | 판정 글자와 콤보 숫자를 얼마나 진하게 그릴지 정합니다. 낮추면 그 뒤로 지나가는 노트가 비쳐 보입니다. |
| 마디선 | bar-lines | switch | 켬 | 2가지: 켬 / 끔 | barLines | 23 | 마디마다 트랙을 가로지르는 선을 긋습니다. |

### 설정 › 노트

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 노트 | opt-note-style | choice | 기본 | 11가지: 기본 / 크롬 베벨 / 헤어라인 / 유리 / 에나멜 / 펄 / 카본 / 메카 챔퍼 / 원형 / 별 (4각) / 별 (5각) | parts.note | 285 | 노트 모양입니다. 롱노트는 고른 노트와 같은 계열(메카 챔퍼는 레일, 원형은 캡슐, 별 (4각)은 프리즘, 별 (5각)은 네온관)로 시작과 끝에 단노트 없이 몸통의 끝 모양으로 닫습니다. 메카 챔퍼·원형·별은 건반마다 표식(흰 건반 ○, 파란 건반 △… |
| 사이드 노트 | opt-side-style | choice | 기본 | 2가지: 기본 / 도트 매트릭스 | parts.side | 122 | 4K+FX·6K+FX 사이드 노트의 모양입니다. 사이드 노트는 DJMAX처럼 건반 레인의 왼쪽·오른쪽 절반을 덮습니다. 기본은 비치는 막대로, 도트 매트릭스는 LED 점으로 그려 노트의 시점에 놓인 줄이 가장 밝습니다. |
| 프리셋 | opt-color-preset | choice | 기본 | 6가지: 기본 / K/DA (POP/STARS) / K/DA (FIRESTARTER) / 오로라 / 앰버 / 좌우 손 | noteColors | 108 | 레인마다 노트 색을 정한 묶음입니다. 기본은 트랙의 기본 색이고, 나머지는 게임에 든 프리셋과 내 프리셋입니다. 기본이나 게임에 든 프리셋의 색을 바꾸면 그 색을 복사한 내 프리셋에 저장합니다. |
| 키 모드 | opt-color-mode | choice | 4K | 7가지: 4K / 4K+FX / 5K / 6K / 6K+FX / 7K+1S / 8K |  | 71 | 어느 키 모드의 레인 색을 볼지 고릅니다. 프리셋은 키 모드마다 레인 색을 따로 가지고, 미리보기도 이 키 모드로 보여 줍니다. |
| 색상 | opt-color-hue | number | 206° | 251 … 26 (걸음 1, Shift 15) | colorPresets, noteColors | 50 | 고른 레인 색의 색상(0–359°)입니다. Shift를 누르고 바꾸면 15°씩 움직입니다. |
| 채도 | opt-color-saturation | number | 8% | 0 … 100 (걸음 1, Shift 10) | colorPresets, noteColors | 55 | 0%는 흰색·회색, 100%는 가장 진한 색입니다. Shift를 누르고 바꾸면 10%씩 움직입니다. |
| 밝기 | opt-color-value | number | 100% | 0 … 100 (걸음 undefined, Shift 10) |  | 45 | 낮을수록 어두운 색입니다. 트랙이 어두워 밝기가 낮은 노트는 잘 보이지 않습니다. |

### 설정 › 연출·배경

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 카메라 연출 | camera-fx | number | 60% | 0 … 1 (걸음 0.1, Shift 0.5) | cameraFx | 45 | 드롭·후렴에서 트랙이 기울고 줌합니다 (SDVX식). 판정선은 제자리에 있습니다. |
| 타격 효과 크기 | opt-hit-effect | choice | 보통 | 4가지: 보통 / 작게 / 끄기 / 크게 | hitEffectSize | 155 | 노트를 치거나 롱노트를 누르고 있을 때 판정선에 번지는 빛입니다. 크게는 보통의 1.4배로 그리고(레일 밖으로는 나가지 않음, 반쪽 덮기의 사이드 노트는 절반 폭 그대로 더 높게), 작게는 한 레인 남짓으로 줄이고(사이드 노트는 절반 폭 그대로 낮게)… |
| 번쩍임 줄이기 | opt-reduced-flash | switch | 끔 | 2가지: 끔 / 켬 | reducedFlash | 68 | 타격 효과·FEVER·카메라 연출을 약하게 하고, 기어의 불빛과 판정선의 일렁임은 깜빡이지 않고 천천히 오르내리게 합니다. |
| 배경 밝기 | opt-bg-brightness | number | 35% | 0 … 1 (걸음 0.05, Shift 0.25) | bgBrightness | 23 | 플레이 배경(곡 그림·영상)의 밝기입니다. |
| 배경 영상 (BGA) | opt-bga | switch | 켬 | 2가지: 켬 / 끔 | bga | 20 | 곡에 등록한 배경 영상을 재생합니다. |

### 설정 › 소리

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 음악 | opt-music-volume | number | 90% | 0 … 1 (걸음 0.05, Shift 0.25) | musicVolume | 13 | 곡과 키음의 크기입니다. |
| 효과음 | opt-sfx-volume | number | 60% | 0 … 1 (걸음 0.05, Shift 0.25) | sfxVolume | 11 | 타격음의 크기입니다. |
| 타격음 | opt-hit-sound | switch | 끔 | 2가지: 끔 / 켬 | hitSound | 19 | 키를 누를 때 짧은 소리를 냅니다. |
| 키음 | keysound-toggle | switch | 켬 | 2가지: 켬 / 끔 | keysound | 81 | 생성 채보의 노트마다 그 노트가 따라가는 악기 소리를 붙여, 치면 그 소리가 나고 놓치면 빠집니다 (가져온 BMS·bmson은 항상 원래 키음). |

### 설정 › 게임패드

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 턴테이블 감도 | opt-tt-steps | number | 1칸 | 1 … 4 (걸음 1, Shift 1) | turntableSteps | 88 | 멈춰 있던 턴테이블이 이만큼(축 한 칸 단위) 돌면 스크래치로 칩니다. 1칸이 가장 예민하고, 손대지 않아도 스크래치가 들어가는 기기는 2–3칸으로 올리세요. |
| 턴테이블 정지 판정 | opt-tt-release | number | 120ms | 40 … 300 (걸음 10, Shift 50) | turntableReleaseMs | 81 | 턴테이블이 이 시간 동안 멈춰 있으면 스크래치를 뗍니다. 짧으면 천천히 돌릴 때 끊기고, 길면 같은 방향의 다음 스크래치가 앞의 것에 이어집니다. |

### 설정 › 고급

| 이름 | testid | 종류 | 기본값 | 값 범위 | 저장 | 도움말 글자 수 | 도움말 |
|---|---|---|---|---|---|---|---|
| 화면 모드 | opt-display-mode | choice | 창 | 2가지: 창 / 전체 화면 | displayMode | 71 | 전체 화면은 브라우저 테두리 없이 게임만 보여 줍니다. 나가려면 Esc를 길게 누르세요 (F11은 브라우저의 전체 화면입니다). |

## 두 곳에 있는 설정

| 저장 키 | 있는 곳 | 이름 | 도움말이 같은가 |
|---|---|---|---|
| placement | select+options:rules · select+options:rules+practice · settings:play | 배치 | 다름 |
| gaugeType | select+options:rules · select+options:rules+practice · settings:play | 게이지 | 같음 |
| fever | select+options:rules · select+options:rules+practice · settings:play | FEVER | 다름 |
| pacemaker | select+options:rules · select+options:rules+practice · settings:play | 페이스메이커 | 다름 |
| judgementMode | select+options:rules · select+options:rules+practice · settings:judge | 판정 | 같음 |
| ruleset | select+options:rules · select+options:rules+practice · settings:play | 점수 규칙 | 다름 |
| hiSpeed | select+options:gear · settings:speed | 노트 속도 | 다름 |
| sudden | select+options:gear · settings:speed | 노트 등장 위치 | 다름 |
| hidden | select+options:gear · settings:speed | 노트 사라짐 위치 | 다름 |
| judgeLinePosition | select+options:gear · settings:speed | 판정선 위치 | 다름 |
| cameraPreset | select+options:gear · settings:gear | 카메라 | 다름 |
| keyBeamLength | select+options:gear · settings:gear | 키 빔 길이 | 다름 |

## 행이 없는 저장 키

옵션 행이 아닌 다른 방법(키 지정, 목록의 키, 곡마다의 값)으로 바뀌거나, 더는 쓰지 않는 값입니다.

`bindings`, `secondBindings`, `padBindings`, `playKeys`, `padPlay`, `padMenu`, `songOffsets`, `patterns`, `chartPicks`, `lastKeyMode`, `generation`, `sideNotes`, `visualizer`, `favorites`, `songFolder`, `songSort`
