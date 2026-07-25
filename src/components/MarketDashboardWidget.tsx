import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchMarketDashboard, type MarketDashboardData } from '@/services/marketComparisonService'
import { BarChart3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const SCORE_META: Record<number, { label: string; color: string }> = {
  1: { label: 'Expensive',    color: '#f43f5e' },
  2: { label: 'Above avg',    color: '#fb923c' },
  3: { label: 'Fair',         color: '#fbbf24' },
  4: { label: 'Competitive',  color: '#10b981' },
  5: { label: 'Excellent',    color: '#8b5cf6' },
}

const MY_COLOR = '#0ea5e9'
const COMPETITOR_COLOR = '#cbd5e1'

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export function MarketDashboardWidget() {
  const [data, setData] = useState<MarketDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMarketDashboard()
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError(String(err?.message ?? err)) })
    return () => { cancelled = true }
  }, [])

  const categoryData = (data?.categories ?? []).map(c => ({
    category: c.category.charAt(0).toUpperCase() + c.category.slice(1),
    myAvgPrice: Math.round(c.myAvgPrice),
    competitorAvgPrice: c.competitorAvgPrice != null ? Math.round(c.competitorAvgPrice) : null,
    myCount: c.myCount,
    competitorCount: c.competitorCount,
  }))

  const storeData = data
    ? [
        { name: 'Us', avgPrice: Math.round(data.myOverallAvg), count: null as number | null, isMe: true },
        ...data.stores.map(s => ({
          name: s.storeName,
          avgPrice: Math.round(s.avgPrice),
          count: s.count,
          isMe: false,
        })),
      ].sort((a, b) => a.avgPrice - b.avgPrice)
    : []

  const scoreData = [1, 2, 3, 4, 5].map(score => ({
    score,
    label: SCORE_META[score].label,
    count: Number(data?.priceScoreDistribution?.[String(score)] ?? 0),
  }))
  const totalScored = scoreData.reduce((acc, s) => acc + s.count, 0)

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-sky-50 p-2.5 text-sky-600">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">Our quotes vs. competitors</CardTitle>
            <p className="text-sm text-slate-500">Average price by category, and how our quotes score against market.</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8 p-6">
        {error ? (
          <div className="rounded-2xl bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">
            Couldn't load market data — {error}
          </div>
        ) : !data ? (
          <div className="h-64 animate-pulse rounded-2xl bg-slate-50" />
        ) : categoryData.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
            Not enough quote or competitor data yet.
          </p>
        ) : (
          <>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Avg. price by category
                </p>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: MY_COLOR }} />
                    Our quotes ({money(data.myOverallAvg)} avg)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COMPETITOR_COLOR }} />
                    Competitors ({money(data.competitorOverallAvg)} avg)
                  </span>
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} barGap={4}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="category"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickFormatter={v => money(v)}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                      formatter={((v: number, name: string, item: { payload: typeof categoryData[number] }) => {
                        if (name === 'myAvgPrice') return [`${money(v)} (${item.payload.myCount} quotes)`, 'Our avg']
                        return [`${money(v)} (${item.payload.competitorCount} products)`, 'Competitor avg']
                      }) as never}
                    />
                    <Bar dataKey="myAvgPrice" name="myAvgPrice" fill={MY_COLOR} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="competitorAvgPrice" name="competitorAvgPrice" fill={COMPETITOR_COLOR} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Us vs. each competitor store (avg. price, all categories)
              </p>
              {storeData.length <= 1 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                  No scraped competitor stores yet.
                </p>
              ) : (
                <div style={{ height: Math.max(storeData.length * 36, 120) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={storeData} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickFormatter={v => money(v)}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        width={130}
                        tick={{ fontSize: 11, fill: '#475569' }}
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                        formatter={((v: number, _name: string, item: { payload: typeof storeData[number] }) => [
                          item.payload.isMe ? money(v) : `${money(v)} (${item.payload.count} products)`,
                          item.payload.isMe ? 'Our avg' : 'Store avg',
                        ]) as never}
                      />
                      <Bar dataKey="avgPrice" radius={[0, 6, 6, 0]}>
                        {storeData.map(s => (
                          <Cell key={s.name} fill={s.isMe ? MY_COLOR : COMPETITOR_COLOR} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Price score distribution
              </p>
              {totalScored === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                  No quotes could be scored against competitor prices yet.
                </p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreData} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        width={90}
                        tick={{ fontSize: 11, fill: '#475569' }}
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                        formatter={((v: number) => [`${v} quote${v === 1 ? '' : 's'}`, 'Count']) as never}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                        {scoreData.map(s => (
                          <Cell key={s.score} fill={SCORE_META[s.score].color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
