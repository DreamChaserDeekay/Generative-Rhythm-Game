import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { autoplay, chooseSetting, settingsTab, tool } from './songSelect';

const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');

// A synthesised song after 14 s of silence: its chart starts late (no copyrighted material).
const LONG_INTRO = `
import sys, wave
src = wave.open(sys.argv[1]); p = src.getparams(); frames = src.readframes(p.nframes); src.close()
out = wave.open(sys.argv[2], 'wb'); out.setparams(p)
out.writeframes(b'\\x00' * (p.sampwidth * p.nchannels * p.framerate * 14) + frames); out.close()
`;

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);
const opacity = (page: Page, testId: string) => page.getByTestId(testId).evaluate((el) => getComputedStyle(el).opacity);

test('the play HUD: how the play runs, the time left, SPEED and covers named once under the judge line, the pause menu on ↑↓, a retry from nothing', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', hiSpeed: 4, judgementMode: 'HARD', judgeCounter: true, pacemaker: '95' }));
  });
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  // autoplay and a judgement that is not NORMAL are named under the song; nothing else
  await expect(page.locator('.hud-chip')).toHaveText(['AUTO', 'HARD JUDGEMENT'], { timeout: 30_000 });
  await expect(page.getByTestId('hud-remaining')).toHaveText(/^0:\d\d$/);
  await expect(page.getByTestId('hud-speed')).toHaveText('4.00');
  // the counts under the panel, and the pacemaker in the panel's own score
  await expect(page.getByTestId('hud-misses')).toHaveText('0');
  await expect(page.getByTestId('hud-fast-slow')).toHaveText('0 · 0');
  // the timing error bar is off unless chosen
  await expect(page.getByTestId('hud-error-bar')).toHaveCount(0);
  await expect.poll(async () => Number((await page.locator('.hud-combo-num').textContent()) || 0), { timeout: 20_000 }).toBeGreaterThan(4);
  await expect(page.getByTestId('hud-pace')).toHaveText(/^\+/);
  // the gauge reads whole percents
  await expect(page.locator('.hud-gauge-num')).toHaveText(/^\d+%$/);

  // SPEED once, two decimals; a cover one decimal; both under the judge line, off the notes and the combo
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('hud-toast')).toHaveText('SPEED 4.10');
  expect((await stored(page)).hiSpeed).toBe(4.1);
  const [toast, combo] = [await page.getByTestId('hud-toast').boundingBox(), await page.locator('.hud-combo').boundingBox()];
  expect(toast && toast.y > 720 * 0.78).toBe(true);
  expect(toast && combo && toast.y > combo.y + combo.height).toBe(true);
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('hud-toast')).toHaveText('SUDDEN+ 2.5%');

  // paused, ↑↓ move through the menu and leave SPEED alone; Enter resumes, READY over the rewind
  await page.keyboard.press('Escape');
  const menu = page.getByTestId('pause-menu');
  await expect(menu.getByRole('button', { name: /계속하기/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button', { name: /다시 하기/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button', { name: /나가기/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('button', { name: /계속하기/ })).toBeFocused();
  await page.keyboard.press('PageUp');
  await page.keyboard.press('Home');
  expect(await stored(page)).toMatchObject({ hiSpeed: 4.1, sudden: 0.025, coversOn: true });
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('hud-ready')).toHaveText('READY');
  await expect(page.getByTestId('hud-ready')).toHaveText('', { timeout: 5000 });

  // a retry starts from nothing: no combo or judgement of the run before
  await expect.poll(async () => Number((await page.locator('.hud-combo-num').textContent()) || 0), { timeout: 20_000 }).toBeGreaterThan(4);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('F2');
  await expect(page.locator('.hud-combo-num')).toHaveText('');
  await expect(page.locator('.hud-max-combo')).toHaveText('0');
  expect(await page.getByTestId('hud-toast').evaluate((el) => (el as HTMLElement).style.opacity)).toBe('0');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});

/**
 * The score panel's labels and numbers as tall as they show on the screen (font size times the
 * screen px each line box takes per layout px: the camera's foreshortening included), and the
 * screen boxes of its lines and of the time left over it.
 */
const panelOnScreen = (page: Page) =>
  page.locator('.hud').evaluate((hud) => {
    const panel = hud.querySelector('.hud-panel') as HTMLElement;
    const tall = (sel: string) =>
      [...panel.querySelectorAll(sel)].map((el) => (parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().height) / (el as HTMLElement).offsetHeight);
    const lines = panel.classList.contains('upright') ? [panel] : panel.classList.contains('stacked') ? [...panel.querySelectorAll('.hud-row > *')] : [...panel.querySelectorAll('.hud-row')];
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, right: r.right, bottom: r.bottom };
    };
    return { cls: panel.className, labels: tall('.hud-label'), numbers: tall('.hud-num'), lines: lines.map(box), time: box(hud.querySelector('.hud-progress-time') as Element) };
  });

