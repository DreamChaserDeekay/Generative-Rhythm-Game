import { useEffect, useRef, useState } from 'react';
import { cameraConfig, keyModes } from '../engine/config';
import { ScrollModel } from '../engine/scroll';
import type { SessionNote } from '../engine/session';
import type { ChartTiming, KeyModeId } from '../engine/types';
import { hexString } from '../render/noteColors';
import { GRADE_PALETTES } from '../render/palette';
import { disposeSkinArt, loadSkinArt } from '../render/skinArt';
import { skinById, withParts } from '../render/skins';
import { TrackRenderer } from '../render/TrackRenderer';
import { activeCovers, greenNumber, laneColorsOf, visibleTimeMs, type Settings } from '../settings/settings';
import { coverText } from './format';
import { PHRASE_BEATS, previewPhrase } from './previewPhrase';

const BPM = 150;
const BEAT_MS = 60000 / BPM;
const TIMING: ChartTiming = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: BPM }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
/** A key looks pressed this long after a tap. */
const PRESS_MS = 70;
/** The first phrase starts this far in, so it comes down from the top of the track. */
const LEAD_MS = 2000;

type PreviewSettings = Pick<
  Settings,
  | 'skin'
  | 'customSkin'
  | 'parts'
  | 'cameraPreset'
  | 'laneWidthScale'
  | 'palette'
  | 'reducedFlash'
  | 'barLines'
  | 'hiSpeed'
  | 'sudden'
  | 'hidden'
  | 'lift'
  | 'coversOn'
  | 'keyBeamLength'
  | 'hitEffectSize'
  | 'sideNotes'
  | 'noteColors'
  | 'colorPresets'
>;

/**
 * The gear as it will be played, in the settings: the skin, camera, lane width, side notes, note
 * colours, covers, hit effects and hi-speed in effect, with a short phrase coming down and played on
 * its own. Every change shows at once; `laneColors` shows colours not kept yet (one being picked).
 */
