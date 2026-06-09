import type { JewelryMetalOption } from '@/types'
import type { DiamondSizeConfig, RnRingModelConfig, RnRingSizeConfig } from '@/services/configService'

// RN ring sheets carry one labor + gold price per metal *family* (14k / 18k /
// platinum), independent of the white/yellow/rose color. Collapse the full
// JewelryMetalOption down to that family so the RN tables can be indexed.
export type RnMetalCategory = '14k' | '18k' | 'plat'

export function rnMetalCategory(metal: JewelryMetalOption): RnMetalCategory | null {
  if (metal === 'platinum') return 'plat'
  if (metal.startsWith('gold-14k')) return '14k'
  if (metal.startsWith('gold-18k')) return '18k'
  return null // silver / unsupported — RN rings are gold/platinum only
}

export type RnStoneType = 'natural' | 'lab-grown'

export interface RnBreakdown {
  stoneType: RnStoneType
  metalCat: RnMetalCategory | null
  goldPerGram: number
  casting: number
  avgGrams: number
  numStones: number
  settingPerStone: number
  sizeKey: string
  pricePerCarat: number
  ctw: number
  goldCost: number
  settingLabor: number
  diamondCost: number
  hasDiamondRow: boolean
  total: number
}

/**
 * Pure RN cost breakdown for a given model + size + metal + diamond type.
 * CTW is the fixed sheet value for the model+size (same physical stones for
 * natural or lab); only the per-carat price changes by diamond type, resolved
 * from the existing diamond_size_config row. Reused by the classic builder, the
 * wizard and the at-a-glance Natural/Lab comparison.
 */
export function computeRnBreakdown(args: {
  model: RnRingModelConfig | null
  sizeRow: RnRingSizeConfig | null
  metal: JewelryMetalOption
  stoneType: RnStoneType
  diamondSizeFor: (stoneType: string | undefined | null, sizeKey: string) => DiamondSizeConfig | undefined
}): RnBreakdown {
  const { model, sizeRow, metal, stoneType, diamondSizeFor } = args
  const metalCat = rnMetalCategory(metal)
  const pick = <T,>(a: T, b: T, c: T): T => (metalCat === '14k' ? a : metalCat === '18k' ? b : c)
  const goldPerGram = model && metalCat ? (pick(model.goldPrice14k, model.goldPrice18k, model.goldPricePlat) ?? 0) : 0
  const casting = model && metalCat ? (pick(model.labor14k, model.labor18k, model.laborPlat) ?? 0) : 0
  const avgGrams = model?.avgGrams ?? 0
  const numStones = sizeRow?.numStones ?? 0
  const settingPerStone = model?.settingLaborPerStone ?? 0
  const sizeKey = stoneType === 'lab-grown' ? (model?.diamondSizeKeyLab ?? '') : (model?.diamondSizeKey ?? '')
  const diamondRow = model ? diamondSizeFor(stoneType, sizeKey) : undefined
  // CTW is the fixed sheet value for this model + size (same physical stones for
  // natural or lab); only the per-carat price differs by diamond type/table.
  const ctw = sizeRow?.ctw ?? 0
  const pricePerCarat = diamondRow?.basePrice ?? 0
  const goldCost = avgGrams * goldPerGram
  const settingLabor = numStones * settingPerStone
  const diamondCost = ctw * pricePerCarat
  return {
    stoneType, metalCat, goldPerGram, casting, avgGrams, numStones, settingPerStone,
    sizeKey, pricePerCarat, ctw, goldCost, settingLabor, diamondCost,
    hasDiamondRow: !!diamondRow,
    total: goldCost + casting + settingLabor + diamondCost,
  }
}
