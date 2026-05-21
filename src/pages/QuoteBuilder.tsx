import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DIAMOND_TYPE_OPTIONS,
  JEWELRY_METAL_OPTIONS,
} from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { gemstoneService } from '@/services/gemstoneService'
import { quotesService } from '@/services/quotesService'
import type { Client, GemstonePrice, JewelryMetalOption } from '@/types'
import { ClientPicker } from '@/components/ClientPicker'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { Toast } from '@/components/Toast'
import { copyToClipboard, publicQuoteUrl } from '@/lib/share'
import { Calculator, Camera, Check, ChevronDown, ChevronUp, Crown, Diamond, Gem, ImagePlus, Layers3, Pin, PinOff, Ruler, Sparkles, User, X } from 'lucide-react'
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

// Standard diamond shapes offered to the user. Empty value = unspecified.
const STONE_SHAPES = [
  'Round', 'Princess', 'Oval', 'Cushion', 'Emerald',
  'Pear', 'Marquise', 'Asscher', 'Radiant', 'Heart',
] as const

// GIA color grades for white diamonds. Fancy colors fall back to "unspecified".
const STONE_COLORS = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const

// Only these setter types make sense for customer-supplied stones.
const CUSTOMER_STONE_SETTER_KEYS = ['customer_melee', 'channel', 'bezel', 'fancy', 'center'] as const

// Catalogue of jewelry piece types. Stored as the key, label is for display.
const JEWELRY_TYPE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'ring',      label: 'Ring' },
  { key: 'pendant',   label: 'Pendant' },
  { key: 'necklace',  label: 'Necklace' },
  { key: 'bracelet',  label: 'Bracelet' },
  { key: 'earrings',  label: 'Earrings' },
  { key: 'cufflinks', label: 'Cufflinks' },
  { key: 'brooch',    label: 'Brooch' },
  { key: 'anklet',    label: 'Anklet' },
  { key: 'other',     label: 'Other' },
]


