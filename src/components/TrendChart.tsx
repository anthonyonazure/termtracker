import { BarChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts'
import { formatTokens, totalTokenCount } from '../lib/parser'

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
}

interface Props {
  dailyStats: DailyStats[]
}

export function TrendChart({ dailyStats }: Props) {
  // Last 14 days
  const today = new Date()
  const fourteenDaysAgo = new Date(today)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13)

  const dateRange: string[] = []
  for (let d = new Date(fourteenDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
    dateRange.push(d.toISOString().slice(0, 10))
  }

  const statsMap = new Map(dailyStats.map((d) => [d.date, d]))

  const chartData = dateRange.map((date) => {
    const day = statsMap.get(date)
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)
    return {
      date,
      label: dayOfWeek,
      messages: day?.messageCount || 0,
      tokens: day ? totalTokenCount(day.tokens) : 0,
    }
  })

  // Aggregate stats for the 14-day period
  const totalMsgs = chartData.reduce((s, d) => s + d.messages, 0)
  const activeDays = chartData.filter((d) => d.messages > 0).length
  const avgMsgs = activeDays > 0 ? Math.round(totalMsgs / activeDays) : 0
  const totalToks = chartData.reduce((s, d) => s + d.tokens, 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white font-medium text-sm">14-Day Trend ⌄</span>
        <div className="flex items-center gap-3">
          <span className="stat-pill">
            <span className="w-2 h-2 rounded-sm bg-orange-400 inline-block" /> msgs
          </span>
          <span className="stat-pill">
            <span className="w-2 h-0.5 bg-cyan-400 inline-block" /> tokens
          </span>
        </div>
      </div>

      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#666' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="msgs"
              tick={{ fontSize: 9, fill: '#444' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatTokens(v)}
            />
            <YAxis
              yAxisId="tokens"
              orientation="right"
              tick={false}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#333',
                border: 'none',
                borderRadius: 8,
                fontSize: 11,
                color: '#fff',
              }}
              formatter={(value: any, name: any) => [
                name === 'messages' ? value.toLocaleString() : formatTokens(value),
                name === 'messages' ? 'Messages' : 'Tokens',
              ]}
              labelFormatter={(label: any, payload: any) => {
                if (payload?.[0]?.payload?.date) {
                  return new Date(payload[0].payload.date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
                }
                return label
              }}
            />
            <Bar yAxisId="msgs" dataKey="messages" fill="#e8763a" radius={[3, 3, 0, 0]} barSize={20} />
            <Line
              yAxisId="tokens"
              type="monotone"
              dataKey="tokens"
              stroke="#38bdf8"
              strokeWidth={1.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Summary row */}
      <div className="flex gap-3 mt-2 pt-2 border-t border-white/5">
        <span className="text-[11px] text-gray-500 flex items-center gap-1.5">
          ○ {avgMsgs.toLocaleString()} msgs/day
        </span>
        <span className="text-[11px] text-gray-500 flex items-center gap-1.5">
          Σ {formatTokens(totalMsgs)} total msgs
        </span>
        <span className="text-[11px] text-gray-500 flex items-center gap-1.5">
          # {formatTokens(totalToks)} tokens
        </span>
      </div>
    </div>
  )
}
