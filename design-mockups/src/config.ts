import { activeCovers, greenNumber } from '@game/settings/settings';
import { sfx } from './audio';
import { MARK } from './art';
import { el, esc, kbd } from './dom';
import { settingsTabs, syncRows, type Row, type Tab } from './inventory';
import { RowList } from './rows';
import type { Stage } from './stage';
import { onSettings, state } from './state';

/**
 * A help text that goes through every value in turn ("기본은 …, 오락실 기체는 …, 달은 …입니다.")
 * is cut to the value picked: what stands before the list, the picked value's own words, what
 * follows the list. The words are the game's; only the other values' are left out.
 */
function picked(text: string, labels: string[], current: string): { intro: string; clause: string; outro: string } | null {
  const marks = labels
    .map((l) => {
      const [a, b] = [text.indexOf(`${l}은 `), text.indexOf(`${l}는 `)];
      return { l, i: a < 0 ? b : b < 0 ? a : Math.min(a, b) };
    })
    .filter((m) => m.i >= 0)
    .sort((x, y) => x.i - y.i);
  const at = marks.findIndex((m) => m.l === current);
  if (marks.length < 3 || at < 0) return null;
  const stop = text.indexOf('. ', marks[marks.length - 1].i);
  const end = stop < 0 ? text.length : stop + 1;
  const clause = text
    .slice(marks[at].i + current.length + 2, at + 1 < marks.length ? marks[at + 1].i : end)
    .trim()
    .replace(/,$/, '')
    .replace(/(입니다|로 씁니다)\.$/, '')
    .trim();
  return { intro: text.slice(0, marks[0].i).trim(), clause, outro: text.slice(end).trim() };
}
const ENTER: Record<string, string> = { judge: '열기', keys: '바꾸기', pad: '지정', advanced: '누르기', mapper: '누르기', notes: '누르기' };
const ROWS: Record<string, [string, string]> = { keys: ['모드', '레인'], pad: ['모드', '레인'] };

/**
 * Settings. The tabs down the left, the picked tab's rows in the middle, and on the right what the
 * picked row means: its help, and for the tabs that change how the track looks, the track itself.
 */
export class ConfigScreen {
  readonly root = el('section', 'screen config');
  private tabs: Tab[] = settingsTabs();
  private at = Math.max(0, this.tabs.findIndex((t) => t.id === 'speed'));
  private list: RowList | null = null;
  onDone: () => void = () => undefined;
  onToast: (text: string) => void = () => undefined;

