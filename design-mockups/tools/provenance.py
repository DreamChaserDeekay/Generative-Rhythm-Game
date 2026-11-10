"""Writes design-mockups/PROVENANCE.md from the manifests and the measurements, so every line is what was recorded.

    python3 design-mockups/tools/provenance.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
music = json.loads((ROOT / "_src" / "music" / "manifest.json").read_text())
robots_file = ROOT / "_src" / "music" / "robots.json"
robots = json.loads(robots_file.read_text()) if robots_file.exists() else {}
report = json.loads((ROOT / "_src" / "sfx" / "report.json").read_text())
raw = {m["file"]: m for m in json.loads((ROOT / "_src" / "sfx" / "manifest.json").read_text())}
songs = {s["title"]: s for s in json.loads((ROOT / "public" / "data" / "songs.json").read_text())["songs"]}

LICENSES = {
    "VCSL": ("Versilian Community Sample Library (VCSL)", "Versilian Studios LLC (Sam Gossner)와 기여자들", "CC0 1.0", "https://github.com/sgossner/VCSL/blob/master/LICENSE"),
    "swirly": ("Karoryfer Samples · Swirly Drums", "Karoryfer Samples", "CC0 1.0", "https://github.com/sfzinstruments/karoryfer.swirly-drums/blob/main/license"),
    "rusty": ("Karoryfer Samples · Big Rusty Drums", "Karoryfer Samples", "CC0 1.0", "https://github.com/sfzinstruments/karoryfer.big-rusty-drums/blob/main/LICENSE"),
}


def source_of(path: str) -> str:
    return "VCSL" if "/vcsl/" in path else "swirly" if "swirly" in path else "rusty"


def esc(text: object) -> str:
    return str(text if text is not None else "").replace("|", "\\|").replace("\n", " ")


out: list[str] = []
w = out.append
w("# 출처")
w("")
w("시안(`design-mockups/`)에 들어 있는 것이 어디서 왔는지 파일마다 적습니다. 이 문서는 `tools/provenance.py`가 각 `manifest.json`과 측정 기록에서 만듭니다.")
w("")
w("- 받은 날: 2026-11-10")
w("- 새로 받은 그림, 생성한 그림: 없음. 시안의 그림은 모두 곡의 분석 데이터를 코드로 캔버스에 그린 것입니다. 이미지 생성 모델을 쓰지 않았고 비용은 0입니다.")
w("- 코드로 만든 소리, AI로 생성한 소리: 없음.")
w("- 로그인·봇 확인·유료 벽을 지나 받은 것: 없음.")
w("")
w("## 곡")
w("")
w("이 곡들을 이 게임의 분석 서버에 넣어 분석하고 채보를 만들었습니다(`tools/export_songs.py`). `public/data/`의 수치는 모두 그 결과이고, `public/audio/`는 원본을 mp3로 다시 인코딩한 것입니다.")
w("")
w("| 파일 (`public/audio/`) | 제목 | 아티스트 | 라이선스 | 곡의 쪽 | 받은 주소 | 손댄 내용 |")
w("|---|---|---|---|---|---|---|")
for m in music:
    s = songs.get(m["title"])
    files = f"`{s['id']}.mp3`, `{s['id']}.pre.mp3`" if s else "(분석 실패로 쓰지 않음)"
    w(f"| {files} | {esc(m['title'])} | {esc(m['artist'])} | [{esc(m['license'])}]({m.get('license_url', '')}) | {m.get('page_url', '')} | {m.get('download_url', '')} | 전곡: 96 kbps mp3로 다시 인코딩, 태그 제거. 미리듣기: 분석이 고른 미리듣기 지점부터 24초, 앞 0.6초·뒤 1.2초 페이드, 112 kbps mp3 |")
w("")
statements = [(m["title"], m.get("license_statement")) for m in music if m.get("license_statement")]
if statements:
    w("라이선스 문구(받은 쪽에서 읽은 그대로):")
    w("")
    seen: dict[str, list[str]] = {}
    for title, text in statements:
        seen.setdefault(str(text), []).append(title)
    for text, titles in seen.items():
        w(f"- {', '.join(titles)}: “{esc(text)}”")
    w("")
attributions = [(m["title"], m.get("attribution")) for m in music if m.get("attribution")]
if attributions:
    w("표기(CC BY):")
    w("")
    for title, text in attributions:
        w(f"- {title}: {esc(text)}")
    w("")
if robots:
    w("받기 전에 읽은 robots.txt:")
    w("")
    for host, info in robots.items():
        w(f"- `{host}` ({'사용' if info.get('used') else '쓰지 않음'}): {esc(info.get('summary'))}")
    w("")
w("아티스트가 CC BY 4.0에 덧붙여 적어 둔 바람(받은 쪽의 안내에서 읽은 것):")
w("")
w("- Scott Buckley, Juggernaut: “My music cannot be resold in isolation, or redistributed/reuploaded to music streaming platforms, and must be synchronised with other media (e.g. film).” Content ID 같은 지문 서비스에 등록하지 말 것. 게임 안에서 쓰는 것은 이에 맞습니다. 이 파일만 따로 음원으로 배포하는 것은 맞지 않습니다.")
w("- Jason Shaw (Audionautix), Funky Junky: “Must be part of some other created works.” 안내가 비디오 게임을 허용되는 쓰임으로 듭니다.")
w("")
w("받았다가 쓰지 않은 것:")
w("")
w("- opengameart.org에서 받은 CC0 12곡: 받은 뒤에 이 사이트의 robots.txt가 Claude 에이전트(Claude-Code, Claude-User, ClaudeBot, anthropic-ai)에 `Disallow: /`를 걸어 둔 것을 알았습니다. 파일과 그것으로 만든 데이터를 모두 지웠고 저장소에는 남기지 않았습니다.")
w("- Loyalty Freak Music · Komiku의 CC0 3곡: 음악가의 FAQ가 AI를 거부한다고 적어 두어(“I forbid you to train your … AI on my work”) 뺐습니다. 파일과 데이터를 지웠습니다.")
w("")
w("음원 파일에 들어 있던 커버 그림은 쓰지 않았습니다(다시 인코딩하면서 뺐고, 지금 게임의 화면을 찍을 때도 지웠습니다).")
w("")
w("기록(램프 · RATE · BREAK · 플레이 수)은 표본입니다(`src/data.ts`의 `SAMPLE`). 기록은 플레이어마다의 것이라 시안에는 없어서, 화면을 보이기 위해 몇 곡에 넣었습니다.")
w("")
w("## 효과음")
w("")
w("실제 타악기를 스튜디오에서 녹음한 샘플 라이브러리 셋에서 왔습니다. 라이선스는 저장소마다의 라이선스 파일을 읽어 확인했습니다(모두 CC0 1.0 전문).")
w("")
w("| 출처 | 만든 이 | 라이선스 | 라이선스 파일 |")
w("|---|---|---|---|")
for name, author, lic, url in LICENSES.values():
    w(f"| {name} | {author} | {lic} | {url} |")
w("")
w("손댄 내용(모든 파일, `tools/build_sfx.py`): 타격의 1ms 앞에서 자르고, 이벤트마다 정한 길이에서 끊어 끝의 4분의 1을(적어도 8ms) 줄이고, 가장 큰 30ms의 RMS가 이벤트의 크기가 되게 음량을 맞추고(피크는 −1 dBFS를 넘지 않게), 44.1 kHz 16비트 WAV로 저장. EQ·리버브·음높이 가공은 없습니다.")
w("")
w("| 파일 (`public/sfx/`) | 이벤트 | 원본 파일 | 받은 주소 | 길이 | 음량 | 피크 dBFS | 30ms RMS dBFS | 원본 피크 dBFS | 원본 클리핑 | 원본 가장 조용한 20ms dBFS |")
w("|---|---|---|---|---|---|---|---|---|---|---|")
for r in report:
    m = raw.get(r["raw"], {})
    floor = "(잴 구간 없음)" if r["raw_noise_floor_dbfs"] > -60 else "디지털 무음" if r["raw_noise_floor_dbfs"] <= -150 else r["raw_noise_floor_dbfs"]
    w(
        f"| `{r['file']}` | {r['event']} | `{Path(r['raw']).name}` ({LICENSES[source_of(r['raw'])][0]}) | {m.get('download_url', r.get('download_url', ''))} | {r['duration_ms']} ms | {r['gain_db']:+} dB | {r['peak_dbfs']} | {r['rms30_dbfs']} | {r['raw_peak_dbfs']} | {r['raw_clipped_samples']} | {floor} |"
    )
w("")
w("## 글꼴")
w("")
w("새로 받은 글꼴은 없습니다. 게임에 이미 들어 있는 파일을 그대로 씁니다(`client/src/assets/fonts/`, 모두 SIL OFL 1.1, 출처는 그 폴더의 README).")
w("")
w("- Pretendard Variable: 시안의 글자 전부")
w("- Barlow Condensed SemiBold · Bold: 시안의 숫자와 영문 라벨")
w("- 기어의 판정·콤보·점수판 글꼴들: 플레이 화면에서 게임의 HUD가 쓰는 그대로")
w("")
w("## 게임에서 가져온 것")
w("")
w("- `client/src`의 렌더러 · HUD · 플레이 컨트롤러 · 설정 · 엔진: 고치지 않고 불러 씁니다(`@game` 별칭).")
w("- `client/public/media`의 기어 · 노트 · 타격 효과 그림: 빌드할 때 `dist/media`로 복사합니다. 출처는 `assets-src/PROVENANCE.md`.")
w("- `_src/settings-inventory.json`: `client/src/ui/SettingsScreen.tsx`, `optionRows.tsx`, `PlayOptions.tsx`, `NoteColorsPanel.tsx`에서 탭 · 항목 · 값 · 범위 · 도움말을 그대로 읽어 옮긴 것.")
w("- `_src/health.json`: 곡을 분석한 서버의 `GET /api/health` 응답에서 분석 백엔드 부분.")
w("")
(ROOT / "PROVENANCE.md").write_text("\n".join(out))
print(len(out), "lines")
