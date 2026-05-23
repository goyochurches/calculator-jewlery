import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { quotesService } from '@/services/quotesService'
import type { QuoteStatus, SavedQuote } from '@/types'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { QuoteDetailPanel } from '@/components/QuoteDetailPanel'
import { Bell, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CornerDownRight, Copy, ImageOff, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
  const navigate = useNavigate()
  const isAdmin = user?.role === 'ADMIN'
  const [quotes, setQuotes] = useState<SavedQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  // Which parent groups are expanded. Start collapsed so the listing stays
  // compact; the chevron + "+N revisions" badge makes the affordance obvious.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    quotesService.getAll()
      .then(setQuotes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleStatusChange = async (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING') => {
    try {
      const updated = await quotesService.updateStatus(id, status)
      // Approving a quote auto-rejects every other revision in its group on
      // the server (see QuoteGroupService.rejectGroupMembersExcept). Refetch
      // the full list so those cascaded REJECTED statuses show immediately
      // instead of waiting for the next page load. For non-approval changes
      // an in-place swap is enough.
      if (status === 'APPROVED') {
        const fresh = await quotesService.getAll()
        setQuotes(fresh)
      } else {
        setQuotes((prev) => prev.map((q) => (q.id === id ? updated : q)))
      }
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

  // ── Group quotes into parent + revisions ────────────────────────────
  // A "group" is one top-level (parent) quote plus any revisions created by
  // duplicating it with the same client. Children always show under their
  // root parent — chains stay flat (V28 stores root, not immediate ancestor).
  // If a child's parent was deleted, the child is promoted to a top-level
  // group of its own so it doesn't disappear.
  interface QuoteGroup { parent: SavedQuote; children: SavedQuote[] }
  // Sort newest-first. createdAt is just a date, so tie-break with numeric id
  // DESC (ids are monotonically increasing) — the most recently saved quote
  // of the same day still ends up at the top.
  const newestFirst = (a: SavedQuote, b: SavedQuote): number => {
    const byDate = (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    if (byDate !== 0) return byDate
    return Number(b.id) - Number(a.id)
  }
  // Within-group order: APPROVED first (it's the "winning" revision the
  // admin actually accepted), then everything else newest first. After the
  // cascade rule (V28) only one member can be APPROVED at a time, so this
  // always promotes that one to the visible head of the group regardless of
  // whether it was the original parent or a duplicated revision.
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
      // Flatten root + its children, then reorder so APPROVED is the head.
      const allMembers = [root, ...(childrenByParent.get(root.id) ?? [])]
      allMembers.sort(groupOrder)
      const [head, ...rest] = allMembers
      return { parent: head, children: rest }
    })
    // Top-level group order: by most recent activity in the group, so a
    // group that just got a new revision floats to the top even if its
    // head (the APPROVED one) is older.
    const maxDate = (g: QuoteGroup) =>
      [g.parent, ...g.children].reduce((max, q) =>
        (q.createdAt ?? '') > max ? (q.createdAt ?? '') : max, '')
    out.sort((a, b) => maxDate(b).localeCompare(maxDate(a)))
    return out
  }, [quotes])

  // Apply filters at the GROUP level: a group survives if the parent or any
  // child matches. Children are individually filtered so non-matching ones
  // don't render — but a non-matching parent still appears (grey) as the
  // header for its matching children, so the revision context is preserved.
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const matches = (quote: SavedQuote) => {
      if (statusFilter !== 'all' && quote.status !== statusFilter) return false
      if (!q) return true
      return (
        quote.title.toLowerCase().includes(q) ||
        (quote.clientName ?? '').toLowerCase().includes(q)
      )
    }
    const out: Array<{ parent: SavedQuote; children: SavedQuote[]; parentMatches: boolean }> = []
    for (const g of groups) {
      const parentMatches = matches(g.parent)
      const matchingChildren = g.children.filter(matches)
      if (parentMatches || matchingChildren.length > 0) {
        out.push({ parent: g.parent, children: matchingChildren, parentMatches })
      }
    }
    return out
  }, [groups, statusFilter, searchQuery])

  // Auto-expand groups whose parent doesn't match the filter (their relevant
  // content is in the children). User-controlled toggle still wins for
  // groups whose parent does match.
  const effectivelyExpanded = (groupId: string, parentMatches: boolean) => {
    if (!parentMatches) return true
    return expandedGroups.has(groupId)
  }

  // Reset to page 1 whenever the filter set changes
  useEffect(() => {
    setPage(1)
  }, [statusFilter, searchQuery, pageSize])

  // Pagination operates on GROUPS, so page size is predictable regardless of
  // how many revisions any one parent has.
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = Math.min(pageStart + pageSize, filteredGroups.length)
  const pagedGroups = filteredGroups.slice(pageStart, pageEnd)

  // The detail drawer needs to find any selected quote — parent or child —
  // across the full (unfiltered) set.
  const selected = quotes.find((q) => q.id === selectedId) ?? null

  // Lock body scroll while the detail drawer is open so the underlying
  // table doesn't scroll behind the overlay.
  useEffect(() => {
    if (!selected) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [selected])

  // Close the drawer with Escape.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected])

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
              {filteredGroups.length === groups.length
                ? 'Click any row to see the full breakdown. Duplicates with the same client appear as revisions below their original.'
                : `Showing ${filteredGroups.length} of ${groups.length} quotes.`}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
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
                  {filteredGroups.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-400">
                        No quotes match the current filters.
                      </td>
                    </tr>
                  )}
                  {pagedGroups.flatMap((group) => {
                    const rows: React.ReactNode[] = []
                    const expanded = effectivelyExpanded(group.parent.id, group.parentMatches)
                    const childCount = group.children.length
                    rows.push(
                      <QuoteRow
                        key={group.parent.id}
                        quote={group.parent}
                        kind={group.parentMatches ? 'parent' : 'parent-ghost'}
                        isSelected={group.parent.id === selectedId}
                        onSelect={() => setSelectedId(group.parent.id === selectedId ? null : group.parent.id)}
                        onDuplicate={() => navigate('/quotes', { state: { duplicateFrom: group.parent } })}
                        childCount={childCount}
                        expanded={expanded}
                        canToggle={group.parentMatches && childCount > 0}
                        onToggle={() => toggleGroup(group.parent.id)}
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
                            isSelected={child.id === selectedId}
                            onSelect={() => setSelectedId(child.id === selectedId ? null : child.id)}
                            onDuplicate={() => navigate('/quotes', { state: { duplicateFrom: child } })}
                          />,
                        )
                      })
                    }
                    return rows
                  })}
                </tbody>
              </table>
            </div>
            {filteredGroups.length > 0 && (
              <PaginationBar
                page={safePage}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                total={filteredGroups.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </CardContent>
        </Card>

        {/* Detail drawer — right-docked overlay on every screen size. Wider on
            xl+ to feel like a side panel, full width on phones. */}
        {selected && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setSelectedId(null)}
            />
            <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl xl:max-w-lg">
              <QuoteDetailPanel
                quote={selected}
                onClose={() => setSelectedId(null)}
                onStatusChange={handleStatusChange}
                onRefreshToken={isAdmin ? handleRefreshToken : undefined}
                isAdmin={isAdmin}
              />
            </div>
          </div>
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

/** Single row in the quotes table. Renders three visual variants:
 *   · parent       — full opacity, may show an expand chevron + "N revisions"
 *   · parent-ghost — greyed out, header of a group whose only matching rows
 *                    are children (filter active, parent itself doesn't pass)
 *   · child        — indented with a ↳ arrow, shaded background, smaller chip
 */
function QuoteRow({
  quote, kind, isSelected, onSelect, onDuplicate,
  childCount, expanded, canToggle, onToggle, isLastChild,
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
}) {
  const isChild = kind === 'child'
  const isGhost = kind === 'parent-ghost'
  const hasChildren = !isChild && childCount != null && childCount > 0
  // Visual story:
  //  · parent + has revisions + collapsed → violet tint (invites exploration)
  //  · parent + has revisions + expanded  → amber tint + thicker left border
  //                                          (visually "groups" with its children below)
  //  · plain parent (no revisions)        → neutral
  //  · child                               → indented gray, distinct from parent
  const rowBg = isSelected
    ? 'text-white'
    : isChild
      ? 'bg-slate-50/70 hover:bg-slate-100/80'
      : hasChildren && expanded
        ? 'bg-gradient-to-r from-amber-100 via-orange-50/60 to-transparent hover:from-amber-200/90'
        : hasChildren
          ? 'bg-gradient-to-r from-violet-100/80 via-fuchsia-50/40 to-transparent hover:from-violet-200/90'
          : 'hover:bg-slate-50/80'
  // Strong left accent bar so the eye catches "this one has history" at a
  // glance even before reading the badge. Color matches the expanded/collapsed
  // state of the row so they're consistent.
  const leftAccent = !isSelected && hasChildren
    ? expanded
      ? 'border-l-4 border-l-amber-400'
      : 'border-l-4 border-l-violet-400'
    : isChild && !isSelected
      ? 'border-l-4 border-l-slate-200'
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
            <CornerDownRight className={`h-4 w-4 shrink-0 ${isSelected ? 'text-white/60' : 'text-slate-300'}`} aria-hidden />
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
          <span className={`font-semibold ${isSelected ? 'text-white' : isChild ? 'text-slate-700' : 'text-slate-900'}`}>
            {quote.title}
          </span>
          {!isChild && childCount != null && childCount > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggle?.() }}
              disabled={!canToggle}
              title={expanded ? 'Hide revisions' : `Show ${childCount} revision${childCount === 1 ? '' : 's'}`}
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
              {expanded ? 'Hide' : 'Show'} {childCount} {childCount === 1 ? 'revision' : 'revisions'}
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
        <div className="flex items-center justify-end gap-1.5">
          <CopyShareLinkButton token={quote.publicToken} iconOnly={false} />
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
        </div>
      </td>
    </tr>
  )
}

export default QuotesListPage