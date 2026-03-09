interface HeaderProps {
  tab: string
  onTabChange: (tab: any) => void
  onRefresh: () => void
  onSettings?: () => void
}

export function Header({ tab, onTabChange, onRefresh, onSettings }: HeaderProps) {
  return (
    <div>
      {/* Title bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">{'>'}_</span>
          <span className="font-semibold text-sm text-white">TermTracker</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs px-2 py-1 rounded hover:bg-white/5"
            title="Refresh"
          >
            ↻
          </button>
          {onSettings && (
            <button
              onClick={onSettings}
              className="text-gray-500 hover:text-gray-300 transition-colors text-xs px-2 py-1 rounded hover:bg-white/5"
              title="Settings"
            >
              ⚙
            </button>
          )}
          <button
            onClick={() => window.close()}
            className="text-gray-500 hover:text-red-400 transition-colors w-5 h-5 flex items-center justify-center rounded hover:bg-white/5"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        {(['usage', 'sessions', 'costs'] as const).map((t) => (
          <div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => onTabChange(t)}>
            {t === 'usage' && '▐▌ Usage'}
            {t === 'sessions' && '⊞ Sessions'}
            {t === 'costs' && '$ Costs'}
          </div>
        ))}
      </div>
    </div>
  )
}
