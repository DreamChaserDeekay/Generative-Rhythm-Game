# 난이도 다섯 단계: EASY · NORMAL · HARD · EXPERT · ELITE (전후)

2026-11-19 난이도가 NORMAL 1–4 · HARD 5–8 · EXPERT 9–12 · ELITE 13–16 · MASTER 17–20에서 EASY 1–5 · NORMAL 6–10 · HARD 11–14 · EXPERT 15–18 · ELITE 19–20으로 바뀌었다(`claude/tiers-v2`).

| 난이도 | 색 | 약칭 |
|---|---|---|
| EASY | #5fe08a 초록(새로) | EZ |
| NORMAL | #4fc3ff 하늘 | NM |
| HARD | #ffc94f 노랑 | HD |
| EXPERT | #ff6f8a 빨강 | EX |
| ELITE | #c58bff 보라(예전 MASTER의 색) | EL |

예전 ELITE의 분홍(#ff5fd2)은 쓰지 않는다. 빨강(EXPERT)과 보라(ELITE) 사이에 있던 색이라, 빼고 나니 이웃한 색끼리의 차이가 커졌다.

- `compare.png`: 왼쪽이 develop(f2c28ef), 오른쪽이 이 브랜치. 위는 곡 선택의 난이도 판 줄(단계마다 하나씩 고름), 아래는 플레이 HUD의 난이도 표시와 결과 화면의 난이도 판.
- `before/`, `after/`: 단계마다 고른 곡 선택 화면 전체.
- 찍은 방법: 이 환경에는 GPU가 없어 채보를 만들 수 없으므로, 합성 데모 곡에 테스트가 만든 4K 채보(노트 20개)를 서버 응답으로 흉내 내 주고 자동 플레이했다. 레벨 숫자는 각 단계 구간 안의 예시 값이다.
