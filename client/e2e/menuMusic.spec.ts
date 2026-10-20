import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { autoplay } from './songSelect';

const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');

interface Watch {
  audios: HTMLAudioElement[];
  filters: BiquadFilterNode[];
  gains: GainNode[];
  afterFilter: boolean;
}

test('the song preview plays on behind the settings, quieter and muffled, and comes back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  mkdirSync('test-results', { recursive: true });
  const wav = 'test-results/e2e-preview.wav';
  execFileSync(python, ['-m', 'rhythm_server', 'synth', '-o', wav, '--bpm', '128', '--bars', '32', '--seed', '3'], {
    env: { ...process.env, PYTHONPATH: '../server' },
  });
  // keep the preview's audio element and the filter and gain made to muffle it
  await page.addInitScript(() => {
    const watch: Watch = { audios: [], filters: [], gains: [], afterFilter: false };
    (window as unknown as { __music: Watch }).__music = watch;
    const NativeAudio = window.Audio;
    window.Audio = function (src?: string) {
      const audio = new NativeAudio(src);
      watch.audios.push(audio);
      return audio;
    } as unknown as typeof Audio;
    const createFilter = AudioContext.prototype.createBiquadFilter;
    AudioContext.prototype.createBiquadFilter = function (this: AudioContext) {
      const filter = createFilter.call(this);
      watch.filters.push(filter);
      watch.afterFilter = true;
      return filter;
    };
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function (this: AudioContext) {
      const gain = createGain.call(this);
      if (watch.afterFilter) watch.gains.push(gain); // the muffle's gain follows its filter
      watch.afterFilter = false;
      return gain;
    };
  });
  const state = () =>
    page.evaluate(() => {
      const watch = (window as unknown as { __music: Watch }).__music;
      const audio = watch.audios.at(-1);
      return {
        previews: watch.audios.length,
        playing: !!audio && !audio.paused,
        time: audio?.currentTime ?? 0,
        cutoff: watch.filters.at(-1)?.frequency.value ?? null,
        gain: watch.gains.at(-1)?.gain.value ?? null,
      };
    });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(wav);
  await expect(page.getByTestId('song-title')).toHaveText('e2e-preview', { timeout: 30_000 });
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await expect.poll(async () => (await state()).playing, { timeout: 15_000 }).toBe(true);
  const select = await state();
  expect(select.cutoff).toBeNull(); // on the song select it plays as it is

  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await expect.poll(async () => (await state()).cutoff ?? Infinity, { timeout: 5_000 }).toBeLessThan(1000);
  await expect.poll(async () => (await state()).gain ?? 1, { timeout: 5_000 }).toBeLessThan(0.75);
  const settings = await state();
  expect(settings.previews).toBe(select.previews); // the same preview, not a new one
  expect(settings.playing).toBe(true);
  expect(settings.time).toBeGreaterThan(select.time);

  await page.getByRole('button', { name: /완료/ }).click();
  await expect(page.getByTestId('song-title')).toHaveText('e2e-preview');
  await expect.poll(async () => (await state()).cutoff ?? 0, { timeout: 5_000 }).toBeGreaterThan(15_000);
  await expect.poll(async () => (await state()).gain ?? 0, { timeout: 5_000 }).toBeGreaterThan(0.98);
  await page.waitForTimeout(1000); // the song select has its list back by now
  const back = await state();
  expect(back.previews).toBe(select.previews); // it went on where it was
  expect(back.playing).toBe(true);
  expect(back.time).toBeGreaterThan(settings.time);

  // a play stops it
  await autoplay(page);
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('play-screen')).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await state()).playing, { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});
