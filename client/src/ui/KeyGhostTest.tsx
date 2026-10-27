import { useEffect, useRef, useState } from 'react';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { keyLabel } from '../settings/settings';

/**
 * Keyboard rollover check: lights every bound key (second keys too) that is held and remembers the
 * largest chord that registered. Cheap keyboards drop some key combinations (ghosting); this shows which.
 */
export function KeyGhostTest({ mode, bindings, seconds, onClose }: { mode: KeyModeId; bindings: string[]; seconds: (string | null)[]; onClose: () => void }) {
  const held = useRef(new Set<string>());
  const [down, setDown] = useState<Set<string>>(new Set());
  const [best, setBest] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);
  // it opens under its row: in sight, without moving the focus
  useEffect(() => box.current?.scrollIntoView({ block: 'nearest' }), []);

  const keys = [...bindings.map((code, lane) => ({ code, lane })), ...seconds.flatMap((code, lane) => (code ? [{ code, lane }] : []))];
  const all = keys.map((k) => k.code).join(' ');
  useEffect(() => {
    const bound = new Set(all.split(' '));
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        // closes the test, not the settings screen
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (!bound.has(e.code)) return;
      // the test's keys are not the settings' (Q, E, the arrows)
      e.preventDefault();
      e.stopImmediatePropagation();
      held.current.add(e.code);
      const size = held.current.size;
      setDown(new Set(held.current));
      setBest((b) => Math.max(b, size));
      setSeen((prev) => new Set(prev).add(e.code));
    };
    const onUp = (e: KeyboardEvent) => {
      if (!bound.has(e.code)) return;
      e.preventDefault();
      held.current.delete(e.code);
      setDown(new Set(held.current));
    };
    const onBlur = () => {
      held.current.clear();
      setDown(new Set());
    };
    window.addEventListener('keydown', onDown, { capture: true });
    window.addEventListener('keyup', onUp, { capture: true });
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, { capture: true });
      window.removeEventListener('keyup', onUp, { capture: true });
      window.removeEventListener('blur', onBlur);
    };
  }, [all, onClose]);

  const lanes = keyModes[mode].lanes;
  return (
    <div className="ghost-test" ref={box} data-testid="ghost-test">
      <div className="keys">
        {keys.map(({ code, lane }) => (
          <div key={code} className={`key-cap lane-${lanes[lane].color} ${down.has(code) ? 'active' : ''} ${seen.has(code) ? 'seen' : ''}`}>
            {keyLabel(code)}
          </div>
        ))}
      </div>
      <p className="hint" data-testid="ghost-result">
        {mode} 키를 한꺼번에 눌러 보세요. 동시에 인식된 최대 개수: <strong>{best}</strong> / {keys.length}
        {best > 0 && best < keys.length && ' — 모두 눌렀는데 일부가 켜지지 않으면 키보드의 동시 입력 한계입니다. 다른 키 배치를 써 보세요.'}
        {best === keys.length && ' — 모든 키가 동시에 인식됩니다.'}
      </p>
      <button className="small" onClick={onClose}>닫기 <kbd>Esc</kbd></button>
    </div>
  );
}
