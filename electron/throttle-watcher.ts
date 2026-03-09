/**
 * Throttle detection — watches JSONL files for service_tier changes
 * and fires system notifications when throttling is detected.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { Notification, BrowserWindow } from 'electron'

interface ThrottleEvent {
  timestamp: string
  model: string
  serviceTier: string
  project: string
}

const WATCH_INTERVAL_MS = 15_000 // Check every 15 seconds
const COOLDOWN_MS = 5 * 60 * 1000 // Don't re-notify for 5 minutes
const MAX_READ_BYTES = 1024 * 1024 // Cap at 1MB per read to prevent OOM

let watchTimer: ReturnType<typeof setInterval> | null = null
let lastNotifiedAt = 0
let filePositions: Map<string, number> = new Map()

function getProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

function findActiveJSONLFiles(): string[] {
  const projectsDir = getProjectsDir()
  if (!fs.existsSync(projectsDir)) return []

  const files: Array<{ path: string; mtime: number }> = []

  try {
    const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
    for (const pf of projectFolders) {
      if (!pf.isDirectory()) continue
      const pfPath = path.join(projectsDir, pf.name)
      try {
        const entries = fs.readdirSync(pfPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.jsonl') && !entry.name.startsWith('.')) {
            const filePath = path.join(pfPath, entry.name)
            try {
              const stat = fs.statSync(filePath)
              // Only watch files modified in the last hour
              if (Date.now() - stat.mtimeMs < 3600000) {
                files.push({ path: filePath, mtime: stat.mtimeMs })
              }
            } catch {}
          }
        }
      } catch {}
    }
  } catch {}

  // Return most recently modified files first
  return files.sort((a, b) => b.mtime - a.mtime).map((f) => f.path)
}

function checkFileForThrottle(filePath: string): ThrottleEvent | null {
  try {
    const stat = fs.statSync(filePath)
    const prevPos = filePositions.get(filePath) || 0

    if (stat.size <= prevPos) return null

    // Read only the new portion of the file, capped to prevent OOM
    const fd = fs.openSync(filePath, 'r')
    const newSize = Math.min(stat.size - prevPos, MAX_READ_BYTES)
    const buffer = Buffer.alloc(newSize)
    fs.readSync(fd, buffer, 0, newSize, prevPos)
    fs.closeSync(fd)

    // Advance position by what we actually read (may be less than full delta if capped)
    filePositions.set(filePath, prevPos + newSize)

    const newContent = buffer.toString('utf-8')
    const lines = newContent.split('\n')

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        if (obj.type === 'assistant' && obj.message) {
          const serviceTier = obj.message.service_tier || obj.service_tier
          if (serviceTier && serviceTier !== 'standard') {
            // Extract project name from parent folder
            const parts = filePath.replace(/\\/g, '/').split('/')
            const projectFolder = parts[parts.length - 2] || 'unknown'

            return {
              timestamp: obj.timestamp || new Date().toISOString(),
              model: obj.message.model || 'unknown',
              serviceTier,
              project: projectFolder,
            }
          }
        }
      } catch {}
    }
  } catch {}

  return null
}

function sendThrottleNotification(event: ThrottleEvent) {
  const now = Date.now()
  if (now - lastNotifiedAt < COOLDOWN_MS) return

  lastNotifiedAt = now

  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'TermTracker — Throttled',
      body: `Claude Code is being throttled (tier: ${event.serviceTier}). Model: ${event.model}`,
      silent: false,
    })
    notification.show()
  }
}

function forwardToRenderer(event: ThrottleEvent) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('throttle-detected', event)
  }
}

function pollForThrottle() {
  const activeFiles = findActiveJSONLFiles()

  for (const filePath of activeFiles) {
    // Initialize position for newly discovered files (start at current end so we only check new data)
    if (!filePositions.has(filePath)) {
      try {
        const stat = fs.statSync(filePath)
        filePositions.set(filePath, stat.size)
      } catch {}
      continue
    }

    const event = checkFileForThrottle(filePath)
    if (event) {
      sendThrottleNotification(event)
      forwardToRenderer(event)
    }
  }
}

export function startThrottleWatcher() {
  if (watchTimer) return

  // Initial scan to set file positions
  const activeFiles = findActiveJSONLFiles()
  for (const filePath of activeFiles) {
    try {
      const stat = fs.statSync(filePath)
      filePositions.set(filePath, stat.size)
    } catch {}
  }

  watchTimer = setInterval(pollForThrottle, WATCH_INTERVAL_MS)
  console.log(`Throttle watcher started — monitoring ${activeFiles.length} active JSONL files`)
}

export function stopThrottleWatcher() {
  if (watchTimer) {
    clearInterval(watchTimer)
    watchTimer = null
  }
}
