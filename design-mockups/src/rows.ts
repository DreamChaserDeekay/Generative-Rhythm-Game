import { sfx } from './audio';
import { ICON } from './art';
import { clamp, el, esc, kbd } from './dom';
import { markReset, round, type Row } from './inventory';
import { setSettings, state } from './state';

interface ListOptions {
  /** Enter is the screen's, not the row's (the song select: Enter plays). */
  passEnter?: boolean;
  /** A row took the cursor (its help is shown by whoever holds the list). */
  onFocus?: (row: Row | undefined) => void;
  onAction?: (row: Row) => boolean;
  /** After a row's value changed. */
  onChange?: (row: Row) => void;
  /** Every row of the screen (모두 초기화 puts them all back), when the list shows one tab of several. */
  all?: () => Row[];
}

const KEY_NAMES: Record<string, string> = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Quote: "'", Enter: 'Enter', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Minus: '-', Equal: '=' };
const keyName = (code: string) => KEY_NAMES[code] ?? code.replace(/^Key|^Digit/, '');

/**
 * A list of rows: a name and its value. ↑↓ pick a row, ←→ change it (Shift a big step), Enter
 * presses it. The row picked is a paper plate; it shows where its value stands among the others.
 * The settings, the play options and the song's tools are all this one list.
 */
export class RowList {
  readonly root = el('div', 'rl');
  private rows: Row[] = [];
  private at = 0;
  private capAt = 0;
  private capturing = false;
  private armed: { row: Row; until: number } | null = null;
  private snapshot: Map<Row, number | null> | null = null;
  private alive = true;

  constructor(
    host: HTMLElement,
    rows: Row[],
    private options: ListOptions = {},
  ) {
    host.replaceChildren(this.root);
    this.root.addEventListener('click', (e) => this.click(e));
    this.setRows(rows);
  }

  dispose(): void {
    this.alive = false;
    this.root.remove();
  }

  setRows(rows: Row[], keep = false): void {
    this.rows = rows;
    if (!keep) {
      this.at = Math.max(0, this.visible.findIndex((r) => !r.skip));
      this.capAt = 0;
    }
    this.render();
    if (!keep) (this.root.parentElement as HTMLElement | null)?.scrollTo?.(0, 0);
  }

  get capturingNow(): boolean {
    return this.capturing;
  }
  private get visible(): Row[] {
    return this.rows.filter((r) => !r.when || r.when());
  }
  get row(): Row | undefined {
    return this.visible[this.at];
  }

  /** Puts the cursor on a row by its name. */
  focus(label: string): void {
    const i = this.visible.findIndex((r) => r.label === label && !r.skip);
    if (i >= 0) {
      this.at = i;
      this.render();
    }
  }

  private text(r: Row): string {
    if (r.kind === 'number') return r.value === null ? '자동' : r.format(r.value);
    if (r.kind === 'choice' || r.kind === 'switch') return r.values[r.value ?? 0] ?? '';
    if (r.kind === 'action') return this.armed?.row === r ? (r.values[1] ?? r.values[0]) : (r.values[0] ?? r.label);
    return r.values[0] ?? '';
  }

  private colour(): string {
    const by = (l: string) => this.rows.find((r) => r.label === l)?.value ?? 0;
    return hsv(by('색상'), by('채도') / 100, by('밝기') / 100);
  }

