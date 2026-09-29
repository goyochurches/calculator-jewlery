import { ChevronDown, ChevronUp } from 'lucide-react'

/** The icon-badge row both "what did this cost" cards are built from, so a
 *  quote and a stock item read as one system. `sub` is the second line that
 *  carries the arithmetic behind the figure (tier, $/g, "8 × $6.00", …).
 *
 *  Lived as an identical private copy in QuoteDetailPage and StockDetail
 *  until the breakdown grew folds and the two started to drift. */
export function CostRow({ icon: Icon, label, sub, value, tint }: {
  icon: React.ElementType
  label: React.ReactNode
  sub?: string
  value: string
  tint: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-slate-50">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tint}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-600">{label}</span>
        {sub && <span className="block truncate text-[11px] text-slate-400">{sub}</span>}
      </span>
      <span className="shrink-0 tabular-nums text-sm font-semibold text-slate-900">{value}</span>
    </div>
  )
}

export function CostGroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-4 px-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 first:mt-0">{children}</p>
}

/** A cost line that opens to show what it is made of. Rendering every stone
 *  inline buries the handful of figures the card exists to show once a piece
 *  has seventy of them in it. Groups open by default — the detail is what a
 *  jeweler checking a price is after — and fold away when a long list is in
 *  the way.
 *
 *  The detail sits in a rail of its own — indented behind a left border — so
 *  a stone can't be misread as another top-level cost, which is exactly what
 *  a flat list of rows made easy. A group with nothing to expand renders as
 *  a plain row rather than growing a chevron that does nothing. */
export function CostGroup({
  icon: Icon, label, sub, value, tint, detailCount, open, onToggle, children,
}: {
  icon: React.ElementType
  label: string
  sub?: string
  value: string
  tint: string
  detailCount: number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  if (detailCount === 0) {
    return <CostRow icon={Icon} label={label} sub={sub} value={value} tint={tint} />
  }
  return (
    <>
      <button type="button" onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm text-slate-600">
            <span className="truncate">{label}</span>
            {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          </span>
          {sub && <span className="block truncate text-[11px] text-slate-400">{sub}</span>}
        </span>
        <span className="shrink-0 tabular-nums text-sm font-semibold text-slate-900">{value}</span>
      </button>
      {open && (
        <div className="my-1 ml-6 border-l-2 border-slate-200 pl-2">
          {children}
        </div>
      )}
    </>
  )
}
