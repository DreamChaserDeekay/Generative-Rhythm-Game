import { useEffect, useRef, useState } from 'react';
import { cameraConfig, keyModes } from '../engine/config';
import { ScrollModel } from '../engine/scroll';
import type { SessionNote } from '../engine/session';
import { TempoMap } from '../engine/tempo';
import type { Chart } from '../engine/types';
import { GRADE_COLORS } from '../render/palette';
import { disposeSkinArt, loadSkinArt } from '../render/skinArt';
import { TrackRenderer } from '../render/TrackRenderer';
import { activeCovers, laneColorsOf, skinOf, visibleTimeMs, type Settings } from '../settings/settings';

/** A key looks pressed this long after a tap. */
const PRESS_MS = 70;

/**
 * A chart on the track, in the menus: the game's own renderer (the gear, the notes and the hit
 * effect picked in the settings, at the speed set) playing the chart by itself in time with the
 * song's preview. `clock` gives the song's time now; while it gives none (no sound yet) the track
 * runs on by itself from `startMs`.
 */
export function ChartStage({ chart, settings, clock, startMs }: { chart: Chart; settings: Settings; clock: () => number | null; startMs: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<TrackRenderer | null>(null);
  const [built, setBuilt] = useState(0);
  const keyMode = chart.meta.keyMode;
  const live = useRef({ clock, settings });
  live.current = { clock, settings };

  // what the renderer is built from; the camera, the covers and the speed change on a running one
  const { parts, laneWidthScale, reducedFlash, barLines, hitEffectSize, sideNotes } = settings;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let alive = true;
    let made: TrackRenderer | null = null;
    const skin = skinOf({ parts });
    void loadSkinArt(skin)
      .catch(() => null)
      .then((art) => {
        if (!alive) {
          disposeSkinArt(art);
          return;
        }
        const s = live.current.settings;
        made = new TrackRenderer(el, {
          mode: keyModes[keyMode],
          camera: cameraConfig.presets[s.cameraPreset] ?? cameraConfig.presets[cameraConfig.default],
          trackWidth: cameraConfig.trackWidth * laneWidthScale,
          trackLength: cameraConfig.trackLength,
          reducedFlash,
          covers: activeCovers(s),
          skin,
          art,
          barLines,
          keyBeamLength: s.keyBeamLength,
          hitEffectSize,
          sideNotes,
          laneColors: laneColorsOf(s, keyMode),
          // the whole gear in the box, whatever its shape
          fitWidth: 0.84,
        });
        renderer.current = made;
        setBuilt((n) => n + 1);
      });
    return () => {
      alive = false;
      // the frame loop stops at the next frame, when it finds its renderer gone
      if (renderer.current === made) renderer.current = null;
      made?.dispose();
    };
  }, [keyMode, parts, laneWidthScale, reducedFlash, barLines, hitEffectSize, sideNotes]);

  const covers = activeCovers(settings);
  const { sudden, hidden, lift } = covers;
  const { hiSpeed, keyBeamLength, cameraPreset } = settings;
  const colourKey = laneColorsOf(settings, keyMode).join(',');
  const scroll = useRef<ScrollModel | null>(null);
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.setCamera(cameraConfig.presets[cameraPreset] ?? cameraConfig.presets[cameraConfig.default]);
    r.setCovers({ sudden, hidden, lift });
    r.setKeyBeamLength(keyBeamLength);
    r.setLaneColors(laneColorsOf(live.current.settings, keyMode));
    scroll.current = new ScrollModel({ trackLength: r.geometry.length, visibleMs: visibleTimeMs(hiSpeed), lift, mode: 'time', timing: chart.timing, rate: 1, durationMs: chart.meta.durationMs ?? 3_600_000 });
  }, [built, chart, cameraPreset, sudden, hidden, lift, hiSpeed, keyBeamLength, colourKey]);

  // the chart, played on its own from wherever the clock is
  useEffect(() => {
    const r = renderer.current;
    const el = box.current;
    if (!r || !el) return;
    const fit = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) r.resize(el.clientWidth, el.clientHeight);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);

    const notes: SessionNote[] = chart.notes.map((n, index) => ({ index, lane: n.lane, t: n.t, type: n.type, endT: n.endT ?? n.t, ticks: [], nextTick: 0, headDone: false, tailDone: false, broken: false, src: n.src }));
    const bars = new TempoMap(chart.timing).barLines(chart.meta.durationMs ?? 0);
    const lanes = keyModes[keyMode].lanes.length;
    const held: (number | null)[] = new Array(lanes).fill(null);
    const pressedUntil: number[] = new Array(lanes).fill(-Infinity);
    const hit = GRADE_COLORS['g-max'] ?? 0xffffff;
    let next = 0;
    let last = -Infinity;
    const freeAt = performance.now();
    /** Every note before `now` is done, every later one still to come (the clip looped, or the clock began). */
    const place = (now: number) => {
      next = 0;
      held.fill(null);
      for (const n of notes) {
        n.headDone = n.t < now;
        n.tailDone = n.endT < now;
        if (n.t < now) next = n.index + 1;
        if (n.type === 'hold' && n.t < now && n.endT >= now) held[n.lane] = n.index;
      }
      r.reset();
    };
    let raf = 0;
    const frame = (perfNow: number) => {
      if (renderer.current !== r) return;
      raf = requestAnimationFrame(frame);
      const view = scroll.current;
      if (!view) return;
      const now = live.current.clock() ?? startMs + (perfNow - freeAt);
      if (now < last - 50 || now > last + 1500) place(now);
      last = now;
      for (; next < notes.length && notes[next].t <= now; next++) {
        const n = notes[next];
        n.headDone = true;
        r.hitEffect(n.lane, hit, perfNow);
        if (n.type === 'hold') held[n.lane] = n.index;
        else {
          n.tailDone = true;
          pressedUntil[n.lane] = now + PRESS_MS;
        }
      }
      held.forEach((index, lane) => {
        if (index === null || notes[index].endT > now) return;
        notes[index].tailDone = true;
        held[lane] = null;
        r.hitEffect(lane, hit, perfNow);
      });
      r.render(
        {
          timeMs: now,
          scroll: view,
          notes,
          heldNote: (lane) => held[lane],
          keyDown: (lane) => held[lane] !== null || pressedUntil[lane] > now,
          barTimes: bars,
          fever: { active: false, multiplier: 1, remaining: 0 },
        },
        perfNow,
      );
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      watch.disconnect();
      r.reset();
    };
  }, [built, chart, startMs]);

  return (
    <div className="chart-stage" ref={box} data-testid="chart-stage">
      <canvas ref={canvas} aria-label={`${keyMode} 채보 미리보기`} />
    </div>
  );
}
