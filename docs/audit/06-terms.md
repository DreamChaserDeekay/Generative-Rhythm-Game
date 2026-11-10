# 용어 표

화면 문구는 `data/inventory.json`(모든 상태의 글자와 옵션 행의 도움말)에서 가져왔습니다. 어떤 말들이 같은 개념인지는 그 문구를 읽고 정한 것이고(아래 표의 "이름"과 "뜻" 열), 횟수와 화면은 센 것입니다.

## 같은 개념에 다른 이름

### 이 화면·패널을 떠나기 (Esc · B): 이름 6가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 닫기 | 24 | select, result:details, editor | 닫기 / 플레이 옵션 닫기 / 곡 정보·도구 닫기 |
| 완료 | 20 | settings:play, settings:judge, settings:speed, settings:gear, settings:notes, settings:fx, settings:sound, settings:keys, settings:pad, settings:advanced | 완료 |
| 돌아가기 | 4 | calibration:input, calibration:visual | 돌아가기 |
| 나가기 | 4 | play:paused, editor | 나가기 / ← 나가기 |
| 취소 | 1 | play:loading | 취소 |
| 선곡으로 | 4 | result, result:details | 선곡으로 |

### 처음 값으로 되돌리기: 이름 6가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 기본값 | 9 | settings:keys, settings:pad | 기본값 |
| 초기화 | 3 | select, settings:advanced | 초기화 |
| 모두 초기화 | 1 | settings:advanced | 모두 초기화 |
| 생성 옵션 초기화 | 1 | select | 생성 옵션 초기화 |
| 레인에서 정하기 | 1 | settings:pad | 레인에서 정하기 |
| 지우기 (패드 레인) | 7 | settings:pad | 지우기 |

### Enter · A로 하는 일의 이름 (힌트 바): 이름 6가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 누르기 | 4 | select, settings:advanced | 누르기 |
| 고르기 | 1 | select | 고르기 |
| 바꾸기 | 1 | settings:keys | 바꾸기 |
| 지정 | 1 | settings:pad | 지정 |
| 열기 | 1 | settings:judge | 열기 |
| 시작 | 1 | calibration:input | 시작 |

### 노트가 내려오는 빠르기: 이름 4가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 노트 속도 | 32 | select, settings:speed, settings:keys, settings:pad, play:loading | 노트 속도 / 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … / 노트 속도 −0.5·노트 속도 +0.5·곡 오프셋 −5ms·곡 오프셋 +5ms |
| SPEED | 2 | settings:speed | 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … |
| 배속 | 2 | settings:speed | 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … |
| 빠르기 | 6 | select, settings:speed, settings:gear | 노트가 내려오는 빠르기 / 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … / 음정은 그대로 두고 빠르기만 바꿉니다. |

### 노트가 보이는 시간: 이름 2가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 보이는 시간 | 11 | select, settings:speed, settings:gear, settings:notes, settings:fx | 보이는 시간 / 보이는 시간 유지 / 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … |
| 녹색 숫자 | 8 | select, settings:speed, settings:gear, settings:notes, settings:fx | 노트가 나타나서 판정선에 닿기까지의 시간 (녹색 숫자) / 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … / 노트 등장 위치나 판정선 위치를 움직여도 노트가 보이는 시간(녹색 숫자)을 그대로 … |

### 트랙 위쪽 가리개: 이름 3가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 노트 등장 위치 | 9 | select, settings:speed, settings:keys, settings:pad | 노트 등장 위치 / 노트 등장 위치 − / 노트 등장 위치 + |
| SUDDEN+ | 2 | select, settings:speed | 트랙 위쪽을 가려 노트가 나타나는 곳을 내림 (SUDDEN+) / 트랙 위쪽을 가려 노트가 나타나는 곳을 내립니다(SUDDEN+). 0%면 노트가 트… |
| 커버 | 7 | settings:speed, settings:keys | 커버 사용 / 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … / 커버 켜기·끄기 |

### 치는 타이밍의 보정값: 이름 2가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 판정 오프셋 | 16 | select, settings:judge, calibration:input, calibration:visual | 판정 오프셋 측정 / 같은 테스트를 직접 칩니다. 치는 동안 표시·판정 오프셋을 키로 옮길 수 있고, 그… / 판정 오프셋 |
| 입력 … 지연 보정 | 1 | settings:judge | 판정 기준과 입력·화면 지연 보정 |

### 그리는 타이밍의 보정값: 이름 2가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 표시 오프셋 | 15 | select, settings:judge, calibration:input, calibration:visual | 표시 오프셋 맞추기 / 박자에 맞춰 노트가 내려오는 테스트를 오토로 봅니다 (←→ 표시 오프셋) / 표시 오프셋 |
| 화면 지연 보정 | 2 | settings:judge | 판정 기준과 입력·화면 지연 보정 / +면 노트를 그만큼 일찍 그립니다 (화면 지연 보정). ←→ 1ms, Shift ±… |

