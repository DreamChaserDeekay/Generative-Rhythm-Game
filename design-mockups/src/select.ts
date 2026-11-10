import { preview, sfx } from './audio';
import { ICON, MARK, coverOf, jacket, lampMark, washOf } from './art';
import { MODES, SECTION_KO, TIERS, bpmText, detailOf, recordOf, songs, type SongDetail, type SongEntry, type Tier } from './data';
import { clamp, clock, el, esc, kbd } from './dom';
import { playOptionRows, syncRows, type Row } from './inventory';
import { RowList } from './rows';
import { SongInfo } from './songinfo';
import type { Stage } from './stage';
import { favorites, mediaOf, onSettings, state } from './state';

type SortKey = 'title' | 'artist' | 'album';
const FILTERS: { id: 'all' | SortKey | 'fav'; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'title', label: '곡명' },
  { id: 'artist', label: '아티스트명' },
  { id: 'album', label: '앨범명' },
  { id: 'fav', label: '즐겨찾기' },
];
const ADD_ITEMS: [string, string][] = [
  ['음악 파일', 'mp3 · ogg · wav · flac · m4a'],
  ['데모 곡', '합성한 128 BPM 곡'],
  ['채보 가져오기 · 파일', '.osz · .zip · .osu · .bms · .bmson'],
  ['채보 가져오기 · 폴더', 'BMS · bmson 폴더 (키음 포함)'],
  ['리플레이 파일 보기', '결과 화면에서 내보낸 .grgreplay.json'],
];
const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.bmp,image/*';
const VIDEO_ACCEPT = '.mp4,.webm,.m4v,.mov,.ogv,video/*';
/** The wheel, in rem: the picked row's half height and its neighbours' pitch, and how far a row leans out per step away. */
const ROW_NEAR = 4.5;
const ROW_STEP = 3.5;
const ARC = 0.32;
const FADE = [1, 0.94, 0.8, 0.62, 0.42];

interface SheetItem {
  label: string;
  sub?: string;
  /** The key that does the same from the list (shown at the row's end). */
  cap?: string;
  /** A value changed with ←→ in the sheet. */
  value?: () => string;
  step?: (dir: 1 | -1, big: boolean) => void;
  run?: () => void;
  disabled?: boolean;
}
interface Sheet {
  title: string;
  sub?: string;
  items: SheetItem[];
  note?: string;
  at: number;
  atJacket?: boolean;
  /** A line of text is being typed (a YouTube link). */
  input?: { placeholder: string; submit: (text: string) => void };
}

/**
 * Song select. The song is its jacket: the picked one stands large on the left with what there is
 * to decide about it (the difficulty, how it will be played), and the library is the wheel on the
 * right. Everything else about a song is a key away (곡 정보·도구), not on this screen.
 */
export class SelectScreen {
  readonly root = el('section', 'screen select');
  private rows: HTMLElement[] = [];
  private order: number[] = [];
  private scope: 'all' | 'fav' = 'all';
  private sort: { key: SortKey; dir: 'desc' | 'asc' } | null = null;
  private query = '';
  private searching = false;
  /** The song picked when the search began (Esc goes back to it). */
  private searchFrom = -1;
  private detail: SongDetail | null = null;
  private shownSong = -1;
  private active = false;
  private raf = 0;
  private toastTimer = 0;
  private previewTimer = 0;
  private washAt = 0;
  private sheet: Sheet | null = null;
  private optRows: Row[] = playOptionRows();
  private optList: RowList | null = null;
  private info: SongInfo;
  /** The practice stretch, in bars of the song (연습 모드). */
  private practice = { from: 0, to: 0, song: -1 };
  private fileInput = el('input');
  onPlay: (auto: boolean) => void = () => undefined;
  onConfig: () => void = () => undefined;

