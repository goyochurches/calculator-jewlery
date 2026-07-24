import { useCallback, useEffect, useRef } from 'react'
import { createTour, type TourStep } from '@/lib/tour'

const seenKey = (id: string) => `tour-seen:${id}`

export function hasTourSeen(id: string) {
  return localStorage.getItem(seenKey(id)) === 'true'
}

export function markTourSeen(id: string) {
  localStorage.setItem(seenKey(id), 'true')
}

/**
 * Auto-starts a driver.js walkthrough the first time this browser visits a
 * page, then never again (flag lives in localStorage, keyed by `id`).
 * Returns `replay()` to re-open it on demand — e.g. a "Replay tour" button —
 * which always shows regardless of the seen flag.
 */
export function useTourOnce(id: string, steps: TourStep[], opts?: { enabled?: boolean; delay?: number }) {
  const enabled = opts?.enabled ?? true
  const delay = opts?.delay ?? 600
  // Kept in a ref (not a dependency) so re-renders that recreate the steps
  // array don't reset the auto-start timer or replay the tour. Synced in an
  // effect (not during render) — refs aren't meant to be written mid-render.
  const stepsRef = useRef(steps)
  useEffect(() => {
    stepsRef.current = steps
  })

  useEffect(() => {
    if (!enabled || hasTourSeen(id)) return

    const t = setTimeout(() => {
      const currentSteps = stepsRef.current
      if (currentSteps.length === 0) return
      // Skip silently if a target hasn't rendered yet, or is hidden (e.g. a
      // sidebar collapsed under `hidden lg:block` on a small screen) —
      // better to say nothing than to point at empty space.
      const allPresent = currentSteps.every((s) => {
        if (typeof s.element !== 'string') return true
        const el = document.querySelector(s.element)
        return !!el && (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetHeight > 0
      })
      if (!allPresent) return
      markTourSeen(id)
      createTour(currentSteps).drive()
    }, delay)

    return () => clearTimeout(t)
  }, [id, enabled, delay])

  const replay = useCallback(() => {
    createTour(stepsRef.current).drive()
  }, [])

  return { replay }
}