  private value(r: Row, on: boolean): string {
    const arrows = (body: string, offL = false, offR = false) => `<i class="rl-arr${offL ? ' off' : ''}">${ICON.left}</i>${body}<i class="rl-arr${offR ? ' off' : ''}">${ICON.right}</i>`;
    if (r.render) return r.render(on);
    if (r.kind === 'number') {
      const span = r.max - r.min || 1;
      const pos = r.value === null ? 0 : clamp((r.value - r.min) / span, 0, 1);
      const meter = r.wraps ? '' : `<span class="rl-meter">${r.initial !== null ? `<u style="left:${clamp((r.initial - r.min) / span, 0, 1) * 100}%"></u>` : ''}${r.value === null ? '' : `<i style="left:${pos * 100}%"></i>`}</span>`;
      const text = this.text(r);
      return `${meter}${arrows(`<span class="v${/[가-힣]/.test(text) ? '' : ' num'}">${esc(text)}</span>`, !r.wraps && (r.auto ? r.value === null : r.value !== null && r.value <= r.min + 1e-9), !r.wraps && r.value !== null && r.value >= r.max - 1e-9)}`;
    }
    if (r.kind === 'choice' || r.kind === 'switch') {
      const n = r.values.length;
      const pips = n > 1 && n <= 9 ? `<span class="rl-pips">${r.values.map((_, k) => `<i class="${k === r.value ? 'at' : ''}"></i>`).join('')}</span>` : '';
      const text = this.text(r);
      return `${pips}${arrows(`<span class="v${/[가-힣]/.test(text) ? '' : ' num'}">${esc(text)}</span>`)}`;
    }
    if (r.kind === 'action') return `<span class="btn${this.armed?.row === r ? ' armed' : ''}">${esc(this.text(r))}${on ? kbd('Enter') : ''}</span>`;
    if (r.kind === 'keybind') {
      const n = r.caps?.length ?? 0;
      const cap = (c: string, k: number) => `<kbd class="${on && k === this.capAt ? 'at' : ''}${c ? '' : ' empty'}"${r.capColors ? ` style="--cap:${r.capColors[k % Math.max(1, n)]}"` : ''}>${esc(this.capturing && on && k === this.capAt ? '…' : c || '·')}</kbd>`;
      return `${r.warn ? '<i class="warn" title="플레이 중 키와 겹침">!</i>' : ''}<span class="caps">${(r.caps ?? []).map(cap).join('')}</span>`;
    }
    if (r.kind === 'color') return `<i class="swatch" style="background:${this.colour()}"></i><span class="v num">${this.colour().toUpperCase()}</span>`;
    if (r.kind === 'custom' && r.label === '레인') return `<span class="caps">${(r.caps ?? []).map((c, k) => `<kbd class="${k === r.value ? 'at' : ''}" style="--cap:${r.capColors?.[k] ?? 'transparent'}">${c}</kbd>`).join('')}</span>`;
    if (r.kind === 'custom' && r.label === '관리') return `<span class="btn">새 프리셋으로 저장${on ? kbd('Enter') : ''}</span>`;
    return `<span class="v">${esc(this.text(r))}</span>`;
  }

  /** Under the picked row of keys: its buttons, and the lanes' second keys. */
  private extra(r: Row): string {
    if (r.kind !== 'keybind') return '';
    const n = r.caps?.length ?? 0;
    const n2 = r.caps2?.length ?? 0;
    const acts = r.values.length ? `<span class="acts">${r.values.map((v, k) => `<span class="${this.capAt === n + n2 + k ? 'at' : ''}">${esc(v)}</span>`).join('')}</span>` : '';
    const second = r.caps2
      ? `<span class="second"><span>보조 키</span><span class="caps">${r.caps2.map((c, k) => `<kbd class="${n + k === this.capAt ? 'at' : ''}${c ? '' : ' empty'}"${r.capColors ? ` style="--cap:${r.capColors[k % Math.max(1, n)]}"` : ''}>${esc(this.capturing && n + k === this.capAt ? '…' : c || '·')}</kbd>`).join('')}</span></span>`
      : '';
    return acts || second ? `<span class="rl-extra">${acts}${second}</span>` : '';
  }

  render(): void {
    const rows = this.visible;
    this.at = clamp(this.at, 0, Math.max(0, rows.length - 1));
    this.root.innerHTML = rows
      .map((r, i) => {
        // a heading over the row, or only a rule (—) where a new group starts without a name
        const head = r.heading === '—' ? '<div class="rl-rule"></div>' : r.heading ? `<div class="rl-sub">${esc(r.heading)}</div>` : '';
        const changed = !r.free && r.value !== r.initial && (r.kind === 'number' || r.kind === 'choice' || r.kind === 'switch') ? '<i class="rl-changed" title="기본값과 다름"></i>' : '';
        if (r.html !== undefined) return `${head}<div class="rl-block" data-i="${i}">${r.html}</div>`;
        const on = i === this.at;
        const extra = on ? this.extra(r) : '';
        return `${head}<div class="rl-row${on ? ' on' : ''}${r.kind === 'info' ? ' ro' : ''}${r.kind === 'action' || (r.kind === 'custom' && r.label === '관리') ? ' act' : ''}${extra ? ' wide' : ''}" data-i="${i}"><span class="rl-name">${esc(r.label)}${changed}</span><span class="rl-val">${this.value(r, on)}</span>${extra}</div>`;
      })
      .join('');
    const on = this.root.querySelector<HTMLElement>('.rl-row.on');
    const box = this.root.parentElement;
    if (on && box) {
      // the picked row stays in sight, and so does a heading right above it
      const prev = on.previousElementSibling as HTMLElement | null;
      const top = (prev?.classList.contains('rl-sub') || prev?.classList.contains('rl-rule') || prev?.classList.contains('rl-block') ? prev : on).offsetTop - this.root.offsetTop;
      const bottom = on.offsetTop - this.root.offsetTop + on.offsetHeight;
      if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
      if (top < box.scrollTop) box.scrollTop = top;
    }
    this.options.onFocus?.(this.row);
  }

