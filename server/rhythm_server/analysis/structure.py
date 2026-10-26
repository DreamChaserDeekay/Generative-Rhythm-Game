"""Song structure on the bar grid (docs/PATTERN_DESIGN.md 13): section boundaries, repetition groups,
labels (intro, verse, pre-chorus, chorus, bridge, outro), loop length and confidence.

Every bar becomes one vector (its beats' timbre, harmony and sub-beat rhythm in order), and the bars'
cosine self-similarity matrix drives everything:

- boundaries: checkerboard novelty, plus the starts and ends of repetition paths (diagonals of
  similar bars: a repeated passage starts and ends at section edges, which finds a chorus that
  follows itself), plus a prior for 4- and 8-bar positions; a dynamic program picks them, sections
  being at least MIN_SECTION_BARS long;
- groups: sections compared bar by bar from their starts;
- labels: rules on position, energy and repetition ("the passage right before every chorus" is the
  pre-chorus);
- loop length: the shortest of 1, 2 or 4 bars after which the section's bars repeat.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

MIN_SECTION_BARS = 4
MAX_SECTION_BARS = 32
NOVELTY_BARS = 4  # half width of the checkerboard kernel
REPEAT_SMOOTH = 2  # bars a repetition path is averaged over
GRID_BONUS = {8: 0.35, 4: 0.2, 2: 0.0}
ODD_BAR_PENALTY = 0.25
BOUNDARY_COST = 0.55
BOUNDARY_EVIDENCE = 0.45  # novelty + path cue a boundary needs; the grid bonus only places it on 4/8-bar lines
PATH_WEIGHT = 0.8
LOOP_CHOICES = (1, 2, 4)
LEAD_IN_MARGIN = 0.08  # a group that leads into another is the chorus only when louder than the others by this (0..1)
HIGHLIGHT_MARGIN = 0.1  # the chorus is this near the most intense section, else the most intense sections are (0..1)
HIGHLIGHT_MATE_MARGIN = 0.25  # ... with their group's other occurrences this near the most intense one (0..1)
HIGHLIGHT_MIN_BARS = 8  # a one-off passage shorter than this is no highlight
GROUP_SHIFT_BARS = 1  # two sections are compared from their starts and this many bars off
INTENSITY_TIE_BREAK = 1e-3  # the share of loudness that decides between equally intense sections
HIT_CAP_PERCENTILE = 75  # a beat's onset strength counts up to this percentile of the song's beats (a roll is no louder)


@dataclass
class Section:
    start_beat: int  # index into beats
    end_beat: int  # exclusive
    energy: float  # 0..1
    group: str
    label: str
    loop_bars: int = 0  # the section's bars repeat after this many (0 = unknown)
    confidence: float = 0.0  # 0..1: how clear its boundary and its group are


def beat_sync(features: np.ndarray, frame_rate: float, beats: np.ndarray) -> np.ndarray:
    """Average frame features between consecutive beats -> (n_beats, d)."""
    n = len(beats)
    out = np.zeros((n, features.shape[1]), dtype=np.float64)
    frames = np.clip(np.round(beats * frame_rate).astype(int), 0, len(features) - 1)
    for i in range(n):
        a = frames[i]
        b = frames[i + 1] if i + 1 < n else min(len(features), a + max(1, int(np.median(np.diff(frames))) if n > 1 else 1))
        out[i] = features[a:max(b, a + 1)].mean(axis=0)
    return out


def rhythm_grid(beats: np.ndarray, times: np.ndarray, strength: np.ndarray, bands: np.ndarray, sub: int = 4) -> np.ndarray:
    """Onset strength per band in `sub` slices of every beat -> (n_beats, 3 * sub): where in the beat
    the kick, snare and hats play, which tells two drum loops apart."""
    n = len(beats)
    out = np.zeros((n, sub, bands.shape[1] if bands.ndim == 2 else 1))
    if n < 2 or len(times) == 0:
        return out.reshape(n, -1)
    ibi = np.diff(beats, append=beats[-1] + (beats[-1] - beats[-2]))
    idx = np.searchsorted(beats, times, side="right") - 1
    ok = (idx >= 0) & (idx < n)
    frac = (times[ok] - beats[idx[ok]]) / ibi[idx[ok]]
    slot = np.clip(np.round(frac * sub).astype(int), 0, sub)
    beat_idx = idx[ok] + (slot == sub)
    slot[slot == sub] = 0
    keep = beat_idx < n
    np.add.at(out, (beat_idx[keep], slot[keep]), (strength[ok][keep, None] * bands[ok][keep]))
    return out.reshape(n, -1)


def _standardize(x: np.ndarray) -> np.ndarray:
    sd = x.std(axis=0)
    return (x - x.mean(axis=0)) / np.where(sd > 1e-9, sd, 1.0)


def structure_features(blocks: list[tuple[np.ndarray, float]]) -> np.ndarray:
    """Per-beat feature blocks (timbre, harmony, rhythm …), each standardized and weighted so that a
    block's share of the bar similarity follows its weight, not its number of dimensions."""
    out = []
    for block, weight in blocks:
        if block.size == 0:
            continue
        out.append(_standardize(block) * weight / np.sqrt(block.shape[1]))
    return np.concatenate(out, axis=1) if out else np.zeros((0, 0))


