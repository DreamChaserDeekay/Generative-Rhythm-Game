# 노트 스킨 전후 비교 (2026-11-16)

설명은 `docs/GEAR_NOTE_FX.md`의 "노트 스킨: 입체 롱노트, 단노트 모양의 롱노트 끝, 스킨마다 다른 막대" 절.
모든 그림은 게임의 렌더러(`TrackRenderer`)로 찍은 것이고, 새로 만든 이미지(생성 모델)는 없습니다.
"before"는 `cdb8757`(develop), "after"는 `claude/note-skins`.

| 파일 | 내용 |
|---|---|
| `longs-and-taps-before.jpg` / `-after.jpg` | 23개 노트 스타일, 4K SDVX: 왼쪽부터 단노트(가까이 · 멀리), 롱노트, 누르는 중, 놓침 |
| `taps-play-size-before.jpg` / `-after.jpg` | 7K+1S SDVX 1920×1080의 단노트: 스크래치(분홍) · 흰 · 파랑 · 노랑 |
| `heads-shaped.jpg` | 모양 노트 7종(코인 · 두 별 · AI 회사 넷)의 롱노트 머리와 꼬리 확대: 롱노트(짧은 것의 꼬리 포함) · 긴 것 · 누르는 중 · 놓침. 전은 `c137573`(직사각형 음영이 남던 것) |
| `close-ups-1.jpg`, `close-ups-2.jpg` | 판정선 근처 확대, 왼쪽 전 · 오른쪽 후 |
| `play-<스킨>-<키 모드>-<카메라>.jpg` | 실제 플레이 화면(스킨의 기어까지), 왼쪽 전 · 오른쪽 후 |

## 그림으로 바꾼 단노트 · 롱노트 (`art/`)

코드 단노트 · 롱노트를 이미지 모델로 다시 그린 것(`docs/GEAR_NOTE_FX.md`의 "코드로 그리던 단노트 · 롱노트를 그림으로"). 모두 왼쪽 코드(`15f68a2`) · 오른쪽 그림.

| 파일 | 내용 |
|---|---|
| `art/close-ups-1.jpg`, `art/close-ups-2.jpg` | 판정선 근처 확대: 단노트, 롱노트, 누르는 중, 놓침 (15종 + AI 회사 넷) |
| `art/taps-7k-1.jpg`, `art/taps-7k-2.jpg` | 7K+1S 1080p 플레이 크기의 단노트 |
| `art/play-*.jpg` | 스킨 9개의 플레이 화면 |
| `art/longs-and-taps-art.jpg`, `art/taps-play-size-art.jpg` | 23개 스타일을 한 장에(그림 판) |
| `art/sent-and-made.jpg` | 보낸 참고 그림(위)과 고른 그림(아래) |

## 다시 찍기 (`lab/`)

`lab/lab.ts`는 렌더러 하나를 만들고 손으로 놓은 노트로 한 프레임을 그리는 페이지입니다(`window.labRender`).

```
cd design-mockups/note-skins/lab
node ../../../client/node_modules/vite/bin/vite.js --config vite.config.mjs &   # :5199
node shoot.mjs <출력 폴더> sheet|taps|zoom|heads|play [스타일,…]
python3 sheet.py <출력 폴더> longs.png      # sheet-*.png를 한 장으로
python3 tapsheet.py <출력 폴더> taps.png    # taps-*.png를 한 장으로
node refs.mjs <폴더>                      # 이미지 모델에 보낼 참고 그림(코드 단노트 · 롱노트)
```

`client`의 `node_modules`가 있어야 합니다. 브라우저는 미리 설치된 Playwright의 Chromium(SwiftShader)을 씁니다.
