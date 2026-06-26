import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DIAMOND_TYPE_OPTIONS,
  JEWELRY_METAL_OPTIONS,
} from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { useQuoteConfig, normalizeSizeKey } from '@/hooks/useQuoteConfig'
import { computeRnBreakdown, type RnStoneType } from '@/lib/rnPricing'
import { compareStoneTypes } from '@/lib/stoneTypeCompare'
import { StoneTypeCompareDialog } from '@/components/StoneTypeCompareDialog'
import { CreateLabSizeDialog } from '@/components/CreateLabSizeDialog'
import { configService } from '@/services/configService'
import { gemstoneService } from '@/services/gemstoneService'
import { companyService, ENGRAVING_SLIDER_DEFAULTS } from '@/services/companyService'
import { quotesService } from '@/services/quotesService'
import type { Client, GemstonePrice, JewelryMetalOption, SavedQuote } from '@/types'
import { ClientPicker } from '@/components/ClientPicker'
import { CopyShareLinkButton } from '@/components/CopyShareLinkButton'
import { OpenQuoteButton } from '@/components/OpenQuoteButton'
import { Toast } from '@/components/Toast'
import { copyToClipboard, publicQuoteUrl } from '@/lib/share'
import { Calculator, Camera, Check, ChevronDown, ChevronUp, Copy, Crown, Diamond, ExternalLink, Gem, ImagePlus, Layers3, Pin, PinOff, Ruler, Scale, Sparkles, User, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const HAND_ENGRAVING_FEE = 150
const DEFAULT_MARKUP = 2.5
const MARKUP_PRESETS = [2, 2.5, 3] as const
const DISCOUNT_PRESETS = [5, 10, 15, 20, 25, 30] as const

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
// GIA grading scales for the MAIN (center) stone.
const STONE_CUTS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'] as const
const STONE_CLARITIES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'] as const

// Only these setter types make sense for customer-supplied stones.
const CUSTOMER_STONE_SETTER_KEYS = ['customer_melee', 'channel', 'bezel', 'fancy', 'center'] as const

// Turn a free-text lab report like "GIA 1234567890" into a deep-link to the
// issuing lab's online verification page, so the user can confirm the stone's
// certificate is real. Returns null only when the field is empty — otherwise it
// always returns a target plus a `valid` flag so the UI can show a GREEN button
// when the report number is well-formed and a RED one when it isn't.
//
// NOTE: `valid` is a FORMAT check only (right lab + plausible report-number
// length). We can't query GIA's database from the browser (no public API +
// CORS), so the button still opens the official report-check for the real
// lookup; the colour is just an at-a-glance "does this look like a real number".
function labReportVerifyUrl(raw: string): { url: string; lab: string; valid: boolean } | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  const upper = text.toUpperCase()
  // Longest run of digits = the report number on every lab's slip.
  const number = text.replace(/[\s-]/g, '').match(/\d{4,}/)?.[0]

  if (upper.includes('IGI')) {
    // IGI's lookup is a form (no documented query param) — open the verify page.
    // IGI report numbers are long numeric strings (≈ 8–13 digits).
    const valid = !!number && number.length >= 7
    return { url: 'https://www.igi.org/verify-your-report/', lab: 'IGI', valid }
  }
  // Default to GIA — by far the most common, and its report-check accepts the
  // report number straight off the query string. Modern GIA report numbers are
  // 10 digits; older full reports run 7–8 digits.
  const valid = !!number && number.length >= 7 && number.length <= 11
  return {
    url: number
      ? `https://www.gia.edu/report-check?reportno=${number}`
      : 'https://www.gia.edu/report-check',
    lab: 'GIA',
    valid,
  }
}

// Catalogue of jewelry piece types. Stored as the key, label is for display.
const JEWELRY_TYPE_OPTIONS: Array<{ key: string; label: string }> = [
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


/** One label/value row in the RN breakdown panel. */
function RnRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-slate-600">
      <dt>{label}</dt>
      <dd className="font-medium tabular-nums text-slate-900">{value}</dd>
    </div>
  )
}

