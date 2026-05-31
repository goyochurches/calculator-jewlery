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

export type QuoteStatus = 'draft' | 'pending' | 'approved' | 'processing' | 'rejected' | 'fully_paid'

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
  /** Per-stone markup override. When non-null this stone's (cost + setting
   *  labor) gets marked up by this multiplier instead of the quote-level
   *  markup. Only surfaced on MAIN stones in the UI today. */
  markupMultiplier?: number | null
  /** Pre-computed cost + setting labor in dollars at save time. Stored so the
   *  backend can apply `markupMultiplier` without doing repo lookups. */
  contribution?: number | null
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
  /** Manual override for the customer-facing total in dollars. When non-null
   *  the markup/discount/tax pipeline is bypassed — this IS the total. */
  customerPriceOverride?: number | null
  /** Required reason explaining the override. Stored for audit; never shown
   *  to the client on the public share link. */
  customerPriceOverrideReason?: string | null
  /** Free-form internal notes for the jeweler — surfaced only on the
   *  authenticated detail view, NEVER on the public share link. */
  internalNotes?: string | null
  /** Optional customer-facing description / notes — rendered on the public
   *  share link as a short personal message from the jeweler. */
  customerNotes?: string | null
  photo?: string | null
  engraving?: boolean | null
  setterType?: string | null
  jewelryType?: string | null
  /** When true, adds 7.75% sales tax on top of the customer price. The
   *  PDF and share link show the tax as a separate line. Default false. */
  applyTaxes?: boolean | null
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
  /** Pending-approval WhatsApp (admin) — status, recipient, error and when. */
  pendingWhatsappStatus?: string | null
  pendingWhatsappTo?: string | null
  pendingWhatsappError?: string | null
  pendingWhatsappSentAt?: string | null
  /** Approval action taken via the WhatsApp link (token consumption). */
  approvalActionAt?: string | null
  approvalAction?: 'APPROVED' | 'REJECTED' | null
  /** Free-text reason the admin gave when rejecting via the WhatsApp
   *  link. Surfaced in the detail panel so the creator knows why. */
  approvalRejectionReason?: string | null
  /** Approval-notification WhatsApp (creator) — status, error, when. */
  approvalWhatsappStatus?: string | null
  approvalWhatsappError?: string | null
  approvalWhatsappSentAt?: string | null
  /** Customer-opened WhatsApp (creator) — status, error, when. */
  openedWhatsappStatus?: string | null
  openedWhatsappError?: string | null
  openedWhatsappSentAt?: string | null
  /** Payment plan rollup — computed server-side from installments. Absent
   *  (or hasPlan=false) when no plan has been set up. */
  paymentHasPlan?: boolean | null
  paymentTotalDue?: number | null
  paymentTotalPaid?: number | null
  paymentTotalCount?: number | null
  paymentPaidCount?: number | null
  paymentFullyPaid?: boolean | null
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
  /** Preferred channel for sending links: "WHATSAPP" | "SMS". */
  preferredChannel?: string | null
  createdAt?: string | null
}

/** ── Shared inbox (WhatsApp + SMS) ───────────────────────────────────── */

export type InboxChannel = 'WHATSAPP' | 'SMS'
export type InboxDirection = 'INBOUND' | 'OUTBOUND'

export interface InboxThread {
  id: number
  channel: InboxChannel
  peerPhone: string
  peerClientId: number | null
  peerClientName: string | null
  /** WhatsApp profile name for unlinked peers (no Client). Null otherwise. */
  peerName: string | null
  lastMessageAt: string
  lastMessagePreview: string | null
  lastMessageDirection: InboxDirection | null
  /** Team member who sent the last outbound message; null otherwise. */
  lastMessageSenderName: string | null
  unreadCount: number
}

export interface InboxMessage {
  id: number
  threadId: number
  direction: InboxDirection
  channel: InboxChannel
  fromNumber: string
  toNumber: string
  body: string | null
  status: string | null
  error: string | null
  sentByUserName: string | null
  createdAt: string
}

export interface InboxCapabilities {
  canSendWhatsapp: boolean
  canSendSms: boolean
}

export type InboxEventType = 'CALL' | 'PAYMENT' | 'REFUND'

/** A non-message event (call / payment) shown inline in a contact's timeline. */
export interface InboxEvent {
  id: number
  type: InboxEventType
  peerPhone: string
  direction: InboxDirection | null
  /** CALL: completed/no-answer/busy/failed/canceled. PAYMENT: "paid". */
  status: string | null
  durationSeconds: number | null
  amountCents: number | null
  currency: string | null
  createdAt: string
}

