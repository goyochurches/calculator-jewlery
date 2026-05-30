import { api } from '@/api/apiClient'

/** Consolidated dashboard analytics. Money fields are in dollars. */
export interface DashboardAnalytics {
  collected: number
  processing: number
  outstanding: number
  overdue: number
  overdueCount: number
  refunded: number
  quotesDraft: number
  quotesPending: number
  quotesApproved: number
  quotesFullyPaid: number
  quotesRejected: number
  callsTotal: number
  callsAnswered: number
  callsMissed: number
  callDurationSeconds: number
  paymentsLogged: number
  refundsLogged: number
  unreadMessages: number
  clientsTotal: number
  clientsWhatsapp: number
  clientsSms: number
}

export const dashboardService = {
  getAnalytics(): Promise<DashboardAnalytics> {
    return api.get<DashboardAnalytics>('/api/dashboard/analytics')
  },
}
