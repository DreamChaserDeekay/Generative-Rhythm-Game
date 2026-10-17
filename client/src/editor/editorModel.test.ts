import { describe, expect, it } from 'vitest';
import type { Chart } from '../engine/types';
import { EditorDoc } from './editorModel';

// 120 BPM from 1000ms: one beat = 500ms
const timing: Chart['timing'] = { offsetMs: 1000, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };

function doc(notes: Chart['notes'] = []) {
  return new EditorDoc({ timing, notes }, 4);
}

describe('EditorDoc', () => {
  it('snaps to the beat grid and steps along it', () => {
    const d = doc();
    expect(d.snap(1130, 4)).toBe(1125); // nearest sixteenth
    expect(d.snap(1130, 1)).toBe(1000);
    expect(d.step(1130, 2, 4)).toBe(1375);
    expect(d.step(1000, -1, 2)).toBe(750);
  });

  it('adds taps and holds but refuses notes that touch another on the lane', () => {
    const d = doc();
    expect(d.add(0, 1000).ok).toBe(true);
    expect(d.add(1, 1000, 2000).ok).toBe(true);
    expect(d.add(0, 1000)).toEqual({ ok: false, reason: '그 자리에 이미 노트가 있습니다' });
    expect(d.add(1, 1500).ok).toBe(false); // inside the hold
    expect(d.add(1, 2500).ok).toBe(true);
    expect(d.add(4, 3000).ok).toBe(false);
    expect(d.notes.map((n) => [n.lane, n.t, n.type])).toEqual([
      [0, 1000, 'tap'],
      [1, 1000, 'hold'],
      [1, 2500, 'tap'],
    ]);
  });

  it('moves selections by lanes and grid steps, atomically', () => {
    const d = doc([
      { beat: 0, t: 1000, lane: 0, type: 'tap' },
      { beat: 1, t: 1500, lane: 1, type: 'hold', endBeat: 2, endT: 2000 },
      { beat: 4, t: 3000, lane: 3, type: 'tap' },
    ]);
    const [a, b, c] = d.notes;
    expect(d.move([a.id, b.id], 1, 1, 2).ok).toBe(true);
    expect(d.notes.find((n) => n.id === b.id)).toMatchObject({ lane: 2, t: 1750, endT: 2250 });
    expect(d.notes.find((n) => n.id === a.id)).toMatchObject({ lane: 1, t: 1250 });
    // the third note would leave the track: nothing moves
    expect(d.move([a.id, c.id], 1, 0, 4).ok).toBe(false);
    expect(d.notes.find((n) => n.id === a.id)?.lane).toBe(1);
  });

  it('undoes and redoes every edit', () => {
    const d = doc();
    d.add(0, 1000);
    d.add(2, 1500);
    const ids = d.notes.map((n) => n.id);
    d.remove([ids[0]]);
    expect(d.notes).toHaveLength(1);
    expect(d.undo()).toBe(true);
    expect(d.notes).toHaveLength(2);
    expect(d.undo()).toBe(true);
    expect(d.notes).toHaveLength(1);
    expect(d.redo()).toBe(true);
    expect(d.redo()).toBe(true);
    expect(d.notes).toHaveLength(1);
    expect(d.redo()).toBe(false);
    d.undo();
    d.add(3, 4000); // a new edit drops the redo history
    expect(d.canRedo).toBe(false);
  });

  it('copies in beats and pastes at another position, mirrors key lanes', () => {
    const d = doc([
      { beat: 0, t: 1000, lane: 0, type: 'tap' },
      { beat: 0.5, t: 1250, lane: 1, type: 'hold', endBeat: 1, endT: 1500 },
    ]);
    const clip = d.copy(d.notes.map((n) => n.id));
    const pasted = d.paste(clip, 3000);
    expect(pasted.ok).toBe(true);
    expect(d.notes.filter((n) => pasted.ids?.includes(n.id)).map((n) => [n.lane, n.t, n.endT])).toEqual([
      [0, 3000, undefined],
      [1, 3250, 3500],
    ]);
    expect(d.paste(clip, 3000).ok).toBe(false); // occupied
    expect(d.mirror(pasted.ids ?? [], [0, 1, 2, 3]).ok).toBe(true);
    expect(d.notes.filter((n) => pasted.ids?.includes(n.id)).map((n) => n.lane).sort()).toEqual([2, 3]);
  });

  it('turns taps into holds and back, and exports chart notes with beats', () => {
    const d = doc([{ beat: 0, t: 1000, lane: 0, type: 'tap', snd: 3 }]);
    const id = d.notes[0].id;
    expect(d.setEnd(id, 2000).ok).toBe(true);
    expect(d.toChartNotes()).toEqual([{ beat: 0, t: 1000, lane: 0, type: 'hold', endBeat: 2, endT: 2000, snd: 3 }]);
    expect(d.setEnd(id, undefined).ok).toBe(true);
    expect(d.toChartNotes()[0]).toEqual({ beat: 0, t: 1000, lane: 0, type: 'tap', snd: 3 });
    expect(d.dirty).toBe(true);
  });
});
