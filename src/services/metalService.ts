import { api } from '@/api/apiClient'
import type { MetalPrice, HistorialEntry } from '../types'

interface ApiMetal {
  id: number
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
}

interface ApiHistoryEntry {
  id: number
  date: string
  metal: 'GOLD' | 'SILVER'
  price: number
  change: number
  changePercent: number
  signal: 'BUY' | 'SELL' | 'HOLD'
}

export interface MetalWithId extends MetalPrice { id: number }

function mapMetal(m: ApiMetal): MetalWithId {
  return {
    id: m.id,
    symbol: m.symbol,
    name: m.name,
    price: m.price,
    change: m.change,
    changePercent: m.changePercent,
    high: m.high,
    low: m.low,
    open: m.open,
  }
}

export const metalsService = {
  async getPrices(): Promise<MetalPrice[]> {
    const data = await api.get<ApiMetal[]>('/api/metals')
    return data.map(mapMetal)
  },

  async getAllWithIds(): Promise<MetalWithId[]> {
    const data = await api.get<ApiMetal[]>('/api/metals')
    return data.map(mapMetal)
  },

  async update(id: number, metal: ApiMetal): Promise<MetalWithId> {
    const data = await api.put<ApiMetal>(`/api/metals/${id}`, metal)
    return mapMetal(data)
  },

  async create(metal: Omit<ApiMetal, 'id'>): Promise<MetalWithId> {
    const data = await api.post<ApiMetal>('/api/metals', metal)
    return mapMetal(data)
  },

  async delete(id: number): Promise<void> {
    await api.delete<void>(`/api/metals/${id}`)
  },

  async getHistory(): Promise<HistorialEntry[]> {
    const data = await api.get<ApiHistoryEntry[]>('/api/history')
    return data.map((h) => ({
      id: String(h.id),
      date: h.date,
      metal: h.metal.toLowerCase() as 'gold' | 'silver',
      price: h.price,
      change: h.change,
      changePercent: h.changePercent,
      signal: h.signal.toLowerCase() as 'buy' | 'sell' | 'hold',
    }))
  },
}
