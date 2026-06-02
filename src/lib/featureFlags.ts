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

// ── Runtime feature flags ───────────────────────────────────────────────────
// Unlike the build-time FEATURES above, these are toggled at runtime from the
// Configuration page and persisted in the backend company settings (the
// `featureFlags` JSON column), so a flip applies to every user and device
// without a rebuild. Used to show/hide sidebar modules and in-page features.

export type FeatureKey =
  // Modules — each maps to a sidebar nav entry (NavKey). `configuration` is
  // intentionally absent so an admin can never hide the page that re-enables
  // everything and lock themselves out.
  | 'dashboard'
  | 'metals'
  | 'quotes'
  | 'quotes-list'
  | 'messages'
  | 'clients'
  | 'gemstones'
  | 'users'
  | 'payments'
  | 'reviews'
  | 'master-tables'
  // In-page features — finer-grained controls inside individual pages.
  | 'quote-delete'
  | 'quote-copy-text'
  | 'quote-pdf'
  | 'quote-send-link'

export interface FeatureDef {
  key: FeatureKey
  label: string
  description: string
  group: 'modules' | 'features'
  /** Default state when nothing has been configured yet. Omitted = ON. */
  defaultOn?: boolean
}

/** The catalog rendered as toggles in Configuration. Order = display order. */
export const FEATURE_CATALOG: FeatureDef[] = [
  { key: 'dashboard',     group: 'modules', label: 'Dashboard',     description: 'Home dashboard with analytics.' },
  { key: 'metals',        group: 'modules', label: 'Metals',        description: 'Live metal prices page.' },
  { key: 'quotes',        group: 'modules', label: 'Quote Builder', description: 'Create and edit quotes.' },
  { key: 'quotes-list',   group: 'modules', label: 'Quotes',        description: 'List of all saved quotes.' },
  { key: 'messages',      group: 'modules', label: 'Messages',      description: 'Client inbox (SMS / WhatsApp).' },
  { key: 'clients',       group: 'modules', label: 'Clients',       description: 'Client directory.' },
  { key: 'gemstones',     group: 'modules', label: 'Gemstones',     description: 'Gemstone catalog.' },
  { key: 'users',         group: 'modules', label: 'Users',         description: 'Team members & roles.' },
  { key: 'payments',      group: 'modules', label: 'Payments',      description: 'Payments page + the payment plan block inside quotes.', defaultOn: false },
  { key: 'reviews',       group: 'modules', label: 'Reviews',       description: 'Google reviews page.' },
  { key: 'master-tables', group: 'modules', label: 'Master Tables', description: 'Pricing master tables.' },
  { key: 'quote-delete',    group: 'features', label: 'Delete quotes',   description: 'Show the Delete button in the quote detail (admin only).' },
  { key: 'quote-copy-text', group: 'features', label: 'Copy quote text', description: 'Show the "Copy details to share" button on the public quote page.' },
  { key: 'quote-pdf',       group: 'features', label: 'Quote PDF',       description: 'Show the "PDF" download button in the quote detail.', defaultOn: false },
  { key: 'quote-send-link', group: 'features', label: 'Send quote to client', description: 'Show the "Send to client" button that texts the share link via SMS / WhatsApp.', defaultOn: false },
]

export type FeatureFlags = Record<FeatureKey, boolean>

const FEATURE_KEY_SET = new Set<string>(FEATURE_CATALOG.map((f) => f.key))

/** True when `key` is a known toggleable feature (so callers can treat keys
 *  outside the catalog — e.g. `configuration` — as always enabled). */
export function isFeatureKey(key: string): key is FeatureKey {
  return FEATURE_KEY_SET.has(key)
}

/** Per-feature defaults used when nothing has been configured yet. Most
 *  features default ON; any with `defaultOn: false` (e.g. payments) start hidden. */
export function defaultFeatureFlags(): FeatureFlags {
  return Object.fromEntries(FEATURE_CATALOG.map((f) => [f.key, f.defaultOn !== false])) as FeatureFlags
}

/** Parse the persisted JSON string into a complete flag map, falling back to
 *  the all-on defaults for anything missing or malformed. */
export function parseFeatureFlags(json: string | null | undefined): FeatureFlags {
  const flags = defaultFeatureFlags()
  if (!json) return flags
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    for (const f of FEATURE_CATALOG) {
      if (typeof parsed[f.key] === 'boolean') flags[f.key] = parsed[f.key] as boolean
    }
  } catch {
    // Malformed JSON → keep the all-on defaults rather than hiding everything.
  }
  return flags
}

/** Serialize a flag map for persistence in the backend settings. */
export function serializeFeatureFlags(flags: FeatureFlags): string {
  return JSON.stringify(flags)
}
