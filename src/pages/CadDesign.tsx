import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { Card, CardContent } from '@/components/ui/card'
import { EMPTY_HISTORY, recordSnapshot, stepHistory as stepHistoryState, canUndoHistory, canRedoHistory, type HistoryState } from '@/lib/historyStack'
import { ModelingPanel } from '@/components/ModelingPanel'
import { buildModelObjects, buildCutterMeshes, buildGhostMeshes, buildRailGemMeshes, type ModelObject } from '@/lib/modeling'
import { ProfileEditor } from '@/components/ProfileEditor'
import { PlanShapePicker } from '@/components/PlanShapePicker'
import { GEM_LOOKS, DIAMOND_LOOK } from '@/lib/gemLooks'
import { ModelViewer3D, type SelectedPart, type ModelViewer3DHandle, type CameraView } from '@/components/ModelViewer3D'
import { FINGER_SIZE_OPTIONS, METAL_GROUPS } from '@/hooks/useQuoteBuilder'
import { useQuoteConfig } from '@/hooks/useQuoteConfig'
import { JEWELRY_METAL_OPTIONS } from '@/constants/config'
import type { JewelryMetalOption } from '@/types'
import {
  buildRingBandGeometry, usSizeToDiameterMm, type BandProfile, type CustomBandProfile, BAND_PROFILE_PRESETS, type PlanShape, ROUND_PLAN_SHAPE, applyPlanShape, buildVariableProfileBandGeometry,
  buildStoneHeadGroup, buildBezelHeadGroup, buildClusterHeadGroup, buildHaloGroup, haloOrbitRadiusMm, attachHeadToBand, roundDiameterMmFromCarat, caratFromRoundDiameterMm, estimateFancyCaratWeight,
  buildSignetTopGroup, sanitizeForEngraving,
  defaultProngHeightMm,
  buildFancyStoneHeadGroup, type FancyStoneShape,
  buildPaveRow, buildChannelSetting, buildFlushSetting, buildBarSetting, buildInvisibleSetting,
  buildTensionBandGeometry, buildTensionSetting, tensionGapDegForStone,
  buildTaperedBandGeometry, buildTwistedBandGeometry, buildSplitShankGeometry, buildCathedralBandGeometry, buildBypassBandGeometry,
  buildIllusionHeadGroup,
  buildMilgrainEdges, buildRopeEdge, buildFluteRibs, buildGalleryWireGroup, buildBandTextGroup, estimateBandTextWidthMm,
  buildPatternMotifs, type PatternMotif,
  buildLogoGroup,
  unionMetalParts, extractStoneMeshes, checkWatertightness, buildStoneSeatCutters,
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
// A visual outline per gem shape — a literal translation of Matrix's own
// "Gem Loader" shape picker (a grid of actual shape ICONS, not a text
// list — see the reference screenshot the user shared 2026-09-15).
// emerald/asscher/radiant deliberately share the SAME cut-corner-rect
// silhouette at slightly different proportions, matching
// `cutCornerRectOutline`'s own disclosed simplification in
// ringGeometry.ts: what really distinguishes those three in a real stone
// is facet PATTERN, not outline — so their icons shouldn't invent a
// silhouette difference the actual geometry doesn't have either.
const SHAPE_ICON_PATH: Record<StoneShape, string> = {
  round: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  oval: 'M12 4c4.5 0 8 3.5 8 8s-3.5 8-8 8-8-3.5-8-8 3.5-8 8-8Z',
  cushion: 'M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z',
  princess: 'M4.5 4.5h15v15h-15Z',
  // A real vesica/lens construction (two arcs sharing the same sweep flag,
  // meeting at sharp points top/bottom) rather than a smoothed diamond —
  // needed to read as a pointed marquise instead of collapsing visually
  // into the oval/lozenge icons.
  marquise: 'M12 3A11 11 0 0 1 12 21A11 11 0 0 1 12 3Z',
  pear: 'M12 3c1.6 2.4 8 5.4 8 11a8 8 0 0 1-16 0c0-5.6 6.4-8.6 8-11Z',
  emerald: 'M8.5 4h7L20 8.5v7L15.5 20h-7L4 15.5v-7Z',
  asscher: 'M9 4h6l5 5v6l-5 5H9l-5-5V9Z',
  radiant: 'M7.5 4h9L21 9v6l-4.5 5h-9L3 15V9Z',
  hexagon: 'M8 4h8l4 8-4 8H8l-4-8Z',
  lozenge: 'M12 3 21 12 12 21 3 12Z',
  trapezoid: 'M8 4h8l4 16H4Z',
  heart: 'M12 20.5S4 14.8 4 8.9C4 5.9 6.4 4 9 4c1.4 0 2.6.7 3 1.6C12.4 4.7 13.6 4 15 4c2.6 0 5 1.9 5 4.9 0 5.9-8 11.6-8 11.6Z',
  trillion: 'M12 3 21 19H3Z',
}

// Outline icons for the non-shape pickers (setting type, side-stone type,
// shank style) — same icon-first toolbar treatment as ShapeIcon, drawn as
// simple schematic glyphs of what each option builds (a circle inside
// prongs, a ring wall around a stone, a row of touching stones, …), not
// literal Matrix artwork (which isn't available to copy).
const circlePath = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0 ${r} ${r} 0 1 0-${2 * r} 0Z`
const TOOL_ICON_PATH: Record<string, string> = {
  // setting types
  prong: `${circlePath(12, 12, 4)}M12 3v4M12 17v4M3 12h4M17 12h4`,
  bezel: `${circlePath(12, 12, 8)}${circlePath(12, 12, 4.5)}`,
  cluster: [circlePath(12, 12, 3), ...[0, 60, 120, 180, 240, 300].map(a =>
    circlePath(12 + 7.5 * Math.cos((a * Math.PI) / 180), 12 + 7.5 * Math.sin((a * Math.PI) / 180), 2))].join(''),
  tension: `M2 10h6v4H2ZM16 10h6v4h-6Z${circlePath(12, 12, 3)}`,
  illusion: 'M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z',
  // side-stone types
  pave: `${circlePath(5.5, 12, 2)}${circlePath(12, 12, 2)}${circlePath(18.5, 12, 2)}`,
  channel: `M3 8h18M3 16h18${circlePath(7, 12, 2)}${circlePath(12, 12, 2)}${circlePath(17, 12, 2)}`,
  flush: `M3 15h18${circlePath(7, 12, 2.5)}${circlePath(17, 12, 2.5)}`,
  bar: `M6 6v12M12 6v12M18 6v12${circlePath(9, 12, 1.5)}${circlePath(15, 12, 1.5)}`,
  invisible: `${circlePath(6, 12, 3)}${circlePath(12, 12, 3)}${circlePath(18, 12, 3)}`,
  // shank styles
  plain: `${circlePath(12, 12, 8)}${circlePath(12, 12, 5.5)}`,
  tapered: 'M3 8l18 3v2L3 16Z',
  twisted: 'M3 12c3-7 6-7 9 0s6 7 9 0',
  split: 'M3 12h6l6-4h6M9 12l6 4h6',
  cathedral: 'M3 19c0-9 6-13 9-13s9 4 9 13',
  bypass: 'M3 8c6 0 12 8 18 8M3 16c6 0 12-8 18-8',
  // pattern motifs
  star: `M${[...Array(10).keys()].map(i => {
    const r = i % 2 === 0 ? 9 : 4, a = (i * Math.PI) / 5 - Math.PI / 2
    return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`
  }).join('L')}Z`,
  diamond: 'M12 3l7 9-7 9-7-9Z',
  geometric: 'M4 4h16v16H4ZM4 4l16 16M20 4 4 20',
  leaf: 'M12 3c5 4 6 10 0 18C6 13 7 7 12 3ZM12 8v13',
  flower: [circlePath(12, 12, 2), ...[0, 72, 144, 216, 288].map(a =>
    circlePath(12 + 6 * Math.cos(((a - 90) * Math.PI) / 180), 12 + 6 * Math.sin(((a - 90) * Math.PI) / 180), 3))].join(''),
  // band profile (cross-section)
  flat: 'M5 7h14v10H5Z',
  comfort: 'M5 8c2-2 12-2 14 0v8c-2 2-12 2-14 0Z',
  custom: 'M5 16c0-6 4-9 7-9s7 3 7 9M5 16h14M8 12l1 2M12 9v3M16 12l-1 2',
  // bezel coverage
  full: `${circlePath(12, 12, 8)}${circlePath(12, 12, 5)}`,
  half: 'M4 16a8 8 0 0 1 16 0M4 16h16M7 16a5 5 0 0 1 10 0',
  // diamond origin
  natural: 'M6 4h12l3 5-9 11L3 9ZM3 9h18',
  'lab-grown': 'M9 3h6M10 3v6l-5 10h14L14 9V3M8 15h8',
}

function ToolIcon({ name, className }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" className={className}>
      <path d={TOOL_ICON_PATH[name] ?? ''} />
    </svg>
  )
}

/** One shape's own icon, sized/stroked to sit inside a toolbar-style
 *  button (see the shape-picker grid) — outline only, `currentColor`, so
 *  it follows the button's own text color when selected vs. not. */
function ShapeIcon({ shape, className }: { shape: StoneShape; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" className={className}>
      <path d={SHAPE_ICON_PATH[shape]} />
    </svg>
  )
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

// Matches Matrix's own real toolbar groups (pasted by the user straight
// from the app's own UI — see the CAD roadmap memory's "Real MatrixGold
// toolbar catalog"), not an ad-hoc split of this page's own choosing:
// "Ring Rail" (Tools group: Ring Rail/Outside/Cathedral Ring Rail —
// shank/profile), "Gems" (the Gems group — Base/Gem/Pavé/Gems on Curve,
// covering both the center stone and side/melee stones as one group,
// same as Matrix does), "Solid/Surface" (that group's own name —
// Milgrain/Rope/Smart Pattern/Parametric Boolean, plus the closely
// related Award Ring/Text tools), "Production" (this app's own addition
// — manufacturability checks, pricing, export — Matrix doesn't have a
// single named toolbar group for this, it's spread across separate
// dialogs there).
type Tab = 'ringrail' | 'gems' | 'surface' | 'model' | 'production'

// Which tab's controls actually shape a given clicked part — every
// `userData.partName` any ringGeometry.ts builder sets should have an
// entry here. Selecting a part jumps straight to the tab that controls
// it, instead of leaving the jeweler to hunt for the right slider.
const PART_TAB: Record<string, Tab> = {
  Band: 'ringrail',
  Gallery: 'gems', Prong: 'gems', Stand: 'gems', 'Center stone': 'gems',
  'Bezel wall': 'gems', 'Cluster plate': 'gems', 'Cluster petal': 'gems',
  'Tension contact': 'gems', 'Halo stone': 'gems', 'Illusion skirt': 'gems',
  'Pavé stone': 'gems', 'Channel stone': 'gems', 'Channel rail': 'gems',
  'Flush stone': 'gems', 'Flush collar': 'gems', 'Bar stone': 'gems', 'Bar post': 'gems',
  'Invisible-set stone': 'gems',
  'Side stone head': 'gems', 'Shank strand': 'ringrail', 'Signet top': 'gems', 'Engraved text': 'gems',
  'Milgrain bead': 'surface', 'Rope strand': 'surface', 'Flute rib': 'surface', 'Gallery wire': 'gems', 'Band text': 'surface',
  'Side panel': 'surface', 'Side panel text': 'surface', 'Pattern motif': 'surface', 'Logo': 'surface',
  'Modeled solid': 'model',
  'Merged solid': 'surface', Imported: 'production', 'Matching band': 'surface',
}
import { Download, RotateCw, Scale, MousePointerClick, Circle, Gem, Layers, Factory, Camera, Sparkles, Maximize2, Minimize2, Undo2, Redo2, PenTool, Aperture, Scissors } from 'lucide-react'

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
  // Free-form cross-section (profile === 'custom'), edited in ProfileEditor.
  // Ring plan-view shape (round/oval/square…) — applied to the whole model.
  // Rhino-style modeled solids (Curve → Extrude/Revolve) — see lib/modeling.ts.
  const [modelObjects, setModelObjects] = useState<ModelObject[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [planShape, setPlanShape] = useState<PlanShape>(ROUND_PLAN_SHAPE)
  // Profile Placer: a DIFFERENT free-form profile at the back of the ring,
  // blended from the head profile (plain shank + custom profile only).
  const [backProfileOn, setBackProfileOn] = useState(false)
  const [backProfile, setBackProfile] = useState<CustomBandProfile>(BAND_PROFILE_PRESETS.court.profile)
  const [customProfile, setCustomProfile] = useState<CustomBandProfile>(BAND_PROFILE_PRESETS['half-round'].profile)
  const [shankStyle, setShankStyle] = useState<'plain' | 'tapered' | 'twisted' | 'split' | 'cathedral' | 'bypass'>('plain')
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
  // Font weight for the signet's raised text — Matrix's own text tool
  // exposes a weight choice; this app ships one real font in two weights
  // (see the font-loading comment in ringGeometry.ts) rather than a full
  // font picker. Independent from `bandTextBold` below since the two are
  // separate features (flat-top engraving vs. band-wrapped text).
  const [engraveBold, setEngraveBold] = useState(false)
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
  // Matrix's Cutters, generated from the gems already in the model — see
  // buildStoneSeatCutters. Off by default: it's a boolean pass per stone,
  // so a pavé-heavy design takes a moment.
  const [cutStoneSeats, setCutStoneSeats] = useState(false)
  // Matching Jewelry (module 14) — Matrix's own "Matching Band Rail": a
  // plain companion band, same finger size and metal, shown sitting right
  // next to the main design like a wedding band would sit against this
  // engagement ring.
  const [includeMatchingBand, setIncludeMatchingBand] = useState(false)
  const [matchingBandWidthMm, setMatchingBandWidthMm] = useState(2)
  // Multi-band (module 2 in the roadmap's master list) — more than one
  // companion band stacked side by side, all sharing the toggle above.
  const [matchingBandCount, setMatchingBandCount] = useState<1 | 2 | 3>(1)
  // Per-instance offset override (mm, along the band's own width axis) —
  // same Record<number, override> pattern as the stone-size overrides,
  // and the third movable part after the logo/side panels: drag a
  // matching band's own gizmo in the 3D view to slide it closer/further
  // out, independent of the others. Unlike those two, this is a plain
  // linear offset, not an angle (see moveAxis: 'y' where it's built).
  const [matchingBandOffsetOverridesMm, setMatchingBandOffsetOverridesMm] = useState<Record<number, number>>({})
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
  // Font weight for the band-wrapped text — independent of the signet's
  // own `engraveBold` (see that field's comment).
  const [bandTextBold, setBandTextBold] = useState(false)
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
  // Each panel's own position around the band, in degrees — was hardcoded
  // to 90°/270° until now. Second use of the same real drag-to-move gizmo
  // the logo just proved out (Matrix's Transform > Base "Move"), and
  // literally independent per panel — like two separate objects in real
  // Matrix, not a single mirrored offset — so dragging one doesn't move
  // the other.
  const [sidePanelAngle0Deg, setSidePanelAngle0Deg] = useState(90)
  const [sidePanelAngle1Deg, setSidePanelAngle1Deg] = useState(270)
  const [autoRotate, setAutoRotate] = useState(false)
  const [wireframe, setWireframe] = useState(false)
  // Section view (Matrix's Clipping Plane) — viewer-only, so it never
  // touches the geometry the weight, the checks or an export are read
  // from. Z by default: that's the plane that cuts a ring across the
  // finger, through the head and the stone seats under it.
  const [sectionOn, setSectionOn] = useState(false)
  const [sectionAxis, setSectionAxis] = useState<'x' | 'y' | 'z'>('z')
  const [sectionOffsetMm, setSectionOffsetMm] = useState(0)
  // Render mode (Matrix's "Render"): photoreal presentation look — see
  // ModelViewer3D's renderMode prop.
  const [renderMode, setRenderMode] = useState(false)
  // Physically based path tracing on top of Render mode (ray-traced look).
  const [pathTrace, setPathTrace] = useState(false)
  const [gemLookKey, setGemLookKey] = useState('diamond')
  // The live sample counter updates ~10x/s; it lives in its own tiny
  // component (see PathSamplesBadge) so it doesn't re-render this whole page.
  const samplesSetterRef = useRef<((n: number) => void) | null>(null)
  // Full-screen work mode: covers the app sidebar/header (fixed overlay) and
  // asks the browser for real fullscreen too. Esc / the browser's own exit
  // both drop back out — synced through the fullscreenchange listener.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    const next = !fullscreen
    setFullscreen(next)
    if (next) document.documentElement.requestFullscreen?.().catch(() => { /* overlay still works without browser fullscreen */ })
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }
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
  // Position around the band, in degrees — was hardcoded to 180° (opposite
  // the main setting) until now. First real use of a "Move" transform
  // (Matrix's Transform > Base tool): dragging the logo's own gizmo in the
  // viewer (see ModelViewer3D's onMoveAngle) writes back to this SAME
  // state a slider would, rather than a separate untracked position — the
  // model is still fully regenerated from parameters every render, so a
  // dragged object has to resolve to a real parameter or it would snap
  // back on the next rebuild.
  const [logoAngleDeg, setLogoAngleDeg] = useState(180)
  // Content Manager (module 22) — save/load a full parameter set as a
  // named preset. Loaded fresh from localStorage each time the list is
  // opened (cheap, and keeps it correct if another tab just saved one).
  const [presets, setPresets] = useState<SavedCadPreset[]>(() => listCadPresets())
  const [presetName, setPresetName] = useState('')
  const [presetMessage, setPresetMessage] = useState<string | null>(null)

  const currentParams = (): CadDesignParams => ({
    fingerSize, widthMm, thicknessMm, profile, customProfile, shankStyle, taperAmount, twists, metal,
    includeStone, stoneShape, caratWeight, diamondType, fancyLengthMm, fancyWidthMm,
    settingType, bezelCoverage, prongCount, clusterPetalCount, clusterPetalStoneMm,
    includeHalo, haloCount, haloStoneMm, includePave, paveSettingType, paveCount, paveStoneMm,
    planAspect: planShape.aspect, planSquareness: planShape.squareness,
    backProfileOn, backProfile, modelObjects,
    mergeSolid, includeMilgrain, includeRope,
    haloRingCount, sideStoneCount, sideStoneCaratWeight, sideSpreadDeg,
    includeMatchingBand, matchingBandWidthMm, splitStrandCount,
    includeSignetTop, signetShape, signetWidthMm, signetLengthMm, engraveText, engraveBold, matchingBandCount,
    includeRingLaborFee, ringLaborTierKey, includeSetterFee, setterTypeKey,
    includeFlutes, fluteCount, pointDirection, includeGalleryWire, galleryWireCount,
    includeBandText, bandText, bandTextBold, includePattern, patternMotif,
    includeSidePanels, sidePanelShape, sidePanelWidthMm, sidePanelLengthMm, sidePanelText, sidePanelAngle0Deg, sidePanelAngle1Deg,
    cutStoneSeats,
  })

  // Pure parameter setters — shared by preset loading AND undo/redo. Undo
  // must NOT clear an imported file / logo / per-instance overrides the way
  // loading a preset does (see applyPreset below).
  const applyParams = (p: CadDesignParams) => {
    setFingerSize(p.fingerSize); setWidthMm(p.widthMm); setThicknessMm(p.thicknessMm)
    setProfile(p.profile as BandProfile); setCustomProfile(p.customProfile ?? BAND_PROFILE_PRESETS['half-round'].profile); setShankStyle(p.shankStyle as typeof shankStyle)
    setTaperAmount(p.taperAmount); setTwists(p.twists); setMetal(p.metal as JewelryMetalOption)
    setIncludeStone(p.includeStone); setStoneShape(p.stoneShape as StoneShape); setCaratWeight(p.caratWeight)
    setDiamondType(p.diamondType as typeof diamondType)
    setFancyLengthMm(p.fancyLengthMm); setFancyWidthMm(p.fancyWidthMm)
    setSettingType(p.settingType as SettingType); setBezelCoverage(p.bezelCoverage as typeof bezelCoverage)
    setProngCount(p.prongCount); setClusterPetalCount(p.clusterPetalCount); setClusterPetalStoneMm(p.clusterPetalStoneMm)
    setIncludeHalo(p.includeHalo); setHaloCount(p.haloCount); setHaloStoneMm(p.haloStoneMm)
    setIncludePave(p.includePave); setPaveSettingType(p.paveSettingType as typeof paveSettingType)
    setPaveCount(p.paveCount); setPaveStoneMm(p.paveStoneMm)
    setPlanShape({ aspect: p.planAspect ?? 1, squareness: p.planSquareness ?? 2 })
    setModelObjects(p.modelObjects ?? [])
    setBackProfileOn(p.backProfileOn ?? false); setBackProfile(p.backProfile ?? BAND_PROFILE_PRESETS.court.profile)
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
    setEngraveBold(p.engraveBold ?? false)
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
    setBandTextBold(p.bandTextBold ?? false)
    setIncludePattern(p.includePattern ?? false)
    setPatternMotif((p.patternMotif as PatternMotif) ?? 'star')
    setIncludeSidePanels(p.includeSidePanels ?? false)
    setSidePanelShape((p.sidePanelShape as typeof sidePanelShape) ?? 'princess')
    setSidePanelWidthMm(p.sidePanelWidthMm ?? 6)
    setSidePanelLengthMm(p.sidePanelLengthMm ?? 8)
    setSidePanelText(p.sidePanelText ?? '')
    setSidePanelAngle0Deg(p.sidePanelAngle0Deg ?? 90)
    setSidePanelAngle1Deg(p.sidePanelAngle1Deg ?? 270)
    setPointDirection((p.pointDirection as 'up' | 'down') ?? 'up')
    setCutStoneSeats(p.cutStoneSeats ?? false)
  }
  const applyPreset = (p: CadDesignParams) => {
    applyParams(p)
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
      setResizeEnabled(false) // a new file's own size has nothing to do with whatever the last one was scaled to
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
  const [activeTab, setActiveTab] = useState<Tab>('ringrail')
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
  // Per-instance SIZE editing extended to pavé/halo — the same override
  // pattern round prongs already proved out with height+diameter.
  const [paveStoneDiameterOverridesMm, setPaveStoneDiameterOverridesMm] = useState<Record<number, number>>({})
  const [haloStoneDiameterOverridesMm, setHaloStoneDiameterOverridesMm] = useState<Record<number, number>>({})
  // Same pattern, third and last repeated-stone part to get it — closes
  // the near-term roadmap item "size editing for cluster petals".
  const [petalStoneDiameterOverridesMm, setPetalStoneDiameterOverridesMm] = useState<Record<number, number>>({})
  // Selecting a part jumps to whichever tab actually controls it — bridges
  // "I clicked this" to "here's how to change it" even though the controls
  // are still per-feature (every prong, say) rather than per-instance yet.
  const handleSelectPart = (part: SelectedPart | null) => {
    setSelectedPart(part)
    if (part?.name === 'Modeled solid' && part.instanceIndex !== undefined) setSelectedModelId(modelObjects[part.instanceIndex]?.id ?? null)
    if (part && PART_TAB[part.name]) setActiveTab(PART_TAB[part.name])
  }

  const innerDiameterMm = usSizeToDiameterMm(fingerSize)
  const planAspect = planShape.aspect
  const planSquareness = planShape.squareness
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
    const bandParamsBase = { fingerSize, widthMm, thicknessMm, profile, customProfile }
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
    } else if (!tensionActive && shankStyle === 'bypass') {
      // Same "one geometry per strand" shape as split shank, but the two
      // strands genuinely cross (swap sides) rather than diverge-and-
      // reconverge on the same sides — see buildBypassBandGeometry's own
      // doc comment for how the crossing is made periodic/collision-free.
      const strands = buildBypassBandGeometry(bandParamsBase)
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
                : profile === 'custom' && backProfileOn
                  ? buildVariableProfileBandGeometry(bandParamsBase, backProfile)
                  : buildRingBandGeometry(bandParamsBase),
      )
      band.userData.partName = 'Band'
      group.add(band)
    }
    if (includeMilgrain) group.add(buildMilgrainEdges({}, bandParamsBase))
    if (includeRope) group.add(buildRopeEdge({}, bandParamsBase))
    if (includeFlutes) group.add(buildFluteRibs({ count: fluteCount }, bandParamsBase))
    if (includeBandText && bandText.trim()) group.add(buildBandTextGroup({ text: bandText, bold: bandTextBold }, bandParamsBase))
    if (includePattern) group.add(buildPatternMotifs({ motif: patternMotif }, bandParamsBase))
    if (includeSignetTop) {
      const signetTop = buildSignetTopGroup({ shape: signetShape, widthMm: signetWidthMm, lengthMm: signetLengthMm, engraveText, bold: engraveBold })
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
                ? buildClusterHeadGroup({ centerStoneDiameterMm: stoneDiameterMm, petalCount: clusterPetalCount, petalStoneDiameterMm: clusterPetalStoneMm, excludeIndices: excludedClusterIndices, petalStoneDiameterOverridesMm })
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
            stoneDiameterOverridesMm: ring === 0 ? haloStoneDiameterOverridesMm : undefined,
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
      for (const [angleDeg, idx] of [[sidePanelAngle0Deg, 0], [sidePanelAngle1Deg, 1]] as const) {
        const panel = buildSignetTopGroup({ shape: sidePanelShape, widthMm: sidePanelWidthMm, lengthMm: sidePanelLengthMm, engraveText: sidePanelText })
        panel.traverse(obj => {
          if (!(obj instanceof THREE.Mesh)) return
          obj.userData.partName = obj.userData.partName === 'Engraved text' ? 'Side panel text' : 'Side panel'
          obj.userData.instanceIndex = idx
        })
        // Tagged for the drag-to-move gizmo here (not inside
        // buildSignetTopGroup itself) since a signet TOP shouldn't be
        // independently movable — only these two flanking-panel USES of
        // the same primitive should be. Each panel gets its own
        // movablePartName (idx-suffixed) so dragging one never touches
        // the other, unlike the shared-state side-stone overrides
        // elsewhere in this file.
        panel.userData.isMovableRoot = true
        panel.userData.movablePartName = `Side panel ${idx + 1}`
        panel.userData.moveAxis = 'xz' // positioned by an angle around the band
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
      attachHeadToBand(logo, bandParamsBase, logoAngleDeg)
      group.add(logo)
    }
    if (includePave) {
      const bandParams = { fingerSize, widthMm, thicknessMm, profile, customProfile }
      const sideStones = paveSettingType === 'channel'
        ? buildChannelSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices, stoneDiameterOverridesMm: paveStoneDiameterOverridesMm }, bandParams)
        : paveSettingType === 'flush'
          ? buildFlushSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices, stoneDiameterOverridesMm: paveStoneDiameterOverridesMm }, bandParams)
          : paveSettingType === 'bar'
            ? buildBarSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices, stoneDiameterOverridesMm: paveStoneDiameterOverridesMm }, bandParams)
            : paveSettingType === 'invisible'
              ? buildInvisibleSetting({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices, stoneDiameterOverridesMm: paveStoneDiameterOverridesMm }, bandParams)
              : buildPaveRow({ count: paveCount, stoneDiameterMm: paveStoneMm, spreadDeg: sideSpreadDeg, excludeIndices: excludedPaveIndices, stoneDiameterOverridesMm: paveStoneDiameterOverridesMm }, bandParams)
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
        const matchingBand = new THREE.Mesh(buildRingBandGeometry({ fingerSize, widthMm: matchingBandWidthMm, thicknessMm, profile, customProfile }))
        // Per-instance drag override (see matchingBandOffsetOverridesMm's
        // own comment) — the DEFAULT stacking offset is always computed
        // the same way regardless of any override, same "seat stays put,
        // only this one moves" convention the stone-size overrides use.
        matchingBand.position.y = matchingBandOffsetOverridesMm[i] ?? nextOffset
        matchingBand.userData.partName = 'Matching band'
        matchingBand.userData.instanceIndex = i
        matchingBand.userData.isMovableRoot = true
        matchingBand.userData.movablePartName = `Matching band ${i + 1}`
        matchingBand.userData.moveAxis = 'y' // a plain linear offset, not an angle
        group.add(matchingBand)
        nextOffset += matchingBandWidthMm + 0.3
      }
    }
    applyPlanShape(group, { aspect: planAspect, squareness: planSquareness }, innerDiameterMm / 2 + thicknessMm / 2)
    // Modeled solids are placed in world space by the user, so they are added
    // AFTER the ring's plan-shape bend (they don't follow it — including a
    // Flowed one, which wraps onto the ROUND rail of the same radius).
    for (const mesh of buildModelObjects(modelObjects, outerRadiusMm)) group.add(mesh)
    // Gems set along a modeled curve (Matrix's Gems on Curve) — real gems,
    // so they go in alongside the solids, not merged into the metal.
    for (const gem of buildRailGemMeshes(modelObjects)) group.add(gem)
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
  }, [fingerSize, widthMm, thicknessMm, profile, customProfile, modelObjects, backProfileOn, backProfile, planAspect, planSquareness, shankStyle, taperAmount, twists, splitStrandCount, includeMilgrain, includeRope, includeFlutes, fluteCount, includeGalleryWire, galleryWireCount, includeBandText, bandText, bandTextBold, includePattern, patternMotif, includeSidePanels, sidePanelShape, sidePanelWidthMm, sidePanelLengthMm, sidePanelText, sidePanelAngle0Deg, sidePanelAngle1Deg, logoSvgText, logoSizeMm, logoAngleDeg, includeSignetTop, signetShape, signetWidthMm, signetLengthMm, engraveText, engraveBold, includeStone, stoneShape, settingType, bezelCoverage, stoneDiameterMm, prongCount, prongHeightOverridesMm, prongDiameterOverridesMm, clusterPetalCount, clusterPetalStoneMm, excludedClusterKey, petalStoneDiameterOverridesMm, tensionActive, tensionGapDeg, fancyLengthMm, fancyWidthMm, haloEligible, haloCount, haloStoneMm, haloRingCount, excludedHaloKey, haloStoneDiameterOverridesMm, sideStoneCount, sideStoneCaratWeight, innerDiameterMm, includePave, paveSettingType, paveCount, paveStoneMm, sideSpreadDeg, excludedPaveKey, paveStoneDiameterOverridesMm, includeMatchingBand, matchingBandWidthMm, matchingBandCount, matchingBandOffsetOverridesMm, pointDirection])

  // Boolean cutters (modeled objects in Subtract mode) are consumed by the
  // union pass, so having any forces it even if "Merge" is off.
  const cutterMeshes = useMemo(() => buildCutterMeshes(modelObjects, outerRadiusMm), [modelObjects, outerRadiusMm])
  // Ghosts show EVERY cutter (also the ones aimed at one specific object).
  const ghostMeshes = useMemo(() => buildGhostMeshes(modelObjects, outerRadiusMm), [modelObjects, outerRadiusMm])
  // One object identity per real setting, so the viewer's own clipping
  // effect only re-runs when the section actually changes.
  const sectionPlane = useMemo(() => (sectionOn ? { axis: sectionAxis, offsetMm: sectionOffsetMm } : null), [sectionOn, sectionAxis, sectionOffsetMm])
  // Stone seats (Matrix's Cutters): read off the gems in the finished
  // model, so every setting type is covered without knowing about them.
  const seatCutters = useMemo(() => (cutStoneSeats ? buildStoneSeatCutters(model) : []), [cutStoneSeats, model])
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
    if (!mergeSolid && cutterMeshes.length === 0 && seatCutters.length === 0) return { displayModel: model, mergeError: null }
    try {
      const unioned = unionMetalParts(model, [...cutterMeshes, ...seatCutters])
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
  }, [model, mergeSolid, cutterMeshes, seatCutters])

  // Ring Re-Sizer — Matrix's own named tool, scoped here to an IMPORTED
  // file (the parametric design already has its own real fingerSize
  // control — "resizing" it is just changing that number, no separate
  // tool needed). An imported file carries no size metadata this app can
  // read, so resizing needs the user to say what size it currently IS —
  // same two-number "from/to" convention any real ring-sizer tool uses.
  // Uniform scale by the ratio of the two sizes' own inside diameters
  // (usSizeToDiameterMm, the same conversion every other size-driven
  // feature on this page already uses).
  const [resizeEnabled, setResizeEnabled] = useState(false)
  const [resizeCurrentSize, setResizeCurrentSize] = useState(6)
  const [resizeTargetSize, setResizeTargetSize] = useState(6)
  const resizeScaleFactor = usSizeToDiameterMm(resizeTargetSize) / usSizeToDiameterMm(resizeCurrentSize)

  // What the viewer/weight-estimate/export actually operate on — the
  // imported file when one's loaded, otherwise the parametric design.
  const viewModel = useMemo(() => {
    if (!importedModel) return displayModel
    if (!resizeEnabled || resizeScaleFactor === 1) return importedModel
    const wrapper = new THREE.Group()
    wrapper.add(importedModel.clone(true))
    wrapper.scale.setScalar(resizeScaleFactor)
    wrapper.updateMatrixWorld(true)
    return wrapper
  }, [importedModel, displayModel, resizeEnabled, resizeScaleFactor])

  // Viewer-only: the cut result plus a red ghost of each cutter so it can be
  // seen and placed. Exports, volume and pricing use displayModel (no ghosts).
  const viewerObject = useMemo(() => {
    if (ghostMeshes.length === 0) return viewModel
    const wrapper = new THREE.Group()
    wrapper.add(viewModel)
    for (const cutter of ghostMeshes) {
      const ghost = new THREE.Mesh(cutter.geometry.clone())
      ghost.userData = { ...cutter.userData, isCutterGhost: true }
      wrapper.add(ghost)
    }
    return wrapper
  }, [viewModel, ghostMeshes])


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
    setPaveStoneDiameterOverridesMm({})
  }
  const [haloCountSeen, setHaloCountSeen] = useState(haloCount)
  if (haloCountSeen !== haloCount) {
    setHaloCountSeen(haloCount)
    setExcludedHaloIndices([])
    setHaloStoneDiameterOverridesMm({})
  }
  const [clusterPetalCountSeen, setClusterPetalCountSeen] = useState(clusterPetalCount)
  if (clusterPetalCountSeen !== clusterPetalCount) {
    setClusterPetalCountSeen(clusterPetalCount)
    setExcludedClusterIndices([])
    setPetalStoneDiameterOverridesMm({})
  }
  const [matchingBandCountSeen, setMatchingBandCountSeen] = useState(matchingBandCount)
  if (matchingBandCountSeen !== matchingBandCount) {
    setMatchingBandCountSeen(matchingBandCount)
    setMatchingBandOffsetOverridesMm({})
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
    // Individual removals/size overrides only ever apply to pavé and to
    // halo's FIRST ring (matching the model useMemo's own
    // `ring === 0 ? excludedHaloIndices : undefined` convention) — priced
    // stone-by-stone for exactly that reason, rather than a flat
    // count×size that would silently ignore a per-instance size edit.
    if (haloEligible) {
      for (let i = 0; i < haloCount; i++) {
        if (excludedHaloIndices.includes(i)) continue
        const d = haloStoneDiameterOverridesMm[i] ?? haloStoneMm
        total += nearestDiamondPrice(caratFromRoundDiameterMm(d), diamondType)
      }
      if (haloRingCount > 1) {
        total += nearestDiamondPrice(caratFromRoundDiameterMm(haloStoneMm), diamondType) * haloCount * (haloRingCount - 1)
      }
    }
    if (includePave) {
      for (let i = 0; i < paveCount; i++) {
        if (excludedPaveIndices.includes(i)) continue
        const d = paveStoneDiameterOverridesMm[i] ?? paveStoneMm
        total += nearestDiamondPrice(caratFromRoundDiameterMm(d), diamondType)
      }
    }
    if (sideStoneCount > 0 && stoneShape === 'round' && settingType === 'prong' && !tensionActive) {
      total += nearestDiamondPrice(sideStoneCaratWeight, diamondType) * sideStoneCount
    }
    // Gems set along a modeled curve — same melee pricing as everything
    // else here, by their own diameter.
    for (const obj of modelObjects) {
      if (!obj.gems) continue
      total += nearestDiamondPrice(caratFromRoundDiameterMm(obj.gems.diameterMm), diamondType) * obj.gems.count
    }
    if (stoneShape === 'round' && settingType === 'cluster') {
      // Priced stone-by-stone now too (same fix already applied to
      // pavé/halo above), since a per-petal size override would otherwise
      // silently be ignored by a flat count×size.
      for (let i = 0; i < clusterPetalCount; i++) {
        if (excludedClusterIndices.includes(i)) continue
        const d = petalStoneDiameterOverridesMm[i] ?? clusterPetalStoneMm
        total += nearestDiamondPrice(caratFromRoundDiameterMm(d), diamondType)
      }
    }
    return total
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as estimatedStoneCost above: nearestDiamondPrice is a fresh closure every render, its real inputs (config, diamondType) are already listed below.
  }, [
    config, diamondType, haloEligible, haloStoneMm, haloCount, haloRingCount, excludedHaloKey, haloStoneDiameterOverridesMm,
    includePave, paveStoneMm, paveCount, excludedPaveKey, paveStoneDiameterOverridesMm,
    sideStoneCount, stoneShape, settingType, tensionActive, sideStoneCaratWeight,
    clusterPetalStoneMm, clusterPetalCount, excludedClusterKey, petalStoneDiameterOverridesMm, modelObjects,
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
    for (const obj of modelObjects) if (obj.gems) count += obj.gems.count
    return count
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as estimatedMeleeCost above: excludedHaloKey/excludedPaveKey/excludedClusterKey (joined-string stand-ins) are what's actually listed, not the arrays themselves — see where they're defined for why.
  }, [includeStone, includeSignetTop, haloEligible, haloCount, haloRingCount, excludedHaloKey, includePave, paveCount, excludedPaveKey, sideStoneCount, stoneShape, settingType, tensionActive, clusterPetalCount, excludedClusterKey, modelObjects])
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
  // Undo / redo (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z) over the whole parameter
  // set: every change to the design's parameters is snapshotted (debounced,
  // so dragging a slider is ONE step, not hundreds). Not covered, and
  // disclosed: things that aren't part of the saved parameter set —
  // imported files, the uploaded logo, and per-instance overrides.
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY)
  const skipRecordRef = useRef(false)
  const paramsKey = JSON.stringify(currentParams())
  useEffect(() => {
    if (skipRecordRef.current) { skipRecordRef.current = false; return }
    const timer = setTimeout(() => {
      setHistory(h => recordSnapshot(h, paramsKey))
    }, 350)
    return () => clearTimeout(timer)
  }, [paramsKey])
  const stepHistory = (dir: -1 | 1) => {
    const { history: next, snapshot } = stepHistoryState(history, paramsKey, dir)
    setHistory(next)
    if (snapshot === null) return false
    if (snapshot !== paramsKey) skipRecordRef.current = true
    applyParams(JSON.parse(snapshot) as CadDesignParams)
    return true
  }
  const canUndo = canUndoHistory(history, paramsKey)
  const canRedo = canRedoHistory(history)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text', 'number', 'search'].includes((el as HTMLInputElement).type)))
      if (typing) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); stepHistory(-1) }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); stepHistory(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const saveRenderImage = () => {
    const url = viewerRef.current?.snapshot()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseFilename()}-render.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
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

  // Command line (Rhino/Matrix's own "Command:" bar — see the CAD roadmap
  // memory's 2026-09-15 note: the user pushed back on treating this as a
  // deliberate divergence, so it's a REAL dispatcher onto this page's own
  // actions, not decorative). Setting-type commands also turn the stone on
  // and, for the round-only types, force the shape to round — otherwise
  // typing "cluster" with the stone off (or on a fancy shape) would look
  // like it silently did nothing, which defeats the point of a command
  // line being a fast, confident way to act.
  const [commandInput, setCommandInput] = useState('')
  const [commandLog, setCommandLog] = useState<{ cmd: string; result: string }[]>([])
  const runSettingCommand = (type: SettingType, roundOnly: boolean) => {
    setIncludeStone(true)
    setIncludeSignetTop(false)
    if (roundOnly) setStoneShape('round')
    setSettingType(type)
    setActiveTab('gems')
  }
  const runSideStoneCommand = (type: typeof paveSettingType) => {
    setIncludePave(true)
    setPaveSettingType(type)
    setActiveTab('gems')
  }
  const COMMAND_HELP = 'front · top · side · perspective · undo · redo · wireframe · section · render · raytrace · fullscreen · turntable · ringrail · gems · surface · model · production · prong · bezel · cluster · tension · illusion · halo · pave · channel · flush · bar · invisible · milgrain · rope · flutes · pattern · mirror · plain · tapered · twisted · split · cathedral · bypass · export · help'
  const runCommand = (raw: string) => {
    const cmd = raw.trim().toLowerCase()
    if (!cmd) return
    let result = 'Unknown command.'
    switch (cmd) {
      case 'front': case 'top': case 'side': case 'perspective':
        viewerRef.current?.setView(cmd); result = `View set to ${cmd}.`; break
      case 'wireframe': setWireframe(v => !v); result = 'Wireframe toggled.'; break
      case 'section': case 'clip': setSectionOn(v => !v); result = 'Section view toggled.'; break
      case 'fullscreen': case 'full': toggleFullscreen(); result = 'Full screen toggled.'; break
      case 'undo': result = stepHistory(-1) ? 'Undone.' : 'Nothing to undo.'; break
      case 'redo': result = stepHistory(1) ? 'Redone.' : 'Nothing to redo.'; break
      case 'raytrace': case 'pathtrace': setRenderMode(true); setPathTrace(v => !v); result = 'Ray tracing toggled.'; break
      case 'render': setRenderMode(v => !v); result = 'Render mode toggled.'; break
      case 'turntable': case 'rotate': setAutoRotate(v => !v); result = 'Turntable toggled.'; break
      case 'ringrail': case 'ring rail': setActiveTab('ringrail'); result = 'Switched to Ring Rail.'; break
      case 'gems': setActiveTab('gems'); result = 'Switched to Gems.'; break
      case 'surface': case 'solid': case 'solid/surface': setActiveTab('surface'); result = 'Switched to Solid/Surface.'; break
      case 'production': setActiveTab('production'); result = 'Switched to Production.'; break
      case 'model': case 'curve': setActiveTab('model'); result = 'Switched to Curve/Solid.'; break
      case 'prong': runSettingCommand('prong', false); result = 'Setting: prong.'; break
      case 'bezel': runSettingCommand('bezel', false); result = 'Setting: bezel.'; break
      case 'cluster': runSettingCommand('cluster', true); result = 'Setting: cluster.'; break
      case 'tension': runSettingCommand('tension', true); result = 'Setting: tension.'; break
      case 'illusion': runSettingCommand('illusion', true); result = 'Setting: illusion.'; break
      case 'halo': setIncludeHalo(true); setActiveTab('gems'); result = 'Halo enabled.'; break
      case 'pave': case 'pavé': runSideStoneCommand('pave'); result = 'Side stones: pavé.'; break
      case 'channel': runSideStoneCommand('channel'); result = 'Side stones: channel.'; break
      case 'flush': runSideStoneCommand('flush'); result = 'Side stones: flush.'; break
      case 'bar': runSideStoneCommand('bar'); result = 'Side stones: bar.'; break
      case 'invisible': runSideStoneCommand('invisible'); result = 'Side stones: invisible.'; break
      case 'milgrain': setIncludeMilgrain(true); setActiveTab('surface'); result = 'Milgrain enabled.'; break
      case 'rope': setIncludeRope(true); setActiveTab('surface'); result = 'Rope enabled.'; break
      case 'flute': case 'flutes': setIncludeFlutes(true); setActiveTab('surface'); result = 'Flutes enabled.'; break
      case 'pattern': setIncludePattern(true); setActiveTab('surface'); result = 'Pattern enabled.'; break
      case 'mirror': setPointDirection(d => d === 'up' ? 'down' : 'up'); result = 'Mirrored (point direction flipped).'; break
      case 'plain': case 'tapered': case 'twisted': case 'split': case 'cathedral': case 'bypass':
        setShankStyle(cmd); setActiveTab('ringrail'); result = `Shank style: ${cmd}.`; break
      case 'export': downloadModel(); result = `Exported as ${exportFormat.toUpperCase()}.`; break
      case 'help': case '?': result = COMMAND_HELP; break
      default: result = `Unknown command "${cmd}". Type "help" for the list.`
    }
    setCommandLog(prev => [...prev.slice(-4), { cmd: raw, result }])
    setCommandInput('')
  }

  return (
    <div className={fullscreen ? 'fixed inset-0 z-[200] space-y-3 overflow-y-auto bg-slate-100 p-3' : 'space-y-6'}>
      {!fullscreen && (
      <Card className="overflow-hidden rounded-[30px] border-0 text-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]" style={{ backgroundColor: 'var(--theme-primary)' }}>
        <CardContent className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
            <RotateCw className="h-4 w-4" /> CAD Design
            <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[9px] font-bold text-slate-900">Early preview</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Parametric solitaire ring</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Band (plain, tapered, twisted-ribbon, split-shank, cathedral or bypass/crossover), ring type (solitaire, three-stone,
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
            and solid/export, grouped into tabs named after Matrix's OWN real toolbar groups (Ring Rail, Gems,
            Solid/Surface — plus a Production tab this app adds on top, for checks/pricing/export) instead of one
            long form or this app's own invented categories.
            Click any part of the model in the viewer to select and identify it — click a single prong and you can
            edit its height on its own, a first real per-instance edit, not just a global slider. Import an existing
            STL/OBJ/3MF or .3dm file (Production tab) to view it right here too — the other half of the original ask. The center
            stone (every shape) is now a real faceted crown+pavilion, not a placeholder — a simplified "single cut"
            facet count, not full ideal-cut precision. This is not a Matrix/RhinoGold replacement yet — melee (pavé/
            halo/channel/etc.) and cluster petals still use simple bead proxies. Building toward full parity step by step.
          </p>
        </CardContent>
      </Card>
      )}

      <section className={fullscreen ? 'grid gap-3 lg:h-[calc(100vh-1.5rem)] lg:grid-cols-[minmax(340px,440px)_1fr]' : 'grid gap-4 lg:grid-cols-[1fr_1.3fr]'}>
        <Card className={`rounded-[30px] border border-white/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)] ${fullscreen ? 'lg:h-full lg:overflow-y-auto' : ''}`}>
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

            {/* Toolbar-style tab strip — icon above a small label, denser
                than a plain text-button row, following the same real
                Matrix reference the user shared (icon-first, dense
                groups) rather than this app's earlier plain pill tabs. */}
            <div className="grid grid-cols-5 gap-1 rounded-2xl bg-slate-100 p-1">
              {([
                ['ringrail', 'Ring Rail', Circle],
                ['gems', 'Gems', Gem],
                ['surface', 'Solid/Surface', Layers],
                ['model', 'Curve/Solid', PenTool],
                ['production', 'Production', Factory],
              ] as const).map(([tab, label, Icon]) => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition ${activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Icon className="h-4 w-4" />
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
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <div className="flex items-center gap-2">
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
                  {paveSettingType === 'pave' && (
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Size</span>
                      <input type="range" min={0.5} max={paveStoneMm * 2.5} step={0.05}
                        value={paveStoneDiameterOverridesMm[selectedPart.instanceIndex ?? 0] ?? paveStoneMm}
                        onChange={e => setPaveStoneDiameterOverridesMm(prev => ({ ...prev, [selectedPart.instanceIndex ?? 0]: Number(e.target.value) }))}
                        className="flex-1" />
                      <span className="w-14 shrink-0 text-right font-mono">
                        {(paveStoneDiameterOverridesMm[selectedPart.instanceIndex ?? 0] ?? paveStoneMm).toFixed(2)}mm
                      </span>
                      {selectedPart.instanceIndex !== undefined && paveStoneDiameterOverridesMm[selectedPart.instanceIndex] !== undefined && (
                        <button type="button"
                          onClick={() => setPaveStoneDiameterOverridesMm(prev => { const next = { ...prev }; delete next[selectedPart.instanceIndex!]; return next })}
                          className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                          Reset
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : canRemoveHaloInstance ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Size</span>
                    <input type="range" min={0.5} max={haloStoneMm * 2.5} step={0.05}
                      value={haloStoneDiameterOverridesMm[selectedPart.instanceIndex ?? 0] ?? haloStoneMm}
                      onChange={e => setHaloStoneDiameterOverridesMm(prev => ({ ...prev, [selectedPart.instanceIndex ?? 0]: Number(e.target.value) }))}
                      className="flex-1" />
                    <span className="w-14 shrink-0 text-right font-mono">
                      {(haloStoneDiameterOverridesMm[selectedPart.instanceIndex ?? 0] ?? haloStoneMm).toFixed(2)}mm
                    </span>
                    {selectedPart.instanceIndex !== undefined && haloStoneDiameterOverridesMm[selectedPart.instanceIndex] !== undefined && (
                      <button type="button"
                        onClick={() => setHaloStoneDiameterOverridesMm(prev => { const next = { ...prev }; delete next[selectedPart.instanceIndex!]; return next })}
                        className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              ) : canRemoveClusterInstance ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Size</span>
                    <input type="range" min={0.5} max={clusterPetalStoneMm * 2.5} step={0.05}
                      value={petalStoneDiameterOverridesMm[selectedPart.instanceIndex ?? 0] ?? clusterPetalStoneMm}
                      onChange={e => setPetalStoneDiameterOverridesMm(prev => ({ ...prev, [selectedPart.instanceIndex ?? 0]: Number(e.target.value) }))}
                      className="flex-1" />
                    <span className="w-14 shrink-0 text-right font-mono">
                      {(petalStoneDiameterOverridesMm[selectedPart.instanceIndex ?? 0] ?? clusterPetalStoneMm).toFixed(2)}mm
                    </span>
                    {selectedPart.instanceIndex !== undefined && petalStoneDiameterOverridesMm[selectedPart.instanceIndex] !== undefined && (
                      <button type="button"
                        onClick={() => setPetalStoneDiameterOverridesMm(prev => { const next = { ...prev }; delete next[selectedPart.instanceIndex!]; return next })}
                        className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              ) : selectedPart.name === 'Modeled solid' ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Selected <strong>{modelObjects[selectedPart.instanceIndex ?? 0]?.name ?? 'Modeled solid'}</strong> — edit its
                    sketch, height and position in the Curve/Solid tab. Click empty space to deselect.
                  </span>
                </div>
              ) : selectedPart.name === 'Logo' ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Selected <strong>Logo</strong> — drag it in the 3D view to reposition it around the band (Matrix's
                    "Move" transform tool), or use the slider on the Production tab. Click empty space to deselect.
                  </span>
                </div>
              ) : (selectedPart.name === 'Side panel' || selectedPart.name === 'Side panel text') ? (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Selected <strong>Side panel {(selectedPart.instanceIndex ?? 0) + 1}</strong> — drag it in the 3D
                    view to reposition it (Matrix's "Move" tool), independently of the other panel, or use its own
                    slider on the Solid/Surface tab. Click empty space to deselect.
                  </span>
                </div>
              ) : selectedPart.name === 'Matching band' && selectedPart.instanceIndex !== undefined ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <div className="flex items-center gap-2">
                    <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Selected <strong>Matching band {selectedPart.instanceIndex + 1}</strong> — drag it in the 3D
                      view along the band's width axis (Matrix's "Move" tool) to slide it closer or further out.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Offset</span>
                    <input type="range" min={widthMm / 2 + matchingBandWidthMm / 2} max={widthMm / 2 + matchingBandWidthMm / 2 + 25} step={0.1}
                      value={matchingBandOffsetOverridesMm[selectedPart.instanceIndex] ?? (widthMm / 2 + matchingBandWidthMm / 2 + 0.3 + selectedPart.instanceIndex * (matchingBandWidthMm + 0.3))}
                      onChange={e => setMatchingBandOffsetOverridesMm(prev => ({ ...prev, [selectedPart.instanceIndex!]: Number(e.target.value) }))}
                      className="flex-1" />
                    {matchingBandOffsetOverridesMm[selectedPart.instanceIndex] !== undefined && (
                      <button type="button"
                        onClick={() => setMatchingBandOffsetOverridesMm(prev => { const next = { ...prev }; delete next[selectedPart.instanceIndex!]; return next })}
                        className="shrink-0 rounded-lg border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
                        Reset
                      </button>
                    )}
                  </div>
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

            {activeTab === 'ringrail' && (
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
                  <div className="grid grid-cols-3 gap-2">
                    {(['flat', 'comfort', 'custom'] as const).map(p => (
                      <button key={p} type="button" onClick={() => setProfile(p)}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${profile === p ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <ToolIcon name={p} className="h-5 w-5" />
                        <span className="text-[9px] font-semibold leading-none">{p === 'flat' ? 'Flat band' : p === 'comfort' ? 'Comfort fit' : 'Free-form'}</span>
                      </button>
                    ))}
                  </div>
                  {profile === 'custom' && (
                    <div className="mt-2">
                      <p className="mb-1 text-[11px] font-semibold text-slate-500">{backProfileOn ? 'At the head (setting)' : 'Cross-section'}</p>
                      <ProfileEditor profile={customProfile} onChange={setCustomProfile} widthMm={widthMm} thicknessMm={thicknessMm} />
                      <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <span className="text-xs font-semibold text-slate-700">Different profile at the back
                          <span className="block text-[10px] font-normal text-slate-400">Matrix's Profile Placer — flows smoothly from the head profile to this one. Plain shank only.</span>
                        </span>
                        <input type="checkbox" checked={backProfileOn} onChange={e => setBackProfileOn(e.target.checked)} className="h-5 w-5 shrink-0 rounded border-slate-300" />
                      </label>
                      {backProfileOn && (
                        <div className="mt-2">
                          <p className="mb-1 text-[11px] font-semibold text-slate-500">At the back (opposite the setting)</p>
                          <ProfileEditor profile={backProfile} onChange={setBackProfile} widthMm={widthMm} thicknessMm={thicknessMm} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Ring shape (plan view)</label>
                  <PlanShapePicker shape={planShape} onChange={setPlanShape} />
                </div>

                <div>
                  <label className={labelCls}>Shank style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['plain', 'tapered', 'twisted', 'split', 'cathedral', 'bypass'] as const).map(s => (
                      <button key={s} type="button" onClick={() => setShankStyle(s)} disabled={tensionActive} title={s}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 capitalize transition disabled:cursor-not-allowed disabled:opacity-50 ${shankStyle === s ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <ToolIcon name={s} className="h-5 w-5" />
                        <span className="text-[9px] font-semibold leading-none">{s}</span>
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
                  {shankStyle === 'bypass' && !tensionActive && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      A named Ring Builder TYPE (bypass/"toi et moi" crossover) — two strands genuinely swap sides
                      (not just diverge and reconverge on the same side, like Split shank does) via a periodic
                      offset with no seam at the back. Built as two round wire-like strands rather than the full
                      band profile — an honest, scoped simplification, not the fully general case.
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
              </div>
            )}

            {activeTab === 'surface' && (
              <div className="space-y-5">
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
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {([false, true] as const).map(b => (
                        <button key={String(b)} type="button" onClick={() => setBandTextBold(b)}
                          className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${bandTextBold === b ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                          {b ? 'Bold' : 'Regular'}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const sizeMm = widthMm * 0.4
                      const widthNeeded = estimateBandTextWidthMm(bandText, sizeMm, bandTextBold)
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
                        className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 capitalize transition ${patternMotif === m ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                        <ToolIcon name={m} className="h-5 w-5" />
                        <span className="text-[9px] font-semibold leading-none">{m}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'gems' && (
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
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['oval', 'cushion', 'princess'] as const).map(s => (
                          <button key={s} type="button" onClick={() => setSignetShape(s)} title={STONE_SHAPE_LABELS[s]}
                            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 capitalize transition ${signetShape === s ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            <ShapeIcon shape={s} className="h-5 w-5" />
                            <span className="text-[9px] font-semibold leading-none">{s}</span>
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
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {([false, true] as const).map(b => (
                          <button key={String(b)} type="button" onClick={() => setEngraveBold(b)}
                            className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${engraveBold === b ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            {b ? 'Bold' : 'Regular'}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Matrix's own "Text on Curve"/"Text Objects" tools — raised only for now (not
                        debossed/carved), and scoped to this flat top face (wrapping text around the curved band
                        itself is a separate, harder future step). The bundled font doesn't have accented
                        characters (ñ/á/é/…) — they render as their plain letter instead
                        {engraveText && sanitizeForEngraving(engraveText, engraveBold) !== engraveText
                          ? ` (will render as "${sanitizeForEngraving(engraveText, engraveBold)}")`
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
                      <div className="grid grid-cols-5 gap-1.5">
                        {(Object.keys(STONE_SHAPE_LABELS) as StoneShape[]).map(shape => (
                          <button key={shape} type="button" onClick={() => selectStoneShape(shape)} title={STONE_SHAPE_LABELS[shape]}
                            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${stoneShape === shape ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            <ShapeIcon shape={shape} className="h-5 w-5" />
                            <span className="text-[9px] font-semibold leading-none">{STONE_SHAPE_LABELS[shape]}</span>
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
                            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${diamondType === t ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            <ToolIcon name={t} className="h-5 w-5" />
                            <span className="text-[9px] font-semibold leading-none">{t === 'lab-grown' ? 'Lab-grown' : 'Natural'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {stoneShape === 'round' && (
                      <div>
                        <label className={labelCls}>Setting type</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['prong', 'bezel', 'cluster', 'tension', 'illusion'] as const).map(t => (
                            <button key={t} type="button" onClick={() => setSettingType(t)} title={t}
                              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 capitalize transition ${settingType === t ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                              <ToolIcon name={t} className="h-5 w-5" />
                              <span className="text-[9px] font-semibold leading-none">{t}</span>
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
                              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${bezelCoverage === c ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                              <ToolIcon name={c} className="h-5 w-5" />
                              <span className="text-[9px] font-semibold leading-none">{c === 'half' ? 'Half bezel' : 'Full bezel'}</span>
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

            {activeTab === 'gems' && (
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
                          <button key={t} type="button" onClick={() => setPaveSettingType(t)} title={label}
                            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${paveSettingType === t ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                            <ToolIcon name={t} className="h-5 w-5" />
                            <span className="text-[9px] font-semibold leading-none">{label}</span>
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

            {activeTab === 'surface' && (
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
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">Cut the stone seats</span>
                    <input type="checkbox" checked={cutStoneSeats} onChange={e => setCutStoneSeats(e.target.checked)}
                      className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Matrix's "Cutters", built automatically from the gems in this design: a bearing at each girdle and a
                    hole down through the pavilion, so the stones genuinely drop in and light reaches them from below —
                    prong tips and bezel rims are left standing above the girdle, which is what holds the stone. It
                    forces the merge pass, and the metal it removes comes off the weight and the cost below.
                    {seatCutters.length > 0 && ` Cutting ${seatCutters.length} ${seatCutters.length === 1 ? 'seat' : 'seats'}.`}
                  </p>
                </div>

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
                        use. Two panels, each independently positioned (drag either one in the 3D view — Matrix's
                        "Move" tool — or use its own slider below); reuses the same flat-plate/raised-text
                        construction as the signet top.
                      </p>
                    </span>
                    <input type="checkbox" checked={includeSidePanels} onChange={e => setIncludeSidePanels(e.target.checked)}
                      className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                  </label>
                  {includeSidePanels && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <label className={labelCls}>Panel shape</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['oval', 'cushion', 'princess'] as const).map(s => (
                            <button key={s} type="button" onClick={() => setSidePanelShape(s)} title={STONE_SHAPE_LABELS[s]}
                              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 capitalize transition ${sidePanelShape === s ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                              <ShapeIcon shape={s} className="h-5 w-5" />
                              <span className="text-[9px] font-semibold leading-none">{s}</span>
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
                      <div>
                        <label className={labelCls}>Panel 1 position (°)</label>
                        <input type="range" min={-180} max={180} step={1} value={sidePanelAngle0Deg}
                          onChange={e => setSidePanelAngle0Deg(Number(e.target.value))} className="w-full" />
                        <p className="mt-1 text-[11px] text-slate-400">{sidePanelAngle0Deg}°</p>
                      </div>
                      <div>
                        <label className={labelCls}>Panel 2 position (°)</label>
                        <input type="range" min={-180} max={180} step={1} value={sidePanelAngle1Deg}
                          onChange={e => setSidePanelAngle1Deg(Number(e.target.value))} className="w-full" />
                        <p className="mt-1 text-[11px] text-slate-400">{sidePanelAngle1Deg}°</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'model' && (
              <ModelingPanel objects={modelObjects} onChange={setModelObjects} selectedId={selectedModelId} onSelect={setSelectedModelId}
                bandRadiusMm={outerRadiusMm} />
            )}

            {activeTab === 'production' && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="space-y-2">
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
                      <button type="button" onClick={() => { setImportedModel(null); setImportFileName(null); setImportError(null); setResizeEnabled(false) }}
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

                {importedModel && (
                  <div className="space-y-2 border-t border-slate-200 pt-3">
                    <label className="flex items-center justify-between gap-3">
                      <span>
                        <span className="text-sm font-semibold text-slate-900">Ring Re-Sizer</span>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          Matrix's own named tool — scoped here to an imported file (the parametric design above
                          already has its own real ring-size control, no separate resize step needed there). This
                          app can't read a size from the file itself, so tell it what size the file currently IS.
                        </p>
                      </span>
                      <input type="checkbox" checked={resizeEnabled} onChange={e => setResizeEnabled(e.target.checked)}
                        className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300" />
                    </label>
                    {resizeEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Current size</label>
                          <select value={resizeCurrentSize} onChange={e => setResizeCurrentSize(Number(e.target.value))} className={inputCls}>
                            {FINGER_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Target size</label>
                          <select value={resizeTargetSize} onChange={e => setResizeTargetSize(Number(e.target.value))} className={inputCls}>
                            {FINGER_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <p className="col-span-2 text-[11px] text-slate-400">
                          Uniform scale ×{resizeScaleFactor.toFixed(3)} — same inside-diameter conversion every
                          other size control on this page uses. A uniform scale changes EVERYTHING proportionally
                          (band width/thickness, any stones, engraving) — a real resize on an actual piece often
                          only stretches the shank, leaving the head/stones alone; this app doesn't model that
                          distinction yet.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'surface' && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-slate-900">Logo/artwork import</span>
                  <p className="text-[11px] text-slate-400">
                    Matrix's own "Logo import" — SVG only (it's already vector, unlike DXF/PNG which each need their
                    own separate parser, not built yet). Placed as a raised relief around the band — defaults
                    opposite the main setting (180°), a maker's-mark-style position.
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
                    <>
                      <div>
                        <label className={labelCls}>Logo size (mm, larger dimension)</label>
                        <input type="number" min={2} max={20} step={0.5} value={logoSizeMm}
                          onChange={e => setLogoSizeMm(Math.max(2, Number(e.target.value) || 2))} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Position around band (°)</label>
                        <input type="range" min={-180} max={180} step={1} value={logoAngleDeg}
                          onChange={e => setLogoAngleDeg(Number(e.target.value))} className="w-full" />
                        <p className="mt-1 text-[11px] text-slate-400">
                          {logoAngleDeg}° — or click the logo in the 3D view and drag it around the band directly
                          (Matrix's "Move" transform tool); dragging it away from the band's own surface has no
                          lasting effect, since only the angle is a real parameter — it snaps back to the band on
                          the next change.
                        </p>
                      </div>
                    </>
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
                  : (mergeSolid || cutterMeshes.length > 0 || seatCutters.length > 0) && !mergeError
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
            <ModelViewer3D ref={viewerRef} object={viewerObject} color={METAL_COLORS[metal]} onSelectPart={handleSelectPart}
              onMove={(partName, pos) => {
                // Band-attached parts are positioned by an ANGLE around the
                // band — recover it the same way attachHeadToBand's own
                // cos/sin position formula inverts (verified with a
                // throwaway script when this first shipped for the logo).
                const angleDeg = (Math.atan2(pos.z, pos.x) * 180) / Math.PI
                if (partName === 'Logo') setLogoAngleDeg(angleDeg)
                else if (partName === 'Side panel 1') setSidePanelAngle0Deg(angleDeg)
                else if (partName === 'Side panel 2') setSidePanelAngle1Deg(angleDeg)
                // The matching band is positioned by a plain linear offset
                // along Y instead (see its own build code) — use the
                // dragged Y directly, not an angle.
                else if (partName.startsWith('Matching band ')) {
                  const idx = Number(partName.slice('Matching band '.length)) - 1
                  if (!Number.isNaN(idx)) {
                    setMatchingBandOffsetOverridesMm(prev => ({ ...prev, [idx]: pos.y }))
                  }
                }
              }}
              sectionPlane={sectionPlane}
              autoRotate={autoRotate} wireframe={wireframe} renderMode={renderMode} pathTrace={pathTrace && renderMode} gem={GEM_LOOKS[gemLookKey] ?? DIAMOND_LOOK} onPathTraceSamples={n => samplesSetterRef.current?.(n)} className={fullscreen ? 'h-[calc(100vh-8rem)] min-h-[360px] w-full' : 'h-[420px] w-full sm:h-[520px]'} />
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
              <button type="button" onClick={() => stepHistory(-1)} disabled={!canUndo} title="Undo (Ctrl+Z)"
                className="rounded-xl bg-slate-900/80 px-2.5 py-2 text-white shadow-sm backdrop-blur transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40">
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => stepHistory(1)} disabled={!canRedo} title="Redo (Ctrl+Y)"
                className="rounded-xl bg-slate-900/80 px-2.5 py-2 text-white shadow-sm backdrop-blur transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40">
                <Redo2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={toggleFullscreen}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition ${fullscreen ? 'bg-amber-400 text-slate-900' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}>
                {fullscreen ? <Minimize2 className="h-3.5 w-3.5 shrink-0" /> : <Maximize2 className="h-3.5 w-3.5 shrink-0" />} {fullscreen ? 'Exit' : 'Full screen'}
              </button>
              {renderMode && (
                <button type="button" onClick={saveRenderImage}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-900/80 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur transition hover:bg-slate-900">
                  <Camera className="h-3.5 w-3.5 shrink-0" /> Save image
                </button>
              )}
              {renderMode && (
                <button type="button" onClick={() => setPathTrace(v => !v)}
                  title="Physically based ray tracing: real gem refraction, reflections and soft shadows. Needs a capable GPU."
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition ${pathTrace ? 'bg-amber-400 text-slate-900' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}>
                  <Aperture className="h-3.5 w-3.5 shrink-0" /> Ray trace
                  {pathTrace && <PathSamplesBadge setterRef={samplesSetterRef} />}
                </button>
              )}
              <button type="button" onClick={() => setRenderMode(v => !v)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition ${renderMode ? 'bg-amber-400 text-slate-900' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}>
                <Sparkles className="h-3.5 w-3.5 shrink-0" /> Render
              </button>
              <button type="button" onClick={() => setWireframe(v => !v)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition ${wireframe ? 'bg-amber-400 text-slate-900' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}>
                Wireframe
              </button>
              <button type="button" onClick={() => setSectionOn(v => !v)} title="Matrix's Clipping Plane — cut the view open to look inside (stone seats, wall thickness)"
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition ${sectionOn ? 'bg-amber-400 text-slate-900' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}>
                <Scissors className="h-3.5 w-3.5 shrink-0" /> Section
              </button>
              <button type="button" onClick={() => setAutoRotate(v => !v)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur transition ${autoRotate ? 'bg-amber-400 text-slate-900' : 'bg-slate-900/80 text-white hover:bg-slate-900'}`}>
                <RotateCw className={`h-3.5 w-3.5 shrink-0 ${autoRotate ? 'animate-spin' : ''}`} /> Turntable
              </button>
            </div>
            {renderMode && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-xl bg-slate-900/80 px-2 py-1.5 backdrop-blur">
                {Object.entries(GEM_LOOKS).map(([key, g]) => (
                  <button key={key} type="button" title={`${g.label} (IOR ${g.ior})`} onClick={() => setGemLookKey(key)}
                    className={`h-5 w-5 rounded-full border-2 transition ${gemLookKey === key ? 'border-amber-300 scale-110' : 'border-white/30'}`}
                    style={{ background: key === 'diamond' ? 'linear-gradient(135deg,#fff,#cfe6ff)' : g.color }} />
                ))}
              </div>
            )}
            {sectionOn && (
              <div className="absolute bottom-14 left-3 right-3 flex items-center gap-2 rounded-xl bg-slate-900/80 px-3 py-2 backdrop-blur sm:right-auto sm:w-80">
                <div className="flex gap-1">
                  {(['x', 'y', 'z'] as const).map(axis => (
                    <button key={axis} type="button" onClick={() => setSectionAxis(axis)}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold uppercase transition ${sectionAxis === axis ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                      {axis}
                    </button>
                  ))}
                </div>
                <input type="range" min={-20} max={20} step={0.1} value={sectionOffsetMm} className="flex-1"
                  onChange={e => setSectionOffsetMm(Number(e.target.value))} />
                <span className="w-14 shrink-0 text-right font-mono text-[11px] text-white">{sectionOffsetMm.toFixed(1)}mm</span>
              </div>
            )}
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
              {(['front', 'top', 'side', 'perspective'] as const satisfies readonly CameraView[]).map(view => (
                <button key={view} type="button" onClick={() => viewerRef.current?.setView(view)}
                  className="rounded-xl bg-slate-900/80 px-2.5 py-1.5 text-[11px] font-semibold capitalize text-white shadow-sm backdrop-blur transition hover:bg-slate-900">
                  {view}
                </button>
              ))}
            </div>
          </div>
          {/* Rhino/Matrix's own "Command:" bar — a real dispatcher onto
              this page's own actions (see runCommand), not decorative.
              Placed right under the viewport, same as the reference
              screenshot. Type "help" for the full list. */}
          <div className="border-t border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300">
            {commandLog.length > 0 && (
              <div className="mb-1.5 max-h-20 space-y-0.5 overflow-y-auto">
                {commandLog.map((entry, i) => (
                  <div key={i} className="truncate">
                    <span className="text-emerald-400">&gt;</span> {entry.cmd}
                    <span className="text-slate-500"> — {entry.result}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400">Command:</span>
              <input type="text" value={commandInput} onChange={e => setCommandInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runCommand(commandInput) }}
                placeholder="type a command, e.g. prong, halo, front, export — or help"
                className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-600 focus:outline-none" />
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}

/** Live "N samples" readout for the path tracer, isolated so its ~10 Hz
 *  updates re-render only this badge, not the whole CAD page. */
function PathSamplesBadge({ setterRef }: { setterRef: { current: ((n: number) => void) | null } }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setterRef.current = setN
    return () => { setterRef.current = null }
  }, [setterRef])
  return <span className="ml-1 font-mono text-[10px] opacity-70">{n} spp</span>
}

export default CadDesignPage
