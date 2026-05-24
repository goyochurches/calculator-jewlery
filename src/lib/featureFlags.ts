/**
 * Frontend feature flags. Read from Vite env vars at build time; toggle
 * in `.env.local` (or in Vercel / Render env vars for prod) and rebuild.
 *
 * To turn the payments feature back off without touching code:
 *   VITE_FEATURE_PAYMENTS=false  → rebuild → all payments UI is hidden.
 *
 * Backend keeps the @PreAuthorize ADMIN check regardless, so a user that
 * spoofs `localStorage` flags can't reach the endpoints anyway.
 */
function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  return value === 'true' || value === '1'
}

export const FEATURES = {
  /** Payment plans + Stripe checkout. Default ON; flip to false to hide
   *  the Payments tab, the PaymentPlanBlock inside the quote detail, and
   *  every related route. */
  payments: readBool(import.meta.env.VITE_FEATURE_PAYMENTS, true),
} as const
