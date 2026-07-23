import { api } from '@/api/apiClient'
import type { EmkayCatalogPage, EmkayCatalogProduct, EmkayCategory } from '../types'

interface ApiEmkayProduct {
  productId: string
  model: string | null
  name: string | null
  imageUrl: string | null
  certImageUrl: string | null
  price: number | null
  caratWeight: number | null
  shape: string | null
  size: string | null
  treatment: string | null
  stoneType: string | null
  countryOfOrigin: string | null
  pricePerCarat: string | null
  href: string | null
  categoryIds: string[] | null
  attributes: Record<string, string> | null
}

interface ApiEmkayPage {
  items: ApiEmkayProduct[]
  page: number
  size: number
  total: number
  totalPages: number
}

interface ApiEmkayCategory {
  categoryId: string
  name: string | null
}

function mapProduct(p: ApiEmkayProduct): EmkayCatalogProduct {
  return {
    productId: p.productId,
    model: p.model ?? null,
    name: p.name ?? null,
    imageUrl: p.imageUrl ?? null,
    certImageUrl: p.certImageUrl ?? null,
    price: p.price ?? null,
    caratWeight: p.caratWeight ?? null,
    shape: p.shape ?? null,
    size: p.size ?? null,
    treatment: p.treatment ?? null,
    stoneType: p.stoneType ?? null,
    countryOfOrigin: p.countryOfOrigin ?? null,
    pricePerCarat: p.pricePerCarat ?? null,
    href: p.href ?? null,
    categoryIds: p.categoryIds ?? [],
    attributes: p.attributes ?? {},
  }
}

export const emkayService = {
  /** True once EMKAY_API_KEY is configured on the backend. */
  async status(): Promise<boolean> {
    const data = await api.get<{ configured: boolean }>('/api/emkay/status')
    return data.configured
  },

  async categories(): Promise<EmkayCategory[]> {
    const data = await api.get<ApiEmkayCategory[]>('/api/emkay/categories')
    return data.map(c => ({ categoryId: c.categoryId, name: c.name ?? null }))
  },

  async browse(params: {
    search?: string
    categoryId?: string
    page?: number
    size?: number
  }): Promise<EmkayCatalogPage> {
    const { search, categoryId, page = 0, size = 24 } = params
    const qs = new URLSearchParams()
    if (search && search.trim()) qs.set('search', search.trim())
    if (categoryId) qs.set('categoryId', categoryId)
    qs.set('page', String(page))
    qs.set('size', String(size))
    const data = await api.get<ApiEmkayPage>(`/api/emkay/products?${qs.toString()}`)
    return {
      items: (data.items ?? []).map(mapProduct),
      page: data.page,
      size: data.size,
      total: data.total,
      totalPages: data.totalPages,
    }
  },
}
