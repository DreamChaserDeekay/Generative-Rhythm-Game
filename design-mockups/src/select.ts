import type { SessionNote } from '@game/engine/session';
import { preview, sfx } from './audio';
import { MODES, SECTION_KO, STEMS, STEM_KO, TIERS, TIER_SHORT, bestLamp, bpmText, chartOf, detailOf, recordOf, songs, type ChartSummary, type SongDetail, type SongEntry, type Tier } from './data';
import { clamp, clock, el, esc, fitCanvas, kbd, token } from './dom';
import { playOptionTabs, type Row, type Tab } from './inventory';
import { RowsPane } from './rows';
import type { Stage } from './stage';
import { state } from './state';

const PLACEMENT_KO: Record<string, string> = { OFF: '정배치', MIRROR: '미러', RANDOM: '랜덤', 'R-RANDOM': 'R-랜덤', 'S-RANDOM': 'S-랜덤', 'H-RANDOM': 'H-랜덤' };
const FEVER_KO: Record<string, string> = { AUTO: '자동', MANUAL: '수동', OFF: '끔' };
const FOLDERS = ['전체', '즐겨찾기', '미플레이', '미클리어', '풀콤 미달'] as const;
const SORTS = ['추가순', '제목순', '아티스트순', 'BPM순', '레벨순', '램프순', 'RATE순', '최근 플레이순'] as const;
const LAMP_ORDER = ['FAILED', 'EASY CLEAR', 'CLEAR', 'HARD CLEAR', 'MAX COMBO', 'PERFECT PLAY'];
const ADD_ITEMS: [string, string][] = [
  ['음악 파일', 'mp3 · ogg · wav · flac · m4a'],
  ['데모 곡', '합성한 128 BPM 곡'],
  ['채보 가져오기 · 파일', '.osz · .zip · .osu · .bms · .bmson'],
  ['채보 가져오기 · 폴더', 'BMS · bmson 폴더 (키음 포함)'],
  ['리플레이 파일 보기', '결과 화면에서 내보낸 .grgreplay.json'],
];
const PATTERNS: [string, string][] = [
  ['stairs', '계단'],
  ['trills', '트릴'],
  ['chords', '동치'],
  ['jacks', '연타'],
  ['holdTaps', '롱잡'],
  ['leaps', '도약'],
];
const SKILLS: [string, string][] = [
  ['stream', '스트림'],
  ['chord', '동치'],
  ['jack', '연타'],
  ['longNote', '롱노트'],
  ['technical', '테크니컬'],
  ['stamina', '스태미나'],
];

/**
 * Song select. The list runs under the line: the song standing on it is the song picked, the five
 * steps of its difficulty stand on the line beside it, and the track plays the picked chart in time
 * with the preview. Above the line is what the analysis read in the song; under it, what to do.
 */
export class SelectScreen {
  readonly root = el('section', 'screen select');
  private rows: HTMLElement[] = [];
  private order: number[] = [];
  private folder = 0;
  private sort = 0;
  private query = '';
  private searching = false;
  private favorites = new Set<number>();
  private detail: SongDetail | null = null;
  private scope!: HTMLCanvasElement;
  private overview: HTMLCanvasElement | null = null;
  private overviewKey = '';
  private raf = 0;
  private pane: RowsPane | null = null;
  private paneKind: 'options' | 'info' | null = null;
  private addAt = -1;
  private active = false;
  private toastTimer = 0;
  onPlay: (auto: boolean) => void = () => undefined;
  onConfig: () => void = () => undefined;

