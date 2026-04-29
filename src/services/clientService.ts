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
}
