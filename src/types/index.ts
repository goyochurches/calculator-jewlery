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

export type JewelryMetalOption = 'gold-14k' | 'gold-18k' | 'platinum' | 'silver'

export type QuoteStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface SavedQuote {
  id: string
  title: string
  clientName: string
  createdBy: string
  createdAt: string
  status: QuoteStatus
  metal: JewelryMetalOption
  ringLabor: 'small' | 'medium' | 'big' | 'premium'
  cadDesign: 'small' | 'medium' | 'big' | 'premium'
  diamondAmount: number
  diamondType: 'natural' | 'lab-grown' | 'grunberger'
  diamondSize: '0.01-0.05' | '0.05-0.10' | '0.10-0.15' | '0.15-0.20' | '0.25-0.50' | '0.50-1.00'
  weightGrams: number
  ringWidth: number
  fingerSize: number
  laborHours: number
  hourlyRate: number
  extraCosts: number
  total: number
  photo?: string | null
  engraving?: boolean | null
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
