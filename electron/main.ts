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

// Create a bar-chart style tray icon showing usage level (0-100%)
function createBarIcon(usagePercent: number): nativeImage {
  const size = 22
  const buf = Buffer.alloc(size * size * 4, 0)

  const isMac = process.platform === 'darwin'
  // On Mac, template images are monochrome (use black, OS inverts for dark mode)
  // On Windows, use the brand orange
  const R = isMac ? 0 : 0xe8
  const G = isMac ? 0 : 0x76
  const B = isMac ? 0 : 0x3a

  function px(x: number, y: number, a: number = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = a
  }

  // Draw 4 vertical bars like a bar chart / signal meter
  // Each bar is 3px wide with 2px gap, heights represent usage level
  // Bar heights: 25%, 50%, 75%, 100% of max — filled up to usagePercent
  const barMaxHeights = [5, 9, 13, 17] // pixel heights for each bar
  const barX = [2, 7, 12, 17]          // x start positions
  const barW = 3                         // bar width
  const bottom = 20                      // bottom y position

  const pct = Math.min(1, Math.max(0, usagePercent / 100))

  for (let b = 0; b < 4; b++) {
    const maxH = barMaxHeights[b]
    const threshold = (b + 1) / 4 // this bar lights up when usage >= 25%, 50%, 75%, 100%

    // Filled bar (usage reached this level)
    const filled = pct >= threshold
    // Partial fill: if usage is between this bar's threshold and the previous
    const prevThreshold = b / 4
    const partial = !filled && pct > prevThreshold

    const fillH = filled ? maxH : partial ? Math.round(maxH * ((pct - prevThreshold) / (threshold - prevThreshold))) : 0

    for (let x = barX[b]; x < barX[b] + barW; x++) {
      // Draw outline/empty bar (dim)
      for (let h = 0; h < maxH; h++) {
        const y = bottom - h
        px(x, y, 40) // dim outline
      }
      // Draw filled portion
      for (let h = 0; h < fillH; h++) {
        const y = bottom - h
        px(x, y, 255) // bright fill
      }
    }
  }

  const img = nativeImage.createFromBuffer(buf, { width: size, height: size })
  if (isMac) img.setTemplateImage(true)
  return img
}

// Get this billing cycle's output tokens
function getCycleOutputTokens(billingDay: number = 1): number {
  const stats = computeStats()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  // Determine cycle start date
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

// Determine the URL or file to load
const indexUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`

const mb = menubar({
  index: indexUrl,
  icon: createBarIcon(0),
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

// Update the tray icon bars and title based on current usage
function updateTray() {
  try {
    const cycleOutput = getCycleOutputTokens()
    const pct = (cycleOutput / OUTPUT_LIMIT) * 100
    const daysLeft = daysLeftInCycle()

    // Update icon bars to reflect usage percentage
    mb.tray.setImage(createBarIcon(pct))

    // Show compact text: usage% and days remaining
    // e.g. " 34% 22d"
    const title = ` ${Math.round(pct)}% ${daysLeft}d`
    mb.tray.setTitle(title)

    // Update tooltip with more detail
    mb.tray.setToolTip(`TermTracker — ${shortTokens(cycleOutput)} / ${shortTokens(OUTPUT_LIMIT)} output (${Math.round(pct)}%) — ${daysLeft}d left`)
  } catch {
    // Silent fail — tray updates are non-critical
  }
}

mb.on('ready', () => {
  registerDataHandlers()
  startThrottleWatcher()

  // Enable auto-start on login (works on both macOS and Windows)
  // Users can toggle this off via Settings or system preferences
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
