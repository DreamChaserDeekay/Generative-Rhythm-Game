# 기어 하단 그림 (`media/panels/`, `media/gears/fire/crests.png`)

스킨 13종의 기어 하단(키 줄 아래)에 까는 그림과, 파이어스타터 키캡의 문장 그림입니다. 하단 그림은 모두 이미지 모델(Gemini)이 이 게임의 화면 위에 새로 그린 것이지만, 아래처럼 다른 곳의 그림이나 로고를 기준으로 삼았거나 그대로 옮긴 부분이 있습니다. 사용자가 혼자 즐기려고 만드는 비상업 팬 프로젝트에 사용자의 결정으로 넣었고(2026-11-12 ~ 13), 아래의 권리자들은 이 프로젝트와 관계가 없으며 이 프로젝트를 승인하거나 후원하지 않습니다. 권리자가 원하면 내립니다.

그림마다 무엇을 보냈고 어떻게 만들었는지는 `assets-src/gears/panels/<gear>.json`(프롬프트 전문 포함)과 `assets-src/PROVENANCE.md`에 있습니다.

## 파이어스타터 (`panels/fire.webp`, `gears/fire/crests.png`)

- 하단 그림: League of Legends의 K/DA FIRESTARTER 홍보 그림 두 장(콘서트 장면과 표지, Riot Games)을 기준 그림으로 이미지 모델에 보내, 네 멤버의 실루엣과 FIRESTARTER 글자가 있는 무대를 새로 그리게 한 것입니다.
- 키캡의 문장 넷: 같은 스킨의 공식 문장 그림(Riot Games)에서 네 멤버(아리 · 아칼리 · 이블린 · 카이사)의 문장을 잘라, 크롬 키캡 위에서 읽히도록 검은 크롬으로 다시 칠한 것입니다.
- 받은 곳: League of Legends 위키(wiki.leagueoflegends.com).
- Generative Rhythm was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

## GPT · Gemini · Grok · Claude

- `panels/gpt.webp`: OpenAI의 로고를 입체로 옮긴 것과 RESET 버튼(이미지 모델이 그림).
- `panels/gemini.webp`: Google Gemini의 스파크와 워드마크를 입체로 옮긴 것. 왕관과 바나나는 이미지 모델이 그렸습니다.
- `panels/grok.webp`: xAI Grok의 마크, Grok Bot(사용자가 올린 X의 프로필 그림에서 치수를 재어 다시 그림), X 로고와 SpaceX 로고(Wikimedia Commons의 `X_logo_2023.svg`, `SpaceX-Logo.svg`). 로켓과 시바견(도지 밈)은 이미지 모델이 그렸습니다.
- `panels/claude.webp`: Anthropic Claude의 스파크, Claude Code 아이콘의 캐릭터(Clawd), 그리고 자전거를 탄 펠리컨. 펠리컨은 Simon Willison's Weblog의 2026-11-09 글 "llm-anthropic 0.31"(https://simonwillison.net/2026/Nov/9/llm-anthropic/)에 실린 SVG에서 배경을 떼어 옮겼습니다. "Claude" 손글씨는 이미지 모델이 새로 썼습니다(공식 손글씨 워드마크가 아닙니다).
- 회사 로고의 모양은 공개 아이콘 꾸러미 `@lobehub/icons-static-svg`에서 받았습니다. 로고와 이름은 각 회사의 상표입니다.

## 크리스털 · 하늘 · 아쿠아 · 스틸 · 레드라인 · 화이트 라인 · 별밤

- 사용자가 스킨마다 올린 레퍼런스 그림 한 장을 디자인 기준으로 이미지 모델에 보냈습니다(사용자의 요청: "레퍼런스랑 최대한 비슷한 컨셉이면 좋겠어", 그림을 보내도 된다는 허락). 레퍼런스 그림은 다른 리듬 게임의 플레이 화면으로 보이며, 어디의 그림인지는 받지 못했습니다.
- 레퍼런스의 글자 · 숫자 · 로고는 옮기지 않았고, 배치는 이 게임의 하단 모양에 맞춰 새로 그렸습니다. 레퍼런스 그림은 저장소에 없습니다.

## 기본

- 다른 곳의 그림을 쓰지 않았습니다. 이 게임의 화면만 보냈습니다.
