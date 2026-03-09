/**
 * Main-process data reader — reads Claude Code files directly from filesystem
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { ipcMain } from 'electron'

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

interface DailyStats {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
  tokens: TokenUsage
  modelBreakdown: Record<string, TokenUsage>
}

interface SessionData {
  sessionId: string
  project: string
  startTime: string
  endTime: string
  messageCount: number
  toolCallCount: number
  tokens: TokenUsage
  models: string[]
  costUSD: number
}

interface ProjectData {
  project: string
  displayName: string
  sessionCount: number
  messageCount: number
  toolCallCount: number
  tokens: TokenUsage
  costUSD: number
  lastActive: string
}

interface OverallStats {
  totalTokens: TokenUsage
  totalMessages: number
  totalSessions: number
  totalToolCalls: number
  estimatedCostUSD: number
  modelUsage: Record<string, TokenUsage>
  dailyStats: DailyStats[]
  hourlyActivity: Record<number, number>
  firstSessionDate: string
  subscription: string
  sessions: SessionData[]
  projects: ProjectData[]
}

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4-6': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4-5-20251101': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 },
}

function getModelPricing(model: string) {
  if (PRICING[model]) return PRICING[model]
  if (model.includes('opus')) return PRICING['claude-opus-4-6']
  if (model.includes('sonnet')) return PRICING['claude-sonnet-4-6']
  if (model.includes('haiku')) return PRICING['claude-haiku-4-5-20251001']
  return PRICING['claude-sonnet-4-6']
}

function estimateTokenCost(model: string, usage: TokenUsage): number {
  const p = getModelPricing(model)
  return (
    usage.inputTokens * p.input +
    usage.outputTokens * p.output +
    usage.cacheReadTokens * p.cacheRead +
    usage.cacheWriteTokens * p.cacheWrite
  ) / 1_000_000
}

function emptyTokens(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  }
}

function totalTokenCount(t: TokenUsage): number {
  return t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens
}

function getClaudeDir(): string {
  return path.join(os.homedir(), '.claude')
}

// Decode project folder name to readable path
function decodeProjectName(folderName: string): string {
  // c--Users-antho-renew-wellness-tracker → C:\Users\antho\renew-wellness-tracker
  // -Users-anthony-renew-wellness-tracker → /Users/anthony/renew-wellness-tracker
  let decoded = folderName
  // Windows paths: start with drive letter like "c--" or "C--"
  if (/^[a-zA-Z]--/.test(decoded)) {
    const drive = decoded[0].toUpperCase()
    decoded = drive + ':\\' + decoded.slice(3).replace(/-/g, '\\')
  } else if (decoded.startsWith('-')) {
    // Unix paths: start with "-"
    decoded = '/' + decoded.slice(1).replace(/-/g, '/')
  } else {
    decoded = decoded.replace(/-/g, '/')
  }
  return decoded
}

// Get short display name from project path
function getProjectDisplayName(projectPath: string): string {
  const parts = projectPath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || parts[parts.length - 2] || projectPath
}

interface ParsedMessage {
  timestamp: string
  sessionId: string
  model: string
  usage: TokenUsage | null
  type: string
  toolCalls: number
  hour: number
  project: string  // from the JSONL's cwd field
}

function findAllJSONLFiles(claudeDir: string): Array<{ filePath: string; projectFolder: string }> {
  const files: Array<{ filePath: string; projectFolder: string }> = []
  const projectsDir = path.join(claudeDir, 'projects')

  if (!fs.existsSync(projectsDir)) return files

  try {
    const projectFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
    for (const pf of projectFolders) {
      if (!pf.isDirectory()) continue
      const pfPath = path.join(projectsDir, pf.name)
      try {
        const entries = fs.readdirSync(pfPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.jsonl') && !entry.name.startsWith('.')) {
            files.push({ filePath: path.join(pfPath, entry.name), projectFolder: pf.name })
          }
          // Also check one level deeper (session subdirs that might have jsonl)
          if (entry.isDirectory() && entry.name !== 'tool-results' && entry.name !== 'file-history' && entry.name !== 'memory') {
            // Skip — session subdirs contain tool results, not conversation logs
          }
        }
      } catch {}
    }
  } catch {}

  return files
}

function parseJSONLFile(filePath: string, projectFolder: string): ParsedMessage[] {
  const messages: ParsedMessage[] = []

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    let fileProject = projectFolder

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)

        // Capture project from cwd field if available
        if (obj.cwd) {
          fileProject = obj.cwd
        }

        if (obj.type === 'assistant' && obj.message?.usage) {
          const u = obj.message.usage
          const model = obj.message.model || 'unknown'

          let toolCalls = 0
          if (Array.isArray(obj.message.content)) {
            toolCalls = obj.message.content.filter((c: any) => c.type === 'tool_use').length
          }

          let hour = 0
          try { hour = new Date(obj.timestamp).getHours() } catch {}

          messages.push({
            timestamp: obj.timestamp || '',
            sessionId: obj.sessionId || '',
            model,
            usage: {
              inputTokens: u.input_tokens || 0,
              outputTokens: u.output_tokens || 0,
              cacheReadTokens: u.cache_read_input_tokens || 0,
              cacheWriteTokens: u.cache_creation_input_tokens || 0,
            },
            type: 'assistant',
            toolCalls,
            hour,
            project: fileProject,
          })
        } else if (obj.type === 'user' && obj.message) {
          messages.push({
            timestamp: obj.timestamp || '',
            sessionId: obj.sessionId || '',
            model: '',
            usage: null,
            type: 'user',
            toolCalls: 0,
            hour: 0,
            project: fileProject,
          })
        }
      } catch {}
    }
  } catch {}

  return messages
}

function computeStats(): OverallStats {
  const claudeDir = getClaudeDir()
  const jsonlFiles = findAllJSONLFiles(claudeDir)

  const modelUsage: Record<string, TokenUsage> = {}
  const dailyMap: Record<string, DailyStats> = {}
  const sessionsByDay: Record<string, Set<string>> = {}
  const hourCounts: Record<number, number> = {}
  let totalMessages = 0
  let totalToolCalls = 0
  let firstDate = ''

  // Session-level tracking
  const sessionMap: Record<string, {
    sessionId: string
    project: string
    startTime: string
    endTime: string
    messageCount: number
    toolCallCount: number
    tokens: TokenUsage
    models: Set<string>
    costUSD: number
  }> = {}

  // Project-level tracking
  const projectMap: Record<string, {
    project: string
    sessions: Set<string>
    messageCount: number
    toolCallCount: number
    tokens: TokenUsage
    costUSD: number
    lastActive: string
  }> = {}

  for (const { filePath, projectFolder } of jsonlFiles) {
    const messages = parseJSONLFile(filePath, projectFolder)

    for (const msg of messages) {
      if (!msg.timestamp) continue
      const date = msg.timestamp.slice(0, 10)

      if (!firstDate || date < firstDate) firstDate = date

      const sid = msg.sessionId || filePath
      if (!sessionsByDay[date]) sessionsByDay[date] = new Set()
      sessionsByDay[date].add(sid)

      // Initialize session
      if (!sessionMap[sid]) {
        sessionMap[sid] = {
          sessionId: sid,
          project: msg.project || projectFolder,
          startTime: msg.timestamp,
          endTime: msg.timestamp,
          messageCount: 0,
          toolCallCount: 0,
          tokens: emptyTokens(),
          models: new Set(),
          costUSD: 0,
        }
      }
      const session = sessionMap[sid]
      if (msg.timestamp < session.startTime) session.startTime = msg.timestamp
      if (msg.timestamp > session.endTime) session.endTime = msg.timestamp
      session.messageCount++

      // Initialize project
      const projKey = session.project
      if (!projectMap[projKey]) {
        projectMap[projKey] = {
          project: projKey,
          sessions: new Set(),
          messageCount: 0,
          toolCallCount: 0,
          tokens: emptyTokens(),
          costUSD: 0,
          lastActive: '',
        }
      }
      const proj = projectMap[projKey]
      proj.sessions.add(sid)
      proj.messageCount++
      if (msg.timestamp > proj.lastActive) proj.lastActive = msg.timestamp

      // Daily stats
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          messageCount: 0,
          sessionCount: 0,
          toolCallCount: 0,
          tokens: emptyTokens(),
          modelBreakdown: {},
        }
      }

      const day = dailyMap[date]
      day.messageCount++
      totalMessages++

      if (msg.type === 'assistant' && msg.usage) {
        const model = msg.model
        const msgCost = estimateTokenCost(model, msg.usage)

        if (!modelUsage[model]) modelUsage[model] = emptyTokens()
        modelUsage[model] = addTokens(modelUsage[model], msg.usage)

        day.tokens = addTokens(day.tokens, msg.usage)
        if (!day.modelBreakdown[model]) day.modelBreakdown[model] = emptyTokens()
        day.modelBreakdown[model] = addTokens(day.modelBreakdown[model], msg.usage)

        day.toolCallCount += msg.toolCalls
        totalToolCalls += msg.toolCalls

        hourCounts[msg.hour] = (hourCounts[msg.hour] || 0) + 1

        // Session
        session.tokens = addTokens(session.tokens, msg.usage)
        session.toolCallCount += msg.toolCalls
        session.models.add(model)
        session.costUSD += msgCost

        // Project
        proj.tokens = addTokens(proj.tokens, msg.usage)
        proj.toolCallCount += msg.toolCalls
        proj.costUSD += msgCost
      }
    }
  }

  // Finalize daily
  const dailyStats = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))
  for (const day of dailyStats) {
    day.sessionCount = sessionsByDay[day.date]?.size || 0
  }

  // Finalize sessions — convert to array, sort by most recent
  const sessions: SessionData[] = Object.values(sessionMap)
    .map((s) => ({
      sessionId: s.sessionId,
      project: s.project,
      startTime: s.startTime,
      endTime: s.endTime,
      messageCount: s.messageCount,
      toolCallCount: s.toolCallCount,
      tokens: s.tokens,
      models: Array.from(s.models),
      costUSD: s.costUSD,
    }))
    .sort((a, b) => b.endTime.localeCompare(a.endTime))

  // Finalize projects
  const projects: ProjectData[] = Object.values(projectMap)
    .map((p) => ({
      project: p.project,
      displayName: getProjectDisplayName(
        p.project.includes('/') || p.project.includes('\\')
          ? p.project
          : decodeProjectName(p.project)
      ),
      sessionCount: p.sessions.size,
      messageCount: p.messageCount,
      toolCallCount: p.toolCallCount,
      tokens: p.tokens,
      costUSD: p.costUSD,
      lastActive: p.lastActive,
    }))
    .sort((a, b) => b.costUSD - a.costUSD)

  // Totals
  let totalTokens = emptyTokens()
  for (const usage of Object.values(modelUsage)) {
    totalTokens = addTokens(totalTokens, usage)
  }

  let estimatedCostUSD = 0
  for (const [model, usage] of Object.entries(modelUsage)) {
    estimatedCostUSD += estimateTokenCost(model, usage)
  }

  return {
    totalTokens,
    totalMessages,
    totalSessions: Object.keys(sessionMap).length,
    totalToolCalls,
    estimatedCostUSD,
    modelUsage,
    dailyStats,
    hourlyActivity: hourCounts,
    firstSessionDate: firstDate,
    subscription: 'Max 5×',
    sessions,
    projects,
  }
}

let cachedStats: OverallStats | null = null

export function registerDataHandlers() {
  ipcMain.handle('load-stats', async () => {
    if (!cachedStats) {
      cachedStats = computeStats()
    }
    return cachedStats
  })

  ipcMain.handle('refresh-stats', async () => {
    cachedStats = computeStats()
    return cachedStats
  })
}
