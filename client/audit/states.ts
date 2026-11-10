import { expect, type Page } from '@playwright/test';
import { openRoot, stable, type Root } from './lib';

/**
 * The screens and states of the menus by name, each with the way there (by pointer: the tools that
 * use them look at what a state shows, not at how a key reaches it; the graph does that).
 */
export interface NamedState {
  name: string;
  /** What a player would call it. */
  title: string;
  root: Root;
  /** Stored settings to start from (merged over the defaults by the game). */
  settings?: Record<string, unknown>;
  /** A library of this many songs that only the routes answer for (the list at scale). */
  fakeSongs?: number;
  go: (page: Page) => Promise<void>;
}

const tid = (page: Page, id: string) => page.getByTestId(id);
const click = (page: Page, id: string) => tid(page, id).click();

const SETTINGS_TABS: [string, string][] = [
  ['play', '플레이'],
  ['judge', '판정·싱크'],
  ['speed', '속도·커버'],
  ['gear', '기어'],
  ['notes', '노트'],
  ['fx', '연출·배경'],
  ['sound', '소리'],
  ['keys', '키 설정'],
  ['pad', '게임패드'],
  ['advanced', '고급'],
];

const settingsTab = (tab: string) => async (page: Page) => {
  await click(page, 'open-settings');
  await click(page, `settings-tab-${tab}`);
  await expect(tid(page, `settings-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
};

const options = (tab: string) => async (page: Page) => {
  await click(page, 'hint-options');
  await click(page, `toggle-${tab}`);
};

const info = async (page: Page) => {
  await click(page, 'hint-info');
  await expect(tid(page, 'song-info')).toBeVisible();
};

/** Twenty note colour presets of the player's own (the most the game keeps). */
const presets = Array.from({ length: 20 }, (_, i) => ({ id: `user-${i + 1}`, name: `내 색 프리셋 ${i + 1}`, lanes: {} }));

export function fakeSongList(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: (0xa000 + i).toString(16).padStart(16, '0'),
    title: `가짜 곡 ${String(i + 1).padStart(3, '0')} · 제목이 꽤 긴 곡의 이름입니다`,
    artist: `아티스트 ${(i % 37) + 1}`,
    album: '',
    audioHash: `fake${i}`,
    durationMs: 60_000 + (i % 200) * 1000,
    hasCover: false,
    status: 'error',
    progress: 0,
    progressLabel: '',
    error: 'audit',
    bpm: 90 + (i % 110),
    bpmMin: null,
    bpmMax: null,
    previewMs: null,
    overrides: {},
    createdAt: i,
    analyzedAt: null,
    analyzer: {},
    hasBga: false,
    bgaOffsetMs: 0,
    bgaYoutube: null,
    sections: null,
    records: [],
  }));
}

export const NAMED_STATES: NamedState[] = [
  { name: 'select', title: '선곡', root: 'lib', go: async () => undefined },
  { name: 'select+options:rules', title: '선곡 › 플레이 옵션 › 플레이 규칙', root: 'lib', go: options('rules') },
  {
    name: 'select+options:rules+practice',
    title: '선곡 › 플레이 옵션 › 플레이 규칙 (연습 모드 켬)',
    root: 'lib',
    go: async (page) => {
      await options('rules')(page);
      await click(page, 'practice-toggle');
      await expect(tid(page, 'practice-options')).toBeVisible({ timeout: 30_000 });
    },
  },
  { name: 'select+options:gear', title: '선곡 › 플레이 옵션 › 속도·기어', root: 'lib', go: options('gear') },
  { name: 'select+options:generation', title: '선곡 › 플레이 옵션 › 생성 옵션', root: 'lib', go: options('generation') },
  { name: 'select+info', title: '선곡 › 곡 정보·도구', root: 'lib', go: info },
  {
    name: 'select+info+sections',
    title: '선곡 › 곡 정보·도구 › 구간 편집',
    root: 'lib',
    go: async (page) => {
      await info(page);
      await click(page, 'edit-sections');
      await expect(tid(page, 'section-editor')).toBeVisible();
    },
  },
  { name: 'select+add', title: '선곡 › 곡 추가 메뉴', root: 'lib', go: (page) => click(page, 'add-menu') },
  { name: 'select+search', title: '선곡 › 검색', root: 'lib', go: (page) => tid(page, 'song-search').focus() },
  { name: 'select+emptyfolder', title: '선곡 › 빈 폴더(즐겨찾기 0곡)', root: 'lib', go: (page) => click(page, 'folder-favorites') },
  { name: 'select+first', title: '선곡 · 첫 실행(곡 없음)', root: 'empty', go: async () => undefined },
  { name: 'select+offline', title: '선곡 · 서버 없음', root: 'offline', go: async () => undefined },
  { name: 'select@500', title: '선곡 · 곡 500개', root: 'lib', fakeSongs: 500, go: async () => undefined },
  ...SETTINGS_TABS.map(([tab, label]): NamedState => ({ name: `settings:${tab}`, title: `설정 › ${label}`, root: 'lib', go: settingsTab(tab) })),
  { name: 'settings:notes@20presets', title: '설정 › 노트 · 내 색 프리셋 20개', root: 'lib', settings: { colorPresets: presets, noteColors: 'user-20' }, go: settingsTab('notes') },
  {
    name: 'settings:keys+ghost',
    title: '설정 › 키 설정 › 동시 입력 테스트',
    root: 'lib',
    go: async (page) => {
      await settingsTab('keys')(page);
      await click(page, 'ghost-4K');
    },
  },
  {
    name: 'calibration:input',
    title: '캘리브레이션 › 판정 오프셋 측정',
    root: 'lib',
    go: async (page) => {
      await settingsTab('judge')(page);
      await click(page, 'open-calibration-settings');
    },
  },
  {
    name: 'calibration:visual',
    title: '캘리브레이션 › 표시 오프셋 맞추기',
    root: 'lib',
    go: async (page) => {
      await settingsTab('judge')(page);
      await click(page, 'open-visual-calibration-settings');
    },
  },
  {
    name: 'play:loading',
    title: '로딩',
    root: 'lib',
    go: async (page) => {
      // the song's audio held back, so the card stays
      await page.route(/\/api\/songs\/[^/]+\/audio/, () => undefined);
      await click(page, 'play-button');
      await expect(tid(page, 'play-loading')).toBeVisible();
    },
  },
  {
    name: 'play:paused',
    title: '일시정지 메뉴',
    root: 'lib',
    go: async (page) => {
      await info(page);
      await click(page, 'sync-play');
      await expect(tid(page, 'play-loading')).toHaveCount(0, { timeout: 60_000 });
      await page.waitForTimeout(2500);
      await page.keyboard.press('Escape');
      await expect(tid(page, 'pause-menu')).toBeVisible();
    },
  },
  {
    name: 'result',
    title: '결과',
    root: 'lib',
    go: async (page) => {
      await info(page);
      await click(page, 'sync-auto');
      await expect(tid(page, 'result-screen')).toHaveAttribute('data-settled', 'true', { timeout: 120_000 });
    },
  },
  {
    name: 'result:details',
    title: '결과 › 상세',
    root: 'lib',
    go: async (page) => {
      await info(page);
      await click(page, 'sync-auto');
      await expect(tid(page, 'result-screen')).toHaveAttribute('data-settled', 'true', { timeout: 120_000 });
      await click(page, 'result-details');
    },
  },
  {
    name: 'editor',
    title: '채보 에디터',
    root: 'lib',
    go: async (page) => {
      await info(page);
      await click(page, 'edit-chart');
      await expect(tid(page, 'editor-screen')).toBeVisible();
    },
  },
  {
    name: 'editor+menu',
    title: '채보 에디터 › 편집 메뉴',
    root: 'lib',
    go: async (page) => {
      await info(page);
      await click(page, 'edit-chart');
      await click(page, 'editor-edit-menu');
    },
  },
];

/** Opens the game on the state. */
export async function enter(page: Page, st: NamedState, base: string): Promise<void> {
  const stored = st.settings ? JSON.stringify({ ...(JSON.parse(base) as object), ...st.settings }) : base;
  if (st.fakeSongs) {
    // (openRoot takes the routes off first: put on by the reload below)
    await openRoot(page, st.root, stored);
    const songs = fakeSongList(st.fakeSongs);
    await page.route(/^https?:\/\/[^/]+\/api\/songs$/, (route) => route.fulfill({ json: { songs } }));
    await page.reload();
    await expect(page.locator('[data-testid="song-item"]').first()).toBeVisible({ timeout: 30_000 });
  } else {
    await openRoot(page, st.root, stored);
  }
  await st.go(page);
  await stable(page, 400, 5000);
}
