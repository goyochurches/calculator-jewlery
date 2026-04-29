import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { QuoteDetailPanel } from '@/components/QuoteDetailPanel'
import { Bell, Check, ChevronLeft, ChevronRight, ImageOff, Search, X, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

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

// ── Thumbnail shown in the table row ────────────────────────────────────────
function PhotoThumb({ src }: { src?: string | null }) {
  if (!src) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-300">
        <ImageOff className="h-4 w-4" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt="Reference"
      className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
    />
  )
}

// ── Full-size photo block shown in the detail panel ──────────────────────────
function PhotoDetail({ src }: { src?: string | null }) {
  const [zoomed, setZoomed] = useState(false)

  if (!src) return null

  return (
    <>
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Reference photo
        </p>
        <div
          className="relative cursor-zoom-in overflow-hidden rounded-2xl border border-slate-100"
          onClick={() => setZoomed(true)}
        >
          <img
            src={src}
            alt="Reference photo"
            className="max-h-56 w-full object-cover transition duration-300 hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          <span className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            Tap to enlarge
          </span>
        </div>
      </div>

      {/* Lightbox */}
      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setZoomed(false)}
        >
          <button
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            onClick={() => setZoomed(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={src}
            alt="Reference photo"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
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
  const metalCfg    = JEWELRY_METAL_OPTIONS[quote.metal]                                                        ?? { label: quote.metal }
  const settingCfg  = SETTING_LABOR_MASTER[quote.diamondSize as keyof typeof SETTING_LABOR_MASTER]               ?? { feePerStone: 0, minutesPerStone: 0 }
  const diamondBase = DIAMOND_SIZE_OPTIONS[quote.diamondSize as keyof typeof DIAMOND_SIZE_OPTIONS]               ?? { basePrice: 0, label: quote.diamondSize }
  const diamondMul  = DIAMOND_TYPE_OPTIONS[quote.diamondType as keyof typeof DIAMOND_TYPE_OPTIONS]               ?? { multiplier: 1, label: quote.diamondType }
  const ringLaborCfg = RING_LABOR_OPTIONS[quote.ringLabor as keyof typeof RING_LABOR_OPTIONS]
  const cadCfg       = CAD_DESIGN_OPTIONS[quote.cadDesign as keyof typeof CAD_DESIGN_OPTIONS]
  const fingerFee    = FINGER_SIZE_FEES[quote.fingerSize as keyof typeof FINGER_SIZE_FEES] ?? 0
  const benchCost    = (quote.laborHours ?? 0) * (quote.hourlyRate ?? 0)
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
            {metalCfg.label} · {ringLaborCfg?.label ?? quote.ringLabor} · {cadCfg?.label ?? quote.cadDesign}
          </p>
        </div>

        {/* Reference photo */}
        <PhotoDetail src={quote.photo} />

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
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Engraving</p>
          <p className="mt-1.5 text-sm font-semibold text-slate-900">
            {quote.engraving ? 'Yes — $150' : 'No'}
          </p>
        </div>

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
            <LineItem label="Jeweler's time" value={ringLaborCfg ? `${ringLaborCfg.label} — $${ringLaborCfg.fee}` : (quote.ringLabor ?? '—')} />
            <LineItem label="CAD design" value={cadCfg ? `${cadCfg.label} — $${cadCfg.fee}` : (quote.cadDesign ?? '—')} />
            <LineItem label="Diamonds" value={`${quote.diamondAmount ?? 0} × ${diamondMul.label} ${diamondBase.label} ct`} />
            <LineItem label="Diamond cost" value={`$${diamondCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            <LineItem label="Setting labor" value={`$${settingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${settingCfg.minutesPerStone} min/stone)`} />
            <LineItem label="Finger size" value={`Size ${quote.fingerSize ?? '—'}${fingerFee ? ` — $${fingerFee}` : ''}`} />
            <LineItem label="Ring width" value={`${quote.ringWidth ?? 0} mm — width fee $${widthFee}`} />
            {benchCost > 0 && (
              <LineItem label="Bench labor (legacy)" value={`${quote.laborHours ?? 0} h × $${quote.hourlyRate ?? 0}/h = $${benchCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            )}
            <LineItem label="Hand engraving (milgrain)" value={quote.engraving ? '$150.00' : '$0.00'} />
            {quote.extraCosts > 0 && (
              <LineItem label="Extra costs" value={`$${quote.extraCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

type StatusFilter = QuoteStatus | 'all'

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'draft', label: 'Draft' },
  { value: 'rejected', label: 'Rejected' },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const DEFAULT_PAGE_SIZE = 10

export function QuotesListPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [quotes, setQuotes] = useState<SavedQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

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

  const handleRefreshToken = async (id: string) => {
    try {
      const updated = await quotesService.refreshPublicToken(id)
      setQuotes((prev) => prev.map((q) => (q.id === id ? updated : q)))
    } catch (err) {
      console.error(err)
    }
  }

  const filteredQuotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return quotes.filter((quote) => {
      if (statusFilter !== 'all' && quote.status !== statusFilter) return false
      if (!q) return true
      return (
        quote.title.toLowerCase().includes(q) ||
        (quote.clientName ?? '').toLowerCase().includes(q)
      )
    })
  }, [quotes, statusFilter, searchQuery])

  // Reset to page 1 whenever the filter set changes
  useEffect(() => {
    setPage(1)
  }, [statusFilter, searchQuery, pageSize])

  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = Math.min(pageStart + pageSize, filteredQuotes.length)
  const pagedQuotes = filteredQuotes.slice(pageStart, pageEnd)

  const selected = filteredQuotes.find((q) => q.id === selectedId) ?? null

  const statusCounts = quotes.reduce<Record<QuoteStatus, number>>(
    (acc, q) => { acc[q.status]++; return acc },
    { draft: 0, pending: 0, approved: 0, rejected: 0 }
  )

  if (loading) return <QuotesListSkeleton />

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

      {/* Filters */}
      <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or client…"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="-mx-1 flex flex-wrap items-center gap-1.5 overflow-x-auto px-1">
            {STATUS_FILTER_OPTIONS.map((opt) => {
              const isActive = statusFilter === opt.value
              const count = opt.value === 'all' ? quotes.length : statusCounts[opt.value]
              return (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main content */}
      <div className={selected ? 'grid gap-6 xl:grid-cols-[1fr_420px]' : ''}>
        {/* Table */}
        <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">All quotes</CardTitle>
            <p className="text-sm text-slate-500">
              {filteredQuotes.length === quotes.length
                ? 'Click any row to see the full breakdown.'
                : `Showing ${filteredQuotes.length} of ${quotes.length} quotes.`}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    {['Photo', 'Quote', 'Client', 'Created by', 'Metal', 'Status', 'Date', 'Total', 'Share link'].map((h) => (
                      <th key={h} className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-400">
                        No quotes match the current filters.
                      </td>
                    </tr>
                  )}
                  {pagedQuotes.map((quote) => {
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
                        {/* Photo thumbnail */}
                        <td className="px-6 py-3">
                          {quote.photo ? (
                            <img
                              src={quote.photo}
                              alt="ref"
                              className="h-10 w-10 rounded-xl object-cover ring-2 ring-white shadow-sm"
                            />
                          ) : (
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isSelected ? 'bg-white/10' : 'bg-slate-100'}`}>
                              <ImageOff className={`h-4 w-4 ${isSelected ? 'text-white/40' : 'text-slate-300'}`} />
                            </div>
                          )}
                        </td>

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
                        <td className="px-3 py-4">
                          <CopyShareLinkButton token={quote.publicToken} iconOnly={false} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredQuotes.length > 0 && (
              <PaginationBar
                page={safePage}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                total={filteredQuotes.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        {selected && (
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)] overflow-hidden">
            <QuoteDetailPanel
              quote={selected}
              onClose={() => setSelectedId(null)}
              onStatusChange={handleStatusChange}
              onRefreshToken={isAdmin ? handleRefreshToken : undefined}
              isAdmin={isAdmin}
            />
          </Card>
        )}
      </div>
    </div>
  )
}

function getPageNumbers(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const n of sorted) {
    if (n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}

function PaginationBar({
  page,
  totalPages,
  pageStart,
  pageEnd,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  pageStart: number
  pageEnd: number
  total: number
  pageSize: number
  onPageChange: (p: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const pages = getPageNumbers(page, totalPages)
  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="font-medium">
          {pageStart + 1}–{pageEnd} of {total}
        </span>
        <label className="hidden items-center gap-2 sm:flex">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-slate-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                p === page
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function QuotesListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <CardContent className="p-5 space-y-2">
              <Skeleton className="h-2.5 w-16 bg-slate-100" />
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-5 w-20 bg-slate-100" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-full sm:max-w-sm rounded-2xl bg-slate-100" />
          <div className="flex flex-wrap items-center gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-20 bg-slate-100" />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-64 bg-slate-100" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4 hidden md:flex gap-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-2.5 w-14 bg-slate-200/70" />
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 px-6 py-4">
                <Skeleton className="h-10 w-10 rounded-xl bg-slate-100" />
                <Skeleton className="h-3.5 w-44" />
                <Skeleton className="h-3 w-24 bg-slate-100" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-3 w-20 bg-slate-100" />
                </div>
                <Skeleton className="h-3 w-16 bg-slate-100" />
                <Skeleton className="h-6 w-20 bg-slate-100" />
                <Skeleton className="h-3 w-20 bg-slate-100 ml-auto" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default QuotesListPage