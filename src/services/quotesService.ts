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
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'
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
  internalNotes?: string | null
  photo?: string | null   // base64 o URL devuelta por el backend
  engraving?: boolean | null
  setterType?: string | null
  jewelryType?: string | null
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
  /** Twilio status from the latest approval token (only for PENDING). */
  pendingWhatsappStatus?: string | null
  pendingWhatsappTo?: string | null
  pendingWhatsappError?: string | null
  /** Twilio status of the approval notification sent to the creator (only for APPROVED). */
  approvalWhatsappStatus?: string | null
  approvalWhatsappError?: string | null
  /** Twilio status of the "customer opened the share link" notification. */
  openedWhatsappStatus?: string | null
  openedWhatsappError?: string | null
  openedWhatsappSentAt?: string | null
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
    internalNotes: q.internalNotes ?? null,
    photo: q.photo ?? null,
    engraving: q.engraving ?? false,
    setterType: q.setterType ?? null,
    jewelryType: q.jewelryType ?? null,
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
    approvalWhatsappStatus: q.approvalWhatsappStatus ?? null,
    approvalWhatsappError: q.approvalWhatsappError ?? null,
    openedWhatsappStatus: q.openedWhatsappStatus ?? null,
    openedWhatsappError: q.openedWhatsappError ?? null,
    openedWhatsappSentAt: q.openedWhatsappSentAt ?? null,
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

  async updateStatus(id: string, status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<SavedQuote> {
    const data = await api.patch<ApiQuote>(`/api/quotes/${id}/status?status=${status}`)
    return mapQuote(data)
  },

  /** Admin-only. Returns the quote with a fresh publicToken + expiration. */
  async refreshPublicToken(id: string): Promise<SavedQuote> {
    const data = await api.post<ApiQuote>(`/api/quotes/${id}/refresh-token`, {})
    return mapQuote(data)
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