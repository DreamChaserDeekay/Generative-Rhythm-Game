import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { GEAR_STYLES, type GearStyle } from '../render/deckArt';
import type { HudTypeSource } from '../render/gearHud';
import type { SkinParts } from '../render/skins';
import { HIT_STYLES, NOTE_STYLES, SIDE_STYLES, type HitStyle, type NoteStyle, type SideStyle } from '../render/tintArt';
import { entryScale, entryText, gaugeValue, numberIn, startsEntry, typedValue } from './numberEntry';

/** The option rows of the settings and the song select's play options. */

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The parts by name (설정 → 노트 and 기어). */
export const NOTE_NAMES: Record<NoteStyle, string> = {
  prism: '크리스털',
  sky: '하늘',
  fire: '파이어스타터',
  gpt: 'GPT',
  gemini: 'Gemini',
  grok: 'Grok',
  claude: 'Claude',
  aqua: '아쿠아',
  steel: '스틸',
  noir: '레드라인',
  wire: '화이트 라인',
  astral: '별밤',
  flat: '기본',
};
export const SIDE_NAMES: Record<SideStyle, string> = { bar: '기본', dots: '도트 매트릭스' };
export const DECK_NAMES: Record<GearStyle, string> = {
  prism: '크리스털',
  sky: '하늘',
  fire: '파이어스타터',
  gpt: 'GPT',
  gemini: 'Gemini',
  grok: 'Grok',
  claude: 'Claude',
  aqua: '아쿠아',
  steel: '스틸',
  noir: '레드라인',
  wire: '화이트 라인',
  astral: '별밤',
  standard: '기본',
  piano: '피아노',
};
export const HIT_NAMES: Record<HitStyle, string> = {
  prism: '크리스털 분광',
  sky: '구름 깃털',
  fire: '불꽃놀이',
  gpt: '물방울 왕관',
  gemini: '반짝임',
  grok: '엑스 섬광',
  claude: '붓 빛살',
  aqua: '록온',
  steel: '십자 섬광',
  noir: '글리치',
  wire: '선 불꽃',
  astral: '별빛',
  flash: '플래시',
  flare: '플레어',
  bubbles: '거품',
  grid: 'LED 그리드',
  mecha: '메카 섬광',
  club: '클럽 링',
  crystal: '크리스털 파편',
  neon: '네온 아크',
  piano: '피아노 음표',
};

/** Whose type writes the judgement and the combo (설정 → 기어 → 판정·콤보 글꼴): the gear's, or the track's own (기본). */
export const HUD_TYPE_CHOICES: [HudTypeSource, string][] = [
  ['gear', '기어'],
  ['skin', '기본'],
];

/** Each part's choices, by name. */
export const PART_CHOICES: { [K in keyof SkinParts]: [SkinParts[K], string][] } = {
  note: NOTE_STYLES.map((v): [NoteStyle, string] => [v, NOTE_NAMES[v]]),
  side: SIDE_STYLES.map((v): [SideStyle, string] => [v, SIDE_NAMES[v]]),
  deck: GEAR_STYLES.map((v): [GearStyle, string] => [v, DECK_NAMES[v]]),
  hit: HIT_STYLES.map((v): [HitStyle, string] => [v, HIT_NAMES[v]]),
};

export interface RowProps {
  label: string;
  help: string;
  onHelp: (help: string) => void;
  testId?: string;
  /** Enter is the screen's, not the row's (the song select's panels: Enter plays). */
  passEnter?: boolean;
  /**
   * The setting's default, where it is one stored value (a choice's id, a number, on or off, null
   * for 자동). A row given it tells `onDefault`, right after each `onHelp`, how it would show the
   * default, or null while its value is the default (the settings' "기본값" under the help).
   */
  defaultValue?: string | number | boolean | null;
  onDefault?: (text: string | null) => void;
}

/** A choice of more than this many shows no squares: they would say less than the value's name. */
const PIPS_MOST = 12;

