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

/**
 * Public-facing lookup used by the /payment-success page. Sends the
 * Stripe session_id so the backend can verify with Stripe directly even
 * before the webhook arrives.
 */
export async function fetchPublicInstallment(
  installmentId: number,
  sessionId?: string | null,
): Promise<PaymentInstallment> {
  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
  const qs = sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''
  const res = await fetch(`${BASE_URL}/api/public/installments/${installmentId}${qs}`)
  if (!res.ok) throw new Error(`Failed to load installment (HTTP ${res.status})`)
  return res.json() as Promise<PaymentInstallment>
}

/** Cross-quote payment row used by the admin Payments page. */
export interface PaymentRow {
  id: number
  sortOrder: number
  amount: number
  currency: string
  dueDate: string | null
  status: InstallmentStatus
  paidAt: string | null
  quoteId: number
  quoteTitle: string | null
  quoteStatus: string | null
  clientId: number | null
  clientName: string | null
  createdByName: string | null
  createdAt: string
}

/** Live row from Stripe's Checkout Session list, enriched with the
 *  local quote/client context when we can match the metadata. */
export interface StripePaymentRow {
  sessionId: string
  paymentIntentId: string | null
  amountCents: number | null
  currency: string | null
  sessionStatus: string | null       // open / complete / expired
  paymentStatus: string | null       // paid / unpaid / no_payment_required
  createdEpoch: number
  customerEmail: string | null
  installmentId: number | null
  installmentSortOrder: number | null
  installmentTotalCount: number | null
  quoteId: number | null
  quoteTitle: string | null
  clientId: number | null
  clientName: string | null
  dashboardUrl: string | null
}

export const paymentsAdminService = {
  async list(status?: InstallmentStatus): Promise<PaymentRow[]> {
    const qs = status ? `?status=${status}` : ''
    return api.get<PaymentRow[]>(`/api/payments${qs}`)
  },

  async listStripe(limit = 50): Promise<StripePaymentRow[]> {
    return api.get<StripePaymentRow[]>(`/api/payments/stripe?limit=${limit}`)
  },

  async listByClient(clientId: number | string): Promise<PaymentRow[]> {
    return api.get<PaymentRow[]>(`/api/payments/by-client/${clientId}`)
  },
}

/** Type of quote-scoped event surfaced in the activity timeline. Mirrors
 *  the backend QuoteEvent.Type enum verbatim. */
export type QuoteEventType =
  | 'PLAN_CREATED'
  | 'PLAN_UPDATED'
  | 'PLAN_CANCELED'
  | 'REMINDER_CREATOR'
  | 'REMINDER_CLIENT'
  | 'INSTALLMENT_PAID'
  | 'PLAN_FULLY_PAID'
  | 'OVERDUE'

export type QuoteEventChannel = 'WHATSAPP' | 'IN_APP' | 'SYSTEM'

export interface QuoteEvent {
  id: number
  type: QuoteEventType
  title: string
  body: string | null
  channel: QuoteEventChannel | null
  recipient: string | null
  externalId: string | null
  status: string | null
  error: string | null
  createdAt: string
}

export const quoteEventsService = {
  async forQuote(quoteId: string | number): Promise<QuoteEvent[]> {
    return api.get<QuoteEvent[]>(`/api/quotes/${quoteId}/events`)
  },
}
