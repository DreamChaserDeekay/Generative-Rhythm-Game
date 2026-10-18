import { expect, test } from '@playwright/test';
import type { StemName } from '../src/engine/types';

// Generated-chart keysounds rendered offline in the browser: the slices played on time plus the
// mix with the keysounded stems cut out must give back the song exactly, and a missed note must
// leave only its own slice silent.
test('stem keysounds put the song back together, and a miss drops only its slice', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // served by the Vite dev server; typed from the source module
    const modulePath = '/src/audio/stemKeysounds.ts';
    const m = (await import(/* @vite-ignore */ modulePath)) as typeof import('../src/audio/stemKeysounds');
    const SR = 44100;
    const length = 4 * SR;
    const fade = 128 / SR; // whole samples, so every edge falls on a sample
    const options = { stemShare: 0.1, maxSliceMs: 4000, chordMs: 30, fadeMs: fade * 1000, ghostMs: 300 };
    const ctx0 = new OfflineAudioContext(1, length, SR);
    const drums = ctx0.createBuffer(1, length, SR);
    const vocals = ctx0.createBuffer(1, length, SR);
    const mix = ctx0.createBuffer(1, length, SR);
    const d = drums.getChannelData(0);
    const v = vocals.getChannelData(0);
    const x = mix.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / SR;
      const sinceHit = t % 0.5;
      d[i] = 0.5 * Math.sin(2 * Math.PI * 180 * t) * Math.exp(-sinceHit * 18);
      v[i] = 0.3 * Math.sin(2 * Math.PI * 440 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.7 * t));
      x[i] = d[i] + v[i];
    }
    const notes = [] as { t: number; src: StemName }[];
    for (let k = 1; k < 8; k++) notes.push({ t: k * 500, src: 'drums' });
    for (let k = 0; k < 8; k++) notes.push({ t: 250 + k * 500, src: 'vocals' });
    const plan = m.planStemKeysounds(notes, 4000, ['drums', 'vocals'], options)!;
    const buffers = new Map<StemName, AudioBuffer>([
      ['drums', drums],
      ['vocals', vocals],
    ]);

    async function render(skip: Set<number>): Promise<Float32Array> {
      const ctx = new OfflineAudioContext(1, length, SR);
      const song = ctx.createBufferSource();
      song.buffer = mix;
      song.connect(ctx.destination);
      song.start(0);
      for (const stem of plan.stems) {
        const copy = ctx.createBufferSource();
        copy.buffer = buffers.get(stem)!;
        const gain = ctx.createGain();
        m.scheduleStemCut(gain.gain, plan.ranges[stem] ?? [], 0, 0, (ms) => ms / 1000, fade);
        copy.connect(gain);
        gain.connect(ctx.destination);
        copy.start(0);
      }
      const voices = new m.StemKeysoundVoices(ctx, ctx.destination, plan, buffers, { originMs: 0, rate: 1 }, options);
      notes.forEach((_, i) => {
        const slice = plan.noteSlice[i];
        if (slice !== null && !skip.has(i)) voices.play(slice, plan.slices[slice].startMs / 1000);
      });
      return (await ctx.startRendering()).getChannelData(0);
    }

    const maxDiff = (a: Float32Array, b: Float32Array, from: number, to: number) => {
      let worst = 0;
      for (let i = Math.floor(from * SR); i < Math.floor(to * SR); i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
      return worst;
    };
    const all = await render(new Set());
    // the vocal note at 1.25 s is missed: its slice (1.25–1.75 s) has no vocals, the rest is intact
    const missed = notes.findIndex((n) => n.src === 'vocals' && n.t === 1250);
    const miss = await render(new Set([missed]));
    return {
      stems: plan.stems,
      slices: plan.slices.length,
      wholeSong: maxDiff(all, x, 0, 4),
      missedSlice: maxDiff(miss, d, 1.26, 1.74),
      beforeMiss: maxDiff(miss, x, 0, 1.24),
      afterMiss: maxDiff(miss, x, 1.76, 4),
    };
  });
  console.log('keysound offline render:', JSON.stringify(result));
  expect(result.stems).toEqual(['drums', 'vocals']);
  expect(result.slices).toBe(15);
  expect(result.wholeSong).toBeLessThan(1e-4);
  expect(result.missedSlice).toBeLessThan(1e-4);
  expect(result.beforeMiss).toBeLessThan(1e-4);
  expect(result.afterMiss).toBeLessThan(1e-4);
});