def bar_vectors(feat: np.ndarray, first_downbeat: int, beats_per_bar: int) -> tuple[list[int], np.ndarray]:
    """Bar start beat indices and one unit vector per bar (its beats' features in order). Beats
    before the first downbeat belong to the first bar."""
    n = len(feat)
    bpb = beats_per_bar
    starts = list(range(first_downbeat % bpb, n - bpb + 1, bpb)) if n >= bpb else []
    if not starts:
        return [], np.zeros((0, feat.shape[1] * bpb))
    z = feat - feat.mean(axis=0)
    vecs = np.stack([z[s : s + bpb].reshape(-1) for s in starts])
    vecs /= np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-9
    return starts, vecs


def novelty_curve(ssm: np.ndarray, half: int = NOVELTY_BARS) -> np.ndarray:
    """Foote checkerboard novelty along the diagonal; value k = change between bar k-1 and bar k."""
    n = len(ssm)
    out = np.zeros(n)
    if n < 4:
        return out
    for k in range(1, n):
        w = min(half, k, n - k)
        past = ssm[k - w : k, k - w : k]
        future = ssm[k : k + w, k : k + w]
        cross = ssm[k - w : k, k : k + w]
        out[k] = (past.mean() + future.mean()) / 2 - cross.mean()
    return np.maximum(out, 0.0)


def repeat_threshold(ssm: np.ndarray) -> float:
    """Similarity from which two bars count as the same music in this song."""
    n = len(ssm)
    off = ssm[np.triu_indices(n, 1)] if n > 1 else np.array([0.0])
    return float(np.clip(np.mean(off) + 1.0 * np.std(off), 0.45, 0.92))


def path_cues(ssm: np.ndarray, threshold: float) -> np.ndarray:
    """Per bar k, how many repetition paths start or end at k (both ends of each pair)."""
    n = len(ssm)
    out = np.zeros(n + 1)
    for lag in range(1, n):
        raw = np.array([ssm[k, k + lag] for k in range(n - lag)])
        d = raw
        if len(raw) >= REPEAT_SMOOTH:
            kernel = np.ones(REPEAT_SMOOTH) / REPEAT_SMOOTH
            d = np.convolve(raw, kernel, mode="full")[: len(raw)]  # bar k and the bars before it
        on = d >= threshold
        prev = False
        run_start = 0
        for k in range(len(on) + 1):
            cur = bool(on[k]) if k < len(on) else False
            if cur and not prev:
                run_start = k
            if prev and not cur:
                # The smoothing blurs both ends by a bar: the path runs over the bars that repeat
                # themselves (a verse ending on a fill into the chorus would otherwise end a bar
                # early and pull the chorus start onto the fill).
                above = [b for b in range(max(run_start - REPEAT_SMOOTH + 1, 0), min(k + 1, len(raw))) if raw[b] >= threshold]
                if above and above[-1] + 1 - above[0] >= 2:
                    for b in (above[0], above[-1] + 1):
                        out[b] += 1
                        if b + lag <= n:
                            out[b + lag] += 1
            prev = cur
    return out[:n]


