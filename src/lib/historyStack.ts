// Pure undo/redo history over serialized snapshots — kept separate from the
// React page so the stepping rules (debounced recording, pending edits,
// redo truncation) can be tested without a browser.

export interface HistoryState {
  stack: string[]
  index: number
}

export const EMPTY_HISTORY: HistoryState = { stack: [], index: -1 }
export const MAX_HISTORY = 100

/** Records `key` as a new step unless it equals the current one. Recording
 *  after an undo discards the redo branch (standard behavior). */
export function recordSnapshot(h: HistoryState, key: string): HistoryState {
  if (h.stack[h.index] === key) return h
  const stack = [...h.stack.slice(0, h.index + 1), key].slice(-MAX_HISTORY)
  return { stack, index: stack.length - 1 }
}

/** Moves one step back (-1) or forward (+1). A change made but not yet
 *  recorded (`currentKey` differs from the current step) is recorded first,
 *  so undo returns to it instead of skipping past it. `snapshot` is the
 *  state to apply, or null if there was nothing to step to. */
export function stepHistory(h: HistoryState, currentKey: string, dir: -1 | 1): { history: HistoryState; snapshot: string | null } {
  const base = h.stack[h.index] === currentKey ? h : recordSnapshot(h, currentKey)
  const target = base.index + dir
  if (target < 0 || target >= base.stack.length) return { history: base, snapshot: null }
  return { history: { stack: base.stack, index: target }, snapshot: base.stack[target] }
}

export const canUndoHistory = (h: HistoryState, currentKey: string) =>
  h.index > 0 || (h.index === 0 && h.stack[0] !== currentKey)
export const canRedoHistory = (h: HistoryState) => h.index < h.stack.length - 1

// ── History tree ────────────────────────────────────────────────────────────
// Matrix's own headline feature is a parametric history you can click into
// ("tracks each design step so you can edit any phase without rebuilding"),
// not just the linear undo/redo above. Every entry in `stack` is already a
// COMPLETE parameter snapshot, so jumping straight to one needs no extra
// bookkeeping — and because the model is a pure function of those
// parameters, jumping back and editing cannot leave stale downstream
// geometry the way an operation-based tree can.

/** Jumps straight to a step, the way clicking an earlier phase in Matrix's
 *  history does, instead of tapping undo until you arrive.
 *
 *  An uncommitted edit is recorded first, exactly as `stepHistory` does, so
 *  clicking back never silently throws away what you just changed — which
 *  does discard the redo branch, the same standard behavior recording after
 *  an undo already has. That record can also push the stack past
 *  MAX_HISTORY and shift every index down by one, so the caller's index is
 *  re-resolved against that shift rather than trusted; without it, clicking
 *  a step on a full 100-deep stack would land one step off. */
export function jumpToSnapshot(h: HistoryState, currentKey: string, targetIndex: number): { history: HistoryState; snapshot: string | null } {
  const pending = h.stack[h.index] !== currentKey
  const base = pending ? recordSnapshot(h, currentKey) : h
  const shift = pending ? Math.max(0, h.stack.slice(0, h.index + 1).length + 1 - MAX_HISTORY) : 0
  const target = targetIndex - shift
  if (!Number.isInteger(target) || target < 0 || target >= base.stack.length) return { history: base, snapshot: null }
  if (target === base.index) return { history: base, snapshot: null }
  return { history: { stack: base.stack, index: target }, snapshot: base.stack[target] }
}

/** Field names that do not read well when split from camelCase, or whose
 *  plain-English name differs from the state variable's. Everything not
 *  listed falls back to the automatic split below, so this stays short and
 *  the parameter set can keep growing without touching it. */
const STEP_LABEL_OVERRIDES: Record<string, string> = {
  fingerSize: 'Finger size',
  includePave: 'Pavé',
  paveSettingType: 'Side setting',
  paveCount: 'Pavé stones',
  paveStoneMm: 'Pavé stone size',
  settingType: 'Setting',
  bezelCoverage: 'Bezel coverage',
  stoneShape: 'Stone shape',
  caratWeight: 'Carat weight',
  diamondType: 'Diamond type',
  shankStyle: 'Shank',
  planAspect: 'Plan aspect',
  planSquareness: 'Plan squareness',
  backProfileOn: 'Back profile',
  mergeSolid: 'Merge to one solid',
  modelObjects: 'Modeled objects',
  customProfile: 'Custom profile',
  backProfile: 'Back profile shape',
  sideSpreadDeg: 'Side reach',
  cutStoneSeats: 'Stone seats',
  hollowShank: 'Hollow shank',
  pointDirection: 'Point direction',
  patternMotif: 'Pattern motif',
  bandText: 'Band text',
  engraveText: 'Engraving',
  ringLaborTierKey: 'Ring labor tier',
  setterTypeKey: 'Setting labor type',
}

