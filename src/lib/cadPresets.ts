// ── Content Manager (module 22 in the CAD roadmap's master list) ──────────
// Save/reuse a full set of CAD Design parameters as a named preset, instead
// of re-entering every number from scratch each session. Honest v1: stored
// in this browser's own localStorage, NOT synced across devices or team
// members (a real "scoped to the shop" content manager would need a
// backend table/endpoint — a bigger lift, not done here; disclosed in the
// UI rather than implied).

export interface CadDesignParams {
  fingerSize: number
  widthMm: number
  thicknessMm: number
  profile: string
  shankStyle: string
  taperAmount: number
  twists: number
  metal: string
  includeStone: boolean
  stoneShape: string
  caratWeight: number
  diamondType: string
  fancyLengthMm: number
  fancyWidthMm: number
  settingType: string
  bezelCoverage: string
  prongCount: number
  clusterPetalCount: number
  clusterPetalStoneMm: number
  includeHalo: boolean
  haloCount: number
  haloStoneMm: number
  includePave: boolean
  paveSettingType: string
  paveCount: number
  paveStoneMm: number
  mergeSolid: boolean
  includeMilgrain: boolean
  includeRope: boolean
}

export interface SavedCadPreset {
  id: string
  name: string
  savedAt: string
  params: CadDesignParams
}

const STORAGE_KEY = 'cad-design-presets'

/** Every localStorage read/write is wrapped — private browsing, cleared
 *  site data, or a full quota can all throw or silently no-op, and this
 *  feature should degrade to "no presets" rather than crash the page. */
export function listCadPresets(): SavedCadPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePresets(presets: SavedCadPreset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}

export function saveCadPreset(name: string, params: CadDesignParams): SavedCadPreset | null {
  const preset: SavedCadPreset = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    savedAt: new Date().toISOString(),
    params,
  }
  const ok = writePresets([...listCadPresets(), preset])
  return ok ? preset : null
}

export function deleteCadPreset(id: string): boolean {
  return writePresets(listCadPresets().filter(p => p.id !== id))
}
