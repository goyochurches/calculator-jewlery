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
  metalColor: string | null
  karat: string | null
  stoneType: string | null
  stoneCarat: number | null
  stoneColor: string | null
  stoneClarity: string | null
  stoneCut: string | null
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

/** Rich quote details forwarded to the AI so the analysis is piece-specific. */
export interface QuoteContext {
  mainStoneCarats?: number | null
  mainStoneShape?: string | null
  mainStoneColor?: string | null
  mainStoneClarity?: string | null
  mainStoneCut?: string | null
  /** true = natural diamond, false = lab-grown, null = no stone / not a diamond */
  mainStoneNatural?: boolean | null
  metalGrams?: number | null
  /** Exact dollar cost of the metal at current spot price — fixed baseline for comparison. */
  materialCostUsd?: number | null
  totalCarats?: number | null
  hasSideStones?: boolean
  sideStoneCarats?: number | null
  sideStoneCount?: number | null
  sideStoneShape?: string | null
  sideStoneNatural?: boolean | null
  hasMelee?: boolean
  meleeCarats?: number | null
  meleeCount?: number | null
  meleeNatural?: boolean | null
}

/** Extracts "gold", "18k", and "white" from a metal key like "gold-18k-white". */
export function parseMetalKey(key: string): { metalType: string; karat: string | undefined; metalColor: string | undefined } {
  if (!key || key === 'platinum') return { metalType: 'platinum', karat: 'platinum', metalColor: undefined }
  if (key === 'silver') return { metalType: 'silver', karat: undefined, metalColor: undefined }
  const parts = key.split('-')
  const metalType = parts[0] ?? 'gold'
  const karat = parts.find(p => /^\d+k$/i.test(p))
  const metalColor = parts.find(p => ['white', 'yellow', 'rose'].includes(p))
  return { metalType, karat, metalColor }
}

export async function fetchMarketComparison(
  jewelryType: string,
  metalKey: string,
  myPrice: number,
  clientId?: number | null,
  stoneType?: string | null,
  ctx?: QuoteContext | null,
): Promise<MarketComparisonResult> {
  const { metalType, karat, metalColor } = parseMetalKey(metalKey)
  const params = new URLSearchParams({
    jewelryType,
    metalType,
    myPrice: String(Math.round(myPrice)),
  })
  if (karat)      params.set('karat',      karat)
  if (metalColor) params.set('metalColor', metalColor)
  if (clientId)   params.set('clientId',   String(clientId))
  if (stoneType)  params.set('stoneType',  stoneType)

  // Rich context for AI analysis — backend uses these to produce piece-specific insights.
  if (ctx) {
    if (ctx.mainStoneCarats != null && ctx.mainStoneCarats > 0)
      params.set('mainStoneCarats', String(ctx.mainStoneCarats))
    if (ctx.mainStoneShape)   params.set('mainStoneShape',   ctx.mainStoneShape)
    if (ctx.mainStoneColor)   params.set('mainStoneColor',   ctx.mainStoneColor)
    if (ctx.mainStoneClarity) params.set('mainStoneClarity', ctx.mainStoneClarity)
    if (ctx.mainStoneCut)     params.set('mainStoneCut',     ctx.mainStoneCut)
    if (ctx.mainStoneNatural != null)
      params.set('mainStoneNatural', String(ctx.mainStoneNatural))
    if (ctx.metalGrams != null && ctx.metalGrams > 0)
      params.set('metalGrams', String(Math.round(ctx.metalGrams * 100) / 100))
    if (ctx.materialCostUsd != null && ctx.materialCostUsd > 0)
      params.set('materialCostUsd', String(Math.round(ctx.materialCostUsd * 100) / 100))
    if (ctx.totalCarats != null && ctx.totalCarats > 0)
      params.set('totalCarats', String(ctx.totalCarats))
    if (ctx.hasSideStones) params.set('hasSideStones', 'true')
    if (ctx.sideStoneCarats != null && ctx.sideStoneCarats > 0)
      params.set('sideStoneCarats', String(Math.round(ctx.sideStoneCarats * 10000) / 10000))
    if (ctx.sideStoneCount != null && ctx.sideStoneCount > 0)
      params.set('sideStoneCount', String(ctx.sideStoneCount))
    if (ctx.sideStoneShape)   params.set('sideStoneShape',   ctx.sideStoneShape)
    if (ctx.sideStoneNatural != null)
      params.set('sideStoneNatural', String(ctx.sideStoneNatural))
    if (ctx.hasMelee)      params.set('hasMelee',      'true')
    if (ctx.meleeCarats != null && ctx.meleeCarats > 0)
      params.set('meleeCarats', String(Math.round(ctx.meleeCarats * 10000) / 10000))
    if (ctx.meleeCount != null && ctx.meleeCount > 0)
      params.set('meleeCount', String(ctx.meleeCount))
    if (ctx.meleeNatural != null)
      params.set('meleeNatural', String(ctx.meleeNatural))
  }

  return api.get<MarketComparisonResult>(`/api/competitor-products/comparison?${params}`)
}
