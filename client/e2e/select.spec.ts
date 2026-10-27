import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { addFromMenu, autoplay, fakeSongs, playOptions, songInfo } from './songSelect';

const venvPython = process.platform === 'win32' ? '../server/.venv/Scripts/python.exe' : '../server/.venv/bin/python';
const python = process.env.GRG_PYTHON ?? (existsSync(venvPython) ? venvPython : 'python');
/** A 1×1 PNG: a cover, a chart package's stage picture. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);

/** A demo song made once (shared by the tests that want one), ready; its id. */
async function readyDemo(page: Page, bpm: number): Promise<string> {
  const find = async () => ((await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string; status: string }[]).find((s) => s.title === `Demo Groove ${bpm}`);
  if (!(await find())) expect((await page.request.post('/api/songs/demo', { data: { bpm, bars: 8, seed: 5 } })).ok()).toBe(true);
  await expect.poll(async () => (await find())?.status, { timeout: 90_000 }).toBe('ready');
  return (await find())!.id;
}

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const isChartPost = (method: string, url: string) => method === 'POST' && new URL(url).pathname.endsWith('/charts');

test('the song list keeps the cursor in view and in focus; Shift+Tab steps back; the rows of the play options keep their arrows', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(16);
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  const rows = page.getByTestId('song-item');
  await expect(rows).toHaveCount(16);
  const list = page.getByTestId('song-list');

  // a clicked row passes its focus on with the cursor, and the cursor never leaves the list's view
  await rows.first().click();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 16');
  const active = page.locator('.song-item.active');
  await expect(active).toHaveCount(1);
  const [box, view] = [await active.boundingBox(), await list.boundingBox()];
  expect(box && view && box.y >= view.y - 1 && box.y + box.height <= view.y + view.height + 1).toBe(true);
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.songId)).toBe(songs[15].id);

  // Tab steps the key mode forward, Shift+Tab back (from 4K to the last mode)
  const modes = page.locator('.key-modes button');
  await page.keyboard.press('Shift+Tab');
  await expect(modes.last()).toHaveClass(/active/);
  await page.keyboard.press('Tab');
  await expect(modes.first()).toHaveClass(/active/);

  // the play rules: ←→ change a row and ↑↓ go through the rows, not the songs
  await playOptions(page, 'rules');
  const gauge = page.getByTestId('rule-gauge');
  await gauge.focus();
  const before = await gauge.getAttribute('data-value');
  await page.keyboard.press('ArrowRight');
  await expect(gauge).not.toHaveAttribute('data-value', before ?? '');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('rule-fever')).toBeFocused();
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 16');

  // the speed and gear rows likewise
  await playOptions(page, 'gear');
  const speed = page.getByTestId('quick-speed');
  await speed.focus();
  const speedBefore = Number(await speed.getAttribute('data-value'));
  await page.keyboard.press('ArrowRight');
  await expect(speed).toHaveAttribute('data-value', String(Math.round((speedBefore + 0.1) * 10) / 10));
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('quick-sudden')).toBeFocused();
  const skin = page.getByTestId('quick-skin');
  const camera = await page.getByTestId('quick-camera').getAttribute('data-value');
  await skin.focus();
  // a skin is the track's colours: the notes and the gear are picked in the settings
  await expect(page.getByTestId('play-options-help')).toContainText('노트·기어는 설정 → 기어');
  const skinBefore = (await skin.getAttribute('data-value')) ?? '';
  await page.keyboard.press('ArrowRight');
  await expect(skin).not.toHaveAttribute('data-value', skinBefore);
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 16');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  expect(stored.skin).toBe(await skin.getAttribute('data-value'));
  // a skin keeps the camera
  expect(stored.cameraPreset).toBe(camera);
  expect(errors).toEqual([]);
});

test('Space and I open their panel: ↑↓ lines (the tabs above the first row), ←→ values from the chosen one, Q / E tabs, Home / End, Enter presses only a button, Esc gives the focus back to the list', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(8);
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  // the third style chosen: the arrows step from it, not from the first
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', generation: { style: 'chord' } })));
  await page.goto('/');
  await expect(page.getByTestId('song-item')).toHaveCount(8);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}'));
  const hints = page.locator('.hintbar');
  const enter = page.getByTestId('hint-enter');
  await expect(hints).toContainText('PgUp');
  await expect(hints).toContainText('랜덤');

  // the rules, in the order they are changed most, the first one focused
  await page.keyboard.press('Space');
  const placement = page.getByTestId('rule-placement');
  await expect(placement).toBeFocused();
  await expect(page.getByTestId('play-rules').locator('.opt-name')).toHaveText(['배치', '게이지', 'FEVER', '페이스메이커', '판정', '점수 규칙']);
  await expect(hints).toContainText('항목');
  await expect(hints).toContainText('탭');
  await page.keyboard.press('ArrowRight');
  await expect(placement).not.toHaveAttribute('data-value', 'OFF');
  // ↓ to 판정: HARD, which the song select shows beside the difficulty basis
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('rule-judgement')).toBeFocused();
  await expect(page.getByTestId('play-options-help')).toContainText('판정 범위');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('rule-judgement')).toHaveAttribute('data-value', 'HARD');
  expect((await stored()).judgementMode).toBe('HARD');
  await expect(page.getByTestId('chip-judgement')).toHaveText('HARD JUDGEMENT');
  // on to autoplay (a switch: ←→ flip it), the songs stay put
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('autoplay-toggle')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('autoplay-toggle')).toBeChecked();
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');
  // the plates fold to a line while the panel is open (named in full all the same)
  await expect(page.locator('.difficulty.folded')).toHaveCount(await page.locator('.difficulty').count());
  await expect(page.getByTestId('difficulty-row').getByRole('button', { name: /^NORMAL/ })).toHaveClass(/folded/);

  // End and Home: the last and the first line, the song stays; F2 waits while the panel has the keys
  await page.keyboard.press('End');
  await expect(page.getByTestId('practice-toggle')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(placement).toBeFocused();
  await page.keyboard.press('F2');
  await page.waitForTimeout(200);
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');

  // E: the next tab, on its first row; once more the generation options, on the chosen style
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('toggle-gear')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('quick-speed')).toBeFocused();
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('style-chord')).toBeFocused();
  // Enter there plays, as on an option row (these songs cannot: nothing happens), and picks nothing
  await expect(enter).toContainText('플레이');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect((await stored()).generation.style).toBe('chord');
  // → picks the neighbour of the chosen style
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('style-jack')).toBeFocused();
  await expect(page.getByTestId('style-jack')).toHaveClass(/active/);
  expect((await stored()).generation.style).toBe('jack');
  // ↓ lands on the next choice's chosen one
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('generation-options').locator('.segmented').nth(1).locator('button.active')).toBeFocused();
  // ↑ above the first row: the tabs, where ←→ change the tab and the focus stays; ↓ its first row
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('toggle-generation')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('toggle-gear')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('toggle-gear')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('quick-speed')).toBeFocused();
  // Q: back on the rules
  await page.keyboard.press('KeyQ');
  await expect(placement).toBeFocused();

  // Esc closes it and the song under the cursor has the focus again
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play-options')).toHaveCount(0);
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.songId)).toBe(songs[0].id);
  await expect(page.locator('.difficulty.folded')).toHaveCount(0);

  // I: the song info with the focus on none of its controls (Enter does not press one); ↓ goes to
  // its first line (the failed analysis's 다시 분석, then the song offset: the tempo's are off),
  // ←→ along a line of buttons, and Enter presses one, as the hint then says
  await page.keyboard.press('KeyI');
  await expect(page.getByTestId('song-info').locator('.select-panel-body')).toBeFocused();
  await expect(enter).toContainText('플레이');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('song-offset')).toHaveText('0ms');
  const reanalyze = page.getByTestId('song-info').getByTestId('reanalyze');
  await page.keyboard.press('ArrowDown');
  await expect(reanalyze).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-offset-minus5')).toBeFocused();
  await expect(enter).toContainText('누르기');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('song-offset-minus1')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('song-offset')).toHaveText('-1ms');
  await page.keyboard.press('End');
  await expect(page.getByTestId('sync-auto')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(reanalyze).toBeFocused();
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-info')).toHaveCount(0);
  await expect(enter).toContainText('플레이');
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.songId)).toBe(songs[0].id);
  expect(errors).toEqual([]);
});

