import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatTokens, formatCost, totalTokenCount, formatModelName, estimateCost } from '../lib/parser'

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

interface Props {
  dailyStats: DailyStats[]
  modelUsage: Record<string, TokenUsage>
  projects: ProjectData[]
  totalCost: number
}

function getModelColor(model: string): string {
  if (model.includes('opus')) return '#e8763a'
  if (model.includes('sonnet')) return '#38bdf8'
  if (model.includes('haiku')) return '#22d3ee'
  return '#888'
}

export function CostsTab({ dailyStats, modelUsage, projects, totalCost }: Props) {
  // Daily cost chart — last 14 days
  const today = new Date()
  const fourteenDaysAgo = new Date(today)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)

  const dateRange: string[] = []
  for (let d = new Date(fourteenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
    dateRange.push(d.toISOString().slice(0, 10))
  }

  const statsMap = new Map(dailyStats.map((d) => [d.date, d]))

  const dailyCostData = dateRange.map((date) => {
    const day = statsMap.get(date)
    let cost = 0
    if (day) {
      for (const [model, usage] of Object.entries(day.modelBreakdown)) {
        cost += estimateCost(model, usage)
      }
    }
    const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)
    return { date, label, cost }
  })

  // Cost by model
  const modelCosts = Object.entries(modelUsage)
    .map(([model, usage]) => ({
      model,
      displayName: formatModelName(model),
      color: getModelColor(model),
      cost: estimateCost(model, usage),
      tokens: totalTokenCount(usage),
      output: usage.outputTokens,
    }))
    .sort((a, b) => b.cost - a.cost)

  // Top projects by cost
  const topProjects = projects.slice(0, 8)
  const maxProjectCost = topProjects.length > 0 ? topProjects[0].costUSD : 1

  // This month
  const monthStr = new Date().toISOString().slice(0, 7)
  const monthStats = dailyStats.filter((d) => d.date.startsWith(monthStr))
  let monthCost = 0
  for (const day of monthStats) {
    for (const [model, usage] of Object.entries(day.modelBreakdown)) {
      monthCost += estimateCost(model, usage)
    }
  }

  return (
    <div className="mt-3 space-y-2.5">
      {/* Summary */}
      <div className="card">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-white">{formatCost(totalCost)}</div>
            <div className="text-[10px] text-gray-500">all-time est.</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">{formatCost(monthCost)}</div>
            <div className="text-[10px] text-gray-500">this month</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">
              {formatCost(monthStats.length > 0 ? monthCost / monthStats.filter((d) => d.messageCount > 0).length || 0 : 0)}
            </div>
            <div className="text-[10px] text-gray-500">daily avg</div>
          </div>
        </div>
      </div>

      {/* Daily spend chart */}
      <div className="card">
        <div className="text-xs text-gray-400 font-medium mb-2">Daily Spend (14d)</div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyCostData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#666' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 9, fill: '#444' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{ background: '#333', border: 'none', borderRadius: 8, fontSize: 11, color: '#fff' }}
                formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Cost']}
                labelFormatter={(_: any, payload: any) => {
                  if (payload?.[0]?.payload?.date) {
                    return new Date(payload[0].payload.date + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })
                  }
                  return ''
                }}
              />
              <Bar dataKey="cost" fill="#e8763a" radius={[3, 3, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost by model */}
      <div className="card">
        <div className="text-xs text-gray-400 font-medium mb-2">Cost by Model</div>
        <div className="space-y-2">
          {modelCosts.map((m) => (
            <div key={m.model}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="text-xs text-gray-300">{m.displayName}</span>
                </div>
                <span className="text-xs font-medium text-white">{formatCost(m.cost)}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-gray-600 ml-4">
                <span>{formatTokens(m.tokens)} total</span>
                <span>{formatTokens(m.output)} output</span>
                <span>{totalCost > 0 ? ((m.cost / totalCost) * 100).toFixed(0) : 0}% of spend</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost by project */}
      <div className="card">
        <div className="text-xs text-gray-400 font-medium mb-2">Top Projects by Cost</div>
        <div className="space-y-2">
          {topProjects.map((p) => (
            <div key={p.project}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300 truncate mr-2">{p.displayName}</span>
                <span className="text-xs font-medium text-white flex-shrink-0">{formatCost(p.costUSD)}</span>
              </div>
              {/* Cost bar */}
              <div className="progress-bar" style={{ height: 4 }}>
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${(p.costUSD / maxProjectCost) * 100}%`,
                    backgroundColor: '#e8763a',
                  }}
                />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-gray-600 mt-0.5">
                <span>{p.sessionCount} sessions</span>
                <span>{formatTokens(totalTokenCount(p.tokens))} tokens</span>
              </div>
            </div>
          ))}
          {topProjects.length === 0 && (
            <div className="text-center text-gray-600 text-xs py-4">No project data</div>
          )}
        </div>
      </div>
    </div>
  )
}
