// Public (unauthenticated) approval flow service. The token in the URL is
// the access check — there's no JWT to send, so we use raw fetch instead of
// the shared apiClient (which would redirect to /login on 401).

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'

export interface ApprovalDetails {
  quoteId: number
  title: string
  clientName: string | null
  createdByName: string | null
  createdAt: string | null
  internalCost: number
  customerPrice: number
  discountPercent: number
  markupMultiplier: number
  engraving: boolean | null
  token: string
  expiresAt: string
  used: boolean
  actionTaken: 'APPROVED' | 'REJECTED' | null
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
  async reject(token: string): Promise<ApprovalDetails> {
    const res = await fetch(`${BASE_URL}/api/public/approve/${encodeURIComponent(token)}/reject`, { method: 'POST' })
    return parseOrThrow(res)
  },
}
