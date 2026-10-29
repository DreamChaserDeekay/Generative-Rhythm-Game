"""Sectioned engine (docs/PATTERN_DESIGN.md 13): the chart is built from the song's structure down.

1. Units: every section is cut into its loop (1, 2 or 4 bars, at most `maxUnitBars`).
2. Material classes: units of one repetition group that hold the same music (their candidates match)
   form a class; a fill or a changed bar becomes a class of its own.
3. Section blueprint: per section label, how dense, how many chords and long notes; which stems a
   group follows at the chart's skill; pre-chorus ramps and the last chorus lift.
4. Notes per class: note positions are chosen once per class from the consensus of its units
   (a position heard in most of them scores high, a detection glitch in one unit scores low) and put
   in every unit that has the sound there. Chords, long notes and side / scratch notes are also
   decided per class position, so every repeat of a loop gets the same notes.
5. Lanes (`place`): units are placed in song order. The first unit of a class gets its lanes from the
   pattern planner and the lane search; every later unit copies them
   through the same lane search with a large bonus for the copy, so it only changes a note where
   the hard rules (jack spacing, hand limits, long notes) forbid the copy.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ..analysis.ml import section_stems
from ..analysis.stems import STEM_NAMES
from ..config import load_config
from .candidates import Candidate, grid_of
from .lanes import Choice, LaneInfo, _pitch_targets, search
from .motifs import SlotPlan
from . import plan as section_plan
from .params import SIDE_HOLD_SHARE, GenParams
from .rolls import coarser, mark_rolls, roll_level, rolls_config
from .select import BUCKET_MS, DOWNBEAT_CHORDS_BELOW, MAX_CHORD_RATIO, Slot, active_seconds, clear_holds, hold_end, hold_value, holdable, lone_sound, mark_hold_count
from .tempo import TempoMap

GRID = 48  # positions per beat for matching candidates between units
DEFAULT_LOOP_BARS = 2  # older analyses without loop lengths


def sectioned_config() -> dict[str, Any]:
    return load_config("patterns")["sectioned"]


@dataclass
class Unit:
    index: int
    section: int
    group: str
    label: str
    occurrence: int  # how many earlier sections of its group there are
    pos: int  # position in its section
    start: float  # beat
    length: float  # beats
    energy: float
    last_in_group: bool = False  # in the group's last occurrence
    cls: int = -1
    extra: float = 0.0  # notes beyond its class (pre-chorus ramp, last chorus), as a share
    accent: bool = False  # opens a section: its downbeat is accented
    density: float | None = None  # the section plan's density for it, against the song's (plan.py)
    chord: float | None = None  # the section plan's chord weight for it
    hold: float | None = None  # the section plan's long-note weight for it
    jack_scale: float = 1.0  # the section plan's scale of the same-lane cost in it


@dataclass
class Layout:
    """Slots of a sectioned chart with what each belongs to."""

    slots: list[Slot]
    units: list[Unit]
    unit_slots: list[list[int]]  # slot indices per unit, in time order
    ref: list[int | None]  # per slot: the class's earlier slot at the same position (lanes to copy)
    slot_unit: list[int]
    phrases: list[list[int]] = field(default_factory=list)  # planner phrases (slot indices)
    phrase_keys: list[tuple[int, int]] = field(default_factory=list)  # (class, part) per phrase


def edited_analysis(analysis: dict[str, Any], edits: list[dict[str, Any]]) -> dict[str, Any]:
    """The analysis with the user's sections (rows of startBeat, label, group) in place of the
    analysed ones. Times, energy and stem mix are measured again; a section's loop length comes
    from the analysed section it overlaps most. The edits go into `overrides`, so charts made from
    them get their own ids."""
    if not edits:
        return analysis
    tempo = TempoMap(analysis["timing"])
    bpb = tempo.beats_per_bar
    base = sorted(analysis.get("sections", []), key=lambda r: float(r["startBeat"]))
    rows_in = sorted(edits, key=lambda e: float(e["startBeat"]))
    duration = float(analysis["durationMs"])
    end_all = tempo.ms_to_beat(duration)
    first = min(float(base[0]["startBeat"]) if base else 0.0, float(rows_in[0]["startBeat"]))
    energy = np.asarray(analysis.get("energy", {}).get("values") or [0.5], dtype=float)
    frame = float(analysis.get("energy", {}).get("frameMs", 100)) or 100.0
    rows: list[dict[str, Any]] = []
    for k, e in enumerate(rows_in):
        a = first if k == 0 else float(e["startBeat"])
        b = float(rows_in[k + 1]["startBeat"]) if k + 1 < len(rows_in) else end_all
        t, end_t = tempo.beat_to_ms(a), tempo.beat_to_ms(b) if k + 1 < len(rows_in) else duration
        overlap = [(min(b, float(r.get("endBeat", end_all))) - max(a, float(r["startBeat"])), r) for r in base]
        loop = DEFAULT_LOOP_BARS
        if overlap:
            amount, r = max(overlap, key=lambda o: o[0])
            if amount > 0 and r.get("loopBars"):
                loop = int(r["loopBars"])
        bars = max(1, int(round((b - a) / bpb)))
        span = energy[int(max(0.0, t) / frame) : max(int(max(0.0, t) / frame) + 1, int(end_t / frame))]
        rows.append(
            {
                "t": round(t, 3), "endT": round(end_t, 3), "startBeat": a, "endBeat": b,
                "label": str(e["label"]), "group": str(e["group"]),
                "energy": float(np.median(span)) if len(span) else 0.5,
                "loopBars": min(loop, bars), "confidence": 1.0,
            }
        )  # fmt: skip
    raw = np.array([r["energy"] for r in rows])
    span = float(np.ptp(raw))
    for r, v in zip(rows, raw):
        r["energy"] = round(float((v - raw.min()) / span) if span > 1e-9 else 0.5, 3)
    onsets = analysis.get("onsets", [])
    if onsets:
        section_stems(rows, np.array([o["t"] for o in onsets]), np.array([o["strength"] for o in onsets]), np.array([o.get("sources") or [0.25] * 4 for o in onsets]))
    out = dict(analysis)
    out["sections"] = rows
    out["overrides"] = {**analysis.get("overrides", {}), "sections": [{"startBeat": float(e["startBeat"]), "label": str(e["label"]), "group": str(e["group"])} for e in rows_in]}
    return out


def make_units(sections: list[dict[str, Any]], first_beat: float, last_beat: float, beats_per_bar: int) -> list[Unit]:
    cfg = sectioned_config()
    max_bars = int(cfg["maxUnitBars"])
    bpb = beats_per_bar
    rows = sorted(sections, key=lambda s: float(s["startBeat"]))
    spans: list[tuple[float, float, dict[str, Any]]] = []
    for k, s in enumerate(rows):
        a = float(s["startBeat"])
        if k + 1 < len(rows):
            b = float(rows[k + 1]["startBeat"])
        else:
            b = max(last_beat + 1e-6, a + bpb)
            # a last loop cut short of a bar at the last onset would be a unit too short to get any
            # notes (a final chord just after its downbeat): it runs to the end of that bar
            length = bpb * max(1, min(int(s.get("loopBars") or DEFAULT_LOOP_BARS), max_bars))
            rest = (b - a) % length
            if 1e-6 < rest < bpb:
                b += bpb - rest
        spans.append((a, b, s))
    if not spans:
        spans = [(min(first_beat, 0.0), last_beat + 1e-6, {"group": "_", "label": "verse", "energy": 0.5, "loopBars": 4})]
    if first_beat < spans[0][0]:
        spans.insert(0, (first_beat, spans[0][0], {"group": "_pre", "label": "intro", "energy": 0.3, "loopBars": 1}))
    if last_beat >= spans[-1][1]:
        spans.append((spans[-1][1], last_beat + 1e-6, {"group": "_post", "label": "outro", "energy": 0.3, "loopBars": 1}))
    units: list[Unit] = []
    seen: dict[str, int] = {}
    last_occ: dict[str, int] = {}
    for si, (_, _, s) in enumerate(spans):
        last_occ[str(s.get("group") or f"_{si}")] = si
    prev_label = None
    for si, (a, b, s) in enumerate(spans):
        group = str(s.get("group") or f"_{si}")
        occ = seen.get(group, 0)
        seen[group] = occ + 1
        loop = int(s.get("loopBars") or DEFAULT_LOOP_BARS)
        length = bpb * max(1, min(loop, max_bars))
        label = str(s.get("label", "verse"))
        pos, x = 0, a
        while x < b - 1e-6:
            # beats before the first downbeat (a pickup) are a unit of their own, so the loops after
            # it start on bar lines
            step = -x if x < 0 < b and -x < length else length
            units.append(
                Unit(
                    index=len(units),
                    section=si,
                    group=group,
                    label=label,
                    occurrence=occ,
                    pos=pos,
                    start=x,
                    length=min(step, b - x),
                    energy=float(s.get("energy", 0.5)),
                    last_in_group=last_occ[group] == si,
                    accent=pos == 0 and prev_label is not None and (label != prev_label or occ == 0),
                )
            )
            x += units[-1].length
            pos += 1
        prev_label = label
    return units


def _key(offset: float) -> int:
    return int(round(offset * GRID))


def _unit_cands(units: list[Unit], cands: list[Candidate]) -> list[dict[int, int]]:
    """Per unit: offset key -> candidate index."""
    out: list[dict[int, int]] = [{} for _ in units]
    starts = [u.start for u in units]
    u = 0
    for i, c in enumerate(cands):
        while u + 1 < len(units) and c.beat >= starts[u + 1] - 1e-9:
            u += 1
        if units[u].start - 1e-9 <= c.beat < units[u].start + units[u].length + 1e-9:
            out[u][_key(c.beat - units[u].start)] = i
    return out


def _similarity(a: dict[int, int], b: dict[int, int], cands: list[Candidate]) -> float:
    """Jaccard of two units' candidate positions, each weighted by its (mean) strength so a missed
    soft hit matters less than a missed accent; how loud a shared hit is does not matter (a played
    repeat is never equally loud). A shared position with another pitch counts half."""
    num = den = 0.0
    for k in a.keys() | b.keys():
        ca = cands[a[k]] if k in a else None
        cb = cands[b[k]] if k in b else None
        if ca and cb:
            w = (min(ca.strength, 1.5) + min(cb.strength, 1.5)) / 2
            same = ca.pitch is None or cb.pitch is None or abs(ca.pitch - cb.pitch) < 0.5
            num += w * (1.0 if same else 0.5)
        else:
            w = min((ca or cb).strength, 1.5)  # type: ignore[union-attr]
        den += w
    return num / den if den > 0 else 1.0


def classify(units: list[Unit], per_unit: list[dict[int, int]], cands: list[Candidate]) -> int:
    """Material classes in song order; returns the class count."""
    threshold = float(sectioned_config()["classSimilarity"])
    classes: list[list[int]] = []
    for u in units:
        best, best_sim = None, threshold
        for c, members in enumerate(classes):
            first = units[members[0]]
            if first.group != u.group or abs(first.length - u.length) > 1e-6:
                continue
            sim = max(_similarity(per_unit[m], per_unit[u.index], cands) for m in members[:3])
            if sim >= best_sim:
                best, best_sim = c, sim
        if best is None:
            classes.append([u.index])
            u.cls = len(classes) - 1
        else:
            classes[best].append(u.index)
            u.cls = best
    return len(classes)


def blueprint(label: str) -> dict[str, float]:
    """A section label's multipliers (`labels`, with the chord weights of `labelChords`)."""
    cfg = sectioned_config()
    labels = cfg["labels"]
    own = cfg.get("labelChords", {})
    base = labels.get(label, labels.get("verse", {}))
    return {"density": 1.0, "chord": 1.0, "hold": 1.0, "ramp": 0.0, **base, **own.get(label, {})}


