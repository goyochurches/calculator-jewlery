import { api } from '@/api/apiClient'
import type { SavedQuote } from '../types'

interface ApiQuote {
  id: number
  title: string
  clientName: string
  createdBy: { id: number; name: string; email: string; avatar: string }
  createdAt: string
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'
  metal: string
  ringLabor: string
  cadDesign: string
  diamondAmount: number
  diamondType: string
  diamondSize: string
  weightGrams: number
  ringWidth: number
  fingerSize: number
  laborHours: number
  hourlyRate: number
  extraCosts: number
  total: number
  photo?: string | null   // base64 o URL devuelta por el backend
  engraving?: string | null
}

function mapQuote(q: ApiQuote): SavedQuote {
  return {
    id: String(q.id),
    title: q.title,
    clientName: q.clientName ?? '',
    createdBy: q.createdBy?.name ?? 'Unknown',
    createdAt: q.createdAt,
    status: q.status.toLowerCase() as SavedQuote['status'],
    metal: q.metal as SavedQuote['metal'],
    ringLabor: q.ringLabor as SavedQuote['ringLabor'],
    cadDesign: q.cadDesign as SavedQuote['cadDesign'],
    diamondAmount: q.diamondAmount,
    diamondType: q.diamondType as SavedQuote['diamondType'],
    diamondSize: q.diamondSize as SavedQuote['diamondSize'],
    weightGrams: q.weightGrams,
    ringWidth: q.ringWidth,
    fingerSize: q.fingerSize,
    laborHours: q.laborHours,
    hourlyRate: q.hourlyRate,
    extraCosts: q.extraCosts,
    total: q.total,
    photo: q.photo ?? null,
    engraving: q.engraving ?? null,
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

  async create(
    payload: Omit<ApiQuote, 'id' | 'createdBy' | 'createdAt'>,
    userId: number,
  ): Promise<SavedQuote> {
      console.log(payload)
    const data = await api.post<ApiQuote>(`/api/quotes?userId=${userId}`, payload)
    return mapQuote(data)
  },

  async updateStatus(id: string, status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<SavedQuote> {
    const data = await api.patch<ApiQuote>(`/api/quotes/${id}/status?status=${status}`)
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