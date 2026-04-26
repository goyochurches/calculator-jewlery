import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useHistory } from '@/hooks/useHistorial'
import { gemstoneService } from '@/services/gemstoneService'
import { metalsService, type MetalWithId } from '@/services/metalService'
import {
  configService,
  type DiamondSizeConfig,
  type FingerSizeConfig,
  type PricingTier,
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

const BLANK_METAL: Omit<MetalWithId, 'id'> = {
  symbol: '', name: '', price: 0, change: 0, changePercent: 0, high: 0, low: 0, open: 0,
}

const BLANK_DS: Omit<DiamondSizeConfig, 'id'> = { sizeKey: '', label: '', basePrice: 0 }
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

  // ── Metals ──────────────────────────────────────────────────────────────────
  const [metals, setMetals] = useState<MetalWithId[]>([])
  const [metalEditId, setMetalEditId] = useState<number | null>(null)
  const [metalDraft, setMetalDraft] = useState<MetalWithId | null>(null)
  const [showNewMetal, setShowNewMetal] = useState(false)
  const [newMetalDraft, setNewMetalDraft] = useState<Omit<MetalWithId, 'id'>>({ ...BLANK_METAL })

  useEffect(() => {
    metalsService.getAllWithIds().then(setMetals).catch(console.error)
  }, [])

  const startMetalEdit = (m: MetalWithId) => { setMetalEditId(m.id); setMetalDraft({ ...m }) }
  const cancelMetalEdit = () => { setMetalEditId(null); setMetalDraft(null) }

  const saveMetalEdit = async () => {
    if (!metalDraft) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await metalsService.update(metalDraft.id, metalDraft as any)
    setMetals(prev => prev.map(m => m.id === updated.id ? updated : m))
    cancelMetalEdit()
  }

  const saveNewMetal = async () => {
    if (!newMetalDraft.symbol.trim() || !newMetalDraft.name.trim()) return
    const created = await metalsService.create(newMetalDraft)
    setMetals(prev => [...prev, created])
    setShowNewMetal(false)
    setNewMetalDraft({ ...BLANK_METAL })
  }

  const deleteMetal = async (id: number) => {
    if (!confirm('Delete this metal?')) return
    await metalsService.delete(id)
    setMetals(prev => prev.filter(m => m.id !== id))
  }

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
    const updated = await configService.updateDiamondSize(dsDraft.id, dsDraft.basePrice)
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
        <p className="mt-1 text-sm text-slate-500">Reference data for metals, gemstones, and price history.</p>
      </div>

      {/* ── Metals ── */}
      <Card className="rounded-[30px] border border-white/80 bg-white/92 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">Metals</CardTitle>
              <p className="text-sm text-slate-500">Current spot prices for tracked metals. Click the edit icon to update values.</p>
            </div>
            <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={() => { setShowNewMetal(true); setMetalEditId(null); setMetalDraft(null) }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Symbol</TH><TH>Name</TH><TH>Price</TH><TH>Change</TH>
                  <TH>Change %</TH><TH>High</TH><TH>Low</TH><TH>Open</TH><TH></TH>
                </tr>
              </thead>
              <tbody>
                {metals.map(m => {
                  if (metalEditId === m.id && metalDraft) {
                    const set = (k: keyof MetalWithId) => (e: React.ChangeEvent<HTMLInputElement>) =>
                      setMetalDraft(d => d && { ...d, [k]: +e.target.value })
                    return (
                      <tr key={m.id} className="border-b border-violet-100 bg-violet-50/30">
                        <td className="px-6 py-3">
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold tracking-wider text-amber-700">{m.symbol}</span>
                        </td>
                        <td className="px-6 py-3 font-medium text-slate-700">{m.name}</td>
                        <td className="px-3 py-2"><TInput type="number" step="0.01" value={metalDraft.price} onChange={set('price')} /></td>
                        <td className="px-3 py-2"><TInput type="number" step="0.01" value={metalDraft.change} onChange={set('change')} /></td>
                        <td className="px-3 py-2"><TInput type="number" step="0.01" value={metalDraft.changePercent} onChange={set('changePercent')} /></td>
                        <td className="px-3 py-2"><TInput type="number" step="0.01" value={metalDraft.high} onChange={set('high')} /></td>
                        <td className="px-3 py-2"><TInput type="number" step="0.01" value={metalDraft.low} onChange={set('low')} /></td>
                        <td className="px-3 py-2"><TInput type="number" step="0.01" value={metalDraft.open} onChange={set('open')} /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveMetalEdit}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100" onClick={cancelMetalEdit}><X className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  const pos = m.change >= 0
                  return (
                    <tr key={m.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold tracking-wider text-amber-700">{m.symbol}</span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{m.name}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">{pf(m.price)}</td>
                      <td className={`px-6 py-4 font-medium ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>{pos ? '+' : ''}{m.change.toFixed(2)}</td>
                      <td className={`px-6 py-4 font-medium ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>{pos ? '+' : ''}{m.changePercent.toFixed(2)}%</td>
                      <td className="px-6 py-4 text-slate-500">{pf(m.high)}</td>
                      <td className="px-6 py-4 text-slate-500">{pf(m.low)}</td>
                      <td className="px-6 py-4 text-slate-500">{pf(m.open)}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                            onClick={() => startMetalEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={() => deleteMetal(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {showNewMetal && (
                  <tr className="border-b border-emerald-100 bg-emerald-50/30">
                    <td className="px-3 py-2"><TInput placeholder="XAU" value={newMetalDraft.symbol}
                      onChange={e => setNewMetalDraft(d => ({ ...d, symbol: e.target.value.toUpperCase() }))} /></td>
                    <td className="px-3 py-2"><TInput placeholder="Gold" value={newMetalDraft.name}
                      onChange={e => setNewMetalDraft(d => ({ ...d, name: e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput type="number" step="0.01" value={newMetalDraft.price}
                      onChange={e => setNewMetalDraft(d => ({ ...d, price: +e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput type="number" step="0.01" value={newMetalDraft.change}
                      onChange={e => setNewMetalDraft(d => ({ ...d, change: +e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput type="number" step="0.01" value={newMetalDraft.changePercent}
                      onChange={e => setNewMetalDraft(d => ({ ...d, changePercent: +e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput type="number" step="0.01" value={newMetalDraft.high}
                      onChange={e => setNewMetalDraft(d => ({ ...d, high: +e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput type="number" step="0.01" value={newMetalDraft.low}
                      onChange={e => setNewMetalDraft(d => ({ ...d, low: +e.target.value }))} /></td>
                    <td className="px-3 py-2"><TInput type="number" step="0.01" value={newMetalDraft.open}
                      onChange={e => setNewMetalDraft(d => ({ ...d, open: +e.target.value }))} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50" onClick={saveNewMetal}><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100"
                          onClick={() => { setShowNewMetal(false); setNewMetalDraft({ ...BLANK_METAL }) }}><X className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
              <p className="text-sm text-slate-500">Base price per stone by carat range. Click the pencil to edit.</p>
            </div>
            <Button size="sm" className="shrink-0 text-white" style={{ backgroundColor: 'var(--theme-primary)' }}
              onClick={() => { setShowNewDs(true); setDsEditId(null); setDsDraft(null) }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <TH>Size range (ct)</TH>
                  <TH>Base price / stone</TH>
                  <TH></TH>
                </tr>
              </thead>
              <tbody>
                {diamondSizes.map(d => {
                  if (dsEditId === d.id && dsDraft) {
                    return (
                      <tr key={d.id} className="border-b border-violet-100 bg-violet-50/30">
                        <td className="px-6 py-4 font-semibold text-slate-900">{d.label}</td>
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
                      <td className="px-6 py-4 font-semibold text-slate-900">{d.label}</td>
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
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <TInput placeholder="Key (e.g. 0.05-0.10)" value={newDsDraft.sizeKey}
                          onChange={e => setNewDsDraft(d => ({ ...d, sizeKey: e.target.value }))} />
                        <TInput placeholder="Label" value={newDsDraft.label}
                          onChange={e => setNewDsDraft(d => ({ ...d, label: e.target.value }))} />
                      </div>
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
    </div>
  )
}

export default MasterTablesPage