def _cap_below_highlight(units: list["Unit"], per_unit: list[dict[int, int]], per_unit_n: list[float], params: GenParams) -> bool:
    """Keep the highlight the densest part (sectioned.highlightCap): a full chorus
    or drop masks its own onsets and often offers fewer sounds per beat than a sparse verse, so the
    units of the other labels play at most their label's density share of what the highlight units
    can play per beat (the most of their target and their sounds). Lowers `per_unit_n` in place;
    True when it did."""
    rule = sectioned_config().get("highlightCap")
    if not rule:
        return False
    tops = set(rule["labels"])
    top_density = max(blueprint(lab)["density"] for lab in tops)
    high = [
        min(n, float(rule["soundShare"]) * len(per_unit[u.index])) / u.length
        for u, n in zip(units, per_unit_n) if u.label in tops and u.length > 0 and per_unit[u.index]
    ]
    if not high:
        return False
    level = max(high)
    # with the section plan (plan.json highlightRatio "plan") a unit's share is its planned density
    # against the highlight's, at most the highlight's own
    planned = [u.density for u in units if u.label in tops and u.density is not None]
    by_plan = bool(planned) and section_plan.plan_config().get("highlightRatio") == "plan"
    changed = False
    for k, u in enumerate(units):
        if u.label in tops or u.length <= 0:
            continue
        share = min(1.0, u.density / max(planned)) if by_plan and u.density is not None else blueprint(u.label)["density"] / top_density
        cap = level * u.length * share
        if per_unit_n[k] > cap:
            per_unit_n[k] = cap
            changed = True
    return changed


