import type { SavedQuote } from '@/types'

// Customer-facing ("retail") price of a quote. Mirrors the breakdown shown in
// QuoteDetailPanel so the list, the detail drawer and the public link never
// disagree on the number the customer actually pays.
//
// Formula: ((cost − customMainPool) × markup
//           + customMainPool × customMarkup) × (1 − discount/100)
//           + optional 7.75% sales tax.
// Engraving is part of the cost and IS marked up like everything else.
// A non-null customerPriceOverride short-circuits the whole pipeline.
// Falls back to the legacy 2.5× / 0% defaults for quotes saved before markup
// and per-stone overrides existed.

const SALES_TAX_RATE = 0.0775

export interface CustomerPrice {
  /** Final retail price billed to the customer (markup + discount + tax). */
  customerPrice: number
  /** Retail price before any discount. */
  beforeDiscount: number
  /** Money saved by the discount. */
  discountAmount: number
  /** Retail price after discount, before tax. */
  afterDiscount: number
  /** Sales tax added on top (0 when not applied). */
  taxAmount: number
  applyTaxes: boolean
}

export function computeCustomerPrice(quote: SavedQuote): CustomerPrice {
  const markup = quote.markupMultiplier ?? 2.5
  const discount = Math.max(0, Math.min(100, quote.discountPercent ?? 0))

  // Stones with a per-stone markup are priced separately from the generic pool.
  let customMainRaw = 0
  let customMainMarkedUp = 0
  for (const s of quote.stones ?? []) {
    if (s.markupMultiplier == null || s.contribution == null) continue
    customMainRaw += s.contribution
    customMainMarkedUp += s.contribution * s.markupMultiplier
  }

  // Engraving is part of the cost and IS marked up; only per-stone overrides
  // (customMainRaw) are carved out to be priced at their own multiplier.
  const genericPool = quote.total - customMainRaw
  const beforeDiscount = genericPool * markup + customMainMarkedUp
  const discountAmount = beforeDiscount * (discount / 100)
  const afterDiscount = beforeDiscount - discountAmount
  const applyTaxes = !!quote.applyTaxes
  const taxAmount = applyTaxes ? afterDiscount * SALES_TAX_RATE : 0
  const customerPrice = quote.customerPriceOverride != null
    ? quote.customerPriceOverride
    : afterDiscount + taxAmount

  return { customerPrice, beforeDiscount, discountAmount, afterDiscount, taxAmount, applyTaxes }
}
