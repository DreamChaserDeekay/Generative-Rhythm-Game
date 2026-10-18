"""Pattern planner: splits the slots into phrases, reads each phrase's musical gesture and picks a
pattern per phrase (section themes, variety, repeats, a complexity budget), so the lane search
places shapes instead of single notes (docs/PATTERN_DESIGN.md)."""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from ..analysis.stems import STEM_NAMES
from .motifs import SlotPlan, pattern_config
from .params import GenParams
from .repeat import repeat_references
from .select import Slot
from .tempo import TempoMap

DRUMS, BASS = STEM_NAMES.index("drums"), STEM_NAMES.index("bass")


@dataclass
class Phrase:
    slots: list[int]
    section: int
    group: str | None
    energy: float
    gesture: str
    direction: int
    singles: int
    chords: int
    holds: int
    wide: list[bool]  # per slot: accent with strong lows and highs
    register: float | None  # mean song-wide pitch rank (0..1) of its pitched notes
    median_ioi: float
    cells: list[int | None]  # per slot: earlier position with the same sound
    halves: int | None  # length of a call when the phrase is a call and its answer
    steps: list[int]  # per slot: direction of its pitch from the previous melodic note
    pedal: list[bool]  # per slot: plays the phrase's pedal note (the most repeated pitch)


def _key_size(slot: Slot) -> int:
    return slot.size - (1 if slot.special is not None else 0)