export function QuoteBuilderPage() {
  const { user } = useAuth()
  const config = useQuoteConfig()
  const location = useLocation()
  const navigate = useNavigate()
  // Source quote when the user landed here via "Duplicate" — drives the
  // banner and the one-shot prefill effect below. Cleared after consuming so
  // refreshing the page doesn't re-apply the duplicate.
  const [duplicatedFrom, setDuplicatedFrom] = useState<SavedQuote | null>(null)

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
  // ── Multi-metal rows (1–3) ───────────────────────────────────────────
  interface MetalRow { uid: string; metal: JewelryMetalOption; grams: string }
  const defaultMetalRows = (): MetalRow[] => [{ uid: crypto.randomUUID(), metal: 'gold-18k-white', grams: '' }]
  const [metalRows, setMetalRows] = useState<MetalRow[]>(defaultMetalRows)
  const selectedMetal = metalRows[0]?.metal ?? 'gold-18k-white'
  // Empty by default so a fresh quote carries no CAD/Jeweler's-time fee — the
  // builder starts fully zeroed until the user picks a difficulty level.
  const [ringLabor, setRingLabor] = useState('')
  const [ringWidth, setRingWidth] = useState(0)
  const [fingerSize, setFingerSize] = useState(0)
  const [extraCosts, setExtraCosts] = useState(0)
  const parseNum = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0 }
  // Hand-engraving surcharge (dollars) chosen on the slider. 0 = no engraving.
  // Replaces the old fixed-$150 yes/no toggle. Always starts at 0 (None) on a
  // fresh quote — the user opts in by dragging the slider.
  const [engravingFee, setEngravingFee] = useState<number>(0)
  // Slider bounds, configurable from Master Tables (company settings).
  const [engravingBounds, setEngravingBounds] = useState<{ min: number; max: number; step: number; default: number }>(
    { ...ENGRAVING_SLIDER_DEFAULTS },
  )
  // Optional 7.75% sales tax. When ON, the customer-facing total adds the
  // tax and the PDF / share link surface it as a separate line.
  const [applyTaxes, setApplyTaxes] = useState(false)
  // Retail markup applied on top of cost when showing the customer-facing
  // price. Stored as a string so the user can type "2.5" or "2." without the
  // input collapsing. Parsed lazily in pricing/save.
  const [markupText, setMarkupText] = useState(String(DEFAULT_MARKUP))
  // Optional customer discount (percent). Stored as a string so the user can
  // type "10" or "12." without the input collapsing. Empty / 0 = no discount.
  const [discountText, setDiscountText] = useState('')
  // Manual override for the customer-facing total. Empty = use computed price.
  // When set, requires a non-empty reason — surfaced in the save validation.
  const [customerPriceOverrideText, setCustomerPriceOverrideText] = useState('')
  const [customerPriceOverrideReason, setCustomerPriceOverrideReason] = useState('')
  const [editingOverride, setEditingOverride] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)

  // ── RN ring mode ─────────────────────────────────────────────────────
  // When ON, the whole ring is priced from a single pre-configured RN model
  // (RN-143 … RN-151) + finger size + metal, and the manual Material / Stone
  // Setting inputs are hidden. The selected metal still drives which RN labor
  // and gold-price column applies.
  // RN mode is now driven by the "Type of piece" picker — choosing "RN ring"
  // turns the builder into the pre-configured RN flow.
  const rnMode = jewelryType === 'rn'
  const [rnModelKey, setRnModelKey] = useState('')
  const [rnFingerSize, setRnFingerSize] = useState<number>(0)
  const [rnStoneType, setRnStoneType] = useState<RnStoneType>('natural')
  const [rnBandMode, setRnBandMode] = useState<'eternity' | 'other'>('eternity')
  const [rnCustomStones, setRnCustomStones] = useState<string>('')
  const [showCreateLabRn, setShowCreateLabRn] = useState(false)
  const [linkingLabRn, setLinkingLabRn] = useState(false)

  // Which stone row has its Natural-vs-Lab popup open (by uid), or null.
  const [compareUid, setCompareUid] = useState<string | null>(null)

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
    /** GIA cut + clarity grades. Surfaced on the MAIN stone only. */
    cut: string
    clarity: string
    // Raw input. When non-empty, overrides carats × pricePerCarat for this
    // stone's cost. Setting labor is unaffected.
    manualPrice: string
    // Free-form notes the jeweler wants to attach to this stone (rendered on
    // the MAIN row only for now).
    comments: string
    /** Optional per-stone markup. Surfaced on MAIN stones only — overrides
     *  the quote-level markup just for this stone's (cost + setting labor).
     *  Empty string = use the generic markup. */
    markup: string
    /** Whether the form for this stone is folded into a compact summary card.
     *  New stones start expanded; clicking "Done" collapses; chevron toggles. */
    collapsed: boolean
  }
  const [stones, setStones] = useState<StoneRow[]>([])

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

  // ── Internal attachments ─────────────────────────────────────────────
  // Photos the jeweler attaches to a quote for their own records (WhatsApp
  // screenshots, Pinterest references, etc.). NEVER shown to the client.
  interface AttachmentRow {
    uid: string
    /** When loaded from an existing quote we keep the backend id so the
     *  server replaces by id instead of duplicating. */
    backendId?: number | null
    photo: string
    caption: string
    /** ISO string from backend for existing rows; client-side new uploads
     *  get a synthesized timestamp at upload time. */
    createdAt: string
  }
  const [attachments, setAttachments] = useState<AttachmentRow[]>([])
  // Free-form internal notes the jeweler keeps with the quote. Never shown
  // to the client; surfaced only on the authenticated detail panel.
  const [internalNotes, setInternalNotes] = useState('')
  // Customer-facing description / notes — rendered on the public share link
  // so the client reads a short personal message from the jeweler.
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
          // Append in input order so the user sees them in the order they picked.
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
  // Tables. The slider always starts at 0 (None) on a fresh quote — we no longer
  // seat it at the configured default; the user opts in by dragging it.
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
  // When the user lands here via "Duplicate" on a saved quote, the source
  // quote is passed in router state. We prefill every field once (after
  // config loads, so the diamond size map is available for amount math) and
  // then clear the nav state so reloading or returning to the page doesn't
  // re-apply the duplicate on top of in-progress changes.
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
    setJewelryType(dup.jewelryType ?? 'ring')
    setMetalRows(
      dup.metalRows && dup.metalRows.length > 0
        ? dup.metalRows.map(r => ({ uid: crypto.randomUUID(), metal: r.metalKey as JewelryMetalOption, grams: String(r.weightGrams ?? '') }))
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

    setAttachments((dup.attachments ?? []).map(a => ({
      uid: crypto.randomUUID(),
      // Drop the backendId on duplicate — the new quote owns its own rows.
      backendId: null,
      photo: a.photo,
      caption: a.caption ?? '',
      createdAt: a.createdAt ?? new Date().toISOString(),
    })))

    navigate(location.pathname, { replace: true, state: null })
  }, [config.loading, config.diamondSizeFor, location.pathname, location.state, navigate])

  // ── Preset client ────────────────────────────────────────────────────
  // When the user lands here via "New quote" from the Clients page (or a
  // client's detail view), the chosen client is passed in router state. We
  // prefill the client picker once, then clear the nav state so a reload
  // doesn't re-apply it on top of changes. Independent of the duplicate
  // flow above — only one of the two is ever present.
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
      // If the size or type changed, jump to a valid size for that stoneType.
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

  // Two-way sync between carats and amount for a single stone via ctPerStone.
  // The typed field keeps the raw string (so "0." stays "0."); the derived
  // field is overwritten with a formatted number string.
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

  const mainStones  = stones.filter(s => s.role === 'MAIN')
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
    const sizeCfg = config.diamondSizeFor(stone.stoneType, stone.sizeKey)
    // Custom = no preset mm size: carats are free-typed and the cost comes
    // from the custom price (there is no per-carat base to multiply against).
    const customSize = stone.sizeKey === ''
    const pricePerCarat = (sizeCfg?.basePrice ?? 0) * DIAMOND_TYPE_OPTIONS[stone.stoneType].multiplier
    const caratsNum = parseNum(stone.carats)
    const amountNum = parseNum(stone.amount)
    const hasManualPrice = stone.manualPrice.trim() !== ''
    // A custom (no-preset) size has no per-carat base, so its cost comes from
    // the typed price. A preset size computes carats × pricePerCarat unless a
    // manual price overrides it.
    const stoneCost = hasManualPrice ? parseNum(stone.manualPrice) : caratsNum * pricePerCarat
    const stoneSetterFee = config.setterMap[stone.setterType]?.fee ?? 0
    const stoneLabor = amountNum * stoneSetterFee
    const stoneTotal = stoneCost + stoneLabor
    const theme = themeForRole(stone.role)
    const typeLabel = DIAMOND_TYPE_OPTIONS[stone.stoneType].label
    const sizeLabel = sizeCfg?.label ?? (stone.sizeKey || 'Custom')
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
    // Same physical stone priced as natural vs lab for the compare popup.
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
              {/* Custom: no preset mm size — the jeweler types carats and a
                  price directly (e.g. "one 3 ct center stone, $X"). */}
              <option value="">Custom — enter carats &amp; price</option>
              {sizes.map(d => (
                <option key={d.id} value={d.sizeKey}>
                  {d.label} — ${d.basePrice}{d.ctPerStone != null ? '/ct' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Natural vs Lab — popup comparing the same stone priced both ways. */}
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

          {/* Cut + clarity grades — only the center (MAIN) stone is graded. */}
          {stone.role === 'MAIN' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cut <span className="font-normal normal-case text-slate-400">(optional)</span>
              </label>
              <select value={stone.cut}
                onChange={e => patchStone(stone.uid, { cut: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400">
                <option value="">—</option>
                {STONE_CUTS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
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
                {STONE_CLARITIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {customSize ? 'Stone price' : 'Custom price'}{' '}
              <span className={`font-normal normal-case ${customSize ? 'text-rose-500' : 'text-slate-400'}`}>
                {customSize
                  ? '(required — enter the price for this stone directly)'
                  : `(optional — overrides carats × $${pricePerCarat.toLocaleString('en-US', { minimumFractionDigits: 2 })}/ct)`}
              </span>
            </label>
            <input type="number" min={0} step="0.01" value={stone.manualPrice}
              placeholder={customSize ? 'e.g. 4500 (required)' : 'Leave empty to use calculated price'}
              onChange={e => onStoneManualPriceChange(stone.uid, e.target.value)}
              className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 ${
                customSize && stone.manualPrice.trim() === '' ? 'border-rose-300' : 'border-slate-200'
              }`} />
            <p className="text-[10px] text-slate-400">
              Setting labor (amount × setter fee) is added on top of this price.
            </p>
          </div>

          {stone.role === 'MAIN' && (
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Markup for this stone <span className="font-normal normal-case text-slate-400">(optional — overrides the quote-level {parsedMarkup}× markup for this stone's cost + setting labor)</span>
              </label>
              <div className="relative">
                <input type="text" inputMode="decimal" value={stone.markup} placeholder={`Leave empty to use ${parsedMarkup}×`}
                  onChange={e => patchStone(stone.uid, { markup: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-9 text-sm text-slate-900 outline-none focus:border-slate-400" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">×</span>
              </div>
              <p className="text-[10px] text-slate-400">
                Useful when the center stone has a different margin than the rest of the piece.
              </p>
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
                  <a
                    href={verify.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold no-underline shadow-sm transition hover:shadow ${
                      verify.valid
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100'
                        : 'border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100'
                    }`}
                    title={
                      verify.valid
                        ? `Looks like a valid ${verify.lab} number — opens ${verify.lab}'s report check in a new tab to confirm`
                        : `This doesn't look like a valid ${verify.lab} report number yet — opens ${verify.lab}'s report check anyway`
                    }
                  >
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
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-400"
                    title="Enter a GIA/IGI report number to verify it on the lab's official report check"
                  >
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

  // ── RN ring derived metrics ──────────────────────────────────────────
  // Resolves the selected RN model + finger size + metal into the full cost
  // breakdown, reusing the existing diamond_size_config row for the per-carat
  // stone price (so "the CTW is priced from the stone tables we already have").
  // Null whenever RN mode is off.
  const rn = useMemo(() => {
    if (!rnMode) return null
    const model = config.rnRings.find(m => m.modelKey === rnModelKey) ?? null
    const sizeRow = model?.sizes.find(s => s.fingerSize === rnFingerSize) ?? null
    const base = { model, sizeRow, metal: selectedMetal, diamondSizeFor: config.diamondSizeFor }
    // Eternity = default numStones from sheet. Other = custom stone count.
    const customStones = rnBandMode === 'other' ? (parseInt(rnCustomStones) || 0) : 0
    const otherBase = customStones > 0 ? { ...base, customNumStones: customStones } : null
    // Per diamond type, compute eternity and other breakdowns.
    const naturalEternity = computeRnBreakdown({ ...base, stoneType: 'natural' })
    const labEternity = computeRnBreakdown({ ...base, stoneType: 'lab-grown' })
    const naturalOther = otherBase ? computeRnBreakdown({ ...otherBase, stoneType: 'natural' }) : null
    const labOther = otherBase ? computeRnBreakdown({ ...otherBase, stoneType: 'lab-grown' }) : null
    // Active values reflect the chosen band mode + diamond type.
    const natural = (rnBandMode === 'other' && naturalOther) ? naturalOther : naturalEternity
    const lab     = (rnBandMode === 'other' && labOther)     ? labOther     : labEternity
    const selected = rnStoneType === 'lab-grown' ? lab : natural
    return { model, sizeRow, natural, lab, naturalEternity, labEternity, naturalOther, labOther, ...selected }
  }, [rnMode, config, rnModelKey, rnFingerSize, selectedMetal, rnStoneType, rnBandMode, rnCustomStones])

  const pricing = useMemo(() => {
    const materialCost = metalRows.reduce((sum, row) => {
      const cfg = JEWELRY_METAL_OPTIONS[row.metal]
      return sum + (cfg ? cfg.pricePerGram * parseNum(row.grams) : 0)
    }, 0)
    const metalPricePerGram = JEWELRY_METAL_OPTIONS[selectedMetal]?.pricePerGram ?? 0
    const ringLaborFee = config.ringLaborMap[ringLabor]?.fee ?? 0
    const cadFee = 0
    const engravingFeeVal = Math.max(0, engravingFee)

    // Per-stone cost = carats × pricePerCarat (× type multiplier).
    // Per-stone setting labor = amount × setter fee.
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
      // Custom (no preset) size → price comes from the typed amount; a preset
      // size computes carats × pricePerCarat unless a manual price overrides it.
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
    let customerStoneCount = 0
    customerStones.forEach(cs => {
      const qty = parseNum(cs.quantity || '1') || 1
      const fee = config.setterMap[cs.setterType]?.fee ?? 0
      customerSettingFee += qty * fee
      customerStoneCount += qty
    })

    // In RN mode the material / labor / setting / diamond figures come from the
    // resolved RN model instead of the manual inputs; engraving and extra costs
    // still apply on top, and the rest of the pipeline (markup/discount/tax) is
    // untouched.
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
      engravingFee: engravingFeeVal,
      totalCarats: Math.round((Number(eff.totalCarats) || 0) * 10000) / 10000,
      totalAmount: eff.totalAmount,
      stoneBreakdown: eff.stoneBreakdown,
      total,
    }
  }, [
    config, customerStones, engravingFee, extraCosts, ringLabor, ringWidth,
    selectedMetalConfig, stones, weightGrams, rnMode, rn,
  ])

  // Parse the markup once from the input. Empty / NaN falls back to the
  // shop default so we never store a zero or negative multiplier.
  const parsedMarkup = (() => {
    const n = Number(markupText)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MARKUP
  })()
  // Parse the discount. Empty / NaN / out-of-range = 0 (no discount). Capped
  // at 100% so we never go negative.
  const parsedDiscount = (() => {
    const n = Number(discountText)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.min(n, 100)
  })()
  // Per-stone markup override pool: MAIN stones with a non-empty markup get
  // their (cost + setting labor) marked up at their own rate; the rest of
  // the quote uses the generic markup. Mirrors the backend logic in
  // SavedQuote.computeCustomerPrice() and SavedQuoteStone.markupMultiplier.
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
  // Price shown to the customer: the markup applies to the WHOLE cost,
  // engraving included. Main stones with their own markup are pulled out of
  // the generic-markup pool and marked up at their own rate instead.
  const genericPool = pricing.total - customMainRaw
  const customerPriceBeforeDiscount = genericPool * parsedMarkup + customMainMarkedUp
  const discountAmount = customerPriceBeforeDiscount * (parsedDiscount / 100)
  const customerPriceAfterDiscount = customerPriceBeforeDiscount - discountAmount
  // 7.75% sales tax — only when the seller toggled it on. Mirrors the
  // backend SavedQuote.SALES_TAX_RATE constant.
  const SALES_TAX_RATE = 0.0775
  const taxAmount = applyTaxes ? customerPriceAfterDiscount * SALES_TAX_RATE : 0
  const computedCustomerPrice = customerPriceAfterDiscount + taxAmount
  // Manual override short-circuits the entire pipeline — what the user
  // typed IS the final customer-facing price. Discount and tax are surfaced
  // as zero so the breakdown card doesn't double-count them.
  const parsedOverride = (() => {
    const t = customerPriceOverrideText.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) && n > 0 ? n : null
  })()
  const customerPrice = parsedOverride != null ? parsedOverride : computedCustomerPrice

  const handleQuoteReady = async () => {
    if (!user) return
    const errors: { title?: string; client?: string } = {}
    if (!quoteTitle.trim()) errors.title = 'Please enter a quote title.'
    if (!client) errors.client = 'Please select or create a client.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    // A "Custom" (no-preset) size has no per-carat base, so its price must be
    // typed in — otherwise the stone would contribute $0. Only required for
    // custom-size stones; preset sizes price themselves.
    const customMissingPrice = stones.some(s => s.sizeKey === '' && s.manualPrice.trim() === '')
    if (customMissingPrice) {
      setSaveError('Enter the stone price for any "Custom" size stone before creating the quote.')
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
    // Can't create an empty quote: require a non-zero total (some metal
    // weight, labor, a stone, engraving or extra cost). Blocks saving a
    // brand-new quote while everything is still at 0.
    if (pricing.total <= 0) {
      setSaveError("This quote is still $0 — add metal weight, a CAD/Jeweler's-time level, a stone or an extra cost before creating it.")
      return
    }
    // Override requires a reason — bail out and surface the error in the
    // override panel so the user fixes it before we hit the API.
    if (parsedOverride != null && customerPriceOverrideReason.trim() === '') {
      setOverrideError('Please type a short reason for the override.')
      setEditingOverride(true)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      // Legacy fields are populated with aggregates so older list views keep
      // rendering until they're rewritten to consume `stones` directly.
      const firstStone = mainStones[0] ?? sideStones[0] ?? meleeStones[0] ?? null
      // Approval rule: every new quote lands in PENDING and must be approved
      // manually with the Approve button before the client sees it — no
      // auto-approval, regardless of discount size.
      const autoStatus = 'PENDING'
      // Revision tracking: if we got here via "Duplicate" AND the user kept
      // the same client, attach the new quote to the ROOT of the chain so
      // the listing shows it nested under the original. Changing the client
      // breaks the link → it becomes a standalone top-level quote.
      const sameClientAsSource =
        duplicatedFrom != null &&
        client != null &&
        duplicatedFrom.client?.id != null &&
        duplicatedFrom.client.id === client.id
      const parentQuoteRef = sameClientAsSource
        ? { id: duplicatedFrom!.parentQuoteId ?? Number(duplicatedFrom!.id) }
        : null

      // ── RN mode: derive the persisted shape from the selected model ──────
      // The whole pavé is stored as a single MELEE stone whose manualPrice is
      // the exact CTW-based diamond cost, so the detail view's stone line and
      // the stored `total` agree. The labor/gold breakdown goes into the
      // internal note for the jeweler.
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
            comments: `${rn.model.modelKey} · SZ ${rn.sizeRow.fingerSize} · ${rn.numStones} stones · ${rn.ctw.toFixed(2)}ct`,
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
            `Stones: ${rn.ctw.toFixed(2)}ct × $${rn.pricePerCarat}/ct = $${rn.diamondCost.toFixed(2)}`,
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
        ringLabor: rnMode ? '' : ringLabor,
        cadDesign: rnMode ? '' : ringLabor,
        diamondAmount: pricing.totalAmount,
        diamondCarats: pricing.totalCarats,
        diamondType: rnMode ? rnDiamondType : (firstStone?.stoneType ?? 'natural'),
        diamondSize: rnMode && rn ? rn.sizeKey : (firstStone?.sizeKey ?? ''),
        weightGrams: rnMode && rn ? (rn.avgGrams ?? 0) : weightGrams,
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
      }, user.id)
      setSavedQuote({ id: q.id, title: q.title, total: pricing.total, publicToken: q.publicToken ?? null })
      // Reset every field back to its initial default so the builder is
      // ready for the next quote without leaking values from the one we
      // just saved.
      setQuoteTitle('')
      setClient(null)
      setJewelryType('ring')
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
      setAttachments([])
      setInternalNotes('')
      setCustomerNotes('')
      setPhoto(null)
      setFieldErrors({})
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

  if (config.loading) return <QuoteBuilderSkeleton />

  return (
    <div className="space-y-6">
      {/* ── Duplicate banner — explains the quote is a clone, not an edit ── */}
      {duplicatedFrom && (
        <Card className="rounded-[24px] border border-sky-200 bg-sky-50/60 shadow-[0_20px_60px_rgba(56,189,248,0.16)]">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Copy className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Duplicating quote</p>
                <p className="mt-1 text-sm text-slate-700">
                  Prefilled from <strong>{duplicatedFrom.title}</strong> (quote #{duplicatedFrom.id}). Adjust the stones,
                  client or any other field — saving creates a <strong>new</strong> quote and leaves the original untouched.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDuplicatedFrom(null)}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-700"
            >
              Dismiss
            </button>
          </CardContent>
        </Card>
      )}

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
            <div className="flex shrink-0 flex-wrap gap-2">
              <CopyShareLinkButton token={savedQuote.publicToken} iconOnly={false} />
              <OpenQuoteButton token={savedQuote.publicToken} />
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

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">
                  Customer-facing notes
                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Shown to client
                  </span>
                </label>
                <textarea
                  rows={4}
                  value={customerNotes}
                  onChange={e => setCustomerNotes(e.target.value)}
                  placeholder="Short description for the client — process, sourcing, sentimental details, anything you'd like them to read on the share link."
                  className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
                <p className="text-[11px] text-slate-400">
                  Appears on the public quote link the customer opens. Leave empty to skip.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── RN ring section (shown when "RN ring" is the type of piece) ── */}
          {rnMode && (
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
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
                <label className="text-sm font-semibold text-slate-900">Metal</label>
                <select value={selectedMetal} onChange={e => setSelectedMetal(e.target.value as JewelryMetalOption)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
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
                <label className="text-sm font-semibold text-slate-900">RN model</label>
                <select value={rnModelKey} onChange={e => { setRnModelKey(e.target.value); setRnFingerSize(0) }}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white">
                  <option value="">— Select a model</option>
                  {config.rnRings.map(m => (
                    <option key={m.modelKey} value={m.modelKey}>{m.label || m.modelKey}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Ring size</label>
                <select value={rnFingerSize} onChange={e => setRnFingerSize(Number(e.target.value))} disabled={!rn?.model}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white disabled:opacity-50">
                  <option value={0}>{rn?.model ? '— Select a size' : '— Pick a model first'}</option>
                  {(rn?.model?.sizes ?? []).map(s => (
                    <option key={s.fingerSize} value={s.fingerSize}>
                      SZ {s.fingerSize} — {s.numStones ?? 0} stones · {(s.ctw ?? 0).toFixed(2)}ct
                    </option>
                  ))}
                </select>
              </div>

              {/* Band mode: Eternity (default) vs Other (custom stone count) */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Band type</label>
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
                  <label className="text-sm font-semibold text-slate-900">Number of stones</label>
                  <input
                    type="number" min={1} step={1}
                    value={rnCustomStones}
                    onChange={e => setRnCustomStones(e.target.value)}
                    placeholder={`Default eternity: ${rn?.sizeRow?.numStones ?? '—'} stones`}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Diamond type</label>
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
                  {/* Shared across both diamond types (same physical ring). */}
                  <dl className="space-y-1.5 text-sm">
                    <RnRow label="Number of stones" value={`${rn.numStones}`} />
                    <RnRow label="CTW (from sheet)" value={`${rn.ctw.toFixed(2)} ct`} />
                    <RnRow label={`Gold (${rn.avgGrams}g × $${rn.goldPerGram}/g)`} value={`$${rn.goldCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                    <RnRow label="Labor" value={`$${rn.casting.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                    <RnRow label={`Setting (${rn.numStones} × $${rn.settingPerStone})`} value={`$${rn.settingLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
                  </dl>

                  {/* Eternity vs Other — only shown when Other mode has a stone count */}
                  {rn.naturalOther && (
                    <>
                      <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">Band type · compare</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['eternity', 'Eternity', rnStoneType === 'lab-grown' ? rn.labEternity : rn.naturalEternity, rn.naturalEternity.numStones] as const,
                          ['other',    'Other',    rnStoneType === 'lab-grown' ? rn.labOther!   : rn.naturalOther,    rn.naturalOther.numStones]    as const,
                        ]).map(([val, label, d, stones]) => {
                          const isSel = rnBandMode === val
                          const etTotal = (rnStoneType === 'lab-grown' ? rn.labEternity : rn.naturalEternity).total
                          const otTotal = (rnStoneType === 'lab-grown' ? rn.labOther!   : rn.naturalOther).total
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
                              <p className="mt-1 text-[11px] text-slate-500">{stones} stones · {d.ctw.toFixed(2)}ct</p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">${d.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* Natural vs Lab side by side — tap one to use it in the quote. */}
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
                                <button type="button"
                                  onClick={() => setShowCreateLabRn(true)}
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

          {/* Sección 1: CAD Design & Jeweler's Time */}
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-slate-500" />
                <CardTitle className="text-base font-semibold text-slate-900">
                  {rnMode ? 'Pricing & options' : "CAD Design & Jeweler's Time"}
                </CardTitle>
              </div>
              <p className="text-sm text-slate-500">
                {rnMode
                  ? 'Engraving, tax, extra costs, markup and discount.'
                  : 'Metal, weight, ring dimensions, CAD complexity and jeweler\'s time.'}
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
              {!rnMode && (<>
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
                  <option value="">— Select a difficulty level</option>
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
                  <option value={0}>— Select a size</option>
                  {FINGER_SIZE_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              </>)}

              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label className="text-sm font-semibold text-slate-900">Hand Engraving (milgrain)</label>
                  <span className="text-sm font-bold tabular-nums text-slate-900">
                    {engravingFee > 0 ? `$${engravingFee.toLocaleString('en-US')}` : 'None'}
                  </span>
                </div>
                <input
                  type="range"
                  min={engravingBounds.min}
                  max={engravingBounds.max}
                  step={engravingBounds.step}
                  value={Math.min(engravingBounds.max, Math.max(engravingBounds.min, engravingFee))}
                  onChange={e => setEngravingFee(Number(e.target.value))}
                  className="w-full accent-slate-900"
                  aria-label="Hand engraving fee"
                />
                <div className="flex justify-between text-[11px] font-medium text-slate-400">
                  <span>${engravingBounds.min.toLocaleString('en-US')}</span>
                  <span>Drag to set the engraving fee · $0 = none</span>
                  <span>${engravingBounds.max.toLocaleString('en-US')}</span>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">
                  Sales tax (7.75%)
                  <span className="ml-2 text-xs font-normal text-slate-500">applied on top of the customer total</span>
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={applyTaxes}
                  onClick={() => setApplyTaxes(!applyTaxes)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                    applyTaxes
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span>{applyTaxes ? 'Including 7.75% sales tax' : 'No sales tax'}</span>
                  <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${applyTaxes ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${applyTaxes ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </span>
                </button>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Extra costs</label>
                <input type="number" min={0} step={1} value={extraCosts || ''} placeholder="0"
                  onChange={e => setExtraCosts(Number(e.target.value) || 0)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label className="text-sm font-semibold text-slate-900">
                    Retail markup
                    <span className="ml-2 text-xs font-normal text-slate-500">applied on top of the full cost (engraving included)</span>
                  </label>
                  <span className="text-xs font-medium text-slate-500">
                    Cost <strong className="text-slate-700">${pricing.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                    {' '}→ Customer{' '}
                    <strong className="text-slate-900">${customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[140px]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={markupText}
                      placeholder={String(DEFAULT_MARKUP)}
                      onChange={e => setMarkupText(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-9 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">×</span>
                  </div>
                  {MARKUP_PRESETS.map(p => {
                    const active = parsedMarkup === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setMarkupText(String(p))}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
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
                  <label className="text-sm font-semibold text-slate-900">
                    Customer discount
                    <span className="ml-2 text-xs font-normal text-slate-500">optional — applied on top of the markup</span>
                  </label>
                  <span className="text-xs font-medium text-slate-500">
                    {parsedDiscount > 0 ? (
                      <>
                        Save <strong className="text-emerald-600">${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                        {' '}→ Final{' '}
                        <strong className="text-slate-900">${customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                      </>
                    ) : (
                      <span className="text-slate-400">No discount applied</span>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[140px]">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={discountText}
                      placeholder="0"
                      onChange={e => setDiscountText(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 pr-9 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiscountText('')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      parsedDiscount === 0
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    None
                  </button>
                  {DISCOUNT_PRESETS.map(p => {
                    const active = parsedDiscount === p
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDiscountText(String(p))}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          active
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {p}%
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-400">
                  Pick a preset or type any value. Leave empty (or pick None) to charge the full markup price.
                </p>
                <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                    !
                  </span>
                  <span>
                    Every quote is saved as <strong>Pending</strong> and must be approved with the <strong>Approve</strong> button.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sección 2: STONE SETTING (hidden in RN mode — stones come from the model) */}
          {!rnMode && (
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
                title: 'Main stones',
                hint: 'Center stones. Add one or several — each can have its own markup.',
                items: mainStones,
                canAdd: true,
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
                    {customerStones.length > 0 ? ` + ${pricing.customerStoneCount} customer` : ''}
                  </p>
                </div>
                <strong className="relative text-2xl font-semibold tracking-tight tabular-nums">
                  ${(pricing.settingFee + pricing.customerSettingFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Sección: INTERNAL ATTACHMENTS — not shown to client */}
          <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                  <ImagePlus className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Internal notes & attachments
                    <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {attachments.length}
                    </span>
                  </CardTitle>
                  <p className="text-xs text-slate-500">
                    Conversation screenshots, references, anything for your records.
                    <span className="ml-1 font-semibold text-rose-600">Never shown to the client.</span>
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Internal notes <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <textarea
                  rows={4}
                  value={internalNotes}
                  onChange={e => setInternalNotes(e.target.value)}
                  placeholder="Customer preferences, follow-up reminders, context for your records. Never shown to the client."
                  className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </div>

              <input ref={attachmentInputRef} id="attachment-files" type="file"
                accept="image/*" multiple
                onChange={handleAttachmentsChange} className="hidden" />
              <input ref={attachmentCameraRef} id="attachment-camera" type="file"
                accept="image/*" capture="environment"
                onChange={handleAttachmentsChange} className="hidden" />

              <div className="grid gap-2 sm:grid-cols-2">
                <label htmlFor="attachment-camera"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white sm:hidden">
                  <Camera className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>Take photo</span>
                </label>
                <label htmlFor="attachment-files"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500 transition hover:border-slate-400 hover:bg-white sm:col-span-2">
                  <ImagePlus className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>Add photos (multiple allowed)</span>
                </label>
              </div>

              {attachments.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-400">
                  No attachments yet.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {attachments.map((a, idx) => (
                    <div key={a.uid}
                      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <img src={a.photo} alt={`Attachment ${idx + 1}`}
                        className="w-full object-cover max-h-48" />
                      <button type="button" onClick={() => removeAttachment(a.uid)}
                        aria-label="Remove attachment"
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80">
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <div className="space-y-1.5 p-3">
                        <input
                          type="text"
                          value={a.caption}
                          onChange={e => patchAttachment(a.uid, { caption: e.target.value })}
                          placeholder="Optional caption (e.g. WhatsApp Apr 15 — switch to sapphires)"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-slate-400 focus:bg-white"
                        />
                        <p className="text-[10px] text-slate-400">
                          Added {new Date(a.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-300">Customer price</p>
                  <button
                    type="button"
                    onClick={() => setEditingOverride(v => !v)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition ${
                      editingOverride
                        ? 'bg-white text-slate-900'
                        : 'bg-white/10 text-amber-200 hover:bg-white/20'
                    }`}
                  >
                    {editingOverride ? 'Close' : (parsedOverride != null ? 'Edit override' : 'Edit total')}
                  </button>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                  ${customerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-amber-200/90">
                  {parsedOverride != null
                    ? 'Custom total — markup/discount/tax bypassed'
                    : `Via share link · ${parsedMarkup}×${parsedDiscount > 0 ? `, −${parsedDiscount}%` : ''}${applyTaxes ? ', +7.75% tax' : ''}`}
                </p>
                <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Our cost</span>
                  <span className="text-lg font-semibold tabular-nums text-white">
                    ${pricing.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {parsedOverride != null && customerPriceOverrideReason.trim() !== '' && (
                  <p className="mt-1 text-[11px] text-amber-200/80">
                    Reason: <span className="text-white">{customerPriceOverrideReason}</span>
                  </p>
                )}
                {editingOverride && (
                  <div className="mt-3 space-y-2 rounded-xl border border-white/15 bg-black/20 p-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/90">
                        Custom customer total <span className="font-normal normal-case text-slate-300">(empty = computed price)</span>
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={customerPriceOverrideText}
                          placeholder={computedCustomerPrice.toFixed(2)}
                          onChange={e => { setCustomerPriceOverrideText(e.target.value); setOverrideError(null) }}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-7 text-sm text-white placeholder:text-slate-400 outline-none focus:border-amber-300"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/90">
                        Reason {parsedOverride != null && <span className="text-rose-300">(required)</span>}
                      </label>
                      <textarea
                        rows={2}
                        value={customerPriceOverrideReason}
                        onChange={e => { setCustomerPriceOverrideReason(e.target.value); setOverrideError(null) }}
                        placeholder="e.g. Matched competitor quote, goodwill discount, rounded for cash deal…"
                        className="w-full resize-y rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-amber-300"
                      />
                    </div>
                    {overrideError && (
                      <p className="text-[11px] font-medium text-rose-300">{overrideError}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => { setCustomerPriceOverrideText(''); setCustomerPriceOverrideReason(''); setOverrideError(null) }}
                        className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/20"
                      >
                        Clear override
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (customerPriceOverrideText.trim() !== '' && customerPriceOverrideReason.trim() === '') {
                            setOverrideError('Please type a short reason for the override.')
                            return
                          }
                          setOverrideError(null)
                          setEditingOverride(false)
                        }}
                        className="ml-auto rounded-full bg-amber-400 px-3 py-1 text-[11px] font-semibold text-slate-900 transition hover:bg-amber-300"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
                {parsedOverride == null && parsedDiscount > 0 && (
                  <p className="mt-1 text-xs text-emerald-300/90">
                    Discount −${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({parsedDiscount}% off ${customerPriceBeforeDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                  </p>
                )}
                {parsedOverride == null && (
                <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] ${
                  applyTaxes
                    ? 'bg-emerald-500/15 border-emerald-300/40'
                    : 'bg-white/5 border-white/15'
                }`}>
                  {applyTaxes ? (
                    <>
                      <div className="flex items-center justify-between text-emerald-200">
                        <span className="font-bold uppercase tracking-wider">Sales tax 7.75% applied</span>
                        <span className="font-bold tabular-nums">+${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-emerald-100/80">
                        <span>Subtotal (before tax)</span>
                        <span className="tabular-nums">${customerPriceAfterDiscount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-semibold uppercase tracking-wider">Sales tax 7.75%</span>
                      <span className="font-medium">Not applied</span>
                    </div>
                  )}
                </div>
                )}
                <p className="mt-2 text-sm text-slate-300">
                  <span className="font-semibold text-white">{jewelryTypeLabel}</span> · {selectedMetalConfig.label} · {ringLaborLabel}
                </p>
              </div>

              <div className="space-y-3 text-sm">
                {/* Each line shows cost → retail so it's obvious the selected
                    markup is applied to EVERY component (engraving included).
                    Header maps the two money columns. */}
                <div className="flex items-center justify-between gap-3 px-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <span>Item</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="w-16 text-right">Cost</span>
                    <span className="w-9 text-center">×{parsedMarkup}</span>
                    <span className="w-20 text-right text-slate-500">Customer</span>
                  </div>
                </div>
                {(() => {
                  const mk = parsedMarkup
                  const suppliedCost = pricing.diamondCost + pricing.settingFee
                  // MAIN stones with their own markup are priced at that rate,
                  // so this line's retail isn't a flat cost × mk; the rest are.
                  const suppliedRetail = (suppliedCost - customMainRaw) * mk + customMainMarkedUp
                  const rows: Array<[string, number, number]> = [
                    ['Material reference', pricing.materialCost, pricing.materialCost * mk],
                    ['CAD design & Jeweler\'s time', pricing.ringLaborFee, pricing.ringLaborFee * mk],
                    // "Setting supplied diamonds" = stone cost + labor for the
                    // in-house MAIN/SIDE/MELEE stones (we buy them and set them).
                    [`Setting supplied diamonds (${pricing.totalAmount} stones · ${pricing.totalCarats} ct)`,
                      suppliedCost, suppliedRetail],
                    // Only render the customer line when there's at least one —
                    // an empty "Setting customer diamonds (0 stones)" line is noise.
                    ...(customerStones.length > 0
                      ? [[
                          `Setting customer diamonds (${pricing.customerStoneCount} stone${pricing.customerStoneCount === 1 ? '' : 's'})`,
                          pricing.customerSettingFee, pricing.customerSettingFee * mk,
                        ] as [string, number, number]]
                      : []),
                    ['Hand engraving (milgrain)', pricing.engravingFee, pricing.engravingFee * mk],
                    ['Extra costs', extraCosts, extraCosts * mk],
                  ]
                  return rows.map(([label, cost, retail]) => (
                    <div key={label} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                      <span className="min-w-0 flex-1 text-slate-500">{label}</span>
                      <div className="flex shrink-0 items-center gap-2 text-right">
                        <span className="w-16 text-right text-xs tabular-nums text-slate-400">${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                        <span className="w-9 rounded-full bg-slate-200 py-0.5 text-center text-[10px] font-semibold text-slate-600">×{mk}</span>
                        <span className="w-20 text-right font-semibold tabular-nums text-slate-900">${retail.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  ))
                })()}
                <p className="px-1 text-[11px] text-slate-400">
                  Every line is multiplied by the selected <strong className="text-slate-600">{parsedMarkup}×</strong> markup — engraving included.
                  {parsedDiscount > 0 || applyTaxes ? ' Discount/tax are applied to the customer total below.' : ''}
                </p>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Total stones</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{pricing.totalAmount + pricing.customerStoneCount}</p>
                </div>
                <div className="rounded-2xl bg-fuchsia-50 p-3 text-fuchsia-600"><Diamond className="h-5 w-5" /></div>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {pricing.totalAmount} supplied by S&amp;S
                {pricing.customerStoneCount > 0 ? ` · ${pricing.customerStoneCount} supplied by customer` : ''}
                {' · '}{pricing.totalCarats} ct · ${pricing.diamondCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
                {customerStones.length > 0 ? ` + ${pricing.customerStoneCount} customer stone${customerStones.length === 1 ? '' : 's'}` : ''}.
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
      secondaryActionLabel={hasLink ? '↗ Open quote' : undefined}
      onSecondaryAction={hasLink && quote.publicToken
        ? () => window.open(publicQuoteUrl(quote.publicToken!), '_blank', 'noopener,noreferrer')
        : undefined}
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
