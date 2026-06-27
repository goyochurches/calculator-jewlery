import { DIAMOND_TYPE_OPTIONS, JEWELRY_METAL_OPTIONS } from '@/constants/config'
import {
  Avatar,
  formatExpiration,
  formatLastOpened,
  LineItem,
  PhotoDetail,
  ROLE_THEME,
  STATUS_LABELS,
  STATUS_STYLES,
  type StoneRole,
  WhatsAppNotificationsBlock,
} from '@/components/QuoteDetailPanel'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { OpenQuoteButton } from '@/components/OpenQuoteButton'
import { PaymentPlanBlock } from '@/components/PaymentPlanBlock'
import { NoticeDialog } from '@/components/NoticeDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { useFeatures } from '@/hooks/useFeatures'
import { useAuth } from '@/context/AuthContext'
import { canSeePayments } from '@/lib/paymentsAccess'
import { displayStatusFor } from '@/lib/quoteStatusDisplay'
import { computeCustomerPrice } from '@/lib/quotePricing'
import { labReportVerifyUrl } from '@/hooks/useQuoteBuilder'
import { quotesService } from '@/services/quotesService'
import type { QuoteStone, SavedQuote } from '@/types'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Eye,
  FileDown,
  MessageCircle,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { MarketComparisonPanel } from '@/components/MarketComparisonPanel'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const JEWELRY_TYPE_LABELS: Record<string, string> = {
  ring: 'Ring', rn: 'RN ring', pendant: 'Pendant', necklace: 'Necklace',
  bracelet: 'Bracelet', earrings: 'Earrings', cufflinks: 'Cufflinks',
  brooch: 'Brooch', anklet: 'Anklet', other: 'Other',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
      {children}
    </p>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

// ── Page skeleton ────────────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isEnabled } = useFeatures()
  const config = useQuoteConfig()

  const isAdmin = user?.role === 'ADMIN'
  const canSeePayments_ = canSeePayments(user)

  const [quote, setQuote] = useState<SavedQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // UI state
  const [notice, setNotice] = useState<{ title: string; description?: string; variant?: 'error' | 'success' | 'info' } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [sendingLink, setSendingLink] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [statusLoading, setStatusLoading] = useState(false)
  const [expandedStones, setExpandedStones] = useState<Set<string>>(new Set())

  // Fetch
  useEffect(() => {
    if (!id) return
    setLoading(true)
    quotesService.getById(id)
      .then(q => {
        setQuote(q)
        // Expand all stones by default
        const seen: Record<string, number> = {}
        const keys: string[] = []
        for (const s of q.stones ?? []) {
          const idx = seen[s.role] ?? 0
          keys.push(`${s.role}-${idx}`)
          seen[s.role] = idx + 1
        }
        setExpandedStones(new Set(keys))
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  const toggleStone = (key: string) => setExpandedStones(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  // Mutations
  const handleStatusChange = async (qid: string, status: 'APPROVED' | 'REJECTED' | 'PENDING') => {
    setStatusLoading(true)
    try {
      const updated = await quotesService.updateStatus(qid, status)
      setQuote(updated)
    } catch (err) {
      setNotice({ title: 'Could not update status', description: err instanceof Error ? err.message : undefined, variant: 'error' })
    } finally {
      setStatusLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!quote) return
    setDeleting(true)
    try {
      await quotesService.remove(quote.id)
      navigate('/quotes-list', { replace: true })
    } catch (err) {
      setConfirmDelete(false)
      setNotice({ title: 'Could not delete the quote', description: err instanceof Error ? err.message : undefined, variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const handleRefreshToken = async () => {
    if (!quote) return
    setRefreshing(true)
    try {
      const updated = await quotesService.refreshPublicToken(quote.id)
      setQuote(updated)
    } catch (err) {
      setNotice({ title: 'Could not refresh the link', description: err instanceof Error ? err.message : undefined, variant: 'error' })
    } finally {
      setRefreshing(false)
    }
  }

  const handleSendLink = async () => {
    if (!quote) return
    setSendingLink('sending')
    try {
      const r = await quotesService.sendLinkToClient(quote.id)
      if (r.ok) {
        setSendingLink('sent')
        setTimeout(() => setSendingLink('idle'), 3000)
      } else {
        setNotice({ title: 'The link could not be sent', description: r.error ?? undefined, variant: 'error' })
        setSendingLink('idle')
      }
    } catch (err) {
      setNotice({ title: 'The link could not be sent', description: err instanceof Error ? err.message : undefined, variant: 'error' })
      setSendingLink('idle')
    }
  }

  const handleDownloadPdf = async () => {
    if (!quote) return
    setPdfLoading(true)
    try { await quotesService.downloadPdf(quote.id) }
    catch (err) {
      setNotice({ title: 'Could not download the PDF', description: err instanceof Error ? err.message : undefined, variant: 'error' })
    } finally { setPdfLoading(false) }
  }

  const handleDuplicate = () => {
    if (!quote) return
    navigate('/quotes', { state: { duplicateFrom: quote } })
  }

  // Loading / error states
  if (loading) return <PageSkeleton />
  if (notFound || !quote) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-semibold text-slate-700">Quote not found</p>
        <p className="mt-1 text-sm text-slate-500">It may have been deleted or you don't have access.</p>
        <button onClick={() => navigate('/quotes-list')}
          className="mt-6 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
          Back to quotes
        </button>
      </div>
    )
  }

  // Derived values
  const { customerPrice, beforeDiscount, discountAmount, afterDiscount, taxAmount, applyTaxes } = computeCustomerPrice(quote)
  const markup = quote.markupMultiplier ?? 2.5
  const discount = Math.max(0, Math.min(100, quote.discountPercent ?? 0))
  const metalCfg = JEWELRY_METAL_OPTIONS[quote.metal] ?? { label: quote.metal }
  const jewelryTypeLabel = quote.jewelryType ? (JEWELRY_TYPE_LABELS[quote.jewelryType] ?? quote.jewelryType) : null
  const isRn = quote.jewelryType === 'rn'
  const ringLaborCfg = config.ringLaborMap[quote.ringLabor]
  const engravingFeeUsd = quote.engraving ? (quote.engravingFee ?? 150) : 0
  const engravingFeeLabel = `$${engravingFeeUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const expiration = formatExpiration(quote.publicTokenExpiresAt)

  const persistedStones: QuoteStone[] = quote.stones ?? []
  const stones: QuoteStone[] = persistedStones.length === 0 && (quote.diamondCarats ?? 0) > 0
    ? [{
        role: 'MAIN', stoneType: (quote.diamondType as QuoteStone['stoneType']) ?? 'natural',
        sizeKey: quote.diamondSize ?? '', carats: quote.diamondCarats ?? 0,
        setterType: quote.setterType ?? '', labReport: null,
      }]
    : persistedStones
  const isLegacy = persistedStones.length === 0 && stones.length > 0
  const stoneByRole: Record<StoneRole, QuoteStone[]> = {
    MAIN:  stones.filter(s => s.role === 'MAIN'),
    SIDE:  stones.filter(s => s.role === 'SIDE'),
    MELEE: stones.filter(s => s.role === 'MELEE'),
  }
  const rnStone = isRn ? (stones.find(s => s.role === 'MELEE') ?? stones[0] ?? null) : null
  const rnBlock = (() => {
    if (!isRn) return null
    const notes = quote.internalNotes?.trim()
    if (notes) {
      const paras = notes.split('\n\n')
      if (paras[0]?.startsWith('RN ')) {
        return { lines: paras[0].split('\n'), rest: paras.slice(1).join('\n\n').trim() || null }
      }
    }
    return { lines: [] as string[], rest: notes || null }
  })()
  const internalNotesDisplay = isRn
    ? rnBlock?.rest ?? null
    : (quote.internalNotes?.trim() || null)

  const stoneTotals = stones.reduce((acc, s) => {
    const sizeCfg = config.diamondSizeFor(s.stoneType, s.sizeKey)
    const mult = DIAMOND_TYPE_OPTIONS[s.stoneType as keyof typeof DIAMOND_TYPE_OPTIONS]?.multiplier ?? 1
    const pricePerCarat = (sizeCfg?.basePrice ?? 0) * mult
    const ct = sizeCfg?.ctPerStone ?? 0
    const amount = ct > 0 ? Math.round((s.carats ?? 0) / ct) : 0
    const stoneCost = s.manualPrice != null ? s.manualPrice : (s.carats ?? 0) * pricePerCarat
    acc.cost += stoneCost
    acc.labor += amount * (config.setterMap[s.setterType]?.fee ?? 0)
    acc.carats += s.carats ?? 0
    acc.amount += amount
    return acc
  }, { cost: 0, labor: 0, carats: 0, amount: 0 })

  const customerStoneFee = (quote.customerStones ?? []).reduce((acc, cs) => {
    const qty = Math.max(1, cs.quantity ?? 1)
    return acc + qty * (config.setterMap[cs.setterType]?.fee ?? 0)
  }, 0)
  const customerStoneQty = (quote.customerStones ?? []).reduce(
    (acc, cs) => acc + Math.max(1, cs.quantity ?? 1), 0)

  const showAdminActions = isAdmin && (
    quote.status === 'pending' || quote.status === 'approved' || quote.status === 'rejected'
  )
  const visibleStatus = displayStatusFor(quote.status, user)

  return (
    <>
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

      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start gap-3">
        <button
          onClick={() => navigate('/quotes-list')}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quotes
        </button>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{quote.title}</h1>
          {jewelryTypeLabel && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {jewelryTypeLabel}
            </span>
          )}
          <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${STATUS_STYLES[visibleStatus]}`}>
            {STATUS_LABELS[visibleStatus]}
          </span>
          <span className="text-xs text-slate-400">Quote #{quote.id} · {quote.createdAt}</span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {isEnabled('quote-pdf') && (
            <button onClick={handleDownloadPdf} disabled={pdfLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60">
              <FileDown className="h-3.5 w-3.5" />
              {pdfLoading ? 'Opening…' : 'PDF'}
            </button>
          )}
          <button onClick={handleDuplicate}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
            <Copy className="h-3.5 w-3.5" />
            Duplicate
          </button>
          {isAdmin && isEnabled('quote-delete') && (
            <button onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Price hero */}
          <div className="rounded-2xl p-6 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
            <p className="text-xs uppercase tracking-[0.18em] text-white/60">Customer price</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight">
              ${customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-4 flex items-baseline justify-between gap-3 rounded-xl bg-black/20 px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">Our cost</span>
              <span className="text-xl font-semibold tabular-nums text-white">
                ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="mt-3 text-sm text-white/70">
              {isRn
                ? `${metalCfg.label}${jewelryTypeLabel ? ` · ${jewelryTypeLabel}` : ''}`
                : `${metalCfg.label} · ${ringLaborCfg?.label ?? quote.ringLabor}`}
            </p>
            {quote.publicToken && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85">
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
                Discount −${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({discount}% off ${beforeDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })})
              </p>
            )}
            {quote.customerPriceOverride == null && (
              <div className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${applyTaxes ? 'bg-emerald-500/15 border-emerald-300/40' : 'bg-white/5 border-white/15'}`}>
                {applyTaxes ? (
                  <>
                    <div className="flex items-center justify-between text-emerald-200">
                      <span className="font-bold uppercase tracking-wider">Sales tax 7.75% applied</span>
                      <span className="font-bold tabular-nums">+${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-emerald-100/80">
                      <span>Subtotal (before tax)</span>
                      <span className="tabular-nums">${afterDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
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

          {/* Reference photo */}
          <PhotoDetail src={quote.photo} />

          {/* Spec */}
          <Card>
            <SectionLabel>Spec</SectionLabel>
            <div className="space-y-2">
              <LineItem label="Metal" value={metalCfg.label} />
              <LineItem label="Weight" value={`${quote.weightGrams ?? 0} g`} />
              {(quote.ringWidth ?? 0) > 0 && <LineItem label="Ring width" value={`${quote.ringWidth} mm`} />}
              {(quote.fingerSize ?? 0) > 0 && <LineItem label="Finger size" value={`${quote.fingerSize}`} />}
              {!isRn && (
                <LineItem
                  label="CAD & Jeweler's time"
                  value={ringLaborCfg ? `${ringLaborCfg.label} — $${ringLaborCfg.fee}` : (quote.ringLabor ?? '—')}
                />
              )}
              {(quote.laborHours ?? 0) > 0 && (
                <LineItem
                  label="Bench labor"
                  value={`${quote.laborHours} h × $${quote.hourlyRate}/h = $${((quote.laborHours ?? 0) * (quote.hourlyRate ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                />
              )}
              <LineItem label="Engraving" value={quote.engraving ? `Yes — ${engravingFeeLabel}` : 'No'} />
              {(quote.extraCosts ?? 0) > 0 && (
                <LineItem label="Extra costs" value={`$${quote.extraCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
              )}
            </div>
          </Card>

          {/* RN ring block */}
          {isRn && rnBlock && (
            <Card>
              <SectionLabel>RN ring</SectionLabel>
              <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                {rnBlock.lines.length > 0 ? (() => {
                  const header = rnBlock.lines[0] ?? ''
                  const parts = header.replace(/^RN\s+/, '').split(' · ')
                  const modelKey = parts[0] ?? ''
                  const sz = parts[1] ?? ''
                  const metal = parts[2] ?? ''
                  const stoneLabel = parts[3] ?? ''
                  const isLab = stoneLabel.toLowerCase().includes('lab')
                  return (
                    <>
                      <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">Ready-made band</p>
                            <p className="mt-0.5 text-xl font-bold tracking-tight text-white">{modelKey || 'RN Ring'}</p>
                          </div>
                          <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${isLab ? 'bg-violet-500/25 text-violet-300 ring-1 ring-violet-400/40' : 'bg-amber-500/25 text-amber-300 ring-1 ring-amber-400/40'}`}>
                            {stoneLabel || 'Natural'}
                          </span>
                        </div>
                        {(sz || metal) && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {sz && <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white/75">{sz}</span>}
                            {metal && <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white/75">{metal}</span>}
                            {(quote.diamondAmount ?? 0) > 0 && <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white/75">{quote.diamondAmount} stones</span>}
                            {(quote.diamondCarats ?? 0) > 0 && <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium text-white/75">{(quote.diamondCarats ?? 0).toFixed(2)} ct</span>}
                          </div>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100 bg-white">
                        {rnBlock.lines.slice(1).map((line, i) => {
                          const sep = line.indexOf(': ')
                          const label = sep >= 0 ? line.slice(0, sep) : line
                          const value = sep >= 0 ? line.slice(sep + 2) : ''
                          const isStones = label === 'Stones'
                          return (
                            <div key={i} className={`flex items-center justify-between gap-3 px-4 py-3 ${isStones ? 'bg-amber-50/50' : ''}`}>
                              <span className="text-sm text-slate-500">{label}</span>
                              <span className={`font-semibold tabular-nums text-sm ${isStones ? 'text-amber-900' : 'text-slate-900'}`}>{value}</span>
                            </div>
                          )
                        })}
                      </div>
                      {rnStone?.contribution != null && (
                        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
                          <span className="text-sm font-semibold text-slate-600">Diamonds + Setting</span>
                          <span className="text-sm font-bold text-slate-900 tabular-nums">
                            ${rnStone.contribution.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </>
                  )
                })() : (
                  <div className="divide-y divide-slate-100 bg-white">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="text-sm text-slate-500">Diamonds</span>
                      <span className="text-sm font-semibold text-slate-900">
                        {DIAMOND_TYPE_OPTIONS[quote.diamondType as keyof typeof DIAMOND_TYPE_OPTIONS]?.label ?? quote.diamondType}
                        {(quote.diamondAmount ?? 0) > 0 ? ` · ${quote.diamondAmount} stone${quote.diamondAmount === 1 ? '' : 's'}` : ''}
                        {(quote.diamondCarats ?? 0) > 0 ? ` · ${(quote.diamondCarats ?? 0).toFixed(2)} ct` : ''}
                      </span>
                    </div>
                    {rnStone?.manualPrice != null && (
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm text-slate-500">Diamond cost</span>
                        <span className="text-sm font-semibold text-slate-900">${rnStone.manualPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Stone setting */}
          {!isRn && (
            <Card>
              <SectionLabel>Stone setting</SectionLabel>
              {isLegacy && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Legacy quote — created before the Main / Side / Melee breakdown.
                  The values below were reconstructed from the aggregate diamond fields.
                </div>
              )}
              {stones.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-400">
                  No stones on this quote.
                </div>
              ) : (
                <div className="space-y-4">
                  {(['MAIN', 'SIDE', 'MELEE'] as StoneRole[]).map(role => {
                    const items = stoneByRole[role]
                    const theme = ROLE_THEME[role]
                    const sectionHint = role === 'MAIN' ? 'Center stone (0 or 1).' : role === 'SIDE' ? 'Accent stones.' : 'Pavé / melee stones.'
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
                              {sectionTotal.amount} stone{sectionTotal.amount === 1 ? '' : 's'} · {Math.round(sectionTotal.carats * 10000) / 10000} ct ·{' '}
                              <strong className="text-slate-900">${(sectionTotal.cost + sectionTotal.labor).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
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
                          if (!isExpanded) {
                            return (
                              <button key={s.id ?? idx} type="button"
                                onClick={() => toggleStone(stoneKey)}
                                className={`group relative w-full overflow-hidden rounded-2xl border ${theme.ring} bg-white text-left shadow-sm transition hover:shadow-md`}>
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
                                      <p className="text-sm font-semibold text-slate-900 tabular-nums">${stoneTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                      {hasManualPrice && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">custom</span>}
                                    </div>
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-slate-200">
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    </span>
                                  </div>
                                </div>
                              </button>
                            )
                          }
                          return (
                            <div key={s.id ?? idx} className={`relative overflow-hidden rounded-2xl border ${theme.ring} ${theme.tint} px-4 py-3 text-sm shadow-sm`}>
                              <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.dot}`} aria-hidden />
                              <div className="pl-2 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.chip}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} aria-hidden />
                                    {theme.label} stone #{idx + 1}
                                  </span>
                                  <button type="button" onClick={() => toggleStone(stoneKey)} aria-label="Collapse"
                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-slate-100">
                                    <ChevronUp className="h-4 w-4" />
                                  </button>
                                </div>
                                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                                  <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Type</dt><dd className="text-slate-900">{typeLabel}</dd></div>
                                  <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Size</dt><dd className="text-slate-900">{sizeCfg?.label ?? s.sizeKey}</dd></div>
                                  <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Shape</dt><dd className={s.shape ? 'text-slate-900' : 'text-slate-400'}>{s.shape || '—'}</dd></div>
                                  <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Color</dt><dd className={s.color ? 'text-slate-900' : 'text-slate-400'}>{s.color || '—'}</dd></div>
                                  {s.cut && <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Cut</dt><dd className="text-slate-900">{s.cut}</dd></div>}
                                  {s.clarity && <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Clarity</dt><dd className="text-slate-900">{s.clarity}</dd></div>}
                                  <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Carats</dt><dd className="text-slate-900">{s.carats ?? 0} ct</dd></div>
                                  <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Amount</dt><dd className="text-slate-900">{amount} stone{amount === 1 ? '' : 's'}</dd></div>
                                  {s.markupMultiplier != null && (
                                    <div className="col-span-2">
                                      <dt className="font-semibold uppercase tracking-wide text-slate-400">Stone markup</dt>
                                      <dd className="text-slate-900">{s.markupMultiplier}× <span className="text-slate-400">· overrides the quote-level markup for this stone</span></dd>
                                    </div>
                                  )}
                                  <div className="col-span-2">
                                    <dt className="font-semibold uppercase tracking-wide text-slate-400">Type of setting</dt>
                                    <dd className="text-slate-900">{setter?.label ?? s.setterType ?? '—'}{setter ? ` — $${setter.fee.toLocaleString('en-US', { minimumFractionDigits: 2 })}/stone` : ''}</dd>
                                  </div>
                                  {s.role !== 'MELEE' && (
                                    <div className="col-span-2">
                                      <dt className="font-semibold uppercase tracking-wide text-slate-400">Lab report</dt>
                                      {s.labReport ? (() => {
                                        const verify = labReportVerifyUrl(s.labReport)
                                        return (
                                          <dd className="mt-1 flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-slate-900">{s.labReport}</span>
                                            {verify && (
                                              <a href={verify.url} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 no-underline shadow-sm transition hover:bg-emerald-100">
                                                Verify on {verify.lab}
                                                <ExternalLink className="h-3 w-3" />
                                              </a>
                                            )}
                                          </dd>
                                        )
                                      })() : <dd className="text-slate-400">— not provided</dd>}
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

              {/* Customer stones */}
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
                        className="relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/70 via-white to-pink-50/40 px-4 py-3 text-sm shadow-sm">
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
                              <dd className={cs.gemstoneName ? 'text-slate-900 font-medium' : 'text-slate-400'}>{cs.gemstoneName || '—'}</dd>
                            </div>
                            <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Type of setting</dt><dd className="text-slate-900">{setter?.label ?? cs.setterType ?? '—'}</dd></div>
                            <div><dt className="font-semibold uppercase tracking-wide text-slate-400">Quantity</dt><dd className="text-slate-900">{qty}{setter ? ` × $${setter.fee}` : ''}</dd></div>
                            <div className="col-span-2"><dt className="font-semibold uppercase tracking-wide text-slate-400">Size</dt><dd className={cs.sizeText ? 'text-slate-900' : 'text-slate-400'}>{cs.sizeText || '—'}</dd></div>
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
            </Card>
          )}

          {/* Attachments */}
          {(quote.attachments?.length ?? 0) > 0 && (
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <SectionLabel>Internal attachments · {quote.attachments?.length}</SectionLabel>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">Not shown to client</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {quote.attachments?.map((a, idx) => (
                  <a key={a.id ?? idx} href={a.photo} target="_blank" rel="noopener noreferrer"
                    className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                    title={a.caption ?? `Attachment ${idx + 1}`}>
                    <img src={a.photo} alt={a.caption ?? `Attachment ${idx + 1}`}
                      className="w-full object-cover max-h-48 transition group-hover:scale-[1.02]" />
                    <div className="space-y-0.5 px-3 py-2">
                      {a.caption && <p className="text-xs font-medium text-slate-700 line-clamp-2">{a.caption}</p>}
                      <p className="text-[10px] text-slate-400">{a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}</p>
                    </div>
                  </a>
                ))}
              </div>
            </Card>
          )}

          {/* Cost breakdown */}
          <Card>
            <SectionLabel>Cost breakdown</SectionLabel>
            <div className="space-y-2">
              <LineItem
                label={`Setting supplied diamonds (${stoneTotals.amount} stone${stoneTotals.amount === 1 ? '' : 's'} · ${Math.round(stoneTotals.carats * 10000) / 10000} ct)`}
                value={`$${(stoneTotals.cost + stoneTotals.labor).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              />
              {(quote.customerStones?.length ?? 0) > 0 && (
                <LineItem label={`Setting customer diamonds (${customerStoneQty} stone${customerStoneQty === 1 ? '' : 's'})`}
                  value={`$${customerStoneFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
              )}
              <LineItem label="Hand engraving (milgrain)" value={engravingFeeLabel} />
              {(quote.extraCosts ?? 0) > 0 && (
                <LineItem label="Extra costs" value={`$${quote.extraCosts.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
              )}
              {applyTaxes && (
                <LineItem label="Sales tax (7.75%) · added to customer total"
                  value={`$${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
              )}
            </div>
          </Card>

          {/* Notes */}
          {(quote.customerNotes?.trim() || internalNotesDisplay) && (
            <div className="space-y-4">
              {quote.customerNotes?.trim() && (
                <Card>
                  <div className="mb-3 flex items-center justify-between">
                    <SectionLabel>Customer-facing notes</SectionLabel>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Shown to client</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{quote.customerNotes}</p>
                </Card>
              )}
              {internalNotesDisplay && (
                <Card>
                  <div className="mb-3 flex items-center justify-between">
                    <SectionLabel>Internal notes</SectionLabel>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">Not shown to client</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{internalNotesDisplay}</p>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Client */}
          {quote.clientName && (
            <Card>
              <SectionLabel>Client</SectionLabel>
              {quote.client?.id != null ? (
                <button type="button"
                  onClick={() => navigate(`/clients/${quote.client!.id}`)}
                  className="mt-1 inline-flex items-center gap-1 text-left text-sm font-semibold text-indigo-600 underline underline-offset-2 decoration-indigo-300 transition hover:text-indigo-700">
                  {quote.clientName}
                  <span aria-hidden className="text-xs">→</span>
                </button>
              ) : (
                <p className="mt-1 text-sm font-semibold text-slate-900">{quote.clientName}</p>
              )}
            </Card>
          )}

          {/* Created by + Status */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <SectionLabel>Created by</SectionLabel>
              <div className="mt-1 flex items-center gap-2">
                {quote.createdByPhoto ? (
                  <img src={quote.createdByPhoto} alt={quote.createdBy}
                    className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
                ) : (
                  <Avatar name={quote.createdBy} />
                )}
                <p className="text-sm font-semibold text-slate-900">{quote.createdBy}</p>
              </div>
            </Card>
            <Card className="p-4">
              <SectionLabel>Status</SectionLabel>
              <div className="mt-1">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[visibleStatus]}`}>
                  {STATUS_LABELS[visibleStatus]}
                </span>
              </div>
            </Card>
          </div>

          {/* Admin actions */}
          {showAdminActions && (
            <Card>
              <SectionLabel>Actions</SectionLabel>
              <div className="flex gap-2">
                {quote.status !== 'approved' && (
                  <button onClick={() => handleStatusChange(quote.id, 'APPROVED')} disabled={statusLoading}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                )}
                {quote.status !== 'rejected' && (
                  <button onClick={() => handleStatusChange(quote.id, 'REJECTED')} disabled={statusLoading}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-60">
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                )}
                {quote.status !== 'pending' && (
                  <button onClick={() => handleStatusChange(quote.id, 'PENDING')} disabled={statusLoading}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-60">
                    Reset
                  </button>
                )}
              </div>
            </Card>
          )}

          {/* Share link */}
          {quote.publicToken && (
            <Card className={expiration.expired ? '!border-rose-200 !bg-rose-50/60' : ''}>
              <SectionLabel>Share link</SectionLabel>
              <p className={`text-xs ${expiration.expired ? 'text-rose-700' : 'text-slate-500'}`}>
                {expiration.expired
                  ? 'This share link is expired — refresh it to generate a new one.'
                  : `Send the link to the client. ${expiration.label}.`}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CopyShareLinkButton token={quote.publicToken} iconOnly={false} />
                <OpenQuoteButton token={quote.publicToken} />
                {quote.status === 'approved' && isEnabled('quote-send-link') && (
                  <button onClick={handleSendLink} disabled={sendingLink === 'sending'}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60">
                    {sendingLink === 'sending' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : sendingLink === 'sent' ? <Check className="h-3.5 w-3.5" />
                      : <MessageCircle className="h-3.5 w-3.5" />}
                    {sendingLink === 'sending' ? 'Sending…' : sendingLink === 'sent' ? 'Sent!' : 'Send to client'}
                  </button>
                )}
                {isAdmin && (
                  <button onClick={handleRefreshToken} disabled={refreshing}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
                    <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Refreshing…' : 'Refresh link'}
                  </button>
                )}
              </div>
              {quote.lastOpenedAt ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0">
                    <strong>Last opened:</strong> {formatLastOpened(quote.lastOpenedAt)}
                    {(quote.openCount ?? 0) > 1 && <span className="ml-1 text-emerald-700">· {quote.openCount} views</span>}
                  </span>
                </div>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <Eye className="h-3.5 w-3.5 shrink-0" />
                  Not opened yet by the client.
                </p>
              )}
            </Card>
          )}

          {/* WhatsApp notifications */}
          {isEnabled('quote-send-link') && <WhatsAppNotificationsBlock quote={quote} />}

          {/* Payment plan */}
          {canSeePayments_ && isEnabled('payments') && quote.status !== 'rejected' && (
            <PaymentPlanBlock
              quoteId={quote.id}
              total={customerPrice}
              clientPhone={quote.client?.phone ?? null}
              quoteTitle={quote.title}
              onPaymentChanged={async () => {
                const updated = await quotesService.getById(quote.id)
                setQuote(updated)
              }}
            />
          )}

          {/* Pricing & markup */}
          <Card>
            <SectionLabel>Pricing &amp; markup</SectionLabel>
            <div className="space-y-2">
              <LineItem label="Our cost" value={`$${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
              <LineItem label="Markup multiplier" value={`${markup}×`} />
              <LineItem label="Discount" value={discount > 0 ? `−${discount}%` : 'None'} />
              <LineItem label="Sales tax (7.75%)" value={applyTaxes ? 'Applied' : 'Not applied'} />
              {quote.customerPriceOverride != null && (
                <LineItem label="Custom total override"
                  value={`$${quote.customerPriceOverride.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
              )}
              <LineItem label="Customer price" value={`$${customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            </div>
            {quote.customerPriceOverride != null && (
              <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
                <strong>Custom total applied</strong> — markup, discount and tax are bypassed.
                {quote.customerPriceOverrideReason ? <> Reason: {quote.customerPriceOverrideReason}</> : null}
              </p>
            )}
          </Card>

          {/* Market comparison */}
          <Card>
            <MarketComparisonPanel
              jewelryType={quote.jewelryType ?? 'ring'}
              metalKey={quote.metalRows?.[0]?.metalKey ?? quote.metal ?? 'gold-18k-white'}
              myPrice={customerPrice}
              clientId={quote.client?.id}
              clientName={quote.clientName ?? null}
              stoneType={stones.length > 0 ? 'diamond' : null}
              layout="cards"
            />
          </Card>
        </div>
      </div>
    </>
  )
}
