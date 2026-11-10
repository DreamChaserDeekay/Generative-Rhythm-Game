# 좁은 창과 접근성 측정

`client/audit/layout.audit.ts`: 모든 상태를 최소 창(960×600, 데스크톱 앱의 최소 크기)과 기본 창(1280×720)에서 쟀습니다. 원본: `data/layout.json`.

| 창 | 상태 | 잘린 글자 | 창 밖 글자 | 닿지 않는 항목 | 24px 미만 대상 | 대비 미달 | 12px 미만 글자 | 숨은 힌트 | 포커스 표시 없음 |
|---|---|---|---|---|---|---|---|---|---|
| min | select | 5 | 1 | 0 | 0 | 0 | 0 | 4 | 0 |
| min | select+options:rules | 3 | 0 | 3 | 0 | 0 | 0 | 1 | 31 |
| min | select+options:rules+practice | 3 | 0 | 8 | 0 | 0 | 0 | 1 | 34 |
| min | select+options:gear | 3 | 0 | 2 | 0 | 0 | 0 | 1 | 31 |
| min | select+options:generation | 3 | 0 | 6 | 5 | 0 | 0 | 1 | 52 |
| min | select+info | 2 | 0 | 2 | 0 | 0 | 0 | 1 | 50 |
| min | select+info+sections | 2 | 0 | 4 | 0 | 0 | 0 | 0 | 54 |
| min | select+add | 5 | 1 | 6 | 0 | 0 | 0 | 3 | 36 |
| min | select+search | 5 | 1 | 0 | 0 | 0 | 0 | 4 | 0 |
| min | select+emptyfolder | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| min | select+first | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | select+offline | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | select@500 | 503 | 0 | 1 | 1 | 0 | 0 | 4 | 0 |
| min | settings:play | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| min | settings:judge | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 11 |
| min | settings:speed | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 11 |
| min | settings:gear | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 11 |
| min | settings:notes | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 16 |
| min | settings:fx | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 11 |
| min | settings:sound | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| min | settings:keys | 0 | 0 | 19 | 0 | 0 | 0 | 0 | 140 |
| min | settings:pad | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 90 |
| min | settings:advanced | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| min | settings:notes@20presets | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 17 |
| min | settings:keys+ghost | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | calibration:input | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 5 |
| min | calibration:visual | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| min | play:loading | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| min | play:paused | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| min | result | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 4 |
| min | result:details | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| min | editor | 0 | 0 | 0 | 2 | 0 | 0 | 2 | 9 |
| min | editor+menu | 0 | 6 | 0 | 2 | 0 | 0 | 2 | 10 |
| base | select | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| base | select+options:rules | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 31 |
| base | select+options:rules+practice | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 34 |
| base | select+options:gear | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 31 |
| base | select+options:generation | 0 | 0 | 5 | 5 | 0 | 0 | 0 | 52 |
| base | select+info | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 50 |
| base | select+info+sections | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 54 |
| base | select+add | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 38 |
| base | select+search | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| base | select+emptyfolder | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| base | select+first | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select+offline | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select@500 | 0 | 2 | 2 | 1 | 0 | 0 | 0 | 0 |
| base | settings:play | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| base | settings:judge | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| base | settings:speed | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| base | settings:gear | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| base | settings:notes | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 16 |
| base | settings:fx | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| base | settings:sound | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| base | settings:keys | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 140 |
| base | settings:pad | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 90 |
| base | settings:advanced | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 |
| base | settings:notes@20presets | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 17 |
| base | settings:keys+ghost | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | calibration:input | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| base | calibration:visual | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| base | play:loading | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| base | play:paused | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| base | result | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| base | result:details | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| base | editor | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 9 |
| base | editor+menu | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 10 |

## 잘린 글자

