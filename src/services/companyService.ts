import { api } from '@/api/apiClient'

export interface CompanySettings {
  id?: number
  companyName: string
  logoBase64: string | null
  /** Google "leave a review" link. When set, clients are texted this link via
   *  WhatsApp once they fully pay a quote. Blank = feature disabled. */
  googleReviewUrl: string | null
  /** Google Maps Place ID of the shop — used to pull the rating + reviews
   *  into the Reviews page. Blank = reviews panel disabled. */
  googlePlaceId: string | null
  // ── Twilio Voice (in-app calls) ──
  /** Shop's voice-capable Twilio number (E.164) — outbound caller ID. */
  voiceFrom?: string | null
  /** Twilio TwiML App SID for Voice. */
  voiceTwimlAppSid?: string | null
  /** Twilio Standard API Key SID (signs Voice tokens). */
  voiceApiKeySid?: string | null
  /** Twilio API Key secret. */
  voiceApiKeySecret?: string | null
  /** Optional phone (E.164) to forward inbound calls to. Blank → ring the app. */
  voiceForwardTo?: string | null
  // ── Message routing / TEST mode ──
  /** When true, ALL outbound WhatsApp + SMS go to testRedirectPhone instead of
   *  the real client. False → real recipients. */
  testMode?: boolean | null
  /** Phone (E.164) that receives all messages while testMode is on. */
  testRedirectPhone?: string | null
  /** Comma-separated app_user ids who receive a quote's approval link. */
  approvalUserIds?: string | null
  // ── Firebase Cloud Messaging (push) ──
  /** Full Firebase service-account JSON. Blank = push disabled. */
  firebaseCredentialsJson?: string | null
  // ── Theme colors (shared with the mobile app) ──
  themePrimary?: string | null
  themeSecondary?: string | null
  themeTertiary?: string | null
  // ── Runtime feature flags ──
  /** JSON-encoded map of FeatureKey → boolean. Toggled from Configuration to
   *  show/hide sidebar modules and in-page features for the whole team.
   *  Blank/null = every feature enabled (the default). */
  featureFlags?: string | null
}

export const companyService = {
  async get(): Promise<CompanySettings> {
    return api.get<CompanySettings>('/api/settings')
  },

  async save(settings: CompanySettings): Promise<CompanySettings> {
    return api.put<CompanySettings>('/api/settings', settings)
  },
}
