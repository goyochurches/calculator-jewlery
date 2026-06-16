import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { configService } from '@/services/configService'

interface CreateLabSizeDialogProps {
  open: boolean
  sizeKey: string
  initialLabel?: string
  onCreated: (sizeKey: string) => void
  onClose: () => void
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400'

export function CreateLabSizeDialog({
  open,
  sizeKey,
  initialLabel = '',
  onCreated,
  onClose,
}: CreateLabSizeDialogProps) {
  const [label, setLabel] = useState(initialLabel)
  const [ctPerStone, setCtPerStone] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [saving, setSaving] = useState(false)

  // Sync initialLabel when dialog opens
  useEffect(() => {
    if (open) {
      setLabel(initialLabel)
      setCtPerStone('')
      setBasePrice('')
    }
  }, [open, initialLabel])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const handleSave = async () => {
    if (!basePrice) return
    setSaving(true)
    try {
      await configService.createDiamondSize({
        stoneType: 'LAB',
        sizeKey,
        label,
        ctPerStone: ctPerStone !== '' ? Number(ctPerStone) : null,
        basePrice: Number(basePrice),
      })
      onCreated(sizeKey)
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in"
      role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.15)]">
        <button onClick={onClose} aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pt-6 pb-2">
          <h2 className="text-base font-semibold tracking-tight text-slate-950">Add Lab diamond price</h2>
          <p className="mt-1 text-xs text-slate-500">
            Creating a <span className="font-medium text-sky-700">LAB</span> entry for size key:
          </p>
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Key</span>
            <span className="font-mono text-sm font-bold text-slate-800">{sizeKey}</span>
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Label
            </label>
            <input className={inputCls} value={label}
              onChange={e => setLabel(e.target.value)} placeholder="e.g. Ø 1.50 mm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                CT / stone
              </label>
              <input type="number" step="0.0001" placeholder="0.014"
                className={inputCls} value={ctPerStone}
                onChange={e => setCtPerStone(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                Price / stone ($) *
              </label>
              <input type="number" step="0.01" placeholder="0.00" required
                className={inputCls} value={basePrice}
                onChange={e => setBasePrice(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button"
              disabled={saving || !basePrice}
              onClick={handleSave}
              className="flex-1 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Lab price'}
            </button>
            <button type="button" onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