| 창 | 상태 | 건수 | 어디 | 글자 | 보이는 폭/필요한 폭 | 말줄임 | title |
|---|---|---|---|---|---|---|---|
| min | select, select+options:rules, select+options:rules+practice 외 6 | 9 | song-item>span.song-title | Demo Groove 128 | 81/133 | … | 없음 |
| min | select, select+options:rules, select+options:rules+practice 외 6 | 9 | song-item>span.song-sub | Generative Rhythm (합성 데모) | 81/178 | … | 없음 |
| min | select, select+add, select+search 외 1 | 4 | difficulty-row>span.diff-name | NORMAL | 49/63 | … | 있음 |
| min | select, select+add, select+search 외 1 | 4 | difficulty-row>span.diff-name | EXPERT | 53/60 | … | 있음 |
| min | select, select+add, select+search 외 1 | 4 | difficulty-row>span.diff-name | MASTER | 49/61 | … | 있음 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 1 | 4 | song-title>span.panel-song | Demo Groove 128 | 0/131 | … | 있음 |
| min | select@500 | 500 | song-item>span.song-title | 가짜 곡 001 · 제목이 꽤 긴 곡의 이름입니다 | 199/270 | … | 없음 |

## 창 밖으로 나간 글자 (스크롤로도 못 봄)

| 창 | 상태 | 건수 | 어디 | 글자 | 자리 |
|---|---|---|---|---|---|
| min | select, select+add, select+search | 3 | difficulty-row>em | 242 노트 | 915,393,966,412 |
| min | editor+menu | 1 | editor-undo>button | 되돌리기 Ctrl+Z | 797,113,987,153 |
| min | editor+menu | 1 | editor-undo>kbd | Ctrl+Z | 924,122,974,144 |
| min | editor+menu | 1 | editor-redo>button | 다시 Ctrl+Y | 797,153,987,193 |
| min | editor+menu | 1 | editor-redo>kbd | Ctrl+Y | 924,162,974,184 |
| min | editor+menu | 1 | editor-mirror>button | 미러 M | 797,193,987,233 |
| min | editor+menu | 1 | editor-mirror>kbd | M | 950,202,974,224 |
| base | select, select+search, select@500 | 3 | hint-favorite>button.hint-item.minor | F3즐겨찾기 | 16,729,113,761 |
| base | select, select+search, select@500 | 3 | hint-favorite>kbd | F3 | 25,734,51,756 |

## 가려지거나 창 밖에 있는 항목

