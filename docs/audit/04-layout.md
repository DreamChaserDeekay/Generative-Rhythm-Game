# 좁은 창과 접근성 측정

`client/audit/layout.audit.ts`: 모든 상태를 최소 창(960×600, 데스크톱 앱의 최소 크기)과 기본 창(1280×720)에서 쟀습니다. 원본: `data/layout.json`.

| 창 | 상태 | 잘린 글자 | 창 밖 글자 | 닿지 않는 항목 | 24px 미만 대상 | 대비 미달 | 12px 미만 글자 | 숨은 힌트 | 포커스 표시 없음 |
|---|---|---|---|---|---|---|---|---|---|
| min | select | 9 | 1 | 0 | 0 | 0 | 0 | 4 | 0 |
| min | select+options:rules | 7 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| min | select+options:rules+practice | 7 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| min | select+options:gear | 7 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| min | select+options:generation | 7 | 0 | 0 | 5 | 0 | 0 | 1 | 0 |
| min | select+info | 6 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| min | select+info+sections | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | select+add | 9 | 1 | 6 | 0 | 0 | 0 | 3 | 0 |
| min | select+search | 9 | 1 | 0 | 0 | 0 | 0 | 4 | 0 |
| min | select+emptyfolder | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | select+first | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | select+offline | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | select@500 | 503 | 0 | 0 | 1 | 0 | 0 | 4 | 0 |
| min | settings:play | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:judge | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:speed | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:gear | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:notes | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:fx | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:sound | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:keys | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:pad | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:advanced | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:notes@20presets | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | settings:keys+ghost | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | calibration:input | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| min | calibration:visual | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | play:loading | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| min | play:paused | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| min | result | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | result:details | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| min | editor | 0 | 0 | 0 | 2 | 0 | 0 | 2 | 0 |
| min | editor+menu | 0 | 6 | 0 | 2 | 0 | 0 | 2 | 0 |
| base | select | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| base | select+options:rules | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select+options:rules+practice | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select+options:gear | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select+options:generation | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 |
| base | select+info | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select+info+sections | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select+add | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| base | select+search | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| base | select+emptyfolder | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select+first | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select+offline | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | select@500 | 0 | 2 | 1 | 1 | 0 | 0 | 0 | 0 |
| base | settings:play | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:judge | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:speed | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:gear | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:notes | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:fx | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| base | settings:sound | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:keys | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:pad | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:advanced | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:notes@20presets | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | settings:keys+ghost | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | calibration:input | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | calibration:visual | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | play:loading | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| base | play:paused | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| base | result | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | result:details | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| base | editor | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |
| base | editor+menu | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 |

## 잘린 글자

| 창 | 상태 | 건수 | 어디 | 글자 | 보이는 폭/필요한 폭 | 말줄임 | title |
|---|---|---|---|---|---|---|---|
| min | select, select+options:rules, select+options:rules+practice 외 6 | 27 | song-item>span.song-title | Demo Groove 100 | 81/134 | … | 없음 |
| min | select, select+options:rules, select+options:rules+practice 외 6 | 27 | song-item>span.song-sub | Generative Rhythm (합성 데모) | 81/178 | … | 없음 |
| min | select, select+add, select+search 외 1 | 4 | difficulty-row>span.diff-name | NORMAL | 49/63 | … | 있음 |
| min | select, select+add, select+search 외 1 | 4 | difficulty-row>span.diff-name | EXPERT | 53/60 | … | 있음 |
| min | select, select+add, select+search 외 1 | 4 | difficulty-row>span.diff-name | MASTER | 49/61 | … | 있음 |
| min | select+options:rules, select+options:rules+practice, select+options:gear 외 1 | 4 | song-title>span.panel-song | Demo Groove 100 | 0/132 | … | 있음 |
| min | select@500 | 500 | song-item>span.song-title | 가짜 곡 001 · 제목이 꽤 긴 곡의 이름입니다 | 199/270 | … | 없음 |

## 창 밖으로 나간 글자 (스크롤로도 못 봄)

| 창 | 상태 | 건수 | 어디 | 글자 | 자리 |
|---|---|---|---|---|---|
| min | select, select+add, select+search | 3 | difficulty-row>em | 187 노트 | 915,393,966,412 |
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
| min | select+add | 1 | autoplay-button>button.quiet.small | 오토 플레이 Shift+Enter | under import-button>button |
| min | select+add | 1 | favorite-toggle>button.quiet.small | 즐겨찾기 F3 | under import-button>button |
| min | select+add | 2 | >button | 6K | under import-folder-button>button |
| min | select+add | 1 | >button | 6K+FX | under import-folder-button>span |
| min | select+add | 1 | >button | 7K+1S | under import-folder-button>span |
| min | calibration:input | 1 | calib-step-input>button.active | 1. 판정 오프셋 측정 | under calibration-screen>p.calib-intro |
| min | calibration:input | 1 | calib-step-visual>button | 2. 표시 오프셋 맞추기 | under calibration-screen>p.calib-intro |
| base | select, select+search, select@500 | 3 | hint-favorite>button.hint-item.minor | F3즐겨찾기 | outside the window |
| base | select+add | 1 | autoplay-button>button.quiet.small | 오토 플레이 Shift+Enter | under import-folder-button>span |
| base | select+add | 1 | favorite-toggle>button.quiet.small | 즐겨찾기 F3 | under import-folder-button>button |

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

| 창 | 상태 | 건수 | 어디 | 글자 | 대비 | 기준 | 크기 | 글자색 | 배경색 |
|---|---|---|---|---|---|---|---|---|---|
| base | settings:fx | 1 | settings-screen>button.primary | 완료 Esc | 1 | 4.5 | 16px | rgb(11, 12, 16) | rgb(11,12,16) |
| base | settings:fx | 1 | settings-screen>kbd | Esc | 1 | 4.5 | 13px | rgb(11, 12, 16) | rgb(11,12,16) |

## 12px보다 작은 글자

없음

## 포커스를 받아도 모습이 바뀌지 않는 항목 (WCAG 2.4.7)

없음

## 이름이 없는 항목 (WCAG 4.1.2)

| 창 | 상태 | 건수 | 어디 | 태그 | 종류 |
|---|---|---|---|---|---|
| min | select+options:generation | 1 | instrument-mapping>input | input | range |
| base | select+options:generation | 1 | instrument-mapping>input | input | range |
