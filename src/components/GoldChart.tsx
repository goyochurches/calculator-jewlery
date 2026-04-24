import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ChartDataPoint } from '@/types'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface GoldChartProps {
  data: ChartDataPoint[]
  changePercent: number
}

export function GoldChart({ data, changePercent }: GoldChartProps) {
  const isPositive = changePercent >= 0

  return (
    <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <CardTitle className="text-base font-semibold text-slate-900">Gold (XAU)</CardTitle>
          <p className="mt-1 text-sm text-slate-500">Weekly trend</p>
        </div>
        <Badge className={isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}>
          {isPositive ? '+' : ''}
          {changePercent.toFixed(2)}%
        </Badge>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${v.toLocaleString()}`}
              width={70}
            />
            <Tooltip formatter={(value) => [`$${Number(value ?? 0).toLocaleString()}`, 'Gold']} />
            <Line
              type="monotone"
              dataKey="gold"
              stroke="#ca8a04"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
