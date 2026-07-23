import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useQuoteConfig, normalizeSizeKey } from '@/hooks/useQuoteConfig'
import { gemstoneService } from '@/services/gemstoneService'
import { companyService, ENGRAVING_SLIDER_DEFAULTS } from '@/services/companyService'
import { quotesService } from '@/services/quotesService'
import { DIAMOND_TYPE_OPTIONS, JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { computeRnBreakdown, type RnStoneType } from '@/lib/rnPricing'
import type { Client, EmkayCatalogProduct, GemstonePrice, JewelryMetalOption, QuoteMetal, SavedQuote } from '@/types'
import { useLocation, useNavigate } from 'react-router-dom'

// ── Shared constants ────────────────────────────────────────────────────────
// Extracted here so BOTH the classic Quote Builder and the stepped wizard read
// from one source of truth.
export const HAND_ENGRAVING_FEE = 150
export const DEFAULT_MARKUP = 2.5
export const MARKUP_PRESETS = [2, 2.5, 3] as const
export const DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 30] as const

// Tallas disponibles: de 3 a 20 en incrementos de 0.25 (sin coste adicional).
export const FINGER_SIZE_OPTIONS: number[] = (() => {
  const out: number[] = []
  for (let s = 3; s <= 20; s += 0.25) out.push(Math.round(s * 100) / 100)
  return out
})()

export const METAL_GROUPS: Array<{ group: string; keys: JewelryMetalOption[] }> = [
  { group: '14K Gold', keys: ['gold-14k-white', 'gold-14k-yellow', 'gold-14k-rose'] },
  { group: '18K Gold', keys: ['gold-18k-white', 'gold-18k-yellow', 'gold-18k-rose'] },
  { group: 'Platinum', keys: ['platinum'] },
]

export const diamondTypeKeys = Object.keys(DIAMOND_TYPE_OPTIONS) as Array<keyof typeof DIAMOND_TYPE_OPTIONS>

// Standard diamond shapes offered to the user. Empty value = unspecified.
export const STONE_SHAPES = [
  'Round', 'Princess', 'Oval', 'Cushion', 'Emerald',
  'Pear', 'Marquise', 'Asscher', 'Radiant', 'Heart',
] as const

// GIA color grades for white diamonds. Fancy colors fall back to "unspecified".
export const STONE_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const
// GIA grading scales for the MAIN (center) stone.
export const STONE_CUTS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'] as const
export const STONE_CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'] as const

// Only these setter types make sense for customer-supplied stones.
export const CUSTOMER_STONE_SETTER_KEYS = ['customer_melee', 'channel', 'bezel', 'fancy', 'center'] as const

// Catalogue of jewelry piece types. Stored as the key, label is for display.
export const JEWELRY_TYPE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'ring',      label: 'Ring' },
  { key: 'rn',        label: 'RN ring' },
  { key: 'pendant',   label: 'Pendant' },
  { key: 'necklace',  label: 'Necklace' },
  { key: 'bracelet',  label: 'Bracelet' },
  { key: 'earrings',  label: 'Earrings' },
  { key: 'cufflinks', label: 'Cufflinks' },
  { key: 'brooch',    label: 'Brooch' },
  { key: 'anklet',    label: 'Anklet' },
  { key: 'other',     label: 'Other' },
]

