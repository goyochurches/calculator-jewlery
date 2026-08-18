import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import type { QuoteConfig } from '@/hooks/useQuoteConfig'
import { JEWELRY_TYPE_OPTIONS } from '@/hooks/useQuoteBuilder'
import type { QuoteEmkayStone, StockItem, StockStone } from '@/types'

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

/** Secondary spec line for a stone row — whatever grading/catalog detail is
 *  actually set (gemstone name, color, clarity, cut, lab report). Empty
 *  string when the stone has nothing beyond its main line. */
export function stoneSpecLine(stone: StockStone): string {
  const parts: string[] = []
  if (stone.stoneCategory === 'GEMSTONE' && stone.gemstoneName) parts.push(stone.gemstoneName)
  if (stone.color) parts.push(`Color ${stone.color}`)
  if (stone.clarity) parts.push(`Clarity ${stone.clarity}`)
  if (stone.cut) parts.push(`Cut ${stone.cut}`)
  if (stone.labReport) parts.push(stone.labReport)
  return parts.join(' · ')
}

/** Secondary spec line for an EMKAY catalog stone: "Round · 0.50ct ·
 *  Heated · Sri Lanka". Empty string when nothing beyond the name is set. */
export function emkaySpecLine(es: QuoteEmkayStone): string {
  return [
    es.shape || null,
    es.caratWeight ? `${es.caratWeight}ct` : null,
    es.treatment || null,
    es.countryOfOrigin || null,
  ].filter(Boolean).join(' · ')
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

/** RN ready-made rings don't use a ring-labor tier (their `ringLabor` field
 *  is saved empty) — the casting fee only survives as a "Labor: $X" line
 *  inside the structured RN note StockBuilder writes into internalNotes
 *  (see its rnNote builder). Recovers that dollar figure so the detail view
 *  and clipboard export can show it as its own "Casting labor" line instead
 *  of it silently vanishing from the itemized breakdown. */
export function rnCastingFeeFromNotes(internalNotes?: string | null): number | null {
  if (!internalNotes) return null
  const match = internalNotes.match(/^Labor:\s*\$([\d,.]+)/m)
  if (!match) return null
  const n = Number(match[1].replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Every costing factor of a saved stock piece as one plain-text block,
 *  ready to paste into a listing description or an internal message — same
 *  line-by-line shape (and same spec detail) as the on-screen breakdown, so
 *  what you copy always matches what you see. */
export function formatStockItemText(item: StockItem, config: QuoteConfig): string {
  const lines: string[] = []
  lines.push(item.title || 'Untitled piece')
  const statusLabel = item.status ? item.status.charAt(0) + item.status.slice(1).toLowerCase() : null
  const jewelryTypeLabel = JEWELRY_TYPE_OPTIONS.find(j => j.key === item.jewelryType)?.label ?? item.jewelryType ?? null
  const meta = [item.sku ? `SKU ${item.sku}` : null, statusLabel, jewelryTypeLabel].filter(Boolean).join(' · ')
  if (meta) lines.push(meta)
  const spec = [
    item.ringWidth ? `Ring width ${item.ringWidth}mm` : null,
    item.fingerSize ? `Finger size ${item.fingerSize}` : null,
  ].filter(Boolean).join(' · ')
  if (spec) lines.push(spec)
  lines.push('')

  let settingLabor = 0

  for (const r of item.metalRows ?? []) {
    if (!r.weightGrams) continue
    const pricePerGram = config.metalPriceMap[r.metalKey] ?? 0
    const cost = pricePerGram * r.weightGrams
    lines.push(`${r.weightGrams}g ${JEWELRY_METAL_OPTIONS[r.metalKey]?.label ?? r.metalKey} (${money(pricePerGram)}/g) — ${money(cost)}`)
  }

  const ringLaborFee = item.ringLabor ? config.ringLaborMap[item.ringLabor]?.fee ?? 0 : 0
  if (ringLaborFee > 0) {
    const tier = config.ringLaborMap[item.ringLabor ?? '']?.label ?? item.ringLabor
    lines.push(`CAD & jeweler's time (${tier} tier) — ${money(ringLaborFee)}`)
  } else if (item.jewelryType === 'rn') {
    const castingFee = rnCastingFeeFromNotes(item.internalNotes)
    if (castingFee != null) lines.push(`Casting labor — ${money(castingFee)}`)
  }

  if (item.laborHours) {
    const benchCost = item.laborHours * (item.hourlyRate ?? 0)
    lines.push(`Bench labor (${item.laborHours}h × ${money(item.hourlyRate ?? 0)}/h) — ${money(benchCost)}`)
  }

  const stoneComments: string[] = []
  for (const s of item.stones ?? []) {
    const { cost, labor, count } = stoneCostSplit(s, config)
    settingLabor += labor
    const specForLabel = stoneSpecLine(s)
    const roleLabel = s.role.charAt(0) + s.role.slice(1).toLowerCase()
    const stoneLabel = `${roleLabel}: ${stoneLineLabel(s, count) || 'Stone'}`
    if (cost > 0) lines.push(`${stoneLabel}${specForLabel ? ` (${specForLabel})` : ''} — ${money(cost)}`)
    if (s.comments) stoneComments.push(`${stoneLabel} — ${s.comments}`)
  }

  for (const es of item.emkayStones ?? []) {
    const qty = es.quantity ?? 1
    const cost = qty * es.priceUsd
    const setterFee = es.setterFeeOverride ?? config.setterMap[es.setterType ?? '']?.fee ?? 0
    settingLabor += qty * setterFee
    const spec = emkaySpecLine(es)
    lines.push(`${es.name}${spec ? ` (${spec})` : ''} — ${money(cost)}`)
  }

  if (settingLabor > 0) lines.push(`Labor to set — ${money(settingLabor)}`)
  if (item.engravingFee) lines.push(`Engraving — ${money(item.engravingFee)}`)
  if (item.extraCosts) lines.push(`Extra costs — ${money(item.extraCosts)}`)

  lines.push('')
  lines.push(`Total cost: ${money(item.total)}`)
  if (item.finishedWeightGrams != null) lines.push(`Finished weight: ${item.finishedWeightGrams}g (note only)`)
  if (stoneComments.length > 0) { lines.push(''); lines.push(...stoneComments) }
  if (item.internalNotes) { lines.push(''); lines.push(item.internalNotes) }

  return lines.join('\n')
}
