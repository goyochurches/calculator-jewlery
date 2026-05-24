import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  publicApprovalService,
  ApprovalAlreadyUsedError,
  ApprovalExpiredError,
  ApprovalNotFoundError,
  type ApprovalCustomerStoneDetail,
  type ApprovalDetails,
  type ApprovalStoneDetail,
} from '@/services/publicApprovalService'
import { AlertCircle, Check, Clock, FileText, Image as ImageIcon, ShieldCheck, X } from 'lucide-react'
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
      <div className="mx-auto max-w-2xl">
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

// ─── Money + formatting helpers ───────────────────────────────────────────
const money = (n: number | null | undefined) =>
  `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`

const ROLE_THEME: Record<'MAIN' | 'SIDE' | 'MELEE', { label: string; dot: string; ring: string; tint: string; chip: string }> = {
  MAIN:  { label: 'Main',  dot: 'bg-amber-500',   ring: 'border-amber-200',   tint: 'bg-amber-50/40',   chip: 'bg-amber-100 text-amber-800' },
  SIDE:  { label: 'Side',  dot: 'bg-sky-500',     ring: 'border-sky-200',     tint: 'bg-sky-50/40',     chip: 'bg-sky-100 text-sky-800' },
  MELEE: { label: 'Melee', dot: 'bg-emerald-500', ring: 'border-emerald-200', tint: 'bg-emerald-50/40', chip: 'bg-emerald-100 text-emerald-800' },
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
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Pending approval</p>
            <h1 className="text-lg font-semibold text-slate-900">Review this quote</h1>
          </div>
        </header>

        <QuoteHeader details={details} />
        <PriceBlock details={details} />
        <ReferencePhoto src={details.photo} />
        <SpecBlock details={details} />
        <StonesBlock stones={details.stones} totalAmount={details.stonesTotalAmount} totalCarats={details.stonesTotalCarats} />
        <CustomerStonesBlock stones={details.customerStones} />
        <InternalNotesBlock notes={details.internalNotes} />
        <AttachmentsBlock attachments={details.attachments} />
        <CostBreakdownBlock details={details} />

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Link expires {expires.toLocaleDateString()} at {expires.toLocaleTimeString()}
        </div>

        <div className="sticky bottom-0 grid grid-cols-2 gap-3 bg-white pt-2">
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

// ─── Header (title + meta) ────────────────────────────────────────────────
function QuoteHeader({ details }: { details: ApprovalDetails }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{details.title}</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Quote #{details.quoteId}
          {details.createdAt ? <> · {details.createdAt}</> : null}
          {details.jewelryTypeLabel ? <> · <span className="font-semibold text-slate-600">{details.jewelryTypeLabel}</span></> : null}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {details.clientName && (
          <Cell label="Client" value={details.clientName} />
        )}
        {details.createdByName && (
          <Cell label="Created by" value={details.createdByName} />
        )}
      </div>
    </div>
  )
}

// ─── Big price block ──────────────────────────────────────────────────────
function PriceBlock({ details }: { details: ApprovalDetails }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5 text-white">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">Customer price</p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{money(details.customerPrice)}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
        <span>Cost <strong className="text-white tabular-nums">{money(details.internalCost)}</strong></span>
        <span>Markup <strong className="text-white">{details.markupMultiplier}×</strong></span>
        {details.discountPercent > 0 && (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-200">
            −{details.discountPercent}% (−{money(details.discountAmount)})
          </span>
        )}
      </div>
      {details.discountPercent > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          Pre-discount: {money(details.customerPriceBeforeDiscount)}
        </p>
      )}
    </div>
  )
}