/** "prongCount" → "Prong count", "widthMm" → "Width", "haloStoneMm" →
 *  "Halo stone". Trailing unit suffixes come off because the value's own
 *  formatting puts the unit back. An `include`/`is` prefix is dropped: the
 *  on/off reads from the value, so "Include halo on" would say it twice. */
function splitFieldName(key: string): string {
  const stripped = key
    .replace(/(Mm|Deg|Key)$/, '')
    .replace(/^(include|is)([A-Z])/, (_, __, c: string) => c.toLowerCase())
  const words = stripped.replace(/([A-Z])/g, ' $1').trim().split(/\s+/)
  if (words.length === 0 || words[0] === '') return key
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1).map(w => w.toLowerCase())].join(' ')
}

export const stepFieldLabel = (key: string): string => STEP_LABEL_OVERRIDES[key] ?? splitFieldName(key)

/** One parameter value, short enough to sit in a history row. Numbers keep
 *  their unit from the key's own suffix; booleans read as on/off rather
 *  than true/false; objects and arrays get a shape, not a dump, since a
 *  profile's nine samples or a list of modeled objects would swamp the row. */
export function stepValueLabel(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'none'
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  if (typeof value === 'number') {
    const unit = key.endsWith('Mm') ? 'mm' : key.endsWith('Deg') ? '°' : ''
    return `${Number.isInteger(value) ? value : Number(value.toFixed(2))}${unit}`
  }
  if (typeof value === 'string') return value === '' ? 'empty' : value
  if (Array.isArray(value)) return value.length === 1 ? '1 item' : `${value.length} items`
  return 'edited'
}

export interface HistoryStepSummary {
  /** Index into `HistoryState.stack`. */
  index: number
  /** One-line description of what this step changed, for the row. */
  label: string
  /** The parameter names this step changed, for a tooltip. Empty on the
   *  first step, which changed nothing — it IS the starting point. */
  changed: string[]
}

/** What changed between two snapshots, as a label for the later one.
 *
 *  Derived by diffing the two serialized parameter sets rather than asking
 *  every call site to pass a description — there are seventy-odd parameters
 *  and the set grows most sessions, so a label that is computed cannot fall
 *  out of date with the thing it names. A step that changes several
 *  parameters at once (loading a preset, or a command-bar word that sets a
 *  setting AND turns the stone on) names the first and counts the rest,
 *  which keeps the row one line. */
export function describeStep(previousKey: string | undefined, key: string): HistoryStepSummary['label'] | string {
  if (previousKey === undefined) return 'Starting point'
  let before: Record<string, unknown>, after: Record<string, unknown>
  try {
    before = JSON.parse(previousKey) as Record<string, unknown>
    after = JSON.parse(key) as Record<string, unknown>
  } catch {
    // A snapshot that is not parseable parameter JSON should not take the
    // panel down with it; the row still works as something to click.
    return 'Changed'
  }
  const changed = changedFields(before, after)
  if (changed.length === 0) return 'No change'
  const [first] = changed
  const head = `${stepFieldLabel(first)} ${stepValueLabel(first, after[first])}`
  return changed.length === 1 ? head : `${head} +${changed.length - 1} more`
}

/** Parameter names whose serialized values differ. Compared as JSON so
 *  nested profiles and object lists are handled without a deep-equal
 *  helper, and in a stable key order so a snapshot does not look changed
 *  just because two keys were written in a different order. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return keys.filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
}

/** The whole stack as rows for a history panel, oldest first. */
export function summarizeHistory(h: HistoryState): HistoryStepSummary[] {
  return h.stack.map((key, index) => {
    const previousKey = index === 0 ? undefined : h.stack[index - 1]
    let changed: string[] = []
    if (previousKey !== undefined) {
      try {
        changed = changedFields(
          JSON.parse(previousKey) as Record<string, unknown>,
          JSON.parse(key) as Record<string, unknown>,
        )
      } catch { changed = [] }
    }
    return { index, label: describeStep(previousKey, key), changed }
  })
}
