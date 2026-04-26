import { GoldChart } from '@/components/GoldChart'
import { MetricCard } from '@/components/MetricCard'
import { PriceTable } from '@/components/PriceTable'
import { SilverChart } from '@/components/SilverChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useHistory } from '@/hooks/useHistorial'
import { useMetals } from '@/hooks/useMetals'
import { quotesService, type UserQuoteStats } from '@/services/quotesService'
import type { ChartDataPoint } from '@/types'
import { FileText, ShieldCheck, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH[+m - 1]} ${+d}`
}

interface ChartDay { day: string; quotes: number; isToday: boolean }

function QuotesWidget() {
  const [todayCount, setTodayCount] = useState(0)
  const [yesterdayCount, setYesterdayCount] = useState(0)
  const [chartData, setChartData] = useState<ChartDay[]>([])

  useEffect(() => {
    Promise.all([
      quotesService.countToday(),
      quotesService.countYesterday(),
      quotesService.countPerDay(7),
    ])
      .then(([today, yesterday, perDay]) => {
        setTodayCount(today)
        setYesterdayCount(yesterday)
        const entries = Object.entries(perDay).sort(([a], [b]) => a.localeCompare(b))
        const lastIdx = entries.length - 1
        const sorted = entries.map(([date, count], i) => {
          const isToday = i === lastIdx
          const d = new Date(date + 'T12:00:00')
          const label = isToday
            ? 'Today'
            : i === lastIdx - 1
            ? 'Yesterday'
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return { day: label, quotes: Number(count), isToday }
        })
        setChartData(sorted)
      })
      .catch(console.error)
  }, [])

  const diff = todayCount - yesterdayCount

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Quotes today
            </p>
            <p className="mt-3 text-5xl font-semibold tracking-tight text-slate-950">{todayCount}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`flex items-center gap-1 text-sm font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                <TrendingUp className="h-3.5 w-3.5" />
                {diff >= 0 ? '+' : ''}{diff} vs yesterday
              </span>
              <span className="text-sm text-slate-400">({yesterdayCount} yesterday)</span>
            </div>
          </div>
          <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
            <FileText className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-6 h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={22}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
              />
              <Tooltip
                cursor={false}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                formatter={(v: number) => [v, 'Quotes']}
              />
              <Bar
                dataKey="quotes"
                radius={[6, 6, 0, 0]}
                fill="var(--theme-secondary)"
                label={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

const RANK_BG = [
  'bg-gradient-to-r from-amber-50/70 to-transparent',
  'bg-gradient-to-r from-slate-50/80 to-transparent',
  'bg-gradient-to-r from-orange-50/60 to-transparent',
]

const AVATAR_COLORS = [
  'bg-amber-100 text-amber-700',
  'bg-slate-200 text-slate-700',
  'bg-orange-100 text-orange-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
]

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function TeamQuotesWidget() {
  const [stats, setStats] = useState<UserQuoteStats[]>([])

  useEffect(() => {
    quotesService.statsPerUser().then(setStats).catch(console.error)
  }, [])

  if (!stats.length) return null

  const sorted = [...stats].sort((a, b) => {
    const diff = b.approved - a.approved
    if (diff !== 0) return diff
    const totalA = a.approved + a.pending + a.rejected + a.draft
    const totalB = b.approved + b.pending + b.rejected + b.draft
    return totalB - totalA
  })

  const maxTotal = Math.max(...sorted.map(s => s.approved + s.pending + s.rejected + s.draft), 1)

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">Team leaderboard</CardTitle>
            <p className="text-sm text-slate-500">Ranked by approved quotes — bars scaled to team max.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />Approved</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />Pending</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-rose-500" />Rejected</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-slate-300" />Draft</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="divide-y divide-slate-50/80 p-0">
        {sorted.map((s, i) => {
          const total    = s.approved + s.pending + s.rejected + s.draft
          const rate     = total > 0 ? Math.round((s.approved / total) * 100) : 0
          const barWidth = (n: number) => `${(n / maxTotal) * 100}%`
          const rateColor = rate >= 60
            ? 'bg-emerald-50 text-emerald-700'
            : rate >= 35
            ? 'bg-amber-50 text-amber-700'
            : 'bg-rose-50 text-rose-700'

          return (
            <div key={s.userName} className={`px-6 py-4 ${i < 3 ? RANK_BG[i] : ''}`}>
              <div className="flex items-center gap-4">

                {/* Rank */}
                <div className="w-7 shrink-0 text-center">
                  {i < 3
                    ? <span className="text-lg leading-none">{MEDALS[i]}</span>
                    : <span className="text-xs font-bold text-slate-300">#{i + 1}</span>
                  }
                </div>

                {/* Avatar */}
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
                  {initials(s.userName)}
                </div>

                {/* Bars + info */}
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{s.userName}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums text-xs text-slate-400">{total} quotes</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${rateColor}`}>
                        {rate}% approved
                      </span>
                    </div>
                  </div>

                  {/* Stacked bar — absolute scale (relative to team max) */}
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    {s.approved  > 0 && <div className="bg-emerald-500 transition-all" style={{ width: barWidth(s.approved)  }} />}
                    {s.pending   > 0 && <div className="bg-amber-400  transition-all" style={{ width: barWidth(s.pending)   }} />}
                    {s.rejected  > 0 && <div className="bg-rose-500   transition-all" style={{ width: barWidth(s.rejected)  }} />}
                    {s.draft     > 0 && <div className="bg-slate-300  transition-all" style={{ width: barWidth(s.draft)     }} />}
                  </div>

                  {/* Counts */}
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                    {s.approved  > 0 && <span className="text-emerald-600 font-medium">{s.approved} approved</span>}
                    {s.pending   > 0 && <span className="text-amber-600  font-medium">{s.pending} pending</span>}
                    {s.rejected  > 0 && <span className="text-rose-600   font-medium">{s.rejected} rejected</span>}
                    {s.draft     > 0 && <span>{s.draft} draft</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function Dashboard() {
  const { metals, loading, error } = useMetals()
  const { historyEntries } = useHistory()

  const chartWeekData = useMemo<ChartDataPoint[]>(() => {
    const byDate = new Map<string, ChartDataPoint>()
    for (const e of historyEntries) {
      if (!byDate.has(e.date)) byDate.set(e.date, { label: fmtDate(e.date), gold: 0, silver: 0 })
      const d = byDate.get(e.date)!
      if (e.metal === 'gold')   d.gold   = e.price
      if (e.metal === 'silver') d.silver = e.price
    }
    return Array.from(byDate.values()).reverse().slice(-7)
  }, [historyEntries])

  if (loading) return <DashboardSkeleton />
  if (error) return <p className="text-sm text-red-500">{error}</p>

  const gold = metals.find((m) => m.symbol === 'XAU')
  const silver = metals.find((m) => m.symbol === 'XAG')

  return (
    <div className="space-y-6">
      <section>
        <Card className="overflow-hidden rounded-[32px] border-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <CardContent className="relative p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.24),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.20),transparent_28%)]" />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-300/90">
                <ShieldCheck className="h-4 w-4" />
                Executive snapshot
              </div>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-white">
                Keep your metals desk readable at a glance.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                Live pricing, directional signals and core market context now sit in a cleaner
                panel designed to feel like a proper operations workspace.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Gold spot</p>
                  <p className="mt-2 text-2xl font-semibold">
                    ${gold?.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '--'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Silver spot</p>
                  <p className="mt-2 text-2xl font-semibold">
                    ${silver?.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '--'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Au/Ag ratio</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {gold && silver ? (gold.price / silver.price).toFixed(1) : '--'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metals.map((m) => (
          <MetricCard key={m.symbol} metal={m} />
        ))}
      </section>

      <section>
        <QuotesWidget />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {gold && <GoldChart data={chartWeekData} changePercent={gold.changePercent} />}
        {silver && <SilverChart data={chartWeekData} changePercent={silver.changePercent} />}
      </section>

      <TeamQuotesWidget />

      <PriceTable metals={metals} />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-[32px] border-0 shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
        <CardContent className="p-8 space-y-6">
          <Skeleton className="h-3 w-40 bg-white/20" />
          <Skeleton className="h-8 w-3/4 bg-white/30" />
          <Skeleton className="h-3 w-2/3 bg-white/20" />
          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <Skeleton className="h-2.5 w-20 bg-white/20" />
                <Skeleton className="h-6 w-24 bg-white/30" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
            <CardContent className="p-5 space-y-3">
              <Skeleton className="h-2.5 w-16 bg-slate-100" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20 bg-slate-100" />
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <Skeleton className="h-2.5 w-24 bg-slate-100" />
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-3 w-40 bg-slate-100" />
            </div>
            <Skeleton className="h-12 w-12 rounded-2xl" />
          </div>
          <div className="flex items-end gap-2 h-28">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="flex-1 rounded-t-md bg-slate-100" style={{ height: `${30 + ((i * 13) % 70)}%` }} />
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-7 w-20 rounded-xl bg-slate-100" />
              </div>
              <Skeleton className="h-48 w-full rounded-2xl bg-slate-100" />
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
