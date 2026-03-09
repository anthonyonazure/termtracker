import { app, ipcMain, nativeImage, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { menubar } from 'menubar'
import { registerDataHandlers, computeStats } from './data-reader'
import { startThrottleWatcher } from './throttle-watcher'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WINDOW_WIDTH = 420
const WINDOW_HEIGHT = 700
const OUTPUT_LIMIT = 45_000_000
const isMac = process.platform === 'darwin'

// ─── macOS menu bar icon: "5h [bar] / 7d [bar]" wide image ───
// Windows tray: simple 16x16 gauge icon (wide images don't work in the notification area)

// 3x5 bitmap font
const FONT: Record<string, number[][]> = {
  '5': [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
  '7': [[1,1,1],[0,0,1],[0,1,0],[0,1,0],[0,1,0]],
  'h': [[1,0,0],[1,0,0],[1,1,1],[1,0,1],[1,0,1]],
  'd': [[0,0,1],[0,0,1],[1,1,1],[1,0,1],[1,1,1]],
}

function createMacIcon(pct5h: number, pctCycle: number): nativeImage {
  const scale = 2 // @2x retina
  const LW = 42, LH = 18
  const w = LW * scale, h = LH * scale
  const buf = Buffer.alloc(w * h * 4, 0)

  function dot(lx: number, ly: number, a: number) {
    const sx = Math.round(lx * scale), sy = Math.round(ly * scale)
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const fx = sx + dx, fy = sy + dy
      if (fx >= 0 && fx < w && fy >= 0 && fy < h) {
        const i = (fy * w + fx) * 4
        buf[i] = 0; buf[i+1] = 0; buf[i+2] = 0; buf[i+3] = a
      }
    }
  }

  function fillRect(x: number, y: number, rw: number, rh: number, a: number) {
    for (let ly = y; ly < y + rh; ly++) for (let lx = x; lx < x + rw; lx++) dot(lx, ly, a)
  }
  function roundRect(x: number, y: number, rw: number, rh: number, a: number) {
    fillRect(x + 1, y, rw - 2, rh, a)
    fillRect(x, y + 1, 1, rh - 2, a)
    fillRect(x + rw - 1, y + 1, 1, rh - 2, a)
  }

  const barX = 16, barW = 24, barH = 5, topY = 3, bottomY = 11

  // Labels
  function drawLabel(text: string, lx: number, ly: number) {
    let cx = lx
    for (const ch of text) {
      const g = FONT[ch]; if (!g) { cx += 4; continue }
      for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) {
        if (g[r][c]) dot(cx + c, ly + r, 255)
      }
      cx += g[0].length + 1
    }
  }
  drawLabel('5h', 7, topY)
  drawLabel('7d', 7, bottomY)

  // Bars
  function drawBar(bx: number, by: number, pct: number) {
    roundRect(bx, by, barW, barH, 65)
    const clamped = Math.max(0, Math.min(1, pct / 100))
    if (clamped > 0) roundRect(bx, by, Math.max(3, Math.round(barW * clamped)), barH, 255)
  }
  drawBar(barX, topY, pct5h)
  drawBar(barX, bottomY, pctCycle)

  const img = nativeImage.createFromBuffer(buf, { width: w, height: h, scaleFactor: scale })
  img.setTemplateImage(true)
  return img
}

function createWinIcon(pctCycle: number): nativeImage {
  // 16x16 circular gauge icon for Windows notification area
  const size = 16
  const buf = Buffer.alloc(size * size * 4, 0)
  const R = 0xe8, G = 0x76, B = 0x3a // brand orange

  function px(x: number, y: number, a: number) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = R; buf[i+1] = G; buf[i+2] = B; buf[i+3] = a
  }

  const cx = 7.5, cy = 7.5, outerR = 7, innerR = 5

  // Draw ring
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    if (dist <= outerR && dist >= innerR) px(x, y, 60) // dim ring
  }

  // Fill arc based on usage (clockwise from top)
  const pct = Math.max(0, Math.min(1, pctCycle / 100))
  const endAngle = -Math.PI / 2 + pct * Math.PI * 2

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    if (dist <= outerR && dist >= innerR) {
      let angle = Math.atan2(y - cy, x - cx)
      // Normalize: start from top (-PI/2), go clockwise
      if (angle < -Math.PI / 2) angle += Math.PI * 2
      const startAngle = -Math.PI / 2
      const normAngle = angle < startAngle ? angle + Math.PI * 2 : angle
      const normEnd = endAngle < startAngle ? endAngle + Math.PI * 2 : endAngle
      if (normAngle <= normEnd) px(x, y, 255) // bright fill
    }
  }

  // Center dot
  for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) {
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    if (dist <= 1.5) px(x, y, 255)
  }

  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function createIcon(pct5h: number, pctCycle: number): nativeImage {
  return isMac ? createMacIcon(pct5h, pctCycle) : createWinIcon(pctCycle)
}