| 창 | 상태 | 건수 | 어디 | 항목 | 까닭 |
|---|---|---|---|---|---|
| min | select+options:rules | 1 | rule-ruleset>div.opt | 점수 규칙‹정밀 %› | under play-options-help>p.select-panel-help |
| min | select+options:rules | 1 | autoplay-toggle>div.opt | 오토 플레이‹끔› | under >button |
| min | select+options:rules | 1 | target-level>div.opt | 목표 레벨‹자동› | under difficulty-row>button.difficulty.folded |
| min | select+options:rules+practice | 1 | rule-gauge>div.opt | 게이지‹NORMAL› | under >header.topbar |
| min | select+options:rules+practice | 1 | rule-fever>div.opt | FEVER‹자동› | under >header.topbar |
| min | select+options:rules+practice | 1 | rule-pacemaker>div.opt | 페이스메이커‹끔› | under toggle-gear>button |
| min | select+options:rules+practice | 1 | rule-judgement>div.opt | 판정‹NORMAL› | under toggle-gear>button |
| min | select+options:rules+practice | 1 | practice-loop>div.opt | 구간 반복‹켬› | under >button |
| min | select+options:rules+practice | 1 | chart-minimap>canvas.chart-minimap.selectable |  | under play-options-button>b |
| min | select+options:rules+practice | 1 | minimap-sections>button.small.active | 인트로 A | under >div.go-row |
| min | select+options:rules+practice | 1 | minimap-sections>button.small | 아웃트로 B | under >div.go-row |
| min | select+options:gear | 1 | quick-lift>div.opt | 판정선 위치‹0%› | under play-options-help>p.select-panel-help |
| min | select+options:gear | 1 | quick-key-beam>div.opt | 키 빔 길이‹100%› | under >button |
| min | select+options:generation | 3 | generation-options>input |  | under play-options-help>p.select-panel-help |
| min | select+options:generation | 1 | pattern-engine-sectioned>button.active | 구간·루프 | under >p.select-status |
| min | select+options:generation | 1 | pattern-engine-designer>button | 악구·패턴 | under >p.select-status |
| min | select+options:generation | 1 | pattern-engine-classic>button | 이전 방식 | under >p.select-status |
| min | select+info | 1 | edit-chart>button.small | 채보 편집 | under >button |
| min | select+info | 1 | export-osu>a.button.small | osu!mania | under >button |
| min | select+info+sections | 1 | bga-upload>button.small | 영상 고르기 (mp4·webm) | under song-info>header.select-panel-head |
| min | select+info+sections | 1 | bga-youtube>button.small | 유튜브 링크 | under song-title>span.panel-song |
| min | select+info+sections | 1 | toggle-analysis>button.small | 분석 보기 | under difficulty-row>button.difficulty.folded |
| min | select+info+sections | 1 | remove-song>button.small.danger | 라이브러리에서 삭제 | under difficulty-row>button.difficulty.folded |
| min | select+add | 1 | autoplay-button>button.quiet.small | 오토 플레이 Shift+Enter | under import-button>button |
| min | select+add | 1 | favorite-toggle>button.quiet.small | 즐겨찾기 F3 | under import-button>button |
| min | select+add | 2 | >button | 6K | under import-folder-button>button |
| min | select+add | 1 | >button | 6K+FX | under import-folder-button>span |
| min | select+add | 1 | >button | 7K+1S | under import-folder-button>span |
| min | select@500 | 1 | song-item>button.song-item | 가짜 곡 007 · 제목이 꽤 긴 곡의 이름입니다아티스트 7분석 실패 | under >span.hint-item |
| min | settings:judge | 1 | opt-judge-counter>div.opt | 판정 카운터‹끔› | under settings-screen>footer.hintbar |
| min | settings:speed | 1 | opt-covers-on>div.opt | 커버 사용‹켬› | under settings-screen>span.settings-side-head |
| min | settings:speed | 1 | opt-keep-green>div.opt | 보이는 시간 유지‹끔› | under gear-preview>canvas |
| min | settings:speed | 1 | opt-scroll>div.opt | 스크롤‹시간 고정› | under gear-preview>canvas |
| min | settings:gear | 1 | opt-lane-width>div.opt | 레인 폭‹100%› | under settings-screen>span.settings-side-head |
| min | settings:gear | 1 | opt-key-beam>div.opt | 키 빔 길이‹100%› | under gear-preview>canvas |
| min | settings:gear | 1 | opt-judge-position>div.opt | 판정 표시 위치‹보통› | under gear-preview>canvas |
| min | settings:gear | 1 | opt-judge-opacity>div.opt | 판정·콤보 불투명도‹100%› | under gear-preview>canvas |
| min | settings:gear | 1 | bar-lines>div.opt | 마디선‹켬› | under gear-preview>canvas |
| min | settings:notes, settings:notes@20presets | 2 | color-lane-0>button.lane-swatch.active | 1 | under gear-preview>canvas |
| min | settings:notes, settings:notes@20presets | 2 | color-lane-1>button.lane-swatch.light | 2 | under gear-preview>canvas |
| min | settings:notes, settings:notes@20presets | 2 | color-lane-2>button.lane-swatch.light | 3 | under gear-preview>canvas |
| min | settings:notes, settings:notes@20presets | 2 | color-lane-3>button.lane-swatch.light | 4 | under gear-preview>canvas |
| min | settings:notes, settings:notes@20presets | 2 | color-hex>input |  | under gear-preview>canvas |
| min | settings:notes, settings:notes@20presets | 2 | opt-color-hue>div.opt | 색상‹206°› | under settings-screen>footer.hintbar |
| min | settings:fx | 1 | opt-bga>div.opt | 배경 영상 (BGA)‹켬› | under settings-screen>span.settings-side-head |
| min | settings:keys | 1 | key-5K-0>button.key-cap.lane-white | D | under settings-help>p.settings-help |
| min | settings:keys | 1 | key-5K-1>button.key-cap.lane-blue | F | under settings-help>p.settings-help |
| min | settings:keys | 1 | key-5K-2>button.key-cap.lane-gold | Space | under settings-help>p.settings-help |
| min | settings:keys | 1 | key-5K-3>button.key-cap.lane-blue | J | under settings-help>p.settings-help |
| min | settings:keys | 1 | key-5K-4>button.key-cap.lane-white | K | under settings-help>p.settings-help |
| min | settings:keys | 1 | key2-5K-0>button.key-cap.lane-white |  | under settings-help>p.settings-help |
| min | settings:keys | 1 | key2-5K-1>button.key-cap.lane-blue |  | under settings-help>p.settings-help |
| min | settings:keys | 1 | key2-5K-2>button.key-cap.lane-gold |  | under settings-help>p.settings-help |
| min | settings:keys | 1 | key2-5K-3>button.key-cap.lane-blue |  | under settings-help>p.settings-help |
| min | settings:keys | 1 | key2-5K-4>button.key-cap.lane-white |  | under settings-help>p.settings-help |
| min | settings:keys | 1 | keys-run-5K>button.small | 차례로 지정 | under settings-help>p.settings-help |
| min | settings:keys | 1 | keys-default-5K>button.small | 기본값 | under settings-help>p.settings-help |
| min | settings:keys | 1 | ghost-5K>button.small | 동시 입력 테스트 | under settings-help>p.settings-help |
| min | settings:keys | 1 | key-6K-0>button.key-cap.lane-white | S | under settings-screen>span.hint-main |
| min | settings:keys | 1 | key-6K-1>button.key-cap.lane-blue | D | under settings-screen>kbd |

