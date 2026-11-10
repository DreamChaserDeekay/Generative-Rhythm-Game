import { activeCovers, greenNumber } from '@game/settings/settings';
import { sfx } from './audio';
import { el, kbd } from './dom';
import { settingsTabs, type Tab } from './inventory';
import { RowsPane } from './rows';
import { EMBLEM } from './select';
import { onSettings, state } from './state';

const HINTS: Record<string, string> = {
  judge: `<span>${kbd('↑', '↓')} 항목</span><span>${kbd('←', '→')} 값</span><span>${kbd('Enter')} 열기</span>`,
  keys: `<span>${kbd('↑', '↓')} 모드</span><span>${kbd('←', '→')} 레인</span><span>${kbd('Enter')} 바꾸기</span>`,
  pad: `<span>${kbd('↑', '↓')} 모드</span><span>${kbd('←', '→')} 레인</span><span>${kbd('Enter')} 지정</span>`,
  advanced: `<span>${kbd('↑', '↓')} 항목</span><span>${kbd('←', '→')} 값</span><span>${kbd('Enter')} 누르기</span>`,
};
const BASE = `<span>${kbd('↑', '↓')} 항목</span><span>${kbd('←', '→')} 값</span>`;

/**
 * Settings. The tabs down the left, the tab's rows above the line, the picked row's values along
 * the line, its help under the line; the track stays where the song select left it and shows
 * every change at once.
 */
export class ConfigScreen {
  readonly root = el('section', 'screen config');
  private pane: RowsPane | null = null;
  private tabs = settingsTabs();
  private lastTab = 'speed';
  onDone: () => void = () => undefined;

  constructor() {
    this.root.innerHTML = `
      <header class="top">
        <div class="mark">${EMBLEM}<span>GENERATIVE RHYTHM</span></div>
        <span class="where">설정</span>
        <div class="acts"><span>완료 ${kbd('Esc')}</span></div>
      </header>
      <div class="pane-host"></div>
      <div class="over-track"><div class="now"><span class="cap">미리보기</span><b class="num" data-mode></b></div><div class="green"><span class="cap">보이는 시간</span><b class="num" data-green></b></div></div>
      <footer class="hints"></footer>`;
    onSettings(() => this.readout());
  }

  private readout(): void {
    const s = state.settings;
    (this.root.querySelector('[data-green]') as HTMLElement).textContent = `${Math.round(greenNumber(s.hiSpeed, activeCovers(s)))}ms`;
    (this.root.querySelector('[data-mode]') as HTMLElement).textContent = state.mode;
  }

  private hints(tab: Tab): void {
    this.lastTab = tab.id;
    (this.root.querySelector('.hints') as HTMLElement).innerHTML = `${HINTS[tab.id] ?? BASE}<span>${kbd('Q', 'E')} 탭</span><span class="end"><span>${kbd('Esc')} 완료</span></span>`;
  }

  enter(): void {
    this.root.classList.add('on');
    this.pane = new RowsPane(this.root.querySelector('.pane-host') as HTMLElement, this.tabs, { title: '설정', tabs: 'side', startTab: this.lastTab, onTab: (t) => this.hints(t) });
    this.hints(this.pane.tab);
    this.readout();
  }

  leave(): void {
    this.root.classList.remove('on');
    this.pane?.dispose();
    this.pane = null;
  }

  /** A key is being bound: every key is the pane's. */
  get takesKeys(): boolean {
    return this.pane?.capturingNow ?? false;
  }

  key(e: KeyboardEvent): boolean {
    if (this.pane?.key(e)) return true;
    if (e.code === 'Escape' || e.code === 'F10') {
      sfx('back');
      this.onDone();
      return true;
    }
    return false;
  }
}