LAYERS = {"rhythm": ("drums", "bass"), "melody": ("vocals", "other")}


def follow_weights(sections: list[dict[str, Any]], params: GenParams) -> dict[str, np.ndarray]:
    """Per group, a weight per stem: easy charts follow the group's main layer (the melody — vocals
    and other — or the rhythm — drums and bass — whichever sounds more, weighted by the tier's
    instrument mix); the other layer's sounds score `otherWeight` times as much, except on
    downbeats (the kick accent stays). Charts from `pairSkill` follow both."""
    cfg = sectioned_config()["follow"]
    if params.rhythm_source != "auto" or params.skill >= float(cfg["pairSkill"]):
        return {}
    mixes: dict[str, list[np.ndarray]] = {}
    for s in sections:
        if s.get("stems") and s.get("group"):
            mixes.setdefault(str(s["group"]), []).append(np.asarray(s["stems"], dtype=float))
    out = {}
    for g, rows in mixes.items():
        mix = np.mean(rows, axis=0)
        share = {name: sum(float(mix[STEM_NAMES.index(st)]) for st in stems) for name, stems in LAYERS.items()}
        main = max(share, key=lambda k: (share[k], k))
        w = np.full(len(STEM_NAMES), float(cfg["otherWeight"]))
        for st in LAYERS[main]:
            w[STEM_NAMES.index(st)] = 1.0
        out[g] = w
    return out


def _mark_variation(units: list[Unit], params: GenParams) -> None:
    cfg = sectioned_config()
    growth = float(cfg["buildUp"]["repeatGrowth"])
    chorus_groups = {u.group for u in units if u.label == "chorus"}
    occurrences: dict[str, int] = {}
    by_section: dict[int, list[Unit]] = {}
    for u in units:
        by_section.setdefault(u.section, []).append(u)
        occurrences[u.group] = max(occurrences.get(u.group, 0), u.occurrence + 1)
    for sec in by_section.values():
        bp = blueprint(sec[0].label)
        n = len(sec)
        for u in sec:
            if bp["ramp"] > 0 and n > 1:
                u.extra = bp["ramp"] * u.pos / (n - 1)
            if occurrences[u.group] > 1:
                # the same music builds up: each repeat plays the earlier notes and a few more
                u.extra += growth * u.occurrence / (occurrences[u.group] - 1)
            if u.group in chorus_groups and u.last_in_group and u.occurrence >= 1:
                u.extra = max(u.extra, float(cfg["lastChorusBoost"]))


def _chord_worth(c: Candidate, params: GenParams) -> float:
    if lone_sound(c):
        return 0.0
    total = float(np.sum(c.bands)) + 1e-9
    spread = int(np.sum(c.bands / total > 0.22))
    w = c.strength * (0.6 + 0.4 * spread) * (0.6 + 0.6 * c.intensity) * (1.4 if c.downbeat else 1.0)
    return 0.0 if params.skill < DOWNBEAT_CHORDS_BELOW and not c.downbeat else w


def _cap_opening(units: list[Unit], weight: list[float], per_unit_n: list[float]) -> bool:
    """A song whose busiest music comes first still builds up: a section in the opening (the first
    `openingShare` of the song) plays at most `openingCap` times the notes per beat of the busiest
    section of the second half. Lowers `weight` of the sections over it; True when it did."""
    cfg = sectioned_config()["buildUp"]
    if not units:
        return False
    first = min(u.start for u in units)
    span = max(u.start + u.length for u in units) - first
    notes: dict[int, float] = {}
    beats: dict[int, float] = {}
    start: dict[int, float] = {}
    for u, n in zip(units, per_unit_n):
        notes[u.section] = notes.get(u.section, 0.0) + n * (1 + u.extra)
        beats[u.section] = beats.get(u.section, 0.0) + u.length
        start[u.section] = min(start.get(u.section, u.start), u.start)
    density = {s: notes[s] / beats[s] for s in notes if beats[s] > 0}
    late = [d for s, d in density.items() if start[s] >= first + 0.5 * span]
    if span <= 0 or not late or max(late) <= 0:
        return False
    cap = float(cfg["openingCap"]) * max(late)
    over = {s: cap / d for s, d in density.items() if start[s] < first + float(cfg["openingShare"]) * span and d > cap * 1.001}
    for i, u in enumerate(units):
        if u.section in over:
            weight[i] *= over[u.section]
    return bool(over)


