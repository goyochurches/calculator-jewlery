import { api } from '@/api/apiClient'

export interface DiamondSizeConfig {
  id: number
  sizeKey: string
  label: string
  basePrice: number
}

export interface FingerSizeConfig {
  id: number
  size: number
  additionalFee: number
}

export interface PricingTier {
  id: number
  tierType: 'CAD_DESIGN' | 'RING_LABOR'
  tierKey: string
  label: string
  fee: number
  sortOrder: number
}

export const configService = {
  getDiamondSizes: (): Promise<DiamondSizeConfig[]> =>
    api.get('/api/config/diamond-sizes'),

  updateDiamondSize: (id: number, basePrice: number): Promise<DiamondSizeConfig> =>
    api.put(`/api/config/diamond-sizes/${id}`, { basePrice }),

  getFingerSizes: (): Promise<FingerSizeConfig[]> =>
    api.get('/api/config/finger-sizes'),

  updateFingerSize: (id: number, additionalFee: number): Promise<FingerSizeConfig> =>
    api.put(`/api/config/finger-sizes/${id}`, { additionalFee }),

  getCadTiers: (): Promise<PricingTier[]> =>
    api.get('/api/config/pricing-tiers/cad'),

  getRingLaborTiers: (): Promise<PricingTier[]> =>
    api.get('/api/config/pricing-tiers/ring-labor'),

  updatePricingTier: (id: number, update: { fee: number; label: string }): Promise<PricingTier> =>
    api.put(`/api/config/pricing-tiers/${id}`, update),
}
