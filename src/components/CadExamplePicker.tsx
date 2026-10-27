import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { CAD_EXAMPLES, CAD_EXAMPLE_FAMILIES, type CadExample } from '@/lib/cadExamples'
import type { CadDesignParams } from '@/lib/cadPresets'

interface CadExamplePickerProps {
  onLoad: (example: CadExample) => void
}

/** The pre-built half of a Content Manager: designs that ship with the app,
 *  as opposed to the ones a user saves into their own browser.
 *
 *  Laid out WIDE rather than tall — families as a row of chips, the open
 *  one's designs in a grid beneath. The first version was a vertical
 *  accordion, which was right when the controls lived in a narrow left
 *  column and wrong the moment they moved into the top ribbon: grid rows
 *  size to their tallest cell, so one tall accordion stretched the whole
 *  ribbon and left dead space beside every short control next to it.
 *
 *  Loading one goes through the SAME path as loading a saved preset, so an
 *  example is a starting point to edit, not a locked template. */
export function CadExamplePicker({ onLoad }: CadExamplePickerProps) {
  const [openFamily, setOpenFamily] = useState<string | null>(null)
  const shown = openFamily ? CAD_EXAMPLES.filter(e => e.family === openFamily) : []

  return (
    <div className="order-last shrink-0 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          Example designs
        </span>
        <span className="mr-1 text-[11px] text-slate-400">{CAD_EXAMPLES.length} pieces</span>
        {CAD_EXAMPLE_FAMILIES.map(family => {
          const isOpen = openFamily === family
          const count = CAD_EXAMPLES.filter(e => e.family === family).length
          return (
            <button key={family} type="button" aria-pressed={isOpen}
              onClick={() => setOpenFamily(isOpen ? null : family)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                isOpen
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-amber-200 bg-white text-slate-600 hover:border-slate-300'
              }`}>
              {family} <span className={isOpen ? 'text-slate-400' : 'text-slate-400'}>{count}</span>
            </button>
          )
        })}
        <span className="text-[11px] text-slate-500">
          {openFamily ? 'Loading one replaces the current parameters — save first to keep what is on screen.' : 'Pick a family to browse.'}
        </span>
      </div>
      {shown.length > 0 && (
        <ul className="grid max-h-56 gap-1.5 overflow-y-auto">
          {shown.map(example => (
            <li key={example.id}>
              <button type="button" onClick={() => onLoad(example)}
                className="group flex h-full w-full flex-col gap-0.5 rounded-xl border border-amber-200/70 bg-white px-2.5 py-1.5 text-left transition hover:border-slate-300 hover:bg-amber-50">
                <span className="text-xs font-semibold text-slate-800">{example.name}</span>
                <span className="text-[10px] leading-snug text-slate-500">{example.description}</span>
                <span className="text-[10px] text-slate-400">{exampleSummary(example.params)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const METAL_SHORT: Record<string, string> = {
  'gold-14k-white': '14k white', 'gold-14k-yellow': '14k yellow', 'gold-14k-rose': '14k rose',
  'gold-18k-white': '18k white', 'gold-18k-yellow': '18k yellow', 'gold-18k-rose': '18k rose',
  platinum: 'Platinum', silver: 'Silver',
}

/** The specs a jeweller scans for before opening a design: metal, what the
 *  centre stone is, and how much melee is in it. Derived from the same
 *  parameters the page builds from, so it cannot describe a piece the
 *  design does not actually make. */
function exampleSummary(p: CadDesignParams): string {
  const parts: string[] = [METAL_SHORT[p.metal] ?? p.metal]
  if (p.includeStone) {
    parts.push(p.stoneShape === 'round'
      ? `${p.caratWeight}ct round`
      : `${p.fancyLengthMm}×${p.fancyWidthMm}mm ${p.stoneShape}`)
  }
  const melee = (p.includeHalo && p.stoneShape === 'round' ? p.haloCount * (p.haloRingCount ?? 1) : 0)
    + (p.includePave ? p.paveCount : 0)
    + (p.settingType === 'cluster' && p.stoneShape === 'round' ? p.clusterPetalCount : 0)
    + (p.sideStoneCount ?? 0)
  if (melee > 0) parts.push(`${melee} melee`)
  if (p.shankStyle !== 'plain') parts.push(p.shankStyle)
  return parts.join(' · ')
}
