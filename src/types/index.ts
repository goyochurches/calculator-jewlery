export interface MetalPrice {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
}

export interface HistorialEntry {
  id: string
  date: string
  metal: 'gold' | 'silver'
  price: number
  change: number
  changePercent: number
  signal: 'buy' | 'sell' | 'hold'
}

export interface ChartDataPoint {
  label: string
  gold: number
  silver: number
}

export interface Usuario {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'jeweler' | 'sales' | 'viewer'
  status: 'active' | 'inactive'
  avatar: string
  /** Free-form biography shown internally and on the public quote link. */
  bio?: string | null
  /** Base64 / URL of the user's profile photo (separate from the
   *  emoji-style `avatar` initial). */
  photo?: string | null
}

export interface AppConfig {
  apiUrl: string
  refreshInterval: number
  currency: string
}

export type QuoteComplexity = 'low' | 'medium' | 'high'

export type JewelryMetalOption =
  | 'gold-14k-white'
  | 'gold-14k-yellow'
  | 'gold-14k-rose'
  | 'gold-18k-white'
  | 'gold-18k-yellow'
  | 'gold-18k-rose'
  | 'platinum'
  // legacy values kept so historical quotes still load
  | 'gold-14k'
  | 'gold-18k'
  | 'silver'

export type QuoteStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export type StoneRole = 'MAIN' | 'SIDE' | 'MELEE'

export interface QuoteStone {
  id?: number | null
  role: StoneRole
  stoneType: 'natural' | 'lab-grown'
  sizeKey: string
  carats: number
  setterType: string
  labReport?: string | null
  sortOrder?: number | null
  shape?: string | null
  color?: string | null
  manualPrice?: number | null
  comments?: string | null
}

export interface QuoteCustomerStone {
  id?: number | null
  gemstoneId?: number | null
  gemstoneName?: string | null
  setterType: string
  sizeText?: string | null
  quantity: number
  photo?: string | null
  sortOrder?: number | null
  comments?: string | null
}

export interface SavedQuote {
  id: string
  title: string
  clientName: string
  createdBy: string
  createdAt: string
  status: QuoteStatus
  metal: JewelryMetalOption
  ringLabor: string
  cadDesign: string
  diamondAmount: number
  diamondCarats?: number | null
  diamondType: 'natural' | 'lab-grown' | 'grunberger'
  diamondSize: string
  stones?: QuoteStone[]
  customerStones?: QuoteCustomerStone[]
  weightGrams: number
  ringWidth: number
  fingerSize: number
  laborHours: number
  hourlyRate: number
  extraCosts: number
  total: number
  /** Retail markup applied on top of `total` (cost) when showing the customer
   *  price. Per-quote so each job can override the default 2.5x. */
  markupMultiplier?: number | null
  photo?: string | null
  engraving?: boolean | null
  setterType?: string | null
  jewelryType?: string | null
  client?: Client | null
  clientId?: number | null
  publicToken?: string | null
  publicTokenExpiresAt?: string | null
  lastOpenedAt?: string | null
  openCount?: number | null
}

export interface GemstonePrice {
  id: string
  name: string
  category: 'diamond' | 'precious' | 'semi-precious' | 'organic'
  quality: 'standard' | 'premium' | 'collector'
  unit: 'per ct' | 'per piece'
  price: number
  color: string
  note: string
}

export interface Client {
  id: number
  name: string
  surname: string | null
  phone: string | null
  email: string | null
  createdAt?: string | null
}
