import { preview, sfx } from './audio';
import { jacket, lampMark } from './art';
import { SECTION_KO, STEMS, STEM_KO, TIERS, chartOf, detailOf, recordOf, songs, type ChartSummary, type SongDetail, type SongEntry } from './data';
import { clamp, clock, el, esc, fitCanvas, kbd, token } from './dom';
import type { Row } from './inventory';
import { RowList } from './rows';
import type { Stage } from './stage';
import { state } from './state';

const TABS = [
  { id: 'chart', label: '채보' },
  { id: 'records', label: '기록' },
  { id: 'tools', label: '도구' },
  { id: 'song', label: '곡 설정' },
] as const;
type TabId = (typeof TABS)[number]['id'];
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
const pct = (v: number | undefined | null) => (v === undefined || v === null ? '–' : `${Math.round(v * 100)}%`);

/**
 * 곡 정보·도구. Everything about the picked song that the song select no longer carries: how the
 * song is built and what its chart follows (with the chart itself playing beside it), the records,
 * the tools, and the song's own settings.
 */
export class SongInfo {
  readonly root = el('div', 'sinfo');
  open = false;
  private tab: TabId = 'chart';
  private list: RowList | null = null;
  private detail: SongDetail | null = null;
  private overview: HTMLCanvasElement | null = null;
  private overviewKey = '';
  private raf = 0;
  onClose: () => void = () => undefined;
  onToast: (text: string) => void = () => undefined;
  /** The difficulty was changed here. */
  onTier: () => void = () => undefined;

