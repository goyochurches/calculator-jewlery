import { useState } from 'react'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { CAD_EXAMPLES, CAD_EXAMPLE_FAMILIES, type CadExample } from '@/lib/cadExamples'
import type { CadDesignParams } from '@/lib/cadPresets'

interface CadExamplePickerProps {
  onLoad: (example: CadExample) => void
}

/** The pre-built half of a Content Manager: designs that ship with the app,
 *  as opposed to the ones a user saves into their own browser. Grouped the
 *  way the families are named so the list reads as a catalogue rather than
 *  twenty rows, and collapsed per group so it does not push the real
 *  controls off the panel.
 *
 *  Loading one goes through the SAME path as loading a saved preset, so an
 *  example behaves exactly like a design the user saved — it is a starting
 *  point to edit, not a locked template. */
export function CadExamplePicker({ onLoad }: CadExamplePickerProps) {
  const [openFamily, setOpenFamily] = useState<string | null>(CAD_EXAMPLE_FAMILIES[0])

  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="text-sm font-semibold text-slate-900">Example designs</span>
        <span className="text-[11px] text-slate-400">{CAD_EXAMPLES.length} pieces</span>
      </div>
      <p className="text-[11px] text-slate-500">
        Real finished pieces to open and edit. Loading one replaces the current parameters,
        the same as loading a preset — save first if you want to keep what is on screen.
      </p>
      <ul className="space-y-1">
        {CAD_EXAMPLE_FAMILIES.map(family => {
          const inFamily = CAD_EXAMPLES.filter(e => e.family === family)
          const isOpen = openFamily === family
          return (
            <li key={family} className="overflow-hidden rounded-xl border border-amber-200/70 bg-white">
              <button type="button" onClick={() => setOpenFamily(isOpen ? null : family)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-amber-50">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                <span className="flex-1">{family}</span>
                <span className="shrink-0 text-[10px] font-normal text-slate-400">{inFamily.length}</span>
              </button>
              {isOpen && (
                <ul className="border-t border-amber-100">
                  {inFamily.map(example => (
                    <li key={example.id}>
                      <button type="button" onClick={() => onLoad(example)}
                        className="group flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left transition hover:bg-amber-50">
                        <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900">
                          {example.name}
                        </span>
                        <span className="text-[10px] leading-snug text-slate-500">{example.description}</span>
                        <span className="text-[10px] text-slate-400">
                          {exampleSummary(example.params)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
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
