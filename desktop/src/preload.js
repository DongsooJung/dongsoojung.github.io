const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stargateDesktop', {
  retry() {
    ipcRenderer.send('stargate-retry');
  },
});
