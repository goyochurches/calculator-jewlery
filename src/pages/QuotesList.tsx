import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { useFeatures } from '@/hooks/useFeatures'
import { displayStatusFor } from '@/lib/quoteStatusDisplay'
import { computeCustomerPrice } from '@/lib/quotePricing'
import { quotesService } from '@/services/quotesService'
import type { QuoteStatus, SavedQuote } from '@/types'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { OpenQuoteButton } from '@/components/OpenQuoteButton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Copy, ImageOff, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  processing: 'bg-sky-50 text-sky-700',
  rejected: 'bg-rose-50 text-rose-700',
  fully_paid: 'bg-emerald-100 text-emerald-800',
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  processing: 'Processing',
  rejected: 'Rejected',
  fully_paid: 'Fully paid',
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ name, photo }: { name: string; photo?: string | null }) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
      />
    )
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
      {initials(name)}
    </span>
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
  const { isEnabled } = useFeatures()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = user?.role === 'ADMIN'
  const canDelete = isAdmin && isEnabled('quote-delete')

  const [deleteTarget, setDeleteTarget] = useState<SavedQuote | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Server-side pagination state ─────────────────────────────────────────
  const [quotes, setQuotes] = useState<SavedQuote[]>([])      // current page
  const [counts, setCounts] = useState<Record<string, number>>({}) // global status totals
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)  // 0-indexed (Spring convention)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Debounce search so we don't fire on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Reset to first page when filter / search / page-size changes
  useEffect(() => { setPage(0) }, [statusFilter, debouncedSearch, pageSize])

  // Fetch one page from the server
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    quotesService.getPage({
      page,
      size: pageSize,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      q: debouncedSearch || undefined,
    }).then(({ items, totalPages: tp, totalElements: te }) => {
      if (cancelled) return
      setQuotes(items)
      setTotalPages(tp)
      setTotalElements(te)
      setLoading(false)
    }).catch(err => {
      if (!cancelled) { console.error(err); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [page, pageSize, statusFilter, debouncedSearch])

  // Load global status counts (once; refreshed after mutations)
  const loadCounts = useCallback(() => {
    quotesService.getCounts().then(setCounts).catch(console.error)
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

  // Deep-link: ?quoteId=X navigates to the detail page for that quote
  useEffect(() => {
    const deepLinkId = searchParams.get('quoteId')
    if (!deepLinkId) return
    const next = new URLSearchParams(searchParams)
    next.delete('quoteId')
    setSearchParams(next, { replace: true })
    navigate(`/quotes-list/${deepLinkId}`)
  }, [searchParams, setSearchParams, navigate])

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await quotesService.remove(deleteTarget.id)
      setQuotes((prev) => prev.filter((q) => q.id !== deleteTarget.id))
      setTotalElements(n => n - 1)
      setDeleteTarget(null)
      loadCounts()
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  // ── Group current-page quotes into parent + revisions ─────────────────────
  interface QuoteGroup { parent: SavedQuote; children: SavedQuote[] }
  const newestFirst = (a: SavedQuote, b: SavedQuote): number => {
    const byDate = (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    if (byDate !== 0) return byDate
    return Number(b.id) - Number(a.id)
  }
  const groupOrder = (a: SavedQuote, b: SavedQuote): number => {
    const aApproved = a.status === 'approved' ? 1 : 0
    const bApproved = b.status === 'approved' ? 1 : 0
    if (aApproved !== bApproved) return bApproved - aApproved
    return newestFirst(a, b)
  }
  const groups = useMemo<QuoteGroup[]>(() => {
    const byId = new Map<string, SavedQuote>()
    quotes.forEach((q) => byId.set(q.id, q))
    const childrenByParent = new Map<string, SavedQuote[]>()
    const roots: SavedQuote[] = []
    quotes.forEach((q) => {
      const parentId = q.parentQuoteId != null ? String(q.parentQuoteId) : null
      if (parentId && byId.has(parentId)) {
        const arr = childrenByParent.get(parentId) ?? []
        arr.push(q)
        childrenByParent.set(parentId, arr)
      } else {
        roots.push(q)
      }
    })
    const out = roots.map((root) => {
      const allMembers = [root, ...(childrenByParent.get(root.id) ?? [])]
      allMembers.sort(groupOrder)
      const [head, ...rest] = allMembers
      return { parent: head, children: rest }
    })
    const maxDate = (g: QuoteGroup) =>
      [g.parent, ...g.children].reduce((max, q) =>
        (q.createdAt ?? '') > max ? (q.createdAt ?? '') : max, '')
    out.sort((a, b) => maxDate(b).localeCompare(maxDate(a)))
    return out
  }, [quotes])

  const effectivelyExpanded = (groupId: string) => expandedGroups.has(groupId)

  // Summary-card counts come from the global /counts endpoint
  const statusCounts: Record<QuoteStatus, number> = {
    draft:      counts.draft      ?? 0,
    pending:    counts.pending    ?? 0,
    approved:   counts.approved   ?? 0,
    processing: counts.processing ?? 0,
    rejected:   counts.rejected   ?? 0,
    fully_paid: counts.fully_paid ?? 0,
  }

  // Display range for the pagination bar (1-indexed)
  const pageStart = page * pageSize
  const pageEnd   = Math.min(pageStart + pageSize, totalElements)

  if (loading && quotes.length === 0) return <QuotesListSkeleton />

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
              const count = opt.value === 'all' ? (counts.all ?? totalElements) : statusCounts[opt.value]
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

      {/* Main content — table always uses the full width. The detail panel
          opens as a right-docked drawer overlay regardless of screen size,
          so the table layout is never squeezed and the panel never appears
          off-screen on narrower viewports. */}
      <div>
        {/* Table */}
        <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">All quotes</CardTitle>
            <p className="text-sm text-slate-500">
              {loading
                ? 'Loading…'
                : totalElements === 0
                  ? 'No quotes match the current filters.'
                  : `${totalElements.toLocaleString()} total · click any row to see the full breakdown`}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative overflow-x-auto">
              {loading && quotes.length > 0 && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                    <svg className="h-4 w-4 animate-spin text-slate-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <span className="text-xs font-medium text-slate-500">Loading…</span>
                  </div>
                </div>
              )}
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70">
                    {['Photo', 'Quote', 'Client', 'Created by', 'Metal', 'Status', 'Date', 'Total', 'Actions'].map((h) => (
                      <th key={h} className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!loading && groups.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-400">
                        No quotes match the current filters.
                      </td>
                    </tr>
                  )}
                  {loading && quotes.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-sm text-slate-400">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {groups.flatMap((group) => {
                    const rows: React.ReactNode[] = []
                    const expanded = effectivelyExpanded(group.parent.id)
                    const childCount = group.children.length
                    rows.push(
                      <QuoteRow
                        key={group.parent.id}
                        quote={group.parent}
                        kind="parent"
                        isSelected={false}
                        onSelect={() => navigate(`/quotes-list/${group.parent.id}`)}
                        onDuplicate={() => navigate('/quotes', { state: { duplicateFrom: group.parent } })}
                        childCount={childCount}
                        expanded={expanded}
                        canToggle={childCount > 0}
                        onToggle={() => toggleGroup(group.parent.id)}
                        viewerUser={user}
                        onDelete={canDelete ? () => setDeleteTarget(group.parent) : undefined}
                      />,
                    )
                    if (expanded) {
                      group.children.forEach((child, idx) => {
                        rows.push(
                          <QuoteRow
                            key={child.id}
                            quote={child}
                            kind="child"
                            isLastChild={idx === group.children.length - 1}
                            isSelected={false}
                            onSelect={() => navigate(`/quotes-list/${child.id}`)}
                            onDuplicate={() => navigate('/quotes', { state: { duplicateFrom: child } })}
                            viewerUser={user}
                            revisionIndex={idx + 1}
                            totalRevisions={group.children.length}
                            onDelete={canDelete ? () => setDeleteTarget(child) : undefined}
                          />,
                        )
                      })
                    }
                    return rows
                  })}
                </tbody>
              </table>
            </div>
            {totalElements > 0 && (
              <PaginationBar
                page={page + 1}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                total={totalElements}
                pageSize={pageSize}
                loading={loading}
                onPageChange={(p) => setPage(p - 1)}
                onPageSizeChange={setPageSize}
              />
            )}
          </CardContent>
        </Card>

        <ConfirmDialog
          open={deleteTarget !== null}
          title="Delete this quote?"
          description={
            <>This permanently deletes <strong>{deleteTarget?.title}</strong> (Quote #{deleteTarget?.id}) and cannot be undone.</>
          }
          confirmLabel="Delete quote"
          cancelLabel="Keep it"
          variant="danger"
          loading={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
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
  loading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  totalPages: number
  pageStart: number
  pageEnd: number
  total: number
  pageSize: number
  loading?: boolean
  onPageChange: (p: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const pages = getPageNumbers(page, totalPages)
  const canPrev = page > 1 && !loading
  const canNext = page < totalPages && !loading

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


/** Single row in the quotes table. Renders three visual variants:
 *   · parent       — full opacity, may show an expand chevron + "N revisions"
 *   · parent-ghost — greyed out, header of a group whose only matching rows
 *                    are children (filter active, parent itself doesn't pass)
 *   · child        — indented with a ↳ arrow, shaded background, smaller chip
 */
function QuoteRow({
  quote, kind, isSelected, onSelect, onDuplicate,
  childCount, expanded, canToggle, onToggle, isLastChild, viewerUser,
  revisionIndex, totalRevisions, onDelete,
}: {
  quote: SavedQuote
  kind: 'parent' | 'parent-ghost' | 'child'
  isSelected: boolean
  onSelect: () => void
  onDuplicate: () => void
  childCount?: number
  expanded?: boolean
  canToggle?: boolean
  onToggle?: () => void
  isLastChild?: boolean
  /** Current viewer — drives status display normalisation so non-admin
   *  accounts see fully_paid rendered as approved. */
  viewerUser: { email?: string } | null | undefined
  /** 1-based position of this revision within its parent group. Only set
   *  for child rows so the title cell can show a "Rev 2 of 3" badge. */
  revisionIndex?: number
  totalRevisions?: number
  /** When provided, an admin Delete button shows in the Actions cell. */
  onDelete?: () => void
}) {
  const isChild = kind === 'child'
  const isGhost = kind === 'parent-ghost'
  const hasChildren = !isChild && childCount != null && childCount > 0
  // Visual story (revision grouping):
  //  · parent + has revisions + collapsed → violet tint (invites exploration)
  //  · parent + has revisions + expanded  → amber tint, thick amber left bar
  //  · child (revision) of an expanded parent → SAME amber tint, lighter
  //    intensity → reads as "same group" instead of a generic indented row.
  //    Left bar continues amber so the group looks like one connected card,
  //    and the last child gets a rounded bottom corner.
  //  · plain parent (no revisions)        → neutral
  const rowBg = isSelected
    ? 'text-white'
    : isChild
      ? isLastChild
        ? 'bg-gradient-to-r from-amber-50 via-amber-50/70 to-transparent hover:from-amber-100'
        : 'bg-gradient-to-r from-amber-50 via-amber-50/70 to-transparent hover:from-amber-100'
      : hasChildren && expanded
        ? 'bg-gradient-to-r from-amber-100 via-orange-50/60 to-transparent hover:from-amber-200/90'
        : hasChildren
          ? 'bg-gradient-to-r from-violet-100/80 via-fuchsia-50/40 to-transparent hover:from-violet-200/90'
          : 'hover:bg-slate-50/80'
  // Left accent bar — amber column that visually connects the expanded
  // parent with every revision below it, making the whole group read as
  // one card. Last child gets a rounded bottom corner so the column has
  // a clear end.
  const leftAccent = !isSelected && hasChildren
    ? expanded
      ? 'border-l-4 border-l-amber-400'
      : 'border-l-4 border-l-violet-400'
    : isChild && !isSelected
      ? `border-l-4 border-l-amber-400 ${isLastChild ? 'rounded-bl-2xl shadow-[inset_0_-2px_0_rgba(245,158,11,0.25)]' : ''}`
      : ''
  return (
    <tr
      onClick={onSelect}
      className={`cursor-pointer border-b border-slate-100 transition-all duration-200 last:border-0 ${rowBg} ${leftAccent} ${isGhost ? 'opacity-60' : ''}`}
      style={isSelected ? { backgroundColor: 'var(--theme-primary)' } : undefined}
    >
      <td className="px-6 py-3">
        <div className="flex items-center gap-2">
          {isChild && (
            // Stronger tree connector: vertical line above + horizontal
            // elbow, in the same amber as the group's left accent bar.
            // Reads as "this row hangs off the parent above".
            <div className="relative flex h-8 w-5 shrink-0 items-center justify-center" aria-hidden>
              <span className={`absolute left-1/2 top-0 h-1/2 w-0.5 -translate-x-1/2 ${isSelected ? 'bg-white/40' : 'bg-amber-300'}`} />
              {!isLastChild && (
                <span className={`absolute left-1/2 bottom-0 h-1/2 w-0.5 -translate-x-1/2 ${isSelected ? 'bg-white/40' : 'bg-amber-300'}`} />
              )}
              <span className={`absolute left-1/2 top-1/2 h-0.5 w-3 -translate-y-1/2 ${isSelected ? 'bg-white/40' : 'bg-amber-300'}`} />
            </div>
          )}
          {quote.photo ? (
            <img
              src={quote.photo}
              alt="ref"
              className={`rounded-xl object-cover ring-2 ring-white shadow-sm ${isChild ? 'h-8 w-8' : 'h-10 w-10'}`}
            />
          ) : (
            <div className={`flex items-center justify-center rounded-xl ${isChild ? 'h-8 w-8' : 'h-10 w-10'} ${isSelected ? 'bg-white/10' : 'bg-slate-100'}`}>
              <ImageOff className={`h-4 w-4 ${isSelected ? 'text-white/40' : 'text-slate-300'}`} />
            </div>
          )}
        </div>
      </td>

      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {isChild && revisionIndex != null && totalRevisions != null && (
            <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isSelected
                ? 'bg-white/20 text-white ring-1 ring-white/40'
                : 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
            }`}>
              Rev {revisionIndex}/{totalRevisions}
            </span>
          )}
          {!isChild && hasChildren && expanded && (
            <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isSelected
                ? 'bg-white/20 text-white ring-1 ring-white/40'
                : 'bg-amber-200 text-amber-900 ring-1 ring-amber-400'
            }`}>
              Original
            </span>
          )}
          <span className={`font-semibold ${isSelected ? 'text-white' : isChild ? 'text-slate-700' : 'text-slate-900'}`}>
            {quote.title}
          </span>
          {!isChild && childCount != null && childCount > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggle?.() }}
              disabled={!canToggle}
              title={expanded ? 'Hide previous versions' : `Show ${childCount} previous version${childCount === 1 ? '' : 's'} of this quote`}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide shadow-sm ring-1 transition-all duration-200 ${
                isSelected
                  ? 'bg-white/20 text-white ring-white/40 hover:bg-white/30'
                  : expanded
                    ? 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-900 ring-amber-300 hover:from-amber-200 hover:to-orange-200'
                    : 'bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-700 ring-violet-300 hover:from-violet-200 hover:to-fuchsia-200 animate-pulse-slow disabled:cursor-default'
              }`}
            >
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full transition-transform duration-200 ${
                expanded ? 'rotate-180 bg-amber-200/60' : 'bg-violet-200/60'
              }`}>
                <ChevronDown className="h-3 w-3" />
              </span>
              {expanded ? 'Hide' : 'Show'} {childCount} previous {childCount === 1 ? 'version' : 'versions'}
            </button>
          )}
          {isChild && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              isSelected ? 'bg-white/20 text-white' : 'bg-violet-50 text-violet-700'
            }`}>
              Revision
            </span>
          )}
        </div>
      </td>
      <td className={`px-6 py-4 ${isSelected ? 'text-slate-200' : 'text-slate-600'}`}>
        {quote.clientName || <span className="text-slate-300">—</span>}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <Avatar name={quote.createdBy} photo={quote.createdByPhoto} />
          <span className={isSelected ? 'text-slate-300' : 'text-slate-700'}>
            {quote.createdBy}
          </span>
        </div>
      </td>
      <td className={`px-6 py-4 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
        {JEWELRY_METAL_OPTIONS[quote.metal]?.label ?? quote.metal}
      </td>
      <td className="px-6 py-4">
        {(() => {
          // Display-mapped: hides fully_paid → approved for non-admins
          // even if the row data leaks the raw status.
          const visible = displayStatusFor(quote.status, viewerUser)
          return (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              isSelected ? 'bg-white/15 text-white' : STATUS_STYLES[visible]
            }`}>
              {STATUS_LABELS[visible]}
            </span>
          )
        })()}
      </td>
      <td className={`px-6 py-4 ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
        {quote.createdAt}
      </td>
      <td className="px-6 py-4 text-right">
        {(() => {
          const { customerPrice, discountAmount } = computeCustomerPrice(quote)
          const hasDiscount = (quote.discountPercent ?? 0) > 0
          return (
            <div className="flex flex-col items-end gap-1">
              {/* Retail (customer-facing) price — the prominent figure. */}
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[9px] font-bold uppercase tracking-wide ${isSelected ? 'text-white/45' : 'text-slate-400'}`}>
                  Retail
                </span>
                <span className={`text-base font-bold tabular-nums leading-none ${isSelected ? 'text-amber-300' : 'text-slate-900'}`}>
                  ${customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              {hasDiscount && (
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                  isSelected ? 'bg-white/15 text-emerald-200' : 'bg-emerald-50 text-emerald-700'
                }`}>
                  −${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} · {quote.discountPercent}% off
                </span>
              )}
              {/* Internal cost — smaller, secondary. */}
              <span className={`text-[10px] font-medium tabular-nums ${isSelected ? 'text-white/45' : 'text-slate-400'}`}>
                Cost ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )
        })()}
      </td>
      <td className="px-3 py-4">
        <div className="flex items-center justify-end gap-1.5">
          <CopyShareLinkButton token={quote.publicToken} iconOnly />
          <OpenQuoteButton token={quote.publicToken} iconOnly />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDuplicate() }}
            title="Duplicate this quote and adjust"
            aria-label="Duplicate quote"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
              isSelected
                ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              title="Delete this quote"
              aria-label="Delete quote"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                isSelected
                  ? 'border-white/30 bg-white/10 text-white hover:bg-rose-500/30'
                  : 'border-rose-200 bg-rose-50 text-rose-500 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

export default QuotesListPage