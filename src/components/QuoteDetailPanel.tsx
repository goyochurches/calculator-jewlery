import {
  DIAMOND_TYPE_OPTIONS,
  JEWELRY_METAL_OPTIONS,
} from '@/constants/config'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { useFeatures } from '@/hooks/useFeatures'
import type { QuoteCustomerStone, QuoteStatus, QuoteStone, SavedQuote } from '@/types'
import { PaymentPlanBlock } from '@/components/PaymentPlanBlock'
import { useAuth } from '@/context/AuthContext'
import { canSeePayments } from '@/lib/paymentsAccess'
import { displayStatusFor } from '@/lib/quoteStatusDisplay'
import { quotesService } from '@/services/quotesService'
import { NoticeDialog } from '@/components/NoticeDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, Eye, FileDown, MessageCircle, RefreshCw, Trash2, X, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
  /** Admin-only callback to permanently delete the quote. When provided (and
   *  the viewer is an admin) a Delete button shows in the header. */
  onDelete?: (id: string) => Promise<void> | void
  isAdmin?: boolean
  /** Fires when the embedded PaymentPlanBlock detects a change that may
   *  have moved the parent quote's status (refund completed, payment
   *  received, plan saved). The host page wires this up to refetch its
   *  list so the cascade FULLY_PAID ↔ APPROVED becomes visible without
   *  a manual reload. */
  onPaymentChanged?: () => void
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

