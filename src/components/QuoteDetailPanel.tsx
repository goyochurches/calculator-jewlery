import {
  DIAMOND_TYPE_OPTIONS,
  JEWELRY_METAL_OPTIONS,
} from '@/constants/config'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import type { QuoteCustomerStone, QuoteStatus, QuoteStone, SavedQuote } from '@/types'
import { Check, ChevronDown, ChevronUp, Copy, Eye, RefreshCw, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
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

interface QuoteDetailPanelProps {
  quote: SavedQuote
  onClose: () => void
  /** Optional: only needed when admin actions are allowed in this context */
  onStatusChange?: (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING') => void
  /** Admin-only callback to rotate the share token + reset 3-month expiration. */
  onRefreshToken?: (id: string) => Promise<void> | void
  isAdmin?: boolean
}

/** Renders an absolute date + a "X ago" hint for any ISO timestamp. */
function formatLastOpened(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const now = Date.now()
  const diffMs = now - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  const hours   = Math.floor(diffMs / 3_600_000)
  const days    = Math.floor(diffMs / 86_400_000)
  const relative =
    minutes < 1 ? 'just now' :
    minutes < 60 ? `${minutes} min ago` :
    hours   < 24 ? `${hours} h ago` :
    days    <  7 ? `${days} d ago` :
    date.toLocaleDateString()
  return `${date.toLocaleString()} (${relative})`
}

function formatExpiration(iso: string | null | undefined): { label: string; expired: boolean } {
  if (!iso) return { label: 'No expiration', expired: false }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { label: 'No expiration', expired: false }
  const now = new Date()
  const expired = date.getTime() < now.getTime()
  if (expired) return { label: `Expired ${date.toLocaleDateString()}`, expired: true }
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 14) return { label: `Expires in ${diffDays} day${diffDays === 1 ? '' : 's'}`, expired: false }
  return { label: `Expires ${date.toLocaleDateString()}`, expired: false }
}

/**
 * Side-panel rendering of a quote's full breakdown. Used by:
 *   - QuotesList.tsx (the original "approvals" view)
 *   - ClientDetail.tsx (browse a client's quotes without leaving the page)
 *
 * Looks up labels through the shared constants so old quotes still render
 * even when their stored keys (small/medium/etc.) no longer match the
 * current spec.
 */
type StoneRole = 'MAIN' | 'SIDE' | 'MELEE'

const ROLE_THEME: Record<StoneRole, { label: string; dot: string; ring: string; tint: string; chip: string }> = {
  MAIN:  { label: 'Main',  dot: 'bg-amber-500',   ring: 'border-amber-200',   tint: 'bg-amber-50/40',   chip: 'bg-amber-100 text-amber-800' },
  SIDE:  { label: 'Side',  dot: 'bg-sky-500',     ring: 'border-sky-200',     tint: 'bg-sky-50/40',     chip: 'bg-sky-100 text-sky-800' },
  MELEE: { label: 'Melee', dot: 'bg-emerald-500', ring: 'border-emerald-200', tint: 'bg-emerald-50/40', chip: 'bg-emerald-100 text-emerald-800' },
}

export function QuoteDetailPanel({ quote, onClose, onStatusChange, onRefreshToken, isAdmin = false }: QuoteDetailPanelProps) {
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)
  const handleDuplicate = () => {
    onClose()
    navigate('/quotes', { state: { duplicateFrom: quote } })
  }
  // Per-stone expand/collapse state. Keys are `${role}-${index}`. We seed the
  // set with every stone so the detail view shows the full information by
  // default — the user can still collapse individual rows with the chevron.
  const [expandedStones, setExpandedStones] = useState<Set<string>>(() => {
    const seen: Record<string, number> = {}
    const keys: string[] = []
    for (const s of (quote.stones ?? [])) {
      const idx = (seen[s.role] ?? 0)
      keys.push(`${s.role}-${idx}`)
      seen[s.role] = idx + 1
    }
    return new Set(keys)
  })
  const toggleStone = (key: string) => setExpandedStones(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  // When the user navigates to a different quote, re-expand every stone so
  // the new detail view also shows everything by default.
  useEffect(() => {
    const seen: Record<string, number> = {}
    const keys: string[] = []
    for (const s of (quote.stones ?? [])) {
      const idx = (seen[s.role] ?? 0)
      keys.push(`${s.role}-${idx}`)
      seen[s.role] = idx + 1
    }
    setExpandedStones(new Set(keys))
  }, [quote.id])
  const config = useQuoteConfig()
  const expiration = formatExpiration(quote.publicTokenExpiresAt)

  const handleRefresh = async () => {
    if (!onRefreshToken) return
    setRefreshing(true)
    try { await onRefreshToken(quote.id) }
    finally { setRefreshing(false) }
  }

  const metalCfg = JEWELRY_METAL_OPTIONS[quote.metal] ?? { label: quote.metal }
  const JEWELRY_TYPE_LABELS: Record<string, string> = {
    ring: 'Ring', pendant: 'Pendant', necklace: 'Necklace', bracelet: 'Bracelet',
    earrings: 'Earrings', cufflinks: 'Cufflinks', brooch: 'Brooch', anklet: 'Anklet',
    other: 'Other',
  }
  const jewelryTypeLabel = quote.jewelryType ? (JEWELRY_TYPE_LABELS[quote.jewelryType] ?? quote.jewelryType) : null
  const ringLaborCfg = config.ringLaborMap[quote.ringLabor]
  // Quotes saved before the multi-stone refactor only have the legacy diamond_*
  // fields. Synthesize a single MAIN entry so the detail still renders the
  // section breakdown instead of an empty placeholder.
  const persistedStones: QuoteStone[] = quote.stones ?? []
  const stones: QuoteStone[] = persistedStones.length === 0 && (quote.diamondCarats ?? 0) > 0
    ? [{
        role: 'MAIN',
        stoneType: (quote.diamondType as QuoteStone['stoneType']) ?? 'natural',
        sizeKey: quote.diamondSize ?? '',
        carats: quote.diamondCarats ?? 0,
        setterType: quote.setterType ?? '',
        labReport: null,
      }]
    : persistedStones
  const isLegacy = persistedStones.length === 0 && stones.length > 0
  const stoneByRole: Record<StoneRole, QuoteStone[]> = {
    MAIN:  stones.filter(s => s.role === 'MAIN'),
    SIDE:  stones.filter(s => s.role === 'SIDE'),
    MELEE: stones.filter(s => s.role === 'MELEE'),
  }

  // Aggregate cost + setting labor from the persisted stones[]. Falls back to
  // the legacy diamondCarats/diamondType/diamondSize fields if a quote was
  // saved before the multi-stone refactor.
  const stoneTotals = stones.reduce((acc, s) => {
    const sizeCfg = config.diamondSizeMap[s.sizeKey]
    const mult = DIAMOND_TYPE_OPTIONS[s.stoneType as keyof typeof DIAMOND_TYPE_OPTIONS]?.multiplier ?? 1
    const pricePerCarat = (sizeCfg?.basePrice ?? 0) * mult
    const setterFee = config.setterMap[s.setterType]?.fee ?? 0
    const ct = sizeCfg?.ctPerStone ?? 0
    const amount = ct > 0 ? Math.round((s.carats ?? 0) / ct) : 0
    const stoneCost = s.manualPrice != null ? s.manualPrice : (s.carats ?? 0) * pricePerCarat
    acc.cost += stoneCost
    acc.labor += amount * setterFee
    acc.carats += s.carats ?? 0
    acc.amount += amount
    return acc
  }, { cost: 0, labor: 0, carats: 0, amount: 0 })

  // Customer-supplied stones only contribute setter labor (the client brings
  // the stone). Quantity multiplies the setter fee.
  const customerStoneFee = (quote.customerStones ?? []).reduce((acc, cs: QuoteCustomerStone) => {
    const qty = Math.max(1, cs.quantity ?? 1)
    const fee = config.setterMap[cs.setterType]?.fee ?? 0
    return acc + qty * fee
  }, 0)

  const showAdminActions = isAdmin
    && onStatusChange
    && (quote.status === 'pending' || quote.status === 'approved' || quote.status === 'rejected')

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{quote.title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Quote #{quote.id} · {quote.createdAt}
            {jewelryTypeLabel ? <> · <span className="font-semibold text-slate-600">{jewelryTypeLabel}</span></> : null}
          </p>
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-1.5">
          <button
            onClick={handleDuplicate}
            title="Duplicate this quote and adjust"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <p className="text-xs uppercase tracking-[0.18em] text-white/60">Quote total</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-1.5 text-sm text-white/70">
            {metalCfg.label} · {ringLaborCfg?.label ?? quote.ringLabor}
          </p>
        </div>

        {/* Share link */}
        {quote.publicToken && (
          <div className={`rounded-2xl border p-4 ${expiration.expired ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Share link
                </p>
                <p className={`mt-1 text-xs ${expiration.expired ? 'text-rose-700' : 'text-slate-500'}`}>
                  {expiration.expired
                    ? 'This share link is expired — refresh it to generate a new one.'
                    : `Send the link to the client. ${expiration.label}.`}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <CopyShareLinkButton token={quote.publicToken} iconOnly={false} />
              {isAdmin && onRefreshToken && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing…' : 'Refresh link'}
                </button>
              )}
            </div>
            {/* Client open-tracking — shows when the customer has actually
                looked at the quote. Stays hidden until first open. */}
            {quote.lastOpenedAt ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                <Eye className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">
                  <strong>Last opened:</strong> {formatLastOpened(quote.lastOpenedAt)}
                  {(quote.openCount ?? 0) > 1 && (
                    <span className="ml-1 text-emerald-700">· {quote.openCount} views</span>
                  )}
                </span>
              </div>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <Eye className="h-3.5 w-3.5 shrink-0" />
                Not opened yet by the client.
              </p>
            )}
          </div>
        )}

        <PhotoDetail src={quote.photo} />

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

        {showAdminActions && (
          <div className="flex gap-2">
            {quote.status !== 'approved' && (
              <button
                onClick={() => onStatusChange!(quote.id, 'APPROVED')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
              >
                <Check className="h-4 w-4" /> Approve
              </button>
            )}
            {quote.status !== 'rejected' && (
              <button
                onClick={() => onStatusChange!(quote.id, 'REJECTED')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600"
              >
                <XCircle className="h-4 w-4" /> Reject
              </button>
            )}
            {quote.status !== 'pending' && (
              <button
                onClick={() => onStatusChange!(quote.id, 'PENDING')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500"
              >
                Reset
              </button>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Spec</p>
          <div className="space-y-2">
            <LineItem label="Metal" value={metalCfg.label} />
            <LineItem label="Weight" value={`${quote.weightGrams ?? 0} g`} />
            <LineItem label="CAD & Jeweler's time" value={ringLaborCfg ? `${ringLaborCfg.label} — $${ringLaborCfg.fee}` : (quote.ringLabor ?? '—')} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Stone setting</p>
          {isLegacy && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Legacy quote — created before the Main / Side / Melee breakdown.
              The values below were reconstructed from the aggregate diamond fields.
            </div>
          )}
          {stones.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-400">
              No stones on this quote.
            </div>
          ) : (
            <div className="space-y-4">
              {(['MAIN', 'SIDE', 'MELEE'] as StoneRole[]).map(role => {
                const items = stoneByRole[role]
                const theme = ROLE_THEME[role]
                const sectionHint = role === 'MAIN'
                  ? 'Center stone (0 or 1).'
                  : role === 'SIDE'
                  ? 'Accent stones.'
                  : 'Pavé / melee stones.'
                // Per-section subtotals so the customer sees cost rolled up by role.
                const sectionTotal = items.reduce((acc, s) => {
                  const sizeCfg = config.diamondSizeMap[s.sizeKey]
                  const mult = DIAMOND_TYPE_OPTIONS[s.stoneType as keyof typeof DIAMOND_TYPE_OPTIONS]?.multiplier ?? 1
                  const ppc = (sizeCfg?.basePrice ?? 0) * mult
                  const ct = sizeCfg?.ctPerStone ?? 0
                  const amount = ct > 0 ? Math.round((s.carats ?? 0) / ct) : 0
                  const stoneCost = s.manualPrice != null ? s.manualPrice : (s.carats ?? 0) * ppc
                  acc.cost += stoneCost
                  acc.labor += amount * (config.setterMap[s.setterType]?.fee ?? 0)
                  acc.carats += s.carats ?? 0
                  acc.amount += amount
                  return acc
                }, { cost: 0, labor: 0, carats: 0, amount: 0 })
                return (
                  <div key={role} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-7 w-7 rounded-xl ${theme.chip} flex items-center justify-center`}>
                          <span className={`h-2 w-2 rounded-full ${theme.dot}`} aria-hidden />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{theme.label} stones <span className="ml-1 text-xs font-medium text-slate-400">· {items.length}</span></p>
                          <p className="text-xs text-slate-500">{sectionHint}</p>
                        </div>
                      </div>
                      {items.length > 0 && (
                        <span className="text-xs text-slate-500">
                          {sectionTotal.amount} stone{sectionTotal.amount === 1 ? '' : 's'} · {Math.round(sectionTotal.carats * 10000) / 10000} ct ·
                          {' '}<strong className="text-slate-900">${(sectionTotal.cost + sectionTotal.labor).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                        </span>
                      )}
                    </div>
                    {items.length === 0 && (
                      <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">None.</p>
                    )}
                    {items.map((s, idx) => {
                      const sizeCfg = config.diamondSizeMap[s.sizeKey]
                      const setter = config.setterMap[s.setterType]
                      const mult = DIAMOND_TYPE_OPTIONS[s.stoneType as keyof typeof DIAMOND_TYPE_OPTIONS]?.multiplier ?? 1
                      const ppc = (sizeCfg?.basePrice ?? 0) * mult
                      const ct = sizeCfg?.ctPerStone ?? 0
                      const amount = ct > 0 ? Math.round((s.carats ?? 0) / ct) : 0
                      const hasManualPrice = s.manualPrice != null
                      const cost = hasManualPrice ? (s.manualPrice ?? 0) : (s.carats ?? 0) * ppc
                      const labor = amount * (setter?.fee ?? 0)
                      const stoneTotal = cost + labor
                      const typeLabel = DIAMOND_TYPE_OPTIONS[s.stoneType as keyof typeof DIAMOND_TYPE_OPTIONS]?.label ?? s.stoneType
                      const stoneKey = `${role}-${idx}`
                      const isExpanded = expandedStones.has(stoneKey)
                      const summaryParts = [
                        s.shape || typeLabel,
                        s.color ? `color ${s.color}` : null,
                        (s.carats ?? 0) > 0 ? `${s.carats} ct` : null,
                        amount > 0 ? `${amount} stone${amount === 1 ? '' : 's'}` : null,
                      ].filter(Boolean)

                      // Collapsed: compact summary card. Clicking expands.
                      if (!isExpanded) {
                        return (
                          <button
                            key={s.id ?? idx}
                            type="button"
                            onClick={() => toggleStone(stoneKey)}
                            className={`group relative w-full overflow-hidden rounded-2xl border ${theme.ring} bg-white text-left shadow-sm transition hover:shadow-md`}
                          >
                            <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.dot}`} aria-hidden />
                            <div className="flex items-center justify-between gap-3 pl-5 pr-3 py-3">
                              <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-2">
                                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${theme.chip}`}>
                                    {theme.label} #{idx + 1}
                                  </span>
                                  <span className="truncate text-sm font-semibold text-slate-900">
                                    {summaryParts.length > 0 ? summaryParts.join(' · ') : typeLabel}
                                  </span>
                                </p>
                                <p className="mt-0.5 truncate text-xs text-slate-500">
                                  {sizeCfg?.label ?? s.sizeKey} · {setter?.label ?? s.setterType ?? 'no setter'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-slate-900 tabular-nums">
                                    ${stoneTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </p>
                                  {hasManualPrice && (
                                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">custom</span>
                                  )}
                                </div>
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-slate-200 group-hover:text-slate-700">
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </span>
                              </div>
                            </div>
                          </button>
                        )
                      }

                      // Expanded: full detail card.
                      return (
                        <div key={s.id ?? idx} className={`relative overflow-hidden rounded-2xl border ${theme.ring} ${theme.tint} px-4 py-3 text-sm shadow-sm`}>
                          <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.dot}`} aria-hidden />
                          <div className="pl-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.chip}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} aria-hidden />
                                {theme.label} stone #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleStone(stoneKey)}
                                aria-label="Collapse"
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                            </div>

                            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-slate-400">Type</dt>
                                <dd className="text-slate-900">{typeLabel}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-slate-400">Size</dt>
                                <dd className="text-slate-900">{sizeCfg?.label ?? s.sizeKey}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-slate-400">Shape</dt>
                                <dd className={s.shape ? 'text-slate-900' : 'text-slate-400'}>{s.shape || '—'}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-slate-400">Color</dt>
                                <dd className={s.color ? 'text-slate-900' : 'text-slate-400'}>{s.color || '—'}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-slate-400">Carats</dt>
                                <dd className="text-slate-900">{s.carats ?? 0} ct</dd>
                              </div>
                              <div>
                                <dt className="font-semibold uppercase tracking-wide text-slate-400">Amount</dt>
                                <dd className="text-slate-900">{amount} stone{amount === 1 ? '' : 's'}</dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="font-semibold uppercase tracking-wide text-slate-400">Type of setting</dt>
                                <dd className="text-slate-900">{setter?.label ?? s.setterType ?? '—'}{setter ? ` — $${setter.fee.toLocaleString('en-US', { minimumFractionDigits: 2 })}/stone` : ''}</dd>
                              </div>
                              {s.role !== 'MELEE' && (
                                <div className="col-span-2">
                                  <dt className="font-semibold uppercase tracking-wide text-slate-400">Lab report</dt>
                                  <dd className={s.labReport ? 'text-slate-900 font-mono' : 'text-slate-400'}>{s.labReport || '— not provided'}</dd>
                                </div>
                              )}
                              {s.comments && (
                                <div className="col-span-2">
                                  <dt className="font-semibold uppercase tracking-wide text-slate-400">Additional comments</dt>
                                  <dd className="whitespace-pre-wrap text-slate-900">{s.comments}</dd>
                                </div>
                              )}
                            </dl>

                            <div className="grid grid-cols-2 gap-2 border-t border-white/70 pt-2 text-xs">
                              <div className="rounded-xl bg-white/70 px-3 py-2">
                                <p className="font-semibold uppercase tracking-wide text-slate-400">
                                  Stone cost
                                  {hasManualPrice && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">custom</span>}
                                </p>
                                <p className="text-sm font-semibold text-slate-900">${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              </div>
                              <div className="rounded-xl bg-white/70 px-3 py-2">
                                <p className="font-semibold uppercase tracking-wide text-slate-400">Setting labor</p>
                                <p className="text-sm font-semibold text-slate-900">${labor.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {(quote.customerStones?.length ?? 0) > 0 && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-1 w-6 rounded-full bg-gradient-to-r from-rose-300 to-pink-600" aria-hidden />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-700">
                  Customer stones · {quote.customerStones?.length}
                </p>
              </div>
              {(quote.customerStones ?? []).map((cs, idx) => {
                const setter = config.setterMap[cs.setterType]
                const qty = Math.max(1, cs.quantity ?? 1)
                const lineFee = qty * (setter?.fee ?? 0)
                return (
                  <div key={cs.id ?? idx}
                    className="relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/70 via-white to-pink-50/40 px-4 py-3 text-sm shadow-sm transition hover:shadow-md">
                    <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-rose-300 via-rose-500 to-pink-600" aria-hidden />
                    <div className="pl-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 text-rose-900 ring-1 ring-rose-200 px-2.5 py-1 text-xs font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
                          Customer stone #{idx + 1}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 tabular-nums">
                          ${lineFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div className="col-span-2">
                          <dt className="font-semibold uppercase tracking-wide text-slate-400">Type of stone</dt>
                          <dd className={cs.gemstoneName ? 'text-slate-900 font-medium' : 'text-slate-400'}>
                            {cs.gemstoneName || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-slate-400">Type of setting</dt>
                          <dd className="text-slate-900">{setter?.label ?? cs.setterType ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold uppercase tracking-wide text-slate-400">Quantity</dt>
                          <dd className="text-slate-900">{qty}{setter ? ` × $${setter.fee}` : ''}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="font-semibold uppercase tracking-wide text-slate-400">Size</dt>
                          <dd className={cs.sizeText ? 'text-slate-900' : 'text-slate-400'}>{cs.sizeText || '—'}</dd>
                        </div>
                        {cs.comments && (
                          <div className="col-span-2">
                            <dt className="font-semibold uppercase tracking-wide text-slate-400">Additional comments</dt>
                            <dd className="whitespace-pre-wrap text-slate-900">{cs.comments}</dd>
                          </div>
                        )}
                      </dl>

                      {cs.photo && (
                        <div className="overflow-hidden rounded-xl border border-rose-200/60 shadow-sm">
                          <img src={cs.photo} alt={`Customer stone ${idx + 1}`} className="w-full object-cover max-h-56" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Cost breakdown</p>
          <div className="space-y-2">
            <LineItem
              label={`Setting supplied diamonds (${stoneTotals.amount} stone${stoneTotals.amount === 1 ? '' : 's'} · ${Math.round(stoneTotals.carats * 10000) / 10000} ct)`}
              value={`$${(stoneTotals.cost + stoneTotals.labor).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            {(quote.customerStones?.length ?? 0) > 0 && (
              <LineItem
                label={`Setting customer diamonds (${quote.customerStones!.length} stone${quote.customerStones!.length === 1 ? '' : 's'})`}
                value={`$${customerStoneFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
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
