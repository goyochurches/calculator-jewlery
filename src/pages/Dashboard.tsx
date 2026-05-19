import { GoldChart } from '@/components/GoldChart'
import { MetricCard } from '@/components/MetricCard'
import { PriceTable } from '@/components/PriceTable'
import { SilverChart } from '@/components/SilverChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useHistory } from '@/hooks/useHistorial'
import { useMetals } from '@/hooks/useMetals'
import { clientService } from '@/services/clientService'
import { quotesService, type UserQuoteStats } from '@/services/quotesService'
import type { ChartDataPoint } from '@/types'
import { DollarSign, FileText, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH[+m - 1]} ${+d}`
}

interface ChartDay { day: string; value: number; isToday: boolean }

interface DailyWidgetProps {
  label: string
  tooltipLabel: string
  icon: React.ReactNode
  iconBg: string
  fetcher: () => Promise<{ today: number; yesterday: number; perDay: Record<string, number> }>
  fill?: string
}

function DailyWidget({ label, tooltipLabel, icon, iconBg, fetcher, fill = 'var(--theme-secondary)' }: DailyWidgetProps) {
  const [todayCount, setTodayCount] = useState(0)
  const [yesterdayCount, setYesterdayCount] = useState(0)
  const [chartData, setChartData] = useState<ChartDay[]>([])

  useEffect(() => {
    fetcher()
      .then(({ today, yesterday, perDay }) => {
        setTodayCount(today)
        setYesterdayCount(yesterday)
        const localISO = (offset = 0) => {
          const d = new Date()
          d.setDate(d.getDate() + offset)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        }
        const todayKey = localISO(0)
        const yesterdayKey = localISO(-1)
        const entries = Object.entries(perDay).sort(([a], [b]) => a.localeCompare(b))
        const sorted = entries.map(([date, count]) => {
          const isToday = date === todayKey
          const d = new Date(date + 'T12:00:00')
          const dayLabel = isToday
            ? 'Today'
            : date === yesterdayKey
            ? 'Yesterday'
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          return { day: dayLabel, value: Number(count), isToday }
        })
        setChartData(sorted)
      })
      .catch(console.error)
  }, [fetcher])

  const diff = todayCount - yesterdayCount

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
            <p className="mt-3 text-5xl font-semibold tracking-tight text-slate-950">{todayCount}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`flex items-center gap-1 text-sm font-medium ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                <TrendingUp className="h-3.5 w-3.5" />
                {diff >= 0 ? '+' : ''}{diff} vs yesterday
              </span>
              <span className="text-sm text-slate-400">({yesterdayCount} yesterday)</span>
            </div>
          </div>
          <div className={`rounded-2xl p-3 ${iconBg}`}>
            {icon}
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
                formatter={((v: number) => [v, tooltipLabel]) as never}
              />
              <Bar
                dataKey="value"
                radius={[6, 6, 0, 0]}
                fill={fill}
                label={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function QuotesWidget() {
  return (
    <DailyWidget
      label="Quotes today"
      tooltipLabel="Quotes"
      icon={<FileText className="h-5 w-5" />}
      iconBg="bg-violet-50 text-violet-600"
      fetcher={async () => {
        const [today, yesterday, perDay] = await Promise.all([
          quotesService.countToday(),
          quotesService.countYesterday(),
          quotesService.countPerDay(7),
        ])
        return { today, yesterday, perDay }
      }}
    />
  )
}

function ClientsWidget() {
  return (
    <DailyWidget
      label="New clients today"
      tooltipLabel="New clients"
      icon={<Users className="h-5 w-5" />}
      iconBg="bg-sky-50 text-sky-600"
      fill="#0ea5e9"
      fetcher={async () => {
        const [today, yesterday, perDay] = await Promise.all([
          clientService.countToday(),
          clientService.countYesterday(),
          clientService.countPerDay(7),
        ])
        return { today, yesterday, perDay }
      }}
    />
  )
}

const STATUS_COLORS = {
  approved: '#10b981',
  pending: '#f59e0b',
  rejected: '#f43f5e',
  draft: '#94a3b8',
} as const

type StatusKey = keyof typeof STATUS_COLORS

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function RevenueWidget() {
  const [year] = useState(() => new Date().getFullYear())
  const [yearTotal, setYearTotal] = useState(0)
  const [monthly, setMonthly] = useState<Array<{ month: string; revenue: number; isCurrent: boolean }>>([])

  useEffect(() => {
    const currentMonth = new Date().getMonth() // 0-indexed
    Promise.all([
      quotesService.revenueYear(year),
      quotesService.revenuePerMonth(year),
    ])
      .then(([total, perMonth]) => {
        setYearTotal(total.total)
        const entries = Object.entries(perMonth).sort(([a], [b]) => a.localeCompare(b))
        setMonthly(entries.map(([key, revenue], idx) => ({
          month: MONTH_LABELS[idx] ?? key.slice(5),
          revenue: Number(revenue) || 0,
          isCurrent: idx === currentMonth,
        })))
      })
      .catch(console.error)
  }, [year])

  const bestMonth = monthly.reduce(
    (best, m) => (m.revenue > best.revenue ? m : best),
    { month: '', revenue: 0, isCurrent: false },
  )

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Approved revenue · {year}
            </p>
            <p className="mt-3 text-5xl font-semibold tracking-tight text-slate-950">
              ${yearTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {bestMonth.revenue > 0
                ? <>Best month: <strong className="text-slate-900">{bestMonth.month}</strong> · ${bestMonth.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</>
                : 'No approved quotes yet this year.'}
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-6 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} barSize={18}>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
              />
              <Tooltip
                cursor={false}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                formatter={((v: number) => [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Revenue']) as never}
              />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                {monthly.map((m, idx) => (
                  <Cell key={idx} fill={m.isCurrent ? '#10b981' : '#a7f3d0'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function ClientsMonthlyWidget() {
  const [year] = useState(() => new Date().getFullYear())
  const [yearTotal, setYearTotal] = useState(0)
  const [monthly, setMonthly] = useState<Array<{ month: string; clients: number; isCurrent: boolean }>>([])

  useEffect(() => {
    const currentMonth = new Date().getMonth()
    clientService.countPerMonth(year)
      .then(perMonth => {
        const entries = Object.entries(perMonth).sort(([a], [b]) => a.localeCompare(b))
        const data = entries.map(([key, count], idx) => ({
          month: MONTH_LABELS[idx] ?? key.slice(5),
          clients: Number(count) || 0,
          isCurrent: idx === currentMonth,
        }))
        setMonthly(data)
        setYearTotal(data.reduce((acc, m) => acc + m.clients, 0))
      })
      .catch(console.error)
  }, [year])

  const bestMonth = monthly.reduce(
    (best, m) => (m.clients > best.clients ? m : best),
    { month: '', clients: 0, isCurrent: false },
  )

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              New clients · {year}
            </p>
            <p className="mt-3 text-5xl font-semibold tracking-tight text-slate-950">
              {yearTotal}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {bestMonth.clients > 0
                ? <>Best month: <strong className="text-slate-900">{bestMonth.month}</strong> · {bestMonth.clients} new client{bestMonth.clients === 1 ? '' : 's'}</>
                : 'No new clients yet this year.'}
            </p>
          </div>
          <div className="rounded-2xl bg-sky-50 p-3 text-sky-600">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-6 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} barSize={18}>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#94a3b8' }}
              />
              <Tooltip
                cursor={false}
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                formatter={((v: number) => [v, 'New clients']) as never}
              />
              <Bar dataKey="clients" radius={[6, 6, 0, 0]}>
                {monthly.map((m, idx) => (
                  <Cell key={idx} fill={m.isCurrent ? '#0ea5e9' : '#bae6fd'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function QuoteStatusWidget() {
  const [stats, setStats] = useState<UserQuoteStats[]>([])

  useEffect(() => {
    quotesService.statsPerUser().then(setStats).catch(console.error)
  }, [])

  const totals = stats.reduce(
    (acc, s) => {
      acc.approved += s.approved
      acc.pending  += s.pending
      acc.rejected += s.rejected
      acc.draft    += s.draft
      return acc
    },
    { approved: 0, pending: 0, rejected: 0, draft: 0 } as Record<StatusKey, number>,
  )
  const total = totals.approved + totals.pending + totals.rejected + totals.draft

  const data = (Object.keys(STATUS_COLORS) as StatusKey[])
    .map(key => ({ name: key.charAt(0).toUpperCase() + key.slice(1), key, value: totals[key] }))
    .filter(d => d.value > 0)

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-base font-semibold text-slate-900">Quote status breakdown</CardTitle>
        <p className="text-sm text-slate-500">Approved vs pending vs rejected vs draft — all-time.</p>
      </CardHeader>
      <CardContent className="p-6">
        {total === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
            No quotes yet.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {data.map(d => (
                      <Cell key={d.key} fill={STATUS_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                    formatter={((v: number, name: string) => [`${v} (${pct(v)}%)`, name]) as never}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold text-slate-900">{total}</span>
                <span className="text-xs text-slate-400">total</span>
              </div>
            </div>
            <div className="grid w-full flex-1 grid-cols-2 gap-3">
              {(Object.keys(STATUS_COLORS) as StatusKey[]).map(key => (
                <div key={key} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS_COLORS[key] }} />
                    <span className="text-sm capitalize text-slate-600">{key}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900 tabular-nums">{totals[key]}</p>
                    <p className="text-[10px] text-slate-400 tabular-nums">{pct(totals[key])}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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

      <section className="grid gap-4 xl:grid-cols-2">
        <QuotesWidget />
        <ClientsWidget />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RevenueWidget />
        <ClientsMonthlyWidget />
      </section>

      <QuoteStatusWidget />

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
