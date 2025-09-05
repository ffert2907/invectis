const { contextBridge, ipcRenderer } = require('electron');

// Securely expose a custom API to the renderer process (the React app)
contextBridge.exposeInMainWorld('electronAPI', {
  // This function allows the renderer to set up a listener for events
  // pushed from the main process.
  onBackendEvent: (callback) => {
    const listener = (_event, eventName, data) => callback(eventName, data);
    ipcRenderer.on('backend-event', listener);

    // Return a cleanup function
    return () => {
      ipcRenderer.removeListener('backend-event', listener);
    };
  },
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFileContent: (filePath) => ipcRenderer.invoke('read-file-content', filePath)
});
