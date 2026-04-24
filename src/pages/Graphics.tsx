import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHistory } from '@/hooks/useHistorial'
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type ChartPoint = { label: string; gold?: number; silver?: number }

const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${MONTH[+m - 1]} ${+d}`
}

function fmtUsd(v: number, decimals = 2) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export function Charts() {
  const { historyEntries, loading } = useHistory()

  // Merge gold + silver entries by date, sorted oldest→newest
  const allData = useMemo<ChartPoint[]>(() => {
    const byDate = new Map<string, ChartPoint>()
    for (const entry of historyEntries) {
      if (!byDate.has(entry.date)) byDate.set(entry.date, { label: fmtDate(entry.date) })
      const d = byDate.get(entry.date)!
      if (entry.metal === 'gold')   d.gold   = entry.price
      if (entry.metal === 'silver') d.silver = entry.price
    }
    return Array.from(byDate.values()).reverse()
  }, [historyEntries])

  const weekData  = allData.slice(-7)
  const goldOnly  = allData.filter(d => d.gold   != null)
  const silverOnly = allData.filter(d => d.silver != null)

  const latestGold   = goldOnly.at(-1)?.gold
  const latestSilver = silverOnly.at(-1)?.silver

  const signal = (() => {
    if (goldOnly.length < 2) return null
    const prev = goldOnly.at(-2)!.gold!
    const curr = latestGold!
    const pct  = ((curr - prev) / prev) * 100
    if (pct > 0.3)  return { text: 'Bullish momentum', color: 'text-emerald-400' }
    if (pct < -0.3) return { text: 'Bearish pressure', color: 'text-rose-400' }
    return { text: 'Consolidation phase', color: 'text-amber-400' }
  })()

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Loading charts…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Gold chart */}
        <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_18px_45px_rgba(15,23,42,0.08)] xl:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Gold (XAU/USD)
                </CardTitle>
                <p className="text-sm text-slate-500">Historical daily closes from live data.</p>
              </div>
              {latestGold != null && (
                <span className="rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-700">
                  {fmtUsd(latestGold, 2)}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={goldOnly}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `$${Number(v).toLocaleString()}`}
                  width={80}
                  domain={['auto', 'auto']}
                />
                <Tooltip formatter={v => [fmtUsd(Number(v)), 'Gold']} />
                <Line type="monotone" dataKey="gold" stroke="#ca8a04" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Quick-read panel */}
        <Card className="rounded-[28px] border border-white/80 bg-slate-950 text-white shadow-[0_20px_60px_rgba(15,23,42,0.2)]">
          <CardContent className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Quick read
            </p>
            {signal && (
              <p className={`mt-4 text-2xl font-semibold tracking-tight ${signal.color}`}>
                {signal.text}
              </p>
            )}
            <div className="mt-5 space-y-3">
              {latestGold != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Gold</span>
                  <span className="font-semibold text-amber-300">{fmtUsd(latestGold)}</span>
                </div>
              )}
              {latestSilver != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Silver</span>
                  <span className="font-semibold text-slate-300">{fmtUsd(latestSilver)}</span>
                </div>
              )}
            </div>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Prices update every 2 minutes from live market data.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Silver chart */}
        <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Silver (XAG/USD)
                </CardTitle>
              </div>
              {latestSilver != null && (
                <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
                  {fmtUsd(latestSilver, 2)}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={silverOnly}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `$${Number(v).toFixed(2)}`}
                  width={65}
                  domain={['auto', 'auto']}
                />
                <Tooltip formatter={v => [fmtUsd(Number(v)), 'Silver']} />
                <Line type="monotone" dataKey="silver" stroke="#64748b" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Weekly comparison */}
        <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              Weekly comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={weekData}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={40} yAxisId="gold" orientation="left" hide />
                <YAxis tick={{ fontSize: 11 }} width={40} yAxisId="silver" orientation="right" hide />
                <Tooltip />
                <Legend />
                <Line yAxisId="gold"   type="monotone" dataKey="gold"   name="Gold"   stroke="#ca8a04" strokeWidth={3} dot={{ r: 2 }} />
                <Line yAxisId="silver" type="monotone" dataKey="silver" name="Silver" stroke="#64748b" strokeWidth={3} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
