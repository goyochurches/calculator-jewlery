import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/context/AuthContext'
import { stockService } from '@/services/stockService'
import type { StockItem, StockStatus } from '@/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ChevronLeft, ChevronRight, Copy, ImageOff, MoreHorizontal, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STATUS_STYLES: Record<StockStatus, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700',
  RESERVED: 'bg-amber-50 text-amber-700',
  SOLD: 'bg-slate-100 text-slate-600',
}

const STATUS_LABELS: Record<StockStatus, string> = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
}

type StatusFilter = StockStatus | 'all'

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'SOLD', label: 'Sold' },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const DEFAULT_PAGE_SIZE = 10

export function StockListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'ADMIN'

  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

  const [items, setItems] = useState<StockItem[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => { setPage(0) }, [statusFilter, debouncedSearch, pageSize])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    stockService.getPage({
      page, size: pageSize,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      q: debouncedSearch || undefined,
    }).then(({ items, totalPages: tp, totalElements: te }) => {
      if (cancelled) return
      setItems(items); setTotalPages(tp); setTotalElements(te); setLoading(false)
    }).catch(err => { if (!cancelled) { console.error(err); setLoading(false) } })
    return () => { cancelled = true }
  }, [page, pageSize, statusFilter, debouncedSearch])

  const loadCounts = useCallback(() => {
    stockService.getCounts().then(setCounts).catch(console.error)
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await stockService.remove(deleteTarget.id)
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      setTotalElements(n => n - 1)
      setDeleteTarget(null)
      loadCounts()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  // Always fetch the FULL record before duplicating — never prefill straight
  // from the lightweight list summary (that's the bug found in the quotes
  // list-page duplicate action; see quotesService.ts mapSummary).
  const handleDuplicate = async (item: StockItem) => {
    setDuplicatingId(item.id)
    try {
      const full = await stockService.getById(item.id)
      navigate('/stock', { state: { duplicateFrom: full } })
    } catch (err) {
      console.error(err)
    } finally {
      setDuplicatingId(null)
    }
  }

  const statusCounts: Record<StockStatus, number> = {
    AVAILABLE: counts.available ?? 0,
    RESERVED: counts.reserved ?? 0,
    SOLD: counts.sold ?? 0,
  }

  const pageStart = page * pageSize
  const pageEnd = Math.min(pageStart + pageSize, totalElements)

  if (loading && items.length === 0) return <StockListSkeleton />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {(['AVAILABLE', 'RESERVED', 'SOLD'] as StockStatus[]).map(s => (
          <Card key={s} className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <CardContent className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{STATUS_LABELS[s]}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {Object.keys(counts).length === 0 ? '—' : statusCounts[s]}
              </p>
              <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[s]}`}>
                {STATUS_LABELS[s]}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by title or SKU…"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="-mx-1 flex flex-wrap items-center gap-1.5 overflow-x-auto px-1">
            {STATUS_FILTER_OPTIONS.map(opt => {
              const isActive = statusFilter === opt.value
              const count = opt.value === 'all' ? (counts.all ?? totalElements) : statusCounts[opt.value]
              return (
                <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    isActive ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  {opt.label}
                  <span className={`rounded-full px-1.5 text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">All stock</CardTitle>
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : totalElements === 0 ? 'No stock pieces match the current filters.' : `${totalElements.toLocaleString()} total · click any row to see the full breakdown`}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  {['Photo', 'Piece', 'SKU', 'Qty', 'Status', 'Created by', 'Date', 'Price', 'Actions'].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 last:text-right">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!loading && items.length === 0 && (
                  <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-400">No stock pieces match the current filters.</td></tr>
                )}
                {items.map(item => (
                  <StockRow
                    key={item.id}
                    item={item}
                    onSelect={() => navigate(`/stock-list/${item.id}`)}
                    onDuplicate={() => handleDuplicate(item)}
                    duplicating={duplicatingId === item.id}
                    onDelete={isAdmin ? () => setDeleteTarget(item) : undefined}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {totalElements > 0 && (
            <PaginationBar
              page={page + 1} totalPages={totalPages} pageStart={pageStart} pageEnd={pageEnd}
              total={totalElements} pageSize={pageSize} loading={loading}
              onPageChange={p => setPage(p - 1)} onPageSizeChange={setPageSize}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this stock piece?"
        description={<>This permanently deletes <strong>{deleteTarget?.title}</strong> and cannot be undone.</>}
        confirmLabel="Delete"
        cancelLabel="Keep it"
        variant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function getPageNumbers(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b)
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
  page, totalPages, pageStart, pageEnd, total, pageSize, loading, onPageChange, onPageSizeChange,
}: {
  page: number; totalPages: number; pageStart: number; pageEnd: number; total: number
  pageSize: number; loading?: boolean; onPageChange: (p: number) => void; onPageSizeChange: (size: number) => void
}) {
  const pages = getPageNumbers(page, totalPages)
  const canPrev = page > 1 && !loading
  const canNext = page < totalPages && !loading
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="font-medium">{pageStart + 1}–{pageEnd} of {total}</span>
        <label className="hidden items-center gap-2 sm:flex">
          <span>Rows</span>
          <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400">
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={!canPrev} aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) => p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-slate-400">…</span>
        ) : (
          <button key={p} onClick={() => onPageChange(p)} aria-current={p === page ? 'page' : undefined}
            className={`min-w-[2rem] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${p === page ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onPageChange(page + 1)} disabled={!canNext} aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function StockListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
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
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-20 bg-slate-100" />)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StockRow({
  item, onSelect, onDuplicate, duplicating, onDelete,
}: {
  item: StockItem
  onSelect: () => void
  onDuplicate: () => void
  duplicating?: boolean
  onDelete?: () => void
}) {
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsPos, setActionsPos] = useState<{ top: number; right: number } | null>(null)
  const actionsBtnRef = useRef<HTMLButtonElement>(null)
  const actionsMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!actionsOpen) return
    const close = (e: MouseEvent) => {
      if (actionsMenuRef.current?.contains(e.target as Node) || actionsBtnRef.current?.contains(e.target as Node)) return
      setActionsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [actionsOpen])

  const openActions = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (actionsOpen) { setActionsOpen(false); return }
    if (!actionsBtnRef.current) return
    const rect = actionsBtnRef.current.getBoundingClientRect()
    setActionsPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    setActionsOpen(true)
  }

  return (
    <tr onClick={onSelect} className="cursor-pointer border-b border-slate-100 transition-all duration-200 last:border-0 hover:bg-slate-50/80">
      <td className="px-6 py-3">
        {item.photo ? (
          <img src={item.photo} alt="ref" className="h-10 w-10 rounded-xl object-cover ring-2 ring-white shadow-sm" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
            <ImageOff className="h-4 w-4 text-slate-300" />
          </div>
        )}
      </td>
      <td className="px-6 py-4 font-semibold text-slate-900">{item.title}</td>
      <td className="px-6 py-4 text-slate-600">{item.sku || <span className="text-slate-300">—</span>}</td>
      <td className="px-6 py-4 text-slate-600">{item.quantity}</td>
      <td className="px-6 py-4">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[item.status]}`}>{STATUS_LABELS[item.status]}</span>
      </td>
      <td className="px-6 py-4 text-slate-600">{item.createdBy || <span className="text-slate-300">—</span>}</td>
      <td className="px-6 py-4 text-slate-400">{item.createdAt}</td>
      <td className="px-6 py-4 text-right">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Retail</span>
            <span className="text-base font-bold tabular-nums leading-none text-slate-900">
              ${(item.retailPrice ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <span className="text-[10px] font-medium tabular-nums text-slate-400">Cost ${item.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
      </td>
      <td className="px-3 py-4">
        <div className="flex items-center justify-end">
          <button ref={actionsBtnRef} type="button" onClick={openActions} title="Actions" aria-label="Open actions"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
              actionsOpen ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700'
            }`}>
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {actionsOpen && actionsPos && (
            <div ref={actionsMenuRef} style={{ position: 'fixed', top: actionsPos.top, right: actionsPos.right }}
              onClick={e => e.stopPropagation()}
              className="z-[200] min-w-[164px] overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
              <button type="button" onClick={(e) => { e.stopPropagation(); setActionsOpen(false); onDuplicate() }} disabled={duplicating}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                <Copy className="h-4 w-4 text-slate-400" />
                <span>{duplicating ? 'Loading…' : 'Duplicate'}</span>
              </button>
              {onDelete && (
                <>
                  <div className="mx-3 my-1 border-t border-slate-100" />
                  <button type="button" onClick={(e) => { e.stopPropagation(); setActionsOpen(false); onDelete() }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-rose-600 transition hover:bg-rose-50">
                    <Trash2 className="h-4 w-4" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

export default StockListPage
