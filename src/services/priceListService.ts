import { api } from '@/api/apiClient'

export interface PriceListItem {
  id?: number
  mmRange: string
  price: number | null
  notes: string | null
  sortOrder?: number
  source?: string | null
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export const priceListService = {
  async getAll(): Promise<PriceListItem[]> {
    return api.get<PriceListItem[]>('/api/price-list')
  },

  async importFile(file: File): Promise<PriceListItem[]> {
    const token = localStorage.getItem('auth-token')
    const form = new FormData()
    form.append('file', file)

    const res = await fetch(`${BASE_URL}/api/price-list/import`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `HTTP ${res.status}`)
    }
    return res.json()
  },
}
