import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  publicApprovalService,
  ApprovalAlreadyUsedError,
  ApprovalExpiredError,
  ApprovalNotFoundError,
  type ApprovalDetails,
} from '@/services/publicApprovalService'
import { AlertCircle, Check, Clock, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; details: ApprovalDetails }
  | { kind: 'submitting'; details: ApprovalDetails }
  | { kind: 'done'; details: ApprovalDetails }            // also reached when token was already used
  | { kind: 'expired' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }

export function ApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<PageState>({ kind: 'loading' })

  useEffect(() => {
    if (!token) { setState({ kind: 'notFound' }); return }
    publicApprovalService.getByToken(token)
      .then((details) => setState({ kind: 'ready', details }))
      .catch((err) => {
        if (err instanceof ApprovalNotFoundError)   setState({ kind: 'notFound' })
        else if (err instanceof ApprovalExpiredError) setState({ kind: 'expired' })
        else if (err instanceof ApprovalAlreadyUsedError) setState({ kind: 'done', details: err.details })
        else setState({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to load' })
      })
  }, [token])

  const handle = async (action: 'approve' | 'reject') => {
    if (state.kind !== 'ready') return
    setState({ kind: 'submitting', details: state.details })
    try {
      const details = action === 'approve'
        ? await publicApprovalService.approve(token!)
        : await publicApprovalService.reject(token!)
      setState({ kind: 'done', details })
    } catch (err) {
      if (err instanceof ApprovalAlreadyUsedError) setState({ kind: 'done', details: err.details })
      else if (err instanceof ApprovalExpiredError) setState({ kind: 'expired' })
      else setState({ kind: 'error', message: err instanceof Error ? err.message : 'Action failed' })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-violet-50/30 px-4 py-8">
      <div className="mx-auto max-w-md">
        {state.kind === 'loading'  && <LoadingState />}
        {state.kind === 'expired'  && <MessageCard kind="warn"  title="Link expired"     body="This approval link has expired. Create a new revision or contact the team to issue a fresh link." />}
        {state.kind === 'notFound' && <MessageCard kind="warn"  title="Link not found"   body="This approval link is invalid or has been removed." />}
        {state.kind === 'error'    && <MessageCard kind="error" title="Something went wrong" body={state.message} />}
        {(state.kind === 'ready' || state.kind === 'submitting') && (
          <ApprovalCard
            details={state.details}
            busy={state.kind === 'submitting'}
            onApprove={() => handle('approve')}
            onReject={() => handle('reject')}
          />
        )}
        {state.kind === 'done' && <DoneCard details={state.details} />}
      </div>
    </div>
  )
}

function ApprovalCard({ details, busy, onApprove, onReject }: {
  details: ApprovalDetails
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const expires = new Date(details.expiresAt)
  return (
    <Card className="rounded-[28px] border border-white/80 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Pending approval</p>
            <h1 className="text-lg font-semibold text-slate-900">Review this quote</h1>
          </div>
        </div>

        <div className="space-y-3">
          <Row label="Quote">{details.title} <span className="text-slate-400">· #{details.quoteId}</span></Row>
          {details.clientName    && <Row label="Client">{details.clientName}</Row>}
          {details.createdByName && <Row label="Created by">{details.createdByName}</Row>}
          {details.createdAt     && <Row label="Created">{details.createdAt}</Row>}
        </div>

        <div className="rounded-2xl bg-slate-900 p-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">Customer price</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">
            ${details.customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
            <span>Cost <strong className="text-white tabular-nums">${details.internalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></span>
            <span>Markup <strong className="text-white">{details.markupMultiplier}×</strong></span>
            {details.discountPercent > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-200">
                −{details.discountPercent}% discount
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Link expires {expires.toLocaleDateString()} at {expires.toLocaleTimeString()}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
          >
            <Check className="h-4 w-4" /> Approve
          </button>
        </div>
        {busy && <p className="text-center text-xs text-slate-400">Saving decision…</p>}
      </CardContent>
    </Card>
  )
}

function DoneCard({ details }: { details: ApprovalDetails }) {
  const approved = details.actionTaken === 'APPROVED'
  return (
    <Card className={`rounded-[28px] border ${approved ? 'border-emerald-200' : 'border-rose-200'} bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]`}>
      <CardContent className="p-6 space-y-4 text-center">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${approved ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {approved ? <Check className="h-7 w-7" /> : <X className="h-7 w-7" />}
        </div>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${approved ? 'text-emerald-700' : 'text-rose-700'}`}>
            Quote {approved ? 'approved' : 'rejected'}
          </p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">{details.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">#{details.quoteId} · {details.clientName ?? '—'}</p>
        </div>
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
          This link is single-use and can't be opened again.
        </p>
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="truncate text-right text-sm font-medium text-slate-900">{children}</span>
    </div>
  )
}

function MessageCard({ kind, title, body }: { kind: 'warn' | 'error'; title: string; body: string }) {
  const tone = kind === 'warn' ? 'amber' : 'rose'
  return (
    <Card className={`rounded-[28px] border border-${tone}-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]`}>
      <CardContent className="p-6 space-y-3 text-center">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-${tone}-100 text-${tone}-700`}>
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{body}</p>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <Card className="rounded-[28px] border border-white/80 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
      <CardContent className="p-6 space-y-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-2xl" />
      </CardContent>
    </Card>
  )
}