  constructor(private stage: Stage) {
    this.root.innerHTML = `
      <header class="top">
        <div class="mark">${EMBLEM}<span>GENERATIVE RHYTHM</span></div>
        <span class="where">선곡</span>
        <div class="acts"><button data-key="Equal">곡 추가 ${kbd('+')}</button><button data-key="F10">설정 ${kbd('F10')}</button></div>
      </header>
      <div class="folders"></div>
      <div class="finder"><button class="find" data-key="Slash">${kbd('/')}<span class="find-text">제목·아티스트 검색</span></button><button data-key="F4"><span data-sort></span> ${kbd('F4')}</button></div>
      <div class="list-head"><span class="cap" data-pos></span><span class="cap">BPM</span><span class="lv cap">${TIERS.map((t) => `<span data-t="${t}">${TIER_SHORT[t]}</span>`).join('')}</span></div>
      <div class="list"></div>
      <div class="list-empty"></div>
      <div class="song">
        <div class="facts">
          <div><span class="cap">BPM</span><b class="num" data-bpm></b></div>
          <div><span class="cap">길이</span><b class="num" data-len></b></div>
          <div><span class="cap">박자</span><b class="num" data-meter></b></div>
        </div>
        <div class="scope"><canvas></canvas></div>
        <div class="chart-facts">
          <div><span class="cap">노트</span><b class="num" data-notes></b></div>
          <div><span class="cap">롱노트</span><b class="num" data-long></b></div>
          <div><span class="cap">평균 / 최대 NPS</span><b class="num" data-nps></b></div>
          <div><span class="cap">세부 난이도</span><b class="num" data-rating></b></div>
        </div>
        <div class="best"></div>
      </div>
      <div class="tiers"></div>
      <div class="under">
        <div class="chips">
          <div><span class="cap">노트 속도</span><b class="num" data-speed></b></div>
          <div><span class="cap">게이지</span><b class="num" data-gauge></b></div>
          <div><span class="cap">배치</span><b data-place></b></div>
          <div><span class="cap">FEVER</span><b data-fever></b></div>
        </div>
        <div class="go"><button class="btn" data-key="F5">새 패턴 ${kbd('F5')}</button><button class="btn main" data-key="Enter">플레이 ${kbd('Enter')}</button></div>
      </div>
      <div class="over-track">
        <div class="modes">${MODES.map((m) => `<span data-m="${m}">${m}</span>`).join('')}${kbd('Tab')}</div>
        <div class="now"><span class="cap">미리보기</span><b class="num" data-now></b><span data-section></span></div>
        <div class="stem-lamps"><span class="cap">노트가 따라가는 악기</span>${STEMS.map((s) => `<span class="cap" data-stem="${s}" style="--c:var(--stem-${s})"><i></i>${STEM_KO[s]}</span>`).join('')}</div>
      </div>
      <div class="pane-host"></div>
      <div class="add-menu"></div>
      <div class="toast"></div>
      <footer class="hints"></footer>`;
    this.scope = this.root.querySelector('.scope canvas') as HTMLCanvasElement;
    const list = this.root.querySelector('.list') as HTMLElement;
    songs.forEach((song, i) => {
      const row = el('div', 'srow');
      row.dataset.i = String(i);
      row.innerHTML = `<b class="mega"></b><i class="lamp" data-lamp="${bestLamp(i) ?? 'none'}"></i><canvas class="sig"></canvas><div class="name"><b>${esc(song.title)}</b><span>${esc(song.artist)}</span></div><span class="bpm num">${bpmText(song)}</span><span class="lv num"></span><i class="fav"></i>`;
      (row.querySelector('.mega') as HTMLElement).textContent = song.title;
      list.append(row);
      this.rows.push(row);
    });
    stage.onHit = (n) => this.flash(n);
    window.addEventListener('resize', () => this.active && this.refresh(false));
    this.root.addEventListener('click', (e) => this.click(e));
  }

  private get song(): SongEntry {
    return songs[state.song];
  }
  /** The search field is taking what is typed. */
  get takesText(): boolean {
    return this.searching;
  }
  private q<T extends HTMLElement>(s: string): T {
    return this.root.querySelector(s) as T;
  }

