import { useEffect, useState } from 'react'
import { api } from '@/api/apiClient'
import {
  CheckCircle,
  ExternalLink,
  Globe,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Star,
  X,
  Zap,
} from 'lucide-react'

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

function ScanModal({ place, onClose, onSaved }: { place: Place; onClose: () => void; onSaved: (placeId: string, count: number) => void }) {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    // Load stored scan immediately if available
    if (place.snippetCount && place.snippetCount > 0) {
      api.get<ScanResult>(`/api/competitors/${place.placeId}/scan`)
        .then(setResult)
        .catch(() => {})
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

  const filtered = result?.snippets.filter(s =>
    !search || s.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-slate-700 p-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-white">{place.name}</h2>
            {place.website && (
              <a href={place.website} target="_blank" rel="noopener noreferrer"
                className="mt-0.5 flex items-center gap-1 text-xs text-amber-400 hover:underline">
                <Globe className="h-3 w-3" />
                {place.website.replace(/^https?:\/\//, '').split('/')[0]}
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

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col p-5">
          {scanning && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm text-slate-400">Scanning homepage + product pages…</p>
              <p className="text-xs text-slate-600">This may take 30–60 seconds</p>
            </div>
          )}

          {!scanning && !result && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Zap className="h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-400">
                {place.website ? 'Click "Scan now" to extract all product and price data.' : 'No website listed for this store.'}
              </p>
            </div>
          )}

          {!scanning && result && (
            <>
              {result.error && result.snippets.length === 0 ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
                  <p className="font-semibold">Scan failed</p>
                  <p className="mt-1 text-xs opacity-80">{result.error}</p>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-semibold text-white">
                        {result.snippets.length} items found
                      </span>
                      <span className="text-xs text-slate-500">
                        · {new Date(result.scannedAt).toLocaleString()}
                      </span>
                    </div>
                    {result.snippets.length > 5 && (
                      <input
                        type="text"
                        placeholder="Filter…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-400"
                      />
                    )}
                  </div>

                  {result.snippets.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">
                      No product or price content found on this site.
                    </p>
                  ) : (
                    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                      {filtered.map((s, i) => (
                        <li key={i} className="rounded-lg border border-slate-700/60 bg-slate-800 px-3 py-2 text-xs text-slate-200">
                          {s}
                        </li>
                      ))}
                      {filtered.length === 0 && (
                        <li className="py-4 text-center text-xs text-slate-500">No results for "{search}"</li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function CompetitorsPage() {
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
    try {
      const data = await api.get<Place[]>('/api/competitors')
      setPlaces(data)
    } catch (err: any) {
      setError(err.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function triggerRefresh() {
    setRefreshing(true)
    try {
      await api.post('/api/competitors/refresh', {})
      setLastRefresh(new Date().toLocaleTimeString())
      // Poll until data appears (refresh runs in background)
      await new Promise(r => setTimeout(r, 5000))
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  function handleScanSaved(placeId: string, count: number) {
    setPlaces(prev => prev.map(p =>
      p.placeId === placeId
        ? { ...p, snippetCount: count, lastScannedAt: new Date().toISOString() }
        : p
    ))
  }

  const scanned = places.filter(p => p.snippetCount && p.snippetCount > 0).length

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Research</h1>
          <p className="mt-1 text-sm text-slate-400">
            Jewelry stores within ~10 miles of Huntington Beach · updated daily at 8 AM
          </p>
        </div>
        <div className="flex items-center gap-3">
          {places.length > 0 && (
            <span className="text-xs text-slate-500">
              {scanned}/{places.length} scanned
              {lastRefresh && <> · started {lastRefresh}</>}
            </span>
          )}
          <button onClick={triggerRefresh} disabled={refreshing || loading}
            className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-400/40 hover:text-white disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 py-16 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading stores…</span>
        </div>
      ) : places.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 py-16 text-center">
          <Zap className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-white">No data yet</p>
          <p className="mt-1 text-sm text-slate-400">Click "Refresh now" to fetch stores from Google Maps and scan their websites.</p>
          <button onClick={triggerRefresh} disabled={refreshing}
            className="mt-4 flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-40 mx-auto">
            <Search className="h-4 w-4" />
            Fetch & scan now
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
              {places.map((p) => (
                <tr key={p.placeId} className="transition hover:bg-slate-800/60">
                  <td className="px-4 py-3 font-semibold text-white">{p.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <Stars rating={p.rating} />
                      {p.totalRatings != null && (
                        <span className="text-xs text-slate-500">{p.totalRatings.toLocaleString()}</span>
                      )}
                    </div>
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
                      ? <a href={p.website} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-amber-400 hover:underline">
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {p.website.replace(/^https?:\/\//, '').split('/')[0]}
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
                    {p.lastScannedAt ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle className="h-3 w-3" />
                          {p.snippetCount} items
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(p.lastScannedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-600">Not scanned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(p)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-400"
                    >
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

      {selected && (
        <ScanModal
          place={selected}
          onClose={() => setSelected(null)}
          onSaved={handleScanSaved}
        />
      )}
    </div>
  )
}
