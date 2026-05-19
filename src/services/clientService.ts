import { api } from '@/api/apiClient'
import type { Client } from '@/types'

export const clientService = {
  list: (): Promise<Client[]> =>
    api.get('/api/clients'),

  search: (q: string): Promise<Client[]> =>
    api.get(`/api/clients?q=${encodeURIComponent(q)}`),

  getById: (id: number): Promise<Client> =>
    api.get(`/api/clients/${id}`),

  create: (input: Omit<Client, 'id' | 'createdAt'>): Promise<Client> =>
    api.post('/api/clients', input),

  update: (id: number, input: Omit<Client, 'id' | 'createdAt'>): Promise<Client> =>
    api.put(`/api/clients/${id}`, input),

  delete: (id: number): Promise<void> =>
    api.delete(`/api/clients/${id}`),

  async countToday(): Promise<number> {
    const data = await api.get<{ count: number }>('/api/clients/stats/today')
    return data.count
  },

  async countYesterday(): Promise<number> {
    const data = await api.get<{ count: number }>('/api/clients/stats/yesterday')
    return data.count
  },

  async countPerDay(days = 7): Promise<Record<string, number>> {
    return api.get<Record<string, number>>(`/api/clients/stats/per-day?days=${days}`)
  },

  async countPerMonth(year?: number): Promise<Record<string, number>> {
    const qs = year ? `?year=${year}` : ''
    return api.get<Record<string, number>>(`/api/clients/stats/per-month${qs}`)
  },
}
