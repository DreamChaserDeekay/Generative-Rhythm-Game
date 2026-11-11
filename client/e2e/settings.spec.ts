import { expect, test, type Page } from '@playwright/test';
import { settingsTab } from './songSelect';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('grg.settings.v1') ?? '{}') as Record<string, unknown>);

/** Settings to start from, kept over reloads (written only when there are none). */
async function startWith(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('grg.settings.v1')) localStorage.setItem('grg.settings.v1', JSON.stringify(s));
  }, settings);
}

async function openSettings(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
}

test('three columns: the tabs, the rows over the help of the row under the cursor, and the gear with the visible time on every tab', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { lastKeyMode: '5K' });
  await openSettings(page);
  const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
  const [tabs, main, side] = [await box('.settings-nav'), await box('.settings-main'), await box('.settings-side')];
  expect(tabs.x + tabs.width).toBeLessThanOrEqual(main.x);
  expect(main.x + main.width).toBeLessThanOrEqual(side.x);
  // the tab's name and what its rows are about over the rows, the help under them, all in the middle column
  await expect(page.locator('.settings-head h2')).toHaveText('속도·커버');
  await expect(page.locator('.settings-head span')).toHaveText('움직이는 미리보기에 바로 보입니다');
  await expect(page.getByTestId('opt-hi-speed')).toBeFocused();
  const [rows, help] = [await box('.settings-rows'), await box('[data-testid="settings-help"]')];
  expect(help.y).toBeGreaterThanOrEqual(rows.y + rows.height);
  expect(help.x).toBeGreaterThanOrEqual(main.x);
  expect(help.x + help.width).toBeLessThanOrEqual(main.x + main.width + 1);
  // nothing of the screen is cut off by the window
  expect(help.y + help.height).toBeLessThanOrEqual(side.y + side.height + 1);
  expect(side.y + side.height).toBeLessThanOrEqual((await box('.hintbar')).y);
  // the gear on the tabs that had none before, under the line with its key mode and the green number
  const head = page.locator('.settings-side-head');
  for (const tab of ['judge', 'keys', 'pad', 'advanced', 'sound'] as const) {
    await settingsTab(page, tab);
    await expect(page.getByTestId('gear-preview')).toBeVisible();
    await expect(head).toContainText('미리보기');
    await expect(head).toContainText('5K');
    await expect(head).toContainText('보이는 시간');
  }
  // one green number, in that line: it follows the note speed
  const green = page.getByTestId('green-number');
  await expect(green).toHaveText('1250ms');
  await settingsTab(page, 'speed');
  await page.getByTestId('opt-hi-speed').focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('opt-hi-speed')).toHaveAttribute('data-value', '4.5');
  await expect(green).not.toHaveText('1250ms');
  await expect(green).toHaveText(/^\d+ms$/);
  expect(errors).toEqual([]);
});

