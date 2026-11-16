/**
 * The desktop app's graphics compatibility mode (설정 → 연출·배경 → 그래픽 호환 모드): another way for
 * Chromium to draw the game, for a PC whose graphics driver trips on the usual one (the whole screen blinks
 * and the gear is gone for a moment, in the same places of a song). The mode is the window's, not the
 * page's: Chromium is started with it, before any page is read, so the desktop app keeps it
 * (desktop/graphicsMode.js) and a change takes a restart. A browser has no such thing.
 */

export const GRAPHICS_MODES = ['default', 'no-dcomp', 'gl', 'd3d11on12'] as const;
export type GraphicsMode = (typeof GRAPHICS_MODES)[number];

export interface GraphicsModeInfo {
  /** The mode kept: the next start's. */
  mode: GraphicsMode;
  /** The mode this run was started in. */
  running: GraphicsMode;
  /** The modes the app has, in its order. */
  modes: GraphicsMode[];
  /** A mode the app gave up by itself (it did not come up on this PC), until another is picked. */
  reverted: { from: GraphicsMode; why: string } | null;
}

/** The desktop window's calls for it (desktop/preload.js). */
export interface GraphicsShell {
  graphicsMode(): Promise<unknown>;
  setGraphicsMode(mode: GraphicsMode): Promise<unknown>;
  restart(): Promise<unknown>;
}

/** The desktop app's window where it has the modes (null in a browser, and in an app older than them). */
export function graphicsShell(): GraphicsShell | null {
  const shell = (window as unknown as { grgDesktop?: Partial<GraphicsShell> }).grgDesktop;
  return shell && typeof shell.graphicsMode === 'function' && typeof shell.setGraphicsMode === 'function' && typeof shell.restart === 'function' ? (shell as GraphicsShell) : null;
}

const isMode = (v: unknown): v is GraphicsMode => typeof v === 'string' && (GRAPHICS_MODES as readonly string[]).includes(v);

/** What the window answers, or null when it is not that (an app of another version: the row is left out). */
export function parseGraphicsModeInfo(raw: unknown): GraphicsModeInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isMode(r.mode) || !isMode(r.running) || !Array.isArray(r.modes)) return null;
  // the modes this page knows by name, in the app's order; default is always one of them
  const modes = r.modes.filter(isMode);
  if (!modes.includes('default')) return null;
  const v = typeof r.reverted === 'object' && r.reverted !== null ? (r.reverted as Record<string, unknown>) : null;
  const reverted = v && isMode(v.from) && v.from !== 'default' && typeof v.why === 'string' ? { from: v.from, why: v.why } : null;
  return { mode: r.mode, running: r.running, modes, reverted };
}

export const GRAPHICS_MODE_NAMES: Record<GraphicsMode, string> = {
  default: '기본',
  'no-dcomp': 'DirectComposition 끄기',
  gl: 'OpenGL',
  d3d11on12: 'Direct3D 11on12',
};

const ABOUT: Record<GraphicsMode, string> = {
  default: '기본은 Direct3D 11로 그리고 DirectComposition으로 화면에 올립니다.',
  'no-dcomp': 'DirectComposition 끄기는 Direct3D 11로 그리되, 화면에 올릴 때 DirectComposition과 오버레이를 쓰지 않습니다.',
  gl: 'OpenGL은 그래픽 카드의 OpenGL 드라이버로 그립니다.',
  d3d11on12: 'Direct3D 11on12는 Direct3D 12 드라이버 위에서 그립니다.',
};

/** Why the app gave a mode up (its own words, desktop/main.js and graphicsMode.js), for the player. */
function revertedReason(why: string): string {
  if (/no WebGL/.test(why)) return '게임이 그래픽을 받지 못했습니다';
  if (/software/.test(why)) return '그래픽 카드로 그리지 못했습니다';
  if (/GPU process/.test(why)) return '앱이 뜨는 동안 그래픽 프로세스가 끊겼습니다';
  if (/did not come up/.test(why)) return '앱이 끝까지 뜨지 못했습니다';
  return '이 PC에서 동작하지 않았습니다';
}

/** The row's help: what the modes are for, the one picked, and where things stand (a restart owed, a mode given up). */
export function graphicsModeHelp(info: GraphicsModeInfo): string {
  const parts = [
    '플레이 중 화면 전체가 깜빡이며 기어가 잠깐 사라지는 PC에서, 앱이 화면을 그리는 방식을 바꿔 봅니다. 그런 일이 없으면 기본을 쓰세요.',
    ABOUT[info.mode],
    info.mode === info.running
      ? `지금 '${GRAPHICS_MODE_NAMES[info.running]}' 모드로 실행 중입니다.`
      : `지금은 '${GRAPHICS_MODE_NAMES[info.running]}' 모드로 실행 중이고, 앱을 다시 시작하면 '${GRAPHICS_MODE_NAMES[info.mode]}' 모드로 열립니다.`,
  ];
  if (info.reverted) parts.push(`'${GRAPHICS_MODE_NAMES[info.reverted.from]}' 모드는 ${revertedReason(info.reverted.why)}: 앱이 기본으로 되돌렸습니다.`);
  parts.push('이 PC에서 동작하지 않는 모드는 앱이 스스로 기본으로 되돌립니다.');
  return parts.join(' ');
}
