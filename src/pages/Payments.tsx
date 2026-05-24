import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefundDialog } from '@/components/RefundDialog'
import { paymentPlanService, paymentsAdminService, type PaymentRow, type StripePaymentRow } from '@/services/paymentPlanService'
import { Check, Clock, CreditCard, ExternalLink, Filter, Loader2, RefreshCw, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type Tab = 'installments' | 'stripe'

type StatusFilter = 'ALL' | 'PENDING' | 'PAID' | 'CANCELED' | 'REFUNDED'

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL',      label: 'All' },
  { key: 'PENDING',  label: 'Pending' },
  { key: 'PAID',     label: 'Paid' },
  { key: 'REFUNDED', label: 'Refunded' },
  { key: 'CANCELED', label: 'Canceled' },
]

export function PaymentsPage() {
  const [tab, setTab] = useState<Tab>('installments')

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        <TabButton active={tab === 'installments'} onClick={() => setTab('installments')}>
          Installments
        </TabButton>
        <TabButton active={tab === 'stripe'} onClick={() => setTab('stripe')}>
          Stripe transactions
        </TabButton>
      </div>

      {tab === 'installments' && <InstallmentsTab />}
      {tab === 'stripe'        && <StripeTab />}
    </div>
  )
}

function TabButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Installments tab (local DB view) ─────────────────────────────────────
function InstallmentsTab() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  /** Per-row refund phase. Mirrors the one in PaymentPlanBlock. */
  const [refundState, setRefundState] = useState<Record<number, 'requesting' | 'awaiting' | 'completed'>>({})
  /** Snapshot of each row's `paidAt` at refund-start so we can detect
   *  when the webhook lands (paidAt clears on full refund → PENDING). */
  const [refundBaselinePaidAt, setRefundBaselinePaidAt] = useState<Record<number, string | null>>({})
  /** Row selected for the refund dialog. null = closed. */
  const [refundDialogFor, setRefundDialogFor] = useState<PaymentRow | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    paymentsAdminService.list()
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load payments'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleRefund = (row: PaymentRow) => {
    setError(null)
    setRefundDialogFor(row)
  }

  const runRefund = async (row: PaymentRow, amount: number | undefined) => {
    setRefundState(s => ({ ...s, [row.id]: 'requesting' }))
    setRefundBaselinePaidAt(s => ({ ...s, [row.id]: row.paidAt }))
    setError(null)
    try {
      await paymentPlanService.refundInstallment(row.quoteId, row.id, amount)
      setRefundState(s => ({ ...s, [row.id]: 'awaiting' }))
      pollForRefundUpdate(row.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed')
      setRefundState(s => { const next = { ...s }; delete next[row.id]; return next })
    }
  }

  const pollForRefundUpdate = (rowId: number) => {
    const start = Date.now()
    const MAX_MS = 16_000
    const STEP_MS = 2_000

    const tick = async () => {
      try {
        const fresh = await paymentsAdminService.list()
        setRows(fresh)
        const row = fresh.find(r => r.id === rowId)
        // The PaymentRow shape doesn't include refundAmount yet — we
        // detect the webhook landing by either: status flipped away from
        // PAID, OR paidAt was cleared (full refund), OR status REFUNDED.
        const baseline = refundBaselinePaidAt[rowId]
        const done = row && (
          row.status === 'REFUNDED' ||
          row.status === 'PENDING'  ||
          (baseline != null && row.paidAt == null)
        )
        if (done) {
          setRefundState(s => ({ ...s, [rowId]: 'completed' }))
          setTimeout(() => setRefundState(s => {
            const next = { ...s }; delete next[rowId]; return next
          }), 4000)
          return
        }
      } catch { /* ignore */ }
      if (Date.now() - start < MAX_MS) {
        setTimeout(tick, STEP_MS)
      } else {
        setError('Refund issued in Stripe but status update is taking longer than usual. Click refresh.')
        setRefundState(s => { const next = { ...s }; delete next[rowId]; return next })
      }
    }
    setTimeout(tick, STEP_MS)
  }

  const filtered = useMemo(() => {
    if (!rows) return []
    if (filter === 'ALL') return rows
    return rows.filter(r => r.status === filter)
  }, [rows, filter])

  const totals = useMemo(() => {
    if (!rows) return { paid: 0, pending: 0, total: 0, count: { paid: 0, pending: 0, canceled: 0, refunded: 0 } }
    return rows.reduce((acc, r) => {
      acc.total += r.amount
      if (r.status === 'PAID')     { acc.paid    += r.amount; acc.count.paid++ }
      if (r.status === 'PENDING')  { acc.pending += r.amount; acc.count.pending++ }
      if (r.status === 'CANCELED') {                          acc.count.canceled++ }
      if (r.status === 'REFUNDED') {                          acc.count.refunded++ }
      return acc
    }, { paid: 0, pending: 0, total: 0, count: { paid: 0, pending: 0, canceled: 0, refunded: 0 } })
  }, [rows])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Collected"    value={`$${totals.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}    sublabel={`${totals.count.paid} paid installment${totals.count.paid === 1 ? '' : 's'}`}       tone="emerald" />
        <SummaryCard label="Outstanding"  value={`$${totals.pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} sublabel={`${totals.count.pending} pending installment${totals.count.pending === 1 ? '' : 's'}`} tone="amber" />
        <SummaryCard label="Total billed" value={`$${totals.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}   sublabel={`${rows?.length ?? 0} installments`} tone="slate" />
      </div>

      <Card className="rounded-[28px] border border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Installments</CardTitle>
              <p className="text-sm text-slate-500">Local payment-plan rows across every quote.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FilterChips active={filter} onChange={setFilter} counts={{
              ALL: rows?.length ?? 0,
              PENDING: totals.count.pending,
              PAID: totals.count.paid,
              REFUNDED: totals.count.refunded,
              CANCELED: totals.count.canceled,
            }} />
            <button
              type="button"
              onClick={load}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-6 text-sm text-rose-700">
              {error.includes('403') || error.includes('Forbidden')
                ? 'You don\'t have permission to view payments. Only admins can access this page.'
                : error}
            </div>
          )}
          {!error && loading && !rows && (
            <div className="p-10 text-center text-sm text-slate-400">Loading payments…</div>
          )}
          {!error && rows && rows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">
              No installments yet. Create a payment plan from any quote to start.
            </div>
          )}
          {!error && filtered.length === 0 && rows && rows.length > 0 && (
            <div className="p-10 text-center text-sm text-slate-400">No installments match the current filter.</div>
          )}
          {!error && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left">Quote</th>
                    <th className="px-4 py-3 text-left">Client</th>
                    <th className="px-4 py-3 text-left">Installment</th>
                    <th className="px-4 py-3 text-left">Due</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(row => (
                    <InstallmentRow
                      key={row.id}
                      row={row}
                      refundPhase={refundState[row.id] ?? null}
                      onRefund={() => handleRefund(row)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RefundDialog
        open={refundDialogFor !== null}
        installmentNumber={refundDialogFor ? refundDialogFor.sortOrder + 1 : 0}
        totalInstallments={0}
        amount={refundDialogFor?.amount ?? 0}
        quoteTitle={refundDialogFor?.quoteTitle ?? null}
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

function InstallmentRow({ row, refundPhase, onRefund }: {
  row: PaymentRow
  refundPhase: 'requesting' | 'awaiting' | 'completed' | null
  onRefund: () => void
}) {
  const refunding = refundPhase === 'requesting' || refundPhase === 'awaiting'
  return (
    <tr className="transition hover:bg-amber-50/30">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{row.quoteTitle ?? '—'}</p>
        <p className="text-[11px] text-slate-400">#{row.quoteId}</p>
      </td>
      <td className="px-4 py-3">
        {row.clientId != null && row.clientName ? (
          <Link to={`/clients/${row.clientId}`} className="text-slate-700 hover:text-amber-700 hover:underline">
            {row.clientName}
          </Link>
        ) : (
          <span className="text-slate-700">{row.clientName ?? '—'}</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-600">#{row.sortOrder + 1}</td>
      <td className="px-4 py-3 text-slate-600">
        {row.dueDate ? new Date(row.dueDate).toLocaleDateString() : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
        ${row.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-1">
          <LocalStatusBadge status={row.status} paidAt={row.paidAt} />
          {refundPhase === 'requesting' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-semibold text-violet-700">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Sending refund…
            </span>
          )}
          {refundPhase === 'awaiting' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Waiting for Stripe…
            </span>
          )}
          {refundPhase === 'completed' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
              <Check className="h-2.5 w-2.5" /> Refund completed
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1">
          {row.status === 'PAID' && (
            <button
              type="button"
              onClick={onRefund}
              disabled={refunding}
              title="Issue a full or partial refund via Stripe"
              className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60"
            >
              {refunding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              {refunding ? 'Refunding…' : 'Refund'}
            </button>
          )}
          <Link
            to={`/quotes-list?quoteId=${row.quoteId}`}
            title="Open quote"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </td>
    </tr>
  )
}

// ─── Stripe tab (live from Stripe API) ────────────────────────────────────
function StripeTab() {
  const [rows, setRows] = useState<StripePaymentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    paymentsAdminService.listStripe(100)
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load Stripe transactions'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const totals = useMemo(() => {
    if (!rows) return { paid: 0, unpaid: 0, count: { paid: 0, unpaid: 0 } }
    return rows.reduce((acc, r) => {
      const amount = (r.amountCents ?? 0) / 100
      if (r.paymentStatus === 'paid') { acc.paid += amount; acc.count.paid++ }
      else                            { acc.unpaid += amount; acc.count.unpaid++ }
      return acc
    }, { paid: 0, unpaid: 0, count: { paid: 0, unpaid: 0 } })
  }, [rows])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Stripe collected" value={`$${totals.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}   sublabel={`${totals.count.paid} paid session${totals.count.paid === 1 ? '' : 's'}`}       tone="emerald" />
        <SummaryCard label="Open / unpaid"    value={`$${totals.unpaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} sublabel={`${totals.count.unpaid} unpaid session${totals.count.unpaid === 1 ? '' : 's'}`} tone="amber" />
        <SummaryCard label="Sessions shown"   value={String(rows?.length ?? 0)} sublabel="Latest pull from Stripe API" tone="slate" />
      </div>

      <Card className="rounded-[28px] border border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Stripe transactions</CardTitle>
              <p className="text-sm text-slate-500">Live Checkout Sessions from your Stripe account. Latest 100.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-6 text-sm text-rose-700">
              {error.includes('403') || error.includes('Forbidden')
                ? "You don't have permission to view Stripe transactions."
                : error.includes('not configured')
                ? "Stripe isn't configured on the backend. Set STRIPE_SECRET_KEY in the environment."
                : error}
            </div>
          )}
          {!error && loading && !rows && (
            <div className="p-10 text-center text-sm text-slate-400">Loading from Stripe…</div>
          )}
          {!error && rows && rows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">No Stripe sessions found in this account.</div>
          )}
          {!error && rows && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left">When</th>
                    <th className="px-4 py-3 text-left">Quote · Client</th>
                    <th className="px-4 py-3 text-left">Installment</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Customer email</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => <StripeRow key={row.sessionId} row={row} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StripeRow({ row }: { row: StripePaymentRow }) {
  const amount = (row.amountCents ?? 0) / 100
  const currency = (row.currency ?? 'usd').toUpperCase()
  return (
    <tr className="transition hover:bg-violet-50/20">
      <td className="px-4 py-3 text-slate-700">
        {new Date(row.createdEpoch * 1000).toLocaleString()}
      </td>
      <td className="px-4 py-3">
        {row.quoteTitle ? (
          <>
            <p className="font-semibold text-slate-900">{row.quoteTitle}</p>
            <p className="text-[11px] text-slate-400">
              {row.quoteId && <>#{row.quoteId}{row.clientName ? ' · ' : ''}</>}
              {row.clientName && (
                row.clientId != null ? (
                  <Link to={`/clients/${row.clientId}`} className="text-slate-600 hover:text-amber-700 hover:underline">
                    {row.clientName}
                  </Link>
                ) : (
                  <span className="text-slate-600">{row.clientName}</span>
                )
              )}
            </p>
          </>
        ) : row.clientName ? (
          row.clientId != null ? (
            <Link to={`/clients/${row.clientId}`} className="text-slate-700 hover:text-amber-700 hover:underline">
              {row.clientName}
            </Link>
          ) : (
            <p className="text-slate-700">{row.clientName}</p>
          )
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-slate-600">
        {row.installmentSortOrder != null && row.installmentTotalCount != null
          ? `#${row.installmentSortOrder + 1} of ${row.installmentTotalCount}`
          : row.installmentId != null
          ? `#${row.installmentId}`
          : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
        ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        <span className="ml-1 text-[10px] font-medium text-slate-400">{currency}</span>
      </td>
      <td className="px-4 py-3">
        <StripeStatusBadge sessionStatus={row.sessionStatus} paymentStatus={row.paymentStatus} />
      </td>
      <td className="px-4 py-3 text-[11px] text-slate-600">
        {row.customerEmail ?? <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-1">
          {row.quoteId && (
            <Link
              to={`/quotes-list?quoteId=${row.quoteId}`}
              title="Open quote"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          {row.dashboardUrl && (
            <a
              href={row.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Stripe dashboard"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </td>
    </tr>
  )
}

function StripeStatusBadge({ sessionStatus, paymentStatus }: { sessionStatus: string | null; paymentStatus: string | null }) {
  if (paymentStatus === 'paid') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
      <Check className="h-2.5 w-2.5" /> Paid
    </span>
  )
  if (sessionStatus === 'expired') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
      <XCircle className="h-2.5 w-2.5" /> Expired
    </span>
  )
  if (sessionStatus === 'open') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
      <Clock className="h-2.5 w-2.5" /> Open
    </span>
  )
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
      {paymentStatus ?? sessionStatus ?? 'unknown'}
    </span>
  )
}

// ─── Shared atoms ─────────────────────────────────────────────────────────
function LocalStatusBadge({ status, paidAt }: { status: PaymentRow['status']; paidAt: string | null }) {
  if (status === 'PAID') return (
    <div>
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
        <Check className="h-2.5 w-2.5" /> Paid
      </span>
      {paidAt && <p className="mt-1 text-[10px] text-slate-400">{new Date(paidAt).toLocaleDateString()}</p>}
    </div>
  )
  if (status === 'REFUNDED') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
      <RotateCcw className="h-2.5 w-2.5" /> Refunded
    </span>
  )
  if (status === 'CANCELED') return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
      <XCircle className="h-2.5 w-2.5" /> Canceled
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
      <Clock className="h-2.5 w-2.5" /> Pending
    </span>
  )
}

function SummaryCard({ label, value, sublabel, tone }: {
  label: string
  value: string
  sublabel: string
  tone: 'emerald' | 'amber' | 'slate'
}) {
  const colors = {
    emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-700',
    amber:   'border-amber-200 bg-amber-50/60 text-amber-700',
    slate:   'border-slate-200 bg-slate-50 text-slate-700',
  }[tone]
  return (
    <Card className={`rounded-2xl border ${colors}`}>
      <CardContent className="p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{label}</p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
        <p className="mt-1 text-xs opacity-70">{sublabel}</p>
      </CardContent>
    </Card>
  )
}

function FilterChips({ active, onChange, counts }: {
  active: StatusFilter
  onChange: (s: StatusFilter) => void
  counts: Record<StatusFilter, number>
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
      <Filter className="ml-2 h-3 w-3 text-slate-400" />
      {FILTERS.map(f => (
        <button
          key={f.key}
          type="button"
          onClick={() => onChange(f.key)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            active === f.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {f.label} <span className="opacity-60">({counts[f.key]})</span>
        </button>
      ))}
    </div>
  )
}

export default PaymentsPage
