"""Cut the mockup's sound kit from the recorded samples in _src/sfx/raw (see PROVENANCE.md).

    server/.venv/bin/python design-mockups/tools/build_sfx.py

Every sound is a studio recording of a real percussion instrument (VCSL and Karoryfer Samples, both
CC0). Nothing is synthesised: a sample is only trimmed to its hit, faded at its end and brought to
its event's level. Writes public/sfx/*.wav, public/sfx/kit.json (events and their candidates) and
_src/sfx/report.json (what was measured of each file).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "_src" / "sfx" / "raw"
OUT = ROOT / "public" / "sfx"
SR = 44100

V = "vcsl/"
S = "karoryfer_swirly_drums/"
B = "karoryfer_big_rusty_drums/"

# event: (label, where it sounds, level of its loudest 30 ms in dBFS RMS, [(id, file prefix, what it is, longest in s)])
KIT = {
    "cursor": ("커서 이동", "곡 목록·설정 항목 ↑↓", -27, [
        ("stick", B + "snare_14__sc__", "스틱끼리 가볍게 (스네어 스틱 클릭)", 0.12),
        ("wood", V + "Woodblock__wood_click_pp_rr1", "우드블록 여리게", 0.14),
        ("pedal", S + "pedal_down_rr2", "하이햇 페달 누름 (기계음)", 0.06),
        ("rim", B + "snare_14__rc__", "스네어 림 클릭", 0.12),
    ]),
    "slide": ("값 바꾸기", "난이도·설정 값 ←→", -27, [
        ("hat", S + "hh_tight_vl9_rr1", "하이햇 꽉 닫고 팁으로", 0.10),
        ("cabasa", V + "Cabasa__Cabasa1_Hit_rr1_Mid", "카바사 한 번", 0.16),
        ("shaker", V + "Shaker_Small__Mid_ShakerHighFaster_Down_rr1", "작은 셰이커 한 번", 0.14),
        ("wood", V + "Woodblock__wood_click2_mp", "우드블록 보통", 0.14),
    ]),
    "slideBig": ("값 크게 바꾸기", "설정 값 Shift+←→", -25, [
        ("ratchet", V + "Ratchet__Ratchet1_Crank_rr1_Mid", "래칫 한 번 감기", 0.30),
        ("ratchet2", V + "Ratchet__Ratchet2_Crank_v1_rr1_Mid", "래칫 (다른 악기)", 0.30),
        ("hat", S + "hh_tight_vl13_rr3", "하이햇 꽉 닫고 세게", 0.14),
    ]),
    "tab": ("탭·키 모드 전환", "Q/E, Tab", -23, [
        ("log", V + "Slit_Drum__LogDrumHi_MedM_v2_rr1_Sum", "로그 드럼 높은 음", 0.35),
        ("tomrim", V + "Tom_1__TomH_rimS_v4_rr1_Mid", "탐 림 클릭", 0.25),
        ("side", B + "snare_14__sidestick__top__sn_ss_vl3_rr2", "스네어 사이드 스틱", 0.25),
    ]),
    "confirm": ("결정", "Enter, 시작 화면", -21, [
        ("claves", V + "Claves__Claves1_Hit_v3_rr1_Mid", "클라베스", 0.35),
        ("side", B + "snare_14__tsidestick__", "사이드 스틱 (세운 스틱)", 0.3),
        ("wood", V + "Woodblock__wood_click_f_rr1", "우드블록 세게", 0.3),
    ]),
    "back": ("뒤로·닫기", "Esc", -23, [
        ("log", V + "Slit_Drum__LogDrumLo_MedM_v2_rr1_Sum", "로그 드럼 낮은 음", 0.4),
        ("frame", V + "Frame_Drum__HDrumS_HitMuted_v3_rr1_Sum", "프레임 드럼 막고 치기", 0.3),
        ("bongo", V + "Bongos__BongoH_HitMuted1_v3_rr1_Mid", "봉고 막고 치기", 0.3),
    ]),
    "open": ("패널 열기", "플레이 옵션 Space, 설정 F10", -23, [
        ("chik", B + "hihat_14__chik__", "하이햇 발로 닫기 (칙)", 0.25),
        ("slap", V + "Slapstick__slapstick_quiet_rr1", "슬랩스틱 여리게", 0.2),
        ("chime", V + "Hand_Chimes__sus_C6_r01_main", "핸드 차임 C6", 1.2),
    ]),
    "on": ("켬", "스위치 행을 켤 때, 키 지정", -23, [
        ("tri", V + "Triangles__Triangle6_HitM_v2_rr1_Mid", "트라이앵글 막고 치기", 0.4),
        ("cow", V + "Cowbells__Cowbell1_Muted_v3_rr1_Mid", "카우벨 막고 치기", 0.3),
        ("agogo", V + "Agogo_Bells__Agogo_High_v3_rr1_Mid", "아고고 벨 높은 음", 0.35),
    ]),
    "off": ("끔", "스위치 행을 끌 때", -25, [
        ("slap", V + "Slapstick__slapstick_quiet_rr1", "슬랩스틱 여리게", 0.2),
        ("cow", V + "Cowbells__Cowbell2_Muted_v3_rr1_Mid", "카우벨 낮은 것 막고 치기", 0.3),
        ("return", S + "pedal_return_rr1", "하이햇 페달 돌아옴 (기계음)", 0.3),
    ]),
    "edge": ("더 갈 곳 없음", "목록·값의 끝, 시안에 없는 기능", -25, [
        ("frame", V + "Frame_Drum__HDrumS_HitMuted_v3_rr1_Sum", "프레임 드럼 막고 치기", 0.25),
        ("cajon", V + "Cajon__Cajon_hit1_f_rr1", "카혼 낮은 음", 0.3),
        ("snareoff", V + "Snare_Drum_Modern_1__Snare2_HitNS_v5_rr1_Mid", "스네어 (스내피 끄고)", 0.3),
    ]),
    "danger": ("초기화", "모두 초기화를 두 번 눌렀을 때", -19, [
        ("anvil", V + "Anvil__Anvil_Hit1_v2_rr1_Mid", "앤빌", 0.8),
        ("slap", V + "Slapstick__slapstick_rr1", "슬랩스틱 세게", 0.5),
    ]),
    "start": ("플레이 시작", "선곡에서 Enter", -15, [
        ("bassdrum", V + "Bass_Drum_1__BDrumNew_hit_v5_rr1_Sum", "콘서트 베이스 드럼", 2.6),
        ("timpani", V + "Timpani_1__Timpani3_Hit_v4_rr1_Sum", "팀파니", 3.0),
        ("kick", B + "kick_24__kick__kick__k_vl13", "24인치 킥 드럼", 1.0),
        ("frame", V + "Frame_Drum__HDrumL_Hit_v3_rr1_Sum", "큰 프레임 드럼", 2.4),
    ]),
    "hit": ("타격음", "플레이 중 노트를 쳤을 때 (설정 → 소리 → 타격음)", -21, [
        ("claves", V + "Claves__Claves1_Hit_v2_rr1_Mid", "클라베스", 0.16),
        ("side", B + "snare_14__sidestick__top__sn_ss_vl4_rr1", "스네어 사이드 스틱", 0.16),
        ("hat", S + "hh_tight_vl13_rr3", "하이햇 꽉 닫고", 0.10),
        ("wood", V + "Woodblock__wood_click_ff", "우드블록", 0.16),
        ("clap", V + "Claps__SoloClap_vl3", "손뼉 한 번", 0.2),
    ]),
    "miss": ("콤보 끊김", "10 콤보 넘게 잇다가 끊겼을 때", -26, [
        ("snareoff", V + "Snare_Drum_Modern_1__Snare2_HitNS_v5_rr1_Mid", "스네어 (스내피 끄고)", 0.3),
        ("cajon", V + "Cajon__Cajon_hit1_f_rr1", "카혼 낮은 음", 0.3),
        ("tom", V + "Tom_1__TomH_HitS_v4_rr1_Mid", "하이 탐", 0.5),
    ]),
    "combo": ("콤보 100 단위", "100, 200, 300… 콤보", -22, [
        ("tri", V + "Triangles__Triangle1_HitM_v1_rr2_Mid", "트라이앵글 막고 치기", 0.5),
        ("fing", V + "Finger_Cymbals__Fing_Cymb", "핑거 심벌", 1.4),
        ("glock", V + "Glockenspiel__glock_loud_C7_01", "글로켄슈필 C7", 1.2),
        ("agogo", V + "Agogo_Bells__Agogo_High_v3_rr1_Mid", "아고고 벨", 0.4),
    ]),
    "fever": ("FEVER", "FEVER가 켜질 때", -20, [
        ("belltree", V + "Bell_Tree__BellTree_Stroke_1_Mid", "벨 트리 훑기", 2.6),
        ("marktree", V + "Mark_Trees__windchimes_fastAsc1", "마크 트리 올려 훑기", 2.8),
        ("cymbell", V + "Suspended_Cymbal_1__susCymb1_hit_bell_mf1", "심벌의 벨", 2.2),
        ("vibes", V + "Vibraphone__Vibes_hard_E5_v3_rr1_Main", "비브라폰 E5", 2.4),
    ]),
    "pause": ("일시정지", "플레이 중 Esc", -23, [
        ("close", V + "Hi_Hat_Cymbal__HiHat_Close_rr1_Mid", "하이햇 발로 닫기", 0.3),
        ("log", V + "Slit_Drum__LogDrumLo_MedM_v2_rr1_Sum", "로그 드럼 낮은 음", 0.4),
        ("return", S + "pedal_return_rr3", "하이햇 페달 돌아옴 (기계음)", 0.3),
    ]),
    "result": ("결과", "플레이가 끝났을 때", -16, [
        ("crash", V + "Clash_Cymbals_1__cymbal_crash1_short1", "클래시 심벌 짧게", 2.2),
        ("timpani", V + "Timpani_1__Timpani1_Hit_v4_rr1_Sum", "팀파니", 3.0),
        ("vibes", V + "Vibraphone__Vibes_hard_C5_v3_rr1_Main", "비브라폰 C5", 2.6),
    ]),
}


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-9))


def rms_window(mono: np.ndarray, n: int) -> float:
    """RMS of the loudest n-sample window."""
    if len(mono) <= n:
        return float(np.sqrt(np.mean(mono**2)))
    c = np.cumsum(np.insert(mono**2, 0, 0.0))
    return float(np.sqrt(np.max(c[n:] - c[:-n]) / n))


def find(prefix: str) -> Path:
    hits = sorted(RAW.glob(prefix + "*"))
    if not hits:
        raise SystemExit(f"no raw sample for {prefix}")
    return hits[0]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.wav"):
        old.unlink()
    manifest = {m["file"]: m for m in json.loads((ROOT / "_src" / "sfx" / "manifest.json").read_text())}
    events = []
    report = []
    for event, (label, where, level, candidates) in KIT.items():
        made = []
        for cid, prefix, what, longest in candidates:
            src = find(prefix)
            x, sr = sf.read(src, dtype="float64", always_2d=True)
            if sr != SR:
                raise SystemExit(f"{src.name}: {sr} Hz")
            raw_peak = float(np.max(np.abs(x)))
            mono = x.mean(axis=1)
            env = np.abs(mono)
            peak = float(env.max())
            # from just before the hit (1 ms ahead of the first sample within 30 dB of the peak)
            first = int(np.argmax(env > peak * 0.03))
            start = max(0, first - int(0.001 * SR))
            end = min(len(x), start + int(longest * SR))
            cut = x[start:end].copy()
            # a short fade in over the lead, and out over the last quarter (at least 8 ms)
            lead = min(len(cut), max(1, first - start))
            cut[:lead] *= np.linspace(0.0, 1.0, lead)[:, None]
            fade = min(len(cut), max(int(0.008 * SR), len(cut) // 4))
            cut[-fade:] *= (np.linspace(1.0, 0.0, fade) ** 2)[:, None]
            m = cut.mean(axis=1)
            loud = rms_window(m, int(0.03 * SR))
            gain = 10 ** ((level - db(loud)) / 20)
            # never over -1 dBFS
            gain = min(gain, 10 ** (-1 / 20) / float(np.max(np.abs(cut))))
            cut *= gain
            name = f"{event}-{cid}.wav"
            sf.write(OUT / name, cut, SR, subtype="PCM_16")
            m = cut.mean(axis=1)
            # what is left under the hit: the quietest 20 ms of the raw file
            n20 = int(0.02 * SR)
            floor = min(float(np.sqrt(np.mean(mono[i : i + n20] ** 2))) for i in range(0, max(1, len(mono) - n20), n20))
            rel = str(src.relative_to(RAW.parent))
            info = manifest.get(rel, {})
            report.append(
                {
                    "file": name,
                    "event": event,
                    "raw": rel,
                    "source": info.get("source_name", ""),
                    "license": info.get("license", ""),
                    "page_url": info.get("page_url", ""),
                    "download_url": info.get("download_url", ""),
                    "channels": int(x.shape[1]),
                    "duration_ms": round(len(cut) / SR * 1000),
                    "raw_peak_dbfs": round(db(raw_peak), 1),
                    "raw_clipped_samples": int(np.sum(np.abs(x) >= 0.999)),
                    "raw_noise_floor_dbfs": round(db(floor), 1),
                    "trim_start_ms": round(start / SR * 1000, 1),
                    "gain_db": round(db(gain), 1),
                    "peak_dbfs": round(db(float(np.max(np.abs(cut)))), 1),
                    "rms30_dbfs": round(db(rms_window(m, int(0.03 * SR))), 1),
                }
            )
            r = report[-1]
            made.append(
                {
                    "id": cid,
                    "file": name,
                    "label": what,
                    "source": "VCSL" if prefix.startswith(V) else "Karoryfer Samples",
                    "raw": src.name,
                    "page": r["page_url"],
                    "license": r["license"],
                    "durationMs": r["duration_ms"],
                    "peakDb": r["peak_dbfs"],
                    "rmsDb": r["rms30_dbfs"],
                    "gainDb": r["gain_db"],
                    "floorDb": r["raw_noise_floor_dbfs"],
                    "clipped": r["raw_clipped_samples"],
                }
            )
        events.append({"id": event, "label": label, "where": where, "candidates": made})
    (OUT / "kit.json").write_text(json.dumps({"events": events}, ensure_ascii=False, indent=1))
    (ROOT / "_src" / "sfx" / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1))
    for r in report:
        print(f"{r['file']:26} {r['duration_ms']:5} ms  peak {r['peak_dbfs']:6}  rms30 {r['rms30_dbfs']:6}  gain {r['gain_db']:+6}  raw peak {r['raw_peak_dbfs']:6} clip {r['raw_clipped_samples']} floor {r['raw_noise_floor_dbfs']}")
    print(sum(f.stat().st_size for f in OUT.glob('*.wav')) // 1024, "KB")


if __name__ == "__main__":
    main()