/**
 * Enter from a keyboard, which can type the number: a pad's A (the menu bridge's Enter, no key of a
 * real keyboard) or a controller's button sending Enter opens no field it could not fill.
 */
function typedFromKeyboard(e: ReactKeyboardEvent): boolean {
  return e.nativeEvent.isTrusted && document.documentElement.dataset.input !== 'controller';
}

/** A number row's value typed in: the text it starts from, and what to do with what was typed. */
export interface RowEntry {
  /** The value as the number a player edits ("90" on a "90%" row). */
  text: string;
  /** What was typed (Enter, or the field left); a text that is no number changes nothing. */
  onEntry: (typed: string) => void;
}

/**
 * A setting as an arcade option row: its name, and its value between ‹ ›. ←→ (or the arrows)
 * change it, Shift by a bigger step; Enter moves a choice on or flips a switch. A click on the row
 * only puts the cursor on it: a switch flips under the pointer on its 켬 / 끔 (or its arrows) alone.
 * A number is also typed in (the user, 2026-11-20: "모든 수치형 설정 값 직접 키보드로 입력"): a digit,
 * a point or a minus starts the field with it, Enter (where the row takes Enter) or a click on the value
 * with the value; Enter or leaving the field sets it, Esc gives it up. Its gauge takes the pointer
 * ("게이지는 마우스로도 조정"): a press or a drag along it puts the value there.
 */
