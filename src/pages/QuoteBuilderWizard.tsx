import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientPicker } from '@/components/ClientPicker'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { OpenQuoteButton } from '@/components/OpenQuoteButton'
import { Toast } from '@/components/Toast'
import { copyToClipboard, publicQuoteUrl } from '@/lib/share'
import { useNavigate } from 'react-router-dom'
import { DIAMOND_TYPE_OPTIONS, JEWELRY_METAL_OPTIONS } from '@/constants/config'
import type { JewelryMetalOption } from '@/types'
import {
  useQuoteBuilder,
  labReportVerifyUrl,
  diamondTypeKeys,
  METAL_GROUPS,
  FINGER_SIZE_OPTIONS,
  STONE_SHAPES,
  STONE_COLORS,
  STONE_CUTS,
  STONE_CLARITIES,
  JEWELRY_TYPE_OPTIONS,
  MARKUP_PRESETS,
  DISCOUNT_PRESETS,
  DEFAULT_MARKUP,
  type QuoteBuilderState,
  type StoneRow,
  type StoneRole,
} from '@/hooks/useQuoteBuilder'
import {
  ArrowLeft, ArrowRight, Camera, Check, ChevronDown, ChevronUp, CircleDollarSign,
  Crown, Diamond, ExternalLink, Gem, ImagePlus, Layers3, Sparkles, User, X,
} from 'lucide-react'

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STEPS = [
  { key: 'client',   label: 'Client & piece', icon: User },
  { key: 'material', label: 'Material',        icon: Layers3 },
  { key: 'stones',   label: 'Stones',          icon: Gem },
  { key: 'pricing',  label: 'Pricing',         icon: CircleDollarSign },
  { key: 'review',   label: 'Review',          icon: Check },
] as const

const roleMeta: Record<StoneRole, { label: string; icon: typeof Crown; accent: string; chip: string; bar: string }> = {
  MAIN:  { label: 'Main',  icon: Crown,    accent: 'amber',   chip: 'bg-amber-100 text-amber-900',   bar: 'from-amber-300 to-yellow-600' },
  SIDE:  { label: 'Side',  icon: Diamond,  accent: 'blue',    chip: 'bg-blue-100 text-blue-900',     bar: 'from-sky-400 to-indigo-600' },
  MELEE: { label: 'Melee', icon: Sparkles, accent: 'emerald', chip: 'bg-emerald-100 text-emerald-900', bar: 'from-teal-300 to-emerald-700' },
}

export function QuoteBuilderWizardPage() {
  const qb = useQuoteBuilder()
  const [step, setStep] = useState(0)
  const [maxVisited, setMaxVisited] = useState(0)

  if (qb.config.loading) {
    return <WizardSkeleton />
  }

  const goTo = (i: number) => {
    setStep(i)
    setMaxVisited(m => Math.max(m, i))
  }
  const next = () => goTo(Math.min(STEPS.length - 1, step + 1))
  const back = () => goTo(Math.max(0, step - 1))

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden rounded-[30px] border-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
        <CardContent className="relative p-6 sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.24),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.18),transparent_28%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                <Sparkles className="h-4 w-4" /> Quote Wizard
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[9px] font-bold text-slate-900">Beta</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Build a quote, one step at a time.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Same pricing engine as the classic builder — just guided. Your live total updates as you go.
              </p>
            </div>
            <Link to="/quotes" className="rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20">
              Switch to classic builder
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Stepper */}
      <Stepper step={step} maxVisited={maxVisited} onJump={goTo} />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        {/* Step content */}
        <div className="min-w-0 space-y-4">
          {step === 0 && <StepClient qb={qb} />}
          {step === 1 && <StepMaterial qb={qb} />}
          {step === 2 && <StepStones qb={qb} />}
          {step === 3 && <StepPricing qb={qb} />}
          {step === 4 && <StepReview qb={qb} />}

          {/* Footer nav */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <Button
                size="lg"
                className="rounded-2xl px-6 text-white"
                style={{ backgroundColor: 'var(--theme-primary)' }}
                onClick={qb.handleQuoteReady}
                disabled={qb.saving}
              >
                {qb.saving ? 'Saving…' : 'Quote ready'}
              </Button>
            )}
          </div>
          {qb.saveError && <p className="text-xs font-medium text-rose-600">{qb.saveError}</p>}
        </div>

        {/* Live summary */}
        <div className="space-y-4">
          <PriceSummary qb={qb} />
        </div>
      </section>

      {qb.savedQuote && <WizardToast key={qb.savedQuote.id} quote={qb.savedQuote} onClose={() => qb.setSavedQuote(null)} />}
    </div>
  )
}

