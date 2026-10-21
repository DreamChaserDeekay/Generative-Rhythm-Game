import { expect, test, type Page } from '@playwright/test';
import { addFromMenu, autoplay, difficultySystem, fakeSongs, playOptions, songInfo } from './songSelect';

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
  // its first line, ←→ along a line of buttons, and Enter presses one, as the hint then says
  await page.keyboard.press('KeyI');
  await expect(page.getByTestId('song-info').locator('.select-panel-body')).toBeFocused();
  await expect(enter).toContainText('플레이');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('song-offset')).toHaveText('0ms');
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
  await expect(page.getByTestId('song-offset-minus5')).toBeFocused();
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 01');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-info')).toHaveCount(0);
  await expect(enter).toContainText('플레이');
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.songId)).toBe(songs[0].id);
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
  await page.keyboard.press('KeyI');
  await expect(page.getByTestId('song-info')).toBeVisible();
  await page.keyboard.press('Enter');
  // the play asks for its chart (the route refuses it); no song setting was sent
  await expect.poll(() => sent).toEqual(['POST charts']);
  // the first line is the tempo's ×2: ↓ goes there, and the hint says what Enter does now
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-info').getByRole('button', { name: '×2' })).toBeFocused();
  await expect(page.getByTestId('hint-enter')).toContainText('누르기');
  expect(sent).toEqual(['POST charts']);
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
  // ↓ in the search moves the cursor; Enter leaves the search on that song and the next Enter plays it
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('song-title')).toHaveText('Fake Song 11');
  await expect(search).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await focusedSong()).toBe(songs[10].id);
  expect(posts).toEqual([]);
  await page.keyboard.press('Enter');
  await expect.poll(() => posts).toEqual([songs[10].id]);

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
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(posts).toHaveLength(1);

  // a folder with no song in it: the same
  await search.fill('');
  await page.getByTestId('folder-favorites').click();
  await expect(page.getByTestId('song-item')).toHaveCount(0);
  await expect(page.getByTestId('play-button')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  expect(posts).toHaveLength(1);
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
  // two songs with a NORMAL record on 4K DJMAX: the level order puts them first, the lowest first
  const record = { songId: '', keyMode: '4K', system: 'DJMAX', difficulty: 'NM', seed: 1, score: 900_000, rate: 90, maxCombo: 50, lamp: 'CLEAR', plays: 1 };
  songs[29].records = [{ ...record, chartId: 'c' + '1'.repeat(20), songId: songs[29].id, level: 7 }];
  songs[34].records = [{ ...record, chartId: 'c' + '2'.repeat(20), songId: songs[34].id, level: 3 }];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', difficultySystem: 'DJMAX', lastDifficulty: 'NM' })));
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
  await page.reload();
  const row = (bpm: number) => page.getByTestId('song-item').filter({ hasText: `Demo Groove ${bpm}` });
  await row(133).click();
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 133');
  await page.getByRole('button', { name: '4K', exact: true }).click();

  // the chart asked for on one song arrives after the cursor moved to the next: it is dropped
  // (only the generation is held back: the saved-charts list shares the path)
  await page.route('**/api/songs/*/charts', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const late = page.waitForResponse((r) => isChartPost(r.request().method(), r.url()));
  await page.getByTestId('generate-button').click();
  await row(137).click();
  await late;
  await expect(page.getByTestId('busy')).toHaveCount(0);
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 137');
  await expect(page.getByTestId('chart-level')).toHaveCount(0);
  await expect(page.locator('.level-pending')).toBeVisible();
  await page.unroute('**/api/songs/*/charts');

  // Enter held down on the focused autoplay box: one chart request, one play
  let posts = 0;
  page.on('request', (r) => {
    if (isChartPost(r.method(), r.url())) posts++;
  });
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

  // a BPM fix analyses the song again: the chart made on the old analysis is gone, and Enter
  // does not play while the analysis runs
  await expect(page.getByTestId('song-title')).toHaveText('Demo Groove 137');
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('chart-level')).toBeVisible({ timeout: 30_000 });
  await songInfo(page);
  await page.locator('.song-tools').getByRole('button', { name: '×2' }).click();
  await expect(page.getByTestId('analysis-status')).toBeVisible();
  await expect(page.getByTestId('chart-level')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('play-screen')).toHaveCount(0);
  await expect(page.getByTestId('analysis-status')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.level-pending')).toBeVisible();
  await expect(page.getByTestId('chart-level')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a best shows on its own difficulty system only (DJMAX NM is not EZ2ON NM), and on a tall window in full under the play buttons', async ({ page }) => {
  const errors = trackErrors(page);
  const [song] = fakeSongs(1);
  const record = { chartId: 'c' + '1'.repeat(20), songId: song.id, keyMode: '4K', difficulty: 'NM', level: 5, seed: 1, score: 912_000, rate: 91.2, maxCombo: 40, lamp: 'CLEAR', plays: 3, lastPlayedAt: 1_790_000_000 };
  const songs = [{ ...song, records: [{ ...record, system: 'DJMAX' }] }];
  await page.route((url) => url.pathname === '/api/songs', (route) => route.fulfill({ json: { songs } }));
  await page.addInitScript(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K', difficultySystem: 'DJMAX', lastDifficulty: 'NM' })));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const plate = page.getByTestId('difficulty-row').getByRole('button', { name: /NORMAL/ });
  await expect(plate.locator('.diff-lamp')).toHaveText('91.20%');
  // the range of a difficulty's levels reads as levels
  await expect(page.getByTestId('difficulty-row').getByRole('button', { name: /HARD/ })).toContainText('Lv.5–11');
  const summary = page.getByTestId('summary-record');
  await expect(summary).toContainText('CLEAR');
  await expect(summary).toContainText('912,000');
  await expect(summary).toContainText('3회');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId('chart-summary')).toBeHidden();
  await difficultySystem(page, 'EZ2ON');
  await expect(page.getByTestId('difficulty-row').getByRole('button')).toHaveText([/EASY/, /NORMAL/, /HARD/, /SUPER HARD/]);
  await expect(page.getByTestId('difficulty-row').locator('.diff-lamp')).toHaveCount(0);
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
  const saved = { chartId: 'c' + 'a'.repeat(20), songId: '', name: 'Imported BMS [HYPER]', kind: 'imported', keyMode: '7K+1S', difficulty: 'HARD', level: 9, noteCount: 812, createdAt: 1 };
  await page.route(
    (url) => /^\/api\/songs\/[^/]+\/charts$/.test(url.pathname),
    (route) => (route.request().method() === 'GET' ? route.fulfill({ json: { charts: [saved] } }) : route.fallback()),
  );
  await page.evaluate(() => localStorage.setItem('grg.settings.v1', JSON.stringify({ lastKeyMode: '4K' })));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByTestId('song-item').filter({ hasText: 'Demo Groove 133' }).click();
  await expect(page.getByTestId('saved-charts')).toBeVisible();
  // with the chart made the summary has the most to show
  await page.keyboard.press('F5');
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
