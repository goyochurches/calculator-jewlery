import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { reviewsService, type GoogleReviews } from '@/services/reviewsService'
import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/** Row of 5 stars, filled up to `value` (rounded to nearest half visually
 *  via full stars only — keeps it simple and legible). */
function Stars({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'}`}
        />
      ))}
    </div>
  )
}

export function ReviewsPage() {
  const [data, setData] = useState<GoogleReviews | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    reviewsService.get()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reviews'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Reviews</h1>
        <p className="text-sm text-slate-500">Your Google rating and most recent reviews.</p>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-[24px] bg-slate-200/60" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl bg-slate-200/60" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card className="rounded-[24px] border border-rose-200 bg-rose-50/40">
          <CardContent className="px-6 py-8 text-center text-sm text-rose-700">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && data && !data.configured && (
        <Card className="rounded-[24px] border border-amber-200 bg-amber-50/40">
          <CardContent className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-800">Reviews aren't set up yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              Add your <strong>Google Place ID</strong> in{' '}
              <Link to="/configuration" className="font-semibold text-amber-700 underline">Configuration</Link>{' '}
              (and set the <code className="rounded bg-amber-100 px-1">GOOGLE_PLACES_API_KEY</code> on the server) to
              pull your rating and reviews here.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && data.configured && (
        <>
          {/* Rating summary */}
          <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="flex flex-col items-center gap-2 px-6 py-8 sm:flex-row sm:justify-between sm:gap-6">
              <div className="flex items-center gap-4">
                <div className="text-5xl font-semibold tabular-nums text-slate-900">
                  {data.rating != null ? data.rating.toFixed(1) : '—'}
                </div>
                <div>
                  <Stars value={data.rating ?? 0} />
                  <p className="mt-1 text-sm text-slate-500">
                    {data.total != null ? `${data.total.toLocaleString()} Google ${data.total === 1 ? 'review' : 'reviews'}` : 'No ratings yet'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Review list */}
          {data.reviews.length === 0 ? (
            <Card className="rounded-[24px] border border-slate-200 bg-white">
              <CardContent className="px-6 py-10 text-center text-sm text-slate-500">
                No reviews to show yet.
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-[24px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-base font-semibold text-slate-900">Latest reviews</CardTitle>
                <p className="text-sm text-slate-500">Google shows up to 5 of the most relevant reviews.</p>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100 p-0">
                {data.reviews.map((r, idx) => (
                  <div key={idx} className="flex gap-4 px-6 py-5">
                    {r.profilePhotoUrl ? (
                      <img src={r.profilePhotoUrl} alt={r.authorName} className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                        {r.authorName?.charAt(0) ?? '?'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{r.authorName}</p>
                        {r.relativeTime && <span className="text-xs text-slate-400">{r.relativeTime}</span>}
                      </div>
                      {r.rating != null && <Stars value={r.rating} className="mt-1" />}
                      {r.text && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.text}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default ReviewsPage
