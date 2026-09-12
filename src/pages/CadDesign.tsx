import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { Card, CardContent } from '@/components/ui/card'
import { ModelViewer3D, type SelectedPart, type ModelViewer3DHandle, type CameraView } from '@/components/ModelViewer3D'
import { FINGER_SIZE_OPTIONS, METAL_GROUPS } from '@/hooks/useQuoteBuilder'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import type { JewelryMetalOption } from '@/types'
import {
  buildRingBandGeometry, usSizeToDiameterMm, type BandProfile,
  buildStoneHeadGroup, buildBezelHeadGroup, buildClusterHeadGroup, buildHaloGroup, haloOrbitRadiusMm, attachHeadToBand, roundDiameterMmFromCarat, estimateFancyCaratWeight,
  defaultProngHeightMm,
  buildFancyStoneHeadGroup, type FancyStoneShape,
  buildPaveRow, buildChannelSetting, buildFlushSetting, buildBarSetting, buildInvisibleSetting,
  buildTensionBandGeometry, buildTensionSetting, tensionGapDegForStone,
  buildTaperedBandGeometry, buildTwistedBandGeometry,
  buildIllusionHeadGroup,
  buildMilgrainEdges, buildRopeEdge,
  unionMetalParts, extractStoneMeshes, checkWatertightness,
  computeVolumeMm3, estimateWeightGrams, METAL_DENSITY_G_PER_CM3,
} from '@/lib/ringGeometry'
import { parseImportedCadFile } from '@/lib/cadImport'
import { listCadPresets, saveCadPreset, deleteCadPreset, type CadDesignParams, type SavedCadPreset } from '@/lib/cadPresets'

type SettingType = 'prong' | 'bezel' | 'cluster' | 'tension' | 'illusion'

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

type Tab = 'band' | 'center' | 'side' | 'solid'

