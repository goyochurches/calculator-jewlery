/** Adds/removes a key from a Set, returning a new Set — the update both cost
 *  breakdowns use for the groups the reader has folded away.
 *
 *  Lives here rather than beside the CostGroup component because a file that
 *  exports components must export nothing else, or Fast Refresh stops working
 *  for it (react-refresh/only-export-components). */
export function toggleInSet(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}
