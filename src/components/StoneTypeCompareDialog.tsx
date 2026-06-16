import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CompareStoneType, StoneTypeComparison, StoneTypeOption } from '@/lib/stoneTypeCompare'
import { configService } from '@/services/configService'

interface StoneTypeCompareDialogProps {
  open: boolean
  comparison: StoneTypeComparison | null
  current: CompareStoneType
  carats: number
  /** Stone label for the header, e.g. "Main stone #1". */
  title?: string
  /** The sizeKey of the current stone — used to pre-fill the Lab creation form. */
  sizeKey?: string
  /** Called after a new Lab diamond size is saved, so the parent can refresh config. */
  onCreatedLabSize?: () => void
  onPick: (stoneType: CompareStoneType) => void
  onClose: () => void
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400'

/**
 * Natural vs Lab popup for a single stone. Shows the same physical stone priced
 * both ways and lets the jeweler pick the option that suits the customer. When
 * the Lab side has no price row yet, an inline form lets the user create it
 * without leaving the quote builder.
 */
export function StoneTypeCompareDialog({
  open,
  comparison,
  current,
  carats,
  title,
  sizeKey,
  onCreatedLabSize,
  onPick,
  onClose,
}: StoneTypeCompareDialogProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [createDraft, setCreateDraft] = useState({ label: '', ctPerStone: '', basePrice: '' })
  const [creating, setCreating] = useState(false)

  // Reset create form when dialog closes or when Lab gets a row (after refresh).
  useEffect(() => {
    if (!open) setShowCreate(false)
  }, [open])

  useEffect(() => {
    if (comparison?.lab.hasRow) setShowCreate(false)
  }, [comparison?.lab.hasRow])

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

  const handleCreate = async () => {
    if (!sizeKey || !createDraft.basePrice) return
    setCreating(true)
    try {
      await configService.createDiamondSize({
        stoneType: 'LAB',
        sizeKey,
        label: createDraft.label,
        ctPerStone: createDraft.ctPerStone !== '' ? Number(createDraft.ctPerStone) : null,
        basePrice: Number(createDraft.basePrice),
      })
      setShowCreate(false)
      onCreatedLabSize?.()
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  const oneSideMissing = comparison.natural.hasRow !== comparison.lab.hasRow

  const renderCard = (opt: StoneTypeOption) => {
    const isSel = current === opt.stoneType
    const isCheaper = comparison.cheaper === opt.stoneType
    const pickable = opt.hasRow || !comparison.comparable
    const isLabMissing = opt.stoneType === 'lab-grown' && !opt.hasRow

    const baseClass = `flex-1 rounded-2xl border p-4 text-left transition ${
      isSel
        ? 'border-slate-900 bg-white ring-1 ring-slate-900'
        : 'border-slate-200 bg-white/70'
    }`

    const headerEl = (
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{opt.label}</span>
        {isSel
          ? <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold text-white">USING</span>
          : isCheaper && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">CHEAPER</span>}
      </div>
    )

    // LAB card with missing price — rendered as div so buttons can nest inside
    if (isLabMissing) {
      return (
        <div key={opt.stoneType} className={`${baseClass} ${!pickable ? 'opacity-50' : ''}`}>
          {headerEl}
          {showCreate ? (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] font-semibold" style={{ color: '#3C2E60' }}>New Lab price</p>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-400">Label</label>
                <input
                  className={inputCls}
                  value={createDraft.label}
                  onChange={e => setCreateDraft(d => ({ ...d, label: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-wide text-slate-400">CT/stone</label>
                  <input
                    type="number" step="0.0001" placeholder="0.014"
                    className={inputCls}
                    value={createDraft.ctPerStone}
                    onChange={e => setCreateDraft(d => ({ ...d, ctPerStone: e.target.value }))}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-wide text-slate-400">$/stone *</label>
                  <input
                    type="number" step="0.01" placeholder="0.00" required
                    className={inputCls}
                    value={createDraft.basePrice}
                    onChange={e => setCreateDraft(d => ({ ...d, basePrice: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={creating || !createDraft.basePrice}
                  onClick={handleCreate}
                  className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white transition disabled:opacity-50"
                  style={{ backgroundColor: '#3C2E60' }}
                >
                  {creating ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg px-2 py-1.5 text-[11px] text-slate-500 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-2 text-[11px] text-amber-700">No price for this size in {opt.label}.</p>
              {sizeKey && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateDraft({ label: comparison.natural.sizeLabel, ctPerStone: '', basePrice: '' })
                    setShowCreate(true)
                  }}
                  className="mt-2 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition"
                  style={{ backgroundColor: 'rgba(60,46,96,0.08)', color: '#3C2E60' }}
                >
                  + Add Lab price
                </button>
              )}
            </>
          )}
        </div>
      )
    }

    // Normal card — full clickable button
    return (
      <button
        key={opt.stoneType}
        type="button"
        disabled={!pickable}
        onClick={() => { onPick(opt.stoneType); onClose() }}
        className={`${baseClass} disabled:cursor-not-allowed disabled:opacity-50 hover:border-slate-300 hover:shadow-sm`}
      >
        {headerEl}
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
                ? 'One of the two types has no price for this size, so this isn\'t an even comparison.'
                : 'This stone uses a custom price, so Natural and Lab cost the same here — picking only changes the label.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
