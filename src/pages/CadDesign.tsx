import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { Card, CardContent } from '@/components/ui/card'
import { ModelViewer3D } from '@/components/ModelViewer3D'
import { FINGER_SIZE_OPTIONS, METAL_GROUPS } from '@/hooks/useQuoteBuilder'
import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import type { JewelryMetalOption } from '@/types'
import {
  buildRingBandGeometry, usSizeToDiameterMm, type BandProfile,
  buildStoneHeadGroup, attachHeadToBand, roundDiameterMmFromCarat,
} from '@/lib/ringGeometry'
import { Download, RotateCw } from 'lucide-react'

// Approximate render colors per metal — cosmetic only, doesn't drive
// pricing (that still comes from Master Tables / config.metalPriceMap
// elsewhere in the app).
const METAL_COLORS: Record<JewelryMetalOption, string> = {
  'gold-14k-white': '#e6e5e0',
  'gold-14k-yellow': '#d9b036',
  'gold-14k-rose': '#dba98c',
  'gold-18k-white': '#f0efe9',
  'gold-18k-yellow': '#e8bd3a',
  'gold-18k-rose': '#e3ac8c',
  platinum: '#dcdcdc',
  'gold-14k': '#d9b036',
  'gold-18k': '#e8bd3a',
  silver: '#c8c8c8',
}

const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400'
const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500'

export function CadDesignPage() {
  const [fingerSize, setFingerSize] = useState(6)
  const [widthMm, setWidthMm] = useState(2.5)
  const [thicknessMm, setThicknessMm] = useState(1.8)
  const [profile, setProfile] = useState<BandProfile>('comfort')
  const [metal, setMetal] = useState<JewelryMetalOption>('gold-18k-yellow')
  const [includeStone, setIncludeStone] = useState(true)
  const [caratWeight, setCaratWeight] = useState(1)
  const [prongCount, setProngCount] = useState<4 | 6>(4)

  const innerDiameterMm = usSizeToDiameterMm(fingerSize)
  const stoneDiameterMm = roundDiameterMmFromCarat(caratWeight)

  // One combined group — band + (optionally) the center-stone head — so the
  // viewer and the STL export both see a single object. Rebuilt only when a
  // param actually changes, not every render.
  const model = useMemo(() => {
    const group = new THREE.Group()
    const band = new THREE.Mesh(buildRingBandGeometry({ fingerSize, widthMm, thicknessMm, profile }))
    group.add(band)
    if (includeStone) {
      const head = buildStoneHeadGroup({ stoneDiameterMm, prongCount })
      attachHeadToBand(head, { fingerSize, widthMm, thicknessMm, profile })
      group.add(head)
    }
    return group
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerSize, widthMm, thicknessMm, profile, includeStone, stoneDiameterMm, prongCount])

  const downloadStl = () => {
    const exporter = new STLExporter()
    const stl = exporter.parse(model, { binary: false })
    const blob = new Blob([stl], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ring-size${fingerSize}-w${widthMm}mm${includeStone ? `-${caratWeight}ct` : ''}.stl`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-[30px] border-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
        <CardContent className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
            <RotateCw className="h-4 w-4" /> CAD Design
            <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[9px] font-bold text-slate-900">Early preview</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Parametric solitaire ring</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Band (size/width/thickness/profile) plus an optional round-brilliant prong head, sized from carat weight.
            This is not a Matrix/RhinoGold replacement yet — the stone is a placeholder shape (not faceted gem geometry),
            band and head aren't boolean-unioned into one solid, and only round center stones are supported so far.
            Building toward full parity step by step.
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card className="rounded-[30px] border border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardContent className="space-y-5 p-6 sm:p-7">
            <div>
              <label className={labelCls}>Ring size</label>
              <select value={fingerSize} onChange={e => setFingerSize(Number(e.target.value))} className={inputCls}>
                {FINGER_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">≈ {innerDiameterMm.toFixed(2)} mm inside diameter</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Band width (mm)</label>
                <input type="number" min={1} max={12} step={0.1} value={widthMm}
                  onChange={e => setWidthMm(Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Thickness (mm)</label>
                <input type="number" min={0.8} max={4} step={0.1} value={thicknessMm}
                  onChange={e => setThicknessMm(Math.max(0.8, Number(e.target.value) || 0.8))} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Profile</label>
              <div className="grid grid-cols-2 gap-2">
                {(['flat', 'comfort'] as const).map(p => (
                  <button key={p} type="button" onClick={() => setProfile(p)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${profile === p ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                    {p === 'flat' ? 'Flat band' : 'Comfort fit'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Metal</label>
              <select value={metal} onChange={e => setMetal(e.target.value as JewelryMetalOption)} className={inputCls}>
                {METAL_GROUPS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.keys.map(key => <option key={key} value={key}>{JEWELRY_METAL_OPTIONS[key].label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">Center stone (round)</span>
                <input type="checkbox" checked={includeStone} onChange={e => setIncludeStone(e.target.checked)}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
              </label>
              {includeStone && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Carat weight</label>
                      <input type="number" min={0.1} max={10} step={0.05} value={caratWeight}
                        onChange={e => setCaratWeight(Math.max(0.1, Number(e.target.value) || 0.1))} className={inputCls} />
                      <p className="mt-1 text-[11px] text-slate-400">≈ {stoneDiameterMm.toFixed(2)} mm diameter</p>
                    </div>
                    <div>
                      <label className={labelCls}>Prongs</label>
                      <div className="grid grid-cols-2 gap-2">
                        {([4, 6] as const).map(n => (
                          <button key={n} type="button" onClick={() => setProngCount(n)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${prongCount === n ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button type="button" onClick={downloadStl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
              style={{ backgroundColor: 'var(--theme-primary)' }}>
              <Download className="h-4 w-4" /> Download STL
            </button>
            <p className="text-[11px] text-slate-400">
              Sizing uses a linear approximation of the standard US chart, and carat→diameter the standard
              6.5×∛carat estimate — cross-check both against your own charts before sending anything to production.
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[30px] border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <ModelViewer3D object={model} color={METAL_COLORS[metal]} className="h-[420px] w-full sm:h-[520px]" />
        </Card>
      </section>
    </div>
  )
}

export default CadDesignPage
