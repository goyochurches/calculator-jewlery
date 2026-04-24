import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { companyService } from '@/services/companyService'

interface BrandCtx {
  companyName: string
  logo: string | null
  save: (name: string, logo: string | null) => Promise<void>
}

const BrandContext = createContext<BrandCtx>({
  companyName: 'Simone & Son',
  logo: null,
  save: async () => {},
})

export function BrandProvider({ children }: { children: ReactNode }) {
  const [companyName, setCompanyName] = useState('Simone & Son')
  const [logo, setLogo] = useState<string | null>(null)

  useEffect(() => {
    companyService.get()
      .then((s) => {
        setCompanyName(s.companyName ?? 'Simone & Son')
        setLogo(s.logoBase64 ?? null)
      })
      .catch(() => {}) // keep defaults on error
  }, [])

  const save = async (name: string, newLogo: string | null) => {
    const updated = await companyService.save({ companyName: name, logoBase64: newLogo })
    setCompanyName(updated.companyName)
    setLogo(updated.logoBase64 ?? null)
  }

  return (
    <BrandContext.Provider value={{ companyName, logo, save }}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() {
  return useContext(BrandContext)
}
