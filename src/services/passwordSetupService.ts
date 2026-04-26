import { api } from '@/api/apiClient'

export interface SetupTokenInfo {
  email: string
  name: string
}

export const passwordSetupService = {
  validate: (token: string): Promise<SetupTokenInfo> =>
    api.get<SetupTokenInfo>(`/api/auth/setup-password/${encodeURIComponent(token)}`),

  setPassword: (token: string, password: string): Promise<void> =>
    api.post<void>(`/api/auth/setup-password/${encodeURIComponent(token)}`, { password }),
}
