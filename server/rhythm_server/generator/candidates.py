"""Onsets -> grid-quantized, scored note candidates."""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Any

import numpy as np
from scipy.ndimage import uniform_filter1d

from ..analysis.stems import STEM_NAMES
from ..config import difficulty_config, load_config
from .params import GenParams
from .tempo import TempoMap

# Snap preference: simpler rhythms first; triplets only when they fit clearly better.
SNAP_ORDER = (1, 2, 4, 3, 8, 6)
METRICAL_WEIGHT = {1: 0.9, 2: 0.72, 4: 0.5, 3: 0.55, 6: 0.42, 8: 0.32}
DOWNBEAT_WEIGHT = 1.0
# style weights that change the score (params.extra); the note-pick model keeps their effect
SCORE_WEIGHTS = ("subdivisionBoost", "offbeatBoost", "downbeatBoost", "harmonicBoost")


@dataclass
class Candidate:
    beat: float
    t: float
    subdivision: int
    strength: float
    bands: np.ndarray
    pitch: float | None
    harmonic: float
    sustain_beats: float
    intensity: float
    downbeat: bool
    sources: np.ndarray | None = None  # stem shares (drums, bass, vocals, other) when analysed
    leader: int | None = None  # leading stem of the section this candidate is in
    score: float = 0.0
    melody: float | None = None  # how clearly it starts a note of the main melody (0..1)
    roll: tuple[int, int] | None = None  # (roll id, hit index) when it is a hit of a drum roll (rolls.py)
    attack: float = 1.0  # how surely a new sound starts here, not a sounding one changing (0..1)


TRIPLETS = (3, 6)
# as many points of each grid, so scattered onsets favour neither
STRAIGHT_POINTS = (0.25, 0.75)
TRIPLET_POINTS = (1 / 3, 2 / 3)


def _triplet_weights(analysis: dict[str, Any], tempo: TempoMap) -> list[tuple[float, float, float]]:
    """(beat, straight weight, triplet weight) of the onsets clearly on a straight sixteenth or on an
    eighth-note triplet position (config "tripletFeel")."""
    tol = float(difficulty_config()["tripletFeel"]["toleranceBeats"])
    out = []
    for o in analysis["onsets"]:
        b = tempo.ms_to_beat(float(o["t"]))
        f = b - np.floor(b)
        d_straight = min(abs(f - p) for p in STRAIGHT_POINTS)
        d_triplet = min(abs(f - p) for p in TRIPLET_POINTS)
        if d_straight < d_triplet and d_straight <= tol:
            out.append((b, float(o["strength"]), 0.0))
        elif d_triplet < d_straight and d_triplet <= tol:
            out.append((b, 0.0, float(o["strength"])))
    return out


def triplet_bars(analysis: dict[str, Any], tempo: TempoMap) -> set[int] | None:
    """Bars of a triplet-feel song whose own rhythm sits on triplets: the triplet share of the bars
    around each (tripletFeel.localBars on either side) reaches tripletFeel.localMinShare. None when
    the config keeps the whole song on the triplet grid (localBars 0)."""
    cfg = difficulty_config()["tripletFeel"]
    reach = int(cfg.get("localBars", 0))
    if reach <= 0:
        return None
    bpb = tempo.beats_per_bar
    straight: dict[int, float] = {}
    triplet: dict[int, float] = {}
    for b, s, t in _triplet_weights(analysis, tempo):
        bar = int(np.floor(b / bpb))
        straight[bar] = straight.get(bar, 0.0) + s
        triplet[bar] = triplet.get(bar, 0.0) + t
    if not straight and not triplet:
        return set()
    lo, hi = min(straight.keys() | triplet.keys()), max(straight.keys() | triplet.keys())
    out = set()
    for bar in range(lo, hi + 1):
        s = sum(straight.get(j, 0.0) for j in range(bar - reach, bar + reach + 1))
        t = sum(triplet.get(j, 0.0) for j in range(bar - reach, bar + reach + 1))
        if t > 0 and t / (s + t) >= float(cfg["localMinShare"]):
            out.add(bar)
    return out


def triplet_share(analysis: dict[str, Any], tempo: TempoMap) -> float:
    """How much of the song's rhythm between the eighths sits on triplet positions rather than on
    straight sixteenths: the strength-weighted share of the onsets clearly on one or the other
    (config "tripletFeel"). A straight song keeps no triplet grid: an onset a little off its
    sixteenth would otherwise snap to the triplet next to it."""
    weights = _triplet_weights(analysis, tempo)
    straight, triplet = sum(s for _, s, _ in weights), sum(t for _, _, t in weights)
    total = straight + triplet
    return triplet / total if total > 0 else 0.0


