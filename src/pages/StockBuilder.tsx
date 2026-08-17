import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DIAMOND_TYPE_OPTIONS, JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { useQuoteConfig, normalizeSizeKey } from '@/hooks/useQuoteConfig'
import { METAL_GROUPS } from '@/hooks/useQuoteBuilder'
import { computeRnBreakdown, type RnStoneType } from '@/lib/rnPricing'
import { compareStoneTypes } from '@/lib/stoneTypeCompare'
import { StoneTypeCompareDialog } from '@/components/StoneTypeCompareDialog'
import { CreateLabSizeDialog } from '@/components/CreateLabSizeDialog'
import { configService } from '@/services/configService'
import { gemstoneService } from '@/services/gemstoneService'
import { companyService, ENGRAVING_SLIDER_DEFAULTS } from '@/services/companyService'
import { stockService } from '@/services/stockService'
import { emkayService } from '@/services/emkayService'
import { Toast } from '@/components/Toast'
import type {
  EmkayCatalogProduct, EmkayCategory, GemstonePrice, JewelryMetalOption, StockItem, StockStone,
} from '@/types'
import {
  Boxes, Camera, Check, ChevronDown, ChevronUp, Copy, Crown, Diamond, ExternalLink, Gem,
  ImageOff, ImagePlus, Loader2, Package, Plus, Scale, Search, Sparkles, Trash2, Upload, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Same catalogue as the Quote builder, including the "RN ring" configurator —
// v2: full parity with the Quote builder's pre-configured RN model/finger-size
// /band flow, tied to the same quote-specific rn_ring_models config.
const JEWELRY_TYPE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'ring', label: 'Ring' },
  { key: 'rn', label: 'RN ring' },
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

type StoneRoleKey = StockStone['role']

const DEFAULT_MARKUP = 2.5
const MARKUP_PRESETS = [2, 2.5, 3] as const
const DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 30] as const

const diamondTypeKeys = Object.keys(DIAMOND_TYPE_OPTIONS) as Array<keyof typeof DIAMOND_TYPE_OPTIONS>

// Standard diamond shapes offered to the user. Empty value = unspecified.
const STONE_SHAPES = [
  'Round', 'Princess', 'Oval', 'Cushion', 'Emerald',
  'Pear', 'Marquise', 'Asscher', 'Radiant', 'Heart',
] as const
const STONE_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const
const STONE_CUTS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'] as const
const STONE_CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'] as const

// Turn a free-text lab report like "GIA 1234567890" into a deep-link to the
// issuing lab's online verification page. Mirrors QuoteBuilder's helper 1:1.
function labReportVerifyUrl(raw: string): { url: string; lab: string; valid: boolean } | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  const upper = text.toUpperCase()
  const number = text.replace(/[\s-]/g, '').match(/\d{4,}/)?.[0]

  if (upper.includes('IGI')) {
    const valid = !!number && number.length >= 7
    return { url: 'https://www.igi.org/verify-your-report/', lab: 'IGI', valid }
  }
  const valid = !!number && number.length >= 7 && number.length <= 11
  return {
    url: number
      ? `https://www.gia.edu/report-check?reportno=${number}`
      : 'https://www.gia.edu/report-check',
    lab: 'GIA',
    valid,
  }
}

