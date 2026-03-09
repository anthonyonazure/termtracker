/// <reference types="vite/client" />

interface ElectronAPI {
  platform: string
  homedir: string
  loadStats: () => Promise<any>
  refreshStats: () => Promise<any>
}

interface Window {
  electronAPI: ElectronAPI
}
