import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { companyService, type CompanySettings } from '@/services/companyService'
import { useAuth } from '@/context/AuthContext'

const DEFAULTS: CompanySettings = {
  companyName: 'Simone & Son',
  logoBase64: null,
  googleReviewUrl: null,
  googlePlaceId: null,
  voiceFrom: null,
  voiceTwimlAppSid: null,
  voiceApiKeySid: null,
  voiceApiKeySecret: null,
  firebaseCredentialsJson: null,
}

interface BrandCtx {
  /** The full settings object (single source of truth). */
  settings: CompanySettings
  // Convenience accessors kept for existing consumers (Sidebar, etc.).
  companyName: string
  logo: string | null
  googleReviewUrl: string | null
  googlePlaceId: string | null
  /** Merge a partial patch into settings and persist the COMPLETE object
   *  (the backend PUT replaces the row, so we always send everything). */
  save: (patch: Partial<CompanySettings>) => Promise<void>
}

const BrandContext = createContext<BrandCtx>({
  settings: DEFAULTS,
  companyName: DEFAULTS.companyName,
  logo: null,
  googleReviewUrl: null,
  googlePlaceId: null,
  save: async () => {},
})

export function BrandProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULTS)
  const { token } = useAuth()

  useEffect(() => {
    if (!token) return
    companyService
      .get()
      .then((s) => setSettings({ ...DEFAULTS, ...s }))
      .catch(() => {}) // keep defaults on error
  }, [token])

  const save = async (patch: Partial<CompanySettings>) => {
    const next = { ...settings, ...patch }
    const updated = await companyService.save(next)
    setSettings({ ...DEFAULTS, ...updated })
  }

  return (
    <BrandContext.Provider
      value={{
        settings,
        companyName: settings.companyName ?? DEFAULTS.companyName,
        logo: settings.logoBase64 ?? null,
        googleReviewUrl: settings.googleReviewUrl ?? null,
        googlePlaceId: settings.googlePlaceId ?? null,
        save,
      }}
    >
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() {
  return useContext(BrandContext)
}