  private change(r: Row, dir: 1 | -1, big: boolean): void {
    if (r.onKey) {
      r.onKey(dir, big);
    } else if (r.kind === 'number') {
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

  private arm(r: Row, fire: () => void): void {
    // a second press within three seconds, not a dialog (a pad cannot answer one)
    if (this.armed?.row === r && this.armed.until > performance.now()) {
      this.armed = null;
      sfx('danger');
      fire();
    } else {
      this.armed = { row: r, until: performance.now() + 3000 };
      sfx('confirm');
      setTimeout(() => {
        if (this.armed?.row === r) this.armed = null;
        if (this.alive) this.render();
      }, 3050);
    }
    this.render();
  }

  private press(r: Row): void {
    if (r.kind === 'switch' || r.kind === 'choice') return this.change(r, 1, false);
    if (r.kind === 'keybind') {
      const keys = (r.caps?.length ?? 0) + (r.caps2?.length ?? 0);
      // one of the row's buttons (차례로 지정, 기본값, 동시 입력 테스트 …)
      if (this.capAt >= keys) {
        sfx('confirm');
        this.options.onAction?.(r);
        return;
      }
      this.capturing = true;
      sfx('confirm');
      return this.render();
    }
    if (r.kind === 'action' || r.kind === 'custom') {
      if (r.press === 'twice') return this.arm(r, () => this.options.onAction?.(r));
      if (r.label === '모두 초기화') {
        return this.arm(r, () => {
          const all = this.options.all?.() ?? this.rows;
          this.snapshot = new Map(all.map((x) => [x, x.value] as [Row, number | null]));
          let patch = {};
          for (const x of all) {
            x.value = x.initial;
            if (x.bind && x.initial !== null) patch = { ...patch, ...x.bind(x.initial) };
          }
          setSettings({ ...state.settings, ...patch });
          markReset(performance.now());
          setTimeout(() => this.alive && this.render(), 10_050);
        });
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
      this.options.onAction?.(r);
      return;
    }
    sfx('edge');
  }

  private click(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const opt = t.closest<HTMLElement>('.rl-row[data-i]');
    if (!opt) return;
    const i = Number(opt.dataset.i);
    const r = this.visible[i];
    if (!r || r.skip || r.kind === 'info') return;
    if (i !== this.at) {
      this.at = i;
      this.capAt = 0;
      sfx('cursor');
      this.render();
      return;
    }
    const arrow = t.closest('.rl-arr');
    if (arrow) return this.change(r, arrow === opt.querySelector('.rl-arr') ? -1 : 1, e.shiftKey);
    if (r.kind === 'switch' || r.kind === 'action' || r.kind === 'choice' || (r.kind === 'custom' && r.label === '관리')) this.press(r);
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
      let next = this.at + d;
      while (next >= 0 && next < rows.length && (rows[next].skip || rows[next].kind === 'info')) next += d;
      if (next < 0 || next >= rows.length) {
        // above the first row there may be something to read: show it again
        const box = this.root.parentElement;
        if (box && d < 0) box.scrollTop = 0;
        sfx('edge');
        return true;
      }
      this.at = next;
      this.capAt = 0;
      sfx('cursor');
      this.render();
    } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
      if (r) this.change(r, code === 'ArrowLeft' ? -1 : 1, e.shiftKey);
    } else if ((code === 'Enter' || code === 'NumpadEnter') && !this.options.passEnter) {
      if (r) this.press(r);
    } else return false;
    return true;
  }
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
