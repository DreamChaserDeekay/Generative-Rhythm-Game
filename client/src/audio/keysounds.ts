import { api } from '../api/client';
import type { Chart } from '../engine/types';
import { getAudioEngine } from './AudioEngine';

/** Decoded keysound sprite of a song (imported BMS/bmson) and where every sound sits in it. */
export interface KeysoundBank {
  sprite: AudioBuffer;
  /** [start, length] in seconds, by sound file name. */
  sounds: Map<string, [number, number]>;
  /** Keeps the full mix from clipping (computed on import). */
  gain: number;
}

/** A keysound trigger: sound index, offset into the sound and optional cut length (ms). */
export interface KeysoundEvent {
  snd?: number;
  so?: number;
  sl?: number;
}

/** Fade at a cut (a sound stopped by its next start) so it does not click. */
const CUT_FADE_SEC = 0.002;

export async function loadKeysoundBank(songId: string): Promise<KeysoundBank> {
  const [index, sprite] = await Promise.all([api.keysoundIndex(songId), getAudioEngine().load(api.keysoundUrl(songId))]);
  const sounds = new Map<string, [number, number]>();
  for (const [name, [start, length]] of Object.entries(index.sounds)) {
    sounds.set(name, [start / index.sampleRate, length / index.sampleRate]);
  }
  return { sprite, sounds, gain: index.gain };
}

export interface Span {
  /** Position in the sprite (s). */
  offset: number;
  duration: number;
  /** Stopped before the sound ends (it starts again, or the slice ends). */
  cut: boolean;
}

/** The part of the sprite an event plays, or null when its sound is missing. */
export function eventSpan(bank: KeysoundBank, names: readonly string[], e: KeysoundEvent): Span | null {
  if (e.snd === undefined) return null;
  const entry = bank.sounds.get(names[e.snd] ?? '');
  if (!entry) return null;
  const [start, length] = entry;
  const into = (e.so ?? 0) / 1000;
  const rest = length - into;
  if (rest <= 0) return null;
  const cut = e.sl !== undefined && e.sl / 1000 < rest;
  return { offset: start + into, duration: cut ? (e.sl as number) / 1000 : rest, cut };
}

function cutFade(gain: GainNode, end: number): void {
  gain.gain.setValueAtTime(1, Math.max(0, end - CUT_FADE_SEC));
  gain.gain.linearRampToValueAtTime(0, end);
}

/**
 * Renders the chart's background events into one buffer: during play it is the song clock
 * source, exactly like a song's audio file, and only the notes' keysounds play live.
 */
export async function renderBgm(chart: Chart, bank: KeysoundBank, durationMs: number): Promise<AudioBuffer> {
  const sr = bank.sprite.sampleRate;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil((durationMs / 1000) * sr) + sr), sr);
  const master = ctx.createGain();
  master.gain.value = bank.gain;
  master.connect(ctx.destination);
  const names = chart.sounds ?? [];
  for (const e of chart.bgm ?? []) {
    const span = eventSpan(bank, names, e);
    if (!span || e.t < 0) continue;
    const src = ctx.createBufferSource();
    src.buffer = bank.sprite;
    if (span.cut) {
      const gain = ctx.createGain();
      cutFade(gain, e.t / 1000 + span.duration);
      src.connect(gain);
      gain.connect(master);
    } else {
      src.connect(master);
    }
    src.start(e.t / 1000, span.offset, span.duration);
  }
  return ctx.startRendering();
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  end: number;
}

/** Note keysounds during a play. A sound that starts again cuts its previous instance (BMS). */
export class KeysoundVoices {
  private readonly playing = new Map<number, Voice>();
  private readonly ctx: BaseAudioContext;
  private readonly destination: AudioNode;
  private readonly bank: KeysoundBank;
  private readonly names: readonly string[];

  constructor(ctx: BaseAudioContext, destination: AudioNode, bank: KeysoundBank, names: readonly string[]) {
    this.ctx = ctx;
    this.destination = destination;
    this.bank = bank;
    this.names = names;
  }

  /** Start an event's sound at context time `when` (now if that has passed). */
  play(e: KeysoundEvent, when: number): void {
    const span = eventSpan(this.bank, this.names, e);
    if (!span || e.snd === undefined) return;
    const at = Math.max(when, this.ctx.currentTime);
    const prev = this.playing.get(e.snd);
    if (prev && prev.end > at) {
      prev.gain.gain.cancelScheduledValues(at);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, at);
      prev.gain.gain.linearRampToValueAtTime(0, at + CUT_FADE_SEC);
      prev.src.stop(at + CUT_FADE_SEC);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.bank.sprite;
    const gain = this.ctx.createGain();
    src.connect(gain);
    gain.connect(this.destination);
    const end = at + span.duration;
    if (span.cut) cutFade(gain, end);
    src.start(at, span.offset, span.duration);
    const voice = { src, gain, end };
    this.playing.set(e.snd, voice);
    src.onended = () => {
      gain.disconnect();
      if (this.playing.get(e.snd as number) === voice) this.playing.delete(e.snd as number);
    };
  }

  stopAll(): void {
    for (const v of this.playing.values()) {
      try {
        v.src.stop();
      } catch {
        // already stopped
      }
      v.gain.disconnect();
    }
    this.playing.clear();
  }
}
