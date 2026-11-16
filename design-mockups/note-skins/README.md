# 노트 스킨 전후 비교 (2026-11-16)

설명은 `docs/GEAR_NOTE_FX.md`의 "노트 스킨: 입체 롱노트, 단노트 모양의 롱노트 끝, 스킨마다 다른 막대" 절.
모든 그림은 게임의 렌더러(`TrackRenderer`)로 찍은 것이고, 새로 만든 이미지(생성 모델)는 없습니다.
"before"는 `cdb8757`(develop), "after"는 `claude/note-skins`.

| 파일 | 내용 |
|---|---|
| `longs-and-taps-before.jpg` / `-after.jpg` | 23개 노트 스타일, 4K SDVX: 왼쪽부터 단노트(가까이 · 멀리), 롱노트, 누르는 중, 놓침 |
| `taps-play-size-before.jpg` / `-after.jpg` | 7K+1S SDVX 1920×1080의 단노트: 스크래치(분홍) · 흰 · 파랑 · 노랑 |
| `close-ups-1.jpg`, `close-ups-2.jpg` | 판정선 근처 확대, 왼쪽 전 · 오른쪽 후 |
| `play-<스킨>-<키 모드>-<카메라>.jpg` | 실제 플레이 화면(스킨의 기어까지), 왼쪽 전 · 오른쪽 후 |

## 다시 찍기 (`lab/`)

`lab/lab.ts`는 렌더러 하나를 만들고 손으로 놓은 노트로 한 프레임을 그리는 페이지입니다(`window.labRender`).

```
cd design-mockups/note-skins/lab
node ../../../client/node_modules/vite/bin/vite.js --config vite.config.mjs &   # :5199
node shoot.mjs <출력 폴더> sheet|taps|zoom|play [스타일,…]
python3 sheet.py <출력 폴더> longs.png      # sheet-*.png를 한 장으로
python3 tapsheet.py <출력 폴더> taps.png    # taps-*.png를 한 장으로
```

`client`의 `node_modules`가 있어야 합니다. 브라우저는 미리 설치된 Playwright의 Chromium(SwiftShader)을 씁니다.
