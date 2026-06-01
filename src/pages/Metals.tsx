import { GoldChart } from '@/components/GoldChart'
import { MetricCard } from '@/components/MetricCard'
import { PriceTable } from '@/components/PriceTable'
import { SilverChart } from '@/components/SilverChart'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useHistory } from '@/hooks/useHistorial'
import { useMetals } from '@/hooks/useMetals'
import type { ChartDataPoint } from '@/types'
import { ShieldCheck } from 'lucide-react'
import { useMemo } from 'react'

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH[+m - 1]} ${+d}`
}

export function Metals() {
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

  if (loading) return <MetalsSkeleton />
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
        {gold && <GoldChart data={chartWeekData} changePercent={gold.changePercent} />}
        {silver && <SilverChart data={chartWeekData} changePercent={silver.changePercent} />}
      </section>

      <PriceTable metals={metals} />
    </div>
  )
}

function MetalsSkeleton() {
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
