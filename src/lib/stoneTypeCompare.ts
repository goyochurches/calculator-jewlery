import { DIAMOND_TYPE_OPTIONS } from '@/constants/config'
import type { DiamondSizeConfig } from '@/services/configService'

// Natural vs Lab side-by-side for a single stone. Mirrors the RN ring
// Natural/Lab comparison, but for the manual stone rows: same physical stone
// (same size + carats + setter), priced from the natural and lab diamond_size
// tables so the jeweler can pick the option that suits the customer.
export type CompareStoneType = 'natural' | 'lab-grown'

export interface StoneTypeOption {
  stoneType: CompareStoneType
  label: string
  /** A priced row exists in the diamond_size table for this size + type. */
  hasRow: boolean
  sizeLabel: string
  pricePerCarat: number
  stoneCost: number
  settingLabor: number
  total: number
}

export interface StoneTypeComparison {
  natural: StoneTypeOption
  lab: StoneTypeOption
  /** Both types resolve to a priced row and the cost isn't a manual override,
   *  so the two totals are a meaningful apples-to-apples comparison. */
  comparable: boolean
  /** Which side is cheaper when comparable and the totals differ. */
  cheaper: CompareStoneType | null
}

/**
 * Pure Natural-vs-Lab breakdown for one stone. Setting labor is identical for
 * both types (it depends on the setter + count, not the diamond origin), so the
 * only thing that moves is the stone cost. A manual/custom price short-circuits
 * the per-carat math, in which case the two sides are equal and not comparable.
 */
export function compareStoneTypes(args: {
  sizeKey: string
  carats: number
  amount: number
  setterFee: number
  manualPrice: number | null
  diamondSizeFor: (stoneType: string | undefined | null, sizeKey: string) => DiamondSizeConfig | undefined
}): StoneTypeComparison {
  const { sizeKey, carats, amount, setterFee, manualPrice, diamondSizeFor } = args
  const settingLabor = amount * setterFee
  const hasManual = manualPrice != null

  const build = (stoneType: CompareStoneType): StoneTypeOption => {
    const row = diamondSizeFor(stoneType, sizeKey)
    const pricePerCarat = (row?.basePrice ?? 0) * DIAMOND_TYPE_OPTIONS[stoneType].multiplier
    const stoneCost = hasManual ? (manualPrice as number) : carats * pricePerCarat
    return {
      stoneType,
      label: DIAMOND_TYPE_OPTIONS[stoneType].label,
      hasRow: !!row,
      sizeLabel: row?.label ?? (sizeKey || 'Custom'),
      pricePerCarat,
      stoneCost,
      settingLabor,
      total: stoneCost + settingLabor,
    }
  }

  const natural = build('natural')
  const lab = build('lab-grown')
  const comparable = sizeKey !== '' && !hasManual && natural.hasRow && lab.hasRow
  const cheaper = comparable && natural.total !== lab.total
    ? (natural.total < lab.total ? 'natural' : 'lab-grown')
    : null

  return { natural, lab, comparable, cheaper }
}
