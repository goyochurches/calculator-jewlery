import type { AppConfig, JewelryMetalOption, QuoteComplexity } from '../types'

export const CONFIG: AppConfig = {
  apiUrl: import.meta.env.VITE_API_URL || 'https://api.example.com',
  refreshInterval: 60000, // 1 minute - adjust when you connect the real API
  currency: 'USD',
}

export const METAL_SYMBOLS = {
  GOLD: 'XAU',
  SILVER: 'XAG',
} as const

export const SIGNAL_LABELS = {
  buy: 'Buy',
  sell: 'Sell',
  hold: 'Hold',
} as const

export const ROLE_LABELS = {
  admin: 'Administrator',
  manager: 'Store Manager',
  jeweler: 'Jeweler',
  sales: 'Sales',
  viewer: 'Viewer',
} as const

export const COMPLEXITY_LABELS: Record<QuoteComplexity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const COMPLEXITY_FEES: Record<QuoteComplexity, number> = {
  low: 35,
  medium: 85,
  high: 160,
}

export const TROY_OUNCE_TO_GRAMS = 31.1035

export const FINGER_SIZE_FEES = {
  3: 0,
  4: 6,
  5: 12,
  6: 18,
  7: 24,
  8: 32,
  9: 40,
  10: 50,
  11: 62,
  12: 76,
  13: 92,
  14: 110,
} as const

export const JEWELRY_METAL_OPTIONS: Record<
  JewelryMetalOption,
  {
    label: string
    group: '14K Gold' | '18K Gold' | 'Platinum' | 'Silver'
    pricePerGram: number
  }
> = {
  'gold-14k-white':  { label: '14K White Gold',  group: '14K Gold', pricePerGram: 105 },
  'gold-14k-yellow': { label: '14K Yellow Gold', group: '14K Gold', pricePerGram: 105 },
  'gold-14k-rose':   { label: '14K Rose Gold',   group: '14K Gold', pricePerGram: 105 },
  'gold-18k-white':  { label: '18K White Gold',  group: '18K Gold', pricePerGram: 130 },
  'gold-18k-yellow': { label: '18K Yellow Gold', group: '18K Gold', pricePerGram: 130 },
  'gold-18k-rose':   { label: '18K Rose Gold',   group: '18K Gold', pricePerGram: 130 },
  platinum:          { label: 'Platinum',        group: 'Platinum', pricePerGram: 75  },
  // Legacy keys mapped to current pricing so historical quotes still render
  'gold-14k':        { label: '14K Gold',        group: '14K Gold', pricePerGram: 105 },
  'gold-18k':        { label: '18K Gold',        group: '18K Gold', pricePerGram: 130 },
  silver:            { label: 'Silver',          group: 'Silver',   pricePerGram: 0   },
}

export const RING_LABOR_OPTIONS = {
  small: { label: 'Small Ring', fee: 90 },
  medium: { label: 'Medium Ring', fee: 150 },
  big: { label: 'Big Ring', fee: 230 },
  premium: { label: 'Premium Ring', fee: 340 },
} as const

export const CAD_DESIGN_OPTIONS = {
  small: { label: 'Small Piece', fee: 65 },
  medium: { label: 'Medium Piece', fee: 110 },
  big: { label: 'Big Piece', fee: 170 },
  premium: { label: 'Premium Piece', fee: 260 },
} as const

// Grunberger es el único proveedor de diamantes. El usuario sólo elige si
// son naturales o de laboratorio (lab-grown), ambos del mismo proveedor.
export const DIAMOND_TYPE_OPTIONS = {
  natural: { label: 'Grunberger Natural', multiplier: 1 },
  'lab-grown': { label: 'Grunberger Lab', multiplier: 0.58 },
} as const

export const DIAMOND_SUPPLIER = 'Grunberger'

export const DIAMOND_SIZE_OPTIONS = {
  '0.01-0.05': { label: '0.01 - 0.05', basePrice: 45 },
  '0.05-0.10': { label: '0.05 - 0.10', basePrice: 95 },
  '0.10-0.15': { label: '0.10 - 0.15', basePrice: 160 },
  '0.15-0.20': { label: '0.15 - 0.20', basePrice: 240 },
  '0.25-0.50': { label: '0.25 - 0.50', basePrice: 420 },
  '0.50-1.00': { label: '0.50 - 1.00', basePrice: 890 },
} as const

export const SETTING_LABOR_MASTER = {
  '0.01-0.05': { feePerStone: 8, minutesPerStone: 6 },
  '0.05-0.10': { feePerStone: 14, minutesPerStone: 9 },
  '0.10-0.15': { feePerStone: 20, minutesPerStone: 12 },
  '0.15-0.20': { feePerStone: 28, minutesPerStone: 16 },
  '0.25-0.50': { feePerStone: 42, minutesPerStone: 24 },
  '0.50-1.00': { feePerStone: 68, minutesPerStone: 36 },
} as const
