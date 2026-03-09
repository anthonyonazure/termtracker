import { app, BrowserWindow, Tray, Menu, nativeImage, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerDataHandlers } from './data-reader'
import { startThrottleWatcher } from './throttle-watcher'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

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

  // Hide when clicking outside
  mainWindow.on('blur', () => {
    mainWindow?.hide()
  })
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
  if (!mainWindow) return
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    const pos = getWindowPosition()
    mainWindow.setPosition(pos.x, pos.y, false)
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTrayIcon(): nativeImage {
  // Create a 16x16 RGBA bitmap programmatically
  const size = 16
  const buffer = Buffer.alloc(size * size * 4) // RGBA

  // Orange color (#e8763a)
  const R = 0xe8, G = 0x76, B = 0x3a, A = 255
  // White
  const WR = 255, WG = 255, WB = 255

  function setPixel(x: number, y: number, r: number, g: number, b: number, a: number = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const idx = (y * size + x) * 4
    buffer[idx] = r
    buffer[idx + 1] = g
    buffer[idx + 2] = b
    buffer[idx + 3] = a
  }

  // Fill background with orange, rounded corners
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Simple rounded rect: skip corners
      const isCorner =
        (x === 0 && y === 0) || (x === 15 && y === 0) ||
        (x === 0 && y === 15) || (x === 15 && y === 15)
      if (!isCorner) {
        setPixel(x, y, R, G, B, A)
      }
    }
  }

  // Draw ">" chevron (white) - left side
  // Row 4-11, forming a right-pointing chevron
  setPixel(4, 4, WR, WG, WB)
  setPixel(5, 5, WR, WG, WB)
  setPixel(6, 6, WR, WG, WB)
  setPixel(7, 7, WR, WG, WB)
  setPixel(7, 8, WR, WG, WB)
  setPixel(6, 9, WR, WG, WB)
  setPixel(5, 10, WR, WG, WB)
  setPixel(4, 11, WR, WG, WB)
  // Thicken the chevron
  setPixel(5, 4, WR, WG, WB)
  setPixel(6, 5, WR, WG, WB)
  setPixel(7, 6, WR, WG, WB)
  setPixel(8, 7, WR, WG, WB)
  setPixel(8, 8, WR, WG, WB)
  setPixel(7, 9, WR, WG, WB)
  setPixel(6, 10, WR, WG, WB)
  setPixel(5, 11, WR, WG, WB)

  // Draw "_" underscore (white) - right side
  for (let x = 9; x <= 13; x++) {
    setPixel(x, 11, WR, WG, WB)
    setPixel(x, 12, WR, WG, WB)
  }

  return nativeImage.createFromBuffer(buffer, {
    width: size,
    height: size,
  })
}

function createTray() {
  const icon = createTrayIcon()

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  tray = new Tray(icon)
  tray.setToolTip('TermTracker — Claude Code Usage')

  // Windows: both click and double-click to be safe
  tray.on('click', () => {
    console.log('tray click')
    toggleWindow()
  })
  tray.on('double-click', () => {
    console.log('tray double-click')
    toggleWindow()
  })

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show', click: () => toggleWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
    tray!.popUpContextMenu(contextMenu)
  })
}

app.whenReady().then(() => {
  // Hide Dock icon on macOS — menu bar only
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }
  registerDataHandlers()
  createWindow()
  createTray()
  startThrottleWatcher()
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