test('the help names the picked gear only, and the default of a row whose value is another', async ({ page }) => {
  const errors = trackErrors(page);
  await openSettings(page);
  await settingsTab(page, 'gear');
  const help = page.getByTestId('settings-help');
  const picked = help.locator('.help-picked');
  const was = help.locator('.help-default');
  const gear = page.getByTestId('opt-deck-style');
  // the gear's help goes through every gear: what stands before the list, the picked gear's words, what follows
  await gear.focus();
  await expect(help).toContainText('트랙을 담는 기어입니다.');
  await expect(picked).toHaveText('기본 그래파이트에 레인마다 낮은 키캡(누르면 하늘색 불)과 점수·속도·정확도 창, 앞쪽의 하늘색 불빛 띠');
  await expect(picked.locator('b')).toHaveText('기본');
  await expect(help).toContainText('받침은 그보다 조금 아래에서 시작합니다.');
  await expect(help).not.toContainText('오락실 기체');
  await expect(was).toHaveCount(0);
  // another gear: its words, and the default named under the help (the crystal skin's gear comes after the default one)
  await page.keyboard.press('ArrowRight');
  await expect(gear).toHaveAttribute('data-value', 'prism');
  await expect(picked).toHaveText('크리스털 레인마다 젖빛 크리스털 키캡(누르면 얼음빛), 넓은 면으로 깎은 옅은 빛깔의 받침에 박힌 사파이어빛 육각 판의 점수·속도·정확도, 레인을 따라 맑은 유리 테두리');
  await expect(help).not.toContainText('그래파이트');
  await expect(was).toHaveText('기본값 기본');
  // the sky skin's gear after it: its name is the start of a colour's (하늘색) in other gears' words, and only its own are shown
  await page.keyboard.press('ArrowRight');
  await expect(gear).toHaveAttribute('data-value', 'sky');
  await expect(picked).toHaveText('하늘 레인마다 가는 표시선(누르면 청록빛 불), 구름 낀 하늘 받침에 깃털 옆에 쓴 점수와 비치는 알약 창의 속도·정확도, 옅은 하늘빛 유리 테두리, 레인에 아주 옅게 깔린 같은 하늘과 양 가장자리의 눈금');
  await expect(help).not.toContainText('그래파이트');
  await page.keyboard.press('ArrowRight');
  await expect(gear).toHaveAttribute('data-value', 'cabinet');
  await expect(picked).toHaveText('오락실 기체 검은 플라스틱·크롬에 조이스틱·아크릴 버튼·동전 투입구');
  await expect(help).not.toContainText('그래파이트');
  await expect(was).toHaveText('기본값 기본');
  // the judgement and combo type's help is cut to the gear picked too (the row's own default is 기어)
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('opt-hud-type')).toBeFocused();
  await expect(picked).toHaveText('오락실 기체 빨간 7세그 콤보와 굵은 이탤릭 판정');
  await expect(help).toContainText('기본은 기어와 상관없이');
  await expect(was).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(was).toHaveText('기본값 기어');
  await page.keyboard.press('ArrowRight');
  await expect(was).toHaveCount(0);
  // a number and a switch name theirs as they show it; a row back on its default names none
  await page.getByTestId('opt-lane-width').focus();
  await expect(help).toHaveText('트랙의 폭입니다.');
  await page.keyboard.press('ArrowRight');
  await expect(was).toHaveText('기본값 100%');
  await page.keyboard.press('ArrowLeft');
  await expect(was).toHaveCount(0);
  await page.getByTestId('bar-lines').focus();
  await page.keyboard.press('Enter');
  await expect(was).toHaveText('기본값 켬');
  // a row that only does something has none, whatever the row before it showed
  await page.getByTestId('opt-deck-style').focus();
  await expect(was).toHaveText('기본값 기본');
  await settingsTab(page, 'judge');
  await page.getByTestId('open-calibration-settings').focus();
  await expect(help).toContainText('메트로놈 소리에 맞춰');
  await expect(was).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('AI 채보 is a tab of its own between 게임패드 and 고급: the generator’s state, its setup and its rows, the cursor on the first once the server has answered', async ({ page }) => {
  const errors = trackErrors(page);
  // a PC with the generator set up, as the server would report it (this one has no NVIDIA GPU)
  const settings: Record<string, unknown> = { enabled: true, model: 'v32', precision: 'auto', starsScale: 1, holdNoteRatio: null, temperature: null, useAppTiming: true, hitsounds: true, lookback: 0.5, lookahead: 0.4, parallel: false };
  const status = {
    enabled: true,
    state: 'ready',
    model: 'v32',
    gpus: [{ name: 'E2E GPU', memoryMB: 8192 }],
    home: '/tmp/e2e-mapper',
    runtime: { device: 'cuda', gpu: 'E2E GPU', memoryMB: 8192, capability: [8, 9], bf16: true },
    lastError: null,
    settings,
  };
  const saved: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname === '/api/mapper',
    async (route) => {
      // (late enough for the tab to have opened without its rows)
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({ json: status });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/mapper/settings',
    (route) => {
      const patch = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      saved.push(patch);
      Object.assign(settings, patch);
      return route.fulfill({ json: status });
    },
  );
  await openSettings(page);
  await expect(page.locator('.settings-nav button')).toHaveText(['플레이', '판정·싱크', '속도·커버', '기어', '노트', '연출·배경', '소리', '키 설정', '게임패드', 'AI 채보', '고급']);
  // E from 게임패드 (its tab clicked: the focus on it): the tab, and its first control once it is there
  await settingsTab(page, 'pad');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('settings-tab-mapper')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.settings-head h2')).toHaveText('AI 채보');
  await expect(page.getByTestId('mapper-status')).toContainText('사용 중');
  await expect(page.getByTestId('mapper-status')).toContainText('E2E GPU');
  await expect(page.getByTestId('mapper-install')).toHaveText('다시 설치');
  await expect(page.getByTestId('mapper-install')).toBeFocused();
  await expect(page.getByTestId('settings-help')).toContainText('PyTorch CUDA');
  await expect(page.locator('.hintbar')).toContainText('누르기');
  // its rows as they were in 고급: ↓ into them, ←→ change one and the server keeps it
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('mapper-enabled')).toBeFocused();
  await expect(page.locator('[data-testid="mapper-settings"] .opt-name')).toHaveText(['AI 채보 쓰기', '모델', '연산 정밀도', '난이도 배율', '롱노트 비율', '다양성', '앱의 박자 쓰기', '히트사운드 생성', '이전 문맥', '앞 미리보기', '병렬 생성']);
  await expect(page.getByTestId('mapper-precision')).toContainText('자동 (bf16)');
  const stars = page.getByTestId('mapper-stars');
  await stars.focus();
  await expect(page.getByTestId('settings-help')).toContainText('osu! 별점에 곱합니다');
  await expect(page.locator('.help-default')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(stars).toHaveAttribute('data-value', '1.05');
  await expect.poll(() => saved).toEqual([{ starsScale: 1.05 }]);
  await expect(page.locator('.help-default')).toHaveText('기본값 ×1.00');
  await page.getByTestId('mapper-holds').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('mapper-holds')).toHaveAttribute('data-value', '0.2');
  await expect(page.locator('.help-default')).toHaveText('기본값 자동');
  // the gear plays on beside it, and E goes on to 고급, which has the generator no more
  await expect(page.getByTestId('gear-preview')).toBeVisible();
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('settings-tab-advanced')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('opt-display-mode')).toBeFocused();
  await expect(page.getByTestId('backend-status')).toBeVisible();
  await expect(page.getByTestId('mapper-status')).toHaveCount(0);
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('settings-tab-mapper')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('mapper-install')).toBeFocused();
  expect(errors).toEqual([]);
});

