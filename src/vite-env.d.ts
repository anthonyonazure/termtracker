/// <reference types="vite/client" />

import type { ElectronAPI } from './lib/ipc'

declare global {
  interface Window {
    // Absent outside Electron (plain `vite dev` in a browser), hence optional.
    electronAPI?: ElectronAPI
  }
}
