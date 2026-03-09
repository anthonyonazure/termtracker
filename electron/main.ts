import { app, BrowserWindow, Tray, Menu, nativeImage, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerDataHandlers } from './data-reader'
import { startThrottleWatcher } from './throttle-watcher'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let lastShowTime = 0

const WINDOW_WIDTH = 420
const WINDOW_HEIGHT = 700

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#1a1a1a',
    // 'panel' on macOS creates an NSPanel that floats without app activation
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Dev or production
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Hide when clicking outside (Windows only — on macOS blur races with tray click)
  if (process.platform !== 'darwin') {
    mainWindow.on('blur', () => {
      if (mainWindow && !mainWindow.isDestroyed() && Date.now() - lastShowTime > 500) {
        mainWindow.hide()
      }
    })
  }
}

function getWindowPosition() {
  const trayBounds = tray!.getBounds()
  const windowBounds = mainWindow!.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })

  let x: number
  let y: number

  if (process.platform === 'darwin') {
    x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
    y = Math.round(trayBounds.y + trayBounds.height)
  } else {
    // Windows: position above the taskbar
    x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
    y = Math.round(trayBounds.y - windowBounds.height)

    if (trayBounds.y < display.bounds.height / 2) {
      y = Math.round(trayBounds.y + trayBounds.height)
    }
  }

  x = Math.max(display.bounds.x, Math.min(x, display.bounds.x + display.bounds.width - windowBounds.width))
  y = Math.max(display.bounds.y, Math.min(y, display.bounds.y + display.bounds.height - windowBounds.height))

  return { x, y }
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    lastShowTime = Date.now()
    const pos = getWindowPosition()
    mainWindow.setPosition(pos.x, pos.y, false)
    mainWindow.show()
    mainWindow.focus()
  }
}

/**
 * Claude/Anthropic sparkle icon — 22x22 for macOS retina menu bar.
 * macOS: black on transparent (template image, auto-adapts to dark/light).
 * Windows: orange (#e8763a) on transparent.
 *
 * The sparkle is a 4-pointed star (Anthropic's asterisk/sparkle mark).
 */
function createTrayIcon(): nativeImage {
  const size = 22
  const buf = Buffer.alloc(size * size * 4, 0) // transparent

  const isMac = process.platform === 'darwin'
  // macOS template: black pixels; Windows: orange
  const R = isMac ? 0 : 0xe8
  const G = isMac ? 0 : 0x76
  const B = isMac ? 0 : 0x3a

  function px(x: number, y: number, a: number = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = a
  }

  // Draw a 4-pointed sparkle centered at (11, 11)
  // Vertical beam (thin)
  const cx = 11, cy = 11
  for (let dy = -8; dy <= 8; dy++) {
    const y = cy + dy
    const dist = Math.abs(dy)
    // Width tapers: widest at center (3px), narrows to 1px at tips
    const half = dist <= 2 ? 1 : 0
    const alpha = dist <= 6 ? 255 : Math.round(255 * (1 - (dist - 6) / 3))
    for (let dx = -half; dx <= half; dx++) {
      px(cx + dx, y, Math.max(0, alpha))
    }
  }

  // Horizontal beam (thin)
  for (let dx = -8; dx <= 8; dx++) {
    const x = cx + dx
    const dist = Math.abs(dx)
    const half = dist <= 2 ? 1 : 0
    const alpha = dist <= 6 ? 255 : Math.round(255 * (1 - (dist - 6) / 3))
    for (let dy = -half; dy <= half; dy++) {
      px(x, cy + dy, Math.max(0, alpha))
    }
  }

  // Diagonal beams (shorter, 45°)
  for (let d = -5; d <= 5; d++) {
    const dist = Math.abs(d)
    const alpha = dist <= 3 ? 255 : Math.round(255 * (1 - (dist - 3) / 3))
    if (alpha > 0) {
      px(cx + d, cy + d, alpha)
      px(cx + d, cy - d, alpha)
    }
  }

  // Bright center
  px(cx, cy, 255)
  px(cx - 1, cy, 255); px(cx + 1, cy, 255)
  px(cx, cy - 1, 255); px(cx, cy + 1, 255)

  const img = nativeImage.createFromBuffer(buf, { width: size, height: size })

  if (isMac) {
    img.setTemplateImage(true)
  }

  return img
}

function createTray() {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('TermTracker — Claude Code Usage')

  if (process.platform === 'darwin') {
    // macOS: click events are unreliable with dock hidden.
    // Use a native context menu instead — clicking the menu bar icon
    // always opens this menu reliably.
    const buildMenu = () => Menu.buildFromTemplate([
      {
        label: mainWindow?.isVisible() ? 'Hide' : 'Show TermTracker',
        click: () => toggleWindow(),
      },
      { type: 'separator' },
      { label: 'Refresh', click: () => mainWindow?.webContents.send('refresh') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
    tray.setContextMenu(buildMenu())
    // Rebuild menu on show/hide to update label
    setInterval(() => tray?.setContextMenu(buildMenu()), 1000)
  } else {
    // Windows: click to toggle works fine
    tray.on('click', () => toggleWindow())
    tray.on('double-click', () => toggleWindow())
    tray.on('right-click', () => {
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Show', click: () => toggleWindow() },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ])
      tray!.popUpContextMenu(contextMenu)
    })
  }
}

app.whenReady().then(() => {
  registerDataHandlers()
  createWindow()
  createTray()
  startThrottleWatcher()
  // Hide dock icon on macOS after tray is set up
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }
  console.log('TermTracker ready — click the menu bar icon')
})

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})

app.on('activate', () => {
  if (mainWindow) {
    toggleWindow()
  }
})
