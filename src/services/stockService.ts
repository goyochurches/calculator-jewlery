import { api } from '@/api/apiClient'
import type { QuoteAttachment, QuoteEmkayStone, QuoteMetal, StockItem, StockStatus, StockStone } from '../types'

interface ApiAttachment {
  id?: number | null
  photo: string
  caption?: string | null
  sortOrder?: number | null
  createdAt?: string | null
}

interface ApiEmkayStone {
  id?: number | null
  emkayProductId?: string | null
  model?: string | null
  name: string
  imageUrl?: string | null
  certImageUrl?: string | null
  priceUsd: number
  caratWeight?: number | null
  shape?: string | null
  sizeText?: string | null
  treatment?: string | null
  stoneType?: string | null
  countryOfOrigin?: string | null
  href?: string | null
  setterType?: string | null
  setterFeeOverride?: number | null
  quantity: number
  sortOrder?: number | null
  comments?: string | null
}

interface ApiMetalRow {
  id?: number | null
  metalKey: string
  weightGrams: number
  position?: number | null
}

interface ApiStockStone {
  id?: number | null
  role: 'MAIN' | 'SIDE' | 'MELEE'
  stoneType: string
  stoneCategory?: string | null
  gemstoneId?: number | null
  gemstoneName?: string | null
  sizeKey: string
  carats: number
  setterType: string
  setterFeeOverride?: number | null
  labReport?: string | null
  sortOrder?: number | null
  shape?: string | null
  color?: string | null
  cut?: string | null
  clarity?: string | null
  manualPrice?: number | null
  comments?: string | null
  markupMultiplier?: number | null
  contribution?: number | null
}

interface ApiStockItem {
  id: number
  title: string
  sku?: string | null
  quantity: number
  createdBy?: { id: number; name: string; email: string; avatar: string } | null
  createdAt: string
  status: StockStatus
  jewelryType?: string | null
  ringLabor?: string | null
  ringWidth?: number | null
  fingerSize?: number | null
  laborHours?: number | null
  hourlyRate?: number | null
  extraCosts?: number | null
  total: number
  markupMultiplier?: number | null
  discountPercent?: number | null
  photo?: string | null
  internalNotes?: string | null
  engravingFee?: number | null
  finishedWeightGrams?: number | null
  setterType?: string | null
  archived?: boolean | null
  metalRows?: ApiMetalRow[]
  stones?: ApiStockStone[]
  emkayStones?: ApiEmkayStone[]
  attachments?: ApiAttachment[]
  retailPrice?: number | null
}

interface ApiStockItemSummary {
  id: number
  title: string
  sku?: string | null
  quantity: number
  createdBy?: { id: number; name: string; email: string; avatar: string } | null
  createdAt: string
  status: StockStatus
  photo?: string | null
  total: number
  retailPrice?: number | null
}

function mapMetalRow(r: ApiMetalRow): QuoteMetal {
  return {
    id: r.id ?? null,
    metalKey: r.metalKey as QuoteMetal['metalKey'],
    weightGrams: r.weightGrams,
    position: r.position ?? 0,
  }
}

function mapStone(s: ApiStockStone): StockStone {
  return {
    id: s.id ?? null,
    role: s.role,
    stoneType: s.stoneType as StockStone['stoneType'],
    stoneCategory: (s.stoneCategory as StockStone['stoneCategory']) ?? 'DIAMOND',
    gemstoneId: s.gemstoneId ?? null,
    gemstoneName: s.gemstoneName ?? null,
    sizeKey: s.sizeKey,
    carats: s.carats,
    setterType: s.setterType,
    setterFeeOverride: s.setterFeeOverride ?? null,
    labReport: s.labReport ?? null,
    sortOrder: s.sortOrder ?? null,
    shape: s.shape ?? null,
    color: s.color ?? null,
    cut: s.cut ?? null,
    clarity: s.clarity ?? null,
    manualPrice: s.manualPrice ?? null,
    comments: s.comments ?? null,
    markupMultiplier: s.markupMultiplier ?? null,
    contribution: s.contribution ?? null,
  }
}

function mapEmkayStone(s: ApiEmkayStone): QuoteEmkayStone {
  return {
    id: s.id ?? null,
    emkayProductId: s.emkayProductId ?? null,
    model: s.model ?? null,
    name: s.name,
    imageUrl: s.imageUrl ?? null,
    certImageUrl: s.certImageUrl ?? null,
    priceUsd: s.priceUsd,
    caratWeight: s.caratWeight ?? null,
    shape: s.shape ?? null,
    sizeText: s.sizeText ?? null,
    treatment: s.treatment ?? null,
    stoneType: s.stoneType ?? null,
    countryOfOrigin: s.countryOfOrigin ?? null,
    href: s.href ?? null,
    setterType: s.setterType ?? null,
    setterFeeOverride: s.setterFeeOverride ?? null,
    quantity: s.quantity ?? 1,
    sortOrder: s.sortOrder ?? null,
    comments: s.comments ?? null,
  }
}