  constructor(
    host: HTMLElement,
    private stage: Stage,
  ) {
    this.root.innerHTML = `
      <aside class="si-side">
        <div class="si-song"></div>
        <nav class="si-tabs"></nav>
        <div class="si-tabs-key">${kbd('Q', 'E')}<span>탭</span></div>
      </aside>
      <section class="si-main">
        <div class="si-head"></div>
        <div class="si-static"></div>
        <div class="si-rows"></div>
        <p class="si-help"></p>
      </section>
      <aside class="si-preview">
        <div class="si-preview-head"><span class="cap">미리보기</span><b class="num" data-now></b><span data-section></span></div>
        <div class="si-stage"></div>
      </aside>`;
    host.append(this.root);
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-si-tab]');
      if (t) this.setTab(t.dataset.siTab as TabId);
    });
    window.addEventListener('resize', () => this.open && (this.overviewKey = ''));
  }

  private q<T extends HTMLElement>(s: string): T {
    return this.root.querySelector(s) as T;
  }
  private get song(): SongEntry {
    return songs[state.song];
  }

  show(): void {
    this.open = true;
    this.root.classList.add('on');
    const song = this.song;
    const c = song.charts[state.mode][state.tier];
    this.q('.si-song').innerHTML = `${jacket(song)}<b>${esc(song.title)}</b><span>${esc(song.artist)}</span><span class="chip-tier" data-tier="${state.tier}">${state.mode} · ${state.tier}<b class="num">${c.level}</b></span>`;
    this.detail = null;
    this.stage.setChart(null);
    void detailOf(song).then((d) => {
      if (!this.open || this.song !== song) return;
      this.detail = d;
      this.overviewKey = '';
      this.stage.setChart(chartOf(song, d, state.mode, state.tier));
    });
    this.stage.mount(this.q('.si-stage'));
    this.stage.apply(state.settings, state.mode);
    this.stage.start();
    this.draw();
    sfx('open');
    const tick = () => {
      if (!this.open) return;
      this.raf = requestAnimationFrame(tick);
      this.frame();
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(tick);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on');
    cancelAnimationFrame(this.raf);
    this.stage.stop();
    this.list?.dispose();
    this.list = null;
    sfx('back');
    this.onClose();
  }

  /** The song select left the screen (a play, the settings) and came back. */
  pause(): void {
    cancelAnimationFrame(this.raf);
  }
  resume(): void {
    if (!this.open) return;
    this.show();
  }

  hints(): string {
    const rows = this.tab === 'tools' || this.tab === 'song';
    return `<span>${kbd('Q', 'E')}탭</span>${rows ? `<span>${kbd('↑', '↓')}항목</span><span>${kbd('←', '→')}값</span><span>${kbd('Enter')}누르기</span>` : `<span>${kbd('←', '→')}난이도</span>`}<span class="end"><button data-key="KeyI">${kbd('I')}<span>닫기</span></button></span>`;
  }

  /** ←→ on the tabs that are only read: the same song's next difficulty, to compare. */
  private setTier(d: number): void {
    const i = TIERS.indexOf(state.tier) + d;
    if (i < 0 || i >= TIERS.length) return sfx('edge');
    state.tier = TIERS[i];
    sfx('slide');
    const song = this.song;
    const c = song.charts[state.mode][state.tier];
    this.q('.si-song .chip-tier').outerHTML = `<span class="chip-tier" data-tier="${state.tier}">${state.mode} · ${state.tier}<b class="num">${c.level}</b></span>`;
    if (this.detail) this.stage.setChart(chartOf(song, this.detail, state.mode, state.tier));
    this.draw();
    this.onTier();
  }

  private setTab(id: TabId): void {
    if (id === this.tab) return;
    this.tab = id;
    sfx('tab');
    this.draw();
    this.onClose();
  }

  private draw(): void {
    const song = this.song;
    const c = song.charts[state.mode][state.tier];
    this.root.dataset.tab = this.tab;
    this.q('.si-tabs').innerHTML = TABS.map((t) => `<button data-si-tab="${t.id}" class="${t.id === this.tab ? 'on' : ''}">${t.label}</button>`).join('');
    const label = TABS.find((t) => t.id === this.tab)?.label ?? '';
    const base = { values: [] as string[], min: 0, max: 0, step: 1, bigStep: 1, format: (v: number) => String(v), value: 0 as number | null, initial: 0 as number | null };
    const act = (name: string, text: string, help: string, heading?: string): Row => ({ ...base, label: name, kind: 'action', help, values: [text], heading });
    const signed = (v: number) => `${v > 0 ? '+' : ''}${v}ms`;
    let sub = '';
    let fixed = '';
    let rows: Row[] = [];
    if (this.tab === 'chart') {
      sub = `${state.mode} · ${state.tier} ${c.level}`;
      fixed = `<div class="si-scope"><canvas></canvas></div>${chartInfo(c)}`;
    } else if (this.tab === 'records') {
      sub = `${state.mode} · 표본 기록`;
      fixed = recordTable(state.song);
    } else if (this.tab === 'tools') {
      sub = `${state.mode} · ${state.tier} ${c.level}`;
      rows = [
        act('채보 편집', '열기', '이 채보를 에디터에서 고칩니다. 고친 채보는 따로 저장됩니다.', '이 채보'),
        { ...base, label: '내보내기', kind: 'choice', help: '고른 형식으로 이 채보를 내보냅니다. 음원은 넣지 않고 파일 이름만 적습니다.', values: ['osu!mania', 'BMS', 'bmson'] },
        act('싱크 테스트 · 오토', '보기', '박자에 맞춰 노트가 내려오는 테스트를 오토로 봅니다 (←→ 표시 오프셋).', '측정'),
        act('싱크 테스트 · 직접 치기', '시작', '같은 테스트를 직접 칩니다.'),
        act('판정 오프셋 측정', '열기', '메트로놈을 듣고 쳐서 판정 오프셋을 잽니다.'),
        act('표시 오프셋 맞추기', '열기', '노트를 보며 표시 오프셋을 맞춥니다.'),
      ];
    } else {
      sub = '이 곡에만 적용됩니다';
      rows = [
        { ...base, label: '분석', kind: 'info', help: '', values: ['스템 기본 · 비트 기본 · 음높이 기본 · 구조 기본'] },
        act('다시 분석', '다시 분석', '지금 설치된 분석 백엔드로 곡을 다시 분석합니다. 채보는 새로 만들어집니다.'),
        { ...base, label: 'BPM 보정', kind: 'choice', help: '분석한 BPM이 절반이나 두 배로 잡혔을 때 고칩니다. 곡을 다시 분석해 채보를 새로 만듭니다.', values: ['자동', '×2', '÷2'], heading: '박자' },
        { ...base, label: '곡 오프셋', kind: 'number', min: -200, max: 200, step: 1, bigStep: 5, format: signed, help: '이 곡만 판정과 노트를 함께 늦추거나(+) 당깁니다. 기록과 채보는 그대로입니다. 플레이 중에 바꾸는 키: - / =, 5ms씩은 Shift+- / Shift+=.' },
        { ...base, label: '첫 박 위치', kind: 'number', min: -200, max: 200, step: 1, bigStep: 10, format: (v) => (v === 0 ? '자동' : signed(v)), help: '마디선과 채보가 음악의 박과 어긋나 보일 때 분석한 박을 옮깁니다. 곡을 다시 분석해 채보를 새로 만들어서, 기록은 새 채보에 따로 남습니다. 박은 맞는데 판정만 어긋나면 곡 오프셋을 쓰세요.' },
        { ...act('구간', '구간 편집', '분석한 구간(인트로·벌스·후렴…)을 직접 고칩니다. 지금은 자동 분석입니다.'), heading: '구조' },
        act('분석 보기', '열기', '박·마디선, 구간, 스템별 온셋을 봅니다.'),
        { ...act('라이브러리에서 삭제', '라이브러리에서 삭제', '이 곡의 기록도 함께 지워집니다.'), values: ['라이브러리에서 삭제', '한 번 더 누르면 지웁니다'], press: 'twice', heading: '삭제' },
      ];
    }
    this.q('.si-head').innerHTML = `<b>${label}</b><span>${esc(sub)}</span>`;
    this.q('.si-static').innerHTML = fixed;
    this.overviewKey = '';
    this.list?.dispose();
    this.list = null;
    const help = this.q('.si-help');
    help.textContent = '';
    if (rows.length > 0) {
      this.list = new RowList(this.q('.si-rows'), rows, {
        onFocus: (r) => (help.textContent = r?.help ?? ''),
        onAction: (r) => {
          this.onToast(r.label === '라이브러리에서 삭제' ? '시안에서는 곡을 지우지 않습니다.' : `'${r.label}'은(는) 지금 게임의 화면을 그대로 엽니다. 이번 시안은 곡 선택 · 설정 · 플레이만 다룹니다.`);
          return true;
        },
      });
    } else this.q('.si-rows').innerHTML = '';
  }

  private frame(): void {
    const song = this.song;
    const now = preview.songMs() ?? song.previewMs;
    this.q('[data-now]').textContent = `${clock(now)} / ${clock(song.durationMs)}`;
    const section = song.sketch.sections.find((s) => now >= s.t && now < s.endT);
    this.q('[data-section]').textContent = section ? (SECTION_KO[section.label] ?? section.label) : '';
    if (this.tab === 'chart') this.drawScope(now);
  }

  /**
   * The song as the analysis read it and the chart made of it, on one time axis: its sections, its
   * loudness, the chart's notes per second; under them six seconds of the four stems' onsets going by.
   */
  private drawScope(now: number): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>('.si-scope canvas');
    if (!canvas) return;
    const { g, w, h } = fitCanvas(canvas);
    if (w === 0) return;
    const song = this.song;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const px = rem / 16;
    const ovH = Math.round(h * 0.47);
    const key = `${song.id}|${state.mode}|${state.tier}|${w}x${ovH}|${this.detail ? 1 : 0}`;
    if (!this.overview || this.overviewKey !== key) {
      this.overview = drawOverview(song, this.detail, w, ovH, px);
      this.overviewKey = key;
    }
    g.drawImage(this.overview, 0, 0, w, ovH);
    const dur = song.durationMs;
    const bandH = 20 * px;
    // the stretch of the song the preview plays, and where it is now
    const [from, to] = preview.playing ? preview.windowMs : [song.previewMs, song.previewMs + 24000];
    g.fillStyle = token('--text');
    g.globalAlpha = 0.08;
    g.fillRect((from / dur) * w, bandH + 2 * px, ((Math.min(to, dur) - from) / dur) * w, ovH - bandH - 2 * px);
    g.globalAlpha = 1;
    g.fillRect(Math.round((now / dur) * w) - px, bandH - 3 * px, 2 * px, ovH - bandH + 3 * px);
    // minutes
    g.font = `700 ${13 * px}px ${token('--font-num')}`;
    g.textBaseline = 'top';
    for (let t = 0; t <= dur; t += 30_000) {
      const x = Math.round((t / dur) * (w - 1));
      const minute = t % 60_000 === 0;
      g.fillStyle = token('--text-3');
      g.fillRect(x, ovH, 1, (minute ? 5 : 3) * px);
      if (minute && t > 0 && x < w - 20 * px) {
        g.fillStyle = token('--text-2');
        g.textAlign = 'center';
        g.fillText(clock(t), x, ovH + 6 * px);
      }
    }
    g.textAlign = 'left';
    // the stems: six seconds of their onsets going by under a fixed mark
    const top = ovH + 30 * px;
    const laneH = (h - top) / 4;
    const plate = 76 * px;
    const mark = Math.round(plate + (w - plate) * 0.22);
    const span = 6000;
    const perMs = (w - plate) / span;
    const t0 = now - (mark - plate) / perMs;
    g.textBaseline = 'middle';
    STEMS.forEach((stem, i) => {
      const y = top + i * laneH;
      g.fillStyle = 'rgba(255,255,255,.08)';
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
        // an onset is bright as it crosses the mark, then stays dim behind it
        g.globalAlpha = age < 0 ? 0.9 : age < 90 ? 1 : 0.3;
        const wide = age >= 0 && age < 90 ? 4 * px : 2 * px;
        g.fillRect(Math.round(x - wide / 2), Math.round(y + laneH - 2 * px - tall), Math.max(2, wide), tall);
      }
      g.globalAlpha = 1;
      g.fillStyle = colour;
      g.fillRect(0, Math.round(y + laneH / 2 - 4 * px), 8 * px, 8 * px);
      g.fillStyle = token('--text-2');
      g.font = `600 ${13 * px}px ${token('--font-ui')}`;
      g.fillText(STEM_KO[stem], 14 * px, y + laneH / 2 + px * 0.5);
    });
    g.fillStyle = token('--text');
    g.fillRect(mark - px, top - 4 * px, 2 * px, h - top + 4 * px);
  }

  key(e: KeyboardEvent): boolean {
    const code = e.code;
    if (code === 'KeyI' || code === 'Escape') this.hide();
    else if (code === 'KeyQ' || code === 'KeyE') {
      const at = TABS.findIndex((t) => t.id === this.tab);
      this.setTab(TABS[(at + (code === 'KeyQ' ? TABS.length - 1 : 1)) % TABS.length].id);
    } else if (this.list?.key(e)) return true;
    else if ((code === 'ArrowLeft' || code === 'ArrowRight') && !this.list) this.setTier(code === 'ArrowLeft' ? -1 : 1);
    else return false;
    return true;
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
  const bandH = 20 * px;
  // the sections, each in the colour of the stem that leads it (stronger where the song is louder)
  g.font = `700 ${13 * px}px ${token('--font-ui')}`;
  g.textBaseline = 'middle';
  for (const s of song.sketch.sections) {
    const x = (s.t / dur) * w;
    const sw = ((s.endT - s.t) / dur) * w;
    g.fillStyle = token(`--stem-${s.leader ?? 'other'}`);
    g.globalAlpha = 0.4 + 0.6 * s.energy;
    g.fillRect(Math.round(x), 0, Math.max(1, Math.round(sw) - Math.max(1, px)), bandH);
    g.globalAlpha = 1;
    const label = SECTION_KO[s.label] ?? s.label;
    if (g.measureText(label).width + 8 * px < sw) {
      g.fillStyle = token('--on-paper');
      g.fillText(label, x + 4 * px, bandH / 2 + px * 0.5);
    }
  }
  // the song's loudness over time
  const peaks = detail?.waveform.peaks ?? song.sketch.peaks;
  const bars = Math.floor(w / (3 * px));
  const base = h - 1;
  const room = h - bandH - 10 * px;
  g.fillStyle = 'rgba(255,255,255,.2)';
  for (let i = 0; i < bars; i++) {
    const a = Math.floor((i / bars) * peaks.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / bars) * peaks.length));
    let peak = 0;
    for (let k = a; k < b; k++) peak = Math.max(peak, peaks[k]);
    const tall = Math.max(px, peak * room * 0.62);
    g.fillRect(i * 3 * px, base - tall, 2 * px, tall);
  }
  // the chart's notes per second on the same axis; the scale is the hardest step's peak, so the five steps compare
  const nps = song.charts[state.mode][state.tier].nps;
  const top = Math.max(1, ...TIERS.map((t) => Math.max(...song.charts[state.mode][t].nps.graph)));
  g.strokeStyle = token(`--tier-${state.tier.toLowerCase()}`);
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
  g.fillStyle = token('--text-3');
  g.fillRect(0, base, w, 1);
  return c;
}

