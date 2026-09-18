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
