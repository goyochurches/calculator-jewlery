import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHistory } from '@/hooks/useHistorial'
import { gemstoneService } from '@/services/gemstoneService'
import {
  configService,
  type DiamondSizeConfig,
  type FingerSizeConfig,
  type PricingTier,
  type SetterConfig,
  type StoneType,
} from '@/services/configService'
import type { GemstonePrice, HistorialEntry } from '../types'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const QUALITY_STYLES: Record<GemstonePrice['quality'], string> = {
  standard: 'bg-slate-50 text-slate-600',
  premium: 'bg-violet-50 text-violet-700',
  collector: 'bg-amber-50 text-amber-700',
}

const CATEGORY_STYLES: Record<GemstonePrice['category'], string> = {
  diamond: 'bg-sky-50 text-sky-700',
  precious: 'bg-rose-50 text-rose-700',
  'semi-precious': 'bg-teal-50 text-teal-700',
  organic: 'bg-lime-50 text-lime-700',
}

const SIGNAL_STYLES: Record<HistorialEntry['signal'], string> = {
  buy: 'bg-emerald-50 text-emerald-700',
  sell: 'bg-rose-50 text-rose-700',
  hold: 'bg-amber-50 text-amber-700',
}

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
    {children}
  </th>
)

const TInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
  />
)

const TSelect = ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
  >
    {children}
  </select>
)

const BLANK_GEM: Omit<GemstonePrice, 'id'> = {
  name: '', category: 'precious', quality: 'standard', unit: 'per ct', price: 0, color: '', note: '',
}

const BLANK_DS: Omit<DiamondSizeConfig, 'id'> = { stoneType: 'NATURAL', sizeKey: '', label: '', basePrice: 0, ctPerStone: null }
const BLANK_SETTER: Omit<SetterConfig, 'id' | 'sortOrder'> = { typeKey: '', label: '', fee: 0 }

const STONE_TYPE_STYLES: Record<StoneType, string> = {
  NATURAL: 'bg-amber-50 text-amber-700',
  LAB:     'bg-sky-50 text-sky-700',
}
const BLANK_FS: Omit<FingerSizeConfig, 'id'> = { size: 0, additionalFee: 0 }
const BLANK_CAD: Omit<PricingTier, 'id'> = {
  tierType: 'CAD_DESIGN', tierKey: '', label: '', fee: 0, sortOrder: 0,
}
const BLANK_RL: Omit<PricingTier, 'id'> = {
  tierType: 'RING_LABOR', tierKey: '', label: '', fee: 0, sortOrder: 0,
}