  constructor(stage: Stage) {
    this.root.innerHTML = `
      <div class="backdrop"><i></i><i></i></div>
      <header class="top">
        <div class="mark">${MARK}<span>GENERATIVE RHYTHM</span></div>
        <nav class="modes">${MODES.map((m) => `<button data-mode="${m}"><span>${m}</span></button>`).join('')}<span class="modes-key">${kbd('Tab')}</span></nav>
        <div class="end"><button class="top-act" data-key="F10">설정 ${kbd('F10')}</button></div>
      </header>
      <div class="info">
        <div class="hero">
          <div class="jk-box">
            <div class="jk-slot"></div>
            <button class="jk-btn video" data-key="KeyV" title="배경 영상">${ICON.film}<span data-video></span>${kbd('V')}</button>
            <button class="jk-btn edit" data-key="KeyC" title="커버 수정">${ICON.pencil}${kbd('C')}</button>
          </div>
          <div class="ident">
            <button class="fav" data-key="F3" title="즐겨찾기 (F3)"></button>
            <div class="album" data-album></div>
            <h1 data-title></h1>
            <div class="artist" data-artist></div>
            <div class="meta">
              <div><span class="cap en">BPM</span><b class="num" data-bpm></b><i class="beat"></i></div>
              <div><span class="cap">길이</span><b class="num" data-len></b></div>
            </div>
          </div>
        </div>
        <div class="tiers"></div>
        <div class="facts">
          <div><span class="cap">노트</span><b class="num" data-notes></b></div>
          <div><span class="cap">평균 / 최대 NPS</span><b class="num" data-nps></b></div>
          <div><span class="cap">세부 난이도</span><b class="num" data-rating></b></div>
          <div class="best" data-best></div>
        </div>
        <button class="quick" data-key="Space">
          <span class="quick-head"><span>플레이 옵션</span>${kbd('Space')}</span>
          <span class="quick-cell"><span class="cap">노트 속도</span><b class="num" data-speed></b></span>
          <span class="quick-cell"><span class="cap">배치</span><b data-place></b></span>
          <span class="quick-cell"><span class="cap">FEVER</span><b data-fever></b></span>
        </button>
      </div>
      <div class="opts">
        <div class="opts-song"></div>
        <div class="opts-head"><b>플레이 옵션</b><span>다음 플레이에 적용됩니다</span></div>
        <div class="opts-rows"></div>
        <p class="opts-help"></p>
      </div>
      <div class="filters"></div>
      <div class="wheel"></div>
      <div class="wheel-empty"></div>
      <div class="toast"></div>
      <footer class="hints"></footer>
      <div class="sheet"></div>`;
    const wheel = this.q('.wheel');
    songs.forEach((song, i) => {
      const row = el('div', 'wrow');
      row.dataset.i = String(i);
      row.innerHTML = `<span class="wplate"></span><span class="wjk"></span><span class="wtext"><b>${esc(song.title)}</b><span></span></span><span class="wfav">${ICON.starOn}</span><span class="wlv"></span>`;
      wheel.append(row);
      this.rows.push(row);
    });
    this.fileInput.type = 'file';
    this.fileInput.hidden = true;
    this.root.append(this.fileInput);
    this.info = new SongInfo(this.root, stage);
    this.info.onClose = () => {
      this.root.classList.toggle('reading', this.info.open);
      this.hints();
    };
    this.info.onToast = (text) => this.toast(text);
    this.info.onTier = () => {
      this.drawWheel();
      this.drawTier();
    };
    this.root.addEventListener('click', (e) => this.click(e));
    window.addEventListener('resize', () => this.active && this.place());
    onSettings(() => this.active && this.drawQuick());
    this.wirePractice();
  }

  private get song(): SongEntry {
    return songs[state.song];
  }
  /** A line of text is being typed: keys are the field's. */
  get takesText(): boolean {
    return this.searching || Boolean(this.sheet?.input);
  }
  private q<T extends HTMLElement>(s: string): T {
    return this.root.querySelector(s) as T;
  }
  private get mode(): 'list' | 'opts' | 'info' {
    return this.info.open ? 'info' : this.root.classList.contains('opting') ? 'opts' : 'list';
  }

