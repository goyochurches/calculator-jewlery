import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Search, SlidersHorizontal, Store, X } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  fetchCompetitorProducts,
  fetchFilterOptions,
  type CompetitorProduct,
  type CompetitorProductPage,
  type FilterOptions,
} from '@/services/marketComparisonService'

const STORE_COLORS: Record<string, string> = {
  'Princess Bride Diamonds': 'bg-rose-50 text-rose-700 border-rose-200',
  "Happy Jewelers":          'bg-amber-50 text-amber-700 border-amber-200',
  "Mimi's Jewelry":          'bg-violet-50 text-violet-700 border-violet-200',
  'Blue Nile':               'bg-blue-50 text-blue-700 border-blue-200',
}

const STORE_DOMAINS: Record<string, string> = {
  'Princess Bride Diamonds': 'princessbridediamonds.com',
  "Happy Jewelers":          'happyjewelersofficial.shop',
  "Mimi's Jewelry":          'mimisjewelryinc.com',
  'Blue Nile':               'bluenile.com',
}

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

type Filters = {
  store: string
  category: string
  metalType: string
  karat: string
  search: string
}

const EMPTY: Filters = { store: '', category: '', metalType: '', karat: '', search: '' }

const KARAT_OPTIONS = ['10k', '14k', '18k', '22k', '24k', 'platinum', 'silver']
const METAL_OPTIONS = ['gold', 'platinum', 'silver', 'rose gold', 'white gold', 'yellow gold']

export function MarketPricesPage() {
  const [filters, setFilters]       = useState<Filters>(EMPTY)
  const [draft, setDraft]           = useState('')          // live search box value
  const [data, setData]             = useState<CompetitorProductPage | null>(null)
  const [opts, setOpts]             = useState<FilterOptions | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [page, setPage]             = useState(0)
  const [showFilters, setShowFilters] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load filter options once
  useEffect(() => {
    fetchFilterOptions().then(setOpts).catch(() => null)
  }, [])

  // Load products whenever filters or page change
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchCompetitorProducts({ ...filters, page, size: 24 })
      .then(setData)
      .catch(() => setError('Could not load products.'))
      .finally(() => setLoading(false))
  }, [filters, page])

  function set(key: keyof Filters, val: string) {
    setFilters(prev => ({ ...prev, [key]: val }))
    setPage(0)
  }

  function onSearchChange(val: string) {
    setDraft(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      set('search', val)
    }, 400)
  }

  function clearFilters() {
    setFilters(EMPTY)
    setDraft('')
    setPage(0)
  }

  const hasActiveFilters = Object.values(filters).some(v => v !== '')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Competitor products</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data ? `${data.totalElements.toLocaleString()} products from ${opts?.stores.length ?? 0} stores` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
              placeholder="Search products…"
              value={draft}
              onChange={e => onSearchChange(e.target.value)}
            />
            {draft && (
              <button
                onClick={() => { setDraft(''); set('search', '') }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition ${
              showFilters || hasActiveFilters
                ? 'border-violet-200 bg-violet-50 text-violet-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] text-white">
                {Object.values(filters).filter(v => v !== '').length}
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 underline">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <FilterSelect
            label="Store"
            value={filters.store}
            onChange={v => set('store', v)}
            options={opts?.stores ?? []}
          />
          <FilterSelect
            label="Category"
            value={filters.category}
            onChange={v => set('category', v)}
            options={opts?.categories ?? []}
          />
          <FilterSelect
            label="Metal"
            value={filters.metalType}
            onChange={v => set('metalType', v)}
            options={METAL_OPTIONS}
          />
          <FilterSelect
            label="Karat"
            value={filters.karat}
            onChange={v => set('karat', v)}
            options={KARAT_OPTIONS}
          />
        </div>
      )}

      {/* ── Store pills ─────────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap gap-2">
        {(opts?.stores ?? []).map(s => (
          <button
            key={s}
            onClick={() => set('store', filters.store === s ? '' : s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filters.store === s
                ? (STORE_COLORS[s] ?? 'bg-violet-50 text-violet-700 border-violet-200')
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      {error ? (
        <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">{error}</p>
      ) : loading ? (
        <ProductGridSkeleton />
      ) : data && data.content.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {data.content.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
          <Pagination data={data} page={page} setPage={setPage} />
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
          No products match the current filters.
        </p>
      )}
    </div>
  )
}

// ── Product card ─────────────────────────────────────────────────────────────

function ProductCard({ product: p }: { product: CompetitorProduct }) {
  const storeColor = STORE_COLORS[p.storeName] ?? 'bg-slate-50 text-slate-600 border-slate-200'
  const storeDomain = STORE_DOMAINS[p.storeName]

  return (
    <a
      href={p.productUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-violet-200 hover:shadow-md"
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt={p.productName}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            onError={e => {
              const el = e.target as HTMLImageElement
              el.style.display = 'none'
              el.parentElement!.classList.add('flex', 'items-center', 'justify-center')
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Store className="h-10 w-10 text-slate-300" />
          </div>
        )}
        {/* External link icon on hover */}
        <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 opacity-0 shadow transition group-hover:opacity-100">
          <ExternalLink className="h-3.5 w-3.5 text-slate-600" />
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-4">
        {/* Store badge + domain */}
        <div className="mb-2 flex items-center gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${storeColor}`}>
            {p.storeName}
          </span>
          {storeDomain && (
            <span className="text-[10px] text-slate-400">{storeDomain}</span>
          )}
        </div>

        {/* Title */}
        <p className="line-clamp-2 flex-1 text-sm font-semibold leading-snug text-slate-800">
          {p.productName}
        </p>

        {/* Meta */}
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {p.category && (
            <span className="text-[11px] capitalize text-slate-400">{p.category}</span>
          )}
          {(p.karat || p.metalType) && (
            <span className="text-[11px] text-slate-400">
              {[p.karat, p.metalType].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="mt-3 flex items-end justify-between">
          <p className="text-lg font-bold text-slate-900">{money(p.priceUsd)}</p>
          <span className="text-[10px] font-medium text-violet-500 group-hover:underline">
            View →
          </span>
        </div>
      </div>
    </a>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Pagination({
  data, page, setPage,
}: { data: CompetitorProductPage; page: number; setPage: (p: number) => void }) {
  if (data.totalPages <= 1) return null
  return (
    <div className="mt-8 flex items-center justify-center gap-2">
      <button
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40 hover:bg-slate-50"
      >
        ← Prev
      </button>
      <span className="text-sm text-slate-500">
        Page {page + 1} of {data.totalPages}
      </span>
      <button
        disabled={page >= data.totalPages - 1}
        onClick={() => setPage(page + 1)}
        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40 hover:bg-slate-50"
      >
        Next →
      </button>
    </div>
  )
}

function ProductGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-5 w-1/2 mt-3" />
          </div>
        </div>
      ))}
    </div>
  )
}
