import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MetalPrice } from '@/types'

interface PriceTableProps {
  metals: MetalPrice[]
}

const METAL_STYLE: Record<string, { accent: string; bg: string; dot: string }> = {
  XAU: { accent: 'text-amber-600',  bg: 'bg-amber-50',   dot: 'bg-amber-400'  },
  XAG: { accent: 'text-slate-600',  bg: 'bg-slate-100',  dot: 'bg-slate-400'  },
}

function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const range = high - low
  const position = range > 0 ? ((current - low) / range) * 100 : 50

  return (
    <div className="mt-4">
      <div className="relative h-1.5 w-full rounded-full bg-slate-100">
        <div
          className="absolute h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400"
          style={{ width: '100%', opacity: range > 0 ? 1 : 0.3 }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-800 shadow-md transition-all"
          style={{ left: `${Math.max(4, Math.min(96, position))}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-medium text-slate-400">
        <span>L ${low.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span>H ${high.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  )
}

function MetalCard({ metal }: { metal: MetalPrice }) {
  const style = METAL_STYLE[metal.symbol] ?? METAL_STYLE['XAG']
  const isPositive = metal.change >= 0
  const decimals = metal.price < 100 ? 3 : 2

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${style.dot}`} />
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {metal.symbol}/USD
          </span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {isPositive ? '+' : ''}{metal.changePercent.toFixed(2)}%
        </span>
      </div>

      {/* Price */}
      <div className="mt-3">
        <p className={`text-2xl font-bold tracking-tight ${style.accent}`}>
          ${metal.price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
        </p>
        <p className={`mt-0.5 text-xs font-medium ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {isPositive ? '+' : ''}{metal.change.toFixed(decimals)} today
        </p>
      </div>

      {/* Open / High / Low grid */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {[
          { label: 'Open', value: metal.open },
          { label: 'High', value: metal.high },
          { label: 'Low',  value: metal.low  },
        ].map(({ label, value }) => (
          <div key={label} className="px-3 py-2.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-xs font-bold text-slate-700">
              ${(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
            </p>
          </div>
        ))}
      </div>

      {/* Intraday range bar */}
      <RangeBar low={metal.low ?? metal.price} high={metal.high ?? metal.price} current={metal.price} />
    </div>
  )
}

export function PriceTable({ metals }: PriceTableProps) {
  return (
    <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-base font-semibold text-slate-900">Market details</CardTitle>
        <p className="text-sm text-slate-500">Intraday levels — open, session high/low and current position.</p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {metals.map(m => <MetalCard key={m.symbol} metal={m} />)}
        </div>
      </CardContent>
    </Card>
  )
}
