import { Card, CardContent } from '@/components/ui/card'
import { useFeatures } from '@/hooks/useFeatures'
import { dashboardService, type DashboardAnalytics as Analytics } from '@/services/dashboardService'
import { reviewsService, type GoogleReviews } from '@/services/reviewsService'
import {
  AlertTriangle, BanknoteIcon, Clock, MessageCircle, Phone, PhoneMissed,
  RotateCcw, Smartphone, Star, Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function duration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  const s = totalSeconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

/** Analyst-grade KPIs: money collected vs outstanding/overdue, the quote
 *  funnel, call activity, client channel split and Google rating. */
export function DashboardAnalytics() {
  const { isEnabled } = useFeatures()
  const [a, setA] = useState<Analytics | null>(null)
  const [reviews, setReviews] = useState<GoogleReviews | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dashboardService.getAnalytics()
      .then(setA)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load analytics'))
    reviewsService.get().then(setReviews).catch(() => { /* reviews are optional */ })
  }, [])

  if (error) {
    return (
      <Card className="rounded-[24px] border border-rose-200 bg-rose-50/50">
        <CardContent className="p-5 text-sm text-rose-700">Couldn't load analytics: {error}</CardContent>
      </Card>
    )
  }
  if (!a) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
        ))}
      </div>
    )
  }

  const funnel: { label: string; value: number; color: string }[] = [
    { label: 'Draft', value: a.quotesDraft, color: 'bg-slate-400' },
    { label: 'Pending', value: a.quotesPending, color: 'bg-amber-400' },
    { label: 'Approved', value: a.quotesApproved, color: 'bg-sky-500' },
    { label: 'Fully paid', value: a.quotesFullyPaid, color: 'bg-emerald-500' },
    { label: 'Rejected', value: a.quotesRejected, color: 'bg-rose-400' },
  ]
  const funnelMax = Math.max(1, ...funnel.map(f => f.value))
  const answerRate = a.callsTotal > 0 ? Math.round((a.callsAnswered / a.callsTotal) * 100) : 0

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Business analytics</h2>

      {/* ── Money ── gated by the payments feature flag */}
      {isEnabled('payments') && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={<Wallet className="h-4 w-4" />} tone="emerald" label="Collected" value={money(a.collected)}
            hint={a.processing > 0 ? `${money(a.processing)} processing (ACH)` : undefined} />
          <Kpi icon={<BanknoteIcon className="h-4 w-4" />} tone="amber" label="Outstanding" value={money(a.outstanding)} />
          <Kpi icon={<AlertTriangle className="h-4 w-4" />} tone="rose" label="Overdue" value={money(a.overdue)}
            hint={`${a.overdueCount} installment${a.overdueCount === 1 ? '' : 's'} past due`} />
          <Kpi icon={<RotateCcw className="h-4 w-4" />} tone="violet" label="Refunded" value={money(a.refunded)} />
        </div>
      )}

      {/* ── Funnel + activity ── (call activity gated by the messages flag) */}
      <div className={`grid gap-3 ${isEnabled('messages') ? 'lg:grid-cols-2' : ''}`}>
        <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <CardContent className="space-y-3 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Quote funnel</p>
            <div className="space-y-2">
              {funnel.map(f => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-slate-500">{f.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${f.color}`} style={{ width: `${(f.value / funnelMax) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">{f.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {isEnabled('messages') && (
          <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
            <CardContent className="space-y-4 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Call activity</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniStat icon={<Phone className="h-4 w-4 text-sky-600" />} label="Total" value={a.callsTotal} />
                <MiniStat icon={<Phone className="h-4 w-4 text-emerald-600" />} label="Answered" value={a.callsAnswered} sub={`${answerRate}%`} />
                <MiniStat icon={<PhoneMissed className="h-4 w-4 text-rose-600" />} label="Missed" value={a.callsMissed} />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                Total talk time: <span className="font-semibold text-slate-800">{duration(a.callDurationSeconds)}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Clients channel split · reviews · unread ── (per-flag) */}
      {(() => {
        const kpis: React.ReactNode[] = []
        if (isEnabled('messages')) {
          kpis.push(
            <Kpi key="wa" icon={<MessageCircle className="h-4 w-4" />} tone="emerald" label="Clients · WhatsApp" value={String(a.clientsWhatsapp)}
              hint={`${a.clientsTotal} total clients`} />,
            <Kpi key="sms" icon={<Smartphone className="h-4 w-4" />} tone="sky" label="Clients · SMS" value={String(a.clientsSms)} />,
            <Kpi key="unread" icon={<MessageCircle className="h-4 w-4" />} tone="rose" label="Unread messages" value={String(a.unreadMessages)} />,
          )
        }
        if (isEnabled('reviews')) {
          kpis.push(
            <Kpi
              key="rating"
              icon={<Star className="h-4 w-4" />}
              tone="amber"
              label="Google rating"
              value={reviews?.rating != null ? `${reviews.rating.toFixed(1)} ★` : '—'}
              hint={reviews?.total != null ? `${reviews.total} reviews` : (reviews && !reviews.configured ? 'Not configured' : undefined)}
            />,
          )
        }
        if (kpis.length === 0) return null
        return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis}</div>
      })()}
    </section>
  )
}

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-700',
  sky: 'bg-sky-50 text-sky-700',
}

function Kpi({ icon, tone, label, value, hint }: {
  icon: React.ReactNode
  tone: keyof typeof TONES | string
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${TONES[tone] ?? TONES.sky}`}>{icon}</span>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function MiniStat({ icon, label, value, sub }: {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2.5 text-center">
      <div className="mb-1 flex justify-center">{icon}</div>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}{sub ? ` · ${sub}` : ''}</p>
    </div>
  )
}
