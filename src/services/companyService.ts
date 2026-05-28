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
}

export const companyService = {
  async get(): Promise<CompanySettings> {
    return api.get<CompanySettings>('/api/settings')
  },

  async save(settings: CompanySettings): Promise<CompanySettings> {
    return api.put<CompanySettings>('/api/settings', settings)
  },
}
