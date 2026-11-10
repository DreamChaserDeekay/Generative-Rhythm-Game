import './styles.css';
import { loadKit, preview, setSfxLevel, sfx, unlock } from './audio';
import { ConfigScreen } from './config';
import { chartOf, detailOf, loadLibrary, songs } from './data';
import { el } from './dom';
import { NotesPage } from './notes';
import { PlayScreen } from './play';
import { SelectScreen } from './select';
import { SoundBoard } from './sound';
import { Stage } from './stage';
import { onSettings, state, type ScreenName } from './state';

const app = document.getElementById('app') as HTMLElement;

/**
 * Everything is drawn for a 1280 × 720 screen and grows with the window (1 rem = 16 px at 720p).
 * A window taller than 16:9 keeps the 16:9 frame across its width; a wider one gives the menus the room.
 */
function fit(): void {
  const box = app.parentElement as HTMLElement;
  const w = box.clientWidth;
  const h = Math.min(box.clientHeight, (w * 9) / 16);
  app.style.height = `${h}px`;
  app.style.top = `${Math.max(0, (box.clientHeight - h) / 2)}px`;
  const rem = (16 * h) / 720;
  document.documentElement.style.fontSize = `${rem}px`;
  // the track in the menus: 0.56 of its play size, its middle 15 rem from the right edge
  const s = 0.56;
  const x = w / 2 - 15 * rem;
  app.style.setProperty('--menu-s', String(s));
  app.style.setProperty('--menu-x', `${x}px`);
}

/** The screen's line runs up to the left end of the track's own line, wherever the camera puts it. */
function joinLine(stage: Stage): void {
  const ends = stage.lineEnds();
  if (!ends) return;
  const w = app.clientWidth;
  const s = Number(app.style.getPropertyValue('--menu-s'));
  const x = parseFloat(app.style.getPropertyValue('--menu-x'));
  const rem = parseFloat(document.documentElement.style.fontSize);
  const left = w / 2 + (ends.left - w / 2) * s + x;
  app.style.setProperty('--line-stop', `${w - left - rem * 0.375}px`);
}

const PAGES: [ScreenName, string][] = [
  ['select', '곡 선택'],
  ['config', '설정'],
  ['play', '플레이'],
  ['sound', '소리 고르기'],
  ['notes', '설명'],
];
/** How loud the preview plays under each screen. */
const BED: Record<ScreenName, number> = { select: 0.85, config: 0.5, play: 0, sound: 0, notes: 0.18 };