function mapAttachment(a: ApiAttachment): QuoteAttachment {
  return {
    id: a.id ?? null,
    photo: a.photo,
    caption: a.caption ?? null,
    sortOrder: a.sortOrder ?? null,
    createdAt: a.createdAt ?? null,
  }
}

function mapStockItem(s: ApiStockItem): StockItem {
  return {
    id: String(s.id),
    title: s.title,
    sku: s.sku ?? null,
    quantity: s.quantity ?? 1,
    createdBy: s.createdBy?.name ?? null,
    createdAt: s.createdAt,
    status: s.status,
    jewelryType: s.jewelryType ?? null,
    metalRows: (s.metalRows ?? []).map(mapMetalRow),
    ringLabor: s.ringLabor ?? null,
    ringWidth: s.ringWidth ?? null,
    fingerSize: s.fingerSize ?? null,
    laborHours: s.laborHours ?? null,
    hourlyRate: s.hourlyRate ?? null,
    extraCosts: s.extraCosts ?? null,
    total: s.total,
    markupMultiplier: s.markupMultiplier ?? null,
    discountPercent: s.discountPercent ?? null,
    photo: s.photo ?? null,
    internalNotes: s.internalNotes ?? null,
    engravingFee: s.engravingFee ?? null,
    finishedWeightGrams: s.finishedWeightGrams ?? null,
    setterType: s.setterType ?? null,
    stones: (s.stones ?? []).map(mapStone),
    emkayStones: (s.emkayStones ?? []).map(mapEmkayStone),
    attachments: (s.attachments ?? []).map(mapAttachment),
    archived: s.archived ?? false,
    retailPrice: s.retailPrice ?? null,
  }
}

// Full detail is fetched via getById before editing/duplicating — mirrors
// the correct pattern in quotesService (never prefill a form straight from
// the lightweight list-page summary; see the QuotesList duplicate bug).
function mapSummary(s: ApiStockItemSummary): StockItem {
  return {
    id: String(s.id),
    title: s.title,
    sku: s.sku ?? null,
    quantity: s.quantity ?? 1,
    createdBy: s.createdBy?.name ?? null,
    createdAt: s.createdAt,
    status: s.status,
    photo: s.photo ?? null,
    total: s.total,
    retailPrice: s.retailPrice ?? null,
    metalRows: [],
    stones: [],
  }
}

interface SpringPage<T> {
  content: T[]
  page?: { totalElements: number; totalPages: number; number: number; size: number }
  totalElements?: number
  totalPages?: number
  number?: number
}

export interface StockPage {
  items: StockItem[]
  totalPages: number
  totalElements: number
  currentPage: number
}

export const stockService = {
  async getPage(params: {
    page?: number
    size?: number
    status?: string
    q?: string
  }): Promise<StockPage> {
    const { page = 0, size = 20, status, q } = params
    let url = `/api/stock?page=${page}&size=${size}&sort=createdAt,desc&sort=id,desc`
    if (status && status !== 'all') url += `&status=${status.toUpperCase()}`
    if (q && q.trim()) url += `&q=${encodeURIComponent(q.trim())}`
    const data = await api.get<SpringPage<ApiStockItemSummary>>(url)
    const meta = data.page
    return {
      items: (data.content ?? []).map(mapSummary),
      totalPages:    meta?.totalPages    ?? data.totalPages    ?? 1,
      totalElements: meta?.totalElements ?? data.totalElements ?? 0,
      currentPage:   meta?.number        ?? data.number        ?? 0,
    }
  },

  async getCounts(): Promise<Record<string, number>> {
    return api.get<Record<string, number>>('/api/stock/counts')
  },

  async getById(id: string): Promise<StockItem> {
    const data = await api.get<ApiStockItem>(`/api/stock/${id}`)
    return mapStockItem(data)
  },

  async create(
    payload: Omit<ApiStockItem, 'id' | 'createdBy' | 'createdAt' | 'retailPrice'>,
    userId: number,
  ): Promise<StockItem> {
    const data = await api.post<ApiStockItem>(`/api/stock?userId=${userId}`, payload)
    return mapStockItem(data)
  },

  async update(id: string, payload: Omit<ApiStockItem, 'id' | 'createdBy' | 'createdAt' | 'retailPrice'>): Promise<StockItem> {
    const data = await api.put<ApiStockItem>(`/api/stock/${id}`, payload)
    return mapStockItem(data)
  },

  async updateStatus(id: string, status: StockStatus): Promise<StockItem> {
    const data = await api.patch<ApiStockItem>(`/api/stock/${id}/status?status=${status}`)
    return mapStockItem(data)
  },

  async remove(id: string): Promise<void> {
    await api.delete<void>(`/api/stock/${id}`)
  },
}
