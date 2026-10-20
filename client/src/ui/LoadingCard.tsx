import type { CSSProperties } from 'react';
import { difficultySystems } from '../engine/config';
import type { Chart, StemName } from '../engine/types';
import { STEM_NAMES } from '../engine/types';
import { activeCovers, bindingsFor, greenNumber, keyLabel, type Settings } from '../settings/settings';
import type { PlayRequest } from './App';
import { Backdrop, SongArt, stemToken } from './songArt';

const STEM_LABELS: Record<StemName, string> = { drums: '드럼', bass: '베이스', vocals: '보컬', other: '멜로디' };

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

/** Section names in order, a repeat of the one before counted once. */
function sectionFlow(chart: Chart): string[] {
  const flow: string[] = [];
  for (const s of chart.sections ?? []) if (s.label && s.label !== flow[flow.length - 1]) flow.push(s.label);
  return flow;
}

/**
 * The card shown while a play loads: what is about to be played (the song, its tier and level,
 * tempo, length, the speed it scrolls at and its sections) and the keys that play its lanes, each
 * coloured by the instrument the lane follows most.
 */
export function LoadingCard({ request, settings, text, onCancel }: { request: PlayRequest; settings: Settings; text: string; onCancel: () => void }) {
  const { chart, song } = request;
  const m = chart.meta;
  const system = difficultySystems[m.difficultySystem ?? 'GRG'] ?? difficultySystems.GRG;
  const tier = system.tiers.find((t) => t.id === m.difficulty);
  const level = m.level > 0 ? `${m.levelScale ? `${m.levelScale} ` : 'Lv.'}${m.level}` : null;
  const stems = laneStems(chart);
  const keys = bindingsFor(settings, m.keyMode);
  const present = STEM_NAMES.filter((s) => stems.includes(s));
  const flow = sectionFlow(chart);
  const practice = request.practice;
  const mode = request.replay ? 'REPLAY' : practice ? `연습${practice.rate !== 1 ? ` ×${practice.rate.toFixed(2)}` : ''}` : request.autoPlay ? 'AUTO' : null;
  return (
    <div className="play-overlay play-loading" data-testid="play-loading">
      {song && <Backdrop song={song} />}
      <div className="loading-card">
        {song ? (
          <SongArt song={song} size={240} className="loading-art" />
        ) : (
          <div className="song-art placeholder loading-art" aria-hidden="true">
            {m.title.slice(0, 1)}
          </div>
        )}
        <div className="loading-text">
          <h1>{m.title}</h1>
          <p className="artist">{m.artist || '알 수 없는 아티스트'}</p>
          <p className="loading-tier">
            <span className="tier-name" style={{ ['--diff' as string]: tier?.color ?? 'var(--text-dim)' } as CSSProperties}>
              {tier?.label ?? m.difficulty}
            </span>
            {level && <span className="loading-level">{level}</span>}
            <span className="key-mode">{m.keyMode}</span>
            {mode && <span className="play-mode">{mode}</span>}
          </p>
          <p className="loading-facts">
            <span>
              <span className="label">BPM</span> <b>{bpmOf(chart)}</b>
            </span>
            {m.durationMs ? (
              <span>
                <span className="label">길이</span> <b>{formatTime(m.durationMs)}</b>
              </span>
            ) : null}
            <span>
              <span className="label">HI-SPEED</span> <b>{settings.hiSpeed.toFixed(1)}</b>
            </span>
            <span>
              <span className="label">녹색</span> <b>{Math.round(greenNumber(settings.hiSpeed, activeCovers(settings)))}</b>
            </span>
          </p>
          {flow.length > 0 && (
            <p className="section-flow" aria-label="곡 구간">
              {flow.map((label, i) => (
                <span key={i}>{label.toUpperCase()}</span>
              ))}
            </p>
          )}
          <div className="loading-status">
            <p aria-live="polite">{text}</p>
            <div className="loading-progress">
              <span className="loading-bar" aria-hidden="true">
                <i />
              </span>
              <button className="quiet small" data-testid="play-loading-cancel" onClick={onCancel}>
                취소 <kbd>Esc</kbd>
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="loading-keys" aria-label="키">
        <span className="label">키</span>
        {keys.map((code, lane) => (
          <span key={lane} className="loading-key">
            <kbd>{keyLabel(code)}</kbd>
            <i style={{ background: stems[lane] ? `var(${stemToken(stems[lane])})` : 'var(--line-strong)' }} />
          </span>
        ))}
        {present.length > 0 && <span className="label">{present.map((s) => STEM_LABELS[s]).join(' · ')}</span>}
      </div>
    </div>
  );
}
