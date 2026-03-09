import { formatTokens, formatCost, totalTokenCount } from '../lib/parser'

interface Props {
  stats: {
    totalTokens: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
    totalMessages: number
    totalSessions: number
    estimatedCostUSD: number
    subscription: string
    firstSessionDate: string
    dailyStats: Array<{
      date: string
      messageCount: number
      sessionCount: number
      toolCallCount: number
      tokens: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
    }>
  }
  planLabel?: string
  planPrice?: string
}

export function OverviewCard({ stats, planLabel, planPrice }: Props) {
  const total = totalTokenCount(stats.totalTokens)
  const { cacheReadTokens, cacheWriteTokens, inputTokens, outputTokens } = stats.totalTokens

  // Progress bar segments (proportional)
  const segments = [
    { value: cacheReadTokens, color: '#4ade80', label: 'cache read' },
    { value: cacheWriteTokens, color: '#e8763a', label: 'cache write' },
    { value: inputTokens, color: '#38bdf8', label: 'input' },
    { value: outputTokens, color: '#22d3ee', label: 'output' },
  ]

  // Today's stats
  const today = new Date().toISOString().slice(0, 10)
  const todayStats = stats.dailyStats.find((d) => d.date === today)
  const todayTokens = todayStats ? totalTokenCount(todayStats.tokens) : 0

  // Format first session date
  const sinceDate = stats.firstSessionDate
    ? new Date(stats.firstSessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : ''

  return (
    <div className="card">
      {/* Subscription badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">✦</span>
          <span className="font-semibold text-white text-sm">Claude Code</span>
          <span className="bg-green-600/20 text-green-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
            {planLabel || stats.subscription} {planPrice || '$100/mo'}
          </span>
        </div>
        <span className="text-gray-500 text-[11px]">since {sinceDate} &gt;</span>
      </div>

      {/* Big stats row */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <StatItem value={formatTokens(total)} label="tokens" />
        <StatItem value={formatTokens(stats.totalSessions)} label="sessions" />
        <StatItem value={formatTokens(stats.totalMessages)} label="messages" />
      </div>

      {/* Token breakdown progress bar */}
      <div className="progress-bar mb-2">
        <div className="flex h-full">
          {segments.map((seg, i) => (
            <div
              key={i}
              className="progress-segment"
              style={{
                width: `${(seg.value / total) * 100}%`,
                backgroundColor: seg.color,
              }}
            />
          ))}
        </div>
      </div>

      {/* Token breakdown legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {segments.map((seg, i) => (
          <span key={i} className="stat-pill">
            <span className="dot" style={{ backgroundColor: seg.color }} />
            {formatTokens(seg.value)} {seg.label}
          </span>
        ))}
      </div>

      <div className="text-[10px] text-gray-600 mb-3">
        Local token logs × API pricing estimate (not your subscription spend)
      </div>

      {/* Today row */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <span className="text-gray-400 text-xs font-medium">Today</span>
        <div className="flex gap-4">
          <span className="text-xs">
            <span className="text-green-400 font-medium">{todayStats?.messageCount?.toLocaleString() || 0}</span>
            <span className="text-gray-500"> msgs</span>
          </span>
          <span className="text-xs">
            <span className="text-orange-400 font-medium">{todayStats?.sessionCount || 0}</span>
            <span className="text-gray-500"> sessions</span>
          </span>
          <span className="text-xs">
            <span className="text-red-400 font-medium">{todayStats?.toolCallCount?.toLocaleString() || 0}</span>
            <span className="text-gray-500"> tools</span>
          </span>
          <span className="text-xs">
            <span className="text-white font-medium">{formatTokens(todayTokens)}</span>
            <span className="text-gray-500"> tokens</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  )
}