export function OptionRow(
  props: RowProps & {
    text: string;
    value: string;
    onStep: (dir: 1 | -1, big: boolean) => void;
    onPress?: () => void;
    /** A switch's state (on / off rows). */
    checked?: boolean;
    /** Where the value stands among its choices: shown as a square each while the row has the cursor. */
    pips?: { count: number; at: number };
    /** Where a number stands in its range, 0 to 1: shown as a mark on a line while the row has the cursor. */
    meter?: number;
    /** The default as the row shows it, while its value is another (see RowProps.defaultValue). */
    defaultText?: string | null;
    /** The gauge under the pointer: where along it (0 to 1) it was pressed or dragged to. */
    onGauge?: (at: number) => void;
    /** A number typed in. */
    entry?: RowEntry;
  },
) {
  // the typed number while the field is open (null: the value shows)
  const [typed, setTyped] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  // the field opened with the whole value (select it all) or with the key that opened it (type on)
  const selectAll = useRef(false);
  // set once the field is closed, so its blur as it goes does not set it again
  const closed = useRef(true);
  const open = (text: string, all: boolean) => {
    if (!props.entry) return;
    closed.current = false;
    selectAll.current = all;
    setTyped(text);
  };
  const close = (set: boolean, refocus: boolean) => {
    if (closed.current) return;
    closed.current = true;
    if (set && typed !== null) props.entry?.onEntry(typed);
    setTyped(null);
    if (refocus) row.current?.focus();
  };
  const editing = typed !== null;
  useEffect(() => {
    const input = field.current;
    if (!editing || !input) return;
    input.focus();
    if (selectAll.current) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (props.entry && !e.ctrlKey && !e.metaKey && !e.altKey && startsEntry(e.key)) {
      // the key is the field's first character (and none of the screen's: the song select's 1 to 5)
      e.preventDefault();
      e.stopPropagation();
      open(e.key, false);
    } else if (props.entry && (e.code === 'Enter' || e.code === 'NumpadEnter') && !props.passEnter && !e.shiftKey && typedFromKeyboard(e)) {
      e.preventDefault();
      if (!e.repeat) open(props.entry.text, true);
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      props.onStep(e.code === 'ArrowLeft' ? -1 : 1, e.shiftKey);
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !props.passEnter) {
      e.preventDefault();
      if (!e.repeat) props.onPress?.();
    }
  };
  // the help follows the value (some rows explain the value chosen) while the row has the focus,
  // and so does the default: it is named only while the value is another
  const row = useRef<HTMLDivElement>(null);
  const { onHelp, help, onDefault, defaultText = null } = props;
  const tell = () => {
    onHelp(help);
    onDefault?.(defaultText);
  };
  useEffect(() => {
    if (row.current && document.activeElement === row.current) tell();
  }, [help, defaultText]);
  // the arrows change the value and leave the focus on the row
  const arrow = (dir: 1 | -1) => ({
    onMouseDown: (e: ReactMouseEvent) => e.preventDefault(),
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => {
      (e.currentTarget.closest('.opt') as HTMLElement | null)?.focus();
      props.onStep(dir, e.shiftKey);
    },
  });
  // the gauge: pressed, it takes the pointer until let go, and the value follows along it
  const gaugeAt = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width > 0) props.onGauge?.((e.clientX - r.left) / r.width);
  };
  const gauge = props.onGauge && {
    onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      row.current?.focus();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      gaugeAt(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLSpanElement>) => {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) gaugeAt(e);
    },
  };
  const onFieldKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // every key is the field's (the screen's arrows, Q / E, 1 to 5 and Esc are not taken)
    e.stopPropagation();
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      close(true, true);
    } else if (e.code === 'Escape') {
      e.preventDefault();
      close(false, true);
    }
  };
  return (
    <div
      ref={row}
      className="opt"
      tabIndex={0}
      role={props.checked === undefined ? 'spinbutton' : 'switch'}
      aria-label={props.label}
      aria-valuetext={props.checked === undefined ? props.text : undefined}
      aria-checked={props.checked}
      data-testid={props.testId}
      data-value={props.value}
      onKeyDown={onKeyDown}
      onFocus={tell}
    >
      <span className="opt-name">{props.label}</span>
      <span className="opt-value">
        {props.pips && props.pips.count > 2 && props.pips.count <= PIPS_MOST && (
          <span className="opt-pips" aria-hidden="true">
            {Array.from({ length: props.pips.count }, (_, i) => (
              <i key={i} className={i === props.pips?.at ? 'at' : undefined} />
            ))}
          </span>
        )}
        {props.meter !== undefined && (
          <span className={gauge ? 'opt-meter opt-gauge' : 'opt-meter'} aria-hidden="true" data-testid={props.testId && gauge ? `${props.testId}-gauge` : undefined} {...gauge}>
            <i style={{ left: `${Math.min(1, Math.max(0, props.meter)) * 100}%` }} />
          </span>
        )}
        <button type="button" className="opt-step" tabIndex={-1} aria-hidden="true" {...arrow(-1)}>
          ‹
        </button>
        {typed !== null ? (
          <input
            ref={field}
            className="opt-entry"
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            spellCheck={false}
            autoComplete="off"
            aria-label={`${props.label} 입력`}
            data-testid={props.testId ? `${props.testId}-entry` : undefined}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={onFieldKey}
            onBlur={() => close(true, false)}
          />
        ) : props.checked === undefined ? (
          <b
            className={props.entry ? 'opt-typed' : undefined}
            data-testid={props.testId && props.entry ? `${props.testId}-text` : undefined}
            onClick={props.entry ? () => open(props.entry!.text, true) : undefined}
          >
            {props.text}
          </b>
        ) : (
          // a switch's 켬 / 끔 flips it under the pointer (the row around it only takes the cursor)
          <b className="opt-flip" data-testid={props.testId ? `${props.testId}-flip` : undefined} onClick={() => props.onPress?.()}>
            {props.text}
          </b>
        )}
        <button type="button" className="opt-step" tabIndex={-1} aria-hidden="true" {...arrow(1)}>
          ›
        </button>
      </span>
    </div>
  );
}

/** How a row names its default: not at all where it has none, or where the value now reads the same. */
function defaultShown(text: string | null, shown: string): string | null {
  return text === shown ? null : text;
}