type Box = { x: number; y: number; right: number; bottom: number };
const apart = (a: Box, b: Box) => a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y;

async function readablePanel(page: Page, settings: Record<string, unknown>, layout: RegExp) {
  const errors = trackErrors(page);
  await page.addInitScript((s) => localStorage.setItem('grg.settings.v1', JSON.stringify(s)), { judgeCounter: true, ...settings });
  await page.goto('/');
  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('hud-panel')).toHaveClass(layout, { timeout: 30_000 });
  await expect(page.getByTestId('hud-misses')).toHaveText('0');
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  const on = await panelOnScreen(page);
  // every label at least 12 px tall where it lies (the farthest too), every number at least 18
  expect(Math.min(...on.labels)).toBeGreaterThan(11.5);
  expect(Math.min(...on.numbers)).toBeGreaterThan(17.5);
  // on the screen, and the time left clear of every line
  for (const line of on.lines) {
    expect(line.x >= 0 && line.right <= size.width && line.y >= 0 && line.bottom <= size.height).toBe(true);
    expect(apart(line, on.time)).toBe(true);
  }
  expect(errors).toEqual([]);
}

test('the score panel reads at 12 px or more on the default camera, its farthest row too, with the counts and the pacemaker', async ({ page }) => {
  await readablePanel(page, { lastKeyMode: '6K', pacemaker: '95' }, /^hud-panel$/);
});

test('a narrow screen: the score panel stays on the screen and readable, each label over its number', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await readablePanel(page, { lastKeyMode: '8K', cameraPreset: 'LOW', skin: 'neon', pacemaker: '98' }, /stacked/);
});

test('a high LIFT: no room over the gear, so the score panel stands upright at the lower left, clear of the time left', async ({ page }) => {
  await readablePanel(page, { lastKeyMode: '7K+1S', lift: 0.3, coversOn: true, pacemaker: '95' }, /upright/);
  const panel = await page.getByTestId('hud-panel').boundingBox();
  expect(panel && panel.x < 100 && panel.y + panel.height > 720 - 100).toBe(true);
});

test('a long intro is skipped with Enter (again after a retry while READY shows), the rules that are not the defaults show while it loads, and judging is unchanged', async ({ page }) => {
  const errors = trackErrors(page);
  mkdirSync('test-results', { recursive: true });
  const body = 'test-results/e2e-intro-body.wav';
  const wav = 'test-results/e2e-long-intro.wav';
  execFileSync(python, ['-m', 'rhythm_server', 'synth', '-o', body, '--bpm', '140', '--bars', '8', '--seed', '6'], { env: { ...process.env, PYTHONPATH: '../server' } });
  execFileSync(python, ['-c', LONG_INTRO, body, wav]);
  await page.addInitScript(() => {
    localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', placement: 'MIRROR', gaugeType: 'HARD', judgementMode: 'MAX', ruleset: 'EXSCORE', pacemaker: 'BEST' }));
  });
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(wav);
  await expect(page.getByTestId('song-title')).toHaveText('e2e-long-intro', { timeout: 30_000 });
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 90_000 });
  await autoplay(page);
  await page.keyboard.press('Escape');

  // the audio comes late: the loading card stays, naming the play's rules
  await page.route('**/api/songs/*/audio', async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });
  await page.getByTestId('play-button').click();
  await expect(page.getByTestId('loading-rules')).toHaveText(/MAX JUDGEMENT.*배치\s*미러.*점수 규칙\s*EX-SCORE.*게이지\s*HARD/, { timeout: 60_000 });
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 60_000 });

  // the first note is about 14 s away: Enter skips to a moment before it (READY then)
  await expect.poll(() => opacity(page, 'hud-skip'), { timeout: 10_000 }).toBe('1');
  const left = (await page.getByTestId('hud-remaining').textContent()) ?? '';
  await page.keyboard.press('Enter');
  await expect.poll(() => opacity(page, 'hud-skip')).toBe('0');
  const seconds = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
  await expect.poll(async () => seconds(left) - seconds((await page.getByTestId('hud-remaining').textContent()) ?? '')).toBeGreaterThan(8);
  await expect(page.getByTestId('hud-ready')).toHaveText('READY', { timeout: 5000 });
  // no best yet to follow: the pacemaker's row says so with a dash instead of going missing
  await expect(page.locator('.hud-pace-label')).toHaveText('vs BEST');
  await expect(page.getByTestId('hud-pace')).toHaveText('—');

  // a retry while READY shows starts the intro over: no READY of the run before over its skip hint
  await page.keyboard.press('F2');
  await expect.poll(() => opacity(page, 'hud-skip'), { timeout: 5000 }).toBe('1');
  await expect(page.getByTestId('hud-ready')).toHaveText('');
  expect(await page.getByTestId('hud-ready').evaluate((el) => (el as HTMLElement).style.opacity)).toBe('0');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('hud-ready')).toHaveText('READY', { timeout: 5000 });
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('result-lamp')).toHaveAttribute('data-lamp', 'PERFECT PLAY');
  expect(errors).toEqual([]);
});

