import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import type { QuoteConfig } from '@/hooks/useQuoteConfig'
import type { StockItem, StockStone } from '@/types'

// Splits a saved StockStone's single `contribution` ($ = stone cost +
// setting labor, same convention as the Quote builder) back into its two
// parts, plus how many individual pieces the carats represent — so the
// detail view and clipboard export can show "5 round lab 1.5mm 0.07ct
// $48" instead of one opaque total. Mirrors StockBuilder.tsx's
// sizePricingFor/stoneBreakdown so a saved item reads the same way the
// builder priced it.
export interface StoneCostSplit {
  /** Stone-only cost (no setting labor). */
  cost: number
  /** Setting labor for this stone/group. */
  labor: number
  /** Number of individual pieces this carat total represents (best-effort;
   *  falls back to 1 when the size chart has no per-stone carat weight). */
  count: number
}

export function stoneCostSplit(stone: StockStone, config: QuoteConfig): StoneCostSplit {
  const carats = stone.carats ?? 0
  const fancyRow = stone.shape ? config.fancyMeleePriceFor(stone.shape, stone.sizeKey) : undefined
  const pricePerCarat = fancyRow?.pricePerCarat ?? config.diamondSizeFor(stone.stoneType, stone.sizeKey)?.basePrice ?? 0
  const ctPerStone = fancyRow?.ctPerStone ?? config.diamondSizeFor(stone.stoneType, stone.sizeKey)?.ctPerStone ?? 0

  const cost = stone.manualPrice != null ? stone.manualPrice : carats * pricePerCarat
  const count = ctPerStone > 0 ? Math.max(1, Math.round(carats / ctPerStone)) : 1
  const contribution = stone.contribution ?? cost
  const labor = Math.max(0, contribution - cost)
  return { cost, labor, count }
}

/** Human line for a stone/group: "5 Round lab 1.5 0.07ct". */
export function stoneLineLabel(stone: StockStone, count: number): string {
  const typeLabel = stone.stoneType === 'lab-grown' ? 'lab' : 'natural'
  const carats = stone.carats ?? 0
  return [
    count > 1 ? String(count) : null,
    stone.shape || null,
    typeLabel,
    stone.sizeKey || null,
    carats > 0 ? `${carats}ct` : null,
  ].filter(Boolean).join(' ')
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

/** Every costing factor of a saved stock piece as one plain-text block,
 *  ready to paste into a listing description or an internal message —
 *  same line-by-line shape as the on-screen breakdown. */
export function formatStockItemText(item: StockItem, config: QuoteConfig): string {
  const lines: string[] = []
  lines.push(item.title || 'Untitled piece')
  const meta = [item.sku ? `SKU ${item.sku}` : null, item.status, item.jewelryType || null].filter(Boolean).join(' · ')
  if (meta) lines.push(meta)
  lines.push('')

  let settingLabor = 0

  for (const r of item.metalRows ?? []) {
    if (!r.weightGrams) continue
    const cost = (config.metalPriceMap[r.metalKey] ?? 0) * r.weightGrams
    lines.push(`${r.weightGrams}g ${JEWELRY_METAL_OPTIONS[r.metalKey]?.label ?? r.metalKey} — ${money(cost)}`)
  }

  const ringLaborFee = item.ringLabor ? config.ringLaborMap[item.ringLabor]?.fee ?? 0 : 0
  if (ringLaborFee > 0) {
    lines.push(`${config.ringLaborMap[item.ringLabor ?? '']?.label ?? 'Ring labor'} — ${money(ringLaborFee)}`)
  }

  for (const s of item.stones ?? []) {
    const { cost, labor, count } = stoneCostSplit(s, config)
    settingLabor += labor
    if (cost <= 0) continue
    lines.push(`${stoneLineLabel(s, count) || 'Stone'} — ${money(cost)}`)
  }

  for (const es of item.emkayStones ?? []) {
    const qty = es.quantity ?? 1
    const cost = qty * es.priceUsd
    const setterFee = es.setterFeeOverride ?? config.setterMap[es.setterType ?? '']?.fee ?? 0
    settingLabor += qty * setterFee
    lines.push(`${es.name} — ${money(cost)}`)
  }

  if (settingLabor > 0) lines.push(`Labor to set — ${money(settingLabor)}`)
  if (item.engravingFee) lines.push(`Engraving — ${money(item.engravingFee)}`)
  if (item.extraCosts) lines.push(`Extra costs — ${money(item.extraCosts)}`)

  lines.push('')
  lines.push(`Total cost: ${money(item.total)}`)
  if (item.finishedWeightGrams != null) lines.push(`Finished weight: ${item.finishedWeightGrams}g (note only)`)
  if (item.internalNotes) { lines.push(''); lines.push(item.internalNotes) }

  return lines.join('\n')
}