def _subdivision_of(beat: float) -> int:
    """Coarsest subdivision (beats split into s parts) that contains this grid position."""
    for s in (1, 2, 3, 4, 6, 8):
        if abs(beat * s - round(beat * s)) < 1e-6:
            return s
    return 8


def snap(t_ms: float, tempo: TempoMap, allowed: tuple[int, ...], tolerance_ms: float) -> tuple[float, int] | None:
    beat = tempo.ms_to_beat(t_ms)
    beat_len = tempo.beat_ms(beat)
    for s in SNAP_ORDER:
        if s not in allowed:
            continue
        q = round(beat * s) / s
        err = abs(tempo.beat_to_ms(q) - t_ms)
        if err <= min(tolerance_ms, 0.3 * beat_len / s):
            return q, _subdivision_of(q)
    return None


def intensity_curve(analysis: dict[str, Any], tempo: TempoMap, n_beats: int) -> np.ndarray:
    """Per-beat intensity (0..1): smoothed loudness blended with onset activity."""
    energy = np.asarray(analysis["energy"]["values"], dtype=np.float64)
    frame_ms = float(analysis["energy"]["frameMs"])
    beats_ms = np.array([tempo.beat_to_ms(b) for b in range(n_beats)])
    loud = np.interp(beats_ms, np.arange(len(energy)) * frame_ms, energy) if len(energy) else np.zeros(n_beats)
    activity = np.zeros(n_beats)
    for o in analysis["onsets"]:
        b = int(np.floor(tempo.ms_to_beat(o["t"])))
        if 0 <= b < n_beats:
            activity[b] += o["strength"]
    loud = uniform_filter1d(loud, size=8, mode="nearest")
    activity = uniform_filter1d(activity, size=8, mode="nearest")

    def norm(x: np.ndarray) -> np.ndarray:
        lo, hi = np.percentile(x, 5), np.percentile(x, 98)
        return np.clip((x - lo) / max(hi - lo, 1e-9), 0, 1)

    return 0.5 * norm(loud) + 0.5 * norm(activity)


def melody_of(onset: dict[str, Any], cfg: dict[str, Any]) -> float | None:
    """Melody presence of an analysed onset; analyses before it was stored (analyzer 1.3.0) give
    it from the vocals share, which says the same less clearly."""
    if onset.get("melody") is not None:
        return float(onset["melody"])
    if not onset.get("sources"):
        return None
    share = float(onset["sources"][STEM_NAMES.index("vocals")])
    lo, hi = cfg["shareFloor"], cfg["shareFull"]
    return float(np.clip((share - lo) / (hi - lo), 0.0, 1.0))


def _section_leader(sections: list[dict[str, Any]], t: float) -> int | None:
    for s in sections:
        if s["t"] <= t < s["endT"] and s.get("leader") in STEM_NAMES:
            return STEM_NAMES.index(s["leader"])
    return None


def build_candidates(
    analysis: dict[str, Any], tempo: TempoMap, params: GenParams, tolerance_ms: float, triplets_in: set[int] | None = None
) -> list[Candidate]:
    """Snapped, scored candidates. With `triplets_in` (bars, see triplet_bars) the triplet grid is
    open only in those bars."""
    duration = float(analysis["durationMs"])
    n_beats = max(1, int(np.ceil(tempo.ms_to_beat(duration))) + 1)
    intensity = intensity_curve(analysis, tempo, n_beats)
    bpb = tempo.beats_per_bar
    sections = analysis.get("sections", [])
    melody_cfg = load_config("instruments")["rhythmSource"]["melody"]
    merged: dict[float, Candidate] = {}
    straight_subs = tuple(s for s in params.subdivisions if s not in TRIPLETS)
    for o in analysis["onsets"]:
        allowed = params.subdivisions
        if triplets_in is not None and int(np.floor(tempo.ms_to_beat(float(o["t"])) / bpb)) not in triplets_in:
            allowed = straight_subs
        snapped = snap(o["t"], tempo, allowed, tolerance_ms)
        if snapped is None:
            continue
        q, sub = snapped
        if q < 0 and tempo.beat_to_ms(q) < 0:
            continue
        key = round(q, 6)
        bands = np.asarray(o["bands"], dtype=np.float64) * o["strength"]
        sustain_beats = 0.0
        if o.get("sustainEnd"):
            sustain_beats = max(0.0, tempo.ms_to_beat(o["sustainEnd"]) - q)
        sources = np.asarray(o["sources"], dtype=np.float64) if o.get("sources") else None
        melody = melody_of(o, melody_cfg)
        attack = float(o.get("attack", 1.0))  # analyses before 1.6.0 have none: every onset counts as one
        c = merged.get(key)
        if c is None:
            b_idx = int(np.clip(np.floor(q), 0, n_beats - 1))
            merged[key] = Candidate(
                beat=q,
                t=tempo.beat_to_ms(q),
                subdivision=sub,
                strength=float(o["strength"]),
                bands=bands,
                pitch=o.get("pitch"),
                harmonic=float(o.get("harmonic", 0.0)),
                sustain_beats=sustain_beats,
                intensity=float(intensity[b_idx]),
                downbeat=sub == 1 and int(round(q)) % bpb == 0,
                sources=sources,
                leader=_section_leader(sections, o["t"]),
                melody=melody,
                attack=attack,
            )
        else:
            stronger = o["strength"] > c.strength
            if sources is not None:
                # strength-weighted mix of the merged onsets' stem shares
                old = c.sources if c.sources is not None else sources
                w_old, w_new = c.strength, float(o["strength"])
                c.sources = (old * w_old + sources * w_new) / max(w_old + w_new, 1e-9)
            c.strength = max(c.strength, float(o["strength"])) + 0.25 * min(c.strength, float(o["strength"]))
            c.bands = c.bands + bands
            if o.get("pitch") is not None and (c.pitch is None or stronger):
                c.pitch = o["pitch"]
            c.harmonic = max(c.harmonic, float(o.get("harmonic", 0.0)))
            c.sustain_beats = max(c.sustain_beats, sustain_beats)
            if melody is not None:
                c.melody = max(c.melody or 0.0, melody)
            c.attack = max(c.attack, attack)
    cands = sorted(merged.values(), key=lambda c: c.beat)
    _end_melody_notes(cands, float(melody_cfg["note"]))
    _score(cands, params)
    return cands