(외 36가지는 `data/layout.json`에)

## 숨은 힌트

| 창 | 상태 | 건수 | 힌트 |
|---|---|---|---|
| min | select, select+add, select+search 외 1 | 4 | PgUpPgDn페이지 |
| min | select, select+add, select+search 외 1 | 4 | F2랜덤 |
| min | select, select+add, select+search 외 1 | 4 | F3즐겨찾기 |
| min | select, select+options:rules, select+options:rules+practice 외 5 | 8 | Shift+Enter오토 플레이 |
| min | editor, editor+menu | 2 | CtrlZ되돌리기 |
| min | editor, editor+menu | 2 | M미러 |

## 24×24px보다 작은 대상 (WCAG 2.5.8)

| 창 | 상태 | 건수 | 어디 | 항목 | 크기 |
|---|---|---|---|---|---|
| min | select+options:generation | 4 | generation-options>input |  | 16×16 |
| min | select+options:generation | 1 | instrument-mapping>input |  | 224×16 |
| min | select@500 | 1 | analysis-status>summary | 자세히 | 47×20 |
| min | editor, editor+menu | 2 | editor-record>input |  | 16×16 |
| min | editor, editor+menu | 2 | editor-screen>input |  | 16×16 |
| base | select+options:generation | 4 | generation-options>input |  | 16×16 |
| base | select+options:generation | 1 | instrument-mapping>input |  | 224×16 |
| base | select@500 | 1 | analysis-status>summary | 자세히 | 47×20 |
| base | editor, editor+menu | 2 | editor-record>input |  | 16×16 |
| base | editor, editor+menu | 2 | editor-screen>input |  | 16×16 |

## 글자 대비 미달 (WCAG 1.4.3; 그림 위 글자는 재지 않음)

없음

## 12px보다 작은 글자

없음

## 포커스를 받아도 모습이 바뀌지 않는 항목 (WCAG 2.4.7)

