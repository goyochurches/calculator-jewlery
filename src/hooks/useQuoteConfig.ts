import {
  configService,
  type DiamondSizeConfig,
  type FancyMeleePrice,
  type FingerSizeConfig,
  type PricingTier,
  type RnRingModelConfig,
  type RoundMeleePrice,
  type SetterConfig,
  type StoneType,
} from '@/services/configService'
import { companyService } from '@/services/companyService'
import { metalsService } from '@/services/metalService'
import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { categoryForMetalKey, computePricePerGram } from '@/lib/metalPricing'
import type { JewelryMetalOption } from '@/types'
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
// Guards null/undefined the same way normalizeStoneType above does — legacy
// stones saved before the multi-stone refactor can be missing sizeKey
// entirely, and this must resolve to "no match" rather than throw.
export function normalizeSizeKey(k: string | undefined | null): string {
  const trimmed = (k ?? '').trim()
  const n = Number(trimmed)
  return Number.isFinite(n) && trimmed !== '' ? String(n) : trimmed
}

export type RoundGrowthMethod = 'HPHT' | 'CVD'
export type RoundClarityTier = 'VVS' | 'VS'

/** A stone's Round-melee Size dropdown value packs the price-sheet size key
 *  together with the grower/clarity choice that picks which of the sheet's
 *  4 prices applies - e.g. "1.3::HPHT::VVS". Kept out of the stone schema
 *  entirely (no new saved-quote/stock-item columns) by round-tripping
 *  through the existing sizeKey string field, same "don't add columns"
 *  approach the RN ring mode used. */
export function packRoundSizeKey(sizeKey: string, growth: RoundGrowthMethod, clarity: RoundClarityTier): string {
  return `${sizeKey}::${growth}::${clarity}`
}

export function unpackRoundSizeKey(packed: string): { sizeKey: string; growth: RoundGrowthMethod | ''; clarity: RoundClarityTier | '' } {
  const parts = packed.split('::')
  if (parts.length === 3 && (parts[1] === 'HPHT' || parts[1] === 'CVD') && (parts[2] === 'VVS' || parts[2] === 'VS')) {
    return { sizeKey: parts[0], growth: parts[1], clarity: parts[2] }
  }
  return { sizeKey: packed, growth: '', clarity: '' }
}

/** Picks the one of a round-melee row's 4 prices matching a growth/clarity pair. */
export function roundMeleePriceValue(row: RoundMeleePrice, growth: RoundGrowthMethod, clarity: RoundClarityTier): number {
  if (growth === 'HPHT') return clarity === 'VVS' ? row.hphtVvsPrice : row.hphtVsPrice
  return clarity === 'VVS' ? row.cvdVvsPrice : row.cvdVsPrice
}

export interface QuoteConfig {
  diamondSizes: DiamondSizeConfig[]
  fancyMeleePrices: FancyMeleePrice[]
  roundMeleePrices: RoundMeleePrice[]
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
  diamondSizeFor: (stoneType: string | undefined | null, sizeKey: string | undefined | null) => DiamondSizeConfig | undefined
  /** Distinct fancy shape names, in a stable order (most sizes first — the
   *  order the price sheet listed them). Round is deliberately not in this
   *  list; it isn't wired into fancyMeleePrices. */
  fancyShapes: string[]
  /** Look up a fancy-shape price row for a (shape, sizeKey) pair. */
  fancyMeleePriceFor: (shape: string | undefined | null, sizeKey: string | undefined | null) => FancyMeleePrice | undefined
  /** Look up a round-melee price-sheet row by its plain size key (e.g. "1.3",
   *  "3.3-3.6") - not the packed "size::growth::clarity" stone sizeKey. */
  roundMeleePriceFor: (sizeKey: string | undefined | null) => RoundMeleePrice | undefined
  fingerSizeMap: Record<number, FingerSizeConfig>
  cadMap: Record<string, PricingTier>
  ringLaborMap: Record<string, PricingTier>
  setterMap: Record<string, SetterConfig>
  /** Live $/gram per metal key — spot × purity × markup where the metal is
   *  tied to the spot feed (gold, platinum), falling back to the static
   *  JEWELRY_METAL_OPTIONS default (e.g. silver, or if the spot/markup data
   *  hasn't loaded yet) otherwise. See src/lib/metalPricing.ts. */
  metalPriceMap: Record<JewelryMetalOption, number>
  loading: boolean
  /** Re-fetch all config data from the backend. */
  refresh: () => void
}

const STATIC_METAL_PRICES = Object.fromEntries(
  Object.entries(JEWELRY_METAL_OPTIONS).map(([key, cfg]) => [key, cfg.pricePerGram])
) as Record<JewelryMetalOption, number>