// ── Loading skeleton ────────────────────────────────────────────────────────
function WizardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="rounded-[30px] border-0 shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
        <CardContent className="p-6 sm:p-8 space-y-4">
          <Skeleton className="h-3 w-36 bg-white/20" />
          <Skeleton className="h-9 w-3/4 bg-white/30" />
          <Skeleton className="h-3 w-2/3 bg-white/20" />
        </CardContent>
      </Card>

      {/* Stepper */}
      <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex shrink-0 flex-col items-center gap-1.5">
                <Skeleton className="h-10 w-10 rounded-2xl bg-slate-100" />
                <Skeleton className="hidden h-2.5 w-16 bg-slate-100 sm:block" />
              </div>
              {i < STEPS.length - 1 && <Skeleton className="mx-2 h-0.5 flex-1 bg-slate-200" />}
            </div>
          ))}
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        {/* Step content */}
        <Card className="rounded-[30px] border border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardContent className="p-6 sm:p-7 space-y-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-2xl bg-slate-100" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 bg-slate-100" />
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24 bg-slate-100" />
                  <Skeleton className="h-10 w-full rounded-xl bg-slate-100" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Live summary */}
        <Card className="rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <CardContent className="space-y-4 p-6">
            <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: 'var(--theme-primary)' }}>
              <Skeleton className="h-2.5 w-24 bg-white/20" />
              <Skeleton className="h-9 w-40 bg-white/30" />
              <Skeleton className="h-10 w-full rounded-xl bg-black/20" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-2xl bg-slate-100" />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