def _end_melody_notes(cands: list[Candidate], presence: float) -> None:
    """A melody note sounds until the melody's next note at the latest (one voice): its sustain
    stops there, so a long note over it ends where the next note of the tune starts, not where a
    pad or a bass under it fades."""
    nxt: float | None = None
    for c in reversed(cands):
        if (c.melody or 0.0) >= presence:
            if nxt is not None:
                c.sustain_beats = min(c.sustain_beats, nxt - c.beat)
            nxt = c.beat


def _stem_source_weight(c: Candidate, params: GenParams, cfg: dict[str, Any]) -> float | None:
    """Rhythm-source weight from stem shares; None when the analysis has no stems. The melody and
    vocal sources go by the melody presence: the stem shares of a drum hit spread over every stem,
    so they hardly tell a sung note from a hi-hat."""
    if c.sources is None:
        return None
    melody = c.melody or 0.0
    if params.rhythm_source == "auto":
        auto = 1.0 if c.leader is None else cfg["autoBase"] + cfg["autoGain"] * float(c.sources[c.leader])
        if params.source_mix:
            # the tier's instruments: a NORMAL chart follows the melody, MAXIMUM every instrument
            mix = sum(float(c.sources[i]) * params.source_mix.get(name, 1.0) for i, name in enumerate(STEM_NAMES))
            lead = max(params.source_mix.get("vocals", 1.0), params.source_mix.get("other", 1.0))
            auto *= melody * lead + (1.0 - melody) * mix
        # easy charts lean on the melody, the hardest follow every instrument as they are (a system
        # may lean less: melody.autoBySystem)
        lean = float(cfg["melody"].get("autoBySystem", {}).get(params.system, cfg["melody"]["auto"]))
        return auto * (1.0 + lean * (1.0 - params.skill) * melody)
    if params.rhythm_source in ("melody", "vocal"):
        m = cfg["melody"]
        return float(m["base"]) + float(m["gain"]) * melody
    mix = cfg["sources"].get(params.rhythm_source, {})
    share = sum(float(c.sources[STEM_NAMES.index(name)]) * w for name, w in mix.items())
    return cfg["base"] + cfg["gain"] * min(1.0, share)


def metrical_power(params: GenParams) -> float:
    """Exponent on the metrical weights: easy charts keep to the beat, harder ones follow the
    song's own rhythm, off-beats and syncopation included (config "metrical" in difficulty.json)."""
    points = sorted((float(a), float(b)) for a, b in difficulty_config()["metrical"]["power"])
    return float(np.interp(params.skill, [a for a, _ in points], [b for _, b in points]))


def _score(cands: list[Candidate], params: GenParams) -> None:
    """Each candidate's score: the hand-made one below, or on a system with a note-pick model
    (config/pick.json) that model's probability blended in by skill, the options (rhythm source,
    style) still multiplying it as they change the hand-made score."""
    hand = _hand_scores(cands, params)
    model = pick_model(params)
    if model is None:
        for c, h in zip(cands, hand):
            c.score = h
        return
    neutral_params = replace(params, rhythm_source="auto", extra={k: v for k, v in params.extra.items() if k not in SCORE_WEIGHTS})
    neutral = hand if neutral_params == params else _hand_scores(cands, neutral_params)
    points = sorted((float(a), float(b)) for a, b in load_config("pick")["share"])
    share = float(np.interp(params.skill, [a for a, _ in points], [b for _, b in points]))
    for c, h, n in zip(cands, hand, neutral):
        c.score = h * (pick_probability(c, model) / n) ** share if n > 0 else 0.0


