// Live jewelry $/gram, derived from the metal spot feed instead of a frozen
// constant.
//
//   $/gram = (spot $/troy-oz ÷ 31.1035) × purity × (1 + markup%)
//
// Spot comes from the live XAU/XPT feed (see metalService — same feed the
// Metals dashboard reads). Purity is the karat/alloy fineness — fixed, since
// color (white/yellow/rose) doesn't change how much gold is actually in the
// piece. Markup% is the only admin-tunable knob (Master Tables → Metal
// Pricing) and is what lets today's $/gram be pinned to a target (e.g.
// $95/14k) while continuing to float with spot from then on.

import { TROY_OUNCE_TO_GRAMS } from '@/constants/config'

export type MetalCategory = '14k' | '18k' | 'platinum'

/** Fineness of each category. 14k/18k are exact karat fractions; platinum
 *  jewelry is conventionally Pt950 (95% pure), not the 999 fine spot quotes. */
export const METAL_PURITY: Record<MetalCategory, number> = {
  '14k': 14 / 24,
  '18k': 18 / 24,
  platinum: 0.95,
}

/** $/gram of 100%-pure metal at the given spot price (per troy oz). */
export function pureMetalCostPerGram(spotPerOz: number): number {
  return spotPerOz / TROY_OUNCE_TO_GRAMS
}

export function computePricePerGram(spotPerOz: number, category: MetalCategory, markupPercent: number): number {
  return pureMetalCostPerGram(spotPerOz) * METAL_PURITY[category] * (1 + markupPercent / 100)
}

/** Back-solves the markup% that reproduces `targetPricePerGram` at the given
 *  spot — lets an admin type the $/gram they actually want and have it
 *  stored as a spot-relative markup instead of a number that goes stale. */
export function markupPercentFromTarget(spotPerOz: number, category: MetalCategory, targetPricePerGram: number): number {
  const pureCategoryCost = pureMetalCostPerGram(spotPerOz) * METAL_PURITY[category]
  if (pureCategoryCost <= 0) return 0
  return (targetPricePerGram / pureCategoryCost - 1) * 100
}

/** Maps a JEWELRY_METAL_OPTIONS key (e.g. "gold-14k-white") to its pricing
 *  category — white/yellow/rose and the legacy un-suffixed keys all share
 *  the same category. Silver isn't tied to spot and returns null. */
export function categoryForMetalKey(key: string): MetalCategory | null {
  if (key === 'platinum') return 'platinum'
  if (key.includes('14k')) return '14k'
  if (key.includes('18k')) return '18k'
  return null
}
