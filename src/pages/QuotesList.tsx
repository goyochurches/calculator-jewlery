import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CAD_DESIGN_OPTIONS,
  DIAMOND_SIZE_OPTIONS,
  DIAMOND_TYPE_OPTIONS,
  FINGER_SIZE_FEES,
  JEWELRY_METAL_OPTIONS,
  RING_LABOR_OPTIONS,
  SETTING_LABOR_MASTER,
} from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { quotesService } from '@/services/quotesService'
import type { QuoteStatus, SavedQuote } from '@/types'
import { Bell, Check, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
      {initials(name)}
    </span>
  )
}

function LineItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function QuoteDetail({
  quote,
  onClose,
  onStatusChange,
  isAdmin,
}: {
  quote: SavedQuote
  onClose: () => void
  onStatusChange: (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING') => void
  isAdmin: boolean
}) {
  const metalCfg    = JEWELRY_METAL_OPTIONS[quote.metal]    ?? { label: quote.metal }
  const settingCfg  = SETTING_LABOR_MASTER[quote.diamondSize]  ?? { feePerStone: 0, minutesPerStone: 0 }
  const diamondBase = DIAMOND_SIZE_OPTIONS[quote.diamondSize]   ?? { basePrice: 0, label: quote.diamondSize }
  const diamondMul  = DIAMOND_TYPE_OPTIONS[quote.diamondType]   ?? { multiplier: 1, label: quote.diamondType }
  const diamondUnitPrice = diamondBase.basePrice * diamondMul.multiplier
  const diamondCost = (quote.diamondAmount ?? 0) * diamondUnitPrice
  const settingFee  = (quote.diamondAmount ?? 0) * settingCfg.feePerStone
  const widthFee    = Math.max(0, (quote.ringWidth ?? 2) - 2) * 18

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{quote.title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">Quote #{quote.id} · {quote.createdAt}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Total */}
        <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <p className="text-xs uppercase tracking-[0.18em] text-white/60">Quote total</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-1.5 text-sm text-white/70">
            {metalCfg.label} · {RING_LABOR_OPTIONS[quote.ringLabor]?.label ?? quote.ringLabor} · {CAD_DESIGN_OPTIONS[quote.cadDesign]?.label ?? quote.cadDesign}
          </p>
        </div>

        {/* Creator, client & status */}
        <div className="flex gap-3">
          <div className="flex-1 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Created by</p>
            <div className="mt-2 flex items-center gap-2">
              <Avatar name={quote.createdBy} />
              <p className="text-sm font-semibold text-slate-900">{quote.createdBy}</p>
            </div>
          </div>
          <div className="flex-1 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Status</p>
            <div className="mt-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[quote.status]}`}>
                {STATUS_LABELS[quote.status]}
              </span>
            </div>
          </div>
        </div>
        {quote.clientName && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Client</p>
            <p className="mt-1.5 text-sm font-semibold text-slate-900">{quote.clientName}</p>
          </div>
        )}

        {/* Admin actions */}
        {isAdmin && (quote.status === 'pending' || quote.status === 'approved' || quote.status === 'rejected') && (
          <div className="flex gap-2">
            {quote.status !== 'approved' && (
              <button
                onClick={() => onStatusChange(quote.id, 'APPROVED')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                <Check className="h-4 w-4" /> Approve
              </button>
            )}
            {quote.status !== 'rejected' && (
              <button
                onClick={() => onStatusChange(quote.id, 'REJECTED')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600"
              >
                <XCircle className="h-4 w-4" /> Reject
              </button>
            )}
            {quote.status !== 'pending' && (
              <button
                onClick={() => onStatusChange(quote.id, 'PENDING')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500"
              >
                Reset
              </button>
            )}
          </div>
        )}

        {/* Cost breakdown */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Cost breakdown</p>
          <div className="space-y-2">
            <LineItem label="Metal" value={metalCfg.label} />
            <LineItem label="Weight" value={`${quote.weightGrams ?? 0} g`} />
            <LineItem label="Ring labor" value={RING_LABOR_OPTIONS[quote.ringLabor] ? `${RING_LABOR_OPTIONS[quote.ringLabor].label} — $${RING_LABOR_OPTIONS[quote.ringLabor].fee}` : (quote.ringLabor ?? '—')} />
            <LineItem label="CAD design" value={CAD_DESIGN_OPTIONS[quote.cadDesign] ? `${CAD_DESIGN_OPTIONS[quote.cadDesign].label} — $${CAD_DESIGN_OPTIONS[quote.cadDesign].fee}` : (quote.cadDesign ?? '—')} />
            <LineItem label="Diamonds" value={`${quote.diamondAmount ?? 0} × ${diamondMul.label} ${diamondBase.label} ct`} />
            <LineItem label="Diamond cost" value={`$${diamondCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            <LineItem label="Setting labor" value={`$${settingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${settingCfg.minutesPerStone} min/stone)`} />
            <LineItem label="Finger size" value={`Size ${quote.fingerSize ?? '—'} — $${FINGER_SIZE_FEES[quote.fingerSize as keyof typeof FINGER_SIZE_FEES] ?? 0}`} />
            <LineItem label="Ring width" value={`${quote.ringWidth ?? 0} mm — width fee $${widthFee}`} />
            <LineItem label="Bench labor" value={`${quote.laborHours ?? 0} h × $${quote.hourlyRate ?? 0}/h = $${((quote.laborHours ?? 0) * (quote.hourlyRate ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            {quote.extraCosts > 0 && (
              <LineItem label="Extra costs" value={`$${quote.extraCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function QuotesListPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [quotes, setQuotes] = useState<SavedQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    quotesService.getAll()
      .then(setQuotes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleStatusChange = async (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING') => {
    try {
      const updated = await quotesService.updateStatus(id, status)
      setQuotes((prev) => prev.map((q) => (q.id === id ? updated : q)))
    } catch (err) {
      console.error(err)
    }
  }

  const selected = quotes.find((q) => q.id === selectedId) ?? null

  const statusCounts = quotes.reduce<Record<QuoteStatus, number>>(
    (acc, q) => { acc[q.status]++; return acc },
    { draft: 0, pending: 0, approved: 0, rejected: 0 }
  )

  if (loading) return <p className="text-sm text-slate-500">Loading quotes...</p>

  return (
    <div className="space-y-6">
      {/* Admin pending-review banner */}
      {isAdmin && statusCounts.pending > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <Bell className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm font-semibold text-amber-800">
            {statusCounts.pending} quote{statusCounts.pending > 1 ? 's' : ''} pending your approval — click a row to review.
          </p>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(['approved', 'pending', 'draft', 'rejected'] as QuoteStatus[]).map((s) => (
          <Card key={s} className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <CardContent className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{STATUS_LABELS[s]}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{statusCounts[s]}</p>
              <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[s]}`}>
                {STATUS_LABELS[s]}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content */}
      <div className={selected ? 'grid gap-6 xl:grid-cols-[1fr_420px]' : ''}>
        {/* Table */}
        <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">All quotes</CardTitle>
            <p className="text-sm text-slate-500">Click any row to see the full breakdown.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    {['Quote', 'Client', 'Created by', 'Metal', 'Status', 'Date', 'Total'].map((h) => (
                      <th key={h} className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => {
                    const isSelected = quote.id === selectedId
                    return (
                      <tr
                        key={quote.id}
                        onClick={() => setSelectedId(isSelected ? null : quote.id)}
                        className={`cursor-pointer border-b border-slate-100 transition-colors last:border-0 ${
                          isSelected ? 'text-white' : 'hover:bg-slate-50/80'
                        }`}
                        style={isSelected ? { backgroundColor: 'var(--theme-primary)' } : undefined}
                      >
                        <td className="px-6 py-4">
                          <span className={`font-semibold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            {quote.title}
                          </span>
                        </td>
                        <td className={`px-6 py-4 ${isSelected ? 'text-slate-200' : 'text-slate-600'}`}>
                          {quote.clientName || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Avatar name={quote.createdBy} />
                            <span className={isSelected ? 'text-slate-300' : 'text-slate-700'}>
                              {quote.createdBy}
                            </span>
                          </div>
                        </td>
                        <td className={`px-6 py-4 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                          {JEWELRY_METAL_OPTIONS[quote.metal]?.label ?? quote.metal}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isSelected ? 'bg-white/15 text-white' : STATUS_STYLES[quote.status]
                          }`}>
                            {STATUS_LABELS[quote.status]}
                          </span>
                        </td>
                        <td className={`px-6 py-4 ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                          {quote.createdAt}
                        </td>
                        <td className={`px-6 py-4 text-right font-semibold ${isSelected ? 'text-amber-300' : 'text-slate-900'}`}>
                          ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selected && (
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)] overflow-hidden">
            <QuoteDetail
              quote={selected}
              onClose={() => setSelectedId(null)}
              onStatusChange={handleStatusChange}
              isAdmin={isAdmin}
            />
          </Card>
        )}
      </div>
    </div>
  )
}

export default QuotesListPage
