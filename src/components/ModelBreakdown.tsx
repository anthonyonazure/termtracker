import { formatTokens, formatModelName, totalTokenCount } from '../lib/parser'

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

interface Props {
  modelUsage: Record<string, TokenUsage>
}

// Model colors
const MODEL_COLORS: Record<string, string> = {
  opus: '#e8763a',
  sonnet: '#38bdf8',
  haiku: '#22d3ee',
}

function getModelColor(model: string): string {
  if (model.includes('opus')) return MODEL_COLORS.opus
  if (model.includes('sonnet')) return MODEL_COLORS.sonnet
  if (model.includes('haiku')) return MODEL_COLORS.haiku
  return '#888'
}

export function ModelBreakdown({ modelUsage }: Props) {
  const models = Object.entries(modelUsage)
    .map(([model, usage]) => ({
      model,
      displayName: formatModelName(model),
      color: getModelColor(model),
      total: totalTokenCount(usage),
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cacheReadTokens,
      cacheWrite: usage.cacheWriteTokens,
    }))
    .sort((a, b) => b.total - a.total)

  const grandTotal = models.reduce((s, m) => s + m.total, 0)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-white font-medium text-sm">Models</span>
        <span className="text-gray-500 text-xs">{formatTokens(grandTotal)}</span>
      </div>

      {/* Stacked bar */}
      <div className="progress-bar mb-3" style={{ height: 8 }}>
        <div className="flex h-full">
          {models.map((m, i) => (
            <div
              key={i}
              className="progress-segment"
              style={{
                width: grandTotal > 0 ? `${(m.total / grandTotal) * 100}%` : '0%',
                backgroundColor: m.color,
              }}
            />
          ))}
        </div>
      </div>

      {/* Model list */}
      <div className="space-y-2">
        {models.map((m) => (
          <div key={m.model} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
              <span className="text-xs text-gray-300">{m.displayName}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-500">
                {formatTokens(m.input + m.cacheRead + m.cacheWrite)}{' '}
                <span className="text-gray-600">in</span>
              </span>
              <span className="font-medium text-white">
                {formatTokens(m.output)}{' '}
                <span className="text-gray-600">out</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
