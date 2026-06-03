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
  PublicQuoteUnavailableError,
  type PublicQuote,
  type PublicQuoteStone,
} from '@/services/publicQuoteService'
import { copyToClipboard } from '@/lib/share'
import { parseFeatureFlags } from '@/lib/featureFlags'
import { AlertCircle, Check, Clock, Copy, Diamond, Gem, HelpCircle, MessageCircle, Phone, Quote as QuoteIcon, Ruler, Scissors, Sparkles, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

// Store contact line shown at the bottom of every public quote so the
// customer can call or text us directly about their piece.
const STORE_PHONE_DISPLAY = '+1 741 964 4012'
const STORE_PHONE_TEL = '+17419644012'

export function PublicQuotePage() {
  const { token } = useParams<{ token: string }>()
  const [quote, setQuote] = useState<PublicQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [expired, setExpired] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Apply the shop's configured theme colors (from the quote payload) so the
  // public link matches the brand palette. The customer's browser has no
  // stored theme, so without this it would fall back to the app defaults.
  useEffect(() => {
    if (!quote) return
    const root = document.documentElement
    if (quote.themePrimary)   root.style.setProperty('--theme-primary', quote.themePrimary)
    if (quote.themeSecondary) root.style.setProperty('--theme-secondary', quote.themeSecondary)
    if (quote.themeTertiary)  root.style.setProperty('--theme-tertiary', quote.themeTertiary)
  }, [quote])

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return }
    setLoading(true)
    publicQuoteService.getByToken(token)
      .then(setQuote)
      .catch(err => {
        if (err instanceof PublicQuoteNotFoundError) setNotFound(true)
        else if (err instanceof PublicQuoteExpiredError) setExpired(true)
        else if (err instanceof PublicQuoteUnavailableError) setUnavailable(true)
        else setError(err instanceof Error ? err.message : 'Failed to load quote')
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading)     return <PublicShell><LoadingState /></PublicShell>
  if (unavailable) return <PublicShell><UnavailableState /></PublicShell>
  if (expired)     return <PublicShell><ExpiredState /></PublicShell>
  if (notFound)    return <PublicShell><NotFoundState /></PublicShell>
  if (error)       return <PublicShell><ErrorState message={error} /></PublicShell>
  if (!quote)      return <PublicShell><NotFoundState /></PublicShell>

  return (
    <PublicShell companyName={quote.companyName}>
      <QuoteView quote={quote} />
    </PublicShell>
  )
}

// ── Reusable atoms ──────────────────────────────────────────────────────────

/** Tiny ornamental divider: short gold line, diamond glyph, short gold line. */
function GoldOrnament({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <span className="h-px w-12 bg-gradient-to-r from-transparent via-amber-400/70 to-amber-500" />
      <span className="text-amber-500" aria-hidden>◆</span>
      <span className="h-px w-12 bg-gradient-to-l from-transparent via-amber-400/70 to-amber-500" />
    </div>
  )
}

/** Tiny inline gold bullet — used in column headers and footer signatures. */
function GoldDot() {
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 align-middle" aria-hidden />
}

/**
 * Copies the full quote as nicely formatted plain text so the customer (or the
 * team) can paste it into an SMS / WhatsApp message. Shows a brief "Copied!"
 * confirmation after a successful copy.
 */
function CopyQuoteTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const onClick = async () => {
    try {
      await copyToClipboard(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Copy failed', err)
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-sm font-semibold transition ${
        copied
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
      }`}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied to clipboard' : 'Copy details to share'}
    </button>
  )
}

// ── Error / empty states ────────────────────────────────────────────────────

/** Shown when the backend returns 403 — typically because the team has
 *  rejected the quote. We intentionally don't expose the reason; the
 *  customer is steered to contact the studio directly. */
function UnavailableState() {
  return (
    <Card className="rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
          <HelpCircle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Oops — we can't display this quote right now</h1>
        <p className="max-w-md text-sm text-slate-600">
          This quote is no longer available through this link. Please reach out to
          the studio directly and we'll be happy to help.
        </p>
      </CardContent>
    </Card>
  )
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
          Quote share links are valid for 3 months. Please reach out to the
          person who sent it and we'll refresh the link for you.
        </p>
      </CardContent>
    </Card>
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

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 w-full rounded-[28px] bg-slate-200/60" />
      <Skeleton className="h-40 w-full rounded-[24px] bg-slate-200/60" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-2xl bg-slate-200/60" />
        ))}
      </div>
    </div>
  )
}

// ── Shell (header + footer wrapping every state) ────────────────────────────

function PublicShell({
  children,
  companyName,
}: {
  children: React.ReactNode
  companyName?: string | null
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-stone-50 via-white to-amber-50/40 px-4 py-10 sm:py-16">
      {/* Soft decorative blobs in the background */}
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-rose-200/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <header className="mb-10 flex flex-col items-center gap-3 text-center">
          <img
            src="/s%26s_logo_black.svg"
            alt={companyName ?? 'Simone & Son'}
            className="h-20 w-20 object-contain drop-shadow-[0_10px_30px_rgba(245,158,11,0.18)] sm:h-24 sm:w-24"
          />
          <GoldOrnament />
        </header>

        {children}

        <footer className="mt-14 flex flex-col items-center gap-3 text-center">
          <GoldOrnament />
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-slate-400">
            Crafted with care
          </p>
          <p className="max-w-md text-sm leading-relaxed text-slate-500">
            Thank you for considering {companyName ?? 'us'} for this piece.
            Reach out anytime — we'd love to bring this design to life.
          </p>
        </footer>
      </div>
    </div>
  )
}

// ── The actual quote ────────────────────────────────────────────────────────

// Customer-facing translation of the internal difficulty keys. The team uses
// "Super Easy / Easy / Medium / Hard / Super Hard / Crazy" internally; the
// customer just sees numeric levels on the share link.
const PUBLIC_RING_LABOR_LEVELS: Record<string, string> = {
  super_easy: 'Level 1',
  easy:       'Level 2',
  medium:     'Level 3',
  hard:       'Level 4',
  super_hard: 'Level 5',
  crazy:      'Level 6',
}

function QuoteView({ quote }: { quote: PublicQuote }) {
  const metal = JEWELRY_METAL_OPTIONS[quote.metal as keyof typeof JEWELRY_METAL_OPTIONS]?.label ?? quote.metal
  // Always show the numeric level to the customer regardless of the internal label —
  // applies both to the "Jeweler's time" and the "CAD design" rows, since both
  // fields share the same difficulty tier key on the saved quote.
  const labor = PUBLIC_RING_LABOR_LEVELS[quote.ringLabor]
    ?? RING_LABOR_OPTIONS[quote.ringLabor as keyof typeof RING_LABOR_OPTIONS]?.label
    ?? quote.ringLabor
  const cad = PUBLIC_RING_LABOR_LEVELS[quote.cadDesign]
    ?? CAD_DESIGN_OPTIONS[quote.cadDesign as keyof typeof CAD_DESIGN_OPTIONS]?.label
    ?? quote.cadDesign
  const diamondTypeLabel = DIAMOND_TYPE_OPTIONS[quote.diamondType as keyof typeof DIAMOND_TYPE_OPTIONS]?.label ?? quote.diamondType
  const diamondSizeLabel = DIAMOND_SIZE_OPTIONS[quote.diamondSize as keyof typeof DIAMOND_SIZE_OPTIONS]?.label ?? quote.diamondSize

  const issuedDate = quote.createdAt ? new Date(quote.createdAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }) : null

  // This quote is valid for 7 days from when it was issued. Shown to the
  // customer as a gentle urgency cue ("available until …").
  const availableUntil = quote.createdAt ? (() => {
    const d = new Date(quote.createdAt)
    d.setDate(d.getDate() + 7)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  })() : null

  // Stone counts split by source. Falls back gracefully if the backend
  // predates the explicit count fields: in-house count from diamondAmount,
  // customer count from the boolean flag (treated as 1).
  const suppliedCount = quote.suppliedStoneCount ?? quote.diamondAmount ?? 0
  const customerCount = quote.customerStoneCount ?? (quote.customerSuppliedStone ? 1 : 0)
  const totalStones   = quote.totalStoneCount ?? (suppliedCount + customerCount)
  // Only worth splitting the count by source when the piece genuinely mixes
  // S&S-supplied and customer-supplied stones; single-source pieces just show
  // the total.
  const isMixedSource = suppliedCount > 0 && customerCount > 0
  const plural = (n: number) => (n === 1 ? 'stone' : 'stones')
  const totalCt    = Number(quote.diamondCarats ?? 0)
  // Trim trailing zeros so "0.5000" → "0.5", but keep "0.04" / "0.0095" intact.
  const formatCt = (n: number) => n.toFixed(4).replace(/\.?0+$/, '')

  // Full per-stone breakdown: one row per stone the jeweler added in the
  // builder, showing every customer-facing detail (count × size · shape ·
  // color · carats · certification). Newer quotes carry the stones[] array;
  // older quotes predate it and only have the single legacy diamondSize, so we
  // fall back to one "Stone size" row in that case.
  const STONE_ROLE_NOUNS: Record<PublicQuoteStone['role'], string> = {
    MAIN: 'Main stone', SIDE: 'Side stone', MELEE: 'Accent stone',
  }
  const STONE_TYPE_LABELS: Record<string, string> = {
    natural: 'Natural', 'lab-grown': 'Lab-grown', lab: 'Lab-grown',
  }
  const sizeLabelFor = (key: string) =>
    DIAMOND_SIZE_OPTIONS[key as keyof typeof DIAMOND_SIZE_OPTIONS]?.label ?? key
  // Build a "18 × 1.30 mm · Round · color D · 0.171 ct · GIA1234" line from a
  // stone, skipping any field the jeweler left blank.
  const describeStone = (s: PublicQuoteStone): string => {
    const parts: string[] = []
    // "other" is the jeweler's catch-all for a non-standard diameter — show a
    // friendly label instead of the raw "other mm".
    const size = s.sizeKey === 'other' ? 'Custom size' : `${sizeLabelFor(s.sizeKey)} mm`
    parts.push(s.amount && s.amount > 0 ? `${s.amount} × ${size}` : size)
    if (s.shape) parts.push(s.shape)
    if (s.color) parts.push(`color ${s.color}`)
    if (s.cut) parts.push(`${s.cut} cut`)
    if (s.clarity) parts.push(s.clarity)
    const ct = Number(s.carats ?? 0)
    if (ct > 0) parts.push(`${formatCt(ct)} ct`)
    // Only repeat the stone type per-row when it differs from the quote's
    // headline diamond type (mixed natural / lab pieces), to avoid noise.
    if (s.stoneType && s.stoneType !== quote.diamondType) {
      parts.push(STONE_TYPE_LABELS[s.stoneType] ?? s.stoneType)
    }
    if (s.labReport) parts.push(s.labReport)
    return parts.join(' · ')
  }
  const stoneList = quote.stones ?? []
  const stoneSpecs: { icon: React.ElementType; label: string; value: string }[] =
    stoneList.length > 0
      ? (['MAIN', 'SIDE', 'MELEE'] as const).flatMap(role =>
          stoneList
            .filter(s => s.role === role)
            .map(s => ({ icon: Ruler, label: STONE_ROLE_NOUNS[role], value: describeStone(s) })),
        )
      : [{ icon: Ruler, label: 'Stone size', value: diamondSizeLabel ? `${diamondSizeLabel} mm` : '—' }]

  const specs: { icon: React.ElementType; label: string; value: string }[] = [
    { icon: Gem,      label: 'Metal',          value: metal },
    { icon: Wrench,   label: "Jeweler's time", value: labor },
    { icon: Sparkles, label: 'CAD design',     value: cad },
    { icon: Diamond,  label: 'Diamond type',   value: diamondTypeLabel },
    ...stoneSpecs,
    // Stone sourcing. The "supplied by S&S" line only appears on mixed pieces
    // (when it's the sole source it's redundant with the total). The
    // "supplied by customer" line always appears when the customer brought
    // stones — that's a meaningful distinction worth surfacing even when it's
    // the only source.
    ...(isMixedSource ? [{ icon: Diamond, label: 'Stones supplied by S&S', value: `${suppliedCount} ${plural(suppliedCount)}` }] : []),
    ...(customerCount > 0 ? [{ icon: Gem, label: 'Stones supplied by customer', value: `${customerCount} ${plural(customerCount)}` }] : []),
    ...(totalStones > 0 ? [{ icon: Diamond, label: 'Total stones', value: `${totalStones} ${plural(totalStones)}` }] : []),
    ...(totalCt > 0 ? [{ icon: Diamond, label: 'Carat weight', value: `${formatCt(totalCt)} ct tw` }] : []),
    { icon: Ruler,    label: 'Finger size',    value: `Size ${quote.fingerSize ?? '—'}` },
    { icon: Ruler,    label: 'Ring width',     value: `${quote.ringWidth ?? 0} mm` },
  ]

  // Whether the "Copy details to share" button is shown — driven by the
  // runtime feature flag embedded in the public payload (defaults to ON when
  // the backend doesn't send the flag).
  const quoteCopyEnabled = parseFeatureFlags(quote.featureFlags)['quote-copy-text']

  // Plain-text version of the whole quote, formatted for pasting into an
  // SMS / WhatsApp message. Built from the same values rendered on the page so
  // the two never drift apart.
  const fmtMoney = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const shareText = [
    quote.companyName ?? 'Simone & Son',
    quote.title,
    quote.clientName ? `Prepared for ${quote.clientName}` : null,
    '',
    `PRICE: ${fmtMoney(quote.total)} USD`,
    quote.applyTaxes ? `  Subtotal: ${fmtMoney(quote.subtotal)}` : null,
    quote.applyTaxes ? `  Sales tax (7.75%): ${fmtMoney(quote.taxAmount)}` : null,
    quote.discountPercent > 0 ? `  You save ${fmtMoney(quote.discountAmount)} (${quote.discountPercent}% off)` : null,
    quote.applyTaxes ? 'Includes 7.75% sales tax' : 'All-inclusive',
    '',
    'SPECIFICATIONS',
    ...specs.map(s => `• ${s.label}: ${s.value}`),
    quote.engraving ? '• Hand engraving: included' : null,
    quote.customerNotes && quote.customerNotes.trim() !== '' ? `\nNOTES\n${quote.customerNotes.trim()}` : null,
    issuedDate ? `\nIssued: ${issuedDate}` : null,
    availableUntil ? `Price available until: ${availableUntil}` : null,
    `\nQuestions? Call or text ${STORE_PHONE_DISPLAY}`,
  ]
    .filter(line => line !== null)
    .join('\n')

  return (
    <div className="space-y-8">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[32px] shadow-[0_40px_100px_rgba(15,23,42,0.18)]">
        {/* Reference photo as a cinematic backdrop, or the brand color as fallback */}
        {quote.photo ? (
          <>
            <img
              src={quote.photo}
              alt="Reference design"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-900/65 to-slate-900/90" />
          </>
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: 'var(--theme-primary, #0f172a)' }}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.20),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(244,114,182,0.10),transparent_30%)]" />
          </div>
        )}

        <div className="relative px-7 py-12 text-center text-white sm:px-12 sm:py-16">
          <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-amber-300/90">
            Your bespoke quote
          </p>
          <h1 className="mt-5 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl md:text-5xl">
            {quote.title}
          </h1>
          {quote.clientName && (
            <p className="mt-3 text-sm italic tracking-wide text-amber-100/85 sm:text-base">
              Prepared for <span className="font-semibold not-italic">{quote.clientName}</span>
            </p>
          )}

          {/* Price centerpiece */}
          <div className="relative mx-auto mt-10 max-w-md rounded-3xl border border-white/15 bg-white/10 px-6 py-7 backdrop-blur-md">
            {quote.discountPercent > 0 && (
              <p className="mb-2 font-serif text-2xl text-white/40 line-through tabular-nums">
                ${(quote.total + quote.discountAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            )}
            <p className="font-serif text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">
              ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            {quote.discountPercent > 0 && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200 ring-1 ring-emerald-300/40">
                You save ${quote.discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} · {quote.discountPercent}% off
              </p>
            )}
            {quote.applyTaxes && (
              <div className="mt-4 space-y-1 border-t border-white/15 pt-3 text-[12px] text-white/75">
                <div className="flex justify-between"><span>Subtotal</span><span>${quote.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span>Sales tax (7.75%)</span><span>${quote.taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
              </div>
            )}
            <div className="mx-auto mt-3 h-px w-16 bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
            <p className="mt-3 text-[11px] uppercase tracking-[0.28em] text-white/55">
              {quote.applyTaxes ? 'Includes 7.75% sales tax' : 'All-inclusive'} · USD
            </p>
          </div>

          {issuedDate && (
            <p className="mt-7 text-xs uppercase tracking-[0.28em] text-white/55">
              Issued · {issuedDate}
            </p>
          )}

          {availableUntil && (
            <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/15 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
              <Clock className="h-3.5 w-3.5" />
              The price of this quote is available until {availableUntil}
            </p>
          )}
        </div>
      </section>

      {/* ── Copy-to-share: lets the customer/team paste the full quote into SMS ── */}
      {quoteCopyEnabled && (
        <div className="flex justify-center">
          <CopyQuoteTextButton text={shareText} />
        </div>
      )}

      {/* ── Personal note from the jeweler ──────────────────────────────── */}
      {(quote.createdByName || quote.createdByBio || quote.createdByPhoto) && (
        <section className="relative overflow-hidden rounded-[28px] border border-amber-100 bg-gradient-to-br from-white via-amber-50/30 to-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-8">
          <QuoteIcon className="absolute right-6 top-6 h-12 w-12 text-amber-200/60" aria-hidden />

          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left">
            {quote.createdByPhoto ? (
              <img
                src={quote.createdByPhoto}
                alt={quote.createdByName ?? 'Jeweler'}
                className="h-24 w-24 shrink-0 rounded-full object-cover ring-4 ring-white shadow-[0_10px_30px_rgba(15,23,42,0.12)]"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 via-yellow-50 to-orange-100 text-amber-700 ring-4 ring-white shadow-[0_10px_30px_rgba(245,158,11,0.18)]">
                <Sparkles className="h-9 w-9" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-700">
                A personal note from
              </p>
              <p className="mt-1.5 font-serif text-xl font-medium tracking-tight text-slate-900 sm:text-2xl">
                {quote.createdByName ?? 'Our team'}
              </p>

              {quote.createdByBio && (
                <>
                  <div className="mx-auto mt-3 h-px w-16 bg-amber-300/70 sm:mx-0" />
                  <p className="mt-3 whitespace-pre-wrap text-sm italic leading-relaxed text-slate-600 sm:text-[15px]">
                    {quote.createdByBio}
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Specifications: elegant restaurant-menu list ────────────────── */}
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 px-6 py-5 text-center sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-700">
            <GoldDot /> The piece <GoldDot />
          </p>
          <h2 className="mt-1.5 font-serif text-xl font-medium tracking-tight text-slate-900 sm:text-2xl">
            Specifications
          </h2>
        </div>

        <dl className="divide-y divide-slate-100">
          {specs.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-amber-50/30 sm:px-8 sm:py-5">
              <dt className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-[11px]">
                  {label}
                </span>
              </dt>
              <dd className="text-right text-sm font-semibold text-slate-900 sm:text-base">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Engraving feature banner ────────────────────────────────────── */}
      {quote.engraving && (
        <section className="relative overflow-hidden rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50/60 to-amber-50/50 p-5 sm:p-6">
          <div className="absolute right-4 top-4 text-amber-300/60">
            <Sparkles className="h-8 w-8" aria-hidden />
          </div>
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm ring-1 ring-amber-200">
              <Scissors className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-700">
                Artisan touch included
              </p>
              <p className="mt-1 font-serif text-lg font-medium tracking-tight text-slate-900">
                Hand engraving
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Fine hand bench work, already included in your total.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── Additional details: jeweler's comments — kept at the very bottom ── */}
      {quote.customerNotes && quote.customerNotes.trim() !== '' && (
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 px-6 py-5 text-center sm:px-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-700">
              <GoldDot /> Additional details <GoldDot />
            </p>
            <h2 className="mt-1.5 font-serif text-xl font-medium tracking-tight text-slate-900 sm:text-2xl">
              Comments
            </h2>
          </div>
          <div className="px-6 py-6 sm:px-8 sm:py-8">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
              {quote.customerNotes}
            </p>
          </div>
        </section>
      )}

      {/* ── Contact the store: call or send a direct message ─────────────── */}
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 px-6 py-5 text-center sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-700">
            <GoldDot /> Questions about your piece? <GoldDot />
          </p>
          <h2 className="mt-1.5 font-serif text-xl font-medium tracking-tight text-slate-900 sm:text-2xl">
            Call or message us
          </h2>
        </div>
        <div className="flex flex-col items-center gap-4 px-6 py-7 sm:px-8">
          <p className="text-sm text-slate-500">
            Reach the store directly at{' '}
            <a href={`tel:${STORE_PHONE_TEL}`} dir="ltr" className="font-semibold text-slate-900 underline-offset-2 hover:underline">
              <bdi dir="ltr">{STORE_PHONE_DISPLAY}</bdi>
            </a>
          </p>
          <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
            <a
              href={`tel:${STORE_PHONE_TEL}`}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Phone className="h-4 w-4" />
              Call the store
            </a>
            <a
              href={`sms:${STORE_PHONE_TEL}`}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              <MessageCircle className="h-4 w-4" />
              Send a message
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

export default PublicQuotePage