test('generation options that make another chart show beside the rules, named in their tab, until 생성 옵션 초기화', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs: fakeSongs(2) } }));
  // (a scratch rate makes no other 4K chart: there only the density and the chord size count)
  await page.addInitScript(() =>
    localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', generation: { density: 1.2, maxChord: 3, specialRate: 0.1 } })),
  );
  await page.goto('/');
  const chip = page.getByTestId('chip-generation');
  await expect(chip).toHaveText('생성 옵션 변경');
  await expect(chip).toHaveAttribute('title', '밀도 · 최대 동시 노트');
  await page.getByRole('button', { name: '7K+1S', exact: true }).click();
  await expect(chip).toHaveAttribute('title', '밀도 · 최대 동시 노트 · 스크래치 비율');
  // the tab names two of them and how many more
  await playOptions(page);
  const tab = page.getByTestId('toggle-generation');
  await expect(tab).toHaveText('생성 옵션 · 밀도 · 최대 동시 노트 외 1개');
  await tab.click();
  await page.getByRole('button', { name: '생성 옵션 초기화' }).click();
  await expect(tab).toHaveText('생성 옵션');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play-options')).toHaveCount(0);
  await expect(chip).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the song info of a song that plays: I then Enter plays it, and never presses BPM ×2', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(3, 'ready').map((s) => ({ ...s, bpm: 128, bpmMin: 128, bpmMax: 128 }));
  const sent: string[] = [];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => url.pathname.startsWith('/api/songs/'),
    (route) => {
      const { pathname } = new URL(route.request().url());
      if (route.request().method() !== 'GET') sent.push(`${route.request().method()} ${pathname.split('/').slice(4).join('/')}`);
      if (pathname.endsWith('/charts') && route.request().method() === 'GET') return route.fulfill({ json: { charts: [] } });
      return route.fulfill({ status: 500, json: { detail: 'e2e' } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');
  // the song select asks for its charts by itself, one per tier (the route refuses them: no level, no message)
  await expect.poll(() => sent.length).toBe(4);
  await expect(page.getByTestId('select-error')).toHaveCount(0);
  await page.keyboard.press('KeyI');
  await expect(page.getByTestId('song-info')).toBeVisible();
  await page.keyboard.press('Enter');
  // the play asks for its chart again (and says why it cannot be made); no song setting was sent
  await expect.poll(() => sent.length).toBe(5);
  await expect(page.getByTestId('select-error')).toContainText('e2e');
  // the first line is the tempo's ×2: ↓ goes there, and the hint says what Enter does now
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-info').getByRole('button', { name: '×2' })).toBeFocused();
  await expect(page.getByTestId('hint-enter')).toContainText('누르기');
  expect(new Set(sent)).toEqual(new Set(['POST charts']));
  expect(errors).toEqual([]);
});

test('오토 플레이 from the song select: Shift+Enter or its button plays this once on autoplay, the play options\' switch left off', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await readyDemo(page, 139);
  await page.evaluate(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.reload();
  await page.getByTestId('song-item').filter({ hasText: 'Demo Groove 139' }).click();
  const auto = page.getByTestId('autoplay-button');
  await expect(auto).toContainText('Shift+Enter');
  await expect(auto).toBeEnabled();
  await expect(page.getByTestId('hint-autoplay')).toContainText('오토 플레이');
  await expect(page.getByTestId('play-button')).toHaveText(/^플레이/);

  // Shift+Enter: this play on autoplay
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByTestId('play-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.hud-chip').first()).toHaveText('AUTO', { timeout: 30_000 });
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 139');
  // the switch was not turned on: Enter still plays by hand
  await playOptions(page, 'rules');
  await expect(page.getByTestId('autoplay-toggle')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('play-options')).toHaveCount(0);

  // the button does the same
  await auto.click();
  await expect(page.getByTestId('play-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.hud-chip').first()).toHaveText('AUTO', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('a search or a folder that leaves the song out puts the cursor on what it shows, with nothing shown nothing plays; / and Ctrl+F go to the search', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(12, 'ready');
  const posts: string[] = [];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      posts.push(new URL(route.request().url()).pathname.split('/')[3]);
      return route.fulfill({ status: 500, json: { detail: 'e2e' } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  await expect(page.getByTestId('song-item')).toHaveCount(12);
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');
  const search = page.getByTestId('song-search');
  const focusedSong = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.songId);

  // / goes to the search: what it leaves out moves the cursor onto the first song it shows
  await page.keyboard.press('Slash');
  await expect(search).toBeFocused();
  await page.keyboard.type('Song 1');
  await expect(page.getByTestId('song-item')).toHaveCount(3);
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 10');
  // ↓ in the search moves the cursor; Enter leaves the search on that song (nothing plays: no
  // play asks for its chart and says it cannot be made) and the next Enter plays it
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 11');
  await expect(search).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await focusedSong()).toBe(songs[10].id);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('select-error')).toHaveCount(0);
  // (the song select asks for the charts of the song it rests on by itself, quietly: one per tier)
  await expect.poll(() => posts.filter((id) => id === songs[10].id).length).toBe(4);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('select-error')).toContainText('e2e');
  await expect.poll(() => posts.filter((id) => id === songs[10].id).length).toBe(5);
  const asked = posts.length;

  // Ctrl+F: back in the search; with nothing found nothing is selected, and Esc leaves the search keeping the words
  await page.keyboard.press('Control+KeyF');
  await expect(search).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type('x');
  await expect(page.getByTestId('song-item')).toHaveCount(0);
  await expect(page.getByTestId('play-button')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(search).not.toBeFocused();
  await expect(search).toHaveValue('Song 1x');
  // the hints name the folder key and what needs no song: no song, difficulty, random or Enter to play
  const hintbar = page.locator('.hintbar');
  await expect(page.getByTestId('hint-folder')).toBeVisible();
  await expect(page.getByTestId('hint-enter')).toHaveCount(0);
  await expect(page.getByTestId('hint-random')).toHaveCount(0);
  await expect(hintbar).not.toContainText('난이도');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(asked);
  await expect(page.getByTestId('select-error')).toHaveCount(0);

  // a folder with no song in it: the same (the song shown again for a moment may ask for its charts
  // again, as a visit does after a failure: what it asked is let land before counting)
  await search.fill('');
  await page.getByTestId('folder-favorites').click();
  await expect(page.getByTestId('song-item')).toHaveCount(0);
  await expect(page.getByTestId('play-button')).toHaveCount(0);
  await expect(page.getByTestId('hint-folder')).toBeVisible();
  await expect(page.getByTestId('hint-enter')).toHaveCount(0);
  await page.waitForTimeout(500);
  const before = posts.length;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(before);
  await expect(page.getByTestId('select-error')).toHaveCount(0);
  // a favourite (F3) shows there, under the cursor
  await page.getByTestId('folder-all').click();
  await page.getByTestId('song-item').nth(4).click();
  await page.keyboard.press('F3');
  await expect(page.getByTestId('favorite-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('folder-favorites').click();
  await expect(page.getByTestId('song-item')).toHaveCount(1);
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 05');

  // a song added where the folder and the search would hide it: they give way, and it is selected
  const demo = { ...songs[0], id: 'd'.repeat(16), title: 'Demo Groove 128', createdAt: 99 };
  await page.route(
    (url) => url.pathname === '/api/songs/demo',
    (route) => {
      songs.push(demo);
      return route.fulfill({ status: 201, json: { song: demo } });
    },
  );
  await search.fill('Song 05');
  await addFromMenu(page, 'demo-button');
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 128');
  await expect(page.getByTestId('folder-all')).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('');
  await expect(page.locator('.song-item.active')).toContainText('Demo Groove 128');
  expect(errors).toEqual([]);
});

test('the list: page keys, Home / End, ↑↓ wrap on a fresh press, F2 a random song, F4 the record orders, Shift or F6 the folder', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(40);
  // two songs with a NORMAL record on 4K: the level order puts them first, the lowest first
  const record = { songId: '', keyMode: '4K', difficulty: 'NORMAL', seed: 1, score: 900_000, rate: 90, maxCombo: 50, lamp: 'CLEAR', plays: 1 };
  songs[29].records = [{ ...record, chartId: 'c' + '1'.repeat(20), songId: songs[29].id, level: 7 }];
  songs[34].records = [{ ...record, chartId: 'c' + '2'.repeat(20), songId: songs[34].id, level: 3 }];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'NORMAL' })));
  await page.goto('/');
  const rows = page.getByTestId('song-item');
  await expect(rows).toHaveCount(40);
  const title = page.getByTestId('song-title');
  const number = async () => Number(((await title.textContent()) ?? '').replace(/\D/g, ''));
  await rows.first().click();

  // ↑ on the first song wraps to the last, ↓ back; held, the cursor stops at the end
  await page.keyboard.press('ArrowUp');
  await expect(title).toHaveText('Fake Song 40');
  await page.keyboard.press('ArrowDown');
  await expect(title).toHaveText('Fake Song 01');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(title).toHaveText('Fake Song 39');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.down('ArrowDown');
  await page.keyboard.up('ArrowDown');
  await expect(title).toHaveText('Fake Song 40');
  await page.keyboard.press('Home');
  await expect(title).toHaveText('Fake Song 01');

  // a page down moves by the rows in view, and the cursor sits in the middle of the list
  await page.keyboard.press('PageDown');
  const paged = await number();
  expect(paged).toBeGreaterThan(4);
  await page.keyboard.press('PageDown');
  expect(await number()).toBe(Math.min(40, 2 * paged - 1));
  const [box, view] = [await page.locator('.song-item.active').boundingBox(), await page.getByTestId('song-list').boundingBox()];
  expect(box && view && Math.abs(box.y + box.height / 2 - (view.y + view.height / 2)) < box.height).toBe(true);
  await page.keyboard.press('PageUp');
  await expect(title).toHaveText(`Fake Song ${String(paged).padStart(2, '0')}`);

  // F2: another song of the list
  for (let i = 0; i < 3; i++) {
    const before = await number();
    await page.keyboard.press('F2');
    await expect.poll(number).not.toBe(before);
  }

  // F4 through the orders: by level, the songs with a record on the selected difficulty first
  const sort = page.getByTestId('song-sort');
  for (const label of ['제목순', '아티스트순', 'BPM순', '레벨순']) {
    await page.keyboard.press('F4');
    await expect(sort).toContainText(label);
  }
  await expect(rows.nth(0)).toContainText('Fake Song 35');
  await expect(rows.nth(1)).toContainText('Fake Song 30');
  for (const label of ['램프순', 'RATE순', '최근 플레이순', '추가순']) {
    await page.keyboard.press('F4');
    await expect(sort).toContainText(label);
  }

  // Shift alone changes the folder on 4K, never on 7K+1S (its scratch), where F6 does
  await expect(page.getByTestId('hint-folder')).toContainText('Shift');
  await page.keyboard.press('Shift');
  await expect(page.getByTestId('folder-favorites')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('F6');
  await expect(page.getByTestId('folder-unplayed')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '7K+1S', exact: true }).click();
  await expect(page.getByTestId('hint-folder')).toContainText('F6');
  await page.keyboard.press('Shift');
  await page.waitForTimeout(200);
  await expect(page.getByTestId('folder-unplayed')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('F6');
  await expect(page.getByTestId('folder-uncleared')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('F6');
  await expect(page.getByTestId('folder-noFullCombo')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('a chart never lands on another song, Enter starts one play, and a new analysis drops the old chart', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  for (const bpm of [133, 137]) expect((await page.request.post('/api/songs/demo', { data: { bpm, bars: 8, seed: 5 } })).ok()).toBe(true);
  await expect
    .poll(async () => {
      const list = (await (await page.request.get('/api/songs')).json()).songs as { title: string; status: string }[];
      return list.filter((s) => /^Demo Groove 13[37]$/.test(s.title) && s.status === 'ready').length;
    }, { timeout: 90_000 })
    .toBe(2);
  await page.evaluate(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'NORMAL' })));
  await page.reload();
  const row = (bpm: number) => page.getByTestId('song-item').filter({ hasText: `Demo Groove ${bpm}` });
  const level = page.getByTestId('chart-level');

  // the chart asked for on one song arrives after the cursor moved to the next: it stays that
  // song's, and the next one gets its own (the generation is held back)
  const charts = new Map<string, string>();
  page.on('response', async (r) => {
    if (!isChartPost(r.request().method(), r.url()) || !r.ok()) return;
    const body = await r.json().catch(() => null);
    const meta = body?.chart?.meta ?? body?.meta;
    if (meta && !JSON.parse(r.request().postData() ?? '{}').brief) charts.set(meta.chartId, meta.songId);
  });
  // (held back while `late`; the charts asked for meanwhile are let through after their time)
  let late = true;
  await page.route('**/api/songs/*/charts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    if (late) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const first = page.waitForRequest((r) => isChartPost(r.method(), r.url()));
  await row(133).click();
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 133');
  await first;
  await row(137).click();
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 137');
  await expect(page.locator('.level-pending').first()).toBeVisible();
  // while a plate's chart is worked out its record is not known either (the last comes last)
  await expect(page.locator('.difficulty').last().locator('.diff-record')).toHaveText('–');
  await expect(level).toBeVisible({ timeout: 30_000 });
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  const id137 = songs.find((s) => s.title === 'Demo Groove 137')?.id;
  await expect.poll(async () => charts.get((await level.getAttribute('data-chart-id')) ?? '')).toBe(id137);
  late = false;

  // Enter held down on the focused autoplay box while the chart (of other options) is still being
  // made: one request for it, one play
  let posts = 0;
  page.on('request', (r) => {
    if (isChartPost(r.method(), r.url()) && !JSON.parse(r.postData() ?? '{}').brief) posts++;
  });
  await playOptions(page, 'generation');
  await page.getByTestId('style-stream').click();
  await autoplay(page);
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page.getByTestId('play-screen')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  expect(posts).toBe(1);
  // Esc pauses once the play has loaded (while it loads, Esc leaves it)
  await expect(page.getByTestId('play-loading')).toHaveCount(0, { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-menu')).toBeVisible();
  await page.keyboard.press('KeyQ');

  // a BPM fix analyses the song again: the chart made on the old analysis is gone, Enter does not
  // play while the analysis runs, and the new analysis's chart comes by itself
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 137');
  await expect(level).toBeVisible({ timeout: 30_000 });
  const old = await level.getAttribute('data-chart-id');
  await songInfo(page);
  await page.locator('.song-tools').getByRole('button', { name: '×2' }).click();
  await expect(page.getByTestId('analysis-status')).toBeVisible();
  await expect(level).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('play-screen')).toHaveCount(0);
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await expect(level).toBeVisible({ timeout: 30_000 });
  expect(await level.getAttribute('data-chart-id')).not.toBe(old);
  expect(errors).toEqual([]);
});

test('a best shows on its own tier only (none of a removed EASY or DJMAX tier), and on a tall window in full under the play buttons', async ({ page }) => {
  const errors = trackErrors(page);
  const [song] = fakeSongs(1);
  const record = { chartId: 'c' + '1'.repeat(20), songId: song.id, keyMode: '4K', difficulty: 'NORMAL', level: 5, seed: 1, score: 912_000, rate: 91.2, maxCombo: 40, lamp: 'CLEAR', plays: 3, lastPlayedAt: 1_790_000_000 };
  const old = [{ ...record, chartId: 'c' + '2'.repeat(20), difficulty: 'EASY' }, { ...record, chartId: 'c' + '3'.repeat(20), difficulty: 'MX' }];
  const songs = [{ ...song, records: [record, ...old] }];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'NORMAL' })));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const plate = page.getByTestId('difficulty-row').getByRole('button', { name: /NORMAL/ });
  await expect(plate.locator('.diff-lamp')).toHaveText('91.20%');
  await expect(page.getByTestId('difficulty-row').locator('.diff-lamp')).toHaveCount(1);
  await expect(page.getByTestId('difficulty-row').getByRole('button')).toHaveText([/NORMAL/, /HARD/, /EXPERT/, /MASTER/]);
  // the range of a difficulty's levels reads as levels
  await expect(page.getByTestId('difficulty-row').getByRole('button', { name: /HARD/ })).toContainText('Lv.7–9');
  const summary = page.getByTestId('summary-record');
  await expect(summary).toContainText('CLEAR');
  await expect(summary).toContainText('912,000');
  await expect(summary).toContainText('3회');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId('chart-summary')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the song keeps its size on a tall window (the summary takes the room left), the saved charts wait under a panel, and a narrow window keeps what Enter does', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  expect((await page.request.post('/api/songs/demo', { data: { bpm: 133, bars: 8, seed: 5 } })).ok()).toBe(true);
  await expect
    .poll(async () => ((await (await page.request.get('/api/songs')).json()).songs as { title: string; status: string }[]).some((s) => s.title === 'Demo Groove 133' && s.status === 'ready'), { timeout: 90_000 })
    .toBe(true);
  // an imported chart beside it (the list only: picking it is not part of this)
  const saved = { chartId: 'c' + 'a'.repeat(20), songId: '', name: 'Imported BMS [HYPER]', kind: 'imported', keyMode: '4K', difficulty: 'HARD', level: 9, noteCount: 812, createdAt: 1, format: 'bms', sourceLevel: '10' };
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { charts: [saved] } }) : route.fallback()),
  );
  await page.evaluate(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByTestId('song-item').filter({ hasText: 'Demo Groove 133' }).click();
  await expect(page.getByTestId('saved-charts')).toBeVisible();
  await expect(page.getByTestId('saved-chart')).toContainText('원본 10 · 추정 9');
  // with the chart (made by itself) the summary has the most to show
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  const box = async (testIdOrClass: string) => {
    const b = await page.locator(testIdOrClass).first().boundingBox();
    if (!b) throw new Error(`${testIdOrClass} is not shown`);
    return b;
  };
  for (const [width, height] of [[1440, 900], [1920, 950], [1280, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    // the jacket stays above the key modes, and the summary (its numbers at least) inside the column above the status line
    await expect(page.getByTestId('chart-summary').locator('.summary-stats').first()).toBeVisible();
    const [art, modes, summary, status] = [await box('.hero-art'), await box('.mode-row'), await box('[data-testid="chart-summary"]'), await box('.select-status')];
    expect(art.y + art.height, `${width}x${height}`).toBeLessThanOrEqual(modes.y + 0.5);
    expect(summary.y + summary.height, `${width}x${height}`).toBeLessThanOrEqual(status.y + 0.5);
  }
  // 1080p has the room for all of it
  await expect(page.getByTestId('chart-summary').locator('.nps-graph')).toBeVisible();

  // under an open panel the saved charts wait, so the rules fit a 720 px window
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press('Space');
  await expect(page.getByTestId('saved-charts')).toHaveCount(0);
  const [practice, body] = [await box('[data-testid="practice-toggle"]'), await box('.select-panel-body')];
  expect(practice.y + practice.height).toBeLessThanOrEqual(body.y + body.height + 0.5);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('saved-charts')).toBeVisible();

  // 1024 px wide: the minor hints give way, and the one of Enter stays whole at the end
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByTestId('hint-random')).toBeHidden();
  const enter = await box('[data-testid="hint-enter"]');
  expect(enter.x + enter.width).toBeLessThanOrEqual(1024);
  await expect(page.getByTestId('hint-enter')).toContainText('플레이');
  expect(errors).toEqual([]);
});

