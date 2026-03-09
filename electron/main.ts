import { app, nativeImage, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { menubar } from 'menubar'
import { registerDataHandlers } from './data-reader'
import { startThrottleWatcher } from './throttle-watcher'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WINDOW_WIDTH = 420
const WINDOW_HEIGHT = 700

function createTrayIcon(): nativeImage {
  const size = 22
  const buf = Buffer.alloc(size * size * 4, 0)

  const isMac = process.platform === 'darwin'
  const R = isMac ? 0 : 0xe8
  const G = isMac ? 0 : 0x76
  const B = isMac ? 0 : 0x3a

  function px(x: number, y: number, a: number = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = a
  }

  const cx = 11, cy = 11
  // Vertical beam
  for (let dy = -8; dy <= 8; dy++) {
    const dist = Math.abs(dy)
    const half = dist <= 2 ? 1 : 0
    const alpha = dist <= 6 ? 255 : Math.round(255 * (1 - (dist - 6) / 3))
    for (let dx = -half; dx <= half; dx++) {
      px(cx + dx, cy + dy, Math.max(0, alpha))
    }
  }
  // Horizontal beam
  for (let dx = -8; dx <= 8; dx++) {
    const dist = Math.abs(dx)
    const half = dist <= 2 ? 1 : 0
    const alpha = dist <= 6 ? 255 : Math.round(255 * (1 - (dist - 6) / 3))
    for (let dy = -half; dy <= half; dy++) {
      px(cx + dx, cy + dy, Math.max(0, alpha))
    }
  }
  // Diagonal beams
  for (let d = -5; d <= 5; d++) {
    const dist = Math.abs(d)
    const alpha = dist <= 3 ? 255 : Math.round(255 * (1 - (dist - 3) / 3))
    if (alpha > 0) {
      px(cx + d, cy + d, alpha)
      px(cx + d, cy - d, alpha)
    }
  }
  // Center
  px(cx, cy, 255)
  px(cx - 1, cy, 255); px(cx + 1, cy, 255)
  px(cx, cy - 1, 255); px(cx, cy + 1, 255)

  const img = nativeImage.createFromBuffer(buf, { width: size, height: size })
  if (isMac) img.setTemplateImage(true)
  return img
}

// Determine the URL or file to load
const indexUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`

const mb = menubar({
  index: indexUrl,
  icon: createTrayIcon(),
  tooltip: 'TermTracker — Claude Code Usage',
  preloadWindow: true,
  showDockIcon: false,
  browserWindow: {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  },
})

mb.on('ready', () => {
  registerDataHandlers()
  startThrottleWatcher()
  console.log('TermTracker ready — click the menu bar icon')
})

mb.on('after-create-window', () => {
  // Right-click menu
  mb.tray.on('right-click', () => {
    const { Menu } = require('electron')
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show', click: () => mb.showWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
    mb.tray.popUpContextMenu(contextMenu)
  })
})

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})
