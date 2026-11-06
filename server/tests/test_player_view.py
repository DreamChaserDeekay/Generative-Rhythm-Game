"""The 6K ELITE player-view rules (docs/PATTERN_DESIGN.md 87, generator 0.9.49): long notes end
where their sound is struck again and never sit on a drum stem, the hit downbeats play first,
every unit keeps to one instrument voice, and a hand whose ring finger holds does not tap."""

from __future__ import annotations

import numpy as np

from rhythm_server.analysis.stems import STEM_NAMES
from rhythm_server.config import difficulty_config, load_config
from rhythm_server.generator.candidates import Candidate, _end_at_retrigger
from rhythm_server.generator.lanes import _valid_combos, lane_infos, note_sources
from rhythm_server.generator.linter import lint
from rhythm_server.generator.params import resolve_params
from rhythm_server.generator.sections import Unit, _anchor_keys, _companion, _mark_voices, _voice_bound, make_units
from rhythm_server.generator.select import holdable, max_hold_beats
from rhythm_server.generator.tempo import TempoMap

DRUMS, BASS, VOCALS, OTHER = (STEM_NAMES.index(n) for n in ("drums", "bass", "vocals", "other"))
TIMING = {"offsetMs": 0.0, "tempoMap": [{"beat": 0, "bpm": 120.0}]}


def _cand(beat: float, sources: list[float], *, sustain: float = 2.0, attack: float = 0.9, pitch: float | None = 60.0,
          strength: float = 0.8, melody: float | None = None, downbeat: bool = False, sound_group: int | None = None,
          quiet: bool = False, subdivision: int = 1, harmonic: float = 0.8) -> Candidate:
    return Candidate(beat=beat, t=beat * 500.0, subdivision=subdivision, strength=strength, bands=np.ones(3), pitch=pitch,
                     harmonic=harmonic, sustain_beats=sustain, intensity=0.5, downbeat=downbeat, sources=np.array(sources, dtype=float),
                     attack=attack, melody=melody, sound_group=sound_group, quiet=quiet, score=strength)


def test_a_sound_ends_where_its_stem_is_struck_again() -> None:
    rule = difficulty_config()["holds"]["retrigger"]
    synth = [0.1, 0.1, 0.1, 0.7]
    # a synth note held 4 beats, the synth struck again (another pitch, another sound group) after 1.5 beats
    cands = [_cand(0.0, synth, sustain=4.0, pitch=60.0, sound_group=1), _cand(1.5, synth, sustain=1.0, pitch=67.0, sound_group=2)]
    _end_at_retrigger(cands, rule)
    assert cands[0].sustain_beats == 1.5
    # a swell (attack under the rule's) or a hit that is mostly another stem does not end it
    cands = [_cand(0.0, synth, sustain=4.0), _cand(1.5, synth, sustain=1.0, attack=0.2), _cand(2.0, [0.7, 0.1, 0.1, 0.1], sustain=0.5)]
    _end_at_retrigger(cands, rule)
    assert cands[0].sustain_beats == 4.0
    # a drum hit is never a sound that sounds on, so it is not ended and does not end others
    cands = [_cand(0.0, [0.8, 0.1, 0.05, 0.05], sustain=4.0, sound_group=3), _cand(1.0, [0.8, 0.1, 0.05, 0.05], sustain=4.0, sound_group=3)]
    _end_at_retrigger(cands, rule)
    assert cands[0].sustain_beats == 4.0


def test_long_notes_keep_off_drum_stems_swells_and_quiet_tails_but_a_sung_note_under_a_kick_holds() -> None:
    tempo = TempoMap(TIMING)
    note = float(load_config("instruments")["rhythmSource"]["melody"]["note"])
    assert not holdable(_cand(0.0, [0.6, 0.1, 0.1, 0.2], sustain=2.0), tempo)  # a kick over a pad
    assert holdable(_cand(0.0, [0.5, 0.1, 0.3, 0.1], sustain=2.0, melody=note), tempo)  # a sung note under the kick
    assert holdable(_cand(0.0, [0.1, 0.1, 0.1, 0.7], sustain=2.0, melody=note), tempo)
    assert not holdable(_cand(0.0, [0.1, 0.1, 0.1, 0.7], sustain=2.0, melody=note, attack=0.3, harmonic=0.3), tempo)  # a swell (a pad may: holds.pad)
    assert not holdable(_cand(0.0, [0.1, 0.7, 0.1, 0.1], sustain=2.0, pitch=None), tempo)  # a bass thump without a pitch
    # a hold's length is capped by the tier (holds.maxBeats): 4 beats at ELITE, 8 at MASTER
    assert max_hold_beats(resolve_params("6K", "ELITE").skill) == 4.0
    assert max_hold_beats(resolve_params("6K", "MASTER").skill) == 8.0


