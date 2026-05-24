import type { QuoteStatus } from '@/types'
import { canSeePayments } from './paymentsAccess'

/**
 * Defence-in-depth wrapper for rendering a quote status. The backend
 * already maps {@code FULLY_PAID → APPROVED} for non-admin viewers
 * (SavedQuoteController.currentUserIsAdmin), but if a stale request /
 * cached payload / direct API call ever leaks the raw status to a user
 * who shouldn't see the payments feature, this helper normalises it
 * before the UI surfaces it.
 *
 * Anywhere the app reads `quote.status` to render a label / badge /
 * filter count, route it through this function with the current user.
 */
export function displayStatusFor(
  status: QuoteStatus,
  user: { email?: string } | null | undefined,
): QuoteStatus {
  if (status === 'fully_paid' && !canSeePayments(user)) return 'approved'
  return status
}
