import { copyToClipboard, publicQuoteUrl } from '@/lib/share'
import { Check, Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'

interface CopyShareLinkButtonProps {
  token: string | null | undefined
  /** Optional className to compose with the default styles */
  className?: string
  /** Compact icon-only button (used in tables). When false, renders as a labeled chip. */
  iconOnly?: boolean
}

/**
 * Reusable "copy share link" control. Copies the absolute public-quote URL
 * for the given token and shows a brief "Copied!" confirmation.
 */
export function CopyShareLinkButton({ token, className, iconOnly = true }: CopyShareLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  if (!token) return null

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await copyToClipboard(publicQuoteUrl(token))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (err) {
      console.error('Copy failed', err)
    }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={copied ? 'Copied!' : 'Copy share link'}
        aria-label="Copy share link"
        className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
          copied ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:bg-violet-50 hover:text-violet-600'
        } ${className ?? ''}`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold transition hover:border-slate-300 hover:bg-slate-50 ${
        copied ? 'text-emerald-700' : 'text-slate-700'
      } ${className ?? ''}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <LinkIcon className="h-3.5 w-3.5" />}
      {copied ? 'Link copied' : 'Copy share link'}
    </button>
  )
}
