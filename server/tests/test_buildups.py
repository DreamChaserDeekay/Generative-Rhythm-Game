"""Build-ups in a dense mix and coarser sections (generator 0.9.32, analyzer 1.10.0, PATTERN_DESIGN 64):
a snare roll goes on under a bass line on other grid points and under a lead doubling it, a build-up
is found from the bar its roll gets steady, the camera closes in through it, a bar line with no
change is no section boundary, and a short burst heard once is no highlight. USAO - RUNAWAY played
no build-up roll and came out in 30 sections."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis.structure import bar_vectors, boundary_scores, label_sections, repeat_threshold, segment_bars
from rhythm_server.generator.candidates import Candidate
from rhythm_server.generator.effects import camera_effects
from rhythm_server.generator.rolls import find_rolls
from rhythm_server.generator.tempo import TempoMap

SNARE = np.array([0.2, 0.7, 0.1])
BASS = np.array([0.8, 0.15, 0.05])


def _hit(beat: float, bands: np.ndarray = SNARE, **kw) -> Candidate:
    frac = beat % 1
    sub = 1 if frac == 0 else 2 if frac == 0.5 else 3 if round(frac * 3, 6) in (1, 2) else 4
    base = dict(beat=beat, t=beat * 500.0, subdivision=sub, strength=1.0, bands=bands, pitch=None, harmonic=0.3, sustain_beats=0.1,
                intensity=0.5, downbeat=beat % 4 == 0, sources=np.array([0.7, 0.1, 0.1, 0.1]), melody=0.0, attack=0.9)
    base.update(kw)
    return Candidate(**base)


def _beats(c: list[Candidate], roll) -> list[float]:
    return [c[i].beat for i in roll.hits]


def test_a_roll_goes_on_under_another_sound() -> None:
    """A snare build-up (eighths, then sixteenths) with bass notes on the triplet grid between its
    hits: the bass cut the run every few hits, so no roll was found."""
    snare = [40 + 0.5 * k for k in range(8)] + [44 + 0.25 * k for k in range(16)]
    bass = [b + d for b in range(40, 48) for d in (1 / 3, 2 / 3)]
    cands = sorted([_hit(b) for b in snare] + [_hit(b, BASS, strength=0.8, harmonic=0.6) for b in bass], key=lambda c: c.beat)
    rolls = find_rolls(cands, [32.0, 48.0])
    assert len(rolls) == 1 and _beats(cands, rolls[0]) == snare


def test_a_lead_doubling_a_roll_leaves_it_a_roll() -> None:
    """A lead or riser playing over a build-up lifts its melody presence (RUNAWAY 0.5-0.9); a drum's
    estimated pitch jumps about, a melody's moves by steps. Away from a new section it is no
    build-up, and the melody counts."""
    beats = [40 + 0.25 * k for k in range(32)]
    scattered = [60.0, 84.0, 55.0, 90.0, 66.0, 48.0, 79.0, 61.0]
    drum = [_hit(b, melody=1.0, pitch=scattered[k % 8]) for k, b in enumerate(beats)]
    assert len(find_rolls(drum, [48.0])) == 1
    assert find_rolls(drum, [80.0]) == []
    line = [_hit(b, melody=1.0, pitch=60.0 + (k % 8)) for k, b in enumerate(beats)]
    assert find_rolls(line, [48.0]) == []


def test_a_build_up_is_found_from_the_bar_its_roll_gets_steady() -> None:
    """Two bars of a lead's eighths run straight into a bar of snare eighths: as one run, and from
    its second bar, it is a melody; from its third bar on it is the build-up."""
    beats = [40 + 0.5 * k for k in range(24)]
    cands = [_hit(b, melody=1.0, pitch=60.0 + (k % 4)) if b < 48 else _hit(b) for k, b in enumerate(beats)]
    rolls = find_rolls(cands, [52.0])
    assert len(rolls) == 1 and _beats(cands, rolls[0])[0] == 48.0


def test_the_camera_closes_in_through_a_build_up_roll() -> None:
    """A roll of a bar or more that ends within two bars of a new section closes the view in from
    the bar it starts in, whatever the section is called, and lets go where the next one lands."""
    tempo = TempoMap({"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}]})
    song = [{"startBeat": s, "endBeat": e, "label": lab, "energy": en, "stems": [0.3, 0.2, 0.25, 0.25]}
            for s, e, lab, en in ((0, 48, "verse", 0.6), (48, 80, "verse", 0.7), (80, 96, "outro", 0.4))]
    views = [(e["beat"], e["value"]) for e in camera_effects(song, tempo, rolls=[(41.0, 46.5)]) if e["type"] == "view"]
    assert views == [(40.0, 0.5), (44.0, 1.0), (48.0, 0.0)]
    # a fill of under a bar, or a roll far from the next section, is no build-up
    assert not [e for e in camera_effects(song, tempo, rolls=[(45.0, 46.5)]) if e["type"] == "view"]
    assert not [e for e in camera_effects(song, tempo, rolls=[(20.0, 30.0)]) if e["type"] == "view"]


def test_a_bar_line_with_no_change_is_no_boundary() -> None:
    """The 8-bar grid bonus alone (0.35) let a boundary in wherever the music barely changed."""
    rng = np.random.default_rng(5)
    a, b = rng.normal(size=16), rng.normal(size=16)
    beats = np.array([a + 0.3 * rng.normal(size=16) for _ in range(8 * 4)] + [b + 0.3 * rng.normal(size=16) for _ in range(24 * 4)])
    starts, vecs = bar_vectors(beats, 0, 4)
    ssm = vecs @ vecs.T
    assert segment_bars(boundary_scores(ssm, repeat_threshold(ssm)), len(starts)) == [0, 8]


def test_a_short_burst_heard_once_is_no_highlight() -> None:
    """The last four bars of a build-up hit hardest of all (RUNAWAY's came out the only chorus);
    a highlight lasts eight bars or comes back."""
    spans = [(0, 8), (8, 16), (16, 20), (20, 28), (28, 36), (36, 44)]
    groups = [0, 1, 2, 1, 3, 4]
    energy = np.array([0.2, 0.6, 1.0, 0.6, 0.92, 0.1])
    labels = label_sections(spans, groups, energy)
    assert labels[2] != "chorus" and labels[4] == "chorus"
