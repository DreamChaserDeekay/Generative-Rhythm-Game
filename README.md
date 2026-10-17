# Generative Rhythm Game

내 음악 파일로 채보를 자동 생성해 플레이하는 건반형 리듬게임입니다. 플레이 화면은 SOUND VOLTEX식 3D 원근 트랙, 판정 범위는 DJMAX RESPECT V 기준입니다.

- 개발 명세(프롬프트): [docs/PROMPT.md](docs/PROMPT.md)
- 설계 문서: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 진행 상황

- [x] **Phase 0** — 설계, DJMAX 판정 엔진, 오디오 클럭, SDVX식 3D 트랙, 싱크 테스트, 오프셋 캘리브레이션
- [ ] **Phase 1** — Python 분석 서버, 채보 자동 생성, 곡 업로드부터 결과까지 전체 흐름

## 실행 (개발)

```bash
cd client
npm install
npm run dev        # http://127.0.0.1:5173
```

메뉴에서 **싱크 테스트 → 오토 플레이**를 누르면 클릭 트랙에 맞춰 노트가 내려오고, 모든 노트가 MAX 100%로 판정되어야 정상입니다. **오프셋 캘리브레이션**에서 메트로놈에 맞춰 키를 누르면 판정 오프셋을 자동으로 맞출 수 있습니다.

## 테스트

```bash
cd client
npm test                # 판정·롱노트·점수·게이지·오디오 클럭·입력 유닛 테스트
npx playwright test     # 브라우저에서 오토 플레이 → PERFECT PLAY 확인
```
