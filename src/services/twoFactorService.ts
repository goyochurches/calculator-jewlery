import { api } from '@/api/apiClient'

/**
 * Two-factor (TOTP) enrolment for the signed-in user. Mirrors the backend
 * /api/2fa/* endpoints. The 6-digit code is produced by the user's authenticator
 * app — no SMS, no third-party, no cost.
 */
export const twoFactorService = {
  /** Whether 2FA is currently active for the signed-in user. */
  status: () => api.get<{ enabled: boolean }>('/api/2fa/status'),

  /** Start enrolment: returns the secret + otpauth URI to render as a QR. */
  setup: () => api.post<{ secret: string; otpauthUri: string }>('/api/2fa/setup', {}),

  /** Confirm the first code → enables 2FA and returns one-time recovery codes. */
  enable: (code: string) => api.post<{ recoveryCodes: string[] }>('/api/2fa/enable', { code }),

  /** Turn 2FA off (requires a current code or a recovery code). */
  disable: (code: string) => api.post<{ enabled: boolean }>('/api/2fa/disable', { code }),
}
