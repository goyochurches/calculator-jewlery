import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  newModelObject, profileError, sampleProfile,
  type ModelObject, type ModelMode, type ModelOp, type ModelPlane, type Point2, type ProfileKind,
} from '@/lib/modeling'

interface ModelingPanelProps {
  objects: ModelObject[]
  onChange: (next: ModelObject[]) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const SIZE = 300
const PX_PER_MM = 7.5 // ±20 mm visible
const SNAP_MM = 0.5
const toPx = (mm: number) => SIZE / 2 + mm * PX_PER_MM
const toMm = (px: number) => Math.round(((px - SIZE / 2) / PX_PER_MM) / SNAP_MM) * SNAP_MM

const TOOLS: { kind: ProfileKind; label: string; hint: string }[] = [
  { kind: 'polyline', label: 'Polyline', hint: 'Click each corner (3+), then Extrude or Revolve.' },
  { kind: 'spline', label: 'Curve', hint: 'Click points the smooth closed curve passes through (3+).' },
  { kind: 'rectangle', label: 'Rectangle', hint: 'Click two opposite corners.' },
  { kind: 'circle', label: 'Circle', hint: 'Click the center, then a point on the circle.' },
]

const pathOf = (pts: { x: number; y: number }[], close: boolean) =>
  pts.length ? `M${pts.map(p => `${toPx(p.x).toFixed(1)},${toPx(-p.y).toFixed(1)}`).join('L')}${close ? 'Z' : ''}` : ''

/** Rhino-style Curve/Solid workspace (first slice): sketch a closed curve on
 *  a construction plane, then Extrude or Revolve it into a solid. Objects
 *  stay editable — drag a handle or change the height and the 3D solid is
 *  rebuilt. */
export function ModelingPanel({ objects, onChange, selectedId, onSelect }: ModelingPanelProps) {
  const [tool, setTool] = useState<ProfileKind | null>(null)
  const [draft, setDraft] = useState<Point2[]>([])
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<number | null>(null)
  const selected = objects.find(o => o.id === selectedId) ?? null

  const pointerMm = (clientX: number, clientY: number): Point2 => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: toMm(((clientX - rect.left) / rect.width) * SIZE), y: -toMm(((clientY - rect.top) / rect.height) * SIZE) }
  }

  const update = (id: string, patch: Partial<ModelObject>) => onChange(objects.map(o => (o.id === id ? { ...o, ...patch } : o)))

  const onCanvasClick = (e: React.MouseEvent) => {
    if (!tool) return
    const pt = pointerMm(e.clientX, e.clientY)
    const two = tool === 'rectangle' || tool === 'circle'
    setDraft(prev => (two && prev.length >= 2 ? [pt] : [...prev, pt]))
  }

  const draftProfile = { kind: tool ?? 'polyline', points: draft } as const
  const draftError = tool && draft.length ? profileError(draftProfile, 'extrude') : 'Draw a shape first.'
  const create = (op: ModelOp) => {
    if (!tool) return
    if (profileError(draftProfile, op)) return
    const obj = newModelObject({ kind: tool, points: draft }, op, objects.length)
    onChange([...objects, obj])
    onSelect(obj.id)
    setDraft([]); setTool(null)
  }

  const moveHandle = (index: number, clientX: number, clientY: number) => {
    if (!selected) return
    const pt = pointerMm(clientX, clientY)
    const points = selected.profile.points.map((p, i) => (i === index ? pt : p))
    update(selected.id, { profile: { ...selected.profile, points } })
  }

  const outline = selected ? sampleProfile(selected.profile) : []
  const selectedError = selected ? profileError(selected.profile, selected.op) : null
  const numInput = 'w-full rounded-lg border border-slate-200 px-2 py-1 text-xs'

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
      <div>
        <span className="text-sm font-semibold text-slate-900">Curve / Solid</span>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Rhino's Curve → Extrude / Revolve, the general modeling core Matrix is built on. Sketch a closed shape,
          turn it into a solid; it joins the ring as metal (counts in weight, export and Merge). Grid = 1 mm, snap 0.5 mm.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {TOOLS.map(t => (
          <button key={t.kind} type="button" onClick={() => { setTool(t.kind); setDraft([]); onSelect(null) }}
            className={`rounded-lg border px-1 py-1.5 text-[10px] font-semibold transition ${tool === t.kind ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tool && <p className="text-[11px] text-slate-500">{TOOLS.find(t => t.kind === tool)?.hint}</p>}

      <svg ref={svgRef} viewBox={`0 0 ${SIZE} ${SIZE}`} onClick={onCanvasClick}
        onPointerMove={e => { if (drag.current !== null) moveHandle(drag.current, e.clientX, e.clientY) }}
        onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}
        className={`w-full touch-none select-none rounded-xl border border-slate-200 bg-white ${tool ? 'cursor-crosshair' : ''}`}>
        {Array.from({ length: 41 }, (_, i) => i - 20).map(mm => (
          <g key={mm}>
            <line x1={toPx(mm)} x2={toPx(mm)} y1={0} y2={SIZE} stroke={mm === 0 ? '#94a3b8' : mm % 5 === 0 ? '#cbd5e1' : '#eef2f7'} strokeWidth={mm === 0 ? 1.2 : 1} />
            <line y1={toPx(mm)} y2={toPx(mm)} x1={0} x2={SIZE} stroke={mm === 0 ? '#94a3b8' : mm % 5 === 0 ? '#cbd5e1' : '#eef2f7'} strokeWidth={mm === 0 ? 1.2 : 1} />
          </g>
        ))}
        {selected && outline.length > 0 && (
          <path d={pathOf(outline, true)} fill={selectedError ? '#fecaca' : '#fde68a'} fillOpacity={0.7} stroke={selectedError ? '#dc2626' : '#b45309'} strokeWidth={1.5} />
        )}
        {tool && draft.length > 0 && (() => {
          const prof = { kind: tool, points: draft }
          const shown = draft.length >= 2 && (tool === 'rectangle' || tool === 'circle') ? sampleProfile(prof) : draft
          return <path d={pathOf(shown, shown.length >= 3)} fill="none" stroke="#0f172a" strokeDasharray="4 3" strokeWidth={1.5} />
        })()}
        {(tool ? draft : selected?.profile.points ?? []).map((p, i) => (
          <circle key={i} cx={toPx(p.x)} cy={toPx(-p.y)} r={5} fill="#fff" stroke="#0f172a" strokeWidth={2}
            className={!tool ? 'cursor-move' : ''}
            onPointerDown={e => { if (tool) return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = i }}
            onClick={e => e.stopPropagation()} />
        ))}
      </svg>

      {tool && (
        <div className="flex items-center gap-2">
          <button type="button" disabled={!!profileError(draftProfile, 'extrude')} onClick={() => create('extrude')}
            className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Extrude</button>
          <button type="button" disabled={!!profileError(draftProfile, 'revolve')} onClick={() => create('revolve')}
            title="Revolves around the vertical axis (x = 0); the whole shape must be on its right side."
            className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Revolve</button>
          <button type="button" onClick={() => setDraft([])}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600">Clear</button>
        </div>
      )}
      {tool && draft.length > 0 && draftError && <p className="text-[11px] text-amber-600">{draftError}</p>}

      <div className="space-y-1.5">
        {objects.length === 0 && <p className="text-[11px] text-slate-400">No modeled objects yet — pick a tool and draw.</p>}
        {objects.map(o => {
          const err = profileError(o.profile, o.op)
          return (
            <div key={o.id} onClick={() => { onSelect(o.id); setTool(null); setDraft([]) }}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${o.id === selectedId ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white/60'}`}>
              <span className="min-w-0 truncate">
                <strong className="font-semibold text-slate-800">{o.name}</strong>
                <span className="ml-1.5 text-slate-400">{o.op}{o.mode === 'subtract' ? ' · cutter' : ''}</span>
                {err && <span className="ml-1.5 text-rose-600">· {err}</span>}
              </span>
              <button type="button" title="Delete" onClick={e => { e.stopPropagation(); onChange(objects.filter(x => x.id !== o.id)); if (o.id === selectedId) onSelect(null) }}
                className="shrink-0 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
          <div className="col-span-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Name</label>
            <input className={numInput} value={selected.name} onChange={e => update(selected.id, { name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Operation</label>
            <select className={numInput} value={selected.op} onChange={e => update(selected.id, { op: e.target.value as ModelOp })}>
              <option value="extrude">Extrude</option>
              <option value="revolve">Revolve</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plane</label>
            <select className={numInput} value={selected.plane} onChange={e => update(selected.id, { plane: e.target.value as ModelPlane })}>
              <option value="front">Front (XY)</option>
              <option value="top">Top (XZ)</option>
              <option value="right">Right (ZY)</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mode</label>
            <select className={numInput} value={selected.mode ?? 'add'} onChange={e => update(selected.id, { mode: e.target.value as ModelMode })}>
              <option value="add">Add — part of the ring's metal</option>
              <option value="subtract">Subtract — cutter (Boolean difference)</option>
            </select>
            {selected.mode === 'subtract' && (
              <p className="mt-1 text-[10px] text-amber-600">Shown as a red ghost while designing; it removes its volume from the metal (beta boolean — the ring is merged into one solid).</p>
            )}
          </div>
          {selected.op === 'extrude' && (
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Height ({selected.heightMm.toFixed(1)} mm)</label>
              <input type="range" min={0.2} max={20} step={0.1} value={selected.heightMm} className="w-full"
                onChange={e => update(selected.id, { heightMm: Number(e.target.value) })} />
            </div>
          )}
          {(['x', 'y', 'z'] as const).map(axis => (
            <div key={axis}>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Offset {axis.toUpperCase()} (mm)</label>
              <input type="number" step={0.5} className={numInput} value={selected.offsetMm[axis]}
                onChange={e => update(selected.id, { offsetMm: { ...selected.offsetMm, [axis]: Number(e.target.value) || 0 } })} />
            </div>
          ))}
          <p className="col-span-2 text-[10px] text-slate-400">
            Drag the round handles on the sketch to reshape it. Revolve turns the shape around the vertical axis (x = 0)
            in the sketch, full 360°. The ring's own axis is Y; the head sits on +X.
          </p>
        </div>
      )}
    </div>
  )
}
