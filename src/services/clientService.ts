import { api } from '@/api/apiClient'
import type { Client, ColdClient, UpcomingClientDate } from '@/types'

interface SpringPage<T> {
  content: T[]
  page?: { totalElements: number; totalPages: number; number: number; size: number }
  totalElements?: number
  totalPages?: number
  number?: number
}

export interface ClientPage {
  items: Client[]
  totalPages: number
  totalElements: number
  currentPage: number
}

export interface ClientSummary {
  total: number
  withEmail: number
  withPhone: number
}

export const clientService = {
  list: (): Promise<Client[]> =>
    api.get('/api/clients'),

  search: (q: string): Promise<Client[]> =>
    api.get(`/api/clients?q=${encodeURIComponent(q)}`),

  /** Server-side paginated + searchable list for the Clients page — keeps
   *  the page fast as the client list grows. `list`/`search` above stay
   *  unpaged for ClientPicker's full-list autocomplete dropdown. */
  async getPage(params: { page?: number; size?: number; q?: string }): Promise<ClientPage> {
    const { page = 0, size = 20, q } = params
    let url = `/api/clients/page?page=${page}&size=${size}&sort=name,asc`
    if (q && q.trim()) url += `&q=${encodeURIComponent(q.trim())}`
    const data = await api.get<SpringPage<Client>>(url)
    const meta = data.page
    return {
      items: data.content ?? [],
      totalPages: meta?.totalPages ?? data.totalPages ?? 1,
      totalElements: meta?.totalElements ?? data.totalElements ?? 0,
      currentPage: meta?.number ?? data.number ?? 0,
    }
  },

  summary: (): Promise<ClientSummary> =>
    api.get<Record<string, number>>('/api/clients/stats/summary').then(d => ({
      total: d.total ?? 0,
      withEmail: d.withEmail ?? 0,
      withPhone: d.withPhone ?? 0,
    })),

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

  /** Birthdays/anniversaries in the next `days` days, nearest first —
   *  backs the Dashboard's "Upcoming dates" card. */
  async getUpcomingDates(days = 30): Promise<UpcomingClientDate[]> {
    return api.get<UpcomingClientDate[]>(`/api/clients/upcoming-dates?days=${days}`)
  },

  /** Clients with no new quote in `days` days, most overdue first —
   *  backs the Dashboard's "Cold clients" card. */
  async getColdClients(days = 90): Promise<ColdClient[]> {
    return api.get<ColdClient[]>(`/api/clients/cold?days=${days}`)
  },
}
