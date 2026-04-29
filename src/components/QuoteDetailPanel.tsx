import {
  CAD_DESIGN_OPTIONS,
  DIAMOND_SIZE_OPTIONS,
  DIAMOND_TYPE_OPTIONS,
  FINGER_SIZE_FEES,
  JEWELRY_METAL_OPTIONS,
  RING_LABOR_OPTIONS,
  SETTING_LABOR_MASTER,
} from '@/constants/config'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import type { QuoteStatus, SavedQuote } from '@/types'
import { Check, RefreshCw, X, XCircle } from 'lucide-react'
import { useState } from 'react'

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
export function QuoteDetailPanel({ quote, onClose, onStatusChange, onRefreshToken, isAdmin = false }: QuoteDetailPanelProps) {
  const [refreshing, setRefreshing] = useState(false)
  const expiration = formatExpiration(quote.publicTokenExpiresAt)

  const handleRefresh = async () => {
    if (!onRefreshToken) return
    setRefreshing(true)
    try { await onRefreshToken(quote.id) }
    finally { setRefreshing(false) }
  }

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

  const showAdminActions = isAdmin
    && onStatusChange
    && (quote.status === 'pending' || quote.status === 'approved' || quote.status === 'rejected')

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
        <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <p className="text-xs uppercase tracking-[0.18em] text-white/60">Quote total</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-1.5 text-sm text-white/70">
            {metalCfg.label} · {ringLaborCfg?.label ?? quote.ringLabor} · {cadCfg?.label ?? quote.cadDesign}
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
