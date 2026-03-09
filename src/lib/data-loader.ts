/**
 * Data loader — reads Claude Code's local data files
 * Works in both Electron (fs access) and browser (fetch from preload)
 *
 * In Electron, we read files directly via the main process.
 * For simplicity in v1, we read from the filesystem using fetch + file:// protocol
 * or by bundling the data reader in the preload script.
 *
 * Approach: Read all JSONL files, parse messages, aggregate stats.
 */

import {
  type TokenUsage,
  type DailyStats,
  type OverallStats,
  parseAssistantMessage,
  parseUserMessage,
  addTokens,
  emptyTokens,
  totalTokenCount,
  estimateTotalCost,
} from './parser'

interface StatsCache {
  version: number
  lastComputedDate: string
  dailyActivity: Array<{
    date: string
    messageCount: number
    sessionCount: number
    toolCallCount: number
  }>
  dailyModelTokens: Array<{
    date: string
    tokensByModel: Record<string, number>
  }>
  modelUsage: Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      cacheReadInputTokens: number
      cacheCreationInputTokens: number
    }
  >
  totalSessions: number
  totalMessages: number
  firstSessionDate: string
  hourCounts: Record<string, number>
}

function getClaudeDir(): string {
  const home = (window as any).electronAPI?.homedir || ''
  if (!home) {
    // Fallback detection
    if (navigator.platform.startsWith('Win')) {
      return 'C:\\Users\\' + (navigator.userAgent.includes('antho') ? 'antho' : 'user') + '\\.claude'
    }
    return '/Users/user/.claude'
  }
  const sep = home.includes('\\') ? '\\' : '/'
  return home + sep + '.claude'
}

/**
 * Parse all JSONL data from the filesystem via Electron IPC
 * For now, we aggregate from the stats-cache.json + scan recent JSONL files
 */
export async function loadStats(): Promise<OverallStats> {
  // This will be called from the renderer and use IPC to main process
  // For v1, we'll use a simulated data structure from stats-cache + live JSONL parsing
  const stats = await (window as any).electronAPI.loadStats()
  return stats
}

/**
 * Process raw JSONL content into message records
 */
export function processJSONLContent(content: string) {
  const lines = content.split('\n').filter((l) => l.trim())
  const messages: Array<{
    timestamp: string
    sessionId: string
    model?: string
    usage?: TokenUsage
    type: string
    toolCalls: number
  }> = []

  for (const line of lines) {
    const assistant = parseAssistantMessage(line)
    if (assistant) {
      messages.push(assistant)
      continue
    }
    const user = parseUserMessage(line)
    if (user) {
      messages.push({ ...user, type: 'user', toolCalls: 0 })
    }
  }

  return messages
}

/**
 * Aggregate messages into OverallStats
 */
export function aggregateMessages(
  messages: Array<{
    timestamp: string
    sessionId: string
    model?: string
    usage?: TokenUsage
    type: string
    toolCalls: number
  }>,
  existingCache?: StatsCache
): OverallStats {
  const modelUsage: Record<string, TokenUsage> = {}
  const dailyMap: Record<string, DailyStats> = {}
  const sessions = new Set<string>()
  const hourCounts: Record<number, number> = {}
  let totalMessages = 0
  let totalToolCalls = 0
  let firstDate = ''

  // Process from stats cache if available
  if (existingCache) {
    totalMessages = existingCache.totalMessages
    firstDate = existingCache.firstSessionDate

    for (const [model, usage] of Object.entries(existingCache.modelUsage)) {
      modelUsage[model] = {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadInputTokens,
        cacheWriteTokens: usage.cacheCreationInputTokens,
      }
    }

    for (const [hour, count] of Object.entries(existingCache.hourCounts)) {
      hourCounts[parseInt(hour)] = count
    }

    for (const day of existingCache.dailyActivity) {
      dailyMap[day.date] = {
        date: day.date,
        messageCount: day.messageCount,
        sessionCount: day.sessionCount,
        toolCallCount: day.toolCallCount,
        tokens: emptyTokens(),
        modelBreakdown: {},
      }
      totalToolCalls += day.toolCallCount
      sessions.add(day.date) // approximate
    }
  }

  // Process live messages (from recent JSONL files)
  for (const msg of messages) {
    if (!msg.timestamp) continue

    const date = msg.timestamp.slice(0, 10)
    if (!firstDate || date < firstDate) firstDate = date

    if (msg.sessionId) sessions.add(msg.sessionId)

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

    if (msg.type === 'assistant' && msg.usage) {
      const model = msg.model || 'unknown'

      if (!modelUsage[model]) modelUsage[model] = emptyTokens()
      modelUsage[model] = addTokens(modelUsage[model], msg.usage)

      day.tokens = addTokens(day.tokens, msg.usage)
      if (!day.modelBreakdown[model]) day.modelBreakdown[model] = emptyTokens()
      day.modelBreakdown[model] = addTokens(day.modelBreakdown[model], msg.usage)

      day.toolCallCount += msg.toolCalls
      totalToolCalls += msg.toolCalls

      // Hour tracking
      try {
        const hour = new Date(msg.timestamp).getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      } catch {}
    }

    day.messageCount++
    totalMessages++
  }

  // Sort daily stats
  const dailyStats = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

  // Count unique sessions per day
  // (approximate from session IDs in messages)
  const sessionsByDay: Record<string, Set<string>> = {}
  for (const msg of messages) {
    if (msg.sessionId && msg.timestamp) {
      const date = msg.timestamp.slice(0, 10)
      if (!sessionsByDay[date]) sessionsByDay[date] = new Set()
      sessionsByDay[date].add(msg.sessionId)
    }
  }
  for (const day of dailyStats) {
    if (sessionsByDay[day.date]) {
      day.sessionCount = sessionsByDay[day.date].size
    }
  }

  // Calculate total tokens
  let totalTokens = emptyTokens()
  for (const usage of Object.values(modelUsage)) {
    totalTokens = addTokens(totalTokens, usage)
  }

  return {
    totalTokens,
    totalMessages,
    totalSessions: sessions.size,
    totalToolCalls,
    estimatedCostUSD: estimateTotalCost(modelUsage),
    modelUsage,
    dailyStats,
    hourlyActivity: hourCounts,
    firstSessionDate: firstDate,
    subscription: 'Max 5×',
  }
}
