import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { DECK_STYLES, type DeckStyle } from '../render/deckArt';
import { BUILTIN_SKINS, skinById, styleOf, type SkinParts } from '../render/skins';
import { HIT_STYLES, NOTE_STYLES, SIDE_STYLES, type HitStyle, type NoteStyle, type SideStyle } from '../render/tintArt';
import type { Settings, SideNotes } from '../settings/settings';

/** The option rows of the settings and the song select's play options. */

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The track skins to choose from: the built-in ones, and the user's when there is one. */
export function skinChoices(settings: Pick<Settings, 'customSkin'>): [string, string][] {
  return [
    ...BUILTIN_SKINS.map((k): [string, string] => [k.id, k.label]),
    ...(settings.customSkin !== null ? [['custom', (settings.customSkin as { label?: string }).label ?? '사용자 스킨'] as [string, string]] : []),
  ];
}

/** The parts of the gear by name (설정 → 기어). */
export const NOTE_NAMES: Record<NoteStyle, string> = { flat: '기본', stem: '악기색', chamfer: '메카 챔퍼', round: '원형', star4: '별 (4각)', star5: '별 (5각)' };
export const SIDE_NAMES: Record<SideStyle, string> = { bar: '노트와 같게', dots: '도트 매트릭스' };
export const DECK_NAMES: Record<DeckStyle, string> = {
  line: '라인',
  stem: '악기색',
  arcade: '아케이드',
  mixer: '믹서',
  hazard: '해저드',
  neon: '네온',
  crystal: '크리스털',
  candy: '캔디',
  jewel: '보석',
  mono: '모노',
  concrete: '콘크리트 슬래브',
  avionics: '에이비오닉스',
  cassette: '카세트 데크',
  grand: '그랜드 피아노',
};
export const HIT_NAMES: Record<HitStyle | 'flipbook' | 'none', string> = {
  flash: '플래시',
  stemflash: '악기색 플래시',
  star: '별빛',
  bomb: '사각 폭발',
  flare: '플레어',
  hex: '육각',
  shards: '파편',
  bubbles: '거품',
  wave: '임팩트 웨이브',
  spark: '스파크',
  grid: 'LED 그리드',
  shutter: '셔터',
  flipbook: '보석 섬광',
  none: '없음',
};

/** Each part's choices: the skin's own (named, so it shows what it is), then every style; the side notes' styles alone. */
export function partChoices(settings: Pick<Settings, 'skin' | 'customSkin'>): { [K in keyof SkinParts]: [SkinParts[K], string][] } {
  const own = styleOf(skinById(settings.skin, settings.customSkin));
  return {
    note: [['skin', `스킨 (${NOTE_NAMES[own.note]})`], ...NOTE_STYLES.map((v): [NoteStyle, string] => [v, NOTE_NAMES[v]])],
    side: SIDE_STYLES.map((v): [SideStyle, string] => [v, SIDE_NAMES[v]]),
    deck: [['skin', `스킨 (${DECK_NAMES[own.deck]})`], ...DECK_STYLES.map((v): [DeckStyle, string] => [v, DECK_NAMES[v]])],
    hit: [['skin', `스킨 (${HIT_NAMES[own.hit]})`], ...HIT_STYLES.map((v): [HitStyle, string] => [v, HIT_NAMES[v]])],
  };
}

/** How the side notes of 4K+FX and 6K+FX are drawn, by name (the settings' gear tab and the song select's gear rows). */
export const SIDE_NOTE_CHOICES: [SideNotes, string][] = [
  ['lanes', '별도 레인'],
  ['half', '반쪽 덮기'],
];

export interface RowProps {
  label: string;
  help: string;
  onHelp: (help: string) => void;
  testId?: string;
  /** Enter is the screen's, not the row's (the song select's panels: Enter plays). */
  passEnter?: boolean;
}

/**
 * A setting as an arcade option row: its name, and its value between ‹ ›. ←→ (or the arrows)
 * change it, Shift by a bigger step; Enter moves a choice on or flips a switch, and a click on a
 * switch flips it.
 */
