import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { Card, CardContent } from '@/components/ui/card'
import { ModelViewer3D } from '@/components/ModelViewer3D'
import { FINGER_SIZE_OPTIONS, METAL_GROUPS } from '@/hooks/useQuoteBuilder'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import type { JewelryMetalOption } from '@/types'
import {
  buildRingBandGeometry, usSizeToDiameterMm, type BandProfile,
  buildStoneHeadGroup, buildBezelHeadGroup, buildHaloGroup, attachHeadToBand, roundDiameterMmFromCarat,
  buildFancyStoneHeadGroup, type FancyStoneShape,
  buildPaveRow, buildChannelSetting,
  unionMetalParts, extractStoneMeshes,
  computeVolumeMm3, estimateWeightGrams, METAL_DENSITY_G_PER_CM3,
} from '@/lib/ringGeometry'

type SettingType = 'prong' | 'bezel'

type StoneShape = 'round' | FancyStoneShape

const STONE_SHAPE_LABELS: Record<StoneShape, string> = {
  round: 'Round', oval: 'Oval', cushion: 'Cushion', princess: 'Princess', marquise: 'Marquise', pear: 'Pear',
}
// Reasonable starting length×width (mm) per fancy shape, editable afterward.
const FANCY_SHAPE_DEFAULTS: Record<FancyStoneShape, { lengthMm: number; widthMm: number }> = {
  oval: { lengthMm: 8, widthMm: 6 },
  cushion: { lengthMm: 7, widthMm: 7 },
  princess: { lengthMm: 6.5, widthMm: 6.5 },
  marquise: { lengthMm: 10, widthMm: 5 },
  pear: { lengthMm: 9, widthMm: 6 },
}
import { Download, RotateCw, Scale } from 'lucide-react'

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
  const config = useQuoteConfig()
  const [fingerSize, setFingerSize] = useState(6)
  const [widthMm, setWidthMm] = useState(2.5)
  const [thicknessMm, setThicknessMm] = useState(1.8)
  const [profile, setProfile] = useState<BandProfile>('comfort')
  const [metal, setMetal] = useState<JewelryMetalOption>('gold-18k-yellow')
  const [includeStone, setIncludeStone] = useState(true)
  const [stoneShape, setStoneShape] = useState<StoneShape>('round')
  const [caratWeight, setCaratWeight] = useState(1)
  const [fancyLengthMm, setFancyLengthMm] = useState(FANCY_SHAPE_DEFAULTS.oval.lengthMm)
  const [fancyWidthMm, setFancyWidthMm] = useState(FANCY_SHAPE_DEFAULTS.oval.widthMm)
  const [settingType, setSettingType] = useState<SettingType>('prong')
  const [prongCount, setProngCount] = useState<4 | 6>(4)
  const [includeHalo, setIncludeHalo] = useState(false)
  const [haloCount, setHaloCount] = useState(16)
  const [haloStoneMm, setHaloStoneMm] = useState(1.2)
  const [includePave, setIncludePave] = useState(false)
  const [paveSettingType, setPaveSettingType] = useState<'pave' | 'channel'>('pave')
  const [paveCount, setPaveCount] = useState(12)
  const [paveStoneMm, setPaveStoneMm] = useState(1.2)
  const [mergeSolid, setMergeSolid] = useState(false)

  const innerDiameterMm = usSizeToDiameterMm(fingerSize)
  const stoneDiameterMm = roundDiameterMmFromCarat(caratWeight)
  // Round center stone only for now — see the roadmap memory.
  const haloEligible = includeHalo && stoneShape === 'round'

  const selectStoneShape = (shape: StoneShape) => {
    setStoneShape(shape)
    if (shape !== 'round') {
      setFancyLengthMm(FANCY_SHAPE_DEFAULTS[shape].lengthMm)
      setFancyWidthMm(FANCY_SHAPE_DEFAULTS[shape].widthMm)
    }
  }

  // One combined group — band + (optionally) the center-stone head — so the
  // viewer and the STL export both see a single object. Rebuilt only when a
  // param actually changes, not every render.
  const model = useMemo(() => {
    const group = new THREE.Group()
    const band = new THREE.Mesh(buildRingBandGeometry({ fingerSize, widthMm, thicknessMm, profile }))
    group.add(band)
    if (includeStone) {
      const head = stoneShape === 'round'
        ? (settingType === 'bezel'
            ? buildBezelHeadGroup({ stoneDiameterMm })
            : buildStoneHeadGroup({ stoneDiameterMm, prongCount }))
        : buildFancyStoneHeadGroup({ shape: stoneShape, lengthMm: fancyLengthMm, widthMm: fancyWidthMm, prongCount })
      attachHeadToBand(head, { fingerSize, widthMm, thicknessMm, profile })
      group.add(head)

      if (haloEligible) {
        const halo = buildHaloGroup({ stoneDiameterMm, haloCount, haloStoneDiameterMm: haloStoneMm })
        attachHeadToBand(halo, { fingerSize, widthMm, thicknessMm, profile })
        group.add(halo)
      }
    }
    if (includePave) {
      const sideStones = paveSettingType === 'channel'
        ? buildChannelSetting({ count: paveCount, stoneDiameterMm: paveStoneMm }, { fingerSize, widthMm, thicknessMm, profile })
        : buildPaveRow({ count: paveCount, stoneDiameterMm: paveStoneMm }, { fingerSize, widthMm, thicknessMm, profile })
      group.add(sideStones)
    }
    return group
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerSize, widthMm, thicknessMm, profile, includeStone, stoneShape, settingType, stoneDiameterMm, prongCount, fancyLengthMm, fancyWidthMm, haloEligible, haloCount, haloStoneMm, includePave, paveSettingType, paveCount, paveStoneMm])

  // Optional boolean-union pass — MatrixGold's own "Parametric Boolean"
  // tool. Folds every metal mesh into one real watertight solid; gems stay
  // separate (see ringGeometry.ts). Beta: three-bvh-csg can throw on a
  // genuinely degenerate input, so this is wrapped and falls back to the
  // unmerged preview rather than breaking the page.
  const { displayModel, mergeError } = useMemo(() => {
    if (!mergeSolid) return { displayModel: model, mergeError: null }
    try {
      const unioned = unionMetalParts(model)
      if (!unioned) return { displayModel: model, mergeError: null }
      const merged = new THREE.Group()
      merged.add(new THREE.Mesh(unioned))
      for (const stone of extractStoneMeshes(model)) merged.add(stone)
      return { displayModel: merged, mergeError: null }
    } catch (err) {
      return { displayModel: model, mergeError: err instanceof Error ? err.message : 'Boolean union failed on this geometry.' }
    }
  }, [model, mergeSolid])

  // Weight & cost estimate — volume comes straight off the displayed
  // geometry, so it always matches what's on screen (and in the STL). Once
  // merged, this is exact (no more overlap double-counting).
  const volumeMm3 = useMemo(() => computeVolumeMm3(displayModel), [displayModel])
  const weightGrams = estimateWeightGrams(volumeMm3, METAL_DENSITY_G_PER_CM3[metal])
  const pricePerGram = config.metalPriceMap[metal] ?? 0
  const estimatedMetalCost = weightGrams * pricePerGram

  const downloadStl = () => {
    const exporter = new STLExporter()
    const stl = exporter.parse(displayModel, { binary: false })
    const blob = new Blob([stl], { type: 'model/stl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stoneTag = includeStone ? (stoneShape === 'round' ? `-${caratWeight}ct-round-${settingType}` : `-${stoneShape}`) : ''
    a.download = `ring-size${fingerSize}-w${widthMm}mm${stoneTag}.stl`
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
            Band (size/width/thickness/profile) plus an optional prong head — round, oval, cushion, princess, marquise
            or pear — pavé side stones, and an optional boolean merge into one real solid. This is not a Matrix/RhinoGold
            replacement yet — the stone is a placeholder shape (not faceted gem geometry). Building toward full parity
            step by step.
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
                <span className="text-sm font-semibold text-slate-900">Center stone</span>
                <input type="checkbox" checked={includeStone} onChange={e => setIncludeStone(e.target.checked)}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
              </label>
              {includeStone && (
                <>
                  <div>
                    <label className={labelCls}>Shape</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(STONE_SHAPE_LABELS) as StoneShape[]).map(shape => (
                        <button key={shape} type="button" onClick={() => selectStoneShape(shape)}
                          className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${stoneShape === shape ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                          {STONE_SHAPE_LABELS[shape]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {stoneShape === 'round' ? (
                    <div>
                      <label className={labelCls}>Carat weight</label>
                      <input type="number" min={0.1} max={10} step={0.05} value={caratWeight}
                        onChange={e => setCaratWeight(Math.max(0.1, Number(e.target.value) || 0.1))} className={inputCls} />
                      <p className="mt-1 text-[11px] text-slate-400">≈ {stoneDiameterMm.toFixed(2)} mm diameter</p>
                    </div>
                  ) : null}
                  {stoneShape === 'round' && (
                    <div>
                      <label className={labelCls}>Setting type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['prong', 'bezel'] as const).map(t => (
                          <button key={t} type="button" onClick={() => setSettingType(t)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${settingType === t ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {stoneShape !== 'round' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Length (mm)</label>
                        <input type="number" min={2} max={20} step={0.1} value={fancyLengthMm}
                          onChange={e => setFancyLengthMm(Math.max(2, Number(e.target.value) || 2))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Width (mm)</label>
                        <input type="number" min={2} max={20} step={0.1} value={fancyWidthMm}
                          onChange={e => setFancyWidthMm(Math.max(2, Number(e.target.value) || 2))} className={inputCls} />
                      </div>
                    </div>
                  )}

                  {(stoneShape !== 'round' || settingType === 'prong') && (
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
                  )}

                  {stoneShape === 'round' && (
                    <div className="space-y-3 border-t border-slate-200 pt-3">
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-900">Halo</span>
                        <input type="checkbox" checked={includeHalo} onChange={e => setIncludeHalo(e.target.checked)}
                          className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                      </label>
                      {includeHalo && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Halo stone count</label>
                            <input type="number" min={6} max={40} step={1} value={haloCount}
                              onChange={e => setHaloCount(Math.max(6, Number(e.target.value) || 6))} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Halo stone size (mm)</label>
                            <input type="number" min={0.5} max={3} step={0.1} value={haloStoneMm}
                              onChange={e => setHaloStoneMm(Math.max(0.5, Number(e.target.value) || 0.5))} className={inputCls} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {stoneShape !== 'round' && includeHalo && (
                    <p className="text-[11px] text-slate-400">Halo is round-center-stone only for now.</p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">Side stones</span>
                <input type="checkbox" checked={includePave} onChange={e => setIncludePave(e.target.checked)}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
              </label>
              {includePave && (
                <>
                  <div>
                    <label className={labelCls}>Setting</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([['pave', 'Pavé'], ['channel', 'Channel']] as const).map(([t, label]) => (
                        <button key={t} type="button" onClick={() => setPaveSettingType(t)}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${paveSettingType === t ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Stone count</label>
                      <input type="number" min={2} max={60} step={2} value={paveCount}
                        onChange={e => setPaveCount(Math.max(2, Number(e.target.value) || 2))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Stone size (mm)</label>
                      <input type="number" min={0.5} max={3} step={0.1} value={paveStoneMm}
                        onChange={e => setPaveStoneMm(Math.max(0.5, Number(e.target.value) || 0.5))} className={inputCls} />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">Merge into one solid</span>
                <input type="checkbox" checked={mergeSolid} onChange={e => setMergeSolid(e.target.checked)}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
              </label>
              <p className="text-[11px] text-slate-400">
                MatrixGold's own "Parametric Boolean" tool — folds the metal parts (band, gallery, prongs, stand) into
                one real watertight solid instead of separate overlapping meshes. Gems are never merged into the
                metal — they're separate physical objects. Beta: can fail on some size combinations.
              </p>
              {mergeError && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
                  Couldn't merge this geometry ({mergeError}) — showing the unmerged preview instead.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-amber-700">
                <Scale className="h-3.5 w-3.5" /> Estimated weight &amp; metal cost
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-slate-900">{weightGrams.toFixed(2)} g</span>
                <span className="text-sm text-slate-500">
                  {config.loading ? '…' : `$${pricePerGram.toFixed(2)}/g → `}
                  <strong className="text-slate-900">${estimatedMetalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                From the actual displayed volume × {METAL_DENSITY_G_PER_CM3[metal]} g/cm³ for {JEWELRY_METAL_OPTIONS[metal].label},
                at the same $/g the rest of the app prices from — metal only, gems excluded. {mergeSolid && !mergeError
                  ? 'Merged into one solid, so this is exact (no more overlap double-counting).'
                  : 'Band+head overlap slightly (not merged), so this reads a little high rather than low.'}
              </p>
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
          <ModelViewer3D object={displayModel} color={METAL_COLORS[metal]} className="h-[420px] w-full sm:h-[520px]" />
        </Card>
      </section>
    </div>
  )
}

export default CadDesignPage
