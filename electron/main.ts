import { app, ipcMain, nativeImage, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { menubar } from 'menubar'
import { registerDataHandlers, computeStats } from './data-reader'
import { startThrottleWatcher } from './throttle-watcher'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WINDOW_WIDTH = 420
const WINDOW_HEIGHT = 700

// Output token limit for Max 5x plan (configurable via settings in renderer)
const OUTPUT_LIMIT = 45_000_000

// --- Tray icon renderer (matches claude-usage-bar style) ---
// Layout: ["5h"/"7d" labels] [gap] [progress bars]
// Two rows, 5px bar height, 3px gap between rows, 18px total height

const ICON_W = 42
const ICON_H = 18
const LABEL_W = 14
const LABEL_GAP = 2
const BAR_W = 24
const BAR_H = 5
const ROW_GAP = 3

// 3x5 bitmap font for needed characters
const FONT: Record<string, number[][]> = {
  '5': [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  '7': [[1,1,1],[0,0,1],[0,1,0],[0,1,0],[0,1,0]],
  'h': [[1,0,0],[1,0,0],[1,1,1],[1,0,1],[1,0,1]],
  'd': [[0,0,1],[0,0,1],[1,1,1],[1,0,1],[1,1,1]],
}

function createMenuBarIcon(pct5h: number, pctCycle: number): nativeImage {
  const isMac = process.platform === 'darwin'
  const scale = isMac ? 2 : 1
  const w = ICON_W * scale
  const h = ICON_H * scale
  const buf = Buffer.alloc(w * h * 4, 0)

  const R = isMac ? 0 : 0xe8
  const G = isMac ? 0 : 0x76
  const B = isMac ? 0 : 0x3a

  function setPixel(px: number, py: number, a: number) {
    if (px < 0 || px >= w || py < 0 || py >= h) return
    const i = (py * w + px) * 4
    buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = a
  }

  function dot(lx: number, ly: number, a: number = 255) {
    const sx = Math.round(lx * scale)
    const sy = Math.round(ly * scale)
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        setPixel(sx + dx, sy + dy, a)
      }
    }
  }

  function fillRect(x: number, y: number, rw: number, rh: number, a: number = 255) {
    for (let ly = y; ly < y + rh; ly++) {
      for (let lx = x; lx < x + rw; lx++) {
        dot(lx, ly, a)
      }
    }
  }

  // Rounded rect (1px corner radius)
  function roundRect(x: number, y: number, rw: number, rh: number, a: number = 255) {
    fillRect(x + 1, y, rw - 2, rh, a)
    fillRect(x, y + 1, 1, rh - 2, a)
    fillRect(x + rw - 1, y + 1, 1, rh - 2, a)
  }

  const barX = LABEL_W + LABEL_GAP
  const topY = Math.round((ICON_H - BAR_H * 2 - ROW_GAP) / 2)
  const bottomY = topY + BAR_H + ROW_GAP

  // Draw text label using bitmap font
  function drawLabel(text: string, lx: number, ly: number) {
    let cursorX = lx
    for (const ch of text) {
      const glyph = FONT[ch]
      if (!glyph) { cursorX += 4; continue }
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col]) dot(cursorX + col, ly + row, 255)
        }
      }
      cursorX += glyph[0].length + 1
    }
  }

  // Right-align labels: "5h" and "7d" are each 7px wide (3+1+3)
  const labelStartX = LABEL_W - 7
  drawLabel('5h', labelStartX, topY)
  drawLabel('7d', labelStartX, bottomY)

  // Draw progress bars
  function drawBar(bx: number, by: number, pct: number) {
    roundRect(bx, by, BAR_W, BAR_H, 60) // dim track
    const clamped = Math.max(0, Math.min(1, pct / 100))
    if (clamped > 0) {
      const fillW = Math.max(2, Math.round(BAR_W * clamped))
      roundRect(bx, by, fillW, BAR_H, 255) // bright fill
    }
  }

  drawBar(barX, topY, pct5h)
  drawBar(barX, bottomY, pctCycle)

  const img = nativeImage.createFromBuffer(buf, { width: w, height: h, scaleFactor: scale })
  if (isMac) img.setTemplateImage(true)
  return img
}