export function QuoteBuilderPage() {
  const { user } = useAuth()
  const config = useQuoteConfig()

  const [quoteTitle, setQuoteTitle] = useState('')
  const [client, setClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedQuote, setSavedQuote] = useState<{ id: string; title: string; total: number; publicToken: string | null } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; client?: string }>({})
  const [jewelryType, setJewelryType] = useState<string>('ring')
  // Pin behaviour for the right-column "Estimated total" card.
  //   true  → sticky, follows the user as they scroll (default).
  //   false → scrolls away with the rest of the page (the previous behaviour
  //           before we made it sticky). User toggles with the pin button.
  const [pinSummary, setPinSummary] = useState(true)
  const [selectedMetal, setSelectedMetal] = useState<JewelryMetalOption>('gold-18k-white')
  const [ringLabor, setRingLabor] = useState('medium')
  const [weightGrams, setWeightGrams] = useState(12)
  const [ringWidth, setRingWidth] = useState(2.5)
  const [fingerSize, setFingerSize] = useState(7)
  const [extraCosts, setExtraCosts] = useState(0)
  const [engraving, setEngraving] = useState(false)

  // Multi-stone breakdown: 0 or 1 MAIN, plus 0..N SIDE and 0..N MELEE.
  // amount lives in UI state so the user can override it independently of
  // carats (Case 3); only `carats` is persisted to the backend.
  type StoneRole = 'MAIN' | 'SIDE' | 'MELEE'
  // Carats and amount stay as raw input strings so the user can type
  // intermediate values like "0." or "0.0045" without the controlled input
  // collapsing them back to "0". Parsed lazily in pricing/save.
  interface StoneRow {
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
    // Raw input. When non-empty, overrides carats × pricePerCarat for this
    // stone's cost. Setting labor is unaffected.
    manualPrice: string
    // Free-form notes the jeweler wants to attach to this stone (rendered on
    // the MAIN row only for now).
    comments: string
    /** Whether the form for this stone is folded into a compact summary card.
     *  New stones start expanded; clicking "Done" collapses; chevron toggles. */
    collapsed: boolean
  }
  const [stones, setStones] = useState<StoneRow[]>([])
  const parseNum = (s: string) => {
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
  }

  // ── Customer stones: client brings their own stone, we only charge setting
  // labor (quantity × setter fee). Stone type is picked from the gemstones
  // catalog so it shows up properly on the quote. No persistence yet — kept
  // local to this builder until the user asks for it.
  interface CustomerStone {
    uid: string
    gemstoneId: string
    setterType: string
    size: string
    quantity: string
    photo: string | null
    comments: string
  }
  const [customerStones, setCustomerStones] = useState<CustomerStone[]>([])
  const [gemstones, setGemstones] = useState<GemstonePrice[]>([])
  const customerPhotoInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const customerCameraInputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    gemstoneService.getAll().then(setGemstones).catch(console.error)
  }, [])

  // Setters allowed for customer-supplied stones — narrowed to the subset the
  // user wants to expose in the Customer Stones section.
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
      manualPrice: '',
      comments: '',
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
    if (role === 'MAIN' && stones.some(s => s.role === 'MAIN')) return
    setStones(prev => [...prev, defaultStoneFor(role)])
  }
  const removeStone = (uid: string) => {
    setStones(prev => prev.filter(s => s.uid !== uid))
  }
  const patchStone = (uid: string, patch: Partial<StoneRow>) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const next = { ...s, ...patch }
      // If the size or type changed, jump to a valid size for that stoneType.
      if (patch.stoneType && !patch.sizeKey) {
        const list = patch.stoneType === 'natural' ? sizesByStoneType.NATURAL : sizesByStoneType.LAB
        if (!list.some(d => d.sizeKey === next.sizeKey)) {
          next.sizeKey = list[0]?.sizeKey ?? ''
        }
      }
      return next
    }))
  }

  // Two-way sync between carats and amount for a single stone via ctPerStone.
  // The typed field keeps the raw string (so "0." stays "0."); the derived
  // field is overwritten with a formatted number string.
  const onStoneCaratsChange = (uid: string, caratsText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const ct = config.diamondSizeMap[s.sizeKey]?.ctPerStone ?? 0
      if (caratsText === '') return { ...s, carats: '', amount: '' }
      const carats = parseNum(caratsText)
      const amount = ct > 0 ? String(Math.round(carats / ct)) : s.amount
      return { ...s, carats: caratsText, amount }
    }))
  }
  const onStoneAmountChange = (uid: string, amountText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const ct = config.diamondSizeMap[s.sizeKey]?.ctPerStone ?? 0
      if (amountText === '') return { ...s, amount: '', carats: '' }
      const amount = parseNum(amountText)
      const carats = ct > 0
        ? String(Math.round(amount * ct * 10000) / 10000)
        : s.carats
      return { ...s, amount: amountText, carats }
    }))
  }

  // When the user types a manual price they're overriding the per-carat
  // calculation, but the SETTING labor (amount × setter fee) must still
  // apply. Default amount to "1" the first time a manual price is entered
  // so the labor isn't silently zero — the user can still bump amount up
  // for multi-stone settings.
  const onStoneManualPriceChange = (uid: string, priceText: string) => {
    setStones(prev => prev.map(s => {
      if (s.uid !== uid) return s
      const shouldSeedAmount = priceText.trim() !== '' && s.amount.trim() === ''
      return { ...s, manualPrice: priceText, amount: shouldSeedAmount ? '1' : s.amount }
    }))
  }

  const mainStone   = stones.find(s => s.role === 'MAIN') ?? null
  const sideStones  = stones.filter(s => s.role === 'SIDE')
  const meleeStones = stones.filter(s => s.role === 'MELEE')

  // Jewelry-inspired palette. Each role uses a gradient on the left bar so the
  // section reads as "luxurious" rather than flat blocks of color.
  //  · MAIN  = gold / champagne (the headline stone)
  //  · SIDE  = sapphire (regal blue, complements gold)
  //  · MELEE = platinum / teal (cool, understated)
  const themeForRole = (role: StoneRole) => {
    switch (role) {
      case 'MAIN':
        return {
          label: 'Main',
          icon: Crown,
          bar:   'bg-gradient-to-b from-amber-300 via-amber-500 to-yellow-600',
          dot:   'bg-amber-500',
          ring:  'border-amber-200/80',
          tint:  'bg-gradient-to-br from-amber-50/70 via-white to-yellow-50/40',
          chip:  'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
          btn:   'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500',
          header:'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80',
        }
      case 'SIDE':
        return {
          label: 'Side',
          icon: Diamond,
          bar:   'bg-gradient-to-b from-sky-400 via-blue-500 to-indigo-600',
          dot:   'bg-blue-500',
          ring:  'border-blue-200/80',
          tint:  'bg-gradient-to-br from-sky-50/70 via-white to-indigo-50/40',
          chip:  'bg-blue-100 text-blue-900 ring-1 ring-blue-200',
          btn:   'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500',
          header:'bg-blue-50 text-blue-700 ring-1 ring-blue-200/80',
        }
      case 'MELEE':
        return {
          label: 'Melee',
          icon: Sparkles,
          bar:   'bg-gradient-to-b from-teal-300 via-emerald-500 to-emerald-700',
          dot:   'bg-emerald-500',
          ring:  'border-emerald-200/80',
          tint:  'bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40',
          chip:  'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200',
          btn:   'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500',
          header:'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80',
        }
    }
  }

  // Customer-stone theme (rose / blush) — separated from the role-based set
  // because customer stones aren't part of MAIN/SIDE/MELEE.
  const customerTheme = {
    label: 'Customer',
    bar:   'bg-gradient-to-b from-rose-300 via-rose-500 to-pink-600',
    dot:   'bg-rose-500',
    ring:  'border-rose-200/80',
    tint:  'bg-gradient-to-br from-rose-50/70 via-white to-pink-50/40',
    chip:  'bg-rose-100 text-rose-900 ring-1 ring-rose-200',
    btn:   'bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-400 hover:to-pink-500',
    header:'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80',
  }

  const renderStoneRow = (stone: StoneRow, index: number) => {
    const sizes = stone.stoneType === 'natural' ? sizesByStoneType.NATURAL : sizesByStoneType.LAB
    const sizeCfg = config.diamondSizeMap[stone.sizeKey]
    const pricePerCarat = (sizeCfg?.basePrice ?? 0) * DIAMOND_TYPE_OPTIONS[stone.stoneType].multiplier
    const caratsNum = parseNum(stone.carats)
    const amountNum = parseNum(stone.amount)
    const hasManualPrice = stone.manualPrice.trim() !== ''
    const stoneCost = hasManualPrice ? parseNum(stone.manualPrice) : caratsNum * pricePerCarat
    const stoneSetterFee = config.setterMap[stone.setterType]?.fee ?? 0
    const stoneLabor = amountNum * stoneSetterFee
    const stoneTotal = stoneCost + stoneLabor
    const theme = themeForRole(stone.role)
    const typeLabel = DIAMOND_TYPE_OPTIONS[stone.stoneType].label
    const sizeLabel = sizeCfg?.label ?? stone.sizeKey
    const setterLabel = config.setterMap[stone.setterType]?.label ?? stone.setterType

    // ── Collapsed (summary) view ────────────────────────────────────────
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
          <button
            type="button"
            onClick={() => toggleCollapsed(stone.uid)}
            className="flex w-full items-center justify-between gap-3 pl-5 pr-3 py-3 text-left"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} aria-hidden />
                {theme.label} #{index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {summaryParts.length > 0 ? summaryParts.join(' · ') : 'Not configured yet'}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {sizeLabel} · {setterLabel || 'no setter'}
                </p>
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
          {/* Remove button overlay so it's still reachable without expanding */}
          <button
            type="button"
            onClick={() => removeStone(stone.uid)}
            aria-label="Remove stone"
            className="absolute right-12 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 sm:flex"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )
    }

    // ── Expanded (form) view ────────────────────────────────────────────
    return (
      <div key={stone.uid} className={`relative rounded-2xl border ${theme.ring} ${theme.tint} p-4 space-y-3 overflow-hidden shadow-sm transition hover:shadow-md`}>
        <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${theme.bar}`} aria-hidden />

        <div className="flex items-center justify-between gap-2 pl-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${theme.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} aria-hidden />
            {theme.label} stone #{index + 1}
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => toggleCollapsed(stone.uid)}
              aria-label="Collapse"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => removeStone(stone.uid)}
              aria-label="Remove stone"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 pl-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
            <select value={stone.stoneType}
              onChange={e => patchStone(stone.uid, { stoneType: e.target.value as StoneRow['stoneType'] })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
              {diamondTypeKeys.map(key => (
                <option key={key} value={key}>{DIAMOND_TYPE_OPTIONS[key].label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Size</label>
            <select value={stone.sizeKey}
              onChange={e => patchStone(stone.uid, { sizeKey: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
              {sizes.length === 0 && <option value="">No sizes for this type</option>}
              {sizes.map(d => (
                <option key={d.id} value={d.sizeKey}>
                  {d.label} — ${d.basePrice}{d.ctPerStone != null ? '/ct' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Carats</label>
            <input type="text" inputMode="decimal" value={stone.carats} placeholder="0.0000"
              onChange={e => onStoneCaratsChange(stone.uid, e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</label>
            <input type="text" inputMode="numeric" value={stone.amount} placeholder="0"
              onChange={e => onStoneAmountChange(stone.uid, e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type of setting</label>
            <select value={stone.setterType}
              onChange={e => patchStone(stone.uid, { setterType: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
              {config.setters.map(s => (
                <option key={s.typeKey} value={s.typeKey}>{s.label} — ${s.fee}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Shape <span className="font-normal normal-case text-slate-400">(optional)</span>
            </label>
            <select value={stone.shape}
              onChange={e => patchStone(stone.uid, { shape: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
              <option value="">—</option>
              {STONE_SHAPES.map(sh => (
                <option key={sh} value={sh}>{sh}</option>
              ))}
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
              {STONE_COLORS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Custom price <span className="font-normal normal-case text-slate-400">(optional — overrides carats × ${pricePerCarat.toLocaleString('en-US', { minimumFractionDigits: 2 })}/ct)</span>
            </label>
            <input type="number" min={0} step="0.01" value={stone.manualPrice} placeholder="Leave empty to use calculated price"
              onChange={e => onStoneManualPriceChange(stone.uid, e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
            <p className="text-[10px] text-slate-400">
              Setting labor (amount × setter fee) is added on top of this price.
            </p>
          </div>

          {stone.role !== 'MELEE' && (
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Lab report <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <input type="text" value={stone.labReport} placeholder="e.g. GIA 1234567890"
                onChange={e => patchStone(stone.uid, { labReport: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
            </div>
          )}

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
              Stone <strong className="ml-1 text-slate-900">${stoneCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              {hasManualPrice && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">custom</span>}
            </span>
            <span className="rounded-xl bg-white/70 px-3 py-1.5">
              Setting <strong className="ml-1 text-slate-900">${stoneLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => collapseStone(stone.uid)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition ${theme.btn}`}
          >
            <Check className="h-3.5 w-3.5" /> Done
          </button>
        </div>
      </div>
    )
  }

  const renderStoneSection = (opts: {
    role: StoneRole
    title: string
    hint: string
    items: StoneRow[]
    canAdd: boolean
    addLabel: string
    onAdd: () => void
  }) => {
    const theme = themeForRole(opts.role)
    const Icon = theme.icon
    return (
    <div className="group/section relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${theme.bar} opacity-80`} aria-hidden />
      <div className="flex items-center justify-between gap-3 pl-2">
        <div className="flex items-center gap-3">
          <span className={`h-9 w-9 rounded-xl ${theme.header} flex items-center justify-center shadow-sm`}>
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {opts.title}
              <span className={`ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${theme.chip}`}>
                {opts.items.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500">{opts.hint}</p>
          </div>
        </div>
        {opts.canAdd && (
          <button type="button" onClick={opts.onAdd}
            className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition ${theme.btn}`}>
            + {opts.addLabel}
          </button>
        )}
      </div>
      <div className="mt-3 pl-2">
        {opts.items.length === 0
          ? <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">None yet.</p>
          : <div className="space-y-3">{opts.items.map((s, i) => renderStoneRow(s, i))}</div>
        }
      </div>
    </div>
    )
  }

  const pricing = useMemo(() => {
    const metalPricePerGram = selectedMetalConfig.pricePerGram
    const materialCost = metalPricePerGram * weightGrams
    const ringLaborFee = config.ringLaborMap[ringLabor]?.fee ?? 0
    const cadFee = 0
    const engravingFee = engraving ? HAND_ENGRAVING_FEE : 0

    // Per-stone cost = carats × pricePerCarat (× type multiplier).
    // Per-stone setting labor = amount × setter fee.
    let diamondCost = 0
    let settingFee = 0
    let totalCarats = 0
    let totalAmount = 0
    const stoneBreakdown = stones.map(s => {
      const sizeCfg = config.diamondSizeMap[s.sizeKey]
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

    // Customer-supplied stones: we don't price the stone itself (the client
    // brings it), only the setter labor scaled by quantity.
    let customerSettingFee = 0
    customerStones.forEach(cs => {
      const qty = parseNum(cs.quantity || '1') || 1
      const fee = config.setterMap[cs.setterType]?.fee ?? 0
      customerSettingFee += qty * fee
    })

    const total =
      materialCost +
      ringLaborFee +
      cadFee +
      settingFee +
      customerSettingFee +
      diamondCost +
      engravingFee +
      extraCosts

    return {
      metalPricePerGram,
      materialCost,
      ringLaborFee,
      cadFee,
      settingFee,
      customerSettingFee,
      diamondCost,
      engravingFee,
      totalCarats: Math.round((Number(totalCarats) || 0) * 10000) / 10000,
      totalAmount,
      stoneBreakdown,
      total,
    }
  }, [
    config, customerStones, engraving, extraCosts, ringLabor, ringWidth,
    selectedMetalConfig, stones, weightGrams,
  ])

  const handleQuoteReady = async () => {
    if (!user) return
    const errors: { title?: string; client?: string } = {}
    if (!quoteTitle.trim()) errors.title = 'Please enter a quote title.'
    if (!client) errors.client = 'Please select or create a client.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    setSaving(true)
    setSaveError(null)
    try {
      // Legacy fields are populated with aggregates so older list views keep
      // rendering until they're rewritten to consume `stones` directly.
      const firstStone = mainStone ?? sideStones[0] ?? meleeStones[0] ?? null
      const q = await quotesService.create({
        title: quoteTitle.trim(),
        clientName: client ? `${client.name}${client.surname ? ' ' + client.surname : ''}` : '',
        client: client ?? undefined,
        status: 'PENDING',
        metal: selectedMetal,
        ringLabor,
        cadDesign: ringLabor,
        diamondAmount: pricing.totalAmount,
        diamondCarats: pricing.totalCarats,
        diamondType: firstStone?.stoneType ?? 'natural',
        diamondSize: firstStone?.sizeKey ?? '',
        weightGrams,
        ringWidth,
        fingerSize,
        laborHours: 0,
        hourlyRate: 0,
        extraCosts,
        total: pricing.total,
        photo: photo ?? undefined,
        engraving,
        setterType: firstStone?.setterType ?? '',
        jewelryType,
        stones: stones.map((s, idx) => ({
          role: s.role,
          stoneType: s.stoneType,
          sizeKey: s.sizeKey,
          carats: parseNum(s.carats),
          setterType: s.setterType,
          labReport: s.role === 'MELEE' ? null : (s.labReport || null),
          sortOrder: idx,
          shape: s.shape || null,
          color: s.color || null,
          manualPrice: s.manualPrice.trim() === '' ? null : parseNum(s.manualPrice),
          comments: s.comments.trim() === '' ? null : s.comments.trim(),
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
      }, user.id)
      setSavedQuote({ id: q.id, title: q.title, total: pricing.total, publicToken: q.publicToken ?? null })
      // Reset every field back to its initial default so the builder is
      // ready for the next quote without leaking values from the one we
      // just saved.
      setQuoteTitle('')
      setClient(null)
      setJewelryType('ring')
      setSelectedMetal('gold-18k-white')
      setRingLabor('medium')
      setWeightGrams(12)
      setRingWidth(2.5)
      setFingerSize(7)
      setExtraCosts(0)
      setEngraving(false)
      setStones([])
      setCustomerStones([])
      setPhoto(null)
      setFieldErrors({})
      setSaveError(null)
      if (photoInputRef.current) photoInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    } catch {
      setSaveError('Failed to save quote. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const ringLaborLabel = config.ringLaborMap[ringLabor]?.label ?? ringLabor

  if (config.loading) return <QuoteBuilderSkeleton />

  return (
    <div className="space-y-6">
      {/* ── Persistent share-link card after creating a quote ─────────────── */}
      {savedQuote?.publicToken && (
        <Card className="rounded-[24px] border border-emerald-200 bg-emerald-50/60 shadow-[0_20px_60px_rgba(16,185,129,0.16)]">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Share link ready</p>
              <p className="mt-1 truncate font-mono text-sm text-slate-900">
                {publicQuoteUrl(savedQuote.publicToken)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Send this URL to <strong>{savedQuote.title}</strong>'s client — no login required. Valid for 3 months.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <CopyShareLinkButton token={savedQuote.publicToken} iconOnly={false} />
              <button
                type="button"
                onClick={() => setSavedQuote(null)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700"
              >
                Dismiss
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <section>
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
                piece and <strong>Stone Setting</strong> for the diamonds.
              </p>

              <div className="mt-6 grid gap-3 sm:mt-8 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Metal price / g</p>
                  <p className="mt-2 text-2xl font-semibold">
                    ${pricing.metalPricePerGram.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">CAD &amp; Jeweler's time</p>
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
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Quote title</label>
                <input
                  type="text"
                  value={quoteTitle}
                  onChange={e => {
                    setQuoteTitle(e.target.value)
                    if (fieldErrors.title) setFieldErrors(prev => ({ ...prev, title: undefined }))
                  }}
                  placeholder="e.g. Solitaire engagement ring"
                  aria-invalid={!!fieldErrors.title}
                  className={`w-full rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:bg-white ${
                    fieldErrors.title ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-slate-400'
                  }`}
                />
                {fieldErrors.title && (
                  <p className="text-xs font-medium text-rose-600">{fieldErrors.title}</p>
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Type of piece</label>
                <select value={jewelryType} onChange={e => setJewelryType(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {JEWELRY_TYPE_OPTIONS.map(j => (
                    <option key={j.key} value={j.key}>{j.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Client</label>
                <ClientPicker
                  value={client}
                  onChange={(c) => {
                    setClient(c)
                    if (c && fieldErrors.client) setFieldErrors(prev => ({ ...prev, client: undefined }))
                  }}
                  hasError={!!fieldErrors.client}
                />
                {fieldErrors.client && (
                  <p className="text-xs font-medium text-rose-600">{fieldErrors.client}</p>
                )}
                {client && !fieldErrors.client && (
                  <p className="text-xs text-slate-500">
                    {[client.email, client.phone].filter(Boolean).join(' · ') || 'No contact info on file'}
                  </p>
                )}
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

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">
                  CAD design &amp; Jeweler's time
                </label>
                <select value={ringLabor} onChange={e => setRingLabor(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  {config.ringLaborTiers.map(t => (
                    <option key={t.tierKey} value={t.tierKey}>{t.label} — ${t.fee}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">
                  One difficulty level covers both CAD design and the jeweler's time on this quote.
                </p>
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
          <Card className="relative overflow-hidden rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.10),transparent_45%),radial-gradient(circle_at_top_right,rgba(244,63,94,0.08),transparent_50%)]" aria-hidden />
            <CardHeader className="relative border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-100 via-rose-100 to-blue-100 text-slate-700 ring-1 ring-white/80 flex items-center justify-center shadow-sm">
                  <Gem className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Stone Setting</CardTitle>
                  <p className="text-xs text-slate-500">
                    Main, side and melee — plus stones supplied by the client.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {renderStoneSection({
                role: 'MAIN',
                title: 'Main stone',
                hint: 'The center stone. Pick one or skip.',
                items: mainStone ? [mainStone] : [],
                canAdd: !mainStone,
                addLabel: 'Add main',
                onAdd: () => addStone('MAIN'),
              })}
              {renderStoneSection({
                role: 'SIDE',
                title: 'Side stones',
                hint: 'Accent stones. Add as many as you need.',
                items: sideStones,
                canAdd: true,
                addLabel: 'Add side',
                onAdd: () => addStone('SIDE'),
              })}
              {renderStoneSection({
                role: 'MELEE',
                title: 'Melee stones',
                hint: 'Pavé / melee. Add as many as you need.',
                items: meleeStones,
                canAdd: true,
                addLabel: 'Add melee',
                onAdd: () => addStone('MELEE'),
              })}

              {/* ── Customer stones ─────────────────────────────────────── */}
              <div className="group/section relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md">
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${customerTheme.bar} opacity-80`} aria-hidden />
                <div className="flex items-center justify-between gap-3 pl-2">
                  <div className="flex items-center gap-3">
                    <span className={`h-9 w-9 rounded-xl ${customerTheme.header} flex items-center justify-center shadow-sm`}>
                      <User className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Customer stones
                        <span className={`ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${customerTheme.chip}`}>
                          {customerStones.length}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Stones supplied by the client. We only charge setting labor (quantity × setter fee).
                      </p>
                    </div>
                  </div>
                  <button type="button" onClick={addCustomerStone}
                    className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition ${customerTheme.btn}`}>
                    + Add customer stone
                  </button>
                </div>

                {customerStones.length === 0 ? (
                  <p className="mt-3 ml-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">None yet.</p>
                ) : (
                  <div className="mt-3 pl-2 space-y-3">
                    {customerStones.map((cs, idx) => {
                      const qtyNum = parseNum(cs.quantity || '1') || 1
                      const setterFee = config.setterMap[cs.setterType]?.fee ?? 0
                      const lineFee = qtyNum * setterFee
                      const gem = gemstones.find(g => g.id === cs.gemstoneId)
                      return (
                        <div key={cs.uid} className={`relative rounded-2xl border ${customerTheme.ring} ${customerTheme.tint} p-4 space-y-3 overflow-hidden shadow-sm transition hover:shadow-md`}>
                          <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${customerTheme.bar}`} aria-hidden />

                          <div className="flex items-center justify-between gap-2 pl-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${customerTheme.chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${customerTheme.dot}`} aria-hidden />
                              Customer stone #{idx + 1}
                            </span>
                            <button type="button" onClick={() => removeCustomerStone(cs.uid)}
                              aria-label="Remove customer stone"
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                              <X className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 pl-2">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type of stone</label>
                              <select value={cs.gemstoneId}
                                onChange={e => patchCustomerStone(cs.uid, { gemstoneId: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                                {gemstones.length === 0 && <option value="">No gemstones loaded</option>}
                                {gemstones.map(g => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Type of setting</label>
                              <select value={cs.setterType}
                                onChange={e => patchCustomerStone(cs.uid, { setterType: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                                {customerSetters.map(s => (
                                  <option key={s.typeKey} value={s.typeKey}>{s.label} — ${s.fee}</option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Size</label>
                              <input type="text" value={cs.size} placeholder="e.g. 6×4 mm oval"
                                onChange={e => patchCustomerStone(cs.uid, { size: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Quantity <span className="font-normal normal-case text-slate-400">(multiplies setter fee)</span>
                              </label>
                              <input type="number" min={1} step={1} value={cs.quantity}
                                onChange={e => patchCustomerStone(cs.uid, { quantity: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
                            </div>

                            <div className="space-y-1 md:col-span-2">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Photo <span className="font-normal normal-case text-slate-400">(optional)</span>
                              </label>

                              <input
                                ref={el => { customerPhotoInputs.current[cs.uid] = el }}
                                id={`cs-photo-${cs.uid}`} type="file" accept="image/*"
                                onChange={e => onCustomerPhotoChange(cs.uid, e)} className="hidden" />
                              <input
                                ref={el => { customerCameraInputs.current[cs.uid] = el }}
                                id={`cs-camera-${cs.uid}`} type="file" accept="image/*"
                                capture="environment"
                                onChange={e => onCustomerPhotoChange(cs.uid, e)} className="hidden" />

                              {!cs.photo ? (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <label htmlFor={`cs-camera-${cs.uid}`}
                                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500 transition hover:border-slate-400 sm:hidden">
                                    <Camera className="h-4 w-4 shrink-0 text-slate-400" />
                                    <span>Take photo</span>
                                  </label>
                                  <label htmlFor={`cs-photo-${cs.uid}`}
                                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500 transition hover:border-slate-400 sm:col-span-2">
                                    <ImagePlus className="h-4 w-4 shrink-0 text-slate-400" />
                                    <span>Choose photo</span>
                                  </label>
                                </div>
                              ) : (
                                <div className="relative overflow-hidden rounded-xl border border-slate-200">
                                  <img src={cs.photo} alt="Customer stone" className="w-full object-cover max-h-48" />
                                  <button type="button" onClick={() => removeCustomerPhoto(cs.uid)}
                                    className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/80">
                                    <X className="h-3 w-3" /> Remove
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1 md:col-span-2">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Additional comments <span className="font-normal normal-case text-slate-400">(optional)</span>
                              </label>
                              <textarea rows={3} value={cs.comments}
                                placeholder="Any notes about the stone — provenance, condition, instructions, etc."
                                onChange={e => patchCustomerStone(cs.uid, { comments: e.target.value })}
                                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400" />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 pl-2 pt-3 border-t border-white/60">
                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                              {gem && (
                                <span className="rounded-xl bg-white/70 px-3 py-1.5">
                                  Stone <strong className="ml-1 text-slate-900">{gem.name}</strong>
                                </span>
                              )}
                              <span className="rounded-xl bg-white/70 px-3 py-1.5">
                                Setting <strong className="ml-1 text-slate-900">${lineFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                                <span className="ml-1 text-[10px] text-slate-400">({qtyNum} × ${setterFee})</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-5 py-4 text-sm text-white shadow-[0_10px_30px_rgba(15,23,42,0.25)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.15),transparent_45%)]" aria-hidden />
                <div className="relative">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/90">Setting labor</p>
                  <p className="mt-0.5 text-xs text-slate-300">
                    {pricing.totalAmount} stone{pricing.totalAmount === 1 ? '' : 's'} · {pricing.totalCarats} ct
                    {customerStones.length > 0 ? ` + ${customerStones.length} customer` : ''}
                  </p>
                </div>
                <strong className="relative text-2xl font-semibold tracking-tight tabular-nums">
                  ${(pricing.settingFee + pricing.customerSettingFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button size="lg" className="w-full rounded-2xl px-5 text-white sm:w-auto"
              style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={handleQuoteReady} disabled={saving}>
              {saving ? 'Saving…' : 'Quote ready'}
            </Button>
            {saveError && (
              <p className="text-xs font-medium text-rose-600">{saveError}</p>
            )}
          </div>
        </div>

        {/* ── Columna derecha: estimated total (sticky) + mini-cards ─────── */}
        <div className="space-y-4">
          <Card className={`rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] ${pinSummary ? 'xl:sticky xl:top-32 xl:z-10' : ''}`}>
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">Estimated total</CardTitle>
                  <p className="text-sm text-slate-500">Live breakdown for the current quote.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPinSummary(v => !v)}
                  title={pinSummary ? 'Unpin — scroll with the page' : 'Pin — keep visible while scrolling'}
                  aria-label={pinSummary ? 'Unpin summary' : 'Pin summary'}
                  aria-pressed={pinSummary}
                  className={`hidden xl:inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                    pinSummary
                      ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                >
                  {pinSummary ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="rounded-2xl p-5 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Quote total</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  ${((pricing.total - pricing.engravingFee) * 2.5 + pricing.engravingFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {selectedMetalConfig.label} | {ringLaborLabel}
                </p>
              </div>

              <div className="space-y-3 text-sm">
                {([
                  ['Material reference', pricing.materialCost],
                  ['CAD design & Jeweler\'s time', pricing.ringLaborFee],
                  // "Setting supplied diamonds" = stone cost + labor for the
                  // in-house MAIN/SIDE/MELEE stones (we buy them and set them).
                  [`Setting supplied diamonds (${pricing.totalAmount} stones · ${pricing.totalCarats} ct)`,
                    pricing.diamondCost + pricing.settingFee],
                  // Only render the customer line when there's at least one —
                  // an empty "Setting customer diamonds (0 stones)" line is noise.
                  ...(customerStones.length > 0
                    ? [[
                        `Setting customer diamonds (${customerStones.length} stone${customerStones.length === 1 ? '' : 's'})`,
                        pricing.customerSettingFee,
                      ] as [string, number]]
                    : []),
                  ['Hand engraving (milgrain)', pricing.engravingFee],
                  ['Extra costs', extraCosts],
                ] as Array<[string, number]>).map(([label, value]) => (
                  <div key={label as string} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-slate-900">${(value as number).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">CAD &amp; Jeweler's time</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{ringLaborLabel}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><Layers3 className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                ${pricing.ringLaborFee.toLocaleString('en-US', { minimumFractionDigits: 2 })} covers CAD design and the jeweler's time.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Diamonds</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{pricing.totalAmount}</p>
                </div>
                <div className="rounded-2xl bg-fuchsia-50 p-3 text-fuchsia-600"><Diamond className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {stones.length} stone{stones.length === 1 ? '' : 's'} · {pricing.totalCarats} ct total · ${pricing.diamondCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Setting labor</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                    ${(pricing.settingFee + pricing.customerSettingFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-2xl bg-rose-50 p-3 text-rose-600"><Diamond className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                Aggregated across {pricing.totalAmount} stone{pricing.totalAmount === 1 ? '' : 's'}
                {customerStones.length > 0 ? ` + ${customerStones.length} customer stone${customerStones.length === 1 ? '' : 's'}` : ''}.
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
                Width {ringWidth} mm.
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
  quote: { id: string; title: string; total: number; publicToken: string | null }
  onClose: () => void
}) {
  const navigate = useNavigate()
  const hasLink = !!quote.publicToken
  return (
    <Toast
      title="Quote created!"
      description={`${quote.title} · $${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}${hasLink ? ' · share link ready' : ''}`}
      actionLabel={hasLink ? 'Copy share link' : 'View quotes →'}
      onAction={async () => {
        if (hasLink && quote.publicToken) {
          await copyToClipboard(publicQuoteUrl(quote.publicToken))
        } else {
          navigate('/quotes-list')
        }
      }}
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
