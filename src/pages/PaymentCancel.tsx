import { Card, CardContent } from '@/components/ui/card'
import { XCircle } from 'lucide-react'

/**
 * Landing page when the customer cancels the Stripe Checkout flow. No
 * verification needed — Stripe never charged the card. Simple message.
 */
export function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/40 px-4 py-12">
      <div className="mx-auto max-w-md">
        <Card className="rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
          <CardContent className="space-y-4 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <XCircle className="h-7 w-7" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                Payment canceled
              </p>
              <h1 className="mt-2 font-serif text-2xl font-semibold text-slate-900">
                No charge was made
              </h1>
            </div>
            <p className="text-sm text-slate-500">
              You closed the checkout before completing the payment. You can
              try again any time by opening the payment link the jeweler
              sent you.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default PaymentCancelPage
