import { X } from 'lucide-react'
import { useEffect } from 'react'
import type { CompareStoneType, StoneTypeComparison, StoneTypeOption } from '@/lib/stoneTypeCompare'

interface StoneTypeCompareDialogProps {
  open: boolean
  comparison: StoneTypeComparison | null
  current: CompareStoneType
  carats: number
  /** Stone label for the header, e.g. "Main stone #1". */
  title?: string
  onPick: (stoneType: CompareStoneType) => void
  onClose: () => void
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

/**
 * Natural vs Lab popup for a single stone. Shows the same physical stone priced
 * both ways and lets the jeweler pick the option that suits the customer. The
 * "cheaper" badge only shows when both sides are priced from the tables.
 */
export function StoneTypeCompareDialog({
  open,
  comparison,
  current,
  carats,
  title,
  onPick,
  onClose,
}: StoneTypeCompareDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = original
    }
  }, [open, onClose])

  if (!open || !comparison) return null

  // Why the two sides aren't an even comparison, for the footnote:
  //  · exactly one side has a table row  → uneven (the other can't be priced)
  //  · neither/both have rows but still not comparable → a custom/manual price
  //    fixes the cost, so the type is only a label here.
  const oneSideMissing = comparison.natural.hasRow !== comparison.lab.hasRow

  const renderCard = (opt: StoneTypeOption) => {
    const isSel = current === opt.stoneType
    const isCheaper = comparison.cheaper === opt.stoneType
    // Pickable when there's a table row to price from, or when a manual/custom
    // price already fixes the cost (then the type is just a label).
    const pickable = opt.hasRow || !comparison.comparable
    return (
      <button
        key={opt.stoneType}
        type="button"
        disabled={!pickable}
        onClick={() => { onPick(opt.stoneType); onClose() }}
        className={`flex-1 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isSel
            ? 'border-slate-900 bg-white ring-1 ring-slate-900'
            : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900">{opt.label}</span>
          {isSel
            ? <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold text-white">USING</span>
            : isCheaper && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">CHEAPER</span>}
        </div>

        {opt.hasRow ? (
          <>
            <p className="mt-2 text-[11px] text-slate-500">{opt.sizeLabel}</p>
            <p className="text-[11px] text-slate-500">
              {carats > 0 ? `${carats}ct × ${money(opt.pricePerCarat)}/ct` : `${money(opt.pricePerCarat)}/ct`}
            </p>
            <dl className="mt-2 space-y-0.5 text-[11px] text-slate-500">
              <div className="flex justify-between gap-3">
                <dt>Stone</dt>
                <dd className="tabular-nums">{money(opt.stoneCost)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Setting</dt>
                <dd className="tabular-nums">{money(opt.settingLabor)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-base font-semibold tabular-nums text-slate-900">{money(opt.total)}</p>
          </>
        ) : comparison.comparable === false && opt.stoneCost > 0 ? (
          <>
            <p className="mt-2 text-[11px] text-slate-500">Custom price</p>
            <p className="mt-2 text-base font-semibold tabular-nums text-slate-900">{money(opt.total)}</p>
          </>
        ) : (
          <p className="mt-2 text-[11px] text-amber-700">No price for this size in {opt.label}.</p>
        )}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stone-compare-title"
    >
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.15)]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pt-6 pb-2">
          <h2 id="stone-compare-title" className="text-lg font-semibold tracking-tight text-slate-950">
            Natural vs Lab
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {title ? `${title} — ` : ''}same stone priced both ways. Tap one to use it.
          </p>
        </div>

        <div className="px-6 pb-6 pt-3">
          <div className="flex gap-3">
            {renderCard(comparison.natural)}
            {renderCard(comparison.lab)}
          </div>

          {!comparison.comparable && (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              {oneSideMissing
                ? 'One of the two types has no price for this size, so this isn’t an even comparison.'
                : 'This stone uses a custom price, so Natural and Lab cost the same here — picking only changes the label.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
