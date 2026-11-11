import './styles.css';
import { preview, unlock } from './audio';
import { MARK } from './art';
import { ConfigScreen } from './config';
import { chartOf, detailOf, loadLibrary, songs } from './data';
import { el, kbd } from './dom';
import { NotesPage } from './notes';
import { PlayScreen } from './play';
import { SelectScreen } from './select';
import { Stage } from './stage';
import { onSettings, state, type ScreenName } from './state';

const app = document.getElementById('app') as HTMLElement;

/**
 * Everything is drawn for a 1280 × 720 screen and grows with the window (1 rem = 16 px at 720p).
 * A window taller than 16:9 keeps the 16:9 frame across its width.
 */
function fit(): void {
  const box = app.parentElement as HTMLElement;
  const w = box.clientWidth;
  const h = Math.min(box.clientHeight, (w * 9) / 16);
  const width = Math.min(w, (h * 16) / 9);
  app.style.height = `${h}px`;
  app.style.width = `${width}px`;
  app.style.left = `${(w - width) / 2}px`;
  app.style.top = `${Math.max(0, (box.clientHeight - h) / 2)}px`;
  document.documentElement.style.fontSize = `${(16 * h) / 720}px`;
}

/** How loud the song's preview plays under each screen. */
const BED: Record<ScreenName, number> = { select: 0.85, config: 0.5, play: 0, notes: 0.18 };
/** The mockup's two side-by-side choices: what is behind the song select, and how its list leans. */
const CHOICES = {
  backdrop: { key: 'F7', label: '배경', values: ['wash', 'plain'], names: { wash: '커버 색', plain: '단색' } },
  wheel: { key: 'F8', label: '목록', values: ['arc', 'flat'], names: { arc: '휠', flat: '직선' } },
} as const;

