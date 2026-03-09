import { useState, useEffect } from 'react'
import { Header } from './components/Header'
import { OverviewCard } from './components/OverviewCard'
import { TodayCard } from './components/TodayCard'
import { TrendChart } from './components/TrendChart'
import { ModelBreakdown } from './components/ModelBreakdown'
import { BillingCycle } from './components/BillingCycle'
import { SessionsTab } from './components/SessionsTab'
import { CostsTab } from './components/CostsTab'
import { SettingsPanel } from './components/SettingsPanel'
import { type Settings, loadSettings, getActivePlan } from './lib/settings'

type Tab = 'usage' | 'sessions' | 'costs'

interface ThrottleEvent {
  timestamp: string
  model: string
  serviceTier: string
  project: string
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

interface OverallStats {
  totalTokens: TokenUsage
  totalMessages: number
  totalSessions: number
  totalToolCalls: number
  estimatedCostUSD: number
  modelUsage: Record<string, TokenUsage>
  dailyStats: Array<{
    date: string
    messageCount: number
    sessionCount: number
    toolCallCount: number
    tokens: TokenUsage
    modelBreakdown: Record<string, TokenUsage>
  }>
  hourlyActivity: Record<number, number>
  firstSessionDate: string
  subscription: string
  sessions: Array<{
    sessionId: string
    project: string
    startTime: string
    endTime: string
    messageCount: number
    toolCallCount: number
    tokens: TokenUsage
    models: string[]
    costUSD: number
  }>
  projects: Array<{
    project: string
    displayName: string
    sessionCount: number
    messageCount: number
    toolCallCount: number
    tokens: TokenUsage
    costUSD: number
    lastActive: string
  }>
}

export default function App() {
  const [tab, setTab] = useState<Tab>('usage')
  const [stats, setStats] = useState<OverallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [throttle, setThrottle] = useState<ThrottleEvent | null>(null)

  useEffect(() => {
    loadData()

    // Listen for throttle events from main process
    const api = (window as any).electronAPI
    if (api?.onThrottleDetected) {
      api.onThrottleDetected((event: ThrottleEvent) => {
        setThrottle(event)
        // Auto-dismiss after 60 seconds
        setTimeout(() => setThrottle(null), 60000)
      })
    }
  }, [])

  async function loadData() {
    try {
      const data = await (window as any).electronAPI.loadStats()
      setStats(data)
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setLoading(true)
    try {
      const data = await (window as any).electronAPI.refreshStats()
      setStats(data)
    } catch (err) {
      console.error('Failed to refresh:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500 text-sm">Loading stats...</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500 text-sm">No Claude Code data found</div>
      </div>
    )
  }

  if (showSettings) {
    return (
      <div className="h-screen overflow-y-auto">
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onSave={(s) => setSettings(s)}
        />
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const todayStats = stats.dailyStats.find((d) => d.date === today)
  const plan = getActivePlan(settings)

  return (
    <div className="h-screen overflow-y-auto p-3">
      {throttle && (
        <div
          className="mb-2 rounded-lg px-3 py-2 flex items-center justify-between text-xs"
          style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
        >
          <div>
            <strong>Throttled</strong> — tier: {throttle.serviceTier}, model: {throttle.model}
          </div>
          <button
            onClick={() => setThrottle(null)}
            className="ml-2 hover:text-white transition-colors"
          >
            ×
          </button>
        </div>
      )}
      <Header
        tab={tab}
        onTabChange={setTab}
        onRefresh={refresh}
        onSettings={() => setShowSettings(true)}
      />

      {tab === 'usage' && (
        <div className="mt-3 space-y-2.5">
          <OverviewCard stats={stats} planLabel={plan.label} planPrice={plan.price} />
          <BillingCycle
            dailyStats={stats.dailyStats}
            modelUsage={stats.modelUsage}
            outputLimit={plan.effectiveOutputLimit}
            planLabel={plan.label}
            billingDay={settings.billingDay}
          />
          <TodayCard todayStats={todayStats || null} stats={stats} />
          <TrendChart dailyStats={stats.dailyStats} />
          <ModelBreakdown modelUsage={stats.modelUsage} />
        </div>
      )}

      {tab === 'sessions' && (
        <SessionsTab sessions={stats.sessions} />
      )}

      {tab === 'costs' && (
        <CostsTab
          dailyStats={stats.dailyStats}
          modelUsage={stats.modelUsage}
          projects={stats.projects}
          totalCost={stats.estimatedCostUSD}
        />
      )}
    </div>
  )
}
