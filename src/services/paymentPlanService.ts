import { api } from '@/api/apiClient'

export type InstallmentStatus = 'PENDING' | 'PAID' | 'CANCELED'

export interface PaymentInstallment {
  id: number
  sortOrder: number
  amount: number          // major units (USD)
  currency: string
  dueDate: string | null  // ISO date
  status: InstallmentStatus
  stripeSessionUrl: string | null
  stripeSessionExpiresAt: string | null
  paidAt: string | null
}

export interface PlanRow {
  amount: number
  dueDate: string | null
}

export const paymentPlanService = {
  async get(quoteId: string | number): Promise<PaymentInstallment[]> {
    return api.get<PaymentInstallment[]>(`/api/quotes/${quoteId}/payment-plan`)
  },

  async upsert(quoteId: string | number, rows: PlanRow[]): Promise<PaymentInstallment[]> {
    return api.put<PaymentInstallment[]>(`/api/quotes/${quoteId}/payment-plan`, { rows })
  },

  /** Asks the backend for (or generates) a fresh Stripe Checkout URL. */
  async getCheckoutLink(quoteId: string | number, installmentId: number): Promise<string> {
    const res = await api.post<{ url: string }>(
      `/api/quotes/${quoteId}/payment-plan/${installmentId}/checkout-link`,
      {},
    )
    return res.url
  },
}
