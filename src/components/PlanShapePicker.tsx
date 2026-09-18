import { PLAN_SHAPE_PRESETS, makePlanShapeRadius, type PlanShape } from '@/lib/ringGeometry'

interface PlanShapePickerProps {
  shape: PlanShape
  onChange: (next: PlanShape) => void
}

/** Closed outline of the ring seen down the finger axis, inside a size×size
 *  box (head axis = horizontal), drawn from the SAME radius function the 3D
 *  model uses so the icon is exactly the shape you get. */
function shapeOutline(shape: PlanShape, size: number, scale = 0.42): string {
  const f = makePlanShapeRadius(shape)
  const pts: string[] = []
  const N = 72
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    const r = f(t) * size * scale
    pts.push(`${(size / 2 + r * Math.cos(t)).toFixed(1)},${(size / 2 + r * Math.sin(t)).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

const sameShape = (a: PlanShape, b: PlanShape) =>
  Math.abs(a.aspect - b.aspect) < 1e-6 && Math.abs(a.squareness - b.squareness) < 1e-6

/** Ring plan-view shape picker (Matrix's Ring Rail shape): presets drawn as
 *  their own outline, plus sliders for aspect and squareness. */
export function PlanShapePicker({ shape, onChange }: PlanShapePickerProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {Object.entries(PLAN_SHAPE_PRESETS).map(([key, preset]) => {
          const active = sameShape(shape, preset.shape)
          return (
            <button key={key} type="button" title={preset.label} onClick={() => onChange({ ...preset.shape })}
              className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${active ? 'border-slate-900 bg-slate-900 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
              <svg viewBox="0 0 32 32" className="h-6 w-6">
                <path d={shapeOutline(preset.shape, 32)} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" />
              </svg>
              <span className="text-[9px] font-semibold leading-none">{preset.label}</span>
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Aspect ({shape.aspect.toFixed(2)})</label>
          <input type="range" min={0.6} max={1.4} step={0.01} value={shape.aspect} className="w-full"
            onChange={e => onChange({ ...shape, aspect: Number(e.target.value) })} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Squareness ({shape.squareness.toFixed(1)})</label>
          <input type="range" min={2} max={8} step={0.1} value={shape.squareness} className="w-full"
            onChange={e => onChange({ ...shape, squareness: Number(e.target.value) })} />
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        Ring seen down the finger axis, head at the right. Keeps the same overall circumference (finger size); the
        whole design — band, head, stones, accessories — follows the shape.
      </p>
    </div>
  )
}
