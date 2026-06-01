import { RefundDialog } from '@/components/RefundDialog'
import { paymentPlanService, quoteEventsService, type PaymentInstallment, type PaymentMethodChoice, type PlanRow, type QuoteEvent } from '@/services/paymentPlanService'
import { AlertTriangle, Bell, Check, Clock, Copy, CreditCard, Landmark, Link as LinkIcon, Loader2, MessageCircle, Plus, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  quoteId: string
  /** Quote total in USD — used to pre-fill the first installment when the
   *  jeweler starts from scratch. */
  total: number
  /** Client's WhatsApp phone (E.164). When absent, the "Send WhatsApp"
   *  button is disabled with a tooltip explaining why. */
  clientPhone?: string | null
  /** Quote title — surfaced in the refund dialog so the admin double-
   *  checks they're refunding the right deal. */
  quoteTitle?: string
  /** Fires when something that may have changed the parent quote's
   *  status happens (plan created/updated, payment received via webhook,
   *  refund completed). Parents pass this to refresh their quote list /
   *  badges so the cascade (FULLY_PAID ↔ APPROVED) is visible without
   *  a manual reload. */
  onPaymentChanged?: () => void
}

interface Draft {
  amount: number | ''
  dueDate: string  // 'YYYY-MM-DD' or ''
}

/** Inline editor + viewer of a quote's payment plan. Wipes & recreates on
 *  save (matches the backend semantics — there's no per-row update). */
