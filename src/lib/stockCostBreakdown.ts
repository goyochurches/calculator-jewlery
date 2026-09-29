import { DIAMOND_TYPE_OPTIONS, JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { sizeKeyDisplay, unpackRoundSizeKey, type QuoteConfig } from '@/hooks/useQuoteConfig'
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
  /** $/ct the gem cost came from. 0 when the stone was priced by hand
   *  (manualPrice), since there is no rate behind that figure to show. */
  pricePerCarat: number
  /** What setting ONE of these stones costs — but only when `labor` really
   *  is count × this. Null otherwise, so the breakdown never prints a
   *  multiplication that doesn't come out to the total beside it. */
  feePerStone: number | null
  /** The setter type's human label ("Pavé", "Bezel", …), '' if unset. */
  setterLabel: string
}

/** Resolves a stone's setter into the label + per-stone fee the breakdown
 *  shows. A per-stone override on the stone wins over the type's own fee,
 *  same as the builders' pricing does. */
function setterFor(stone: PricedStone, config: QuoteConfig): { label: string; fee: number } {
  const cfg = config.setterMap[stone.setterType]
  return { label: cfg?.label ?? '', fee: stone.setterFeeOverride ?? cfg?.fee ?? 0 }
}

/** The fields these helpers actually read off a stone. StockStone and
 *  QuoteStone both satisfy it structurally — the two are the same shape for
 *  everything below — so the Quote detail page can render its stones with
 *  the same lines the Stock detail page uses instead of growing a second,
 *  drifting copy of them. */
export type PricedStone = Pick<StockStone,
  'role' | 'stoneType' | 'stoneCategory' | 'gemstoneName' | 'sizeKey' | 'carats' |
  'setterType' | 'setterFeeOverride' | 'shape' | 'color' | 'cut' | 'clarity' |
  'labReport' | 'manualPrice' | 'contribution'>

/** Per-stone cost/labor the way a QUOTE computes it: setting labor is the
 *  setter's fee times how many stones the carat total works out to, rather
 *  than whatever is left over from a saved `contribution` (which is what
 *  stoneCostSplit does for a stock item). Kept here beside its sibling so
 *  the Quote detail page's per-stone rows and its stone totals come from
 *  one place and can't disagree with each other.
 *
 *  Deliberately NOT routed through the fancy melee sheet, because the quote
 *  totals this replaces never were — adding it here would silently restate
 *  the cost of every already-saved quote that has a fancy-shape stone. */
export function quoteStoneCostSplit(stone: PricedStone, config: QuoteConfig): StoneCostSplit {
  const sizeCfg = config.diamondSizeFor(stone.stoneType, stone.sizeKey)
  const mult = DIAMOND_TYPE_OPTIONS[stone.stoneType]?.multiplier ?? 1
  const pricePerCarat = (sizeCfg?.basePrice ?? 0) * mult
  const ctPerStone = sizeCfg?.ctPerStone ?? 0
  const carats = stone.carats ?? 0
  const count = ctPerStone > 0 ? Math.round(carats / ctPerStone) : 0
  const setter = setterFor(stone, config)
  return {
    cost: stone.manualPrice != null ? stone.manualPrice : carats * pricePerCarat,
    labor: count * setter.fee,
    count,
    // A hand-priced stone has no rate behind it — showing one would invent
    // a $/ct the jeweler never entered.
    pricePerCarat: stone.manualPrice != null ? 0 : pricePerCarat,
    // Labor here is count × fee by construction, so the sum always shows.
    feePerStone: setter.fee,
    setterLabel: setter.label,
  }
}

export function stoneCostSplit(stone: StockStone, config: QuoteConfig): StoneCostSplit {
  const carats = stone.carats ?? 0
  const fancyRow = stone.shape ? config.fancyMeleePriceFor(stone.shape, stone.sizeKey) : undefined
  // Round is priced generically from the Diamond Sizes master table, like
  // any other non-fancy shape — same branch as the builder's sizePricingFor.
  // An item saved while Round priced from the round melee sheet carries a
  // packed "3.4::HPHT::VVS" key, so read the mm back out of it rather than
  // letting those items fall to $0.
  const genericKey = unpackRoundSizeKey(stone.sizeKey).sizeKey || stone.sizeKey
  const sizeCfg = config.diamondSizeFor(stone.stoneType, genericKey)
  const pricePerCarat = fancyRow?.pricePerCarat ?? sizeCfg?.basePrice ?? 0
  const ctPerStone = fancyRow?.ctPerStone ?? sizeCfg?.ctPerStone ?? 0

  const cost = stone.manualPrice != null ? stone.manualPrice : carats * pricePerCarat
  const count = ctPerStone > 0 ? Math.max(1, Math.round(carats / ctPerStone)) : 1
  const contribution = stone.contribution ?? cost
  const labor = Math.max(0, contribution - cost)
  const setter = setterFor(stone, config)
  // A stock item's labor is whatever is left of the price it was SAVED at,
  // not a live lookup — so the setter's current fee may no longer explain
  // it (the fee changed since, or the item was priced by hand). Only offer
  // the "count × fee" breakdown when it still reconciles to the cent.
  const reconciles = Math.abs(count * setter.fee - labor) < 0.005
  return {
    cost, labor, count,
    pricePerCarat: stone.manualPrice != null ? 0 : pricePerCarat,
    feePerStone: reconciles ? setter.fee : null,
    setterLabel: setter.label,
  }
}

/** Human line for a stone/group: "5 Round lab 1.5 0.07ct". */
export function stoneLineLabel(stone: PricedStone, count: number): string {
  const typeLabel = stone.stoneType === 'lab-grown' ? 'lab' : 'natural'
  const carats = stone.carats ?? 0
  return [
    count > 1 ? String(count) : null,
    stone.shape || null,
    typeLabel,
    stone.sizeKey ? sizeKeyDisplay(stone.sizeKey) : null,
    carats > 0 ? `${carats}ct` : null,
  ].filter(Boolean).join(' ')
}

/** Secondary spec line for a stone row — whatever grading/catalog detail is
 *  actually set (gemstone name, color, clarity, cut, lab report). Empty
 *  string when the stone has nothing beyond its main line. */
export function stoneSpecLine(stone: PricedStone): string {
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
    const settingNote = labor > 0 ? `, setting ${money(labor)}` : ''
    lines.push(`${stoneLabel}${specForLabel ? ` (${specForLabel})` : ''} — ${cost > 0 ? money(cost) : 'not priced'}${settingNote}`)
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

/** "0.32 ct × $100.00/ct" — how a gem's cost was reached. Empty string when
 *  the stone was priced by hand, since there is no rate to show. */
export function gemMathLine(stone: PricedStone, split: StoneCostSplit): string {
  const carats = stone.carats ?? 0
  if (split.pricePerCarat <= 0 || carats <= 0) return ''
  return `${carats} ct × ${money(split.pricePerCarat)}/ct`
}

/** "Pavé · 8 × $6.00" — how the setting labor for a stone was reached.
 *  Falls back to just the setter's name when the per-stone fee doesn't
 *  reconcile to the total (see stoneCostSplit), so the line never shows a
 *  sum that disagrees with the figure beside it. */
export function settingMathLine(split: StoneCostSplit): string {
  const sum = split.feePerStone != null && split.count > 0
    ? `${split.count} × ${money(split.feePerStone)}`
    : ''
  return [split.setterLabel, sum].filter(Boolean).join(' · ')
}