// Get this billing cycle's output tokens
function getCycleOutputTokens(billingDay: number = 1): number {
  const stats = computeStats()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  let cycleStart: Date
  if (now.getDate() >= billingDay) {
    cycleStart = new Date(year, month, billingDay)
  } else {
    cycleStart = new Date(year, month - 1, billingDay)
  }
  const cycleStartStr = cycleStart.toISOString().slice(0, 10)

  let total = 0
  for (const day of stats.dailyStats) {
    if (day.date >= cycleStartStr) {
      total += day.tokens.outputTokens
    }
  }
  return total
}

// Get last 5 hours of output tokens as % of a daily pace limit
function get5hOutputPercent(): number {
  const stats = computeStats()
  const now = new Date()
  const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  const todayStr = now.toISOString().slice(0, 10)
  const todayStats = stats.dailyStats.find(d => d.date === todayStr)
  if (!todayStats) return 0

  // Approximate: use today's output tokens scaled by 5h/24h
  // (JSONL doesn't have per-hour granularity, so this is a rough estimate)
  const hourFraction = Math.min(1, (now.getHours() + 1) / 24)
  const todayOutput = todayStats.tokens.outputTokens
  const dailyPace = OUTPUT_LIMIT / 30 // ~1.5M per day for Max 5x
  const estimated5h = hourFraction > 0 ? (todayOutput / hourFraction) * (5 / 24) : 0
  return Math.min(100, (estimated5h / dailyPace) * 100 * 5)
}

// Compute billing cycle days remaining
function daysLeftInCycle(billingDay: number = 1): number {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  let resetDate: Date
  if (now.getDate() >= billingDay) {
    resetDate = new Date(year, month + 1, billingDay)
  } else {
    resetDate = new Date(year, month, billingDay)
  }
  return Math.max(1, Math.ceil((resetDate.getTime() - now.getTime()) / 86_400_000))
}

// Format token count compactly
function shortTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

// Suppress GPU cache errors on Windows
app.commandLine.appendSwitch('disable-gpu-cache')

// Determine the URL or file to load
const indexUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`

const mb = menubar({
  index: indexUrl,
  icon: createMenuBarIcon(0, 0),
  tooltip: 'TermTracker — Claude Code Usage',
  preloadWindow: true,
  showDockIcon: false,
  windowPosition: process.platform === 'darwin' ? 'trayCenter' : 'trayBottomCenter',
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

// Update the tray icon based on current usage
function updateTray() {
  try {
    const cycleOutput = getCycleOutputTokens()
    const cyclePct = (cycleOutput / OUTPUT_LIMIT) * 100
    const pct5h = get5hOutputPercent()
    const daysLeft = daysLeftInCycle()

    // Update icon with both bars
    mb.tray.setImage(createMenuBarIcon(pct5h, cyclePct))

    // No text title needed — the bars in the icon tell the story
    mb.tray.setTitle('')

    // Tooltip for hover detail
    mb.tray.setToolTip(`TermTracker — ${shortTokens(cycleOutput)} / ${shortTokens(OUTPUT_LIMIT)} output (${Math.round(cyclePct)}%) — ${daysLeft}d left`)
  } catch {
    // Silent fail — tray updates are non-critical
  }
}

mb.on('ready', () => {
  registerDataHandlers()
  startThrottleWatcher()

  // Enable auto-start on login (works on both macOS and Windows)
  app.setLoginItemSettings({ openAtLogin: true })

  // IPC handlers for auto-start toggle
  ipcMain.handle('get-auto-start', () => {
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle('set-auto-start', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return enabled
  })

  // Set initial tray state
  updateTray()

  // Refresh every 60 seconds
  setInterval(updateTray, 60_000)

  console.log('TermTracker ready — click the menu bar icon')
})

mb.on('after-create-window', () => {
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
