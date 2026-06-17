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
  photoRef?: string
}

interface ScanResult {
  website: string
  snippets: string[]
  scannedAt: string
  error?: string
}

function StarRating({ rating }: { rating?: number }) {
  if (!rating) return <span className="text-xs text-slate-500">No rating</span>
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <span className="flex items-center gap-1">
      <span className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < full
                ? 'fill-amber-400 text-amber-400'
                : i === full && half
                ? 'fill-amber-200 text-amber-400'
                : 'text-slate-600'
            }`}
          />
        ))}
      </span>
      <span className="text-xs font-semibold text-amber-400">{rating.toFixed(1)}</span>
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
      const data = await api.post<ScanResult>('/api/competitors/scan', {
        website: place.website,
      })
      setResult(data)
    } catch (err: any) {
      setResult({ website: place.website ?? '', snippets: [], scannedAt: new Date().toISOString(), error: err.message })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/10 p-6">
          <div>
            <h2 className="text-lg font-bold text-white">{place.name}</h2>
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {!result ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <Zap className="h-10 w-10 text-amber-400" />
              <p className="text-sm text-slate-400">
                Scan this store's website for price mentions, product types, and jewelry categories.
              </p>
              <button
                onClick={runScan}
                disabled={scanning || !place.website}
                className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {scanning ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {scanning ? 'Scanning…' : 'Scan Website'}
              </button>
              {!place.website && (
                <p className="text-xs text-slate-500">No website listed for this store.</p>
              )}
            </div>
          ) : result.error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
              <p className="font-semibold">Scan failed</p>
              <p className="mt-1 text-xs">{result.error}</p>
              <button
                onClick={() => { setResult(null); runScan() }}
                className="mt-3 text-xs underline hover:text-rose-300"
              >
                Try again
              </button>
            </div>
          ) : result.snippets.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              No price-related content found on this website.
            </div>
          ) : (
            <div>
              <p className="mb-3 text-xs text-slate-500">
                Found {result.snippets.length} relevant snippet{result.snippets.length !== 1 ? 's' : ''} ·{' '}
                {new Date(result.scannedAt).toLocaleTimeString()}
              </p>
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {result.snippets.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-white/5 bg-white/5 px-4 py-2 text-xs text-slate-300"
                  >
                    {s}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => { setResult(null) }}
                className="mt-4 text-xs text-slate-500 underline hover:text-slate-300"
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
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-white">Market Research</h1>
        <p className="text-sm text-slate-400">
          Jewelry stores within ~10 miles of Huntington Beach, CA — sorted by Google rating.
        </p>
      </div>

      <div className="mb-6">
        <button
          onClick={search}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {loading ? 'Searching…' : 'Find Jewelry Stores Near Huntington Beach'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {places.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-800/60">
          <div className="border-b border-white/10 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {places.length} stores found
          </div>
          <div className="divide-y divide-white/5">
            {places.map((p) => (
              <div key={p.placeId} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{p.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StarRating rating={p.rating} />
                    {p.totalRatings != null && (
                      <span className="text-xs text-slate-500">({p.totalRatings} reviews)</span>
                    )}
                    {p.openNow != null && (
                      <span
                        className={`text-xs font-medium ${p.openNow ? 'text-emerald-400' : 'text-rose-400'}`}
                      >
                        {p.openNow ? 'Open' : 'Closed'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {p.address && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {p.address}
                      </span>
                    )}
                    {p.phone && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Phone className="h-3 w-3 shrink-0" />
                        {p.phone}
                      </span>
                    )}
                    {p.website && (
                      <a
                        href={p.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-amber-400 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        Website
                      </a>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setSelected(p)}
                  title={p.website ? 'Scan website for prices' : 'No website available'}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-amber-400/30 hover:bg-amber-400/10 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Scan prices
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && <ScanModal place={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
