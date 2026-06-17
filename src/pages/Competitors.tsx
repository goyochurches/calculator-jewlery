import { useState } from 'react'
import { api } from '@/api/apiClient'
import {
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
  priceLevel?: number
}

interface ScanResult {
  website: string
  snippets: string[]
  scannedAt: string
  error?: string
}

function Stars({ rating }: { rating?: number }) {
  if (!rating) return <span className="text-xs text-slate-400">—</span>
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < Math.floor(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-500'
          }`}
        />
      ))}
      <span className="ml-0.5 text-xs font-bold text-amber-400">{rating.toFixed(1)}</span>
    </span>
  )
}

function ScanModal({ place, onClose }: { place: Place; onClose: () => void }) {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)

  async function runScan() {
    if (!place.website) return
    setScanning(true)
    try {
      const data = await api.post<ScanResult>('/api/competitors/scan', { website: place.website })
      setResult(data)
    } catch (err: any) {
      setResult({ website: place.website ?? '', snippets: [], scannedAt: new Date().toISOString(), error: err.message })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-700 p-5">
          <div>
            <h2 className="text-base font-bold text-white">{place.name}</h2>
            {place.website && (
              <a
                href={place.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 flex items-center gap-1 text-xs text-amber-400 hover:underline"
              >
                <Globe className="h-3 w-3" />
                {place.website.replace(/^https?:\/\//, '').split('/')[0]}
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {!result ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/10">
                <Zap className="h-7 w-7 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-white">Scan website for prices</p>
                <p className="mt-1 text-sm text-slate-400">
                  Extracts all price mentions, product names, and jewelry categories from their site.
                </p>
              </div>
              <button
                onClick={runScan}
                disabled={scanning || !place.website}
                className="flex items-center gap-2 rounded-xl bg-amber-400 px-6 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-40"
              >
                {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {scanning ? 'Scanning…' : 'Start Scan'}
              </button>
              {!place.website && (
                <p className="text-xs text-slate-500">No website listed for this store.</p>
              )}
            </div>
          ) : result.error ? (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
              <p className="font-semibold text-rose-400">Scan failed</p>
              <p className="mt-1 text-xs text-rose-300/80">{result.error}</p>
              <button
                onClick={() => { setResult(null) }}
                className="mt-3 text-xs text-rose-400 underline hover:text-rose-300"
              >
                Try again
              </button>
            </div>
          ) : result.snippets.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-slate-300">No price-related content found.</p>
              <p className="mt-1 text-xs text-slate-500">This site may require login or block scrapers.</p>
              <button onClick={() => setResult(null)} className="mt-3 text-xs text-amber-400 underline">Try again</button>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {result.snippets.length} snippet{result.snippets.length !== 1 ? 's' : ''} found
                </span>
                <span className="text-xs text-slate-500">{new Date(result.scannedAt).toLocaleTimeString()}</span>
              </div>
              <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                {result.snippets.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200"
                  >
                    {s}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setResult(null)}
                className="mt-3 text-xs text-slate-500 underline hover:text-slate-300"
              >
                Scan again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CompetitorsPage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Place | null>(null)

  async function search() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<Place[]>('/api/competitors/nearby')
      setPlaces(data)
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Market Research</h1>
        <p className="mt-1 text-sm text-slate-400">
          Jewelry stores within ~10 miles of Huntington Beach, CA — sorted by Google rating.
        </p>
      </div>

      <button
        onClick={search}
        disabled={loading}
        className="mb-6 flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
      >
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        {loading ? 'Searching Google Maps…' : 'Find Jewelry Stores Near Huntington Beach'}
      </button>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {places.length > 0 && (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {places.length} stores found
          </p>
          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Store</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Rating</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Website</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {places.map((p) => (
                  <tr key={p.placeId} className="transition hover:bg-slate-800/60">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white">{p.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <Stars rating={p.rating} />
                        {p.totalRatings != null && (
                          <span className="text-xs text-slate-500">{p.totalRatings} reviews</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {p.address ? (
                        <span className="flex items-start gap-1 text-xs text-slate-300">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                          {p.address}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.phone ? (
                        <span className="flex items-center gap-1 text-xs text-slate-300">
                          <Phone className="h-3 w-3 shrink-0 text-slate-500" />
                          {p.phone}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.website ? (
                        <a
                          href={p.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-amber-400 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {p.website.replace(/^https?:\/\//, '').split('/')[0]}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.openNow != null ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            p.openNow
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {p.openNow ? 'Open' : 'Closed'}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(p)}
                        disabled={!p.website}
                        title={p.website ? 'Scan website for prices' : 'No website'}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Scan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && <ScanModal place={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