// Same per-role palette as the Quote builder's Stone Setting section
// (themeForRole in QuoteBuilder.tsx) — MAIN = gold, SIDE = sapphire,
// MELEE = platinum/teal — so a stone row reads the same in both builders.
const STONE_ROLE_THEME: Record<StoneRoleKey, {
  label: string; icon: typeof Crown
  bar: string; dot: string; ring: string; tint: string; chip: string; btn: string; header: string
}> = {
  MAIN: {
    label: 'Main', icon: Crown,
    bar: 'bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-600',
    dot: 'bg-amber-500',
    ring: 'border-amber-200/80',
    tint: 'bg-gradient-to-br from-amber-50/70 via-white to-yellow-50/40',
    chip: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
    btn: 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500',
    header: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80',
  },
  SIDE: {
    label: 'Side', icon: Diamond,
    bar: 'bg-gradient-to-b from-sky-400 via-blue-500 to-indigo-600',
    dot: 'bg-blue-500',
    ring: 'border-blue-200/80',
    tint: 'bg-gradient-to-br from-sky-50/70 via-white to-indigo-50/40',
    chip: 'bg-blue-100 text-blue-900 ring-1 ring-blue-200',
    btn: 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500',
    header: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/80',
  },
  MELEE: {
    label: 'Melee', icon: Sparkles,
    bar: 'bg-gradient-to-b from-teal-300 via-emerald-500 to-emerald-700',
    dot: 'bg-emerald-500',
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

// Full parity with the Quote builder's StoneRow: category, gemstone linkage,
// grading fields, lab report, per-stone markup, collapse/expand.
interface StoneRowState {
  uid: string
  role: StoneRoleKey
  stoneType: 'natural' | 'lab-grown'
  /** False until the jeweler explicitly picks Natural or Lab — the stone
   *  can't be collapsed/saved on the default value alone. */
  stoneTypeChosen: boolean
  /** Only surfaced on MAIN stones — SIDE/MELEE are always 'diamond'. */
  stoneCategory: 'diamond' | 'gemstone'
  gemstoneId: string
  sizeKey: string
  carats: string
  amount: string
  setterType: string
  setterFeeOverride: string
  labReport: string
  shape: string
  color: string
  cut: string
  clarity: string
  // For a custom (no-preset) size this is DERIVED — kept in sync from
  // manualPricePerCarat × carats rather than typed directly.
  manualPrice: string
  /** Cost per carat the jeweler types by hand for a custom (no-preset) size
   *  — the system multiplies by carats to get manualPrice/the total. Only
   *  used/shown when sizeKey === '' (no size/cut match in the system). */
  manualPricePerCarat: string
  comments: string
  /** Optional per-stone markup. MAIN only — overrides the piece-level markup
   *  just for this stone's (cost + setting labor). */
  markup: string
  collapsed: boolean
}

interface AttachmentRowState {
  uid: string
  backendId?: number | null
  photo: string
  caption: string
  createdAt: string
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

/** One label/value row in the RN breakdown panel. Mirrors QuoteBuilder's RnRow. */
function RnRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-slate-600">
      <dt>{label}</dt>
      <dd className="font-medium tabular-nums text-slate-900">{value}</dd>
    </div>
  )
}

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
  const rnMode = jewelryType === 'rn'
  const [ringLabor, setRingLabor] = useState('none')
  const [ringWidth, setRingWidth] = useState('')
  const [fingerSize, setFingerSize] = useState('')
  const [extraCosts, setExtraCosts] = useState('0')
  const [engravingFee, setEngravingFee] = useState(0)
  const [engravingBounds, setEngravingBounds] = useState<{ min: number; max: number; step: number; default: number }>(
    { ...ENGRAVING_SLIDER_DEFAULTS },
  )
  const [markupText, setMarkupText] = useState(String(DEFAULT_MARKUP))
  const [discountText, setDiscountText] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  // Actual scale weight of the finished piece — a record only, never fed
  // into the cost calculation (that stays driven by the metal rows).
  const [finishedWeight, setFinishedWeight] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [metalRows, setMetalRows] = useState<MetalRowState[]>([
    { uid: nextUid(), metalKey: 'gold-14k-yellow', grams: '' },
  ])
  const selectedMetal = metalRows[0]?.metalKey ?? 'gold-14k-yellow'
  const [stones, setStones] = useState<StoneRowState[]>([])
  const [gemstones, setGemstones] = useState<GemstonePrice[]>([])
  const [compareUid, setCompareUid] = useState<string | null>(null)

  // ── RN ring mode ─────────────────────────────────────────────────────
  const [rnModelKey, setRnModelKey] = useState('')
  const [rnFingerSize, setRnFingerSize] = useState<number>(0)
  const [rnStoneType, setRnStoneType] = useState<RnStoneType>('natural')
  const [rnBandMode, setRnBandMode] = useState<'eternity' | 'other'>('eternity')
  const [rnCustomStones, setRnCustomStones] = useState('')
  const [showCreateLabRn, setShowCreateLabRn] = useState(false)
  const [linkingLabRn, setLinkingLabRn] = useState(false)

  // ── Internal attachments (multi-photo + captions) ───────────────────
  const [attachments, setAttachments] = useState<AttachmentRowState[]>([])
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const attachmentCameraRef = useRef<HTMLInputElement>(null)

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
    gemstoneService.getAll().then(setGemstones).catch(console.error)
  }, [])

  // Hand-engraving slider bounds configured in Master Tables.
  useEffect(() => {
    companyService.get().then(s => {
      setEngravingBounds({
        min: s.engravingMin ?? ENGRAVING_SLIDER_DEFAULTS.min,
        max: s.engravingMax ?? ENGRAVING_SLIDER_DEFAULTS.max,
        step: s.engravingStep ?? ENGRAVING_SLIDER_DEFAULTS.step,
        default: s.engravingDefault ?? ENGRAVING_SLIDER_DEFAULTS.default,
      })
    }).catch(console.error)
  }, [])

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

  const sizesByStoneType = useMemo(() => ({
    NATURAL: config.diamondSizes.filter(d => d.stoneType === 'NATURAL'),
    LAB: config.diamondSizes.filter(d => d.stoneType === 'LAB'),
  }), [config.diamondSizes])

  // Resolves the effective per-carat price + ct-per-stone for a stone, given
  // its Type and Shape. Lab-grown stones whose Shape matches a fancy melee
  // price-sheet entry (Oval, Princess, Baguette, ...) price from that table
  // instead of the generic diamond_size_config lookup — Round and shapes
  // without price-sheet data fall back to the original per-mm behavior
  // unchanged. Mirrors QuoteBuilder.tsx's sizePricingFor.
  const sizePricingFor = (stone: Pick<StoneRowState, 'stoneType' | 'shape' | 'sizeKey'>) => {
    if (stone.stoneType === 'lab-grown' && stone.shape && stone.sizeKey) {
      const fancyRow = config.fancyMeleePriceFor(stone.shape, stone.sizeKey)
      if (fancyRow) {
        return {
          pricePerCarat: fancyRow.pricePerCarat,
          ctPerStone: fancyRow.ctPerStone,
          label: `${fancyRow.sizeKey}${fancyRow.pointerLabel ? ` · ${fancyRow.pointerLabel}` : ''}`,
          fancy: true as const,
        }
      }
    }
    const sizeCfg = config.diamondSizeFor(stone.stoneType, stone.sizeKey)
    const mult = DIAMOND_TYPE_OPTIONS[stone.stoneType]?.multiplier ?? 1
    return {
      pricePerCarat: (sizeCfg?.basePrice ?? 0) * mult,
      ctPerStone: sizeCfg?.ctPerStone ?? 0,
      label: sizeCfg?.label ?? (stone.sizeKey || 'Custom'),
      fancy: false as const,
    }
  }

  const shapeOptions = useMemo(
    () => Array.from(new Set<string>([...STONE_SHAPES, ...config.fancyShapes])),
    [config.fancyShapes],
  )

  const defaultStoneFor = (role: StoneRoleKey): StoneRowState => {
    const sizes = sizesByStoneType.NATURAL
    const firstSetter = config.setters[0]?.typeKey ?? ''
    return {
      uid: nextUid(),
      role,
      stoneType: 'natural',
      stoneTypeChosen: false,
      stoneCategory: 'diamond',
      gemstoneId: '',
      sizeKey: role === 'MAIN' ? '' : (sizes[0]?.sizeKey ?? ''),
      carats: '',
      amount: '',
      setterType: firstSetter,
      setterFeeOverride: '',
      labReport: '',
      shape: '',
      color: '',
      cut: '',
      clarity: '',
      manualPrice: '',
      manualPricePerCarat: '',
      comments: '',
      markup: role === 'MAIN' ? String(DEFAULT_MARKUP) : '',
      collapsed: false,
    }
  }

  const addStoneRow = (role: StoneRoleKey) => setStones(prev => [...prev, defaultStoneFor(role)])
  const removeStoneRow = (uid: string) => setStones(rows => rows.filter(r => r.uid !== uid))
  const patchStone = (uid: string, patch: Partial<StoneRowState>) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const next = { ...s, ...patch }
      if (patch.stoneCategory === 'diamond') {
        next.gemstoneId = ''
      } else if (patch.stoneCategory === 'gemstone' && !s.gemstoneId) {
        next.gemstoneId = gemstones[0]?.id ?? ''
      }
      if (patch.stoneType && !patch.sizeKey && s.role !== 'MAIN') {
        const list = patch.stoneType === 'natural' ? sizesByStoneType.NATURAL : sizesByStoneType.LAB
        const match = list.find(d => normalizeSizeKey(d.sizeKey) === normalizeSizeKey(next.sizeKey))
        next.sizeKey = match ? match.sizeKey : (list[0]?.sizeKey ?? '')
      }
      return next
    }))
  }
  const toggleCollapsed = (uid: string) => setStones(prev => prev.map(s => s.uid === uid ? { ...s, collapsed: !s.collapsed } : s))
  const collapseStone = (uid: string) => setStones(prev => prev.map(s => s.uid === uid ? { ...s, collapsed: true } : s))

  // Two-way sync between carats and amount for a single stone via ctPerStone.
  const onStoneCaratsChange = (uid: string, caratsText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const ct = sizePricingFor(s).ctPerStone
      // When a $/ct override is set (custom size or not), the total is
      // derived from $/ct × carats, so it has to be recalculated whenever
      // carats changes too.
      if (caratsText === '') {
        return {
          ...s, carats: '', amount: '',
          manualPrice: s.manualPricePerCarat.trim() !== '' ? '' : s.manualPrice,
        }
      }
      const carats = parseNum(caratsText)
      const amount = ct > 0 ? String(Math.round(carats / ct)) : s.amount
      const manualPrice = s.manualPricePerCarat.trim() !== ''
        ? String(Math.round(carats * parseNum(s.manualPricePerCarat) * 100) / 100)
        : s.manualPrice
      return { ...s, carats: caratsText, amount, manualPrice }
    }))
  }
  const onStoneAmountChange = (uid: string, amountText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const ct = sizePricingFor(s).ctPerStone
      if (amountText === '') return { ...s, amount: '', carats: '' }
      const amount = parseNum(amountText)
      const carats = ct > 0 ? String(Math.round(amount * ct * 10000) / 10000) : s.carats
      return { ...s, amount: amountText, carats }
    }))
  }

  // Cost-per-carat override, available for both custom and preset sizes — the
  // jeweler types $/ct by hand instead of a flat total; the system multiplies
  // by carats and keeps manualPrice (the value every cost formula and the
  // save payload actually read) in sync.
  const onStoneManualPricePerCaratChange = (uid: string, perCaratText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const carats = parseNum(s.carats)
      const shouldSeedAmount = perCaratText.trim() !== '' && s.amount.trim() === ''
      const manualPrice = perCaratText.trim() === ''
        ? ''
        : String(Math.round(carats * parseNum(perCaratText) * 100) / 100)
      return { ...s, manualPricePerCarat: perCaratText, manualPrice, amount: shouldSeedAmount ? '1' : s.amount }
    }))
  }

  const mainStones = stones.filter(s => s.role === 'MAIN')
  const sideStones = stones.filter(s => s.role === 'SIDE')
  const meleeStones = stones.filter(s => s.role === 'MELEE')

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

  const handleAttachmentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    let remaining = files.length
    const newOnes: AttachmentRowState[] = []
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        newOnes.push({
          uid: nextUid(),
          backendId: null,
          photo: reader.result as string,
          caption: '',
          createdAt: new Date().toISOString(),
        })
        remaining -= 1
        if (remaining === 0) {
          setAttachments(prev => [...prev, ...newOnes])
          if (attachmentInputRef.current) attachmentInputRef.current.value = ''
          if (attachmentCameraRef.current) attachmentCameraRef.current.value = ''
        }
      }
      reader.readAsDataURL(file)
    })
  }
  const removeAttachment = (uid: string) => setAttachments(prev => prev.filter(a => a.uid !== uid))
  const patchAttachment = (uid: string, patch: Partial<AttachmentRowState>) =>
    setAttachments(prev => prev.map(a => a.uid === uid ? { ...a, ...patch } : a))

  // ── Prefill from "Duplicate" (navigated with the full StockItem in state) ──
  useEffect(() => {
    if (!duplicateFrom || prefillApplied.current) return
    if (config.loading) return
    prefillApplied.current = true
    setTitle(duplicateFrom.title ? `${duplicateFrom.title} (copy)` : '')
    setSku(duplicateFrom.sku ?? '')
    setQuantity(String(duplicateFrom.quantity ?? 1))
    setStatus('AVAILABLE')
    // RN pieces duplicate with jewelryType='rn' but an empty model picker —
    // same behavior as the Quote builder's duplicate flow: reselect the model.
    setJewelryType(duplicateFrom.jewelryType ?? 'ring')
    setRingLabor(duplicateFrom.ringLabor ?? 'none')
    setRingWidth(duplicateFrom.ringWidth ? String(duplicateFrom.ringWidth) : '')
    setFingerSize(duplicateFrom.fingerSize ? String(duplicateFrom.fingerSize) : '')
    setExtraCosts(String(duplicateFrom.extraCosts ?? 0))
    setEngravingFee(duplicateFrom.engravingFee ?? 0)
    setMarkupText(String(duplicateFrom.markupMultiplier ?? DEFAULT_MARKUP))
    setDiscountText(duplicateFrom.discountPercent && duplicateFrom.discountPercent > 0 ? String(duplicateFrom.discountPercent) : '')
    setInternalNotes(duplicateFrom.internalNotes ?? '')
    setFinishedWeight(duplicateFrom.finishedWeightGrams != null ? String(duplicateFrom.finishedWeightGrams) : '')
    setPhoto(duplicateFrom.photo ?? null)
    if (duplicateFrom.metalRows?.length) {
      setMetalRows(duplicateFrom.metalRows.map(r => ({
        uid: nextUid(), metalKey: r.metalKey, grams: String(r.weightGrams ?? ''),
      })))
    }
    if (duplicateFrom.stones?.length) {
      setStones(duplicateFrom.stones.map(s => {
        const ct = sizePricingFor({ stoneType: s.stoneType, shape: s.shape ?? '', sizeKey: s.sizeKey ?? '' }).ctPerStone
        const carats = s.carats ?? 0
        const amount = ct > 0 && carats > 0 ? String(Math.round(carats / ct)) : ''
        return {
          uid: nextUid(),
          role: s.role,
          stoneType: s.stoneType,
          // A duplicated stone already had a type picked historically.
          stoneTypeChosen: true,
          stoneCategory: s.stoneCategory === 'GEMSTONE' ? 'gemstone' : 'diamond',
          gemstoneId: s.gemstoneId != null ? String(s.gemstoneId) : '',
          sizeKey: s.sizeKey ?? '',
          carats: carats > 0 ? String(carats) : '',
          amount,
          setterType: s.setterType ?? '',
          setterFeeOverride: s.setterFeeOverride != null ? String(s.setterFeeOverride) : '',
          labReport: s.labReport ?? '',
          shape: s.shape ?? '',
          color: s.color ?? '',
          cut: s.cut ?? '',
          clarity: s.clarity ?? '',
          manualPrice: s.manualPrice != null ? String(s.manualPrice) : '',
          // Back-derive $/ct from the stored total so a duplicated custom-size
          // stone's per-carat field isn't blank.
          manualPricePerCarat: (s.sizeKey ?? '') === '' && s.manualPrice != null && carats > 0
            ? String(Math.round((s.manualPrice / carats) * 100) / 100)
            : '',
          comments: s.comments ?? '',
          markup: s.markupMultiplier != null ? String(s.markupMultiplier) : (s.role === 'MAIN' ? String(DEFAULT_MARKUP) : ''),
          collapsed: true,
        }
      }))
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
    if (duplicateFrom.attachments?.length) {
      setAttachments(duplicateFrom.attachments.map(a => ({
        uid: nextUid(),
        backendId: null,
        photo: a.photo,
        caption: a.caption ?? '',
        createdAt: a.createdAt ?? new Date().toISOString(),
      })))
    }
  }, [duplicateFrom, config.loading, config.diamondSizeFor])

  const addMetalRow = () => {
    if (metalRows.length >= 3) return
    setMetalRows(rows => [...rows, { uid: nextUid(), metalKey: 'gold-14k-yellow', grams: '' }])
  }
  const removeMetalRow = (uid: string) => setMetalRows(rows => rows.filter(r => r.uid !== uid))
  const updateMetalRow = (uid: string, patch: Partial<MetalRowState>) =>
    setMetalRows(rows => rows.map(r => (r.uid === uid ? { ...r, ...patch } : r)))

  // ── RN ring derived metrics — resolves the selected model + finger size +
  // metal into the full cost breakdown. Null whenever RN mode is off. ──────
  const rn = useMemo(() => {
    if (!rnMode) return null
    const model = config.rnRings.find(m => m.modelKey === rnModelKey) ?? null
    const sizeRow = model?.sizes.find(s => s.fingerSize === rnFingerSize) ?? null
    const base = { model, sizeRow, metal: selectedMetal, diamondSizeFor: config.diamondSizeFor }
    const customStones = rnBandMode === 'other' ? (parseInt(rnCustomStones) || 0) : 0
    const otherBase = customStones > 0 ? { ...base, customNumStones: customStones } : null
    const naturalEternity = computeRnBreakdown({ ...base, stoneType: 'natural' })
    const labEternity = computeRnBreakdown({ ...base, stoneType: 'lab-grown' })
    const naturalOther = otherBase ? computeRnBreakdown({ ...otherBase, stoneType: 'natural' }) : null
    const labOther = otherBase ? computeRnBreakdown({ ...otherBase, stoneType: 'lab-grown' }) : null
    const natural = (rnBandMode === 'other' && naturalOther) ? naturalOther : naturalEternity
    const lab = (rnBandMode === 'other' && labOther) ? labOther : labEternity
    const selected = rnStoneType === 'lab-grown' ? lab : natural
    return { model, sizeRow, natural, lab, naturalEternity, labEternity, naturalOther, labOther, ...selected }
  }, [rnMode, config, rnModelKey, rnFingerSize, selectedMetal, rnStoneType, rnBandMode, rnCustomStones])

  // ── Live cost breakdown — same formula as the Quote builder ────────────────
  const manualMaterialCost = metalRows.reduce(
    (sum, r) => sum + (config.metalPriceMap[r.metalKey] ?? 0) * parseNum(r.grams), 0,
  )
  const manualRingLaborFee = config.ringLaborMap[ringLabor]?.fee ?? 0

  const stoneBreakdown = stones.map(s => {
    const { pricePerCarat } = sizePricingFor(s)
    const carats = parseNum(s.carats)
    const amount = parseNum(s.amount)
    const hasManualPrice = s.manualPrice.trim() !== ''
    const cost = hasManualPrice ? parseNum(s.manualPrice) : carats * pricePerCarat
    const feeOverride = s.setterFeeOverride.trim()
    const setterFee = feeOverride !== '' ? parseNum(feeOverride) : (config.setterMap[s.setterType]?.fee ?? 0)
    const labor = amount * setterFee
    return { uid: s.uid, cost, labor, contribution: cost + labor }
  })
  const manualStoneCost = stoneBreakdown.reduce((s, b) => s + b.cost, 0)
  const manualSettingFee = stoneBreakdown.reduce((s, b) => s + b.labor, 0)

  // In RN mode the material / labor / setting / diamond figures come from the
  // resolved RN model instead of the manual inputs.
  const materialCost = rnMode && rn ? rn.goldCost : manualMaterialCost
  const ringLaborFee = rnMode && rn ? rn.casting : manualRingLaborFee
  const settingFee = rnMode && rn ? rn.settingLabor : manualSettingFee
  const stoneCost = rnMode && rn ? rn.diamondCost : manualStoneCost

  // EMKAY-supplied stones: real inventory bought from EMKAY, so the full
  // price counts as material cost, same as the Quote builder. Independent of
  // RN mode — a store-bought stone can still ride along an RN band.
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
    Math.max(0, engravingFee) + parseNum(extraCosts)

  // Parse markup/discount the same way the Quote builder does.
  const parsedMarkup = (() => {
    const n = Number(markupText)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MARKUP
  })()
  const parsedDiscount = (() => {
    const n = Number(discountText)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(n, 100)
  })()

  // Per-stone MAIN markup override pool — mirrors the backend's
  // StockItem.computeRetailPrice() so the live preview matches what gets saved.
  const stoneBreakdownByUid: Record<string, { cost: number; labor: number }> = {}
  stoneBreakdown.forEach(b => { stoneBreakdownByUid[b.uid] = { cost: b.cost, labor: b.labor } })
  let customMainRaw = 0
  let customMainMarkedUp = 0
  stones.forEach(s => {
    if (s.role !== 'MAIN') return
    const txt = s.markup.trim()
    if (txt === '') return
    const n = Number(txt)
    if (!Number.isFinite(n) || n <= 0) return
    const b = stoneBreakdownByUid[s.uid]
    if (!b) return
    const contrib = b.cost + b.labor
    customMainRaw += contrib
    customMainMarkedUp += contrib * n
  })
  const genericPool = totalCost - customMainRaw
  const retailBeforeDiscount = genericPool * parsedMarkup + customMainMarkedUp
  const discountAmount = retailBeforeDiscount * (parsedDiscount / 100)
  const retailPrice = retailBeforeDiscount - discountAmount

  const showDuplicateBanner = duplicateFrom && !dismissedDuplicateBanner

  const handleSave = async () => {
    if (!user) return
    if (!title.trim()) {
      setSaveError('Please enter a title.')
      return
    }
    const missingStoneType = !rnMode && stones.some(s => !s.stoneTypeChosen)
    if (missingStoneType) {
      setSaveError('Choose Natural or Lab for every stone (Main, Side, Melee) before saving.')
      return
    }
    const customMissingPrice = !rnMode && stones.some(s => s.sizeKey === '' && (s.manualPricePerCarat.trim() === '' || parseNum(s.carats) <= 0))
    if (customMissingPrice) {
      setSaveError('Enter the carats and cost per carat for any stone whose size/cut isn\'t in the system before saving.')
      return
    }
    if (rnMode) {
      if (!rn?.model || !rn?.sizeRow) {
        setSaveError('Pick an RN model and a ring size before saving.')
        return
      }
      if (!rn.metalCat) {
        setSaveError('RN rings are only available in 14K / 18K gold or platinum — pick one of those metals.')
        return
      }
    }
    if (totalCost <= 0) {
      setSaveError('This piece is still $0 — add metal weight, a stone, EMKAY stone or an extra cost before saving.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const rnDiamondType: 'natural' | 'lab-grown' = rn?.stoneType ?? 'natural'
      const rnStones = rnMode && rn?.model && rn?.sizeRow
        ? [{
            role: 'MELEE' as const,
            stoneType: rnDiamondType,
            stoneCategory: 'DIAMOND' as const,
            gemstoneId: null,
            gemstoneName: null,
            sizeKey: rn.sizeKey,
            carats: rn.ctw,
            setterType: '',
            setterFeeOverride: null,
            labReport: null,
            sortOrder: 0,
            shape: null, color: null, cut: null, clarity: null,
            manualPrice: Math.round(rn.diamondCost * 100) / 100,
            comments: `${rn.model.modelKey} · SZ ${rn.sizeRow.fingerSize} · ${rn.numStones} stones · ${rn.ctw.toFixed(2)}ct`,
            markupMultiplier: null,
            contribution: Math.round((rn.diamondCost + rn.settingLabor) * 100) / 100,
          }]
        : null
      const rnNote = rnMode && rn?.model
        ? [
            `RN ${rn.model.modelKey} · SZ ${rn.sizeRow?.fingerSize ?? '—'} · ${JEWELRY_METAL_OPTIONS[selectedMetal].label} · ${rn.stoneType === 'lab-grown' ? 'Lab' : 'Natural'}`,
            `Gold: ${rn.avgGrams}g × $${rn.goldPerGram}/g = $${rn.goldCost.toFixed(2)}`,
            `Labor: $${rn.casting.toFixed(2)}`,
            `Setting: ${rn.numStones} × $${rn.settingPerStone} = $${rn.settingLabor.toFixed(2)}`,
            `Stones: ${rn.ctw.toFixed(2)}ct × $${rn.pricePerCarat}/ct = $${rn.diamondCost.toFixed(2)}`,
          ].join('\n')
        : null
      const mergedInternalNotes = rnMode
        ? ([rnNote, internalNotes.trim() || null].filter(Boolean).join('\n\n') || null)
        : (internalNotes.trim() === '' ? null : internalNotes.trim())

      const payload = {
        title: title.trim(),
        sku: sku.trim() || null,
        quantity: Math.max(1, parseNum(quantity) || 1),
        status,
        jewelryType,
        ringLabor: rnMode ? '' : ringLabor,
        ringWidth: rnMode ? null : (parseNum(ringWidth) || null),
        fingerSize: rnMode ? rnFingerSize : (parseNum(fingerSize) || null),
        laborHours: null,
        hourlyRate: null,
        extraCosts: parseNum(extraCosts),
        total: totalCost,
        markupMultiplier: parsedMarkup,
        discountPercent: parsedDiscount,
        photo,
        internalNotes: mergedInternalNotes,
        finishedWeightGrams: finishedWeight.trim() !== '' ? parseNum(finishedWeight) : null,
        engravingFee: Math.max(0, engravingFee),
        setterType: null,
        archived: false,
        metalRows: rnMode
          ? [{ metalKey: selectedMetal, weightGrams: rn?.avgGrams ?? 0, position: 0 }]
          : metalRows
              .filter(r => parseNum(r.grams) > 0)
              .map((r, i) => ({ metalKey: r.metalKey, weightGrams: parseNum(r.grams), position: i })),
        stones: rnMode ? (rnStones ?? []) : stones.map((s, i) => {
          const b = stoneBreakdownByUid[s.uid]
          const isGemstone = s.role === 'MAIN' && s.stoneCategory === 'gemstone'
          const gem = isGemstone ? gemstones.find(g => g.id === s.gemstoneId) : undefined
          const markupNum = (() => {
            if (s.role !== 'MAIN') return null
            const txt = s.markup.trim()
            if (txt === '') return null
            const n = Number(txt)
            return Number.isFinite(n) && n > 0 ? n : null
          })()
          return {
            role: s.role,
            stoneType: s.stoneType,
            stoneCategory: (s.role === 'MAIN' ? (isGemstone ? 'GEMSTONE' : 'DIAMOND') : 'DIAMOND') as 'DIAMOND' | 'GEMSTONE',
            gemstoneId: isGemstone && s.gemstoneId ? Number(s.gemstoneId) : null,
            gemstoneName: isGemstone ? (gem?.name ?? null) : null,
            sizeKey: s.sizeKey,
            carats: parseNum(s.carats),
            setterType: s.setterType,
            setterFeeOverride: s.setterFeeOverride.trim() !== '' ? parseNum(s.setterFeeOverride) : null,
            labReport: s.role === 'MELEE' ? null : (s.labReport || null),
            sortOrder: i,
            shape: s.shape || null,
            color: s.color || null,
            cut: s.role === 'MAIN' ? (s.cut || null) : null,
            clarity: s.role === 'MAIN' ? (s.clarity || null) : null,
            manualPrice: s.manualPrice.trim() !== '' ? parseNum(s.manualPrice) : null,
            comments: s.comments.trim() || null,
            markupMultiplier: markupNum,
            contribution: b ? b.cost + b.labor : null,
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
        attachments: attachments.map((a, idx) => ({
          photo: a.photo,
          caption: a.caption.trim() === '' ? null : a.caption.trim(),
          sortOrder: idx,
        })),
      }
      await stockService.create(payload, Number(user.id))
      setToast({ variant: 'success', title: 'Stock piece saved', description: `"${title.trim()}" was added to stock.` })
      // Reset every field back to its initial default, same UX as the Quote builder.
      setTitle(''); setSku(''); setQuantity('1'); setStatus('AVAILABLE')
      setJewelryType('ring')
      setMetalRows([{ uid: nextUid(), metalKey: 'gold-14k-yellow', grams: '' }])
      setRingLabor('none'); setRingWidth(''); setFingerSize('')
      setExtraCosts('0'); setEngravingFee(engravingBounds.default)
      setMarkupText(String(DEFAULT_MARKUP)); setDiscountText('')
      setStones([]); setEmkayStones([]); setAttachments([])
      setRnModelKey(''); setRnFingerSize(0); setRnStoneType('natural'); setRnBandMode('eternity'); setRnCustomStones('')
      setPhoto(null); setInternalNotes(''); setFinishedWeight('')
      setSaveError(null)
      if (photoInputRef.current) photoInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    } catch (err) {
      console.error(err)
      setToast({ variant: 'error', title: 'Could not save', description: 'Please check the form and try again.' })
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = title.trim() !== '' && !saving

  // ── Renders a single stone row: collapsed summary card or the full form,
  // full parity with the Quote builder's renderStoneRow. ─────────────────
  const renderStoneRow = (stone: StoneRowState, index: number) => {
    const isFancyShape = stone.stoneType === 'lab-grown' && config.fancyShapes.includes(stone.shape)
    const fancySizes = isFancyShape ? config.fancyMeleePrices.filter(p => p.shape === stone.shape) : []
    const sizes = stone.stoneType === 'natural' ? sizesByStoneType.NATURAL : sizesByStoneType.LAB
    const customSize = stone.sizeKey === ''
    const { pricePerCarat, label: sizeLabel } = sizePricingFor(stone)
    const caratsNum = parseNum(stone.carats)
    const amountNum = parseNum(stone.amount)
    const hasManualPrice = stone.manualPrice.trim() !== ''
    const stoneCostVal = hasManualPrice ? parseNum(stone.manualPrice) : caratsNum * pricePerCarat
    const stoneFeeOverride = stone.setterFeeOverride.trim()
    const stoneSetterFee = stoneFeeOverride !== '' ? parseNum(stoneFeeOverride) : (config.setterMap[stone.setterType]?.fee ?? 0)
    const stoneLabor = amountNum * stoneSetterFee
    const stoneTotal = stoneCostVal + stoneLabor
    const theme = STONE_ROLE_THEME[stone.role]
    const isGemstone = stone.role === 'MAIN' && stone.stoneCategory === 'gemstone'
    const gemstoneLabel = isGemstone ? (gemstones.find(g => g.id === stone.gemstoneId)?.name ?? 'Gemstone') : null
    const typeLabel = isGemstone
      ? `${gemstoneLabel} (${DIAMOND_TYPE_OPTIONS[stone.stoneType].label})`
      : DIAMOND_TYPE_OPTIONS[stone.stoneType].label
    const setterLabel = config.setterMap[stone.setterType]?.label ?? stone.setterType

    if (stone.collapsed) {
      const summaryParts = [
        stone.shape || typeLabel,
        stone.color ? `color ${stone.color}` : null,
        caratsNum > 0 ? `${caratsNum} ct` : null,
        amountNum > 0 ? `${amountNum} stone${amountNum === 1 ? '' : 's'}` : null,
      ].filter(Boolean)
      return (
        <div key={stone.uid}
          className={`group relative overflow-hidden rounded-2xl border ${theme.ring} bg-white shadow-sm transition hover:shadow-md hover:-translate-y-0.5`}>
          <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.bar}`} aria-hidden />
          <button type="button" onClick={() => toggleCollapsed(stone.uid)}
            className="flex w-full items-center justify-between gap-3 pl-5 pr-3 py-3 text-left">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} aria-hidden />
                {theme.label} #{index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {summaryParts.length > 0 ? summaryParts.join(' · ') : 'Not configured yet'}
                </p>
                <p className="truncate text-xs text-slate-500">{sizeLabel} · {setterLabel || 'no setter'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900 tabular-nums">
                  ${stoneTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                {hasManualPrice && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">custom</span>
                )}
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-slate-200 group-hover:text-slate-700">
                <ChevronDown className="h-4 w-4" />
              </span>
            </div>
          </button>
          <button type="button" onClick={() => removeStoneRow(stone.uid)} aria-label="Remove stone"
            className="absolute right-12 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 sm:flex">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }

    const compareData = compareStoneTypes({
      sizeKey: stone.sizeKey,
      carats: caratsNum,
      amount: amountNum,
      setterFee: stoneSetterFee,
      manualPrice: hasManualPrice ? parseNum(stone.manualPrice) : null,
      diamondSizeFor: config.diamondSizeFor,
    })
    const cheaperLabel = compareData.cheaper === 'natural' ? 'Natural' : 'Lab'

    return (
      <div key={stone.uid} className={`relative rounded-2xl border ${theme.ring} ${theme.tint} p-4 space-y-3 overflow-hidden shadow-sm transition hover:shadow-md`}>
        <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.bar}`} aria-hidden />

        <div className="flex items-center justify-between gap-2 pl-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} aria-hidden />
            {theme.label} stone #{index + 1}
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => stone.stoneTypeChosen && toggleCollapsed(stone.uid)}
              aria-label="Collapse" disabled={!stone.stoneTypeChosen}
              title={stone.stoneTypeChosen ? undefined : 'Choose Natural or Lab first'}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => removeStoneRow(stone.uid)} aria-label="Remove stone"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 pl-2">
          {stone.role === 'MAIN' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stone category</label>
              <select value={stone.stoneCategory}
                onChange={e => patchStone(stone.uid, { stoneCategory: e.target.value as StoneRowState['stoneCategory'] })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                <option value="diamond">Diamond</option>
                <option value="gemstone">Gemstone</option>
              </select>
            </div>
          )}

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {stone.role === 'MAIN' && stone.stoneCategory === 'gemstone' ? 'Origin' : 'Type'}{' '}
              <span className="font-normal normal-case text-rose-500">(required — pick one)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {diamondTypeKeys.map(key => {
                const active = stone.stoneTypeChosen && stone.stoneType === key
                return (
                  <button key={key} type="button"
                    onClick={() => patchStone(stone.uid, { stoneType: key, stoneTypeChosen: true })}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}>
                    {DIAMOND_TYPE_OPTIONS[key].label}
                  </button>
                )
              })}
            </div>
            {!stone.stoneTypeChosen && (
              <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                You must choose Natural or Lab before this stone can be saved.
              </p>
            )}
          </div>

          {stone.role === 'MAIN' && stone.stoneCategory === 'gemstone' && (
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gemstone</label>
              <select value={stone.gemstoneId}
                onChange={e => patchStone(stone.uid, { gemstoneId: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                {gemstones.length === 0 && <option value="">No gemstones loaded</option>}
                {gemstones.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          {/* Shape comes right before Size — for a Lab stone, picking a
              fancy shape (Oval, Princess, ...) changes which sizes/prices
              the Size dropdown below offers. */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Shape <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <select value={stone.shape}
              onChange={e => patchStone(stone.uid, { shape: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
              <option value="">—</option>
              {shapeOptions.map(sh => <option key={sh} value={sh}>{sh}</option>)}
            </select>
          </div>

          {stone.role !== 'MAIN' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Size</label>
              <select value={stone.sizeKey}
                onChange={e => patchStone(stone.uid, { sizeKey: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                <option value="">Custom — enter carats &amp; price</option>
                {isFancyShape
                  ? fancySizes.map(p => (
                      <option key={p.id} value={p.sizeKey}>
                        {p.sizeKey}{p.pointerLabel ? ` — ${p.pointerLabel}` : ''} · ${p.pricePerCarat}/ct
                      </option>
                    ))
                  : sizes.map(d => (
                      <option key={d.id} value={d.sizeKey}>
                        {d.label} — ${d.basePrice}{d.ctPerStone != null ? '/ct' : ''}
                      </option>
                    ))}
              </select>
              {isFancyShape && (
                <p className="text-[10px] text-slate-400">Priced from the {stone.shape} melee sheet.</p>
              )}
            </div>
          )}

          {/* Natural vs Lab — hidden for fancy-shape sizes: the fancy melee
              sheet is Lab-only, so there's no equivalent Natural price. */}
          {!isFancyShape && (
          <div className="md:col-span-2">
            <button type="button" onClick={() => setCompareUid(stone.uid)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
              <Scale className="h-3.5 w-3.5 text-slate-400" />
              Natural vs Lab
              {compareData.cheaper && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                  {compareData.cheaper === stone.stoneType ? 'best price' : `${cheaperLabel} cheaper`}
                </span>
              )}
            </button>
          </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Carats</label>
            <input type="text" inputMode="decimal" value={stone.carats} placeholder="0.0000"
              onChange={e => onStoneCaratsChange(stone.uid, e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quantity</label>
            <input type="text" inputMode="numeric" value={stone.amount} placeholder="0"
              onChange={e => onStoneAmountChange(stone.uid, e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type of setting</label>
            <select value={stone.setterType}
              onChange={e => patchStone(stone.uid, { setterType: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
              {config.setters.map(s => <option key={s.typeKey} value={s.typeKey}>{s.label} — ${s.fee}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Color <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <select value={stone.color}
              onChange={e => patchStone(stone.uid, { color: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
              <option value="">—</option>
              {STONE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {stone.role === 'MAIN' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cut <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <select value={stone.cut}
                onChange={e => patchStone(stone.uid, { cut: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                <option value="">—</option>
                {STONE_CUTS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {stone.role === 'MAIN' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Clarity <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <select value={stone.clarity}
                onChange={e => patchStone(stone.uid, { clarity: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                <option value="">—</option>
                {STONE_CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 md:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Pricing overrides</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Cost per carat{' '}
                  {customSize ? (
                    <span className="font-normal normal-case text-rose-500">
                      (required — size/cut not in the system; the total is calculated automatically)
                    </span>
                  ) : (
                    <span className="font-normal normal-case text-slate-400">
                      (optional — overrides the ${pricePerCarat.toLocaleString('en-US', { minimumFractionDigits: 2 })}/ct looked up for this size)
                    </span>
                  )}
                </label>
                <input type="number" min={0} step="0.01" value={stone.manualPricePerCarat}
                  placeholder={customSize ? 'e.g. 1500 per carat' : `Default — $${pricePerCarat.toLocaleString('en-US', { minimumFractionDigits: 2 })}/ct`}
                  onChange={e => onStoneManualPricePerCaratChange(stone.uid, e.target.value)}
                  className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 ${
                    customSize && stone.manualPricePerCarat.trim() === '' ? 'border-rose-300' : 'border-slate-200'
                  }`} />
                {caratsNum > 0 && (
                  <p className="text-[11px] text-slate-500">
                    = ${stoneCostVal.toLocaleString('en-US', { minimumFractionDigits: 2 })} total ({caratsNum} ct × $
                    {(stone.manualPricePerCarat.trim() !== '' ? parseNum(stone.manualPricePerCarat) : pricePerCarat).toLocaleString('en-US', { minimumFractionDigits: 2 })}/ct)
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custom setting fee (optional)</label>
                <div className="relative">
                  <input type="text" inputMode="decimal" value={stone.setterFeeOverride}
                    placeholder={`Default — $${config.setterMap[stone.setterType]?.fee ?? 0}`}
                    onChange={e => patchStone(stone.uid, { setterFeeOverride: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-16 text-sm text-slate-900 outline-none focus:border-slate-400" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">/ stone</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-white px-3 py-2 text-[11px] text-slate-500">
              <span>
                Stone <strong className="text-slate-700">${stoneCostVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                {' + '}
                Setting <strong className="text-slate-700">${stoneLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                <span className="text-slate-400"> ({amountNum} × ${stoneSetterFee.toLocaleString('en-US', { minimumFractionDigits: 2 })})</span>
              </span>
              <span className="font-semibold text-slate-900">= ${stoneTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {stone.role === 'MAIN' && (
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Markup for this stone <span className="font-normal normal-case text-slate-400">(optional — overrides the piece-level {parsedMarkup}× markup for this stone's cost + setting labor; internal pricing only, so it's fine to leave blank)</span>
              </label>
              <div className="relative">
                <input type="text" inputMode="decimal" value={stone.markup} placeholder={String(parsedMarkup)}
                  onChange={e => patchStone(stone.uid, { markup: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-9 text-sm text-slate-900 outline-none focus:border-slate-400" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">×</span>
              </div>
              <p className="text-[10px] text-slate-400">Useful when the center stone has a different margin than the rest of the piece.</p>
            </div>
          )}

          {stone.role !== 'MELEE' && (() => {
            const verify = labReportVerifyUrl(stone.labReport)
            return (
              <div className="space-y-1 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Lab report <span className="font-normal normal-case text-slate-400">(optional)</span>
                  </label>
                  {verify && (
                    <a href={verify.url} target="_blank" rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold no-underline shadow-sm transition hover:shadow ${
                        verify.valid
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100'
                          : 'border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100'
                      }`}
                      title={verify.valid
                        ? `Looks like a valid ${verify.lab} number — opens ${verify.lab}'s report check in a new tab to confirm`
                        : `This doesn't look like a valid ${verify.lab} report number yet — opens ${verify.lab}'s report check anyway`}>
                      {verify.valid ? (
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {verify.valid ? `Verify on ${verify.lab}` : `Check ${verify.lab} #`}
                      <ExternalLink className="h-3 w-3 opacity-80" />
                    </a>
                  )}
                  {!verify && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-400"
                      title="Enter a GIA/IGI report number to verify it on the lab's official report check">
                      Verify
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                      </svg>
                    </span>
                  )}
                </div>
                <input type="text" value={stone.labReport} placeholder="e.g. GIA 1234567890"
                  onChange={e => patchStone(stone.uid, { labReport: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
                {verify && (
                  <p className={`text-[10px] ${verify.valid ? 'text-slate-400' : 'text-rose-500'}`}>
                    {verify.valid
                      ? `Looks like a valid ${verify.lab} number — click "Verify on ${verify.lab}" to confirm it on the official report check.`
                      : `This doesn't look like a complete ${verify.lab} report number yet.`}
                  </p>
                )}
              </div>
            )
          })()}

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Additional comments <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <textarea rows={3} value={stone.comments}
              placeholder="Any notes about clarity, fluorescence, special instructions, etc."
              onChange={e => patchStone(stone.uid, { comments: e.target.value })}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pl-2 pt-3 border-t border-white/60">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="rounded-xl bg-white/70 px-3 py-1.5">
              Stone <strong className="ml-1 text-slate-900">${stoneCostVal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              {hasManualPrice && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">custom</span>}
            </span>
            <span className="rounded-xl bg-white/70 px-3 py-1.5">
              Setting <strong className="ml-1 text-slate-900">${stoneLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
          <button type="button" onClick={() => collapseStone(stone.uid)}
            disabled={!stone.stoneTypeChosen}
            title={stone.stoneTypeChosen ? undefined : 'Choose Natural or Lab first'}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition ${theme.btn} disabled:cursor-not-allowed disabled:opacity-40`}>
            <Check className="h-3.5 w-3.5" /> Done
          </button>
        </div>

        <StoneTypeCompareDialog
          open={compareUid === stone.uid}
          comparison={compareData}
          current={stone.stoneType}
          carats={caratsNum}
          title={`${theme.label} stone #${index + 1}`}
          sizeKey={stone.sizeKey}
          onCreatedLabSize={() => config.refresh()}
          onPick={t => patchStone(stone.uid, { stoneType: t })}
          onClose={() => setCompareUid(null)}
        />
      </div>
    )
  }

  const renderStoneSection = (role: StoneRoleKey, hint: string, items: StoneRowState[]) => {
    const theme = STONE_ROLE_THEME[role]
    const Icon = theme.icon
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
          {items.length === 0
            ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">None yet.</p>
            : <div className="space-y-3">{items.map((s, i) => renderStoneRow(s, i))}</div>}
        </div>
      </div>
    )
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
            <button type="button" onClick={() => setDismissedDuplicateBanner(true)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700">
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
                Same pricing engine as the Quote builder — metal, stones, RN rings and labor — plus a{' '}
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

          {/* RN ring section — shown when "RN ring" is the type of piece */}
          {rnMode && (
            <Card className={cardClass}>
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Gem className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900">RN ring</CardTitle>
                </div>
                <p className="text-sm text-slate-500">
                  Pick a model, metal and ring size — stone count, CTW, gold and labor are filled from the RN tables.
                </p>
              </CardHeader>
              <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className={labelClass}>Metal</label>
                  <select className={inputClass} value={selectedMetal}
                    onChange={e => updateMetalRow(metalRows[0].uid, { metalKey: e.target.value as JewelryMetalOption })}>
                    {METAL_GROUPS.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.keys.map(key => (
                          <option key={key} value={key}>{JEWELRY_METAL_OPTIONS[key].label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className={labelClass}>RN model</label>
                  <select className={inputClass} value={rnModelKey}
                    onChange={e => { setRnModelKey(e.target.value); setRnFingerSize(0) }}>
                    <option value="">— Select a model</option>
                    {config.rnRings.map(m => (
                      <option key={m.modelKey} value={m.modelKey}>{m.label || m.modelKey}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className={labelClass}>Ring size</label>
                  <select className={`${inputClass} disabled:opacity-50`} value={rnFingerSize} disabled={!rn?.model}
                    onChange={e => setRnFingerSize(Number(e.target.value))}>
                    <option value={0}>{rn?.model ? '— Select a size' : '— Pick a model first'}</option>
                    {(rn?.model?.sizes ?? []).map(s => (
                      <option key={s.fingerSize} value={s.fingerSize}>
                        SZ {s.fingerSize} — {s.numStones ?? 0} stones · {(s.ctw ?? 0).toFixed(2)}ct
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className={labelClass}>Band type</label>
                  <div className="inline-flex w-full rounded-2xl bg-slate-100 p-1">
                    {([['eternity', 'Eternity'], ['other', 'Other']] as const).map(([val, label]) => (
                      <button key={val} type="button"
                        onClick={() => { setRnBandMode(val); if (val === 'eternity') setRnCustomStones('') }}
                        className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${rnBandMode === val ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {rnBandMode === 'other' && (
                  <div className="space-y-2 md:col-span-2">
                    <label className={labelClass}>Number of stones</label>
                    <input type="number" min={1} step={1} className={inputClass} value={rnCustomStones}
                      onChange={e => setRnCustomStones(e.target.value)}
                      placeholder={`Default eternity: ${rn?.sizeRow?.numStones ?? '—'} stones`} />
                  </div>
                )}

                <div className="space-y-2 md:col-span-2">
                  <label className={labelClass}>Diamond type</label>
                  <div className="inline-flex w-full rounded-2xl bg-slate-100 p-1">
                    {([['natural', 'Natural'], ['lab-grown', 'Lab']] as const).map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setRnStoneType(val)}
                        className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${rnStoneType === val ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {rnMode && rn && !rn.metalCat && (
                  <p className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    RN rings are only priced in 14K / 18K gold or platinum. Pick one of those metals above.
                  </p>
                )}

                {rn?.model && rn?.sizeRow && rn.metalCat && (
                  <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">RN breakdown</p>
                    <dl className="space-y-1.5 text-sm">
                      <RnRow label="Number of stones" value={`${rn.numStones}`} />
                      <RnRow label="CTW (from sheet)" value={`${rn.ctw.toFixed(2)} ct`} />
                      <RnRow label={`Gold (${rn.avgGrams}g × $${rn.goldPerGram}/g)`} value={`$${rn.goldCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                      <RnRow label="Labor" value={`$${rn.casting.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                      <RnRow label={`Setting (${rn.numStones} × $${rn.settingPerStone})`} value={`$${rn.settingLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                    </dl>

                    {rn.naturalOther && (
                      <>
                        <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Band type · compare</p>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ['eternity', 'Eternity', rnStoneType === 'lab-grown' ? rn.labEternity : rn.naturalEternity, rn.naturalEternity.numStones] as const,
                            ['other', 'Other', rnStoneType === 'lab-grown' ? rn.labOther! : rn.naturalOther, rn.naturalOther.numStones] as const,
                          ]).map(([val, label, d, numStones]) => {
                            const isSel = rnBandMode === val
                            const etTotal = (rnStoneType === 'lab-grown' ? rn.labEternity : rn.naturalEternity).total
                            const otTotal = (rnStoneType === 'lab-grown' ? rn.labOther! : rn.naturalOther).total
                            const isCheaper = d.total === Math.min(etTotal, otTotal) && etTotal !== otTotal
                            return (
                              <button key={val} type="button" onClick={() => setRnBandMode(val)}
                                className={`rounded-xl border p-3 text-left transition ${isSel ? 'border-slate-900 bg-white ring-1 ring-slate-900' : 'border-slate-200 bg-white/60 hover:border-slate-300'}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-900">{label}</span>
                                  {isSel
                                    ? <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold text-white">USING</span>
                                    : isCheaper && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">CHEAPER</span>}
                                </div>
                                <p className="mt-1 text-[11px] text-slate-500">{numStones} stones · {d.ctw.toFixed(2)}ct</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">${d.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}

                    <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Diamonds · pick type</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([['natural', 'Natural', rn.natural], ['lab-grown', 'Lab', rn.lab]] as const).map(([val, label, d]) => {
                        const isSel = rnStoneType === val
                        const isCheaper = d.hasDiamondRow && rn.natural.hasDiamondRow && rn.lab.hasDiamondRow &&
                          rn.natural.total !== rn.lab.total && d.total === Math.min(rn.natural.total, rn.lab.total)
                        const cardCls = `rounded-xl border p-3 text-left transition ${isSel ? 'border-slate-900 bg-white ring-1 ring-slate-900' : 'border-slate-200 bg-white/60 hover:border-slate-300'}`
                        const header = (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">{label}</span>
                            {isSel
                              ? <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold text-white">USING</span>
                              : isCheaper && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">CHEAPER</span>}
                          </div>
                        )
                        if (val === 'lab-grown' && !d.hasDiamondRow) {
                          const labExistsForNaturalKey = !!config.diamondSizeFor('lab-grown', rn.natural.sizeKey)
                          return (
                            <div key={val} className={cardCls}>
                              {header}
                              {labExistsForNaturalKey ? (
                                <>
                                  <p className="mt-1 text-[11px] text-amber-700">
                                    Lab entry for <span className="font-mono font-semibold">"{rn.natural.sizeKey}"</span> exists but this model points to the wrong key{d.sizeKey ? <> (<span className="font-mono">"{d.sizeKey}"</span>)</> : ''}.
                                  </p>
                                  <button type="button" disabled={linkingLabRn}
                                    onClick={async () => {
                                      if (!rn.model) return
                                      setLinkingLabRn(true)
                                      try {
                                        await configService.updateRnRing(rn.model.id, { diamondSizeKeyLab: rn.natural.sizeKey })
                                        config.refresh()
                                      } finally { setLinkingLabRn(false) }
                                    }}
                                    className="mt-1.5 rounded-lg px-2 py-0.5 text-[11px] font-semibold transition disabled:opacity-50"
                                    style={{ backgroundColor: 'rgba(60,46,96,0.08)', color: '#3C2E60' }}>
                                    {linkingLabRn ? 'Linking...' : `Link to Lab "${rn.natural.sizeKey}"`}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <p className="mt-1 text-[11px] text-amber-700">
                                    No Lab price for size <span className="font-mono font-semibold">"{rn.natural.sizeKey}"</span>.
                                  </p>
                                  <button type="button" onClick={() => setShowCreateLabRn(true)}
                                    className="mt-1.5 rounded-lg px-2 py-0.5 text-[11px] font-semibold transition"
                                    style={{ backgroundColor: 'rgba(60,46,96,0.08)', color: '#3C2E60' }}>
                                    + Add Lab price
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        }
                        return (
                          <button key={val} type="button" onClick={() => setRnStoneType(val)} className={cardCls}>
                            {header}
                            {d.hasDiamondRow ? (
                              <>
                                <p className="mt-1 text-[11px] text-slate-500">{rn.ctw.toFixed(2)}ct × ${d.pricePerCarat.toLocaleString('en-US')}/ct</p>
                                <p className="text-[11px] text-slate-500">Diamonds ${d.diamondCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">${d.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                                {val === 'lab-grown' && (
                                  <p className="mt-1.5 border-t border-amber-200 pt-1.5 text-[10px] font-medium text-amber-700">
                                    Make sure you double check the mark up for the Lab Version since it could be below what we usually charge.
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="mt-1 text-[11px] text-amber-700">No price for key "{d.sizeKey || '—'}"</p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                    <CreateLabSizeDialog
                      open={showCreateLabRn}
                      sizeKey={rn.natural.sizeKey}
                      initialLabel={config.diamondSizeFor('natural', rn.natural.sizeKey)?.label ?? ''}
                      onCreated={(createdKey) => {
                        if (rn.model) {
                          configService.updateRnRing(rn.model.id, { diamondSizeKeyLab: createdKey })
                            .then(() => config.refresh())
                            .catch(console.error)
                        } else {
                          config.refresh()
                        }
                      }}
                      onClose={() => setShowCreateLabRn(false)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Metal rows — hidden in RN mode, the model drives gold weight */}
          {!rnMode && (
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
                      {METAL_GROUPS.map(g => (
                        <optgroup key={g.group} label={g.group}>
                          {g.keys.map(key => (
                            <option key={key} value={key}>{JEWELRY_METAL_OPTIONS[key].label} — ${(config.metalPriceMap[key] ?? 0).toFixed(2)}/g</option>
                          ))}
                        </optgroup>
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
          )}

          {/* Labor / extras — engraving slider + markup/discount presets, always visible */}
          <Card className={cardClass}>
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base font-semibold text-slate-900">
                {rnMode ? 'Pricing & options' : 'Labor & extras'}
              </CardTitle>
              <p className="text-sm text-slate-500">
                {rnMode ? 'Engraving, extra costs, markup and discount.' : "Ring labor tier, dimensions, engraving, markup and discount."}
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
              {!rnMode && (<>
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
              </>)}
              {rnMode && (
                <div className="space-y-2 md:col-span-2">
                  <label className={labelClass}>Extra costs ($)</label>
                  <input type="number" min={0} className={inputClass} value={extraCosts} onChange={e => setExtraCosts(e.target.value)} />
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label className={labelClass}>Hand Engraving (milgrain)</label>
                  <span className="text-sm font-bold tabular-nums text-slate-900">
                    {engravingFee > 0 ? `$${engravingFee.toLocaleString('en-US')}` : 'None'}
                  </span>
                </div>
                <input type="range" min={engravingBounds.min} max={engravingBounds.max} step={engravingBounds.step}
                  value={Math.min(engravingBounds.max, Math.max(engravingBounds.min, engravingFee))}
                  onChange={e => setEngravingFee(Number(e.target.value))}
                  className="w-full accent-slate-900" aria-label="Hand engraving fee" />
                <div className="flex justify-between text-[11px] font-medium text-slate-400">
                  <span>${engravingBounds.min.toLocaleString('en-US')}</span>
                  <span>Drag to set the engraving fee · $0 = none</span>
                  <span>${engravingBounds.max.toLocaleString('en-US')}</span>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label className={labelClass}>
                    Retail markup
                    <span className="ml-2 text-xs font-normal text-slate-500">applied on top of the full cost (engraving included)</span>
                  </label>
                  <span className="text-xs font-medium text-slate-500">
                    Cost <strong className="text-slate-700">${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    {' '}→ Retail <strong className="text-slate-900">${retailPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[140px]">
                    <input type="text" inputMode="decimal" value={markupText} placeholder={String(DEFAULT_MARKUP)}
                      onChange={e => setMarkupText(e.target.value)}
                      className={`${inputClass} pr-9`} />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">×</span>
                  </div>
                  {MARKUP_PRESETS.map(p => {
                    const active = parsedMarkup === p
                    return (
                      <button key={p} type="button" onClick={() => setMarkupText(String(p))}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {p}×
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-400">
                  For a discount, type a number below {DEFAULT_MARKUP} (e.g. 2.2× ≈ 12% off the standard {DEFAULT_MARKUP}× price).
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label className={labelClass}>
                    Discount
                    <span className="ml-2 text-xs font-normal text-slate-500">optional — applied on top of the markup</span>
                  </label>
                  <span className="text-xs font-medium text-slate-500">
                    {parsedDiscount > 0 ? (
                      <>
                        Save <strong className="text-emerald-600">${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                        {' '}→ Final <strong className="text-slate-900">${retailPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                      </>
                    ) : (
                      <span className="text-slate-400">No discount applied</span>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[140px]">
                    <input type="text" inputMode="decimal" value={discountText} placeholder="0"
                      onChange={e => setDiscountText(e.target.value)}
                      className={`${inputClass} pr-9`} />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">%</span>
                  </div>
                  <button type="button" onClick={() => setDiscountText('')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${parsedDiscount === 0 ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    None
                  </button>
                  {DISCOUNT_PRESETS.map(p => {
                    const active = parsedDiscount === p
                    return (
                      <button key={p} type="button" onClick={() => setDiscountText(String(p))}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {p}%
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-400">Pick a preset or type any value. Leave empty (or pick None) to charge the full markup price.</p>
              </div>
            </CardContent>
          </Card>

          {/* Stones — same MAIN/SIDE/MELEE grouping + gold/sapphire/emerald
              palette as the Quote builder's Stone Setting section. Hidden in
              RN mode — stones come from the resolved RN model instead. */}
          {!rnMode && (
          <Card id="stock-stones" className={`relative overflow-hidden ${cardClass}`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.10),transparent_45%),radial-gradient(circle_at_top_right,rgba(244,63,94,0.08),transparent_50%)]" aria-hidden />
            <CardHeader className="relative border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 via-rose-100 to-blue-100 text-slate-700 shadow-sm ring-1 ring-white/80">
                  <Diamond className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Stone Setting</CardTitle>
                  <p className="text-xs text-slate-500">Main, side and melee — each can have its own markup, grading and lab report.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {renderStoneSection('MAIN', 'Center stones. Add one or several — each can have its own markup.', mainStones)}
              {renderStoneSection('SIDE', 'Accent stones. Add as many as you need.', sideStones)}
              {renderStoneSection('MELEE', 'Pavé / melee. Add as many as you need.', meleeStones)}

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
          )}

          {/* Internal notes & attachments — never shown outside the workspace */}
          <Card className={cardClass}>
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <ImagePlus className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Internal notes &amp; attachments
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {attachments.length}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-slate-500">Sourcing, condition, reminders — never shown outside the workspace.</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Internal notes <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <textarea rows={3} className={inputClass} value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                  placeholder="Sourcing, condition, reminders…" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Finished weight (g) <span className="font-normal normal-case text-slate-400">(optional — a record only, not used in pricing)</span>
                </label>
                <input type="text" inputMode="decimal" className={inputClass} value={finishedWeight}
                  onChange={e => setFinishedWeight(e.target.value)} placeholder="e.g. 2.1" />
              </div>

              <input ref={attachmentInputRef} id="stock-attachment-files" type="file" accept="image/*" multiple
                onChange={handleAttachmentsChange} className="hidden" />
              <input ref={attachmentCameraRef} id="stock-attachment-camera" type="file" accept="image/*" capture="environment"
                onChange={handleAttachmentsChange} className="hidden" />

              <div className="grid gap-2 sm:grid-cols-2">
                <label htmlFor="stock-attachment-camera"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white sm:hidden">
                  <Camera className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>Take photo</span>
                </label>
                <label htmlFor="stock-attachment-files"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white sm:col-span-2">
                  <ImagePlus className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>Add photos (multiple allowed)</span>
                </label>
              </div>

              {attachments.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">No attachments yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {attachments.map((a, idx) => (
                    <div key={a.uid} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <img src={a.photo} alt={`Attachment ${idx + 1}`} className="w-full object-cover max-h-48" />
                      <button type="button" onClick={() => removeAttachment(a.uid)} aria-label="Remove attachment"
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <div className="space-y-1.5 p-3">
                        <input type="text" value={a.caption} onChange={e => patchAttachment(a.uid, { caption: e.target.value })}
                          placeholder="Optional caption"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400 focus:bg-white" />
                        <p className="text-[10px] text-slate-400">Added {new Date(a.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500"><span>Internal cost</span><span>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-slate-500"><span>Markup</span><span>{parsedMarkup}×</span></div>
                {parsedDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600"><span>Discount</span><span>−{parsedDiscount}%</span></div>
                )}
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base font-bold text-slate-900"><span>Retail price</span><span>${retailPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
              </div>

              {/* ── Every costing factor as its own line — metal, ring labor,
                  each stone (cost only), setting labor as one line, engraving,
                  extras — so it's obvious what the internal cost is made of. ── */}
              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Cost breakdown</p>

                {rnMode && rn?.model ? (
                  rn.avgGrams > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-slate-600">{rn.avgGrams}g {JEWELRY_METAL_OPTIONS[selectedMetal]?.label ?? selectedMetal}</span>
                      <strong className="shrink-0 tabular-nums text-slate-900">${rn.goldCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  )
                ) : (
                  metalRows.filter(r => parseNum(r.grams) > 0).map(r => (
                    <div key={r.uid} className="flex items-center justify-between gap-3">
                      <span className="truncate text-slate-600">{r.grams}g {JEWELRY_METAL_OPTIONS[r.metalKey]?.label ?? r.metalKey}</span>
                      <strong className="shrink-0 tabular-nums text-slate-900">${((config.metalPriceMap[r.metalKey] ?? 0) * parseNum(r.grams)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  ))
                )}

                {ringLaborFee > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-600">{rnMode ? 'Casting labor' : (config.ringLaborMap[ringLabor]?.label ?? 'Ring labor')}</span>
                    <strong className="shrink-0 tabular-nums text-slate-900">${ringLaborFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </div>
                )}

                {([['MAIN', mainStones], ['SIDE', sideStones], ['MELEE', meleeStones]] as const).flatMap(([, items]) =>
                  items.map(s => {
                    const b = stoneBreakdownByUid[s.uid]
                    const cost = b ? b.cost : 0
                    if (cost <= 0) return null
                    const count = Math.round(parseNum(s.amount))
                    const typeLabel = s.stoneTypeChosen ? (s.stoneType === 'lab-grown' ? 'lab' : 'natural') : ''
                    const carats = parseNum(s.carats)
                    const label = [
                      count > 1 ? count : null,
                      s.shape || null,
                      typeLabel || null,
                      s.sizeKey || null,
                      carats > 0 ? `${carats}ct` : null,
                    ].filter(Boolean).join(' ')
                    return (
                      <div key={s.uid} className="flex items-center justify-between gap-3">
                        <span className="truncate text-slate-600">{label || 'Stone'}</span>
                        <strong className="shrink-0 tabular-nums text-slate-900">${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                      </div>
                    )
                  })
                )}

                {emkayStones.map(es => {
                  const b = emkayBreakdown.find(x => x.uid === es.uid)
                  const cost = b ? b.cost : 0
                  if (cost <= 0) return null
                  return (
                    <div key={es.uid} className="flex items-center justify-between gap-3">
                      <span className="truncate text-slate-600">{es.name}</span>
                      <strong className="shrink-0 tabular-nums text-slate-900">${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  )
                })}

                {(settingFee + emkaySettingFee) > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-600">Labor to set</span>
                    <strong className="shrink-0 tabular-nums text-slate-900">${(settingFee + emkaySettingFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </div>
                )}

                {engravingFee > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-600">Engraving</span>
                    <strong className="shrink-0 tabular-nums text-slate-900">${engravingFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </div>
                )}

                {parseNum(extraCosts) !== 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-slate-600">Extra costs</span>
                    <strong className="shrink-0 tabular-nums text-slate-900">${parseNum(extraCosts).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-sm font-bold text-slate-900">
                  <span>Total cost</span>
                  <span>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <button type="button" onClick={handleSave} disabled={!canSave}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save stock piece'}
            </button>
            {saveError && <p className="text-xs font-medium text-rose-600">{saveError}</p>}
          </div>
          <button type="button" onClick={() => navigate('/stock-list')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-400">
            <Package className="h-4 w-4" /> View all stock
          </button>
        </div>
      </div>

      {toast && (
        <Toast title={toast.title} description={toast.description} variant={toast.variant} onClose={() => setToast(null)} />
      )}
    </div>
  )
}

export default StockBuilderPage
