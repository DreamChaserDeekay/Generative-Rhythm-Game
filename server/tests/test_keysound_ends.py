"""One sound per keysound (generator 0.9.51, docs/PATTERN_DESIGN.md 93): every note that follows a
stem carries `srcEnd`, where its own sound in that stem ends (the stem's next sound), so the
client's keysound slice stops there and the stem's sounds no note took stay in the background."""

from __future__ import annotations

from functools import lru_cache

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.chart.keysounds import mark_sound_ends
from rhythm_server.synth import make_structured_song

from fakes import made_chart


def _onset(t: float, stem: str, share: float = 0.9, attack: float = 0.9) -> dict:
    names = ("drums", "bass", "vocals", "other")
    sources = [share if n == stem else (1.0 - share) / 3 for n in names]
    return {"t": t, "source": stem, "sources": sources, "attack": attack}


def test_a_note_ends_at_its_stems_next_sound() -> None:
    analysis = {
        "durationMs": 10000.0,
        "onsets": [
            _onset(1020.0, "other"),  # the note's own onset, 20 ms late: not its end
            _onset(1100.0, "drums"),  # another stem's sound: not its end
            _onset(1200.0, "other", attack=0.2),  # a sounding note swelling (no sure attack): not its end
            _onset(1300.0, "drums", share=0.7),  # a drum hit with 0.1 of "other": not its end
            _onset(1500.0, "other"),  # the next guitar note
            _onset(2000.0, "vocals"),
            _onset(9000.0, "vocals"),
        ],
    }
    notes = [
        {"t": 1000.0, "src": "other", "type": "tap"},
        {"t": 2000.0, "src": "vocals", "type": "hold", "endT": 2600.0},  # a long note keeps its length
        {"t": 2700.0, "src": "vocals", "type": "tap"},  # the next vocal sound is past the cap
        {"t": 3000.0, "type": "tap"},  # no stem: no keysound
    ]
    mark_sound_ends(notes, analysis)
    assert notes[0]["srcEnd"] == 1500.0
    assert notes[1]["srcEnd"] == 2000.0 + 4000.0  # the next vocal sound is past the cap; at least its end
    assert notes[2]["srcEnd"] == 2700.0 + 4000.0
    assert "srcEnd" not in notes[3]


def test_an_analysis_without_stem_shares_adds_nothing() -> None:
    notes = [{"t": 1000.0, "src": "drums", "type": "tap"}]
    mark_sound_ends(notes, {"durationMs": 5000.0, "onsets": [{"t": 1500.0, "strength": 1.0}]})
    assert "srcEnd" not in notes[0]


@lru_cache(maxsize=None)
def _analysis() -> dict:
    s = make_structured_song(bpm=128.0, seed=2)
    return analyze(s.pcm, s.sample_rate, "sha256:keysound-ends", backends={})


def test_generated_charts_carry_the_end_of_each_notes_sound() -> None:
    a = _analysis()
    chart = made_chart(a, "6K", "EXPERT", count=400)
    followed = [n for n in chart["notes"] if n.get("src")]
    assert followed and all("srcEnd" in n for n in followed)
    for n in followed:
        assert n["t"] < n["srcEnd"] <= n["t"] + 4000.0 + 1e-6 or n["srcEnd"] >= a["durationMs"] - 1e-6
        if n["type"] == "hold":
            assert n["srcEnd"] >= n["endT"]
    # one sound each: most slices end before the next note of their stem would have ended them
    by_stem: dict[str, list[dict]] = {}
    for n in followed:
        by_stem.setdefault(n["src"], []).append(n)
    shorter = total = 0
    for ns in by_stem.values():
        ns.sort(key=lambda n: n["t"])
        for a_, b_ in zip(ns, ns[1:]):
            if b_["t"] - a_["t"] > 30.0:
                total += 1
                shorter += a_["srcEnd"] < b_["t"] - 1e-6
    assert total and shorter / total > 0.3
