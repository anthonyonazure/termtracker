import { formatTokens, formatCost, totalTokenCount, estimateCost } from '../lib/parser'

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

interface Props {
  dailyStats: DailyStats[]
  modelUsage: Record<string, TokenUsage>
  outputLimit: number
  planLabel: string
  billingDay: number
}

function getBillingCycle(billingDay: number) {
  const now = new Date()
  // Cycle starts on billingDay of the current or previous month
  let cycleStart: Date
  if (now.getDate() >= billingDay) {
    cycleStart = new Date(now.getFullYear(), now.getMonth(), billingDay)
  } else {
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, billingDay)
  }
  const resetDate = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, billingDay)
  const totalDays = Math.round((resetDate.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24))
  const daysUsed = Math.round((now.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24))
  const daysLeft = Math.max(0, totalDays - daysUsed)
  const pctThrough = (daysUsed / totalDays) * 100
  return { cycleStart, resetDate, totalDays, daysUsed, daysLeft, pctThrough }
}

type BurnStatus = 'good' | 'watch' | 'danger' | 'over'

function getBurnStatus(pctUsed: number, pctTimeElapsed: number): BurnStatus {
  if (pctUsed >= 100) return 'over'
  if (pctUsed >= 90) return 'danger'
  // Burning faster than time passing = watch
  if (pctUsed > pctTimeElapsed * 1.3) return 'watch'
  return 'good'
}

const STATUS_CONFIG: Record<BurnStatus, { color: string; bg: string; label: string; icon: string }> = {
  good: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', label: 'On track', icon: '●' },
  watch: { color: '#facc15', bg: 'rgba(250,204,21,0.1)', label: 'Watch pace', icon: '◐' },
  danger: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'May run out', icon: '◑' },
  over: { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', label: 'Over budget', icon: '○' },
}

