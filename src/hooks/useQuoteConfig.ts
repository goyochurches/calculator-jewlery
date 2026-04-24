import {
  configService,
  type DiamondSizeConfig,
  type FingerSizeConfig,
  type PricingTier,
} from '@/services/configService'
import { useEffect, useState } from 'react'

export interface QuoteConfig {
  diamondSizes: DiamondSizeConfig[]
  fingerSizes: FingerSizeConfig[]
  cadTiers: PricingTier[]
  ringLaborTiers: PricingTier[]
  diamondSizeMap: Record<string, DiamondSizeConfig>
  fingerSizeMap: Record<number, FingerSizeConfig>
  cadMap: Record<string, PricingTier>
  ringLaborMap: Record<string, PricingTier>
  loading: boolean
}

const EMPTY: QuoteConfig = {
  diamondSizes: [], fingerSizes: [], cadTiers: [], ringLaborTiers: [],
  diamondSizeMap: {}, fingerSizeMap: {}, cadMap: {}, ringLaborMap: {},
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
    ])
      .then(([diamondSizes, fingerSizes, cadTiers, ringLaborTiers]) => {
        setConfig({
          diamondSizes,
          fingerSizes,
          cadTiers,
          ringLaborTiers,
          diamondSizeMap: Object.fromEntries(diamondSizes.map(d => [d.sizeKey, d])),
          fingerSizeMap: Object.fromEntries(fingerSizes.map(f => [f.size, f])),
          cadMap: Object.fromEntries(cadTiers.map(t => [t.tierKey, t])),
          ringLaborMap: Object.fromEntries(ringLaborTiers.map(t => [t.tierKey, t])),
          loading: false,
        })
      })
      .catch(console.error)
  }, [])

  return config
}
