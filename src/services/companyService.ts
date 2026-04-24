import { api } from '@/api/apiClient'

export interface CompanySettings {
  id?: number
  companyName: string
  logoBase64: string | null
}

export const companyService = {
  async get(): Promise<CompanySettings> {
    return api.get<CompanySettings>('/api/settings')
  },

  async save(settings: CompanySettings): Promise<CompanySettings> {
    return api.put<CompanySettings>('/api/settings', settings)
  },
}