  enter(): void {
    this.active = true;
    this.root.classList.add('on');
    this.reorder();
    this.refresh(true);
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.active) return;
      this.raf = requestAnimationFrame(tick);
      this.drawScope();
    };
    this.raf = requestAnimationFrame(tick);
  }

  leave(): void {
    this.active = false;
    this.root.classList.remove('on');
    this.closePane();
    this.closeAdd();
    document.documentElement.style.setProperty('--beat', '0');
  }

  // ── the list ────────────────────────────────────────────────────────────────────────────

  private inFolder(i: number): boolean {
    const lamp = bestLamp(i);
    if (this.folder === 1) return this.favorites.has(i);
    if (this.folder === 2) return lamp === null;
    if (this.folder === 3) return lamp === 'FAILED';
    if (this.folder === 4) return lamp !== null && lamp !== 'MAX COMBO' && lamp !== 'PERFECT PLAY';
    return true;
  }

  /** The songs of the folder that match the search, in the order picked. */
  private reorder(): void {
    const q = this.query.trim().toLowerCase();
    const level = (i: number) => songs[i].charts[state.mode][state.tier].level;
    const lamp = (i: number) => LAMP_ORDER.indexOf(bestLamp(i) ?? '');
    const rate = (i: number) => recordOf(i, state.tier)?.rate ?? -1;
    const by: ((a: number, b: number) => number)[] = [
      (a, b) => a - b,
      (a, b) => songs[a].title.localeCompare(songs[b].title),
      (a, b) => songs[a].artist.localeCompare(songs[b].artist),
      (a, b) => songs[a].bpm - songs[b].bpm,
      (a, b) => level(a) - level(b),
      (a, b) => lamp(b) - lamp(a),
      (a, b) => rate(b) - rate(a),
      (a, b) => a - b,
    ];
    this.order = songs
      .map((_, i) => i)
      .filter((i) => this.inFolder(i) && (!q || songs[i].title.toLowerCase().includes(q) || songs[i].artist.toLowerCase().includes(q)))
      .sort((a, b) => by[this.sort](a, b) || a - b);
    if (this.order.length > 0 && !this.order.includes(state.song)) state.song = this.order[0];
  }

  /** The list under the line: the picked row stands on it, the rest above and below. */
  private layout(): void {
    const list = this.q('.list');
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const lineY = this.root.clientHeight * 0.77 - list.offsetTop - rem * 0.09375;
    const rowH = 2.75 * rem;
    const onH = 5.75 * rem;
    const at = this.order.indexOf(state.song);
    this.rows.forEach((row, i) => {
      const k = this.order.indexOf(i);
      row.hidden = k < 0;
      if (k < 0) return;
      const d = k - at;
      const y = d === 0 ? lineY - onH : d < 0 ? lineY - onH + d * rowH : lineY + rem * 0.625 + (d - 1) * rowH;
      row.style.transform = `translateY(${y}px)`;
      row.classList.toggle('on', d === 0);
      // only rows that show whole: none cut by the list's top or by the key hints
      row.style.opacity = y < -rem * 0.25 || y + (d === 0 ? onH : rowH) > list.clientHeight ? '0' : '1';
      row.classList.toggle('faved', this.favorites.has(i));
      if (d === 0) fitText(row.querySelector('.mega') as HTMLElement, 2.5 * rem, 1.25 * rem);
    });
    this.q('[data-pos]').innerHTML = `<b class="num">${this.order.length ? at + 1 : 0} / ${this.order.length}</b><span>난이도 기준 <b>기본</b></span>`;
    const empty = this.q('.list-empty');
    empty.textContent = this.order.length ? '' : this.query ? `"${this.query}"에 맞는 곡이 없습니다` : `${FOLDERS[this.folder]} 폴더에 곡이 없습니다 (F6으로 다음 폴더)`;
  }

  private refresh(songChanged: boolean): void {
    const song = this.song;
    const summary = song.charts[state.mode][state.tier];
    const q = <T extends HTMLElement>(s: string) => this.q<T>(s);
    const count = (f: number) => {
      const keep = this.folder;
      this.folder = f;
      const n = songs.filter((_, i) => this.inFolder(i)).length;
      this.folder = keep;
      return n;
    };
    q('.folders').innerHTML = FOLDERS.map((f, i) => `<button class="${i === this.folder ? 'on' : ''}" data-folder="${i}">${f}<i class="num">${count(i)}</i></button>`).join('') + `<span>${kbd('F6')}</span>`;
    q('[data-sort]').textContent = SORTS[this.sort];
    const find = q('.find');
    find.classList.toggle('typing', this.searching);
    find.classList.toggle('has', this.query !== '');
    q('.find-text').textContent = this.searching || this.query ? this.query : '제목·아티스트 검색';
    q('[data-bpm]').textContent = bpmText(song);
    q('[data-len]').textContent = clock(song.durationMs);
    q('[data-meter]').textContent = `${song.sketch.beatsPerBar}/4`;
    q('[data-notes]').textContent = summary.noteCount.toLocaleString('en-US');
    q('[data-long]').textContent = String(summary.longNotes);
    q('[data-nps]').textContent = `${summary.nps.avg.toFixed(2)} / ${Math.round(summary.nps.peak)}`;
    q('[data-rating]').textContent = summary.rating.toFixed(2);
    const s = state.settings;
    q('[data-speed]').textContent = s.hiSpeed.toFixed(2);
    q('[data-gauge]').textContent = s.gaugeType;
    q('[data-place]').textContent = PLACEMENT_KO[s.placement] ?? s.placement;
    q('[data-fever]').textContent = FEVER_KO[s.fever] ?? s.fever;
    const rec = recordOf(state.song, state.tier);
    q('.best').innerHTML = rec
      ? `<span class="cap">최고 기록</span><i class="lamp" data-lamp="${rec.lamp}"></i><b>${rec.lamp}</b><b class="num">${rec.rate.toFixed(2)}%</b><span class="muted">최소 BREAK <span class="num">${rec.breaks}</span> · 플레이 <span class="num">${rec.plays}</span></span>`
      : `<span class="cap">최고 기록</span><span class="muted">기록 없음</span>`;
    q('.tiers').innerHTML = TIERS.map((t) => {
      const c = song.charts[state.mode][t];
      const r = recordOf(state.song, t);
      return `<button class="tier${t === state.tier ? ' on' : ''}" data-tier="${t}"><span class="tn">${t === state.tier ? t : TIER_SHORT[t]}</span><span class="tfoot"><span class="lvl num">${c.level}</span><i class="lamp" data-lamp="${r?.lamp ?? 'none'}"></i></span></button>`;
    }).join('');
    this.root.querySelectorAll<HTMLElement>('.modes span').forEach((m) => m.classList.toggle('on', m.dataset.m === state.mode));
    const head = q('.list-head .lv');
    head.dataset.tier = state.tier;
    head.querySelectorAll<HTMLElement>('span').forEach((x) => x.classList.toggle('at', x.dataset.t === state.tier));
    this.rows.forEach((row, i) => {
      const lv = row.querySelector('.lv') as HTMLElement;
      lv.dataset.tier = state.tier;
      lv.innerHTML = TIERS.map((t) => `<span${t === state.tier ? ' class="at"' : ''}>${songs[i].charts[state.mode][t].level}</span>`).join('');
    });
    this.layout();
    this.hints();
    requestAnimationFrame(() => this.rows.forEach((row, i) => !row.hidden && drawSigil(row.querySelector('.sig') as HTMLCanvasElement, songs[i])));
    if (songChanged) {
      this.detail = null;
      this.stage.setChart(null);
      this.stage.runFrom(song.previewMs);
      if (this.active) void preview.play(song.id, song.previewMs);
    }
    const wanted = song.id;
    void detailOf(song).then((d) => {
      if (this.song.id !== wanted) return;
      this.detail = d;
      this.stage.setChart(chartOf(song, d, state.mode, state.tier));
    });
  }

  private hints(): void {
    const item = (keys: string[], label: string, key = keys[0]) => `<button data-key="${key}">${kbd(...keys)} ${label}</button>`;
    const foot = this.q('.hints');
    if (this.addAt >= 0) foot.innerHTML = `${item(['←', '→'], '고르기', 'ArrowRight')}<span class="end">${item(['Esc'], '닫기', 'Escape')}${item(['Enter'], '고르기')}</span>`;
    else if (this.searching) foot.innerHTML = `<span>글자를 치면 바로 걸러집니다</span><span class="end">${item(['Esc'], '검색 지우기', 'Escape')}${item(['Enter'], '검색 끝내기')}</span>`;
    else if (this.pane)
      foot.innerHTML =
        `${item(['↑', '↓'], '항목', 'ArrowDown')}${item(['←', '→'], '값', 'ArrowRight')}` +
        (this.paneKind === 'options' ? `${item(['Q', 'E'], '탭', 'KeyE')}${item(['Space'], '플레이 옵션 닫기')}${item(['I'], '곡 정보·도구', 'KeyI')}` : `${item(['Space'], '플레이 옵션')}${item(['I'], '곡 정보·도구 닫기', 'KeyI')}`) +
        `<span class="end">${item(['Esc'], '닫기', 'Escape')}${item(['Shift+Enter'], '오토 플레이')}${item(['Enter'], '플레이')}</span>`;
    else
      foot.innerHTML = `${item(['↑', '↓'], '곡', 'ArrowDown')}${item(['PgUp', 'PgDn'], '페이지', 'PageDown')}${item(['←', '→'], '난이도', 'ArrowRight')}${item(['Tab'], '키 모드')}${item(['F6'], '폴더')}${item(['Space'], '플레이 옵션')}${item(['I'], '곡 정보·도구', 'KeyI')}${item(['F2'], '랜덤')}${item(['F3'], '즐겨찾기')}<span class="end">${item(['Shift+Enter'], '오토 플레이')}${item(['Enter'], '플레이')}</span>`;
  }

  private toast(text: string): void {
    const t = this.q('.toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('on'), 2200);
  }

  private flash(n: SessionNote): void {
    if (!this.active || !n.src) return;
    this.root.querySelector(`.stem-lamps [data-stem="${n.src}"] i`)?.animate([{ opacity: 1 }, { opacity: 0.22 }], { duration: 220, easing: 'ease-out' });
  }

  // ── panes over the song's column ────────────────────────────────────────────────────────

  private openPane(kind: 'options' | 'info'): void {
    if (this.paneKind === kind) return this.closePane(true);
    this.pane?.dispose();
    const host = this.q('.pane-host');
    this.paneKind = kind;
    this.pane =
      kind === 'options'
        ? new RowsPane(host, playOptionTabs(), { title: '플레이 옵션', passEnter: true, onChange: () => this.refreshChips() })
        : new RowsPane(host, [this.infoTab()], { title: '곡 정보·도구', onAction: (r) => this.infoAction(r) });
    this.root.classList.add('paned');
    this.hints();
    sfx('open');
  }

  private closePane(sound = false): void {
    if (!this.pane) return;
    this.pane.dispose();
    this.pane = null;
    this.paneKind = null;
    this.root.classList.remove('paned');
    if (sound) sfx('back');
    if (this.active) this.refresh(false);
  }

  private refreshChips(): void {
    const s = state.settings;
    this.q('[data-speed]').textContent = s.hiSpeed.toFixed(2);
    this.q('[data-gauge]').textContent = s.gaugeType;
    this.q('[data-place]').textContent = PLACEMENT_KO[s.placement] ?? s.placement;
    this.q('[data-fever]').textContent = FEVER_KO[s.fever] ?? s.fever;
  }

  /** 곡 정보·도구: the chart's information and the song's records to read, then the tools and the song's settings as rows. */
  private infoTab(): Tab {
    const song = this.song;
    const c = song.charts[state.mode][state.tier];
    const base = { values: [] as string[], min: 0, max: 0, step: 1, bigStep: 1, format: (v: number) => String(v), value: 0, initial: 0 };
    const block = (label: string, html: string, heading?: string): Row => ({ ...base, label, kind: 'info', help: '', html, skip: true, heading });
    const act = (label: string, text: string, help: string, heading?: string): Row => ({ ...base, label, kind: 'action', help, values: [text], heading });
    const signed = (v: number) => `${v > 0 ? '+' : ''}${v}ms`;
    const rows: Row[] = [
      block('채보 정보', chartInfo(c), `채보 정보 · ${state.mode} ${state.tier}`),
      act('채보 편집', '열기', '이 채보를 에디터에서 고칩니다. 고친 채보는 따로 저장됩니다.'),
      { ...base, label: '내보내기', kind: 'choice', help: '음원은 넣지 않고 파일 이름만 적습니다', values: ['osu!mania', 'BMS', 'bmson'] },
      block('기록', recordTable(state.song), '기록'),
      act('싱크 테스트', '보기', '박자에 맞춰 노트가 내려오는 테스트를 오토로 봅니다 (←→ 표시 오프셋)', '도구'),
      act('싱크 테스트 · 직접 치기', '시작', '같은 테스트를 직접 칩니다.'),
      act('판정 오프셋 측정', '열기', '메트로놈을 듣고 쳐서 판정 오프셋을 잽니다.'),
      act('표시 오프셋 맞추기', '열기', '노트를 보며 표시 오프셋을 맞춥니다.'),
      block('분석', `<div class="kv"><span class="cap">분석</span><b>스템 기본 · 비트 기본 · 음높이 기본 · 구조 기본</b></div>`, '곡 설정'),
      { ...base, label: 'BPM 보정', kind: 'choice', help: '분석한 BPM이 절반이나 두 배로 잡혔을 때 고칩니다. 곡을 다시 분석해 채보를 새로 만듭니다.', values: ['자동', '×2', '÷2'] },
      { ...base, label: '곡 오프셋', kind: 'number', min: -200, max: 200, step: 1, bigStep: 5, format: signed, help: '이 곡만 판정과 노트를 함께 늦추거나(+) 당깁니다. 기록과 채보는 그대로입니다. 플레이 중에 바꾸는 키: - / =, 5ms씩은 Shift+- / Shift+=.' },
      { ...base, label: '첫 박 위치', kind: 'number', min: -200, max: 200, step: 1, bigStep: 10, format: (v) => (v === 0 ? '자동' : signed(v)), help: '마디선과 채보가 음악의 박과 어긋나 보일 때 분석한 박을 옮깁니다. 곡을 다시 분석해 채보를 새로 만들어서, 기록은 새 채보에 따로 남습니다.' },
      act('커버', '그림 고르기', '목록과 플레이 배경에 쓰는 그림입니다 (png·jpg·webp·gif·bmp). 지우면 곡을 이끄는 악기 색의 디스크로 돌아갑니다.'),
      act('배경 영상', '파일 고르기', '플레이 배경에 깔 영상 파일이나 유튜브 링크입니다.'),
      act('구간', '구간 편집', '분석한 구간(인트로·벌스·후렴…)을 직접 고칩니다. 지금은 자동 분석입니다.'),
      act('분석 보기', '열기', '박·마디선, 구간, 스템별 온셋을 봅니다.'),
      { ...act('라이브러리에서 삭제', '라이브러리에서 삭제', '이 곡의 기록도 함께 지워집니다'), values: ['라이브러리에서 삭제', '한 번 더 누르면 지웁니다'], press: 'twice' },
    ];
    return { id: 'info', label: '곡 정보·도구', intro: song.title, defaultHelp: '', rows };
  }

  private infoAction(r: Row): boolean {
    sfx('confirm');
    this.toast(`'${r.label}'은(는) 지금 화면을 그대로 엽니다. 이번 시안은 선곡·설정·플레이 세 화면만 다룹니다.`);
    return true;
  }

  // ── 곡 추가: its five things stand on the line ───────────────────────────────────────────

  private openAdd(): void {
    this.closePane();
    this.addAt = 0;
    this.root.classList.add('adding');
    this.drawAdd();
    this.hints();
    sfx('open');
  }
  private closeAdd(sound = false): void {
    if (this.addAt < 0) return;
    this.addAt = -1;
    this.root.classList.remove('adding');
    if (sound) sfx('back');
    if (this.active) this.hints();
  }
  private drawAdd(): void {
    this.q('.add-menu').innerHTML = `<div class="add-head"><b>곡 추가</b><span>음악 파일을 화면에 끌어다 놓아도 됩니다</span></div><div class="add-items">${ADD_ITEMS.map(([b, s], i) => `<button class="${i === this.addAt ? 'on' : ''}" data-add="${i}"><b>${b}</b><span>${s}</span></button>`).join('')}</div>`;
  }

  // ── keys ────────────────────────────────────────────────────────────────────────────────

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
    if (this.sort >= 4) this.reorder();
    this.refresh(false);
    if (this.paneKind === 'info') {
      this.closePane();
      this.openPane('info');
    }
  }

  key(e: KeyboardEvent): boolean {
    const code = e.code;
    if (this.searching) {
      if (code === 'Escape') {
        this.query = '';
        this.searching = false;
        sfx('back');
      } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'ArrowDown' || code === 'ArrowUp') {
        this.searching = false;
        sfx('confirm');
      } else if (code === 'Backspace') this.query = this.query.slice(0, -1);
      else if (e.key.length === 1) {
        this.query += e.key;
        sfx('cursor', 0.7);
      } else return false;
      const before = state.song;
      this.reorder();
      this.refresh(before !== state.song);
      return true;
    }
    if (this.addAt >= 0) {
      if (code === 'Escape' || code === 'Equal' || code === 'NumpadAdd') this.closeAdd(true);
      else if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
        this.addAt = (this.addAt + (code === 'ArrowLeft' || code === 'ArrowUp' ? -1 : 1) + ADD_ITEMS.length) % ADD_ITEMS.length;
        sfx('cursor');
        this.drawAdd();
      } else if (code === 'Enter' || code === 'NumpadEnter') {
        sfx('confirm');
        this.toast(`'${ADD_ITEMS[this.addAt][0]}': 시안에는 서버가 없어 파일을 받지 않습니다.`);
        this.closeAdd();
      }
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      if (this.order.length === 0) sfx('edge');
      else this.onPlay(e.shiftKey);
      return true;
    }
    if (code === 'Space') {
      this.openPane('options');
      return true;
    }
    if (code === 'KeyI') {
      this.openPane('info');
      return true;
    }
    if (this.pane) {
      if (code === 'Escape') {
        this.closePane(true);
        return true;
      }
      return this.pane.key(e);
    }
    if (code === 'ArrowUp') this.move(-1);
    else if (code === 'ArrowDown') this.move(1);
    else if (code === 'PageUp') this.move(-5);
    else if (code === 'PageDown') this.move(5);
    else if (code === 'F2') {
      if (this.order.length < 2) return sfx('edge'), true;
      let r = state.song;
      while (r === state.song) r = this.order[Math.floor(Math.random() * this.order.length)];
      state.song = r;
      sfx('cursor');
      this.refresh(true);
    } else if (code === 'ArrowLeft' || code === 'ArrowRight') this.setTier(TIERS.indexOf(state.tier) + (code === 'ArrowLeft' ? -1 : 1));
    else if (code === 'Tab') {
      const i = (MODES.indexOf(state.mode) + (e.shiftKey ? MODES.length - 1 : 1)) % MODES.length;
      state.mode = MODES[i];
      state.settings = { ...state.settings, lastKeyMode: state.mode };
      sfx('tab');
      this.stage.apply(state.settings, state.mode);
      this.reorder();
      this.refresh(false);
    } else if (code === 'F6') {
      this.folder = (this.folder + (e.shiftKey ? FOLDERS.length - 1 : 1)) % FOLDERS.length;
      sfx('tab');
      const before = state.song;
      this.reorder();
      this.refresh(before !== state.song);
    } else if (code === 'F4') {
      this.sort = (this.sort + 1) % SORTS.length;
      sfx('slide');
      this.reorder();
      this.refresh(false);
    } else if (code === 'F3') {
      if (this.favorites.has(state.song)) {
        this.favorites.delete(state.song);
        sfx('off');
      } else {
        this.favorites.add(state.song);
        sfx('on');
      }
      const before = state.song;
      this.reorder();
      this.refresh(before !== state.song);
    } else if (code === 'Slash') {
      this.searching = true;
      sfx('open');
      this.refresh(false);
    } else if (code === 'Equal' || code === 'NumpadAdd') this.openAdd();
    else if (code === 'F10') this.onConfig();
    else if (code === 'F5') {
      sfx('confirm');
      this.toast('새 패턴은 서버가 같은 난이도로 채보를 다시 만드는 기능입니다. 시안에는 서버가 없어 만들지 않습니다.');
    } else if (code === 'Escape') sfx('edge');
    else return false;
    return true;
  }

  /** A pointer does what the keys do: a hint is its key, a row its song, a step its difficulty. */
  private click(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const press = (code: string, shift = false) => this.key(new KeyboardEvent('keydown', { code, key: code, shiftKey: shift }));
    const folder = t.closest<HTMLElement>('[data-folder]');
    if (folder && !this.pane) {
      this.folder = Number(folder.dataset.folder);
      sfx('tab');
      const before = state.song;
      this.reorder();
      this.refresh(before !== state.song);
      return;
    }
    const add = t.closest<HTMLElement>('[data-add]');
    if (add) {
      this.addAt = Number(add.dataset.add);
      press('Enter');
      return;
    }
    if (this.pane || this.addAt >= 0) return;
    const tier = t.closest<HTMLElement>('.tier');
    if (tier?.dataset.tier) return this.setTier(TIERS.indexOf(tier.dataset.tier as Tier));
    const mode = t.closest<HTMLElement>('.modes [data-m]');
    if (mode?.dataset.m && mode.dataset.m !== state.mode) {
      state.mode = mode.dataset.m as typeof state.mode;
      state.settings = { ...state.settings, lastKeyMode: state.mode };
      sfx('tab');
      this.stage.apply(state.settings, state.mode);
      this.reorder();
      this.refresh(false);
      return;
    }
    const row = t.closest<HTMLElement>('.srow');
    if (row?.dataset.i) {
      const i = Number(row.dataset.i);
      if (i === state.song) return;
      state.song = i;
      sfx('cursor');
      this.refresh(true);
    }
  }

  // ── the song as the analysis read it ─────────────────────────────────────────────────────

  /** Its sections, its level and the chart's notes per second over the whole song, and six seconds of the four stems' onsets going by. */
  private drawScope(): void {
    const { g, w, h } = fitCanvas(this.scope);
    if (w === 0) return;
    const song = this.song;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const px = rem / 16;
    const ovH = Math.round(h * 0.44);
    const key = `${song.id}|${state.mode}|${state.tier}|${w}x${ovH}|${this.detail ? 1 : 0}`;
    if (!this.overview || this.overviewKey !== key) {
      this.overview = drawOverview(song, this.detail, w, ovH, px);
      this.overviewKey = key;
    }
    g.drawImage(this.overview, 0, 0, w, ovH);
    const now = preview.songMs() ?? song.previewMs;
    const dur = song.durationMs;
    const bandH = 18 * px;
    // the stretch of the song the preview plays, and where it is now
    const [from, to] = preview.playing ? preview.windowMs : [song.previewMs, song.previewMs + 24000];
    const line = token('--line');
    g.fillStyle = token('--bone');
    g.globalAlpha = 0.09;
    g.fillRect((from / dur) * w, bandH + 2 * px, ((Math.min(to, dur) - from) / dur) * w, ovH - bandH - 2 * px);
    g.globalAlpha = 1;
    g.fillStyle = line;
    g.fillRect(Math.round((now / dur) * w) - px, bandH - 3 * px, 2 * px, ovH - bandH + 3 * px);

    drawAxis(g, dur, w, ovH, px);
    // the stems: six seconds of their onsets going by under a fixed mark
    const top = ovH + 30 * px;
    const laneH = (h - top) / 4;
    const plate = 68 * px;
    const mark = Math.round(plate + (w - plate) * 0.22);
    const span = 6000;
    const perMs = (w - plate) / span;
    const t0 = now - (mark - plate) / perMs;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    STEMS.forEach((stem, i) => {
      const y = top + i * laneH;
      g.fillStyle = token('--rule');
      g.fillRect(0, Math.round(y + laneH) - 1, w, 1);
      const colour = token(`--stem-${stem}`);
      const onsets = this.detail?.onsets[stem] ?? [];
      let lo = 0;
      let hi = onsets.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (onsets[mid][0] < t0) lo = mid + 1;
        else hi = mid;
      }
      g.fillStyle = colour;
      for (let k = lo; k < onsets.length && onsets[k][0] < t0 + span; k++) {
        const [t, strength] = onsets[k];
        const x = plate + (t - t0) * perMs;
        const tall = Math.max(3 * px, (laneH - 6 * px) * clamp(strength, 0.2, 1));
        const age = now - t;
        // an onset lights up as it crosses the mark, then stays dim behind it
        g.globalAlpha = age < 0 ? 0.9 : age < 90 ? 1 : 0.28;
        const wide = age >= 0 && age < 90 ? 4 * px : 2 * px;
        g.fillRect(Math.round(x - wide / 2), Math.round(y + laneH - 2 * px - tall), Math.max(2, wide), tall);
      }
      g.globalAlpha = 1;
      g.fillStyle = colour;
      g.fillRect(0, Math.round(y + laneH / 2 - 4 * px), 8 * px, 8 * px);
      g.fillStyle = token('--bone-2');
      g.font = `600 ${13 * px}px ${token('--font-ui')}`;
      g.fillText(STEM_KO[stem], 14 * px, y + laneH / 2 + px * 0.5);
    });
    g.fillStyle = line;
    g.fillRect(mark - px, top - 5 * px, 2 * px, h - top + 5 * px);
    g.beginPath();
    g.moveTo(mark - 5 * px, top - 5 * px);
    g.lineTo(mark + 5 * px, top - 5 * px);
    g.lineTo(mark, top + px);
    g.fill();

    // which section the preview is in
    const section = song.sketch.sections.find((s) => now >= s.t && now < s.endT);
    this.q('[data-now]').textContent = `${clock(now)} / ${clock(dur)}`;
    this.q('[data-section]').textContent = section ? `${SECTION_KO[section.label] ?? section.label}${section.leader ? ` · ${STEM_KO[section.leader]}이(가) 이끎` : ''}` : '';
    // the line ticks with the song's analysed beats (a bar's first beat a little more)
    const beats = this.detail?.beats;
    let beat = 0;
    if (beats && preview.playing) {
      let lo = 0;
      let hi = beats.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (beats[mid] <= now) lo = mid + 1;
        else hi = mid;
      }
      const last = beats[lo - 1];
      if (last !== undefined && now - last < 140) beat = (1 - (now - last) / 140) * (this.detail?.downbeats.includes(last) ? 1 : 0.55);
    }
    document.documentElement.style.setProperty('--beat', beat.toFixed(3));
  }
}

