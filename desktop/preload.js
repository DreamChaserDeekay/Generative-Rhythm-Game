// The game page's way to its desktop window (the page is isolated: only these calls cross over):
// full screen, which the settings' 화면 모드 sets and F11 changes as well.
const { contextBridge, ipcRenderer } = require('electron');

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