// ─── Stats helpers ───

function getCycleOutputTokens(billingDay: number = 1): number {
  const stats = computeStats()
  const now = new Date()
  let cycleStart: Date
  if (now.getDate() >= billingDay) {
    cycleStart = new Date(now.getFullYear(), now.getMonth(), billingDay)
  } else {
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, billingDay)
  }
  const cycleStartStr = cycleStart.toISOString().slice(0, 10)
  let total = 0
  for (const day of stats.dailyStats) {
    if (day.date >= cycleStartStr) total += day.tokens.outputTokens
  }
  return total
}

function get5hOutputPercent(): number {
  const stats = computeStats()
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayStats = stats.dailyStats.find(d => d.date === todayStr)
  if (!todayStats) return 0
  const hour = new Date().getHours() + 1
  const hourFraction = Math.min(1, hour / 24)
  const dailyPace = OUTPUT_LIMIT / 30
  const estimated5h = hourFraction > 0 ? (todayStats.tokens.outputTokens / hourFraction) * (5 / 24) : 0
  return Math.min(100, (estimated5h / dailyPace) * 100 * 5)
}

function daysLeftInCycle(billingDay: number = 1): number {
  const now = new Date()
  let resetDate: Date
  if (now.getDate() >= billingDay) {
    resetDate = new Date(now.getFullYear(), now.getMonth() + 1, billingDay)
  } else {
    resetDate = new Date(now.getFullYear(), now.getMonth(), billingDay)
  }
  return Math.max(1, Math.ceil((resetDate.getTime() - now.getTime()) / 86_400_000))
}

function shortTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

// ─── App setup ───

app.commandLine.appendSwitch('disable-gpu-cache')

const indexUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`

const mb = menubar({
  index: indexUrl,
  icon: createIcon(0, 0),
  tooltip: 'TermTracker — Claude Code Usage',
  preloadWindow: true,
  showDockIcon: false,
  windowPosition: isMac ? 'trayCenter' : 'trayBottomCenter',
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

// Position window on Windows: bottom-right above taskbar
function positionWindowWin() {
  if (!isMac && mb.window && !mb.window.isDestroyed()) {
    const display = screen.getPrimaryDisplay()
    const workArea = display.workArea
    mb.window.setPosition(
      workArea.x + workArea.width - WINDOW_WIDTH - 12,
      workArea.y + workArea.height - WINDOW_HEIGHT - 12
    )
  }
}

function updateTray() {
  try {
    const cycleOutput = getCycleOutputTokens()
    const cyclePct = (cycleOutput / OUTPUT_LIMIT) * 100
    const pct5h = get5hOutputPercent()
    const daysLeft = daysLeftInCycle()

    mb.tray.setImage(createIcon(pct5h, cyclePct))
    mb.tray.setTitle('')
    mb.tray.setToolTip(`TermTracker — ${shortTokens(cycleOutput)} / ${shortTokens(OUTPUT_LIMIT)} output (${Math.round(cyclePct)}%) — ${daysLeft}d left`)
  } catch {}
}

mb.on('ready', () => {
  registerDataHandlers()
  startThrottleWatcher()

  app.setLoginItemSettings({ openAtLogin: true })

  ipcMain.handle('get-auto-start', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('set-auto-start', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return enabled
  })

  // On Windows, bypass menubar's flaky click handling — directly toggle on click
  if (!isMac) {
    mb.tray.removeAllListeners('click')
    mb.tray.on('click', () => {
      if (!mb.window || mb.window.isDestroyed()) return
      if (mb.window.isVisible()) {
        mb.window.hide()
      } else {
        positionWindowWin()
        mb.window.show()
        mb.window.focus()
      }
    })
    mb.tray.on('right-click', () => {
      const { Menu } = require('electron')
      Menu.buildFromTemplate([
        { label: 'Show', click: () => { positionWindowWin(); mb.showWindow() } },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]).popup()
    })
  }

  setTimeout(updateTray, 500)
  setInterval(updateTray, 60_000)

  console.log('TermTracker ready — click the tray icon')
})

mb.on('after-create-window', () => {
  // macOS right-click menu (Windows handled above)
  if (isMac) {
    mb.tray.on('right-click', () => {
      const { Menu } = require('electron')
      Menu.buildFromTemplate([
        { label: 'Show', click: () => mb.showWindow() },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]).popup()
    })
  }
  // Position on first create for Windows
  positionWindowWin()
})

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})