  enter(): void {
    this.active = true;
    this.root.classList.add('on');
    this.reorder();
    this.refresh(true);
    this.info.resume();
    const tick = () => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(tick);
      this.beat();
    };
    this.raf = requestAnimationFrame(tick);
  }

  leave(): void {
    this.active = false;
    this.root.classList.remove('on');
    cancelAnimationFrame(this.raf);
    clearTimeout(this.previewTimer);
    this.closeSheet();
    this.info.pause();
  }

  // ── the library: which songs, in what order ───────────────────────────────────────────────

  private reorder(): void {
    const q = this.query.trim().toLowerCase();
    const list = songs.map((_, i) => i).filter((i) => (this.scope === 'fav' ? favorites.has(i) : true) && (!q || `${songs[i].title} ${songs[i].artist}`.toLowerCase().includes(q)));
    if (this.sort) {
      const { key, dir } = this.sort;
      const order = new Intl.Collator(['ko', 'en'], { sensitivity: 'base', numeric: true });
      list.sort((a, b) => {
        const [x, y] = [songs[a][key], songs[b][key]];
        // a song without the name it is ordered by stays at the end, whichever way the order runs
        if (!x || !y) return x ? -1 : y ? 1 : a - b;
        return (dir === 'asc' ? 1 : -1) * order.compare(x, y) || a - b;
      });
    }
    this.order = list;
    if (list.length > 0 && !list.includes(state.song)) state.song = list[0];
  }

  /** A press on a filter: 전체 and 즐겨찾기 choose which songs, the three names order them (내림차순, 오름차순, off). */
  private filter(i: number): void {
    const f = FILTERS[i];
    if (!f) return;
    let said = '';
    if (f.id === 'all' || f.id === 'fav') {
      const next = f.id === 'all' ? 'all' : this.scope === 'fav' ? 'all' : 'fav';
      if (next === this.scope) return sfx('edge');
      this.scope = next;
      said = next === 'fav' ? '즐겨찾기한 곡만' : '모든 곡';
    } else if (this.sort?.key !== f.id) {
      this.sort = { key: f.id, dir: 'desc' };
      said = `${f.label} 내림차순`;
    } else if (this.sort.dir === 'desc') {
      this.sort = { key: f.id, dir: 'asc' };
      said = `${f.label} 오름차순`;
    } else {
      this.sort = null;
      said = `${f.label} 정렬 해제 · 추가한 순서`;
    }
    sfx('tab');
    this.reorder();
    this.refresh(false);
    this.toast(said, 1300);
  }

  private drawFilters(): void {
    const chips = FILTERS.map((f, i) => {
      const on = f.id === 'all' ? this.scope === 'all' : f.id === 'fav' ? this.scope === 'fav' : this.sort?.key === f.id;
      const arrow = f.id !== 'all' && f.id !== 'fav' && this.sort?.key === f.id ? `<i class="dir" title="${this.sort.dir === 'desc' ? '내림차순' : '오름차순'}">${this.sort.dir === 'desc' ? ICON.down : ICON.up}</i>` : '';
      return `<button class="chip${on ? ' on' : ''}" data-key="Digit${i + 1}">${kbd(String(i + 1))}<span>${f.label}</span>${arrow}</button>`;
    }).join('');
    const find = this.searching
      ? `<label class="find on">${ICON.search}<input type="text" spellcheck="false" placeholder="제목 · 아티스트" value="${esc(this.query)}" /></label>`
      : `<button class="find${this.query ? ' has' : ''}" data-key="Slash" title="제목 · 아티스트 검색">${ICON.search}${this.query ? `<span>${esc(this.query)}</span>` : ''}${kbd('/')}</button>`;
    this.q('.filters').innerHTML = `${chips}<span class="filters-end">${find}</span>`;
    if (this.searching) {
      const input = this.q<HTMLInputElement>('.find input');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('input', () => {
        this.query = input.value;
        this.reorder();
        this.refresh(false, true);
      });
      input.addEventListener('blur', () => this.searching && this.endSearch(false));
    }
  }

  private endSearch(clear: boolean): void {
    this.searching = false;
    const before = state.song;
    if (clear) {
      this.query = '';
      if (this.searchFrom >= 0) state.song = this.searchFrom;
    }
    this.reorder();
    this.refresh(state.song !== before);
  }

  // ── drawing ──────────────────────────────────────────────────────────────────────────────

  /** Brings the screen up to date. `songChanged`: the picked song's own parts are drawn anew and its preview starts. */
  private refresh(songChanged: boolean, typing = false): void {
    const empty = this.order.length === 0;
    this.root.classList.toggle('empty', empty);
    if (!typing) this.drawFilters();
    this.q('.wheel-empty').innerHTML = empty ? (this.query ? `<b>'${esc(this.query)}'에 맞는 곡이 없습니다</b><span>${kbd('Esc')} 검색 지우기</span>` : `<b>즐겨찾기한 곡이 없습니다</b><span>곡에서 ${kbd('F3')}으로 넣습니다 · ${kbd('1')} 전체 보기</span>`) : '';
    this.root.querySelectorAll<HTMLElement>('.modes [data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
    this.drawWheel();
    if (!empty) {
      if (songChanged || this.shownSong !== state.song) this.drawSong();
      this.drawTier();
    }
    this.drawQuick();
    this.hints();
  }

  private drawWheel(): void {
    this.rows.forEach((row, i) => {
      const song = songs[i];
      const second = this.sort?.key === 'album' ? song.album || '앨범 정보 없음' : song.artist;
      const sub = row.querySelector('.wtext span') as HTMLElement;
      if (sub.textContent !== second) sub.textContent = second;
      const jk = row.querySelector('.wjk') as HTMLElement;
      const cover = coverOf(song) ?? '';
      if (jk.dataset.cover !== cover) {
        jk.dataset.cover = cover;
        jk.innerHTML = jacket(song);
      }
      row.classList.toggle('is-fav', favorites.has(i));
      const c = song.charts[state.mode][state.tier];
      const lv = row.querySelector('.wlv') as HTMLElement;
      lv.dataset.tier = state.tier;
      lv.innerHTML = `${lampMark(recordOf(i, state.tier)?.lamp ?? null)}<b class="num">${c.level}</b>`;
    });
    this.place();
  }

  /** Each row to its place on the wheel: the picked song in the middle, the others leaning away from it. */
  private place(): void {
    const at = this.order.indexOf(state.song);
    const arc = (document.getElementById('app') as HTMLElement).dataset.wheel === 'flat' ? 0 : ARC;
    this.rows.forEach((row, i) => {
      const pos = this.order.indexOf(i);
      if (pos < 0) {
        row.classList.remove('on');
        row.style.opacity = '0';
        row.style.visibility = 'hidden';
        return;
      }
      const d = pos - at;
      const ad = Math.abs(d);
      const y = d === 0 ? 0 : Math.sign(d) * (ROW_NEAR + (ad - 1) * ROW_STEP);
      row.style.transform = `translate(${(arc * d * d).toFixed(3)}rem, ${y}rem)`;
      row.style.opacity = String(FADE[ad] ?? 0);
      row.style.visibility = ad > 5 ? 'hidden' : 'visible';
      row.classList.toggle('on', d === 0);
    });
  }

  private drawSong(): void {
    const song = this.song;
    this.shownSong = state.song;
    this.detail = null;
    void detailOf(song).then((d) => {
      if (this.song === song) this.detail = d;
    });
    const hero = this.q('.hero');
    this.q('.jk-slot').innerHTML = jacket(song);
    this.q('[data-album]').textContent = song.album;
    const title = this.q('[data-title]');
    title.textContent = song.title;
    // a short name is set large, a long one smaller: three sizes, never more than three lines
    title.dataset.size = song.title.length <= 12 ? 'l' : song.title.length <= 22 ? 'm' : 's';
    this.q('[data-artist]').textContent = song.artist;
    this.q('[data-bpm]').textContent = bpmText(song);
    this.q('[data-len]').textContent = clock(song.durationMs);
    this.drawMedia();
    // the song arrives: a short settle, not a show
    hero.classList.remove('arrive');
    void hero.offsetWidth;
    hero.classList.add('arrive');
    this.wash();
    clearTimeout(this.previewTimer);
    // the preview starts once the cursor rests on a song
    this.previewTimer = window.setTimeout(() => this.active && this.song === song && void preview.play(song.id, song.previewMs), 220);
    if (this.practice.song !== state.song) this.practice = { from: 0, to: 0, song: -1 };
  }

  /** What hangs on the jacket: the favourite, and whether a background video is registered. */
  private drawMedia(): void {
    const m = mediaOf(this.song.id);
    const fav = this.q('.fav');
    fav.innerHTML = favorites.has(state.song) ? ICON.starOn : ICON.star;
    fav.classList.toggle('on', favorites.has(state.song));
    const video = this.q('.jk-btn.video');
    video.classList.toggle('has', Boolean(m.video));
    this.q('[data-video]').textContent = m.video ? (m.video.kind === 'youtube' ? '유튜브' : '등록됨') : '배경 영상';
  }

  /** The screen behind takes the jacket's colours (one of two layers, cross-faded). */
  private wash(): void {
    const layers = this.root.querySelectorAll<HTMLElement>('.backdrop i');
    const url = coverOf(this.song);
    const song = this.song;
    const show = (data: string | null) => {
      if (this.song !== song) return;
      this.washAt = 1 - this.washAt;
      layers[this.washAt].style.backgroundImage = data ? `url(${data})` : 'none';
      layers[this.washAt].classList.add('on');
      layers[1 - this.washAt].classList.remove('on');
    };
    if (url) void washOf(url).then(show);
    else show(null);
  }

  private drawTier(): void {
    const song = this.song;
    this.q('.tiers').innerHTML = TIERS.map((t, i) => {
      const c = song.charts[state.mode][t];
      return `<button class="tier${t === state.tier ? ' on' : ''}" data-tier="${t}" data-tier-i="${i}"><span class="tier-in"><span class="tier-name">${t}</span>${lampMark(recordOf(state.song, t)?.lamp ?? null)}<b class="num">${c.level}</b></span></button>`;
    }).join('');
    const c = song.charts[state.mode][state.tier];
    this.q('[data-notes]').textContent = c.noteCount.toLocaleString('en-US');
    this.q('[data-nps]').textContent = `${c.nps.avg} / ${c.nps.peak}`;
    this.q('[data-rating]').textContent = c.rating.toFixed(2);
    const best = recordOf(state.song, state.tier);
    this.q('[data-best]').innerHTML = best
      ? `<span class="cap en best-lamp">${lampMark(best.lamp)}${best.lamp}</span><b class="num">${best.rate.toFixed(2)}<small>%</small></b>`
      : `<span class="cap en">BEST</span><b class="none">기록 없음</b>`;
    this.root.dataset.tier = state.tier;
  }

  private drawQuick(): void {
    const text = (label: string) => {
      const r = this.optRows.find((x) => x.label === label) as Row;
      return r.kind === 'number' ? (r.value === null ? '자동' : r.format(r.value)) : (r.values[r.value ?? 0] ?? '');
    };
    // the rows follow the settings (a play changes the speed, the settings screen the rest)
    syncRows(this.optRows);
    this.q('[data-speed]').textContent = text('노트 속도');
    this.q('[data-place]').textContent = text('배치');
    this.q('[data-fever]').textContent = text('FEVER').replace(/ \(.*\)$/, '');
  }

  /** The dot by the BPM ticks with the song's analysed beats while its preview plays. */
  private beat(): void {
    const beats = this.detail?.beats;
    const now = preview.songMs();
    let v = 0;
    if (beats && now !== null) {
      let lo = 0;
      let hi = beats.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] <= now) lo = mid + 1;
        else hi = mid;
      }
      const last = beats[lo - 1];
      if (last !== undefined && now - last < 160) v = 1 - (now - last) / 160;
    }
    (this.q('.beat') as HTMLElement).style.opacity = (0.22 + 0.78 * v).toFixed(2);
  }

  private hints(): void {
    const item = (keys: string[], label: string, code?: string) => `<button data-key="${code ?? keys[0]}">${kbd(...keys)}${label}</button>`;
    const foot = this.q('.hints');
    if (this.mode === 'info') foot.innerHTML = this.info.hints();
    else if (this.mode === 'opts')
      foot.innerHTML = `${item(['↑', '↓'], '항목', 'ArrowDown')}${item(['←', '→'], '값', 'ArrowRight')}<span>${kbd('Shift')}큰 단계</span><span class="end">${item(['Space'], '닫기', 'Space')}<button class="go" data-key="Enter">${kbd('Enter')}<span>${this.practising ? '연습 시작' : '플레이'}</span></button></span>`;
    else if (this.order.length === 0) foot.innerHTML = `${item(['1'], '전체', 'Digit1')}${item(['/'], '검색', 'Slash')}<span class="end">${item(['Esc'], '메뉴', 'Escape')}</span>`;
    else
      foot.innerHTML = `${item(['↑', '↓'], '곡', 'ArrowDown')}${item(['←', '→'], '난이도', 'ArrowRight')}${item(['Tab'], '키 모드', 'Tab')}${item(['Space'], '플레이 옵션', 'Space')}${item(['I'], '곡 정보·도구', 'KeyI')}<span class="end">${item(['Esc'], '메뉴', 'Escape')}<button class="go" data-key="Enter">${kbd('Enter')}<span>${this.practising ? '연습 시작' : '플레이'}</span></button></span>`;
  }

  /** Where the picked song's jacket stands (the play's card takes it from there). */
  jacketRect(): DOMRect | null {
    return this.mode === 'list' ? this.q('.jk-slot').getBoundingClientRect() : null;
  }

  /** The wheel is laid out anew (one of the mockup's side-by-side choices changed). */
  relayout(): void {
    this.place();
  }

  toast(text: string, ms = 2600): void {
    const t = this.q('.toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('on'), ms);
  }

  // ── the play options, in place ───────────────────────────────────────────────────────────

  /** 연습 모드's stretch of the song: a row of its own, moved a bar at a time. */
  private wirePractice(): void {
    const mode = this.optRows.find((r) => r.label === '연습 모드') as Row;
    const at = this.optRows.indexOf(mode);
    const bars = () => this.detail?.downbeats ?? [];
    const range = () => {
      const b = bars();
      if (this.practice.song !== state.song && b.length > 1) {
        // the song's first chorus, or its first section
        const s = this.song.sketch.sections.find((x) => x.label === 'chorus') ?? this.song.sketch.sections[0];
        const from = Math.max(0, b.findIndex((t) => t >= (s?.t ?? 0) - 40));
        const to = b.findIndex((t) => t >= (s?.endT ?? this.song.durationMs) - 40);
        this.practice = { from, to: to < 0 ? b.length - 1 : Math.max(from + 1, to), song: state.song };
      }
      return this.practice;
    };
    const stamp = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(1).padStart(4, '0')}`;
    const row: Row = {
      label: '구간',
      kind: 'custom',
      help: '←→ 구간을 한 마디씩 옮기고, Shift+←→ 한 마디씩 늘이거나 줄입니다.',
      values: [],
      min: 0,
      max: 0,
      step: 1,
      bigStep: 1,
      format: String,
      value: 0,
      initial: 0,
      when: () => mode.value === 0,
      render: () => {
        const b = bars();
        if (b.length < 2) return '<span class="v">곡을 읽는 중…</span>';
        const p = range();
        const [t0, t1] = [b[p.from], b[p.to] ?? this.song.durationMs];
        const dur = this.song.durationMs;
        const name = this.song.sketch.sections.find((s) => t0 >= s.t - 40 && t0 < s.endT - 40);
        return `<span class="span-map"><i style="left:${(t0 / dur) * 100}%;width:${((t1 - t0) / dur) * 100}%"></i></span><i class="rl-arr">${ICON.left}</i><span class="v num">${stamp(t0)} – ${stamp(t1)}</span><i class="rl-arr">${ICON.right}</i>${name ? `<span class="span-name">${SECTION_KO[name.label] ?? name.label}</span>` : ''}`;
      },
      onKey: (dir, big) => {
        const b = bars();
        if (b.length < 2) return;
        const p = range();
        if (big) p.to = clamp(p.to + dir, p.from + 1, b.length - 1);
        else {
          const len = p.to - p.from;
          p.from = clamp(p.from + dir, 0, b.length - 1 - len);
          p.to = p.from + len;
        }
        sfx('slide');
      },
    };
    this.optRows.splice(at + 1, 0, row);
  }

  private openOptions(): void {
    if (this.order.length === 0) return sfx('edge');
    this.root.classList.add('opting');
    const song = this.song;
    const c = song.charts[state.mode][state.tier];
    this.q('.opts-song').innerHTML = `${jacket(song)}<div><b>${esc(song.title)}</b><span>${esc(song.artist)}</span></div><span class="chip-tier" data-tier="${state.tier}">${state.tier}<b class="num">${c.level}</b></span>`;
    this.drawQuick();
    this.optList = new RowList(this.q('.opts-rows'), this.optRows, {
      passEnter: true,
      onFocus: (r) => (this.q('.opts-help').textContent = r?.help ?? ''),
      onChange: () => {
        this.drawQuick();
        this.hints();
      },
    });
    sfx('open');
    this.hints();
  }

  private closeOptions(sound = true): void {
    if (!this.root.classList.contains('opting')) return;
    this.root.classList.remove('opting');
    this.optList?.dispose();
    this.optList = null;
    if (sound) sfx('back');
    this.drawQuick();
    this.hints();
  }

  // ── sheets ───────────────────────────────────────────────────────────────────────────────

  private openSheet(sheet: Omit<Sheet, 'at'>): void {
    this.sheet = { ...sheet, at: Math.max(0, sheet.items.findIndex((i) => !i.disabled)) };
    this.drawSheet(true);
    sfx('open');
  }

  private closeSheet(sound = false): void {
    if (!this.sheet) return;
    this.sheet = null;
    this.q('.sheet').classList.remove('on');
    this.q('.sheet').innerHTML = '';
    if (sound) sfx('back');
  }

  private drawSheet(fresh = false): void {
    const s = this.sheet;
    if (!s) return;
    const box = this.q('.sheet');
    box.classList.add('on');
    const items = s.items
      .map((it, i) => {
        const on = i === s.at && !s.input;
        const right = it.value ? `<span class="right">${on ? `<i class="rl-arr on">${ICON.left}</i>` : ''}<b class="num">${esc(it.value())}</b>${on ? `<i class="rl-arr on">${ICON.right}</i>` : ''}</span>` : it.cap ? `<span class="right">${kbd(it.cap)}</span>` : '';
        return `<button class="${on ? 'on' : ''}" data-sheet="${i}"${it.disabled ? ' disabled' : ''}><span>${esc(it.label)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}${right}</button>`;
      })
      .join('');
    const input = s.input ? `<label class="sheet-input"><input type="text" inputmode="url" spellcheck="false" placeholder="${esc(s.input.placeholder)}" /></label>` : '';
    const foot = s.input
      ? `<span>${kbd('Enter')}등록</span><span>${kbd('Esc')}취소</span>`
      : `<span>${kbd('↑', '↓')}고르기</span>${s.items.some((i) => i.step) ? `<span>${kbd('←', '→')}값</span>` : ''}<span>${kbd('Enter')}결정</span><span>${kbd('Esc')}닫기</span>`;
    box.innerHTML = `<div class="sheet-box${s.atJacket ? ' at-jacket' : ''}${fresh ? ' fresh' : ''}"><div class="sheet-head"><b>${esc(s.title)}</b>${s.sub ? `<span>${esc(s.sub)}</span>` : ''}</div><div class="sheet-items">${items}</div>${input}${s.note ? `<p class="sheet-note">${s.note}</p>` : ''}<div class="sheet-foot">${foot}</div></div>`;
    if (s.input) box.querySelector('input')?.focus();
  }

  private sheetKey(e: KeyboardEvent): boolean {
    const s = this.sheet as Sheet;
    const code = e.code;
    if (s.input) {
      if (code === 'Escape') {
        s.input = undefined;
        this.drawSheet();
        sfx('back');
        return true;
      }
      if (code === 'Enter' || code === 'NumpadEnter') {
        const text = (this.q('.sheet input') as HTMLInputElement).value.trim();
        if (text) s.input.submit(text);
        else sfx('edge');
        return true;
      }
      return false;
    }
    const it = s.items[s.at];
    if (code === 'Escape') this.closeSheet(true);
    else if (code === 'ArrowUp' || code === 'ArrowDown') {
      const d = code === 'ArrowUp' ? -1 : 1;
      let next = s.at + d;
      while (s.items[next]?.disabled) next += d;
      if (!s.items[next]) return sfx('edge'), true;
      s.at = next;
      sfx('cursor');
      this.drawSheet();
    } else if ((code === 'ArrowLeft' || code === 'ArrowRight') && it?.step) {
      it.step(code === 'ArrowLeft' ? -1 : 1, e.shiftKey);
      sfx('slide');
      this.drawSheet();
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      if (it?.run) {
        sfx('confirm');
        it.run();
      } else sfx('edge');
    }
    return true;
  }

  /** Asks for a file of the player's (it stays in this browser: the mockup has no server to keep it). */
  private pickFile(accept: string, done: (file: File) => void): void {
    const input = this.fileInput;
    input.accept = accept;
    input.value = '';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) done(file);
    };
    input.click();
  }

  /** 커버: the pencil on the jacket. */
  private openCover(): void {
    const song = this.song;
    const m = mediaOf(song.id);
    const has = coverOf(song) !== null;
    this.openSheet({
      title: '커버',
      sub: has ? '그림' : '디스크',
      atJacket: true,
      items: [
        {
          label: '커버 이미지 고르기',
          sub: 'png · jpg · webp · gif · bmp',
          run: () =>
            this.pickFile(IMAGE_ACCEPT, (file) => {
              if (m.cover) URL.revokeObjectURL(m.cover);
              m.cover = URL.createObjectURL(file);
              this.closeSheet();
              this.shownSong = -1;
              this.refresh(true);
              this.toast('커버를 바꿨습니다. 목록과 플레이 배경에 쓰입니다.');
            }),
        },
        {
          label: '지우기',
          disabled: !has,
          run: () => {
            if (m.cover) URL.revokeObjectURL(m.cover);
            m.cover = null;
            this.closeSheet();
            this.shownSong = -1;
            this.refresh(true);
            this.toast('커버를 지웠습니다. 곡을 이끄는 악기 색의 디스크로 돌아갑니다.');
          },
        },
      ],
      note: '목록과 플레이 배경에 쓰는 그림입니다. 지우면 곡을 이끄는 악기 색의 디스크로 돌아갑니다.',
    });
  }

  /** 배경 영상: a file or a YouTube link, how far it is shifted against the song, or its removal. */
  private openVideo(): void {
    const song = this.song;
    const m = mediaOf(song.id);
    const done = (text: string) => {
      this.closeSheet();
      this.drawMedia();
      this.toast(text);
    };
    const signed = (v: number) => `${v > 0 ? '+' : ''}${v}ms`;
    const items: SheetItem[] = m.video
      ? [
          {
            label: '영상 싱크',
            value: () => signed(m.videoOffsetMs),
            step: (dir, big) => (m.videoOffsetMs = clamp(m.videoOffsetMs + dir * (big ? 100 : 10), -5000, 5000)),
          },
          {
            label: '지우기',
            run: () => {
              if (m.video?.kind === 'file') URL.revokeObjectURL(m.video.url);
              m.video = null;
              m.videoOffsetMs = 0;
              done('배경 영상을 지웠습니다.');
            },
          },
        ]
      : [
          {
            label: '영상 고르기',
            sub: 'mp4 · webm',
            run: () =>
              this.pickFile(VIDEO_ACCEPT, (file) => {
                m.video = { kind: 'file', url: URL.createObjectURL(file), name: file.name };
                done('배경 영상을 등록했습니다. 플레이 배경에 나옵니다.');
              }),
          },
          {
            label: '유튜브 링크',
            sub: 'youtube.com/watch?v=… · youtu.be/…',
            run: () => {
              (this.sheet as Sheet).note = '유튜브 영상은 유튜브 플레이어로 재생돼 인터넷 연결이 필요합니다. 퍼가기를 막은 영상은 나오지 않고, 광고가 있는 영상은 광고가 먼저 나올 수 있습니다.';
              (this.sheet as Sheet).input = {
                placeholder: '유튜브 영상 링크',
                submit: (text) => {
                  if (!/(youtube\.com\/watch\?|youtu\.be\/)/.test(text)) return this.toast('유튜브 영상 링크가 아닙니다 (youtube.com/watch?v=… · youtu.be/…)');
                  m.video = { kind: 'youtube', url: text, name: text };
                  done('유튜브 영상을 등록했습니다.');
                },
              };
              this.drawSheet();
            },
          },
        ];
    this.openSheet({
      title: '배경 영상',
      sub: m.video ? (m.video.kind === 'youtube' ? '유튜브' : `등록됨 · ${m.video.name}`) : '없음',
      atJacket: true,
      items,
      note:
        m.video?.kind === 'youtube'
          ? '유튜브 영상은 유튜브 플레이어로 재생돼 인터넷 연결이 필요합니다. 퍼가기를 막은 영상은 나오지 않고, 광고가 있는 영상은 광고가 먼저 나올 수 있습니다.'
          : '플레이 화면의 배경에 깔리는 영상입니다. 영상 싱크는 ←→ 10ms, Shift+←→ 100ms씩 옮깁니다.',
    });
  }

  private openAdd(): void {
    this.openSheet({
      title: '곡 추가',
      sub: '음악 파일을 화면에 끌어다 놓아도 됩니다',
      items: ADD_ITEMS.map(([label, sub]) => ({
        label,
        sub,
        run: () => {
          this.closeSheet();
          this.toast(`'${label}': 시안에는 분석 서버가 없어 곡을 넣지 않습니다.`);
        },
      })),
    });
  }

  private openMenu(): void {
    const fav = favorites.has(state.song);
    const none = this.order.length === 0;
    const close = (run: () => void) => () => {
      this.closeSheet();
      run();
    };
    this.openSheet({
      title: '메뉴',
      items: [
        { label: '곡 추가', cap: '+', run: close(() => this.openAdd()) },
        { label: '무작위 선곡', cap: 'F2', disabled: none, run: close(() => this.random()) },
        { label: fav ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기', cap: 'F3', disabled: none, run: close(() => this.toggleFavorite()) },
        { label: '새 패턴 만들기', sub: `${state.mode} ${state.tier}`, cap: 'F5', disabled: none, run: close(() => this.newPattern()) },
        { label: '오토 플레이로 보기', sub: '기록은 남지 않습니다', cap: 'Shift+Enter', disabled: none, run: close(() => this.play(true)) },
        { label: '설정', cap: 'F10', run: close(() => this.onConfig()) },
      ],
    });
  }

  // ── what the keys do ─────────────────────────────────────────────────────────────────────

  private move(d: number): void {
    const at = this.order.indexOf(state.song);
    const next = clamp(at + d, 0, this.order.length - 1);
    if (next === at || this.order.length === 0) return sfx('edge');
    state.song = this.order[next];
    sfx('cursor');
    this.refresh(true);
  }

  private setTier(i: number): void {
    if (i < 0 || i >= TIERS.length) return sfx('edge');
    if (TIERS[i] === state.tier) return;
    state.tier = TIERS[i] as Tier;
    sfx('slide', 1, 0.94 + i * 0.03);
    this.refresh(false);
  }

  private setMode(i: number): void {
    state.mode = MODES[(i + MODES.length) % MODES.length];
    state.settings = { ...state.settings, lastKeyMode: state.mode };
    sfx('tab');
    this.refresh(false);
  }

  private random(): void {
    if (this.order.length < 2) return sfx('edge');
    let next = state.song;
    while (next === state.song) next = this.order[Math.floor(Math.random() * this.order.length)];
    state.song = next;
    sfx('confirm');
    this.refresh(true);
  }

  private toggleFavorite(): void {
    if (this.order.length === 0) return sfx('edge');
    const was = favorites.has(state.song);
    if (was) favorites.delete(state.song);
    else favorites.add(state.song);
    sfx(was ? 'off' : 'on');
    this.toast(was ? '즐겨찾기에서 뺐습니다' : '즐겨찾기에 넣었습니다', 1300);
    const kept = state.song;
    this.reorder();
    // the song just taken out of the favourites stays picked until the cursor leaves it
    if (this.scope === 'fav' && was && !this.order.includes(kept)) state.song = this.order[0] ?? kept;
    this.refresh(state.song !== kept);
    this.drawMedia();
  }

  private newPattern(): void {
    sfx('confirm');
    this.toast(`새 패턴: 서버가 ${this.song.title} ${state.tier} 채보를 다시 만듭니다. 시안에는 서버가 없어 그대로입니다.`);
  }

  private get practising(): boolean {
    return this.optRows.find((r) => r.label === '연습 모드')?.value === 0;
  }

  private play(auto: boolean): void {
    if (this.order.length === 0) return sfx('edge');
    // a practice run (a stretch of the song, slowed and looped) is the game's own and is not in the mockup
    if (this.practising && !auto) return this.toast('연습 플레이는 지금 게임의 것 그대로라 시안에는 넣지 않았습니다. 연습 모드를 끄면 플레이합니다.');
    this.closeOptions(false);
    this.onPlay(auto);
  }

  key(e: KeyboardEvent): boolean {
    const code = e.code;
    if (this.sheet) return this.sheetKey(e);
    if (this.searching) {
      if (code === 'Escape') this.endSearch(true);
      else if (code === 'Enter' || code === 'NumpadEnter' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'Tab') {
        this.endSearch(false);
        if (code === 'ArrowUp' || code === 'ArrowDown') this.move(code === 'ArrowUp' ? -1 : 1);
      } else return false;
      return true;
    }
    if (this.mode === 'info') {
      if (!this.info.key(e) && code === 'F10') this.onConfig();
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') return this.play(e.shiftKey), true;
    if (this.mode === 'opts') {
      if (code === 'Space' || code === 'Escape') this.closeOptions();
      else this.optList?.key(e);
      return true;
    }
    if (code === 'ArrowUp' || code === 'ArrowDown') this.move(code === 'ArrowUp' ? -1 : 1);
    else if (code === 'PageUp' || code === 'PageDown') this.move(code === 'PageUp' ? -5 : 5);
    else if (code === 'Home' || code === 'End') this.move(code === 'Home' ? -999 : 999);
    else if (code === 'ArrowLeft' || code === 'ArrowRight') this.setTier(TIERS.indexOf(state.tier) + (code === 'ArrowLeft' ? -1 : 1));
    else if (code === 'Tab') this.setMode(MODES.indexOf(state.mode) + (e.shiftKey ? -1 : 1));
    else if (/^(Digit|Numpad)[1-5]$/.test(code)) this.filter(Number(code.slice(-1)) - 1);
    else if (code === 'Slash') {
      this.searching = true;
      if (!this.query) this.searchFrom = state.song;
      sfx('open');
      this.drawFilters();
    } else if (code === 'Space') this.openOptions();
    else if (code === 'KeyI') {
      if (this.order.length === 0) return sfx('edge'), true;
      this.info.show();
      this.root.classList.add('reading');
      this.hints();
    } else if (code === 'KeyC') this.order.length ? this.openCover() : sfx('edge');
    else if (code === 'KeyV') this.order.length ? this.openVideo() : sfx('edge');
    else if (code === 'F2') this.random();
    else if (code === 'F3') this.toggleFavorite();
    else if (code === 'F5') this.order.length ? this.newPattern() : sfx('edge');
    else if (code === 'Equal' || code === 'NumpadAdd') this.openAdd();
    else if (code === 'F10') this.onConfig();
    else if (code === 'Escape') this.openMenu();
    else return false;
    return true;
  }

  private click(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (this.sheet) {
      const it = t.closest<HTMLElement>('[data-sheet]');
      if (it) {
        const i = Number(it.dataset.sheet);
        const item = this.sheet.items[i];
        if (item.disabled) return;
        this.sheet.at = i;
        if (item.run) item.run();
        else this.drawSheet();
      } else if (!t.closest('.sheet-box')) this.closeSheet(true);
      return;
    }
    if (this.mode !== 'list') return;
    const row = t.closest<HTMLElement>('.wrow');
    if (row) {
      const i = Number(row.dataset.i);
      if (i === state.song) return this.play(false);
      state.song = i;
      sfx('cursor');
      return this.refresh(true);
    }
    const tier = t.closest<HTMLElement>('[data-tier-i]');
    if (tier) return this.setTier(Number(tier.dataset.tierI));
    const mode = t.closest<HTMLElement>('[data-mode]');
    if (mode) this.setMode(MODES.indexOf(mode.dataset.mode as (typeof MODES)[number]));
  }
}