def test_a_chord_in_a_voice_unit_keeps_to_the_voice_stems() -> None:
    lanes = lane_infos("6K")
    hit = np.array([0.45, 0.3, 0.05, 0.2])  # drums, bass, vocals, other
    assert note_sources(hit, (0, 2, 5), (), lanes, True, 0.2) == {0: BASS, 2: DRUMS, 5: OTHER}
    # a drums voice: every note of the chord is the drums; a tune voice: the sounding tune stem
    assert note_sources(hit, (0, 2, 5), (), lanes, True, 0.2, (DRUMS,)) == {0: DRUMS, 2: DRUMS, 5: DRUMS}
    assert note_sources(hit, (0, 2), (), lanes, True, 0.2, (VOCALS, OTHER)) == {0: OTHER, 2: OTHER}
    # a voice that does not sound at the hit leaves the chord to the instruments that do
    assert note_sources(hit, (0, 2), (), lanes, True, 0.2, (VOCALS,)) == {0: BASS, 2: DRUMS}


def _sections(*rows: tuple[str, str, int, list[float]]) -> list[dict]:
    out = []
    for k, (group, label, bars, stems) in enumerate(rows):
        start = sum(r[2] for r in rows[:k]) * 4
        out.append({"group": group, "label": label, "startBeat": float(start), "endBeat": float(start + bars * 4),
                    "t": start * 500.0, "endT": (start + bars * 4) * 500.0, "energy": 0.6, "loopBars": 4, "stems": stems})
    return out


def test_every_unit_follows_one_voice_and_repeats_alternate() -> None:
    params = resolve_params("6K", "ELITE")
    tune = (VOCALS, OTHER)
    drums_and_tune = [0.45, 0.1, 0.1, 0.35]
    sections = _sections(("A", "verse", 8, drums_and_tune), ("B", "chorus", 8, drums_and_tune), ("A", "verse", 8, drums_and_tune),
                         ("B", "chorus", 8, drums_and_tune), ("C", "bridge", 4, [0.05, 0.1, 0.1, 0.75]), ("D", "outro", 4, [0.1, 0.7, 0.1, 0.1]))
    units = make_units(sections, 0.0, 40 * 4 - 1.0, 4)
    assert _mark_voices(units, sections, params)
    by_section = {}
    for u in units:
        by_section.setdefault(u.section, set()).add(u.voice)
    assert all(len(v) == 1 for v in by_section.values())  # one voice through a section
    voices = [next(iter(by_section[s])) for s in range(6)]
    assert voices[0] == (DRUMS,) and voices[2] == tune  # the verse: drums first, the tune the second time
    assert voices[1] == (DRUMS,) and voices[3] == tune
    assert voices[4] == tune  # a bridge with hardly any drums
    assert voices[5] == (BASS,)  # led by the bass with little else
    # a guitar-led section (6-stem analysis) is the tune, whatever the mix says
    lead = _sections(("A", "verse", 8, [0.6, 0.1, 0.1, 0.2]))
    lead[0].update({"lead": "guitar", "leadShares": {"guitar": 0.6, "piano": 0.1, "vocals": 0.1, "other": 0.2}})
    units = make_units(lead, 0.0, 31.0, 4)
    _mark_voices(units, lead, params)
    assert all(u.voice == tune for u in units)
    # under the rule's skill, on a key mode it leaves out, or with a rhythm source picked, no voices
    units = make_units(sections, 0.0, 159.0, 4)
    assert not _mark_voices(units, sections, resolve_params("6K", "NORMAL"))
    assert all(u.voice is None for u in units)
    assert not _mark_voices(units, sections, resolve_params("6K", "ELITE", None, {"rhythmSource": "drum"}))