test('AI 채보 on a PC without an NVIDIA GPU says so and has no rows; Q / E pass through it', async ({ page }) => {
  const errors = trackErrors(page);
  // as the server answers there: the built-in generator makes the charts, whatever the settings kept
  const status = {
    enabled: true,
    state: 'unsupported',
    model: 'v32',
    gpus: [],
    home: '/tmp/e2e-mapper',
    reason: 'NVIDIA GPU가 없어 Mapperatorinator를 쓸 수 없습니다.',
    lastError: null,
    settings: { enabled: true, model: 'v32', precision: 'auto', starsScale: 1, holdNoteRatio: null, temperature: null, useAppTiming: true, hitsounds: true, lookback: 0.5, lookahead: 0.4, parallel: false },
  };
  await page.route((url) => url.pathname === '/api/mapper', (route) => route.fulfill({ json: status }));
  await openSettings(page);
  await settingsTab(page, 'advanced');
  await page.getByTestId('opt-display-mode').focus();
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('settings-tab-mapper')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('mapper-status')).toContainText('NVIDIA GPU 없음');
  await expect(page.getByTestId('mapper-status')).toContainText('NVIDIA GPU가 없어');
  await expect(page.getByTestId('mapper-settings')).toHaveCount(0);
  await expect(page.getByTestId('mapper-install')).toHaveCount(0);
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('settings-tab-pad')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('opt-tt-steps')).toBeFocused();
  expect(errors).toEqual([]);
});

test('모두 초기화 takes a second press within 3 s, keeps the favourites, and can be undone', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { hiSpeed: 6.5, inputOffsetMs: 12, favorites: ['00000000000000aa'], songOffsets: { '00000000000000aa': 7 } });
  await openSettings(page);
  await settingsTab(page, 'advanced');
  const reset = page.getByTestId('reset-all');
  await reset.click();
  await expect(reset).toHaveText('한 번 더 누르면 초기화');
  expect((await stored(page)).hiSpeed).toBe(6.5);
  // armed for 3 s only
  await expect(reset).toHaveText('모두 초기화', { timeout: 5_000 });
  await reset.click();
  await reset.click();
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(4);
  expect(await stored(page)).toMatchObject({ inputOffsetMs: 0, favorites: ['00000000000000aa'], songOffsets: { '00000000000000aa': 7 } });
  await expect(page.getByTestId('reset-done')).toBeVisible();
  // the undo is on the reset's line: → from the reset reaches it, Enter presses it, and the focus
  // goes back to the reset (the arrows go on from there)
  await reset.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('reset-undo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(6.5);
  expect((await stored(page)).inputOffsetMs).toBe(12);
  await expect(page.getByTestId('reset-undo')).toHaveCount(0);
  await expect(reset).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(reset).not.toBeFocused();
  expect(errors).toEqual([]);
});

