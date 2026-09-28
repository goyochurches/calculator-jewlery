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

/** Human size text for a (possibly packed) size key: "0.9mm HPHT VVS". */
export function sizeKeyDisplay(sizeKey: string): string {
  const { sizeKey: base, growth, clarity } = unpackRoundSizeKey(sizeKey)
  const size = /^[\d.]+$/.test(base) ? `${base}mm` : base
  return [size, growth, clarity].filter(Boolean).join(' ')
}

/** Picks the one of a round-melee row's 4 prices matching a growth/clarity pair. */
export function roundMeleePriceValue(row: RoundMeleePrice, growth: RoundGrowthMethod, clarity: RoundClarityTier): number {
  if (growth === 'HPHT') return clarity === 'VVS' ? row.hphtVvsPrice : row.hphtVsPrice
  return clarity === 'VVS' ? row.cvdVvsPrice : row.cvdVsPrice
}

/** One individually selectable Round-melee size. The price sheet stores some
 *  rows as a span of mm sizes that share a price ("3.3-3.6 - 14-17-PT"), and
 *  the Size dropdown used to offer that row verbatim - so there was no way to
 *  quote a plain 3.3mm stone. Spans are expanded into one option per mm here,
 *  in the app layer only: each option still points back at its sheet row for
 *  the 4 prices, so neither the sheet nor already-saved sizeKeys change. */
export interface RoundMeleeSizeOption {
  /** The size key stored on the stone, e.g. "3.4". */
  sizeKey: string
  /** Pointer label for this one size ("15-PT") when the row's label spans as
   *  many pointer weights as it does mm sizes, else the row's label as-is. */
  pointerLabel: string | null
  /** Carat weight of a single stone of this size. */
  ctPerStone: number
  /** The price-sheet row this size is priced from. */
  row: RoundMeleePrice
}

const MM_SPAN = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/
const PT_SPAN = /^(\d+)\s*-\s*(\d+)\s*-?\s*PT$/i

function wholeRowOption(row: RoundMeleePrice): RoundMeleeSizeOption {
  return { sizeKey: row.sizeKey, pointerLabel: row.pointerLabel ?? null, ctPerStone: row.ctPerStone, row }
}

/** Expands one price-sheet row into its individual mm sizes. A row whose
 *  sizeKey is already a single size - the common case - comes back as a
 *  one-entry list, untouched. */
export function expandRoundMeleeRow(row: RoundMeleePrice): RoundMeleeSizeOption[] {
  const span = MM_SPAN.exec(row.sizeKey.trim())
  if (!span) return [wholeRowOption(row)]

  // Step in whole tenths of a mm: 3.3 + 0.1 in binary floating point is
  // 3.4000000000000004, which would produce unusable size keys. Anything
  // that isn't a sane, short, ascending span is left as the sheet wrote it
  // rather than guessed at.
  const from = Math.round(Number(span[1]) * 10)
  const to = Math.round(Number(span[2]) * 10)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 40) return [wholeRowOption(row)]

  const sizes: string[] = []
  for (let tenths = from; tenths <= to; tenths++) sizes.push(String(tenths / 10))

  // "3.3-3.6 - 14-17-PT" carries a per-size carat weight: four mm sizes, four
  // pointer weights, in order. Only trust that when the two spans line up - a
  // row like "3.9-4.1 - 25-PT" quotes one weight for the whole span, so there
  // every size keeps the row's own ctPerStone.
  const pt = PT_SPAN.exec((row.pointerLabel ?? '').trim())
  const firstPt = pt && Number(pt[2]) - Number(pt[1]) + 1 === sizes.length ? Number(pt[1]) : null

  return sizes.map((sizeKey, i) => firstPt == null
    ? { ...wholeRowOption(row), sizeKey }
    : { sizeKey, pointerLabel: `${firstPt + i}-PT`, ctPerStone: (firstPt + i) / 100, row })
}

/** Turns the Round-melee price sheet into the flat list of individual sizes
 *  the Size dropdown offers, plus the index those sizes are looked up by. */
export function buildRoundMeleeIndex(rows: RoundMeleePrice[]): {
  sizes: RoundMeleeSizeOption[]
  byKey: Record<string, RoundMeleeSizeOption>
} {
  const sizes = rows.flatMap(expandRoundMeleeRow)
  const byKey: Record<string, RoundMeleeSizeOption> = {}
  const put = (o: RoundMeleeSizeOption) => { byKey[normalizeSizeKey(o.sizeKey).toLowerCase()] = o }
  // Sizes conjured out of a span go in first, so a row that really is that
  // single size always wins the key if the sheet happens to have both.
  sizes.filter(o => o.sizeKey !== o.row.sizeKey).forEach(put)
  sizes.filter(o => o.sizeKey === o.row.sizeKey).forEach(put)
  // Finally the span keys themselves ("3.3-3.6"), which no expansion claims -
  // stones saved against one before the split still price.
  rows.forEach(row => {
    const key = normalizeSizeKey(row.sizeKey).toLowerCase()
    if (!(key in byKey)) byKey[key] = wholeRowOption(row)
  })
  return { sizes, byKey }
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
   *  "3.4") - not the packed "size::growth::clarity" stone sizeKey. Legacy
   *  span keys ("3.3-3.6") still resolve, so stones saved before the sizes
   *  were split keep pricing. */
  roundMeleePriceFor: (sizeKey: string | undefined | null) => RoundMeleePrice | undefined
  /** Every Round-melee size a stone can be given, one entry per mm, in sheet
   *  order - see expandRoundMeleeRow. This is what the Size dropdown lists. */
  roundMeleeSizes: RoundMeleeSizeOption[]
  /** Like roundMeleePriceFor, but also carries the carat weight of that one
   *  size - which for an expanded span differs from the row's ctPerStone. */
  roundMeleeSizeFor: (sizeKey: string | undefined | null) => RoundMeleeSizeOption | undefined
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
  roundMeleeSizes: [],
  roundMeleeSizeFor: () => undefined,
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
        // One entry per individual mm size, so the Size dropdown can offer
        // 3.3 / 3.4 / 3.5 / 3.6 instead of the sheet's "3.3-3.6" span.
        const { sizes: roundMeleeSizes, byKey: byRoundSize } = buildRoundMeleeIndex(roundMeleePrices)
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
            sizeKey ? byRoundSize[normalizeSizeKey(sizeKey).toLowerCase()]?.row : undefined,
          roundMeleeSizes,
          roundMeleeSizeFor: (sizeKey) =>
            sizeKey ? byRoundSize[normalizeSizeKey(sizeKey).toLowerCase()] : undefined,
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
