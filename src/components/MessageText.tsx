import { ExternalLink } from 'lucide-react'

// Splits text on URLs (http/https or bare www.). The capture group makes
// String.split keep the URLs as their own segments.
const URL_SPLIT = /(https?:\/\/[^\s]+|www\.[^\s]+)/i
const IS_URL = /^(https?:\/\/|www\.)/i
// Trailing punctuation that's almost never part of the link itself.
const TRAILING = /[.,!?;:)\]]+$/

/** A short, friendly word for the chip, guessed from the URL; else its domain. */
function linkLabel(url: string): string {
  const lower = url.toLowerCase()
  if (/pay|checkout|stripe/.test(lower)) return 'View payment'
  if (/quote|presupuesto/.test(lower)) return 'View quote'
  if (/review/.test(lower)) return 'Leave a review'
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return 'Open link'
  }
}

/**
 * Renders a chat message body, turning long URLs into compact tappable chips
 * (icon + short word) instead of dumping the giant raw link. Plain text keeps
 * its line breaks. `out` tweaks the chip colours for outbound (coloured) bubbles.
 */
export function MessageText({ body, out }: { body: string; out: boolean }) {
  const parts = body.split(URL_SPLIT)
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (!part) return null
        if (!IS_URL.test(part)) return <span key={i}>{part}</span>

        // Peel off trailing punctuation so "(https://x.com)." links cleanly.
        const m = part.match(TRAILING)
        const trailing = m ? m[0] : ''
        const url = trailing ? part.slice(0, -trailing.length) : part
        const href = url.startsWith('http') ? url : `https://${url}`
        return (
          <span key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 align-middle text-xs font-semibold no-underline transition active:scale-95 ${
                out ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              }`}
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{linkLabel(url)}</span>
            </a>
            {trailing}
          </span>
        )
      })}
    </p>
  )
}