def _plan_units(units: list[Unit], cands: list[Candidate], analysis: dict[str, Any] | None, tempo: TempoMap, memo: dict[str, Any] | None) -> None:
    """Each unit's density, chord and long-note weights from the section plan (plan.py,
    config/plan.json), blended with the label rule in log space by the config's `blend`, and its
    scale of the same-lane cost (`jackGain`: a unit the plan wants twice as jacky as the song costs
    2^-gain as much); left None (the rule alone) without an analysis or with the plan off."""
    if analysis is None or not units or not section_plan.plan_config().get("enabled", True):
        return
    cached = memo.get("plan") if memo is not None else None
    if cached is None or cached["units"] != len(units):
        cfg = section_plan.plan_config()
        raw = section_plan.unit_raw(units, cands, analysis, tempo)
        groups = [u.group for u in units]
        lim = float(cfg.get("clip", 1.5))
        dens = sectioned_config()["density"]
        rules = {
            "density": np.log([blueprint(u.label)["density"] * (float(dens["base"]) + float(dens["gain"]) * u.energy) for u in units]),
            "chord": np.log([blueprint(u.label)["chord"] for u in units]),
            "hold": np.log([blueprint(u.label)["hold"] for u in units]),
        }
        blend = cfg.get("blend", {})
        cached = {"units": len(units)}
        for target, rule in rules.items():
            pred = section_plan.predict(raw, target, groups)
            w = float(blend.get(target, 1.0))
            cached[target] = None if pred is None or w <= 0 else np.exp((1.0 - w) * (rule - rule.mean()) + w * np.clip(pred, -lim, lim))
        pred = section_plan.predict(raw, "jack", groups)
        gain = float(cfg.get("jackGain", 0.0))
        if pred is not None and gain > 0:
            pred = np.clip(pred, -lim, lim)
            cached["jack"] = np.exp(-gain * (pred - pred.mean()))  # the song's jacks overall stay the tier's
        else:
            cached["jack"] = None
        if memo is not None:
            memo["plan"] = cached
    has_density = cached["density"] is not None
    for k, u in enumerate(units):
        u.density = float(cached["density"][k]) if has_density else None
        u.chord = float(cached["chord"][k]) if cached["chord"] is not None else None
        u.hold = float(cached["hold"][k]) if cached["hold"] is not None else None
        u.jack_scale = float(cached["jack"][k]) if cached["jack"] is not None else 1.0
    # repeats of the same music play its lightest unit's notes and add over it: a repeat the plan
    # wants denser adds that much (plan.json repeatExtra: at most this share). The first time of
    # music that comes back keeps the build-up's (a song that opens on its chorus still builds up)
    most = float(section_plan.plan_config().get("repeatExtra", 0.0))
    if has_density and most > 0:
        lightest: dict[int, float] = {}
        times: dict[str, int] = {}
        for u in units:
            times[u.group] = max(times.get(u.group, 0), u.occurrence + 1)
            if u.cls >= 0 and u.density is not None:
                lightest[u.cls] = min(lightest.get(u.cls, u.density), u.density)
        for u in units:
            if u.cls in lightest and lightest[u.cls] > 0 and (u.occurrence > 0 or times[u.group] == 1):
                u.extra = max(u.extra, min(most, u.density / lightest[u.cls] - 1.0))


