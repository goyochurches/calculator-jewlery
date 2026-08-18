import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { copyToClipboard } from '@/lib/share'
import { JEWELRY_TYPE_OPTIONS } from '@/hooks/useQuoteBuilder'
import { emkaySpecLine, formatStockItemText, rnCastingFeeFromNotes, stoneCostSplit, stoneLineLabel, stoneSpecLine } from '@/lib/stockCostBreakdown'
import { stockService } from '@/services/stockService'
import type { StockItem, StockStatus } from '@/types'
import { ArrowLeft, Check, ClipboardCopy, Copy, Gem, ImageOff, Layers, Scale, Sparkles, Trash2, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const STATUS_STYLES: Record<StockStatus, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700',
  RESERVED: 'bg-amber-50 text-amber-700',
  SOLD: 'bg-slate-100 text-slate-600',
}
const STATUS_LABELS: Record<StockStatus, string> = {
  AVAILABLE: 'Available', RESERVED: 'Reserved', SOLD: 'Sold',
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ${className}`}>{children}</div>
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{children}</p>
}
function LineItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  )
}

// A single "what it cost" row inside the breakdown, with a category icon so
// materials/stones/labor read apart from each other at a glance. `sub` is an
// optional second line for the grading/catalog specifics (color, clarity,
// cut, lab report, $/g, …) — same detail that goes into the clipboard copy.
function CostRow({ icon: Icon, label, sub, value, tint }: { icon: React.ElementType; label: React.ReactNode; sub?: string; value: string; tint: string }) {
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

function CostGroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-4 px-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 first:mt-0">{children}</p>
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Same treatment as QuotesList/StockList's "Created by" avatar.
function Avatar({ name, photo }: { name: string; photo?: string | null }) {
  if (photo) {
    return <img src={photo} alt={name} className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
  }
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
      {initials(name)}
    </span>
  )
}

export default function StockDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const config = useQuoteConfig()

  const [item, setItem] = useState<StockItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    stockService.getById(id).then(setItem).catch(console.error).finally(() => setLoading(false))
  }, [id])

  const handleDuplicate = async () => {
    if (!item) return
    setDuplicating(true)
    try {
      navigate('/stock', { state: { duplicateFrom: item } })
    } finally {
      setDuplicating(false)
    }
  }

  const handleDelete = async () => {
    if (!item) return
    setDeleting(true)
    try {
      await stockService.remove(item.id)
      navigate('/stock-list')
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  const handleCopyDetails = async () => {
    if (!item) return
    await copyToClipboard(formatStockItemText(item, config))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleStatusChange = async (status: StockStatus) => {
    if (!item) return
    setUpdatingStatus(true)
    try {
      const updated = await stockService.updateStatus(item.id, status)
      setItem(updated)
    } catch (err) {
      console.error(err)
    } finally {
      setUpdatingStatus(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 w-full rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-400">
        Stock piece not found.
      </div>
    )
  }

  const metalRows = item.metalRows ?? []
  const stones = item.stones ?? []
  const emkayStones = item.emkayStones ?? []
  const ringLaborFee = item.ringLabor ? config.ringLaborMap[item.ringLabor]?.fee ?? 0 : 0
  // RN ready-made rings save ringLabor as '' (no tier) — their casting fee
  // only survives as a "Labor: $X" line in the RN note, so recover it here
  // instead of letting it silently vanish from the breakdown.
  const rnCastingFee = ringLaborFee === 0 && item.jewelryType === 'rn' ? rnCastingFeeFromNotes(item.internalNotes) : null
  const stoneLines = stones.map(s => ({ stone: s, ...stoneCostSplit(s, config) }))
  const emkayLines = emkayStones.map(es => {
    const qty = es.quantity ?? 1
    const cost = qty * es.priceUsd
    const setterFee = es.setterFeeOverride ?? config.setterMap[es.setterType ?? '']?.fee ?? 0
    return { stone: es, cost, labor: qty * setterFee }
  })
  const laborToSet = stoneLines.reduce((s, b) => s + b.labor, 0) + emkayLines.reduce((s, b) => s + b.labor, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/stock-list')} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-400">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-xl font-semibold text-slate-900">{item.title}</h1>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[item.status]}`}>{STATUS_LABELS[item.status]}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopyDetails}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-400">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <ClipboardCopy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy details'}
          </button>
          <button onClick={handleDuplicate} disabled={duplicating}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:border-slate-400 disabled:opacity-50">
            <Copy className="h-4 w-4" /> Duplicate
          </button>
          {isAdmin && (
            <button onClick={() => setDeleteOpen(true)} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {item.photo ? (
            <img src={item.photo} alt={item.title} className="max-h-96 w-full rounded-2xl object-cover" />
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-300">
              <ImageOff className="h-10 w-10" />
            </div>
          )}

          <Card>
            <SectionLabel>Cost breakdown</SectionLabel>
            {metalRows.length === 0 && stones.length === 0 && emkayStones.length === 0 && (
              <p className="text-sm text-slate-400">No cost factors yet.</p>
            )}

            {(metalRows.length > 0 || ringLaborFee > 0 || rnCastingFee != null) && (
              <>
                <CostGroupLabel>Materials</CostGroupLabel>
                <div className="-mx-2.5">
                  {metalRows.map((r, i) => {
                    const pricePerGram = config.metalPriceMap[r.metalKey] ?? 0
                    return (
                      <CostRow key={`m${i}`} icon={Scale} tint="bg-amber-50 text-amber-600"
                        label={`${r.weightGrams}g ${JEWELRY_METAL_OPTIONS[r.metalKey]?.label ?? r.metalKey}`}
                        sub={`$${pricePerGram.toLocaleString('en-US', { minimumFractionDigits: 2 })}/g`}
                        value={`$${(pricePerGram * r.weightGrams).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                    )
                  })}
                  {ringLaborFee > 0 && (
                    <CostRow icon={Wrench} tint="bg-slate-100 text-slate-500"
                      label="CAD & jeweler's time"
                      sub={`${config.ringLaborMap[item.ringLabor ?? '']?.label ?? item.ringLabor} tier`}
                      value={`$${ringLaborFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  )}
                  {rnCastingFee != null && (
                    <CostRow icon={Wrench} tint="bg-slate-100 text-slate-500" label="Casting labor"
                      value={`$${rnCastingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  )}
                </div>
              </>
            )}

            {(stoneLines.some(l => l.cost > 0) || emkayLines.some(l => l.cost > 0)) && (
              <>
                <CostGroupLabel>Stones</CostGroupLabel>
                <div className="-mx-2.5">
                  {stoneLines.filter(l => l.cost > 0).map((l, i) => {
                    const roleLabel = l.stone.role.charAt(0) + l.stone.role.slice(1).toLowerCase()
                    return (
                      <CostRow key={`s${i}`} icon={Gem} tint="bg-sky-50 text-sky-600"
                        label={`${roleLabel}: ${stoneLineLabel(l.stone, l.count) || 'Stone'}`}
                        sub={stoneSpecLine(l.stone)}
                        value={`$${l.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                    )
                  })}
                  {emkayLines.filter(l => l.cost > 0).map((l, i) => (
                    <CostRow key={`e${i}`} icon={Gem} tint="bg-sky-50 text-sky-600"
                      label={l.stone.name} sub={emkaySpecLine(l.stone)}
                      value={`$${l.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  ))}
                </div>
              </>
            )}

            {(laborToSet > 0 || !!item.engravingFee || !!item.extraCosts) && (
              <>
                <CostGroupLabel>Labor & fees</CostGroupLabel>
                <div className="-mx-2.5">
                  {laborToSet > 0 && (
                    <CostRow icon={Wrench} tint="bg-emerald-50 text-emerald-600" label="Labor to set"
                      value={`$${laborToSet.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  )}
                  {!!item.engravingFee && (
                    <CostRow icon={Sparkles} tint="bg-violet-50 text-violet-600" label="Engraving"
                      value={`$${item.engravingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  )}
                  {!!item.extraCosts && (
                    <CostRow icon={Layers} tint="bg-slate-100 text-slate-500" label="Extra costs"
                      value={`$${item.extraCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  )}
                </div>
              </>
            )}

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
              <span className="text-sm font-semibold">Total cost</span>
              <span className="text-lg font-bold tabular-nums">${item.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </Card>

          {stones.some(s => s.comments) && (
            <Card>
              <SectionLabel>Stone comments</SectionLabel>
              {stones.filter(s => s.comments).map((s, i) => (
                <div key={i} className="border-b border-slate-50 py-2 last:border-0">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.role}</span>
                  <p className="mt-1 text-xs text-slate-500">{s.comments}</p>
                </div>
              ))}
            </Card>
          )}

          {item.internalNotes && (
            <Card>
              <SectionLabel>Internal notes</SectionLabel>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{item.internalNotes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <SectionLabel>Details</SectionLabel>
            <LineItem label="SKU" value={item.sku || '—'} />
            <LineItem label="Quantity" value={item.quantity} />
            <LineItem label="Jewelry type" value={JEWELRY_TYPE_OPTIONS.find(j => j.key === item.jewelryType)?.label ?? item.jewelryType ?? '—'} />
            <LineItem label="Created" value={item.createdAt} />
            <LineItem label="Created by" value={item.createdBy ? (
              <span className="flex items-center gap-1.5">
                <Avatar name={item.createdBy} photo={item.createdByPhoto} />
                {item.createdBy}
              </span>
            ) : '—'} />
            {item.finishedWeightGrams != null && (
              <LineItem label="Finished weight" value={`${item.finishedWeightGrams}g (note only)`} />
            )}
          </Card>

          <Card>
            <SectionLabel>Status</SectionLabel>
            <div className="flex flex-col gap-2">
              {(['AVAILABLE', 'RESERVED', 'SOLD'] as StockStatus[]).map(s => (
                <button key={s} onClick={() => handleStatusChange(s)} disabled={updatingStatus || item.status === s}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                    item.status === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400'
                  } disabled:cursor-default`}>
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <SectionLabel>Pricing</SectionLabel>
            <LineItem label="Internal cost" value={`$${item.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            <LineItem label="Markup" value={`×${item.markupMultiplier ?? 2.5}`} />
            {(item.discountPercent ?? 0) > 0 && <LineItem label="Discount" value={`${item.discountPercent}%`} />}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-semibold text-slate-500">Retail price</span>
              <span className="text-lg font-bold text-slate-900">${(item.retailPrice ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this stock piece?"
        description={<>This permanently deletes <strong>{item.title}</strong> and cannot be undone.</>}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  )
}
