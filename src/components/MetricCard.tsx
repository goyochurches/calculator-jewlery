import { Card } from '@/components/ui/card'
import type { MetalPrice } from '@/types'

interface MetricCardProps {
  metal: MetalPrice
}

export function MetricCard({ metal }: MetricCardProps) {
  const isPositive = metal.changePercent >= 0

  return (
    <Card className="rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            {metal.symbol}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{metal.name}</p>
          <p className="mt-1 text-sm text-slate-500">Spot market in USD</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isPositive
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700'
          }`}
        >
          {isPositive ? 'Bullish' : 'Pullback'}
        </span>
      </div>

      <div className="mt-8 flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-slate-950">
            ${metal.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Open ${metal.open.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <p className={`text-sm font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}
          {metal.changePercent.toFixed(2)}%
        </p>
      </div>
    </Card>
  )
}
