import { afterEach, describe, expect, it, vi } from 'vitest';
import { GRAPHICS_MODE_NAMES, GRAPHICS_MODES, graphicsModeHelp, graphicsShell, parseGraphicsModeInfo, type GraphicsModeInfo } from './graphicsMode';

const ALL = [...GRAPHICS_MODES];

describe('the desktop app’s graphics compatibility mode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is the desktop window’s to keep: a browser, or an app older than the modes, has none', () => {
    vi.stubGlobal('window', {});
    expect(graphicsShell()).toBeNull();
    // an app with the full screen calls only
    vi.stubGlobal('window', { grgDesktop: { setFullScreen: () => Promise.resolve(true) } });
    expect(graphicsShell()).toBeNull();
    const shell = { graphicsMode: () => Promise.resolve(null), setGraphicsMode: () => Promise.resolve(null), restart: () => Promise.resolve(true) };
    vi.stubGlobal('window', { grgDesktop: shell });
    expect(graphicsShell()).toBe(shell);
  });

  it('reads the window’s answer: the mode kept, the one running, the modes it knows by name, one given up', () => {
    expect(parseGraphicsModeInfo({ mode: 'gl', running: 'default', modes: ALL, reverted: null })).toEqual({ mode: 'gl', running: 'default', modes: ALL, reverted: null });
    // a mode of a newer app this page has no name for is left out of the choices
    expect(parseGraphicsModeInfo({ mode: 'default', running: 'default', modes: ['default', 'vulkan', 'gl'], reverted: null })?.modes).toEqual(['default', 'gl']);
    expect(parseGraphicsModeInfo({ mode: 'default', running: 'default', modes: ALL, reverted: { from: 'gl', why: 'the game gets no WebGL under it' } })?.reverted).toEqual({ from: 'gl', why: 'the game gets no WebGL under it' });
    // nonsense in the part given up: none given up
    for (const reverted of [{ from: 'default', why: 'x' }, { from: 'gl' }, { from: 'vulkan', why: 'x' }, 'gl', 7]) {
      expect(parseGraphicsModeInfo({ mode: 'default', running: 'default', modes: ALL, reverted })?.reverted).toBeNull();
    }
    // not an answer at all: no row
    for (const raw of [null, undefined, 'default', {}, { mode: 'gl' }, { mode: 'gl', running: 'vulkan', modes: ALL }, { mode: 'gl', running: 'gl', modes: 'all' }, { mode: 'gl', running: 'gl', modes: ['gl'] }]) {
      expect(parseGraphicsModeInfo(raw)).toBeNull();
    }
  });

  it('names every mode, and its help says what it is for, what is picked and what a restart would do', () => {
    for (const id of GRAPHICS_MODES) expect(GRAPHICS_MODE_NAMES[id]).toBeTruthy();
    const at = (info: Partial<GraphicsModeInfo>) => graphicsModeHelp({ mode: 'default', running: 'default', modes: ALL, reverted: null, ...info });
    expect(at({})).toContain("지금 '기본' 모드로 실행 중입니다.");
    expect(at({})).toContain('그런 일이 없으면 기본을 쓰세요');
    // the help follows the mode picked
    expect(at({ mode: 'gl' })).toContain('OpenGL은 그래픽 카드의 OpenGL 드라이버로 그립니다.');
    expect(at({ mode: 'gl' })).toContain("지금은 '기본' 모드로 실행 중이고, 앱을 다시 시작하면 'OpenGL' 모드로 열립니다.");
    expect(at({ mode: 'no-dcomp', running: 'no-dcomp' })).toContain("지금 'DirectComposition 끄기' 모드로 실행 중입니다.");
    // a mode the app gave up, with the reason in the player's words
    expect(at({ reverted: { from: 'gl', why: 'the game gets no WebGL under it' } })).toContain("'OpenGL' 모드는 게임이 그래픽을 받지 못했습니다: 앱이 기본으로 되돌렸습니다.");
    expect(at({ reverted: { from: 'd3d11on12', why: 'the game is drawn in software under it' } })).toContain("'Direct3D 11on12' 모드는 그래픽 카드로 그리지 못했습니다");
    expect(at({ reverted: { from: 'gl', why: '2 starts did not come up' } })).toContain('앱이 끝까지 뜨지 못했습니다');
    expect(at({ reverted: { from: 'gl', why: 'the GPU process went 2 times before the mode had come up' } })).toContain('그래픽 프로세스가 끊겼습니다');
    expect(at({ reverted: { from: 'gl', why: 'something new' } })).toContain('이 PC에서 동작하지 않았습니다');
  });
});
