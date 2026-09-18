import { useRef } from 'react'
import {
  BAND_PROFILE_PRESETS, CUSTOM_PROFILE_SAMPLES, sampleProfileCurve, type CustomBandProfile,
} from '@/lib/ringGeometry'

interface ProfileEditorProps {
  profile: CustomBandProfile
  onChange: (next: CustomBandProfile) => void
  /** Real band width/thickness (mm) — only used to draw the cross-section
   *  at its true proportions, so what you edit looks like what you get. */
  widthMm: number
  thicknessMm: number
}

const W = 300
const PAD = 14
const MIN_WALL = 0.05

/** Closed outline path of a profile inside a `w`×`h` box, u=1 at the top. */
function outlinePath(p: CustomBandProfile, w: number, h: number, pad = 0): string {
  const inner = sampleProfileCurve(p.inner, p.smooth)
  const outer = sampleProfileCurve(p.outer, p.smooth)
  const m = inner.length
  const X = (i: number) => pad + (i / (m - 1)) * (w - 2 * pad)
  const Y = (u: number) => pad + (1 - u) * (h - 2 * pad)
  const pts: string[] = []
  for (let i = 0; i < m; i++) pts.push(`${X(i).toFixed(1)},${Y(inner[i]).toFixed(1)}`)
  for (let i = m - 1; i >= 0; i--) pts.push(`${X(i).toFixed(1)},${Y(Math.max(outer[i], inner[i] + MIN_WALL)).toFixed(1)}`)
  return `M${pts.join('L')}Z`
}

/** Matrix-style profile editor: drag the round handles on the outer (top)
 *  and inner (bottom) faces to reshape the band's cross-section. The shape
 *  can't self-intersect by construction (two height curves over the width),
 *  so any drag gives a valid, printable band. */
export function ProfileEditor({ profile, onChange, widthMm, thicknessMm }: ProfileEditorProps) {
  const H = Math.round(Math.min(230, Math.max(110, (W - 2 * PAD) * (thicknessMm / Math.max(widthMm, 0.5)) + 2 * PAD)))
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ face: 'outer' | 'inner'; index: number } | null>(null)

  const setHeight = (face: 'outer' | 'inner', index: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const yPx = ((clientY - rect.top) / rect.height) * H
    const u = Math.min(1, Math.max(0, 1 - (yPx - PAD) / (H - 2 * PAD)))
    const next = { ...profile, outer: [...profile.outer], inner: [...profile.inner] }
    next[face][index] = face === 'outer'
      ? Math.max(u, next.inner[index] + MIN_WALL)
      : Math.min(u, next.outer[index] - MIN_WALL)
    onChange(next)
  }

  const X = (i: number) => PAD + (i / (CUSTOM_PROFILE_SAMPLES - 1)) * (W - 2 * PAD)
  const Y = (u: number) => PAD + (1 - u) * (H - 2 * PAD)

  return (
    <div className="space-y-2">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none rounded-xl border border-slate-200 bg-slate-50"
        onPointerMove={e => { if (drag.current) setHeight(drag.current.face, drag.current.index, e.clientY) }}
        onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
        <line x1={PAD} x2={W - PAD} y1={Y(0)} y2={Y(0)} stroke="#cbd5e1" strokeDasharray="3 3" />
        <text x={PAD} y={Y(0) + 11} fontSize="8" fill="#94a3b8">finger side</text>
        <text x={PAD} y={PAD - 4} fontSize="8" fill="#94a3b8">outside</text>
        <path d={outlinePath(profile, W, H, PAD)} fill="#fde68a" stroke="#b45309" strokeWidth={1.5} strokeLinejoin="round" />
        {(['outer', 'inner'] as const).flatMap(face => profile[face].map((u, i) => (
          <circle key={`${face}${i}`} cx={X(i)} cy={Y(u)} r={5.5} fill="#fff" stroke={face === 'outer' ? '#0f172a' : '#475569'} strokeWidth={2}
            className="cursor-ns-resize"
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { face, index: i } }} />
        )))}
      </svg>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={profile.smooth} onChange={e => onChange({ ...profile, smooth: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300" />
          Smooth curves
        </label>
        <span className="text-[10px] text-slate-400">Drag the handles up/down</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {Object.entries(BAND_PROFILE_PRESETS).map(([key, preset]) => (
          <button key={key} type="button" title={preset.label}
            onClick={() => onChange({ ...preset.profile, outer: [...preset.profile.outer], inner: [...preset.profile.inner] })}
            className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-1.5 text-slate-600 transition hover:border-slate-400">
            <svg viewBox="0 0 40 30" className="h-6 w-8">
              <path d={outlinePath(preset.profile, 40, 30, 3)} fill="currentColor" fillOpacity={0.15} stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
            </svg>
            <span className="text-[8px] font-semibold leading-none">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