export function PaymentPlanBlock({ quoteId, total, clientPhone, quoteTitle, onPaymentChanged }: Props) {
  const [plan, setPlan] = useState<PaymentInstallment[] | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkLoadingId, setLinkLoadingId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [sentId, setSentId] = useState<number | null>(null)
  /** Per-installment refund phase: 'requesting' (API in flight),
   *  'awaiting' (waiting for Stripe webhook to confirm), 'completed'
   *  (status flipped to REFUNDED). Absent = idle. Lets us show distinct
   *  pill messages without conflating in-flight with awaiting-webhook. */
  const [refundState, setRefundState] = useState<Record<number, 'requesting' | 'awaiting' | 'completed'>>({})
  /** Installment selected for the refund dialog. null = closed. */
  const [refundDialogFor, setRefundDialogFor] = useState<PaymentInstallment | null>(null)
  /** Per-installment payment-method choice for the link (defaults to CARD). */
  const [methodById, setMethodById] = useState<Record<number, PaymentMethodChoice>>({})
  const methodFor = (id: number): PaymentMethodChoice => methodById[id] ?? 'CARD'

  useEffect(() => {
    let alive = true
    setLoading(true)
    paymentPlanService.get(quoteId)
      .then(p => { if (alive) { setPlan(p); setLoading(false) } })
      .catch(err => {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Failed to load plan')
          setLoading(false)
        }
      })
    return () => { alive = false }
  }, [quoteId])

  const startEditing = () => {
    if (plan && plan.length > 0) {
      setDrafts(plan.map(p => ({
        amount: p.amount,
        dueDate: p.dueDate ?? '',
      })))
    } else {
      // Default: a single installment for the full amount due today, ready to
      // create. The jeweler can still add rows / change the date.
      setDrafts([{ amount: total, dueDate: toIso(new Date()) }])
    }
    setEditing(true)
    setError(null)
  }

  const cancelEditing = () => {
    setEditing(false)
    setError(null)
  }

  /** Direct "Pay in full" — creates a single installment for the whole amount
   *  due today, no editor step. The jeweler can still switch to installments
   *  later via "Edit plan". */
  const handlePayInFull = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await paymentPlanService.upsert(quoteId, [{ amount: total, dueDate: toIso(new Date()) }])
      setPlan(updated)
      setEditing(false)
      onPaymentChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  /** Opens the editor seeded with two installments (split as evenly as the
   *  cents allow) so "pay in installments" starts as an actual plan to tweak. */
  const startInstallments = () => {
    const half = Math.round((total / 2) * 100) / 100
    const rest = Math.round((total - half) * 100) / 100
    setDrafts([
      { amount: half, dueDate: toIso(new Date()) },
      { amount: rest, dueDate: '' },
    ])
    setEditing(true)
    setError(null)
  }

  const addRow = () => setDrafts([...drafts, { amount: '', dueDate: '' }])
  const removeRow = (i: number) => setDrafts(drafts.filter((_, idx) => idx !== i))
  const updateRow = (i: number, patch: Partial<Draft>) =>
    setDrafts(drafts.map((d, idx) => idx === i ? { ...d, ...patch } : d))

  const draftsTotal = drafts.reduce((s, d) => s + (typeof d.amount === 'number' ? d.amount : 0), 0)
  const totalMismatch = Math.abs(draftsTotal - total) > 0.01

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const rows: PlanRow[] = drafts.map(d => ({
        amount: typeof d.amount === 'number' ? d.amount : 0,
        dueDate: d.dueDate || null,
      }))
      if (rows.some(r => r.amount <= 0)) {
        throw new Error('Each installment amount must be positive.')
      }
      const updated = await paymentPlanService.upsert(quoteId, rows)
      setPlan(updated)
      setEditing(false)
      onPaymentChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyLink = async (installment: PaymentInstallment) => {
    setLinkLoadingId(installment.id)
    setError(null)
    try {
      const url = await paymentPlanService.getCheckoutLink(quoteId, installment.id, methodFor(installment.id))
      await navigator.clipboard.writeText(url)
      // Reflect the new URL on the current plan row so the UI doesn't show stale state.
      setPlan(p => p?.map(i => i.id === installment.id ? { ...i, stripeSessionUrl: url } : i) ?? null)
      setCopiedId(installment.id)
      setTimeout(() => setCopiedId(c => c === installment.id ? null : c), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setLinkLoadingId(null)
    }
  }

  const handleSendWhatsApp = async (installment: PaymentInstallment) => {
    if (!clientPhone) return
    setSendingId(installment.id)
    setError(null)
    try {
      const res = await paymentPlanService.sendCheckoutLinkViaWhatsApp(quoteId, installment.id, methodFor(installment.id))
      if (!res.ok) {
        setError(res.error ?? 'WhatsApp send failed')
      } else {
        setSentId(installment.id)
        setTimeout(() => setSentId(s => s === installment.id ? null : s), 3000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send WhatsApp')
    } finally {
      setSendingId(null)
    }
  }

  const handleRefund = (installment: PaymentInstallment) => {
    setError(null)
    setRefundDialogFor(installment)
  }

  const runRefund = async (installment: PaymentInstallment, amount: number | undefined) => {
    setRefundState(s => ({ ...s, [installment.id]: 'requesting' }))
    setError(null)
    try {
      await paymentPlanService.refundInstallment(quoteId, installment.id, amount)
      // Stripe accepts → switch to "awaiting webhook" and poll until the
      // installment flips to REFUNDED (or partial refund stays PAID with
      // amounts diverging — in that case we resolve after the first poll).
      setRefundState(s => ({ ...s, [installment.id]: 'awaiting' }))
      pollForRefundUpdate(installment.id, amount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed')
      setRefundState(s => {
        const next = { ...s }; delete next[installment.id]; return next
      })
    }
  }

  /** Poll up to ~16s for the webhook to flip the installment status.
   *  We resolve as soon as either (a) status becomes REFUNDED or (b) for
   *  partial refunds, refundAmountCents shows up on the row. */
  const pollForRefundUpdate = (installmentId: number, requestedAmount: number | undefined) => {
    const start = Date.now()
    const MAX_MS = 16_000
    const STEP_MS = 2_000

    const tick = async () => {
      try {
        const fresh = await paymentPlanService.get(quoteId)
        setPlan(fresh)
        const row = fresh.find(p => p.id === installmentId)
        // Backend re-issues a full refund as PENDING + populates
        // refundAmount; partial keeps PAID + populates refundAmount.
        // Either way, refundAmount being non-null is the signal that
        // the webhook landed and our DB caught up.
        const done = row && row.refundAmount != null
        // requestedAmount kept around for future logic — e.g. if we
        // ever want to differentiate UX for partial vs full once
        // confirmed; lint suppression below.
        void requestedAmount
        if (done) {
          setRefundState(s => ({ ...s, [installmentId]: 'completed' }))
          // Tell the parent (QuotesList / ClientDetail) so it can refetch
          // its quote list — the cascade just moved status FULLY_PAID →
          // APPROVED on the backend and the row badge must follow.
          onPaymentChanged?.()
          setTimeout(() => setRefundState(s => {
            const next = { ...s }; delete next[installmentId]; return next
          }), 4000)
          return
        }
      } catch { /* ignore individual poll failures */ }
      if (Date.now() - start < MAX_MS) {
        setTimeout(tick, STEP_MS)
      } else {
        // Stripe accepted the refund but the webhook didn't land in time.
        // Leave the awaiting pill so the user knows something is in flight
        // and prompt them to refresh.
        setError('Refund issued in Stripe but the status update is taking longer than usual. Refresh in a few seconds.')
        setRefundState(s => {
          const next = { ...s }; delete next[installmentId]; return next
        })
      }
    }
    setTimeout(tick, STEP_MS)
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-400">
        Loading payment plan…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <CreditCard className="h-3.5 w-3.5" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Payment plan</p>
        </div>
        {!editing && plan && plan.length > 0 && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <RefreshCw className="h-3 w-3" /> Edit plan
          </button>
        )}
      </div>

      {/* Display mode */}
      {!editing && plan && plan.length > 0 && (
        <div className="space-y-2">
          {plan.map((p, idx) => (
            <InstallmentRow
              key={p.id}
              installment={p}
              index={idx}
              total={plan.length}
              copied={copiedId === p.id}
              loading={linkLoadingId === p.id}
              sending={sendingId === p.id}
              sent={sentId === p.id}
              refundPhase={refundState[p.id] ?? null}
              clientPhone={clientPhone ?? null}
              method={methodFor(p.id)}
              onMethodChange={(m) => setMethodById(prev => ({ ...prev, [p.id]: m }))}
              onCopy={() => handleCopyLink(p)}
              onSendWhatsApp={() => handleSendWhatsApp(p)}
              onRefund={() => handleRefund(p)}
            />
          ))}
          <PlanSummary plan={plan} total={total} />
        </div>
      )}
      {!editing && (!plan || plan.length === 0) && (
        <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
          <p className="text-center text-xs text-slate-400">
            How would the client like to pay?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handlePayInFull}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
              Pay in full · ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </button>
            <button
              type="button"
              onClick={startInstallments}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Pay in installments
            </button>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
          {drafts.map((d, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Installment {i + 1}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={d.amount}
                  onChange={e => updateRow(i, { amount: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Due date
                </label>
                <input
                  type="date"
                  value={d.dueDate}
                  onChange={e => updateRow(i, { dueDate: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={drafts.length === 1}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-rose-600 transition hover:border-rose-200 hover:bg-rose-50 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:bg-white"
          >
            <Plus className="h-3 w-3" /> Add installment
          </button>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">Sum of installments</span>
            <span className={`font-semibold tabular-nums ${totalMismatch ? 'text-amber-700' : 'text-emerald-700'}`}>
              ${draftsTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              {totalMismatch && (
                <span className="ml-1 text-[10px] text-amber-600">
                  (quote total: ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                </span>
              )}
            </span>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            {totalMismatch && (
              <span className="mr-auto text-[11px] font-semibold text-amber-700">
                Adjust the amounts so the sum matches the quote total.
              </span>
            )}
            <button
              type="button"
              onClick={cancelEditing}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || totalMismatch}
              title={totalMismatch ? 'Installment amounts must sum to the quote total before saving.' : undefined}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {saving ? 'Saving…' : 'Save plan'}
            </button>
          </div>
        </div>
      )}

      {!editing && error && (
        <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">{error}</p>
      )}

      {/* Activity timeline — payment events for this quote (plan
          creation, reminders sent, payments received, plan completion). */}
      <PaymentEventsTimeline quoteId={quoteId} />

      <RefundDialog
        open={refundDialogFor !== null}
        installmentNumber={refundDialogFor ? refundDialogFor.sortOrder + 1 : 0}
        totalInstallments={plan?.length ?? 0}
        amount={refundDialogFor?.amount ?? 0}
        quoteTitle={quoteTitle ?? null}
        loading={refundDialogFor != null && refundState[refundDialogFor.id] === 'requesting'}
        onConfirm={(amount) => {
          if (!refundDialogFor) return
          const target = refundDialogFor
          setRefundDialogFor(null)
          runRefund(target, amount)
        }}
        onCancel={() => setRefundDialogFor(null)}
      />
    </div>
  )
}

function PaymentEventsTimeline({ quoteId }: { quoteId: string }) {
  const [events, setEvents] = useState<QuoteEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    quoteEventsService.forQuote(quoteId)
      .then(setEvents)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load events'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [quoteId])

  if (loading && !events) return null
  if (error) return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3 text-[11px] text-rose-700">
      Couldn't load payment activity: {error}
    </div>
  )
  if (!events || events.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Payment activity · {events.length}
        </p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="space-y-1.5">
        {events.map(e => <EventRow key={e.id} event={e} />)}
      </div>
    </div>
  )
}

function EventRow({ event }: { event: QuoteEvent }) {
  const tone = toneFor(event)
  const Icon = iconFor(event)
  const when = new Date(event.createdAt).toLocaleString()

  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} px-3 py-2`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone.icon}`} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900">{event.title}</p>
            <span className="text-[10px] text-slate-400">{when}</span>
          </div>
          {event.body && (
            <p className="whitespace-pre-wrap text-[11px] text-slate-600">{event.body}</p>
          )}
          {(event.recipient || event.status || event.error) && (
            <p className="flex flex-wrap items-center gap-2 pt-0.5 text-[10px] text-slate-500">
              {event.recipient && <span><span className="text-slate-400">To:</span> {event.recipient}</span>}
              {event.status && <span className={`rounded-full px-1.5 py-0.5 font-semibold ${statusChip(event.status)}`}>{event.status}</span>}
            </p>
          )}
          {event.error && (
            <p className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
              <strong>Error:</strong> {event.error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function toneFor(e: QuoteEvent): { border: string; bg: string; icon: string } {
  if (e.error) return { border: 'border-rose-200', bg: 'bg-rose-50/50', icon: 'text-rose-600' }
  switch (e.type) {
    case 'INSTALLMENT_PAID':
    case 'PLAN_FULLY_PAID':
      return { border: 'border-emerald-200', bg: 'bg-emerald-50/50', icon: 'text-emerald-600' }
    case 'REMINDER_CREATOR':
    case 'REMINDER_CLIENT':
    case 'OVERDUE':
      return { border: 'border-amber-200', bg: 'bg-amber-50/50', icon: 'text-amber-600' }
    case 'PLAN_CANCELED':
      return { border: 'border-slate-200', bg: 'bg-slate-50', icon: 'text-slate-500' }
    default:
      return { border: 'border-slate-200', bg: 'bg-white', icon: 'text-slate-500' }
  }
}

function iconFor(e: QuoteEvent) {
  if (e.channel === 'WHATSAPP') return MessageCircle
  if (e.channel === 'IN_APP')   return Bell
  switch (e.type) {
    case 'INSTALLMENT_PAID':
    case 'PLAN_FULLY_PAID':   return Check
    case 'REMINDER_CREATOR':
    case 'REMINDER_CLIENT':   return Clock
    case 'OVERDUE':           return AlertTriangle
    case 'PLAN_CANCELED':     return XCircle
    default:                  return Bell
  }
}

function statusChip(status: string): string {
  const s = status.toUpperCase()
  if (['SENT', 'DELIVERED', 'READ', 'PAID'].includes(s)) return 'bg-emerald-100 text-emerald-700'
  if (['FAILED', 'UNDELIVERED'].includes(s))             return 'bg-rose-100 text-rose-700'
  if (s === 'NO_RECIPIENT' || s === 'NOT_CONFIGURED')    return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

/** 3-way segmented control letting the jeweler pick which payment method(s)
 *  the link offers: card, ACH (US bank debit), or both. */
function MethodSelector({ value, onChange, disabled }: {
  value: PaymentMethodChoice
  onChange: (m: PaymentMethodChoice) => void
  disabled?: boolean
}) {
  const opts: { key: PaymentMethodChoice; label: string; Icon?: typeof CreditCard }[] = [
    { key: 'CARD', label: 'Card', Icon: CreditCard },
    { key: 'ACH', label: 'ACH', Icon: Landmark },
    { key: 'BOTH', label: 'Both' },
  ]
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
      <span className="px-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">Pay by</span>
      {opts.map(o => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-50 ${
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {o.Icon && <o.Icon className="h-3 w-3" />} {o.label}
          </button>
        )
      })}
    </div>
  )
}

function InstallmentRow({
  installment, index, total, copied, loading, sending, sent, refundPhase,
  clientPhone, method, onMethodChange, onCopy, onSendWhatsApp, onRefund,
}: {
  installment: PaymentInstallment
  index: number
  total: number
  copied: boolean
  loading: boolean
  sending: boolean
  sent: boolean
  refundPhase: 'requesting' | 'awaiting' | 'completed' | null
  clientPhone: string | null
  method: PaymentMethodChoice
  onMethodChange: (m: PaymentMethodChoice) => void
  onCopy: () => void
  onSendWhatsApp: () => void
  onRefund: () => void
}) {
  const isPaid = installment.status === 'PAID'
  const isProcessing = installment.status === 'PROCESSING'
  const isCanceled = installment.status === 'CANCELED'
  const isRefunded = installment.status === 'REFUNDED'  // legacy rows that may pre-date the change
  const wasRefunded = installment.refundAmount != null  // history flag — works regardless of current status
  const refunding = refundPhase === 'requesting' || refundPhase === 'awaiting'

  const statusTone = isPaid       ? 'border-emerald-200 bg-emerald-50'
                   : isProcessing ? 'border-sky-200 bg-sky-50/60'
                   : isCanceled   ? 'border-slate-200 bg-slate-50'
                   : isRefunded   ? 'border-violet-200 bg-violet-50/60'
                   :                'border-amber-100 bg-amber-50/40'

  return (
    <div className={`rounded-2xl border ${statusTone} px-3 py-2.5`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">
            Installment {index + 1} <span className="text-slate-400">of {total}</span>
          </p>
          <p className="text-[11px] text-slate-500">
            {installment.dueDate ? <>Due {new Date(installment.dueDate).toLocaleDateString()}</> : 'No due date'}
            {isPaid && installment.paidAt && (
              <> · <span className="text-emerald-700 font-semibold">Paid {new Date(installment.paidAt).toLocaleDateString()}</span></>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums text-slate-900">
            ${installment.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <StatusChip status={installment.status} />
        </div>
      </div>

      {/* Refund history banner — visible regardless of current status so
          the jeweler always sees "this installment was refunded once". */}
      {wasRefunded && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
          <RotateCcw className="h-2.5 w-2.5" />
          Refunded ${installment.refundAmount!.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          {installment.refundedAt && <> · {new Date(installment.refundedAt).toLocaleDateString()}</>}
        </div>
      )}

      {/* Refund-in-flight feedback pills */}
      {refundPhase === 'requesting' && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Sending refund to Stripe…
        </div>
      )}
      {refundPhase === 'awaiting' && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Refund issued · waiting for Stripe confirmation…
        </div>
      )}
      {refundPhase === 'completed' && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
          <Check className="h-3 w-3" /> Refund completed
        </div>
      )}

      {/* ACH clears asynchronously — show a calm "processing" notice and hide
          the link actions so the jeweler doesn't re-issue mid-clearing. */}
      {isProcessing && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Payment processing (ACH) · clears in 3–5 business days
        </div>
      )}

      {!isPaid && !isProcessing && !isCanceled && !isRefunded && (
        <div className="mt-2 space-y-2">
          <MethodSelector value={method} onChange={onMethodChange} disabled={loading || sending} />
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={loading || sending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading      ? <Loader2 className="h-3 w-3 animate-spin" />
              : copied    ? <Check className="h-3 w-3" />
              :             <Copy className="h-3 w-3" />}
            {loading ? 'Generating…' : copied ? 'Copied!' : 'Copy pay link'}
          </button>
          <button
            type="button"
            onClick={onSendWhatsApp}
            disabled={!clientPhone || sending || loading}
            title={clientPhone
              ? `Send the payment link to ${clientPhone} via their preferred channel (SMS / WhatsApp)`
              : 'Client has no phone on file — set one on the client record to enable this'}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {sending  ? <Loader2 className="h-3 w-3 animate-spin" />
              : sent  ? <Check className="h-3 w-3" />
              :         <MessageCircle className="h-3 w-3" />}
            {sending ? 'Sending…' : sent ? 'Sent!' : 'Send'}
          </button>
          {installment.stripeSessionUrl && !loading && !copied && (
            <a
              href={installment.stripeSessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the existing Stripe checkout link"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </a>
          )}
          </div>
        </div>
      )}
      {isPaid && (
        <div className="mt-2 flex items-center justify-end">
          <button
            type="button"
            onClick={onRefund}
            disabled={refunding}
            title="Issue a full or partial refund via Stripe"
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60"
          >
            {refunding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            {refunding ? 'Refunding…' : 'Refund'}
          </button>
        </div>
      )}
    </div>
  )
}

function StatusChip({ status }: { status: PaymentInstallment['status'] }) {
  if (status === 'PAID') return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">
      <Check className="h-2.5 w-2.5" /> Paid
    </span>
  )
  if (status === 'PROCESSING') return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-700">
      <Loader2 className="h-2.5 w-2.5 animate-spin" /> Processing
    </span>
  )
  if (status === 'CANCELED') return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
      <XCircle className="h-2.5 w-2.5" /> Canceled
    </span>
  )
  if (status === 'REFUNDED') return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700">
      <RotateCcw className="h-2.5 w-2.5" /> Refunded
    </span>
  )
  return (
    <span className="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
      Pending
    </span>
  )
}

function PlanSummary({ plan, total }: { plan: PaymentInstallment[]; total: number }) {
  const paid = plan.filter(p => p.status === 'PAID').reduce((s, p) => s + p.amount, 0)
  const planTotal = plan.reduce((s, p) => s + p.amount, 0)
  const pct = planTotal > 0 ? Math.min(100, Math.round((paid / planTotal) * 100)) : 0
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Paid so far</span>
        <span className="font-semibold tabular-nums text-slate-900">
          ${paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          <span className="text-slate-400"> / ${planTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {Math.abs(planTotal - total) > 0.01 && (
        <p className="mt-1.5 text-[10px] text-amber-700">
          Plan total (${planTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}) differs from quote total (${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}).
        </p>
      )}
    </div>
  )
}

function toIso(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
