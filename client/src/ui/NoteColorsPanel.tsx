import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { enabledKeyModes, keyModes, type LaneConfig } from '../engine/config';
import type { KeyModeId } from '../engine/types';
import {
  BUILTIN_PRESETS,
  fromHsv,
  hexString,
  hexValue,
  isUserPreset,
  lanesOf,
  lightColour,
  MAX_USER_PRESETS,
  newPreset,
  parseColour,
  PRESET_NAME_MAX,
  presetById,
  SKIN_COLORS,
  toHsv,
  withLaneColor,
  type Hsv,
} from '../render/noteColors';
import { laneColorsOf, skinOf, type Settings } from '../settings/settings';
import { Choice, NumberOption, OptionRow } from './optionRows';
import { useTwoPress } from './twoPress';

/** A lane's short name on its swatch: S for the scratch, L / R for the side lanes, the keys by number. */
function laneLabel(lanes: LaneConfig[], i: number): string {
  const lane = lanes[i];
  if (lane.kind === 'scratch') return 'S';
  if (lane.kind === 'side') return lane.color === 'sideL' ? 'L' : 'R';
  return String(lanes.slice(0, i + 1).filter((l) => l.kind === 'key').length);
}

function laneName(lanes: LaneConfig[], i: number): string {
  const lane = lanes[i];
  if (lane.kind === 'scratch') return '스크래치';
  if (lane.kind === 'side') return lane.color === 'sideL' ? '왼쪽 사이드' : '오른쪽 사이드';
  return `${laneLabel(lanes, i)}번 레인`;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * The note colours (설정 → 노트 색): a preset for every lane of every key mode, and each lane's
 * colour in the key mode shown, picked by hue, saturation and value (the rows; ←→, a pad's d-pad),
 * on the colour box and the hue bar (a pointer) or as #rrggbb. A colour changed on 기본 or a built-in
 * preset goes to a copy of it, a preset of the player's own (내 색 N), which can be named and deleted.
 * The gear on the right shows every colour as it is picked (`onDraft` while a pointer drags or a
 * colour is typed).
 */
export function NoteColorsPanel({
  settings,
  onSettingsChange,
  onHelp,
  mode,
  onMode,
  onDraft,
}: {
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  onHelp: (help: string) => void;
  /** The key mode whose lanes are shown (the preview shows it too). */
  mode: KeyModeId;
  onMode: (mode: KeyModeId) => void;
  /** Colours of the key mode not kept yet (dragged on the box or the bar, or typed), or null. */
  onDraft: (colours: number[] | null) => void;
}) {
  const own = settings.colorPresets;
  const chosen = presetById(settings.noteColors, own);
  const user = chosen && isUserPreset(chosen.id) ? chosen : null;
  const lanes = keyModes[mode].lanes;
  const colours = laneColorsOf(settings, mode).map(hexString);
  const [lane, setLane] = useState(0);
  const at = Math.min(lane, lanes.length - 1);
  const colour = colours[at];
  const key = `${mode}:${at}`;

  // the hue, saturation and value being set, kept apart from the colour they make (steps never drift,
  // a grey keeps its hue), and a colour dragged on the box or the bar until it is let go
  const [pick, setPick] = useState<{ key: string; colour: string; hsv: Hsv } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const hsv = pick && pick.key === key && (pick.colour === colour || pick.colour === draft) ? pick.hsv : toHsv(colour);
  const shown = draft ?? colour;

  // the HEX field's own text while it is typed in (else it shows the colour), and whether the colour
  // on the gear is the one typed (a press on the box blurs the field: its drag keeps the gear's)
  const [hexEdit, setHexEdit] = useState<string | null>(null);
  const typed = useRef(false);


  // a drag left unfinished (the tab changed under it) leaves no colour on the preview
  useEffect(() => () => onDraft(null), [onDraft]);

  const showDraft = (next: string | null) => {
    setDraft(next);
    onDraft(next === null ? null : colours.map((c, i) => hexValue(i === at ? next : c)));
  };

  /** Keeps a lane's colour: in the preset if it is the player's own, else in a new one copied from what is shown. */
  const keep = (next: string, nextHsv: Hsv = toHsv(next)) => {
    setPick({ key, colour: next, hsv: nextHsv });
    if (next === colour) return;
    let presets = own;
    let target = user;
    if (!target) {
      if (own.length >= MAX_USER_PRESETS) {
        onHelp(`내 프리셋은 ${MAX_USER_PRESETS}개까지입니다. 쓰지 않는 프리셋을 지운 뒤 바꾸세요.`);
        return;
      }
      target = newPreset(own, lanesOf(skinOf(settings), settings.palette, settings.noteColors, own));
      presets = [...own, target];
      onHelp(`'${chosen?.name ?? '기본'}' 색은 그대로 두고, 바꾼 색은 새 프리셋 '${target.name}'에 저장합니다.`);
    }
    const edited = withLaneColor(target, mode, at, next);
    onSettingsChange({ ...settings, noteColors: edited.id, colorPresets: presets.map((p) => (p.id === edited.id ? edited : p)) });
  };
  const keepHsv = (next: Hsv) => keep(fromHsv(next), next);

  // the box (saturation across, value up) and the hue bar, under a pointer: the gear shows the colour
  // while it moves, and it is kept when let go
  const dragging = useRef<'box' | 'hue' | null>(null);
  const dragged = useRef<Hsv | null>(null);
  const dragTo = (e: ReactPointerEvent<HTMLDivElement>, part: 'box' | 'hue') => {
    typed.current = false;
    const box = e.currentTarget.getBoundingClientRect();
    const x = clamp01((e.clientX - box.left) / box.width);
    const y = clamp01((e.clientY - box.top) / box.height);
    const next = part === 'box' ? { ...hsv, s: Math.round(x * 100), v: Math.round((1 - y) * 100) } : { ...hsv, h: Math.min(359, Math.round(x * 360)) };
    const c = fromHsv(next);
    dragged.current = next;
    setPick({ key, colour: c, hsv: next });
    showDraft(c);
  };
  const pointer = (part: 'box' | 'hue') => ({
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = part;
      dragTo(e, part);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (dragging.current === part) dragTo(e, part);
    },
    onPointerUp: () => {
      if (dragging.current !== part) return;
      dragging.current = null;
      const next = dragged.current;
      showDraft(null);
      if (next) keepHsv(next);
    },
    onPointerCancel: () => {
      dragging.current = null;
      showDraft(null);
    },
  });

  /** Keeps the colour typed in, if it is one; the field shows what is kept. */
  const keepHex = (text: string) => {
    const next = parseColour(text);
    if (typed.current) showDraft(null);
    typed.current = false;
    if (next) keep(next);
    return next;
  };

  const addPreset = () => {
    if (own.length >= MAX_USER_PRESETS) {
      onHelp(`내 프리셋은 ${MAX_USER_PRESETS}개까지입니다. 쓰지 않는 프리셋을 지운 뒤 저장하세요.`);
      return;
    }
    const made = newPreset(own, lanesOf(skinOf(settings), settings.palette, settings.noteColors, own));
    onSettingsChange({ ...settings, noteColors: made.id, colorPresets: [...own, made] });
    onHelp(`지금 색을 새 프리셋 '${made.name}'으로 저장했습니다. 아래에서 이름을 바꿀 수 있습니다.`);
  };
  const remove = useTwoPress(() => {
    if (!user) return;
    onSettingsChange({ ...settings, noteColors: SKIN_COLORS, colorPresets: own.filter((p) => p.id !== user.id) });
    onHelp(`'${user.name}'을 지우고 기본 색으로 돌아갔습니다.`);
    // the button goes with the preset: the keys and a pad go on from the preset row
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="opt-color-preset"]')?.focus());
  });

  const [nameText, setNameText] = useState(user?.name ?? '');
  useEffect(() => setNameText(user?.name ?? ''), [user?.id, user?.name]);
  const keepName = () => {
    if (!user) return;
    const name = nameText.trim().slice(0, PRESET_NAME_MAX);
    if (!name || name === user.name) {
      setNameText(user.name);
      return;
    }
    onSettingsChange({ ...settings, colorPresets: own.map((p) => (p.id === user.id ? { ...p, name } : p)) });
  };

  const presetChoices: [string, string][] = [[SKIN_COLORS, '기본'], ...BUILTIN_PRESETS.map((p): [string, string] => [p.id, p.name]), ...own.map((p): [string, string] => [p.id, p.name])];
  const laneHelp = '←→로 레인을 고르면 아래 색상·채도·밝기로 그 레인의 색을 바꿉니다. 마우스로는 색 상자와 색상 막대를 끌거나 HEX에 #rrggbb를 넣습니다.';
  return (
    <>
      <Choice
        onHelp={onHelp}
        label="프리셋"
        testId="opt-color-preset"
        value={settings.noteColors}
        options={presetChoices}
        onChange={(id) => onSettingsChange({ ...settings, noteColors: id })}
        help="레인마다 노트 색을 정한 묶음입니다. 기본은 스킨의 색(색상이 색각 보정이면 그 색)이고, 나머지는 게임에 든 프리셋과 내 프리셋입니다. 기본이나 게임에 든 프리셋의 색을 바꾸면 그 색을 복사한 내 프리셋에 저장합니다."
      />
      <Choice
        onHelp={onHelp}
        label="키 모드"
        testId="opt-color-mode"
        value={mode}
        options={enabledKeyModes.map((m): [KeyModeId, string] => [m, m])}
        onChange={onMode}
        help="어느 키 모드의 레인 색을 볼지 고릅니다. 프리셋은 키 모드마다 레인 색을 따로 가지고, 미리보기도 이 키 모드로 보여 줍니다."
      />
      <div className="opt opt-block" data-testid="color-lanes">
        <span className="opt-name">레인</span>
        <div className="lane-swatches" style={{ ['--lanes' as string]: lanes.length } as CSSProperties}>
          {lanes.map((_, i) => {
            const c = i === at ? shown : colours[i];
            return (
              <button
                key={i}
                type="button"
                className={`lane-swatch${i === at ? ' active' : ''}${lightColour(c) ? ' light' : ''}`}
                // the lane's colour itself: the swatch is what it shows
                style={{ background: c }}
                data-testid={`color-lane-${i}`}
                data-nav-line="color-lanes"
                data-lane={i}
                data-color={c}
                aria-pressed={i === at}
                aria-label={`${laneName(lanes, i)} ${c}`}
                onFocus={() => {
                  setLane(i);
                  onHelp(laneHelp);
                }}
                onClick={() => setLane(i)}
              >
                {laneLabel(lanes, i)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="opt opt-block" data-testid="color-picker">
        <span className="opt-name">색</span>
        <div className="color-picker">
          <div className="color-box" style={{ ['--hue' as string]: hsv.h } as CSSProperties} aria-hidden="true" {...pointer('box')}>
            <span className="color-mark" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }} />
          </div>
          <div className="color-side">
            <div className="hue-bar" aria-hidden="true" {...pointer('hue')}>
              <span className="hue-mark" style={{ left: `${(hsv.h / 360) * 100}%` }} />
            </div>
            <label className="hex-field">
              <span>HEX</span>
              <input
                type="text"
                data-testid="color-hex"
                value={hexEdit ?? shown}
                maxLength={7}
                spellCheck={false}
                aria-label={`${laneName(lanes, at)}의 색 (#rrggbb)`}
                onFocus={() => {
                  setHexEdit(shown);
                  onHelp('#rrggbb(또는 #rgb)로 색을 넣고 Enter를 누르면 그 레인에 들어갑니다. 넣는 동안 미리보기에 먼저 보입니다.');
                }}
                onChange={(e) => {
                  const text = e.target.value;
                  setHexEdit(text);
                  // six digits typed: the gear shows the colour before it is kept
                  const next = parseColour(text);
                  typed.current = true;
                  showDraft(next && text.replace('#', '').length === 6 ? next : null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const kept = keepHex(e.currentTarget.value);
                  if (kept) setHexEdit(kept);
                }}
                onBlur={(e) => {
                  keepHex(e.currentTarget.value);
                  setHexEdit(null);
                }}
              />
            </label>
          </div>
        </div>
      </div>
      <OptionRow
        onHelp={onHelp}
        label="색상"
        testId="opt-color-hue"
        text={`${hsv.h}°`}
        value={String(hsv.h)}
        // round the colour wheel: past 359° is 0°
        onStep={(dir, big) => keepHsv({ ...hsv, h: (hsv.h + dir * (big ? 15 : 1) + 360) % 360 })}
        help="고른 레인 색의 색상(0–359°)입니다. Shift를 누르고 바꾸면 15°씩 움직입니다."
      />
      <NumberOption
        onHelp={onHelp}
        label="채도"
        testId="opt-color-saturation"
        value={hsv.s}
        min={0}
        max={100}
        step={1}
        bigStep={10}
        format={(v) => `${v}%`}
        onChange={(s) => keepHsv({ ...hsv, s })}
        help="0%는 흰색·회색, 100%는 가장 진한 색입니다. Shift를 누르고 바꾸면 10%씩 움직입니다."
      />
      <NumberOption
        onHelp={onHelp}
        label="밝기"
        testId="opt-color-value"
        value={hsv.v}
        min={0}
        max={100}
        step={1}
        bigStep={10}
        format={(v) => `${v}%`}
        onChange={(v) => keepHsv({ ...hsv, v })}
        help="낮을수록 어두운 색입니다. 트랙이 어두워 밝기가 낮은 노트는 잘 보이지 않습니다."
      />
      <div className="opt opt-block" data-testid="color-preset-actions">
        <span className="opt-name">관리</span>
        <div className="color-preset-actions">
          <div className="opt-actions">
            <button
              type="button"
              className="small"
              data-testid="color-preset-new"
              onFocus={() => onHelp(`지금 보이는 색(모든 키 모드)을 새 내 프리셋으로 저장합니다. 내 프리셋은 ${MAX_USER_PRESETS}개까지입니다.`)}
              onClick={addPreset}
            >
              새 프리셋으로 저장
            </button>
            {user && (
              <button
                type="button"
                className="small danger"
                data-testid="color-preset-delete"
                {...remove.buttonProps}
                onFocus={() => onHelp(`'${user.name}'을 지웁니다. 3초 안에 두 번 누르면 지우고 기본 색으로 돌아갑니다.`)}
                onClick={remove.press}
              >
                {remove.armed ? '한 번 더 누르면 삭제' : '삭제'}
              </button>
            )}
          </div>
          {user && (
            <label className="preset-name">
              <span>이름</span>
              <input
                type="text"
                data-testid="color-preset-name"
                value={nameText}
                maxLength={PRESET_NAME_MAX}
                onFocus={() => onHelp(`내 프리셋의 이름입니다 (${PRESET_NAME_MAX}자까지). Enter를 누르거나 다른 곳을 누르면 바뀝니다.`)}
                onChange={(e) => setNameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    keepName();
                  }
                }}
                onBlur={keepName}
              />
            </label>
          )}
        </div>
      </div>
    </>
  );
}
