import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DIAMOND_TYPE_OPTIONS, JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { stockService } from '@/services/stockService'
import { emkayService } from '@/services/emkayService'
import { Toast } from '@/components/Toast'
import type { EmkayCatalogProduct, EmkayCategory, JewelryMetalOption, StockItem, StockStone } from '@/types'
import {
  Boxes, Camera, ChevronDown, ChevronUp, Copy, Crown, Diamond, ExternalLink, Gem,
  ImageOff, Loader2, Package, Plus, Search, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Same catalogue as the Quote builder, minus the "RN ring" configurator —
// that's a separate structured model/finger-size/band flow tied to the
// quote-specific rn_ring_models config, out of scope for a v1 stock catalog.
const JEWELRY_TYPE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'ring', label: 'Ring' },
  { key: 'pendant', label: 'Pendant' },
  { key: 'necklace', label: 'Necklace' },
  { key: 'bracelet', label: 'Bracelet' },
  { key: 'earrings', label: 'Earrings' },
  { key: 'cufflinks', label: 'Cufflinks' },
  { key: 'brooch', label: 'Brooch' },
  { key: 'anklet', label: 'Anklet' },
  { key: 'other', label: 'Other' },
]

const STATUS_OPTIONS: Array<{ key: StockItem['status']; label: string }> = [
  { key: 'AVAILABLE', label: 'Available' },
  { key: 'RESERVED', label: 'Reserved' },
  { key: 'SOLD', label: 'Sold' },
]

const STONE_ROLES: StockStone['role'][] = ['MAIN', 'SIDE', 'MELEE']

// Same per-role palette as the Quote builder's Stone Setting section
// (themeForRole in QuoteBuilder.tsx) — MAIN = gold, SIDE = sapphire,
// MELEE = platinum/teal — so a stone row reads the same in both builders.
const STONE_ROLE_THEME: Record<StockStone['role'], {
  label: string; icon: typeof Crown
  bar: string; ring: string; tint: string; chip: string; btn: string; header: string
}> = {
  MAIN: {
    label: 'Main', icon: Crown,
    bar: 'bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-600',
    ring: 'border-amber-200/80',
    tint: 'bg-gradient-to-br from-amber-50/70 via-white to-yellow-50/40',
    chip: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
    btn: 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500',
    header: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80',
  },
  SIDE: {
    label: 'Side', icon: Diamond,
    bar: 'bg-gradient-to-b from-sky-400 via-blue-500 to-indigo-600',
    ring: 'border-blue-200/80',
    tint: 'bg-gradient-to-br from-sky-50/70 via-white to-indigo-50/40',
    chip: 'bg-blue-100 text-blue-900 ring-1 ring-blue-200',
    btn: 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500',
    header: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/80',
  },
  MELEE: {
    label: 'Melee', icon: Sparkles,
    bar: 'bg-gradient-to-b from-teal-300 via-emerald-500 to-emerald-700',
    ring: 'border-emerald-200/80',
    tint: 'bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40',
    chip: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200',
    btn: 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500',
    header: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
  },
}

// Same amber treatment as the Quote builder's EMKAY panel, distinguished
// from MAIN stones (also amber) by icon (Gem) and copy.
const emkayTheme = {
  bar: 'bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600',
  ring: 'border-amber-200/80',
  tint: 'bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40',
  chip: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
  header: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80',
}

let uidCounter = 0
const nextUid = () => `row-${Date.now()}-${uidCounter++}`

interface EmkayStoneRowState {
  uid: string
  emkayProductId: string
  model: string
  name: string
  imageUrl: string | null
  certImageUrl: string | null
  priceUsd: number
  caratWeight: number | null
  shape: string | null
  sizeText: string | null
  treatment: string | null
  stoneType: string | null
  countryOfOrigin: string | null
  href: string | null
  setterType: string
  setterFeeOverride: string
  quantity: string
  comments: string
}

interface MetalRowState {
  uid: string
  metalKey: JewelryMetalOption
  grams: string
}

interface StoneRowState {
  uid: string
  role: StockStone['role']
  stoneType: 'natural' | 'lab-grown'
  sizeKey: string
  carats: string
  quantity: string
  setterType: string
  setterFeeOverride: string
  manualPrice: string
  comments: string
}