def _grid(k: int) -> float:
    if k % 8 == 0:
        return GRID_BONUS[8]
    if k % 4 == 0:
        return GRID_BONUS[4]
    if k % 2 == 0:
        return GRID_BONUS[2]
    return -ODD_BAR_PENALTY


def boundary_scores(ssm: np.ndarray, threshold: float) -> np.ndarray:
    nov = novelty_curve(ssm)
    cues = path_cues(ssm, threshold)
    nov_n = nov / max(float(np.max(nov)), 1e-9)
    cue_n = cues / max(float(np.max(cues)), 1e-9)
    evidence = nov_n + PATH_WEIGHT * cue_n
    # an 8-bar line with next to no change cleared the cost on its grid bonus alone: a dense,
    # loud song (USAO - RUNAWAY) came out in 30 sections, most of them 4 bars and none repeated.
    # Its lines without a change had evidence 0.41 at most; the synthetic songs' pre-choruses 0.46 and up
    return np.array([evidence[k] + _grid(k) if evidence[k] >= BOUNDARY_EVIDENCE else -1.0 for k in range(len(ssm))])


def segment_bars(scores: np.ndarray, n: int, min_len: int = MIN_SECTION_BARS, max_len: int = MAX_SECTION_BARS) -> list[int]:
    """Section start bars (0 first) maximising the summed boundary scores minus a cost per section."""
    if n < 2 * min_len:
        return [0]
    best = np.full(n + 1, -np.inf)
    back = np.zeros(n + 1, dtype=int)
    best[0] = 0.0
    for end in range(min_len, n + 1):
        for start in range(max(0, end - max_len), end - min_len + 1):
            if best[start] == -np.inf:
                continue
            gain = (scores[start] if start > 0 else 0.0) - BOUNDARY_COST
            v = best[start] + gain
            if v > best[end]:
                best[end], back[end] = v, start
    if best[n] == -np.inf:  # a tail shorter than min_len: let the last section be short
        return [0]
    out = []
    k = n
    while k > 0:
        k = int(back[k])
        out.append(k)
    return sorted(out)


def _aligned_similarity(ssm: np.ndarray, a: tuple[int, int], b: tuple[int, int]) -> float:
    """Mean similarity of the two sections' bars aligned from their starts (shorter length)."""
    m = min(a[1] - a[0], b[1] - b[0])
    if m <= 0:
        return 0.0
    sims = [ssm[a[0] + t, b[0] + t] for t in range(m)]
    short, long_ = sorted((a[1] - a[0], b[1] - b[0]))
    return float(np.mean(sims)) * (short / long_) ** 0.25


def _segment_similarity(ssm: np.ndarray, a: tuple[int, int], b: tuple[int, int]) -> float:
    """The two sections aligned from their starts, or with one of them starting up to
    GROUP_SHIFT_BARS later: a boundary a bar off (a fill, a pickup bar) no longer splits a repeated
    section from its repeat (on 2,200 BMS songs a third had no repeated section at all)."""
    best = _aligned_similarity(ssm, a, b)
    for d in range(1, GROUP_SHIFT_BARS + 1):
        for a2, b2 in (((a[0] + d, a[1]), b), (a, (b[0] + d, b[1]))):
            if a2[1] - a2[0] >= 2 and b2[1] - b2[0] >= 2:
                best = max(best, _aligned_similarity(ssm, a2, b2))
    return best