test('the settings: judgement and combo opacity, the judge counter, and pacemaker targets by score rule', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'gear');
  await chooseSetting(page, 'opt-judge-opacity', '0.4');
  await expect(page.getByTestId('opt-judge-opacity')).toContainText('40%');
  await settingsTab(page, 'judge');
  await chooseSetting(page, 'opt-judge-counter', 'true');
  // the targets follow the score rule: grades under EX-SCORE, shares of the score otherwise
  await settingsTab(page, 'play');
  await chooseSetting(page, 'opt-pacemaker', '98');
  await chooseSetting(page, 'opt-ruleset', 'EXSCORE');
  await expect(page.getByTestId('opt-pacemaker')).toContainText('98%');
  const seen: string[] = [];
  const pacemaker = page.getByTestId('opt-pacemaker');
  await pacemaker.focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
    seen.push((await pacemaker.getAttribute('data-value')) ?? '');
  }
  // from a share of the other rule the row steps into the grades and keeps to them
  expect(seen).toEqual(['OFF', 'BEST', 'A', 'AA', 'AAA', 'MAX']);
  await page.keyboard.press('ArrowLeft');
  expect(await stored(page)).toMatchObject({ judgementOpacity: 0.4, judgeCounter: true, ruleset: 'EXSCORE', pacemaker: 'AAA' });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();

  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.getByTestId('hud-misses')).toHaveText('0', { timeout: 30_000 });
  await expect(page.locator('.hud-pace-label')).toHaveText('vs AAA');
  await expect(page.locator('.hud-combo')).toHaveCSS('opacity', '0.4');
  await expect.poll(async () => Number((await page.locator('.hud-combo-num').textContent()) || 0), { timeout: 20_000 }).toBeGreaterThan(2);
  // autoplay is perfect: ahead of an AAA pace by the EX it is over 8/9 of the most
  await expect(page.getByTestId('hud-pace')).toHaveText(/^\+\d/);
  expect(errors).toEqual([]);
});

test('the timing error bar: on from 판정·싱크, under the judgement, as wide as the judgement mode’s widest window, the last 20 hits and their mean', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', judgementMode: 'HARD' })));
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'judge');
  await chooseSetting(page, 'opt-error-bar', 'true');
  expect(await stored(page)).toMatchObject({ errorBar: true });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();

  await tool(page, 'sync-auto');
  await expect(page.getByTestId('play-screen')).toBeVisible();
  const bar = page.getByTestId('hud-error-bar');
  // HARD JUDGEMENT: the widest window (MAX 1%) is 90 ms each way
  await expect(bar).toHaveAttribute('data-outer-ms', '90', { timeout: 30_000 });
  // a tick per hit, no more than the last 20 at once; autoplay hits on time, so their mean is in the middle
  const shown = () => bar.locator('.hud-eb-tick').evaluateAll((ticks) => ticks.filter((t) => getComputedStyle(t).opacity !== '0').length);
  await expect.poll(shown, { timeout: 20_000 }).toBe(20);
  await expect(bar.locator('.hud-eb-tick')).toHaveCount(20);
  await expect(bar).toHaveAttribute('data-mean-ms', '0');
  // on the track under the judgement (its FAST / SLOW and ms too), centred with it
  const [judge, box] = [await page.locator('.hud-judge').boundingBox(), await bar.boundingBox()];
  expect(judge && box && box.y >= judge.y + judge.height - 1).toBe(true);
  expect(judge && box && Math.abs(box.x + box.width / 2 - (judge.x + judge.width / 2)) < 4).toBe(true);

  // a retry starts with no ticks
  await page.keyboard.press('F2');
  expect(await shown()).toBe(0);
  expect(await bar.getAttribute('data-mean-ms')).toBeNull();
  expect(errors).toEqual([]);
});
