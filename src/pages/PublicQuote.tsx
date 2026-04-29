import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CAD_DESIGN_OPTIONS,
  DIAMOND_SIZE_OPTIONS,
  DIAMOND_TYPE_OPTIONS,
  JEWELRY_METAL_OPTIONS,
  RING_LABOR_OPTIONS,
} from '@/constants/config'
import {
  publicQuoteService,
  PublicQuoteExpiredError,
  PublicQuoteNotFoundError,
  type PublicQuote,
} from '@/services/publicQuoteService'
import { AlertCircle, Clock, Diamond, Gem, Ruler, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

export function PublicQuotePage() {
  const { token } = useParams<{ token: string }>()
  const [quote, setQuote] = useState<PublicQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [expired, setExpired] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return }
    setLoading(true)
    publicQuoteService.getByToken(token)
      .then(setQuote)
      .catch(err => {
        if (err instanceof PublicQuoteNotFoundError) setNotFound(true)
        else if (err instanceof PublicQuoteExpiredError) setExpired(true)
        else setError(err instanceof Error ? err.message : 'Failed to load quote')
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <PublicShell><LoadingState /></PublicShell>
  if (expired)  return <PublicShell><ExpiredState /></PublicShell>
  if (notFound) return <PublicShell><NotFoundState /></PublicShell>
  if (error)    return <PublicShell><ErrorState message={error} /></PublicShell>
  if (!quote)   return <PublicShell><NotFoundState /></PublicShell>

  return <PublicShell companyName={quote.companyName}><QuoteView quote={quote} /></PublicShell>
}

function ExpiredState() {
  return (
    <Card className="rounded-[28px] border border-amber-200 bg-amber-50/40 shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">This share link has expired</h1>
        <p className="max-w-md text-sm text-slate-600">
          Quote share links are valid for 3 months. Please contact the person who sent it
          and ask them to refresh the link.
        </p>
      </CardContent>
    </Card>
  )
}

function PublicShell({ children, companyName }: { children: React.ReactNode; companyName?: string | null }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-600">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-semibold tracking-wide">
              {companyName ?? 'Jewelry Quote'}
            </span>
          </div>
        </header>
        {children}
        <footer className="mt-10 text-center text-xs text-slate-400">
          This quote was prepared by {companyName ?? 'our team'}. Shared link — no account required.
        </footer>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full rounded-[28px] bg-slate-200/60" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[20px] bg-slate-200/60" />
        ))}
      </div>
    </div>
  )
}

function NotFoundState() {
  return (
    <Card className="rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Quote not found</h1>
        <p className="max-w-md text-sm text-slate-500">
          The link you opened is not valid, or the quote may have been removed.
          Please double-check the URL or contact the person who sent it.
        </p>
        <Link
          to="/login"
          className="mt-3 inline-flex items-center rounded-full px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          Are you a team member? Sign in →
        </Link>
      </CardContent>
    </Card>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="rounded-[28px] border border-rose-200 bg-rose-50/40">
      <CardContent className="px-6 py-10 text-center">
        <p className="text-sm text-rose-700">{message}</p>
        <p className="mt-2 text-xs text-rose-600/80">Please try again in a few moments.</p>
      </CardContent>
    </Card>
  )
}

function QuoteView({ quote }: { quote: PublicQuote }) {
  const metal = JEWELRY_METAL_OPTIONS[quote.metal as keyof typeof JEWELRY_METAL_OPTIONS]?.label ?? quote.metal
  const cad = CAD_DESIGN_OPTIONS[quote.cadDesign as keyof typeof CAD_DESIGN_OPTIONS]?.label ?? quote.cadDesign
  const labor = RING_LABOR_OPTIONS[quote.ringLabor as keyof typeof RING_LABOR_OPTIONS]?.label ?? quote.ringLabor
  const diamondTypeLabel = DIAMOND_TYPE_OPTIONS[quote.diamondType as keyof typeof DIAMOND_TYPE_OPTIONS]?.label ?? quote.diamondType
  const diamondSizeLabel = DIAMOND_SIZE_OPTIONS[quote.diamondSize as keyof typeof DIAMOND_SIZE_OPTIONS]?.label ?? quote.diamondSize

  return (
    <div className="space-y-5">
      {/* Hero */}
      <Card className="rounded-[28px] border-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary, #0f172a)' }}>
        <CardContent className="relative p-7 sm:p-9">
          <div className="absolute inset-0 rounded-[28px] bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.18),transparent_30%)]" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Your quote</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{quote.title}</h1>
            {quote.clientName && (
              <p className="mt-1 text-sm text-slate-300">Prepared for {quote.clientName}</p>
            )}
            <div className="mt-6 rounded-2xl bg-white/10 p-5 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-white/60">Total</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
                ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              {quote.createdAt && (
                <p className="mt-2 text-xs text-white/60">Issued {new Date(quote.createdAt).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reference photo */}
      {quote.photo && (
        <Card className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
          <img src={quote.photo} alt="Reference" className="max-h-[480px] w-full object-cover" />
        </Card>
      )}

      {/* Spec grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SpecCard icon={Gem}      label="Metal"          value={metal} />
        <SpecCard icon={Wrench}   label="Jeweler's time" value={labor} />
        <SpecCard icon={Sparkles} label="CAD design"     value={cad} />
        <SpecCard icon={Diamond}  label="Diamonds"       value={`${quote.diamondAmount ?? 0} × ${diamondTypeLabel} ${diamondSizeLabel}`} />
        <SpecCard icon={Ruler}    label="Finger size"    value={`Size ${quote.fingerSize ?? '—'}`} />
        <SpecCard icon={Ruler}    label="Ring width"     value={`${quote.ringWidth ?? 0} mm`} />
      </div>

      {/* Extras */}
      {quote.engraving && (
        <Card className="rounded-[20px] border border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-amber-900">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
            Includes <strong>Hand Engraving (milgrain)</strong> — ${quote.engravingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SpecCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <Card className="rounded-[20px] border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default PublicQuotePage
