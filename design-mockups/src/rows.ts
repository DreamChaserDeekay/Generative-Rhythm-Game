import { sfx } from './audio';
import { clamp, el, esc, fitCanvas, kbd, token } from './dom';
import { markReset, round, type Row, type Tab } from './inventory';
import { setSettings, state } from './state';

interface PaneOptions {
  title: string;
  /** Tabs down the side (the settings) or across the top (the play options). */
  tabs?: 'side' | 'top';
  /** Enter is the screen's (the song select: Enter plays). */
  passEnter?: boolean;
  startTab?: string;
  onTab?: (tab: Tab) => void;
  onAction?: (row: Row) => boolean;
  /** After a row's value changed. */
  onChange?: (row: Row) => void;
}

const KEY_NAMES: Record<string, string> = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", Enter: 'Enter', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Minus: '-', Equal: '=' };
const keyName = (code: string) => KEY_NAMES[code] ?? code.replace(/^Key|^Digit/, '');

/**
 * Rows of settings, read above the line; the row picked lays its values out along the line, and
 * ←→ slide them under the mark. The same pane is the settings and the song select's play options.
 */
export class RowsPane {
  readonly root = el('div', 'pane');
  private tabs: Tab[];
  private tabAt = 0;
  private rowAt = 0;
  private capAt = 0;
  private capturing = false;
  private armed: { row: Row; until: number } | null = null;
  private snapshot: Map<Row, number | null> | null = null;
  private scale!: HTMLCanvasElement;
  private shown = 0;
  private moved = false;
  private raf = 0;
  private alive = true;

  constructor(
    host: HTMLElement,
    tabs: Tab[],
    private options: PaneOptions,
  ) {
    this.tabs = tabs;
    this.root.dataset.tabs = options.tabs ?? 'top';
    this.root.innerHTML = `
      <nav class="pane-tabs"></nav>
      <div class="pane-head"></div>
      <div class="pane-rows"></div>
      <div class="tuner"><div class="tuner-name"></div><div class="tuner-read"></div><canvas class="tuner-scale"></canvas><div class="tuner-act"></div><i class="tuner-mark"></i></div>
      <div class="pane-help"></div>`;
    host.replaceChildren(this.root);
    this.root.addEventListener('click', (e) => this.click(e));
    this.scale = this.root.querySelector('.tuner-scale') as HTMLCanvasElement;
    const start = tabs.findIndex((t) => t.id === options.startTab);
    this.tabAt = Math.max(0, start);
    this.rowAt = Math.max(0, this.visible.findIndex((r) => !r.skip));
    this.shown = this.row ? this.pos(this.row) : 0;
    this.render();
    const tick = () => {
      if (!this.alive) return;
      this.raf = requestAnimationFrame(tick);
      this.drawScale();
    };
    this.raf = requestAnimationFrame(tick);
  }

  dispose(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.root.remove();
  }

  get tab(): Tab {
    return this.tabs[this.tabAt];
  }
  get capturingNow(): boolean {
    return this.capturing;
  }
  private get visible(): Row[] {
    return this.tab.rows.filter((r) => !r.when || r.when());
  }
  private get row(): Row | undefined {
    return this.visible[this.rowAt];
  }

  private text(r: Row): string {
    if (r.kind === 'number') return r.value === null ? '자동' : r.format(r.value);
    if (r.kind === 'choice' || r.kind === 'switch') return r.values[r.value ?? 0] ?? '';
    if (r.kind === 'action') return this.armed?.row === r ? (r.values[1] ?? r.values[0]) : (r.values[0] ?? r.label);
    return '';
  }

  /** Position on the scale: steps from the low end (−1 is 자동). */
  private pos(r: Row): number {
    if (r.kind === 'number') return r.value === null ? -1 : (r.value - r.min) / r.step;
    return r.value ?? 0;
  }