def segment(slots: list[Slot], sections: list[dict[str, Any]], tempo: TempoMap) -> list[list[int]]:
    """Phrases: bars, cut at rests and section starts, short ones merged, long ones halved."""
    cfg = pattern_config()["phrase"]
    bpb = tempo.beats_per_bar
    starts = sorted(float(s["startBeat"]) for s in sections)

    def section_of(beat: float) -> int:
        return bisect.bisect_right(starts, beat + 1e-6)

    groups: list[list[int]] = []
    cur: list[int] = []
    for i, s in enumerate(slots):
        if cur:
            p = slots[cur[-1]]
            if (
                math.floor(s.beat / bpb + 1e-9) != math.floor(slots[cur[0]].beat / bpb + 1e-9)
                or s.beat - p.beat > cfg["restBeats"]
                or section_of(s.beat) != section_of(p.beat)
            ):
                groups.append(cur)
                cur = []
        cur.append(i)
    if cur:
        groups.append(cur)
    merged: list[list[int]] = []
    for g in groups:
        last = merged[-1] if merged else None
        if (
            last is not None
            and len(last) < cfg["minNotes"]
            and len(last) + len(g) <= cfg["maxNotes"]
            and slots[g[0]].beat - slots[last[-1]].beat <= cfg["restBeats"]
            and section_of(slots[g[0]].beat) == section_of(slots[last[-1]].beat)
        ):
            last.extend(g)
        else:
            merged.append(g)
    out: list[list[int]] = []
    for g in merged:
        while len(g) > cfg["maxNotes"]:
            half = slots[g[0]].beat + (slots[g[-1]].beat - slots[g[0]].beat) / 2
            cut = next((j for j, i in enumerate(g) if slots[i].beat >= half - 1e-9), len(g) // 2)
            cut = min(max(cut, cfg["minNotes"]), len(g) - 1)
            out.append(g[:cut])
            g = g[cut:]
        out.append(g)
    return out


def _pitch_ranks(slots: list[Slot]) -> list[float | None]:
    pitched = sorted(s.pitch for s in slots if s.pitch is not None)
    if not pitched:
        return [None] * len(slots)
    n = len(pitched)
    return [None if s.pitch is None else (bisect.bisect_left(pitched, s.pitch) + bisect.bisect_right(pitched, s.pitch)) / (2 * n) for s in slots]


def _melodic(slot: Slot) -> bool:
    """A slot whose pitch belongs to its sound (not a drum hit that inherits a melody pitch)."""
    if slot.pitch is None:
        return False
    return slot.sources is None or int(np.argmax(slot.sources)) != DRUMS


def gesture(slots: list[Slot], idx: list[int]) -> tuple[str, int]:
    """(gesture, direction) of a phrase from its melodic notes, or "rhythm" when drums lead."""
    cfg = pattern_config()["gesture"]
    drum = [float(slots[i].sources[DRUMS]) for i in idx if slots[i].sources is not None]
    pitches = [float(slots[i].pitch) for i in idx if _melodic(slots[i])]  # chords carry the melody too
    if drum and float(np.mean(drum)) >= cfg["drumShare"] or len(pitches) < 3:
        return "rhythm", 1
    steps = np.diff(pitches)
    same = np.abs(steps) < cfg["sameSemitones"]
    moving = steps[~same]
    trend = pitches[-1] - pitches[0]
    if abs(trend) < cfg["sameSemitones"]:
        trend = float(np.sum(np.sign(moving)))
    direction = 1 if trend >= 0 else -1
    if same.mean() >= cfg["repeatShare"]:
        return "repeat", direction
    if len(moving) < 2:
        return "free", direction
    signs = np.sign(moving)
    turns = int(np.sum(signs[1:] != signs[:-1]))
    distinct = len({round(p) for p in pitches})
    if distinct <= 2 and turns / (len(moving) - 1) >= cfg["oscillateShare"]:
        return "oscillate", direction
    evens = pitches[::2]
    if len(pitches) >= 5 and max(evens) - min(evens) < cfg["sameSemitones"] * 2 and len({round(p) for p in pitches[1::2]}) >= 2:
        return "pedal", direction
    if turns <= max(1, int(len(moving) * cfg["turnShare"])):
        size = float(np.mean(np.abs(moving)))
        if size <= cfg["stepSemitones"]:
            return "run", direction
        if size <= cfg["arpeggioSemitones"]:
            return "arpeggio", direction
    return "free", direction


def step_directions(slots: list[Slot], idx: list[int]) -> list[int]:
    """Per slot the way its pitch moved from the phrase's previous melodic note (0 = unknown or
    the same note), so a stair turns where the melody turns."""
    same = pattern_config()["gesture"]["sameSemitones"]
    out, prev = [], None
    for i in idx:
        s = slots[i]
        d = 0
        if _melodic(s):
            if prev is not None and abs(s.pitch - prev) >= same:
                d = 1 if s.pitch > prev else -1
            prev = s.pitch
        out.append(d)
    return out


def _pedal_notes(slots: list[Slot], idx: list[int]) -> list[bool]:
    """Slots playing the phrase's most repeated melodic pitch (the pedal of an anchor pattern)."""
    pitches = [round(float(slots[i].pitch)) if _melodic(slots[i]) else None for i in idx]
    counts: dict[int, int] = {}
    for p in pitches:
        if p is not None:
            counts[p] = counts.get(p, 0) + 1
    if not counts:
        return [False] * len(idx)
    pedal = max(counts, key=lambda p: (counts[p], -p))
    return [p == pedal for p in pitches]


def layer_of(slot: Slot) -> str:
    """"rhythm" for drums and bass (the low end, one hand on hard charts), else "melody"."""
    if slot.sources is None:
        return "melody" if slot.pitch is not None else "rhythm"
    return "rhythm" if int(np.argmax(slot.sources)) in (DRUMS, BASS) else "melody"


def _sound(slot: Slot) -> tuple[Any, ...]:
    """What makes two slots "the same sound": stem and pitch, or stem and loudest band."""
    src = slot.src
    if _melodic(slot):
        return (src, round(float(slot.pitch)))
    return (src, int(np.argmax(slot.bands)))


def _cells(slots: list[Slot], idx: list[int]) -> list[int | None]:
    """Per position the latest earlier position (not the previous one) playing the same sound."""
    out: list[int | None] = []
    seen: dict[tuple[Any, ...], int] = {}
    for k, i in enumerate(idx):
        s = slots[i]
        key = _sound(s) + (_key_size(s),)
        ref = seen.get(key)
        out.append(ref if ref is not None and ref < k - 1 else None)
        seen[key] = k
    return out


def _halves(slots: list[Slot], idx: list[int]) -> int | None:
    """Length of the call when the second half answers the first: the same rhythm and the same
    melodic shape in another register (or another instrument), not simply the same notes again."""
    n = len(idx)
    if n < 6 or n % 2:
        return None
    h = n // 2
    first, second = idx[:h], idx[h:]
    a = [slots[i].beat - slots[first[0]].beat for i in first]
    b = [slots[i].beat - slots[second[0]].beat for i in second]
    if any(abs(x - y) > 1e-6 for x, y in zip(a, b)):
        return None
    if all(_sound(slots[i]) == _sound(slots[j]) for i, j in zip(first, second)):
        return None  # the same notes again: the cells already repeat them
    if all(_melodic(slots[i]) for i in idx):
        same = pattern_config()["gesture"]["sameSemitones"]
        steps_a = np.diff([slots[i].pitch for i in first])
        steps_b = np.diff([slots[i].pitch for i in second])
        if np.max(np.abs(steps_a - steps_b)) >= same:
            return None  # another melody, not an answer
    elif [slots[i].src for i in first] != [slots[j].src for j in second]:
        return None
    return h


def phrases_of(slots: list[Slot], sections: list[dict[str, Any]], tempo: TempoMap, groups: list[list[int]] | None = None) -> list[Phrase]:
    """Phrases with what the planner reads from them; `groups` gives the phrases' slots (the
    sectioned engine's loop units) instead of `segment`."""
    ranks = _pitch_ranks(slots)
    ordered = sorted(sections, key=lambda s: float(s["startBeat"]))
    starts = [float(s["startBeat"]) for s in ordered]
    out = []
    for idx in groups if groups is not None else segment(slots, ordered, tempo):
        sec = max(0, bisect.bisect_right(starts, slots[idx[0]].beat + 1e-6) - 1)
        info = ordered[sec] if ordered else {}
        g, d = gesture(slots, idx)
        wide = []
        for i in idx:
            bands = slots[i].bands
            total = float(np.sum(bands)) + 1e-9
            wide.append(bool(bands[0] / total >= 0.25 and bands[2] / total >= 0.25))
        reg = [ranks[i] for i in idx if ranks[i] is not None and _melodic(slots[i])]
        times = [slots[i].t for i in idx]
        out.append(
            Phrase(
                slots=idx,
                section=sec,
                group=info.get("group"),
                energy=float(info.get("energy", 0.5)),
                gesture=g,
                direction=d,
                singles=sum(1 for i in idx if _key_size(slots[i]) == 1),
                chords=sum(1 for i in idx if _key_size(slots[i]) >= 2),
                holds=sum(1 for i in idx if slots[i].hold_end_beat is not None and not slots[i].special_hold),
                wide=wide,
                register=float(np.mean(reg)) if reg else None,
                median_ioi=float(np.median(np.diff(times))) if len(times) > 1 else 1000.0,
                cells=_cells(slots, idx),
                halves=_halves(slots, idx),
                steps=step_directions(slots, idx),
                pedal=_pedal_notes(slots, idx),
            )
        )
    return out


def _idioms(params: GenParams) -> list[dict[str, Any]]:
    """Key mode habits of the chart's system (config "idioms")."""
    return [
        i for i in pattern_config()["idioms"]
        if i.get("keyMode", params.key_mode) == params.key_mode and i.get("system", params.system) == params.system
    ]


def vocabulary(params: GenParams) -> dict[str, dict[str, Any]]:
    """Patterns this chart may use, with their weight for its system, style and key mode."""
    cfg = pattern_config()
    style = cfg["styles"].get(params.system, {})
    bias = cfg["styleBias"].get(params.style, {})
    idiom = {i["motif"]: float(i["weight"]) for i in _idioms(params) if "motif" in i}
    out = {}
    for name, m in cfg["motifs"].items():
        if params.skill < float(m["minSkill"]):
            continue
        if "keyModes" in m and params.key_mode not in m["keyModes"]:
            continue
        if "systems" in m and params.system not in m["systems"]:
            continue
        out[name] = {
            "complexity": float(m["complexity"]),
            "weight": float(style.get(name, 1.0)) * float(bias.get(name, 1.0)) * idiom.get(name, 1.0),
        }
    return out


def _feasible(name: str, p: Phrase, params: GenParams) -> bool:
    if name in ("stair", "roll", "brokenStair"):
        return p.singles >= 3
    if name == "trill":
        return p.singles >= 4
    if name == "split":
        return p.singles >= 3
    if name == "jack":
        return p.singles >= 3 and p.median_ioi >= params.min_jack_ms
    if name == "anchor":
        return p.singles >= 5
    if name == "callResponse":
        return p.halves is not None
    if name == "laser":
        return p.singles >= 3 and p.gesture in ("repeat", "rhythm")
    return True  # step


def _fit(name: str, p: Phrase) -> float:
    cfg = pattern_config()
    score = float(cfg["fit"].get(p.gesture, {}).get(name, 0.0))
    if name == "callResponse" and p.halves is not None:
        score += cfg["overlays"]["callResponse"]
    return score


def chord_texture(p: Phrase, params: GenParams) -> str:
    """How a phrase's chords relate: moving together (stair), repeated (jack) or varied."""
    cfg = pattern_config()
    textures = cfg["chordTextures"]
    style = cfg["styles"].get(params.system, {})
    bias = cfg["styleBias"].get(params.style, {})
    best, best_score = "vary", float(textures["vary"]["fit"].get(p.gesture, 0.5))
    if p.chords < 3:
        return best
    for name in ("stair", "jack"):
        t = textures[name]
        if params.skill < float(t["minSkill"]):
            continue
        score = float(t["fit"].get(p.gesture, 0.0)) * float(style.get(f"chord:{name}", 1.0)) * float(bias.get(f"chord:{name}", 1.0))
        if score > best_score:
            best, best_score = name, score
    return best


def choose_motifs(phrases: list[Phrase], params: GenParams, keys: list[tuple[int, int]] | None = None) -> list[str]:
    """One pattern per phrase: section themes, then a Viterbi pass over the phrases.

    With `keys` (the sectioned engine: material class and part of every phrase) a group keeps to
    its theme patterns (one on easy charts, two from `sectioned.themes.twoSkill`; any other pattern
    pays `offTheme`), consecutive phrases are not pushed apart, and every phrase of a class plays
    the pattern of the class's first phrase."""
    cfg = pattern_config()
    vocab = vocabulary(params)
    names = list(vocab)
    budget_cfg, trans = cfg["budget"], cfg["transition"]
    sectioned = keys is not None
    theme_cfg = cfg["sectioned"]["themes"]
    n_themes = 2 if not sectioned or params.skill >= float(theme_cfg["twoSkill"]) else 1
    # section themes: the best-fitting patterns of each repetition group
    themes: dict[Any, set[str]] = {}
    for key in {p.group if p.group is not None else p.section for p in phrases}:
        members = [p for p in phrases if (p.group if p.group is not None else p.section) == key]
        totals = {m: sum(_fit(m, p) * vocab[m]["weight"] for p in members if _feasible(m, p, params)) for m in names if m != "step"}
        themes[key] = {m for m, v in sorted(totals.items(), key=lambda x: (-x[1], x[0]))[:n_themes] if v > 0}

    def budget(i: int, p: Phrase) -> float:
        b = params.skill * (budget_cfg["energyBase"] + budget_cfg["energyGain"] * p.energy) * budget_cfg["max"]
        return b * (budget_cfg["warmupScale"] if i < budget_cfg["warmupPhrases"] else 1.0)

    def score(i: int, p: Phrase, m: str) -> float:
        if not _feasible(m, p, params):
            return -math.inf
        own = themes.get(p.group if p.group is not None else p.section, set())
        theme = trans["themeBonus"] if m in own else 0.0
        over = max(0.0, vocab[m]["complexity"] - max(budget(i, p), 0.5))
        off = float(theme_cfg["offTheme"]) if sectioned and own and m not in own and m != "step" else 0.0
        return (_fit(m, p) + theme) * vocab[m]["weight"] - budget_cfg["penalty"] * over - off

    if not phrases:
        return []
    best = [{m: score(0, phrases[0], m) for m in names}]
    back: list[dict[str, str | None]] = [{m: None for m in names}]
    for i in range(1, len(phrases)):
        p = phrases[i]
        row, prev_row = {}, {}
        for m in names:
            s = score(i, p, m)
            if s == -math.inf:
                row[m], prev_row[m] = -math.inf, None
                continue
            hard = vocab[m]["complexity"] >= 0.8 * budget(i, p)
            options = []
            for q, v in best[-1].items():
                if v == -math.inf:
                    continue
                t = -trans["samePenalty"] if not sectioned and q == m and p.gesture != phrases[i - 1].gesture else 0.0
                if hard and params.skill < 0.6 and vocab[q]["complexity"] >= 0.8 * budget(i - 1, phrases[i - 1]):
                    t -= trans["hardPairPenalty"]
                options.append((v + t, q))
            v, q = max(options) if options else (-math.inf, None)
            row[m], prev_row[m] = v + s, q
        best.append(row)
        back.append(prev_row)
    m = max(best[-1], key=lambda k: best[-1][k])
    out = [m]
    for i in range(len(phrases) - 1, 0, -1):
        m = back[i][m] or "step"
        out.append(m)
    out.reverse()
    if keys is not None:
        first: dict[tuple[int, int], str] = {}
        for i, (p, k) in enumerate(zip(phrases, keys)):
            if k in first:
                if _feasible(first[k], p, params):
                    out[i] = first[k]
            else:
                first[k] = out[i]
    return out


def windows(phrases: list[Phrase], params: GenParams, n_keys: int) -> list[tuple[int, int] | None]:
    """Easy charts keep each phrase on a few neighbouring lanes, following its register slowly."""
    cfg = pattern_config()["windows"]
    if params.skill >= cfg["looseSkill"]:
        return [None] * len(phrases)
    width = int(cfg["width"].get(params.key_mode, n_keys)) + (0 if params.skill < cfg["skill"] else 1)
    if width >= n_keys:
        return [None] * len(phrases)
    out: list[tuple[int, int] | None] = []
    start = (n_keys - width) // 2
    for p in phrases:
        if p.register is not None:
            want = int(round(p.register * (n_keys - width)))
            start += max(-1, min(1, want - start))
        out.append((start, start + width - 1))
    return out


def chord_size_power(params: GenParams) -> float | None:
    """How often chords grow past two notes on this system and key mode (EZ2ON 8K: often)."""
    powers = [float(i["chordSizePower"]) for i in _idioms(params) if "chordSizePower" in i]
    return powers[0] if powers else None


def role_regions(slots: list[Slot], phrases: list[Phrase], params: GenParams, hands: tuple[str, ...]) -> list[dict[str, tuple[int, int]] | None]:
    """Where rhythm and melody go in phrases that have both: two overlapping thirds of the keys
    from the middle skill, one hand each on hard charts. Systems in flipSystems swap sides from one
    repetition group to the next; the others keep them for the whole song."""
    cfg = pattern_config()["roles"]
    n = len(hands)
    split_at = cfg["handSplitSkill8K"] if params.key_mode == "8K" else cfg["handSplitSkill"]
    groups: list[Any] = []
    for p in phrases:
        key = p.group if p.group is not None else p.section
        if key not in groups:
            groups.append(key)
    out: list[dict[str, tuple[int, int]] | None] = []
    for p in phrases:
        layers = [layer_of(slots[i]) for i in p.slots]
        if params.skill < cfg["melodySkill"] or min(layers.count("rhythm"), layers.count("melody")) < 2:
            out.append(None)
            continue
        if params.skill >= split_at and n >= 5:
            left = [k for k, h in enumerate(hands) if h in ("L", "T")]
            right = [k for k, h in enumerate(hands) if h in ("R", "T")]
            rhythm, melody = (left[0], left[-1]), (right[0], right[-1])
        else:
            third = max(1, n // 3)
            rhythm, melody = (0, n - 1 - third), (third, n - 1)
        flip = params.system in cfg["flipSystems"] and groups.index(p.group if p.group is not None else p.section) % 2 == 1
        if flip:
            rhythm, melody = (n - 1 - rhythm[1], n - 1 - rhythm[0]), (n - 1 - melody[1], n - 1 - melody[0])
        out.append({"rhythm": rhythm, "melody": melody})
    return out


def sound_homes(slots: list[Slot], phrases: list[Phrase], regions: list[dict[str, tuple[int, int]] | None], params: GenParams, n_keys: int) -> list[int | None]:
    """A home key for each drum hit: kick low, snare in the middle, hats high, inside the rhythm
    region when the phrase has one. The region changes only between repetition groups (or never on
    song-home systems), so a drum sound keeps its key through a section."""
    song = params.system in pattern_config()["roles"]["songHomes"]
    first = next((r for r in regions if r is not None), None)
    out: list[int | None] = [None] * len(slots)
    for p, region in zip(phrases, regions):
        lo, hi = (first if song and first else region or {}).get("rhythm", (0, n_keys - 1))
        for i in p.slots:
            s = slots[i]
            if s.sources is None or int(np.argmax(s.sources)) != DRUMS or _melodic(s):
                continue
            band = int(np.argmax(s.bands))  # 0 low (kick), 1 mid (snare), 2 high (hats)
            out[i] = int(round(lo + (hi - lo) * (0.15, 0.5, 0.85)[band]))
    return out


def plan_patterns(
    slots: list[Slot],
    sections: list[dict[str, Any]],
    params: GenParams,
    hands: tuple[str, ...],
    tempo: TempoMap,
    groups: list[list[int]] | None = None,
    keys: list[tuple[int, int]] | None = None,
) -> list[SlotPlan]:
    """The pattern of every slot; `hands` are the key lanes' hands (L, R, T for a shared key).
    `groups` and `keys` come from the sectioned engine (sections.Layout.phrases / phrase_keys)."""
    if not slots:
        return []
    n_keys = len(hands)
    phrases = phrases_of(slots, sections, tempo, groups)
    motifs = choose_motifs(phrases, params, keys)
    if keys is None:
        # repeated sections play their first occurrence's patterns
        refs, _ = repeat_references(slots, sections)
        owner = {i: n for n, p in enumerate(phrases) for i in p.slots}
        for n, p in enumerate(phrases):
            sources = [owner[r] for r in (refs[i] for i in p.slots) if r is not None and r in owner]
            if sources:
                ref = max(set(sources), key=sources.count)
                if ref < n and _feasible(motifs[ref], p, params):
                    motifs[n] = motifs[ref]
    wins = windows(phrases, params, n_keys)
    textures = [chord_texture(p, params) for p in phrases]
    regions = role_regions(slots, phrases, params, hands)
    homes = sound_homes(slots, phrases, regions, params, n_keys) if params.instrument_mapping > 0 else [None] * len(slots)
    plan: list[SlotPlan] = [None] * len(slots)  # type: ignore[list-item]  # every slot is in a phrase
    for n, (p, motif, win) in enumerate(zip(phrases, motifs, wins)):
        # rhythm phrases have no melodic direction: alternate it so stairs and rolls vary (by class
        # in the sectioned engine, so a loop keeps its direction)
        turn = n if keys is None else sum(keys[n])
        direction = p.direction if p.gesture != "rhythm" else (1 if turn % 2 == 0 else -1)
        layers = [layer_of(slots[i]) for i in p.slots]
        for k, i in enumerate(p.slots):
            mirror_ref = k - p.halves if motif == "callResponse" and p.halves is not None and k >= p.halves else None
            plan[i] = SlotPlan(
                phrase=n,
                k=k,
                motif=motif,
                chords=textures[n],
                hold_tap=p.holds > 0,
                direction=direction,
                step=p.steps[k],
                pedal=motif == "anchor" and p.pedal[k],
                window=win,
                cell_ref=None if mirror_ref is not None else p.cells[k],
                mirror_ref=mirror_ref,
                wide=p.wide[k],
                region=regions[n][layers[k]] if regions[n] else None,
                home=homes[i],
                layer=layers[k],
                same_layer=tuple(j for j in range(k) if layers[j] == layers[k]) if regions[n] else None,
            )
    return plan