// Which tab's controls actually shape a given clicked part — every
// `userData.partName` any ringGeometry.ts builder sets should have an
// entry here. Selecting a part jumps straight to the tab that controls
// it, instead of leaving the jeweler to hunt for the right slider.
const PART_TAB: Record<string, Tab> = {
  Band: 'band',
  Gallery: 'center', Prong: 'center', Stand: 'center', 'Center stone': 'center',
  'Bezel wall': 'center', 'Cluster plate': 'center', 'Cluster petal': 'center',
  'Tension contact': 'center', 'Halo stone': 'center', 'Illusion skirt': 'center',
  'Pavé stone': 'side', 'Channel stone': 'side', 'Channel rail': 'side',
  'Flush stone': 'side', 'Flush collar': 'side', 'Bar stone': 'side', 'Bar post': 'side',
  'Invisible-set stone': 'side',
  'Milgrain bead': 'band', 'Rope strand': 'band',
  'Merged solid': 'solid', Imported: 'solid', 'Matching band': 'solid',
}
import { Download, RotateCw, Scale, MousePointerClick } from 'lucide-react'

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
  const [shankStyle, setShankStyle] = useState<'plain' | 'tapered' | 'twisted'>('plain')
  const [taperAmount, setTaperAmount] = useState(0.3)
  const [twists, setTwists] = useState(1)
  const [metal, setMetal] = useState<JewelryMetalOption>('gold-18k-yellow')
  const [includeStone, setIncludeStone] = useState(true)
  const [stoneShape, setStoneShape] = useState<StoneShape>('round')
  const [caratWeight, setCaratWeight] = useState(1)
  const [diamondType, setDiamondType] = useState<'natural' | 'lab-grown'>('natural')
  const [fancyLengthMm, setFancyLengthMm] = useState(FANCY_SHAPE_DEFAULTS.oval.lengthMm)
  const [fancyWidthMm, setFancyWidthMm] = useState(FANCY_SHAPE_DEFAULTS.oval.widthMm)
  const [settingType, setSettingType] = useState<SettingType>('prong')
  const [bezelCoverage, setBezelCoverage] = useState<'full' | 'half'>('full')
  const [prongCount, setProngCount] = useState<4 | 6>(4)
  const [clusterPetalCount, setClusterPetalCount] = useState(6)
  const [clusterPetalStoneMm, setClusterPetalStoneMm] = useState(2)
  const [includeHalo, setIncludeHalo] = useState(false)
  const [haloCount, setHaloCount] = useState(16)
  const [haloStoneMm, setHaloStoneMm] = useState(1.2)
  const [haloRingCount, setHaloRingCount] = useState<1 | 2 | 3>(1)
  const [includePave, setIncludePave] = useState(false)
  const [paveSettingType, setPaveSettingType] = useState<'pave' | 'channel' | 'flush' | 'bar' | 'invisible'>('pave')
  const [paveCount, setPaveCount] = useState(12)
  const [paveStoneMm, setPaveStoneMm] = useState(1.2)
  // How far around the band (per side, from the head) side stones reach —
  // was hardcoded at each builder's own 70° default until now, silently
  // crowding a large stone count into a fixed arc instead of extending
  // further around. 180° per side = a full eternity band (all the way
  // around) — a named Ring Builder type in the master list.
  const [sideSpreadDeg, setSideSpreadDeg] = useState(70)
  const [mergeSolid, setMergeSolid] = useState(false)
  // Matching Jewelry (module 14) — Matrix's own "Matching Band Rail": a
  // plain companion band, same finger size and metal, shown sitting right
  // next to the main design like a wedding band would sit against this
  // engagement ring.
  const [includeMatchingBand, setIncludeMatchingBand] = useState(false)
  const [matchingBandWidthMm, setMatchingBandWidthMm] = useState(2)
  const [includeMilgrain, setIncludeMilgrain] = useState(false)
  const [includeRope, setIncludeRope] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const viewerRef = useRef<ModelViewer3DHandle>(null)
  // Manufacturability check — Matrix's own "prepare for production"
  // concern. On-demand (a deliberate action, not continuous) since it's a
  // validation step, same as how Matrix itself exposes this.
  const [watertightResults, setWatertightResults] = useState<ReturnType<typeof checkWatertightness> | null>(null)
  // Viewing an imported file (STL/OBJ/3MF) — the other half of the
  // original CAD ask, independent of the parametric generator below.
  // Non-null overrides the parametric model in the viewer/weight/export.
  const [importedModel, setImportedModel] = useState<THREE.Object3D | null>(null)
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'stl' | 'obj' | 'glb'>('stl')
  // Content Manager (module 22) — save/load a full parameter set as a
  // named preset. Loaded fresh from localStorage each time the list is
  // opened (cheap, and keeps it correct if another tab just saved one).
  const [presets, setPresets] = useState<SavedCadPreset[]>(() => listCadPresets())
  const [presetName, setPresetName] = useState('')
  const [presetMessage, setPresetMessage] = useState<string | null>(null)

  const currentParams = (): CadDesignParams => ({
    fingerSize, widthMm, thicknessMm, profile, shankStyle, taperAmount, twists, metal,
    includeStone, stoneShape, caratWeight, diamondType, fancyLengthMm, fancyWidthMm,
    settingType, bezelCoverage, prongCount, clusterPetalCount, clusterPetalStoneMm,
    includeHalo, haloCount, haloStoneMm, includePave, paveSettingType, paveCount, paveStoneMm,
    mergeSolid, includeMilgrain, includeRope,
  })

  const applyPreset = (p: CadDesignParams) => {
    setFingerSize(p.fingerSize); setWidthMm(p.widthMm); setThicknessMm(p.thicknessMm)
    setProfile(p.profile as BandProfile); setShankStyle(p.shankStyle as typeof shankStyle)
    setTaperAmount(p.taperAmount); setTwists(p.twists); setMetal(p.metal as JewelryMetalOption)
    setIncludeStone(p.includeStone); setStoneShape(p.stoneShape as StoneShape); setCaratWeight(p.caratWeight)
    setDiamondType(p.diamondType as typeof diamondType)
    setFancyLengthMm(p.fancyLengthMm); setFancyWidthMm(p.fancyWidthMm)
    setSettingType(p.settingType as SettingType); setBezelCoverage(p.bezelCoverage as typeof bezelCoverage)
    setProngCount(p.prongCount as 4 | 6); setClusterPetalCount(p.clusterPetalCount); setClusterPetalStoneMm(p.clusterPetalStoneMm)
    setIncludeHalo(p.includeHalo); setHaloCount(p.haloCount); setHaloStoneMm(p.haloStoneMm)
    setIncludePave(p.includePave); setPaveSettingType(p.paveSettingType as typeof paveSettingType)
    setPaveCount(p.paveCount); setPaveStoneMm(p.paveStoneMm)
    setMergeSolid(p.mergeSolid); setIncludeMilgrain(p.includeMilgrain); setIncludeRope(p.includeRope)
    setImportedModel(null); setImportFileName(null) // a loaded preset is the parametric design, not an import
    setProngHeightOverridesMm({}) // per-instance overrides don't round-trip through a preset (indices may not line up)
  }

  const handleSavePreset = () => {
    const name = presetName.trim()
    if (!name) return
    const saved = saveCadPreset(name, currentParams())
    if (saved) {
      setPresets(listCadPresets())
      setPresetName('')
      setPresetMessage(`Saved "${name}".`)
    } else {
      setPresetMessage("Couldn't save — this browser's storage may be full or restricted.")
    }
  }
  const handleDeletePreset = (id: string) => {
    deleteCadPreset(id)
    setPresets(listCadPresets())
  }

  const handleImportFile = async (file: File) => {
    setImporting(true)
    setImportError(null)
    try {
      const group = await parseImportedCadFile(file)
      setImportedModel(group)
      setImportFileName(file.name)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read this file.')
    } finally {
      setImporting(false)
    }
  }
  // Grouped like Matrix's own toolbar groups (Tools/Ring-Rail, Gems, Solid/
  // Surface) instead of one long scrolling form — same controls, just not
  // all visible at once.
  const [activeTab, setActiveTab] = useState<Tab>('band')
  // First real click-to-select CAD interaction: which part of the model
  // (if any) was last clicked in the viewer — see ModelViewer3D.
  const [selectedPart, setSelectedPart] = useState<SelectedPart | null>(null)
  // First real PER-INSTANCE edit: override just ONE clicked prong's height
  // (round prong setting only, for now — the pattern this proves out can
  // extend to other repeated parts later). Keyed by prong index.
  const [prongHeightOverridesMm, setProngHeightOverridesMm] = useState<Record<number, number>>({})
  const [excludedPaveIndices, setExcludedPaveIndices] = useState<number[]>([])
  const [excludedHaloIndices, setExcludedHaloIndices] = useState<number[]>([])
  // Selecting a part jumps to whichever tab actually controls it — bridges
  // "I clicked this" to "here's how to change it" even though the controls
  // are still per-feature (every prong, say) rather than per-instance yet.
  const handleSelectPart = (part: SelectedPart | null) => {
    setSelectedPart(part)
    if (part && PART_TAB[part.name]) setActiveTab(PART_TAB[part.name])
  }

  const innerDiameterMm = usSizeToDiameterMm(fingerSize)
  const stoneDiameterMm = roundDiameterMmFromCarat(caratWeight)
  // The one part this app currently lets you edit AS the specific clicked
  // instance, rather than as "every part of this type" — proves out the
  // pattern for a future pass over the other repeated parts (pavé stones,
  // halo stones, etc.).
  const canEditProngInstance = selectedPart?.name === 'Prong' && selectedPart.instanceIndex !== undefined
    && stoneShape === 'round' && settingType === 'prong'
  // Second per-instance case, this time a REMOVAL rather than an edit —
  // pavé only for now (channel/flush/halo don't have excludeIndices wired
  // in yet, tracked in the roadmap memory).
  const canRemovePaveInstance = selectedPart?.name === 'Pavé stone' && selectedPart.instanceIndex !== undefined
    && paveSettingType === 'pave'
  const canRemoveHaloInstance = selectedPart?.name === 'Halo stone' && selectedPart.instanceIndex !== undefined
    && haloRingCount === 1
  // Tension setting cuts the band itself, so it needs its own band geometry
  // (see ringGeometry.ts) — only meaningful for a round stone with a
  // center stone actually present.
  const tensionActive = includeStone && stoneShape === 'round' && settingType === 'tension'
  // Round center stone only for now — see the roadmap memory. Halo doesn't
  // make sense around a tension-set stone (there's no gallery for it to
  // ring, and it would sit right over the band's own gap) or an illusion
  // setting (the faceted skirt already fills that same "make it look
  // bigger" visual role, and would overlap it).
  const haloEligible = includeHalo && stoneShape === 'round' && !tensionActive && settingType !== 'illusion'
  const outerRadiusMm = innerDiameterMm / 2 + thicknessMm
  const tensionGapDeg = tensionActive ? tensionGapDegForStone(stoneDiameterMm, outerRadiusMm) : 0

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
    const bandParamsBase = { fingerSize, widthMm, thicknessMm, profile }
    const band = new THREE.Mesh(
      tensionActive
        ? buildTensionBandGeometry(bandParamsBase, tensionGapDeg)
        : shankStyle === 'tapered'
          ? buildTaperedBandGeometry({ ...bandParamsBase, taperAmount })
          : shankStyle === 'twisted'
            ? buildTwistedBandGeometry({ ...bandParamsBase, twists })
            : buildRingBandGeometry(bandParamsBase),
    )
    band.userData.partName = 'Band'
    group.add(band)
    if (includeMilgrain) group.add(buildMilgrainEdges({}, bandParamsBase))
    if (includeRope) group.add(buildRopeEdge({}, bandParamsBase))
    if (includeStone) {
      if (tensionActive) {
        const tension = buildTensionSetting({ stoneDiameterMm, gapDeg: tensionGapDeg }, bandParamsBase)
        group.add(tension)
      } else {
        const head = stoneShape === 'round'
          ? (settingType === 'bezel'
              ? buildBezelHeadGroup({ stoneDiameterMm, coverageDeg: bezelCoverage === 'half' ? 180 : 360 })
              : settingType === 'cluster'
                ? buildClusterHeadGroup({ centerStoneDiameterMm: stoneDiameterMm, petalCount: clusterPetalCount, petalStoneDiameterMm: clusterPetalStoneMm })
                : settingType === 'illusion'
                  ? buildIllusionHeadGroup({ stoneDiameterMm })
                  : buildStoneHeadGroup({ stoneDiameterMm, prongCount, prongHeightOverridesMm }))
          : buildFancyStoneHeadGroup({ shape: stoneShape, lengthMm: fancyLengthMm, widthMm: fancyWidthMm, prongCount })
        attachHeadToBand(head, bandParamsBase)
        group.add(head)
      }

      if (haloEligible) {
        // Double/triple halo (Matrix's own named variants): each extra
        // ring stacks outside the previous one's own orbit + stone radius
        // + a small gap, via haloOrbitRadiusMm — no new geometry primitive
        // needed, just composing buildHaloGroup more than once.
        let orbitRadiusMm = haloOrbitRadiusMm(stoneDiameterMm, haloStoneMm)
        for (let ring = 0; ring < haloRingCount; ring++) {
          const halo = buildHaloGroup({
            stoneDiameterMm, haloCount, haloStoneDiameterMm: haloStoneMm, orbitRadiusMm,
            excludeIndices: ring === 0 ? excludedHaloIndices : undefined,
          })
          attachHeadToBand(halo, bandParamsBase)
          group.add(halo)
          orbitRadiusMm += haloStoneMm + 0.4
        }
      }
    }
    if (includePave) {
      const bandParams = { fingerSize, widthMm, thicknessMm, profile }
      const sideStones = paveSettingType === 'channel'
        ? buildChannelSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg }, bandParams)
        : paveSettingType === 'flush'
          ? buildFlushSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg }, bandParams)
          : paveSettingType === 'bar'
            ? buildBarSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg }, bandParams)
            : paveSettingType === 'invisible'
              ? buildInvisibleSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg }, bandParams)
              : buildPaveRow({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices }, bandParams)
      group.add(sideStones)
    }
    if (includeMatchingBand) {
      // Sits right next to the main band, offset along the SAME axis the
      // band's own profile uses for its width (Y, in this local space) —
      // the real-world equivalent of a wedding band sitting flush against
      // an engagement ring on the same finger.
      const matchingBand = new THREE.Mesh(buildRingBandGeometry({ fingerSize, widthMm: matchingBandWidthMm, thicknessMm, profile }))
      matchingBand.position.y = widthMm / 2 + matchingBandWidthMm / 2 + 0.3
      matchingBand.userData.partName = 'Matching band'
      group.add(matchingBand)
    }
    return group
  }, [fingerSize, widthMm, thicknessMm, profile, shankStyle, taperAmount, twists, includeMilgrain, includeRope, includeStone, stoneShape, settingType, bezelCoverage, stoneDiameterMm, prongCount, prongHeightOverridesMm, clusterPetalCount, clusterPetalStoneMm, tensionActive, tensionGapDeg, fancyLengthMm, fancyWidthMm, haloEligible, haloCount, haloStoneMm, haloRingCount, excludedHaloIndices, includePave, paveSettingType, paveCount, paveStoneMm, sideSpreadDeg, excludedPaveIndices, includeMatchingBand, matchingBandWidthMm])

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
      const solid = new THREE.Mesh(unioned)
      solid.userData.partName = 'Merged solid'
      merged.add(solid)
      for (const stone of extractStoneMeshes(model)) merged.add(stone)
      return { displayModel: merged, mergeError: null }
    } catch (err) {
      return { displayModel: model, mergeError: err instanceof Error ? err.message : 'Boolean union failed on this geometry.' }
    }
  }, [model, mergeSolid])

  // What the viewer/weight-estimate/export actually operate on — the
  // imported file when one's loaded, otherwise the parametric design.
  const viewModel = importedModel ?? displayModel

  // Three "reset some state when a dependency changes" cases, all using
  // React's own recommended pattern (adjust state DURING render by
  // comparing against a tracked previous value) instead of a useEffect —
  // setState synchronously inside an effect body causes an avoidable extra
  // commit/paint round-trip; this bails out of the stale render instead.
  const [watertightForModel, setWatertightForModel] = useState<typeof viewModel | null>(null)
  if (watertightForModel !== viewModel) {
    setWatertightForModel(viewModel)
    if (watertightResults !== null) setWatertightResults(null)
  }
  const paveExclusionKey = `${paveCount}:${paveSettingType}`
  const [paveExclusionKeySeen, setPaveExclusionKeySeen] = useState(paveExclusionKey)
  if (paveExclusionKeySeen !== paveExclusionKey) {
    setPaveExclusionKeySeen(paveExclusionKey)
    setExcludedPaveIndices([])
  }
  const [haloCountSeen, setHaloCountSeen] = useState(haloCount)
  if (haloCountSeen !== haloCount) {
    setHaloCountSeen(haloCount)
    setExcludedHaloIndices([])
  }

  // Weight & cost estimate — volume comes straight off the displayed
  // geometry, so it always matches what's on screen (and in the STL). Once
  // merged, this is exact (no more overlap double-counting). For an
  // imported file, this assumes the WHOLE thing is one solid piece of the
  // selected metal — disclosed in the UI, since an arbitrary import could
  // be multi-material or already include gems this app has no way to tell
  // apart from the metal.
  const volumeMm3 = useMemo(() => computeVolumeMm3(viewModel), [viewModel])
  const weightGrams = estimateWeightGrams(volumeMm3, METAL_DENSITY_G_PER_CM3[metal])
  const pricePerGram = config.metalPriceMap[metal] ?? 0
  const estimatedMetalCost = weightGrams * pricePerGram

  // Connects the center stone to the app's REAL diamond price sheet
  // (config.diamondSizes — the same one Quote Builder prices from) instead
  // of only ever estimating metal. That sheet is keyed by discrete size
  // buckets (e.g. "0.50", "1.00"), not a free-typed carat, so this finds
  // the closest listed bucket to whatever caratWeight is dialed in here —
  // an honest approximation, disclosed as such in the UI, not a scale/
  // interpolation (diamond price per carat isn't linear, so scaling a
  // neighboring bucket's price would be actively misleading).
  const effectiveCaratWeight = stoneShape === 'round' ? caratWeight : estimateFancyCaratWeight(stoneShape, fancyLengthMm, fancyWidthMm)
  const nearestDiamondSize = useMemo(() => {
    if (!includeStone) return undefined
    const wantType = diamondType === 'lab-grown' ? 'LAB' : 'NATURAL'
    let best: typeof config.diamondSizes[number] | undefined
    let bestDiff = Infinity
    for (const row of config.diamondSizes) {
      if (row.stoneType !== wantType) continue
      const rowCt = Number(row.sizeKey)
      if (!Number.isFinite(rowCt)) continue
      const diff = Math.abs(rowCt - effectiveCaratWeight)
      if (diff < bestDiff) { bestDiff = diff; best = row }
    }
    return best
  }, [config, includeStone, diamondType, effectiveCaratWeight])
  const estimatedStoneCost = nearestDiamondSize?.basePrice ?? 0
  const estimatedTotalCost = estimatedMetalCost + estimatedStoneCost

  // Module 21 in the roadmap's master list ("export STL/OBJ/3MF/STEP/3DM/
  // GLB/USDZ") — STL was the only option until now. OBJ and GLB (glTF's
  // binary form) are both straightforward with three.js's own exporters;
  // STEP/3DM/USDZ would each need their own heavier library, not done here.
  const baseFilename = () => {
    const stoneTag = includeStone ? (stoneShape === 'round' ? `-${caratWeight}ct-round-${settingType}` : `-${stoneShape}`) : ''
    return importedModel
      ? (importFileName?.replace(/\.[^.]+$/, '') || 'imported')
      : `ring-size${fingerSize}-w${widthMm}mm${stoneTag}`
  }
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  const downloadModel = () => {
    const name = baseFilename()
    if (exportFormat === 'stl') {
      const stl = new STLExporter().parse(viewModel, { binary: false })
      triggerDownload(new Blob([stl], { type: 'model/stl' }), `${name}.stl`)
    } else if (exportFormat === 'obj') {
      const obj = new OBJExporter().parse(viewModel)
      triggerDownload(new Blob([obj], { type: 'text/plain' }), `${name}.obj`)
    } else {
      new GLTFExporter().parse(
        viewModel,
        result => {
          const blob = result instanceof ArrayBuffer
            ? new Blob([result], { type: 'model/gltf-binary' })
            : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' })
          triggerDownload(blob, `${name}.glb`)
        },
        err => setImportError(err instanceof Error ? `Couldn't export as GLB: ${err.message}` : "Couldn't export as GLB."),
        { binary: true },
      )
    }
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
            Band (plain, tapered — wider at the head — or twisted-ribbon), center stone (round — prong, bezel,
            cluster, tension or illusion — oval, cushion, princess, marquise
            or pear),
            side stones (pavé, channel, flush, bar or invisible), optional milgrain or twisted-rope edging, an optional
            matching band,
            and solid/export, grouped into tabs the
            way Matrix groups its own tools (Ring Rail, Gems, Milgrain, Parametric Boolean) instead of one long form.
            Click any part of the model in the viewer to select and identify it — click a single prong and you can
            edit its height on its own, a first real per-instance edit, not just a global slider. Import an existing
            STL/OBJ/3MF file (Solid tab) to view it right here too — the other half of the original ask. The center
            stone (every shape) is now a real faceted crown+pavilion, not a placeholder — a simplified "single cut"
            facet count, not full ideal-cut precision. This is not a Matrix/RhinoGold replacement yet — melee (pavé/
            halo/channel/etc.) and cluster petals still use simple bead proxies. Building toward full parity step by step.
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Card className="rounded-[30px] border border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <CardContent className="space-y-5 p-6 sm:p-7">
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <span className="text-sm font-semibold text-slate-900">Presets</span>
              <p className="text-[11px] text-slate-400">
                Save/reuse the whole design as a named preset instead of re-entering every number — saved to THIS
                browser only (not synced to your account or other devices yet).
              </p>
              <div className="flex gap-2">
                <input type="text" value={presetName} onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSavePreset() }}
                  placeholder="Name this design…" className={inputCls} />
                <button type="button" onClick={handleSavePreset} disabled={!presetName.trim()}
                  className="shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                  Save
                </button>
              </div>
              {presetMessage && <p className="text-[11px] text-slate-500">{presetMessage}</p>}
              {presets.length > 0 && (
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {presets.map(p => (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs">
                      <span className="truncate">{p.name}</span>
                      <span className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => applyPreset(p.params)}
                          className="rounded-lg border border-slate-300 px-2 py-0.5 font-semibold hover:bg-slate-50">Load</button>
                        <button type="button" onClick={() => handleDeletePreset(p.id)}
                          className="rounded-lg border border-slate-300 px-2 py-0.5 font-semibold text-rose-600 hover:bg-rose-50">✕</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-slate-100 p-1">
              {([
                ['band', 'Band'],
                ['center', 'Center stone'],
                ['side', 'Side stones'],
                ['solid', 'Solid'],
              ] as const).map(([tab, label]) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            {selectedPart && PART_TAB[selectedPart.name] === activeTab && (
              canEditProngInstance ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <div className="flex items-center gap-2">
                    <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Selected <strong>Prong #{(selectedPart.instanceIndex ?? 0) + 1}</strong> — editing just this one,
                      independent of the others.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="range" min={stoneDiameterMm * 0.25} max={stoneDiameterMm * 1.1} step={0.1}
                      value={prongHeightOverridesMm[selectedPart.instanceIndex ?? 0] ?? defaultProngHeightMm(stoneDiameterMm)}
                      onChange={e => setProngHeightOverridesMm(prev => ({ ...prev, [selectedPart.instanceIndex ?? 0]: Number(e.target.value) }))}
                      className="flex-1" />
                    <span className="w-14 shrink-0 text-right font-mono">
                      {(prongHeightOverridesMm[selectedPart.instanceIndex ?? 0] ?? defaultProngHeightMm(stoneDiameterMm)).toFixed(1)}mm
                    </span>
                    {selectedPart.instanceIndex !== undefined && prongHeightOverridesMm[selectedPart.instanceIndex] !== undefined && (
                      <button type="button"
                        onClick={() => setProngHeightOverridesMm(prev => {
                          const next = { ...prev }
                          delete next[selectedPart.instanceIndex!]
                          return next
                        })}
                        className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              ) : canRemovePaveInstance ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">
                    Selected <strong>Pavé stone #{(selectedPart.instanceIndex ?? 0) + 1}</strong>.
                  </span>
                  <button type="button"
                    onClick={() => setExcludedPaveIndices(prev => [...prev, selectedPart.instanceIndex!])}
                    className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                    Remove this stone
                  </button>
                </div>
              ) : canRemoveHaloInstance ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">
                    Selected <strong>Halo stone #{(selectedPart.instanceIndex ?? 0) + 1}</strong>.
                  </span>
                  <button type="button"
                    onClick={() => setExcludedHaloIndices(prev => [...prev, selectedPart.instanceIndex!])}
                    className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                    Remove this stone
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Selected <strong>{selectedPart.name}</strong> — controlled from the settings below. (Applies to every
                    {' '}{selectedPart.name.toLowerCase()} in this design, not just the one you clicked, for now — click
                    empty space in the model to deselect.)
                  </span>
                </div>
              )
            )}

            {activeTab === 'band' && (
              <div className="space-y-5">
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
                  <label className={labelCls}>Shank style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['plain', 'tapered', 'twisted'] as const).map(s => (
                      <button key={s} type="button" onClick={() => setShankStyle(s)} disabled={tensionActive}
                        className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition disabled:cursor-not-allowed disabled:opacity-50 ${shankStyle === s ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  {tensionActive && (
                    <p className="mt-1 text-[11px] text-slate-400">Not available with a tension-set band (it already replaces the full band).</p>
                  )}
                  {shankStyle === 'tapered' && !tensionActive && (
                    <div className="mt-2">
                      <label className={labelCls}>{Math.round(taperAmount * 100)}% wider at the head</label>
                      <input type="range" min={0.05} max={0.5} step={0.05} value={taperAmount}
                        onChange={e => setTaperAmount(Number(e.target.value))} className="w-full" />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Matrix's Ring Rail/Profile Sweep tools, generalized: wider at the head, narrower at the back.
                        Doesn't change total metal weight — just redistributes it.
                      </p>
                    </div>
                  )}
                  {shankStyle === 'twisted' && !tensionActive && (
                    <div className="mt-2">
                      <label className={labelCls}>{twists} full twist{twists === 1 ? '' : 's'} around the band</label>
                      <input type="range" min={0.5} max={4} step={0.5} value={twists}
                        onChange={e => setTwists(Number(e.target.value))} className="w-full" />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Matrix's own "Twist" transform, applied to the shank — a classic twisted-ribbon band. The
                        band's own solid twists (different from the Rope edging above, which adds strands ON TOP of a
                        plain band).
                      </p>
                    </div>
                  )}
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

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <span>
                    <span className="text-sm font-semibold text-slate-900">Milgrain edging</span>
                    <p className="mt-0.5 text-[11px] text-slate-400">Matrix's own "Milgrain" tool — a beaded texture along both edges of the band.</p>
                  </span>
                  <input type="checkbox" checked={includeMilgrain} onChange={e => setIncludeMilgrain(e.target.checked)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                </label>

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <span>
                    <span className="text-sm font-semibold text-slate-900">Rope / twisted wire</span>
                    <p className="mt-0.5 text-[11px] text-slate-400">Matrix's own "Rope" tool — two twisted strands wound around the band's edge.</p>
                  </span>
                  <input type="checkbox" checked={includeRope} onChange={e => setIncludeRope(e.target.checked)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                </label>
              </div>
            )}

            {activeTab === 'center' && (
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

                    {stoneShape === 'round' && (
                      <div>
                        <label className={labelCls}>Carat weight</label>
                        <input type="number" min={0.1} max={10} step={0.05} value={caratWeight}
                          onChange={e => setCaratWeight(Math.max(0.1, Number(e.target.value) || 0.1))} className={inputCls} />
                        <p className="mt-1 text-[11px] text-slate-400">≈ {stoneDiameterMm.toFixed(2)} mm diameter</p>
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Diamond type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['natural', 'lab-grown'] as const).map(t => (
                          <button key={t} type="button" onClick={() => setDiamondType(t)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${diamondType === t ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            {t === 'lab-grown' ? 'Lab-grown' : 'Natural'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {stoneShape === 'round' && (
                      <div>
                        <label className={labelCls}>Setting type</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['prong', 'bezel', 'cluster', 'tension', 'illusion'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setSettingType(t)}
                              className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${settingType === t ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {stoneShape === 'round' && settingType === 'bezel' && (
                      <div>
                        <label className={labelCls}>Bezel coverage</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['full', 'half'] as const).map(c => (
                            <button key={c} type="button" onClick={() => setBezelCoverage(c)}
                              className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize transition ${bezelCoverage === c ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                              {c === 'half' ? 'Half bezel' : 'Full bezel'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {stoneShape === 'round' && settingType === 'cluster' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Petal count</label>
                          <input type="number" min={4} max={10} step={1} value={clusterPetalCount}
                            onChange={e => setClusterPetalCount(Math.max(4, Number(e.target.value) || 4))} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Petal stone size (mm)</label>
                          <input type="number" min={0.8} max={5} step={0.1} value={clusterPetalStoneMm}
                            onChange={e => setClusterPetalStoneMm(Math.max(0.8, Number(e.target.value) || 0.8))} className={inputCls} />
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
                            <div className="col-span-2">
                              <label className={labelCls}>Halo rings</label>
                              <div className="grid grid-cols-3 gap-2">
                                {([1, 2, 3] as const).map(n => (
                                  <button key={n} type="button" onClick={() => setHaloRingCount(n)}
                                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${haloRingCount === n ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                                    {n === 1 ? 'Single' : n === 2 ? 'Double' : 'Triple'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {includeHalo && excludedHaloIndices.length > 0 && (
                          <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                            <span>{excludedHaloIndices.length} halo stone{excludedHaloIndices.length === 1 ? '' : 's'} removed individually.</span>
                            <button type="button" onClick={() => setExcludedHaloIndices([])}
                              className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50">
                              Restore all
                            </button>
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
            )}

            {activeTab === 'side' && (
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
                      <div className="grid grid-cols-3 gap-2">
                        {([['pave', 'Pavé'], ['channel', 'Channel'], ['flush', 'Flush'], ['bar', 'Bar'], ['invisible', 'Invisible']] as const).map(([t, label]) => (
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
                    <div>
                      <label className={labelCls}>
                        Reach per side — {sideSpreadDeg}° {sideSpreadDeg >= 175 ? '(eternity — all the way around)' : 'from the head'}
                      </label>
                      <input type="range" min={20} max={179} step={1} value={sideSpreadDeg}
                        onChange={e => setSideSpreadDeg(Number(e.target.value))} className="w-full" />
                      <button type="button" onClick={() => setSideSpreadDeg(179)}
                        className="mt-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-semibold hover:bg-slate-50">
                        Full eternity band
                      </button>
                      <p className="mt-1 text-[11px] text-slate-400">
                        How far around the band each side reaches, from the head — was fixed at 70° regardless of
                        stone count until now, silently crowding a large count into that arc instead of extending
                        further. "Eternity" (module 2's Ring Builder types) is just this maxed out.
                      </p>
                    </div>
                    {paveSettingType === 'pave' && excludedPaveIndices.length > 0 && (
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                        <span>{excludedPaveIndices.length} stone{excludedPaveIndices.length === 1 ? '' : 's'} removed individually.</span>
                        <button type="button" onClick={() => setExcludedPaveIndices([])}
                          className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50">
                          Restore all
                        </button>
                      </div>
                    )}
                    {paveSettingType === 'pave' && (
                      <p className="text-[11px] text-slate-400">
                        Click any individual pavé stone in the viewer to remove just that one — a per-instance edit,
                        same pattern as clicking a single prong.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'solid' && (
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

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">Check model</span>
                    <button type="button" onClick={() => setWatertightResults(checkWatertightness(viewModel))}
                      className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
                      Run check
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    A real manufacturability check: every part should be a genuinely closed/watertight solid before
                    you trust an export — the exact class of bug this app itself hit once (a band missing a face,
                    silently under-computing weight by ~17%, fixed 2026-09-12).
                  </p>
                  {watertightResults && (
                    <div className="rounded-xl bg-white px-3 py-2 text-xs">
                      {watertightResults.every(r => r.watertight) ? (
                        <p className="font-semibold text-emerald-700">✓ All {watertightResults.length} part{watertightResults.length === 1 ? '' : 's'} are watertight.</p>
                      ) : (
                        <>
                          <p className="font-semibold text-rose-700">
                            {watertightResults.filter(r => !r.watertight).length} of {watertightResults.length} parts are NOT watertight:
                          </p>
                          <ul className="mt-1 list-disc pl-4 text-slate-600">
                            {watertightResults.filter(r => !r.watertight).map((r, i) => <li key={i}>{r.partName}</li>)}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-sm font-semibold text-slate-900">Matching band</span>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Matrix's own "Matching Band Rail" — a plain companion band, same size and metal, shown sitting
                        right next to this design like a wedding band would.
                      </p>
                    </span>
                    <input type="checkbox" checked={includeMatchingBand} onChange={e => setIncludeMatchingBand(e.target.checked)}
                      className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                  </label>
                  {includeMatchingBand && (
                    <div>
                      <label className={labelCls}>Matching band width (mm)</label>
                      <input type="number" min={1} max={6} step={0.1} value={matchingBandWidthMm}
                        onChange={e => setMatchingBandWidthMm(Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <span className="text-sm font-semibold text-slate-900">Import a file to view</span>
                  <p className="text-[11px] text-slate-400">
                    View an existing STL, OBJ, or 3MF export (a real Matrix/Rhino/other CAD file) right here — the
                    other half of the original ask, independent of the parametric design above. (.3dm, Rhino's own
                    format, isn't supported yet.)
                  </p>
                  {importedModel ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                      <span className="truncate">Viewing: <strong>{importFileName}</strong></span>
                      <button type="button" onClick={() => { setImportedModel(null); setImportFileName(null); setImportError(null) }}
                        className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50">
                        Back to design
                      </button>
                    </div>
                  ) : (
                    <input type="file" accept=".stl,.obj,.3mf"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
                      className="block w-full text-xs text-slate-600" disabled={importing} />
                  )}
                  {importing && <p className="text-[11px] text-slate-400">Reading file…</p>}
                  {importError && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">{importError}</p>
                  )}
                </div>
              </div>
            )}

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
                at the same $/g the rest of the app prices from. {importedModel
                  ? "Assumes the whole imported file is one solid piece of this metal — this app can't tell a gem or a different material apart from the metal in a file it didn't build."
                  : mergeSolid && !mergeError
                    ? 'Metal only, gems excluded. Merged into one solid, so this is exact (no more overlap double-counting).'
                    : 'Metal only, gems excluded. Band+head overlap slightly (not merged), so this reads a little high rather than low.'}
              </p>
            </div>

            {nearestDiamondSize && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-sky-700">
                  <Scale className="h-3.5 w-3.5" /> Estimated center-stone cost
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-semibold text-slate-900">${estimatedStoneCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  <span className="text-sm text-slate-500">{nearestDiamondSize.label}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  From the app's own diamond price sheet (the same one Quote Builder prices from) — closest LISTED size
                  to {effectiveCaratWeight.toFixed(2)}ct{stoneShape !== 'round'
                    ? ` (estimated from this ${fancyLengthMm}×${fancyWidthMm}mm footprint — a standard trade approximation, not a real stone's actual measured weight)`
                    : ''}, not an interpolation (diamond price per carat isn't linear, so scaling a neighboring size's
                  price would be misleading). Doesn't account for clarity/color/cut — use Quote Builder for an exact price.
                </p>
                <div className="mt-2 flex items-baseline justify-between border-t border-sky-200 pt-2 text-sm">
                  <span className="font-semibold text-slate-700">Estimated total (metal + stone)</span>
                  <strong className="text-slate-900">${estimatedTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <select value={exportFormat} onChange={e => setExportFormat(e.target.value as 'stl' | 'obj' | 'glb')}
                className={`${inputCls} w-28 shrink-0 uppercase`}>
                <option value="stl">STL</option>
                <option value="obj">OBJ</option>
                <option value="glb">GLB</option>
              </select>
              <button type="button" onClick={downloadModel}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: 'var(--theme-primary)' }}>
                <Download className="h-4 w-4" /> Download
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Sizing uses a linear approximation of the standard US chart, and carat→diameter the standard
              6.5×∛carat estimate — cross-check both against your own charts before sending anything to production.
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[30px] border border-slate-200 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <div className="relative">
            <ModelViewer3D ref={viewerRef} object={viewModel} color={METAL_COLORS[metal]} onSelectPart={handleSelectPart}
              autoRotate={autoRotate} wireframe={wireframe} className="h-[420px] w-full sm:h-[520px]" />
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-xl bg-slate-900/80 px-3 py-2 text-xs text-white shadow-sm backdrop-blur">
              <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              {selectedPart ? (
                <span>
                  <strong className="font-semibold">{selectedPart.name}</strong>
                  <span className="text-slate-300">{selectedPart.isStone ? ' · gem · ' : ' · metal · '}
                    {selectedPart.dimensionsMm.x.toFixed(1)}×{selectedPart.dimensionsMm.y.toFixed(1)}×{selectedPart.dimensionsMm.z.toFixed(1)}mm
                  </span>
                </span>
              ) : (
                <span className="text-slate-300">Click a part of the model to select it</span>
              )}
            </div>
            <div className="absolute right-3 top-3 flex items-center gap-1.5">
              <button type="button" onClick={() => setWireframe(v => !v)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition ${wireframe ? 'bg-amber-400 text-slate-900' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}>
                Wireframe
              </button>
              <button type="button" onClick={() => setAutoRotate(v => !v)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition ${autoRotate ? 'bg-amber-400 text-slate-900' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}>
                <RotateCw className={`h-3.5 w-3.5 shrink-0 ${autoRotate ? 'animate-spin' : ''}`} /> Turntable
              </button>
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              {(['front', 'top', 'side', 'perspective'] as const satisfies readonly CameraView[]).map(view => (
                <button key={view} type="button" onClick={() => viewerRef.current?.setView(view)}
                  className="rounded-xl bg-slate-900/80 px-2.5 py-1.5 text-[11px] font-semibold capitalize text-white shadow-sm backdrop-blur transition hover:bg-slate-900">
                  {view}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}

export default CadDesignPage