  render(): void {
    const tab = this.tab;
    tab.sync?.();
    const rows = this.visible;
    this.rowAt = clamp(this.rowAt, 0, Math.max(0, rows.length - 1));
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    q('.pane-tabs').innerHTML = (this.tabs.length > 1 ? this.tabs.map((t, i) => `<span data-tab="${i}" class="${i === this.tabAt ? 'on' : ''}">${esc(t.label)}</span>`).join('') : '');
    q('.pane-head').innerHTML = `<b>${esc(this.options.tabs === 'side' ? tab.label : this.options.title)}</b><span>${esc(tab.intro || (this.options.tabs === 'side' ? '' : tab.label))}</span>`;
    q('.pane-rows').innerHTML = rows
      .map((r, i) => {
        if (r.html !== undefined) return `${r.heading ? `<div class="pane-sub cap">${esc(r.heading)}</div>` : ''}<div class="pane-block" data-i="${i}">${r.html}</div>`;
        const changed = r.value !== r.initial && (r.kind === 'number' || r.kind === 'choice' || r.kind === 'switch');
        const value =
          r.kind === 'keybind'
            ? `${r.warn ? '<i class="warn" title="플레이 중 키와 겹침">!</i>' : ''}<span class="caps">${(r.caps ?? []).map((c, k) => `<kbd class="${i === this.rowAt && k === this.capAt ? 'at' : ''}${c ? '' : ' empty'}"${r.capColors ? ` style="--cap:${r.capColors[k]}"` : ''}>${esc(this.capturing && i === this.rowAt && k === this.capAt ? '…' : c || '·')}</kbd>`).join('')}</span>`
            : r.kind === 'info'
              ? ''
              : r.kind === 'color'
                ? `<i class="swatch" style="background:${this.colour()}"></i><span class="num">${this.colour()}</span>`
                : r.kind === 'custom'
                  ? this.custom(r)
                  : `<span class="${r.kind === 'switch' || /[가-힣]/.test(this.text(r)) ? '' : 'num'}">${esc(this.text(r))}</span>`;
        return `${r.heading ? `<div class="pane-sub cap">${esc(r.heading)}</div>` : ''}<div class="opt${i === this.rowAt ? ' on' : ''}${r.kind === 'info' ? ' info' : ''}${r.kind === 'action' ? ' act' : ''}" data-i="${i}"><span class="opt-name">${esc(r.label)}</span><span class="opt-val">${changed ? '<i class="changed" title="기본값과 다름"></i>' : ''}${value}</span></div>`;
      })
      .join('');
    const rowsBox = q('.pane-rows');
    const on = this.root.querySelector<HTMLElement>('.opt.on');
    if (on) {
      // keep the picked row in sight (and the blocks above the first row, while it is the one picked)
      const first = rows.findIndex((r) => !r.skip);
      if (this.rowAt === first && !this.moved) rowsBox.scrollTop = 0;
      else if (on.offsetTop + on.offsetHeight > rowsBox.scrollTop + rowsBox.clientHeight) rowsBox.scrollTop = on.offsetTop + on.offsetHeight - rowsBox.clientHeight;
      else if (on.offsetTop < rowsBox.scrollTop) rowsBox.scrollTop = on.offsetTop;
    }
    this.tuner();
  }

  private colour(): string {
    const by = (l: string) => this.tab.rows.find((r) => r.label === l)?.value ?? 0;
    return hsv(by('색상'), by('채도') / 100, by('밝기') / 100);
  }

  private custom(r: Row, big = false): string {
    if (r.label === '레인') return `<span class="${big ? 'bigcaps' : 'caps'} lanes">${(r.caps ?? []).map((c, k) => `<kbd class="${k === r.value ? 'at' : ''}" style="--cap:${r.capColors?.[k] ?? 'var(--bone)'}">${c}</kbd>`).join('')}</span>`;
    if (r.label === '관리') return `<span class="acts"><span>새 프리셋으로 저장</span></span>`;
    return '';
  }