def group_segments(ssm: np.ndarray, spans: list[tuple[int, int]], threshold: float) -> tuple[list[int], list[float]]:
    """Group number per section (average linkage) and how firmly it sits in its group."""
    k = len(spans)
    sim = np.eye(k)
    for i in range(k):
        for j in range(i + 1, k):
            sim[i, j] = sim[j, i] = _segment_similarity(ssm, spans[i], spans[j])
    clusters = [[i] for i in range(k)]
    while len(clusters) > 1:
        best, pair = -1.0, None
        for x in range(len(clusters)):
            for y in range(x + 1, len(clusters)):
                v = float(np.mean([sim[i, j] for i in clusters[x] for j in clusters[y]]))
                if v > best:
                    best, pair = v, (x, y)
        if pair is None or best < threshold:
            break
        x, y = pair
        clusters[x] = sorted(clusters[x] + clusters[y])
        del clusters[y]
    clusters.sort(key=lambda c: c[0])
    group = [0] * k
    for g, members in enumerate(clusters):
        for i in members:
            group[i] = g
    firm = []
    for i in range(k):
        mates = [sim[i, j] for j in range(k) if j != i and group[j] == group[i]]
        others = [sim[i, j] for j in range(k) if group[j] != group[i]]
        inside = float(np.mean(mates)) if mates else 1.0
        outside = max(others) if others else 0.0
        firm.append(float(np.clip(0.5 + (inside - outside) / max(2 * (1 - threshold), 1e-9) * 0.5, 0.0, 1.0)))
    return group, firm


def merge_and_split(spans: list[tuple[int, int]], groups: list[int]) -> list[tuple[int, int]]:
    """Neighbouring sections of one group become one, then a section that is several times its
    group's usual length (the most common length of its occurrences) is cut into that length: a
    chorus played twice in a row is two choruses, a verse cut in half is one verse."""
    merged: list[tuple[int, int]] = []
    merged_groups: list[int] = []
    for span, g in zip(spans, groups):
        if merged and merged_groups[-1] == g:
            merged[-1] = (merged[-1][0], span[1])
        else:
            merged.append(span)
            merged_groups.append(g)
    lengths: dict[int, list[int]] = {}
    for (a, b), g in zip(merged, merged_groups):
        lengths.setdefault(g, []).append(b - a)
    out: list[tuple[int, int]] = []
    for (a, b), g in zip(merged, merged_groups):
        ls = lengths[g]
        unit = min(set(ls), key=lambda x: (-ls.count(x), x))
        if unit >= MIN_SECTION_BARS and b - a > unit and (b - a) % unit == 0:
            out.extend((x, x + unit) for x in range(a, b, unit))
        else:
            out.append((a, b))
    return out


def loop_length(ssm: np.ndarray, start: int, end: int, threshold: float) -> int:
    """Shortest loop (1, 2 or 4 bars) the section's bars repeat after, one odd bar pair (a fill)
    allowed; the section length when none fits."""
    length = end - start
    for p in LOOP_CHOICES:
        if 2 * p > length:
            break
        sims = sorted(ssm[k, k + p] for k in range(start, end - p))
        if len(sims) >= 3:
            sims = sims[1:]  # a fill may break one pair
        if float(np.mean(sims)) >= threshold:
            return p
    return length


def _scale(x: np.ndarray) -> np.ndarray:
    """0..1 over the values (all 0.5 when they are equal)."""
    lo, hi = float(np.min(x)), float(np.max(x))
    return (x - lo) / (hi - lo) if hi - lo > 1e-9 else np.full(len(x), 0.5)