test('every difficulty shows its level by itself (계산 중 until then), kept across a visit away and on the list; F5 a new pattern the plates and records follow, Shift+F5 or the records the default again', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const id = await readyDemo(page, 139);
  await page.evaluate(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'NORMAL' })));
  await page.reload();
  await page.getByTestId('song-item').filter({ hasText: 'Demo Groove 139' }).click();
  const plates = page.getByTestId('difficulty-row').getByRole('button');
  const level = page.getByTestId('chart-level');
  // no chart asked for by hand: every plate gets its level and notes
  await expect(level).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.difficulty .diff-level em')).toHaveText([/\d+ 노트/, /\d+ 노트/, /\d+ 노트/, /\d+ 노트/], { timeout: 30_000 });
  await expect(page.locator('.level-pending')).toHaveCount(0);
  const row = page.locator(`[data-song-id="${id}"] .tier-level`);
  await expect(row).toHaveText([/^\d+$/, /^\d+$/, /^\d+$/, /^\d+$/]);
  // away (the settings) and back: known at once
  await page.keyboard.press('F10');
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(level).toBeVisible();
  await expect(page.locator('.level-pending')).toHaveCount(0);

  // a play of this chart: its plate shows it (lamp, RATE, MAX COMBO)
  const chartId = (await level.getAttribute('data-chart-id')) as string;
  const play = { chartId, songId: id, score: 912_000, rate: 91.2, maxCombo: 77, lamp: 'CLEAR', judgementMode: 'NORMAL', breaks: 3 };
  expect((await page.request.post('/api/scores', { data: play })).ok()).toBe(true);
  await page.keyboard.press('F10');
  await page.keyboard.press('Escape');
  const normal = plates.filter({ hasText: 'NORMAL' });
  await expect(normal).toContainText('CLEAR');
  await expect(normal.locator('.diff-lamp')).toHaveText('91.20%');
  await expect(normal).toContainText('MAX COMBO 77');

  // F5: another pattern of NORMAL, kept for it; its plate is that chart's (no play yet, the other's best named)
  await page.keyboard.press('F5');
  await expect(page.getByTestId('default-pattern')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => level.getAttribute('data-chart-id')).not.toBe(chartId);
  await expect(normal).toContainText('새 패턴');
  await expect(normal).toContainText('기록 없음');
  await expect(normal.locator('.other-best')).toContainText('CLEAR');
  const patterns = (await stored(page)).patterns as Record<string, number>;
  expect(typeof patterns[`${id}|4K|GRG|NORMAL`]).toBe('number');
  // the song info lists the records by pattern: the default one is chosen again from there
  await songInfo(page);
  const records = page.getByTestId('record-row');
  await expect(records).toHaveCount(1);
  await expect(records.first()).toContainText('기본');
  await expect(page.getByTestId('record-list')).toContainText('지금 치는 채보는 아직 기록이 없습니다');
  await records.first().getByTestId('pick-pattern').click();
  await expect(level).toHaveAttribute('data-chart-id', chartId);
  await expect(records.first()).toContainText('지금');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('default-pattern')).toHaveCount(0);
  // and Shift+F5 after another F5
  await page.keyboard.press('F5');
  await expect(page.getByTestId('default-pattern')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Shift+F5');
  await expect(level).toHaveAttribute('data-chart-id', chartId);
  await expect(page.getByTestId('default-pattern')).toHaveCount(0);
  expect(((await stored(page)).patterns as Record<string, number>)[`${id}|4K|GRG|NORMAL`]).toBeUndefined();
  expect(errors).toEqual([]);
});