  private tuner(): void {
    const r = this.row;
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    const tuner = q('.tuner');
    if (!r) return;
    tuner.dataset.kind = r.kind;
    const scaled = r.kind === 'number' || r.kind === 'choice' || r.kind === 'switch';
    q('.tuner-name').innerHTML = `<span class="cap">${esc(r.label)}</span>${scaled && r.value !== r.initial ? `<span class="cap dim">기본값 ${esc(r.kind === 'number' ? (r.initial === null ? '자동' : r.format(r.initial)) : (r.values[r.initial ?? 0] ?? ''))}</span>` : ''}`;
    const read = q('.tuner-read');
    read.textContent = scaled ? this.text(r) : '';
    read.className = `tuner-read${/[가-힣]/.test(read.textContent ?? '') ? ' ko' : ' num'}`;
    const act = q('.tuner-act');
    if (r.kind === 'action') act.innerHTML = `<span class="btn${this.armed?.row === r ? ' armed' : ''}">${esc(this.text(r))} ${kbd('Enter')}</span>`;
    else if (r.kind === 'keybind') {
      const n = r.caps?.length ?? 0;
      const n2 = r.caps2?.length ?? 0;
      const cap = (c: string, k: number) => `<kbd class="${k === this.capAt ? 'at' : ''}${c ? '' : ' empty'}"${r.capColors ? ` style="--cap:${r.capColors[k % n]}"` : ''}>${esc(this.capturing && k === this.capAt ? '…' : c || '·')}</kbd>`;
      const actions = r.values.length ? `<span class="acts">${r.values.map((v, k) => `<span class="${this.capAt === n + n2 + k ? 'at' : ''}">${esc(v)}</span>`).join('')}</span>` : '';
      act.innerHTML =
        `<span class="capgrid"><span class="bigcaps">${(r.caps ?? []).map(cap).join('')}</span>${r.caps2 ? `<span class="bigcaps second"><em class="cap">보조 키</em>${r.caps2.map((c, k) => cap(c, n + k)).join('')}</span>` : ''}</span>${actions}` +
        (this.capturing ? `<span class="btn armed">쓸 키를 누르세요 ${kbd('Esc')} 취소</span>` : '');
    } else if (r.kind === 'color') act.innerHTML = `<span class="bigswatch" style="background:${this.colour()}"></span><span class="num hex">HEX ${this.colour()}</span>`;
    else if (r.kind === 'custom') act.innerHTML = this.custom(r, true);
    else act.innerHTML = '';
    const help = q('.pane-help');
    const text = r.help || this.tab.defaultHelp;
    help.innerHTML = `${r.warn ? `<b class="warn-text">${esc(r.warn)}</b> ` : ''}${esc(text)}`;
    // a long help runs on into a second column
    help.classList.toggle('long', text.length + (r.warn?.length ?? 0) > 170);
  }

  private drawScale(): void {
    const r = this.row;
    const { g, w, h } = fitCanvas(this.scale);
    if (!r || w === 0 || !(r.kind === 'number' || r.kind === 'choice' || r.kind === 'switch')) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const px = rem / 16;
    const target = this.pos(r);
    // the scale slides to its place
    this.shown += (target - this.shown) * 0.35;
    if (Math.abs(target - this.shown) < 0.002) this.shown = target;
    const cx = Math.round(w / 2);
    // scale labels keep clear of the value read out over the mark
    const read = this.root.querySelector('.tuner-read') as HTMLElement;
    const clear = measure(read) / 2 + 10 * px;
    const bone = token('--bone');
    const dim = token('--bone-2');
    const tick = token('--bone-3');
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    if (r.kind === 'number') {
      const steps = Math.round((r.max - r.min) / r.step);
      const gap = clamp((w * 0.9) / Math.min(steps, 60), 7 * px, 22 * px);
      const per = Math.max(1, Math.round(r.bigStep / r.step));
      // labels far enough apart to read
      let every = per;
      g.font = `600 ${15 * px}px ${token('--font-num')}`;
      const widest = g.measureText(r.format(r.max)).width + 14 * px;
      while (every * gap < widest) every += per;
      const first = Math.max(r.auto ? -1 : 0, Math.floor(this.shown - cx / gap));
      const last = Math.min(steps, Math.ceil(this.shown + cx / gap));
      for (let i = first; i <= last; i++) {
        const x = cx + (i - this.shown) * gap;
        const major = i >= 0 && i % per === 0;
        // the default's own tick is taller and white
        const isDefault = r.initial !== null && Math.abs(r.min + i * r.step - r.initial) < r.step / 2;
        g.fillStyle = isDefault ? bone : major ? dim : tick;
        const tall = isDefault ? 18 * px : i < 0 ? 16 * px : major ? 14 * px : 7 * px;
        g.fillRect(Math.round(x) - (major || isDefault ? px : px / 2), h - tall, major || isDefault ? 2 * px : px, tall);
        if (i < 0 || (i % every === 0 && major)) {
          const label = i < 0 ? '자동' : r.format(round(r.min + i * r.step, r.step));
          if (Math.abs(x - cx) > clear + g.measureText(label).width / 2) {
            g.fillStyle = dim;
            g.fillText(label, x, h - 22 * px);
          }
        }
      }
      if (r.label === '색상') {
        // the hue's own colours under its scale
        for (let i = first; i <= last; i++) {
          g.fillStyle = hsv(r.min + i * r.step, 0.85, 1);
          g.fillRect(cx + (i - this.shown) * gap - gap / 2, h - 4 * px, gap + 1, 4 * px);
        }
      }
    } else {
      g.font = `600 ${17 * px}px ${token('--font-ui')}`;
      const widest = Math.max(...r.values.map((v) => g.measureText(v).width));
      const gap = Math.max(widest + 28 * px, 84 * px);
      r.values.forEach((v, i) => {
        const x = cx + (i - this.shown) * gap;
        if (x < -gap || x > w + gap) return;
        g.fillStyle = i === r.initial ? bone : tick;
        g.fillRect(Math.round(x) - px, h - (i === r.initial ? 18 : 12) * px, 2 * px, (i === r.initial ? 18 : 12) * px);
        if (Math.abs(x - cx) > clear + g.measureText(v).width / 2) {
          g.fillStyle = dim;
          g.fillText(v, x, h - 22 * px);
        }
      });
    }
  }

