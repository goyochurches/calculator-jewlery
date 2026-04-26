import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { gemstoneService } from '@/services/gemstoneService'
import type { GemstonePrice } from '@/types'
import { Diamond, Gem, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

const categoryLabels: Record<GemstonePrice['category'], string> = {
  diamond: 'Diamond',
  precious: 'Precious',
  'semi-precious': 'Semi-precious',
  organic: 'Organic',
}

const qualityLabels: Record<GemstonePrice['quality'], string> = {
  standard: 'Standard',
  premium: 'Premium',
  collector: 'Collector',
}

const qualityClasses: Record<GemstonePrice['quality'], string> = {
  standard: 'bg-slate-100 text-slate-700',
  premium: 'bg-emerald-50 text-emerald-700',
  collector: 'bg-amber-50 text-amber-700',
}

export function GemstonesPage() {
  const [gemstones, setGemstones] = useState<GemstonePrice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    gemstoneService.getAll()
      .then(setGemstones)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <GemstonesSkeleton />

  const highestStone = [...gemstones].sort((a, b) => b.price - a.price)[0]
  const averagePrice = gemstones.length
    ? gemstones.reduce((t, s) => t + s.price, 0) / gemstones.length
    : 0

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card className="rounded-[30px] border-0 bg-slate-950 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
          <CardContent className="relative p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.24),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.18),transparent_28%)]" />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-fuchsia-300">
                <Diamond className="h-4 w-4" />
                Stone library
              </div>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight">
                Keep gemstone reference prices ready for every jewelry quote.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
                Review commercial stone references by category, quality and pricing unit so you
                can add gems to budgets with much more confidence.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Tracked stones</p>
                  <p className="mt-2 text-2xl font-semibold">{gemstones.length}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Highest reference</p>
                  <p className="mt-2 text-2xl font-semibold">{highestStone?.name ?? '—'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Average price</p>
                  <p className="mt-2 text-2xl font-semibold">
                    ${averagePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Premium focus
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                    {highestStone?.name ?? '—'}
                  </p>
                </div>
                <div className="rounded-2xl bg-fuchsia-50 p-3 text-fuchsia-600">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {highestStone ? `$${highestStone.price.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${highestStone.unit}` : '—'}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Quote usage
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                    Ready
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                  <Gem className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Use these prices as your reference when adding stones, pearls or premium gems to a piece.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Gemstone price list</CardTitle>
          <p className="text-sm text-slate-500">
            Reference prices by category, quality and pricing unit.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Stone</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Category</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Quality</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Color</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Unit</th>
                  <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Price</th>
                  <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Notes</th>
                </tr>
              </thead>
              <tbody>
                {gemstones.map((stone) => (
                  <tr
                    key={stone.id}
                    className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-900">{stone.name}</td>
                    <td className="px-6 py-4 text-slate-500">{categoryLabels[stone.category]}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${qualityClasses[stone.quality]}`}>
                        {qualityLabels[stone.quality]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{stone.color}</td>
                    <td className="px-6 py-4 text-slate-500">{stone.unit}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                      ${stone.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{stone.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function GemstonesSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card className="rounded-[30px] border-0 bg-slate-950 shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
          <CardContent className="p-8 space-y-6">
            <Skeleton className="h-3 w-32 bg-white/15" />
            <Skeleton className="h-9 w-3/4 bg-white/25" />
            <Skeleton className="h-3 w-2/3 bg-white/15" />
            <div className="grid gap-4 md:grid-cols-3 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                  <Skeleton className="h-2.5 w-20 bg-white/15" />
                  <Skeleton className="h-7 w-24 bg-white/25" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-2.5 w-24 bg-slate-100" />
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                </div>
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-3 w-40 bg-slate-100" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100 space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-72 bg-slate-100" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4 hidden md:flex gap-10">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-2.5 w-16 bg-slate-200/70" />
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-10 px-6 py-5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3 w-24 bg-slate-100" />
                <Skeleton className="h-6 w-20 bg-slate-100" />
                <Skeleton className="h-3 w-16 bg-slate-100" />
                <Skeleton className="h-3 w-14 bg-slate-100" />
                <Skeleton className="h-3.5 w-16 ml-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