async function boot(): Promise<void> {
  fit();
  window.addEventListener('resize', fit);
  await loadLibrary();
  state.song = Math.min(state.song, songs.length - 1);
  app.dataset.backdrop = 'wash';
  app.dataset.wheel = 'arc';

  const stage = new Stage(state.settings, state.mode);
  stage.clock = () => preview.songMs();
  const select = new SelectScreen(stage);
  const config = new ConfigScreen(stage);
  app.append(select.root, config.root);
  const play = new PlayScreen(app);
  const notes = new NotesPage();
  app.append(notes.root);
  const dock = el('nav', 'dock');
  const gate = el(
    'div',
    'gate',
    `<div><div class="mark">${MARK}<span>GENERATIVE RHYTHM</span></div><h1>곡 선택 · 설정 · 플레이<br />디자인 시안 2</h1><p>키보드로 조작합니다. 화면 아래 줄에 지금 쓸 수 있는 키가 늘 보이고, 그 키들은 눌러도(클릭) 됩니다.</p><p><b>${kbd('F1')} 시안 설명</b> · <b>${kbd('F7')} 배경 후보</b> · <b>${kbd('F8')} 목록 후보</b>는 시안 전용 키입니다.<br />효과음은 이번 시안에서 뺐습니다. 곡 미리듣기와 플레이 음악만 납니다.</p><em><span>아무 키나 눌러 시작</span></em></div>`,
  );
  // on a screen too small to read the 16:9 frame: say so, in type that does not shrink with it
  const small = el('p', 'small-screen', '이 시안은 키보드로 조작하는 가로 화면용입니다. 1280 × 720보다 큰 창에서 열어 주세요.');
  app.append(dock, gate);
  (app.parentElement as HTMLElement).append(small);

  const screens = { select, config, play, notes };
  let at: ScreenName = 'select';
  let unlocked = false;
  const bed = () => preview.setLevel(BED[at] * (state.settings.musicVolume / 0.9));
  const drawDock = () => {
    dock.innerHTML = `<button data-key="F1" class="${at === 'notes' ? 'on' : ''}">${kbd('F1')}시안 설명${at === 'notes' ? ' 닫기' : ''}</button>`;
  };
  const go = (to: ScreenName, how?: { auto?: boolean }) => {
    if (to === at && to !== 'play') return;
    const jacketAt = at === 'select' && to === 'play' ? select.jacketRect() : null;
    screens[at].leave();
    at = to;
    app.dataset.screen = to;
    if (to === 'play') {
      preview.cancel();
      play.enter(how?.auto ?? false);
      play.arriveFrom(jacketAt);
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
  select.onConfig = () => go('config');
  config.onDone = () => go('select');
  play.onLeave = () => go('select');
  notes.onDone = () => go('select');
  notes.onChoice = (name) => choose(name);

  // the track in the menus plays the picked song's chart of the picked key mode
  let shown = '';
  const follow = () => {
    const key = `${state.song}|${state.mode}|${state.tier}`;
    if (shown === key || at !== 'config') return;
    shown = key;
    const song = songs[state.song];
    const [mode, tier] = [state.mode, state.tier];
    void detailOf(song).then((d) => state.mode === mode && songs[state.song] === song && at === 'config' && stage.setChart(chartOf(song, d, mode, tier)));
  };
  onSettings(() => {
    stage.apply(state.settings, state.mode);
    follow();
    if (at !== 'play') bed();
  });
  const enterConfig = config.enter.bind(config);
  config.enter = () => {
    enterConfig();
    shown = '';
    follow();
  };

  const names = () => ({
    backdrop: (CHOICES.backdrop.names as Record<string, string>)[app.dataset.backdrop ?? 'wash'],
    wheel: (CHOICES.wheel.names as Record<string, string>)[app.dataset.wheel ?? 'arc'],
  });
  const choose = (name: keyof typeof CHOICES): void => {
    const c = CHOICES[name];
    const now = app.dataset[name] ?? c.values[0];
    const next = c.values[(c.values.indexOf(now as never) + 1) % c.values.length];
    app.dataset[name] = next;
    notes.showChoices(names());
    if (at === 'select') {
      select.relayout();
      select.toast(`${c.label} 후보: ${(c.names as Record<string, string>)[next]}`, 1500);
    }
  };

  const open = async () => {
    if (unlocked) return;
    unlocked = true;
    gate.classList.add('gone');
    await unlock();
    if (at !== 'play') {
      bed();
      void preview.play(songs[state.song].id, songs[state.song].previewMs);
    }
  };

  /** A key, to the mockup's own first and then to the screen it is on. */
  const handle = (e: KeyboardEvent): boolean => {
    if (at !== 'play' && !select.takesText && !config.takesKeys) {
      if (e.code === 'F1') return go(at === 'notes' ? 'select' : 'notes'), true;
      if (e.code === CHOICES.backdrop.key) return choose('backdrop'), true;
      if (e.code === CHOICES.wheel.key) return choose('wheel'), true;
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
    // a pressed button keeps no focus (Space and Enter are the screen's keys, not the button's)
    const focused = document.activeElement as HTMLElement | null;
    if (focused && focused !== document.body && focused.tagName !== 'INPUT') focused.blur();
    const k = t.closest<HTMLElement>('[data-key]');
    if (k?.dataset.key) {
      const [code, shift] = k.dataset.key.startsWith('Shift+') ? [k.dataset.key.slice(6), true] : [k.dataset.key, false];
      const event = new KeyboardEvent('keydown', { code, key: code, shiftKey: shift, bubbles: true });
      // keys the running play takes itself (Esc) go to the window, as a pressed key does
      if (!handle(event) && at === 'play') window.dispatchEvent(event);
    }
  });

  notes.showChoices(names());
  const hash = location.hash.slice(1);
  const start = (hash === 'options' ? 'config' : hash) as ScreenName;
  app.dataset.screen = at;
  select.enter();
  drawDock();
  if (start !== 'select' && start !== 'play' && start in screens) go(start);
  // the jackets are ready before the wheel turns to them
  await Promise.all(
    songs
      .filter((s) => s.hasCover)
      .map(
        (s) =>
          new Promise<void>((done) => {
            const img = new Image();
            img.onload = img.onerror = () => done();
            img.src = `./covers/${s.id}.jpg`;
          }),
      ),
  );
  (window as unknown as { __ready: boolean }).__ready = true;
}

void boot();
