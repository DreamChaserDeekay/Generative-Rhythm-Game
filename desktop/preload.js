// The game page's way to its desktop window (the page is isolated: only these calls cross over):
// full screen, which the settings' 화면 모드 sets and F11 changes as well, and the graphics
// compatibility mode (the settings' 그래픽 호환 모드: kept by the window, the next start's). The
// window is also told, for its log (graphics.log, see main.js), when a WebGL canvas of the page loses
// its context or gets it back, when a play's frames stood still for a while or the page threw an error
// (the page tells: tellGraphics), and that a play's frames go on (pulse).
const { contextBridge, ipcRenderer } = require('electron');

// the events do not bubble, but every event of the document passes the window on its way down.
// After a loss the play's track does not wait for its canvas to be given a context back: it goes on on a
// canvas of its own as soon as one can be had (client/src/render/TrackRenderer.ts, recover), marks the
// canvas it left (data-retired: what the browser does with that one later is no loss of the game's) and
// says when the track is drawn again (grg-track-recovered: written down as the graphics coming back).
for (const [type, told] of [
  ['webglcontextlost', 'webglcontextlost'],
  ['webglcontextrestored', 'webglcontextrestored'],
  ['grg-track-recovered', 'webglcontextrestored'],
]) {
  window.addEventListener(
    type,
    (event) => {
      const canvas = event.target;
      if (canvas?.dataset?.retired) return;
      // a moment later: the page's own listener, which runs after this one, has by then put on the canvas
      // what it did in the seconds before the loss (render/trail.ts: data-trail-frames, data-trail-events)
      setTimeout(() => {
        // which canvas (the play's is play-canvas), what the page keeps on it for this log (its data-
        // attributes: the stage of the play, the song's time, the skin, what the renderer holds) and
        // the kind of video behind the play, should there be one (ui/PlayBackground's elements)
        const bga = document.querySelector('.bg-youtube') ? 'youtube' : document.querySelector('.bg-video') ? 'file' : 'none';
        // and what the play's HUD shows of the song: its title, its tier and key mode, how far into it the play is
        const shown = (selector) => document.querySelector(selector)?.textContent?.trim() ?? '';
        const about = { ...canvas?.dataset, bga, song: shown('.hud-title'), tier: shown('.hud-diff'), mode: shown('.hud-keymode'), at: shown('.hud-elapsed') };
        if (type !== told) about.how = 'canvas';
        ipcRenderer.send('grg:graphics', { type: told, canvas: String(canvas?.className ?? ''), about });
      }, 0);
    },
    true,
  );
}

contextBridge.exposeInMainWorld('grgDesktop', {
  /** Into or out of full screen; resolves with what was asked. */
  setFullScreen: (on) => ipcRenderer.invoke('grg:set-full-screen', on === true),
  isFullScreen: () => ipcRenderer.invoke('grg:is-full-screen'),
  /** Calls `listener` whenever the window goes into or out of full screen (F11 too); returns the way to stop. */
  onFullScreen: (listener) => {
    const handler = (_event, on) => listener(on === true);
    ipcRenderer.on('grg:full-screen', handler);
    return () => ipcRenderer.removeListener('grg:full-screen', handler);
  },
  /** The graphics compatibility mode: { mode (kept: the next start's), running, modes, reverted: { from, why } | null }. */
  graphicsMode: () => ipcRenderer.invoke('grg:graphics-mode'),
  /** Keeps `mode` for the next start; resolves with the same as graphicsMode. */
  setGraphicsMode: (mode) => ipcRenderer.invoke('grg:set-graphics-mode', String(mode)),
  /** Opens the asset packs' folder (the data folder's skins/) in the file manager; resolves with whether it opened. */
  openSkinsFolder: () => ipcRenderer.invoke('grg:open-skins-folder'),
  /** Closes the app and opens it again. */
  restart: () => ipcRenderer.invoke('grg:restart'),
  /**
   * A line for the app's log from the page (client/src/render/frameWatch.ts): { type: 'page-stall' | 'page-error' | 'page-play',
   * canvas, about: { … } }. The window writes down what it knows of (graphicsLog.js's pageRecord), so many a minute.
   */
  tellGraphics: (record) => ipcRenderer.send('grg:graphics', record),
  /** A play's frames go on: { state: 'running' | 'paused' | 'ending' | 'done' | 'off', songMs }, every half second. */
  pulse: (record) => ipcRenderer.send('grg:pulse', record),
});
