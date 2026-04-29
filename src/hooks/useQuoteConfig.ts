import {
  configService,
  type DiamondSizeConfig,
  type FingerSizeConfig,
  type PricingTier,
  type SetterConfig,
} from '@/services/configService'
import { useEffect, useState } from 'react'

export interface QuoteConfig {
  diamondSizes: DiamondSizeConfig[]
  fingerSizes: FingerSizeConfig[]
  cadTiers: PricingTier[]
  ringLaborTiers: PricingTier[]
  setters: SetterConfig[]
  diamondSizeMap: Record<string, DiamondSizeConfig>
  fingerSizeMap: Record<number, FingerSizeConfig>
  cadMap: Record<string, PricingTier>
  ringLaborMap: Record<string, PricingTier>
  setterMap: Record<string, SetterConfig>
  loading: boolean
}

const EMPTY: QuoteConfig = {
  diamondSizes: [], fingerSizes: [], cadTiers: [], ringLaborTiers: [], setters: [],
  diamondSizeMap: {}, fingerSizeMap: {}, cadMap: {}, ringLaborMap: {}, setterMap: {},
  loading: true,
}

export function useQuoteConfig(): QuoteConfig {
  const [config, setConfig] = useState<QuoteConfig>(EMPTY)

  useEffect(() => {
    Promise.all([
      configService.getDiamondSizes(),
      configService.getFingerSizes(),
      configService.getCadTiers(),
      configService.getRingLaborTiers(),
      configService.getSetters(),
    ])
      .then(([diamondSizes, fingerSizes, cadTiers, ringLaborTiers, setters]) => {
        setConfig({
          diamondSizes,
          fingerSizes,
          cadTiers,
          ringLaborTiers,
          setters,
          diamondSizeMap: Object.fromEntries(diamondSizes.map(d => [d.sizeKey, d])),
          fingerSizeMap: Object.fromEntries(fingerSizes.map(f => [f.size, f])),
          cadMap: Object.fromEntries(cadTiers.map(t => [t.tierKey, t])),
          ringLaborMap: Object.fromEntries(ringLaborTiers.map(t => [t.tierKey, t])),
          setterMap: Object.fromEntries(setters.map(s => [s.typeKey, s])),
          loading: false,
        })
      })
      .catch(console.error)
  }, [])

  return config
}
