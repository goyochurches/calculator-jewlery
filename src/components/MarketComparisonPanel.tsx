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
}

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export function MarketComparisonPanel({ jewelryType, metalKey, myPrice }: Props) {
  const [data, setData]     = useState<MarketComparisonResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!myPrice || myPrice <= 0) { setLoading(false); return }
    setLoading(true)
    setError(null)
    fetchMarketComparison(jewelryType, metalKey, myPrice)
      .then(setData)
      .catch(() => setError('Could not load market data.'))
      .finally(() => setLoading(false))
  }, [jewelryType, metalKey, myPrice])

  const hasCompetitors = (data?.competitorProducts?.length ?? 0) > 0
  const hasPastQuotes  = (data?.myPastQuotes?.length ?? 0) > 0
  const hasAny         = hasCompetitors || hasPastQuotes

  if (!myPrice || myPrice <= 0) return null

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100">
          <TrendingUp className="h-4 w-4 text-violet-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Market comparison</p>
          <p className="text-[11px] text-slate-400">Similar pieces in the market vs. your price</p>
        </div>
      </div>

      {/* AI analysis */}
      {loading ? (
        <AiAnalysisSkeleton />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : data?.aiAnalysis ? (
        <AiAnalysisBubble text={data.aiAnalysis} />
      ) : null}

      {/* Competitor products */}
      {loading ? (
        <CompetitorsSkeleton />
      ) : hasCompetitors ? (
        <section>
          <SectionLabel icon={Store} label="Competitor products" />
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {data!.competitorProducts.map(p => (
              <CompetitorCard key={p.id} product={p} myPrice={myPrice} />
            ))}
          </div>
        </section>
      ) : !loading && !error ? (
        <EmptyState label="No competitor products found for this piece type yet." />
      ) : null}

      {/* Past similar quotes */}
      {loading ? null : hasPastQuotes ? (
        <section>
          <SectionLabel icon={Clock} label="Your similar past quotes" />
          <div className="mt-2 space-y-2">
            {data!.myPastQuotes.map(q => (
              <PastQuoteRow key={q.id} quote={q} myPrice={myPrice} />
            ))}
          </div>
        </section>
      ) : !loading && !error && hasAny ? null : !loading && !error ? (
        <EmptyState label="No past quotes found for this piece type yet." />
      ) : null}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

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

function CompetitorCard({ product: p, myPrice }: { product: CompetitorProduct; myPrice: number }) {
  const diff     = p.priceUsd - myPrice
  const pct      = myPrice > 0 ? ((diff / myPrice) * 100) : 0
  const cheaper  = diff < 0
  const diffLabel = `${cheaper ? '−' : '+'}${Math.abs(Math.round(pct))}% vs yours`

  return (
    <a
      href={p.productUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:border-violet-200 hover:shadow-md"
    >
      {/* Image */}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
        {p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt={p.productName}
            className="h-full w-full object-cover transition group-hover:scale-105"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Store className="h-5 w-5 text-slate-300" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <p className="line-clamp-2 text-xs font-semibold text-slate-800 leading-tight">{p.productName}</p>
          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-slate-300 group-hover:text-violet-500" />
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">{p.storeName}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-sm font-bold text-slate-900">{money(p.priceUsd)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            cheaper
              ? 'bg-rose-50 text-rose-600'
              : 'bg-emerald-50 text-emerald-600'
          }`}>
            {diffLabel}
          </span>
        </div>
        {(p.karat || p.metalType) && (
          <p className="mt-0.5 text-[10px] text-slate-400">
            {[p.karat, p.metalType].filter(Boolean).join(' ')}
          </p>
        )}
      </div>
    </a>
  )
}

function PastQuoteRow({ quote: q, myPrice }: { quote: SimilarQuote; myPrice: number }) {
  const diff = q.customerTotal - myPrice
  const pct  = myPrice > 0 ? ((diff / myPrice) * 100) : 0
  const date = q.createdAt ? new Date(q.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''

  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{q.title}</p>
        <p className="text-[11px] text-slate-400">
          {q.clientName ? `${q.clientName} · ` : ''}{date}
        </p>
      </div>
      <div className="ml-3 text-right shrink-0">
        <p className="text-sm font-bold text-slate-900">{money(q.customerTotal)}</p>
        <p className={`text-[10px] font-medium ${Math.abs(pct) < 5 ? 'text-emerald-600' : 'text-slate-400'}`}>
          {Math.abs(pct) < 5 ? 'Similar price' : `${diff > 0 ? '+' : ''}${Math.round(pct)}% vs now`}
        </p>
      </div>
    </div>
  )
}

function SectionLabel({ icon: Icon, label }: { icon: typeof Store; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
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
    <div className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3">
          <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