  private change(r: Row, dir: 1 | -1, big: boolean): void {
    if (r.kind === 'number') {
      const step = big ? r.bigStep : r.step;
      let v: number | null;
      if (r.value === null) v = dir > 0 ? r.min : null;
      else {
        const next = round(r.value + dir * step, r.step);
        if (r.wraps) v = (next + 360) % 360;
        else if (r.auto && next < r.min - 1e-9) v = null;
        else v = clamp(next, r.min, r.max);
        v = v === null ? null : Number(v.toFixed(4));
      }
      if (v === r.value) return sfx('edge');
      r.value = v;
      sfx(big ? 'slideBig' : 'slide', 1, dir > 0 ? 1.04 : 0.96);
    } else if (r.kind === 'choice') {
      if (r.values.length < 2) return sfx('edge');
      r.value = ((r.value ?? 0) + dir + r.values.length) % r.values.length;
      sfx('slide', 1, dir > 0 ? 1.04 : 0.96);
    } else if (r.kind === 'switch') {
      r.value = r.value === 0 ? 1 : 0;
      sfx(r.value === 0 ? 'on' : 'off');
    } else if (r.label === '레인') {
      const next = clamp((r.value ?? 0) + dir, 0, (r.caps?.length ?? 1) - 1);
      if (next === r.value) return sfx('edge');
      r.value = next;
      sfx('cursor');
    } else if (r.kind === 'keybind') {
      const n = (r.caps?.length ?? 0) + (r.caps2?.length ?? 0) + r.values.length;
      const next = clamp(this.capAt + dir, 0, n - 1);
      if (next === this.capAt) return sfx('edge');
      this.capAt = next;
      sfx('cursor');
    } else return sfx('edge');
    if (r.bind && r.value !== null) setSettings({ ...state.settings, ...r.bind(r.value) });
    this.render();
    this.options.onChange?.(r);
  }

  private press(r: Row): void {
    if (r.kind === 'switch') return this.change(r, 1, false);
    if (r.kind === 'choice') return this.change(r, 1, false);
    if (r.kind === 'keybind') {
      const keys = (r.caps?.length ?? 0) + (r.caps2?.length ?? 0);
      // one of the row's buttons (차례로 지정, 기본값, 동시 입력 테스트 …)
      if (this.capAt >= keys) return sfx('confirm');
      this.capturing = true;
      sfx('confirm');
      return this.render();
    }
    if (r.kind === 'action') {
      if (r.press === 'twice') {
        // a second press within three seconds, not a dialog (a pad cannot answer one)
        if (this.armed?.row === r && this.armed.until > performance.now()) {
          this.armed = null;
          sfx('danger');
          this.options.onAction?.(r);
        } else {
          this.armed = { row: r, until: performance.now() + 3000 };
          sfx('confirm');
          setTimeout(() => {
            if (this.armed?.row === r) this.armed = null;
            if (this.alive) this.render();
          }, 3050);
        }
        return this.render();
      }
      if (this.options.onAction?.(r)) return;
      if (r.label === '모두 초기화') {
        if (this.armed?.row === r && this.armed.until > performance.now()) {
          this.snapshot = new Map(this.tabs.flatMap((t) => t.rows.map((x) => [x, x.value] as [Row, number | null])));
          let patch = {};
          for (const t of this.tabs)
            for (const x of t.rows) {
              x.value = x.initial;
              if (x.bind && x.initial !== null) patch = { ...patch, ...x.bind(x.initial) };
            }
          setSettings({ ...state.settings, ...patch });
          this.armed = null;
          markReset(performance.now());
          sfx('danger');
          setTimeout(() => this.alive && this.render(), 10_050);
        } else {
          this.armed = { row: r, until: performance.now() + 3000 };
          sfx('confirm');
          setTimeout(() => {
            if (this.armed?.row === r) this.armed = null;
            if (this.alive) this.render();
          }, 3050);
        }
        return this.render();
      }
      if (r.label === '되돌리기' && this.snapshot) {
        let patch = {};
        for (const [x, v] of this.snapshot) {
          x.value = v;
          if (x.bind && v !== null) patch = { ...patch, ...x.bind(v) };
        }
        setSettings({ ...state.settings, ...patch });
        this.snapshot = null;
        markReset(-Infinity);
        sfx('confirm');
        return this.render();
      }
      sfx('confirm');
      return;
    }
    sfx('edge');
  }

