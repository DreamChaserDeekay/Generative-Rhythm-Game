"""The 6-stem lead node (docs/PATTERN_DESIGN.md 86): Demucs' guitar and piano kept beside the four
stems, each onset's instrument shares, each section's lead, and the generator's solo following the
lead instrument's notes."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis import ml
from rhythm_server.analysis.backends import demucs_backend
from rhythm_server.config import load_config
from rhythm_server.generator.candidates import Candidate, _mark_solos

SR = 22050


def test_six_stem_output_keeps_guitar_and_piano_and_four_stems_still_add_up() -> None:
    rng = np.random.default_rng(1)
    n = SR
    raw = {k: rng.normal(0, 0.1, (n, 2)).astype(np.float32) for k in ("drums", "bass", "vocals", "guitar", "piano", "other")}
    mix = sum(raw.values()) + rng.normal(0, 1e-3, (n, 2))
    out = demucs_backend._normalise(raw, mix, SR, SR)
    assert set(out) == {"drums", "bass", "vocals", "other", "guitar", "piano"}
    four = sum(out[k].astype(np.float64) for k in ("drums", "bass", "vocals", "other"))
    assert float(np.max(np.abs(four - mix))) < 1e-4
    assert np.allclose(out["guitar"], raw["guitar"], atol=1e-6)
    # a 4-stem model gives no instrument stems
    four_only = demucs_backend._normalise({k: raw[k] for k in ("drums", "bass", "vocals", "other")}, mix, SR, SR)
    assert set(four_only) == {"drums", "bass", "vocals", "other"}


def _plucks(times: list[float], n: int, hz: float) -> np.ndarray:
    y = np.zeros(n)
    t = np.arange(int(0.25 * SR)) / SR
    note = np.sin(2 * np.pi * hz * t) * np.exp(-t * 12)
    for s in times:
        a = int(s * SR)
        y[a : a + len(note)] += note[: max(0, min(len(note), n - a))]
    return y


def test_onsets_get_their_instrument_and_sections_their_lead() -> None:
    n = 8 * SR
    quiet = np.zeros(n)
    guitar_t = [0.5 + 0.5 * i for i in range(7)]  # the first 4 s
    piano_t = [4.5 + 0.5 * i for i in range(7)]  # the last 4 s
    stems = {
        "drums": quiet.copy(), "bass": quiet.copy(), "vocals": quiet.copy(),
        "guitar": _plucks(guitar_t, n, 330.0), "piano": _plucks(piano_t, n, 523.0),
    }
    stems["other"] = stems["guitar"] + stems["piano"]  # guitar and piano are parts of "other"
    act = ml.instrument_activity(stems, SR)
    assert act is not None
    flux, loud = ml.instrument_shares(act, SR, np.array(guitar_t + piano_t))
    g, p = ml.SIX_STEMS.index("guitar"), ml.SIX_STEMS.index("piano")
    assert np.all(flux[:7, g] > 0.8) and np.all(flux[7:, p] > 0.8)
    sections = [{"t": 0.0, "endT": 4000.0}, {"t": 4000.0, "endT": 8000.0}]
    ml.section_leads(sections, np.array(guitar_t + piano_t) * 1000.0, loud)
    assert sections[0]["lead"] == "guitar" and sections[1]["lead"] == "piano"
    assert sections[0]["leadShares"]["guitar"] > 0.8
    # four stems only: no instrument activity
    assert ml.instrument_activity({k: v for k, v in stems.items() if k not in ("guitar", "piano")}, SR) is None


def _cand(beat: float, guitar: float, melody: float) -> Candidate:
    return Candidate(beat=beat, t=beat * 500.0, subdivision=1, strength=0.5, bands=np.ones(3), pitch=60.0, harmonic=0.7,
                     sustain_beats=0.5, intensity=0.5, downbeat=False, sources=np.array([0.1, 0.2, 0.3, 0.4]), melody=melody,
                     attack=0.8, instruments={"guitar": guitar, "piano": 0.0})


def test_a_guitar_led_section_is_a_solo_on_the_guitar_notes() -> None:
    cfg = load_config("instruments")["rhythmSource"]["melody"]
    # 0-16 s led by the guitar; 16-32 s led by the vocals (a 6-stem analysis, but no instrument lead)
    sections = [
        {"t": 0.0, "endT": 16000.0, "leader": "drums", "lead": "guitar", "leadShares": {"vocals": 0.1, "guitar": 0.7, "piano": 0.0, "other": 0.2}},
        {"t": 16000.0, "endT": 32000.0, "leader": "drums", "lead": "vocals", "leadShares": {"vocals": 0.7, "guitar": 0.1, "piano": 0.0, "other": 0.2}},
    ]
    # the core melody says the opposite of the guitar share in the guitar section
    cands = [_cand(b, guitar=0.9 if b % 2 == 0 else 0.1, melody=0.0 if b % 2 == 0 else 1.0) for b in range(64)]
    _mark_solos(cands, {"onsets": []}, sections, cfg)
    first, second = cands[:32], cands[32:]
    assert all(c.solo for c in first)
    assert [c.lead_note for c in first] == [b % 2 == 0 for b in range(32)]
    assert not any(c.solo for c in second) and all(c.lead_note is None for c in second)


def test_a_weak_lead_or_an_analysis_without_leads_keeps_the_old_solo_rule() -> None:
    cfg = load_config("instruments")["rhythmSource"]["melody"]
    weak = [{"t": 0.0, "endT": 16000.0, "leader": "other", "lead": "guitar",
             "leadShares": {"vocals": 0.28, "guitar": 0.29, "piano": 0.15, "other": 0.28}}]
    old = [{"t": 0.0, "endT": 16000.0, "leader": "other"}]
    for sections in (weak, old):
        cands = [_cand(b, guitar=0.9, melody=1.0) for b in range(32)]
        onsets = [{"t": c.t, "melody": 1.0} for c in cands]
        _mark_solos(cands, {"onsets": onsets}, sections, cfg)
        assert all(c.solo for c in cands)  # the 4-stem rule: leader "other", all onsets melody notes
        assert all(c.lead_note is None for c in cands)
