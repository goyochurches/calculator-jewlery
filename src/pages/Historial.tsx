import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SIGNAL_LABELS } from '@/constants/config'
import { useHistory } from '@/hooks/useHistorial'
import type { HistorialEntry } from '@/types'

function SignalBadge({ signal }: { signal: HistorialEntry['signal'] }) {
  const variants: Record<HistorialEntry['signal'], string> = {
    buy: 'bg-emerald-50 text-emerald-700',
    sell: 'bg-rose-50 text-rose-700',
    hold: 'bg-amber-50 text-amber-700',
  }

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${variants[signal]}`}>
      {SIGNAL_LABELS[signal]}
    </span>
  )
}

export function HistoryPage() {
  const { historyEntries, loading, error } = useHistory()

  if (loading) return <p className="text-sm text-slate-500">Loading history...</p>
  if (error) return <p className="text-sm text-red-500">{error}</p>

  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-base font-semibold text-slate-900">Recent entries</CardTitle>
        <p className="text-sm text-slate-500">
          Recent signal history across gold and silver instruments.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Date</th>
                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Metal</th>
                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Price</th>
                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Change</th>
                <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Signal</th>
              </tr>
            </thead>
            <tbody>
              {historyEntries.map((entry) => {
                const isPositive = entry.changePercent >= 0

                return (
                  <tr key={entry.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                    <td className="px-6 py-4 text-slate-500">{entry.date}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {entry.metal === 'gold' ? 'Gold' : 'Silver'}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      ${entry.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`px-6 py-4 font-medium ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isPositive ? '+' : ''}
                      {entry.changePercent.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4">
                      <SignalBadge signal={entry.signal} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