def section_intensity(beat_energy: np.ndarray, beat_strength: np.ndarray | None, ranges: list[tuple[int, int]]) -> np.ndarray:
    """Per beat range (start, end): its loudness (median beat energy) and, with `beat_strength`
    (onset strength per beat), how hard its onsets hit, each scaled 0..1 over the ranges and
    averaged. A beat counts up to HIT_CAP_PERCENTILE of the song's beats, so a build-up's rolls do
    not make it the loudest part. On 2,200 BMS songs this follows the human charts' density over
    the sections better than loudness alone (a mastered song is about as loud everywhere)."""
    loud = _scale(np.array([float(np.median(beat_energy[a : max(b, a + 1)])) for a, b in ranges]))
    if beat_strength is None or len(beat_strength) != len(beat_energy) or not np.any(beat_strength > 0):
        return loud
    capped = np.minimum(beat_strength, float(np.percentile(beat_strength[beat_strength > 0], HIT_CAP_PERCENTILE)))
    hits = np.array([float(np.mean(capped[a : max(b, a + 1)])) for a, b in ranges])
    # loudness breaks a tie: two sections, one louder and one hitting harder, would both be 0.5
    # (a short song got no intense section and so no camera cue at all)
    return _scale((loud + _scale(hits)) / 2 + INTENSITY_TIE_BREAK * loud)


def label_sections(spans: list[tuple[int, int]], groups: list[int], energy: np.ndarray) -> list[str]:
    """intro / verse / pre-chorus / chorus / bridge / outro from position, intensity and repetition.

    The chorus is the highlight: the loudest repeated group when it is near the most intense
    section, else the most intense sections whatever repeats (with their group's other occurrences
    near them). On 2,200 BMS songs the repeated group alone put the chorus in the human charts'
    densest third of the song in about half of the songs (docs/PATTERN_DESIGN.md 62)."""
    k = len(spans)
    count = {g: groups.count(g) for g in set(groups)}
    repeated = [g for g in count if count[g] >= 2]
    group_energy = {g: float(np.mean([energy[i] for i in range(k) if groups[i] == g])) for g in count}
    labels = [""] * k

    # A group every occurrence of which leads straight into one same other group (a verse into its
    # pre-chorus, a build-up into its drop) leads in: it is the chorus only if clearly the loudest.
    # A long crescendo build-up is often as loud as the chorus it opens, and its rolls hit hard.
    def leads_in(g: int) -> bool:
        idx = [i for i in range(k) if groups[i] == g]
        nxt = {groups[i + 1] if i + 1 < k else None for i in idx}
        return len(nxt) == 1 and None not in nxt and next(iter(nxt)) in repeated and next(iter(nxt)) != g

    hot: set[int] = set()
    if repeated:
        top = max(group_energy[g] for g in repeated)
        # a group that does not lead in and is near the top beats one that does (HIGHLIGHT_MATE_MARGIN)
        landing = [g for g in repeated if not leads_in(g) and group_energy[g] >= top - HIGHLIGHT_MATE_MARGIN]
        near = landing or [g for g in repeated if group_energy[g] >= top - LEAD_IN_MARGIN]
        chorus = max(near, key=lambda g: (not leads_in(g), round(group_energy[g], 2), count[g], -groups.index(g)))
        hot = {i for i in range(k) if groups[i] == chorus}
    if k > 2:
        lead = {i for i in range(k) if groups[i] in repeated and leads_in(groups[i]) and i not in hot}
        # a passage heard once and shorter than HIGHLIGHT_MIN_BARS (a build-up's last bars, a fill)
        # is no highlight however hard it hits
        brief = {i for i in range(k) if count[groups[i]] < 2 and spans[i][1] - spans[i][0] < HIGHLIGHT_MIN_BARS}
        free = [i for i in range(k) if i not in lead and i not in brief] or [i for i in range(k) if i not in lead] or list(range(k))
        peak = max(float(energy[i]) for i in free)
        if not hot or float(np.mean([energy[i] for i in hot])) < peak - HIGHLIGHT_MARGIN:
            hot = {i for i in free if energy[i] >= peak - HIGHLIGHT_MARGIN}
            hot_groups = {groups[i] for i in hot}
            hot |= {i for i in free if groups[i] in hot_groups and energy[i] >= peak - HIGHLIGHT_MATE_MARGIN}
    hot_groups = {groups[i] for i in hot}
    pre = set()
    for g in repeated:
        if g in hot_groups:
            continue
        idx = [i for i in range(k) if groups[i] == g]
        if all(i + 1 in hot for i in idx) and all(spans[i][1] - spans[i][0] <= 8 for i in idx):
            pre.add(g)
    for i in range(k):
        g = groups[i]
        if i in hot:
            labels[i] = "chorus"
        elif g in pre:
            labels[i] = "pre-chorus"
        elif count[g] >= 2:
            labels[i] = "verse"
        elif i == 0:
            labels[i] = "intro"
        elif i == k - 1:
            labels[i] = "outro"
        else:
            labels[i] = "bridge"
    # a group that only opens and closes the song (an intro that comes back as the outro)
    if k > 2:
        for g in set(groups):
            idx = [i for i in range(k) if groups[i] == g]
            if set(idx) <= {0, k - 1} and not hot & set(idx):
                for i in idx:
                    labels[i] = "intro" if i == 0 else "outro"
    return labels


