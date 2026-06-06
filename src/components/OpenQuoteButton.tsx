import { publicQuoteUrl } from '@/lib/share'
import { ExternalLink } from 'lucide-react'

interface OpenQuoteButtonProps {
  token: string | null | undefined
  /** Optional className to compose with the default styles */
  className?: string
  /** Compact icon-only button (used in tables). When false, renders as a labeled chip. */
  iconOnly?: boolean
}

/**
 * Reusable "open the public quote" control. Opens the absolute public-quote URL
 * for the given token in a new tab — the same page the customer sees — so the
 * jeweler can jump straight to it without copying and pasting the link.
 */
export function OpenQuoteButton({ token, className, iconOnly = false }: OpenQuoteButtonProps) {
  if (!token) return null

  const href = publicQuoteUrl(token)
  // Stop propagation so this never triggers a parent row's click handler.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  if (iconOnly) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        title="Open the public quote the customer sees, in a new tab"
        aria-label="Open quote"
        className={`flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 ${className ?? ''}`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={stop}
      title="Open the public quote the customer sees, in a new tab"
      className={`inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100 ${className ?? ''}`}
    >
      <ExternalLink className="h-3 w-3" />
      Open quote
    </a>
  )
}
