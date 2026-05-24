import { Card, CardContent } from '@/components/ui/card'
import { fetchPublicInstallment, type PaymentInstallment } from '@/services/paymentPlanService'
import { Check, Clock, Loader2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

type Phase =
  | { kind: 'loading' }
  | { kind: 'paid'; installment: PaymentInstallment }
  | { kind: 'pending'; attempts: number }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }

const MAX_ATTEMPTS = 6     // polls up to ~12s waiting for the webhook
const POLL_INTERVAL_MS = 2000

/**
 * Customer-facing landing page after Stripe redirects from a successful
 * Checkout. Reads ?installment=<id>&session_id=<cs_...> from the URL,
 * verifies with the backend (which in turn verifies with Stripe), and
 * shows the right status.
 *
 * If the installment is still PENDING when we arrive (webhook latency),
 * polls a few times before falling back to a "still processing" message.
 */
export function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const installmentId = params.get('installment')
  const sessionId = params.get('session_id')
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!installmentId) { setPhase({ kind: 'notFound' }); return }

    let cancelled = false
    let attempt = 0

    const poll = async () => {
      attempt++
      try {
        const inst = await fetchPublicInstallment(Number(installmentId), sessionId)
        if (cancelled) return
        if (inst.status === 'PAID') {
          setPhase({ kind: 'paid', installment: inst })
          return
        }
        if (attempt >= MAX_ATTEMPTS) {
          setPhase({ kind: 'pending', attempts: attempt })
          return
        }
        setPhase({ kind: 'pending', attempts: attempt })
        timerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        if (cancelled) return
        if (err instanceof Error && err.message.includes('404')) {
          setPhase({ kind: 'notFound' })
        } else {
          setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to verify payment' })
        }
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    }
  }, [installmentId, sessionId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-amber-50/40 px-4 py-12">
      <div className="mx-auto max-w-md">
        {phase.kind === 'loading'  && <LoadingState />}
        {phase.kind === 'paid'     && <PaidState installment={phase.installment} />}
        {phase.kind === 'pending'  && <PendingState />}
        {phase.kind === 'notFound' && <NotFoundState />}
        {phase.kind === 'error'    && <ErrorState message={phase.message} />}
      </div>
    </div>
  )
}

function PaidState({ installment }: { installment: PaymentInstallment }) {
  return (
    <Card className="rounded-[28px] border border-emerald-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <CardContent className="space-y-5 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-8 w-8" strokeWidth={3} />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700">
            Payment confirmed
          </p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-slate-900">
            Thank you for your payment
          </h1>
        </div>
        <div className="rounded-2xl bg-emerald-50 px-6 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
            Amount received
          </p>
          <p className="mt-1 font-serif text-3xl font-bold tabular-nums text-slate-900">
            ${installment.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-xs text-emerald-700/80">
            {installment.currency.toUpperCase()} · Installment {installment.sortOrder + 1}
          </p>
        </div>
        <p className="text-sm text-slate-500">
          A confirmation has been sent to the jeweler. You'll receive an
          email receipt from Stripe shortly.
        </p>
      </CardContent>
    </Card>
  )
}

function PendingState() {
  return (
    <Card className="rounded-[28px] border border-amber-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <CardContent className="space-y-5 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Clock className="h-7 w-7" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700">
            Processing
          </p>
          <h1 className="mt-2 font-serif text-2xl font-semibold text-slate-900">
            Your payment is being verified
          </h1>
        </div>
        <p className="text-sm text-slate-500">
          Stripe has accepted your payment. We're waiting for the final
          confirmation — this usually takes a few seconds. You can safely
          close this tab; the jeweler will be notified automatically.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
        >
          Check again
        </button>
      </CardContent>
    </Card>
  )
}

function NotFoundState() {
  return (
    <Card className="rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <CardContent className="space-y-3 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <XCircle className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Installment not found</h1>
        <p className="text-sm text-slate-500">
          We couldn't locate this payment. If you've already paid, please
          contact the jeweler directly so they can verify the transaction.
        </p>
      </CardContent>
    </Card>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="rounded-[28px] border border-rose-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <CardContent className="space-y-3 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-700">
          <XCircle className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="text-sm text-slate-500">{message}</p>
        <p className="text-xs text-slate-400">
          Your card may have been charged. Please contact the jeweler to
          confirm before retrying.
        </p>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <Card className="rounded-[28px] border border-white/80 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <CardContent className="space-y-3 p-10 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
        <p className="text-sm font-semibold text-slate-700">Verifying your payment…</p>
        <p className="text-xs text-slate-400">This should only take a moment.</p>
      </CardContent>
    </Card>
  )
}

export default PaymentSuccessPage