def layout(
    cands: list[Candidate],
    sections: list[dict[str, Any]],
    params: GenParams,
    tempo: TempoMap,
    density_scale: float,
    special_kind: str | None,
    key_count: int,
    chord_scale: float = 1.0,
    loud: Any = None,
    relax: bool = False,
    analysis: dict[str, Any] | None = None,
    memo: dict[str, Any] | None = None,
) -> Layout:
    """`loud(t_ms)` says whether the song is audible at a time (for notes the consensus puts where
    detection missed a repeat); None trusts the consensus alone. `relax` gives up the build-up that
    costs notes (earlier repeats playing fewer where the music has no more sounds, the opening
    cap) when the chart cannot reach its level otherwise, and the section plan's long-note places
    (it holds where little else is played: presses under a held note rate a chart higher, and
    the label rule's places have more of them). With the `analysis` the section plan (plan.py)
    sets how dense each unit is and how much it is chords; `memo` keeps that plan for the next
    rounds of the same chart."""
    """Slots chosen per material class (module docstring, steps 1–4)."""
    if not cands:
        return Layout([], [], [], [], [])
    bpb = tempo.beats_per_bar
    units = make_units(sections, cands[0].beat, cands[-1].beat, bpb)
    per_unit = _unit_cands(units, cands)
    n_classes = classify(units, per_unit, cands)
    _mark_variation(units, params)
    _plan_units(units, cands, analysis, tempo, memo)
    follow = follow_weights(sections, params)
    members: list[list[int]] = [[] for _ in range(n_classes)]
    for u in units:
        members[u.cls].append(u.index)

    def score(ci: int, u: Unit) -> float:
        c = cands[ci]
        w = follow.get(u.group)
        if w is not None and c.sources is not None and not c.downbeat:
            return c.score * float(np.dot(c.sources, w))
        return c.score

    # budget: the preset's note count spread over the units by their blueprint density
    expected_chord_notes = 1.0 + params.chord_ratio * (0.6 + 0.2 * max(0, params.max_chord - 2))
    target_slots = params.avg_nps * params.density * density_scale * active_seconds(cands) / expected_chord_notes
    dens = sectioned_config()["density"]
    weight = []
    for u in units:
        if not per_unit[u.index]:
            weight.append(0.0)
            continue
        bp = blueprint(u.label)
        rule = bp["density"] * (float(dens["base"]) + float(dens["gain"]) * u.energy)
        weight.append(u.length * (rule if u.density is None else u.density))

    def spread() -> list[float]:
        total_w = sum(w * (1 + u.extra) for w, u in zip(weight, units)) or 1.0
        return [target_slots * w / total_w for w in weight]

    per_unit_n = spread()
    for _ in range(0 if relax else 3):
        if not _cap_opening(units, weight, per_unit_n):
            break
        per_unit_n = spread()
    _cap_below_highlight(units, per_unit, per_unit_n, params)

    end_ms = cands[-1].t + 1000.0
    buckets = np.zeros(int(end_ms / BUCKET_MS) + 12)
    window = int(round(1000.0 / BUCKET_MS))
    peak_nps = params.peak_at(density_scale)
    peak_cap = peak_nps / expected_chord_notes

    def window_ok(times: list[float], cap: float | None = None) -> bool:
        cap = peak_cap if cap is None else cap
        for t in times:
            b = int(max(0.0, t) / BUCKET_MS)
            for start in range(max(0, b - window + 1), b + 1):
                if buckets[start : start + window].sum() + 1 > cap:
                    return False
        return True

    def take(times: list[float]) -> None:
        for t in times:
            buckets[int(max(0.0, t) / BUCKET_MS)] += 1

    def untake(times: list[float]) -> None:
        for t in times:
            buckets[int(max(0.0, t) / BUCKET_MS)] -= 1

    def fits(times: list[float], cap: float | None = None) -> bool:
        """Whether all these notes fit the peak density together (window_ok checks one at a time)."""
        added = []
        for t in sorted(times):
            if not window_ok([t], cap):
                break
            take([t])
            added.append(t)
        untake(added)
        return len(added) == len(times)

    sub_counts: dict[int, int] = {}
    picked_total = 0

    def partial_ok(sub: int, n: int) -> bool:
        limit = params.partial.get(sub)
        if limit is None:
            return True
        return sub_counts.get(sub, 0) + n <= max(1.0, limit * max(picked_total, target_slots * 0.5))

    chosen: dict[int, list[int]] = {}  # class -> picked offset keys
    unit_extra: dict[int, list[int]] = {}  # unit -> extra offset keys
    roll_keys: dict[int, set[int]] = {}  # class -> offset keys of its drum roll notes
    unit_rolls: dict[int, set[int]] = {}  # unit -> offset keys of a roll only it plays (a fill)
    unit_drop: dict[int, set[int]] = {}  # unit -> class notes its own roll leaves out
    carry = 0.0

    rolls_cfg = rolls_config()
    median_strength = float(np.median([c.strength for c in cands]))

    def rollish(c: Candidate) -> bool:
        """A sound that can be a roll's hit where another repeat of the music has the roll."""
        share = c.bands / (float(np.sum(c.bands)) + 1e-9)
        return float(share[2]) < float(rolls_cfg["maxHighShare"]) and c.strength >= float(rolls_cfg["adoptStrength"]) * median_strength

    def roll_picks(roll: dict[int, int], ms: list[int]) -> set[int]:
        """The roll's keys (key -> subdivision) on the finest grid the tier reads that fits the
        peak density in units `ms`; empty when only its beats would be left."""
        level = roll_level(list(roll.values()), params) if len(roll) >= 2 else 1
        while level > 1:
            keep = {k for k, sub in roll.items() if level % sub == 0}
            # a roll's notes are single notes: the tier's peak density itself, not that density
            # shared out over the chords a slot takes on the mean
            if fits([cands[per_unit[m][k]].t for k in keep for m in ms if k in per_unit[m]], peak_nps):
                return keep
            level = coarser(level)
        return set()

    for cls in range(n_classes):
        ms = members[cls]
        # The class plays what its lightest unit wants; the others add notes over it (build-up).
        # When the music has no more sounds to add, the earlier repeats play fewer instead: the base
        # leaves every unit room for its extra share.
        ceiling = min(len(per_unit[m]) / (1 + (0.0 if relax else units[m].extra)) for m in ms)
        unit_n = {m: min(per_unit_n[m], ceiling) for m in ms}
        base = float(min(unit_n.values())) + carry
        want = int(math.floor(base + 0.5))
        carry = base - want
        consensus: dict[int, float] = {}
        for m in ms:
            for k, ci in per_unit[m].items():
                consensus[k] = consensus.get(k, 0.0) + score(ci, units[m]) / len(ms)
        presence = {k: sum(1 for m in ms if k in per_unit[m]) / len(ms) for k in consensus}
        order = sorted((k for k in consensus if presence[k] >= 0.5 or len(ms) == 1), key=lambda k: (-consensus[k], k))
        picks: list[int] = []
        # A drum roll plays first, whatever the budget (rolls.py): every hit on the finest grid the
        # tier reads, or a coarser grid where the peak density does not allow it. A roll in most
        # units of the class (a build-up section) is the class's; a roll in only some of them (the
        # fill closing a verse that otherwise loops) is added to those units alone.
        flagged = {k: [m for m in ms if k in per_unit[m] and cands[per_unit[m][k]].roll is not None] for k in consensus}
        roll = {k: cands[per_unit[us[0]][k]].subdivision for k, us in flagged.items() if len(us) > 0.5 * len(ms) and k in order}
        kept = roll_picks(roll, ms)
        if kept:
            for k in sorted(kept):
                ts = [cands[per_unit[m][k]].t for m in ms if k in per_unit[m]]
                picks.append(k)
                take(ts)
                sub_counts[roll[k]] = sub_counts.get(roll[k], 0) + len(ts)
                picked_total += len(ts)
            roll_keys[cls] = kept
        # the roll has its span to itself: no other note between its hits (they would break the
        # hands' turns), neither the sounds between its grid points nor the hits it leaves out
        spans = _runs(sorted(roll), GRID) if kept else []

        def inside(k: int) -> bool:
            return k not in kept and any(a <= k <= b for a, b in spans)

        for k in order:
            if k in picks or inside(k):
                continue
            if len(picks) >= want:
                break
            times = [cands[per_unit[m][k]].t for m in ms if k in per_unit[m]]
            sub = grid_of(cands[next(per_unit[m][k] for m in ms if k in per_unit[m])])
            if partial_ok(sub, len(times)) and window_ok(times):
                picks.append(k)
                take(times)
                sub_counts[sub] = sub_counts.get(sub, 0) + len(times)
                picked_total += len(times)
        # floor: a bar of the loop with sound keeps at least one note
        if want >= 2:
            bar_keys = {}
            for k in order:
                bar_keys.setdefault(k // (GRID * bpb), []).append(k)
            for bar, keys in sorted(bar_keys.items()):
                if any(k // (GRID * bpb) == bar for k in picks) or all(inside(k) for k in keys):
                    continue
                k = next(k for k in keys if not inside(k))
                times = [cands[per_unit[m][k]].t for m in ms if k in per_unit[m]]
                if window_ok(times):
                    picks.append(k)
                    take(times)
                    picked_total += len(times)
        chosen[cls] = sorted(picks)
        # A roll only some units play (a fill) goes to them before their other extra notes; inside
        # it the class's own notes give way. Detection finds a fill's ends a little differently in
        # each repeat, so the fill is what most of the units with a roll share, and a unit whose roll
        # was missed (one softer hit) plays it too where its sounds there are the roll's kind.
        holders = {m: {k for k, us in flagged.items() if m in us and k not in roll} for m in ms}
        holders = {m: ks for m, ks in holders.items() if len(ks) >= 2}
        tally: dict[int, int] = {}
        for ks in holders.values():
            for k in ks:
                tally[k] = tally.get(k, 0) + 1
        fill = {k for k, n in tally.items() if n >= 0.5 * len(holders)}
        for m in ms:
            if len(fill) < 2:
                break
            if m in holders:
                keys_m = {k for k in fill if k in per_unit[m]}
            else:
                keys_m = {k for k in fill if k in per_unit[m] and rollish(cands[per_unit[m][k]])}
                if len(keys_m) < float(rolls_cfg["adoptShare"]) * len(fill):
                    continue
            own = {k: cands[per_unit[m][k]].subdivision for k in keys_m}
            if len(own) < 2:
                continue
            # the class's notes inside the roll make way before the roll is fitted in
            span = _runs(sorted(own), GRID)
            freed = [cands[per_unit[m][k]].t for k in picks if k in per_unit[m] and any(a <= k <= b for a, b in span)]
            untake(freed)
            mine = roll_picks(own, [m])
            if not mine:
                take(freed)
                continue
            take([cands[per_unit[m][k]].t for k in mine])
            picked_total += len(mine) - len(freed)
            unit_rolls[m] = mine
            unit_drop[m] = {k for a, b in span for k in consensus if a <= k <= b and k not in mine}
        # Units that play more than their class (repeats building up, ramps, the last chorus) add
        # notes in the class's own order, so a unit that adds more adds the same notes first and
        # every repeat plays what the earlier ones did.
        ranked = sorted((k for k in consensus if k not in picks and not inside(k)), key=lambda k: (-consensus[k], k))
        n_more = {m: int(round(unit_n[m] * (1 + units[m].extra))) - len(picks) for m in ms}
        pools = {m: [k for k in ranked if k in per_unit[m] and k not in unit_rolls.get(m, ()) and k not in unit_drop.get(m, ())] for m in ms if n_more[m] > 0}
        # the tier's grid limits hold for these notes too (MASTER's 32nds came in here: 6% of a
        # chart's hits against the 1.5% limit), decided once per key for every repeat that may add
        # it, so a later repeat is not refused a note an earlier one added
        allowed: dict[int, bool] = {}
        for m, pool in pools.items():
            extra: list[int] = []
            for k in pool:
                if len(extra) >= n_more[m]:
                    break
                if k not in allowed:
                    sub = grid_of(cands[per_unit[m][k]])
                    takers = sum(1 for p in pools.values() if k in p)
                    allowed[k] = partial_ok(sub, takers)
                    if allowed[k]:
                        sub_counts[sub] = sub_counts.get(sub, 0) + takers
                t = cands[per_unit[m][k]].t
                if allowed[k] and window_ok([t]):
                    extra.append(k)
                    take([t])
                    picked_total += 1
            unit_extra[m] = extra
        for m, mine in unit_rolls.items():
            if m in ms:
                unit_extra[m] = sorted(set(unit_extra.get(m, [])) | mine)

    # slots, unit by unit
    slots: list[Slot] = []
    slot_cand: list[int] = []
    slot_unit: list[int] = []
    slot_key: list[int] = []
    unit_slots: list[list[int]] = []
    fill_share = float(sectioned_config()["fillShare"])
    # only clear sounds are filled in: a faint detection the other repeats share may be an artefact
    fill_floor = float(sectioned_config()["fillStrength"]) * float(np.median([c.strength for c in cands]))
    for u in units:
        keys = sorted((set(chosen[u.cls]) | set(unit_extra.get(u.index, []))) - unit_drop.get(u.index, set()))
        idx = []
        ms = members[u.cls]
        for k in keys:
            ci = per_unit[u.index].get(k)
            beat = None
            if ci is None:
                # Detection missed a sound most repeats of this loop have (the class is the same
                # music: its units' sounds match): the note goes here too, taking the sound of the
                # nearest repeat that has it, unless the song is silent here.
                have = [m for m in ms if k in per_unit[m]]
                if len(ms) < 3 or len(have) < fill_share * len(ms) or k in unit_extra.get(u.index, []):
                    continue
                if float(np.mean([cands[per_unit[m][k]].strength for m in have])) < fill_floor:
                    continue
                beat = u.start + k / GRID
                if beat >= u.start + u.length - 1e-9 or (loud is not None and not loud(tempo.beat_to_ms(beat))):
                    continue
                ci = per_unit[min(have, key=lambda m: abs(m - u.index))][k]
            c = cands[ci]
            beat = c.beat if beat is None else beat
            idx.append(len(slots))
            slots.append(Slot(beat=beat, t=tempo.beat_to_ms(beat) if beat != c.beat else c.t, size=1, hold_end_beat=None, special=None, special_hold=False, pitch=c.pitch, bands=c.bands, score=c.score, subdivision=c.subdivision, strength=c.strength, sources=c.sources, sound_group=c.sound_group, jack_scale=u.jack_scale))
            slot_cand.append(ci)
            slot_unit.append(u.index)
            slot_key.append(k)
        unit_slots.append(idx)

    in_roll = [slot_key[i] in roll_keys.get(units[slot_unit[i]].cls, ()) or slot_key[i] in unit_rolls.get(slot_unit[i], ()) for i in range(len(slots))]
    mark_rolls(slots, in_roll)

    # class positions: (class, key, roll note) -> slots realizing it; the first one is the reference
    # (a note a repeat adds is copied by the later repeats that add it too; a fill's roll notes
    # only by the other fills, not by the plain loop's notes at the same place)
    positions: dict[tuple[int, int, bool], list[int]] = {}
    for i in range(len(slots)):
        u = units[slot_unit[i]]
        if slot_key[i] in chosen[u.cls] or slot_key[i] in unit_extra.get(u.index, ()):
            positions.setdefault((u.cls, slot_key[i], in_roll[i]), []).append(i)
    ref: list[int | None] = [None] * len(slots)
    for idxs in positions.values():
        for i in idxs[1:]:
            ref[i] = idxs[0]
    _bar_refs(units, members, per_unit, unit_slots, slot_key, ref, cands, bpb)

    _assign_chords(slots, slot_cand, positions, units, slot_unit, cands, params, key_count, chord_scale)
    _assign_long_notes(slots, slot_cand, positions, units, slot_unit, cands, params, tempo, plan_holds=not relax)
    if special_kind == "scratch":
        _assign_special(slots, slot_cand, positions, cands, params, "scratch", tempo)
    elif special_kind == "side":
        _assign_special(slots, slot_cand, positions, cands, params, "side", tempo)
    before = [s.hold_end_beat for s in slots]
    clear_holds(slots, params)
    _same_holds(slots, positions, before)
    _accents(slots, units, unit_slots, params, key_count)

    phrases, phrase_keys = _phrases(slots, units, unit_slots, slot_key, bpb)
    return Layout(slots=slots, units=units, unit_slots=unit_slots, ref=ref, slot_unit=slot_unit, phrases=phrases, phrase_keys=phrase_keys)


def _runs(keys: list[int], gap: int) -> list[tuple[int, int]]:
    """(first, last) of each stretch of sorted keys at most `gap` apart."""
    out: list[tuple[int, int]] = []
    for k in keys:
        if out and k - out[-1][1] <= gap:
            out[-1] = (out[-1][0], k)
        else:
            out.append((k, k))
    return out


def _bar_refs(units, members, per_unit, unit_slots, slot_key, ref, cands, bpb) -> None:
    """The first unit of a class may still repeat bars of an earlier loop of its group (a verse
    whose second loop only ends with a fill): a bar that matches the same bar of an earlier unit
    copies that bar's lanes wherever both have a note."""
    threshold = float(sectioned_config()["classSimilarity"])
    bar_len = GRID * bpb
    for u in units:
        if members[u.cls][0] != u.index or not unit_slots[u.index]:
            continue
        earlier = [v for v in units[: u.index] if v.group == u.group and abs(v.length - u.length) < 1e-6 and unit_slots[v.index]]
        if not earlier:
            continue
        n_bars = int(round(u.length / bpb))
        for j in range(n_bars):
            lo, hi = j * bar_len, (j + 1) * bar_len
            mine = {k: c for k, c in per_unit[u.index].items() if lo <= k < hi}
            if not mine:
                continue
            best, best_sim = None, threshold
            for v in reversed(earlier):
                theirs = {k: c for k, c in per_unit[v.index].items() if lo <= k < hi}
                sim = _similarity(mine, theirs, cands) if theirs else 0.0
                if sim > best_sim:
                    best, best_sim = v, sim
            if best is None:
                continue
            at = {slot_key[i]: i for i in unit_slots[best.index]}
            for i in unit_slots[u.index]:
                if lo <= slot_key[i] < hi and ref[i] is None and slot_key[i] in at:
                    ref[i] = at[slot_key[i]]


def _realized(positions: dict[tuple[int, int], list[int]], extra_slots: list[int]) -> list[tuple[Any, list[int]]]:
    """Decision units: class positions (all their slots at once) and the slots outside any."""
    out: list[tuple[Any, list[int]]] = list(positions.items())
    out += [(("x", i), [i]) for i in extra_slots]
    return out


def _outside(slots: list[Slot], positions: dict[tuple[int, int], list[int]]) -> list[int]:
    inside = {i for idxs in positions.values() for i in idxs}
    return [i for i in range(len(slots)) if i not in inside]


def _assign_chords(slots, slot_cand, positions, units, slot_unit, cands, params: GenParams, key_count: int, chord_scale: float) -> None:
    max_chord = min(params.max_chord, max(2, int(np.ceil(key_count * 0.6))))
    if max_chord < 2 or not slots:
        return
    ratio = min(MAX_CHORD_RATIO, params.chord_ratio * chord_scale * (0.75 if key_count <= 4 else 1.0))
    target = ratio * len(slots)
    if target < 0.5:
        return
    options = []
    for key, idxs in _realized(positions, _outside(slots, positions)):
        if any(slots[i].roll is not None for i in idxs):
            continue  # a roll is one hand at a time
        u = units[slot_unit[idxs[0]]]
        mult = blueprint(u.label)["chord"] if u.chord is None else u.chord
        worth = float(np.mean([_chord_worth(cands[slot_cand[i]], params) for i in idxs])) * mult
        if worth > 0:
            options.append((worth, key, idxs))
    options.sort(key=lambda o: (-o[0], str(o[1])))
    placed = 0
    picked = []
    for worth, key, idxs in options:
        if placed >= target - 0.5 * len(idxs):
            break
        picked.append(idxs)
        placed += len(idxs)
    extra = max_chord - 2
    for rank, idxs in enumerate(picked):
        top = rank / max(1, len(picked))
        size = 2 + (int(round(extra * (1.0 - top) ** params.chord_size_power)) if extra > 0 else 0)
        for i in idxs:
            slots[i].size = max(2, min(max_chord, size))


def _assign_long_notes(slots, slot_cand, positions, units, slot_unit, cands, params: GenParams, tempo: TempoMap, plan_holds: bool = True) -> None:
    if params.long_note_ratio <= 0 or not slots:
        return
    target = params.long_note_ratio * len(slots)
    power = float(section_plan.plan_config().get("holdPower", 1.0))
    options = []
    for key, idxs in _realized(positions, _outside(slots, positions)):
        sustains = [cands[slot_cand[i]].sustain_beats for i in idxs]
        if min(sustains) < params.min_ln_beats or any(slots[i].roll is not None for i in idxs):
            continue
        if not all(holdable(cands[slot_cand[i]], tempo) for i in idxs):
            continue
        u = units[slot_unit[idxs[0]]]
        mult = blueprint(u.label)["hold"] if u.hold is None or not plan_holds else u.hold ** power
        value = float(np.mean([hold_value(cands[slot_cand[i]], tempo) for i in idxs])) * mult
        options.append((value, key, idxs, min(sustains)))
    options.sort(key=lambda o: (-o[0], str(o[1])))
    placed = 0
    for value, key, idxs, sustain in options:
        if placed >= target - 0.5 * len(idxs):
            break
        # every slot of a class position sits at the same place in its bar: one length ends them all
        # on the same grid point
        first = slots[idxs[0]]
        end = hold_end(first.beat, sustain, params.min_ln_beats, params.skill)
        if end is None:
            continue
        for i in idxs:
            slots[i].hold_end_beat = slots[i].beat + (end - first.beat)
            mark_hold_count(slots[i], cands[slot_cand[i]], params)
        placed += len(idxs)


def _same_holds(slots: list[Slot], positions: dict, before: list[float | None]) -> None:
    """Every repeat of a class position keeps the same long note after select.clear_holds cut some
    of them (a later repeat plays more notes under it): the shortest one left, or none when a
    repeat lost it. The slots sit at the same place in their bars, so one length stays on the grid."""
    for idxs in positions.values():
        held = [i for i in idxs if before[i] is not None]
        if not any(slots[i].hold_end_beat != before[i] for i in held):
            continue
        if any(slots[i].hold_end_beat is None for i in held):
            for i in held:
                slots[i].hold_end_beat = None
                slots[i].hold_count = 1
            continue
        length = min(slots[i].hold_end_beat - slots[i].beat for i in held)  # type: ignore[operator]
        for i in held:
            slots[i].hold_end_beat = slots[i].beat + length


def _assign_special(slots, slot_cand, positions, cands, params: GenParams, kind: str, tempo: TempoMap) -> None:
    """Scratch or side notes per class position, spaced in every unit that plays it."""
    rate = params.scratch_rate if kind == "scratch" else params.side_rate
    n = rate * len(slots)
    if n < 0.5:
        return
    gap = max(params.min_jack_ms, 250.0 if kind == "scratch" else 450.0)
    taken: list[float] = []
    decisions = _realized(positions, _outside(slots, positions))

    def spaced(idxs: list[int]) -> bool:
        return all(slots[i].special is None and slots[i].roll is None and all(abs(slots[i].t - t) >= gap for t in taken) for i in idxs)

    placed = 0
    if kind == "side":
        min_hold = max(1.0, params.min_ln_beats)
        holds = []
        for key, idxs in decisions:
            cs = [cands[slot_cand[i]] for i in idxs]
            if min(c.sustain_beats for c in cs) >= min_hold and all(slots[i].subdivision <= 2 for i in idxs) and all(holdable(c, tempo) for c in cs):
                sustain = min(c.sustain_beats for c in cs)
                if hold_end(slots[idxs[0]].beat, sustain, min_hold, 0.0) is not None:
                    holds.append((float(np.mean([c.sustain_beats * (0.5 + c.harmonic) for c in cs])), key, idxs, sustain))
        holds.sort(key=lambda o: (-o[0], str(o[1])))
        want_holds = n * SIDE_HOLD_SHARE
        for value, key, idxs, sustain in holds:
            if placed >= want_holds - 0.5 * len(idxs):
                break
            if not spaced(idxs):
                continue
            end = hold_end(slots[idxs[0]].beat, sustain, min_hold, 0.0)
            for i in idxs:
                slots[i].special = "side"
                slots[i].special_hold = True
                slots[i].hold_end_beat = slots[i].beat + (end - slots[idxs[0]].beat)  # type: ignore[operator]
                taken.append(slots[i].t)
            placed += len(idxs)
    impacts = []
    for key, idxs in decisions:
        cs = [cands[slot_cand[i]] for i in idxs]
        if kind == "scratch":
            def imp(c: Candidate, s: Slot) -> float:
                total = float(np.sum(s.bands)) + 1e-9
                return s.strength * (0.5 + s.bands[0] / total + s.bands[2] / total) * (1.3 if s.subdivision == 1 else 1.0)
        else:
            def imp(c: Candidate, s: Slot) -> float:
                return s.strength * (1.3 if s.subdivision == 1 else 0.8) * (0.7 + 0.6 * c.intensity)
        impacts.append((float(np.mean([imp(c, slots[i]) for c, i in zip(cs, idxs)])), key, idxs))
    impacts.sort(key=lambda o: (-o[0], str(o[1])))
    for value, key, idxs in impacts:
        if placed >= n - 0.5 * len(idxs):
            break
        if not spaced(idxs):
            continue
        for i in idxs:
            slots[i].special = kind
            if kind == "scratch" and slots[i].size == 1 and slots[i].hold_end_beat is not None:
                slots[i].hold_end_beat = None  # keep scratch notes short
            taken.append(slots[i].t)
        placed += len(idxs)


def _accents(slots: list[Slot], units: list[Unit], unit_slots: list[list[int]], params: GenParams, key_count: int) -> None:
    """A section that starts something new opens with a chord on its downbeat."""
    cfg = sectioned_config()["accent"]
    if params.max_chord < 2 or params.skill < float(cfg["minSkill"]) or key_count < 4:
        return
    for u, idxs in zip(units, unit_slots):
        if not u.accent or not idxs:
            continue
        first = slots[idxs[0]]
        if abs(first.beat - u.start) < 1e-6 and first.size == 1 and first.special is None and first.roll is None:
            first.size = 2


def _phrases(slots: list[Slot], units: list[Unit], unit_slots: list[list[int]], slot_key: list[int], bpb: int) -> tuple[list[list[int]], list[tuple[int, int]]]:
    """Planner phrases: one per unit (cut at bar lines when longer than a phrase may be), keyed by
    material class and part so every repeat of a loop plays the same pattern."""
    max_notes = int(load_config("patterns")["phrase"]["maxNotes"])
    phrases: list[list[int]] = []
    keys: list[tuple[int, int]] = []
    for u, idxs in zip(units, unit_slots):
        if not idxs:
            continue
        parts = [idxs]
        if len(idxs) > max_notes and u.length > bpb:
            by_bar: dict[int, list[int]] = {}
            for i in idxs:
                by_bar.setdefault(int((slots[i].beat - u.start) // bpb), []).append(i)
            parts = [by_bar[b] for b in sorted(by_bar)]
        for part, p in enumerate(parts):
            phrases.append(p)
            keys.append((u.cls, part))
    return phrases, keys


def place(
    lay: Layout,
    lanes: list[LaneInfo],
    params: GenParams,
    tempo: TempoMap,
    rng: np.random.Generator,
    plan: list[SlotPlan] | None,
    lane_plan: dict[int, float] | None = None,
    plan_weight: float = 0.0,
) -> tuple[list[Choice], float | None]:
    """Lanes unit by unit (module docstring, step 5); returns the choices and the share of copied
    slots that kept their reference's lanes. `lane_plan` (core.lane_plan: the top tier's single
    notes by beat * GRID) sets the way each slot moves from the one before, at `plan_weight`
    (sectioned.tierPlan)."""
    force = float(sectioned_config()["force"]) * params.repeat_consistency
    dirs: list[int | None] = [None] * len(lay.slots)
    if lane_plan:
        at = [lane_plan.get(round(s.beat * GRID)) for s in lay.slots]
        for i in range(1, len(at)):
            if at[i] is not None and at[i - 1] is not None:
                dirs[i] = (at[i] > at[i - 1] + 1e-9) - (at[i] < at[i - 1] - 1e-9)
    pitch = _pitch_targets(lay.slots)
    cache: dict[str, Any] = {}
    chosen: list[tuple[int, ...] | None] = [None] * len(lay.slots)
    out: list[Choice] = []
    state = None
    kept = total = 0
    for u, idxs in zip(lay.units, lay.unit_slots):
        if not idxs:
            continue
        targets: list[tuple[int, ...] | None] | None = None
        if force > 0:
            targets = []
            for i in idxs:
                # a roll's notes are not copied: the hands' turns place them the same way, and a copy
                # that a held note blocks would leave two notes on one hand
                r = lay.ref[i] if lay.slots[i].roll is None else None
                t = chosen[r] if r is not None else None
                targets.append(t or None)
        sub_plan = [plan[i] for i in idxs] if plan else None
        choices, state = search(
            [lay.slots[i] for i in idxs], lanes, params, tempo, rng, targets, sub_plan,
            start=state, pitch_targets=[pitch[i] for i in idxs], repeat_weight=force if targets else None, cache=cache,
            plan_dirs=[dirs[i] for i in idxs] if lane_plan else None, plan_weight=plan_weight,
        )
        for li, used, ln in choices:
            gi = idxs[li]
            chosen[gi] = tuple(sorted(l for l in used if lanes[l].kind == "key"))
            out.append((gi, used, ln))
            if targets and targets[li] is not None:
                total += 1
                kept += chosen[gi] == targets[li]
    return out, (kept / total if total else None)