export function BillingCycle({ dailyStats, modelUsage, outputLimit, planLabel, billingDay }: Props) {
  const cycle = getBillingCycle(billingDay)

  // Current billing period stats
  const cycleStartStr = cycle.cycleStart.toISOString().slice(0, 10)
  const periodStats = dailyStats.filter((d) => d.date >= cycleStartStr)

  const periodTokens = periodStats.reduce((sum, d) => sum + totalTokenCount(d.tokens), 0)
  const activeDays = periodStats.filter((d) => d.messageCount > 0).length

  // Output tokens specifically (what the limit is based on)
  const periodOutputTokens = periodStats.reduce((sum, d) => sum + d.tokens.outputTokens, 0)

  // Estimate period cost
  let periodCost = 0
  for (const day of periodStats) {
    for (const [model, usage] of Object.entries(day.modelBreakdown)) {
      periodCost += estimateCost(model, usage)
    }
  }

  // Burn rate calculations
  const avgDailyOutput = activeDays > 0 ? periodOutputTokens / activeDays : 0
  const avgDailyTokens = activeDays > 0 ? periodTokens / activeDays : 0
  const avgDailyCost = activeDays > 0 ? periodCost / activeDays : 0

  // Projection: assume same active-day ratio going forward
  const activeDayRatio = cycle.daysUsed > 0 ? activeDays / cycle.daysUsed : 1
  const projectedActiveDaysLeft = Math.round(cycle.daysLeft * activeDayRatio)
  const projectedRemainingOutput = avgDailyOutput * projectedActiveDaysLeft
  const projectedTotalOutput = periodOutputTokens + projectedRemainingOutput
  const projectedMonthlyTokens = avgDailyTokens * (activeDays + projectedActiveDaysLeft)
  const projectedMonthlyCost = avgDailyCost * (activeDays + projectedActiveDaysLeft)

  // Budget usage
  const pctUsed = (periodOutputTokens / outputLimit) * 100
  const pctProjected = (projectedTotalOutput / outputLimit) * 100
  const remainingOutput = Math.max(0, outputLimit - periodOutputTokens)
  const daysOfOutputLeft = avgDailyOutput > 0 ? remainingOutput / avgDailyOutput : Infinity
  const runOutDay = daysOfOutputLeft < cycle.daysLeft
    ? Math.ceil(daysOfOutputLeft)
    : null

  // Status
  const status = getBurnStatus(pctUsed, cycle.pctThrough)
  const projectedStatus = pctProjected >= 100 ? 'danger' as BurnStatus : status
  const cfg = STATUS_CONFIG[projectedStatus]

  // Format reset date
  const resetStr = cycle.resetDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  // Estimated run-out date
  const runOutDate = runOutDay !== null
    ? (() => {
        const d = new Date()
        d.setDate(d.getDate() + runOutDay)
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      })()
    : null

  return (
    <div className="card">
      {/* Header with status badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">Billing Cycle</span>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ color: cfg.color, backgroundColor: cfg.bg }}
          >
            {cfg.icon} {cfg.label}
          </span>
        </div>
        <span className="text-gray-500 text-xs">resets {resetStr}</span>
      </div>

      {/* Budget usage bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">
            {formatTokens(periodOutputTokens)} / {formatTokens(outputLimit)} output
          </span>
          <span className="text-xs font-medium" style={{ color: cfg.color }}>
            {pctUsed.toFixed(1)}% used
          </span>
        </div>
        <div className="progress-bar relative" style={{ height: 8 }}>
          {/* Used portion */}
          <div
            className="absolute top-0 left-0 h-full rounded-l-[3px]"
            style={{
              width: `${Math.min(pctUsed, 100)}%`,
              backgroundColor: cfg.color,
              borderRadius: pctUsed >= 100 ? '3px' : undefined,
            }}
          />
          {/* Projected portion (lighter) */}
          {pctProjected > pctUsed && (
            <div
              className="absolute top-0 h-full"
              style={{
                left: `${Math.min(pctUsed, 100)}%`,
                width: `${Math.min(pctProjected - pctUsed, 100 - pctUsed)}%`,
                backgroundColor: cfg.color,
                opacity: 0.25,
                borderTopRightRadius: 3,
                borderBottomRightRadius: 3,
              }}
            />
          )}
          {/* Time marker — where you "should" be if even pace */}
          <div
            className="absolute top-0 h-full"
            style={{
              left: `${cycle.pctThrough}%`,
              width: 1.5,
              backgroundColor: '#fff',
              opacity: 0.4,
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-600">
            {formatTokens(remainingOutput)} remaining
          </span>
          <span className="text-[10px] text-gray-600">
            Day {cycle.daysUsed}/{cycle.totalDays} · {cycle.daysLeft}d left
          </span>
        </div>
      </div>

      {/* Run-out warning */}
      {runOutDay !== null && (
        <div
          className="rounded-lg px-3 py-2 mb-3 text-xs"
          style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
        >
          At current pace, you'll hit the limit ~<strong>{runOutDate}</strong>
          {' '}({runOutDay} day{runOutDay !== 1 ? 's' : ''} from now)
          — {cycle.daysLeft - runOutDay} day{cycle.daysLeft - runOutDay !== 1 ? 's' : ''} before refresh
        </div>
      )}

      {runOutDay === null && activeDays > 0 && (
        <div
          className="rounded-lg px-3 py-2 mb-3 text-xs"
          style={{ backgroundColor: 'rgba(74,222,128,0.08)', color: '#4ade80' }}
        >
          Projected ~{formatTokens(projectedTotalOutput)} output by end of cycle
          — {((1 - projectedTotalOutput / outputLimit) * 100).toFixed(0)}% headroom
        </div>
      )}

      {/* Period stats */}
      <div className="grid grid-cols-3 gap-3 mb-3 pt-2 border-t border-white/5">
        <div className="text-center">
          <div className="text-sm font-bold text-white">{formatTokens(periodTokens)}</div>
          <div className="text-[10px] text-gray-500">period tokens</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-white">{formatCost(periodCost)}</div>
          <div className="text-[10px] text-gray-500">API est.</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-white">{activeDays}</div>
          <div className="text-[10px] text-gray-500">active days</div>
        </div>
      </div>

      {/* Pace / projection */}
      <div className="pt-2 border-t border-white/5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-gray-500">Daily burn rate</span>
          <span className="text-[11px] text-gray-300">
            {formatTokens(avgDailyOutput)} out · {formatTokens(avgDailyTokens)} total
          </span>
        </div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-gray-500">Projected month</span>
          <span className="text-[11px] text-gray-300">
            {formatTokens(projectedMonthlyTokens)} tokens · {formatCost(projectedMonthlyCost)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">Budget pace</span>
          <span className="text-[11px]" style={{ color: cfg.color }}>
            {pctUsed.toFixed(1)}% used at {cycle.pctThrough.toFixed(0)}% through cycle
          </span>
        </div>
      </div>

      {/* Plan info */}
      <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-gray-600">
        Est. ~{formatTokens(outputLimit)} output/mo ({planLabel}) · community-observed, not official
      </div>
    </div>
  )
}
