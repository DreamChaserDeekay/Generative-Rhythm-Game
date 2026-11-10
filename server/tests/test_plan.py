"""The section plan (generator/plan.py, docs/PATTERN_DESIGN.md 74): a model fitted on human BMS
charts gives each unit of the sectioned engine its density and its chord weight against the song's,
in place of the label multipliers."""

from __future__ import annotations

from functools import lru_cache

import numpy as np

from rhythm_server.analysis.analyzer import analyze
from rhythm_server.config import difficulty_config, load_config
from rhythm_server.generator import plan
from rhythm_server.generator import sections as sectioned
from rhythm_server.generator.candidates import build_candidates, swing_bars
from rhythm_server.generator.core import generate_chart
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.tempo import TempoMap
from rhythm_server.synth import make_structured_song


@lru_cache(maxsize=None)
def structured() -> dict:
    song = make_structured_song(bpm=124.0, seed=1)
    return analyze(song.pcm, song.sample_rate, "sha256:plan-structured-124-1", backends={})


def units_and_raw(analysis: dict):
    tempo = TempoMap(analysis["timing"])
    params = resolve_params("7K+1S", "EXPERT")
    cands = build_candidates(analysis, tempo, params, float(difficulty_config()["snapToleranceMs"]), swing_bars(analysis, tempo))
    units = sectioned.make_units(analysis["sections"], cands[0].beat, cands[-1].beat, tempo.beats_per_bar)
    return units, cands, plan.unit_raw(units, cands, analysis, tempo)


def test_the_models_evaluate_as_written() -> None:
    """plan.json holds boosted trees as node arrays (sklearn HistGradientBoosting: a row goes left
    when its feature is at most the threshold) or a linear model; both run on numpy alone."""
    x = np.array([[-1.0, 2.0], [0.5, -3.0], [0.0, 0.0]])
    tree = {"feature": [0, 0, 0], "threshold": [0.0, 0.0, 0.0], "left": [1, 0, 0], "right": [2, 0, 0],
            "value": [0.0, -1.0, 1.0], "leaf": [0, 1, 1], "depth": 2}
    out = plan._trees(x, {"baseline": 0.5, "trees": [tree, tree]})
    assert np.allclose(out, [-1.5, 2.5, -1.5])
    net = {"mean": [0.0, 0.0], "scale": [1.0, 1.0], "layers": [{"w": [[1.0], [0.0]], "b": [0.0]}, {"w": [[2.0]], "b": [1.0]}]}
    assert np.allclose(plan._mlp(x, net), [1.0, 2.0, 1.0])  # ReLU between the layers


def test_the_fitted_plan_reads_the_music_of_the_units() -> None:
    """The shipped models give every unit of the structured song a finite log ratio, and the units
    with the most to play (candidates' scores per beat) are planned the densest."""
    analysis = structured()
    units, _, raw = units_and_raw(analysis)
    groups = [u.group for u in units]
    dens = plan.predict(raw, "density", groups)
    chord = plan.predict(raw, "chord", groups)
    assert dens is not None and chord is not None and np.all(np.isfinite(dens)) and np.all(np.isfinite(chord))
    busy = raw[:, plan.RAW.index("scoreRate")]
    order = lambda v: np.argsort(np.argsort(v))  # noqa: E731
    assert np.corrcoef(order(dens), order(busy))[0, 1] > 0.3
    # the design standardises within the song: a louder copy of the music plans the same
    louder = raw.copy()
    for name in ("scoreRate", "strengthRate", "worthRate", "loud", "loudMax"):
        louder[:, plan.RAW.index(name)] *= 1.0 + 1e-9
    assert np.allclose(plan.predict(louder, "density", groups), dens, atol=1e-3)


