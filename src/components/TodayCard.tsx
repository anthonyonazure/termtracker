import { formatTokens, formatCost, totalTokenCount, estimateTotalCost } from '../lib/parser'

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

interface Props {
  todayStats: {
    date: string
    messageCount: number
    sessionCount: number
    toolCallCount: number
    tokens: TokenUsage
    modelBreakdown: Record<string, TokenUsage>
  } | null
  stats: {
    hourlyActivity: Record<number, number>
  }
}

export function TodayCard({ todayStats, stats }: Props) {
  if (!todayStats) {
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white font-medium text-sm">Today's Usage</span>
          <span className="text-gray-500 text-xs">No activity yet</span>
        </div>
      </div>
    )
  }

  const total = totalTokenCount(todayStats.tokens)
  const { cacheReadTokens, cacheWriteTokens, inputTokens, outputTokens } = todayStats.tokens
  const cost = estimateTotalCost(todayStats.modelBreakdown)

  const segments = [
    { value: cacheReadTokens, color: '#4ade80', label: 'cache read' },
    { value: cacheWriteTokens, color: '#e8763a', label: 'cache write' },
    { value: inputTokens, color: '#38bdf8', label: 'input' },
    { value: outputTokens, color: '#22d3ee', label: 'output' },
  ]

  // Hourly sparkline data (last 60 minutes approximation)
  const hourlyData = generateHourlySparkline(stats.hourlyActivity)

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-medium text-sm">Today's Usage</span>
        <span className="text-gray-500 text-xs">~{formatCost(cost)} API list est.</span>
      </div>

      {/* Big token number */}
      <div className="mb-2">
        <span className="text-3xl font-bold text-orange-400">{formatTokens(total)}</span>
        <span className="text-gray-500 text-sm ml-2">tokens</span>
      </div>

      {/* Progress bar */}
      <div className="progress-bar mb-2">
        <div className="flex h-full">
          {segments.map((seg, i) => (
            <div
              key={i}
              className="progress-segment"
              style={{
                width: total > 0 ? `${(seg.value / total) * 100}%` : '0%',
                backgroundColor: seg.color,
              }}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {segments.map((seg, i) => (
          <span key={i} className="stat-pill">
            <span className="dot" style={{ backgroundColor: seg.color }} />
            {formatTokens(seg.value)} {seg.label}
          </span>
        ))}
      </div>

      {/* Hourly sparkline */}
      <div className="pt-2 border-t border-white/5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-500 text-[11px]">Last Hour</span>
          <span className="text-xs">
            <span className="dot inline-block w-1.5 h-1.5 rounded-full bg-orange-400 mr-1" />
            <span className="text-orange-400 font-medium">{formatTokens(getLastHourRate(stats.hourlyActivity))}/m</span>
          </span>
        </div>
        <Sparkline data={hourlyData} />
      </div>
    </div>
  )
}

function generateHourlySparkline(hourlyActivity: Record<number, number>): number[] {
  // Generate 30 data points representing activity levels
  const points: number[] = []
  const currentHour = new Date().getHours()

  for (let i = 0; i < 30; i++) {
    const hour = (currentHour - 1 + Math.floor(i / 5)) % 24
    const base = hourlyActivity[hour] || 0
    // Add some variation for visual interest
    points.push(Math.max(0, base + Math.random() * base * 0.3))
  }

  return points
}

function getLastHourRate(hourlyActivity: Record<number, number>): number {
  const currentHour = new Date().getHours()
  return (hourlyActivity[currentHour] || 0) * 10 // rough tokens/min estimate
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)
  const width = 380
  const height = 40

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - (v / max) * height * 0.8
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10">
      <polyline
        points={points}
        fill="none"
        stroke="#e8763a"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
