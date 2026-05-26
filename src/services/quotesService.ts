import { api } from '@/api/apiClient'
import type { Client, QuoteAttachment, QuoteCustomerStone, QuoteStone, SavedQuote } from '../types'

interface ApiStone {
  id?: number | null
  role: 'MAIN' | 'SIDE' | 'MELEE'
  stoneType: string
  sizeKey: string
  carats: number
  setterType: string
  labReport?: string | null
  sortOrder?: number | null
  shape?: string | null
  color?: string | null
  manualPrice?: number | null
  comments?: string | null
  markupMultiplier?: number | null
  contribution?: number | null
}

interface ApiAttachment {
  id?: number | null
  photo: string
  caption?: string | null
  sortOrder?: number | null
  createdAt?: string | null
}

interface ApiCustomerStone {
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

interface ApiQuote {
  id: number
  title: string
  clientName: string
  createdBy: { id: number; name: string; email: string; avatar: string; bio?: string | null; photo?: string | null }
  createdAt: string
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'FULLY_PAID'
  metal: string
  ringLabor: string
  cadDesign: string
  diamondAmount: number
  diamondCarats?: number | null
  diamondType: string
  diamondSize: string
  weightGrams: number
  ringWidth: number
  fingerSize: number
  laborHours: number
  hourlyRate: number
  extraCosts: number
  total: number
  markupMultiplier?: number | null
  discountPercent?: number | null
  customerPriceOverride?: number | null
  customerPriceOverrideReason?: string | null
  internalNotes?: string | null
  customerNotes?: string | null
  photo?: string | null   // base64 o URL devuelta por el backend
  engraving?: boolean | null
  setterType?: string | null
  jewelryType?: string | null
  applyTaxes?: boolean | null
  client?: Client | null
  stones?: ApiStone[]
  customerStones?: ApiCustomerStone[]
  attachments?: ApiAttachment[]
  // Sent up by the frontend so the backend can resolve the FK; on responses
  // the backend echoes the full `client` object instead.
  clientId?: number | null
  publicToken?: string | null
  publicTokenExpiresAt?: string | null
  lastOpenedAt?: string | null
  openCount?: number | null
  /** Response field — root parent id when this quote is a revision. */
  parentQuoteId?: number | null
  /** Request field — send `{ id: N }` on create so JPA resolves the FK
   *  (mirrors the pattern used for `client`). The backend never echoes
   *  this back as an object; it surfaces `parentQuoteId` instead. */
  parentQuote?: { id: number } | null
  /** Pending-approval WhatsApp (admin) — status / recipient / error / when. */
  pendingWhatsappStatus?: string | null
  pendingWhatsappTo?: string | null
  pendingWhatsappError?: string | null
  pendingWhatsappSentAt?: string | null
  /** Admin action via the WhatsApp link (token consumption). */
  approvalActionAt?: string | null
  approvalAction?: 'APPROVED' | 'REJECTED' | null
  approvalRejectionReason?: string | null
  /** Approval-notification WhatsApp (creator) — status / error / when. */
  approvalWhatsappStatus?: string | null
  approvalWhatsappError?: string | null
  approvalWhatsappSentAt?: string | null
  /** Customer-opened WhatsApp (creator). */
  openedWhatsappStatus?: string | null
  openedWhatsappError?: string | null
  openedWhatsappSentAt?: string | null
  /** Payment plan rollup — server-derived from installments. */
  paymentHasPlan?: boolean | null
  paymentTotalDue?: number | null
  paymentTotalPaid?: number | null
  paymentTotalCount?: number | null
  paymentPaidCount?: number | null
  paymentFullyPaid?: boolean | null
}

function mapQuote(q: ApiQuote): SavedQuote {
  return {
    id: String(q.id),
    title: q.title,
    clientName: q.clientName ?? '',
    createdBy: q.createdBy?.name ?? 'Unknown',
    createdByEmail: q.createdBy?.email ?? null,
    createdByAvatar: q.createdBy?.avatar ?? null,
    createdByBio: q.createdBy?.bio ?? null,
    createdByPhoto: q.createdBy?.photo ?? null,
    createdAt: q.createdAt,
    status: q.status.toLowerCase() as SavedQuote['status'],
    metal: q.metal as SavedQuote['metal'],
    ringLabor: q.ringLabor as SavedQuote['ringLabor'],
    cadDesign: q.cadDesign as SavedQuote['cadDesign'],
    diamondAmount: q.diamondAmount,
    diamondCarats: q.diamondCarats ?? 0,
    diamondType: q.diamondType as SavedQuote['diamondType'],
    diamondSize: q.diamondSize as SavedQuote['diamondSize'],
    weightGrams: q.weightGrams,
    ringWidth: q.ringWidth,
    fingerSize: q.fingerSize,
    laborHours: q.laborHours,
    hourlyRate: q.hourlyRate,
    extraCosts: q.extraCosts,
    total: q.total,
    markupMultiplier: q.markupMultiplier ?? null,
    discountPercent: q.discountPercent ?? null,
    customerPriceOverride: q.customerPriceOverride ?? null,
    customerPriceOverrideReason: q.customerPriceOverrideReason ?? null,
    internalNotes: q.internalNotes ?? null,
    customerNotes: q.customerNotes ?? null,
    photo: q.photo ?? null,
    engraving: q.engraving ?? false,
    setterType: q.setterType ?? null,
    jewelryType: q.jewelryType ?? null,
    applyTaxes: q.applyTaxes ?? false,
    client: q.client ?? null,
    clientId: q.client?.id ?? q.clientId ?? null,
    stones: (q.stones ?? []).map(mapStone),
    customerStones: (q.customerStones ?? []).map(mapCustomerStone),
    attachments: (q.attachments ?? []).map(mapAttachment),
    publicToken: q.publicToken ?? null,
    publicTokenExpiresAt: q.publicTokenExpiresAt ?? null,
    lastOpenedAt: q.lastOpenedAt ?? null,
    openCount: q.openCount ?? null,
    parentQuoteId: q.parentQuoteId ?? null,
    pendingWhatsappStatus: q.pendingWhatsappStatus ?? null,
    pendingWhatsappTo: q.pendingWhatsappTo ?? null,
    pendingWhatsappError: q.pendingWhatsappError ?? null,
    pendingWhatsappSentAt: q.pendingWhatsappSentAt ?? null,
    approvalActionAt: q.approvalActionAt ?? null,
    approvalAction: q.approvalAction ?? null,
    approvalRejectionReason: q.approvalRejectionReason ?? null,
    approvalWhatsappStatus: q.approvalWhatsappStatus ?? null,
    approvalWhatsappError: q.approvalWhatsappError ?? null,
    approvalWhatsappSentAt: q.approvalWhatsappSentAt ?? null,
    openedWhatsappStatus: q.openedWhatsappStatus ?? null,
    openedWhatsappError: q.openedWhatsappError ?? null,
    openedWhatsappSentAt: q.openedWhatsappSentAt ?? null,
    paymentHasPlan: q.paymentHasPlan ?? null,
    paymentTotalDue: q.paymentTotalDue ?? null,
    paymentTotalPaid: q.paymentTotalPaid ?? null,
    paymentTotalCount: q.paymentTotalCount ?? null,
    paymentPaidCount: q.paymentPaidCount ?? null,
    paymentFullyPaid: q.paymentFullyPaid ?? null,
  }
}

function mapStone(s: ApiStone): QuoteStone {
  return {
    id: s.id ?? null,
    role: s.role,
    stoneType: s.stoneType as QuoteStone['stoneType'],
    sizeKey: s.sizeKey,
    carats: s.carats,
    setterType: s.setterType,
    labReport: s.labReport ?? null,
    sortOrder: s.sortOrder ?? null,
    shape: s.shape ?? null,
    color: s.color ?? null,
    manualPrice: s.manualPrice ?? null,
    comments: s.comments ?? null,
    markupMultiplier: s.markupMultiplier ?? null,
    contribution: s.contribution ?? null,
  }
}

function mapAttachment(a: ApiAttachment): QuoteAttachment {
  return {
    id: a.id ?? null,
    photo: a.photo,
    caption: a.caption ?? null,
    sortOrder: a.sortOrder ?? null,
    createdAt: a.createdAt ?? null,
  }
}

function mapCustomerStone(s: ApiCustomerStone): QuoteCustomerStone {
  return {
    id: s.id ?? null,
    gemstoneId: s.gemstoneId ?? null,
    gemstoneName: s.gemstoneName ?? null,
    setterType: s.setterType,
    sizeText: s.sizeText ?? null,
    quantity: s.quantity ?? 1,
    photo: s.photo ?? null,
    sortOrder: s.sortOrder ?? null,
    comments: s.comments ?? null,
  }
}

interface SpringPage<T> {
  content: T[]
  totalElements?: number
  totalPages?: number
  number?: number
  size?: number
}

export const quotesService = {
  async getAll(): Promise<SavedQuote[]> {
    const data = await api.get<ApiQuote[] | SpringPage<ApiQuote>>('/api/quotes')
    const items = Array.isArray(data) ? data : data.content ?? []
    return items.map(mapQuote)
  },

  async getByClient(clientId: number): Promise<SavedQuote[]> {
    // Pull a generous page; in practice a single client rarely has hundreds of quotes.
    const data = await api.get<SpringPage<ApiQuote>>(`/api/quotes?clientId=${clientId}&size=200&sort=createdAt,desc`)
    return (data.content ?? []).map(mapQuote)
  },

  async create(
    payload: Omit<ApiQuote, 'id' | 'createdBy' | 'createdAt'>,
    userId: number,
  ): Promise<SavedQuote> {
    const data = await api.post<ApiQuote>(`/api/quotes?userId=${userId}`, payload)
    return mapQuote(data)
  },

  async updateStatus(id: string, status: 'DRAFTclaude
      ' | 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<SavedQuote> {
    const data = await api.patch<ApiQuote>(`/api/quotes/${id}/status?status=${status}`)
    return mapQuote(data)
  },

  /** Admin-only. Returns the quote with a fresh publicToken + expiration. */
  async refreshPublicToken(id: string): Promise<SavedQuote> {
    const data = await api.post<ApiQuote>(`/api/quotes/${id}/refresh-token`, {})
    return mapQuote(data)
  },

  /**
   * Downloads the branded PDF for an authenticated user. Opens in a new
   * tab — the customer-facing share-link PDF is a separate public endpoint
   * (see publicQuoteService). We use raw fetch here because we need a Blob,
   * not JSON, so the shared api client doesn't fit.
   */
  async downloadPdf(id: string): Promise<void> {
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
    const token = localStorage.getItem('auth-token')
    const res = await fetch(`${BASE_URL}/api/quotes/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Failed to download PDF (HTTP ${res.status})`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    // Open in a new tab so the browser's built-in viewer shows it. The
    // viewer's "Download" button still works on the object URL.
    window.open(url, '_blank', 'noopener,noreferrer')
    // Revoke after a delay so the new tab has time to fetch the blob.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  },

  async countToday(): Promise<number> {
    const data = await api.get<{ count: number }>('/api/quotes/stats/today')
    return data.count
  },

  async countYesterday(): Promise<number> {
    const data = await api.get<{ count: number }>('/api/quotes/stats/yesterday')
    return data.count
  },

  async countPerDay(days = 7): Promise<Record<string, number>> {
    return api.get<Record<string, number>>(`/api/quotes/stats/per-day?days=${days}`)
  },

  async statsPerUser(): Promise<UserQuoteStats[]> {
    return api.get<UserQuoteStats[]>('/api/quotes/stats/per-user')
  },

  async revenuePerMonth(year?: number): Promise<Record<string, number>> {
    const qs = year ? `?year=${year}` : ''
    return api.get<Record<string, number>>(`/api/quotes/stats/revenue-per-month${qs}`)
  },

  async revenueYear(year?: number): Promise<{ year: number; total: number }> {
    const qs = year ? `?year=${year}` : ''
    return api.get<{ year: number; total: number }>(`/api/quotes/stats/revenue-year${qs}`)
  },
}

export interface UserQuoteStats {
  userId: number
  userName: string
  avatar: string
  total: number
  pending: number
  approved: number
  rejected: number
  draft: number
}