def test_the_plan_moves_the_notes_where_it_says(monkeypatch) -> None:
    """The engine spreads the notes by the plan's density: a plan that wants the second half e^2
    times as dense as the first gets a denser second half than a flat plan (1.15 -> 3.53 notes
    after the middle per note before it; repeats of the same music play their lightest unit's
    notes and add at most half again over them, plan.json repeatExtra)."""
    analysis = structured()

    def halves(chart: dict) -> float:
        beats = [n["beat"] for n in chart["notes"]]
        mid = 0.5 * (min(beats) + max(beats))
        return sum(b >= mid for b in beats) / max(1, sum(b < mid for b in beats))

    def flat(raw, target, groups=None):
        return np.zeros(len(raw)) if target == "density" else None

    def rising(raw, target, groups=None):
        if target != "density":
            return None
        pos = raw[:, plan.RAW.index("songPos")]
        return np.where(pos >= 0.5, 1.0, -1.0)

    monkeypatch.setitem(load_config("plan"), "enabled", True)
    monkeypatch.setattr(plan, "predict", flat)
    even = halves(generate_chart(analysis, "6K", "HARD"))
    monkeypatch.setattr(plan, "predict", rising)
    later = halves(generate_chart(analysis, "6K", "HARD"))
    assert later > 1.15 * even, (even, later)


def test_the_plan_moves_long_notes_and_jacks_where_it_says(monkeypatch) -> None:
    """The long-note plan weighs the long notes' places (to the power holdPower) and the jack plan
    scales the lane search's same-lane cost (2^-jackGain where a unit wants twice the song's jacks):
    a plan that wants long notes in the second half puts more of them there than a flat plan (3.5
    times as late), and one that wants jacks there hands the lane search's slots there a same-lane
    cost scale of exp(-jackGain) and the others exp(jackGain). (Until 0.9.42 this counted the jacks
    of one EXPERT chart: 1.5 times as late. Since 0.9.43's roll shapes the share moves 0.45-1.2 times
    over four seeds, the lane search's other costs having the last word on a song this small; the jack
    plan ships off, jackGain 0.)"""
    import rhythm_server.generator.core as core

    analysis = structured()
    cfg = load_config("plan")
    monkeypatch.setitem(cfg, "enabled", True)
    monkeypatch.setitem(cfg, "holdPower", 3.0)
    monkeypatch.setitem(cfg, "jackGain", 2.0)

    def later(chart: dict, what) -> float:
        beats = [n["beat"] for n in chart["notes"]]
        mid = 0.5 * (min(beats) + max(beats))
        late = [what(chart["notes"], i) for i, n in enumerate(chart["notes"]) if n["beat"] >= mid]
        early = [what(chart["notes"], i) for i, n in enumerate(chart["notes"]) if n["beat"] < mid]
        return (sum(late) + 1) / (sum(early) + 1)

    def is_hold(notes: list[dict], i: int) -> bool:
        return notes[i]["type"] == "hold"

    scales: list[tuple[float, float]] = []  # (slot beat, same-lane cost scale) the lane search gets
    real_search = sectioned.search

    def search(slots, *args, **kwargs):
        scales.extend((s.beat, s.jack_scale) for s in slots)
        return real_search(slots, *args, **kwargs)

    monkeypatch.setattr(sectioned, "search", search)

    def chart(plan_of) -> dict:
        monkeypatch.setattr(plan, "predict", plan_of)
        core._plan_cache.clear()
        scales.clear()
        return generate_chart(analysis, "7K+1S", "EXPERT")

    def flat(raw, target, groups=None):
        return np.zeros(len(raw)) if target in ("hold", "jack") else None

    def rising(raw, target, groups=None):
        if target not in ("hold", "jack"):
            return None
        return np.where(raw[:, plan.RAW.index("songPos")] >= 0.5, 1.0, -1.0)

    even = chart(flat)
    assert scales and all(abs(x - 1.0) < 1e-9 for _, x in scales)
    late = chart(rising)
    mid = 0.5 * (min(b for b, _ in scales) + max(b for b, _ in scales))
    early_scale = np.mean([x for b, x in scales if b < 0.8 * mid])
    late_scale = np.mean([x for b, x in scales if b > 1.2 * mid])
    assert late_scale < 0.5 < 2.0 < early_scale, (early_scale, late_scale)
    assert later(late, is_hold) > 1.2 * later(even, is_hold), (later(even, is_hold), later(late, is_hold))
