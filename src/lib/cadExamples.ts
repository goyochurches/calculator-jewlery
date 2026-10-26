import type { CadDesignParams } from './cadPresets'

// ── Example designs — the "pre-built collections" half of a Content
//    Manager ──────────────────────────────────────────────────────────────
// `cadPresets` covers presets the user saves themselves, in their own
// browser. These are the ones that ship with the app: a starting library so
// the page opens onto real pieces instead of one default band, and so the
// CAD page can be demonstrated without building something first.
//
// Every design here is a complete, buildable parameter set, and each one
// respects the page's own feature rules rather than merely claiming a look:
// a halo only renders on a round stone that is not tension-set (see
// `haloEligible`), cluster and the flanking side stones are round-only, and
// a tension setting needs a round stone. A preset that set `includeHalo` on
// a marquise would load without complaint and show no halo at all, so none
// of them do that — the verification script builds all of them and checks
// the stone counts and metal weights come out where the names say.

/** Every required field, at values that make a plain, sane band. Each design
 *  below spreads this and overrides only what it is actually about, so the
 *  list reads as the difference between designs rather than seventy repeated
 *  numbers — and a new required parameter only has to be added here once. */
const BASE: CadDesignParams = {
  fingerSize: 6.5,
  widthMm: 2.4,
  thicknessMm: 1.7,
  profile: 'comfort',
  shankStyle: 'plain',
  taperAmount: 0.3,
  twists: 1,
  metal: 'gold-18k-white',
  includeStone: true,
  stoneShape: 'round',
  caratWeight: 1,
  diamondType: 'natural',
  fancyLengthMm: 8,
  fancyWidthMm: 6,
  settingType: 'prong',
  bezelCoverage: 'full',
  prongCount: 6,
  clusterPetalCount: 6,
  clusterPetalStoneMm: 1.4,
  includeHalo: false,
  haloCount: 16,
  haloStoneMm: 1.2,
  includePave: false,
  paveSettingType: 'pave',
  paveCount: 14,
  paveStoneMm: 1.3,
  mergeSolid: false,
  includeMilgrain: false,
  includeRope: false,
  cutStoneSeats: false,
}

export interface CadExample {
  id: string
  name: string
  /** One line a jeweller would recognise the piece by. */
  description: string
  /** Rough grouping for the picker; not used by the geometry. */
  family: 'Solitaire' | 'Halo' | 'Fancy cut' | 'Band' | 'Statement'
  params: CadDesignParams
}

