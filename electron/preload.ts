import { contextBridge, ipcRenderer } from 'electron'
import type { ThrottleEvent } from '../src/lib/ipc'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  loadStats: () => ipcRenderer.invoke('load-stats'),
  refreshStats: () => ipcRenderer.invoke('refresh-stats'),
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('set-auto-start', enabled),
  onThrottleDetected: (callback: (event: ThrottleEvent) => void) => {
    ipcRenderer.on('throttle-detected', (_e, data: ThrottleEvent) => callback(data))
  },
})
