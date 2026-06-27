import { api } from '@/api/apiClient'

export interface SimilarQuote {
  id: number
  title: string
  clientName: string | null
  internalCost: number
  customerTotal: number
  metalKey: string | null
  jewelryType: string | null
  createdAt: string
}

export interface CompetitorProduct {
  id: number
  storeName: string
  productName: string
  priceUsd: number
  priceRaw: string | null
  productUrl: string
  imageUrl: string | null
  imageUrls: string[] | null
  category: string | null
  metalType: string | null
  karat: string | null
}

export interface MarketComparisonResult {
  myPastQuotes: SimilarQuote[]
  competitorProducts: CompetitorProduct[]
  aiAnalysis: string
}

/** Extracts "gold" and "18k" from a metal key like "gold-18k-white". */
export function parseMetalKey(key: string): { metalType: string; karat: string | undefined } {
  if (!key || key === 'platinum') return { metalType: 'platinum', karat: 'platinum' }
  if (key === 'silver') return { metalType: 'silver', karat: undefined }
  const parts = key.split('-')
  const metalType = parts[0] ?? 'gold'
  const karat = parts.find(p => /^\d+k$/i.test(p))
  return { metalType, karat }
}

export async function fetchMarketComparison(
  jewelryType: string,
  metalKey: string,
  myPrice: number,
): Promise<MarketComparisonResult> {
  const { metalType, karat } = parseMetalKey(metalKey)
  const params = new URLSearchParams({
    jewelryType,
    metalType,
    myPrice: String(Math.round(myPrice)),
  })
  if (karat) params.set('karat', karat)

  return api.get<MarketComparisonResult>(`/api/competitor-products/comparison?${params}`)
}
