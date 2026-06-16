// Public (unauthenticated) quote viewer service. Uses raw fetch instead of
// the shared api client because the api client redirects to /login on 401,
// which would break the customer-facing experience.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

/** One stone on the piece as shown on the public share link. Customer-safe
 *  subset of the internal stone — no pricing/markup/setter fields. */
export interface PublicQuoteStone {
  role: 'MAIN' | 'SIDE' | 'MELEE'
  stoneType: string
  /** mm size, e.g. "1.3" or "1.6-1.7". */
  sizeKey: string
  /** Human-readable label from Master Tables, e.g. "Ø 1.50 mm". Null for legacy quotes. */
  sizeLabel?: string | null
  /** Number of physical stones of this size (carats ÷ ctPerStone). 0 = unknown. */
  amount?: number | null
  carats?: number | null
  shape?: string | null
  color?: string | null
  /** GIA cut grade (Excellent … Poor). MAIN stone only. */
  cut?: string | null
  /** GIA clarity grade (FL … I3). MAIN stone only. */
  clarity?: string | null
  /** Certification id (GIA / IGI / ...). */
  labReport?: string | null
}

export interface PublicQuote {
  publicToken: string
  title: string
  clientName: string | null
  createdAt: string | null
  total: number
  internalTotal: number
  engravingFee: number
  /** Optional customer discount (percent). 0 when no discount was applied. */
  discountPercent: number
  /** Money saved thanks to the discount (priceBeforeDiscount - subtotal). */
  discountAmount: number
  /** Total after discount, BEFORE tax. */
  subtotal: number
  /** True when 7.75% sales tax is added on top. */
  applyTaxes: boolean | null
  taxRate: number
  taxAmount: number
  metal: string
  /** Jewelry piece type (ring, rn, pendant, ...). When 'rn' the share link
   *  uses the ready-made RN layout and hides the bench-labor / CAD / ring-width
   *  rows the RN flow never fills in. Optional: older backends omit it. */
  jewelryType?: string | null
  ringLabor: string
  cadDesign: string
  diamondType: string
  diamondSize: string
  diamondAmount: number
  /** Total carat weight across the in-house stones. */
  diamondCarats?: number | null
  /** Per-stone breakdown (MAIN / SIDE / MELEE) so every stone's size is shown,
   *  not just the legacy single `diamondSize`. Empty/absent for older quotes
   *  saved before the multi-stone refactor — fall back to `diamondSize`. */
  stones?: PublicQuoteStone[] | null
  /** True when the client supplies the stone(s). Replaces the diamond type
   *  with a "Supply by customer" label on the public quote. */
  customerSuppliedStone: boolean | null
  /** Stones we supply in-house (S&S), summed. Optional — older backends that
   *  predate this field omit it, so guard with `?? 0`. */
  suppliedStoneCount?: number | null
  /** Stones the customer brought, summed across quantities. */
  customerStoneCount?: number | null
  /** suppliedStoneCount + customerStoneCount — total stones in the piece. */
  totalStoneCount?: number | null
  weightGrams: number
  ringWidth: number
  fingerSize: number
  engraving: boolean | null
  setterType: string | null
  /** Optional customer-facing description / notes written by the jeweler. */
  customerNotes: string | null
  photo: string | null
  companyName: string | null
  companyLogo: string | null
  createdByName: string | null
  createdByBio: string | null
  createdByPhoto: string | null
  /** Shop theme colors from Configuration — applied to the public share link
   *  so it matches the brand palette. Optional: older backends omit them. */
  themePrimary?: string | null
  themeSecondary?: string | null
  themeTertiary?: string | null
  /** JSON-encoded runtime feature flags (see lib/featureFlags). Embedded by
   *  the backend the same way theme colors are, so toggles set in
   *  Configuration also apply to this public page. Optional: when omitted
   *  every feature reads as enabled. */
  featureFlags?: string | null
}

export class PublicQuoteNotFoundError extends Error {
  constructor() { super('Quote not found') }
}

export class PublicQuoteExpiredError extends Error {
  constructor() { super('Share link has expired') }
}

/** Backend returns 403 when the team rejected this quote and the public
 *  view has been intentionally disabled. We don't reveal the reason to the
 *  customer — they just see a generic "contact us" fallback. */
export class PublicQuoteUnavailableError extends Error {
  constructor() { super('Quote is no longer available') }
}

export const publicQuoteService = {
  async getByToken(token: string): Promise<PublicQuote> {
    const res = await fetch(`${BASE_URL}/api/public/quotes/${encodeURIComponent(token)}`)
    if (res.status === 404) throw new PublicQuoteNotFoundError()
    if (res.status === 410) throw new PublicQuoteExpiredError()
    if (res.status === 403) throw new PublicQuoteUnavailableError()
    if (!res.ok) throw new Error(`Failed to load quote (HTTP ${res.status})`)
    return res.json() as Promise<PublicQuote>
  },
}