async function boot(): Promise<void> {
  fit();
  window.addEventListener('resize', fit);
  await loadLibrary();
  state.song = Math.min(state.song, songs.length - 1);

  const stageBox = el('div', 'stage');
  const canvas = el('canvas');
  stageBox.append(canvas);
  app.append(stageBox, el('div', 'the-line'), el('div', 'line-end'));
  const stage = new Stage(canvas, state.settings, state.mode);
  stage.clock = () => preview.songMs();
  stage.onLayout = () => joinLine(stage);
  stage.apply(state.settings, state.mode);
  stage.start();

  const select = new SelectScreen(stage);
  const config = new ConfigScreen();
  app.append(select.root, config.root);
  const play = new PlayScreen(app, stage);
  const sound = new SoundBoard();
  const notes = new NotesPage();
  app.append(sound.root, notes.root);
  const dock = el('nav', 'dock');
  const gate = el(
    'div',
    'gate',
    `<div><b>한 줄</b><span>Generative Rhythm · 곡 선택 · 설정 · 플레이 디자인 시안</span><p>키보드로 조작합니다. 화면 아래 줄에 지금 쓸 수 있는 키가 늘 보이고, 그 키들은 눌러도(클릭) 됩니다.<br />위 가운데의 <i>시안</i> 줄에서 숫자 1–5로 다섯 쪽을 오갑니다. 소리가 납니다.</p><em>아무 키나 눌러 시작</em></div>`,
  );
  // on a screen too small to read the 16:9 frame: say so, in type that does not shrink with it
  const small = el('p', 'small-screen', '이 시안은 키보드로 조작하는 가로 화면용입니다. 1280 × 720보다 큰 창에서 열어 주세요.');
  app.append(dock, gate);
  (app.parentElement as HTMLElement).append(small);

  const screens = { select, config, play, sound, notes };
  let at: ScreenName = 'select';
  let unlocked = false;
  let bedBoost = 0;
  const bed = () => preview.setLevel(Math.max(BED[at], bedBoost) * (state.settings.musicVolume / 0.9));
  const drawDock = () => {
    dock.innerHTML = `<span class="cap">시안</span>${PAGES.map(([id, label], i) => `<button data-go="${id}" class="${id === at ? 'on' : ''}"><kbd>${i + 1}</kbd>${label}</button>`).join('')}`;
  };
  const go = (to: ScreenName, how?: { auto?: boolean }) => {
    if (to === at && to !== 'play') return;
    if (to === at) screens[at].leave();
    else screens[at].leave();
    at = to;
    app.dataset.screen = to;
    bedBoost = 0;
    if (to === 'play') {
      preview.cancel();
      play.enter(how?.auto ?? false);
    } else {
      screens[to].enter();
      bed();
      if (!preview.playing && unlocked) void preview.play(songs[state.song].id, songs[state.song].previewMs);
    }
    try {
      history.replaceState(null, '', `#${to === 'config' ? 'options' : to}`);
    } catch {
      // the hash is a convenience
    }
    drawDock();
  };
  select.onPlay = (auto) => go('play', { auto });
  select.onConfig = () => {
    sfx('open');
    go('config');
  };
  config.onDone = () => go('select');
  play.onLeave = () => go('select');
  sound.onDone = () => go('select');
  sound.onMusic = (on) => {
    bedBoost = on ? 0.7 : 0;
    bed();
  };
  notes.onDone = () => go('select');
  // a key mode changed in the settings: the track plays the picked song's chart of that mode
  let shown = `${state.mode}`;
  const followMode = () => {
    if (shown === state.mode) return;
    shown = state.mode;
    const song = songs[state.song];
    const [mode, tier] = [state.mode, state.tier];
    void detailOf(song).then((d) => state.mode === mode && songs[state.song] === song && stage.setChart(chartOf(song, d, mode, tier)));
  };
  onSettings(() => {
    stage.apply(state.settings, state.mode);
    followMode();
    setSfxLevel(state.settings.sfxVolume);
    if (at !== 'play') bed();
  });
  setSfxLevel(state.settings.sfxVolume);

  const open = async () => {
    if (unlocked) return;
    unlocked = true;
    gate.classList.add('gone');
    await unlock();
    sfx('confirm');
    if (at !== 'play') {
      bed();
      void preview.play(songs[state.song].id, songs[state.song].previewMs);
    }
  };

  /** A key, to the mockup's own navigation first and then to the screen it is on. */
  const handle = (e: KeyboardEvent): boolean => {
    const digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
    // the mockup's own keys: 1–5 jump between its pages (not while a play runs or a field takes text)
    if (digit && at !== 'play' && !e.altKey && !select.takesText && !config.takesKeys) {
      const to = PAGES[Number(digit[1]) - 1][0];
      if (to !== at) sfx('tab');
      go(to);
      return true;
    }
    return screens[at].key(e);
  };
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.metaKey || e.ctrlKey) return;
      if (!unlocked) {
        e.preventDefault();
        void open();
        return;
      }
      if (handle(e)) e.preventDefault();
    },
    { capture: true },
  );
  // a pointer does what the keys do: a key hint is its key
  app.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (!unlocked) return void open();
    const b = t.closest<HTMLElement>('[data-go]');
    if (b?.dataset.go) {
      if (b.dataset.go !== at) sfx('tab');
      return go(b.dataset.go as ScreenName);
    }
    const k = t.closest<HTMLElement>('[data-key]');
    if (k?.dataset.key) {
      const [code, shift] = k.dataset.key.startsWith('Shift+') ? [k.dataset.key.slice(6), true] : [k.dataset.key, false];
      const event = new KeyboardEvent('keydown', { code, key: code, shiftKey: shift, bubbles: true });
      // keys the running play takes itself (Esc) go to the window, as a pressed key does
      if (!handle(event) && at === 'play') window.dispatchEvent(event);
    }
  });

  const hash = location.hash.slice(1);
  const start = (hash === 'options' ? 'config' : hash) as ScreenName;
  app.dataset.screen = at;
  select.enter();
  drawDock();
  if (start !== 'select' && start !== 'play' && start in screens) go(start);
  await loadKit();
  (window as unknown as { __ready: boolean }).__ready = true;
}

void boot();