  constructor(private stage: Stage) {
    this.root.innerHTML = `
      <header class="top">
        <div class="mark">${MARK}<span>GENERATIVE RHYTHM</span></div>
        <span class="where">설정</span>
        <div class="end"><button class="top-act" data-key="Escape">완료 ${kbd('Esc')}</button></div>
      </header>
      <div class="cfg">
        <aside class="cfg-side"><nav class="cfg-tabs"></nav><div class="cfg-tabs-key">${kbd('Q', 'E')}<span>탭</span></div></aside>
        <section class="cfg-main"><div class="cfg-head"></div><div class="cfg-rows"></div><div class="cfg-help"></div></section>
        <aside class="cfg-aside">
          <div class="cfg-preview-head"><span class="cap">미리보기</span><b class="num" data-mode></b><span class="green"><span class="cap">보이는 시간</span><b class="num" data-green></b></span></div>
          <div class="cfg-stage"></div>
        </aside>
      </div>
      <div class="toast"></div>
      <footer class="hints"></footer>`;
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cfg-tab]');
      if (t) this.setTab(Number(t.dataset.cfgTab));
    });
    onSettings(() => this.readout());
  }

  private q<T extends HTMLElement>(s: string): T {
    return this.root.querySelector(s) as T;
  }
  private get tab(): Tab {
    return this.tabs[this.at];
  }

  private readout(): void {
    const s = state.settings;
    this.q('[data-green]').textContent = `${Math.round(greenNumber(s.hiSpeed, activeCovers(s)))}ms`;
    this.q('[data-mode]').textContent = state.mode;
  }

  enter(): void {
    this.root.classList.add('on');
    this.stage.mount(this.q('.cfg-stage'));
    this.stage.apply(state.settings, state.mode);
    this.stage.start();
    this.draw();
    this.readout();
  }

  leave(): void {
    this.root.classList.remove('on');
    this.stage.stop();
    this.list?.dispose();
    this.list = null;
  }

  /** A key is being bound: every key is the list's. */
  get takesKeys(): boolean {
    return this.list?.capturingNow ?? false;
  }

  private setTab(i: number): void {
    const next = (i + this.tabs.length) % this.tabs.length;
    if (next === this.at) return;
    this.at = next;
    sfx('tab');
    this.draw();
  }

  private draw(): void {
    const tab = this.tab;
    // what the song select or a play changed meanwhile
    if (tab.id !== 'notes') syncRows(tab.rows);
    tab.sync?.();
    this.root.dataset.tab = tab.id;
    this.q('.cfg-tabs').innerHTML = this.tabs.map((t, i) => `<button data-cfg-tab="${i}" class="${i === this.at ? 'on' : ''}">${esc(t.label)}</button>`).join('');
    this.q('.cfg-head').innerHTML = `<b>${esc(tab.label)}</b><span>${esc(tab.intro)}</span>`;
    this.list?.dispose();
    this.list = new RowList(this.q('.cfg-rows'), tab.rows, {
      all: () => this.tabs.flatMap((t) => t.rows),
      onFocus: (r) => this.help(r),
      onChange: () => {
        tab.sync?.();
        this.list?.render();
      },
      onAction: (r) => {
        this.toast(r.kind === 'keybind' ? `'${r.label}'의 버튼은 지금 게임 그대로 동작합니다.` : `'${r.label}'은(는) 지금 게임의 화면을 그대로 엽니다. 이번 시안은 곡 선택 · 설정 · 플레이만 다룹니다.`);
        return true;
      },
    });
    const [rowName, valueName] = ROWS[tab.id] ?? ['항목', '값'];
    this.q('.hints').innerHTML = `<span>${kbd('↑', '↓')}${rowName}</span><span>${kbd('←', '→')}${valueName}</span>${ENTER[tab.id] ? `<span>${kbd('Enter')}${ENTER[tab.id]}</span>` : ''}<span>${kbd('Shift')}큰 단계</span><span>${kbd('Q', 'E')}탭</span><span class="end"><button data-key="Escape">${kbd('Esc')}<span>완료</span></button></span>`;
  }

  private help(r: Row | undefined): void {
    const text = r?.help || this.tab.defaultHelp || '';
    const initial = r && !r.free && r.value !== r.initial && (r.kind === 'number' || r.kind === 'choice' || r.kind === 'switch') ? `<span class="was">기본값 ${esc(r.kind === 'number' ? (r.initial === null ? '자동' : r.format(r.initial)) : (r.values[r.initial ?? 0] ?? ''))}</span>` : '';
    // the two rows whose help names every gear: only the picked gear's words
    const gear = this.tabs.find((t) => t.id === 'gear')?.rows.find((x) => x.label === '기어');
    const cut = r && gear && (r === gear || r.label === '판정·콤보 글꼴') ? picked(text, gear.values, gear.values[gear.value ?? 0]) : null;
    const body = cut ? `<p>${esc(cut.intro)}</p><p class="of"><b>${esc(gear?.values[gear.value ?? 0] ?? '')}</b>${esc(cut.clause)}</p><p>${esc(cut.outro)}</p>` : `<p>${esc(text)}</p>`;
    this.q('.cfg-help').innerHTML = `${r?.warn ? `<p class="warn-text">${esc(r.warn)}</p>` : ''}${body}${initial}`;
  }

  private toastTimer = 0;
  private toast(text: string): void {
    const t = this.q('.toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('on'), 2600);
  }

  key(e: KeyboardEvent): boolean {
    if (this.list?.capturingNow) return this.list.key(e);
    const code = e.code;
    if (code === 'KeyQ' || code === 'KeyE') this.setTab(this.at + (code === 'KeyQ' ? -1 : 1));
    else if (this.list?.key(e)) return true;
    else if (code === 'Escape' || code === 'F10') {
      sfx('back');
      this.onDone();
    } else return false;
    return true;
  }
}