export function GearPreview({ settings, keyMode, laneColors }: { settings: PreviewSettings; keyMode: KeyModeId; laneColors?: readonly number[] }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<TrackRenderer | null>(null);
  const [built, setBuilt] = useState(0);
  const covers = activeCovers(settings);
  // the note colours recolour the running preview (a colour being picked changes them many times a second)
  const colours = laneColors ?? laneColorsOf(settings, keyMode);
  const colourKey = colours.join(',');
  const shownColours = useRef(colours);
  shownColours.current = colours;

  // what the renderer is built from; the camera, covers and speed change on a running one
  const { skin: skinId, customSkin, parts, laneWidthScale, palette, reducedFlash, barLines, hitEffectSize, sideNotes } = settings;
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let alive = true;
    let made: TrackRenderer | null = null;
    const skin = withParts(skinById(skinId, customSkin), parts);
    void loadSkinArt(skin)
      .catch(() => null)
      .then((art) => {
        if (!alive) {
          disposeSkinArt(art);
          return;
        }
        made = new TrackRenderer(el, {
          mode: keyModes[keyMode],
          camera: cameraConfig.presets[cameraConfig.default],
          trackWidth: cameraConfig.trackWidth * laneWidthScale,
          trackLength: cameraConfig.trackLength,
          palette,
          reducedFlash,
          covers: { sudden: 0, hidden: 0, lift: 0 },
          skin,
          art,
          barLines,
          hitEffectSize,
          sideNotes,
          laneColors: shownColours.current,
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
  }, [keyMode, skinId, customSkin, parts, laneWidthScale, palette, reducedFlash, barLines, hitEffectSize, sideNotes]);

  useEffect(() => renderer.current?.setLaneColors(shownColours.current), [built, colourKey]);

  // the camera, the covers, the speed and the key beams change the running preview without starting it over
  const camera = cameraConfig.presets[settings.cameraPreset] ?? cameraConfig.presets[cameraConfig.default];
  const { sudden, hidden, lift } = covers;
  const { hiSpeed, keyBeamLength } = settings;
  const scroll = useRef<{ model: ScrollModel; visibleMs: number } | null>(null);
  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    r.setCamera(camera);
    r.setCovers({ sudden, hidden, lift });
    r.setKeyBeamLength(keyBeamLength);
    const visibleMs = visibleTimeMs(hiSpeed);
    scroll.current = {
      model: new ScrollModel({ trackLength: r.geometry.length, visibleMs, lift, mode: 'time', timing: TIMING, rate: 1, durationMs: 3_600_000 }),
      visibleMs,
    };
  }, [built, camera, sudden, hidden, lift, hiSpeed, keyBeamLength]);

  // the phrase, played over and over
  useEffect(() => {
    const r = renderer.current;
    const el = box.current;
    if (!r || !el) return;
    const fit = () => r.resize(el.clientWidth, el.clientHeight);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);

    const phrase = previewPhrase(keyModes[keyMode]);
    const hitColor = GRADE_PALETTES[palette]['g-max'] ?? 0xffffff;
    const notes: SessionNote[] = [];
    const bars: number[] = [];
    let phrases = 0;
    // the notes are only ever added to, as the renderer reads them by index
    const extendTo = (ms: number) => {
      while (LEAD_MS + phrases * PHRASE_BEATS * BEAT_MS < ms) {
        const start = LEAD_MS + phrases * PHRASE_BEATS * BEAT_MS;
        for (const n of phrase) {
          const t = start + n.beat * BEAT_MS;
          const endT = n.endBeat !== undefined ? start + n.endBeat * BEAT_MS : t;
          notes.push({ index: notes.length, lane: n.lane, t, type: n.endBeat !== undefined ? 'hold' : 'tap', endT, ticks: [], nextTick: 0, headDone: false, tailDone: false, broken: false, src: n.src });
        }
        for (let b = 0; b < PHRASE_BEATS; b += 4) bars.push(start + b * BEAT_MS);
        phrases++;
      }
    };
    const lanes = keyModes[keyMode].lanes.length;
    const held: (number | null)[] = new Array(lanes).fill(null);
    const pressedUntil: number[] = new Array(lanes).fill(-Infinity);
    let next = 0;
    let raf = 0;
    // the first notes are already coming down the track
    const startPerf = performance.now() - (LEAD_MS - (scroll.current?.visibleMs ?? 0) * 0.9);
    const frame = (perfNow: number) => {
      if (renderer.current !== r) return;
      raf = requestAnimationFrame(frame);
      const view = scroll.current;
      if (!view) return;
      const now = perfNow - startPerf;
      extendTo(now + view.visibleMs + BEAT_MS * PHRASE_BEATS);
      // played on its own: every note at its time, long notes held to their end
      for (; next < notes.length && notes[next].t <= now; next++) {
        const n = notes[next];
        n.headDone = true;
        r.hitEffect(n.lane, hitColor, perfNow, n.index);
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
        r.hitEffect(lane, hitColor, perfNow, index);
      });
      r.render(
        {
          timeMs: now,
          scroll: view.model,
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
  }, [built, keyMode, palette]);

  return (
    <div className="gear-preview" ref={box} data-testid="gear-preview" data-lane-colors={colours.map(hexString).join(' ')}>
      <canvas ref={canvas} aria-label={`${keyMode} 미리보기`} />
      {settings.coversOn && settings.sudden > 0 && <span className="preview-tag">SUDDEN+ {coverText(settings.sudden)}</span>}
      <span className="preview-green" title="노트가 나타나서 판정선에 닿기까지의 시간 (녹색 숫자)">
        <span className="label">보이는 시간</span>
        <b data-testid="green-number">{Math.round(greenNumber(hiSpeed, covers))}ms</b>
      </span>
    </div>
  );
}