const EMPTY: QuoteConfig = {
  diamondSizes: [], fancyMeleePrices: [], roundMeleePrices: [], fingerSizes: [], cadTiers: [], ringLaborTiers: [], setters: [], rnRings: [],
  diamondSizeFor: () => undefined,
  fancyShapes: [],
  fancyMeleePriceFor: () => undefined,
  roundMeleePriceFor: () => undefined,
  fingerSizeMap: {}, cadMap: {}, ringLaborMap: {}, setterMap: {},
  metalPriceMap: STATIC_METAL_PRICES,
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
      // Fancy-shape melee prices live behind a newer endpoint; degrade to an
      // empty list instead of breaking the whole builder if it's not there yet.
      configService.getFancyMeleePrices().catch(() => [] as Awaited<ReturnType<typeof configService.getFancyMeleePrices>>),
      configService.getRoundMeleePrices().catch(() => [] as Awaited<ReturnType<typeof configService.getRoundMeleePrices>>),
      configService.getFingerSizes(),
      configService.getCadTiers(),
      configService.getRingLaborTiers(),
      configService.getSetters(),
      // RN models live behind a newer endpoint; if the backend hasn't shipped
      // it yet, degrade to an empty list instead of breaking the whole builder.
      configService.getRnRings().catch(() => [] as Awaited<ReturnType<typeof configService.getRnRings>>),
      // Live spot feed + markup settings, for metalPriceMap below. Either can
      // fail independently (feed down, settings row missing markup yet) —
      // degrade to the static defaults rather than breaking the builder.
      metalsService.getPrices().catch(() => [] as Awaited<ReturnType<typeof metalsService.getPrices>>),
      companyService.get().catch(() => null),
    ])
      .then(([diamondSizes, fancyMeleePrices, roundMeleePrices, fingerSizes, cadTiers, ringLaborTiers, setters, rnRings, metals, settings]) => {
        const byTypeAndKey: Record<string, DiamondSizeConfig> = Object.fromEntries(
          diamondSizes.map(d => [`${d.stoneType}|${normalizeSizeKey(d.sizeKey)}`, d])
        )
        const byShapeAndSize: Record<string, FancyMeleePrice> = Object.fromEntries(
          fancyMeleePrices.map(p => [`${p.shape.toLowerCase()}|${p.sizeKey.toLowerCase()}`, p])
        )
        const byRoundSize: Record<string, RoundMeleePrice> = Object.fromEntries(
          roundMeleePrices.map(p => [p.sizeKey.toLowerCase(), p])
        )
        // Order shapes by how many sizes they have (most first) — matches the
        // order the price sheet listed them, and surfaces the common shapes
        // first in the picker.
        const shapeCounts = new Map<string, number>()
        fancyMeleePrices.forEach(p => shapeCounts.set(p.shape, (shapeCounts.get(p.shape) ?? 0) + 1))
        const fancyShapes = [...shapeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([shape]) => shape)

        const goldSpot = metals.find(m => m.symbol === 'XAU')?.price
        const platinumSpot = metals.find(m => m.symbol === 'XPT')?.price
        const markupByCategory = {
          '14k': settings?.metalMarkupGold14k,
          '18k': settings?.metalMarkupGold18k,
          platinum: settings?.metalMarkupPlatinum,
        } as const
        const spotByCategory = { '14k': goldSpot, '18k': goldSpot, platinum: platinumSpot } as const

        const metalPriceMap = Object.fromEntries(
          Object.keys(JEWELRY_METAL_OPTIONS).map((key) => {
            const category = categoryForMetalKey(key)
            const spot = category ? spotByCategory[category] : undefined
            const markup = category ? markupByCategory[category] : undefined
            const price = category != null && spot != null && markup != null
              ? computePricePerGram(spot, category, markup)
              : STATIC_METAL_PRICES[key as JewelryMetalOption]
            return [key, price]
          })
        ) as Record<JewelryMetalOption, number>

        setConfig({
          diamondSizes,
          fancyMeleePrices,
          roundMeleePrices,
          fingerSizes,
          cadTiers,
          ringLaborTiers,
          setters,
          rnRings,
          diamondSizeFor: (stoneType, sizeKey) =>
            byTypeAndKey[`${normalizeStoneType(stoneType)}|${normalizeSizeKey(sizeKey)}`],
          fancyShapes,
          fancyMeleePriceFor: (shape, sizeKey) =>
            shape && sizeKey ? byShapeAndSize[`${shape.toLowerCase()}|${sizeKey.toLowerCase()}`] : undefined,
          roundMeleePriceFor: (sizeKey) =>
            sizeKey ? byRoundSize[sizeKey.toLowerCase()] : undefined,
          fingerSizeMap: Object.fromEntries(fingerSizes.map(f => [f.size, f])),
          cadMap: Object.fromEntries(cadTiers.map(t => [t.tierKey, t])),
          ringLaborMap: Object.fromEntries(ringLaborTiers.map(t => [t.tierKey, t])),
          setterMap: Object.fromEntries(setters.map(s => [s.typeKey, s])),
          metalPriceMap,
          loading: false,
          refresh,
        })
      })
      .catch(console.error)
  }, [tick, refresh])

  return config
}