test('a held Enter on 모두 초기화 arms it once: its repeats are no second press', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { hiSpeed: 6.5 });
  await openSettings(page);
  await settingsTab(page, 'advanced');
  const reset = page.getByTestId('reset-all');
  await reset.focus();
  // held: the first keydown, then the key's repeats
  await page.keyboard.down('Enter');
  await expect(reset).toHaveText('한 번 더 누르면 초기화');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.down('Enter');
    await page.waitForTimeout(50);
  }
  await page.keyboard.up('Enter');
  await expect(reset).toHaveText('한 번 더 누르면 초기화');
  await expect(page.getByTestId('reset-undo')).toHaveCount(0);
  expect((await stored(page)).hiSpeed).toBe(6.5);
  // a second press of its own resets; held, it does not arm the reset again
  await page.keyboard.down('Enter');
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(4);
  for (let i = 0; i < 3; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(reset).toHaveText('모두 초기화');
  await expect(page.getByTestId('reset-undo')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a reset can be undone after leaving the settings, until its time is up', async ({ page }) => {
  const errors = trackErrors(page);
  await startWith(page, { hiSpeed: 6.5 });
  await openSettings(page);
  await settingsTab(page, 'advanced');
  await page.getByTestId('reset-all').click();
  await page.getByTestId('reset-all').click();
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(4);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('song-list')).toBeVisible();
  await page.getByTestId('open-settings').click();
  await settingsTab(page, 'advanced');
  await page.getByTestId('reset-undo').click();
  await expect.poll(async () => (await stored(page)).hiSpeed).toBe(6.5);
  await expect(page.getByTestId('reset-undo')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the key settings: ↑↓ from a key to its second key and through the buttons to the next mode in the same lane, ←→ along the lanes, and hints that say so', async ({ page }) => {
  const errors = trackErrors(page);
  await openSettings(page);
  await settingsTab(page, 'keys');
  const hints = page.locator('.hintbar');
  await expect(hints).toContainText('모드');
  await expect(hints).toContainText('레인');
  await expect(hints).toContainText('바꾸기');
  await page.getByTestId('key-4K-1').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('key-4K-2')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('key2-4K-2')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('keys-run-4K')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('key-4K+FX-2')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('key2-4K-2')).toBeFocused();
  // Enter binds the key: the hints say what the next key does, Esc stops it and stays in the settings
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('key-4K-2')).toHaveText('…');
  await expect(hints).toContainText('이 레인에 지정');
  await expect(hints).toContainText('취소');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('key-4K-2')).toHaveText('J');
  await expect(hints).toContainText('바꾸기');
  await expect(page.getByTestId('settings-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Q / E keep the help on the row the focus lands on, and the custom skin help names the gear tab', async ({ page }) => {
  const errors = trackErrors(page);
  await openSettings(page);
  await settingsTab(page, 'judge');
  // its tools open with Enter
  await expect(page.locator('.hintbar')).toContainText('열기');
  await page.getByTestId('opt-judgement').focus();
  const help = page.getByTestId('settings-help');
  await expect(help).toContainText('HARD JUDGEMENT');
  // 플레이 and 판정·싱크 both start on a row of the same kind: the help is the new row's, not empty
  await page.keyboard.press('KeyQ');
  await expect(page.getByTestId('opt-ruleset')).toBeFocused();
  await expect(help).toContainText('점수를 세는 방식');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('opt-judgement')).toBeFocused();
  await expect(help).toContainText('HARD JUDGEMENT');
  // 고급 starts on 화면 모드 (Q / E still change the tab: the focus is in no text field)
  await settingsTab(page, 'advanced');
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('opt-display-mode')).toBeFocused();
  await expect(help).toContainText('전체 화면');
  // the user skins are gone with the track skins: no section of theirs
  await expect(page.getByTestId('skin-settings')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('화면 모드 puts the page in full screen with Esc kept for the game, and back; full screen left the setting follows', async ({ page }) => {
  const errors = trackErrors(page);
  await openSettings(page);
  await settingsTab(page, 'advanced');
  const row = page.getByTestId('opt-display-mode');
  await row.focus();
  await page.keyboard.press('ArrowRight');
  await expect(row).toHaveAttribute('data-value', 'fullscreen');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  expect((await stored(page)).displayMode).toBe('fullscreen');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect((await stored(page)).displayMode).toBe('window');
  // in full screen again, left another way (as a held Esc does): the setting says 창
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await expect(row).toHaveAttribute('data-value', 'window');
  expect(errors).toEqual([]);
});