def test_the_companion_kick_keeps_the_time_under_a_tune_voice() -> None:
    u = Unit(index=0, section=0, group="A", label="verse", occurrence=0, pos=0, start=8.0, length=16.0, energy=0.5)
    u.voice = (VOCALS, OTHER)
    kick = [0.8, 0.1, 0.05, 0.05]
    assert _companion(_cand(10.0, kick), u, 4, 0.35, 0.5)  # the third beat
    assert _companion(_cand(9.0, kick, strength=0.9), u, 4, 0.35, 0.5)  # a strong hit on another beat
    assert not _companion(_cand(9.0, kick, strength=0.3), u, 4, 0.35, 0.5)  # a soft hat on the second beat
    assert not _companion(_cand(10.5, kick, subdivision=2), u, 4, 0.35, 0.5)  # off the beat
    u.voice = (DRUMS,)
    assert not _companion(_cand(10.0, kick), u, 4, 0.35, 0.5)


def test_hit_downbeats_are_anchors_and_a_voice_change_frees_the_hands() -> None:
    cfg = load_config("patterns")["sectioned"]["anchors"]
    bar = 48 * 4
    cands = [_cand(0.0, [0.7, 0.1, 0.1, 0.1], downbeat=True), _cand(2.0, [0.6, 0.1, 0.1, 0.2]), _cand(2.5, [0.2, 0.1, 0.1, 0.6], strength=0.9),
             _cand(4.0, [0.1, 0.1, 0.1, 0.7], strength=0.2, downbeat=True), _cand(8.0, [0.1, 0.1, 0.1, 0.7], attack=0.3, downbeat=True)]
    per_unit = [{int(round(c.beat * 48)): i for i, c in enumerate(cands)}]
    consensus = {k: cands[i].strength for k, i in per_unit[0].items()}
    order = sorted(consensus, key=lambda k: -consensus[k])
    median = 0.8
    # ELITE reads the third beat too (the drums hit there); the faint downbeat and the swell are not anchors
    assert _anchor_keys(order, [0], per_unit, cands, consensus, 4, 0.9, cfg, median) == [0, 2 * 48]
    assert _anchor_keys(order, [0], per_unit, cands, consensus, 4, 0.6, cfg, median) == [0]
    # a long note lets go where the next unit follows another voice
    units = make_units(_sections(("A", "verse", 4, [0.5, 0.1, 0.1, 0.3]), ("B", "chorus", 4, [0.5, 0.1, 0.1, 0.3])), 0.0, 31.0, 4)
    units[0].voice, units[1].voice = (DRUMS,), (VOCALS, OTHER)
    assert _voice_bound(units, 0) == 16.0 and _voice_bound(units, 1) is None
    units[1].voice = (DRUMS,)
    assert _voice_bound(units, 0) is None


def test_a_hand_whose_ring_finger_holds_does_not_tap_and_the_closing_chord_may_hold_more() -> None:
    lanes = lane_infos("6K")
    params = resolve_params("6K", "ELITE")
    free = [1, 2, 3, 4, 5]
    with_block = _valid_combos(free, 1, lanes, params, {"L": 1}, None, {"L"})
    assert with_block and all(lanes[c[0]].hand == "R" for c in with_block)
    without = _valid_combos(free, 1, lanes, params, {"L": 1}, None, set())
    assert any(lanes[c[0]].hand == "L" for c in without)
    # the closing chord holds as many keys as a hand presses; inside the song one per hand at ELITE
    tempo = TempoMap(TIMING)
    closing = [{"beat": 0.0, "t": 0.0, "lane": 2, "type": "tap"}] + [
        {"beat": 8.0, "t": 4000.0, "lane": lane, "type": "hold", "endBeat": 12.0, "endT": 6000.0} for lane in (0, 1, 2, 3, 4)]
    assert not lint(closing, lanes, params, tempo)
    inside = [{"beat": 0.0, "t": 0.0, "lane": lane, "type": "hold", "endBeat": 4.0, "endT": 2000.0} for lane in (0, 1)] + [
        {"beat": 8.0, "t": 4000.0, "lane": 3, "type": "tap"}]
    assert any("long notes held on hand L" in p for p in lint(inside, lanes, params, tempo))
