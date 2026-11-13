// The game page's way to its desktop window (the page is isolated: only these calls cross over):
// full screen, which the settings' 화면 모드 sets and F11 changes as well. The window is also told,
// for its log (graphics.log, see main.js), when a WebGL canvas of the page loses its context or gets
// it back: the page itself has no part in that.
const { contextBridge, ipcRenderer } = require('electron');

// the events do not bubble, but every event of the document passes the window on its way down
for (const type of ['webglcontextlost', 'webglcontextrestored']) {
  window.addEventListener(
    type,
    (event) => {
      const canvas = event.target;
      // which canvas (the play's is play-canvas) and how far its play was (data-stage: intro, play, end, …)
      ipcRenderer.send('grg:graphics', { type, canvas: String(canvas?.className ?? ''), stage: String(canvas?.dataset?.stage ?? '') });
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
});
