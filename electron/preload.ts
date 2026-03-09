import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  homedir: process.env.HOME || process.env.USERPROFILE || '',
  loadStats: () => ipcRenderer.invoke('load-stats'),
  refreshStats: () => ipcRenderer.invoke('refresh-stats'),
  onThrottleDetected: (callback: (event: any) => void) => {
    ipcRenderer.on('throttle-detected', (_e, data) => callback(data))
  },
})
