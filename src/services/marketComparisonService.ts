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
  description?: string | null
}

export interface CompetitorProductPage {
  content: CompetitorProduct[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface FilterOptions {
  stores: string[]
  categories: string[]
}

export async function fetchCompetitorProducts(params: {
  store?: string
  category?: string
  metalType?: string
  karat?: string
  search?: string
  page?: number
  size?: number
}): Promise<CompetitorProductPage> {
  const p = new URLSearchParams()
  if (params.store)     p.set('store', params.store)
  if (params.category)  p.set('category', params.category)
  if (params.metalType) p.set('metalType', params.metalType)
  if (params.karat)     p.set('karat', params.karat)
  if (params.search)    p.set('search', params.search)
  if (params.page != null) p.set('page', String(params.page))
  if (params.size != null) p.set('size', String(params.size))
  return api.get<CompetitorProductPage>(`/api/competitor-products?${p}`)
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  return api.get<FilterOptions>('/api/competitor-products/filter-options')
}

export interface MarketComparisonResult {
  myPastQuotes: SimilarQuote[]
  competitorProducts: CompetitorProduct[]
  aiAnalysis: string
  priceScore: number   // 1–5
  priceLabel: string   // e.g. "Excellent — well below market"
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
  clientId?: number | null,
): Promise<MarketComparisonResult> {
  const { metalType, karat } = parseMetalKey(metalKey)
  const params = new URLSearchParams({
    jewelryType,
    metalType,
    myPrice: String(Math.round(myPrice)),
  })
  if (karat)    params.set('karat', karat)
  if (clientId) params.set('clientId', String(clientId))

  return api.get<MarketComparisonResult>(`/api/competitor-products/comparison?${params}`)
}