// Turn a free-text lab report like "GIA 1234567890" into a deep-link to the
// issuing lab's online verification page. Returns null only when the field is
// empty — otherwise it always returns a target plus a `valid` flag (format
// check only; we can't query GIA's database from the browser).
export function labReportVerifyUrl(raw: string): { url: string; lab: string; valid: boolean } | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  const upper = text.toUpperCase()
  const number = text.replace(/[\s-]/g, '').match(/\d{4,}/)?.[0]

  if (upper.includes('IGI')) {
    const valid = !!number && number.length >= 7
    return {
      url: number
        ? `https://www.igi.org/verify-your-report/?r=${number}`
        : 'https://www.igi.org/verify-your-report/',
      lab: 'IGI',
      valid,
    }
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

// ── Types ───────────────────────────────────────────────────────────────────
export interface MetalRow { uid: string; metal: JewelryMetalOption; grams: string }
export type StoneRole = 'MAIN' | 'SIDE' | 'MELEE'

export interface StoneRow {
  uid: string
  role: StoneRole
  stoneType: 'natural' | 'lab-grown'
  sizeKey: string
  carats: string
  amount: string
  setterType: string
  labReport: string
  shape: string
  color: string
  cut: string
  clarity: string
  manualPrice: string
  comments: string
  markup: string
  collapsed: boolean
}

export interface CustomerStone {
  uid: string
  gemstoneId: string
  setterType: string
  size: string
  quantity: string
  photo: string | null
  comments: string
}

/** A real stone picked from the EMKAY Gemstones Catalog and added to the
 *  quote — the shop buys this from EMKAY, as opposed to CustomerStone where
 *  the client brings their own. Snapshotted from the catalog product at the
 *  moment it's added; only quantity/comments stay editable afterward. */
export interface EmkayStoneRow {
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
  /** Same setter list as customer stones — EMKAY stones still need to be
   *  physically set into the piece. */
  setterType: string
  /** Custom setting fee, overriding the catalog fee for `setterType` when
   *  non-empty. */
  setterFeeOverride: string
  quantity: string
  comments: string
}

export interface AttachmentRow {
  uid: string
  backendId?: number | null
  photo: string
  caption: string
  createdAt: string
}

/**
 * The shared brain of the Quote Builder. Owns every piece of form state, the
 * live pricing pipeline and the save handler, so the classic page and the
 * stepped wizard render two different UIs over one source of truth.
 */
export function useQuoteBuilder() {
  const { user } = useAuth()
  const config = useQuoteConfig()
  const location = useLocation()
  const navigate = useNavigate()

  const [duplicatedFrom, setDuplicatedFrom] = useState<SavedQuote | null>(null)
  const [quoteTitle, setQuoteTitle] = useState('')
  const [client, setClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedQuote, setSavedQuote] = useState<{ id: string; title: string; total: number; publicToken: string | null } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; client?: string; jewelryType?: string }>({})
  const [metalGramsError, setMetalGramsError] = useState(false)
  const gramsErrorRef = useRef<HTMLDivElement>(null)
  const [jewelryType, setJewelryType] = useState<string>('')
  const [pinSummary, setPinSummary] = useState(true)
  const defaultMetalRows = (): MetalRow[] => [{ uid: crypto.randomUUID(), metal: 'gold-18k-white', grams: '' }]
  const [metalRows, setMetalRows] = useState<MetalRow[]>(defaultMetalRows)
  const selectedMetal = metalRows[0]?.metal ?? 'gold-18k-white'
  const [ringLabor, setRingLabor] = useState('')
  const [ringWidth, setRingWidth] = useState(0)
  const [fingerSize, setFingerSize] = useState(0)
  const [extraCosts, setExtraCosts] = useState(0)
  const [engravingFee, setEngravingFee] = useState<number>(0)
  const [engravingBounds, setEngravingBounds] = useState<{ min: number; max: number; step: number; default: number }>(
    { ...ENGRAVING_SLIDER_DEFAULTS },
  )
  const [applyTaxes, setApplyTaxes] = useState(false)
  const [markupText, setMarkupText] = useState(String(DEFAULT_MARKUP))
  const [discountText, setDiscountText] = useState('')
  const [customerPriceOverrideText, setCustomerPriceOverrideText] = useState('')
  const [customerPriceOverrideReason, setCustomerPriceOverrideReason] = useState('')
  const [editingOverride, setEditingOverride] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  // ── RN ring mode (driven by the "RN ring" type of piece) ─────────────
  const rnMode = jewelryType === 'rn'
  const [rnModelKey, setRnModelKey] = useState('')
  const [rnFingerSize, setRnFingerSize] = useState<number>(0)
  const [rnStoneType, setRnStoneType] = useState<RnStoneType>('natural')

  const [stones, setStones] = useState<StoneRow[]>([])
  const parseNum = (s: string) => {
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
  }

  const [customerStones, setCustomerStones] = useState<CustomerStone[]>([])
  const [emkayStones, setEmkayStones] = useState<EmkayStoneRow[]>([])
  const [gemstones, setGemstones] = useState<GemstonePrice[]>([])
  const customerPhotoInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const customerCameraInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const [attachments, setAttachments] = useState<AttachmentRow[]>([])
  const [internalNotes, setInternalNotes] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const attachmentCameraRef = useRef<HTMLInputElement>(null)

  const handleAttachmentsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    let remaining = files.length
    const newOnes: AttachmentRow[] = []
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        newOnes.push({
          uid: crypto.randomUUID(),
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
  const removeAttachment = (uid: string) => {
    setAttachments(prev => prev.filter(a => a.uid !== uid))
  }
  const patchAttachment = (uid: string, patch: Partial<AttachmentRow>) => {
    setAttachments(prev => prev.map(a => a.uid === uid ? { ...a, ...patch } : a))
  }

  useEffect(() => {
    gemstoneService.getAll().then(setGemstones).catch(console.error)
  }, [])

  // Load the hand-engraving slider bounds (min/max/step) configured in Master
  // Tables. The slider always starts at 0 (None) on a fresh quote.
  useEffect(() => {
    companyService.get().then(s => {
      const bounds = {
        min: s.engravingMin ?? ENGRAVING_SLIDER_DEFAULTS.min,
        max: s.engravingMax ?? ENGRAVING_SLIDER_DEFAULTS.max,
        step: s.engravingStep ?? ENGRAVING_SLIDER_DEFAULTS.step,
        default: s.engravingDefault ?? ENGRAVING_SLIDER_DEFAULTS.default,
      }
      setEngravingBounds(bounds)
    }).catch(console.error)
  }, [])

  // ── Duplicate prefill ────────────────────────────────────────────────
  const duplicateAppliedRef = useRef(false)
  useEffect(() => {
    if (duplicateAppliedRef.current) return
    if (config.loading) return
    const navState = location.state as { duplicateFrom?: SavedQuote } | null
    const dup = navState?.duplicateFrom
    if (!dup) return
    duplicateAppliedRef.current = true

    setDuplicatedFrom(dup)
    setQuoteTitle(dup.title)
    setClient(dup.client ?? null)
    setJewelryType(dup.jewelryType ?? '')
    setMetalRows(
      dup.metalRows && dup.metalRows.length > 0
        ? dup.metalRows.map((r: QuoteMetal) => ({ uid: crypto.randomUUID(), metal: r.metalKey as JewelryMetalOption, grams: String(r.weightGrams ?? '') }))
        : [{ uid: crypto.randomUUID(), metal: (dup.metal ?? 'gold-18k-white') as JewelryMetalOption, grams: String(dup.weightGrams ?? '') }]
    )
    setRingLabor(dup.ringLabor)
    setRingWidth(dup.ringWidth ?? 0)
    setFingerSize(dup.fingerSize ?? 7)
    setExtraCosts(dup.extraCosts ?? 0)
    setEngravingFee(dup.engravingFee ?? (dup.engraving ? HAND_ENGRAVING_FEE : 0))
    setApplyTaxes(!!dup.applyTaxes)
    setPhoto(dup.photo ?? null)
    setMarkupText(String(dup.markupMultiplier ?? DEFAULT_MARKUP))
    setDiscountText(dup.discountPercent && dup.discountPercent > 0 ? String(dup.discountPercent) : '')
    setInternalNotes(dup.internalNotes ?? '')
    setCustomerNotes(dup.customerNotes ?? '')

    setStones((dup.stones ?? []).map(s => {
      const ct = config.diamondSizeFor(s.stoneType, s.sizeKey)?.ctPerStone ?? 0
      const carats = s.carats ?? 0
      const amount = ct > 0 && carats > 0 ? String(Math.round(carats / ct)) : ''
      return {
        uid: crypto.randomUUID(),
        role: s.role,
        stoneType: s.stoneType,
        sizeKey: s.sizeKey,
        carats: carats > 0 ? String(carats) : '',
        amount,
        setterType: s.setterType ?? '',
        labReport: s.labReport ?? '',
        shape: s.shape ?? '',
        color: s.color ?? '',
        cut: s.cut ?? '',
        clarity: s.clarity ?? '',
        manualPrice: s.manualPrice != null ? String(s.manualPrice) : '',
        comments: s.comments ?? '',
        markup: s.markupMultiplier != null ? String(s.markupMultiplier) : '',
        collapsed: true,
      }
    }))
    setCustomerPriceOverrideText(dup.customerPriceOverride != null ? String(dup.customerPriceOverride) : '')
    setCustomerPriceOverrideReason(dup.customerPriceOverrideReason ?? '')

    setCustomerStones((dup.customerStones ?? []).map(cs => ({
      uid: crypto.randomUUID(),
      gemstoneId: cs.gemstoneId != null ? String(cs.gemstoneId) : '',
      setterType: cs.setterType ?? '',
      size: cs.sizeText ?? '',
      quantity: String(Math.max(1, cs.quantity ?? 1)),
      photo: cs.photo ?? null,
      comments: cs.comments ?? '',
    })))

    setEmkayStones((dup.emkayStones ?? []).map(es => ({
      uid: crypto.randomUUID(),
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
      quantity: String(Math.max(1, es.quantity ?? 1)),
      comments: es.comments ?? '',
    })))

    setAttachments((dup.attachments ?? []).map(a => ({
      uid: crypto.randomUUID(),
      backendId: null,
      photo: a.photo,
      caption: a.caption ?? '',
      createdAt: a.createdAt ?? new Date().toISOString(),
    })))

    navigate(location.pathname, { replace: true, state: null })
  }, [config.loading, config.diamondSizeFor, location.pathname, location.state, navigate])

  // ── Preset client ────────────────────────────────────────────────────
  const presetClientAppliedRef = useRef(false)
  useEffect(() => {
    if (presetClientAppliedRef.current) return
    const navState = location.state as { presetClient?: Client } | null
    const preset = navState?.presetClient
    if (!preset) return
    presetClientAppliedRef.current = true
    setClient(preset)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  const customerSetters = useMemo(
    () => config.setters.filter(s => (CUSTOMER_STONE_SETTER_KEYS as readonly string[]).includes(s.typeKey)),
    [config.setters],
  )

  const defaultCustomerStone = (): CustomerStone => ({
    uid: crypto.randomUUID(),
    gemstoneId: gemstones[0]?.id ?? '',
    setterType: customerSetters[0]?.typeKey ?? '',
    size: '',
    quantity: '1',
    photo: null,
    comments: '',
  })

  const addCustomerStone = () => {
    setCustomerStones(prev => [...prev, defaultCustomerStone()])
  }
  const removeCustomerStone = (uid: string) => {
    setCustomerStones(prev => prev.filter(s => s.uid !== uid))
    delete customerPhotoInputs.current[uid]
    delete customerCameraInputs.current[uid]
  }
  const patchCustomerStone = (uid: string, patch: Partial<CustomerStone>) => {
    setCustomerStones(prev => prev.map(s => s.uid === uid ? { ...s, ...patch } : s))
  }
  const onCustomerPhotoChange = (uid: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => patchCustomerStone(uid, { photo: reader.result as string })
    reader.readAsDataURL(file)
  }
  const removeCustomerPhoto = (uid: string) => {
    patchCustomerStone(uid, { photo: null })
    const p = customerPhotoInputs.current[uid]
    if (p) p.value = ''
    const c = customerCameraInputs.current[uid]
    if (c) c.value = ''
  }

  const addEmkayStone = (product: EmkayCatalogProduct) => {
    setEmkayStones(prev => [...prev, {
      uid: crypto.randomUUID(),
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
  const removeEmkayStone = (uid: string) => {
    setEmkayStones(prev => prev.filter(s => s.uid !== uid))
  }
  const patchEmkayStone = (uid: string, patch: Partial<EmkayStoneRow>) => {
    setEmkayStones(prev => prev.map(s => s.uid === uid ? { ...s, ...patch } : s))
  }

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

  const selectedMetalConfig = JEWELRY_METAL_OPTIONS[selectedMetal] ?? JEWELRY_METAL_OPTIONS['gold-18k-white']

  const sizesByStoneType = useMemo(() => ({
    NATURAL: config.diamondSizes.filter(d => d.stoneType === 'NATURAL'),
    LAB: config.diamondSizes.filter(d => d.stoneType === 'LAB'),
  }), [config.diamondSizes])

  const defaultStoneFor = (role: StoneRole): StoneRow => {
    const sizes = sizesByStoneType.NATURAL
    const firstSetter = config.setters[0]?.typeKey ?? ''
    return {
      uid: crypto.randomUUID(),
      role,
      stoneType: 'natural',
      sizeKey: sizes[0]?.sizeKey ?? '',
      carats: '',
      amount: '',
      setterType: firstSetter,
      labReport: '',
      shape: '',
      color: '',
      cut: '',
      clarity: '',
      manualPrice: '',
      comments: '',
      markup: '',
      collapsed: false,
    }
  }

  const toggleCollapsed = (uid: string) => {
    setStones(prev => prev.map(s => s.uid === uid ? { ...s, collapsed: !s.collapsed } : s))
  }
  const collapseStone = (uid: string) => {
    setStones(prev => prev.map(s => s.uid === uid ? { ...s, collapsed: true } : s))
  }

  const addStone = (role: StoneRole) => {
    setStones(prev => [...prev, defaultStoneFor(role)])
  }
  const removeStone = (uid: string) => {
    setStones(prev => prev.filter(s => s.uid !== uid))
  }
  const patchStone = (uid: string, patch: Partial<StoneRow>) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const next = { ...s, ...patch }
      if (patch.stoneType && !patch.sizeKey) {
        const list = patch.stoneType === 'natural' ? sizesByStoneType.NATURAL : sizesByStoneType.LAB
        const match = list.find(d => normalizeSizeKey(d.sizeKey) === normalizeSizeKey(next.sizeKey))
        if (match) {
          next.sizeKey = match.sizeKey
        } else {
          next.sizeKey = list[0]?.sizeKey ?? ''
        }
      }
      return next
    }))
  }

  const onStoneCaratsChange = (uid: string, caratsText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const ct = config.diamondSizeFor(s.stoneType, s.sizeKey)?.ctPerStone ?? 0
      if (caratsText === '') return { ...s, carats: '', amount: '' }
      const carats = parseNum(caratsText)
      const amount = ct > 0 ? String(Math.round(carats / ct)) : s.amount
      return { ...s, carats: caratsText, amount }
    }))
  }
  const onStoneAmountChange = (uid: string, amountText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const ct = config.diamondSizeFor(s.stoneType, s.sizeKey)?.ctPerStone ?? 0
      if (amountText === '') return { ...s, amount: '', carats: '' }
      const amount = parseNum(amountText)
      const carats = ct > 0
        ? String(Math.round(amount * ct * 10000) / 10000)
        : s.carats
      return { ...s, amount: amountText, carats }
    }))
  }

  const onStoneManualPriceChange = (uid: string, priceText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const shouldSeedAmount = priceText.trim() !== '' && s.amount.trim() === ''
      return { ...s, manualPrice: priceText, amount: shouldSeedAmount ? '1' : s.amount }
    }))
  }

  const mainStones  = stones.filter(s => s.role === 'MAIN')
  const sideStones  = stones.filter(s => s.role === 'SIDE')
  const meleeStones = stones.filter(s => s.role === 'MELEE')

  const rn = useMemo(() => {
    if (!rnMode) return null
    const model = config.rnRings.find(m => m.modelKey === rnModelKey) ?? null
    const sizeRow = model?.sizes.find(s => s.fingerSize === rnFingerSize) ?? null
    const base = { model, sizeRow, metal: selectedMetal, diamondSizeFor: config.diamondSizeFor }
    const natural = computeRnBreakdown({ ...base, stoneType: 'natural' as const })
    const lab = computeRnBreakdown({ ...base, stoneType: 'lab-grown' as const })
    const selected = rnStoneType === 'lab-grown' ? lab : natural
    return { model, sizeRow, natural, lab, ...selected }
  }, [rnMode, config, rnModelKey, rnFingerSize, selectedMetal, rnStoneType])

  const parseGrams = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0 }
  const pricing = useMemo(() => {
    const materialCost = metalRows.reduce((sum, row) => {
      const cfg = JEWELRY_METAL_OPTIONS[row.metal]
      return sum + (cfg ? cfg.pricePerGram * parseGrams(row.grams) : 0)
    }, 0)
    const metalPricePerGram = JEWELRY_METAL_OPTIONS[selectedMetal]?.pricePerGram ?? 0
    const ringLaborFee = config.ringLaborMap[ringLabor]?.fee ?? 0
    const cadFee = 0
    const engravingFeeVal = Math.max(0, engravingFee)

    let diamondCost = 0
    let settingFee = 0
    let totalCarats = 0
    let totalAmount = 0
    const stoneBreakdown = stones.map(s => {
      const sizeCfg = config.diamondSizeFor(s.stoneType, s.sizeKey)
      const mult = DIAMOND_TYPE_OPTIONS[s.stoneType].multiplier
      const pricePerCarat = (sizeCfg?.basePrice ?? 0) * mult
      const carats = parseNum(s.carats)
      const amount = parseNum(s.amount)
      const hasManualPrice = s.manualPrice.trim() !== ''
      const cost = hasManualPrice ? parseNum(s.manualPrice) : carats * pricePerCarat
      const setterFee = config.setterMap[s.setterType]?.fee ?? 0
      const labor = amount * setterFee
      diamondCost += cost
      settingFee += labor
      totalCarats += carats
      totalAmount += amount
      return { uid: s.uid, cost, labor, pricePerCarat, setterFee }
    })

    let customerSettingFee = 0
    let customerStoneCount = 0
    customerStones.forEach(cs => {
      const qty = parseNum(cs.quantity || '1') || 1
      const fee = config.setterMap[cs.setterType]?.fee ?? 0
      customerSettingFee += qty * fee
      customerStoneCount += qty
    })

    // EMKAY-supplied stones: real inventory bought from EMKAY, so (unlike
    // customer stones) the full price counts as material cost — plus setter
    // labor, since someone still has to set the stone into the piece.
    let emkayCost = 0
    let emkaySettingFee = 0
    let emkayStoneCount = 0
    emkayStones.forEach(es => {
      const qty = Math.max(1, parseNum(es.quantity || '1') || 1)
      const feeOverride = es.setterFeeOverride.trim()
      const setterFee = feeOverride !== '' ? parseNum(feeOverride) : (config.setterMap[es.setterType]?.fee ?? 0)
      emkayCost += qty * es.priceUsd
      emkaySettingFee += qty * setterFee
      emkayStoneCount += qty
    })

    // In RN mode the material / labor / setting / diamond figures come from the
    // resolved RN model instead of the manual inputs; engraving and extra costs
    // still apply on top, and the markup/discount/tax pipeline is untouched.
    const eff = rnMode && rn
      ? {
          metalPricePerGram: rn.goldPerGram,
          materialCost: rn.goldCost,
          ringLaborFee: rn.casting,
          settingFee: rn.settingLabor,
          diamondCost: rn.diamondCost,
          customerSettingFee: 0,
          customerStoneCount: 0,
          totalCarats: rn.ctw,
          totalAmount: rn.numStones,
          stoneBreakdown: [] as typeof stoneBreakdown,
        }
      : {
          metalPricePerGram, materialCost, ringLaborFee, settingFee, diamondCost,
          customerSettingFee, customerStoneCount, totalCarats, totalAmount, stoneBreakdown,
        }

    const total =
      eff.materialCost +
      eff.ringLaborFee +
      cadFee +
      eff.settingFee +
      eff.customerSettingFee +
      eff.diamondCost +
      emkayCost +
      emkaySettingFee +
      engravingFeeVal +
      extraCosts

    return {
      metalPricePerGram: eff.metalPricePerGram,
      materialCost: eff.materialCost,
      ringLaborFee: eff.ringLaborFee,
      cadFee,
      settingFee: eff.settingFee,
      customerSettingFee: eff.customerSettingFee,
      customerStoneCount: eff.customerStoneCount,
      diamondCost: eff.diamondCost,
      emkayCost,
      emkaySettingFee,
      emkayStoneCount,
      engravingFee: engravingFeeVal,
      totalCarats: Math.round((Number(eff.totalCarats) || 0) * 10000) / 10000,
      totalAmount: eff.totalAmount,
      stoneBreakdown: eff.stoneBreakdown,
      total,
    }
  }, [
    config, customerStones, emkayStones, engravingFee, extraCosts, ringLabor, ringWidth,
    metalRows, selectedMetal, stones, rnMode, rn,
  ])

  const parsedMarkup = (() => {
    const n = Number(markupText)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MARKUP
  })()
  const parsedDiscount = (() => {
    const n = Number(discountText)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(n, 100)
  })()
  const stoneBreakdownByUid: Record<string, { cost: number; labor: number }> = {}
  pricing.stoneBreakdown.forEach(b => { stoneBreakdownByUid[b.uid] = { cost: b.cost, labor: b.labor } })
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
  // Engraving is part of the cost and IS marked up like everything else; only
  // MAIN stones with their own markup are carved out (priced at their rate).
  const genericPool = pricing.total - customMainRaw
  const customerPriceBeforeDiscount = genericPool * parsedMarkup + customMainMarkedUp
  const discountAmount = customerPriceBeforeDiscount * (parsedDiscount / 100)
  const customerPriceAfterDiscount = customerPriceBeforeDiscount - discountAmount
  const SALES_TAX_RATE = 0.0775
  const taxAmount = applyTaxes ? customerPriceAfterDiscount * SALES_TAX_RATE : 0
  const computedCustomerPrice = customerPriceAfterDiscount + taxAmount
  const parsedOverride = (() => {
    const t = customerPriceOverrideText.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? n : null
  })()
  const customerPrice = parsedOverride != null ? parsedOverride : computedCustomerPrice

  const handleQuoteReady = async () => {
    if (!user) return
    const errors: { title?: string; client?: string; jewelryType?: string } = {}
    if (!quoteTitle.trim()) errors.title = 'Please enter a quote title.'
    if (!client) errors.client = 'Please select or create a client.'
    if (!jewelryType) errors.jewelryType = 'Please select a type of piece.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    const customMissingPrice = stones.some(s => s.sizeKey === '' && s.manualPrice.trim() === '')
    if (customMissingPrice) {
      setSaveError('Enter the stone price for any “Custom” size stone before creating the quote.')
      return
    }
    if (!rnMode && metalRows.some(r => parseGrams(r.grams) <= 0)) {
      setMetalGramsError(true)
      setSaveError('Enter the gram weight for every metal row before creating the quote.')
      setTimeout(() => gramsErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return
    }
    if (rnMode) {
      if (!rn?.model || !rn?.sizeRow) {
        setSaveError('Pick an RN model and a ring size before creating the quote.')
        return
      }
      if (!rn.metalCat) {
        setSaveError('RN rings are only available in 14K / 18K gold or platinum — pick one of those metals.')
        return
      }
    }
    if (pricing.total <= 0) {
      setSaveError("This quote is still $0 — add metal weight, a CAD/Jeweler's-time level, a stone or an extra cost before creating it.")
      return
    }
    if (parsedOverride != null && customerPriceOverrideReason.trim() === '') {
      setOverrideError('Please type a short reason for the override.')
      setEditingOverride(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const firstStone = mainStones[0] ?? sideStones[0] ?? meleeStones[0] ?? null
      // Every new quote starts PENDING and must be approved manually with the
      // Approve button — no auto-approval, regardless of discount size.
      const autoStatus = 'PENDING'
      const sameClientAsSource =
        duplicatedFrom != null &&
        client != null &&
        duplicatedFrom.client?.id != null &&
        duplicatedFrom.client.id === client.id
      const parentQuoteRef = sameClientAsSource
        ? { id: duplicatedFrom!.parentQuoteId ?? Number(duplicatedFrom!.id) }
        : null

      // RN mode: store the pavé as a single MELEE stone (manualPrice = the exact
      // CTW-based diamond cost) and fold the labor/gold breakdown into the note.
      const rnDiamondType: 'natural' | 'lab-grown' = rn?.stoneType ?? 'natural'
      const rnStones = rnMode && rn?.model && rn?.sizeRow
        ? [{
            role: 'MELEE' as const,
            stoneType: rnDiamondType,
            sizeKey: rn.sizeKey,
            carats: rn.ctw,
            setterType: '',
            labReport: null,
            sortOrder: 0,
            shape: null, color: null, cut: null, clarity: null,
            manualPrice: Math.round(rn.diamondCost * 100) / 100,
            comments: `${rn.model.modelKey} · SZ ${rn.sizeRow.fingerSize} · ${rn.numStones} stones · ${rn.ctw}ct`,
            markupMultiplier: null,
            contribution: Math.round((rn.diamondCost + rn.settingLabor) * 100) / 100,
          }]
        : null
      const rnNote = rnMode && rn?.model
        ? [
            `RN ${rn.model.modelKey} · SZ ${rn.sizeRow?.fingerSize ?? '—'} · ${selectedMetalConfig.label} · ${rn.stoneType === 'lab-grown' ? 'Lab' : 'Natural'}`,
            `Gold: ${rn.avgGrams}g × $${rn.goldPerGram}/g = $${rn.goldCost.toFixed(2)}`,
            `Labor: $${rn.casting.toFixed(2)}`,
            `Setting: ${rn.numStones} × $${rn.settingPerStone} = $${rn.settingLabor.toFixed(2)}`,
            `Stones: ${rn.ctw}ct × $${rn.pricePerCarat}/ct = $${rn.diamondCost.toFixed(2)}`,
          ].join('\n')
        : null
      const mergedInternalNotes = rnMode
        ? ([rnNote, internalNotes.trim() || null].filter(Boolean).join('\n\n') || null)
        : (internalNotes.trim() === '' ? null : internalNotes.trim())

      const q = await quotesService.create({
        title: quoteTitle.trim(),
        clientName: client ? `${client.name}${client.surname ? ' ' + client.surname : ''}` : '',
        client: client ?? undefined,
        status: autoStatus,
        metal: selectedMetal,
        metalRows: rnMode
          ? [{ metalKey: selectedMetal, weightGrams: rn?.avgGrams ?? 0, position: 0 }]
          : metalRows.map((r, i) => ({ metalKey: r.metal, weightGrams: parseGrams(r.grams), position: i })),
        ringLabor: rnMode ? '' : ringLabor,
        cadDesign: rnMode ? '' : ringLabor,
        diamondAmount: pricing.totalAmount,
        diamondCarats: pricing.totalCarats,
        diamondType: rnMode ? rnDiamondType : (firstStone?.stoneType ?? 'natural'),
        diamondSize: rnMode && rn ? rn.sizeKey : (firstStone?.sizeKey ?? ''),
        weightGrams: rnMode && rn ? (rn.avgGrams ?? 0) : metalRows.reduce((s, r) => s + parseGrams(r.grams), 0),
        ringWidth: rnMode ? 0 : ringWidth,
        fingerSize: rnMode ? rnFingerSize : fingerSize,
        laborHours: 0,
        hourlyRate: 0,
        extraCosts,
        total: pricing.total,
        markupMultiplier: parsedMarkup,
        discountPercent: parsedDiscount,
        internalNotes: mergedInternalNotes,
        customerNotes: customerNotes.trim() === '' ? null : customerNotes.trim(),
        parentQuote: parentQuoteRef,
        photo: photo ?? undefined,
        engraving: engravingFee > 0,
        engravingFee,
        applyTaxes,
        setterType: rnMode ? '' : (firstStone?.setterType ?? ''),
        jewelryType,
        stones: rnMode ? (rnStones ?? []) : stones.map((s, idx) => {
          const breakdown = stoneBreakdownByUid[s.uid]
          const contribution = breakdown ? breakdown.cost + breakdown.labor : 0
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
            sizeKey: s.sizeKey,
            carats: parseNum(s.carats),
            setterType: s.setterType,
            labReport: s.role === 'MELEE' ? null : (s.labReport || null),
            sortOrder: idx,
            shape: s.shape || null,
            color: s.color || null,
            cut: s.role === 'MAIN' ? (s.cut || null) : null,
            clarity: s.role === 'MAIN' ? (s.clarity || null) : null,
            manualPrice: s.manualPrice.trim() === '' ? null : parseNum(s.manualPrice),
            comments: s.comments.trim() === '' ? null : s.comments.trim(),
            markupMultiplier: markupNum,
            contribution,
          }
        }),
        customerPriceOverride: parsedOverride,
        customerPriceOverrideReason: parsedOverride != null
          ? (customerPriceOverrideReason.trim() === '' ? null : customerPriceOverrideReason.trim())
          : null,
        attachments: attachments.map((a, idx) => ({
          photo: a.photo,
          caption: a.caption.trim() === '' ? null : a.caption.trim(),
          sortOrder: idx,
        })),
        customerStones: customerStones.map((cs, idx) => {
          const gem = gemstones.find(g => g.id === cs.gemstoneId)
          return {
            gemstoneId: cs.gemstoneId ? Number(cs.gemstoneId) : null,
            gemstoneName: gem?.name ?? null,
            setterType: cs.setterType,
            sizeText: cs.size || null,
            quantity: Math.max(1, parseNum(cs.quantity || '1') || 1),
            photo: cs.photo ?? null,
            sortOrder: idx,
            comments: cs.comments.trim() === '' ? null : cs.comments.trim(),
          }
        }),
        emkayStones: emkayStones.map((es, idx) => ({
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
          setterFeeOverride: es.setterFeeOverride.trim() === '' ? null : parseNum(es.setterFeeOverride),
          quantity: Math.max(1, parseNum(es.quantity || '1') || 1),
          sortOrder: idx,
          comments: es.comments.trim() === '' ? null : es.comments.trim(),
        })),
      }, user.id)
      setSavedQuote({ id: q.id, title: q.title, total: pricing.total, publicToken: q.publicToken ?? null })
      setQuoteTitle('')
      setClient(null)
      setJewelryType('')
      setMetalRows(defaultMetalRows())
      setRingLabor('')
      setRingWidth(0)
      setFingerSize(0)
      setExtraCosts(0)
      setEngravingFee(engravingBounds.default)
      setApplyTaxes(false)
      setMarkupText(String(DEFAULT_MARKUP))
      setDiscountText('')
      setCustomerPriceOverrideText('')
      setCustomerPriceOverrideReason('')
      setEditingOverride(false)
      setOverrideError(null)
      setStones([])
      setRnModelKey('')
      setRnFingerSize(0)
      setRnStoneType('natural')
      setCustomerStones([])
      setEmkayStones([])
      setAttachments([])
      setInternalNotes('')
      setCustomerNotes('')
      setPhoto(null)
      setFieldErrors({})
      setMetalGramsError(false)
      setSaveError(null)
      setDuplicatedFrom(null)
      if (photoInputRef.current) photoInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    } catch {
      setSaveError('Failed to save quote. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const ringLaborLabel = config.ringLaborMap[ringLabor]?.label ?? ringLabor
  const jewelryTypeLabel = JEWELRY_TYPE_OPTIONS.find(j => j.key === jewelryType)?.label ?? jewelryType

  return {
    // context
    user, config,
    // header / meta
    duplicatedFrom, setDuplicatedFrom,
    quoteTitle, setQuoteTitle,
    client, setClient,
    saving, savedQuote, setSavedQuote, saveError, setSaveError,
    fieldErrors, setFieldErrors,
    metalGramsError, setMetalGramsError, gramsErrorRef,
    jewelryType, setJewelryType, jewelryTypeLabel,
    pinSummary, setPinSummary,
    // material
    metalRows, setMetalRows,
    selectedMetal, selectedMetalConfig,
    ringLabor, setRingLabor, ringLaborLabel,
    ringWidth, setRingWidth,
    fingerSize, setFingerSize,
    extraCosts, setExtraCosts,
    engravingFee, setEngravingFee, engravingBounds,
    applyTaxes, setApplyTaxes,
    // pricing controls
    markupText, setMarkupText, parsedMarkup,
    discountText, setDiscountText, parsedDiscount,
    customerPriceOverrideText, setCustomerPriceOverrideText,
    customerPriceOverrideReason, setCustomerPriceOverrideReason,
    editingOverride, setEditingOverride,
    overrideError, setOverrideError,
    // RN ring mode
    rnMode,
    rnModelKey, setRnModelKey,
    rnFingerSize, setRnFingerSize,
    rnStoneType, setRnStoneType,
    rn,
    // stones
    stones, setStones, parseNum,
    mainStones, sideStones, meleeStones,
    sizesByStoneType,
    addStone, removeStone, patchStone,
    toggleCollapsed, collapseStone,
    onStoneCaratsChange, onStoneAmountChange, onStoneManualPriceChange,
    // customer stones
    customerStones, customerSetters, gemstones,
    addCustomerStone, removeCustomerStone, patchCustomerStone,
    onCustomerPhotoChange, removeCustomerPhoto,
    customerPhotoInputs, customerCameraInputs,
    // EMKAY catalog stones
    emkayStones, addEmkayStone, removeEmkayStone, patchEmkayStone,
    // attachments + notes
    attachments, handleAttachmentsChange, removeAttachment, patchAttachment,
    attachmentInputRef, attachmentCameraRef,
    internalNotes, setInternalNotes,
    customerNotes, setCustomerNotes,
    // reference photo
    photo, photoInputRef, cameraInputRef, handlePhotoChange, handleRemovePhoto,
    // derived prices
    pricing,
    customMainRaw,
    customMainMarkedUp,
    discountAmount,
    customerPriceBeforeDiscount,
    customerPriceAfterDiscount,
    taxAmount,
    computedCustomerPrice,
    parsedOverride,
    customerPrice,
    // actions
    handleQuoteReady,
  }
}

export type QuoteBuilderState = ReturnType<typeof useQuoteBuilder>