def find_sections(
    feat: np.ndarray,
    beat_energy: np.ndarray,
    first_downbeat: int,
    beats_per_bar: int,
    beat_strength: np.ndarray | None = None,
) -> list[Section]:
    """Sections of the song; a section's energy is its intensity (section_intensity, with the
    onset strength per beat when given)."""
    n_beats = len(feat)
    if n_beats == 0:
        return []
    bpb = beats_per_bar
    starts, vecs = bar_vectors(feat, first_downbeat, bpb)
    if len(starts) < 2:
        return [Section(0, n_beats, 0.5, "A", "verse", len(starts) or 1, 0.0)]
    ssm = vecs @ vecs.T
    threshold = repeat_threshold(ssm)
    scores = boundary_scores(ssm, threshold)
    n_bars = len(starts)
    bounds = segment_bars(scores, n_bars)
    spans = [(b, bounds[i + 1] if i + 1 < len(bounds) else n_bars) for i, b in enumerate(bounds)]
    groups, firm = group_segments(ssm, spans, threshold)
    for _ in range(2):
        regrouped = merge_and_split(spans, groups)
        if regrouped == spans:
            break
        spans = regrouped
        groups, firm = group_segments(ssm, spans, threshold)
    beat_of = lambda bar: starts[bar] if bar < n_bars else n_beats  # noqa: E731
    energy = section_intensity(beat_energy, beat_strength, [(beat_of(a), beat_of(b)) for a, b in spans])
    labels = label_sections(spans, groups, energy)
    top = max(float(np.max(scores)), 1e-9)
    out = []
    for i, (a, b) in enumerate(spans):
        edge = 1.0 if a == 0 else float(np.clip(scores[a] / top, 0.0, 1.0))
        out.append(
            Section(
                start_beat=0 if i == 0 else starts[a],
                end_beat=beat_of(b) if i + 1 < len(spans) else n_beats,
                energy=float(energy[i]),
                group=chr(ord("A") + groups[i] % 26),
                label=labels[i],
                loop_bars=loop_length(ssm, a, b, threshold),
                confidence=round(0.5 * edge + 0.5 * firm[i], 2),
            )
        )
    return out


def add_loops(sections: list[Section], feat: np.ndarray, first_downbeat: int, beats_per_bar: int) -> None:
    """Loop length of sections found another way (an ML backend), in place."""
    starts, vecs = bar_vectors(feat, first_downbeat, beats_per_bar)
    if len(starts) < 2:
        return
    ssm = vecs @ vecs.T
    threshold = repeat_threshold(ssm)
    for s in sections:
        a = int(np.searchsorted(starts, s.start_beat))
        b = int(np.searchsorted(starts, s.end_beat))
        if b > a:
            s.loop_bars = loop_length(ssm, a, b, threshold)