| 창 | 상태 | 건수 | 어디 | 항목 |
|---|---|---|---|---|
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 5 | 8 | add-menu>button | 곡 추가 + |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 5 | 8 | open-settings>button | 설정 F10 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 5 | 8 | folder-all>button | 전체 1 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 5 | 8 | folder-favorites>button | 즐겨찾기 0 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 5 | 8 | folder-unplayed>button | 미플레이 1 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 5 | 8 | folder-uncleared>button | 미클리어 0 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 5 | 8 | folder-noFullCombo>button | 풀콤 미달 0 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 5 | 8 | song-sort>button | 추가순 F4 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 4 | 7 | song-item>button | Demo Groove 128Generative Rhyt |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 1 | 4 | toggle-rules>button | 플레이 규칙 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 1 | 4 | toggle-gear>button | 속도·기어 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 1 | 4 | toggle-generation>button | 생성 옵션 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 1 | 4 | play-options>button | 닫기 Esc |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 4 | 28 | >button | 4K |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 4 | 14 | >button | 4K+FX |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 4 | 7 | >button | 7K+1S |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 3 | 6 | difficulty-row>button | EZ2 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 3 | 6 | difficulty-row>button | NM5 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 3 | 6 | difficulty-row>button | HD8 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 3 | 6 | difficulty-row>button | EX11 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 3 | 6 | difficulty-row>button | MX11 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 4 | 7 | play-options-button>button | 노트 속도 4.00게이지 NORMAL배치 정배치FEVE |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 4 | 7 | generate-button>button | 새 패턴 F5 |
| min | select+options:rules, select+options:gear, select+options:generation 외 3 | 6 | play-button>button | 플레이 Enter |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 1 | 4 | hint-options>button | Space플레이 옵션 닫기 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 3 | 6 | hint-info>button | I곡 정보·도구 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 4 | 7 | >button | Esc닫기 |
| min | select+options:rules+practice | 1 | chart-minimap>canvas |  |
| min | select+options:rules+practice | 1 | minimap-sections>button | 인트로 A |
| min | select+options:rules+practice | 1 | minimap-sections>button | 아웃트로 B |
| min | select+options:rules+practice | 1 | play-button>button | 연습 시작 Enter |
| min | select+options:generation | 1 | style-balanced>button | 균형 |
| min | select+options:generation | 1 | style-stream>button | 스트림 |
| min | select+options:generation | 1 | style-chord>button | 동치 |
| min | select+options:generation | 1 | style-jack>button | 연타 |
| min | select+options:generation | 1 | style-longnote>button | 롱노트 |
| min | select+options:generation | 1 | style-technical>button | 테크니컬 |
| min | select+options:generation | 1 | style-melody>button | 멜로디 |
| min | select+options:generation | 1 | generation-options>button | 자동 |
| min | select+options:generation | 1 | generation-options>button | 드럼 |
| min | select+options:generation | 1 | generation-options>button | 베이스 |
| min | select+options:generation | 1 | generation-options>button | 멜로디 |
| min | select+options:generation | 1 | generation-options>button | 보컬 |
| min | select+options:generation | 4 | generation-options>input |  |
| min | select+options:generation | 1 | instrument-mapping>input |  |
| min | select+options:generation | 1 | pattern-engine-sectioned>button | 구간·루프 |
| min | select+options:generation | 1 | pattern-engine-designer>button | 악구·패턴 |
| min | select+options:generation | 1 | pattern-engine-classic>button | 이전 방식 |
| min | select+options:generation | 1 | generation-options>button | 생성 옵션 초기화 |
| min | select+info, select+info+sections | 2 | song-info>button | 닫기 Esc |
| min | select+info, select+info+sections | 2 | edit-chart>button | 채보 편집 |
| min | select+info, select+info+sections | 2 | export-osu>a | osu!mania |
| min | select+info, select+info+sections | 2 | song-info>button | ×2 |
| min | select+info, select+info+sections | 2 | song-info>button | ÷2 |
| min | select+info, select+info+sections | 2 | song-offset-minus5>button | -5ms |
| min | select+info, select+info+sections | 2 | song-offset-minus1>button | -1ms |
| min | select+info, select+info+sections | 2 | song-offset-plus1>button | +1ms |
| min | select+info, select+info+sections | 2 | song-offset-plus5>button | +5ms |
| min | select+info, select+info+sections | 4 | song-info>button | -10ms |
| min | select+info, select+info+sections | 4 | song-info>button | +1ms |

(외 606가지는 `data/layout.json`에)

## 이름이 없는 항목 (WCAG 4.1.2)

| 창 | 상태 | 건수 | 어디 | 태그 | 종류 |
|---|---|---|---|---|---|
| min | select+options:generation | 1 | instrument-mapping>input | input | range |
| base | select+options:generation | 1 | instrument-mapping>input | input | range |
