/**
 * What players come to the menus to do, with the shortest way found for the keyboard and for a
 * pad. `frequency` is an estimate (no telemetry exists): `why` says what it rests on.
 */

export interface Goal {
  /** The screen state (lib.ts names it). */
  state?: string | RegExp;
  /** Stored settings by path ("parts.deck") and the value wanted (or a test of it). */
  setting?: Record<string, unknown>;
  /** A test id that shows. */
  visible?: string;
  /** A test id whose text holds this. */
  text?: [string, string];
  /** The control with the focus. */
  focus?: string;
}

/** A press, a press repeated until something holds (each one counted), or a wait for the game (not counted). */
export type Step = string | { press: string; until: Goal; max?: number } | { wait: string; then?: number };

export interface Route {
  steps: Step[];
  /** New places to look at on the way (a screen, a panel, a tab, a row): one M of the model each. */
  looks: number;
}

export type Frequency = '판마다' | '곡마다' | '하루 한 번' | '처음 한 번' | '거의 안 함';

export interface Task {
  id: string;
  title: string;
  who: string;
  frequency: Frequency;
  /** What the estimate rests on. */
  why: string;
  root?: 'lib' | 'empty' | 'offline';
  setup?: Record<string, unknown>;
  goal: Goal;
  goalTimeoutMs?: number;
  kb?: Route;
  /** null: no way was found with a pad alone (padWhy says what is missing). */
  pad?: Route | null;
  padWhy?: string;
}

const play = { state: /^play:(loading|running)$/ };
const setting = (key: string, value: unknown): Goal => ({ setting: { [key]: value } });
const until = (pressed: string, goal: Goal, max?: number): Step => ({ press: pressed, until: goal, max });
const tab = (name: string): Goal => ({ state: `settings:${name}` });

