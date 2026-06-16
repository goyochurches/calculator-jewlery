import {
  configService,
  type DiamondSizeConfig,
  type FingerSizeConfig,
  type PricingTier,
  type RnRingModelConfig,
  type SetterConfig,
  type StoneType,
} from '@/services/configService'
import { useCallback, useEffect, useState } from 'react'

// Quote stones use lowercase 'natural' / 'lab-grown' (with a legacy
// 'grunberger' on old quotes); the config rows are keyed by the backend
// enum 'NATURAL' / 'LAB'. Normalize so the helper accepts either.
function normalizeStoneType(t: string | undefined | null): StoneType {
  const u = (t ?? '').toUpperCase()
  if (u === 'LAB' || u === 'LAB-GROWN') return 'LAB'
  return 'NATURAL'
}

// Normalize numeric sizeKeys so "1.5" and "1.50" resolve to the same entry.
export function normalizeSizeKey(k: string): string {
  const trimmed = k.trim()
  const n = Number(trimmed)
  return Number.isFinite(n) && trimmed !== '' ? String(n) : trimmed
}

export interface QuoteConfig {
  diamondSizes: DiamondSizeConfig[]
  fingerSizes: FingerSizeConfig[]
  cadTiers: PricingTier[]
  ringLaborTiers: PricingTier[]
  setters: SetterConfig[]
  rnRings: RnRingModelConfig[]
  /** Look up the diamond-size row for a (stoneType, sizeKey) pair. The
   *  backend stores one row per stone_type AND size, so callers must pass
   *  the stone's type to get the right basePrice / ctPerStone — using
   *  sizeKey alone silently picked whichever row loaded last and made the
   *  carats↔amount sync wrong for LAB stones. */
  diamondSizeFor: (stoneType: string | undefined | null, sizeKey: string) => DiamondSizeConfig | undefined
  fingerSizeMap: Record<number, FingerSizeConfig>
  cadMap: Record<string, PricingTier>
  ringLaborMap: Record<string, PricingTier>
  setterMap: Record<string, SetterConfig>
  loading: boolean
  /** Re-fetch all config data from the backend. */
  refresh: () => void
}

const EMPTY: QuoteConfig = {
  diamondSizes: [], fingerSizes: [], cadTiers: [], ringLaborTiers: [], setters: [], rnRings: [],
  diamondSizeFor: () => undefined,
  fingerSizeMap: {}, cadMap: {}, ringLaborMap: {}, setterMap: {},
  loading: true,
  refresh: () => {},
}

export function useQuoteConfig(): QuoteConfig {
  const [tick, setTick] = useState(0)
  const [config, setConfig] = useState<QuoteConfig>(EMPTY)

  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    Promise.all([
      configService.getDiamondSizes(),
      configService.getFingerSizes(),
      configService.getCadTiers(),
      configService.getRingLaborTiers(),
      configService.getSetters(),
      // RN models live behind a newer endpoint; if the backend hasn't shipped
      // it yet, degrade to an empty list instead of breaking the whole builder.
      configService.getRnRings().catch(() => [] as Awaited<ReturnType<typeof configService.getRnRings>>),
    ])
      .then(([diamondSizes, fingerSizes, cadTiers, ringLaborTiers, setters, rnRings]) => {
        const byTypeAndKey: Record<string, DiamondSizeConfig> = Object.fromEntries(
          diamondSizes.map(d => [`${d.stoneType}|${normalizeSizeKey(d.sizeKey)}`, d])
        )
        setConfig({
          diamondSizes,
          fingerSizes,
          cadTiers,
          ringLaborTiers,
          setters,
          rnRings,
          diamondSizeFor: (stoneType, sizeKey) =>
            byTypeAndKey[`${normalizeStoneType(stoneType)}|${normalizeSizeKey(sizeKey)}`],
          fingerSizeMap: Object.fromEntries(fingerSizes.map(f => [f.size, f])),
          cadMap: Object.fromEntries(cadTiers.map(t => [t.tierKey, t])),
          ringLaborMap: Object.fromEntries(ringLaborTiers.map(t => [t.tierKey, t])),
          setterMap: Object.fromEntries(setters.map(s => [s.typeKey, s])),
          loading: false,
          refresh,
        })
      })
      .catch(console.error)
  }, [tick, refresh])

  return config
}