// ─── Reference photo (the main piece) ─────────────────────────────────────
function ReferencePhoto({ src }: { src: string | null }) {
  const [zoomed, setZoomed] = useState(false)
  if (!src) return null
  return (
    <>
      <div>
        <SectionLabel>Reference photo</SectionLabel>
        <div
          className="relative cursor-zoom-in overflow-hidden rounded-2xl border border-slate-100"
          onClick={() => setZoomed(true)}
        >
          <img src={src} alt="Reference" className="max-h-56 w-full object-cover transition duration-300 hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          <span className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            Tap to enlarge
          </span>
        </div>
      </div>
      {zoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setZoomed(false)}>
          <button className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20" onClick={() => setZoomed(false)}>
            <X className="h-5 w-5" />
          </button>
          <img src={src} alt="Reference" className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}

// ─── Spec block ───────────────────────────────────────────────────────────
function SpecBlock({ details }: { details: ApprovalDetails }) {
  const rows: { label: string; value: string }[] = []
  if (details.metalLabel) rows.push({ label: 'Metal', value: details.metalLabel })
  if (details.weightGrams != null) rows.push({ label: 'Weight', value: `${details.weightGrams} g` })
  if (details.ringWidth != null) rows.push({ label: 'Ring width', value: `${details.ringWidth} mm` })
  if (details.fingerSize != null) rows.push({ label: 'Finger size', value: String(details.fingerSize) })
  if (details.ringLaborLabel) {
    rows.push({
      label: 'CAD & Jeweler’s time',
      value: details.ringLaborFee != null ? `${details.ringLaborLabel} — ${money(details.ringLaborFee)}` : details.ringLaborLabel,
    })
  }
  if (details.cadDesignLabel && details.cadDesignLabel !== details.ringLaborLabel) {
    rows.push({
      label: 'CAD design',
      value: details.cadDesignFee != null ? `${details.cadDesignLabel} — ${money(details.cadDesignFee)}` : details.cadDesignLabel,
    })
  }
  if (details.laborHours != null && details.laborHours > 0) {
    const hourly = details.hourlyRate != null && details.hourlyRate > 0 ? ` × ${money(details.hourlyRate)}/h` : ''
    rows.push({ label: 'Labor', value: `${details.laborHours} h${hourly}` })
  }
  rows.push({ label: 'Engraving', value: details.engraving ? `Yes — ${money(details.engravingFee)}` : 'No' })

  if (rows.length === 0) return null
  return (
    <div>
      <SectionLabel>Spec</SectionLabel>
      <div className="space-y-2">
        {rows.map((r) => <LineItem key={r.label} label={r.label} value={r.value} />)}
      </div>
    </div>
  )
}

// ─── Stones (in-house) ────────────────────────────────────────────────────
function StonesBlock({ stones, totalAmount, totalCarats }: {
  stones: ApprovalStoneDetail[]
  totalAmount: number
  totalCarats: number
}) {
  if (!stones || stones.length === 0) return null
  const byRole: Record<'MAIN' | 'SIDE' | 'MELEE', ApprovalStoneDetail[]> = {
    MAIN: stones.filter((s) => s.role === 'MAIN'),
    SIDE: stones.filter((s) => s.role === 'SIDE'),
    MELEE: stones.filter((s) => s.role === 'MELEE'),
  }
  return (
    <div>
      <SectionLabel>
        Stone setting
        <span className="ml-2 text-[10px] font-medium normal-case tracking-normal text-slate-400">
          {totalAmount} stone{totalAmount === 1 ? '' : 's'} · {Math.round(totalCarats * 10000) / 10000} ct total
        </span>
      </SectionLabel>
      <div className="space-y-4">
        {(['MAIN', 'SIDE', 'MELEE'] as const).map((role) => {
          const items = byRole[role]
          if (items.length === 0) return null
          const theme = ROLE_THEME[role]
          const section = items.reduce(
            (acc, s) => {
              acc.cost   += s.stoneCost
              acc.labor  += s.settingLabor
              acc.carats += s.carats ?? 0
              acc.amount += s.amount ?? 0
              return acc
            },
            { cost: 0, labor: 0, carats: 0, amount: 0 },
          )
          return (
            <div key={role} className="space-y-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${theme.chip}`}>
                    <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {theme.label} stones <span className="ml-1 text-xs font-medium text-slate-400">· {items.length}</span>
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {section.amount} stone{section.amount === 1 ? '' : 's'} · {Math.round(section.carats * 10000) / 10000} ct ·
                  {' '}<strong className="text-slate-900">{money(section.cost + section.labor)}</strong>
                </span>
              </div>
              {items.map((s, idx) => <StoneRow key={s.id ?? idx} stone={s} role={role} index={idx} />)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StoneRow({ stone, role, index }: { stone: ApprovalStoneDetail; role: 'MAIN' | 'SIDE' | 'MELEE'; index: number }) {
  const theme = ROLE_THEME[role]
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${theme.ring} ${theme.tint} px-4 py-3 text-sm shadow-sm`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.dot}`} />
      <div className="space-y-3 pl-2">
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
            {theme.label} stone #{index + 1}
          </span>
          <span className="text-sm font-semibold tabular-nums text-slate-900">{money(stone.subtotal)}</span>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <DefField label="Type">{stone.stoneTypeLabel || '—'}</DefField>
          <DefField label="Size">{stone.sizeLabel || stone.sizeKey || '—'}</DefField>
          <DefField label="Shape">{stone.shape || '—'}</DefField>
          <DefField label="Color">{stone.color || '—'}</DefField>
          <DefField label="Carats">{stone.carats ?? 0} ct</DefField>
          <DefField label="Amount">{stone.amount ?? 0} stone{(stone.amount ?? 0) === 1 ? '' : 's'}</DefField>
          <div className="col-span-2">
            <DefField label="Type of setting">
              {stone.setterLabel || '—'}
              {stone.setterFee != null && stone.setterFee > 0 ? ` — ${money(stone.setterFee)}/stone` : ''}
            </DefField>
          </div>
          {role !== 'MELEE' && (
            <div className="col-span-2">
              <DefField label="Lab report">{stone.labReport ? <span className="font-mono">{stone.labReport}</span> : <span className="text-slate-400">— not provided</span>}</DefField>
            </div>
          )}
          {stone.comments && (
            <div className="col-span-2">
              <DefField label="Additional comments"><span className="whitespace-pre-wrap">{stone.comments}</span></DefField>
            </div>
          )}
        </dl>

        <div className="grid grid-cols-2 gap-2 border-t border-white/70 pt-2 text-xs">
          <Pill label={stone.hasManualPrice ? 'Stone cost (custom)' : 'Stone cost'} value={money(stone.stoneCost)} />
          <Pill label="Setting labor" value={money(stone.settingLabor)} />
        </div>
      </div>
    </div>
  )
}

// ─── Customer-supplied stones ─────────────────────────────────────────────
function CustomerStonesBlock({ stones }: { stones: ApprovalCustomerStoneDetail[] }) {
  if (!stones || stones.length === 0) return null
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-1 w-6 rounded-full bg-gradient-to-r from-rose-300 to-pink-600" />
        <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-700">
          Customer stones · {stones.length}
        </p>
      </div>
      <div className="space-y-3">
        {stones.map((cs, idx) => (
          <div key={cs.id ?? idx} className="relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/70 via-white to-pink-50/40 px-4 py-3 text-sm shadow-sm">
            <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-rose-300 via-rose-500 to-pink-600" />
            <div className="space-y-3 pl-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900 ring-1 ring-rose-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Customer stone #{idx + 1}
                </span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{money(cs.lineFee)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div className="col-span-2"><DefField label="Type of stone">{cs.gemstoneName || '—'}</DefField></div>
                <DefField label="Type of setting">{cs.setterLabel || '—'}</DefField>
                <DefField label="Quantity">{cs.quantity ?? 1}{cs.setterFee != null && cs.setterFee > 0 ? ` × ${money(cs.setterFee)}` : ''}</DefField>
                <div className="col-span-2"><DefField label="Size">{cs.sizeText || '—'}</DefField></div>
                {cs.comments && (
                  <div className="col-span-2"><DefField label="Additional comments"><span className="whitespace-pre-wrap">{cs.comments}</span></DefField></div>
                )}
              </dl>
              {cs.photo && (
                <div className="overflow-hidden rounded-xl border border-rose-200/60 shadow-sm">
                  <img src={cs.photo} alt={`Customer stone ${idx + 1}`} className="max-h-56 w-full object-cover" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Internal notes (admin-only, also shown here since this link is admin-facing) ─
function InternalNotesBlock({ notes }: { notes: string | null }) {
  if (!notes || notes.trim() === '') return null
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Internal notes</SectionLabel>
        <FileText className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="rounded-2xl border border-amber-100 bg-amber-50/50 px-4 py-3">
        <p className="whitespace-pre-wrap text-sm text-slate-700">{notes}</p>
      </div>
    </div>
  )
}

// ─── Internal attachments ─────────────────────────────────────────────────
function AttachmentsBlock({ attachments }: { attachments: ApprovalDetails['attachments'] }) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Internal attachments · {attachments.length}</SectionLabel>
        <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {attachments.map((a, idx) => (
          a.photo ? (
            <a key={a.id ?? idx} href={a.photo} target="_blank" rel="noopener noreferrer"
               className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
               title={a.caption ?? `Attachment ${idx + 1}`}>
              <img src={a.photo} alt={a.caption ?? `Attachment ${idx + 1}`} className="max-h-48 w-full object-cover transition group-hover:scale-[1.02]" />
              <div className="space-y-0.5 px-3 py-2">
                {a.caption && <p className="line-clamp-2 text-xs font-medium text-slate-700">{a.caption}</p>}
                {a.createdAt && <p className="text-[10px] text-slate-400">{new Date(a.createdAt).toLocaleString()}</p>}
              </div>
            </a>
          ) : null
        ))}
      </div>
    </div>
  )
}

// ─── Cost breakdown ───────────────────────────────────────────────────────
function CostBreakdownBlock({ details }: { details: ApprovalDetails }) {
  const rows: { label: string; value: string }[] = []
  if (details.stones.length > 0) {
    rows.push({
      label: `Setting supplied diamonds (${details.stonesTotalAmount} stone${details.stonesTotalAmount === 1 ? '' : 's'} · ${Math.round(details.stonesTotalCarats * 10000) / 10000} ct)`,
      value: money(details.stonesSubtotalCost + details.stonesSubtotalLabor),
    })
  }
  if (details.customerStones.length > 0) {
    rows.push({
      label: `Setting customer diamonds (${details.customerStones.length} stone${details.customerStones.length === 1 ? '' : 's'})`,
      value: money(details.customerStonesSubtotalFee),
    })
  }
  rows.push({ label: 'Hand engraving (milgrain)', value: details.engraving ? money(details.engravingFee) : '$0.00' })
  if ((details.extraCosts ?? 0) > 0) {
    rows.push({ label: 'Extra costs', value: money(details.extraCosts) })
  }
  return (
    <div>
      <SectionLabel>Cost breakdown</SectionLabel>
      <div className="space-y-2">
        {rows.map((r) => <LineItem key={r.label} label={r.label} value={r.value} />)}
        <LineItem label="Internal total" value={money(details.internalCost)} highlight />
      </div>
    </div>
  )
}

// ─── Small shared atoms ───────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">{children}</p>
}

function LineItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-2xl ${highlight ? 'bg-slate-900 text-white' : 'bg-slate-50'} px-4 py-3 text-sm`}>
      <span className={highlight ? 'text-slate-300' : 'text-slate-500'}>{label}</span>
      <span className={`font-semibold tabular-nums ${highlight ? 'text-white' : 'text-slate-900'}`}>{value}</span>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function DefField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  )
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2">
      <p className="font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

// ─── Done / loading / message states ──────────────────────────────────────
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