/** One of a list; the ends wrap around. */
export function Choice<T extends string>(props: RowProps & { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const at = Math.max(0, props.options.findIndex(([id]) => id === props.value));
  const move = (dir: 1 | -1) => props.onChange(props.options[(at + dir + props.options.length) % props.options.length][0]);
  const text = props.options[at]?.[1] ?? String(props.value);
  return (
    <OptionRow
      {...props}
      text={text}
      value={props.value}
      onStep={(dir) => move(dir)}
      onPress={() => move(1)}
      pips={{ count: props.options.length, at }}
      defaultText={defaultShown(props.options.find(([id]) => id === props.defaultValue)?.[1] ?? null, text)}
    />
  );
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
  const meter = props.max > props.min ? (props.value - props.min) / (props.max - props.min) : undefined;
  const text = props.format(props.value);
  const defaultText = defaultShown(typeof props.defaultValue === 'number' ? props.format(props.defaultValue) : null, text);
  const set = (v: number) => {
    if (v !== props.value) props.onChange(v);
  };
  const { format, min, max } = props;
  const scale = useMemo(() => entryScale(format, min, max, props.step), [format, min, max, props.step]);
  const entry: RowEntry | undefined = scale
    ? {
        text: entryText(props.value, scale),
        onEntry: (t) => {
          const n = numberIn(t);
          if (n !== null) set(typedValue(n, scale, min, max));
        },
      }
    : undefined;
  return (
    <OptionRow
      {...props}
      text={text}
      value={String(props.value)}
      onStep={step}
      meter={meter}
      defaultText={defaultText}
      onGauge={meter === undefined ? undefined : (at) => set(gaugeValue(at, min, max, props.step))}
      entry={entry}
    />
  );
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
  const shown = (v: number | null) => (v === null ? '자동' : props.format(v));
  const text = shown(props.value);
  const defaultText = defaultShown(props.defaultValue === null || typeof props.defaultValue === 'number' ? shown(props.defaultValue) : null, text);
  const { format, min, max } = props;
  const scale = useMemo(() => entryScale(format, min, max, props.step), [format, min, max, props.step]);
  // a number, or 자동 typed as 자동 / auto / a (nothing typed changes nothing)
  const entry: RowEntry | undefined = scale
    ? {
        text: props.value === null ? entryText(props.auto, scale) : entryText(props.value, scale),
        onEntry: (t) => {
          const word = t.trim().toLowerCase();
          if (word === '자동' || word === 'auto' || word === 'a') {
            if (props.value !== null) props.onChange(null);
            return;
          }
          const n = numberIn(t);
          if (n === null) return;
          const v = typedValue(n, scale, min, max);
          if (v !== props.value) props.onChange(v);
        },
      }
    : undefined;
  return <OptionRow {...props} text={text} value={props.value === null ? 'auto' : String(props.value)} onStep={step} defaultText={defaultText} entry={entry} />;
}

/** On or off; ←, → and Enter all flip it. */
export function Toggle(props: RowProps & { value: boolean; onChange: (v: boolean) => void }) {
  const flip = () => props.onChange(!props.value);
  const shown = (v: boolean) => (v ? '켬' : '끔');
  const defaultText = defaultShown(typeof props.defaultValue === 'boolean' ? shown(props.defaultValue) : null, shown(props.value));
  return <OptionRow {...props} text={shown(props.value)} value={String(props.value)} checked={props.value} onStep={flip} onPress={flip} defaultText={defaultText} />;
}

/** A row that does something (Enter or a click). */
export function ActionOption(props: RowProps & { action: string; onPress: () => void }) {
  return (
    <button className="opt opt-action" data-testid={props.testId} onClick={props.onPress} onFocus={() => props.onHelp(props.help)}>
      <span className="opt-name">{props.label}</span>
      <span className="opt-value">
        <b className="opt-button">{props.action}</b>
      </span>
    </button>
  );
}
