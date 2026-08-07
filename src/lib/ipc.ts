// ── The preload bridge, described once ────────────────────────────────────
// window.electronAPI is created by electron/preload.ts. It was previously
// reached through `(window as any)`, so nothing checked that the renderer and
// the preload script still agreed — the declared API even listed a `homedir`
// field that preload has never exposed. These types are the contract; keep them
// in step with electron/preload.ts.

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface DailyStats {
  date: string
  messageCount: number
  sessionCount: number
  toolCallCount: number
  tokens: TokenUsage
  modelBreakdown: Record<string, TokenUsage>
}

export interface SessionData {
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

export interface ProjectData {
  project: string
  displayName: string
  sessionCount: number
  messageCount: number
  toolCallCount: number
  tokens: TokenUsage
  costUSD: number
  lastActive: string
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
  sessions: SessionData[]
  projects: ProjectData[]
}

export interface ThrottleEvent {
  timestamp: string
  model: string
  serviceTier: string
  project: string
}

export interface ElectronAPI {
  platform: string
  /** Returns null when the request did not come from a trusted frame. */
  loadStats: () => Promise<OverallStats | null>
  refreshStats: () => Promise<OverallStats | null>
  getAutoStart: () => Promise<boolean>
  setAutoStart: (enabled: boolean) => Promise<boolean>
  onThrottleDetected: (callback: (event: ThrottleEvent) => void) => void
}

/**
 * The bridge is absent when the UI runs in a plain browser (vite dev without
 * Electron), so callers get undefined rather than a TypeError on first use.
 */
export function electronAPI(): ElectronAPI | undefined {
  return window.electronAPI
}