function drawOverview(song: SongEntry, detail: SongDetail | null, w: number, h: number, px: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.scale(dpr, dpr);
  const dur = song.durationMs;
  const bandH = 18 * px;
  // the sections, each in the colour of the stem that leads it (brighter where the song is louder)
  g.font = `700 ${13 * px}px ${token('--font-ui')}`;
  g.textBaseline = 'middle';
  for (const s of song.sketch.sections) {
    const x = (s.t / dur) * w;
    const sw = ((s.endT - s.t) / dur) * w;
    g.fillStyle = token(`--stem-${s.leader ?? 'other'}`);
    g.globalAlpha = 0.35 + 0.65 * s.energy;
    g.fillRect(Math.round(x), 0, Math.max(1, Math.round(sw) - Math.max(1, px)), bandH);
    g.globalAlpha = 1;
    const label = SECTION_KO[s.label] ?? s.label;
    if (g.measureText(label).width + 8 * px < sw) {
      g.fillStyle = token('--ink-0');
      g.fillText(label, x + 4 * px, bandH / 2 + px * 0.5);
    }
  }
  // the song's level over time
  const peaks = detail?.waveform.peaks ?? song.sketch.peaks;
  const bars = Math.floor(w / (3 * px));
  const base = h - 1;
  const room = h - bandH - 10 * px;
  g.fillStyle = token('--rule-strong');
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((i / bars) * peaks.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / bars) * peaks.length));
    let peak = 0;
    for (let k = a; k < b; k++) peak = Math.max(peak, peaks[k]);
    const tall = Math.max(px, peak * room * 0.62);
    g.fillRect(i * 3 * px, base - tall, 2 * px, tall);
  }
  // the chart's notes per second on the same time axis; the scale is the hardest step's peak, so the five steps compare
  const nps = song.charts[state.mode][state.tier].nps;
  const top = Math.max(1, ...TIERS.map((t) => Math.max(...song.charts[state.mode][t].nps.graph)));
  const tier = token(`--tier-${state.tier.toLowerCase()}`);
  g.strokeStyle = tier;
  g.lineWidth = 2 * px;
  g.lineJoin = 'round';
  g.beginPath();
  nps.graph.forEach((v, i) => {
    const x = clamp((((i + 0.5) * nps.binMs) / dur) * w, 0, w);
    const y = base - (v / top) * (room - 2 * px);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.stroke();
  g.fillStyle = token('--bone-3');
  g.fillRect(0, base, w, 1);
  return c;
}

/** Minute marks under the overview (a tick every 30 s, a label every minute). */
function drawAxis(g: CanvasRenderingContext2D, dur: number, w: number, y: number, px: number): void {
  g.font = `600 ${13 * px}px ${token('--font-num')}`;
  g.textBaseline = 'top';
  for (let t = 0; t <= dur; t += 30_000) {
    const x = Math.round((t / dur) * (w - 1));
    const minute = t % 60_000 === 0;
    g.fillStyle = token('--bone-3');
    g.fillRect(x, y, 1, (minute ? 5 : 3) * px);
    if (minute && t > 0 && x < w - 20 * px) {
      g.fillStyle = token('--bone-2');
      g.textAlign = 'center';
      g.fillText(clock(t), x, y + 5 * px);
    }
  }
  g.textAlign = 'left';
}

/** A song's mark in the list: its level over time, mirrored, each stretch in its leading stem's colour. */
function drawSigil(canvas: HTMLCanvasElement, song: SongEntry): void {
  const { g, w, h } = fitCanvas(canvas);
  if (w === 0) return;
  const peaks = song.sketch.peaks;
  const n = 12;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * peaks.length);
    const b = Math.floor(((i + 1) / n) * peaks.length);
    let p = 0;
    for (let k = a; k < b; k++) p = Math.max(p, peaks[k]);
    const t = ((i + 0.5) / n) * song.durationMs;
    const s = song.sketch.sections.find((x) => t >= x.t && t < x.endT);
    g.fillStyle = token(`--stem-${s?.leader ?? 'other'}`);
    const tall = Math.max(2, p * (h - 4));
    g.fillRect(Math.round(i * bw), Math.round((h - tall) / 2), Math.max(1, Math.round(bw) - 1), Math.round(tall));
  }
}

