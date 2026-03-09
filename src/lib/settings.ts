/**
 * Persistent settings stored in localStorage
 */

export interface PlanTier {
  id: string
  label: string
  price: string
  outputTokens: number
}

export const PLAN_TIERS: PlanTier[] = [
  { id: 'pro', label: 'Pro', price: '$20/mo', outputTokens: 9_000_000 },
  { id: 'max5x', label: 'Max 5×', price: '$100/mo', outputTokens: 45_000_000 },
  { id: 'max20x', label: 'Max 20×', price: '$200/mo', outputTokens: 180_000_000 },
  { id: 'team', label: 'Team', price: '$25/user/mo', outputTokens: 15_000_000 },
  { id: 'enterprise', label: 'Enterprise', price: 'Custom', outputTokens: 50_000_000 },
  { id: 'custom', label: 'Custom', price: 'Custom', outputTokens: 0 },
]

export interface Settings {
  planId: string
  customOutputLimit: number  // used when planId === 'custom'
  billingDay: number         // day of month billing resets (1-28)
}

const STORAGE_KEY = 'termtracker-settings'

const DEFAULTS: Settings = {
  planId: 'max5x',
  customOutputLimit: 45_000_000,
  billingDay: 1,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULTS, ...parsed }
    }
  } catch {}
  return { ...DEFAULTS }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getActivePlan(settings: Settings): PlanTier & { effectiveOutputLimit: number } {
  const plan = PLAN_TIERS.find((p) => p.id === settings.planId) || PLAN_TIERS[1]
  const effectiveOutputLimit =
    settings.planId === 'custom' ? settings.customOutputLimit : plan.outputTokens
  return { ...plan, effectiveOutputLimit }
}
