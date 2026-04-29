// Public (unauthenticated) quote viewer service. Uses raw fetch instead of
// the shared api client because the api client redirects to /login on 401,
// which would break the customer-facing experience.

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface PublicQuote {
  publicToken: string
  title: string
  clientName: string | null
  createdAt: string | null
  total: number
  internalTotal: number
  engravingFee: number
  metal: string
  ringLabor: string
  cadDesign: string
  diamondType: string
  diamondSize: string
  diamondAmount: number
  weightGrams: number
  ringWidth: number
  fingerSize: number
  engraving: boolean | null
  setterType: string | null
  photo: string | null
  companyName: string | null
}

export class PublicQuoteNotFoundError extends Error {
  constructor() { super('Quote not found') }
}

export class PublicQuoteExpiredError extends Error {
  constructor() { super('Share link has expired') }
}

export const publicQuoteService = {
  async getByToken(token: string): Promise<PublicQuote> {
    const res = await fetch(`${BASE_URL}/api/public/quotes/${encodeURIComponent(token)}`)
    if (res.status === 404) throw new PublicQuoteNotFoundError()
    if (res.status === 410) throw new PublicQuoteExpiredError()
    if (!res.ok) throw new Error(`Failed to load quote (HTTP ${res.status})`)
    return res.json() as Promise<PublicQuote>
  },
}
