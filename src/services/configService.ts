import { api } from '@/api/apiClient'

export type StoneType = 'NATURAL' | 'LAB'

export interface DiamondSizeConfig {
  id: number
  stoneType: StoneType
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

export interface SetterConfig {
  id: number
  typeKey: string
  label: string
  fee: number
  sortOrder: number
}

export const configService = {
  getDiamondSizes: (): Promise<DiamondSizeConfig[]> =>
    api.get('/api/config/diamond-sizes'),

  updateDiamondSize: (id: number, update: { basePrice: number; label?: string }): Promise<DiamondSizeConfig> =>
    api.put(`/api/config/diamond-sizes/${id}`, update),

  createDiamondSize: (input: Omit<DiamondSizeConfig, 'id'>): Promise<DiamondSizeConfig> =>
    api.post('/api/config/diamond-sizes', input),

  deleteDiamondSize: (id: number): Promise<void> =>
    api.delete(`/api/config/diamond-sizes/${id}`),

  getFingerSizes: (): Promise<FingerSizeConfig[]> =>
    api.get('/api/config/finger-sizes'),

  updateFingerSize: (id: number, additionalFee: number): Promise<FingerSizeConfig> =>
    api.put(`/api/config/finger-sizes/${id}`, { additionalFee }),

  createFingerSize: (input: Omit<FingerSizeConfig, 'id'>): Promise<FingerSizeConfig> =>
    api.post('/api/config/finger-sizes', input),

  deleteFingerSize: (id: number): Promise<void> =>
    api.delete(`/api/config/finger-sizes/${id}`),

  getCadTiers: (): Promise<PricingTier[]> =>
    api.get('/api/config/pricing-tiers/cad'),

  getRingLaborTiers: (): Promise<PricingTier[]> =>
    api.get('/api/config/pricing-tiers/ring-labor'),

  updatePricingTier: (id: number, update: { fee: number; label: string }): Promise<PricingTier> =>
    api.put(`/api/config/pricing-tiers/${id}`, update),

  createPricingTier: (input: Omit<PricingTier, 'id' | 'sortOrder'> & { sortOrder?: number }): Promise<PricingTier> =>
    api.post('/api/config/pricing-tiers', input),

  deletePricingTier: (id: number): Promise<void> =>
    api.delete(`/api/config/pricing-tiers/${id}`),

  getSetters: (): Promise<SetterConfig[]> =>
    api.get('/api/config/setters'),

  updateSetter: (id: number, update: { label: string; fee: number; sortOrder?: number }): Promise<SetterConfig> =>
    api.put(`/api/config/setters/${id}`, update),

  createSetter: (input: Omit<SetterConfig, 'id' | 'sortOrder'> & { sortOrder?: number }): Promise<SetterConfig> =>
    api.post('/api/config/setters', input),

  deleteSetter: (id: number): Promise<void> =>
    api.delete(`/api/config/setters/${id}`),
}
