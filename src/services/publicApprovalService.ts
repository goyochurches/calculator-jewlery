// Public (unauthenticated) approval flow service. The token in the URL is
// the access check — there's no JWT to send, so we use raw fetch instead of
// the shared apiClient (which would redirect to /login on 401).

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface ApprovalStoneDetail {
  id: number | null
  role: 'MAIN' | 'SIDE' | 'MELEE' | null
  stoneTypeLabel: string | null
  sizeLabel: string | null
  sizeKey: string | null
  carats: number | null
  amount: number | null
  setterLabel: string | null
  setterFee: number | null
  shape: string | null
  color: string | null
  labReport: string | null
  comments: string | null
  stoneCost: number
  settingLabor: number
  subtotal: number
  hasManualPrice: boolean
}

export interface ApprovalCustomerStoneDetail {
  id: number | null
  gemstoneName: string | null
  setterLabel: string | null
  setterFee: number | null
  sizeText: string | null
  quantity: number | null
  photo: string | null
  comments: string | null
  lineFee: number
}

export interface ApprovalAttachmentDetail {
  id: number | null
  photo: string | null
  caption: string | null
  createdAt: string | null
}

export interface ApprovalDetails {
  quoteId: number
  title: string
  clientName: string | null
  createdByName: string | null
  createdAt: string | null
  jewelryTypeLabel: string | null

  internalCost: number
  customerPrice: number
  customerPriceBeforeDiscount: number
  discountAmount: number
  discountPercent: number
  markupMultiplier: number

  metalLabel: string | null
  weightGrams: number | null
  ringWidth: number | null
  fingerSize: number | null
  ringLaborLabel: string | null
  ringLaborFee: number | null
  cadDesignLabel: string | null
  cadDesignFee: number | null
  laborHours: number | null
  hourlyRate: number | null
  extraCosts: number | null
  engraving: boolean | null
  engravingFee: number

  photo: string | null
  internalNotes: string | null
  attachments: ApprovalAttachmentDetail[]

  stones: ApprovalStoneDetail[]
  customerStones: ApprovalCustomerStoneDetail[]
  stonesSubtotalCost: number
  stonesSubtotalLabor: number
  customerStonesSubtotalFee: number
  stonesTotalAmount: number
  stonesTotalCarats: number

  token: string
  expiresAt: string
  used: boolean
  actionTaken: 'APPROVED' | 'REJECTED' | null
  /** Free-text reason set when the admin rejects. Null on approval or
   *  on rejections done before the feature existed. */
  rejectionReason: string | null
}

export class ApprovalNotFoundError extends Error {
  constructor() { super('Approval link not found') }
}
export class ApprovalExpiredError extends Error {
  constructor() { super('Approval link has expired') }
}
/** 409 Conflict — the token was already used. Body still carries the prior
 *  decision so the page can tell the admin "this was approved on …". */
export class ApprovalAlreadyUsedError extends Error {
  details: ApprovalDetails
  constructor(details: ApprovalDetails) {
    super('Approval link already used')
    this.details = details
  }
}

async function parseOrThrow(res: Response): Promise<ApprovalDetails> {
  if (res.status === 404) throw new ApprovalNotFoundError()
  if (res.status === 410) throw new ApprovalExpiredError()
  if (res.status === 409) {
    const body = (await res.json()) as ApprovalDetails
    throw new ApprovalAlreadyUsedError(body)
  }
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)
  return res.json() as Promise<ApprovalDetails>
}

export const publicApprovalService = {
  async getByToken(token: string): Promise<ApprovalDetails> {
    const res = await fetch(`${BASE_URL}/api/public/approve/${encodeURIComponent(token)}`)
    return parseOrThrow(res)
  },
  async approve(token: string): Promise<ApprovalDetails> {
    const res = await fetch(`${BASE_URL}/api/public/approve/${encodeURIComponent(token)}/approve`, { method: 'POST' })
    return parseOrThrow(res)
  },
  async reject(token: string, reason?: string): Promise<ApprovalDetails> {
    const res = await fetch(`${BASE_URL}/api/public/approve/${encodeURIComponent(token)}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {}),
    })
    return parseOrThrow(res)
  },
}