test('the list writes levels in the plain colour, each lamp a mark of its own shape (a full combo fills the cell), the difficulty ←→ picked underlined, and the colour-blind palette has lamps of its own', async ({ page }) => {
  const errors = trackErrors(page);
  // (its charts are not to be had: the list shows what its records say)
  const [song] = fakeSongs(1, 'ready');
  const record = { songId: song.id, keyMode: '4K', seed: 1, score: 900_000, rate: 90, maxCombo: 50, plays: 1, kind: 'generated' };
  const records = [
    { ...record, chartId: 'c' + '1'.repeat(20), difficulty: 'NORMAL', level: 4, lamp: 'MAX COMBO' },
    { ...record, chartId: 'c' + '2'.repeat(20), difficulty: 'HARD', level: 8, lamp: 'HARD CLEAR' },
    { ...record, chartId: 'c' + '3'.repeat(20), difficulty: 'EXPERT', level: 12, lamp: 'FAILED' },
  ];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs: [{ ...song, records }] } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.goto('/');
  const cells = page.getByTestId('song-item').locator('.tier-level');
  await expect(cells).toHaveText(['4', '8', '12', '–']);
  await expect(cells).toHaveClass([/lamp-maxcombo/, /lamp-hard/, /lamp-failed/, /lamp-none/]);
  const style = (i: number, prop: string, mark = false) =>
    cells.nth(i).evaluate((el, [p, m]) => getComputedStyle((m ? el.querySelector('.lamp-mark') : el) as Element).getPropertyValue(p as string), [prop, mark] as const);
  // the level in the text colour (--text), not the difficulty's; the lamp in its mark: double for
  // HARD, hollow for FAILED, the whole cell for MAX COMBO
  expect(await style(1, 'color')).toBe('rgb(243, 245, 249)');
  expect(await style(1, 'box-shadow', true)).not.toBe('none');
  expect(await style(2, 'background-color', true)).toBe('rgba(0, 0, 0, 0)');
  expect(await style(2, 'border-top-color', true)).toBe('rgb(255, 46, 46)');
  expect(await style(0, 'background-color')).toBe('rgb(255, 231, 163)');
  // the difficulty ←→ picked (NORMAL) is the cell set apart: bold, a line of the accent under it
  await expect(page.locator('.tier-level.active')).toHaveCount(1);
  await expect(cells.nth(0)).toHaveClass(/active/);
  expect(await style(0, 'box-shadow')).toContain('rgb(55, 226, 255)');
  expect(await style(0, 'font-weight')).toBe('700');
  expect(await style(1, 'font-weight')).toBe('600');
  await page.keyboard.press('ArrowRight');
  await expect(cells.nth(1)).toHaveClass(/active/);
  await expect(cells.nth(0)).not.toHaveClass(/active/);
  // the colour-blind palette: its own lamp colours, the same shapes
  await page.evaluate(() => document.documentElement.classList.add('palette-cb'));
  expect(await style(2, 'border-top-color', true)).toBe('rgb(213, 94, 0)');
  expect(await style(0, 'background-color')).toBe('rgb(230, 159, 0)');
  expect(await style(2, 'background-color', true)).toBe('rgba(0, 0, 0, 0)');
  expect(errors).toEqual([]);
});

