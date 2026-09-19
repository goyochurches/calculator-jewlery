import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  newModelObject, profileError, railError, sampleProfile, sampleRail2D,
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
  // For a Sweep object: which of its two sketches the canvas edits.
  const [editTarget, setEditTarget] = useState<'profile' | 'rail' | 'top'>('profile')
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

  const editingRail = selected?.op === 'sweep' && editTarget === 'rail' && !!selected.rail
  const editingTop = selected?.op === 'loft' && editTarget === 'top' && !!selected.topProfile
  const moveHandle = (index: number, clientX: number, clientY: number) => {
    if (!selected) return
    const pt = pointerMm(clientX, clientY)
    if (editingTop && selected.topProfile) {
      update(selected.id, { topProfile: { ...selected.topProfile, points: selected.topProfile.points.map((p, i) => (i === index ? pt : p)) } })
      return
    }
    if (editingRail && selected.rail) {
      update(selected.id, { rail: { ...selected.rail, points: selected.rail.points.map((p, i) => (i === index ? pt : p)) } })
      return
    }
    const points = selected.profile.points.map((p, i) => (i === index ? pt : p))
    update(selected.id, { profile: { ...selected.profile, points } })
  }

  const outline = selected ? sampleProfile(selected.profile) : []
  const selectedError = selected ? (profileError(selected.profile, selected.op) ?? (selected.op === 'sweep' ? railError(selected) : selected.op === 'loft' && selected.topProfile ? profileError(selected.topProfile, 'loft') : null)) : null
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
        {selected && editingRail && selected.rail && (
          <path d={pathOf(sampleRail2D(selected.rail), false)} fill="none" stroke="#0f766e" strokeWidth={2} />
        )}
        {selected && selected.op === 'loft' && selected.topProfile && (
          <path d={pathOf(sampleProfile(selected.topProfile), true)} fill="#bfdbfe" fillOpacity={editingTop ? 0.7 : 0.35} stroke="#1d4ed8" strokeWidth={editingTop ? 1.8 : 1} strokeDasharray={editingTop ? undefined : '4 3'} />
        )}
        {selected && !editingRail && !editingTop && outline.length > 0 && (
          <path d={pathOf(outline, true)} fill={selectedError ? '#fecaca' : '#fde68a'} fillOpacity={0.7} stroke={selectedError ? '#dc2626' : '#b45309'} strokeWidth={1.5} />
        )}
        {tool && draft.length > 0 && (() => {
          const prof = { kind: tool, points: draft }
          const shown = draft.length >= 2 && (tool === 'rectangle' || tool === 'circle') ? sampleProfile(prof) : draft
          return <path d={pathOf(shown, shown.length >= 3)} fill="none" stroke="#0f172a" strokeDasharray="4 3" strokeWidth={1.5} />
        })()}
        {(tool ? draft : editingRail ? selected?.rail?.points ?? [] : editingTop ? selected?.topProfile?.points ?? [] : selected?.profile.points ?? []).map((p, i) => (
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
          <button type="button" disabled={!!profileError(draftProfile, 'extrude')} onClick={() => { create('sweep'); setEditTarget('rail') }}
            title="Sweeps this shape along a rail curve you then shape (Rhino's Sweep 1 Rail)."
            className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Sweep</button>
          <button type="button" disabled={!!profileError(draftProfile, 'extrude')} onClick={() => { create('loft'); setEditTarget('top') }}
            title="Lofts this base shape to a second shape (starts as a 60% taper) that you then reshape."
            className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Loft</button>
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
            <div key={o.id} onClick={() => { onSelect(o.id); setTool(null); setDraft([]); setEditTarget('profile') }}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${o.id === selectedId ? 'border-slate-900 bg-white' : 'border-slate-200 bg-white/60'}`}>
              <span className="min-w-0 truncate">
                <strong className="font-semibold text-slate-800">{o.name}</strong>
                <span className="ml-1.5 text-slate-400">{o.op}{o.mode === 'subtract' ? ' · subtract' : o.mode === 'intersect' ? ' · intersect' : ''}{o.targetId && !objects.some(t => t.id === o.targetId) ? ' · target deleted' : ''}</span>
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
            <select className={numInput} value={selected.op} onChange={e => {
              const op = e.target.value as ModelOp
              update(selected.id, op === 'sweep' && !selected.rail ? { op, rail: newModelObject(selected.profile, 'sweep', 0).rail } : op === 'loft' && !selected.topProfile ? { op, topProfile: newModelObject(selected.profile, 'loft', 0).topProfile, twistDeg: 0 } : { op })
            }}>
              <option value="extrude">Extrude</option>
              <option value="revolve">Revolve</option>
              <option value="sweep">Sweep along rail</option>
              <option value="loft">Loft (2 sections)</option>
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
              <option value="intersect">Intersect — keep only the overlap</option>
            </select>
            {(selected.mode ?? 'add') !== 'add' && (
              <div className="mt-2 space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Applies to</label>
                <select className={numInput} value={selected.targetId ?? ''} onChange={e => update(selected.id, { targetId: e.target.value || undefined })}>
                  <option value="">Everything (ring + all added solids)</option>
                  {objects.filter(o => o.id !== selected.id && (o.mode ?? 'add') === 'add').map(o => (
                    <option key={o.id} value={o.id}>Only: {o.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-amber-600">
                  {selected.mode === 'intersect' ? 'Green' : 'Red'} ghost while designing.
                  {selected.targetId ? ' Applied to that one solid before it joins the design.' : ' Whole-design boolean (beta) — the ring is merged into one solid.'}
                </p>
              </div>
            )}
          </div>
          {selected.op === 'sweep' && selected.rail && (
            <div className="col-span-2 space-y-2 rounded-xl border border-teal-200 bg-teal-50/50 p-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                {(['profile', 'rail'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setEditTarget(t)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${editTarget === t ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                    Edit {t}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rail plane</label>
                  <select className={numInput} value={selected.rail.plane}
                    onChange={e => update(selected.id, { rail: { ...selected.rail!, plane: e.target.value as ModelPlane } })}>
                    <option value="top">Top (XZ)</option>
                    <option value="front">Front (XY)</option>
                    <option value="right">Right (ZY)</option>
                  </select>
                </div>
                <label className="mt-5 flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={selected.rail.closed} className="h-4 w-4 rounded border-slate-300"
                    onChange={e => update(selected.id, { rail: { ...selected.rail!, closed: e.target.checked } })} />
                  Closed loop
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600"
                  onClick={() => {
                    const pts = selected.rail!.points
                    const last = pts[pts.length - 1], prev = pts[pts.length - 2] ?? { x: last.x - 4, y: last.y }
                    update(selected.id, { rail: { ...selected.rail!, points: [...pts, { x: last.x + (last.x - prev.x), y: last.y + (last.y - prev.y) }] } })
                  }}>Add rail point</button>
                <button type="button" disabled={selected.rail.points.length <= 2}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-40"
                  onClick={() => update(selected.id, { rail: { ...selected.rail!, points: selected.rail!.points.slice(0, -1) } })}>Remove last</button>
              </div>
              <p className="text-[10px] text-slate-500">The profile keeps facing along the rail. It must fit inside the rail's tightest bend.</p>
            </div>
          )}
          {selected.op === 'loft' && selected.topProfile && (
            <div className="col-span-2 space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                {([['profile', 'Edit base'], ['top', 'Edit top']] as const).map(([t, label]) => (
                  <button key={t} type="button" onClick={() => setEditTarget(t)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${editTarget === t ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Twist ({(selected.twistDeg ?? 0).toFixed(0)}°)</label>
                <input type="range" min={-180} max={180} step={5} value={selected.twistDeg ?? 0} className="w-full"
                  onChange={e => update(selected.id, { twistDeg: Number(e.target.value) })} />
              </div>
              <p className="text-[10px] text-slate-500">Base = amber, top = blue. The two shapes are matched by arc length, so keep their outlines roughly similar to avoid a pinched loft.</p>
            </div>
          )}
          {(selected.op === 'extrude' || selected.op === 'loft') && (
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
          <div className="col-span-2 space-y-2 rounded-xl border border-violet-200 bg-violet-50/40 p-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Transform (Rhino: Rotate · Scale · Mirror · Array)</span>
            {(['x', 'y', 'z'] as const).map(axis => {
              const rot = selected.rotationDeg ?? { x: 0, y: 0, z: 0 }
              return (
                <div key={axis}>
                  <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Rotate {axis.toUpperCase()} ({rot[axis].toFixed(0)}°)</label>
                  <input type="range" min={-180} max={180} step={5} value={rot[axis]} className="w-full"
                    onChange={e => update(selected.id, { rotationDeg: { ...rot, [axis]: Number(e.target.value) } })} />
                </div>
              )
            })}
            <div>
              <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Scale ({(selected.scale ?? 1).toFixed(2)}×, about its own origin)</label>
              <input type="range" min={0.2} max={3} step={0.05} value={selected.scale ?? 1} className="w-full"
                onChange={e => update(selected.id, { scale: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Mirror copy across</label>
                <select className={numInput} value={selected.mirror ?? ''} onChange={e => update(selected.id, { mirror: (e.target.value || undefined) as ModelObject['mirror'] })}>
                  <option value="">None</option>
                  <option value="x">YZ plane (flip X)</option>
                  <option value="y">XZ plane (flip Y)</option>
                  <option value="z">XY plane (flip Z)</option>
                </select>
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Array</label>
                <select className={numInput} value={selected.array?.kind ?? ''} onChange={e => {
                  const kind = e.target.value
                  update(selected.id, { array: kind === 'linear' ? { kind: 'linear', count: 3, step: { x: 5, y: 0, z: 0 } } : kind === 'polar' ? { kind: 'polar', count: 6, axis: 'y', totalDeg: 360 } : undefined })
                }}>
                  <option value="">None</option>
                  <option value="linear">Linear</option>
                  <option value="polar">Polar (around an axis)</option>
                </select>
              </div>
            </div>
            {selected.array && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Copies</label>
                  <input type="number" min={2} max={100} step={1} className={numInput} value={selected.array.count}
                    onChange={e => update(selected.id, { array: { ...selected.array!, count: Math.max(2, Math.min(100, Math.round(Number(e.target.value) || 2))) } as ModelObject['array'] })} />
                </div>
                {selected.array.kind === 'linear' ? (['x', 'y', 'z'] as const).map(axis => (
                  <div key={axis}>
                    <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Step {axis.toUpperCase()} (mm)</label>
                    <input type="number" step={0.5} className={numInput} value={selected.array!.kind === 'linear' ? selected.array!.step[axis] : 0}
                      onChange={e => { const arr = selected.array!; if (arr.kind === 'linear') update(selected.id, { array: { ...arr, step: { ...arr.step, [axis]: Number(e.target.value) || 0 } } }) }} />
                  </div>
                )) : (
                  <>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Axis</label>
                      <select className={numInput} value={selected.array.axis} onChange={e => { const arr = selected.array!; if (arr.kind === 'polar') update(selected.id, { array: { ...arr, axis: e.target.value as 'x' | 'y' | 'z' } }) }}>
                        <option value="y">Y (ring axis)</option>
                        <option value="x">X</option>
                        <option value="z">Z</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Total °</label>
                      <input type="number" min={10} max={360} step={10} className={numInput} value={selected.array.totalDeg}
                        onChange={e => { const arr = selected.array!; if (arr.kind === 'polar') update(selected.id, { array: { ...arr, totalDeg: Math.max(10, Math.min(360, Number(e.target.value) || 360)) } }) }} />
                    </div>
                  </>
                )}
              </div>
            )}
            <p className="text-[10px] text-slate-500">Mirror and polar arrays use the world origin (the ring's centre). Copies that touch are merged into one solid.</p>
          </div>
          <p className="col-span-2 text-[10px] text-slate-400">
            Drag the round handles on the sketch to reshape it. Revolve turns the shape around the vertical axis (x = 0)
            in the sketch, full 360°. The ring's own axis is Y; the head sits on +X.
          </p>
        </div>
      )}
    </div>
  )
}
