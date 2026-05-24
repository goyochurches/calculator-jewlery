import { paymentPlanService, quoteEventsService, type PaymentInstallment, type PlanRow, type QuoteEvent } from '@/services/paymentPlanService'
import { AlertTriangle, Bell, Check, Clock, Copy, CreditCard, Link as LinkIcon, Loader2, MessageCircle, Plus, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  quoteId: string
  /** Quote total in USD — used to pre-fill the first installment when the
   *  jeweler starts from scratch. */
  total: number
}

interface Draft {
  amount: number | ''
  dueDate: string  // 'YYYY-MM-DD' or ''
}

/** Inline editor + viewer of a quote's payment plan. Wipes & recreates on
 *  save (matches the backend semantics — there's no per-row update). */
export function PaymentPlanBlock({ quoteId, total }: Props) {
  const [plan, setPlan] = useState<PaymentInstallment[] | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkLoadingId, setLinkLoadingId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

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
      // Default scaffold: 3 equal installments, monthly.
      const today = new Date()
      const each = Math.round((total / 3) * 100) / 100
      setDrafts([0, 1, 2].map(i => {
        const d = new Date(today)
        d.setMonth(d.getMonth() + i)
        return { amount: each, dueDate: toIso(d) }
      }))
    }
    setEditing(true)
    setError(null)
  }

  const cancelEditing = () => {
    setEditing(false)
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
      const url = await paymentPlanService.getCheckoutLink(quoteId, installment.id)
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
        {!editing && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {plan && plan.length > 0 ? <><RefreshCw className="h-3 w-3" /> Edit plan</> : <><Plus className="h-3 w-3" /> Create plan</>}
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
              onCopy={() => handleCopyLink(p)}
            />
          ))}
          <PlanSummary plan={plan} total={total} />
        </div>
      )}
      {!editing && (!plan || plan.length === 0) && (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-xs text-slate-400">
          No payment plan yet. Click <strong>Create plan</strong> to split this quote in installments.
        </p>
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

function InstallmentRow({
  installment, index, total, copied, loading, onCopy,
}: {
  installment: PaymentInstallment
  index: number
  total: number
  copied: boolean
  loading: boolean
  onCopy: () => void
}) {
  const isPaid = installment.status === 'PAID'
  const isCanceled = installment.status === 'CANCELED'
  const isRefunded = installment.status === 'REFUNDED'

  const statusTone = isPaid     ? 'border-emerald-200 bg-emerald-50'
                   : isCanceled ? 'border-slate-200 bg-slate-50'
                   : isRefunded ? 'border-violet-200 bg-violet-50/60'
                   :              'border-amber-100 bg-amber-50/40'

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

      {!isPaid && !isCanceled && !isRefunded && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {loading      ? <Loader2 className="h-3 w-3 animate-spin" />
              : copied    ? <Check className="h-3 w-3" />
              :             <Copy className="h-3 w-3" />}
            {loading ? 'Generating…' : copied ? 'Copied!' : 'Copy pay link'}
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
