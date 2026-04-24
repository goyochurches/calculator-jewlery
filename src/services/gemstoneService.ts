import { api } from '@/api/apiClient'
import type { GemstonePrice } from '../types'

interface ApiGemstone {
  id: number
  name: string
  category: 'DIAMOND' | 'PRECIOUS' | 'SEMI_PRECIOUS' | 'ORGANIC'
  quality: 'STANDARD' | 'PREMIUM' | 'COLLECTOR'
  unit: string
  price: number
  color: string
  note: string
}

function mapCategory(c: ApiGemstone['category']): GemstonePrice['category'] {
  const map: Record<ApiGemstone['category'], GemstonePrice['category']> = {
    DIAMOND: 'diamond',
    PRECIOUS: 'precious',
    SEMI_PRECIOUS: 'semi-precious',
    ORGANIC: 'organic',
  }
  return map[c]
}

function mapGem(g: ApiGemstone): GemstonePrice {
  return {
    id: String(g.id),
    name: g.name,
    category: mapCategory(g.category),
    quality: g.quality.toLowerCase() as GemstonePrice['quality'],
    unit: g.unit as GemstonePrice['unit'],
    price: g.price,
    color: g.color,
    note: g.note,
  }
}

function toApi(g: Omit<GemstonePrice, 'id'>): Omit<ApiGemstone, 'id'> {
  const catMap: Record<GemstonePrice['category'], ApiGemstone['category']> = {
    diamond: 'DIAMOND', precious: 'PRECIOUS', 'semi-precious': 'SEMI_PRECIOUS', organic: 'ORGANIC',
  }
  return {
    name: g.name,
    category: catMap[g.category],
    quality: g.quality.toUpperCase() as ApiGemstone['quality'],
    unit: g.unit,
    price: g.price,
    color: g.color,
    note: g.note,
  }
}

export const gemstoneService = {
  async getAll(): Promise<GemstonePrice[]> {
    const data = await api.get<ApiGemstone[]>('/api/gemstones')
    return data.map(mapGem)
  },

  async create(gem: Omit<GemstonePrice, 'id'>): Promise<GemstonePrice> {
    const data = await api.post<ApiGemstone>('/api/gemstones', toApi(gem))
    return mapGem(data)
  },

  async update(id: string, gem: Omit<GemstonePrice, 'id'>): Promise<GemstonePrice> {
    const data = await api.put<ApiGemstone>(`/api/gemstones/${id}`, toApi(gem))
    return mapGem(data)
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/api/gemstones/${id}`)
  },
}