// ── Stepper ─────────────────────────────────────────────────────────────────
function Stepper({ step, maxVisited, onJump }: { step: number; maxVisited: number; onJump: (i: number) => void }) {
  return (
    <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const done = i < step
          const active = i === step
          const reachable = i <= maxVisited
          return (
            <div key={s.key} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => reachable && onJump(i)}
                disabled={!reachable}
                className={`flex shrink-0 flex-col items-center gap-1.5 ${reachable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border-2 transition ${
                    active
                      ? 'border-transparent text-white shadow-md'
                      : done
                        ? 'border-transparent bg-emerald-500 text-white'
                        : 'border-slate-200 bg-white text-slate-400'
                  }`}
                  style={active ? { backgroundColor: 'var(--theme-primary)' } : undefined}
                >
                  {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </span>
                <span className={`hidden text-[11px] font-semibold sm:block ${active ? 'text-slate-900' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 h-0.5 flex-1 rounded-full ${i < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Shared field shells ─────────────────────────────────────────────────────
function SectionCard({ title, subtitle, icon: Icon, children }: { title: string; subtitle?: string; icon: typeof User; children: React.ReactNode }) {
  return (
    <Card className="rounded-[30px] border border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <CardContent className="p-6 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

const inputCls = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white'
const labelCls = 'mb-1.5 block text-sm font-semibold text-slate-900'

// ── Step 1: Client & piece ──────────────────────────────────────────────────
function StepClient({ qb }: { qb: QuoteBuilderState }) {
  return (
    <SectionCard title="Client & piece" subtitle="Who is this for and what are we making?" icon={User}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={labelCls}>Quote title</label>
          <input
            type="text"
            value={qb.quoteTitle}
            onChange={e => { qb.setQuoteTitle(e.target.value); if (qb.fieldErrors.title) qb.setFieldErrors(p => ({ ...p, title: undefined })) }}
            placeholder="e.g. Solitaire engagement ring"
            className={`${inputCls} ${qb.fieldErrors.title ? 'border-rose-300' : ''}`}
          />
          {qb.fieldErrors.title && <p className="mt-1 text-xs font-medium text-rose-600">{qb.fieldErrors.title}</p>}
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>Type of piece</label>
          <select value={qb.jewelryType} onChange={e => qb.setJewelryType(e.target.value)} className={inputCls}>
            {JEWELRY_TYPE_OPTIONS.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>Client</label>
          <ClientPicker
            value={qb.client}
            onChange={c => { qb.setClient(c); if (c && qb.fieldErrors.client) qb.setFieldErrors(p => ({ ...p, client: undefined })) }}
            hasError={!!qb.fieldErrors.client}
          />
          {qb.fieldErrors.client && <p className="mt-1 text-xs font-medium text-rose-600">{qb.fieldErrors.client}</p>}
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>Reference photo</label>
          <input ref={qb.photoInputRef} id="wz-photo" type="file" accept="image/*" onChange={qb.handlePhotoChange} className="hidden" />
          <input ref={qb.cameraInputRef} id="wz-camera" type="file" accept="image/*" capture="environment" onChange={qb.handlePhotoChange} className="hidden" />
          {!qb.photo ? (
            <div className="grid gap-2">
              <label htmlFor="wz-camera" className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white sm:hidden">
                <Camera className="h-5 w-5 text-slate-400" /> Take photo
              </label>
              <label htmlFor="wz-photo" className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white">
                <ImagePlus className="h-5 w-5 text-slate-400" /> Choose from files
              </label>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200">
              <img src={qb.photo} alt="Reference" className="max-h-64 w-full object-cover" />
              <button onClick={qb.handleRemovePhoto} className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80">
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>
            Customer-facing notes
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Shown to client</span>
          </label>
          <textarea rows={3} value={qb.customerNotes} onChange={e => qb.setCustomerNotes(e.target.value)} placeholder="Short description for the client — appears on the share link." className={`${inputCls} resize-y`} />
        </div>
      </div>
    </SectionCard>
  )
}

// ── Step 2: Material ────────────────────────────────────────────────────────
function StepMaterial({ qb }: { qb: QuoteBuilderState }) {
  return (
    <SectionCard title="CAD design, metal & jeweler's time" subtitle="The body of the piece." icon={Layers3}>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className={labelCls}>Metal</label>
          <select value={qb.selectedMetal} onChange={e => qb.setSelectedMetal(e.target.value as JewelryMetalOption)} className={inputCls}>
            {METAL_GROUPS.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.keys.map(key => (
                  <option key={key} value={key}>{JEWELRY_METAL_OPTIONS[key].label} — ${JEWELRY_METAL_OPTIONS[key].pricePerGram}/g</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Weight (grams)</label>
          <input type="number" min={0} step={0.1} value={qb.weightGrams || ''} placeholder="0" onChange={e => qb.setWeightGrams(Number(e.target.value) || 0)} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>CAD design &amp; Jeweler's time</label>
          <select value={qb.ringLabor} onChange={e => qb.setRingLabor(e.target.value)} className={inputCls}>
            <option value="">— Select a difficulty level</option>
            {qb.config.ringLaborTiers.map(t => <option key={t.tierKey} value={t.tierKey}>{t.label} — ${t.fee}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Width of the ring (mm)</label>
          <input type="number" min={1} step={0.5} value={qb.ringWidth || ''} placeholder="0" onChange={e => qb.setRingWidth(Number(e.target.value) || 0)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Finger size</label>
          <select value={qb.fingerSize} onChange={e => qb.setFingerSize(Number(e.target.value))} className={inputCls}>
            <option value={0}>— Select a size</option>
            {FINGER_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
    </SectionCard>
  )
}

// ── Step 3: Stones ──────────────────────────────────────────────────────────
function StepStones({ qb }: { qb: QuoteBuilderState }) {
  const groups: Array<{ role: StoneRole; items: StoneRow[]; hint: string }> = [
    { role: 'MAIN',  items: qb.mainStones,  hint: 'Center stones — each can carry its own markup.' },
    { role: 'SIDE',  items: qb.sideStones,  hint: 'Accent stones.' },
    { role: 'MELEE', items: qb.meleeStones, hint: 'Pavé / melee.' },
  ]
  return (
    <SectionCard title="Stones" subtitle="Main, side and melee — plus stones the client supplies." icon={Gem}>
      <div className="space-y-5">
        {groups.map(g => {
          const m = roleMeta[g.role]
          const Icon = m.icon
          return (
            <div key={g.role} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${m.chip}`}><Icon className="h-4 w-4" /></span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{m.label} stones <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${m.chip}`}>{g.items.length}</span></p>
                    <p className="text-xs text-slate-500">{g.hint}</p>
                  </div>
                </div>
                <button type="button" onClick={() => qb.addStone(g.role)} className={`rounded-full bg-gradient-to-r ${m.bar} px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90`}>
                  + Add {m.label.toLowerCase()}
                </button>
              </div>
              {g.items.length > 0 && (
                <div className="mt-3 space-y-3">
                  {g.items.map((s, i) => <StoneEditor key={s.uid} qb={qb} stone={s} index={i} />)}
                </div>
              )}
            </div>
          )
        })}

        <CustomerStones qb={qb} />
      </div>
    </SectionCard>
  )
}

function StoneEditor({ qb, stone, index }: { qb: QuoteBuilderState; stone: StoneRow; index: number }) {
  const m = roleMeta[stone.role]
  const sizes = stone.stoneType === 'natural' ? qb.sizesByStoneType.NATURAL : qb.sizesByStoneType.LAB
  const customSize = stone.sizeKey === ''
  const sizeCfg = qb.config.diamondSizeFor(stone.stoneType, stone.sizeKey)
  const pricePerCarat = (sizeCfg?.basePrice ?? 0) * DIAMOND_TYPE_OPTIONS[stone.stoneType].multiplier
  const verify = labReportVerifyUrl(stone.labReport)

  if (stone.collapsed) {
    const parts = [stone.shape || DIAMOND_TYPE_OPTIONS[stone.stoneType].label, stone.color ? `color ${stone.color}` : null, qb.parseNum(stone.carats) > 0 ? `${qb.parseNum(stone.carats)} ct` : null].filter(Boolean)
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={() => qb.toggleCollapsed(stone.uid)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.chip}`}>{m.label} #{index + 1}</span>
          <span className="truncate text-sm text-slate-600">{parts.length ? parts.join(' · ') : 'Not configured'}</span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
        </button>
        <button type="button" onClick={() => qb.removeStone(stone.uid)} className="text-slate-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${m.bar}`} aria-hidden />
      <div className="mb-3 flex items-center justify-between pl-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${m.chip}`}>{m.label} stone #{index + 1}</span>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => qb.collapseStone(stone.uid)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => qb.removeStone(stone.uid)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid gap-3 pl-2 md:grid-cols-2">
        <Field label="Type">
          <select value={stone.stoneType} onChange={e => qb.patchStone(stone.uid, { stoneType: e.target.value as StoneRow['stoneType'] })} className={miniCls}>
            {diamondTypeKeys.map(k => <option key={k} value={k}>{DIAMOND_TYPE_OPTIONS[k].label}</option>)}
          </select>
        </Field>
        <Field label="Size">
          <select value={stone.sizeKey} onChange={e => qb.patchStone(stone.uid, { sizeKey: e.target.value })} className={miniCls}>
            <option value="">Custom — enter carats &amp; price</option>
            {sizes.map(d => <option key={d.id} value={d.sizeKey}>{d.label} — ${d.basePrice}{d.ctPerStone != null ? '/ct' : ''}</option>)}
          </select>
        </Field>
        <Field label="Carats">
          <input type="text" inputMode="decimal" value={stone.carats} placeholder="0.0000" onChange={e => qb.onStoneCaratsChange(stone.uid, e.target.value)} className={miniCls} />
        </Field>
        <Field label="Amount">
          <input type="text" inputMode="numeric" value={stone.amount} placeholder="0" onChange={e => qb.onStoneAmountChange(stone.uid, e.target.value)} className={miniCls} />
        </Field>
        <Field label="Type of setting" wide>
          <select value={stone.setterType} onChange={e => qb.patchStone(stone.uid, { setterType: e.target.value })} className={miniCls}>
            {qb.config.setters.map(s => <option key={s.typeKey} value={s.typeKey}>{s.label} — ${s.fee}</option>)}
          </select>
        </Field>
        <Field label="Shape (optional)">
          <select value={stone.shape} onChange={e => qb.patchStone(stone.uid, { shape: e.target.value })} className={miniCls}>
            <option value="">—</option>
            {STONE_SHAPES.map(sh => <option key={sh} value={sh}>{sh}</option>)}
          </select>
        </Field>
        <Field label="Color (optional)">
          <select value={stone.color} onChange={e => qb.patchStone(stone.uid, { color: e.target.value })} className={miniCls}>
            <option value="">—</option>
            {STONE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {stone.role === 'MAIN' && (
          <>
            <Field label="Cut (optional)">
              <select value={stone.cut} onChange={e => qb.patchStone(stone.uid, { cut: e.target.value })} className={miniCls}>
                <option value="">—</option>
                {STONE_CUTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Clarity (optional)">
              <select value={stone.clarity} onChange={e => qb.patchStone(stone.uid, { clarity: e.target.value })} className={miniCls}>
                <option value="">—</option>
                {STONE_CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label={customSize ? 'Stone price' : 'Custom price'} hint={customSize ? '(required)' : `(overrides ${money(pricePerCarat)}/ct)`} wide hintError={customSize}>
          <input type="number" min={0} step="0.01" value={stone.manualPrice}
            placeholder={customSize ? 'e.g. 4500 (required)' : 'Leave empty to use calculated price'}
            onChange={e => qb.onStoneManualPriceChange(stone.uid, e.target.value)}
            className={`${miniCls} ${customSize && stone.manualPrice.trim() === '' ? 'border-rose-300' : ''}`} />
        </Field>
        {stone.role === 'MAIN' && (
          <Field label="Markup for this stone (optional)" wide>
            <input type="text" inputMode="decimal" value={stone.markup} placeholder={`Leave empty to use ${qb.parsedMarkup}×`} onChange={e => qb.patchStone(stone.uid, { markup: e.target.value })} className={miniCls} />
          </Field>
        )}
        {stone.role !== 'MELEE' && (
          <div className="space-y-1 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lab report (optional)</label>
              {verify ? (
                <a href={verify.url} target="_blank" rel="noopener noreferrer"
                  title={`Opens ${verify.lab}'s official report check in a new tab`}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold no-underline shadow-sm transition hover:shadow ${verify.valid ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100' : 'border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100'}`}>
                  {verify.valid ? `Verify on ${verify.lab}` : `Check ${verify.lab} #`}
                  <ExternalLink className="h-3 w-3 opacity-80" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-400">Verify</span>
              )}
            </div>
            <input type="text" value={stone.labReport} placeholder="e.g. GIA 1234567890" onChange={e => qb.patchStone(stone.uid, { labReport: e.target.value })} className={miniCls} />
          </div>
        )}
      </div>
    </div>
  )
}

const miniCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400'

function Field({ label, hint, hintError, wide, children }: { label: string; hint?: string; hintError?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${wide ? 'md:col-span-2' : ''}`}>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}{hint && <span className={`ml-1 font-normal normal-case ${hintError ? 'text-rose-500' : 'text-slate-400'}`}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function CustomerStones({ qb }: { qb: QuoteBuilderState }) {
  return (
    <div className="rounded-2xl border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700"><User className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Customer stones <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900">{qb.customerStones.length}</span></p>
            <p className="text-xs text-slate-500">Client brings the stone — we charge setting labor only.</p>
          </div>
        </div>
        <button type="button" onClick={qb.addCustomerStone} className="rounded-full bg-gradient-to-r from-rose-500 to-pink-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90">+ Add</button>
      </div>
      {qb.customerStones.length > 0 && (
        <div className="mt-3 space-y-3">
          {qb.customerStones.map((cs, idx) => {
            const fee = qb.config.setterMap[cs.setterType]?.fee ?? 0
            const qty = qb.parseNum(cs.quantity || '1') || 1
            return (
              <div key={cs.uid} className="rounded-2xl border border-rose-100 bg-rose-50/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900">Customer stone #{idx + 1}</span>
                  <button type="button" onClick={() => qb.removeCustomerStone(cs.uid)} className="text-slate-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Type of stone">
                    <select value={cs.gemstoneId} onChange={e => qb.patchCustomerStone(cs.uid, { gemstoneId: e.target.value })} className={miniCls}>
                      {qb.gemstones.length === 0 && <option value="">No gemstones loaded</option>}
                      {qb.gemstones.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Type of setting">
                    <select value={cs.setterType} onChange={e => qb.patchCustomerStone(cs.uid, { setterType: e.target.value })} className={miniCls}>
                      {qb.customerSetters.map(s => <option key={s.typeKey} value={s.typeKey}>{s.label} — ${s.fee}</option>)}
                    </select>
                  </Field>
                  <Field label="Size">
                    <input type="text" value={cs.size} placeholder="e.g. 6×4 mm oval" onChange={e => qb.patchCustomerStone(cs.uid, { size: e.target.value })} className={miniCls} />
                  </Field>
                  <Field label="Quantity">
                    <input type="number" min={1} step={1} value={cs.quantity} onChange={e => qb.patchCustomerStone(cs.uid, { quantity: e.target.value })} className={miniCls} />
                  </Field>
                </div>
                <p className="mt-2 text-xs text-slate-500">Setting <strong className="text-slate-900">{money(qty * fee)}</strong> ({qty} × ${fee})</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Step 4: Pricing ─────────────────────────────────────────────────────────
function StepPricing({ qb }: { qb: QuoteBuilderState }) {
  return (
    <SectionCard title="Finishing & pricing" subtitle="Engraving, extras, markup, discount and tax." icon={CircleDollarSign}>
      <div className="space-y-6">
        <div>
          <div className="flex items-baseline justify-between">
            <label className={labelCls}>Hand Engraving (milgrain)</label>
            <span className="text-sm font-bold text-slate-900">{qb.engravingFee > 0 ? money(qb.engravingFee) : 'None'}</span>
          </div>
          <input type="range" min={qb.engravingBounds.min} max={qb.engravingBounds.max} step={qb.engravingBounds.step}
            value={Math.min(qb.engravingBounds.max, Math.max(qb.engravingBounds.min, qb.engravingFee))}
            onChange={e => qb.setEngravingFee(Number(e.target.value))} className="w-full accent-slate-900" />
          <div className="flex justify-between text-[11px] text-slate-400"><span>${qb.engravingBounds.min}</span><span>$0 = none</span><span>${qb.engravingBounds.max}</span></div>
        </div>

        <div>
          <label className={labelCls}>Extra costs</label>
          <input type="number" min={0} step={1} value={qb.extraCosts || ''} placeholder="0" onChange={e => qb.setExtraCosts(Number(e.target.value) || 0)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Retail markup</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[140px] flex-1">
              <input type="text" inputMode="decimal" value={qb.markupText} placeholder={String(DEFAULT_MARKUP)} onChange={e => qb.setMarkupText(e.target.value)} className={`${inputCls} pr-9`} />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">×</span>
            </div>
            {MARKUP_PRESETS.map(p => (
              <button key={p} type="button" onClick={() => qb.setMarkupText(String(p))} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${qb.parsedMarkup === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p}×</button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Customer discount</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[140px] flex-1">
              <input type="text" inputMode="decimal" value={qb.discountText} placeholder="0" onChange={e => qb.setDiscountText(e.target.value)} className={`${inputCls} pr-9`} />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">%</span>
            </div>
            <button type="button" onClick={() => qb.setDiscountText('')} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${qb.parsedDiscount === 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>None</button>
            {DISCOUNT_PRESETS.map(p => (
              <button key={p} type="button" onClick={() => qb.setDiscountText(String(p))} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${qb.parsedDiscount === p ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{p}%</button>
            ))}
          </div>
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Every quote is saved as Pending and must be approved with the Approve button.
          </div>
        </div>

        <div>
          <label className={labelCls}>Sales tax (7.75%)</label>
          <button type="button" role="switch" aria-checked={qb.applyTaxes} onClick={() => qb.setApplyTaxes(!qb.applyTaxes)}
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${qb.applyTaxes ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'}`}>
            <span>{qb.applyTaxes ? 'Including 7.75% sales tax' : 'No sales tax'}</span>
            <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${qb.applyTaxes ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${qb.applyTaxes ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

// ── Step 5: Review ──────────────────────────────────────────────────────────
function StepReview({ qb }: { qb: QuoteBuilderState }) {
  const p = qb.pricing
  return (
    <SectionCard title="Review & create" subtitle="Confirm everything, then create the quote." icon={Check}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <ReviewItem label="Title" value={qb.quoteTitle || '—'} />
          <ReviewItem label="Client" value={qb.client ? `${qb.client.name}${qb.client.surname ? ' ' + qb.client.surname : ''}` : '—'} />
          <ReviewItem label="Piece" value={qb.jewelryTypeLabel} />
          <ReviewItem label="Metal" value={qb.selectedMetalConfig.label} />
          <ReviewItem label="CAD & time" value={qb.ringLaborLabel || '—'} />
          <ReviewItem label="Stones" value={`${p.totalAmount} supplied · ${p.customerStoneCount} customer · ${p.totalCarats} ct`} />
        </div>

        {(qb.fieldErrors.title || qb.fieldErrors.client) && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Complete the required fields: {[qb.fieldErrors.title && 'title', qb.fieldErrors.client && 'client'].filter(Boolean).join(', ')}.
          </div>
        )}

        {qb.savedQuote?.publicToken && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Share link ready</p>
            <p className="mt-1 truncate font-mono text-sm text-slate-900">{publicQuoteUrl(qb.savedQuote.publicToken)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <CopyShareLinkButton token={qb.savedQuote.publicToken} iconOnly={false} />
              <OpenQuoteButton token={qb.savedQuote.publicToken} />
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  )
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

// ── Live price summary (sticky) ─────────────────────────────────────────────
function PriceSummary({ qb }: { qb: QuoteBuilderState }) {
  const p = qb.pricing
  const mk = qb.parsedMarkup
  const suppliedCost = p.diamondCost + p.settingFee
  // MAIN stones with their own markup are priced at that rate, so this line's
  // retail isn't a flat cost × mk; every other line is.
  const suppliedRetail = (suppliedCost - qb.customMainRaw) * mk + qb.customMainMarkedUp
  // [label, cost, retail] — retail shows the selected markup applied per line.
  const lines: Array<[string, number, number]> = [
    ['Material reference', p.materialCost, p.materialCost * mk],
    ["CAD design & Jeweler's time", p.ringLaborFee, p.ringLaborFee * mk],
    [`Supplied diamonds (${p.totalAmount} · ${p.totalCarats} ct)`, suppliedCost, suppliedRetail],
    ...(qb.customerStones.length > 0 ? [[`Customer diamonds (${p.customerStoneCount})`, p.customerSettingFee, p.customerSettingFee * mk] as [string, number, number]] : []),
    ['Hand engraving', p.engravingFee, p.engravingFee * mk],
    ['Extra costs', qb.extraCosts, qb.extraCosts * mk],
  ]
  return (
    <Card className="rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] xl:sticky xl:top-24">
      <CardContent className="space-y-4 p-6">
        <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <p className="text-xs uppercase tracking-[0.18em] text-amber-300">Customer price</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">{money(qb.customerPrice)}</p>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-amber-200/90">
            {qb.parsedOverride != null ? 'Custom total' : `${qb.parsedMarkup}×${qb.parsedDiscount > 0 ? `, −${qb.parsedDiscount}%` : ''}${qb.applyTaxes ? ', +7.75% tax' : ''}`}
          </p>
          <div className="mt-3 flex items-baseline justify-between rounded-xl bg-black/20 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Our cost</span>
            <span className="text-lg font-semibold text-white">{money(p.total)}</span>
          </div>
          {qb.parsedDiscount > 0 && qb.parsedOverride == null && (
            <p className="mt-1 text-xs text-emerald-300/90">Discount −{money(qb.discountAmount)} ({qb.parsedDiscount}% off)</p>
          )}
        </div>
        <div className="space-y-2 text-sm">
          {/* Each line shows cost → retail so the selected markup is visibly
              applied to every component (engraving included). */}
          <div className="flex items-center justify-between gap-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>Item</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="w-16 text-right">Cost</span>
              <span className="w-9 text-center">×{mk}</span>
              <span className="w-20 text-right text-slate-500">Customer</span>
            </div>
          </div>
          {lines.map(([label, cost, retail]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-2.5">
              <span className="min-w-0 flex-1 text-slate-500">{label}</span>
              <div className="flex shrink-0 items-center gap-2 text-right">
                <span className="w-16 text-right text-xs tabular-nums text-slate-400">{money(cost)}</span>
                <span className="w-9 rounded-full bg-slate-200 py-0.5 text-center text-[10px] font-semibold text-slate-600">×{mk}</span>
                <span className="w-20 text-right font-semibold tabular-nums text-slate-900">{money(retail)}</span>
              </div>
            </div>
          ))}
          <p className="px-1 text-[11px] text-slate-400">
            Every line is multiplied by the selected <strong className="text-slate-600">{mk}×</strong> markup — engraving included.
            {qb.parsedDiscount > 0 || qb.applyTaxes ? ' Discount/tax are applied to the customer total above.' : ''}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function WizardToast({ quote, onClose }: { quote: { id: string; title: string; total: number; publicToken: string | null }; onClose: () => void }) {
  const navigate = useNavigate()
  const hasLink = !!quote.publicToken
  return (
    <Toast
      title="Quote created!"
      description={`${quote.title} · ${money(quote.total)}${hasLink ? ' · share link ready' : ''}`}
      actionLabel={hasLink ? 'Copy share link' : 'View quotes →'}
      onAction={async () => {
        if (hasLink && quote.publicToken) await copyToClipboard(publicQuoteUrl(quote.publicToken))
        else navigate('/quotes-list')
      }}
      secondaryActionLabel={hasLink ? '↗ Open quote' : undefined}
      onSecondaryAction={hasLink && quote.publicToken
        ? () => window.open(publicQuoteUrl(quote.publicToken!), '_blank', 'noopener,noreferrer')
        : undefined}
      onClose={onClose}
    />
  )
}
