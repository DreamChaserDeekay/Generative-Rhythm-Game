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
    grid: int | None = None  # the straight subdivision a triplet in a swinging bar is scored and capped as
    sound_group: int | None = None  # the analysis's same-sound group of the (strongest) onset
    solo: bool = False  # in a section a melody instrument leads (melody.solo)
    quiet: bool = False  # no clear drum hit near it: the drums are out here (melody.quiet)


def grid_of(c: Candidate) -> int:
    """The subdivision a candidate is scored and capped as: its own, or for a triplet in a bar that
    swings the straight grid point it plays the part of (see swing_bars)."""
    return c.subdivision if c.grid is None else c.grid


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


# where a beat's onsets are counted for the swing decision, and what each point is: 0 the beat,
# 1 a straight sixteenth, 2 the eighth, 3 an eighth-note triplet, 4 a sixteenth-note triplet
SWING_POINTS = np.array([0.0, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 5 / 6, 1.0])
SWING_KIND = np.array([0, 4, 1, 3, 2, 3, 1, 4, 0])


def swing_bars(analysis: dict[str, Any], tempo: TempoMap) -> set[int]:
    """Bars a human BMS charter hears as swinging (eighth-note triplets or a shuffle): a logistic
    model (config tripletFeel.swing) on the strength of the bar's onsets at the triplet points and
    at the straight sixteenths, the same over the bar and its neighbours, and the song's triplet
    and eighth shares. Fitted on the human charts of 755 songs, bar by bar: the share of their
    off-beat notes on triplets (docs/PATTERN_DESIGN.md 56)."""
    cfg = difficulty_config()["tripletFeel"]["swing"]
    bpb = tempo.beats_per_bar
    n_bars = int(tempo.ms_to_beat(float(analysis["durationMs"])) // bpb) + 1
    if n_bars < 1:
        return set()
    tol = float(cfg["toleranceBeats"])
    mass = np.zeros((n_bars, int(SWING_KIND.max()) + 1))
    for o in analysis["onsets"]:
        b = tempo.ms_to_beat(float(o["t"]))
        bar = int(b // bpb)
        if not 0 <= bar < n_bars:
            continue
        d = np.abs(SWING_POINTS - (b - math.floor(b)))
        j = int(np.argmin(d))
        if d[j] <= tol:
            mass[bar, SWING_KIND[j]] += float(o["strength"])
    summed = np.vstack([np.zeros((1, mass.shape[1])), np.cumsum(mass, axis=0)])
    i = np.arange(n_bars)
    near = summed[np.minimum(i + 2, n_bars)] - summed[np.maximum(i - 1, 0)]  # the bar and the bars either side
    song = mass.sum(axis=0)
    x = {
        "triplets": np.log1p(mass[:, 3]),
        "sixteenths": np.log1p(mass[:, 1]),
        "tripletsNear": np.log1p(near[:, 3]),
        "sixteenthsNear": np.log1p(near[:, 1]),
        "songTripletShare": np.full(n_bars, song[3] / (song[1] + song[3] + 1e-6)),
        "songEighthShare": np.full(n_bars, song[2] / (song.sum() + 1e-6)),
    }
    z = float(cfg["bias"]) + sum(
        float(w) * (x[name] - float(m)) / float(sd) for name, m, sd, w in zip(cfg["features"], cfg["mean"], cfg["scale"], cfg["weights"])
    )
    p = 1.0 / (1.0 + np.exp(-z))
    return {int(k) for k in np.flatnonzero(p >= float(cfg["minP"]))}


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
    analysis: dict[str, Any], tempo: TempoMap, params: GenParams, tolerance_ms: float, swing: set[int] | None = None
) -> list[Candidate]:
    """Snapped, scored candidates. With `swing` (bars, see swing_bars) the triplet grid is open only
    in those bars, and a triplet there is scored and capped as the straight subdivision it plays
    the part of (config tripletFeel.swing.roles: the swung eighth as an eighth)."""
    duration = float(analysis["durationMs"])
    n_beats = max(1, int(np.ceil(tempo.ms_to_beat(duration))) + 1)
    intensity = intensity_curve(analysis, tempo, n_beats)
    bpb = tempo.beats_per_bar
    sections = analysis.get("sections", [])
    melody_cfg = load_config("instruments")["rhythmSource"]["melody"]
    merged: dict[float, Candidate] = {}
    straight_subs = tuple(s for s in params.subdivisions if s not in TRIPLETS)
    roles = {int(k): int(v) for k, v in difficulty_config()["tripletFeel"]["swing"]["roles"].items()} if swing is not None else {}
    for o in analysis["onsets"]:
        allowed = params.subdivisions
        if swing is not None and int(np.floor(tempo.ms_to_beat(float(o["t"])) / bpb)) not in swing:
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
                grid=roles.get(sub),
                sound_group=o.get("soundGroup"),
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
            if o.get("soundGroup") is not None and (c.sound_group is None or stronger):
                c.sound_group = o["soundGroup"]
            c.harmonic = max(c.harmonic, float(o.get("harmonic", 0.0)))
            c.sustain_beats = max(c.sustain_beats, sustain_beats)
            if melody is not None:
                c.melody = max(c.melody or 0.0, melody)
            c.attack = max(c.attack, attack)
    cands = sorted(merged.values(), key=lambda c: c.beat)
    _mark_quiet(cands, sections, melody_cfg)
    split = _melody_splits(cands, melody_cfg, params.skill)
    echoes = _echoes(cands, melody_cfg)
    quiet = _quiet_tails(cands, split + echoes, melody_cfg)
    if quiet:
        cands = [c for c in cands if id(c) not in quiet]
        split = [c for c in split if id(c) not in quiet]
        echoes = [c for c in echoes if id(c) not in quiet]
    _mark_solos(cands, analysis, sections, melody_cfg)
    _end_melody_notes(cands, float(melody_cfg["note"]))
    _score(cands, params)
    if split:
        scale = float(melody_cfg["split"]["scale"])
        for c in split:
            c.score *= scale
    if echoes:
        scale = float(melody_cfg["echo"]["scale"])
        for c in echoes:
            c.score *= scale
    return cands


def _mark_quiet(cands: list[Candidate], sections: list[dict[str, Any]], cfg: dict[str, Any]) -> None:
    """`quiet` of the candidates where the drums are out (melody.quiet): in a
    section whose drum share is under `sectionShare` of the song's most drummed section (and under
    `sectionFloor` at least), a breakdown or a quiet intro, in a song with drums (its most drummed
    section's share `songDrumsAtLeast` or more). A single hit's drum share says little (under a loud
    lead a snare reads 0.2), so analyses without section stem shares mark nothing."""
    rule = cfg.get("quiet")
    if not rule:
        return
    drums = STEM_NAMES.index("drums")
    shares = [(float(s["t"]), float(s["endT"]), float(s["stems"][drums])) for s in sections if s.get("stems")]
    if not shares:
        return
    top = max(d for _, _, d in shares)
    if top < float(rule["songDrumsAtLeast"]):
        return  # a song without drums (a piano piece) has no breakdown: its sounds are its music
    limit = max(float(rule["sectionFloor"]), float(rule["sectionShare"]) * top)
    for c in cands:
        c.quiet = any(a <= c.t < b and d < limit for a, b, d in shares)


def _quiet_tails(cands: list[Candidate], flagged: list[Candidate], cfg: dict[str, Any]) -> set[int]:
    """Candidates left out where the drums are out (`quiet`, melody.quiet): the
    splits and echoes found above, and tonal sounds whose attack is under `attackBelow` (a reverb's
    swells, a pad breathing). There the mix lays bare every repeat of a delay and every swell of a
    reverb, and a score cut alone does not keep them out: a density fit short of sounds still takes
    them (PATTERN_DESIGN 61)."""
    rule = cfg.get("quiet")
    if not rule:
        return set()
    presence = float(cfg["note"])
    out = {id(c) for c in flagged if c.quiet}
    out |= {id(c) for c in cands if c.quiet and c.attack < float(rule["attackBelow"]) and _tonal(c, presence, cfg["split"])}
    return out


def _tonal(c: Candidate, presence: float, rule: dict[str, Any]) -> bool:
    """A note of the melody, or a pitched sound that is hardly a drum (melody.split's test)."""
    return (c.melody or 0.0) >= presence or (
        c.sources is not None and float(c.sources[STEM_NAMES.index("drums")]) < float(rule["tonalDrumsBelow"]) and c.harmonic >= float(rule["tonalHarmonic"])
    )


def _echoes(cands: list[Candidate], cfg: dict[str, Any]) -> list[Candidate]:
    """Tonal candidates that repeat a louder sound of the same pitch a little earlier with a softer
    attack (melody.echo): a delay's repeats and a reverb's swells, which a mix
    carries most clearly where the drums are out (a breakdown) but which are no new notes."""
    rule = cfg.get("echo")
    if not rule:
        return []
    presence = float(cfg["note"])
    tonal_rule = cfg["split"]
    within, ratio, attack = float(rule["withinBeats"]), float(rule["strengthRatio"]), float(rule["attackBelow"])
    out: list[Candidate] = []
    recent: list[Candidate] = []
    for c in cands:
        recent = [p for p in recent if c.beat - p.beat <= within + 1e-6]
        if c.pitch is not None and c.attack < attack and _tonal(c, presence, tonal_rule):
            if any(p.pitch is not None and abs(p.pitch - c.pitch) < 0.5 and c.strength <= ratio * p.strength for p in recent):
                out.append(c)
                continue  # an echo is no source of echoes: its own repeats answer to the note
        if c.pitch is not None:
            recent.append(c)
    return out


def _melody_splits(cands: list[Candidate], cfg: dict[str, Any], skill: float = 1.0) -> list[Candidate]:
    """Tonal candidates (a note of the melody, or a pitched sound that is hardly a drum: a guitar,
    a piano, a synth line) that split a note rather than start one (melody.split):
    soon after the last tonal note without a sure attack (a strum, a slide, a tremolo, an ornament:
    `attackBelow`, a number or [skill, value] pairs), or inside the last note's own sound at about
    its pitch with a weak attack (vibrato, a swell). Their scores are scaled down, so a line is not
    chopped into sixteenths where it holds."""
    rule = cfg.get("split")
    if not rule:
        return []
    presence = float(cfg["note"])
    points = rule["attackBelow"] if isinstance(rule["attackBelow"], list) else [[0.0, rule["attackBelow"]]]
    attack_below = float(np.interp(skill, [float(x) for x, _ in points], [float(y) for _, y in points]))
    out: list[Candidate] = []
    prev: Candidate | None = None
    for c in cands:
        if not _tonal(c, presence, rule):
            continue
        if prev is not None:
            gap = c.beat - prev.beat
            soon = gap <= float(rule["withinBeats"]) + 1e-6 and c.attack < attack_below
            same = (c.sound_group is not None and c.sound_group == prev.sound_group) or (
                c.pitch is not None and prev.pitch is not None and abs(c.pitch - prev.pitch) < 1.0
            )
            inside = prev.sustain_beats > gap + 0.05 and same and c.attack < float(rule["insideAttackBelow"])
            if soon or inside:
                out.append(c)
                continue  # the note it splits goes on sounding: later onsets still answer to it
        prev = c
    return out


def _mark_solos(cands: list[Candidate], analysis: dict[str, Any], sections: list[dict[str, Any]], cfg: dict[str, Any]) -> None:
    """`solo` of the candidates in sections a melody instrument leads (melody.solo):
    the section's leader is one of `leaders` and at least `minMelodyShare` of its onsets are notes
    of the melody (a guitar or piano solo, a lead line over the beat)."""
    rule = cfg.get("solo")
    if not rule:
        return
    presence = float(cfg["note"])
    onsets = analysis.get("onsets", [])
    spans = []
    for s in sections:
        if s.get("leader") not in rule["leaders"]:
            continue
        inside = [o for o in onsets if s["t"] <= o["t"] < s["endT"]]
        if len(inside) < 8:
            continue
        share = sum(1 for o in inside if (melody_of(o, cfg) or 0.0) >= presence) / len(inside)
        if share >= float(rule["minMelodyShare"]):
            spans.append((float(s["t"]), float(s["endT"])))
    for c in cands:
        c.solo = any(a <= c.t < b for a, b in spans)


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


def pad_like(c: Candidate) -> bool:
    """Whether a sound is a held tonal sound such as a pad, a choir or strings, which may become a
    long note (difficulty.json holds.pad): tonal, hardly a drum, on the eighths and
    sounding at least `minBeats`, however soft its attack."""
    pad = difficulty_config()["holds"].get("pad")
    if not pad or c.sources is None:
        return False
    return (
        c.sustain_beats >= float(pad["minBeats"]) and c.harmonic >= float(pad["harmonicAtLeast"])
        and float(c.sources[STEM_NAMES.index("drums")]) < float(pad["drumsBelow"]) and c.subdivision <= int(pad["maxSubdivision"])
    )


def _stem_source_weight(c: Candidate, params: GenParams, cfg: dict[str, Any]) -> float | None:
    """Rhythm-source weight from stem shares; None when the analysis has no stems. The melody and
    vocal sources go by the melody presence: the stem shares of a drum hit spread over every stem,
    so they hardly tell a sung note from a hi-hat."""
    if c.sources is None:
        return None
    melody = c.melody or 0.0
    if params.rhythm_source == "auto":
        auto = 1.0 if c.leader is None else cfg["autoBase"] + cfg["autoGain"] * float(c.sources[c.leader])
        # easy charts lean on the melody, the hardest follow every instrument as they are
        lean = float(cfg["melody"]["auto"])
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
    """Each candidate's score: the hand-made one below with the note-pick model's probability
    (config/pick.json) blended in by skill, the options (rhythm source, style) still multiplying it
    as they change the hand-made score."""
    hand = _hand_scores(cands, params)
    model = pick_model(params)
    pad = difficulty_config()["holds"].get("pad")
    boost = 1.0
    if pad:
        # (easy charts keep their picks: a soft pad note there pushes the other notes across the keys)
        points = pad["pickBoost"] if isinstance(pad["pickBoost"], list) else [[0.0, pad["pickBoost"]]]
        boost = float(np.interp(params.skill, [float(x) for x, _ in points], [float(y) for _, y in points]))
    neutral_params = replace(params, rhythm_source="auto", extra={k: v for k, v in params.extra.items() if k not in SCORE_WEIGHTS})
    neutral = hand if neutral_params == params else _hand_scores(cands, neutral_params)
    points = sorted((float(a), float(b)) for a, b in load_config("pick")["share"])
    share = float(np.interp(params.skill, [a for a, _ in points], [b for _, b in points]))
    for c, h, n in zip(cands, hand, neutral):
        c.score = h * (pick_probability(c, model) / n) ** share if n > 0 else 0.0
    if boost != 1.0:
        # a pad or choir chord is played (as a long note) however soft its attack
        for c in cands:
            if pad_like(c):
                c.score *= boost
    melody_cfg = load_config("instruments")["rhythmSource"]["melody"]
    solo = melody_cfg.get("solo")
    if solo:
        # a solo plays the lead line, the drums keep only their beats under it
        presence = float(melody_cfg["note"])
        for c in cands:
            if not c.solo:
                continue
            if (c.melody or 0.0) >= presence:
                c.score *= float(solo["melodyBoost"])
            elif c.subdivision > 1:
                c.score *= float(solo["offBeatScale"])


def pick_model(params: GenParams) -> dict[str, Any]:
    """The note-pick model for this skill (config/pick.json)."""
    cfg = load_config("pick")
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
        **{f"sub{s}": float(grid_of(c) == s) for s in SNAP_ORDER},
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
    metrical_cfg = difficulty_config()["metrical"]
    weights = {int(k): float(v) for k, v in metrical_cfg["weights"].items() if k != "downbeat"}
    downbeat_weight = float(metrical_cfg["weights"]["downbeat"])
    push = float(metrical_cfg.get("push", 1.0))
    strength_at = {round(c.beat, 4): c.strength for c in cands} if push != 1.0 else {}
    follows_melody = params.rhythm_source in ("auto", "melody", "vocal")
    out: list[float] = []
    for c in cands:
        melody = (c.melody or 0.0) if follows_melody else 0.0
        # a melody chart lets its notes off the beat: syncopation is the melody's own rhythm
        p = power * (1.0 - float(melody_cfg["offbeat"]) * melody) if params.rhythm_source in ("melody", "vocal") else power
        grid = grid_of(c)
        metrical = downbeat_weight * downbeat if c.downbeat else weights.get(grid, 0.3) ** p
        if push != 1.0 and c.subdivision == 4:
            # a 16th before an empty or weaker grid point pushes the beat or the off-beat early
            after = strength_at.get(round(c.beat + 0.25, 4))
            if after is None or after < c.strength:
                metrical *= push
        metrical *= boosts.get(grid, 1.0) * (offbeat if grid > 1 else 1.0)
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
