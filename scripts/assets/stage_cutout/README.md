# 파이어스타터 기어 양옆 그림에서 배경을 뺀 스크립트

`client/public/stage/fire/1-left.webp`(아리 · 이블린) · `2-right.webp`(카이사 · 아칼리)를 인물만 남긴 판으로 만들 때(2026-11-13) 실제로 돌린 스크립트입니다. 작업 폴더에 있던 것을 **경로만 고쳐** 옮겼습니다(프롬프트 · 숫자 · 알고리즘은 그대로). 옮긴 스크립트로 같은 입력에서 게임의 두 그림이 그대로 다시 나오는 것을 확인했습니다(PNG의 sha256 일치).

- 이 폴더에는 스크립트와 이 문서만 있습니다. 일러스트 원본(Riot Games의 K/DA FIRESTARTER 그림)과 이미지 모델이 돌려준 그림은 저장소에 넣지 않았습니다.
- 그림마다의 기록(어느 생성을 썼는지, 프롬프트 전문, 보낸 그림과 결과의 sha256, 합성에 쓴 값)은 `assets-src/stage/fire/1-left.json` · `2-right.json`에 있습니다. 쓰지 않은 생성의 프롬프트도 거기에 있습니다(`cutout.py`에는 쓴 두 생성의 프롬프트만 있습니다).
- 권리자와 출처, 그림에서 모델이 그린 부분: `client/public/licenses/STAGE-PICTURES.md`. 경위: `assets-src/PROVENANCE.md`의 "기어 양옆 그림에서 배경 빼기".

## 순서

작업 폴더(`W`) 아래에 `src/Ahri_KDAFIRESTARTERSkin_HD.jpg`(7000×4136, League of Legends 위키에서 받은 일러스트; sha256은 기록에)와 빈 `work/`가 있어야 합니다. 조각의 이름은 `1-left` · `2-right`입니다.

| 단계 | 스크립트 | 하는 일 |
|---|---|---|
| 1 | `canvas.py W` | 조각마다 일러스트의 그 자리를 그림의 2배 크기(1802×2252, 4:5) 캔버스에 놓음. 일러스트의 위 가장자리 너머는 초록. 자리와 크기는 `geom.py`(그 전 판의 그림과 같은 자리) → `work/<조각>-canvas.png` |
| 2 | `cutout.py W <조각> <n>` | 이미지 모델에 캔버스를 주고 "두 사람만 그대로, 나머지는 초록, 위 가장자리에 잘린 부분만 이어 그리기"를 요청 → `work/<조각>-try-<n>.png` · `.json` |
| 3 | `register.py W <조각> <n>` | 돌려준 그림이 캔버스에 어떻게 놓이는지(인물 안쪽 패치들의 대응으로 구한 아핀 변환) → `work/<조각>-try-<n>-fit.json` |
| 4 | `compose.py W <조각> <n>` | 초록을 빼서 인물의 모양을 얻고, 색은 일러스트의 화소로 채움. 모델의 화소는 위 가장자리 너머와, 둘이 크게 다른 곳(인물 위의 불꽃을 뺀 자리)에만. 윤곽선은 안쪽 색으로 다시 칠하고, 그림의 바깥쪽 가장자리는 흐림 → `work/<조각>-final.png`(게임 크기), `work/<조각>-cut-<n>.png`(초록 위의 인물: 보정 요청에 주는 그림), 확인용 그림 |
| 5 | `mend.py W 2-right 1 1` | (오른쪽만) 누끼를 다시 주고, 다른 인물에 가려 있어 비어 있는 카이사의 허리 아래만 이어 그리게 함 → `work/2-right-try-m1.png` · `.json` |
| 6 | `register.py W 2-right m1 cut-1` · `compose.py W 2-right 1 --mend m1 200,1480,640,772` | 보정본을 맞추고, 캔버스의 그 구역에서만 보정본을 씀(인물과 만나는 곳은 44 px에 걸쳐 섞음) |
| 7 | `put.py W <저장소>` | `client/public/stage/fire/<조각>.webp`(품질 92)로 |

쓴 생성: 왼쪽은 2차(`cutout.py W 1-left 2`), 오른쪽은 1차(`cutout.py W 2-right 1`)와 보정 1차. 1 · 2 · 5 · 7단계는 `python3 -I`로, scipy가 필요한 3 · 4 · 6단계는 `PYTHONPATH=<scipy가 있는 곳> python3`로 돌렸습니다.

## 준비

- Python 3, Pillow, numpy. `register.py` · `compose.py`는 scipy도 필요합니다.
- `GOOGLE_API_KEY`(환경 변수). 모델 id는 `cutout.py`의 `MODEL`입니다.
- 모델을 다시 부르면 다른 그림이 나옵니다. 같은 그림을 다시 만들려면 기록에 적힌 해시의 결과 그림(`<조각>-try-<n>.png`)이 `work/`에 있어야 하고, 그때는 1 · 3 · 4 · 6 · 7단계만 돌립니다.