### 키를 누를 때 나는 소리: 이름 2가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 타격음 | 5 | settings:sound, editor | 타격음 / 타격음의 크기입니다. |
| 효과음 | 3 | settings:sound | 음악과 효과음 / 효과음 |

### 곡의 배경 영상: 이름 3가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 배경 영상 | 5 | select, settings:fx | 배경 영상 / 배경 영상 (BGA) / 곡에 등록한 배경 영상을 재생합니다. |
| BGA | 2 | settings:fx | 배경 영상 (BGA) |
| 영상 (단독) | 2 | select | 영상 고르기 (mp4·webm) |

### 노트를 자동으로 치기: 이름 3가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 오토 플레이 | 14 | select | 오토 플레이 |
| 오토 (단독) | 5 | select, settings:judge, settings:play | 박자에 맞춰 노트가 내려오는 테스트를 오토로 봅니다 (←→ 표시 오프셋) / 싱크 테스트 · 오토 / 다른 창으로 옮기거나 창이 가려지면 플레이를 일시정지합니다 (오토·리플레이는 그대로… |
| 자동으로 칩니다 | 5 | select | 이번 판만 노트를 자동으로 칩니다(Shift+Enter). 기록은 남지 않습니다 / 노트를 자동으로 칩니다. 기록은 남지 않습니다. |

### 클릭 트랙 자동 테스트: 이름 2가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 싱크 테스트 | 3 | select, result | 싱크 테스트 |
| 싱크 테스트 · 오토 | 1 | settings:judge | 싱크 테스트 · 오토 |

### 곡 정보 패널: 이름 2가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 곡 정보·도구 | 13 | select | 곡 정보·도구 / 곡 정보·도구 닫기 |
| 정보·도구 | 3 | select | 정보·도구 |

### 패드: 이름 3가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 게임패드 | 12 | settings:play, settings:judge, settings:speed, settings:gear, settings:notes, settings:fx, settings:sound, settings:keys, settings:pad, settings:advanced | 게임패드 |
| 패드 | 5 | settings:pad | 연결된 패드가 없습니다. 패드의 버튼을 하나 누르면 나타납니다. / 메뉴 버튼 (표준 배치가 아닌 패드) / 전용 컨트롤러처럼 표준 배치가 아닌 패드는 아래 버튼으로 메뉴를 다닙니다. 지정하지… |
| 컨트롤러 | 2 | settings:pad | 레인, 플레이 중 버튼, 전용 컨트롤러의 메뉴 버튼 / 전용 컨트롤러처럼 표준 배치가 아닌 패드는 아래 버튼으로 메뉴를 다닙니다. 지정하지… |

### 노트가 내려오는 줄: 이름 2가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 레인 | 62 | select, settings:gear, settings:notes, settings:keys, settings:pad, editor, settings:play, settings:fx | 악기별 레인 / 구간 안에서 루프(1·2·4마디)가 되풀이될 때, 같은 박의 노트가 같은 레인에 놓… / 반복 구간(같은 후렴 등)에서 첫 등장과 같은 레인 패턴(또는 좌우 반전)을 쓴 비… |
| 건반 | 4 | settings:pad, settings:gear, settings:notes | 전용 컨트롤러처럼 표준 배치가 아닌 패드는 아래 버튼으로 메뉴를 다닙니다. 지정하지… / 트랙을 담는 기어입니다. 판정선 아래 받침의 꾸밈, 트랙 양옆 테두리, 게이지·점수… / 노트 모양입니다. 롱노트는 고른 노트와 같은 계열(메카 챔퍼는 레일, 원형은 캡슐,… |

### 입력이 들어오는지 보는 도구: 이름 2가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 동시 입력 테스트 | 7 | settings:keys | 동시 입력 테스트 |
| 입력 확인 | 7 | settings:pad | 입력 확인 |

### 곡 넣기: 이름 3가지

| 이름 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 곡 추가 | 13 | select | 곡 추가 |
| 음악 파일 고르기 | 1 | select | 음악 파일 고르기 |
| 음악 파일 | 1 | select | 음악 파일 |

## 다른 개념에 같은 이름

### "배치": 뜻 4가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 노트를 레인에 놓는 규칙 (정배치·미러·랜덤) | 27 | select, settings:play | 배치 / 정배치 |
| 채보를 만드는 엔진 | 1 | select | 패턴 배치 |
| 키보드 키의 배열 | 1 | settings:keys | BMS 배치 |
| 패드의 버튼 배열 | 3 | settings:pad | 메뉴 버튼 (표준 배치가 아닌 패드) / 전용 컨트롤러처럼 표준 배치가 아닌 패드는 아래 버튼으로 메뉴를 다닙니다. 지정하지… / 표준 배치 패드는 메뉴에서 십자키·왼쪽 스틱이 방향키, A·Start가 Enter,… |

### "구간": 뜻 3가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 연습할 범위 | 12 | select | 구간 / 구간 반복 / 구간을 골라 느리게, 반복해서 칩니다. 기록은 남지 않습니다. |
| 곡의 구조 (인트로·후렴) | 7 | select | 구간 고르기 / "구간·루프"는 곡의 구간과 1·2·4마디 루프를 먼저 찾아, 같은 음악에는 같은 … / 자동 분석 |
| 같은 패턴을 쓰는 반복 | 3 | select | 반복 구간 / 반복 구간(같은 후렴 등)에서 첫 등장과 같은 레인 패턴(또는 좌우 반전)을 쓴 비… |

### "패턴": 뜻 3가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 같은 난이도의 다른 채보 (시드) | 20 | select | 새 패턴 / 같은 난이도로 다른 패턴을 만듭니다. 이 난이도는 앞으로 그 패턴으로 칩니다 / 패턴 |
| 노트 모양의 종류 (스트림·트릴) | 6 | select | 루프 패턴 일치 / 반복 패턴 일치 / 반복 구간(같은 후렴 등)에서 첫 등장과 같은 레인 패턴(또는 좌우 반전)을 쓴 비… |
| 채보를 만드는 엔진 | 3 | select | 패턴 배치 / 악구·패턴 / "구간·루프"는 곡의 구간과 1·2·4마디 루프를 먼저 찾아, 같은 음악에는 같은 … |

### "판정": 뜻 4가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 판정 범위의 모드 (NORMAL·HARD·MAX) | 9 | select, settings:judge | 판정 / HARD JUDGEMENT는 판정 범위가 절반, MAX JUDGEMENT는 4분의 … |
| 치고 나서 뜨는 글자 | 9 | settings:gear | 판정·콤보 글꼴 / 판정 표시 위치 / 판정·콤보 불투명도 |
| 타이밍 보정 | 16 | select, settings:judge, calibration:input, calibration:visual | 판정 오프셋 측정 / 같은 테스트를 직접 칩니다. 치는 동안 표시·판정 오프셋을 키로 옮길 수 있고, 그… / 판정 오프셋 |
| 판정선 | 28 | select, settings:speed, settings:gear, settings:notes, settings:fx, settings:keys, calibration:visual, settings:judge | 판정선 위치 / 노트가 나타나서 판정선에 닿기까지의 시간 (녹색 숫자) / 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … |

### "기어": 뜻 2가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 트랙을 담는 틀 (꾸미기) | 19 | settings:play, settings:judge, settings:speed, settings:gear, settings:notes, settings:fx, settings:sound, settings:keys, settings:pad, settings:advanced, select | 기어 / 판정선을 올리거나(+) 내림(−), −20%면 기어에 붙음 (LIFT) / 판정선을 올리거나(+) 내립니다(−, LIFT). −20%면 판정선이 기어에 붙고,… |
| 플레이 옵션의 탭 "속도·기어" | 4 | select | 속도·기어 |

### "커버": 뜻 2가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 트랙을 가리는 가리개 | 17 | settings:play, settings:judge, settings:speed, settings:gear, settings:notes, settings:fx, settings:sound, settings:keys, settings:pad, settings:advanced | 속도·커버 / 커버 사용 / 커버 켜기·끄기 |
| 곡의 그림 | 4 | select | 커버 / 커버 이미지 고르기 |

### "기본": 뜻 2가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 선택지의 이름 (기어·노트·사이드 노트·프리셋·글꼴·난이도 기준) | 14 | select, settings:play, settings:gear, settings:notes | 기본 |
| 처음 값으로 되돌리는 버튼 | 9 | settings:keys, settings:pad | 기본값 |

### "자동": 뜻 3가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| FEVER가 저절로 켜짐 | 20 | select, settings:play | 자동 |
| 생성기가 정하는 값 | 2 | select | 이 레벨에 맞춰 이 곡의 이 난이도 채보를 만듭니다. 자동이면 난이도에 맞는 레벨입… |
| 분석이 정한 값 | 2 | select | 자동 분석 |

### "키": 뜻 4가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 키보드의 키 | 77 | settings:play, settings:judge, settings:speed, settings:gear, settings:notes, settings:fx, settings:sound, settings:keys, settings:pad, settings:advanced, calibration:input | 키 설정 / 레인의 키와 플레이 중 키 / 보조 키 |
| 키 모드 (4K·6K) | 8 | select, settings:notes | 키 모드 / 어느 키 모드의 레인 색을 볼지 고릅니다. 프리셋은 키 모드마다 레인 색을 따로 가… |
| 노트에 붙는 소리 | 9 | select, settings:sound, play:loading | 노트가 따라가는 악기(스템) 비율 · 밑줄은 키음이 나는 악기 / BMS · bmson 폴더 (키음 포함) / BMS·bmson 폴더(키음 포함) |
| 누를 때 올라오는 빛 | 4 | select, settings:gear | 키 빔 길이 |

### "플레이": 뜻 4가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 한 판을 시작 | 27 | select, settings:play, settings:judge, settings:speed, settings:gear, settings:notes, settings:fx, settings:sound, settings:keys, settings:pad, settings:advanced | 플레이 |
| 설정의 탭 "플레이" | 2 | select | 다음 플레이에 적용됩니다. 설정의 플레이 탭과 같은 값입니다. |
| 선곡의 패널 "플레이 옵션" | 30 | select, settings:pad | 플레이 옵션 / 플레이 옵션 닫기 / 전용 컨트롤러처럼 표준 배치가 아닌 패드는 아래 버튼으로 메뉴를 다닙니다. 지정하지… |
| 그 안의 탭 "플레이 규칙" | 4 | select | 플레이 규칙 |

### "오프셋": 뜻 3가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 모든 곡의 판정 보정 | 16 | select, settings:judge, calibration:input, calibration:visual | 판정 오프셋 측정 / 같은 테스트를 직접 칩니다. 치는 동안 표시·판정 오프셋을 키로 옮길 수 있고, 그… / 판정 오프셋 |
| 모든 곡의 표시 보정 | 15 | select, settings:judge, calibration:input, calibration:visual | 표시 오프셋 맞추기 / 박자에 맞춰 노트가 내려오는 테스트를 오토로 봅니다 (←→ 표시 오프셋) / 표시 오프셋 |
| 이 곡만의 보정 | 18 | select, settings:keys | 곡 오프셋 / 마디선과 채보가 음악의 박과 어긋나 보일 때 분석한 박을 옮깁니다. 곡을 다시 분석… / 노트 속도 −0.5·노트 속도 +0.5·곡 오프셋 −5ms·곡 오프셋 +5ms |

### "속도": 뜻 2가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 노트가 내려오는 빠르기 | 32 | select, settings:speed, settings:keys, settings:pad, play:loading | 노트 속도 / 노트가 내려오는 빠르기입니다(SPEED, 배속). 미리보기의 '보이는 시간'(녹색 … / 노트 속도 −0.5·노트 속도 +0.5·곡 오프셋 −5ms·곡 오프셋 +5ms |
| 연습의 재생 빠르기 | 2 | select | 재생 속도 |

### "밝기": 뜻 2가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 플레이 배경 | 3 | settings:fx | 배경 밝기 / 플레이 배경(곡 그림·영상)의 밝기입니다. |
| 노트 색 | 2 | settings:notes | 밝기 |

### "효과": 뜻 2가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 노트를 칠 때의 그림 | 9 | settings:gear, settings:fx, settings:notes | 타격 효과 / 카메라 연출, 타격 효과와 플레이 배경 / 타격 효과 크기 |
| 소리 | 3 | settings:sound | 음악과 효과음 / 효과음 |

### "노트": 뜻 2가지

| 뜻 | 나온 횟수 | 화면 | 보기 |
|---|---|---|---|
| 설정의 탭 "노트" (모양·색) | 20 | select, settings:play, settings:judge, settings:speed, settings:gear, settings:notes, settings:fx, settings:sound, settings:keys, settings:pad, settings:advanced, editor | 노트 |
| 채보의 노트 수 | 15 | select | 50 노트 / 85 노트 / 132 노트 |

## 풀이 없이 쓰는 장르 용어 (이름·버튼·제목에 나온 것)

`BPM` · `EASY` · `NORMAL` · `HARD` · `EXPERT` · `MASTER` · `FEVER` · `평균 / 최대 NPS` · `BPM 보정` · `합성한 128 BPM 곡` · `BMS · bmson 폴더 (키음 포함)` · `배경 영상 (BGA)` · `BMS 배치` · `RATE` · `MAX 100%` · `MAX 90–80%` · `MAX 70–40%` · `MAX 30–1%` · `BREAK` · `밀도 · BREAK · 타이밍` · `MAX 100% ±41.7ms` · `DJMAX % 판정`
