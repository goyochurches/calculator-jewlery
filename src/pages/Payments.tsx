import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { paymentsAdminService, type PaymentRow } from '@/services/paymentPlanService'
import { Check, Clock, CreditCard, ExternalLink, Filter, RefreshCw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type StatusFilter = 'ALL' | 'PENDING' | 'PAID' | 'CANCELED'

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL',     label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PAID',    label: 'Paid' },
  { key: 'CANCELED',label: 'Canceled' },
]

export function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('ALL')

  const load = () => {
    setLoading(true)
    setError(null)
    paymentsAdminService.list()
      .then(setRows)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load payments'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const filtered = useMemo(() => {
    if (!rows) return []
    if (filter === 'ALL') return rows
    return rows.filter(r => r.status === filter)
  }, [rows, filter])

  const totals = useMemo(() => {
    if (!rows) return { paid: 0, pending: 0, total: 0, count: { paid: 0, pending: 0, canceled: 0 } }
    return rows.reduce((acc, r) => {
      acc.total += r.amount
      if (r.status === 'PAID') { acc.paid += r.amount; acc.count.paid++ }
      else if (r.status === 'PENDING') { acc.pending += r.amount; acc.count.pending++ }
      else if (r.status === 'CANCELED') { acc.count.canceled++ }
      return acc
    }, { paid: 0, pending: 0, total: 0, count: { paid: 0, pending: 0, canceled: 0 } })
  }, [rows])

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Collected"
          value={`$${totals.paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          sublabel={`${totals.count.paid} paid installment${totals.count.paid === 1 ? '' : 's'}`}
          tone="emerald"
        />
        <SummaryCard
          label="Outstanding"
          value={`$${totals.pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          sublabel={`${totals.count.pending} pending installment${totals.count.pending === 1 ? '' : 's'}`}
          tone="amber"
        />
        <SummaryCard
          label="Total billed"
          value={`$${totals.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          sublabel={`${rows?.length ?? 0} installments`}
          tone="slate"
        />
      </div>

      {/* Table */}
      <Card className="rounded-[28px] border border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Payments</CardTitle>
              <p className="text-sm text-slate-500">All installments across every quote.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FilterChips active={filter} onChange={setFilter} counts={{
              ALL: rows?.length ?? 0,
              PENDING: totals.count.pending,
              PAID: totals.count.paid,
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
            <div className="p-10 text-center text-sm text-slate-400">
              No installments match the current filter.
            </div>
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
                  {filtered.map(row => <PaymentRow key={row.id} row={row} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PaymentRow({ row }: { row: PaymentRow }) {
  return (
    <tr className="transition hover:bg-amber-50/30">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{row.quoteTitle ?? '—'}</p>
        <p className="text-[11px] text-slate-400">#{row.quoteId}</p>
      </td>
      <td className="px-4 py-3 text-slate-700">{row.clientName ?? '—'}</td>
      <td className="px-4 py-3 text-slate-600">
        #{row.sortOrder + 1}
      </td>
      <td className="px-4 py-3 text-slate-600">
        {row.dueDate ? new Date(row.dueDate).toLocaleDateString() : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
        ${row.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={row.status} paidAt={row.paidAt} />
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to={`/quotes-list?quoteId=${row.quoteId}`}
          title="Open quote"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  )
}

function StatusBadge({ status, paidAt }: { status: PaymentRow['status']; paidAt: string | null }) {
  if (status === 'PAID') return (
    <div>
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
        <Check className="h-2.5 w-2.5" /> Paid
      </span>
      {paidAt && <p className="mt-1 text-[10px] text-slate-400">{new Date(paidAt).toLocaleDateString()}</p>}
    </div>
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
            active === f.key
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {f.label} <span className="opacity-60">({counts[f.key]})</span>
        </button>
      ))}
    </div>
  )
}

export default PaymentsPage
