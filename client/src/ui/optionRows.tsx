import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { BUILTIN_SKINS } from '../render/skins';
import type { Settings } from '../settings/settings';

/** The option rows of the settings and the song select's play options. */

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The track skins to choose from: the built-in ones, and the user's when there is one. */
export function skinChoices(settings: Pick<Settings, 'customSkin'>): [string, string][] {
  return [
    ...BUILTIN_SKINS.map((k): [string, string] => [k.id, k.label]),
    ...(settings.customSkin !== null ? [['custom', (settings.customSkin as { label?: string }).label ?? '사용자 스킨'] as [string, string]] : []),
  ];
}

export interface RowProps {
  label: string;
  help: string;
  onHelp: (help: string) => void;
  testId?: string;
}

/**
 * A setting as an arcade option row: its name, and its value between ‹ ›. ←→ (or the arrows)
 * change it, Shift by a bigger step; Enter moves a choice on or flips a switch.
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
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
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
