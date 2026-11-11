import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { GEAR_STYLES, type GearStyle } from '../render/deckArt';
import type { HudTypeSource } from '../render/gearHud';
import { SKIN_IDS, type SkinId, type SkinParts } from '../render/skins';
import { HIT_STYLES, NOTE_STYLES, SIDE_STYLES, type HitStyle, type NoteStyle, type SideStyle } from '../render/tintArt';

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
  rainbow: '무지개',
  noir: '레드라인',
  magenta: '크림슨',
  wire: '화이트 라인',
  astral: '별밤',
  flat: '기본',
  chrome: '크롬 베벨',
  hairline: '헤어라인',
  glass: '유리',
  enamel: '에나멜',
  pearl: '펄',
  carbon: '카본',
  chamfer: '메카 챔퍼',
  round: '원형',
  star4: '별 (4각)',
  star5: '별 (5각)',
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
  rainbow: '무지개',
  noir: '레드라인',
  magenta: '크림슨',
  wire: '화이트 라인',
  astral: '별밤',
  standard: '기본',
  cabinet: '오락실 기체',
  receiver: '빈티지 리시버',
  najeon: '나전칠기',
  keyboard: '커스텀 키보드',
  racing: '레이싱 휠',
  orbital: '우주선 계기판',
  piano: '피아노',
  rawglass: '달',
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
  rainbow: '색종이',
  noir: '글리치',
  magenta: '파편 섬광',
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

/** The skins by name (설정 → 기어 → 스킨), and what the row reads while the parts are no skin's (picked one by one). */
export const SKIN_NAMES: Record<SkinId, string> = { default: '기본', crystal: '크리스털', sky: '하늘', fire: '파이어스타터', gpt: 'GPT', gemini: 'Gemini', grok: 'Grok', claude: 'Claude', aqua: '아쿠아', steel: '스틸', rainbow: '무지개', noir: '레드라인', magenta: '크림슨', wire: '화이트 라인', astral: '별밤' };
export const CUSTOM_SKIN = 'custom';
export const CUSTOM_SKIN_NAME = '직접 고름';

/** The skin row's choices: the skins, and 직접 고름 only while it is what the row reads (it is not something to pick). */
export function skinChoices(current: SkinId | null): [SkinId | typeof CUSTOM_SKIN, string][] {
  const skins = SKIN_IDS.map((id): [SkinId | typeof CUSTOM_SKIN, string] => [id, SKIN_NAMES[id]]);
  return current === null ? [...skins, [CUSTOM_SKIN, CUSTOM_SKIN_NAME]] : skins;
}

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
    /** Where the value stands among its choices: shown as a square each while the row has the cursor. */
    pips?: { count: number; at: number };
    /** Where a number stands in its range, 0 to 1: shown as a mark on a line while the row has the cursor. */
    meter?: number;
    /** The default as the row shows it, while its value is another (see RowProps.defaultValue). */
    defaultText?: string | null;
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
      onClick={(e) => {
        // a switch flips under the pointer anywhere but on its arrows (they flip it themselves)
        if (props.checked !== undefined && !(e.target as HTMLElement).closest('.opt-step')) props.onPress?.();
      }}
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
          <span className="opt-meter" aria-hidden="true">
            <i style={{ left: `${Math.min(1, Math.max(0, props.meter)) * 100}%` }} />
          </span>
        )}
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
  return <OptionRow {...props} text={text} value={String(props.value)} onStep={step} meter={meter} defaultText={defaultText} />;
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
  return <OptionRow {...props} text={text} value={props.value === null ? 'auto' : String(props.value)} onStep={step} defaultText={defaultText} />;
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
