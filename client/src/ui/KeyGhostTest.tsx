import { useEffect, useRef, useState } from 'react';
import { keyModes } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import { keyLabel } from '../settings/settings';

/**
 * Keyboard rollover check: lights every bound key that is held and remembers the largest chord
 * that registered. Cheap keyboards drop some key combinations (ghosting); this shows which.
 */
export function KeyGhostTest({ mode, bindings, onClose }: { mode: KeyModeId; bindings: string[]; onClose: () => void }) {
  const held = useRef(new Set<string>());
  const [down, setDown] = useState<Set<string>>(new Set());
  const [best, setBest] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => {
    const bound = new Set(bindings);
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!bound.has(e.code)) return;
      e.preventDefault();
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
  }, [bindings, onClose]);

  const lanes = keyModes[mode].lanes;
  return (
    <div className="ghost-test" data-testid="ghost-test">
      <div className="keys">
        {bindings.map((code, i) => (
          <div key={code} className={`key-cap lane-${lanes[i].color} ${down.has(code) ? 'active' : ''} ${seen.has(code) ? 'seen' : ''}`}>
            {keyLabel(code)}
          </div>
        ))}
      </div>
      <p className="hint" data-testid="ghost-result">
        {mode} 키를 한꺼번에 눌러 보세요. 동시에 인식된 최대 개수: <strong>{best}</strong> / {bindings.length}
        {best > 0 && best < bindings.length && ' — 모두 눌렀는데 일부가 켜지지 않으면 키보드의 동시 입력 한계입니다. 다른 키 배치를 써 보세요.'}
        {best === bindings.length && ' — 모든 키가 동시에 인식됩니다.'}
      </p>
      <button className="small" onClick={onClose}>닫기 <kbd>Esc</kbd></button>
    </div>
  );
}
