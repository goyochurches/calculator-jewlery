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
  buildStoneHeadGroup, buildBezelHeadGroup, buildClusterHeadGroup, buildHaloGroup, haloOrbitRadiusMm, attachHeadToBand, roundDiameterMmFromCarat, caratFromRoundDiameterMm, estimateFancyCaratWeight,
  buildSignetTopGroup, sanitizeForEngraving,
  defaultProngHeightMm,
  buildFancyStoneHeadGroup, type FancyStoneShape,
  buildPaveRow, buildChannelSetting, buildFlushSetting, buildBarSetting, buildInvisibleSetting,
  buildTensionBandGeometry, buildTensionSetting, tensionGapDegForStone,
  buildTaperedBandGeometry, buildTwistedBandGeometry, buildSplitShankGeometry, buildCathedralBandGeometry,
  buildIllusionHeadGroup,
  buildMilgrainEdges, buildRopeEdge, buildFluteRibs, buildGalleryWireGroup, buildBandTextGroup, estimateBandTextWidthMm,
  buildPatternMotifs, type PatternMotif,
  buildLogoGroup,
  unionMetalParts, extractStoneMeshes, checkWatertightness,
  checkMinimumWallThickness, defaultProngDiameterMm, defaultGalleryTubeMm, RECOMMENDED_MIN_WALL_MM,
  checkProngClearance,
  scaleForCastingShrinkage, CASTING_SHRINKAGE_PERCENT,
  computeVolumeMm3, estimateWeightGrams, METAL_DENSITY_G_PER_CM3,
} from '@/lib/ringGeometry'
import { parseImportedCadFile } from '@/lib/cadImport'
import { listCadPresets, saveCadPreset, deleteCadPreset, type CadDesignParams, type SavedCadPreset } from '@/lib/cadPresets'

type SettingType = 'prong' | 'bezel' | 'cluster' | 'tension' | 'illusion'

type StoneShape = 'round' | FancyStoneShape

