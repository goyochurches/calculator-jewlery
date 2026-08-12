import { DIAMOND_TYPE_OPTIONS, JEWELRY_METAL_OPTIONS } from '@/constants/config'
import { useAuth } from '@/context/AuthContext'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { stockService } from '@/services/stockService'
import { Toast } from '@/components/Toast'
import type { JewelryMetalOption, StockItem, StockStone } from '@/types'
import { Camera, ImageOff, Loader2, Plus, Trash2, Upload } from 'lucide-react'
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

let uidCounter = 0
const nextUid = () => `row-${Date.now()}-${uidCounter++}`

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

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
      {children}
    </p>
  )
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white'
const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-500'

export function StockBuilderPage() {
  const { user } = useAuth()
  const config = useQuoteConfig()
  const navigate = useNavigate()
  const location = useLocation()
  const duplicateFrom = (location.state as { duplicateFrom?: StockItem } | null)?.duplicateFrom ?? null
  const prefillApplied = useRef(false)

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

  const totalCost =
    materialCost + ringLaborFee + settingFee + stoneCost +
    Math.max(0, parseNum(engravingFee)) + parseNum(extraCosts)

  const markup = parseNum(markupMultiplier) || 2.5
  const discount = Math.max(0, Math.min(100, parseNum(discountPercent)))
  const retailBeforeDiscount = totalCost * markup
  const retailPrice = retailBeforeDiscount * (1 - discount / 100)

  const canSave = title.trim() !== '' && !saving

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
      }
      await stockService.create(payload, Number(user.id))
      setToast({ variant: 'success', title: 'Stock piece saved', description: `"${title.trim()}" was added to stock.` })
      // Reset for the next entry, same UX as the quote builder after submit.
      setTitle(''); setSku(''); setQuantity('1'); setStatus('AVAILABLE')
      setMetalRows([{ uid: nextUid(), metalKey: 'gold-14k-yellow', grams: '' }])
      setStones([]); setPhoto(null); setInternalNotes('')
      setExtraCosts('0'); setEngravingFee('0')
    } catch (err) {
      console.error(err)
      setToast({ variant: 'error', title: 'Could not save', description: 'Please check the form and try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Basics */}
        <Card>
          <SectionLabel>Piece details</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 18K Yellow Gold Tennis Bracelet" />
            </div>
            <div>
              <label className={labelClass}>SKU</label>
              <input className={inputClass} value={sku} onChange={e => setSku(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className={labelClass}>Quantity in stock</label>
              <input type="number" min={0} className={inputClass} value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Jewelry type</label>
              <select className={inputClass} value={jewelryType} onChange={e => setJewelryType(e.target.value)}>
                {JEWELRY_TYPE_OPTIONS.map(j => <option key={j.key} value={j.key}>{j.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select className={inputClass} value={status} onChange={e => setStatus(e.target.value as StockItem['status'])}>
                {STATUS_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </Card>

        {/* Metal rows */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Metal</SectionLabel>
            {metalRows.length < 3 && (
              <button type="button" onClick={addMetalRow} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
                <Plus className="h-3.5 w-3.5" /> Add metal
              </button>
            )}
          </div>
          <div className="space-y-3">
            {metalRows.map(row => (
              <div key={row.uid} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_140px_auto]">
                <div>
                  <label className={labelClass}>Metal</label>
                  <select className={inputClass} value={row.metalKey} onChange={e => updateMetalRow(row.uid, { metalKey: e.target.value as JewelryMetalOption })}>
                    {Object.entries(JEWELRY_METAL_OPTIONS).filter(([k]) => !['gold-14k', 'gold-18k'].includes(k)).map(([key, opt]) => (
                      <option key={key} value={key}>{opt.label} — ${(config.metalPriceMap[key as JewelryMetalOption] ?? 0).toFixed(2)}/g</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Grams</label>
                  <input type="number" min={0} step="0.01" className={inputClass} value={row.grams} onChange={e => updateMetalRow(row.uid, { grams: e.target.value })} />
                </div>
                <button type="button" onClick={() => removeMetalRow(row.uid)} disabled={metalRows.length === 1}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Material cost: <strong className="text-slate-700">${materialCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
          </p>
        </Card>

        {/* Stones */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Stones</SectionLabel>
            <div className="flex gap-2">
              {STONE_ROLES.map(role => (
                <button key={role} type="button" onClick={() => addStoneRow(role)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-slate-400">
                  <Plus className="h-3 w-3" /> {role}
                </button>
              ))}
            </div>
          </div>
          {stones.length === 0 && <p className="text-sm text-slate-400">No stones added.</p>}
          <div className="space-y-4">
            {stones.map(s => {
              const b = stoneBreakdown.find(x => x.uid === s.uid)
              return (
                <div key={s.uid} className="rounded-xl border border-slate-100 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{s.role}</span>
                    <button type="button" onClick={() => removeStoneRow(s.uid)} className="text-slate-300 hover:text-rose-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className={labelClass}>Type</label>
                      <select className={inputClass} value={s.stoneType} onChange={e => updateStoneRow(s.uid, { stoneType: e.target.value as StoneRowState['stoneType'] })}>
                        <option value="natural">Natural</option>
                        <option value="lab-grown">Lab</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Size key</label>
                      <input className={inputClass} value={s.sizeKey} onChange={e => updateStoneRow(s.uid, { sizeKey: e.target.value })} placeholder="e.g. 1" />
                    </div>
                    <div>
                      <label className={labelClass}>Carats</label>
                      <input type="number" min={0} step="0.01" className={inputClass} value={s.carats} onChange={e => updateStoneRow(s.uid, { carats: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Qty</label>
                      <input type="number" min={1} className={inputClass} value={s.quantity} onChange={e => updateStoneRow(s.uid, { quantity: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Setter</label>
                      <select className={inputClass} value={s.setterType} onChange={e => updateStoneRow(s.uid, { setterType: e.target.value })}>
                        <option value="">—</option>
                        {config.setters.map(st => <option key={st.typeKey} value={st.typeKey}>{st.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Setter fee override</label>
                      <input type="number" min={0} className={inputClass} value={s.setterFeeOverride} onChange={e => updateStoneRow(s.uid, { setterFeeOverride: e.target.value })} placeholder={`$${config.setterMap[s.setterType]?.fee ?? 0}`} />
                    </div>
                    <div>
                      <label className={labelClass}>Manual price override</label>
                      <input type="number" min={0} className={inputClass} value={s.manualPrice} onChange={e => updateStoneRow(s.uid, { manualPrice: e.target.value })} placeholder="Optional" />
                    </div>
                    <div className="flex items-end">
                      <p className="text-xs text-slate-500">
                        Cost ${b ? b.cost.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'} + labor ${b ? b.labor.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Labor / extras */}
        <Card>
          <SectionLabel>Labor & extras</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Ring labor tier</label>
              <select className={inputClass} value={ringLabor} onChange={e => setRingLabor(e.target.value)}>
                <option value="none">None</option>
                {Object.entries(config.ringLaborMap).map(([key, tier]) => (
                  <option key={key} value={key}>{tier.label} — ${tier.fee}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Ring width (mm)</label>
              <input type="number" min={0} step="0.1" className={inputClass} value={ringWidth} onChange={e => setRingWidth(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Finger size</label>
              <input type="number" min={0} step="0.25" className={inputClass} value={fingerSize} onChange={e => setFingerSize(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Extra costs ($)</label>
              <input type="number" min={0} className={inputClass} value={extraCosts} onChange={e => setExtraCosts(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Engraving fee ($)</label>
              <input type="number" min={0} className={inputClass} value={engravingFee} onChange={e => setEngravingFee(e.target.value)} />
            </div>
          </div>
        </Card>

        {/* Notes */}
        <Card>
          <SectionLabel>Internal notes</SectionLabel>
          <textarea rows={3} className={inputClass} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} placeholder="Sourcing, condition, reminders…" />
        </Card>
      </div>

      {/* Sidebar: photo + pricing + save */}
      <div className="space-y-6">
        <Card>
          <SectionLabel>Photo</SectionLabel>
          {photo ? (
            <div className="relative">
              <img src={photo} alt="Stock piece" className="aspect-square w-full rounded-xl object-cover" />
              <button type="button" onClick={handleRemovePhoto} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-slate-300">
              <ImageOff className="h-8 w-8" />
              <span className="text-xs">No photo</span>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => photoInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400">
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
            <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400">
              <Camera className="h-3.5 w-3.5" /> Camera
            </button>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
        </Card>

        <Card>
          <SectionLabel>Pricing</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Markup ×</label>
              <input type="number" min={1} step="0.1" className={inputClass} value={markupMultiplier} onChange={e => setMarkupMultiplier(e.target.value)} />
            </div>
            <div>
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
        </Card>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Saving…' : 'Save stock piece'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/stock-list')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:border-slate-400"
        >
          View all stock
        </button>
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
