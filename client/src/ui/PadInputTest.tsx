import { useEffect, useRef, useState } from 'react';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { GamepadPoller, padCodeLabel, suspendMenuBridges, type PadEvent, type TurntableOptions } from '../input/gamepad';

/** Start held this long closes the test (a tap of it may be a lane's button). */
export const PAD_TEST_CLOSE_MS = 1000;

/** The controls held and ever pressed, and a turntable lane's scratches with the way the last one turned. */
export interface PadTestState {
  held: string[];
  seen: string[];
  scratches: number;
  way: number;
}

export const PAD_TEST_START: PadTestState = { held: [], seen: [], scratches: 0, way: 0 };

/**
 * A pad event on the test. The poller reads every axis as a turntable too: a turntable that is
 * no lane's (a stick moved) is left out, and so is the direction of a turntable lane's axis
 * (play does not read it, and a platter at rest past half way would look like a stuck button).
 */
export function padTestStep(state: PadTestState, e: PadEvent, lanes: readonly (string | null)[]): PadTestState {
  const scratch = e.code.startsWith('Pad:TT');
  if (scratch && !lanes.includes(e.code)) return state;
  const axis = /^Pad:A(\d+)[+-]$/.exec(e.code)?.[1];
  if (axis !== undefined && lanes.includes(`Pad:TT${axis}`)) return state;
  const held = state.held.filter((c) => c !== e.code);
  if (!e.down) return { ...state, held };
  const seen = state.seen.includes(e.code) ? state.seen : [...state.seen, e.code];
  return scratch ? { held: [...held, e.code], seen, scratches: state.scratches + 1, way: e.way ?? 0 } : { ...state, held: [...held, e.code], seen };
}

/**
 * Pad check of a key mode, read as in play (the turntable settings too): each lane lights while
 * its control is held, every control held is named (so a pad with nothing bound yet shows its
 * buttons), and a turntable lane counts its scratches. The menus do not see the pad meanwhile;
 * Esc, 닫기 or Start held closes it.
 */
export function PadInputTest({
  mode,
  lanes,
  start,
  turntable,
  onClose,
}: {
  mode: KeyModeId;
  lanes: (string | null)[];
  start: string | null;
  turntable: TurntableOptions;
  onClose: () => void;
}) {
  const [state, setState] = useState(PAD_TEST_START);
  const box = useRef<HTMLDivElement>(null);
  // it opens under its row: in sight, without moving the focus
  useEffect(() => box.current?.scrollIntoView({ block: 'nearest' }), []);

  const bound = lanes.join(' ');
  const { steps, releaseMs } = turntable;
  useEffect(() => {
    const codes = bound.split(' ');
    const resumeMenus = suspendMenuBridges();
    let hold = 0;
    const poller = new GamepadPoller(
      (e) => {
        if (e.code === start) {
          window.clearTimeout(hold);
          if (e.down) hold = window.setTimeout(onClose, PAD_TEST_CLOSE_MS);
        }
        setState((s) => padTestStep(s, e, codes));
      },
      { intervalMs: 8, turntable: { steps, releaseMs } },
    );
    poller.start();
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      // closes the test, not the settings screen
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.clearTimeout(hold);
      poller.stop();
      window.removeEventListener('keydown', onKey, { capture: true });
      resumeMenus();
    };
  }, [bound, start, steps, releaseMs, onClose]);

  const colours = keyModes[mode].lanes;
  const turntableLane = lanes.some((code) => code?.startsWith('Pad:TT'));
  const lit = (code: string | null, list: string[]) => code !== null && list.includes(code);
  return (
    <div className="ghost-test" ref={box} data-testid="pad-test">
      <div className="keys">
        {lanes.map((code, lane) => (
          <div
            key={lane}
            className={`key-cap pad-cap lane-${colours[lane].color}${lit(code, state.held) ? ' active' : ''}${lit(code, state.seen) ? ' seen' : ''}${code ? '' : ' empty'}`}
            data-testid={`pad-test-lane-${lane}`}
          >
            {code ? padCodeLabel(code) : ''}
          </div>
        ))}
      </div>
      <p className="hint" data-testid="pad-test-held">
        누르고 있는 것: {state.held.length > 0 ? state.held.map(padCodeLabel).join(', ') : '없음'}
      </p>
      {turntableLane && (
        <p className="hint" data-testid="pad-test-turntable">
          턴테이블: {state.scratches > 0 ? `스크래치 ${state.scratches}번 (마지막은 ${state.way > 0 ? '+' : '−'} 방향)` : '돌려 보세요'}
        </p>
      )}
      <p className="hint">
        <button className="small" onClick={onClose}>
          닫기 <kbd>Esc</kbd>
        </button>
        {start && ` 패드는 Start(${padCodeLabel(start)})를 ${PAD_TEST_CLOSE_MS / 1000}초 누르면 닫힙니다.`}
      </p>
    </div>
  );
}
