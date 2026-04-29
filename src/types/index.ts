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
  diamondType: 'natural' | 'lab-grown' | 'grunberger'
  diamondSize: string
  weightGrams: number
  ringWidth: number
  fingerSize: number
  laborHours: number
  hourlyRate: number
  extraCosts: number
  total: number
  photo?: string | null
  engraving?: boolean | null
  setterType?: string | null
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
