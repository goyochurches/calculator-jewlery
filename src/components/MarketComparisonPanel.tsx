import { useEffect, useState } from 'react'
import { ExternalLink, TrendingUp, Clock, Store, Sparkles, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  fetchMarketComparison,
  type CompetitorProduct,
  type SimilarQuote,
  type MarketComparisonResult,
} from '@/services/marketComparisonService'

interface Props {
  jewelryType: string
  metalKey: string
  myPrice: number
  clientId?: number | null
  clientName?: string | null
  stoneType?: string | null
}

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const STORE_COLORS: Record<string, string> = {
  'Princess Bride Diamonds': 'bg-rose-50 text-rose-700 border-rose-200',
  'Happy Jewelers':          'bg-amber-50 text-amber-700 border-amber-200',
  "Mimi's Jewelry":          'bg-violet-50 text-violet-700 border-violet-200',
  'Blue Nile':               'bg-blue-50 text-blue-700 border-blue-200',
}

export function MarketComparisonPanel({ jewelryType, metalKey, myPrice, clientId, clientName, stoneType }: Props) {
  const [data, setData]       = useState<MarketComparisonResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!myPrice || myPrice <= 0) { setLoading(false); return }
    setLoading(true)
    setError(null)
    fetchMarketComparison(jewelryType, metalKey, myPrice, clientId, stoneType)
      .then(setData)
      .catch(() => setError('Could not load market data.'))
      .finally(() => setLoading(false))
  }, [jewelryType, metalKey, myPrice, clientId, stoneType])

  if (!myPrice || myPrice <= 0) return null

  const hasCompetitors = (data?.competitorProducts?.length ?? 0) > 0
  const hasPastQuotes  = (data?.myPastQuotes?.length ?? 0) > 0

  return (
    <div className="mt-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100">
          <TrendingUp className="h-4 w-4 text-violet-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Market comparison</p>
          <p className="text-[11px] text-slate-400">
            {clientName
              ? `${clientName}'s history + similar pieces in the market`
              : 'Similar pieces in the market vs. your price'}
          </p>
        </div>
      </div>

      {/* Price score */}
      {!loading && !error && data && (
        <PriceScoreBadge score={data.priceScore} label={data.priceLabel} />
      )}
      {loading && <Skeleton className="h-14 w-full rounded-2xl" />}

      {/* AI analysis */}
      {loading ? <AiAnalysisSkeleton /> :
       error   ? <ErrorBanner message={error} /> :
       data?.aiAnalysis ? <AiAnalysisBubble text={data.aiAnalysis} /> : null}

      {/* Competitor products */}
      {loading ? (
        <CompetitorsSkeleton />
      ) : hasCompetitors ? (
        <section>
          <SectionLabel icon={Store} label="Competitor products" />
          <CompetitorTable products={data!.competitorProducts} myPrice={myPrice} />
        </section>
      ) : !loading && !error ? (
        <EmptyState label="No competitor products found for this piece type yet." />
      ) : null}

      {/* Past quotes for this client */}
      {!loading && hasPastQuotes && (
        <section>
          <SectionLabel
            icon={Clock}
            label={clientName ? `${clientName}'s past quotes` : 'Similar past quotes'}
          />
          <div className="mt-2 space-y-2">
            {data!.myPastQuotes.map(q => (
              <PastQuoteRow key={q.id} quote={q} myPrice={myPrice} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Competitor table ──────────────────────────────────────────────────────────

function CompetitorTable({ products, myPrice }: { products: CompetitorProduct[]; myPrice: number }) {
  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-slate-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-3 py-2 text-left font-semibold text-slate-400 uppercase tracking-wider">Store</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-400 uppercase tracking-wider">Product</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-400 uppercase tracking-wider">Price</th>
            <th className="px-3 py-2 text-right font-semibold text-slate-400 uppercase tracking-wider">vs yours</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {products.map(p => <CompetitorRow key={p.id} product={p} myPrice={myPrice} />)}
        </tbody>
      </table>
    </div>
  )
}

function CompetitorRow({ product: p, myPrice }: { product: CompetitorProduct; myPrice: number }) {
  const diff      = p.priceUsd - myPrice
  const pct       = myPrice > 0 ? (diff / myPrice) * 100 : 0
  const cheaper   = diff < 0
  const storeColor = STORE_COLORS[p.storeName] ?? 'bg-slate-50 text-slate-600 border-slate-200'

  return (
    <tr className="group bg-white hover:bg-slate-50 transition-colors">
      {/* Store */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${storeColor}`}>
          {p.storeName}
        </span>
      </td>

      {/* Product name + meta */}
      <td className="px-3 py-2.5 max-w-[180px]">
        <div className="flex items-center gap-2">
          {p.imageUrl && (
            <img
              src={p.imageUrl}
              alt=""
              className="h-8 w-8 rounded-lg object-cover shrink-0 bg-slate-100"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-800 leading-tight">{p.productName}</p>
            {(p.karat || p.metalType) && (
              <p className="text-[10px] text-slate-400">{[p.karat, p.metalType].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </div>
      </td>

      {/* Price */}
      <td className="px-3 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
        {money(p.priceUsd)}
      </td>

      {/* % diff */}
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        <span className={`rounded-full px-2 py-0.5 font-bold text-[11px] ${
          cheaper ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
        }`}>
          {cheaper ? '−' : '+'}{Math.abs(Math.round(pct))}%
        </span>
      </td>

      {/* Link */}
      <td className="px-3 py-2.5 text-right">
        <a
          href={p.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-violet-500 hover:text-violet-700 font-medium transition"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </td>
    </tr>
  )
}

// ── Past quote row ────────────────────────────────────────────────────────────

function PastQuoteRow({ quote: q, myPrice }: { quote: SimilarQuote; myPrice: number }) {
  const diff = q.customerTotal - myPrice
  const pct  = myPrice > 0 ? (diff / myPrice) * 100 : 0
  const date = q.createdAt
    ? new Date(q.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{q.title}</p>
        <p className="text-[11px] text-slate-400">
          {date}
        </p>
      </div>
      <div className="ml-3 shrink-0 text-right">
        <p className="text-sm font-bold text-slate-900">{money(q.customerTotal)}</p>
        <p className={`text-[10px] font-medium ${
          Math.abs(pct) < 5 ? 'text-emerald-600' : 'text-slate-400'
        }`}>
          {Math.abs(pct) < 5 ? 'Similar price' : `${diff > 0 ? '+' : ''}${Math.round(pct)}% vs now`}
        </p>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ icon: Icon, label }: { icon: typeof Store; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  )
}

function AiAnalysisBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-4">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-violet-600">
        <Sparkles className="h-3.5 w-3.5 text-white" />
      </div>
      <p className="text-sm leading-relaxed text-slate-700">{text}</p>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-center text-xs text-slate-400">
      {label}
    </p>
  )
}

const SCORE_CONFIG = [
  { min: 1, max: 1, bg: 'bg-rose-50',    border: 'border-rose-200',   text: 'text-rose-700',   dot: 'bg-rose-500'   },
  { min: 2, max: 2, bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-400' },
  { min: 3, max: 3, bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
  { min: 4, max: 4, bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700',dot: 'bg-emerald-500'},
  { min: 5, max: 5, bg: 'bg-violet-50',  border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500' },
]

function PriceScoreBadge({ score, label }: { score: number; label: string }) {
  const cfg = SCORE_CONFIG.find(c => score >= c.min && score <= c.max) ?? SCORE_CONFIG[2]
  const dots = Array.from({ length: 5 }, (_, i) => i < score)

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex gap-1 shrink-0">
        {dots.map((filled, i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full transition ${filled ? cfg.dot : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-bold leading-tight ${cfg.text}`}>
          {score}/5 — {label}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">Price vs. competitors</p>
      </div>
    </div>
  )
}

function AiAnalysisSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <Skeleton className="mt-0.5 h-6 w-6 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  )
}

function CompetitorsSkeleton() {
  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-slate-100">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
        <Skeleton className="h-3 w-1/3" />
      </div>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 border-b border-slate-50 bg-white px-3 py-2.5 last:border-0">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  )
}
