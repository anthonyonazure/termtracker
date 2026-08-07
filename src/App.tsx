import { useState, useEffect } from 'react'
import { Header, type Tab } from './components/Header'
import { OverviewCard } from './components/OverviewCard'
import { TodayCard } from './components/TodayCard'
import { TrendChart } from './components/TrendChart'
import { ModelBreakdown } from './components/ModelBreakdown'
import { BillingCycle } from './components/BillingCycle'
import { SessionsTab } from './components/SessionsTab'
import { CostsTab } from './components/CostsTab'
import { SettingsPanel } from './components/SettingsPanel'
import { type Settings, loadSettings, getActivePlan } from './lib/settings'
import { electronAPI, type OverallStats, type ThrottleEvent } from './lib/ipc'

export default function App() {
  const [tab, setTab] = useState<Tab>('usage')
  const [stats, setStats] = useState<OverallStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [throttle, setThrottle] = useState<ThrottleEvent | null>(null)

  useEffect(() => {
    void loadData()

    // Listen for throttle events from main process
    electronAPI()?.onThrottleDetected((event) => {
      setThrottle(event)
      // Auto-dismiss after 60 seconds
      setTimeout(() => setThrottle(null), 60000)
    })
  }, [])

  async function loadData() {
    try {
      setStats((await electronAPI()?.loadStats()) ?? null)
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setLoading(false)
    }
  }

  async function refresh() {
    setLoading(true)
    try {
      setStats((await electronAPI()?.refreshStats()) ?? null)
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
        onRefresh={() => void refresh()}
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