function parseNum(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

// Same input/label treatment as the Quote builder (rounded-2xl, slate-50 fill,
// focus:border-slate-400) so both builders read as the same product.
const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white'
const labelClass = 'text-sm font-semibold text-slate-900'
const cardClass = 'rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'

export function StockBuilderPage() {
  const { user } = useAuth()
  const config = useQuoteConfig()
  const navigate = useNavigate()
  const location = useLocation()
  const duplicateFrom = (location.state as { duplicateFrom?: StockItem } | null)?.duplicateFrom ?? null
  const prefillApplied = useRef(false)
  const [dismissedDuplicateBanner, setDismissedDuplicateBanner] = useState(false)

  const [title, setTitle] = useState('')
  const [sku, setSku] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [status, setStatus] = useState<StockItem['status']>('AVAILABLE')
  const [jewelryType, setJewelryType] = useState('ring')
  const [ringLabor, setRingLabor] = useState('none')
  const [ringWidth, setRingWidth] = useState('')
  const [fingerSize, setFingerSize] = useState('')
  const [extraCosts, setExtraCosts] = useState('0')
  const [engravingFee, setEngravingFee] = useState('0')
  const [markupMultiplier, setMarkupMultiplier] = useState('2.5')
  const [discountPercent, setDiscountPercent] = useState('0')
  const [internalNotes, setInternalNotes] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [metalRows, setMetalRows] = useState<MetalRowState[]>([
    { uid: nextUid(), metalKey: 'gold-14k-yellow', grams: '' },
  ])
  const [stones, setStones] = useState<StoneRowState[]>([])

  // ── EMKAY Gemstones Catalog — real stones the shop buys from EMKAY,
  // full price counts as material cost (unlike a customer-supplied stone). ──
  const [emkayStones, setEmkayStones] = useState<EmkayStoneRowState[]>([])
  const [emkayOpen, setEmkayOpen] = useState(false)
  const [emkayConfigured, setEmkayConfigured] = useState<boolean | null>(null)
  const [emkayCategories, setEmkayCategories] = useState<EmkayCategory[]>([])
  const [emkayCategoryId, setEmkayCategoryId] = useState('')
  const [emkaySearchText, setEmkaySearchText] = useState('')
  const [emkayDebouncedSearch, setEmkayDebouncedSearch] = useState('')
  const [emkayPage, setEmkayPage] = useState(0)
  const [emkayResults, setEmkayResults] = useState<EmkayCatalogProduct[]>([])
  const [emkayTotalPages, setEmkayTotalPages] = useState(0)
  const [emkayLoading, setEmkayLoading] = useState(false)
  const [emkayError, setEmkayError] = useState<string | null>(null)

  useEffect(() => {
    if (!emkayOpen || emkayConfigured !== null) return
    emkayService.status().then(setEmkayConfigured).catch(() => setEmkayConfigured(false))
    emkayService.categories().then(setEmkayCategories).catch(() => setEmkayCategories([]))
  }, [emkayOpen, emkayConfigured])

  useEffect(() => {
    const t = setTimeout(() => setEmkayDebouncedSearch(emkaySearchText.trim()), 400)
    return () => clearTimeout(t)
  }, [emkaySearchText])

  useEffect(() => { setEmkayPage(0) }, [emkayDebouncedSearch, emkayCategoryId])

  useEffect(() => {
    if (!emkayOpen || emkayConfigured !== true) return
    let cancelled = false
    setEmkayLoading(true)
    setEmkayError(null)
    emkayService.browse({ search: emkayDebouncedSearch, categoryId: emkayCategoryId || undefined, page: emkayPage, size: 12 })
      .then(res => {
        if (cancelled) return
        setEmkayResults(res.items)
        setEmkayTotalPages(res.totalPages)
      })
      .catch(() => { if (!cancelled) setEmkayError('Could not load the EMKAY catalog. Try again.') })
      .finally(() => { if (!cancelled) setEmkayLoading(false) })
    return () => { cancelled = true }
  }, [emkayOpen, emkayConfigured, emkayDebouncedSearch, emkayCategoryId, emkayPage])

  const addEmkayStone = (product: EmkayCatalogProduct) => {
    setEmkayStones(prev => [...prev, {
      uid: nextUid(),
      emkayProductId: product.productId,
      model: product.model ?? '',
      name: product.name ?? product.model ?? `EMKAY #${product.productId}`,
      imageUrl: product.imageUrl,
      certImageUrl: product.certImageUrl,
      priceUsd: product.price ?? 0,
      caratWeight: product.caratWeight,
      shape: product.shape,
      sizeText: product.size,
      treatment: product.treatment,
      stoneType: product.stoneType,
      countryOfOrigin: product.countryOfOrigin,
      href: product.href,
      setterType: config.setters[0]?.typeKey ?? '',
      setterFeeOverride: '',
      quantity: '1',
      comments: '',
    }])
  }
  const removeEmkayStone = (uid: string) => setEmkayStones(prev => prev.filter(s => s.uid !== uid))
  const patchEmkayStone = (uid: string, patch: Partial<EmkayStoneRowState>) =>
    setEmkayStones(prev => prev.map(s => (s.uid === uid ? { ...s, ...patch } : s)))

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ variant: 'success' | 'error'; title: string; description?: string } | null>(null)

  // ── Prefill from "Duplicate" (navigated with the full StockItem in state) ──
  useEffect(() => {
    if (!duplicateFrom || prefillApplied.current) return
    prefillApplied.current = true
    setTitle(duplicateFrom.title ? `${duplicateFrom.title} (copy)` : '')
    setSku(duplicateFrom.sku ?? '')
    setQuantity(String(duplicateFrom.quantity ?? 1))
    setStatus('AVAILABLE')
    setJewelryType(duplicateFrom.jewelryType ?? 'ring')
    setRingLabor(duplicateFrom.ringLabor ?? 'none')
    setRingWidth(duplicateFrom.ringWidth ? String(duplicateFrom.ringWidth) : '')
    setFingerSize(duplicateFrom.fingerSize ? String(duplicateFrom.fingerSize) : '')
    setExtraCosts(String(duplicateFrom.extraCosts ?? 0))
    setEngravingFee(String(duplicateFrom.engravingFee ?? 0))
    setMarkupMultiplier(String(duplicateFrom.markupMultiplier ?? 2.5))
    setDiscountPercent(String(duplicateFrom.discountPercent ?? 0))
    setInternalNotes(duplicateFrom.internalNotes ?? '')
    setPhoto(duplicateFrom.photo ?? null)
    if (duplicateFrom.metalRows?.length) {
      setMetalRows(duplicateFrom.metalRows.map(r => ({
        uid: nextUid(), metalKey: r.metalKey, grams: String(r.weightGrams ?? ''),
      })))
    }
    if (duplicateFrom.stones?.length) {
      setStones(duplicateFrom.stones.map(s => ({
        uid: nextUid(),
        role: s.role,
        stoneType: s.stoneType,
        sizeKey: s.sizeKey ?? '',
        carats: String(s.carats ?? ''),
        quantity: '1',
        setterType: s.setterType ?? '',
        setterFeeOverride: s.setterFeeOverride != null ? String(s.setterFeeOverride) : '',
        manualPrice: s.manualPrice != null ? String(s.manualPrice) : '',
        comments: s.comments ?? '',
      })))
    }
    if (duplicateFrom.emkayStones?.length) {
      setEmkayStones(duplicateFrom.emkayStones.map(es => ({
        uid: nextUid(),
        emkayProductId: es.emkayProductId ?? '',
        model: es.model ?? '',
        name: es.name,
        imageUrl: es.imageUrl ?? null,
        certImageUrl: es.certImageUrl ?? null,
        priceUsd: es.priceUsd,
        caratWeight: es.caratWeight ?? null,
        shape: es.shape ?? null,
        sizeText: es.sizeText ?? null,
        treatment: es.treatment ?? null,
        stoneType: es.stoneType ?? null,
        countryOfOrigin: es.countryOfOrigin ?? null,
        href: es.href ?? null,
        setterType: es.setterType ?? '',
        setterFeeOverride: es.setterFeeOverride != null ? String(es.setterFeeOverride) : '',
        quantity: String(es.quantity ?? 1),
        comments: es.comments ?? '',
      })))
    }
  }, [duplicateFrom])

  const addMetalRow = () => {
    if (metalRows.length >= 3) return
    setMetalRows(rows => [...rows, { uid: nextUid(), metalKey: 'gold-14k-yellow', grams: '' }])
  }
  const removeMetalRow = (uid: string) => setMetalRows(rows => rows.filter(r => r.uid !== uid))
  const updateMetalRow = (uid: string, patch: Partial<MetalRowState>) =>
    setMetalRows(rows => rows.map(r => (r.uid === uid ? { ...r, ...patch } : r)))

  const addStoneRow = (role: StockStone['role']) =>
    setStones(rows => [...rows, {
      uid: nextUid(), role, stoneType: 'natural', sizeKey: '', carats: '', quantity: '1',
      setterType: config.setters[0]?.typeKey ?? '', setterFeeOverride: '', manualPrice: '', comments: '',
    }])
  const removeStoneRow = (uid: string) => setStones(rows => rows.filter(r => r.uid !== uid))
  const updateStoneRow = (uid: string, patch: Partial<StoneRowState>) =>
    setStones(rows => rows.map(r => (r.uid === uid ? { ...r, ...patch } : r)))

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

  // ── Live cost breakdown — same formula as the Quote builder ────────────────
  const materialCost = metalRows.reduce(
    (sum, r) => sum + (config.metalPriceMap[r.metalKey] ?? 0) * parseNum(r.grams), 0,
  )
  const ringLaborFee = config.ringLaborMap[ringLabor]?.fee ?? 0

  const stoneBreakdown = stones.map(s => {
    const sizeCfg = config.diamondSizeFor(s.stoneType, s.sizeKey)
    const mult = DIAMOND_TYPE_OPTIONS[s.stoneType].multiplier
    const pricePerCarat = (sizeCfg?.basePrice ?? 0) * mult
    const carats = parseNum(s.carats)
    const hasManualPrice = s.manualPrice.trim() !== ''
    const cost = hasManualPrice ? parseNum(s.manualPrice) : carats * pricePerCarat
    const qty = Math.max(1, parseNum(s.quantity || '1') || 1)
    const feeOverride = s.setterFeeOverride.trim()
    const setterFee = feeOverride !== '' ? parseNum(feeOverride) : (config.setterMap[s.setterType]?.fee ?? 0)
    const labor = qty * setterFee
    return { uid: s.uid, cost, labor, contribution: cost + labor }
  })
  const stoneCost = stoneBreakdown.reduce((s, b) => s + b.cost, 0)
  const settingFee = stoneBreakdown.reduce((s, b) => s + b.labor, 0)

  // EMKAY-supplied stones: real inventory bought from EMKAY, so the full
  // price counts as material cost, same as the Quote builder.
  const emkayBreakdown = emkayStones.map(es => {
    const qty = Math.max(1, parseNum(es.quantity || '1') || 1)
    const feeOverride = es.setterFeeOverride.trim()
    const setterFee = feeOverride !== '' ? parseNum(feeOverride) : (config.setterMap[es.setterType]?.fee ?? 0)
    return { uid: es.uid, cost: qty * es.priceUsd, labor: qty * setterFee }
  })
  const emkayCost = emkayBreakdown.reduce((s, b) => s + b.cost, 0)
  const emkaySettingFee = emkayBreakdown.reduce((s, b) => s + b.labor, 0)

  const totalCost =
    materialCost + ringLaborFee + settingFee + stoneCost + emkayCost + emkaySettingFee +
    Math.max(0, parseNum(engravingFee)) + parseNum(extraCosts)

  const markup = parseNum(markupMultiplier) || 2.5
  const discount = Math.max(0, Math.min(100, parseNum(discountPercent)))
  const retailBeforeDiscount = totalCost * markup
  const retailPrice = retailBeforeDiscount * (1 - discount / 100)

  const canSave = title.trim() !== '' && !saving
  const showDuplicateBanner = duplicateFrom && !dismissedDuplicateBanner

  const handleSave = async () => {
    if (!user || !canSave) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        sku: sku.trim() || null,
        quantity: Math.max(1, parseNum(quantity) || 1),
        status,
        jewelryType,
        ringLabor,
        ringWidth: parseNum(ringWidth) || null,
        fingerSize: parseNum(fingerSize) || null,
        laborHours: null,
        hourlyRate: null,
        extraCosts: parseNum(extraCosts),
        total: totalCost,
        markupMultiplier: markup,
        discountPercent: discount,
        photo,
        internalNotes: internalNotes.trim() || null,
        engravingFee: parseNum(engravingFee),
        setterType: null,
        archived: false,
        metalRows: metalRows
          .filter(r => parseNum(r.grams) > 0)
          .map((r, i) => ({ metalKey: r.metalKey, weightGrams: parseNum(r.grams), position: i })),
        stones: stones.map((s, i) => {
          const b = stoneBreakdown.find(x => x.uid === s.uid)
          return {
            role: s.role,
            stoneType: s.stoneType,
            stoneCategory: 'DIAMOND',
            sizeKey: s.sizeKey,
            carats: parseNum(s.carats),
            setterType: s.setterType,
            setterFeeOverride: s.setterFeeOverride.trim() !== '' ? parseNum(s.setterFeeOverride) : null,
            labReport: null,
            sortOrder: i,
            shape: null, color: null, cut: null, clarity: null,
            manualPrice: s.manualPrice.trim() !== '' ? parseNum(s.manualPrice) : null,
            comments: s.comments.trim() || null,
            markupMultiplier: null,
            contribution: b?.contribution ?? null,
          }
        }),
        emkayStones: emkayStones.map((es, i) => ({
          emkayProductId: es.emkayProductId || null,
          model: es.model || null,
          name: es.name,
          imageUrl: es.imageUrl,
          certImageUrl: es.certImageUrl,
          priceUsd: es.priceUsd,
          caratWeight: es.caratWeight,
          shape: es.shape,
          sizeText: es.sizeText,
          treatment: es.treatment,
          stoneType: es.stoneType,
          countryOfOrigin: es.countryOfOrigin,
          href: es.href,
          setterType: es.setterType,
          setterFeeOverride: es.setterFeeOverride.trim() !== '' ? parseNum(es.setterFeeOverride) : null,
          quantity: Math.max(1, parseNum(es.quantity || '1') || 1),
          sortOrder: i,
          comments: es.comments.trim() || null,
        })),
      }
      await stockService.create(payload, Number(user.id))
      setToast({ variant: 'success', title: 'Stock piece saved', description: `"${title.trim()}" was added to stock.` })
      // Reset for the next entry, same UX as the quote builder after submit.
      setTitle(''); setSku(''); setQuantity('1'); setStatus('AVAILABLE')
      setMetalRows([{ uid: nextUid(), metalKey: 'gold-14k-yellow', grams: '' }])
      setStones([]); setEmkayStones([]); setPhoto(null); setInternalNotes('')
      setExtraCosts('0'); setEngravingFee('0')
    } catch (err) {
      console.error(err)
      setToast({ variant: 'error', title: 'Could not save', description: 'Please check the form and try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Duplicate banner — same sky treatment as the Quote builder ─────── */}
      {showDuplicateBanner && (
        <Card className="rounded-[24px] border border-sky-200 bg-sky-50/60 shadow-[0_20px_60px_rgba(56,189,248,0.16)]">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Copy className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Duplicating stock piece</p>
                <p className="mt-1 text-sm text-slate-700">
                  Prefilled from <strong>{duplicateFrom?.title}</strong>. Adjust anything — saving creates a{' '}
                  <strong>new</strong> stock piece and leaves the original untouched.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissedDuplicateBanner(true)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700"
            >
              Dismiss
            </button>
          </CardContent>
        </Card>
      )}

      {/* ── Hero — same theme-primary treatment as the Quote builder ───────── */}
      <section>
        <Card className="rounded-[30px] border-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
          <CardContent className="relative p-5 sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.24),transparent_25%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.18),transparent_28%)]" />
            <div className="relative">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                <Boxes className="h-4 w-4" />
                Stock pricing engine
              </div>
              <h2 className="mt-4 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
                Price and catalog a piece the store already has in stock.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:mt-4">
                Same pricing engine as the Quote builder — metal, stones and labor — plus a{' '}
                <strong>SKU</strong> and <strong>quantity</strong> so it lives in your own inventory, not a customer order.
              </p>

              <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Material cost</p>
                  <p className="mt-2 text-2xl font-semibold">${materialCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Stone + setting</p>
                  <p className="mt-2 text-2xl font-semibold">${(stoneCost + settingFee + emkayCost + emkaySettingFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Internal cost</p>
                  <p className="mt-2 text-2xl font-semibold">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Retail price</p>
                  <p className="mt-2 text-2xl font-semibold text-amber-300">${retailPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {/* Basics */}
          <Card className={cardClass}>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-900">Piece details</CardTitle>
              <p className="text-sm text-slate-500">Title, SKU, quantity and type.</p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <label className={labelClass}>Title</label>
                <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 18K Yellow Gold Tennis Bracelet" />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>SKU</label>
                <input className={inputClass} value={sku} onChange={e => setSku(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Quantity in stock</label>
                <input type="number" min={0} className={inputClass} value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Jewelry type</label>
                <select className={inputClass} value={jewelryType} onChange={e => setJewelryType(e.target.value)}>
                  {JEWELRY_TYPE_OPTIONS.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Status</label>
                <select className={inputClass} value={status} onChange={e => setStatus(e.target.value as StockItem['status'])}>
                  {STATUS_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Metal rows */}
          <Card className={cardClass}>
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">Metal</CardTitle>
                <p className="text-sm text-slate-500">Live spot-tied $/gram, same as the Quote builder.</p>
              </div>
              {metalRows.length < 3 && (
                <button type="button" onClick={addMetalRow} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800">
                  <Plus className="h-3.5 w-3.5" /> Add metal
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {metalRows.map(row => (
                <div key={row.uid} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_140px_auto]">
                  <div className="space-y-2">
                    <label className={labelClass}>Metal</label>
                    <select className={inputClass} value={row.metalKey} onChange={e => updateMetalRow(row.uid, { metalKey: e.target.value as JewelryMetalOption })}>
                      {Object.entries(JEWELRY_METAL_OPTIONS).filter(([k]) => !['gold-14k', 'gold-18k'].includes(k)).map(([key, opt]) => (
                        <option key={key} value={key}>{opt.label} — ${(config.metalPriceMap[key as JewelryMetalOption] ?? 0).toFixed(2)}/g</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className={labelClass}>Grams</label>
                    <input type="number" min={0} step="0.01" className={inputClass} value={row.grams} onChange={e => updateMetalRow(row.uid, { grams: e.target.value })} />
                  </div>
                  <button type="button" onClick={() => removeMetalRow(row.uid)} disabled={metalRows.length === 1}
                    className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <p className="pt-1 text-xs text-slate-400">
                Material cost: <strong className="text-slate-700">${materialCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              </p>
            </CardContent>
          </Card>

          {/* Stones — same MAIN/SIDE/MELEE grouping + gold/sapphire/emerald
              palette as the Quote builder's Stone Setting section. */}
          <Card id="stock-stones" className={`relative overflow-hidden ${cardClass}`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.10),transparent_45%),radial-gradient(circle_at_top_right,rgba(244,63,94,0.08),transparent_50%)]" aria-hidden />
            <CardHeader className="relative border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 via-rose-100 to-blue-100 text-slate-700 shadow-sm ring-1 ring-white/80">
                  <Diamond className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Stone Setting</CardTitle>
                  <p className="text-xs text-slate-500">Main, side and melee — same pricing lookups as the Quote builder.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {STONE_ROLES.map(role => {
                const theme = STONE_ROLE_THEME[role]
                const Icon = theme.icon
                const items = stones.filter(s => s.role === role)
                const hint = role === 'MAIN' ? 'Center stones. Add one or several.'
                  : role === 'SIDE' ? 'Accent stones. Add as many as you need.'
                  : 'Pavé / melee. Add as many as you need.'
                return (
                  <div key={role} className="group/section relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md">
                    <span className={`absolute inset-y-0 left-0 w-1 ${theme.bar} opacity-80`} aria-hidden />
                    <div className="flex items-center justify-between gap-3 pl-2">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${theme.header}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            {theme.label} stones
                            <span className={`ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${theme.chip}`}>
                              {items.length}
                            </span>
                          </h3>
                          <p className="text-xs text-slate-500">{hint}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => addStoneRow(role)}
                        className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition ${theme.btn}`}>
                        <Plus className="h-3 w-3" /> Add {theme.label.toLowerCase()}
                      </button>
                    </div>
                    <div className="mt-3 pl-2">
                      {items.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">None yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {items.map(s => {
                            const b = stoneBreakdown.find(x => x.uid === s.uid)
                            return (
                              <div key={s.uid} className={`relative overflow-hidden rounded-2xl border ${theme.ring} ${theme.tint} p-4 shadow-sm transition hover:shadow-md`}>
                                <span className={`absolute inset-y-0 left-0 w-1.5 ${theme.bar}`} aria-hidden />
                                <div className="flex items-center justify-between gap-2 pl-2">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.chip}`}>
                                    <Icon className="h-3 w-3" /> {theme.label} stone
                                  </span>
                                  <button type="button" onClick={() => removeStoneRow(s.uid)} aria-label="Remove stone"
                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-3 pl-2 sm:grid-cols-4">
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
                                    <select className={inputClass} value={s.stoneType} onChange={e => updateStoneRow(s.uid, { stoneType: e.target.value as StoneRowState['stoneType'] })}>
                                      <option value="natural">Natural</option>
                                      <option value="lab-grown">Lab</option>
                                    </select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Size key</label>
                                    <input className={inputClass} value={s.sizeKey} onChange={e => updateStoneRow(s.uid, { sizeKey: e.target.value })} placeholder="e.g. 1" />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Carats</label>
                                    <input type="number" min={0} step="0.01" className={inputClass} value={s.carats} onChange={e => updateStoneRow(s.uid, { carats: e.target.value })} />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Qty</label>
                                    <input type="number" min={1} className={inputClass} value={s.quantity} onChange={e => updateStoneRow(s.uid, { quantity: e.target.value })} />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Setter</label>
                                    <select className={inputClass} value={s.setterType} onChange={e => updateStoneRow(s.uid, { setterType: e.target.value })}>
                                      <option value="">—</option>
                                      {config.setters.map(st => <option key={st.typeKey} value={st.typeKey}>{st.label}</option>)}
                                    </select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Setter fee override</label>
                                    <input type="number" min={0} className={inputClass} value={s.setterFeeOverride} onChange={e => updateStoneRow(s.uid, { setterFeeOverride: e.target.value })} placeholder={`$${config.setterMap[s.setterType]?.fee ?? 0}`} />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Manual price override</label>
                                    <input type="number" min={0} className={inputClass} value={s.manualPrice} onChange={e => updateStoneRow(s.uid, { manualPrice: e.target.value })} placeholder="Optional" />
                                  </div>
                                  <div className="flex items-end pb-3">
                                    <p className="text-xs text-slate-500">
                                      Cost ${b ? b.cost.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'} + labor ${b ? b.labor.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* ── EMKAY Gemstones Catalog ─────────────────────────────── */}
              <div className="group/section relative overflow-hidden rounded-2xl border border-amber-100 bg-white p-4 shadow-sm transition hover:shadow-md">
                <span className={`absolute inset-y-0 left-0 w-1 ${emkayTheme.bar} opacity-80`} aria-hidden />
                <div className="flex w-full items-center justify-between gap-3 pl-2">
                  <button type="button" onClick={() => setEmkayOpen(o => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${emkayTheme.header}`}>
                      <Gem className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900">
                        EMKAY Catalog
                        <span className={`ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${emkayTheme.chip}`}>
                          {emkayStones.length}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500">Real stones from EMKAY Gemstones — shop buys these directly.</p>
                    </div>
                  </button>
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => setEmkayOpen(true)}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:brightness-95 ${emkayTheme.header}`}>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                    <button type="button" onClick={() => setEmkayOpen(o => !o)} aria-label={emkayOpen ? 'Collapse' : 'Expand'}>
                      {emkayOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                    </button>
                  </span>
                </div>

                {emkayStones.length > 0 && (
                  <div className="mt-3 space-y-3 pl-2">
                    {emkayStones.map((es, idx) => (
                      <div key={es.uid} className={`relative overflow-hidden rounded-2xl border ${emkayTheme.ring} ${emkayTheme.tint} p-4 shadow-sm transition hover:shadow-md`}>
                        <span className={`absolute inset-y-0 left-0 w-1.5 ${emkayTheme.bar}`} aria-hidden />
                        <div className="flex gap-3 pl-2">
                          {es.imageUrl && (
                            <img src={es.imageUrl} alt={es.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${emkayTheme.chip}`}>
                                From EMKAY · #{idx + 1}
                              </span>
                              <button type="button" onClick={() => removeEmkayStone(es.uid)} aria-label="Remove EMKAY stone"
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <p className="truncate text-sm font-semibold text-slate-900">{es.name}</p>
                            <p className="text-xs text-slate-500">
                              {[es.model, es.shape, es.caratWeight ? `${es.caratWeight} ct` : null, es.countryOfOrigin].filter(Boolean).join(' · ') || '—'}
                            </p>
                            {es.href && (
                              <a href={es.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800">
                                View on emkaygemstones.com <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</label>
                                <input type="number" min={1} step={1} value={es.quantity}
                                  onChange={e => patchEmkayStone(es.uid, { quantity: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type of setting</label>
                                <select value={es.setterType} onChange={e => patchEmkayStone(es.uid, { setterType: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                                  {config.setters.map(s => (
                                    <option key={s.typeKey} value={s.typeKey}>{s.label} — ${s.fee}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price each</label>
                                <input type="number" min={0} step={0.01} value={es.priceUsd}
                                  onChange={e => patchEmkayStone(es.uid, { priceUsd: Number(e.target.value) || 0 })}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custom setting fee (optional)</label>
                                <input type="text" inputMode="decimal" value={es.setterFeeOverride}
                                  placeholder={`Default — $${config.setterMap[es.setterType]?.fee ?? 0}`}
                                  onChange={e => patchEmkayStone(es.uid, { setterFeeOverride: e.target.value })}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {emkayOpen && (
                  <div className="mt-4 space-y-3 border-t border-amber-100 pl-2 pt-4">
                    {emkayConfigured === false && (
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        EMKAY catalog isn't connected yet — set EMKAY_API_KEY on the backend to enable this panel.
                      </p>
                    )}
                    {emkayConfigured === true && (
                      <>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select value={emkayCategoryId} onChange={e => setEmkayCategoryId(e.target.value)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-56">
                            <option value="">All categories</option>
                            {emkayCategories.map(c => <option key={c.categoryId} value={c.categoryId}>{c.name ?? c.categoryId}</option>)}
                          </select>
                          <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input type="text" value={emkaySearchText} onChange={e => setEmkaySearchText(e.target.value)}
                              placeholder="Search by name, shape, type, origin…"
                              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-slate-400" />
                          </div>
                        </div>

                        {emkayError && <p className="text-xs text-rose-600">{emkayError}</p>}
                        {emkayLoading && <p className="text-xs text-slate-400">Loading EMKAY catalog…</p>}
                        {!emkayLoading && emkayResults.length === 0 && !emkayError && (
                          <p className="text-xs text-slate-400">No stones match your search.</p>
                        )}

                        {emkayResults.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {emkayResults.map(p => (
                              <button type="button" key={p.productId} onClick={() => addEmkayStone(p)}
                                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-amber-300 hover:shadow-md">
                                {p.imageUrl && <img src={p.imageUrl} alt={p.name ?? p.model ?? ''} className="h-32 w-full object-cover" />}
                                <div className="space-y-1 p-3">
                                  <p className="truncate text-xs font-semibold text-slate-900">{p.name ?? p.model}</p>
                                  <p className="truncate text-[11px] text-slate-500">
                                    {[p.shape, p.caratWeight ? `${p.caratWeight} ct` : null, p.countryOfOrigin].filter(Boolean).join(' · ') || '—'}
                                  </p>
                                  <div className="flex items-center justify-between gap-2 pt-1">
                                    <p className="text-sm font-bold text-amber-700">{p.price != null ? `$${p.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}</p>
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm">
                                      + Add
                                    </span>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {emkayTotalPages > 1 && (
                          <div className="flex items-center justify-between pt-1">
                            <button type="button" onClick={() => setEmkayPage(p => Math.max(0, p - 1))} disabled={emkayPage === 0}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40">
                              Previous
                            </button>
                            <span className="text-xs text-slate-400">Page {emkayPage + 1} of {emkayTotalPages}</span>
                            <button type="button" onClick={() => setEmkayPage(p => Math.min(emkayTotalPages - 1, p + 1))} disabled={emkayPage >= emkayTotalPages - 1}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40">
                              Next
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Labor / extras */}
          <Card className={cardClass}>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-900">Labor & extras</CardTitle>
              <p className="text-sm text-slate-500">Ring labor tier, dimensions and one-off fees.</p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 sm:grid-cols-3">
              <div className="space-y-2">
                <label className={labelClass}>Ring labor tier</label>
                <select className={inputClass} value={ringLabor} onChange={e => setRingLabor(e.target.value)}>
                  <option value="none">None</option>
                  {Object.entries(config.ringLaborMap).map(([key, tier]) => (
                    <option key={key} value={key}>{tier.label} — ${tier.fee}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Ring width (mm)</label>
                <input type="number" min={0} step="0.1" className={inputClass} value={ringWidth} onChange={e => setRingWidth(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Finger size</label>
                <input type="number" min={0} step="0.25" className={inputClass} value={fingerSize} onChange={e => setFingerSize(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Extra costs ($)</label>
                <input type="number" min={0} className={inputClass} value={extraCosts} onChange={e => setExtraCosts(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Engraving fee ($)</label>
                <input type="number" min={0} className={inputClass} value={engravingFee} onChange={e => setEngravingFee(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className={cardClass}>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-900">Internal notes</CardTitle>
              <p className="text-sm text-slate-500">Sourcing, condition, reminders — never shown outside the workspace.</p>
            </CardHeader>
            <CardContent className="pt-6">
              <textarea rows={3} className={inputClass} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} placeholder="Sourcing, condition, reminders…" />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: photo + pricing + save */}
        <div className="space-y-4">
          <Card className={cardClass}>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-900">Photo</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {photo ? (
                <div className="relative">
                  <img src={photo} alt="Stock piece" className="aspect-square w-full rounded-2xl object-cover" />
                  <button type="button" onClick={handleRemovePhoto} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-slate-300">
                  <ImageOff className="h-8 w-8" />
                  <span className="text-xs">No photo</span>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => photoInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400">
                  <Upload className="h-3.5 w-3.5" /> Upload
                </button>
                <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400">
                  <Camera className="h-3.5 w-3.5" /> Camera
                </button>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-900">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className={labelClass}>Markup ×</label>
                  <input type="number" min={1} step="0.1" className={inputClass} value={markupMultiplier} onChange={e => setMarkupMultiplier(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Discount %</label>
                  <input type="number" min={0} max={100} className={inputClass} value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} />
                </div>
              </div>
              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between text-slate-500"><span>Internal cost</span><span>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600"><span>Discount</span><span>−{discount}%</span></div>
                )}
                <div className="flex justify-between text-base font-bold text-slate-900"><span>Retail price</span><span>${retailPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
              </div>
            </CardContent>
          </Card>

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save stock piece'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/stock-list')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-400"
          >
            <Package className="h-4 w-4" /> View all stock
          </button>
        </div>
      </div>

      {toast && (
        <Toast
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

export default StockBuilderPage
