import { formatTokens, formatCost, totalTokenCount, formatModelName } from '../lib/parser'

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

interface SessionData {
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

interface Props {
  sessions: SessionData[]
}

function getProjectName(project: string): string {
  const parts = project.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || parts[parts.length - 2] || project
}

function formatDuration(start: string, end: string): string {
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 0) return '—'
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    if (hours < 24) return `${hours}h ${remMins}m`
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
  } catch {
    return '—'
  }
}

function formatTimeAgo(timestamp: string): string {
  try {
    const ms = Date.now() - new Date(timestamp).getTime()
    const mins = Math.floor(ms / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

// Model color dot
function getModelColor(model: string): string {
  if (model.includes('opus')) return '#e8763a'
  if (model.includes('sonnet')) return '#38bdf8'
  if (model.includes('haiku')) return '#22d3ee'
  return '#888'
}

export function SessionsTab({ sessions }: Props) {
  // Show most recent 50 sessions
  const recent = sessions.slice(0, 50)

  // Summary stats
  const todayStr = new Date().toISOString().slice(0, 10)
  const todaySessions = sessions.filter((s) => s.endTime.startsWith(todayStr))
  const activeLast1h = sessions.filter((s) => {
    try { return Date.now() - new Date(s.endTime).getTime() < 3600000 } catch { return false }
  })

  return (
    <div className="mt-3 space-y-2.5">
      {/* Summary */}
      <div className="card">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-white">{activeLast1h.length}</div>
            <div className="text-[10px] text-gray-500">last hour</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">{todaySessions.length}</div>
            <div className="text-[10px] text-gray-500">today</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-white">{sessions.length}</div>
            <div className="text-[10px] text-gray-500">total</div>
          </div>
        </div>
      </div>

      {/* Session list */}
      <div className="card p-0">
        <div className="px-3 py-2 border-b border-white/5">
          <span className="text-xs text-gray-400 font-medium">Recent Sessions</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {recent.map((session) => (
            <SessionRow key={session.sessionId} session={session} />
          ))}
          {recent.length === 0 && (
            <div className="px-3 py-6 text-center text-gray-600 text-xs">No sessions found</div>
          )}
        </div>
      </div>
    </div>
  )
}

function SessionRow({ session }: { session: SessionData }) {
  const tokens = totalTokenCount(session.tokens)
  const projectName = getProjectName(session.project)

  return (
    <div className="px-3 py-2.5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
      {/* Row 1: Project name + time */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium text-white truncate">{projectName}</span>
          {/* Model dots */}
          <div className="flex gap-0.5 flex-shrink-0">
            {session.models.map((m, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: getModelColor(m) }}
                title={formatModelName(m)}
              />
            ))}
          </div>
        </div>
        <span className="text-[10px] text-gray-600 flex-shrink-0 ml-2">
          {formatTimeAgo(session.endTime)}
        </span>
      </div>

      {/* Row 2: Stats */}
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span>{session.messageCount} msgs</span>
        <span>{session.toolCallCount} tools</span>
        <span>{formatTokens(tokens)} tokens</span>
        <span>{formatDuration(session.startTime, session.endTime)}</span>
        <span className="ml-auto text-gray-600">{formatCost(session.costUSD)}</span>
      </div>
    </div>
  )
}
