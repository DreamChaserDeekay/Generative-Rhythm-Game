import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { difficultyTiers } from '../engine/config';
import type { Chart, StemName } from '../engine/types';
import { STEM_NAMES } from '../engine/types';
import { bindingsFor, keyLabel, secondBindingsFor, songOffsetOf, type Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { speedText } from './format';
import { flyJacket, takeJacketOrigin } from './jacketFlight';
import { playedSettings, playModeLabel, ruleChips } from './playRules';
import { Backdrop, Disc, SongArt, stemToken } from './songArt';
import { uiScale } from './uiScale';

const STEM_LABELS: Record<StemName, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디' };
/** The jacket's side on a 1280 × 720 window (px; .loading-jacket sizes it in rem): what a disc is drawn for. */
const JACKET_PX = 304;

function formatTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "152", or "120–180" for a chart that changes tempo. */
function bpmOf(chart: Chart): string {
  const bpms = chart.timing.tempoMap.map((p) => p.bpm);
  if (bpms.length === 0) return '-';
  const [lo, hi] = [Math.min(...bpms), Math.max(...bpms)];
  return hi - lo > 0.5 ? `${Math.round(lo)}–${Math.round(hi)}` : String(Math.round(lo));
}

/** The stem each lane's notes follow most (none when the chart was not made from stems). */
function laneStems(chart: Chart): (StemName | null)[] {
  const counts = chart.meta.lanes.map(() => new Map<StemName, number>());
  for (const n of chart.notes) if (n.src) counts[n.lane]?.set(n.src, (counts[n.lane].get(n.src) ?? 0) + 1);
  return counts.map((c) => [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
}

/**
 * The card a play starts from, shown while it loads: the song's jacket and beside it what is about
 * to be played (its tier, level and key mode on the tier's colour, how the play runs, the title,
 * tempo, notes, length and the speed it scrolls at, the rules it runs on where they are not the
 * defaults), the loading under them, and at the foot of the screen the keys that play its lanes,
 * each over the colour of the instrument the lane follows most. Started from the song select, the
 * jacket comes over from where it stood there (jacketFlight.ts).
 */
export function LoadingCard({ request, settings, text, onCancel }: { request: PlayRequest; settings: Settings; text: string; onCancel: () => void }) {
  const { chart, song } = request;
  const m = chart.meta;
  const tier = difficultyTiers.find((t) => t.id === m.difficulty);
  const level = m.level > 0 ? `Lv.${m.level}` : null;
  const stems = laneStems(chart);
  const keys = bindingsFor(settings, m.keyMode);
  const seconds = secondBindingsFor(settings, m.keyMode);
  const present = STEM_NAMES.filter((s) => stems.includes(s));
  const mode = playModeLabel(request);
  const rules = ruleChips(playedSettings(request, settings), Boolean(request.practice));
  // the song's own offset, where it has one (it moves its notes and their judgement)
  const offset = songOffsetOf(settings, m.songId);
  if (offset !== 0) rules.push(['곡 오프셋', `${offset > 0 ? '+' : ''}${offset}ms`]);
  const artSize = Math.round(JACKET_PX * uiScale());

  const card = useRef<HTMLDivElement>(null);
  // before the first paint: the jacket is never seen in its place before it has come over
  useLayoutEffect(() => {
    const from = takeJacketOrigin();
    const jacket = card.current?.querySelector<HTMLElement>('.loading-jacket');
    if (from && jacket) flyJacket(jacket, from, [...(card.current?.querySelectorAll<HTMLElement>('.loading-text, .loading-status, .loading-keys') ?? [])]);
  }, []);

  return (
    <div ref={card} className="play-overlay play-loading" data-testid="play-loading">
      {song && <Backdrop song={song} />}
      <div className="loading-card">
        <div className="loading-jacket">
          {song ? <SongArt song={song} size={artSize} className="loading-art" /> : <Disc size={artSize} className="loading-art" />}
        </div>
        <div className="loading-text">
          <p className="loading-chips">
            <span className="loading-tier" style={{ ['--diff' as string]: tier?.color ?? 'var(--text-dim)' } as CSSProperties}>
              <span>{tier?.label ?? m.difficulty}</span>
              {level && <b className="loading-level">{level}</b>}
              <i aria-hidden="true" />
              <span>{m.keyMode}</span>
            </span>
            {mode && <span className="loading-mode">{mode}</span>}
          </p>
          <h1>{m.title}</h1>
          <p className="loading-artist">{m.artist || '알 수 없는 아티스트'}</p>
          <p className="loading-facts">
            <span>
              <span className="label">BPM</span> <b>{bpmOf(chart)}</b>
            </span>
            <span>
              <span className="label">노트</span> <b>{chart.notes.length.toLocaleString('en-US')}</b>
            </span>
            {m.durationMs ? (
              <span>
                <span className="label">길이</span> <b>{formatTime(m.durationMs)}</b>
              </span>
            ) : null}
            <span>
              <span className="label">노트 속도</span> <b>{speedText(settings.hiSpeed)}</b>
            </span>
          </p>
          {rules.length > 0 && (
            <p className="loading-rules" data-testid="loading-rules">
              {rules.map(([name, value]) => (
                <span key={name || value} className="loading-rule">
                  {name && <span className="label">{name}</span>} <b>{value}</b>
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="loading-status">
        <span className="loading-bar" aria-hidden="true">
          <i />
        </span>
        <p aria-live="polite">{text}</p>
        <button className="quiet small" data-testid="play-loading-cancel" onClick={onCancel}>
          취소 <kbd>Esc</kbd>
        </button>
      </div>
      <div className="loading-keys" aria-label="키">
        <span className="label">키</span>
        {keys.map((code, lane) => (
          <span key={lane} className="loading-key">
            <kbd>{seconds[lane] ? `${keyLabel(code)} · ${keyLabel(seconds[lane] as string)}` : keyLabel(code)}</kbd>
            {present.length > 0 && <i style={{ background: stems[lane] ? `var(${stemToken(stems[lane])})` : 'var(--line-strong)' }} />}
          </span>
        ))}
        {present.length > 0 && (
          <span className="loading-stems">
            {present.map((s) => (
              <span key={s} className="loading-stem">
                <i style={{ background: `var(${stemToken(s)})` }} />
                {STEM_LABELS[s]}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