def pick_model(params: GenParams) -> dict[str, Any] | None:
    """The note-pick model for this system and skill (config/pick.json), or None."""
    cfg = load_config("pick")
    if params.system not in cfg["systems"]:
        return None
    return next((m for m in cfg["models"] if params.skill < float(m["belowSkill"])), cfg["models"][-1])


def pick_features(c: Candidate) -> dict[str, float]:
    """What the note-pick model reads off a candidate."""
    total = float(np.sum(c.bands)) + 1e-9
    src = c.sources if c.sources is not None else np.full(len(STEM_NAMES), 1.0 / len(STEM_NAMES))
    return {
        "logStrength": math.log(max(c.strength, 1e-4)),
        "low": float(c.bands[0]) / total,
        "mid": float(c.bands[1]) / total,
        "high": float(c.bands[2]) / total,
        "harmonic": c.harmonic,
        "sustain": min(4.0, c.sustain_beats),
        "intensity": c.intensity,
        "downbeat": float(c.downbeat),
        **{f"sub{s}": float(c.subdivision == s) for s in SNAP_ORDER},
        **{name: float(src[i]) for i, name in enumerate(STEM_NAMES)},
        "leader": float(src[c.leader]) if c.leader is not None else 1.0 / len(STEM_NAMES),
        "melody": float(c.melody or 0.0),
        "attack": float(c.attack),
    }


def pick_probability(c: Candidate, model: dict[str, Any]) -> float:
    """How likely a human BMS chart of the model's density puts a note on this candidate."""
    x = pick_features(c)
    z = float(model["bias"]) + sum(
        float(w) * (x[name] - float(m)) / float(sd) for name, m, sd, w in zip(model["features"], model["mean"], model["scale"], model["weights"])
    )
    return 1.0 / (1.0 + math.exp(-z))


def _hand_scores(cands: list[Candidate], params: GenParams) -> list[float]:
    band_weight = np.array([1.0, 1.0, params.high_band_weight])
    boosts = params.extra.get("subdivisionBoost", {})
    offbeat = params.weight("offbeatBoost")
    downbeat = params.weight("downbeatBoost")
    harmonic = params.weight("harmonicBoost", 0.0)
    source_cfg = load_config("instruments")["rhythmSource"]
    melody_cfg = source_cfg["melody"]
    attack_cfg = source_cfg.get("attack", {})
    attack_floor, attack_power = float(attack_cfg.get("floor", 1.0)), float(attack_cfg.get("power", 1.0))
    power = metrical_power(params)
    follows_melody = params.rhythm_source in ("auto", "melody", "vocal")
    out: list[float] = []
    for c in cands:
        melody = (c.melody or 0.0) if follows_melody else 0.0
        # a melody chart lets its notes off the beat: syncopation is the melody's own rhythm
        p = power * (1.0 - float(melody_cfg["offbeat"]) * melody) if params.rhythm_source in ("melody", "vocal") else power
        metrical = DOWNBEAT_WEIGHT * downbeat if c.downbeat else METRICAL_WEIGHT.get(c.subdivision, 0.3) ** p
        metrical *= boosts.get(c.subdivision, 1.0) * (offbeat if c.subdivision > 1 else 1.0)
        total = float(np.sum(c.bands)) + 1e-9
        w_band = float(np.dot(c.bands, band_weight)) / total
        stem_weight = _stem_source_weight(c, params, source_cfg)
        source = 1.0
        if stem_weight is not None:
            source = stem_weight
        elif params.rhythm_source == "drum":
            source = 0.6 + 0.8 * (1.0 - c.harmonic)
        elif params.rhythm_source == "bass":
            source = 0.5 + 1.0 * (c.bands[0] / total)
        elif params.rhythm_source in ("melody", "vocal"):
            source = 0.5 + 0.7 * c.harmonic + (0.3 if c.pitch is not None else 0.0)
        source *= 1.0 + harmonic * c.harmonic
        # a clear melody note is heard as clearly as a typical drum hit, however soft it is in the mix
        strength = max(min(c.strength, 1.5), melody * float(melody_cfg["salience"]))
        score = (strength**0.7) * metrical * w_band * (0.55 + 0.9 * c.intensity) * source
        # a sounding note's late low end or swell is no new sound: such onsets come after the real ones
        out.append(score * (attack_floor + (1.0 - attack_floor) * min(1.0, max(0.0, c.attack)) ** attack_power))
    return out