export function OptionRow(
  props: RowProps & {
    text: string;
    value: string;
    onStep: (dir: 1 | -1, big: boolean) => void;
    onPress?: () => void;
    /** A switch's state (on / off rows). */
    checked?: boolean;
  },
) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      props.onStep(e.code === 'ArrowLeft' ? -1 : 1, e.shiftKey);
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !props.passEnter) {
      e.preventDefault();
      if (!e.repeat) props.onPress?.();
    }
  };
  // the arrows change the value and leave the focus on the row
  const arrow = (dir: 1 | -1) => ({
    onMouseDown: (e: ReactMouseEvent) => e.preventDefault(),
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => {
      (e.currentTarget.closest('.opt') as HTMLElement | null)?.focus();
      props.onStep(dir, e.shiftKey);
    },
  });
  return (
    <div
      className="opt"
      tabIndex={0}
      role={props.checked === undefined ? 'spinbutton' : 'switch'}
      aria-label={props.label}
      aria-valuetext={props.checked === undefined ? props.text : undefined}
      aria-checked={props.checked}
      data-testid={props.testId}
      data-value={props.value}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // a switch flips under the pointer anywhere but on its arrows (they flip it themselves)
        if (props.checked !== undefined && !(e.target as HTMLElement).closest('.opt-step')) props.onPress?.();
      }}
      onFocus={() => props.onHelp(props.help)}
    >
      <span className="opt-name">{props.label}</span>
      <span className="opt-value">
        <button type="button" className="opt-step" tabIndex={-1} aria-hidden="true" {...arrow(-1)}>
          ‹
        </button>
        <b>{props.text}</b>
        <button type="button" className="opt-step" tabIndex={-1} aria-hidden="true" {...arrow(1)}>
          ›
        </button>
      </span>
    </div>
  );
}

/** One of a list; the ends wrap around. */
export function Choice<T extends string>(props: RowProps & { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const at = Math.max(0, props.options.findIndex(([id]) => id === props.value));
  const move = (dir: 1 | -1) => props.onChange(props.options[(at + dir + props.options.length) % props.options.length][0]);
  return <OptionRow {...props} text={props.options[at]?.[1] ?? String(props.value)} value={props.value} onStep={(dir) => move(dir)} onPress={() => move(1)} />;
}

/** A number between min and max, in steps (Shift: bigger steps). */
export function NumberOption(
  props: RowProps & { value: number; min: number; max: number; step: number; bigStep: number; format: (v: number) => string; onChange: (v: number) => void },
) {
  const step = (dir: 1 | -1, big: boolean) => {
    // rounded, so 0.1 steps do not drift into 0.30000000000000004
    const next = Math.round((props.value + dir * (big ? props.bigStep : props.step)) * 1e6) / 1e6;
    const clamped = Math.min(props.max, Math.max(props.min, next));
    if (clamped !== props.value) props.onChange(clamped);
  };
  return <OptionRow {...props} text={props.format(props.value)} value={String(props.value)} onStep={step} />;
}

export interface OptionalRange {
  min: number;
  max: number;
  step: number;
  bigStep: number;
  /** Where leaving 자동 starts. */
  auto: number;
}

/**
 * One step of a number that may be 자동 (null): leaving 자동 goes to `auto`, a step past either
 * end goes back to 자동 (a big step stops at the end first).
 */
export function optionalStep(value: number | null, dir: 1 | -1, big: boolean, r: OptionalRange): number | null {
  if (value === null) return r.auto;
  const end = dir > 0 ? r.max : r.min;
  const next = Math.round((value + dir * (big ? r.bigStep : r.step)) * 1e6) / 1e6;
  if (next >= r.min && next <= r.max) return next;
  return big && value !== end ? end : null;
}

/** A number, or 자동 (null: the generator or the difficulty decides). */
export function OptionalNumberOption(props: RowProps & OptionalRange & { value: number | null; format: (v: number) => string; onChange: (v: number | null) => void }) {
  const step = (dir: 1 | -1, big: boolean) => props.onChange(optionalStep(props.value, dir, big, props));
  return <OptionRow {...props} text={props.value === null ? '자동' : props.format(props.value)} value={props.value === null ? 'auto' : String(props.value)} onStep={step} />;
}

/** On or off; ←, → and Enter all flip it. */
export function Toggle(props: RowProps & { value: boolean; onChange: (v: boolean) => void }) {
  const flip = () => props.onChange(!props.value);
  return <OptionRow {...props} text={props.value ? '켬' : '끔'} value={String(props.value)} checked={props.value} onStep={flip} onPress={flip} />;
}

/** A row that does something (Enter or a click). */
export function ActionOption(props: RowProps & { action: string; onPress: () => void }) {
  return (
    <button className="opt opt-action" data-testid={props.testId} onClick={props.onPress} onFocus={() => props.onHelp(props.help)}>
      <span className="opt-name">{props.label}</span>
      <span className="opt-value">
        <b>{props.action}</b> <kbd>Enter</kbd>
      </span>
    </button>
  );
}