export const TASKS: Task[] = [
  {
    id: 'T01',
    title: '곡을 골라(다음 곡) 플레이 시작',
    who: '모두',
    frequency: '판마다',
    why: '한 판을 하려면 반드시 거치는 일',
    goal: play,
    goalTimeoutMs: 20_000,
    kb: { steps: ['ArrowDown', 'Enter'], looks: 1 },
    pad: { steps: ['Pad:Down', 'Pad:A'], looks: 1 },
  },
  {
    id: 'T02',
    title: '결과에서 같은 곡 다시 하기',
    who: '매일 하는 사람 · 고수',
    frequency: '판마다',
    why: '결과 화면의 두 갈래(다시 / 선곡으로) 가운데 하나. 기록을 올리려는 플레이어는 같은 곡을 되풀이함',
    goal: play,
    goalTimeoutMs: 20_000,
    kb: { steps: ['KeyI', until('ArrowDown', { focus: 'sync-auto' }), 'Enter', { wait: 'result-screen', then: 2500 }, 'KeyR'], looks: 1 },
    pad: { steps: ['Pad:LT', until('Pad:Down', { focus: 'sync-auto' }), 'Pad:A', { wait: 'result-screen', then: 2500 }, 'Pad:X'], looks: 1 },
  },
  {
    id: 'T03',
    title: '결과에서 선곡으로 돌아가기',
    who: '모두',
    frequency: '판마다',
    why: '결과 화면의 두 갈래 가운데 하나',
    goal: { state: 'select' },
    kb: { steps: ['KeyI', until('ArrowDown', { focus: 'sync-auto' }), 'Enter', { wait: 'result-screen', then: 2500 }, 'Enter'], looks: 1 },
    pad: { steps: ['Pad:LT', until('Pad:Down', { focus: 'sync-auto' }), 'Pad:A', { wait: 'result-screen', then: 2500 }, 'Pad:A'], looks: 1 },
  },
  {
    id: 'T04',
    title: '플레이 중 멈추고 처음부터 다시',
    who: '고수',
    frequency: '판마다',
    why: '초반에 놓치면 바로 다시 하는 습관(풀콤·고득점 도전). 일시정지 메뉴가 그 통로',
    goal: { state: 'play:running' },
    goalTimeoutMs: 20_000,
    kb: { steps: ['Enter', { wait: 'hud-panel', then: 2500 }, 'Escape', 'KeyR'], looks: 1 },
    pad: { steps: ['Pad:A', { wait: 'hud-panel', then: 2500 }, 'Pad:Start', until('Pad:Down', { focus: 'pause-menu>button[1]:다시 하기 R' }), 'Pad:A'], looks: 1 },
  },
  {
    id: 'T05',
    title: '난이도 한 단계 올리기',
    who: '모두',
    frequency: '곡마다',
    why: '곡마다 맞는 난이도가 달라 고를 때마다 봄',
    goal: setting('lastDifficulty', 'HARD'),
    kb: { steps: ['ArrowRight'], looks: 1 },
    pad: { steps: ['Pad:Right'], looks: 1 },
  },
  {
    id: 'T06',
    title: '노트 속도 +0.5 (플레이 전에)',
    who: '매일 하는 사람 · 고수',
    frequency: '곡마다',
    why: 'BPM이 다른 곡으로 옮기면 보이는 시간을 맞추려고 바꿈. 플레이 중 키로도 바꿀 수 있음',
    goal: setting('hiSpeed', 4.5),
    kb: { steps: ['Space', until('KeyE', { state: 'select+options:gear' }), 'Shift+ArrowRight'], looks: 3 },
    pad: { steps: ['Pad:X', until('Pad:RB', { state: 'select+options:gear' }), until('Pad:Right', setting('hiSpeed', 4.5))], looks: 3 },
  },
  {
    id: 'T07',
    title: '배치를 랜덤으로',
    who: '고수',
    frequency: '곡마다',
    why: '랜덤 계열은 곡이나 연습 목적에 따라 켜고 끔',
    goal: setting('placement', 'RANDOM'),
    kb: { steps: ['Space', until('ArrowRight', setting('placement', 'RANDOM'))], looks: 2 },
    pad: { steps: ['Pad:X', until('Pad:Right', setting('placement', 'RANDOM'))], looks: 2 },
  },
  {
    id: 'T08',
    title: '게이지를 HARD로',
    who: '고수',
    frequency: '곡마다',
    why: '클리어 램프를 노릴 때 곡마다 고름',
    goal: setting('gaugeType', 'HARD'),
    kb: { steps: ['Space', until('ArrowDown', { focus: 'rule-gauge' }), until('ArrowRight', setting('gaugeType', 'HARD'))], looks: 2 },
    pad: { steps: ['Pad:X', until('Pad:Down', { focus: 'rule-gauge' }), until('Pad:Right', setting('gaugeType', 'HARD'))], looks: 2 },
  },
  {
    id: 'T09',
    title: '새 패턴 만들기 (같은 난이도)',
    who: '매일 하는 사람',
    frequency: '곡마다',
    why: '이 게임의 핵심 기능(곡마다 다른 채보). 마음에 들지 않는 패턴을 바꿀 때',
    goal: { setting: { patterns: (v: unknown) => typeof v === 'object' && v !== null && Object.keys(v).length > 0 } },
    goalTimeoutMs: 30_000,
    kb: { steps: ['F5'], looks: 1 },
    pad: null,
    padWhy: '새 패턴(F5)에 해당하는 패드 버튼이 없고, 선곡 화면에서 십자키는 포커스를 옮기지 않아 "새 패턴" 버튼에 닿지 못함',
  },
  {
    id: 'T10',
    title: '오토 플레이로 한 번 보기',
    who: '처음 온 사람',
    frequency: '곡마다',
    why: '새 채보를 치기 전에 미리 보는 용도',
    goal: play,
    goalTimeoutMs: 20_000,
    kb: { steps: ['Shift+Enter'], looks: 1 },
    pad: { steps: ['Pad:RS'], looks: 1 },
  },
  {
    id: 'T11',
    title: '곡 찾기: 제목으로 검색해서 고르기',
    who: '매일 하는 사람',
    frequency: '곡마다',
    why: '곡이 많아지면 목록을 내려가는 것보다 검색이 빠름',
    goal: { state: 'select', text: ['song-title', 'Demo'] },
    kb: { steps: ['Slash', 'type:demo', 'Enter'], looks: 2 },
    pad: null,
    padWhy: '글자를 넣을 수단이 없음(화면 키보드 없음)',
  },
  {
    id: 'T12',
    title: '이 곡을 즐겨찾기에 넣기',
    who: '매일 하는 사람',
    frequency: '곡마다',
    why: '자주 치는 곡을 모을 때',
    goal: { setting: { favorites: (v: unknown) => Array.isArray(v) && v.length === 1 } },
    kb: { steps: ['F3'], looks: 1 },
    pad: null,
    padWhy: '즐겨찾기(F3)에 해당하는 패드 버튼이 없고 버튼에 포커스가 닿지 않음',
  },
  {
    id: 'T13',
    title: '즐겨찾기 폴더만 보기',
    who: '매일 하는 사람',
    frequency: '하루 한 번',
    why: '세션을 시작할 때 볼 범위를 정함',
    setup: { favorites: ['0000000000000000'] },
    goal: setting('songFolder', 'favorites'),
    kb: { steps: ['ShiftLeft'], looks: 1 },
    pad: null,
    padWhy: '폴더(Shift·F6)에 해당하는 패드 버튼이 없음',
  },
  {
    id: 'T14',
    title: '정렬을 레벨순으로',
    who: '매일 하는 사람',
    frequency: '하루 한 번',
    why: '세션을 시작할 때 한 번',
    goal: setting('songSort', 'level'),
    kb: { steps: [until('F4', setting('songSort', 'level'))], looks: 1 },
    pad: null,
    padWhy: '정렬(F4)에 해당하는 패드 버튼이 없음',
  },
  {
    id: 'T15',
    title: '키 모드를 4K에서 6K로',
    who: '모두',
    frequency: '하루 한 번',
    why: '대개 한 세션은 한 키 모드로 침',
    goal: setting('lastKeyMode', '6K'),
    kb: { steps: [until('Tab', setting('lastKeyMode', '6K'))], looks: 1 },
    pad: { steps: [until('Pad:Y', setting('lastKeyMode', '6K'))], looks: 1 },
  },
  {
    id: 'T16',
    title: '판정이 늦게 느껴진다: 판정 오프셋 +10ms',
    who: '모두',
    frequency: '하루 한 번',
    why: '기기(모니터·헤드폰)를 바꾸거나 그날 손이 다를 때. 처음에는 꼭 한 번',
    goal: setting('inputOffsetMs', 10),
    kb: { steps: ['F10', until('KeyQ', tab('judge')), until('ArrowDown', { focus: 'opt-input-offset' }), 'Shift+ArrowRight', 'Shift+ArrowRight'], looks: 3 },
    pad: { steps: ['Pad:RT', until('Pad:LB', tab('judge')), until('Pad:Down', { focus: 'opt-input-offset' }), until('Pad:Right', setting('inputOffsetMs', 10))], looks: 3 },
  },
  {
    id: 'T17',
    title: '음악 소리를 10% 줄이기',
    who: '모두',
    frequency: '하루 한 번',
    why: '곡마다 음량이 달라 가끔 맞춤',
    goal: setting('musicVolume', 0.8),
    kb: { steps: ['F10', until('KeyE', tab('sound')), 'ArrowLeft', 'ArrowLeft'], looks: 3 },
    pad: { steps: ['Pad:RT', until('Pad:RB', tab('sound')), 'Pad:Left', 'Pad:Left'], looks: 3 },
  },
  {
    id: 'T18',
    title: '첫 판: 곡이 없을 때 데모 곡을 넣기',
    who: '처음 온 사람',
    frequency: '처음 한 번',
    why: '첫 실행의 첫 일',
    root: 'empty',
    goal: { focus: 'first-demo' },
    kb: { steps: [until('ArrowDown', { focus: 'first-demo' })], looks: 1 },
    pad: { steps: [until('Pad:Down', { focus: 'first-demo' })], looks: 1 },
  },
  {
    id: 'T19',
    title: '판정 오프셋 측정 열기',
    who: '처음 온 사람',
    frequency: '처음 한 번',
    why: '기기마다 한 번 맞추면 됨',
    goal: { state: 'calibration:input' },
    kb: { steps: ['F10', until('KeyQ', tab('judge')), until('ArrowDown', { focus: 'open-calibration-settings' }), 'Enter'], looks: 3 },
    pad: { steps: ['Pad:RT', until('Pad:LB', tab('judge')), until('Pad:Down', { focus: 'open-calibration-settings' }), 'Pad:A'], looks: 3 },
  },
  {
    id: 'T20',
    title: '4K의 1번 레인 키를 A로 바꾸기',
    who: '처음 온 사람',
    frequency: '처음 한 번',
    why: '키 배치는 한 번 정하면 거의 그대로 씀',
    goal: { setting: { bindings: (v: unknown) => (v as Record<string, string[]> | undefined)?.['4K']?.[0] === 'KeyA' } },
    kb: { steps: ['F10', until('KeyE', tab('keys')), 'Enter', 'KeyA'], looks: 3 },
    pad: null,
    padWhy: '키보드 키를 지정하는 일이라 패드만으로는 뜻이 없음',
  },
  {
    id: 'T21',
    title: '기어를 다른 것으로 바꾸기',
    who: '모두',
    frequency: '거의 안 함',
    why: '꾸미기는 한 번 정하면 오래 씀',
    goal: { setting: { 'parts.deck': (v: unknown) => v !== 'standard' && v !== undefined } },
    kb: { steps: ['F10', until('KeyE', tab('gear')), 'ArrowRight'], looks: 3 },
    pad: { steps: ['Pad:RT', until('Pad:RB', tab('gear')), 'Pad:Right'], looks: 3 },
  },
  {
    id: 'T22',
    title: '난이도 기준을 DJMAX로',
    who: '고수',
    frequency: '거의 안 함',
    why: '익숙한 게임의 척도를 한 번 고르면 그대로 씀(기록도 기준마다 따로)',
    goal: setting('difficultySystem', 'DJMAX'),
    kb: { steps: ['F10', until('KeyQ', tab('play')), until('ArrowRight', setting('difficultySystem', 'DJMAX'))], looks: 3 },
    pad: { steps: ['Pad:RT', until('Pad:LB', tab('play')), until('Pad:Right', setting('difficultySystem', 'DJMAX'))], looks: 3 },
  },
  {
    id: 'T23',
    title: '전체 화면으로',
    who: '모두',
    frequency: '처음 한 번',
    why: '데스크톱 앱은 창 상태를 기억함',
    goal: setting('displayMode', 'fullscreen'),
    kb: { steps: ['F10', until('KeyQ', tab('advanced')), 'ArrowRight'], looks: 3 },
    pad: { steps: ['Pad:RT', until('Pad:LB', tab('advanced')), 'Pad:Right'], looks: 3 },
  },
  {
    id: 'T24',
    title: '판정 카운터(FAST·SLOW 수) 켜기',
    who: '고수',
    frequency: '처음 한 번',
    why: 'HUD 구성은 한 번 정하면 그대로 씀',
    goal: setting('judgeCounter', true),
    kb: { steps: ['F10', until('KeyQ', tab('judge')), until('ArrowDown', { focus: 'opt-judge-counter' }), 'Enter'], looks: 3 },
    pad: { steps: ['Pad:RT', until('Pad:LB', tab('judge')), until('Pad:Down', { focus: 'opt-judge-counter' }), 'Pad:A'], looks: 3 },
  },
  {
    id: 'T25',
    title: '이 곡의 오프셋을 +5ms',
    who: '고수',
    frequency: '거의 안 함',
    why: '음원 앞 여백이 다른 곡에서만 필요',
    goal: { setting: { songOffsets: (v: unknown) => typeof v === 'object' && v !== null && Object.values(v).includes(5) } },
    kb: { steps: ['KeyI', until('ArrowDown', { focus: 'song-offset-minus5' }), until('ArrowRight', { focus: 'song-offset-plus5' }), 'Enter'], looks: 3 },
    pad: { steps: ['Pad:LT', until('Pad:Down', { focus: 'song-offset-minus5' }), until('Pad:Right', { focus: 'song-offset-plus5' }), 'Pad:A'], looks: 3 },
  },
  {
    id: 'T26',
    title: '연습 모드 켜기',
    who: '매일 하는 사람 · 고수',
    frequency: '거의 안 함',
    why: '막히는 구간이 있을 때만',
    goal: { visible: 'practice-options' },
    goalTimeoutMs: 30_000,
    kb: { steps: ['Space', until('ArrowDown', { focus: 'practice-toggle' }), 'ArrowRight'], looks: 2 },
    pad: { steps: ['Pad:X', until('Pad:Down', { focus: 'practice-toggle' }), 'Pad:Right'], looks: 2 },
  },
  {
    id: 'T27',
    title: '곡 추가 메뉴 열기',
    who: '모두',
    frequency: '하루 한 번',
    why: '새 곡을 넣을 때(파일 고르기는 운영체제 창이라 세지 않음)',
    goal: { state: 'select+add' },
    kb: { steps: ['Shift+Equal'], looks: 1 },
    pad: null,
    padWhy: '곡 추가(+)에 해당하는 패드 버튼이 없고 상단 바에 포커스가 닿지 않음',
  },
  {
    id: 'T28',
    title: '설정을 모두 초기화',
    who: '모두',
    frequency: '거의 안 함',
    why: '설정이 꼬였을 때의 마지막 수단',
    setup: { hiSpeed: 7 },
    goal: setting('hiSpeed', 4),
    kb: { steps: ['F10', until('KeyQ', tab('advanced')), until('ArrowDown', { focus: 'reset-all' }), 'Enter', 'Enter'], looks: 3 },
    pad: { steps: ['Pad:RT', until('Pad:LB', tab('advanced')), until('Pad:Down', { focus: 'reset-all' }), 'Pad:A', 'Pad:A'], looks: 3 },
  },
  {
    id: 'T29',
    title: '채보 에디터 열기',
    who: '고수',
    frequency: '거의 안 함',
    why: '채보를 직접 고치는 사람만',
    goal: { state: 'editor' },
    kb: { steps: ['KeyI', until('ArrowDown', { focus: 'edit-chart' }), 'Enter'], looks: 2 },
    pad: { steps: ['Pad:LT', until('Pad:Down', { focus: 'edit-chart' }), 'Pad:A'], looks: 2 },
  },
];