  private click(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const press = (code: string) => this.key(new KeyboardEvent('keydown', { code, key: code }));
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) {
      const to = Number(tab.dataset.tab);
      while (this.tabAt !== to) press('KeyE');
      return;
    }
    const opt = t.closest<HTMLElement>('.opt[data-i]');
    if (opt) {
      const i = Number(opt.dataset.i);
      if (i !== this.rowAt && !this.visible[i]?.skip) {
        this.rowAt = i;
        this.capAt = 0;
        this.moved = true;
        this.shown = this.pos(this.visible[i]);
        sfx('cursor');
        this.render();
      } else if (this.row && (this.row.kind === 'switch' || this.row.kind === 'action')) this.press(this.row);
      return;
    }
    if (t.closest('.tuner-act .btn')) return void (this.row && this.press(this.row));
    const tuner = t.closest<HTMLElement>('.tuner');
    if (tuner && this.row && (this.row.kind === 'number' || this.row.kind === 'choice' || this.row.kind === 'switch')) {
      const box = tuner.getBoundingClientRect();
      press(e.clientX < box.left + box.width / 2 ? 'ArrowLeft' : 'ArrowRight');
    }
  }

  key(e: KeyboardEvent): boolean {
    const code = e.code;
    const r = this.row;
    if (this.capturing && r) {
      const n = r.caps?.length ?? 0;
      const into = this.capAt < n ? r.caps : r.caps2;
      if (code !== 'Escape' && into) {
        into[this.capAt < n ? this.capAt : this.capAt - n] = code === 'Backspace' || code === 'Delete' ? '' : keyName(code);
        sfx('on');
      } else sfx('back');
      this.capturing = false;
      this.render();
      return true;
    }
    const rows = this.visible;
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      const d = code === 'ArrowUp' ? -1 : 1;
      let next = this.rowAt + d;
      while (next >= 0 && next < rows.length && rows[next].skip) next += d;
      if (next < 0 || next >= rows.length) {
        // above the first row there may be blocks to read: show them again
        const box = this.root.querySelector('.pane-rows') as HTMLElement;
        if (d < 0 && box.scrollTop > 0) box.scrollTop = 0;
        else sfx('edge');
        this.moved = false;
        return true;
      }
      this.moved = true;
      this.rowAt = next;
      this.capAt = 0;
      const to = rows[next];
      this.shown = this.pos(to);
      sfx('cursor');
      this.render();
    } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
      if (r) this.change(r, code === 'ArrowLeft' ? -1 : 1, e.shiftKey);
    } else if ((code === 'Enter' || code === 'NumpadEnter') && !this.options.passEnter) {
      if (r) this.press(r);
    } else if (code === 'KeyQ' || code === 'KeyE') {
      this.tabAt = (this.tabAt + (code === 'KeyQ' ? this.tabs.length - 1 : 1)) % this.tabs.length;
      this.rowAt = Math.max(0, this.visible.findIndex((r) => !r.skip));
      this.capAt = 0;
      this.moved = false;
      const first = this.row;
      this.shown = first ? this.pos(first) : 0;
      sfx('tab');
      this.render();
      this.options.onTab?.(this.tab);
    } else return false;
    return true;
  }
}

/** The width of an element's text as it is laid out. */
function measure(node: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(node);
  return range.getBoundingClientRect().width;
}

export function hsv(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}
