// ── Safe readers for the Claude Code JSONL logs ───────────────────────────
// The logs are written by another program and their shape is not ours to
// guarantee: a future Claude Code release can rename a field or change a type
// and this app must keep counting what it still understands rather than crash
// on the first surprising line. These readers pull one property at a time off
// `unknown` and fall back, so an unrecognised record degrades to zeros.
//
// Kept dependency-free on purpose: the Electron main process bundles this file
// too, so it must not reach for anything browser-only.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Walk a property path, stopping the moment the path stops existing. */
export function prop(value: unknown, ...path: string[]): unknown {
  let cur = value
  for (const key of path) {
    if (!isRecord(cur)) return undefined
    cur = cur[key]
  }
  return cur
}

/** A string property, or "" when absent or of another type. */
export function str(value: unknown, ...path: string[]): string {
  const v = prop(value, ...path)
  return typeof v === 'string' ? v : ''
}

/** A finite number property, or 0 — token counts are always additive. */
export function count(value: unknown, ...path: string[]): number {
  const v = prop(value, ...path)
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** An array property, or [] when absent or of another type. */
export function arr(value: unknown, ...path: string[]): unknown[] {
  const v = prop(value, ...path)
  return Array.isArray(v) ? v : []
}

/** Parse one JSONL line, returning null for anything that is not valid JSON. */
export function parseLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown
  } catch {
    return null
  }
}
