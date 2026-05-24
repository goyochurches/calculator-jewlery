import { FEATURES } from './featureFlags'

/** Only the shop owner can see the payments feature. Hard-coded email
 *  rather than role so even if other ADMIN accounts get added later,
 *  they don't accidentally inherit access to the financial flows. */
export const PAYMENTS_ADMIN_EMAIL = 'admin@simoneandson.com'

/**
 * True when the current user is allowed to see anything payments-related
 * (Payments tab, PaymentPlanBlock inside QuoteDetailPanel, payments
 * section on the client detail page, FULLY_PAID badge, refund buttons).
 * Both conditions must hold:
 *   1. The {@link FEATURES.payments} build flag is on.
 *   2. The authenticated user's email matches {@link PAYMENTS_ADMIN_EMAIL}.
 */
export function canSeePayments(user: { email?: string } | null | undefined): boolean {
  return FEATURES.payments && user?.email === PAYMENTS_ADMIN_EMAIL
}
