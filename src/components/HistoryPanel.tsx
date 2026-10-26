import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { HistoryStepSummary } from '@/lib/historyStack'

interface HistoryPanelProps {
  /** Every recorded step, oldest first — `summarizeHistory(history)`. */
  steps: HistoryStepSummary[]
  /** Which step the design is currently showing. */
  currentIndex: number
  onJump: (index: number) => void
  onClose: () => void
}

/** Matrix's parametric history, as a panel you click into rather than a
 *  pair of undo/redo arrows you tap repeatedly. Read top to bottom it is
 *  the build sequence — the same direction Matrix's own tree reads — with
 *  the step on screen highlighted and anything after it dimmed, since
 *  those are the steps a new edit from here would discard.
 *
 *  Deliberately a floating panel over the viewport rather than a docked
 *  column: this page's layout is a fixed three-column grid, and carving a
 *  real dock out of it is a layout change this feature does not need. */
export function HistoryPanel({ steps, currentIndex, onJump, onClose }: HistoryPanelProps) {
  const currentRef = useRef<HTMLButtonElement | null>(null)

  // Keep the step on screen visible as undo/redo moves it — otherwise the
  // highlight walks off the top of a long list and the panel looks stuck.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentIndex])

  return (
    <div className="absolute right-3 top-14 z-20 flex max-h-[min(26rem,60%)] w-64 flex-col overflow-hidden rounded-xl bg-slate-900/90 text-white shadow-lg backdrop-blur">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">History</span>
        <button type="button" onClick={onClose} title="Close history"
          className="rounded-lg p-0.5 text-slate-300 transition hover:bg-white/10 hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {steps.length === 0 ? (
        <p className="px-3 py-3 text-[11px] text-slate-400">
          No steps yet. Change anything and it lands here.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto py-1">
          {steps.map(step => {
            const isCurrent = step.index === currentIndex
            const isFuture = step.index > currentIndex
            return (
              <li key={step.index}>
                <button type="button" ref={isCurrent ? currentRef : undefined}
                  onClick={() => onJump(step.index)}
                  title={step.changed.length > 1 ? `Changed: ${step.changed.join(', ')}` : undefined}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[11px] transition ${
                    isCurrent
                      ? 'bg-amber-400 font-semibold text-slate-900'
                      : isFuture
                        ? 'text-slate-500 hover:bg-white/10 hover:text-slate-300'
                        : 'text-slate-200 hover:bg-white/10'
                  }`}>
                  <span className={`w-4 shrink-0 text-right tabular-nums ${isCurrent ? 'text-slate-700' : 'text-slate-500'}`}>
                    {step.index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{step.label}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <p className="shrink-0 border-t border-white/10 px-3 py-1.5 text-[10px] leading-snug text-slate-400">
        Click any step to go back to it. Editing from there drops the dimmed ones.
      </p>
    </div>
  )
}
