import { getAudioEngine } from '@game/audio/AudioEngine';

/**
 * The mockup's sound: recorded samples only (public/sfx, see PROVENANCE.md), played through the
 * game's own audio context. Every event has a few candidates; the one picked on the 소리 고르기
 * board is kept in this browser.
 */
export interface Candidate {
  id: string;
  file: string;
  /** What it is a recording of. */
  label: string;
  source: string;
  /** What was measured of the cut file (tools/build_sfx.py). */
  raw?: string;
  page?: string;
  license?: string;
  durationMs?: number;
  peakDb?: number;
  rmsDb?: number;
  /** The gain that brought the recording to its event's level (already in the file). */
  gainDb?: number;
  floorDb?: number;
  clipped?: number;
}
export interface KitEvent {
  id: string;
  label: string;
  where: string;
  candidates: Candidate[];
}
export interface Kit {
  events: KitEvent[];
}

/**
 * The menu and play sounds are parked: the kit is being chosen again later, so nothing of it is
 * loaded or played for now. The calls stay where the sounds belong (sfx('cursor') …), and the
 * samples wait in _src/sfx/kit (they go back to public/sfx when this is turned on).
 */
export const SFX_ON = false;
const STORE = 'hanjul.sfx.v1';
const engine = getAudioEngine();
export const ctx = engine.ctx;
const out = ctx.createGain();
out.gain.value = 0.9;
out.connect(ctx.destination);
const musicOut = ctx.createGain();
musicOut.connect(ctx.destination);

export let kit: Kit = { events: [] };
const buffers = new Map<string, AudioBuffer>();
let picks: Record<string, string> = {};
let muted = false;

export async function unlock(): Promise<void> {
  await engine.unlock();
}

export async function loadKit(): Promise<void> {
  if (!SFX_ON) return;
  try {
    picks = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, string>;
  } catch {
    picks = {};
  }
  kit = (await (await fetch('./sfx/kit.json')).json()) as Kit;
  await Promise.all(
    kit.events.flatMap((e) =>
      e.candidates.map(async (c) => {
        try {
          const data = await (await fetch(`./sfx/${c.file}`)).arrayBuffer();
          buffers.set(c.file, await ctx.decodeAudioData(data));
        } catch {
          // a sample that does not load stays silent
        }
      }),
    ),
  );
}

export function pickOf(event: string): Candidate | null {
  const e = kit.events.find((x) => x.id === event);
  if (!e || e.candidates.length === 0) return null;
  return e.candidates.find((c) => c.id === picks[event]) ?? e.candidates[0];
}

export function setPick(event: string, candidate: string): void {
  picks[event] = candidate;
  try {
    localStorage.setItem(STORE, JSON.stringify(picks));
  } catch {
    // kept for this visit only
  }
}

export function resetPicks(): void {
  picks = {};
  try {
    localStorage.removeItem(STORE);
  } catch {
    // nothing kept
  }
}

export function bufferOf(c: Candidate): AudioBuffer | null {
  return buffers.get(c.file) ?? null;
}

/** The effects' level (설정 → 소리 → 효과음). */
export function setSfxLevel(v: number): void {
  out.gain.value = v * 1.5;
}

export function setMuted(m: boolean): void {
  muted = m;
}

function fire(c: Candidate, gain = 1, rate = 1): void {
  const buffer = buffers.get(c.file);
  if (!buffer || muted || ctx.state !== 'running') return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(out);
  src.start();
}

/** Plays the event's picked sample. `gain` and `rate` only scale the recording (quieter repeats, a detent a step up). */
export function sfx(event: string, gain = 1, rate = 1): void {
  if (!SFX_ON) return;
  const c = pickOf(event);
  if (c) fire(c, gain, rate);
}

export function audition(c: Candidate): void {
  fire(c);
}

/** The song select's preview: a clip of the song from its preview point, looped, with its place in the song. */
export class Preview {
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private startedAt = 0;
  private lengthMs = 0;
  private originMs = 0;
  private token = 0;
  private cache = new Map<string, Promise<AudioBuffer>>();

  async play(id: string, originMs: number): Promise<void> {
    const mine = ++this.token;
    this.stop(180);
    let load = this.cache.get(id);
    if (!load) {
      load = fetch(`./audio/${id}.pre.mp3`)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b));
      this.cache.set(id, load);
    }
    const buffer = await load;
    if (mine !== this.token) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(this.level, ctx.currentTime + 0.25);
    src.connect(gain);
    gain.connect(musicOut);
    src.start();
    this.src = src;
    this.gain = gain;
    this.startedAt = ctx.currentTime;
    this.lengthMs = buffer.duration * 1000;
    this.originMs = originMs;
  }

  private level = 0.8;
  /** Ducks the preview (the settings, the sound board) or brings it back. */
  setLevel(level: number): void {
    this.level = level;
    this.gain?.gain.setTargetAtTime(level, ctx.currentTime, 0.08);
  }

  stop(fadeMs = 120): void {
    const { src, gain } = this;
    this.src = null;
    this.gain = null;
    if (!src || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, fadeMs / 3000);
    src.stop(ctx.currentTime + fadeMs / 1000 + 0.05);
  }

  cancel(): void {
    this.token++;
    this.stop();
  }

  get playing(): boolean {
    return this.src !== null;
  }

  /** Song time now (ms), or null while nothing plays. The clip loops: so does the time. */
  songMs(): number | null {
    if (!this.src) return null;
    const output = (ctx.outputLatency || ctx.baseLatency || 0) * 1000;
    const into = ((ctx.currentTime - this.startedAt) * 1000 - output + this.lengthMs * 4) % this.lengthMs;
    return this.originMs + into;
  }

  get windowMs(): [number, number] {
    return [this.originMs, this.originMs + this.lengthMs];
  }
}

export const preview = new Preview();
export const gameEngine = engine;
