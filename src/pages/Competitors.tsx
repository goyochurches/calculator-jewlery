import { useEffect, useState } from 'react'
import { api } from '@/api/apiClient'
import {
  CheckCircle, ExternalLink, Globe, MapPin, Phone,
  RefreshCw, Search, ShoppingBag, Star, Store, X, Zap,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Place {
  placeId: string
  name: string
  address: string
  rating?: number
  totalRatings?: number
  phone?: string
  website?: string
  lat: number
  lng: number
  openNow?: boolean
  snippetCount?: number
  lastScannedAt?: string
}

interface ScanResult {
  website: string
  snippets: string[]
  scannedAt: string
  error?: string
}

interface PriceResult {
  title: string
  price: string
  priceNumeric?: number
  source: string
  link: string
  thumbnail?: string
  rating?: string
  reviews?: string
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Stars({ rating }: { rating?: number }) {
  if (!rating) return <span className="text-xs text-slate-500">—</span>
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < Math.floor(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
      ))}
      <span className="ml-0.5 text-xs font-bold text-amber-400">{rating.toFixed(1)}</span>
    </span>
  )
}

// ── Scan modal ────────────────────────────────────────────────────────────────

function ScanModal({ place, onClose, onSaved }: {
  place: Place
  onClose: () => void
  onSaved: (placeId: string, count: number) => void
}) {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (place.snippetCount && place.snippetCount > 0) {
      api.get<ScanResult>(`/api/competitors/${place.placeId}/scan`).then(setResult).catch(() => {})
    }
  }, [place.placeId, place.snippetCount])

  async function runScan() {
    if (!place.website) return
    setScanning(true)
    setResult(null)
    try {
      const data = await api.post<ScanResult>('/api/competitors/scan', {
        website: place.website,
        placeId: place.placeId,
      })
      setResult(data)
      onSaved(place.placeId, data.snippets.length)
    } catch (err: any) {
      setResult({ website: place.website ?? '', snippets: [], scannedAt: new Date().toISOString(), error: err.message })
    } finally {
      setScanning(false)
    }
  }

  const filtered = result?.snippets.filter(s => !filter || s.toLowerCase().includes(filter.toLowerCase())) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" style={{ maxHeight: '90vh' }}>
        <div className="flex shrink-0 items-start justify-between border-b border-slate-700 p-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-white">{place.name}</h2>
            {place.website && (
              <a href={place.website} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-amber-400 hover:underline">
                <Globe className="h-3 w-3" />{place.website.replace(/^https?:\/\//, '').split('/')[0]}
              </a>
            )}
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-2">
            <button onClick={runScan} disabled={scanning || !place.website}
              className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-40">
              {scanning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {scanning ? 'Scanning…' : 'Scan now'}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col p-5">
          {scanning && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm text-slate-400">Scanning with Firecrawl — homepage + product pages…</p>
              <p className="text-xs text-slate-600">May take 30–60 seconds</p>
            </div>
          )}
          {!scanning && !result && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Zap className="h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-400">{place.website ? 'Click "Scan now" to extract all products and prices.' : 'No website for this store.'}</p>
            </div>
          )}
          {!scanning && result && (
            result.error && result.snippets.length === 0 ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
                <p className="font-semibold text-rose-400">Scan failed</p>
                <p className="mt-1 text-xs text-rose-300/80">{result.error}</p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-white">{result.snippets.length} items found</span>
                    <span className="text-xs text-slate-500">· {new Date(result.scannedAt).toLocaleString()}</span>
                  </div>
                  {result.snippets.length > 5 && (
                    <input type="text" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400" />
                  )}
                </div>
                {result.snippets.length === 0
                  ? <p className="py-6 text-center text-sm text-slate-500">No product or price content found.</p>
                  : <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                      {filtered.map((s, i) => (
                        <li key={i} className="rounded-lg border border-slate-700/60 bg-slate-800 px-3 py-2 text-xs text-slate-200">{s}</li>
                      ))}
                      {filtered.length === 0 && <li className="py-4 text-center text-xs text-slate-500">No results for "{filter}"</li>}
                    </ul>
                }
              </>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ── Price Search tab ──────────────────────────────────────────────────────────

const QUICK_SEARCHES = [
  'diamond engagement ring', 'gold wedding band', 'diamond necklace',
  'gold bracelet', 'pearl earrings', 'sapphire ring', 'platinum ring',
  'tennis bracelet', 'gold chain necklace', 'diamond stud earrings',
]

function PriceSearchTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PriceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function search(q: string) {
    const term = q.trim()
    if (!term) return
    setLoading(true)
    setError(null)
    setResults([])
    setSearched(term)
    try {
      const data = await api.get<PriceResult[]>(`/api/competitors/prices?q=${encodeURIComponent(term)}`)
      setResults(data)
    } catch (err: any) {
      setError(err.message ?? 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const avg = results.length > 0
    ? results.filter(r => r.priceNumeric).reduce((s, r) => s + (r.priceNumeric ?? 0), 0) / results.filter(r => r.priceNumeric).length
    : null
  const min = results.filter(r => r.priceNumeric).reduce((m, r) => Math.min(m, r.priceNumeric!), Infinity)
  const max = results.filter(r => r.priceNumeric).reduce((m, r) => Math.max(m, r.priceNumeric!), -Infinity)

  return (
    <div>
      {/* Search bar */}
      <div className="mb-5 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search(query)}
          placeholder="e.g. diamond engagement ring 14k gold"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400"
        />
        <button onClick={() => search(query)} disabled={loading || !query.trim()}
          className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-40">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {/* Quick searches */}
      <div className="mb-5 flex flex-wrap gap-2">
        {QUICK_SEARCHES.map(q => (
          <button key={q} onClick={() => { setQuery(q); search(q) }}
            className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:border-amber-400/40 hover:text-amber-400">
            {q}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {/* Stats */}
      {results.length > 0 && avg !== null && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Average price', value: `$${avg.toFixed(0)}` },
            { label: 'Lowest found', value: `$${min.toFixed(0)}` },
            { label: 'Highest found', value: `$${max.toFixed(0)}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center">
              <p className="text-lg font-bold text-amber-400">{value}</p>
              <p className="mt-0.5 text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Results grid */}
      {results.length > 0 && (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {results.length} results for "<span className="text-slate-300">{searched}</span>" via Google Shopping
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r, i) => (
              <a key={i} href={r.link} target="_blank" rel="noopener noreferrer"
                className="group flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800 p-4 transition hover:border-amber-400/40">
                {r.thumbnail && (
                  <img src={r.thumbnail} alt={r.title}
                    className="h-32 w-full rounded-lg object-contain bg-slate-700 p-2" />
                )}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white line-clamp-2 group-hover:text-amber-400 transition">{r.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{r.source}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-400">{r.price}</span>
                  {r.rating && (
                    <span className="flex items-center gap-1 text-xs text-amber-400">
                      <Star className="h-3 w-3 fill-amber-400" />{r.rating}
                      {r.reviews && <span className="text-slate-500">({r.reviews})</span>}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {!loading && searched && results.length === 0 && !error && (
        <p className="py-10 text-center text-sm text-slate-500">No results found. Try a different search.</p>
      )}
    </div>
  )
}

// ── Stores tab ────────────────────────────────────────────────────────────────

function StoresTab() {
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Place | null>(null)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try { setPlaces(await api.get<Place[]>('/api/competitors')) }
    catch (err: any) { setError(err.message ?? 'Failed to load') }
    finally { setLoading(false) }
  }

  async function triggerRefresh() {
    setRefreshing(true)
    try {
      await api.post('/api/competitors/refresh', {})
      setLastRefresh(new Date().toLocaleTimeString())
      await new Promise(r => setTimeout(r, 6000))
      await load()
    } catch (err: any) { setError(err.message) }
    finally { setRefreshing(false) }
  }

  function handleScanSaved(placeId: string, count: number) {
    setPlaces(prev => prev.map(p =>
      p.placeId === placeId ? { ...p, snippetCount: count, lastScannedAt: new Date().toISOString() } : p
    ))
  }

  const scanned = places.filter(p => p.snippetCount && p.snippetCount > 0).length

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {places.length > 0 && <>{scanned}/{places.length} scanned · updated daily at 8 AM{lastRefresh && <> · refresh started {lastRefresh}</>}</>}
        </span>
        <button onClick={triggerRefresh} disabled={refreshing || loading}
          className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-400/40 hover:text-white disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-3 py-16 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading stores…</span>
        </div>
      ) : places.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 py-16 text-center">
          <Store className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-white">No data yet</p>
          <p className="mt-1 text-sm text-slate-400">Click "Refresh now" to fetch stores and scan their websites.</p>
          <button onClick={triggerRefresh} disabled={refreshing}
            className="mx-auto mt-4 flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-40">
            <Search className="h-4 w-4" />Fetch & scan now
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800">
                {['Store', 'Rating', 'Address', 'Phone', 'Website', 'Status', 'Last scan', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {places.map(p => (
                <tr key={p.placeId} className="transition hover:bg-slate-800/60">
                  <td className="px-4 py-3 font-semibold text-white">{p.name}</td>
                  <td className="px-4 py-3">
                    <Stars rating={p.rating} />
                    {p.totalRatings != null && <span className="mt-0.5 block text-xs text-slate-500">{p.totalRatings.toLocaleString()}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.address
                      ? <span className="flex items-start gap-1 text-xs text-slate-300"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />{p.address}</span>
                      : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.phone
                      ? <span className="flex items-center gap-1 text-xs text-slate-300"><Phone className="h-3 w-3 shrink-0 text-slate-500" />{p.phone}</span>
                      : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.website
                      ? <a href={p.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-amber-400 hover:underline">
                          <ExternalLink className="h-3 w-3 shrink-0" />{p.website.replace(/^https?:\/\//, '').split('/')[0]}
                        </a>
                      : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.openNow != null
                      ? <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${p.openNow ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                          {p.openNow ? 'Open' : 'Closed'}
                        </span>
                      : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {p.lastScannedAt
                      ? <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="h-3 w-3" />{p.snippetCount} items</span>
                          <span className="text-xs text-slate-500">{new Date(p.lastScannedAt).toLocaleDateString()}</span>
                        </div>
                      : <span className="text-xs text-slate-600">Not scanned</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(p)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-400">
                      <Zap className="h-3.5 w-3.5" />
                      {p.lastScannedAt ? 'View' : 'Scan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <ScanModal place={selected} onClose={() => setSelected(null)} onSaved={handleScanSaved} />}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'stores' | 'prices'

export function CompetitorsPage() {
  const [tab, setTab] = useState<Tab>('stores')

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Market Research</h1>
        <p className="mt-1 text-sm text-slate-400">
          Competitor stores near Huntington Beach + Google Shopping price comparison
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-slate-700 bg-slate-800/50 p-1 w-fit">
        {([['stores', Store, 'Nearby Stores'], ['prices', ShoppingBag, 'Price Search']] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === key ? 'bg-white text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}>
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'stores' ? <StoresTab /> : <PriceSearchTab />}
    </div>
  )
}
