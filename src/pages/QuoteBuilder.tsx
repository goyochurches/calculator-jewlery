import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DIAMOND_SUPPLIER,
  DIAMOND_TYPE_OPTIONS,
  JEWELRY_METAL_OPTIONS,
  SETTING_LABOR_MASTER,
} from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { quotesService } from '@/services/quotesService'
import type { JewelryMetalOption } from '@/types'
import { Toast } from '@/components/Toast'
import { Calculator, Camera, Diamond, Gem, ImagePlus, Layers3, Ruler, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const HAND_ENGRAVING_FEE = 150

// Tallas disponibles: de 3 a 20 en incrementos de 0.25 (sin coste adicional).
const FINGER_SIZE_OPTIONS: number[] = (() => {
  const out: number[] = []
  for (let s = 3; s <= 20; s += 0.25) out.push(Math.round(s * 100) / 100)
  return out
})()

// Selectables: solo las opciones nuevas (las claves legacy se ocultan del selector
// pero siguen siendo válidas para cargar quotes históricas).
const SELECTABLE_METAL_KEYS: JewelryMetalOption[] = [
  'gold-14k-white', 'gold-14k-yellow', 'gold-14k-rose',
  'gold-18k-white', 'gold-18k-yellow', 'gold-18k-rose',
  'platinum',
]

const METAL_GROUPS: Array<{ group: string; keys: JewelryMetalOption[] }> = [
  { group: '14K Gold', keys: ['gold-14k-white', 'gold-14k-yellow', 'gold-14k-rose'] },
  { group: '18K Gold', keys: ['gold-18k-white', 'gold-18k-yellow', 'gold-18k-rose'] },
  { group: 'Platinum', keys: ['platinum'] },
]

const diamondTypeKeys = Object.keys(DIAMOND_TYPE_OPTIONS) as Array<keyof typeof DIAMOND_TYPE_OPTIONS>

// Mapeo del tipo de diamante elegido en el UI al stoneType que guarda el
// backend en diamond_size_config. Grunberger Natural → NATURAL, Grunberger
// Lab → LAB. Si añadimos más tipos en el futuro, mapearlos aquí.
const DIAMOND_TYPE_TO_STONE: Record<keyof typeof DIAMOND_TYPE_OPTIONS, 'NATURAL' | 'LAB'> = {
  natural: 'NATURAL',
  'lab-grown': 'LAB',
}

export function QuoteBuilderPage() {
  const { user } = useAuth()
  const config = useQuoteConfig()

  const [quoteTitle, setQuoteTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedQuote, setSavedQuote] = useState<{ id: string; title: string; total: number } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedMetal, setSelectedMetal] = useState<JewelryMetalOption>('gold-18k-white')
  const [ringLabor, setRingLabor] = useState('medium')
  const [cadDesign, setCadDesign] = useState('medium')
  const [diamondAmount, setDiamondAmount] = useState(0)
  const [diamondType, setDiamondType] = useState<keyof typeof DIAMOND_TYPE_OPTIONS>('natural')
  const [diamondSize, setDiamondSize] = useState('1-1.04')
  const [weightGrams, setWeightGrams] = useState(12)
  const [ringWidth, setRingWidth] = useState(2.5)
  const [fingerSize, setFingerSize] = useState(7)
  const [extraCosts, setExtraCosts] = useState(0)
  const [engraving, setEngraving] = useState(false)
  const [setterType, setSetterType] = useState<string>('ss_melee')

  const [photo, setPhoto] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = () => {
    setPhoto(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  const selectedMetalConfig = JEWELRY_METAL_OPTIONS[selectedMetal]

  // Tamaños de diamante filtrados por el tipo seleccionado (Natural / Lab).
  const filteredDiamondSizes = useMemo(() => {
    const stoneType = DIAMOND_TYPE_TO_STONE[diamondType]
    return config.diamondSizes.filter(d => d.stoneType === stoneType)
  }, [config.diamondSizes, diamondType])

  // Si el size actual ya no pertenece al tipo elegido, saltamos al primero
  // disponible — así nunca queda un valor inválido en el formulario.
  useEffect(() => {
    if (filteredDiamondSizes.length === 0) return
    const exists = filteredDiamondSizes.some(d => d.sizeKey === diamondSize)
    if (!exists) setDiamondSize(filteredDiamondSizes[0].sizeKey)
  }, [filteredDiamondSizes, diamondSize])

  const pricing = useMemo(() => {
    const metalPricePerGram = selectedMetalConfig.pricePerGram
    const materialCost = metalPricePerGram * weightGrams
    const ringLaborFee = config.ringLaborMap[ringLabor]?.fee ?? 0
    const cadFee = config.cadMap[cadDesign]?.fee ?? 0
    const setterCfg = config.setterMap[setterType]
    // Si hay un setter elegido, usamos su fee. Si no, caemos al master legacy.
    const settingFeePerStone = setterCfg?.fee ?? SETTING_LABOR_MASTER[diamondSize as keyof typeof SETTING_LABOR_MASTER]?.feePerStone ?? 0
    const settingMinutesPerStone = SETTING_LABOR_MASTER[diamondSize as keyof typeof SETTING_LABOR_MASTER]?.minutesPerStone ?? 0
    const settingFee = diamondAmount * settingFeePerStone
    const settingTimeHours = (diamondAmount * settingMinutesPerStone) / 60
    const widthFee = Math.max(0, ringWidth - 2) * 18
    const diamondUnitPrice =
      (config.diamondSizeMap[diamondSize]?.basePrice ?? 0) * DIAMOND_TYPE_OPTIONS[diamondType].multiplier
    const diamondCost = diamondAmount * diamondUnitPrice
    const engravingFee = engraving ? HAND_ENGRAVING_FEE : 0

    const total =
      materialCost +
      ringLaborFee +
      cadFee +
      settingFee +
      widthFee +
      diamondCost +
      engravingFee +
      extraCosts

    return {
      metalPricePerGram,
      materialCost,
      ringLaborFee,
      cadFee,
      settingFeePerStone,
      settingFee,
      settingMinutesPerStone,
      settingTimeHours,
      widthFee,
      diamondUnitPrice,
      diamondCost,
      engravingFee,
      total,
    }
  }, [
    cadDesign, config, diamondAmount, diamondSize, diamondType, engraving,
    extraCosts, ringLabor, ringWidth, selectedMetalConfig, setterType, weightGrams,
  ])

  const handleQuoteReady = async () => {
    if (!user) return
    if (!quoteTitle.trim()) { setSaveError('Please enter a quote title.'); return }
    setSaving(true)
    setSaveError(null)
    try {
      const q = await quotesService.create({
        title: quoteTitle.trim(),
        clientName: clientName.trim(),
        status: 'PENDING',
        metal: selectedMetal,
        ringLabor,
        cadDesign,
        diamondAmount,
        diamondType,
        diamondSize,
        weightGrams,
        ringWidth,
        fingerSize,
        // Campos legacy: seguimos enviándolos en 0 para mantener compatibilidad
        // con el modelo del backend hasta que se elimine la columna.
        laborHours: 0,
        hourlyRate: 0,
        extraCosts,
        total: pricing.total,
        photo: photo ?? undefined,
        engraving,
        setterType,
      }, user.id)
      setSavedQuote({ id: q.id, title: q.title, total: pricing.total })
      setQuoteTitle('')
      setClientName('')
      setEngraving(false)
      setPhoto(null)
      if (photoInputRef.current) photoInputRef.current.value = ''
    } catch {
      setSaveError('Failed to save quote. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const cadLabel = config.cadMap[cadDesign]?.label ?? cadDesign
  const ringLaborLabel = config.ringLaborMap[ringLabor]?.label ?? ringLabor

  if (config.loading) return <QuoteBuilderSkeleton />

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card className="rounded-[30px] border-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <CardContent className="relative p-5 sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.24),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.18),transparent_28%)]" />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                <Calculator className="h-4 w-4" />
                Pricing engine
              </div>
              <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
                Build quotes from CAD design, jeweler's time and stone setting.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:mt-4">
                Two main sections: <strong>CAD Design &amp; Jeweler's Time</strong> for the body of the
                piece and <strong>Stone Setting</strong> for the diamonds (only {DIAMOND_SUPPLIER}).
              </p>

              <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Metal price / g</p>
                  <p className="mt-2 text-2xl font-semibold">
                    ${pricing.metalPricePerGram.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">CAD fee</p>
                  <p className="mt-2 text-2xl font-semibold">
                    ${pricing.cadFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Jeweler's time</p>
                  <p className="mt-2 text-2xl font-semibold">
                    ${pricing.ringLaborFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Diamond cost</p>
                  <p className="mt-2 text-2xl font-semibold">
                    ${pricing.diamondCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">Estimated total</CardTitle>
            <p className="text-sm text-slate-500">Live breakdown for the current quote.</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Quote total</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                ${((pricing.total - pricing.engravingFee) * 2.5 + pricing.engravingFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-2 text-sm text-slate-300">
                {selectedMetalConfig.label} | {ringLaborLabel} | {cadLabel}
              </p>
            </div>

            <div className="space-y-3 text-sm">
              {[
                ['Material reference', pricing.materialCost],
                ['Jeweler\'s time', pricing.ringLaborFee],
                ['CAD design', pricing.cadFee],
                ['Setting labor', pricing.settingFee],
                ['Diamonds', pricing.diamondCost],
                ['Ring width fee', pricing.widthFee],
                ['Hand engraving (milgrain)', pricing.engravingFee],
                ['Extra costs', extraCosts],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-900">${(value as number).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Layout 2 columnas: formulario izquierda, mini-cards derecha ───── */}
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        {/* ── Columna izquierda: cabecera + 2 secciones apiladas ─────────── */}
        <div className="space-y-4">
          {/* Cabecera del quote */}
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-900">Quote details</CardTitle>
              <p className="text-sm text-slate-500">Title, client and reference photo.</p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
              {saveError && (
                <div className="md:col-span-2 rounded-2xl bg-rose-50 border border-rose-200 px-5 py-4 text-sm text-rose-700">
                  {saveError}
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Quote title</label>
                <input type="text" value={quoteTitle} onChange={e => setQuoteTitle(e.target.value)}
                  placeholder="e.g. Solitaire engagement ring"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Client name</label>
                <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                  placeholder="e.g. María García"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Reference photo</label>

                <input ref={photoInputRef} id="photo-upload" type="file" accept="image/*"
                  onChange={handlePhotoChange} className="hidden" />
                <input ref={cameraInputRef} id="photo-camera" type="file" accept="image/*"
                  capture="environment" onChange={handlePhotoChange} className="hidden" />

                {!photo ? (
                  <div className="grid gap-2">
                    <label htmlFor="photo-camera"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white sm:hidden">
                      <Camera className="h-5 w-5 shrink-0 text-slate-400" />
                      <span>Take photo</span>
                    </label>
                    <label htmlFor="photo-upload"
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white">
                      <ImagePlus className="h-5 w-5 shrink-0 text-slate-400" />
                      <span>Choose from files</span>
                    </label>
                  </div>
                ) : (
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200">
                    <img src={photo} alt="Reference" className="w-full object-cover max-h-64" />
                    <div className="absolute inset-0 flex items-start justify-end p-2">
                      <button onClick={handleRemovePhoto}
                        className="flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80">
                        <X className="h-3 w-3" />
                        Remove
                      </button>
                    </div>
                    <div className="absolute bottom-2 left-2 flex gap-1.5">
                      <label htmlFor="photo-camera"
                        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80 sm:hidden">
                        <Camera className="h-3 w-3" />
                        Take photo
                      </label>
                      <label htmlFor="photo-upload"
                        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80">
                        <ImagePlus className="h-3 w-3" />
                        Choose file
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sección 1: CAD Design & Jeweler's Time */}
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  CAD Design &amp; Jeweler's Time
                </CardTitle>
              </div>
              <p className="text-sm text-slate-500">
                Metal, weight, ring dimensions, CAD complexity and jeweler's time.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Metal</label>
                <select value={selectedMetal} onChange={e => setSelectedMetal(e.target.value as JewelryMetalOption)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {METAL_GROUPS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.keys.map(key => (
                        <option key={key} value={key}>
                          {JEWELRY_METAL_OPTIONS[key].label} — ${JEWELRY_METAL_OPTIONS[key].pricePerGram}/g
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Weight (grams)</label>
                <input type="number" min={0} step={0.1} value={weightGrams || ''} placeholder="0"
                  onChange={e => setWeightGrams(Number(e.target.value) || 0)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">CAD design</label>
                <select value={cadDesign} onChange={e => setCadDesign(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {config.cadTiers.map(t => (
                    <option key={t.tierKey} value={t.tierKey}>{t.label} — ${t.fee}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Jeweler's time</label>
                <select value={ringLabor} onChange={e => setRingLabor(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {config.ringLaborTiers.map(t => (
                    <option key={t.tierKey} value={t.tierKey}>{t.label} — ${t.fee}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Width of the ring (mm)</label>
                <input type="number" min={1} step={0.5} value={ringWidth || ''} placeholder="0"
                  onChange={e => setRingWidth(Number(e.target.value) || 0)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Finger size</label>
                <select value={fingerSize} onChange={e => setFingerSize(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {FINGER_SIZE_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Hand Engraving (milgrain) — ${HAND_ENGRAVING_FEE}</label>
                <select value={engraving ? 'yes' : 'no'} onChange={e => setEngraving(e.target.value === 'yes')}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Extra costs</label>
                <input type="number" min={0} step={1} value={extraCosts || ''} placeholder="0"
                  onChange={e => setExtraCosts(Number(e.target.value) || 0)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white" />
              </div>
            </CardContent>
          </Card>

          {/* Sección 2: STONE SETTING */}
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Diamond className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base font-semibold text-slate-900">Stone Setting</CardTitle>
              </div>
              <p className="text-sm text-slate-500">
                Diamonds from <strong>{DIAMOND_SUPPLIER}</strong> only. Setter types and full natural/lab
                price tables will be filled in once we have the complete data.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Type of diamond</label>
                <select value={diamondType} onChange={e => setDiamondType(e.target.value as keyof typeof DIAMOND_TYPE_OPTIONS)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {diamondTypeKeys.map(key => (
                    <option key={key} value={key}>{DIAMOND_TYPE_OPTIONS[key].label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Amount of diamonds</label>
                <input type="number" min={0} step={1} value={diamondAmount || ''} placeholder="0"
                  onChange={e => setDiamondAmount(Number(e.target.value) || 0)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">
                  Sizes of diamonds ({DIAMOND_TYPE_OPTIONS[diamondType].label})
                </label>
                <select value={diamondSize} onChange={e => setDiamondSize(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {filteredDiamondSizes.length === 0 && (
                    <option value="">No sizes for this type</option>
                  )}
                  {filteredDiamondSizes.map(d => (
                    <option key={d.id} value={d.sizeKey}>
                      {d.label} — ${d.basePrice}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Setter type</label>
                <select value={setterType} onChange={e => setSetterType(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {config.setters.map(s => (
                    <option key={s.typeKey} value={s.typeKey}>{s.label} — ${s.fee}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Setting labor</label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900">
                  ${pricing.settingFeePerStone.toLocaleString('en-US', { minimumFractionDigits: 2 })} per diamond × {diamondAmount}
                  {' = '}
                  <strong>${pricing.settingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <Button size="lg" className="w-full rounded-2xl px-5 text-white sm:w-auto"
              style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={handleQuoteReady} disabled={saving}>
              {saving ? 'Saving…' : 'Quote ready'}
            </Button>
          </div>
        </div>

        {/* ── Columna derecha: mini-cards de resumen ─────────────────────── */}
        <div className="grid gap-4 content-start">
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Metal price / g</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                    ${pricing.metalPricePerGram.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-2xl bg-yellow-50 p-3 text-yellow-700"><Gem className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">{selectedMetalConfig.label} — fixed price.</p>
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">CAD design</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{cadLabel}</p>
                </div>
                <div className="rounded-2xl bg-sky-50 p-3 text-sky-600"><Layers3 className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                ${pricing.cadFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} added for CAD design.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Jeweler's time</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{ringLaborLabel}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><Layers3 className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                ${pricing.ringLaborFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} for the jeweler's time.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Diamonds</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{diamondAmount}</p>
                </div>
                <div className="rounded-2xl bg-fuchsia-50 p-3 text-fuchsia-600"><Diamond className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {DIAMOND_TYPE_OPTIONS[diamondType].label} | {config.diamondSizeMap[diamondSize]?.label ?? diamondSize} | ${pricing.diamondUnitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} each
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Setting labor</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                    ${pricing.settingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-2xl bg-rose-50 p-3 text-rose-600"><Diamond className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {pricing.settingMinutesPerStone} min each | total {pricing.settingTimeHours.toFixed(2)} h
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Finger size</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{fingerSize}</p>
                </div>
                <div className="rounded-2xl bg-violet-50 p-3 text-violet-600"><Ruler className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Width fee ${pricing.widthFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} | no size fee.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {savedQuote && <QuoteToast key={savedQuote.id} quote={savedQuote} onClose={() => setSavedQuote(null)} />}
    </div>
  )
}

function QuoteToast({
  quote,
  onClose,
}: {
  quote: { id: string; title: string; total: number }
  onClose: () => void
}) {
  const navigate = useNavigate()
  return (
    <Toast
      title="Quote created!"
      description={`${quote.title} · $${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
      actionLabel="View quotes →"
      onAction={() => navigate('/quotes-list')}
      onClose={onClose}
    />
  )
}

function QuoteBuilderSkeleton() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card className="rounded-[30px] border-0 shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <CardContent className="p-8 space-y-5">
            <Skeleton className="h-3 w-32 bg-white/20" />
            <Skeleton className="h-9 w-3/4 bg-white/30" />
            <Skeleton className="h-3 w-2/3 bg-white/20" />
            <Skeleton className="h-3 w-1/2 bg-white/20" />
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-2.5 w-24 bg-slate-100" />
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-3 w-32 bg-slate-100" />
            <div className="grid grid-cols-2 gap-3 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-2xl bg-slate-100" />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100 space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-72 bg-slate-100" />
        </CardHeader>
        <CardContent className="p-6 grid gap-5 md:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24 bg-slate-100" />
              <Skeleton className="h-10 w-full rounded-xl bg-slate-100" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
