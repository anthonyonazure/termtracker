import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatTokens, totalTokenCount, formatModelName } from '../lib/parser'
import { loadSettings, getActivePlan } from '../lib/settings'

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

export function CostsTab({ dailyStats, modelUsage, projects }: Props) {
  const settings = loadSettings()
  const plan = getActivePlan(settings)
  const limit = plan.effectiveOutputLimit

  // Daily output token chart — last 14 days
  const today = new Date()
  const fourteenDaysAgo = new Date(today)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)

  const dateRange: string[] = []
  for (let d = new Date(fourteenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
    dateRange.push(d.toISOString().slice(0, 10))
  }

  const statsMap = new Map(dailyStats.map((d) => [d.date, d]))

  const dailyOutputData = dateRange.map((date) => {
    const day = statsMap.get(date)
    const output = day ? day.tokens.outputTokens : 0
    const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)
    return { date, label, output }
  })

  // This billing cycle output tokens
  const billingDay = settings.billingDay
  const now = new Date()
  let cycleStart: Date
  if (now.getDate() >= billingDay) {
    cycleStart = new Date(now.getFullYear(), now.getMonth(), billingDay)
  } else {
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, billingDay)
  }
  const cycleStartStr = cycleStart.toISOString().slice(0, 10)

  let cycleOutput = 0
  let cycleTotal = 0
  let cycleDays = 0
  for (const day of dailyStats) {
    if (day.date >= cycleStartStr) {
      cycleOutput += day.tokens.outputTokens
      cycleTotal += totalTokenCount(day.tokens)
      if (day.messageCount > 0) cycleDays++
    }
  }

  const usagePct = limit > 0 ? (cycleOutput / limit) * 100 : 0
  const dailyAvgOutput = cycleDays > 0 ? cycleOutput / cycleDays : 0
  const remaining = Math.max(0, limit - cycleOutput)

  // Output by model
  const modelOutput = Object.entries(modelUsage)
    .map(([model, usage]) => ({
      model,
      displayName: formatModelName(model),
      color: getModelColor(model),
      output: usage.outputTokens,
      total: totalTokenCount(usage),
    }))
    .sort((a, b) => b.output - a.output)

  const totalOutput = modelOutput.reduce((sum, m) => sum + m.output, 0)

  // Top projects by output tokens
  const projectsByOutput = [...projects].sort((a, b) => b.tokens.outputTokens - a.tokens.outputTokens).slice(0, 8)
  const maxProjectOutput = projectsByOutput.length > 0 ? projectsByOutput[0].tokens.outputTokens : 1

  return (
    <div className="mt-3 space-y-2.5">
      {/* Plan usage header */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white font-medium text-sm">Billing Cycle Usage</span>
          <span className="text-gray-500 text-[11px]">{plan.label} {plan.price}</span>
        </div>

        {/* Usage bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xl font-bold text-orange-400">{Math.round(usagePct)}%</span>
            <span className="text-xs text-gray-500">
              {formatTokens(cycleOutput)} / {formatTokens(limit)} output
            </span>
          </div>
          <div className="progress-bar">
            <div className="h-full rounded-full" style={{
              width: `${Math.min(100, usagePct)}%`,
              backgroundColor: usagePct > 90 ? '#ef4444' : usagePct > 70 ? '#f59e0b' : '#4ade80',
            }} />
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-sm font-bold text-white">{formatTokens(remaining)}</div>
            <div className="text-[10px] text-gray-500">remaining</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-white">{formatTokens(dailyAvgOutput)}</div>
            <div className="text-[10px] text-gray-500">daily avg output</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-white">{formatTokens(cycleTotal)}</div>
            <div className="text-[10px] text-gray-500">total tokens</div>
          </div>
        </div>
      </div>

      {/* Daily output chart */}
      <div className="card">
        <div className="text-xs text-gray-400 font-medium mb-2">Daily Output Tokens (14d)</div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyOutputData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#666' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 9, fill: '#444' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatTokens(v)}
              />
              <Tooltip
                contentStyle={{ background: '#333', border: 'none', borderRadius: 8, fontSize: 11, color: '#fff' }}
                formatter={(value: any) => [formatTokens(Number(value)), 'Output']}
                labelFormatter={(_: any, payload: any) => {
                  if (payload?.[0]?.payload?.date) {
                    return new Date(payload[0].payload.date + 'T12:00:00').toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })
                  }
                  return ''
                }}
              />
              <Bar dataKey="output" fill="#e8763a" radius={[3, 3, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Output by model */}
      <div className="card">
        <div className="text-xs text-gray-400 font-medium mb-2">Output by Model</div>
        <div className="space-y-2">
          {modelOutput.map((m) => (
            <div key={m.model}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="text-xs text-gray-300">{m.displayName}</span>
                </div>
                <span className="text-xs font-medium text-white">{formatTokens(m.output)}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-gray-600 ml-4">
                <span>{formatTokens(m.total)} total</span>
                <span>{totalOutput > 0 ? ((m.output / totalOutput) * 100).toFixed(0) : 0}% of output</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Projects by output */}
      <div className="card">
        <div className="text-xs text-gray-400 font-medium mb-2">Top Projects by Output</div>
        <div className="space-y-2">
          {projectsByOutput.map((p) => (
            <div key={p.project}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-300 truncate mr-2">{p.displayName}</span>
                <span className="text-xs font-medium text-white flex-shrink-0">{formatTokens(p.tokens.outputTokens)}</span>
              </div>
              <div className="progress-bar" style={{ height: 4 }}>
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${(p.tokens.outputTokens / maxProjectOutput) * 100}%`,
                    backgroundColor: '#e8763a',
                  }}
                />
              </div>
              <div className="flex items-center gap-3 text-[10px] text-gray-600 mt-0.5">
                <span>{p.sessionCount} sessions</span>
                <span>{formatTokens(totalTokenCount(p.tokens))} total tokens</span>
              </div>
            </div>
          ))}
          {projectsByOutput.length === 0 && (
            <div className="text-center text-gray-600 text-xs py-4">No project data</div>
          )}
        </div>
      </div>

      {/* Explanation */}
      <div className="rounded-lg px-3 py-2 text-[10px] text-gray-600" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
        Output tokens count against your {plan.label} plan limit ({formatTokens(limit)}/month).
        Change your plan in Settings.
      </div>
    </div>
  )
}
