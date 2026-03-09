/**
 * Claude Code data parser
 * Reads JSONL conversation files from ~/.claude/projects/ and extracts token usage
 */

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface MessageRecord {
  timestamp: string
  sessionId: string
  model: string
  usage: TokenUsage
  type: 'assistant' | 'user' | 'other'
  toolCalls: number
}

export interface SessionInfo {
  sessionId: string
  project: string
  startTime: string
  endTime: string
  messageCount: number
  toolCallCount: number
  totalTokens: TokenUsage
  models: string[]
}

export interface DailyStats {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
  tokens: TokenUsage
  modelBreakdown: Record<string, TokenUsage>
}

export interface OverallStats {
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
}

// API pricing per million tokens (for cost estimation)
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
  return PRICING['claude-sonnet-4-6'] // default
}

export function estimateCost(model: string, usage: TokenUsage): number {
  const pricing = getModelPricing(model)
  return (
    (usage.inputTokens * pricing.input +
      usage.outputTokens * pricing.output +
      usage.cacheReadTokens * pricing.cacheRead +
      usage.cacheWriteTokens * pricing.cacheWrite) /
    1_000_000
  )
}

export function estimateTotalCost(modelUsage: Record<string, TokenUsage>): number {
  let total = 0
  for (const [model, usage] of Object.entries(modelUsage)) {
    total += estimateCost(model, usage)
  }
  return total
}

export function parseAssistantMessage(line: string): MessageRecord | null {
  try {
    const obj = JSON.parse(line)
    if (obj.type !== 'assistant' || !obj.message?.usage) return null

    const usage = obj.message.usage
    const model = obj.message.model || 'unknown'

    // Count tool calls in content
    let toolCalls = 0
    if (Array.isArray(obj.message.content)) {
      toolCalls = obj.message.content.filter(
        (c: any) => c.type === 'tool_use'
      ).length
    }

    return {
      timestamp: obj.timestamp || '',
      sessionId: obj.sessionId || '',
      model,
      usage: {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        cacheWriteTokens: usage.cache_creation_input_tokens || 0,
      },
      type: 'assistant',
      toolCalls,
    }
  } catch {
    return null
  }
}

export function parseUserMessage(line: string): { timestamp: string; sessionId: string } | null {
  try {
    const obj = JSON.parse(line)
    if (obj.type !== 'user') return null
    return {
      timestamp: obj.timestamp || '',
      sessionId: obj.sessionId || '',
    }
  } catch {
    return null
  }
}

export function addTokens(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  }
}

export function totalTokenCount(t: TokenUsage): number {
  return t.inputTokens + t.outputTokens + t.cacheReadTokens + t.cacheWriteTokens
}

export function emptyTokens(): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function formatCost(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

export function formatModelName(model: string): string {
  // claude-opus-4-6 → opus-4-6
  // claude-sonnet-4-5-20250929 → sonnet-4-5 '25
  const parts = model.replace('claude-', '')
  const dateMatch = parts.match(/(\d{4})\d{4}$/)
  if (dateMatch) {
    const base = parts.replace(/-\d{8}$/, '')
    return `${base} '${dateMatch[1].slice(2)}`
  }
  return parts
}