export function QuoteDetailPanel({ quote, onClose, onStatusChange, onRefreshToken, onDelete, isAdmin = false, onPaymentChanged }: QuoteDetailPanelProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isEnabled } = useFeatures()
  const canSeePayments_ = canSeePayments(user)
  const [refreshing, setRefreshing] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  // Delete confirmation flow — gated behind a two-button ConfirmDialog so a
  // misclick can't wipe a quote (the action is irreversible).
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const handleDuplicate = () => {
    onClose()
    navigate('/quotes', { state: { duplicateFrom: quote } })
  }
  /** One-button modal replacing native alert() for errors/notices. */
  const [notice, setNotice] = useState<{ title: string; description?: string; variant?: 'error' | 'success' | 'info' } | null>(null)
  const handleDownloadPdf = async () => {
    setPdfLoading(true)
    try { await quotesService.downloadPdf(quote.id) }
    catch (err) {
      setNotice({ title: 'Could not download the PDF', description: err instanceof Error ? err.message : undefined, variant: 'error' })
    } finally { setPdfLoading(false) }
  }
  // Send the public quote link to the client via their preferred channel.
  const [sendingLink, setSendingLink] = useState<'idle' | 'sending' | 'sent'>('idle')
  const handleSendLink = async () => {
    setSendingLink('sending')
    try {
      const r = await quotesService.sendLinkToClient(quote.id)
      if (r.ok) {
        setSendingLink('sent')
        setTimeout(() => setSendingLink('idle'), 3000)
      } else {
        setNotice({ title: 'The link could not be sent', description: r.error ?? 'Please try again.', variant: 'error' })
        setSendingLink('idle')
      }
    } catch (err) {
      setNotice({ title: 'The link could not be sent', description: err instanceof Error ? err.message : undefined, variant: 'error' })
      setSendingLink('idle')
    }
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
  // Customer-facing price = ((cost - engraving - customMainPool) × markup
  //   + customMainPool×customMarkup + engraving) × (1 - discount/100).
  // Falls back to the legacy 2.5× / 0% for quotes saved before V22 / V27.
  // A non-null customerPriceOverride short-circuits the entire pipeline.
  const ENGRAVING_FEE = 150
  const markup = quote.markupMultiplier ?? 2.5
  const discount = Math.max(0, Math.min(100, quote.discountPercent ?? 0))
  const engraveFee = quote.engraving ? ENGRAVING_FEE : 0
  let _customMainRaw = 0
  let _customMainMarkedUp = 0
  for (const s of (quote.stones ?? [])) {
    if (s.markupMultiplier == null || s.contribution == null) continue
    _customMainRaw      += s.contribution
    _customMainMarkedUp += s.contribution * s.markupMultiplier
  }
  const _genericPool = quote.total - engraveFee - _customMainRaw
  const customerPriceBeforeDiscount = _genericPool * markup + _customMainMarkedUp + engraveFee
  const discountAmount = customerPriceBeforeDiscount * (discount / 100)
  const customerPriceAfterDiscount = customerPriceBeforeDiscount - discountAmount
  // 7.75% sales tax applied on top when the seller toggled it on.
  const SALES_TAX_RATE = 0.0775
  const applyTaxes = !!quote.applyTaxes
  const taxAmount = applyTaxes ? customerPriceAfterDiscount * SALES_TAX_RATE : 0
  const customerPrice = quote.customerPriceOverride != null
    ? quote.customerPriceOverride
    : customerPriceAfterDiscount + taxAmount

  const handleRefresh = async () => {
    if (!onRefreshToken) return
    setRefreshing(true)
    try { await onRefreshToken(quote.id) }
    finally { setRefreshing(false) }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete(quote.id)
      // Host closes the drawer + drops the row from its list; nothing else to do.
    } catch (err) {
      setConfirmDelete(false)
      setNotice({ title: 'Could not delete the quote', description: err instanceof Error ? err.message : undefined, variant: 'error' })
    } finally {
      setDeleting(false)
    }
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
    const sizeCfg = config.diamondSizeFor(s.stoneType, s.sizeKey)
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
  // Summed quantity (not row count) so the cost breakdown reflects how many
  // customer stones are actually being set.
  const customerStoneQty = (quote.customerStones ?? []).reduce(
    (acc, cs: QuoteCustomerStone) => acc + Math.max(1, cs.quantity ?? 1), 0,
  )

  const showAdminActions = isAdmin
    && onStatusChange
    && (quote.status === 'pending' || quote.status === 'approved' || quote.status === 'rejected')

  return (
    <div className="flex flex-col">
      <NoticeDialog
        open={notice !== null}
        title={notice?.title ?? ''}
        description={notice?.description}
        variant={notice?.variant ?? 'info'}
        onClose={() => setNotice(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this quote?"
        description={<>This permanently deletes <strong>{quote.title}</strong> (Quote #{quote.id}) and cannot be undone.</>}
        confirmLabel="Delete quote"
        cancelLabel="Keep it"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{quote.title}</h2>
            {canSeePayments_ && isEnabled('payments') && <PaymentSummaryBadge quote={quote} />}
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Quote #{quote.id} · {quote.createdAt}
            {jewelryTypeLabel ? <> · <span className="font-semibold text-slate-600">{jewelryTypeLabel}</span></> : null}
          </p>
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-1.5">
          {isEnabled('quote-pdf') && (
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              title="Download branded PDF (same layout as the customer share link)"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
            >
              <FileDown className="h-3.5 w-3.5" />
              {pdfLoading ? 'Opening…' : 'PDF'}
            </button>
          )}
          <button
            onClick={handleDuplicate}
            title="Duplicate this quote and adjust"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          {isAdmin && onDelete && isEnabled('quote-delete') && (
            <button
              onClick={() => setConfirmDelete(true)}
              title="Permanently delete this quote"
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
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
          <p className="text-xs uppercase tracking-[0.18em] text-white/60">Customer price</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            ${customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          {/* Our cost sits below the customer price, mirroring the quote builder. */}
          <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Our cost</span>
            <span className="text-lg font-semibold tabular-nums text-white">
              ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="mt-2 text-sm text-white/70">
            {metalCfg.label} · {ringLaborCfg?.label ?? quote.ringLabor}
          </p>
          {quote.publicToken && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85">
              <Eye className="h-3 w-3" />
              Customer sees{' '}
              <strong className="font-semibold text-amber-300">
                ${customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </strong>
              {' '}via share link · {quote.customerPriceOverride != null
                ? 'custom total (markup/discount/tax bypassed)'
                : `markup ${markup}×${discount > 0 ? `, −${discount}%` : ''}${applyTaxes ? ', +7.75% tax' : ''}`}
            </p>
          )}
          {quote.customerPriceOverride != null && (
            <p className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-2xl border border-amber-300/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-medium text-amber-100">
              <span className="shrink-0 font-bold uppercase tracking-wider text-amber-200">Custom total</span>
              {quote.customerPriceOverrideReason && (
                <span className="break-words text-amber-100/90">— {quote.customerPriceOverrideReason}</span>
              )}
            </p>
          )}
          {quote.customerPriceOverride == null && discount > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
              Discount −${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({discount}% off ${customerPriceBeforeDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })})
            </p>
          )}
          {/* Tax status block — always visible, shows ON or OFF so the
              jeweler knows at a glance whether sales tax is applied. */}
          {quote.customerPriceOverride == null && (
          <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${
            applyTaxes
              ? 'bg-emerald-500/15 border-emerald-300/40'
              : 'bg-white/5 border-white/15'
          }`}>
            {applyTaxes ? (
              <>
                <div className="flex items-center justify-between text-emerald-200">
                  <span className="font-bold uppercase tracking-wider">Sales tax 7.75% applied</span>
                  <span className="font-bold tabular-nums">+${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-emerald-100/80">
                  <span>Subtotal (before tax)</span>
                  <span className="tabular-nums">${customerPriceAfterDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between text-white/70">
                <span className="font-semibold uppercase tracking-wider">Sales tax 7.75%</span>
                <span className="font-medium">Not applied</span>
              </div>
            )}
          </div>
          )}
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
              {quote.status === 'approved' && isEnabled('quote-send-link') && (
                <button
                  onClick={handleSendLink}
                  disabled={sendingLink === 'sending'}
                  title="Send the quote link to the client via their preferred channel (SMS / WhatsApp)"
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {sendingLink === 'sending'
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : sendingLink === 'sent'
                      ? <Check className="h-3.5 w-3.5" />
                      : <MessageCircle className="h-3.5 w-3.5" />}
                  {sendingLink === 'sending' ? 'Sending…' : sendingLink === 'sent' ? 'Sent!' : 'Send to client'}
                </button>
              )}
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

        {/* WhatsApp notifications — visible to admins so they can verify the
            approval flow worked (or diagnose why a message didn't go out). */}
        <WhatsAppNotificationsBlock quote={quote} />

        <PhotoDetail src={quote.photo} />

        <div className="flex gap-3">
          <div className="flex-1 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Created by</p>
            <div className="mt-2 flex items-center gap-2">
              {quote.createdByPhoto ? (
                <img src={quote.createdByPhoto} alt={quote.createdBy}
                  className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
              ) : (
                <Avatar name={quote.createdBy} />
              )}
              <p className="text-sm font-semibold text-slate-900">{quote.createdBy}</p>
            </div>
          </div>
          <div className="flex-1 rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Status</p>
            <div className="mt-2">
              {(() => {
                // Belt-and-braces: even if a stale response leaks
                // fully_paid to a non-admin, the helper normalises it
                // to approved before the badge renders.
                const visible = displayStatusFor(quote.status, user)
                return (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[visible]}`}>
                    {STATUS_LABELS[visible]}
                  </span>
                )
              })()}
            </div>
          </div>
        </div>

        {quote.clientName && (
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Client</p>
            {quote.client?.id != null ? (
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/clients/${quote.client!.id}`) }}
                title="Open client detail"
                className="mt-1.5 inline-flex items-center gap-1 text-left text-sm font-semibold text-indigo-600 underline underline-offset-2 decoration-indigo-300 transition hover:text-indigo-700 hover:decoration-indigo-500"
              >
                {quote.clientName}
                <span aria-hidden className="text-xs">→</span>
              </button>
            ) : (
              <p className="mt-1.5 text-sm font-semibold text-slate-900">{quote.clientName}</p>
            )}
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
                  const sizeCfg = config.diamondSizeFor(s.stoneType, s.sizeKey)
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
                      const sizeCfg = config.diamondSizeFor(s.stoneType, s.sizeKey)
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
                              {s.cut && (
                                <div>
                                  <dt className="font-semibold uppercase tracking-wide text-slate-400">Cut</dt>
                                  <dd className="text-slate-900">{s.cut}</dd>
                                </div>
                              )}
                              {s.clarity && (
                                <div>
                                  <dt className="font-semibold uppercase tracking-wide text-slate-400">Clarity</dt>
                                  <dd className="text-slate-900">{s.clarity}</dd>
                                </div>
                              )}
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

        {quote.customerNotes && quote.customerNotes.trim() !== '' && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Customer-facing notes
              </p>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                Shown to client
              </span>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{quote.customerNotes}</p>
            </div>
          </div>
        )}

        {quote.internalNotes && quote.internalNotes.trim() !== '' && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Internal notes
              </p>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                Not shown to client
              </span>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{quote.internalNotes}</p>
            </div>
          </div>
        )}

        {(quote.attachments?.length ?? 0) > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Internal attachments · {quote.attachments?.length}
              </p>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                Not shown to client
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {quote.attachments?.map((a, idx) => (
                <a
                  key={a.id ?? idx}
                  href={a.photo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                  title={a.caption ?? `Attachment ${idx + 1}`}
                >
                  <img src={a.photo} alt={a.caption ?? `Attachment ${idx + 1}`}
                    className="w-full object-cover max-h-48 transition group-hover:scale-[1.02]" />
                  <div className="space-y-0.5 px-3 py-2">
                    {a.caption && (
                      <p className="text-xs font-medium text-slate-700 line-clamp-2">{a.caption}</p>
                    )}
                    <p className="text-[10px] text-slate-400">
                      {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Cost breakdown</p>
          <div className="space-y-2">
            <LineItem
              label={`Setting supplied diamonds (${stoneTotals.amount} stone${stoneTotals.amount === 1 ? '' : 's'} · ${Math.round(stoneTotals.carats * 10000) / 10000} ct)`}
              value={`$${(stoneTotals.cost + stoneTotals.labor).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            {(quote.customerStones?.length ?? 0) > 0 && (
              <LineItem
                label={`Setting customer diamonds (${customerStoneQty} stone${customerStoneQty === 1 ? '' : 's'})`}
                value={`$${customerStoneFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            )}
            <LineItem label="Hand engraving (milgrain)" value={quote.engraving ? '$150.00' : '$0.00'} />
            {quote.extraCosts > 0 && (
              <LineItem label="Extra costs" value={`$${quote.extraCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            )}
            {applyTaxes && (
              <LineItem
                label="Sales tax (7.75%) · added to customer total"
                value={`$${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              />
            )}
          </div>
        </div>

        {/* Payment plan — splits the customer-facing total into Stripe
            checkout sessions the jeweler can copy and paste. Admin-only
            and gated by the FEATURES.payments flag. Also hidden on
            REJECTED quotes — the deal is dead, no payments to collect. */}
        {canSeePayments_ && isEnabled('payments') && quote.status !== 'rejected' && (
          <PaymentPlanBlock
            quoteId={quote.id}
            total={customerPrice}
            clientPhone={quote.client?.phone ?? null}
            quoteTitle={quote.title}
            onPaymentChanged={onPaymentChanged}
          />
        )}
      </div>
    </div>
  )
}

/** Full WhatsApp / approval-link activity timeline for the quote. Renders
 *  every event in chronological order so the admin gets a "history of what
 *  happened with this quote" view — useful for diagnosing missed messages
 *  or just confirming that the customer actually opened the share link.
 *
 *  Event types (each becomes one row when there's data for it):
 *   1. Approval link → Admin               (PENDING quote was created with discount > 15%)
 *   2. Admin decision via link              (admin clicked approve/reject on the WhatsApp link)
 *   3. Share link → Creator                 (quote was approved, creator gets the public link)
 *   4. Customer opened → Creator            (customer opened the share link; cooldown 30 min)
 */
function WhatsAppNotificationsBlock({ quote }: { quote: SavedQuote }) {
  type Event = {
    key: string
    at: string | null
    /** Stable rank so events without a timestamp still order naturally. */
    seq: number
    row: React.ReactNode
  }
  const events: Event[] = []

  if (quote.pendingWhatsappStatus != null || quote.pendingWhatsappTo != null || quote.pendingWhatsappError != null) {
    events.push({
      key: 'pending',
      at: quote.pendingWhatsappSentAt ?? null,
      seq: 1,
      row: <WhatsAppRow
        title="Approval link → Admin"
        subtitle="Sent when the quote was saved as Pending (discount > 15%)."
        sentAt={quote.pendingWhatsappSentAt ?? null}
        to={quote.pendingWhatsappTo ?? null}
        toLabel={null}
        status={quote.pendingWhatsappStatus ?? null}
        error={quote.pendingWhatsappError ?? null}
      />,
    })
  }

  if (quote.approvalActionAt != null && quote.approvalAction != null) {
    events.push({
      key: 'admin-action',
      at: quote.approvalActionAt,
      seq: 2,
      row: <AdminActionRow
        action={quote.approvalAction}
        at={quote.approvalActionAt}
        reason={quote.approvalRejectionReason ?? null}
      />,
    })
  }

  if (quote.approvalWhatsappStatus != null || quote.approvalWhatsappError != null) {
    events.push({
      key: 'approval',
      at: quote.approvalWhatsappSentAt ?? null,
      seq: 3,
      row: <WhatsAppRow
        title="Share link → Creator"
        subtitle="Sent when the quote was approved, so the creator can forward the public link to the customer."
        sentAt={quote.approvalWhatsappSentAt ?? null}
        to={null}
        toLabel={quote.createdBy ?? null}
        status={quote.approvalWhatsappStatus ?? null}
        error={quote.approvalWhatsappError ?? null}
      />,
    })
  }

  if (quote.openedWhatsappStatus != null || quote.openedWhatsappError != null) {
    const openCount = quote.openCount ?? 0
    const repeatNote = openCount > 1
      ? ` · customer has opened ${openCount} time${openCount === 1 ? '' : 's'} total (repeats within 30 min collapse into one notification)`
      : ' · further opens within 30 min collapse into one notification'
    events.push({
      key: 'opened',
      at: quote.openedWhatsappSentAt ?? null,
      seq: 4,
      row: <WhatsAppRow
        title="Customer opened → Creator"
        subtitle={`Sent when the customer opened the share link${repeatNote}.`}
        sentAt={quote.openedWhatsappSentAt ?? null}
        to={null}
        toLabel={quote.createdBy ?? null}
        status={quote.openedWhatsappStatus ?? null}
        error={quote.openedWhatsappError ?? null}
      />,
    })
  }

  if (events.length === 0) return null

  // Chronological order (oldest first — reads top→bottom as the lifecycle
  // of the quote). Events missing a timestamp fall back to their natural
  // sequence (creation → admin action → creator notified → customer opens).
  events.sort((a, b) => {
    if (a.at && b.at) return a.at.localeCompare(b.at)
    if (a.at) return -1
    if (b.at) return 1
    return a.seq - b.seq
  })

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          WhatsApp notifications · timeline
        </p>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          Internal
        </span>
      </div>
      {events.map((e) => <div key={e.key}>{e.row}</div>)}
    </div>
  )
}

/** Compact row recording when (and how) the admin took action via the
 *  WhatsApp approval link. Distinct visual from the WhatsApp rows because
 *  this isn't a message send — it's the admin's decision being captured. */
function AdminActionRow({ action, at, reason }: { action: 'APPROVED' | 'REJECTED'; at: string; reason?: string | null }) {
  const isApproved = action === 'APPROVED'
  const tone = isApproved ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
  const iconTone = isApproved ? 'text-emerald-600' : 'text-rose-600'
  const Icon = isApproved ? Check : XCircle
  const label = isApproved ? 'Approved via link' : 'Rejected via link'
  const chipTone = isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
  return (
    <div className={`rounded-2xl border ${tone} p-3`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconTone}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900">Admin decision via WhatsApp link</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chipTone}`}>
              {label}
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            The admin opened the approval link in WhatsApp and clicked {isApproved ? 'Approve' : 'Reject'}.
          </p>
          {!isApproved && reason && (
            <div className="mt-1 rounded-lg bg-white/70 px-2 py-1.5 text-[11px] text-rose-800">
              <strong>Reason:</strong> <span className="whitespace-pre-wrap">{reason}</span>
            </div>
          )}
          <p className="text-xs text-slate-700">
            <span className="text-slate-400">When: </span>
            <span className="font-mono">{new Date(at).toLocaleString()}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function WhatsAppRow({ title, subtitle, sentAt, to, toLabel, status, error }: {
  title: string
  subtitle: string
  /** When the message went out (so the timeline reads top→bottom in order). */
  sentAt: string | null
  /** Phone number the message was texted to. */
  to: string | null
  /** Human name of the recipient (when phone isn't echoed — e.g. creator). */
  toLabel: string | null
  status: string | null
  error: string | null
}) {
  const s = (status ?? '').toUpperCase()
  const isOk       = ['SENT', 'DELIVERED', 'READ'].includes(s)
  const isQueued   = ['QUEUED', 'SENDING', 'ACCEPTED'].includes(s) && !isOk
  const isMissing  = s === 'NOT_CONFIGURED' || s === 'NO_RECIPIENT'
  // A true "error" is when Twilio/UltraMsg returned a failure. NO_RECIPIENT
  // gets its own amber treatment (missing config / phone) so users can tell
  // the difference at a glance between "the gateway refused it" and "we
  // never even tried because nobody told us where to send".
  const isError    = (['FAILED', 'UNDELIVERED'].includes(s) || (!!error && !isMissing)) && !isOk

  const tone = isError   ? 'border-rose-200 bg-rose-50'
             : isOk      ? 'border-emerald-200 bg-emerald-50'
             : isQueued  ? 'border-amber-200 bg-amber-50'
             : isMissing ? 'border-amber-200 bg-amber-50/60'
             : 'border-slate-200 bg-white'

  const Icon = isError || isMissing ? AlertTriangle : isOk ? Check : MessageCircle
  const iconTone = isError ? 'text-rose-600' : isOk ? 'text-emerald-600' : (isQueued || isMissing) ? 'text-amber-600' : 'text-slate-500'

  const statusLabel = isOk      ? 'Delivered ✓'
                    : isError   ? 'Failed ✗'
                    : isQueued  ? 'Queued / sending'
                    : s === 'NO_RECIPIENT'  ? 'Not sent — no recipient'
                    : s === 'NOT_CONFIGURED' ? 'Not sent — gateway not configured'
                    : !s ? 'Not sent'
                    : s

  // Strip the "whatsapp:" prefix when displaying so the phone reads cleanly.
  const prettyPhone = to ? to.replace(/^whatsapp:/i, '') : null

  // Color of the explanation box: rose for real failures, amber for the
  // "missing config / no phone" case (it's a setup problem, not a delivery error).
  const reasonTone = isError
    ? 'bg-white/70 text-rose-700'
    : 'bg-white/70 text-amber-800'
  const reasonLabel = isError
    ? 'Error'
    : isMissing
      ? 'Reason not sent'
      : 'Note'

  return (
    <div className={`rounded-2xl border ${tone} p-3`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconTone}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900">{title}</p>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              isError   ? 'bg-rose-100 text-rose-700' :
              isOk      ? 'bg-emerald-100 text-emerald-700' :
              isQueued  ? 'bg-amber-100 text-amber-700' :
              isMissing ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-500'
            }`}>{statusLabel}</span>
          </div>
          <p className="text-[11px] text-slate-500">{subtitle}</p>

          {(prettyPhone || toLabel) && (
            <p className="text-xs text-slate-700">
              <span className="text-slate-400">To: </span>
              {toLabel && <span className="font-semibold">{toLabel}</span>}
              {toLabel && prettyPhone && <span className="text-slate-400"> · </span>}
              {prettyPhone && <span className="font-mono">{prettyPhone}</span>}
            </p>
          )}

          {sentAt && (
            <p className="text-xs text-slate-700">
              <span className="text-slate-400">Sent: </span>
              <span className="font-mono">{new Date(sentAt).toLocaleString()}</span>
            </p>
          )}

          {/* Friendly explanation when the send didn't go (no phone /
              gateway not configured) so the user knows exactly what to fix. */}
          {!prettyPhone && !toLabel && isMissing && (
            <p className="text-xs text-amber-800">
              <span className="text-slate-400">To: </span>
              <span className="italic">no destination available</span>
            </p>
          )}

          {error && (
            <p className={`mt-1 rounded-lg px-2 py-1.5 text-[11px] ${reasonTone}`}>
              <strong>{reasonLabel}:</strong> {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Compact pill near the quote title summarising payment progress.
 *  Renders nothing when there's no payment plan, a green "Paid" when
 *  fully collected, or an amber "Paid X/Y · $A of $B" while in progress. */
function PaymentSummaryBadge({ quote }: { quote: SavedQuote }) {
  if (!quote.paymentHasPlan) return null
  const paidCount = quote.paymentPaidCount ?? 0
  const totalCount = quote.paymentTotalCount ?? 0
  const paid = quote.paymentTotalPaid ?? 0
  const due = quote.paymentTotalDue ?? 0
  if (quote.paymentFullyPaid) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
        <Check className="h-3 w-3" /> Paid · ${paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
      {paidCount}/{totalCount} paid · ${paid.toLocaleString('en-US', { minimumFractionDigits: 2 })} of ${due.toLocaleString('en-US', { minimumFractionDigits: 2 })}
    </span>
  )
}
