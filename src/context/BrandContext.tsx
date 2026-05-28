import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { companyService } from '@/services/companyService'
import { useAuth } from '@/context/AuthContext'

interface BrandCtx {
  companyName: string
  logo: string | null
  googleReviewUrl: string | null
  googlePlaceId: string | null
  save: (
    name: string,
    logo: string | null,
    googleReviewUrl: string | null,
    googlePlaceId: string | null,
  ) => Promise<void>
}

const BrandContext = createContext<BrandCtx>({
  companyName: 'Simone & Son',
  logo: null,
  googleReviewUrl: null,
  googlePlaceId: null,
  save: async () => {},
})

export function BrandProvider({ children }: { children: ReactNode }) {
  const [companyName, setCompanyName] = useState('Simone & Son')
  const [logo, setLogo] = useState<string | null>(null)
  const [googleReviewUrl, setGoogleReviewUrl] = useState<string | null>(null)
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null)
  const { token } = useAuth()

  useEffect(() => {
    if (!token) return
    companyService.get()
      .then((s) => {
        setCompanyName(s.companyName ?? 'Simone & Son')
        setLogo(s.logoBase64 ?? null)
        setGoogleReviewUrl(s.googleReviewUrl ?? null)
        setGooglePlaceId(s.googlePlaceId ?? null)
      })
      .catch(() => {}) // keep defaults on error
  }, [token])

  const save = async (
    name: string,
    newLogo: string | null,
    newReviewUrl: string | null,
    newPlaceId: string | null,
  ) => {
    const updated = await companyService.save({
      companyName: name,
      logoBase64: newLogo,
      googleReviewUrl: newReviewUrl,
      googlePlaceId: newPlaceId,
    })
    setCompanyName(updated.companyName)
    setLogo(updated.logoBase64 ?? null)
    setGoogleReviewUrl(updated.googleReviewUrl ?? null)
    setGooglePlaceId(updated.googlePlaceId ?? null)
  }

  return (
    <BrandContext.Provider value={{ companyName, logo, googleReviewUrl, googlePlaceId, save }}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() {
  return useContext(BrandContext)
}
