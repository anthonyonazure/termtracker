import { useState } from 'react'
import { type Settings, PLAN_TIERS, loadSettings, saveSettings } from '../lib/settings'
import { formatTokens } from '../lib/parser'

interface Props {
  onClose: () => void
  onSave: (settings: Settings) => void
}

export function SettingsPanel({ onClose, onSave }: Props) {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  function handlePlanChange(planId: string) {
    setSettings((s) => ({ ...s, planId }))
  }

  function handleSave() {
    saveSettings(settings)
    onSave(settings)
    onClose()
  }

  const selectedPlan = PLAN_TIERS.find((p) => p.id === settings.planId)

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-4">
        <span className="text-white font-medium text-sm">Settings</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded hover:bg-white/5"
        >
          Back
        </button>
      </div>

      {/* Plan selection */}
      <div className="card mb-3">
        <div className="text-xs text-gray-400 mb-2 font-medium">Subscription Plan</div>
        <div className="space-y-1">
          {PLAN_TIERS.map((plan) => (
            <button
              key={plan.id}
              onClick={() => handlePlanChange(plan.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                settings.planId === plan.id
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: settings.planId === plan.id ? '#e8763a' : '#555',
                  }}
                />
                <span className="font-medium">{plan.label}</span>
                <span className="text-gray-600">{plan.price}</span>
              </div>
              {plan.id !== 'custom' && (
                <span className="text-gray-600">~{formatTokens(plan.outputTokens)} out/mo</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Custom limit */}
      {settings.planId === 'custom' && (
        <div className="card mb-3">
          <div className="text-xs text-gray-400 mb-2 font-medium">Custom Output Token Limit</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={settings.customOutputLimit}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  customOutputLimit: Math.max(0, parseInt(e.target.value) || 0),
                }))
              }
              className="flex-1 bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-orange-500/50"
              placeholder="e.g. 45000000"
            />
            <span className="text-[10px] text-gray-500">tokens</span>
          </div>
          <div className="text-[10px] text-gray-600 mt-1">
            = {formatTokens(settings.customOutputLimit)} output tokens per month
          </div>
        </div>
      )}

      {/* Billing day */}
      <div className="card mb-3">
        <div className="text-xs text-gray-400 mb-2 font-medium">Billing Cycle Start Day</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={28}
            value={settings.billingDay}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                billingDay: Math.max(1, Math.min(28, parseInt(e.target.value) || 1)),
              }))
            }
            className="w-16 bg-surface-hover border border-surface-border rounded-lg px-3 py-2 text-xs text-white text-center outline-none focus:border-orange-500/50"
          />
          <span className="text-xs text-gray-500">of each month</span>
        </div>
        <div className="text-[10px] text-gray-600 mt-1">
          Day your subscription renews (1-28)
        </div>
      </div>

      {/* Disclaimer */}
      <div className="card mb-3">
        <div className="text-[10px] text-gray-600 leading-relaxed">
          Token limits are community-observed estimates, not official Anthropic numbers.
          Actual limits may vary. Claude Max uses rate limiting rather than hard caps —
          you may experience slowdowns rather than a hard cutoff.
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors rounded-lg px-4 py-2.5 text-xs font-medium"
      >
        Save Settings
      </button>
    </div>
  )
}