/** Shrinks a line of type until it fits its box (down to `min`, where it is cut with an ellipsis). */
function fitText(node: HTMLElement, max: number, min: number): void {
  let size = max;
  node.style.fontSize = `${size}px`;
  while (size > min && node.scrollWidth > node.clientWidth + 1) {
    size = Math.max(min, size - Math.max(1, max / 24));
    node.style.fontSize = `${size}px`;
  }
}

const pct = (v: number | undefined | null) => (v === undefined || v === null ? '–' : `${Math.round(v * 100)}%`);

function chartInfo(c: ChartSummary): string {
  const stat = (label: string, value: string) => `<div><span class="cap">${label}</span><b class="num">${value}</b></div>`;
  const shares = c.keysound?.shares;
  const stems = shares
    ? `<div class="stembar">${STEMS.map((s) => `<i style="flex:${Math.max(0.001, shares[s])};background:var(--stem-${s})"></i>`).join('')}</div><div class="stemkey">${STEMS.map((s) => `<span><i style="background:var(--stem-${s})"></i>${STEM_KO[s]} <b class="num">${pct(shares[s])}</b></span>`).join('')}</div>`
    : '';
  const bars = (list: [string, string][], values: Record<string, number> | null) =>
    values ? `<div class="bars">${list.map(([k, label]) => `<div><span>${label}</span><i><u style="width:${Math.round(clamp(values[k] ?? 0, 0, 1) * 100)}%"></u></i><b class="num">${pct(values[k])}</b></div>`).join('')}</div>` : '';
  return `
    <div class="stats">
      ${stat('노트', c.noteCount.toLocaleString('en-US'))}${stat('롱노트', String(c.longNotes))}${stat('평균 / 최대 NPS', `${c.nps.avg} / ${c.nps.peak}`)}${stat('세부 난이도', c.rating.toFixed(2))}
      ${c.handLoad ? stat('왼손 / 오른손', `${Math.round(c.handLoad.L * 100)} / ${Math.round(c.handLoad.R * 100)}`) : ''}${stat('루프 패턴 일치', pct(c.consistency?.loopLane))}${stat('반복 패턴 일치', pct(c.consistency?.repeatLaneMirror ?? c.repeatConsistency))}
    </div>
    <div class="cap sub">노트가 따라가는 악기</div>${stems}
    <div class="cap sub">패턴</div>${bars(PATTERNS, c.patterns)}
    <div class="cap sub">스킬</div>${bars(SKILLS, c.skillset)}`;
}

function recordTable(songIndex: number): string {
  const rows = TIERS.map((t) => [t, recordOf(songIndex, t)] as const).filter(([, r]) => r);
  if (rows.length === 0) return `<p class="muted">아직 기록이 없습니다.</p>`;
  return `<table class="records"><thead><tr><th>패턴</th><th>램프</th><th>RATE</th><th>최소 BREAK</th><th>플레이</th></tr></thead><tbody>${rows
    .map(([t, r]) => `<tr${t === state.tier ? ' class="cur"' : ''}><td data-tier="${t}"><b>${TIER_SHORT[t]}</b> 기본</td><td><i class="lamp" data-lamp="${r?.lamp}"></i> ${r?.lamp}</td><td class="num">${r?.rate.toFixed(2)}%</td><td class="num">${r?.breaks}</td><td class="num">${r?.plays}</td></tr>`)
    .join('')}</tbody></table>`;
}

export const EMBLEM = `<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="5" y1="22" x2="10" y2="2" stroke="var(--bone)" stroke-width="2.2"/><line x1="19" y1="22" x2="14" y2="2" stroke="var(--bone)" stroke-width="2.2"/><line x1="1" y1="17" x2="23" y2="17" stroke="var(--line)" stroke-width="2.6"/></svg>`;
