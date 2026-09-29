import { ChevronDown, ChevronUp } from 'lucide-react'

/** The icon-badge row both "what did this cost" cards are built from, so a
 *  quote and a stock item read as one system. `sub` is the second line that
 *  carries the arithmetic behind the figure (tier, $/g, "8 × $6.00", …).
 *
 *  Lived as an identical private copy in QuoteDetailPage and StockDetail
 *  until the breakdown grew folds and the two started to drift. */
export function CostRow({ icon: Icon, label, chip, sub, value, tint, inset }: {
  icon: React.ElementType
  label: React.ReactNode
  /** A tag that belongs to the label but must not be truncated with it — the
   *  setting type, for instance. It can't just be rendered inside `label`:
   *  that line is `truncate`, i.e. overflow:hidden, which clips a pill's
   *  rounded edge and its ring. Kept as its own flex child so the text
   *  truncates and the tag stays whole. */
  chip?: React.ReactNode
  sub?: string
  value: string
  tint: string
  /** Reserves the width of a CostGroup's chevron, so a row that doesn't fold
   *  still lines its icon up with the ones that do. Set it on every row
   *  sitting alongside a fold; leave it off in cards that have none. */
  inset?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-slate-50">
      {inset && <span className="w-3.5 shrink-0" aria-hidden />}
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tint}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
          <span className="truncate">{label}</span>
          {chip}
        </span>
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
    return <CostRow icon={Icon} label={label} sub={sub} value={value} tint={tint} inset />
  }
  return (
    <>
      {/* The chevron leads the row rather than trailing the label: every fold
          then lines up in one column, and which rows open is legible without
          reading to the end of a label of some other length. Tailwind 3's
          preflight doesn't give buttons a pointer cursor, hence cursor-pointer
          spelled out — without it a clickable row hovers like dead text. */}
      <button type="button" onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-slate-50">
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tint}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-600">{label}</span>
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

// A stable colour per setting type, so "bezel" is the same shade on every
// row of every quote and the eye can group them without reading. Picked by
// hashing the name rather than from a hand-written map: the setter types
// come from a master table the shop edits, so any fixed map would go blank
// the moment someone adds one.
const CHIP_TINTS = [
  'bg-violet-50 text-violet-700 ring-violet-200',
  'bg-amber-50 text-amber-700 ring-amber-200',
  'bg-teal-50 text-teal-700 ring-teal-200',
  'bg-rose-50 text-rose-700 ring-rose-200',
  'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'bg-lime-50 text-lime-700 ring-lime-200',
]

/** The setting type, as a coloured pill. Deliberately text and not an icon:
 *  the icon set this app uses has nothing for pavé, bezel or channel, so any
 *  icon would be a shape assigned by guesswork — decoration that reads like
 *  information. The name is unambiguous; the colour does the grouping. */
export function SetterChip({ label }: { label: string }) {
  if (!label) return null
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  const tint = CHIP_TINTS[hash % CHIP_TINTS.length]
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${tint}`}>
      {label}
    </span>
  )
}