const STONE_SHAPE_LABELS: Record<StoneShape, string> = {
  round: 'Round', oval: 'Oval', cushion: 'Cushion', princess: 'Princess', marquise: 'Marquise', pear: 'Pear',
  emerald: 'Emerald', asscher: 'Asscher', radiant: 'Radiant',
  hexagon: 'Hexagon', lozenge: 'Lozenge', trapezoid: 'Trapezoid', heart: 'Heart', trillion: 'Trillion',
}
// Reasonable starting length×width (mm) per fancy shape, editable afterward.
const FANCY_SHAPE_DEFAULTS: Record<FancyStoneShape, { lengthMm: number; widthMm: number }> = {
  oval: { lengthMm: 8, widthMm: 6 },
  cushion: { lengthMm: 7, widthMm: 7 },
  princess: { lengthMm: 6.5, widthMm: 6.5 },
  marquise: { lengthMm: 10, widthMm: 5 },
  pear: { lengthMm: 9, widthMm: 6 },
  emerald: { lengthMm: 8, widthMm: 6 },
  asscher: { lengthMm: 6.5, widthMm: 6.5 },
  radiant: { lengthMm: 7.5, widthMm: 6 },
  hexagon: { lengthMm: 8, widthMm: 6 },
  lozenge: { lengthMm: 9, widthMm: 5 },
  trapezoid: { lengthMm: 6, widthMm: 6 },
  heart: { lengthMm: 9, widthMm: 8 },
  trillion: { lengthMm: 8, widthMm: 8 },
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
  'Side stone head': 'center', 'Shank strand': 'band', 'Signet top': 'center', 'Engraved text': 'center',
  'Milgrain bead': 'band', 'Rope strand': 'band', 'Flute rib': 'band', 'Gallery wire': 'center', 'Band text': 'band',
  'Side panel': 'solid', 'Side panel text': 'solid', 'Pattern motif': 'band', 'Logo': 'solid',
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
  const [shankStyle, setShankStyle] = useState<'plain' | 'tapered' | 'twisted' | 'split' | 'cathedral'>('plain')
  const [splitStrandCount, setSplitStrandCount] = useState<2 | 3>(2)
  const [taperAmount, setTaperAmount] = useState(0.3)
  const [twists, setTwists] = useState(1)
  const [metal, setMetal] = useState<JewelryMetalOption>('gold-18k-yellow')
  const [includeStone, setIncludeStone] = useState(true)
  const [stoneShape, setStoneShape] = useState<StoneShape>('round')
  const [caratWeight, setCaratWeight] = useState(1)
  // Ring TYPE (module 2 in the roadmap's master list) — three-stone/
  // five-stone are Matrix-named ring types, not a separate setting: extra
  // smaller round prong heads flanking the center stone, sharing the same
  // band. 0 = solitaire (the only type this app had until now).
  const [sideStoneCount, setSideStoneCount] = useState<0 | 2 | 4>(0)
  const [sideStoneCaratWeight, setSideStoneCaratWeight] = useState(0.25)
  // Signet ring — a named Ring Builder TYPE with NO gemstone at all: a
  // wide flat top instead. Mutually exclusive with the center stone.
  const [includeSignetTop, setIncludeSignetTop] = useState(false)
  const [signetShape, setSignetShape] = useState<'oval' | 'cushion' | 'princess'>('oval')
  const [signetWidthMm, setSignetWidthMm] = useState(12)
  const [signetLengthMm, setSignetLengthMm] = useState(14)
  // Engraving (module 11 — "Text on Curve"/"Text Objects"), scoped to
  // the signet's genuinely flat top face for now (a general curved-band
  // version is a separate, harder future step). Raw user input, run
  // through sanitizeForEngraving only at BUILD time (in ringGeometry.ts)
  // — kept here for a live "here's what will actually render" preview.
  const [engraveText, setEngraveText] = useState('')
  // Ring labor fee (module 17, Pricing Engine) — a real flat fee per tier,
  // read directly from the app's own `config.ringLaborTiers` (the SAME
  // tiers Quote Builder itself uses) rather than guessing tier names/
  // fees. Deliberately opt-in (not a guessed default tier), and
  // deliberately does NOT add a "CAD design labor" fee alongside it —
  // Quote Builder's own pricing hardcodes that to $0 today (see the CAD
  // roadmap memory's deferral note), so inventing one here would be
  // inconsistent with the rest of the app.
  const [includeRingLaborFee, setIncludeRingLaborFee] = useState(false)
  const [ringLaborTierKey, setRingLaborTierKey] = useState('')
  // Setting labor fee — the OTHER real labor line Quote Builder tracks
  // (config.setterMap, per-stone SETTING labor, distinct from ring
  // labor/casting). Previously deferred: this page's own settingType/
  // paveSettingType strings don't line up with the real setterType keys
  // (only a small subset was ever inspectable — customer_melee/channel/
  // bezel/fancy/center), so rather than guess a mapping, this reads the
  // real `config.setters` list directly (same "let the user pick from
  // the actual configured options" pattern ring labor already uses) —
  // no guessing needed. Quantity defaults to this design's own REAL
  // stone count (see totalStoneCount below), not a guess either.
  const [includeSetterFee, setIncludeSetterFee] = useState(false)
  const [setterTypeKey, setSetterTypeKey] = useState('')
  const [setterQuantityOverride, setSetterQuantityOverride] = useState<number | null>(null)
  const [diamondType, setDiamondType] = useState<'natural' | 'lab-grown'>('natural')
  const [fancyLengthMm, setFancyLengthMm] = useState(FANCY_SHAPE_DEFAULTS.oval.lengthMm)
  const [fancyWidthMm, setFancyWidthMm] = useState(FANCY_SHAPE_DEFAULTS.oval.widthMm)
  // Mirror transform (module: Transforms — Bend/Mirror/Polar Array/Taper/
  // Twist in Matrix's own toolbar). First concrete use: a pear's point can
  // face either way around the band — pear, trapezoid, heart and
  // trillion are the only supported fancy shapes NOT symmetric about
  // their own length axis, so mirroring changes nothing for every other
  // shape.
  const [pointDirection, setPointDirection] = useState<'up' | 'down'>('up')
  const [settingType, setSettingType] = useState<SettingType>('prong')
  const [bezelCoverage, setBezelCoverage] = useState<'full' | 'half'>('full')
  // Round stones support any prong count (the geometry loop is generic by
  // angle); fancy shapes still snap to 4 or 6 (their prong seats are
  // anchored to shape-specific landmark points — corners/tips — not evenly
  // spaced by angle, see fancyProngPoints's own doc comment) — closes the
  // "custom prong count beyond 4/6" gap noted in the roadmap, for round.
  const [prongCount, setProngCount] = useState(4)
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
  // Multi-band (module 2 in the roadmap's master list) — more than one
  // companion band stacked side by side, all sharing the toggle above.
  const [matchingBandCount, setMatchingBandCount] = useState<1 | 2 | 3>(1)
  const [includeMilgrain, setIncludeMilgrain] = useState(false)
  const [includeRope, setIncludeRope] = useState(false)
  const [includeFlutes, setIncludeFlutes] = useState(false)
  const [fluteCount, setFluteCount] = useState(24)
  // Gallery wire (filigree) — thin curved wires under the head, a vintage/
  // antique-style basket look. Round + prong only, see ringGeometry.ts.
  const [includeGalleryWire, setIncludeGalleryWire] = useState(false)
  const [galleryWireCount, setGalleryWireCount] = useState(6)
  // Band text (Text on Curve) — raised text wrapped around the band's
  // OUTER surface via a genuine cylindrical Bend, unlike the signet's own
  // flat-plate-only engraving. Works on any ring, not just a signet.
  const [includeBandText, setIncludeBandText] = useState(false)
  const [bandText, setBandText] = useState('')
  // Pattern Engine (Smart Pattern) — a repeated decorative motif around
  // the band, same placement mechanism as milgrain/flutes, different
  // motif shape (star/diamond/geometric).
  const [includePattern, setIncludePattern] = useState(false)
  const [patternMotif, setPatternMotif] = useState<PatternMotif>('star')
  // Side panels — Matrix's own Award Ring Builder concept (championship
  // rings carrying a logo/year on flat panels flanking the main setting).
  // Zero new geometry: reuses buildSignetTopGroup at two extra angles.
  const [includeSidePanels, setIncludeSidePanels] = useState(false)
  const [sidePanelShape, setSidePanelShape] = useState<'oval' | 'cushion' | 'princess'>('princess')
  const [sidePanelWidthMm, setSidePanelWidthMm] = useState(6)
  const [sidePanelLengthMm, setSidePanelLengthMm] = useState(8)
  const [sidePanelText, setSidePanelText] = useState('')
  const [autoRotate, setAutoRotate] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  const viewerRef = useRef<ModelViewer3DHandle>(null)
  // Manufacturability check — Matrix's own "prepare for production"
  // concern. On-demand (a deliberate action, not continuous) since it's a
  // validation step, same as how Matrix itself exposes this.
  const [watertightResults, setWatertightResults] = useState<ReturnType<typeof checkWatertightness> | null>(null)
  // Manufacturability check #2 — minimum wall/metal thickness (module 15).
  // Deliberately parameter-based, not a mesh-distance scan (see
  // checkMinimumWallThickness's own doc comment) — checks the actual
  // numbers THIS design is using against a casting-safe minimum.
  const [thicknessResults, setThicknessResults] = useState<ReturnType<typeof checkMinimumWallThickness> | null>(null)
  // Manufacturability check #3 — min prong/stone clearance. Previously
  // deferred (see the roadmap memory) since fixed prong-diameter defaults
  // would almost never trigger it; revisited now that prong diameter is
  // genuinely user-adjustable per instance.
  const [clearanceResults, setClearanceResults] = useState<ReturnType<typeof checkProngClearance> | null>(null)
  // Viewing an imported file (STL/OBJ/3MF) — the other half of the
  // original CAD ask, independent of the parametric generator below.
  // Non-null overrides the parametric model in the viewer/weight/export.
  const [importedModel, setImportedModel] = useState<THREE.Object3D | null>(null)
  const [importFileName, setImportFileName] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'stl' | 'obj' | 'glb'>('stl')
  // Casting shrinkage compensation (module 15, Manufacturing prep) — opt-
  // in export-time scale-up so the CAST piece ends up at the intended
  // size after the metal shrinks cooling in the mold. Never affects the
  // on-screen preview or the weight/cost estimate (those should reflect
  // the piece's own real intended size) — applied only inside downloadModel.
  const [compensateShrinkage, setCompensateShrinkage] = useState(false)
  // Logo/artwork import (module 21/12) — SVG only (it's already vector,
  // unlike DXF/PNG which each need their own separate parser, not
  // attempted here). Transient like the STL/OBJ import above, not part
  // of a saved preset (an uploaded file doesn't round-trip through one).
  const [logoSvgText, setLogoSvgText] = useState<string | null>(null)
  const [logoFileName, setLogoFileName] = useState<string | null>(null)
  const [logoSizeMm, setLogoSizeMm] = useState(8)
  const [logoError, setLogoError] = useState<string | null>(null)
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
    haloRingCount, sideStoneCount, sideStoneCaratWeight, sideSpreadDeg,
    includeMatchingBand, matchingBandWidthMm, splitStrandCount,
    includeSignetTop, signetShape, signetWidthMm, signetLengthMm, engraveText, matchingBandCount,
    includeRingLaborFee, ringLaborTierKey, includeSetterFee, setterTypeKey,
    includeFlutes, fluteCount, pointDirection, includeGalleryWire, galleryWireCount,
    includeBandText, bandText, includePattern, patternMotif,
    includeSidePanels, sidePanelShape, sidePanelWidthMm, sidePanelLengthMm, sidePanelText,
  })

  const applyPreset = (p: CadDesignParams) => {
    setFingerSize(p.fingerSize); setWidthMm(p.widthMm); setThicknessMm(p.thicknessMm)
    setProfile(p.profile as BandProfile); setShankStyle(p.shankStyle as typeof shankStyle)
    setTaperAmount(p.taperAmount); setTwists(p.twists); setMetal(p.metal as JewelryMetalOption)
    setIncludeStone(p.includeStone); setStoneShape(p.stoneShape as StoneShape); setCaratWeight(p.caratWeight)
    setDiamondType(p.diamondType as typeof diamondType)
    setFancyLengthMm(p.fancyLengthMm); setFancyWidthMm(p.fancyWidthMm)
    setSettingType(p.settingType as SettingType); setBezelCoverage(p.bezelCoverage as typeof bezelCoverage)
    setProngCount(p.prongCount); setClusterPetalCount(p.clusterPetalCount); setClusterPetalStoneMm(p.clusterPetalStoneMm)
    setIncludeHalo(p.includeHalo); setHaloCount(p.haloCount); setHaloStoneMm(p.haloStoneMm)
    setIncludePave(p.includePave); setPaveSettingType(p.paveSettingType as typeof paveSettingType)
    setPaveCount(p.paveCount); setPaveStoneMm(p.paveStoneMm)
    setMergeSolid(p.mergeSolid); setIncludeMilgrain(p.includeMilgrain); setIncludeRope(p.includeRope)
    // Added after the first preset version shipped — fall back to the same
    // defaults the state itself starts with, so an OLDER saved preset
    // (missing these fields entirely) still loads without breaking.
    setHaloRingCount((p.haloRingCount as 1 | 2 | 3) ?? 1)
    setSideStoneCount((p.sideStoneCount as 0 | 2 | 4) ?? 0)
    setSideStoneCaratWeight(p.sideStoneCaratWeight ?? 0.25)
    setSideSpreadDeg(p.sideSpreadDeg ?? 70)
    setIncludeMatchingBand(p.includeMatchingBand ?? false)
    setMatchingBandWidthMm(p.matchingBandWidthMm ?? 2)
    setSplitStrandCount((p.splitStrandCount as 2 | 3) ?? 2)
    setIncludeSignetTop(p.includeSignetTop ?? false)
    setSignetShape((p.signetShape as typeof signetShape) ?? 'oval')
    setSignetWidthMm(p.signetWidthMm ?? 12)
    setSignetLengthMm(p.signetLengthMm ?? 14)
    setEngraveText(p.engraveText ?? '')
    setIncludeRingLaborFee(p.includeRingLaborFee ?? false)
    setRingLaborTierKey(p.ringLaborTierKey ?? '')
    setIncludeSetterFee(p.includeSetterFee ?? false)
    setSetterTypeKey(p.setterTypeKey ?? '')
    setSetterQuantityOverride(null)
    setMatchingBandCount((p.matchingBandCount as 1 | 2 | 3) ?? 1)
    setIncludeFlutes(p.includeFlutes ?? false)
    setFluteCount(p.fluteCount ?? 24)
    setIncludeGalleryWire(p.includeGalleryWire ?? false)
    setGalleryWireCount(p.galleryWireCount ?? 6)
    setIncludeBandText(p.includeBandText ?? false)
    setBandText(p.bandText ?? '')
    setIncludePattern(p.includePattern ?? false)
    setPatternMotif((p.patternMotif as PatternMotif) ?? 'star')
    setIncludeSidePanels(p.includeSidePanels ?? false)
    setSidePanelShape((p.sidePanelShape as typeof sidePanelShape) ?? 'princess')
    setSidePanelWidthMm(p.sidePanelWidthMm ?? 6)
    setSidePanelLengthMm(p.sidePanelLengthMm ?? 8)
    setSidePanelText(p.sidePanelText ?? '')
    setPointDirection((p.pointDirection as 'up' | 'down') ?? 'up')
    setImportedModel(null); setImportFileName(null) // a loaded preset is the parametric design, not an import
    setLogoSvgText(null); setLogoFileName(null) // same reasoning — an uploaded logo doesn't round-trip through a preset
    setProngHeightOverridesMm({}) // per-instance overrides don't round-trip through a preset (indices may not line up)
    setProngDiameterOverridesMm({})
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

  // Builds the checklist for the wall-thickness check from THIS design's
  // own current parameters — band always applies; prong/gallery only when
  // that geometry is actually being built (round stone, prong setting).
  const runThicknessCheck = () => {
    const minSafeMm = RECOMMENDED_MIN_WALL_MM[metal]
    const items: { label: string; thicknessMm: number; minSafeMm?: number }[] = [
      { label: 'Band', thicknessMm, minSafeMm },
    ]
    if (includeStone && !includeSignetTop && stoneShape === 'round' && settingType === 'prong' && !tensionActive) {
      const prongDiameterMm = defaultProngDiameterMm(stoneDiameterMm)
      items.push({ label: 'Prong', thicknessMm: prongDiameterMm, minSafeMm })
      items.push({ label: 'Gallery', thicknessMm: defaultGalleryTubeMm(prongDiameterMm) * 2, minSafeMm })
    }
    setThicknessResults(checkMinimumWallThickness(items))
  }

  const runClearanceCheck = () => {
    const prongDiameterMm = defaultProngDiameterMm(stoneDiameterMm)
    setClearanceResults(checkProngClearance(stoneDiameterMm, prongCount, prongDiameterMm, prongDiameterOverridesMm))
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

  const handleImportLogo = async (file: File) => {
    setLogoError(null)
    try {
      if (!file.name.toLowerCase().endsWith('.svg') && file.type !== 'image/svg+xml') {
        throw new Error('Only SVG files are supported (DXF/PNG→vector import needs its own separate parser, not built yet).')
      }
      const text = await file.text()
      setLogoSvgText(text)
      setLogoFileName(file.name)
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Could not read this file.')
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
  // Second per-instance-editable prong property, same pattern as height
  // above (click one prong → override just its own diameter).
  const [prongDiameterOverridesMm, setProngDiameterOverridesMm] = useState<Record<number, number>>({})
  const [excludedPaveIndices, setExcludedPaveIndices] = useState<number[]>([])
  const [excludedHaloIndices, setExcludedHaloIndices] = useState<number[]>([])
  const [excludedClusterIndices, setExcludedClusterIndices] = useState<number[]>([])
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
  // pavé, halo (single-ring only), cluster petals, and now every side-
  // stone setting type (channel/flush/bar/invisible all have
  // excludeIndices wired in too, same pattern as pavé itself).
  const SIDE_STONE_PART_NAMES: Record<typeof paveSettingType, string> = {
    pave: 'Pavé stone', channel: 'Channel stone', flush: 'Flush stone',
    bar: 'Bar stone', invisible: 'Invisible-set stone',
  }
  const canRemovePaveInstance = selectedPart?.name === SIDE_STONE_PART_NAMES[paveSettingType] && selectedPart.instanceIndex !== undefined
  const canRemoveHaloInstance = selectedPart?.name === 'Halo stone' && selectedPart.instanceIndex !== undefined
    && haloRingCount === 1
  const canRemoveClusterInstance = selectedPart?.name === 'Cluster petal' && selectedPart.instanceIndex !== undefined
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
  // Plain-string keys for the model useMemo's deps array below, standing
  // in for the excludedHaloIndices/excludedPaveIndices ARRAYS themselves —
  // both are always replaced wholesale via setState, never mutated in
  // place, so a joined key changes exactly when the real dependency does.
  // React Compiler flags array-typed deps as "may be mutated later" once
  // this component grew past some size/complexity threshold; this keeps
  // the manual memoization it would otherwise decline to preserve —
  // optimization-only, the useMemo's own correctness doesn't depend on
  // this rewrite either way (the actual arrays are still what's read
  // inside the memo body, unchanged).
  const excludedHaloKey = excludedHaloIndices.join(',')
  const excludedPaveKey = excludedPaveIndices.join(',')
  const excludedClusterKey = excludedClusterIndices.join(',')
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
    if (!tensionActive && shankStyle === 'split') {
      // Split shank returns one geometry PER STRAND (2 or 3), not a single
      // band — each becomes its own mesh, unlike every other shank style.
      const strands = buildSplitShankGeometry({ ...bandParamsBase, strandCount: splitStrandCount })
      strands.forEach((geo, i) => {
        const strand = new THREE.Mesh(geo)
        strand.userData.partName = 'Shank strand'
        strand.userData.instanceIndex = i
        group.add(strand)
      })
    } else {
      const band = new THREE.Mesh(
        tensionActive
          ? buildTensionBandGeometry(bandParamsBase, tensionGapDeg)
          : shankStyle === 'tapered'
            ? buildTaperedBandGeometry({ ...bandParamsBase, taperAmount })
            : shankStyle === 'twisted'
              ? buildTwistedBandGeometry({ ...bandParamsBase, twists })
              : shankStyle === 'cathedral'
                ? buildCathedralBandGeometry(bandParamsBase)
                : buildRingBandGeometry(bandParamsBase),
      )
      band.userData.partName = 'Band'
      group.add(band)
    }
    if (includeMilgrain) group.add(buildMilgrainEdges({}, bandParamsBase))
    if (includeRope) group.add(buildRopeEdge({}, bandParamsBase))
    if (includeFlutes) group.add(buildFluteRibs({ count: fluteCount }, bandParamsBase))
    if (includeBandText && bandText.trim()) group.add(buildBandTextGroup({ text: bandText }, bandParamsBase))
    if (includePattern) group.add(buildPatternMotifs({ motif: patternMotif }, bandParamsBase))
    if (includeSignetTop) {
      const signetTop = buildSignetTopGroup({ shape: signetShape, widthMm: signetWidthMm, lengthMm: signetLengthMm, engraveText })
      attachHeadToBand(signetTop, bandParamsBase)
      group.add(signetTop)
    } else if (includeStone) {
      if (tensionActive) {
        const tension = buildTensionSetting({ stoneDiameterMm, gapDeg: tensionGapDeg }, bandParamsBase)
        group.add(tension)
      } else {
        const head = stoneShape === 'round'
          ? (settingType === 'bezel'
              ? buildBezelHeadGroup({ stoneDiameterMm, coverageDeg: bezelCoverage === 'half' ? 180 : 360 })
              : settingType === 'cluster'
                ? buildClusterHeadGroup({ centerStoneDiameterMm: stoneDiameterMm, petalCount: clusterPetalCount, petalStoneDiameterMm: clusterPetalStoneMm, excludeIndices: excludedClusterIndices })
                : settingType === 'illusion'
                  ? buildIllusionHeadGroup({ stoneDiameterMm })
                  : buildStoneHeadGroup({ stoneDiameterMm, prongCount, prongHeightOverridesMm, prongDiameterOverridesMm }))
          : buildFancyStoneHeadGroup({ shape: stoneShape, lengthMm: fancyLengthMm, widthMm: fancyWidthMm, prongCount: (prongCount >= 5 ? 6 : 4), pointDirection })
        attachHeadToBand(head, bandParamsBase)
        group.add(head)

        // Gallery wire (filigree) — round + prong only, same scoping as
        // halo/cluster (bezel/cluster/illusion already have their own
        // distinct undergallery structure; a fancy-shape version would
        // need anchor points following that shape's own outline).
        if (includeGalleryWire && stoneShape === 'round' && settingType === 'prong' && !tensionActive) {
          const wires = buildGalleryWireGroup({ stoneDiameterMm, standHeightMm: stoneDiameterMm * 0.45, wireCount: galleryWireCount })
          attachHeadToBand(wires, bandParamsBase)
          group.add(wires)
        }
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

      // Three-stone / five-stone (module 2's named ring TYPES) — extra
      // smaller round prong heads flanking the center stone, sharing the
      // same band. Round + prong + no tension only, for now (a tension-set
      // band already replaces the whole band at angle 0, leaving no clean
      // place to hang side heads; fancy-shape side stones are a separate
      // future scope).
      if (sideStoneCount > 0 && stoneShape === 'round' && settingType === 'prong' && !tensionActive) {
        const sideStoneDiameterMm = roundDiameterMmFromCarat(sideStoneCaratWeight)
        const sideRadius = sideStoneDiameterMm / 2
        const centerRadius = stoneDiameterMm / 2
        const gapMm = 0.4
        const outerRadiusForSpacing = innerDiameterMm / 2 + thicknessMm
        // Chain spacing along the band's own circumference (mm, converted
        // to degrees via the outer radius): the FIRST side stone clears the
        // center stone's own edge; each one after that clears the PREVIOUS
        // side stone's edge instead — correct regardless of how many stones
        // are chained, unlike a single uniform angular step would be.
        const firstStepMm = centerRadius + gapMm + sideRadius
        const laterStepMm = sideRadius * 2 + gapMm
        const perSide = sideStoneCount / 2
        for (const side of [1, -1]) {
          for (let i = 0; i < perSide; i++) {
            const distMm = firstStepMm + laterStepMm * i
            const angleDeg = side * (distMm / outerRadiusForSpacing) * (180 / Math.PI)
            const sideHead = buildStoneHeadGroup({ stoneDiameterMm: sideStoneDiameterMm, prongCount: 4 })
            sideHead.traverse(obj => { if (obj instanceof THREE.Mesh) obj.userData.partName = 'Side stone head' })
            attachHeadToBand(sideHead, bandParamsBase, angleDeg)
            group.add(sideHead)
          }
        }
      }
    }

    // Side panels — Matrix's own Award Ring Builder concept (championship/
    // award rings often carry a team logo/year on flat panels flanking the
    // main setting), generalized here as a plain add-on any ring can use
    // rather than gated behind a separate "ring type". Zero new geometry:
    // reuses `buildSignetTopGroup`'s own flat-plate-plus-raised-text
    // construction (already independently verified) at two extra angular
    // positions instead of writing a new primitive.
    if (includeSidePanels) {
      for (const [angleDeg, idx] of [[90, 0], [270, 1]] as const) {
        const panel = buildSignetTopGroup({ shape: sidePanelShape, widthMm: sidePanelWidthMm, lengthMm: sidePanelLengthMm, engraveText: sidePanelText })
        panel.traverse(obj => {
          if (!(obj instanceof THREE.Mesh)) return
          obj.userData.partName = obj.userData.partName === 'Engraved text' ? 'Side panel text' : 'Side panel'
          obj.userData.instanceIndex = idx
        })
        attachHeadToBand(panel, bandParamsBase, angleDeg)
        group.add(panel)
      }
    }

    // Logo/artwork import — Matrix's own "Logo import" concept (modules
    // 12 and 21). Fixed at angle 180° (directly opposite the main
    // setting) — a sensible default "maker's mark" position, same
    // reasoning Award Ring side panels' own ±90° placement already used.
    if (logoSvgText) {
      const logo = buildLogoGroup({ svgText: logoSvgText, sizeMm: logoSizeMm })
      attachHeadToBand(logo, bandParamsBase, 180)
      group.add(logo)
    }
    if (includePave) {
      const bandParams = { fingerSize, widthMm, thicknessMm, profile }
      const sideStones = paveSettingType === 'channel'
        ? buildChannelSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices }, bandParams)
        : paveSettingType === 'flush'
          ? buildFlushSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices }, bandParams)
          : paveSettingType === 'bar'
            ? buildBarSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices }, bandParams)
            : paveSettingType === 'invisible'
              ? buildInvisibleSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices }, bandParams)
              : buildPaveRow({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices }, bandParams)
      group.add(sideStones)
    }
    if (includeMatchingBand) {
      // Sits right next to the main band, offset along the SAME axis the
      // band's own profile uses for its width (Y, in this local space) —
      // the real-world equivalent of a wedding band sitting flush against
      // an engagement ring on the same finger. More than one (module 2's
      // "Multi-band") just stacks additional ones further out the same way.
      let nextOffset = widthMm / 2 + matchingBandWidthMm / 2 + 0.3
      for (let i = 0; i < matchingBandCount; i++) {
        const matchingBand = new THREE.Mesh(buildRingBandGeometry({ fingerSize, widthMm: matchingBandWidthMm, thicknessMm, profile }))
        matchingBand.position.y = nextOffset
        matchingBand.userData.partName = 'Matching band'
        matchingBand.userData.instanceIndex = i
        group.add(matchingBand)
        nextOffset += matchingBandWidthMm + 0.3
      }
    }
    return group
    // excludedHaloKey/excludedPaveKey (joined-string stand-ins for the
    // excludedHaloIndices/excludedPaveIndices ARRAYS, see where they're
    // defined above) are what's actually listed below, not the arrays
    // themselves — exhaustive-deps doesn't know they're derived from
    // those two and asks for them directly, but listing the raw arrays
    // instead makes React Compiler flag them as "may be mutated later"
    // once this component grew past some size/complexity threshold
    // (confirmed by testing both ways). The keys correctly track the
    // real dependency (both arrays are always replaced wholesale via
    // setState, never mutated in place), so this is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerSize, widthMm, thicknessMm, profile, shankStyle, taperAmount, twists, splitStrandCount, includeMilgrain, includeRope, includeFlutes, fluteCount, includeGalleryWire, galleryWireCount, includeBandText, bandText, includePattern, patternMotif, includeSidePanels, sidePanelShape, sidePanelWidthMm, sidePanelLengthMm, sidePanelText, logoSvgText, logoSizeMm, includeSignetTop, signetShape, signetWidthMm, signetLengthMm, engraveText, includeStone, stoneShape, settingType, bezelCoverage, stoneDiameterMm, prongCount, prongHeightOverridesMm, prongDiameterOverridesMm, clusterPetalCount, clusterPetalStoneMm, excludedClusterKey, tensionActive, tensionGapDeg, fancyLengthMm, fancyWidthMm, haloEligible, haloCount, haloStoneMm, haloRingCount, excludedHaloKey, sideStoneCount, sideStoneCaratWeight, innerDiameterMm, includePave, paveSettingType, paveCount, paveStoneMm, sideSpreadDeg, excludedPaveKey, includeMatchingBand, matchingBandWidthMm, matchingBandCount, pointDirection])

  // Optional boolean-union pass — MatrixGold's own "Parametric Boolean"
  // tool. Folds every metal mesh into one real watertight solid; gems stay
  // separate (see ringGeometry.ts). Beta: three-bvh-csg can throw on a
  // genuinely degenerate input, so this is wrapped and falls back to the
  // unmerged preview rather than breaking the page.
  // React Compiler started flagging this memo as "could not preserve
  // existing memoization" once the component's total complexity grew
  // past some threshold (confirmed by stashing this change and re-
  // linting the prior commit clean) — same class of optimization-only
  // advisory already accepted/fixed elsewhere in this file (see the
  // excludedHaloKey/excludedPaveKey/excludedClusterKey join-string fix),
  // but THIS memo's own deps ([model, mergeSolid]) are already simple
  // primitives/an object reference, not an array-typed dep that rewrite
  // trick applies to — nothing to rewrite here. The manual useMemo's own
  // correctness doesn't depend on the compiler's ADDITIONAL optimization
  // pass either way.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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
    if (thicknessResults !== null) setThicknessResults(null)
    if (clearanceResults !== null) setClearanceResults(null)
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
  const [clusterPetalCountSeen, setClusterPetalCountSeen] = useState(clusterPetalCount)
  if (clusterPetalCountSeen !== clusterPetalCount) {
    setClusterPetalCountSeen(clusterPetalCount)
    setExcludedClusterIndices([])
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
  // Nearest-bucket lookup, pulled out so melee (below) can reuse it
  // instead of re-walking config.diamondSizes per melee category.
  const findNearestDiamondRow = (targetCarat: number, type: typeof diamondType): typeof config.diamondSizes[number] | undefined => {
    const wantType = type === 'lab-grown' ? 'LAB' : 'NATURAL'
    let best: typeof config.diamondSizes[number] | undefined
    let bestDiff = Infinity
    for (const row of config.diamondSizes) {
      if (row.stoneType !== wantType) continue
      const rowCt = Number(row.sizeKey)
      if (!Number.isFinite(rowCt)) continue
      const diff = Math.abs(rowCt - targetCarat)
      if (diff < bestDiff) { bestDiff = diff; best = row }
    }
    return best
  }
  const nearestDiamondPrice = (targetCarat: number, type: typeof diamondType): number => findNearestDiamondRow(targetCarat, type)?.basePrice ?? 0
  const nearestDiamondSize = useMemo(
    () => (includeStone ? findNearestDiamondRow(effectiveCaratWeight, diamondType) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- findNearestDiamondRow is a plain (non-memoized) closure over config, recreated every render; listing it would defeat this memo's own point (it'd never skip). Its real inputs (config, diamondType) are already listed directly below.
    [config, includeStone, diamondType, effectiveCaratWeight],
  )
  const estimatedStoneCost = nearestDiamondSize?.basePrice ?? 0
  // Melee — every OTHER stone in the design besides the center one: pavé/
  // channel/flush/bar/invisible side stones (one shared count+size for
  // all five, see paveCount/paveStoneMm), halo, three-stone/five-stone
  // side heads, and cluster petals. None of these were connected to real
  // pricing before now — only the center stone was. Priced using the
  // SAME Natural/Lab-grown selection as the center stone (a simplifying
  // assumption — real melee is sometimes sourced separately — disclosed
  // in the UI rather than modeled as its own independent choice).
  const estimatedMeleeCost = useMemo(() => {
    let total = 0
    // Counts here subtract individually-removed instances (excludeIndices
    // only ever applies to the first halo ring, matching the model
    // useMemo's own `ring === 0 ? excludedHaloIndices : undefined` logic
    // above) — this melee pricing shipped before per-instance removal
    // existed for pavé/halo, so it originally always priced the FULL
    // configured count even after a stone was removed; fixed here rather
    // than left as a known drift between the model and its own price tag.
    if (haloEligible) total += nearestDiamondPrice(caratFromRoundDiameterMm(haloStoneMm), diamondType) * (haloCount * haloRingCount - excludedHaloIndices.length)
    if (includePave) total += nearestDiamondPrice(caratFromRoundDiameterMm(paveStoneMm), diamondType) * (paveCount - excludedPaveIndices.length)
    if (sideStoneCount > 0 && stoneShape === 'round' && settingType === 'prong' && !tensionActive) {
      total += nearestDiamondPrice(sideStoneCaratWeight, diamondType) * sideStoneCount
    }
    if (stoneShape === 'round' && settingType === 'cluster') {
      total += nearestDiamondPrice(caratFromRoundDiameterMm(clusterPetalStoneMm), diamondType) * (clusterPetalCount - excludedClusterIndices.length)
    }
    return total
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as estimatedStoneCost above: nearestDiamondPrice is a fresh closure every render, its real inputs (config, diamondType) are already listed below.
  }, [
    config, diamondType, haloEligible, haloStoneMm, haloCount, haloRingCount, excludedHaloKey,
    includePave, paveStoneMm, paveCount, excludedPaveKey,
    sideStoneCount, stoneShape, settingType, tensionActive, sideStoneCaratWeight,
    clusterPetalStoneMm, clusterPetalCount, excludedClusterKey,
  ])
  const estimatedLaborCost = includeRingLaborFee ? (config.ringLaborMap[ringLaborTierKey]?.fee ?? 0) : 0
  // Total stone count across the design — a REAL count (not a guess),
  // used to default the setting-labor fee's own quantity below.
  const totalStoneCount = useMemo(() => {
    let count = 0
    if (includeStone && !includeSignetTop) count += 1 // the center stone itself
    if (haloEligible) count += Math.max(0, haloCount * haloRingCount - excludedHaloIndices.length)
    if (includePave) count += Math.max(0, paveCount - excludedPaveIndices.length)
    if (sideStoneCount > 0 && stoneShape === 'round' && settingType === 'prong' && !tensionActive) count += sideStoneCount
    if (stoneShape === 'round' && settingType === 'cluster') count += Math.max(0, clusterPetalCount - excludedClusterIndices.length)
    return count
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as estimatedMeleeCost above: excludedHaloKey/excludedPaveKey/excludedClusterKey (joined-string stand-ins) are what's actually listed, not the arrays themselves — see where they're defined for why.
  }, [includeStone, includeSignetTop, haloEligible, haloCount, haloRingCount, excludedHaloKey, includePave, paveCount, excludedPaveKey, sideStoneCount, stoneShape, settingType, tensionActive, clusterPetalCount, excludedClusterKey])
  const setterQuantity = setterQuantityOverride ?? totalStoneCount
  const estimatedSetterFee = includeSetterFee ? (config.setterMap[setterTypeKey]?.fee ?? 0) * setterQuantity : 0
  const estimatedTotalCost = estimatedMetalCost + estimatedStoneCost + estimatedMeleeCost + estimatedLaborCost + estimatedSetterFee

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
    const exportObject = compensateShrinkage ? scaleForCastingShrinkage(viewModel, metal) : viewModel
    const shrinkTag = compensateShrinkage ? '-shrink-comp' : ''
    if (exportFormat === 'stl') {
      const stl = new STLExporter().parse(exportObject, { binary: false })
      triggerDownload(new Blob([stl], { type: 'model/stl' }), `${name}${shrinkTag}.stl`)
    } else if (exportFormat === 'obj') {
      const obj = new OBJExporter().parse(exportObject)
      triggerDownload(new Blob([obj], { type: 'text/plain' }), `${name}${shrinkTag}.obj`)
    } else {
      new GLTFExporter().parse(
        exportObject,
        result => {
          const blob = result instanceof ArrayBuffer
            ? new Blob([result], { type: 'model/gltf-binary' })
            : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' })
          triggerDownload(blob, `${name}${shrinkTag}.glb`)
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
            Band (plain, tapered, twisted-ribbon, split-shank or cathedral), ring type (solitaire, three-stone,
            five-stone or signet — no stone),
            center stone (round — custom 3-8 prongs, bezel,
            cluster, tension or illusion — oval, cushion, princess, marquise,
            pear, emerald, asscher, radiant, hexagon, lozenge, trapezoid,
            heart or trillion, with mirrorable point direction for pear/
            trapezoid/heart/trillion),
            side stones (pavé, channel, flush, bar or invisible), optional milgrain, twisted-rope, flute edging,
            filigree gallery wire or a star/diamond/geometric Smart Pattern, an optional
            matching band, optional Award Ring side panels, raised text engraving on a signet's flat top or
            wrapped around the band itself, SVG logo/artwork import,
            and solid/export, grouped into tabs the
            way Matrix groups its own tools (Ring Rail, Gems, Milgrain, Parametric Boolean) instead of one long form.
            Click any part of the model in the viewer to select and identify it — click a single prong and you can
            edit its height on its own, a first real per-instance edit, not just a global slider. Import an existing
            STL/OBJ/3MF or .3dm file (Solid tab) to view it right here too — the other half of the original ask. The center
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
                    <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Height</span>
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
                  <div className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Diameter</span>
                    <input type="range" min={0.5} max={defaultProngDiameterMm(stoneDiameterMm) * 2.5} step={0.05}
                      value={prongDiameterOverridesMm[selectedPart.instanceIndex ?? 0] ?? defaultProngDiameterMm(stoneDiameterMm)}
                      onChange={e => setProngDiameterOverridesMm(prev => ({ ...prev, [selectedPart.instanceIndex ?? 0]: Number(e.target.value) }))}
                      className="flex-1" />
                    <span className="w-14 shrink-0 text-right font-mono">
                      {(prongDiameterOverridesMm[selectedPart.instanceIndex ?? 0] ?? defaultProngDiameterMm(stoneDiameterMm)).toFixed(2)}mm
                    </span>
                    {selectedPart.instanceIndex !== undefined && prongDiameterOverridesMm[selectedPart.instanceIndex] !== undefined && (
                      <button type="button"
                        onClick={() => setProngDiameterOverridesMm(prev => {
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
                    Selected <strong>{selectedPart.name} #{(selectedPart.instanceIndex ?? 0) + 1}</strong>.
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
              ) : canRemoveClusterInstance ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1">
                    Selected <strong>Cluster petal #{(selectedPart.instanceIndex ?? 0) + 1}</strong> — removes its prongs too.
                  </span>
                  <button type="button"
                    onClick={() => setExcludedClusterIndices(prev => [...prev, selectedPart.instanceIndex!])}
                    className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                    Remove this petal
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
                    {(['plain', 'tapered', 'twisted', 'split', 'cathedral'] as const).map(s => (
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
                  {shankStyle === 'split' && !tensionActive && (
                    <div className="mt-2">
                      <label className={labelCls}>Strands</label>
                      <div className="grid grid-cols-2 gap-2">
                        {([2, 3] as const).map(n => (
                          <button key={n} type="button" onClick={() => setSplitStrandCount(n)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${splitStrandCount === n ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        A named Ring Builder TYPE (Split Shank Builder) — the band divides into {splitStrandCount} parallel
                        strands framing the setting, merging back into one toward the back.
                      </p>
                    </div>
                  )}
                  {shankStyle === 'cathedral' && !tensionActive && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      Matrix's own "Cathedral Ring Rail" — the band rises (radially thicker, like a Gothic arch) right
                      at the head, easing back to its normal thickness toward the back. Adds metal (and weight) —
                      unlike Taper, this doesn't just redistribute it.
                    </p>
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

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <span>
                    <span className="text-sm font-semibold text-slate-900">Flutes</span>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Raised ribs around the band (real flutes are usually cut grooves — this app builds the added
                      version, not a subtraction). Ties toward Matrix's Award Ring Builder.
                    </p>
                  </span>
                  <input type="checkbox" checked={includeFlutes} onChange={e => setIncludeFlutes(e.target.checked)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                </label>
                {includeFlutes && (
                  <div>
                    <label className={labelCls}>Flute count</label>
                    <input type="number" min={8} max={60} step={1} value={fluteCount}
                      onChange={e => setFluteCount(Math.max(8, Number(e.target.value) || 8))} className={inputCls} />
                  </div>
                )}

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <span>
                    <span className="text-sm font-semibold text-slate-900">Text on curve (band engraving)</span>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Raised text wrapped around the band's own outer surface — Matrix's own "Text on Curve" tool,
                      via a genuine cylindrical bend (not just a flat plate like the signet's own engraving).
                      Deliberately on the OUTER surface: raised text on the inside would press against skin.
                    </p>
                  </span>
                  <input type="checkbox" checked={includeBandText} onChange={e => setIncludeBandText(e.target.checked)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                </label>
                {includeBandText && (
                  <div>
                    <input type="text" maxLength={20} value={bandText}
                      onChange={e => setBandText(e.target.value)} placeholder="e.g. FOREVER YOURS" className={inputCls} />
                    {(() => {
                      const sizeMm = widthMm * 0.4
                      const widthNeeded = estimateBandTextWidthMm(bandText, sizeMm)
                      const circumference = 2 * Math.PI * outerRadiusMm
                      const tooLong = widthNeeded > circumference * 0.85
                      return (
                        <p className={`mt-1 text-xs ${tooLong ? 'text-amber-600' : 'text-slate-400'}`}>
                          {tooLong
                            ? `This will wrap most of the way (or all the way) around the band at this width — shorten it or it'll visually overlap itself.`
                            : `The bundled font doesn't have accented characters (ñ/á/é/…) — they render as their plain letter instead.`}
                        </p>
                      )
                    })()}
                  </div>
                )}

                <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <span>
                    <span className="text-sm font-semibold text-slate-900">Pattern (Smart Pattern)</span>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Matrix's own "Smart Pattern" tool — a repeated decorative motif around the band, same
                      placement as milgrain/flutes with a choice of motif shape.
                    </p>
                  </span>
                  <input type="checkbox" checked={includePattern} onChange={e => setIncludePattern(e.target.checked)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                </label>
                {includePattern && (
                  <div className="grid grid-cols-3 gap-2">
                    {(['star', 'diamond', 'geometric', 'leaf', 'flower'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setPatternMotif(m)}
                        className={`rounded-xl border px-2.5 py-2 text-xs font-semibold capitalize transition ${patternMotif === m ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'center' && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="text-sm font-semibold text-slate-900">Signet ring (no stone)</span>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      A named Ring Builder TYPE — a wide flat top instead of a gemstone. Mutually exclusive with the
                      center stone below.
                    </p>
                  </span>
                  <input type="checkbox" checked={includeSignetTop} onChange={e => setIncludeSignetTop(e.target.checked)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                </label>
                {includeSignetTop && (
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                    <div className="col-span-2">
                      <label className={labelCls}>Top shape</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['oval', 'cushion', 'princess'] as const).map(s => (
                          <button key={s} type="button" onClick={() => setSignetShape(s)}
                            className={`rounded-xl border px-2.5 py-2 text-xs font-semibold capitalize transition ${signetShape === s ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Width (mm)</label>
                      <input type="number" min={6} max={25} step={0.5} value={signetWidthMm}
                        onChange={e => setSignetWidthMm(Math.max(6, Number(e.target.value) || 6))} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Length (mm)</label>
                      <input type="number" min={6} max={25} step={0.5} value={signetLengthMm}
                        onChange={e => setSignetLengthMm(Math.max(6, Number(e.target.value) || 6))} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Engraved initials (raised text)</label>
                      <input type="text" maxLength={6} value={engraveText}
                        onChange={e => setEngraveText(e.target.value)} placeholder="e.g. JD" className={inputCls} />
                      <p className="mt-1 text-xs text-slate-400">
                        Matrix's own "Text on Curve"/"Text Objects" tools — raised only for now (not
                        debossed/carved), and scoped to this flat top face (wrapping text around the curved band
                        itself is a separate, harder future step). The bundled font doesn't have accented
                        characters (ñ/á/é/…) — they render as their plain letter instead
                        {engraveText && sanitizeForEngraving(engraveText) !== engraveText
                          ? ` (will render as "${sanitizeForEngraving(engraveText)}")`
                          : ''}. Keep it short — long text isn't auto-scaled to fit the plate yet.
                      </p>
                    </div>
                  </div>
                )}
                <label className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                  <span className="text-sm font-semibold text-slate-900">Center stone</span>
                  <input type="checkbox" checked={includeStone && !includeSignetTop} disabled={includeSignetTop}
                    onChange={e => setIncludeStone(e.target.checked)}
                    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 disabled:cursor-not-allowed disabled:opacity-50" />
                </label>
                {includeStone && !includeSignetTop && (
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
                    {stoneShape === 'round' && settingType === 'prong' && !tensionActive && (
                      <div className="space-y-3 border-t border-slate-200 pt-3">
                        <div>
                          <label className={labelCls}>Ring type</label>
                          <div className="grid grid-cols-3 gap-2">
                            {([[0, 'Solitaire'], [2, 'Three-stone'], [4, 'Five-stone']] as const).map(([n, label]) => (
                              <button key={n} type="button" onClick={() => setSideStoneCount(n)}
                                className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${sideStoneCount === n ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">
                            Matrix's own named Ring Builder types — smaller round prong heads flanking the center
                            stone, sharing the same band.
                          </p>
                        </div>
                        {sideStoneCount > 0 && (
                          <div>
                            <label className={labelCls}>Side stone carat weight (each)</label>
                            <input type="number" min={0.05} max={2} step={0.05} value={sideStoneCaratWeight}
                              onChange={e => setSideStoneCaratWeight(Math.max(0.05, Number(e.target.value) || 0.05))} className={inputCls} />
                          </div>
                        )}
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
                        {excludedClusterIndices.length > 0 && (
                          <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <span>{excludedClusterIndices.length} petal{excludedClusterIndices.length === 1 ? '' : 's'} removed individually.</span>
                            <button type="button" onClick={() => setExcludedClusterIndices([])}
                              className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50">
                              Restore all
                            </button>
                          </div>
                        )}
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

                    {(stoneShape === 'pear' || stoneShape === 'trapezoid' || stoneShape === 'heart' || stoneShape === 'trillion') && (
                      <div>
                        <label className={labelCls}>Point direction (Mirror)</label>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: 'up' as const, label: 'Toward hand' },
                            { value: 'down' as const, label: 'Toward top' },
                          ]).map(opt => (
                            <button key={opt.value} type="button" onClick={() => setPointDirection(opt.value)}
                              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${pointDirection === opt.value ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Which way the stone's narrow/pointed end faces around the band — Matrix's own "Mirror" transform, flipped along the stone's own length axis.</p>
                      </div>
                    )}

                    {stoneShape === 'round' && settingType === 'prong' && (
                      <div>
                        <label className={labelCls}>Prongs</label>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setProngCount(Math.max(3, prongCount - 1))}
                            className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300">−</button>
                          <input type="number" min={3} max={8} step={1} value={prongCount}
                            onChange={e => setProngCount(Math.min(8, Math.max(3, Number(e.target.value) || 3)))}
                            className={`${inputCls} text-center`} />
                          <button type="button" onClick={() => setProngCount(Math.min(8, prongCount + 1))}
                            className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-slate-300">+</button>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">Any count from 3–8, evenly spaced — round is the only shape whose prongs aren't anchored to fixed landmark points, so it's the only one this can be fully custom for.</p>
                      </div>
                    )}
                    {stoneShape !== 'round' && stoneShape !== 'hexagon' && stoneShape !== 'lozenge' && stoneShape !== 'trillion' && (
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
                    {(stoneShape === 'hexagon' || stoneShape === 'lozenge' || stoneShape === 'trillion') && (
                      <p className="text-xs text-slate-400">
                        Prongs: fixed at this shape's own {stoneShape === 'hexagon' ? '6 vertices (2 side tips + 4 corners)' : stoneShape === 'lozenge' ? '4 vertices (2 tips + 2 sides)' : '3 vertices (one per rounded corner)'} — there's no sensible 4-or-6 reduction that still reads as a {stoneShape}, so this shape skips that toggle.
                      </p>
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
                    {stoneShape === 'round' && settingType === 'prong' && !tensionActive && (
                      <div className="space-y-3 border-t border-slate-200 pt-3">
                        <label className="flex items-center justify-between gap-3">
                          <span>
                            <span className="text-sm font-semibold text-slate-900">Gallery wire (filigree)</span>
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              Thin curved wires under the head instead of a plain solid stand — a vintage/antique
                              basket look.
                            </p>
                          </span>
                          <input type="checkbox" checked={includeGalleryWire} onChange={e => setIncludeGalleryWire(e.target.checked)}
                            className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                        </label>
                        {includeGalleryWire && (
                          <div>
                            <label className={labelCls}>Wire count</label>
                            <input type="number" min={3} max={12} step={1} value={galleryWireCount}
                              onChange={e => setGalleryWireCount(Math.max(3, Number(e.target.value) || 3))} className={inputCls} />
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
                    {excludedPaveIndices.length > 0 && (
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
                  <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                    <span className="text-sm font-semibold text-slate-900">Check wall thickness</span>
                    <button type="button" onClick={runThicknessCheck}
                      className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
                      Run check
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Compares this design's own band (and, for a round prong setting, prong/gallery) thickness against
                    a metal-dependent recommended minimum — silver wants a bit more thickness than platinum for the
                    same durability, not one universal number.
                  </p>
                  {thicknessResults && (
                    <div className="rounded-xl bg-white px-3 py-2 text-xs">
                      {thicknessResults.every(r => r.ok) ? (
                        <p className="font-semibold text-emerald-700">✓ All {thicknessResults.length} checked part{thicknessResults.length === 1 ? '' : 's'} meet the recommended minimum for {metal}.</p>
                      ) : (
                        <>
                          <p className="font-semibold text-rose-700">
                            {thicknessResults.filter(r => !r.ok).length} of {thicknessResults.length} parts are below the recommended minimum for {metal}:
                          </p>
                          <ul className="mt-1 list-disc pl-4 text-slate-600">
                            {thicknessResults.filter(r => !r.ok).map((r, i) => (
                              <li key={i}>{r.label}: {r.thicknessMm.toFixed(2)}mm (recommended ≥ {r.minSafeMm.toFixed(2)}mm)</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                  {stoneShape === 'round' && settingType === 'prong' && !tensionActive && (
                    <>
                      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                        <span className="text-sm font-semibold text-slate-900">Check prong spacing</span>
                        <button type="button" onClick={runClearanceCheck}
                          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">
                          Run check
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Checks that adjacent prongs don't physically overlap — mostly relevant if you've fattened an
                        individual prong's diameter (per-instance edit) enough to collide with its neighbor; default
                        sizes practically never trigger this.
                      </p>
                      {clearanceResults && (
                        <div className="rounded-xl bg-white px-3 py-2 text-xs">
                          {clearanceResults.every(r => r.ok) ? (
                            <p className="font-semibold text-emerald-700">✓ No adjacent prongs overlap.</p>
                          ) : (
                            <>
                              <p className="font-semibold text-rose-700">
                                {clearanceResults.filter(r => !r.ok).length} adjacent prong pair{clearanceResults.filter(r => !r.ok).length === 1 ? '' : 's'} overlap:
                              </p>
                              <ul className="mt-1 list-disc pl-4 text-slate-600">
                                {clearanceResults.filter(r => !r.ok).map((r, i) => (
                                  <li key={i}>Prong #{r.betweenIndices[0] + 1} &amp; #{r.betweenIndices[1] + 1}: overlap by {Math.abs(r.gapMm).toFixed(2)}mm</li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-sm font-semibold text-slate-900">Matching band{matchingBandCount > 1 ? 's (multi-band)' : ''}</span>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Matrix's own "Matching Band Rail" — plain companion band(s), same size and metal, shown
                        sitting right next to this design like a wedding band would. More than one is the "Multi-band"
                        ring type.
                      </p>
                    </span>
                    <input type="checkbox" checked={includeMatchingBand} onChange={e => setIncludeMatchingBand(e.target.checked)}
                      className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                  </label>
                  {includeMatchingBand && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Width (mm, each)</label>
                        <input type="number" min={1} max={6} step={0.1} value={matchingBandWidthMm}
                          onChange={e => setMatchingBandWidthMm(Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Count</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([1, 2, 3] as const).map(n => (
                            <button key={n} type="button" onClick={() => setMatchingBandCount(n)}
                              className={`rounded-xl border px-2 py-2 text-sm font-semibold transition ${matchingBandCount === n ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-sm font-semibold text-slate-900">Side panels</span>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Matrix's own Award Ring Builder concept — flat panels flanking the main setting (a
                        championship ring's team/year plaques), generalized here as a plain add-on any ring can
                        use. Two panels, mirrored left/right; reuses the same flat-plate/raised-text construction
                        as the signet top.
                      </p>
                    </span>
                    <input type="checkbox" checked={includeSidePanels} onChange={e => setIncludeSidePanels(e.target.checked)}
                      className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                  </label>
                  {includeSidePanels && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className={labelCls}>Panel shape</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['oval', 'cushion', 'princess'] as const).map(s => (
                            <button key={s} type="button" onClick={() => setSidePanelShape(s)}
                              className={`rounded-xl border px-2.5 py-2 text-xs font-semibold capitalize transition ${sidePanelShape === s ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Width (mm)</label>
                        <input type="number" min={3} max={15} step={0.5} value={sidePanelWidthMm}
                          onChange={e => setSidePanelWidthMm(Math.max(3, Number(e.target.value) || 3))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Length (mm)</label>
                        <input type="number" min={3} max={15} step={0.5} value={sidePanelLengthMm}
                          onChange={e => setSidePanelLengthMm(Math.max(3, Number(e.target.value) || 3))} className={inputCls} />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls}>Panel text (both panels)</label>
                        <input type="text" maxLength={6} value={sidePanelText}
                          onChange={e => setSidePanelText(e.target.value)} placeholder="e.g. 24" className={inputCls} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <span className="text-sm font-semibold text-slate-900">Import a file to view</span>
                  <p className="text-[11px] text-slate-400">
                    View an existing STL, OBJ, 3MF, or .3dm export (a real Matrix/Rhino/other CAD file) right here —
                    the other half of the original ask, independent of the parametric design above. .3dm is early/
                    beta: it can only read objects already saved as MESHES in the file (not BREP/NURBS surfaces —
                    convert to a mesh in Rhino/Matrix first, or export as STL/OBJ/3MF instead, if this doesn't show
                    anything), and the underlying WASM library hasn't been tested against a real Matrix/Rhino
                    export by this app's own developer yet — the reading logic itself is verified, the real-world
                    file compatibility isn't.
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
                    <input type="file" accept=".stl,.obj,.3mf,.3dm"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
                      className="block w-full text-xs text-slate-600" disabled={importing} />
                  )}
                  {importing && <p className="text-[11px] text-slate-400">Reading file…</p>}
                  {importedModel?.userData.importWarning && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">{importedModel.userData.importWarning as string}</p>
                  )}
                  {importError && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">{importError}</p>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <span className="text-sm font-semibold text-slate-900">Logo/artwork import</span>
                  <p className="text-[11px] text-slate-400">
                    Matrix's own "Logo import" — SVG only (it's already vector, unlike DXF/PNG which each need their
                    own separate parser, not built yet). Placed as a raised relief directly opposite the main
                    setting (angle 180°) — a maker's-mark-style position.
                  </p>
                  {logoSvgText ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                      <span className="truncate">Loaded: <strong>{logoFileName}</strong></span>
                      <button type="button" onClick={() => { setLogoSvgText(null); setLogoFileName(null); setLogoError(null) }}
                        className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <input type="file" accept=".svg,image/svg+xml"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportLogo(f) }}
                      className="block w-full text-xs text-slate-600" />
                  )}
                  {logoSvgText && (
                    <div>
                      <label className={labelCls}>Logo size (mm, larger dimension)</label>
                      <input type="number" min={2} max={20} step={0.5} value={logoSizeMm}
                        onChange={e => setLogoSizeMm(Math.max(2, Number(e.target.value) || 2))} className={inputCls} />
                    </div>
                  )}
                  {logoError && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">{logoError}</p>
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

            {(nearestDiamondSize || estimatedMeleeCost > 0 || estimatedLaborCost > 0 || estimatedSetterFee > 0) && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-sky-700">
                  <Scale className="h-3.5 w-3.5" /> Estimated stone cost
                </div>
                {nearestDiamondSize && (
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-2xl font-semibold text-slate-900">${estimatedStoneCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span className="text-sm text-slate-500">center — {nearestDiamondSize.label}</span>
                  </div>
                )}
                <p className="mt-1.5 text-[11px] text-slate-500">
                  From the app's own diamond price sheet (the same one Quote Builder prices from) — closest LISTED size
                  to {effectiveCaratWeight.toFixed(2)}ct{stoneShape !== 'round'
                    ? ` (estimated from this ${fancyLengthMm}×${fancyWidthMm}mm footprint — a standard trade approximation, not a real stone's actual measured weight)`
                    : ''}, not an interpolation (diamond price per carat isn't linear, so scaling a neighboring size's
                  price would be misleading). Doesn't account for clarity/color/cut — use Quote Builder for an exact price.
                </p>
                {estimatedMeleeCost > 0 && (
                  <div className="mt-2 flex items-baseline justify-between border-t border-sky-200 pt-2">
                    <span className="text-lg font-semibold text-slate-900">${estimatedMeleeCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span className="text-sm text-slate-500">melee (side stones/halo/petals)</span>
                  </div>
                )}
                {estimatedMeleeCost > 0 && (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Every OTHER stone besides the center one — pavé/channel/flush/bar/invisible side stones, halo,
                    three/five-stone side heads, or cluster petals — priced the same way, using the same
                    Natural/Lab-grown selection as the center stone (melee is sometimes sourced separately in
                    practice; this app doesn't yet model that as its own choice).
                  </p>
                )}
                {estimatedLaborCost > 0 && (
                  <div className="mt-2 flex items-baseline justify-between border-t border-sky-200 pt-2">
                    <span className="text-lg font-semibold text-slate-900">${estimatedLaborCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span className="text-sm text-slate-500">ring labor — {config.ringLaborMap[ringLaborTierKey]?.label ?? ringLaborTierKey}</span>
                  </div>
                )}
                {estimatedSetterFee > 0 && (
                  <div className="mt-2 flex items-baseline justify-between border-t border-sky-200 pt-2">
                    <span className="text-lg font-semibold text-slate-900">${estimatedSetterFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span className="text-sm text-slate-500">setting labor — {setterQuantity}× {config.setterMap[setterTypeKey]?.label ?? setterTypeKey}</span>
                  </div>
                )}
                <div className="mt-2 flex items-baseline justify-between border-t border-sky-200 pt-2 text-sm">
                  <span className="font-semibold text-slate-700">Estimated total (metal + stones + labor)</span>
                  <strong className="text-slate-900">${estimatedTotalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="text-sm font-semibold text-slate-900">Ring labor fee</span>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    A real flat fee per tier, from the app's own ring-labor pricing (the same tiers Quote Builder
                    itself uses) — not a guessed number. Doesn't add a separate "CAD design labor" fee: Quote
                    Builder's own pricing doesn't charge for that today either.
                  </p>
                </span>
                <input type="checkbox" checked={includeRingLaborFee} onChange={e => setIncludeRingLaborFee(e.target.checked)}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
              </label>
              {includeRingLaborFee && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-4">
                  {config.ringLaborTiers.length === 0 ? (
                    <p className="col-span-full text-xs text-slate-400">No ring-labor tiers are configured yet.</p>
                  ) : (
                    [...config.ringLaborTiers].sort((a, b) => a.sortOrder - b.sortOrder).map(tier => (
                      <button key={tier.tierKey} type="button" onClick={() => setRingLaborTierKey(tier.tierKey)}
                        className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${ringLaborTierKey === tier.tierKey ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        {tier.label}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="text-sm font-semibold text-slate-900">Setting labor fee</span>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    The OTHER real labor line Quote Builder tracks — per-stone setting labor, from the app's own
                    real setter-fee list (not a guessed mapping from this page's own setting types). Quantity
                    defaults to this design's own real stone count ({totalStoneCount}).
                  </p>
                </span>
                <input type="checkbox" checked={includeSetterFee} onChange={e => setIncludeSetterFee(e.target.checked)}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
              </label>
              {includeSetterFee && (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                  {config.setters.length === 0 ? (
                    <p className="text-xs text-slate-400">No setter fees are configured yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {[...config.setters].sort((a, b) => a.sortOrder - b.sortOrder).map(setter => (
                        <button key={setter.typeKey} type="button" onClick={() => setSetterTypeKey(setter.typeKey)}
                          className={`rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${setterTypeKey === setter.typeKey ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                          {setter.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className={labelCls}>Quantity</label>
                    <input type="number" min={0} step={1} value={setterQuantity}
                      onChange={e => setSetterQuantityOverride(Math.max(0, Number(e.target.value) || 0))}
                      className={`${inputCls} w-24`} />
                    {setterQuantityOverride !== null && (
                      <button type="button" onClick={() => setSetterQuantityOverride(null)}
                        className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold hover:bg-slate-50">
                        Reset to actual count
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
              <span>
                <span className="text-xs font-semibold text-slate-900">Compensate for casting shrinkage</span>
                <p className="text-[11px] text-slate-400">
                  Scales the EXPORTED file up by {JEWELRY_METAL_OPTIONS[metal].label}'s own {CASTING_SHRINKAGE_PERCENT[metal].toFixed(2)}% shrinkage estimate
                  (standard trade guidance — confirm against your own foundry's real number). Never affects the
                  preview or the weight/cost estimate above.
                </p>
              </span>
              <input type="checkbox" checked={compensateShrinkage} onChange={e => setCompensateShrinkage(e.target.checked)}
                className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
            </label>
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
