import { useEffect, useState } from 'react';
import { api, type SectionEdit, type SectionLabel, type SongSections } from '../api/client';
import type { ChartSection } from '../engine/types';
import { SECTION_LABEL_ORDER, groupToken, sectionLabel } from './sections';

const GROUPS = 'ABCDEFGH'.split('');

interface Row {
  /** First bar of the section, counted from 1 at the first downbeat. */
  bar: number;
  label: SectionLabel;
  group: string;
}

function toRows(sections: ChartSection[], bpb: number): Row[] {
  return sections.map((s) => ({
    bar: Math.round(s.startBeat / bpb) + 1,
    label: (SECTION_LABEL_ORDER.includes(s.label as SectionLabel) ? s.label : 'verse') as SectionLabel,
    group: s.group && GROUPS.includes(s.group) ? s.group : 'A',
  }));
}

/** Bars must rise from one section to the next (the first section starts with the song). */
export function sectionRowsValid(rows: { bar: number }[]): boolean {
  return rows.length > 0 && rows.every((r, i) => i === 0 || (Number.isInteger(r.bar) && r.bar >= 2 && r.bar > rows[i - 1].bar));
}

/**
 * The song's sections as a list the user can correct: where each starts, what it is and its
 * repetition group (the same letter = the same music, which gets the same patterns). Charts made
 * after saving use them; "분석값으로" goes back to the analysed sections.
 */
export function SectionEditor({ songId, onSaved, onClose }: { songId: string; onSaved: () => void | Promise<void>; onClose: () => void }) {
  const [data, setData] = useState<SongSections | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    api
      .sections(songId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setRows(toRows(d.sections, d.beatsPerBar));
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [songId]);

  if (!data) return error ? <p className="hint">{error}</p> : null;
  const bpb = data.beatsPerBar;
  const valid = sectionRowsValid(rows);
  const update = (i: number, change: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...change } : r)));

  const save = async (edits: SectionEdit[]) => {
    setSaving(true);
    setError(null);
    try {
      await api.patchSong(songId, { sections: edits });
      const d = await api.sections(songId);
      setData(d);
      setRows(toRows(d.sections, d.beatsPerBar));
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const first = data.sections[0]?.startBeat ?? 0;
  const edits = (): SectionEdit[] =>
    rows.map((r, i) => ({ startBeat: i === 0 ? Math.min(first, 0) : (r.bar - 1) * bpb, label: r.label, group: r.group }));

  return (
    <div className="section-editor" data-testid="section-editor">
      {rows.map((r, i) => (
        <div className="row section-row" key={i} data-testid="section-row">
          <span className="section-swatch" style={{ background: `var(${groupToken(r.group)})` }} />
          {i === 0 ? (
            <span className="value section-start">1마디</span>
          ) : (
            <label className="section-start">
              <input type="number" min={2} value={r.bar} aria-label="시작 마디" onChange={(e) => update(i, { bar: Math.round(Number(e.target.value)) })} />
              마디
            </label>
          )}
          <select value={r.label} aria-label="구간" onChange={(e) => update(i, { label: e.target.value as SectionLabel })}>
            {SECTION_LABEL_ORDER.map((l) => (
              <option key={l} value={l}>
                {sectionLabel(l)}
              </option>
            ))}
          </select>
          <select value={r.group} aria-label="반복 묶음" onChange={(e) => update(i, { group: e.target.value })}>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {i > 0 && (
            <button className="small" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
              빼기
            </button>
          )}
        </div>
      ))}
      <div className="row">
        <button
          className="small"
          onClick={() => {
            const last = rows[rows.length - 1];
            const unused = GROUPS.find((g) => !rows.some((r) => r.group === g)) ?? 'A';
            setRows([...rows, { bar: Math.max(2, (last?.bar ?? 1) + 8), label: 'verse', group: unused }]);
          }}
        >
          구간 추가
        </button>
        <button className="small" data-testid="save-sections" disabled={!valid || saving} onClick={() => void save(edits())}>
          저장
        </button>
        {data.edited && (
          <button className="small" data-testid="reset-sections" disabled={saving} onClick={() => void save([])}>
            분석값으로
          </button>
        )}
        <button className="small" onClick={onClose}>
          닫기
        </button>
      </div>
      <p className="hint">
        같은 글자의 구간은 같은 음악으로 보고 같은 패턴을 씁니다. 마디는 첫 다운비트부터 셉니다. 저장하면 채보를 다시 만듭니다.
        {!valid && ' 시작 마디는 앞 구간보다 뒤여야 합니다.'}
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