test('an imported chart is an entry after the difficulties (←→, kept for the song), its picture the cover, its record its own, its file\'s level beside ours', async ({ page }) => {
  const errors = trackErrors(page);
  const dir = 'test-results/e2e-bms-cover';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync(python, ['-c', MAKE_BMS, dir]);
  // the chart names a .bmp that ships as a .png (as BMS packages do)
  writeFileSync(`${dir}/stage.png`, PNG);
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'HARD' }));
  });
  await page.goto('/');
  await page.getByTestId('import-folder-input').setInputFiles(dir);
  await expect(page.getByTestId('import-report')).toContainText('채보 1개', { timeout: 60_000 });
  await expect(page.getByTestId('song-title')).toHaveText('E2E Cover Keysound');
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  // its stage picture is the cover; on its own key mode it is chosen, after the four difficulties
  await expect(page.locator('.hero-art img')).toBeVisible();
  await expect(page.getByRole('button', { name: '7K+1S', exact: true })).toHaveClass(/active/);
  const saved = page.getByTestId('saved-chart');
  await expect(saved).toHaveCount(1);
  await expect(saved).toHaveClass(/active/);
  await expect(saved).toContainText('BMS');
  await expect(saved).toContainText('원본 6 · 추정');
  await expect(page.locator('.difficulty.active')).toHaveCount(0);
  // ← the last difficulty, → the chart again
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.difficulty.active')).toContainText('MASTER');
  await expect(saved).not.toHaveClass(/active/);
  await page.keyboard.press('ArrowRight');
  await expect(saved).toHaveClass(/active/);
  await songInfo(page);
  await expect(page.getByTestId('chart-levels')).toContainText('원본 6 · 추정');
  await page.keyboard.press('Escape');

  // a play of it counts (the list's cell after the difficulties, the folders), and the song keeps the chart chosen
  const songs = (await (await page.request.get('/api/songs')).json()).songs as { id: string; title: string }[];
  const id = songs.find((s) => s.title === 'E2E Cover Keysound')!.id;
  const chart = ((await (await page.request.get(`/api/songs/${id}/charts`)).json()).charts as { chartId: string }[])[0];
  const play = { chartId: chart.chartId, songId: id, score: 950_000, rate: 95, maxCombo: 40, lamp: 'HARD CLEAR', judgementMode: 'NORMAL', breaks: 1 };
  expect((await page.request.post('/api/scores', { data: play })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId('song-title')).toHaveText('E2E Cover Keysound');
  await expect(saved).toHaveClass(/active/);
  await expect(saved).toContainText('HARD CLEAR');
  const cell = page.locator(`[data-song-id="${id}"] .tier-level.saved`);
  await expect(cell).toHaveText('6');
  await expect(cell).toHaveClass(/lamp-hard/);
  await page.getByTestId('folder-noFullCombo').click();
  await expect(page.locator(`[data-song-id="${id}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});

/**
 * Drops files on the song list as a browser hands them over: each its own item, or (`folder`) one
 * item whose entry is the folder with the files under it. The files are made in the page; a
 * page's own DataTransfer has no entries, so the folder's is given for the drop's moment.
 */
async function drop(page: Page, files: { name: string; text: string }[], folder: string | null = null) {
  await page.evaluate(
    ([list, dir]) => {
      const made = list.map((f) => new File([f.text], f.name));
      const data = new DataTransfer();
      const proto = DataTransferItem.prototype;
      const own = proto.webkitGetAsEntry;
      if (dir === null) for (const f of made) data.items.add(f);
      else {
        data.items.add(new File([''], dir));
        const entries = made.map((f) => ({ isFile: true, isDirectory: false, name: f.name, fullPath: `/${dir}/${f.name}`, file: (ok: (file: File) => void) => ok(f) }));
        const entry = {
          isFile: false,
          isDirectory: true,
          name: dir,
          fullPath: `/${dir}`,
          createReader: () => {
            let read = false;
            return {
              readEntries: (ok: (batch: unknown[]) => void) => {
                ok(read ? [] : entries);
                read = true;
              },
            };
          },
        };
        proto.webkitGetAsEntry = () => entry as unknown as FileSystemEntry;
      }
      document.querySelector('[data-testid="song-list"]')?.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
      proto.webkitGetAsEntry = own;
    },
    [files, folder] as const,
  );
}

test('a drop takes a chart folder (its paths as the folder picker gives them), a replay file or music; anything else says what can be dropped', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(1);
  let uploads = 0;
  let imports = 0;
  await page.route(
    (url) => url.pathname === '/api/songs',
    (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { songs } });
      uploads++;
      return route.fulfill({ status: 201, json: { song: songs[0], created: false } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/import',
    (route) => {
      imports++;
      return route.fulfill({ json: { songs: [], charts: [], warnings: [] } });
    },
  );
  await page.goto('/');
  await expect(page.getByTestId('song-item')).toHaveCount(1);
  // what the page sends: each form part as it is put in (a path, or a file by its name)
  await page.evaluate(() => {
    const sent: string[] = [];
    (window as unknown as { __sent: string[] }).__sent = sent;
    const append = FormData.prototype.append as (this: FormData, ...args: unknown[]) => void;
    FormData.prototype.append = function (this: FormData, ...args: unknown[]) {
      const [name, value] = args;
      sent.push(typeof value === 'string' ? `${name}=${value}` : `${name}:${(value as File).name}`);
      append.apply(this, args);
    };
  });
  const sent = () => page.evaluate(() => (window as unknown as { __sent: string[] }).__sent);
  const error = page.getByTestId('select-error');

  // a text dragged across the page is no file: no word about it
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Fake Song 01');
    document.querySelector('[data-testid="song-list"]')?.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(200);
  await expect(error).toBeHidden();

  // a BMS folder goes to the import with every file's path inside it
  await drop(page, [{ name: 'song.bms', text: '#TITLE E2E Drop' }, { name: 'kick.wav', text: 'RIFF' }], 'E2E Drop Pack');
  await expect.poll(() => imports).toBe(1);
  expect(await sent()).toEqual(expect.arrayContaining(['paths=E2E Drop Pack/song.bms', 'paths=E2E Drop Pack/kick.wav']));
  await expect(page.getByTestId('import-report')).toContainText('채보 0개');
  // a replay file is opened as one (this one is not), not uploaded
  await drop(page, [{ name: 'play.grgreplay.json', text: '{}' }]);
  await expect(error).toHaveText('리플레이 파일이 아닙니다');
  expect(uploads).toBe(0);
  // music is uploaded
  await drop(page, [{ name: 'tune.mp3', text: 'ID3' }]);
  await expect.poll(() => uploads).toBe(1);
  expect(await sent()).toContainEqual(expect.stringMatching(/:tune\.mp3$/));
  // anything else
  await drop(page, [{ name: 'notes.txt', text: 'x' }]);
  await expect(error).toHaveText('음악 파일 · 채보 파일이나 폴더 · 리플레이 파일을 놓을 수 있습니다');
  expect(uploads + imports).toBe(2);
  expect(errors).toEqual([]);
});

test('a cover picked in the song info shows at once, and goes again', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const id = await readyDemo(page, 139);
  await page.reload();
  await page.getByTestId('song-item').filter({ hasText: 'Demo Groove 139' }).click();
  await songInfo(page);
  await expect(page.getByTestId('cover-status')).toHaveText('디스크');
  await page.getByTestId('cover-input').setInputFiles({ name: 'jacket.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId('cover-status')).toHaveText('그림');
  await expect(page.locator(`[data-song-id="${id}"] img.song-art`)).toHaveAttribute('src', new RegExp(`/api/songs/${id}/cover\\?v=\\d+`));
  await page.getByTestId('cover-remove').click();
  await expect(page.getByTestId('cover-status')).toHaveText('디스크');
  await expect(page.locator(`[data-song-id="${id}"] canvas.song-art`)).toBeVisible();
  // a file that is no picture is refused, and says so
  await page.getByTestId('cover-input').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') });
  await expect(page.getByTestId('select-error')).toContainText('그림 파일이 아닙니다');
  expect(errors).toEqual([]);
});

test('a song whose analysis failed says why first, folds the server\'s words, and is analysed again from the hero or the song info', async ({ page }) => {
  const errors = trackErrors(page);
  const [song] = fakeSongs(1);
  const failed = { ...song, error: 'decode failed: unsupported codec' };
  const asked: string[] = [];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs: [failed] } }));
  await page.route(
    (url) => url.pathname.endsWith('/reanalyze'),
    (route) => {
      asked.push(new URL(route.request().url()).pathname);
      return route.fulfill({ json: { song: { ...failed, status: 'queued', error: null } } });
    },
  );
  await page.goto('/');
  const status = page.getByTestId('analysis-status');
  await expect(page.getByTestId('analysis-error')).toHaveText('분석 실패 · 음원을 읽지 못했습니다');
  await expect(status.locator('code')).toBeHidden();
  await status.locator('summary').click();
  await expect(status.locator('code')).toHaveText('decode failed: unsupported codec');
  await page.getByTestId('reanalyze-failed').click();
  await expect.poll(() => asked).toEqual([`/api/songs/${song.id}/reanalyze`]);
  await songInfo(page);
  await expect(page.getByTestId('analysis-failure')).toContainText('음원을 읽지 못했습니다');
  await page.getByTestId('song-info').getByTestId('reanalyze').click();
  await expect.poll(() => asked).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('the chosen one of many imported charts stays in view, the key modes say where a song has some, and Enter waits for the list of the one chosen last', async ({ page }) => {
  const errors = trackErrors(page);
  const [song] = fakeSongs(1, 'ready');
  const names = ['BEGINNER', 'NORMAL', 'HYPER', 'ANOTHER', 'INSANE'];
  const saved = names.map((name, i) => ({
    chartId: 'c' + String(i + 1).repeat(20),
    songId: song.id,
    name: `Imported BMS [${name}]`,
    kind: 'imported',
    keyMode: '7K+1S',
    difficulty: 'HARD',
    level: 3 + i * 3,
    noteCount: 500 + i * 300,
    createdAt: i,
    format: 'bms',
    sourceLevel: String(2 + i * 3),
  }));
  saved.push({ ...saved[0], chartId: 'c' + '9'.repeat(20), keyMode: '4K', name: 'Imported BMS [4K]' });
  // the charts are not to be had (the routes refuse them); the saved list comes late when asked to
  let late = false;
  const whole: string[] = [];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs: [song] } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    async (route) => {
      if (route.request().method() === 'POST') {
        if (!JSON.parse(route.request().postData() ?? '{}').brief) whole.push(new URL(route.request().url()).pathname);
        return route.fulfill({ status: 500, json: { detail: 'e2e' } });
      }
      if (late) await new Promise((r) => setTimeout(r, 1500));
      return route.fulfill({ json: { charts: saved } });
    },
  );
  await page.route((url) => /^\/api\/charts\/c\d{20}$/.test(url.pathname), (route) => route.fulfill({ status: 404, json: { detail: 'e2e' } }));
  await page.addInitScript(() => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '7K+1S', lastDifficulty: 'MASTER' }));
  });
  await page.goto('/');
  // the key modes with charts of the song say how many
  await expect(page.getByTestId('mode-saved-7K+1S')).toHaveText('5');
  await expect(page.getByTestId('mode-saved-4K')).toHaveText('1');
  await expect(page.getByTestId('mode-saved-8K')).toHaveCount(0);

  // → from the last difficulty through the five: the one chosen is in the row's view each time
  const row = page.getByTestId('saved-charts');
  const active = page.locator('.saved-chart.active');
  const inView = async () => {
    const [a, b] = [await active.boundingBox(), await row.boundingBox()];
    return Boolean(a && b && a.x >= b.x - 1 && a.x + a.width <= b.x + b.width + 1);
  };
  for (const name of names) {
    await page.keyboard.press('ArrowRight');
    await expect(active).toContainText(name);
    await expect.poll(inView).toBe(true);
  }
  // and after a panel over it is closed again
  await page.keyboard.press('KeyI');
  await expect(page.getByTestId('song-info')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(active).toContainText('INSANE');
  await expect.poll(inView).toBe(true);

  // the chart chosen last is the song's: until the song's list is here Enter plays nothing (not
  // the difficulty's chart)
  late = true;
  whole.length = 0;
  await page.reload();
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');
  await expect(page.getByTestId('play-button')).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(active).toContainText('INSANE');
  await expect.poll(inView).toBe(true);
  await page.waitForTimeout(500);
  expect(whole).toEqual([]);
  expect(errors).toEqual([]);
});

test("a chart that found the server down is asked again on the next visit, its plate showing the difficulty's best meanwhile; another chart's lamp is faint on the list, an earlier generator's named", async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(2, 'ready').map((s) => ({ ...s, analyzedAt: 1 }));
  // NORMAL was HARD CLEARed on its default pattern as an earlier generator made it
  songs[0].records = [
    { chartId: 'c' + '1'.repeat(20), songId: songs[0].id, keyMode: '4K', difficulty: 'NORMAL', level: 5, seed: 7, kind: 'generated', defaultSeed: true, generatorVersion: '0.0.1', score: 950_000, rate: 95, maxCombo: 100, lamp: 'HARD CLEAR', plays: 1 },
  ];
  let down = true;
  const asked: string[] = [];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      const body = JSON.parse(route.request().postData() ?? '{}');
      const songId = new URL(route.request().url()).pathname.split('/')[3];
      asked.push(`${songId} ${body.difficulty}`);
      if (down) return route.fulfill({ status: 503, json: { detail: 'e2e down' } });
      const meta = { chartId: `c${songId.slice(-4)}${'b'.repeat(14)}${body.difficulty.slice(0, 2).toLowerCase()}`, songId, keyMode: '4K', difficulty: body.difficulty, level: 6, noteCount: 300, durationMs: 60_000, nps: { avg: 5, peak: 9, graph: [1, 2] }, rating: 6, generator: { seed: 7, version: 'now' } };
      const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
      return route.fulfill({ json: body.brief ? { meta, cached: true } : { chart: { meta, timing, notes: [], sections: [] }, cached: true } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'HARD' })));
  await page.goto('/');
  const normal = page.getByTestId('difficulty-row').getByRole('button').filter({ hasText: 'NORMAL' });
  // the server is down: the plates say their charts could not be made, NORMAL shows its best all the same
  await expect.poll(() => asked.length).toBe(4);
  await expect(normal).toContainText('만들지 못함');
  await expect(normal).toContainText('HARD CLEAR');
  await expect(page.getByTestId('select-error')).toHaveCount(0);

  // the server is back: the next visit asks again, and the levels come
  down = false;
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 02');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');
  await expect(normal).toContainText('300 노트');
  // (the tiers are asked for one after another: the last may come after NORMAL shows)
  await expect.poll(() => asked.filter((a) => a.startsWith(songs[0].id)).length).toBe(8);
  // its chart was never played: no record of its own, the earlier generator's named
  await expect(normal.locator('.diff-record')).toHaveText('기록 없음');
  await expect(normal.locator('.other-best')).toContainText('이전 생성기');
  await expect(normal.locator('.other-best')).toContainText('HARD CLEAR');
  // on the list the lamp is that other chart's: a faint mark, the level the chart Enter plays
  const cell = page.locator(`[data-song-id="${songs[0].id}"] .tier-level`).first();
  await expect(cell).toHaveText('6');
  await expect(cell).toHaveClass(/lamp-hard/);
  await expect(cell).toHaveClass(/other/);
  expect(errors).toEqual([]);
});

test('the levels that came in are on the list at once after a restart, in the level order too; under another generator they are asked for again', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(3, 'ready').map((s) => ({ ...s, analyzedAt: 1 }));
  // the songs whose levels (brief) and whole charts were asked for
  const briefs: string[] = [];
  const whole: string[] = [];
  const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      const body = JSON.parse(route.request().postData() ?? '{}');
      const songId = new URL(route.request().url()).pathname.split('/')[3];
      (body.brief ? briefs : whole).push(songId);
      // each song a level lower than the one before
      const level = ({ NORMAL: 4, HARD: 7, EXPERT: 10, MASTER: 13 } as Record<string, number>)[body.difficulty] - songs.findIndex((s) => s.id === songId);
      const meta = { chartId: `c${songId.slice(-4)}${'b'.repeat(14)}${body.difficulty.slice(0, 2).toLowerCase()}`, songId, keyMode: '4K', difficulty: body.difficulty, level, noteCount: 100 * level, durationMs: 60_000, nps: { avg: 5, peak: 9, graph: [1, 2] }, rating: level, generator: { seed: 7, version: 'now' } };
      return route.fulfill({ json: body.brief ? { meta, cached: true } : { chart: { meta, timing, notes: [], sections: [] }, cached: true } });
    },
  );
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', lastDifficulty: 'NORMAL', songSort: 'level' })));
  await page.goto('/');
  const rows = page.getByTestId('song-item');
  const cells = (i: number) => page.locator(`[data-song-id="${songs[i].id}"] .tier-level`);
  const dashes = ['–', '–', '–', '–'];

  // the cursor rests on the first song, then on the second: their levels come; the third's are not asked for
  await expect(rows).toHaveText([/Fake Song 01/, /Fake Song 02/, /Fake Song 03/]);
  await expect(cells(0)).toHaveText(['4', '7', '10', '13'], { timeout: 30_000 });
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 02');
  await expect(cells(1)).toHaveText(['3', '6', '9', '12'], { timeout: 30_000 });
  await expect(cells(2)).toHaveText(dashes);
  const [asked, played] = [briefs.length, whole.length];

  // a restart: both songs show their levels at once and the level order puts them first, the
  // lower first; the song under the cursor asks only for the chart Enter plays
  await page.reload();
  await expect(rows).toHaveText([/Fake Song 02/, /Fake Song 01/, /Fake Song 03/]);
  await expect(cells(1)).toHaveText(['3', '6', '9', '12']);
  await expect(cells(0)).toHaveText(['4', '7', '10', '13']);
  await expect(cells(2)).toHaveText(dashes);
  await expect.poll(() => whole.length).toBeGreaterThan(played);
  await page.waitForTimeout(500);
  expect(briefs).toHaveLength(asked);

  // the server's generator is another one (an update): its charts are other ones, asked for again
  await page.addInitScript(() => {
    const stored = JSON.parse(localStorage.getItem('grg.briefs.v1') ?? '{}');
    localStorage.setItem('grg.briefs.v1', JSON.stringify({ ...stored, generator: 'older' }));
  });
  await page.reload();
  await expect(rows).toHaveText([/Fake Song 01/, /Fake Song 02/, /Fake Song 03/]);
  await expect(cells(1)).toHaveText(dashes);
  await expect(cells(0)).toHaveText(['4', '7', '10', '13'], { timeout: 30_000 });
  await expect.poll(() => briefs.length).toBe(asked + 3);
  const generator = (await (await page.request.get('/api/health')).json()).generator as string;
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('grg.briefs.v1') ?? '{}').generator)).toBe(generator);
  expect(errors).toEqual([]);
});

test('a song taken out of the library takes what was kept for it; a chosen chart the server no longer has gives way to the default pattern; one chosen from the records drops the target level', async ({ page }) => {
  const errors = trackErrors(page);
  const songs = fakeSongs(2, 'ready').map((s) => ({ ...s, analyzedAt: 1 }));
  const [a, b] = songs.map((s) => s.id);
  const picked = 'c' + 'd'.repeat(20);
  songs[0].records = [{ chartId: picked, songId: a, keyMode: '4K', difficulty: 'HARD', level: 8, seed: 9, kind: 'generated', defaultSeed: false, score: 900_000, rate: 90, maxCombo: 80, lamp: 'CLEAR', plays: 1 }];
  const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
  const chartOf = (chartId: string, songId: string, difficulty: string) => ({
    meta: { chartId, songId, keyMode: '4K', difficulty, level: 7, noteCount: 250, durationMs: 60_000, nps: { avg: 5, peak: 9, graph: [1, 2] }, rating: 7, generator: { seed: 3, version: 'now' } },
    timing,
    notes: [],
    sections: [],
  });
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ json: { charts: [] } });
      const body = JSON.parse(route.request().postData() ?? '{}');
      const songId = new URL(route.request().url()).pathname.split('/')[3];
      const chart = chartOf(`c${songId.slice(-4)}${'0'.repeat(14)}${body.difficulty.slice(0, 2).toLowerCase()}`, songId, body.difficulty);
      return route.fulfill({ json: body.brief ? { meta: chart.meta, cached: true } : { chart, cached: true } });
    },
  );
  // the chart chosen from the records is there; one chosen before the data was wiped is not
  await page.route(
    (url) => /^\/api\/charts\/c[0-9a-f]{20}$/.test(url.pathname),
    (route) => (route.request().url().endsWith(picked) ? route.fulfill({ json: { chart: chartOf(picked, a, 'HARD') } }) : route.fulfill({ status: 404, json: { detail: 'e2e' } })),
  );
  await page.route(
    (url) => url.pathname === `/api/songs/${a}`,
    (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      songs.splice(0, 1);
      return route.fulfill({ status: 204 });
    },
  );
  const hd = `${a}|4K|GRG|HARD`;
  const settings = {
    lastKeyMode: '4K',
    lastDifficulty: 'HARD',
    patterns: { [hd]: 'c' + 'e'.repeat(20), [`${b}|4K|GRG|NORMAL`]: 5 },
    chartPicks: { [`${a}|7K+1S`]: 'c' + 'f'.repeat(20) },
    songOffsets: { [a]: 12, [b]: -3 },
  };
  await page.addInitScript((s) => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify(s));
  }, settings);
  await page.goto('/');
  const plate = page.getByTestId('difficulty-row').getByRole('button').filter({ hasText: 'HARD' });
  // the chosen chart is gone: HARD is on its default pattern again
  await expect.poll(async () => ((await stored(page)).patterns as Record<string, unknown>)[hd]).toBeUndefined();
  await expect(plate).toContainText('250 노트');
  await expect(plate).not.toContainText('고른 패턴');

  // a target level, then a chart chosen from the records: played as it was made, so the target goes
  await playOptions(page, 'rules');
  const target = page.getByTestId('target-level');
  await target.focus();
  await page.keyboard.press('ArrowRight');
  await expect(target).not.toHaveAttribute('data-value', 'auto');
  await page.keyboard.press('Escape');
  await expect(plate).toContainText('목표');
  await songInfo(page);
  await page.getByTestId('record-row').getByTestId('pick-pattern').click();
  await expect.poll(async () => ((await stored(page)).patterns as Record<string, unknown>)[hd]).toBe(picked);
  await page.keyboard.press('Escape');
  await expect(plate).toContainText('고른 패턴');
  await expect(plate).not.toContainText('목표');

  // taken out of the library (a second press of its button, no dialog): its patterns, its chart
  // chosen and its offset go, the other song's stay
  page.on('dialog', (d) => {
    errors.push(`unexpected dialog: ${d.message()}`);
    void d.dismiss();
  });
  await songInfo(page);
  const remove = page.getByTestId('remove-song');
  await expect(remove).toHaveText('라이브러리에서 삭제');
  await remove.click();
  await expect(remove).toHaveText('한 번 더 누르면 지웁니다');
  await expect(page.getByTestId('song-info')).toContainText('이 곡의 기록도 함께 지워집니다');
  await expect(page.getByTestId('song-item')).toHaveCount(2);
  await remove.click();
  await expect(page.getByTestId('song-item')).toHaveCount(1);
  const after = await stored(page);
  expect(after.patterns).toEqual({ [`${b}|4K|GRG|NORMAL`]: 5 });
  expect(after.chartPicks).toEqual({});
  expect(after.songOffsets).toEqual({ [b]: -3 });
  expect(errors).toEqual([]);
});

test('an edited chart goes from the song info on a second press (Enter twice, no dialog); a first press left alone gives way', async ({ page }) => {
  const errors = trackErrors(page);
  page.on('dialog', (d) => {
    errors.push(`unexpected dialog: ${d.message()}`);
    void d.dismiss();
  });
  const [song] = fakeSongs(1, 'ready');
  const chartId = 'c' + '7'.repeat(20);
  let saved = [{ chartId, songId: song.id, name: 'My Edit', kind: 'edited', keyMode: '4K', difficulty: 'NORMAL', level: 5, noteCount: 120, createdAt: 1 }];
  const deleted: string[] = [];
  const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
  const meta = { chartId, songId: song.id, keyMode: '4K', difficulty: 'NORMAL', level: 5, noteCount: 120, durationMs: 60_000, nps: { avg: 2, peak: 4, graph: [1, 2] }, rating: 5, source: { kind: 'edited' }, chartName: 'My Edit' };
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs: [song] } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { charts: saved } }) : route.fulfill({ status: 500, json: { detail: 'e2e' } })),
  );
  await page.route(
    (url) => url.pathname === `/api/charts/${chartId}`,
    (route) => {
      if (route.request().method() !== 'DELETE') return route.fulfill({ json: { chart: { meta, timing, notes: [], sections: [] } } });
      deleted.push(chartId);
      saved = [];
      return route.fulfill({ status: 204 });
    },
  );
  await page.addInitScript(
    (picks) => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', chartPicks: picks })),
    { [`${song.id}|4K`]: chartId },
  );
  await page.goto('/');
  await expect(page.getByTestId('saved-chart')).toHaveClass(/active/);
  await songInfo(page);
  const del = page.getByTestId('delete-saved');
  await expect(del).toHaveText('이 채보 지우기');
  // a first press asks once more; left alone for 3 s it gives way, nothing deleted
  await del.focus();
  await page.keyboard.press('Enter');
  await expect(del).toHaveText('한 번 더 누르면 지웁니다');
  await expect(page.getByTestId('song-info')).toContainText('이 채보의 기록도 함께 지워집니다');
  await expect(del).toHaveText('이 채보 지우기', { timeout: 5_000 });
  expect(deleted).toEqual([]);
  // two presses within the time: the chart and its entry go
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect.poll(() => deleted).toEqual([chartId]);
  await expect(page.getByTestId('saved-charts')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a first press of 이 채보 지우기 gives way when Tab puts the next key mode’s chart under the focused button', async ({ page }) => {
  const errors = trackErrors(page);
  const [song] = fakeSongs(1, 'ready');
  const ids = { '4K': 'c' + '8'.repeat(20), '4K+FX': 'c' + '9'.repeat(20) };
  const saved = Object.entries(ids).map(([keyMode, chartId]) => ({ chartId, songId: song.id, name: `Edit ${keyMode}`, kind: 'edited', keyMode, difficulty: 'NORMAL', level: 5, noteCount: keyMode === '4K' ? 120 : 140, createdAt: 1 }));
  const deleted: string[] = [];
  const timing = { offsetMs: 0, tempoMap: [{ beat: 0, bpm: 120 }], meter: [{ measure: 0, beatsPerMeasure: 4 }] };
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs: [song] } }));
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { charts: saved } }) : route.fulfill({ status: 500, json: { detail: 'e2e' } })),
  );
  await page.route(
    (url) => url.pathname.startsWith('/api/charts/'),
    (route) => {
      const c = saved.find((s) => route.request().url().includes(s.chartId));
      if (!c) return route.fallback();
      if (route.request().method() === 'DELETE') {
        deleted.push(c.chartId);
        return route.fulfill({ status: 204 });
      }
      const meta = { ...c, durationMs: 60_000, nps: { avg: 2, peak: 4, graph: [1, 2] }, rating: 5, source: { kind: 'edited' }, chartName: c.name };
      return route.fulfill({ json: { chart: { meta, timing, notes: [], sections: [] } } });
    },
  );
  await page.addInitScript(
    (picks) => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', chartPicks: picks })),
    { [`${song.id}|4K`]: ids['4K'], [`${song.id}|4K+FX`]: ids['4K+FX'] },
  );
  await page.goto('/');
  const notes = page.getByTestId('chart-notes');
  // both charts loaded once (the next key mode's comes back from the store, under the same button)
  await songInfo(page);
  await expect(notes).toHaveText('120');
  await page.keyboard.press('Tab');
  await expect(notes).toHaveText('140');
  await page.keyboard.press('Shift+Tab');
  await expect(notes).toHaveText('120');

  const del = page.getByTestId('delete-saved');
  await del.focus();
  await page.keyboard.press('Enter');
  await expect(del).toHaveText('한 번 더 누르면 지웁니다');
  // Tab: another chart under the focus, so the first press was not for it (said at once, well
  // before the 3 s a first press waits run out), and the next Enter is a first press again
  await page.keyboard.press('Tab');
  await expect(notes).toHaveText('140');
  await expect(del).toBeFocused();
  await expect(del).toHaveText('이 채보 지우기', { timeout: 1000 });
  await page.keyboard.press('Enter');
  await expect(del).toHaveText('한 번 더 누르면 지웁니다');
  expect(deleted).toEqual([]);
  expect(errors).toEqual([]);
});

// A small keysounded BMS package that names its stage picture (synthesized samples, no copyrighted material).
const MAKE_BMS = `
import sys, numpy as np, soundfile as sf
from pathlib import Path
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
SR = 44100
def tone(f, dur, decay, amp):
    t = np.arange(int(dur * SR)) / SR
    x = (amp * np.sin(2 * np.pi * f * t) * np.exp(-t / decay)).astype(np.float32)
    return np.stack([x, x], 1)
sf.write(out / "kick.ogg", tone(55, 0.3, 0.08, 0.9), SR)
for i, f in enumerate([261.6, 329.6, 392.0]):
    sf.write(out / f"lead{i}.wav", tone(f, 0.4, 0.2, 0.4), SR)
lines = ["#TITLE E2E Cover Keysound [ANOTHER]", "#ARTIST Synth", "#BPM 124", "#PLAYLEVEL 6", "#STAGEFILE stage.bmp", "#WAV01 kick.wav"]
lines += [f"#WAV1{i} lead{i}.wav" for i in range(3)]
for m in range(1, 7):
    lines += [f"#{m:03d}01:01010101", f"#{m:03d}12:10001100", f"#{m:03d}19:00120012"]
(out / "e2e_another.bme").write_text("\\n".join(lines) + "\\n", encoding="utf-8")
`;