export const CAD_EXAMPLES: CadExample[] = [
  {
    id: 'classic-solitaire',
    name: 'Classic solitaire',
    description: 'Round brilliant, six prongs, comfort-fit platinum band',
    family: 'Solitaire',
    params: {
      ...BASE,
      metal: 'platinum', caratWeight: 1, prongCount: 6,
      widthMm: 2.2, thicknessMm: 1.8,
    },
  },
  {
    id: 'knife-edge-solitaire',
    name: 'Knife-edge solitaire',
    description: 'Four prongs on a narrow tapered shank, 18k yellow',
    family: 'Solitaire',
    params: {
      ...BASE,
      metal: 'gold-18k-yellow', shankStyle: 'tapered', taperAmount: 0.45,
      profile: 'flat', widthMm: 2, thicknessMm: 1.6,
      prongCount: 4, caratWeight: 0.9,
    },
  },
  {
    id: 'cathedral-pave',
    name: 'Cathedral pavé',
    description: 'Cathedral shoulders rising to the head, eighteen pavé stones',
    family: 'Solitaire',
    params: {
      ...BASE,
      shankStyle: 'cathedral', caratWeight: 0.9, prongCount: 4,
      includePave: true, paveCount: 18, paveStoneMm: 1.2, sideSpreadDeg: 80,
      widthMm: 2.3,
    },
  },
  {
    id: 'classic-halo',
    name: 'Classic halo',
    description: 'Sixteen-stone halo over a round centre, pavé shoulders',
    family: 'Halo',
    params: {
      ...BASE,
      caratWeight: 0.8, prongCount: 4,
      includeHalo: true, haloCount: 16, haloStoneMm: 1.2,
      includePave: true, paveCount: 16, paveStoneMm: 1.2, sideSpreadDeg: 75,
    },
  },
  {
    id: 'double-halo-split',
    name: 'Double halo, split shank',
    description: 'Two halo rings on a two-strand split shank',
    family: 'Halo',
    params: {
      ...BASE,
      shankStyle: 'split', splitStrandCount: 2,
      caratWeight: 1, prongCount: 4,
      includeHalo: true, haloCount: 18, haloStoneMm: 1.1, haloRingCount: 2,
      includePave: true, paveCount: 20, paveStoneMm: 1.1, sideSpreadDeg: 90,
      widthMm: 2.6,
    },
  },
  {
    id: 'three-stone',
    name: 'Three stone',
    description: 'Round centre flanked by two smaller rounds, 18k yellow',
    family: 'Statement',
    params: {
      ...BASE,
      metal: 'gold-18k-yellow', caratWeight: 1.2, prongCount: 4,
      sideStoneCount: 2, sideStoneCaratWeight: 0.35,
      widthMm: 2.5, thicknessMm: 1.8,
    },
  },
  {
    id: 'oval-bezel',
    name: 'Oval bezel',
    description: 'Oval in a full bezel on a rose-gold band',
    family: 'Fancy cut',
    params: {
      ...BASE,
      metal: 'gold-18k-rose', stoneShape: 'oval',
      fancyLengthMm: 8.5, fancyWidthMm: 6.5, caratWeight: 1.5,
      settingType: 'bezel', bezelCoverage: 'full',
      widthMm: 2.3, thicknessMm: 1.8,
    },
  },
  {
    id: 'emerald-cut',
    name: 'Emerald cut',
    description: 'Step-cut emerald, four prongs, flat platinum band',
    family: 'Fancy cut',
    params: {
      ...BASE,
      metal: 'platinum', stoneShape: 'emerald',
      fancyLengthMm: 8, fancyWidthMm: 6, caratWeight: 1.6,
      prongCount: 4, profile: 'flat', widthMm: 2.4, thicknessMm: 1.9,
    },
  },
  {
    id: 'marquise-vintage',
    name: 'Marquise vintage',
    description: 'Marquise with milgrain edges and a rope shank',
    family: 'Fancy cut',
    params: {
      ...BASE,
      metal: 'gold-18k-yellow', stoneShape: 'marquise',
      fancyLengthMm: 10, fancyWidthMm: 5, caratWeight: 1,
      prongCount: 6, includeMilgrain: true, includeRope: true,
      widthMm: 2.6, thicknessMm: 1.8,
    },
  },
  {
    id: 'pear-bypass',
    name: 'Pear bypass',
    description: 'Pear on a bypass shank, point towards the nail',
    family: 'Fancy cut',
    params: {
      ...BASE,
      metal: 'gold-18k-rose', stoneShape: 'pear', shankStyle: 'bypass',
      fancyLengthMm: 9, fancyWidthMm: 6, caratWeight: 1.2,
      prongCount: 6, pointDirection: 'up', widthMm: 2.2,
    },
  },
  {
    id: 'tension-round',
    name: 'Tension set',
    description: 'Round held by the shank itself, no prongs, heavy platinum',
    family: 'Statement',
    params: {
      ...BASE,
      metal: 'platinum', settingType: 'tension', caratWeight: 1,
      widthMm: 3.2, thicknessMm: 2.4, profile: 'flat',
    },
  },
  {
    id: 'cluster-flower',
    name: 'Cluster flower',
    description: 'Seven-petal cluster reading as one larger stone',
    family: 'Statement',
    params: {
      ...BASE,
      metal: 'gold-18k-rose', settingType: 'cluster',
      clusterPetalCount: 7, clusterPetalStoneMm: 1.5, caratWeight: 0.5,
      widthMm: 2.2,
    },
  },
  {
    id: 'full-eternity',
    name: 'Full eternity',
    description: 'Forty stones all the way around, no centre stone',
    family: 'Band',
    params: {
      ...BASE,
      includeStone: false,
      includePave: true, paveCount: 40, paveStoneMm: 1.5, sideSpreadDeg: 180,
      widthMm: 2.6, thicknessMm: 1.9,
    },
  },
  {
    id: 'channel-band',
    name: 'Channel-set band',
    description: 'Half-eternity run of stones sunk in a channel',
    family: 'Band',
    params: {
      ...BASE,
      metal: 'gold-14k-white', includeStone: false,
      includePave: true, paveSettingType: 'channel',
      paveCount: 20, paveStoneMm: 1.7, sideSpreadDeg: 95,
      widthMm: 3, thicknessMm: 2,
    },
  },
  {
    id: 'twisted-rope-band',
    name: 'Twisted rope band',
    description: 'Two twists with a rope edge, plain 18k yellow',
    family: 'Band',
    params: {
      ...BASE,
      metal: 'gold-18k-yellow', includeStone: false,
      shankStyle: 'twisted', twists: 2, includeRope: true,
      widthMm: 3, thicknessMm: 2,
    },
  },
  {
    id: 'fluted-band',
    name: 'Fluted band',
    description: 'Ribbed band with a milgrain edge, no stone',
    family: 'Band',
    params: {
      ...BASE,
      metal: 'gold-14k-yellow', includeStone: false,
      includeFlutes: true, fluteCount: 14, includeMilgrain: true,
      widthMm: 3.4, thicknessMm: 2,
    },
  },
  {
    id: 'signet-engraved',
    name: 'Engraved signet',
    description: 'Oval signet top with raised initials, no stone',
    family: 'Statement',
    params: {
      ...BASE,
      metal: 'gold-18k-yellow', includeStone: false,
      includeSignetTop: true, signetShape: 'oval',
      signetWidthMm: 12, signetLengthMm: 14,
      engraveText: 'AB', engraveBold: true,
      widthMm: 3, thicknessMm: 2.1,
    },
  },
  {
    id: 'gallery-wire-halo',
    name: 'Gallery wire halo',
    description: 'Halo on a filigree basket, flush-set shoulders',
    family: 'Halo',
    params: {
      ...BASE,
      metal: 'gold-18k-white', caratWeight: 0.9, prongCount: 4,
      includeHalo: true, haloCount: 16, haloStoneMm: 1.1,
      includeGalleryWire: true, galleryWireCount: 8,
      includePave: true, paveSettingType: 'flush',
      paveCount: 12, paveStoneMm: 1.4, sideSpreadDeg: 70,
    },
  },
  {
    id: 'pattern-band',
    name: 'Patterned band',
    description: 'Leaf motifs repeating around a wide band',
    family: 'Band',
    params: {
      ...BASE,
      metal: 'gold-18k-rose', includeStone: false,
      includePattern: true, patternMotif: 'leaf',
      includeMilgrain: true, widthMm: 4, thicknessMm: 2,
    },
  },
  {
    id: 'hollow-comfort-band',
    name: 'Lightweight comfort band',
    description: 'Hollowed inside to cut metal weight, comfort fit',
    family: 'Band',
    params: {
      ...BASE,
      metal: 'gold-18k-yellow', includeStone: false,
      hollowShank: true, hollowDepthMm: 0.6, hollowWidthMm: 2,
      widthMm: 4.5, thicknessMm: 2.4,
    },
  },
]

export const CAD_EXAMPLE_FAMILIES = ['Solitaire', 'Halo', 'Fancy cut', 'Statement', 'Band'] as const

/** One example by id, or undefined — the picker passes an id straight from
 *  the list, but a stale id out of a saved link should not throw. */
export const findCadExample = (id: string): CadExample | undefined =>
  CAD_EXAMPLES.find(e => e.id === id)
