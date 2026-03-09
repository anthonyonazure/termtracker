import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  loadStats: () => ipcRenderer.invoke('load-stats'),
  refreshStats: () => ipcRenderer.invoke('refresh-stats'),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('set-auto-start', enabled),
  onThrottleDetected: (callback: (event: any) => void) => {
    ipcRenderer.on('throttle-detected', (_e, data) => callback(data))
  },
})
