export interface MetalPrice {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
}

export interface HistorialEntry {
  id: string
  date: string
  metal: 'gold' | 'silver'
  price: number
  change: number
  changePercent: number
  signal: 'buy' | 'sell' | 'hold'
}

export interface ChartDataPoint {
  label: string
  gold: number
  silver: number
}

export interface Usuario {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'jeweler' | 'sales' | 'viewer'
  status: 'active' | 'inactive'
  avatar: string
  /** Free-form biography shown internally and on the public quote link. */
  bio?: string | null
  /** Base64 / URL of the user's profile photo (separate from the
   *  emoji-style `avatar` initial). */
  photo?: string | null
  /** Full international format without "whatsapp:" prefix (e.g. "+34612345678").
   *  Used by backend to send WhatsApp on quote approval. Internal only. */
  phone?: string | null
}

export interface AppConfig {
  apiUrl: string
  refreshInterval: number
  currency: string
}

export type QuoteComplexity = 'low' | 'medium' | 'high'

export type JewelryMetalOption =
  | 'gold-14k-white'
  | 'gold-14k-yellow'
  | 'gold-14k-rose'
  | 'gold-18k-white'
  | 'gold-18k-yellow'
  | 'gold-18k-rose'
  | 'platinum'
  // legacy values kept so historical quotes still load
  | 'gold-14k'
  | 'gold-18k'
  | 'silver'

export type QuoteStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export type StoneRole = 'MAIN' | 'SIDE' | 'MELEE'

export interface QuoteStone {
  id?: number | null
  role: StoneRole
  stoneType: 'natural' | 'lab-grown'
  sizeKey: string
  carats: number
  setterType: string
  labReport?: string | null
  sortOrder?: number | null
  shape?: string | null
  color?: string | null
  manualPrice?: number | null
  comments?: string | null
}

export interface QuoteCustomerStone {
  id?: number | null
  gemstoneId?: number | null
  gemstoneName?: string | null
  setterType: string
  sizeText?: string | null
  quantity: number
  photo?: string | null
  sortOrder?: number | null
  comments?: string | null
}

/** Internal-only photo attachment on a quote — conversation screenshots,
 *  Pinterest references, etc. Never shown on the public link. */
export interface QuoteAttachment {
  id?: number | null
  photo: string
  caption?: string | null
  sortOrder?: number | null
  /** ISO timestamp set by the backend when the attachment is persisted. */
  createdAt?: string | null
}

export interface SavedQuote {
  id: string
  title: string
  clientName: string
  createdBy: string
  /** Extended creator info — surfaced in the detail panel and on the public
   *  link so customers know who is quoting them. */
  createdByEmail?: string | null
  createdByAvatar?: string | null
  createdByBio?: string | null
  createdByPhoto?: string | null
  createdAt: string
  status: QuoteStatus
  metal: JewelryMetalOption
  ringLabor: string
  cadDesign: string
  diamondAmount: number
  diamondCarats?: number | null
  diamondType: 'natural' | 'lab-grown' | 'grunberger'
  diamondSize: string
  stones?: QuoteStone[]
  customerStones?: QuoteCustomerStone[]
  attachments?: QuoteAttachment[]
  weightGrams: number
  ringWidth: number
  fingerSize: number
  laborHours: number
  hourlyRate: number
  extraCosts: number
  total: number
  /** Retail markup applied on top of `total` (cost) when showing the customer
   *  price. Per-quote so each job can override the default 2.5x. */
  markupMultiplier?: number | null
  /** Optional one-off customer discount as a percentage applied on top of the
   *  markup. 0 (or null) = no discount. Quotes above 15% are saved as
   *  PENDING (manager approval); ≤ 15% are auto-approved. */
  discountPercent?: number | null
  /** Free-form internal notes for the jeweler — surfaced only on the
   *  authenticated detail view, NEVER on the public share link. */
  internalNotes?: string | null
  photo?: string | null
  engraving?: boolean | null
  setterType?: string | null
  jewelryType?: string | null
  client?: Client | null
  clientId?: number | null
  publicToken?: string | null
  publicTokenExpiresAt?: string | null
  lastOpenedAt?: string | null
  openCount?: number | null
  /** Set when this quote was created by duplicating another one with the
   *  same client. Points to the ROOT of the chain (revisions stay flat —
   *  there is only one level of nesting in the UI). Null for standalone
   *  quotes. */
  parentQuoteId?: number | null
  /** Latest WhatsApp delivery status from the most recent approval token.
   *  Only set on PENDING quotes — drives the green/amber/red badge in
   *  /quotes-list so the admin knows the approval link reached them. */
  pendingWhatsappStatus?: string | null
  /** WhatsApp delivery status of the notification sent to the CREATOR
   *  when the quote was approved. Only set on APPROVED quotes. */
  approvalWhatsappStatus?: string | null
}

export interface GemstonePrice {
  id: string
  name: string
  category: 'diamond' | 'precious' | 'semi-precious' | 'organic'
  quality: 'standard' | 'premium' | 'collector'
  unit: 'per ct' | 'per piece'
  price: number
  color: string
  note: string
}

export interface Client {
  id: number
  name: string
  surname: string | null
  phone: string | null
  email: string | null
  createdAt?: string | null
}