const pf = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`

export function MasterTablesPage() {
  const { historyEntries: history } = useHistory()

  // ── Gemstones ────────────────────────────────────────────────────────────────
  const [gemstones, setGemstones] = useState<GemstonePrice[]>([])
  const [gemEditId, setGemEditId] = useState<string | null>(null)
  const [gemDraft, setGemDraft] = useState<Omit<GemstonePrice, 'id'> | null>(null)
  const [showNewGem, setShowNewGem] = useState(false)
  const [newGemDraft, setNewGemDraft] = useState<Omit<GemstonePrice, 'id'>>({ ...BLANK_GEM })

  useEffect(() => {
    gemstoneService.getAll().then(setGemstones).catch(console.error)
  }, [])

  const startGemEdit = (g: GemstonePrice) => {
    const { id: _, ...rest } = g
    setGemEditId(g.id)
    setGemDraft({ ...rest })
  }
  const cancelGemEdit = () => { setGemEditId(null); setGemDraft(null) }

  const saveGemEdit = async () => {
    if (!gemEditId || !gemDraft) return
    const updated = await gemstoneService.update(gemEditId, gemDraft)
    setGemstones(prev => prev.map(g => g.id === updated.id ? updated : g))
    cancelGemEdit()
  }

  const deleteGem = async (id: string) => {
    if (!confirm('Delete this gemstone?')) return
    await gemstoneService.delete(id)
    setGemstones(prev => prev.filter(g => g.id !== id))
  }

  const saveNewGem = async () => {
    const created = await gemstoneService.create(newGemDraft)
    setGemstones(prev => [...prev, created])
    setShowNewGem(false)
    setNewGemDraft({ ...BLANK_GEM })
  }

  // ── Diamond Sizes ──────────────────────────────────────────────────────────
  const [diamondSizes, setDiamondSizes] = useState<DiamondSizeConfig[]>([])
  const [dsEditId, setDsEditId] = useState<number | null>(null)
  const [dsDraft, setDsDraft] = useState<DiamondSizeConfig | null>(null)
  const [showNewDs, setShowNewDs] = useState(false)
  const [newDsDraft, setNewDsDraft] = useState<Omit<DiamondSizeConfig, 'id'>>({ ...BLANK_DS })

  useEffect(() => {
    configService.getDiamondSizes().then(setDiamondSizes).catch(console.error)
  }, [])

  const saveDsEdit = async () => {
    if (!dsDraft) return
    const updated = await configService.updateDiamondSize(dsDraft.id, {
      basePrice: dsDraft.basePrice,
      label: dsDraft.label,
      ctPerStone: dsDraft.ctPerStone ?? null,
    })
    setDiamondSizes(prev => prev.map(d => d.id === updated.id ? updated : d))
    setDsEditId(null); setDsDraft(null)
  }

  const saveNewDs = async () => {
    if (!newDsDraft.sizeKey.trim() || !newDsDraft.label.trim()) return
    const created = await configService.createDiamondSize(newDsDraft)
    setDiamondSizes(prev => [...prev, created])
    setShowNewDs(false)
    setNewDsDraft({ ...BLANK_DS })
  }

  const deleteDs = async (id: number) => {
    if (!confirm('Delete this diamond size?')) return
    await configService.deleteDiamondSize(id)
    setDiamondSizes(prev => prev.filter(d => d.id !== id))
  }

  // ── Finger Sizes ───────────────────────────────────────────────────────────
  const [fingerSizes, setFingerSizes] = useState<FingerSizeConfig[]>([])
  const [fsEditId, setFsEditId] = useState<number | null>(null)
  const [fsDraft, setFsDraft] = useState<FingerSizeConfig | null>(null)
  const [showNewFs, setShowNewFs] = useState(false)
  const [newFsDraft, setNewFsDraft] = useState<Omit<FingerSizeConfig, 'id'>>({ ...BLANK_FS })

  useEffect(() => {
    configService.getFingerSizes().then(setFingerSizes).catch(console.error)
  }, [])

  const saveFsEdit = async () => {
    if (!fsDraft) return
    const updated = await configService.updateFingerSize(fsDraft.id, fsDraft.additionalFee)
    setFingerSizes(prev => prev.map(f => f.id === updated.id ? updated : f))
    setFsEditId(null); setFsDraft(null)
  }

  const saveNewFs = async () => {
    if (!newFsDraft.size || newFsDraft.size <= 0) return
    const created = await configService.createFingerSize(newFsDraft)
    setFingerSizes(prev => [...prev, created].sort((a, b) => a.size - b.size))
    setShowNewFs(false)
    setNewFsDraft({ ...BLANK_FS })
  }

  const deleteFs = async (id: number) => {
    if (!confirm('Delete this finger size?')) return
    await configService.deleteFingerSize(id)
    setFingerSizes(prev => prev.filter(f => f.id !== id))
  }

  // ── CAD Design Tiers ───────────────────────────────────────────────────────
  const [cadTiers, setCadTiers] = useState<PricingTier[]>([])
  const [cadEditId, setCadEditId] = useState<number | null>(null)
  const [cadDraft, setCadDraft] = useState<PricingTier | null>(null)
  const [showNewCad, setShowNewCad] = useState(false)
  const [newCadDraft, setNewCadDraft] = useState<Omit<PricingTier, 'id'>>({ ...BLANK_CAD })

  useEffect(() => {
    configService.getCadTiers().then(setCadTiers).catch(console.error)
  }, [])

  const saveCadEdit = async () => {
    if (!cadDraft) return
    const updated = await configService.updatePricingTier(cadDraft.id, { fee: cadDraft.fee, label: cadDraft.label })
    setCadTiers(prev => prev.map(t => t.id === updated.id ? updated : t))
    setCadEditId(null); setCadDraft(null)
  }

  const saveNewCad = async () => {
    if (!newCadDraft.tierKey.trim() || !newCadDraft.label.trim()) return
    const created = await configService.createPricingTier(newCadDraft)
    setCadTiers(prev => [...prev, created])
    setShowNewCad(false)
    setNewCadDraft({ ...BLANK_CAD })
  }

  const deleteCad = async (id: number) => {
    if (!confirm('Delete this CAD tier?')) return
    await configService.deletePricingTier(id)
    setCadTiers(prev => prev.filter(t => t.id !== id))
  }

  // ── Setters ────────────────────────────────────────────────────────────────
  const [setters, setSetters] = useState<SetterConfig[]>([])
  const [setterEditId, setSetterEditId] = useState<number | null>(null)
  const [setterDraft, setSetterDraft] = useState<SetterConfig | null>(null)
  const [showNewSetter, setShowNewSetter] = useState(false)
  const [newSetterDraft, setNewSetterDraft] = useState<Omit<SetterConfig, 'id' | 'sortOrder'>>({ ...BLANK_SETTER })

  useEffect(() => {
    configService.getSetters().then(setSetters).catch(console.error)
  }, [])

  const saveSetterEdit = async () => {
    if (!setterDraft) return
    const updated = await configService.updateSetter(setterDraft.id, {
      label: setterDraft.label,
      fee: setterDraft.fee,
      sortOrder: setterDraft.sortOrder,
    })
    setSetters(prev => prev.map(s => s.id === updated.id ? updated : s))
    setSetterEditId(null); setSetterDraft(null)
  }

  const saveNewSetter = async () => {
    if (!newSetterDraft.typeKey.trim() || !newSetterDraft.label.trim()) return
    const created = await configService.createSetter(newSetterDraft)
    setSetters(prev => [...prev, created])
    setShowNewSetter(false)
    setNewSetterDraft({ ...BLANK_SETTER })
  }

  const deleteSetter = async (id: number) => {
    if (!confirm('Delete this setter type?')) return
    await configService.deleteSetter(id)
    setSetters(prev => prev.filter(s => s.id !== id))
  }

  // ── Ring Labor Tiers ───────────────────────────────────────────────────────
  const [ringLaborTiers, setRingLaborTiers] = useState<PricingTier[]>([])
  const [rlEditId, setRlEditId] = useState<number | null>(null)
  const [rlDraft, setRlDraft] = useState<PricingTier | null>(null)
  const [showNewRl, setShowNewRl] = useState(false)
  const [newRlDraft, setNewRlDraft] = useState<Omit<PricingTier, 'id'>>({ ...BLANK_RL })

  useEffect(() => {
    configService.getRingLaborTiers().then(setRingLaborTiers).catch(console.error)
  }, [])

  const saveRlEdit = async () => {
    if (!rlDraft) return
    const updated = await configService.updatePricingTier(rlDraft.id, { fee: rlDraft.fee, label: rlDraft.label })
    setRingLaborTiers(prev => prev.map(t => t.id === updated.id ? updated : t))
    setRlEditId(null); setRlDraft(null)
  }

  const saveNewRl = async () => {
    if (!newRlDraft.tierKey.trim() || !newRlDraft.label.trim()) return
    const created = await configService.createPricingTier(newRlDraft)
    setRingLaborTiers(prev => [...prev, created])
    setShowNewRl(false)
    setNewRlDraft({ ...BLANK_RL })
  }

  const deleteRl = async (id: number) => {
    if (!confirm('Delete this Ring Labor tier?')) return
    await configService.deletePricingTier(id)
    setRingLaborTiers(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Master Tables</h1>
        <p className="mt-1 text-sm text-slate-500">Reference data for metals, gemstones, clients and price history.</p>
      </div>

      {/* ── Gemstones ── */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Gemstones</CardTitle>
              <p className="text-sm text-slate-500">Reference prices for gemstones by category and quality.</p>
            </div>
            <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={() => { setShowNewGem(true); setGemEditId(null); setGemDraft(null) }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Name</TH><TH>Category</TH><TH>Quality</TH><TH>Color</TH>
                  <TH>Unit</TH><TH>Price</TH><TH>Notes</TH><TH></TH>
                </tr>
              </thead>
              <tbody>
                {gemstones.map(g => {
                  if (gemEditId === g.id && gemDraft) {
                    return (
                      <tr key={g.id} className="border-b border-violet-100 bg-violet-50/30">
                        <td className="px-3 py-2"><TInput value={gemDraft.name} onChange={e => setGemDraft(d => d && { ...d, name: e.target.value })} /></td>
                        <td className="px-3 py-2">
                          <TSelect value={gemDraft.category} onChange={e => setGemDraft(d => d && { ...d, category: e.target.value as GemstonePrice['category'] })}>
                            <option value="diamond">Diamond</option>
                            <option value="precious">Precious</option>
                            <option value="semi-precious">Semi-precious</option>
                            <option value="organic">Organic</option>
                          </TSelect>
                        </td>
                        <td className="px-3 py-2">
                          <TSelect value={gemDraft.quality} onChange={e => setGemDraft(d => d && { ...d, quality: e.target.value as GemstonePrice['quality'] })}>
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                            <option value="collector">Collector</option>
                          </TSelect>
                        </td>
                        <td className="px-3 py-2"><TInput value={gemDraft.color} onChange={e => setGemDraft(d => d && { ...d, color: e.target.value })} /></td>
                        <td className="px-3 py-2">
                          <TSelect value={gemDraft.unit} onChange={e => setGemDraft(d => d && { ...d, unit: e.target.value as GemstonePrice['unit'] })}>
                            <option value="per ct">per ct</option>
                            <option value="per piece">per piece</option>
                          </TSelect>
                        </td>
                        <td className="px-3 py-2"><TInput type="number" step="0.01" value={gemDraft.price} onChange={e => setGemDraft(d => d && { ...d, price: +e.target.value })} /></td>
                        <td className="px-3 py-2"><TInput value={gemDraft.note} onChange={e => setGemDraft(d => d && { ...d, note: e.target.value })} /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveGemEdit}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100" onClick={cancelGemEdit}><X className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={g.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                      <td className="px-6 py-4 font-semibold text-slate-900">{g.name}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${CATEGORY_STYLES[g.category]}`}>{g.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${QUALITY_STYLES[g.quality]}`}>{g.quality}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{g.color}</td>
                      <td className="px-6 py-4 text-slate-500">{g.unit}</td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-900">{pf(g.price)}</td>
                      <td className="px-6 py-4 text-xs text-slate-400">{g.note}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                            onClick={() => startGemEdit(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => deleteGem(g.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {showNewGem && (
                  <tr className="border-b border-emerald-100 bg-emerald-50/30">
                    <td className="px-3 py-2"><TInput placeholder="Name" value={newGemDraft.name} onChange={e => setNewGemDraft(d => ({ ...d, name: e.target.value }))} /></td>
                    <td className="px-3 py-2">
                      <TSelect value={newGemDraft.category} onChange={e => setNewGemDraft(d => ({ ...d, category: e.target.value as GemstonePrice['category'] }))}>
                        <option value="diamond">Diamond</option>
                        <option value="precious">Precious</option>
                        <option value="semi-precious">Semi-precious</option>
                        <option value="organic">Organic</option>
                      </TSelect>
                    </td>
                    <td className="px-3 py-2">
                      <TSelect value={newGemDraft.quality} onChange={e => setNewGemDraft(d => ({ ...d, quality: e.target.value as GemstonePrice['quality'] }))}>
                        <option value="standard">Standard</option>
                        <option value="premium">Premium</option>
                        <option value="collector">Collector</option>
                      </TSelect>
                    </td>
                    <td className="px-3 py-2"><TInput placeholder="Color" value={newGemDraft.color} onChange={e => setNewGemDraft(d => ({ ...d, color: e.target.value }))} /></td>
                    <td className="px-3 py-2">
                      <TSelect value={newGemDraft.unit} onChange={e => setNewGemDraft(d => ({ ...d, unit: e.target.value as GemstonePrice['unit'] }))}>
                        <option value="per ct">per ct</option>
                        <option value="per piece">per piece</option>
                      </TSelect>
                    </td>
                    <td className="px-3 py-2"><TInput type="number" step="0.01" value={newGemDraft.price} onChange={e => setNewGemDraft(d => ({ ...d, price: +e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput placeholder="Note" value={newGemDraft.note} onChange={e => setNewGemDraft(d => ({ ...d, note: e.target.value }))} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveNewGem}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100"
                          onClick={() => { setShowNewGem(false); setNewGemDraft({ ...BLANK_GEM }) }}><X className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── History (read-only) ── */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-base font-semibold text-slate-900">Price History</CardTitle>
          <p className="text-sm text-slate-500">Historical signal entries across tracked instruments.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Date</TH><TH>Metal</TH><TH>Price</TH><TH>Change</TH><TH>Signal</TH>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => {
                  const pos = entry.changePercent >= 0
                  return (
                    <tr key={entry.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                      <td className="px-6 py-4 text-slate-500">{entry.date}</td>
                      <td className="px-6 py-4 font-semibold capitalize text-slate-900">{entry.metal}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{pf(entry.price)}</td>
                      <td className={`px-6 py-4 font-medium ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {pos ? '+' : ''}{entry.changePercent.toFixed(2)}%
                      </td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${SIGNAL_STYLES[entry.signal]}`}>
                          {entry.signal}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Diamond Sizes ── */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Diamond Sizes</CardTitle>
              <p className="text-sm text-slate-500">
                Price per stone by mm range, split by stone type (Natural / Lab). Click the pencil to edit.
              </p>
            </div>
            <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={() => { setShowNewDs(true); setDsEditId(null); setDsDraft(null) }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Stone type</TH>
                  <TH>Size key</TH>
                  <TH>Label</TH>
                  <TH>CT / stone</TH>
                  <TH>Price / stone</TH>
                  <TH></TH>
                </tr>
              </thead>
              <tbody>
                {[...diamondSizes]
                  .sort((a, b) => (a.stoneType.localeCompare(b.stoneType)) || a.sizeKey.localeCompare(b.sizeKey, undefined, { numeric: true }))
                  .map(d => {
                  if (dsEditId === d.id && dsDraft) {
                    return (
                      <tr key={d.id} className="border-b border-violet-100 bg-violet-50/30">
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STONE_TYPE_STYLES[d.stoneType]}`}>{d.stoneType}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-xs">{d.sizeKey}</td>
                        <td className="px-3 py-2">
                          <TInput value={dsDraft.label} onChange={e => setDsDraft(p => p && { ...p, label: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 w-32">
                          <TInput type="number" step="0.0001" placeholder="0.000"
                            value={dsDraft.ctPerStone ?? ''}
                            onChange={e => setDsDraft(p => p && { ...p, ctPerStone: e.target.value === '' ? null : +e.target.value })} />
                        </td>
                        <td className="px-3 py-2 w-40">
                          <TInput type="number" step="0.01" value={dsDraft.basePrice}
                            onChange={e => setDsDraft(p => p && { ...p, basePrice: +e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveDsEdit}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100" onClick={() => { setDsEditId(null); setDsDraft(null) }}><X className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={d.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STONE_TYPE_STYLES[d.stoneType]}`}>{d.stoneType}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-xs">{d.sizeKey}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{d.label}</td>
                      <td className="px-6 py-4 text-slate-700">
                        {d.ctPerStone != null ? `${d.ctPerStone} ct` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{pf(d.basePrice)}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                            onClick={() => { setDsEditId(d.id); setDsDraft({ ...d }) }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => deleteDs(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {showNewDs && (
                  <tr className="border-b border-emerald-100 bg-emerald-50/30">
                    <td className="px-3 py-2 w-32">
                      <TSelect value={newDsDraft.stoneType}
                        onChange={e => setNewDsDraft(d => ({ ...d, stoneType: e.target.value as StoneType }))}>
                        <option value="NATURAL">NATURAL</option>
                        <option value="LAB">LAB</option>
                      </TSelect>
                    </td>
                    <td className="px-3 py-2 w-32">
                      <TInput placeholder="1.5" value={newDsDraft.sizeKey}
                        onChange={e => setNewDsDraft(d => ({ ...d, sizeKey: e.target.value }))} />
                    </td>
                    <td className="px-3 py-2">
                      <TInput placeholder="Ø 1.50 mm" value={newDsDraft.label}
                        onChange={e => setNewDsDraft(d => ({ ...d, label: e.target.value }))} />
                    </td>
                    <td className="px-3 py-2 w-32">
                      <TInput type="number" step="0.0001" placeholder="0.014"
                        value={newDsDraft.ctPerStone ?? ''}
                        onChange={e => setNewDsDraft(d => ({ ...d, ctPerStone: e.target.value === '' ? null : +e.target.value }))} />
                    </td>
                    <td className="px-3 py-2 w-40">
                      <TInput type="number" step="0.01" placeholder="0.00" value={newDsDraft.basePrice}
                        onChange={e => setNewDsDraft(d => ({ ...d, basePrice: +e.target.value }))} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveNewDs}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100"
                          onClick={() => { setShowNewDs(false); setNewDsDraft({ ...BLANK_DS }) }}><X className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Finger Sizes ── */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Finger Sizes</CardTitle>
              <p className="text-sm text-slate-500">Additional fee per ring size. Click the pencil to edit.</p>
            </div>
            <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={() => { setShowNewFs(true); setFsEditId(null); setFsDraft(null) }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Ring size</TH>
                  <TH>Additional fee</TH>
                  <TH></TH>
                </tr>
              </thead>
              <tbody>
                {fingerSizes.map(f => {
                  if (fsEditId === f.id && fsDraft) {
                    return (
                      <tr key={f.id} className="border-b border-violet-100 bg-violet-50/30">
                        <td className="px-6 py-4 font-semibold text-slate-900">{f.size}</td>
                        <td className="px-3 py-2 w-40">
                          <TInput type="number" step="0.01" value={fsDraft.additionalFee}
                            onChange={e => setFsDraft(p => p && { ...p, additionalFee: +e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveFsEdit}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100" onClick={() => { setFsEditId(null); setFsDraft(null) }}><X className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={f.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                      <td className="px-6 py-4 font-semibold text-slate-900">{f.size}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{f.additionalFee === 0 ? '—' : `+${pf(f.additionalFee)}`}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                            onClick={() => { setFsEditId(f.id); setFsDraft({ ...f }) }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => deleteFs(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {showNewFs && (
                  <tr className="border-b border-emerald-100 bg-emerald-50/30">
                    <td className="px-3 py-2 w-32">
                      <TInput type="number" step="0.5" placeholder="Size" value={newFsDraft.size}
                        onChange={e => setNewFsDraft(d => ({ ...d, size: +e.target.value }))} />
                    </td>
                    <td className="px-3 py-2 w-40">
                      <TInput type="number" step="0.01" placeholder="Fee" value={newFsDraft.additionalFee}
                        onChange={e => setNewFsDraft(d => ({ ...d, additionalFee: +e.target.value }))} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveNewFs}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100"
                          onClick={() => { setShowNewFs(false); setNewFsDraft({ ...BLANK_FS }) }}><X className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── CAD Design & Ring Labor ── */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">CAD Design</CardTitle>
                <p className="text-sm text-slate-500">Fee by piece complexity. Click the pencil to edit.</p>
              </div>
              <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
                onClick={() => { setShowNewCad(true); setCadEditId(null); setCadDraft(null) }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Tier</TH><TH>Label</TH><TH>Fee</TH><TH></TH>
                </tr>
              </thead>
              <tbody>
                {cadTiers.map(t => {
                  if (cadEditId === t.id && cadDraft) {
                    return (
                      <tr key={t.id} className="border-b border-violet-100 bg-violet-50/30">
                        <td className="px-6 py-4 text-slate-400 text-xs capitalize">{t.tierKey}</td>
                        <td className="px-3 py-2"><TInput value={cadDraft.label} onChange={e => setCadDraft(p => p && { ...p, label: e.target.value })} /></td>
                        <td className="px-3 py-2 w-28"><TInput type="number" step="0.01" value={cadDraft.fee} onChange={e => setCadDraft(p => p && { ...p, fee: +e.target.value })} /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveCadEdit}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100" onClick={() => { setCadEditId(null); setCadDraft(null) }}><X className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={t.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                      <td className="px-6 py-4 text-slate-400 text-xs capitalize">{t.tierKey}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{t.label}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{pf(t.fee)}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                            onClick={() => { setCadEditId(t.id); setCadDraft({ ...t }) }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => deleteCad(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {showNewCad && (
                  <tr className="border-b border-emerald-100 bg-emerald-50/30">
                    <td className="px-3 py-2 w-28"><TInput placeholder="Key" value={newCadDraft.tierKey}
                      onChange={e => setNewCadDraft(d => ({ ...d, tierKey: e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput placeholder="Label" value={newCadDraft.label}
                      onChange={e => setNewCadDraft(d => ({ ...d, label: e.target.value }))} /></td>
                    <td className="px-3 py-2 w-28"><TInput type="number" step="0.01" value={newCadDraft.fee}
                      onChange={e => setNewCadDraft(d => ({ ...d, fee: +e.target.value }))} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveNewCad}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100"
                          onClick={() => { setShowNewCad(false); setNewCadDraft({ ...BLANK_CAD }) }}><X className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">Ring Labor</CardTitle>
                <p className="text-sm text-slate-500">Fee by ring complexity. Click the pencil to edit.</p>
              </div>
              <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
                onClick={() => { setShowNewRl(true); setRlEditId(null); setRlDraft(null) }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Tier</TH><TH>Label</TH><TH>Fee</TH><TH></TH>
                </tr>
              </thead>
              <tbody>
                {ringLaborTiers.map(t => {
                  if (rlEditId === t.id && rlDraft) {
                    return (
                      <tr key={t.id} className="border-b border-violet-100 bg-violet-50/30">
                        <td className="px-6 py-4 text-slate-400 text-xs capitalize">{t.tierKey}</td>
                        <td className="px-3 py-2"><TInput value={rlDraft.label} onChange={e => setRlDraft(p => p && { ...p, label: e.target.value })} /></td>
                        <td className="px-3 py-2 w-28"><TInput type="number" step="0.01" value={rlDraft.fee} onChange={e => setRlDraft(p => p && { ...p, fee: +e.target.value })} /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveRlEdit}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100" onClick={() => { setRlEditId(null); setRlDraft(null) }}><X className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={t.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                      <td className="px-6 py-4 text-slate-400 text-xs capitalize">{t.tierKey}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{t.label}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{pf(t.fee)}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                            onClick={() => { setRlEditId(t.id); setRlDraft({ ...t }) }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => deleteRl(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {showNewRl && (
                  <tr className="border-b border-emerald-100 bg-emerald-50/30">
                    <td className="px-3 py-2 w-28"><TInput placeholder="Key" value={newRlDraft.tierKey}
                      onChange={e => setNewRlDraft(d => ({ ...d, tierKey: e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput placeholder="Label" value={newRlDraft.label}
                      onChange={e => setNewRlDraft(d => ({ ...d, label: e.target.value }))} /></td>
                    <td className="px-3 py-2 w-28"><TInput type="number" step="0.01" value={newRlDraft.fee}
                      onChange={e => setNewRlDraft(d => ({ ...d, fee: +e.target.value }))} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveNewRl}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100"
                          onClick={() => { setShowNewRl(false); setNewRlDraft({ ...BLANK_RL }) }}><X className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ── Setters (Stone setting types) ── */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Setters</CardTitle>
              <p className="text-sm text-slate-500">
                Stone setting types and per-stone fees (S&amp;S Melee, Bezel, Channel…). Click the pencil to edit.
              </p>
            </div>
            <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={() => { setShowNewSetter(true); setSetterEditId(null); setSetterDraft(null) }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Type key</TH>
                  <TH>Label</TH>
                  <TH>Fee / stone</TH>
                  <TH>Order</TH>
                  <TH></TH>
                </tr>
              </thead>
              <tbody>
                {[...setters].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(s => {
                  if (setterEditId === s.id && setterDraft) {
                    return (
                      <tr key={s.id} className="border-b border-violet-100 bg-violet-50/30">
                        <td className="px-6 py-4 text-slate-400 text-xs">{s.typeKey}</td>
                        <td className="px-3 py-2"><TInput value={setterDraft.label} onChange={e => setSetterDraft(p => p && { ...p, label: e.target.value })} /></td>
                        <td className="px-3 py-2 w-32"><TInput type="number" step="0.01" value={setterDraft.fee} onChange={e => setSetterDraft(p => p && { ...p, fee: +e.target.value })} /></td>
                        <td className="px-3 py-2 w-24"><TInput type="number" step="1" value={setterDraft.sortOrder ?? 0} onChange={e => setSetterDraft(p => p && { ...p, sortOrder: +e.target.value })} /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveSetterEdit}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100" onClick={() => { setSetterEditId(null); setSetterDraft(null) }}><X className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={s.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                      <td className="px-6 py-4 text-slate-400 text-xs">{s.typeKey}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{s.label}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{pf(s.fee)}</td>
                      <td className="px-6 py-4 text-slate-500">{s.sortOrder}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                            onClick={() => { setSetterEditId(s.id); setSetterDraft({ ...s }) }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => deleteSetter(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {showNewSetter && (
                  <tr className="border-b border-emerald-100 bg-emerald-50/30">
                    <td className="px-3 py-2 w-32"><TInput placeholder="ss_melee" value={newSetterDraft.typeKey}
                      onChange={e => setNewSetterDraft(d => ({ ...d, typeKey: e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput placeholder="S&S Melee" value={newSetterDraft.label}
                      onChange={e => setNewSetterDraft(d => ({ ...d, label: e.target.value }))} /></td>
                    <td className="px-3 py-2 w-32"><TInput type="number" step="0.01" value={newSetterDraft.fee}
                      onChange={e => setNewSetterDraft(d => ({ ...d, fee: +e.target.value }))} /></td>
                    <td className="px-3 py-2 text-slate-400 text-xs">auto</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveNewSetter}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100"
                          onClick={() => { setShowNewSetter(false); setNewSetterDraft({ ...BLANK_SETTER }) }}><X className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default MasterTablesPage