function chartInfo(c: ChartSummary): string {
  const stat = (label: string, value: string) => `<div><span class="cap">${label}</span><b class="num">${value}</b></div>`;
  const shares = c.keysound?.shares;
  const stems = shares ? `<div class="bars">${STEMS.map((s) => `<div><span>${STEM_KO[s]}</span><i><u style="width:${Math.round(clamp(shares[s], 0, 1) * 100)}%;background:var(--stem-${s})"></u></i><b class="num">${pct(shares[s])}</b></div>`).join('')}</div>` : '';
  const bars = (list: [string, string][], values: Record<string, number> | null) =>
    values ? `<div class="bars">${list.map(([k, label]) => `<div><span>${label}</span><i><u style="width:${Math.round(clamp(values[k] ?? 0, 0, 1) * 100)}%"></u></i><b class="num">${pct(values[k])}</b></div>`).join('')}</div>` : '';
  return `
    <div class="si-legend"><span><i class="line" data-tier="${state.tier}"></i>채보의 초당 노트 수</span><span><i class="bar"></i>곡의 음량</span><span>구간의 색 = 그 구간을 이끄는 악기</span></div>
    <div class="si-stats">
      ${stat('노트', c.noteCount.toLocaleString('en-US'))}${stat('롱노트', String(c.longNotes))}${stat('평균 / 최대 NPS', `${c.nps.avg} / ${c.nps.peak}`)}${stat('세부 난이도', c.rating.toFixed(2))}
      ${c.handLoad ? stat('왼손 / 오른손', `${Math.round(c.handLoad.L * 100)} / ${Math.round(c.handLoad.R * 100)}`) : ''}${stat('루프 패턴 일치', pct(c.consistency?.loopLane))}${stat('반복 패턴 일치', pct(c.consistency?.repeatLaneMirror ?? c.repeatConsistency))}
    </div>
    <div class="si-cols">
      <div><div class="cap">노트가 따라가는 악기</div>${stems}</div>
      <div><div class="cap">패턴</div>${bars(PATTERNS, c.patterns)}</div>
      <div><div class="cap">스킬</div>${bars(SKILLS, c.skillset)}</div>
    </div>`;
}

function recordTable(songIndex: number): string {
  const rows = TIERS.map((t) => [t, recordOf(songIndex, t)] as const).filter(([, r]) => r);
  if (rows.length === 0) return `<p class="si-none">아직 기록이 없습니다.</p>`;
  return `<table class="si-records"><thead><tr><th>패턴</th><th>램프</th><th>RATE</th><th>최소 BREAK</th><th>플레이</th></tr></thead><tbody>${rows
    .map(([t, r]) => `<tr class="${t === state.tier ? 'cur' : ''}"><td data-tier="${t}"><b>${t}</b></td><td>${lampMark(r?.lamp ?? null)} ${r?.lamp}</td><td class="num">${r?.rate.toFixed(2)}%</td><td class="num">${r?.breaks}</td><td class="num">${r?.plays}</td></tr>`)
    .join('')}</tbody></table>`;
}
